// Follow-up scheduler — disparado pelo pg_cron a cada 5 minutos.
// Lê auto_followups vencidos (status=pending, scheduled_for<=now) e:
//   1) Insere a mensagem em chat_messages como sender_type='agent' (rascunho automático).
//   2) Marca o follow-up como 'sent'.
//   3) Cria uma notificação ao owner para revisar/enviar manualmente caso queira.
//
// Esta função é defensiva: nunca dispara duas vezes o mesmo follow-up.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const { data: due, error } = await supabase
      .from('auto_followups')
      .select('id, customer_id, owner_id, message_template, trigger_message_id')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50);

    if (error) throw error;

    let processed = 0;
    for (const f of due || []) {
      // 1) Insere como rascunho/automático
      const { data: msg, error: msgErr } = await supabase.from('chat_messages').insert({
        customer_id: f.customer_id,
        sender_type: 'bot',
        content: f.message_template || 'Olá! Apenas dando um retorno.',
        channel: 'whatsapp',
        metadata: { source: 'auto_followup', followup_id: f.id },
      }).select('id').single();

      if (msgErr) {
        await supabase.from('auto_followups').update({
          status: 'error',
          cancelled_reason: msgErr.message,
        }).eq('id', f.id);
        continue;
      }

      // 2) Marca enviado
      await supabase.from('auto_followups').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).eq('id', f.id);

      // 3) Notifica o owner
      if (f.owner_id) {
        await supabase.from('notifications').insert({
          user_id: f.owner_id,
          owner_id: f.owner_id,
          type: 'auto_followup_sent',
          title: 'Follow-up automático disparado',
          body: f.message_template?.slice(0, 240) || 'Mensagem de follow-up.',
        });
      }

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed, total: (due || []).length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
