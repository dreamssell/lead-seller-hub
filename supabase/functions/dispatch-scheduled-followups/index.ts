// Dispatcher de mensagens agendadas.
// Chamado pelo pg_cron a cada minuto. Lê auto_followups com
// status='scheduled' e scheduled_for<=now(), envia via WAHA
// (usando a conexão do owner/sub_company do cliente) e registra
// em chat_messages como mensagem do agente.
//
// Idempotente: usa UPDATE ... WHERE status='scheduled' para "travar"
// o registro em 'processing' antes de enviar, evitando disparo duplo
// se o cron rodar concorrentemente.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function normalizeChatId(phone: string): string {
  const p = String(phone || '').trim();
  if (!p) return p;
  if (p.includes('@')) return p;
  const digits = p.replace(/\D+/g, '');
  return `${digits}@c.us`;
}

function normalizeUrl(u?: string | null): string {
  if (!u) return '';
  return String(u).replace(/\/+$/, '');
}

async function wahaSendText(
  baseUrl: string,
  token: string,
  session: string,
  chatId: string,
  text: string,
): Promise<{ id: string | null; raw: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Api-Key'] = token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${baseUrl}/api/sendText`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ session, chatId, text }),
      signal: controller.signal,
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`WAHA ${res.status}: ${raw?.message || res.statusText}`);
    }
    const id = raw?.id?._serialized || raw?.id || null;
    return { id, raw };
  } finally {
    clearTimeout(timer);
  }
}

async function pickConnection(supabase: any, ownerId: string, subCompanyId: string | null) {
  let q = supabase
    .from('whatsapp_connections')
    .select('id, provider, status, metadata, owner_id, sub_company_id')
    .eq('owner_id', ownerId)
    .eq('provider', 'waha')
    .order('updated_at', { ascending: false })
    .limit(5);
  if (subCompanyId) q = q.eq('sub_company_id', subCompanyId);
  else q = q.is('sub_company_id', null);
  const { data } = await q;
  const list = (data || []) as any[];
  return list.find((c) => /working|connected|open|running/i.test(String(c.status))) || list[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();
  const results: any[] = [];

  try {
    // Buscar candidatos
    const { data: due, error } = await supabase
      .from('auto_followups')
      .select('id, customer_id, owner_id, message_template, scheduled_for, created_by')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);
    if (error) throw error;

    for (const f of due || []) {
      // Lock otimista: só processa se ainda estiver 'scheduled'
      const { data: locked, error: lockErr } = await supabase
        .from('auto_followups')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', f.id)
        .eq('status', 'scheduled')
        .select('id')
        .maybeSingle();
      if (lockErr || !locked) continue;

      try {
        // Cliente + escopo
        const { data: customer, error: cErr } = await supabase
          .from('customers')
          .select('id, phone, owner_id, sub_company_id, channel')
          .eq('id', f.customer_id)
          .single();
        if (cErr || !customer) throw new Error('Cliente não encontrado');
        if (!customer.phone) throw new Error('Cliente sem telefone');

        const conn = await pickConnection(
          supabase,
          f.owner_id || customer.owner_id,
          customer.sub_company_id,
        );
        if (!conn) throw new Error('Nenhuma conexão WhatsApp (WAHA) disponível');

        const url = normalizeUrl(conn.metadata?.url);
        const token = conn.metadata?.token || '';
        const session = conn.metadata?.instance || conn.metadata?.session || 'default';
        if (!url) throw new Error('Conexão WAHA sem URL configurada');

        const text = String(f.message_template || '').trim();
        if (!text) throw new Error('Mensagem vazia');

        const chatId = normalizeChatId(customer.phone);
        const sendRes = await wahaSendText(url, token, session, chatId, text);
        const nowIso = new Date().toISOString();

        // Registra em chat_messages como envio do agente
        await supabase.from('chat_messages').insert({
          customer_id: customer.id,
          sender_type: 'agent',
          content: text,
          channel: customer.channel || 'whatsapp',
          delivery_status: 'sent',
          metadata: {
            source: 'scheduled_followup',
            followup_id: f.id,
            provider: 'waha',
            provider_message_id: sendRes.id,
            scheduled_for: f.scheduled_for,
            sent_by: f.created_by,
          },
        });

        await supabase
          .from('auto_followups')
          .update({ status: 'sent', sent_at: nowIso, updated_at: nowIso })
          .eq('id', f.id);

        // Notifica quem criou o agendamento
        if (f.created_by) {
          await supabase.from('notifications').insert({
            user_id: f.created_by,
            owner_id: f.owner_id,
            type: 'scheduled_message_sent',
            title: 'Mensagem agendada enviada',
            body: text.slice(0, 200),
            metadata: { customer_id: customer.id, followup_id: f.id },
          });
        }

        results.push({ id: f.id, status: 'sent', provider_message_id: sendRes.id });
      } catch (err: any) {
        const msg = err?.message || String(err);
        await supabase
          .from('auto_followups')
          .update({
            status: 'error',
            cancelled_reason: msg.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', f.id);

        // Notifica autor sobre a falha
        if (f.created_by) {
          await supabase.from('notifications').insert({
            user_id: f.created_by,
            owner_id: f.owner_id,
            type: 'scheduled_message_failed',
            title: 'Falha ao enviar mensagem agendada',
            body: msg.slice(0, 240),
            metadata: { customer_id: f.customer_id, followup_id: f.id },
          });
        }
        results.push({ id: f.id, status: 'error', error: msg });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, started_at: startedAt, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
