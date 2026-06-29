// Bot Flow Runner — disparado pelo pg_cron a cada minuto.
// Processa novas mensagens de clientes (sender_type='customer') que ainda não foram avaliadas
// e aplica os bot_flows ativos cujos triggers correspondem (canal + keywords).
//
// Ações suportadas pelos nós: send_message, add_tag, handoff, ai_classify.
// Cada execução fica em bot_flow_runs (índice único impede dupes por mensagem).

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface BotFlow {
  id: string;
  owner_id: string;
  trigger_channel: string | null;
  trigger_keywords: string[] | null;
  nodes: any[];
  edges: any[];
}

function matches(flow: BotFlow, msg: { channel: string | null; content: string | null }): boolean {
  if (flow.trigger_channel && msg.channel && flow.trigger_channel !== msg.channel) return false;
  const kws = flow.trigger_keywords || [];
  if (kws.length === 0) return true;
  const text = (msg.content || '').toLowerCase();
  return kws.some(k => text.includes(k.toLowerCase()));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    // Janela: últimos 5 min para não sobrecarregar
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('id, customer_id, content, channel, created_at')
      .eq('sender_type', 'customer')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!msgs || msgs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Carrega flows ativos uma vez
    const { data: flows } = await supabase
      .from('bot_flows')
      .select('id, owner_id, trigger_channel, trigger_keywords, nodes, edges')
      .eq('is_active', true);

    if (!flows || flows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, flows: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let triggered = 0;

    for (const msg of msgs) {
      // owner do customer
      const { data: cust } = await supabase.from('customers').select('owner_id').eq('id', msg.customer_id).maybeSingle();
      if (!cust) continue;

      const eligible = flows.filter(f => f.owner_id === cust.owner_id && matches(f as BotFlow, msg as any));
      for (const flow of eligible) {
        // Tenta criar o run; índice único evita disparar duas vezes
        const { data: run, error: runErr } = await supabase.from('bot_flow_runs').insert({
          flow_id: flow.id,
          customer_id: msg.customer_id,
          owner_id: cust.owner_id,
          trigger_message_id: msg.id,
          status: 'running',
        }).select('id').single();

        if (runErr || !run) continue; // já existia

        const taken: any[] = [];
        try {
          const nodes: any[] = Array.isArray(flow.nodes) ? flow.nodes : [];
          for (const node of nodes) {
            const data = node.data || {};
            const type = data.actionType || node.type;

            if (type === 'send_message' && data.message) {
              await supabase.from('chat_messages').insert({
                customer_id: msg.customer_id,
                sender_type: 'bot',
                content: data.message,
                channel: msg.channel,
                metadata: { bot_flow_id: flow.id, run_id: run.id },
              });
              taken.push({ type, ok: true });
            } else if (type === 'add_tag' && data.tag) {
              const { data: c } = await supabase.from('customers').select('tags').eq('id', msg.customer_id).single();
              const next = Array.from(new Set([...(c?.tags || []), data.tag]));
              await supabase.from('customers').update({ tags: next }).eq('id', msg.customer_id);
              taken.push({ type, tag: data.tag, ok: true });
            } else if (type === 'handoff') {
              await supabase.from('customers').update({
                ai_handoff: { handoff_to: 'human', reason: 'bot_flow', at: new Date().toISOString() },
              }).eq('id', msg.customer_id);
              taken.push({ type, ok: true });
            } else if (type === 'ai_classify') {
              await supabase.functions.invoke('ai-classify-message', {
                body: { message_id: msg.id, customer_id: msg.customer_id, content: msg.content },
              }).catch(() => null);
              taken.push({ type, ok: true });
            }
          }

          await supabase.from('bot_flow_runs').update({
            status: 'completed',
            actions_taken: taken,
            finished_at: new Date().toISOString(),
          }).eq('id', run.id);
          triggered++;
        } catch (e) {
          await supabase.from('bot_flow_runs').update({
            status: 'error',
            error: (e as Error).message,
            actions_taken: taken,
            finished_at: new Date().toISOString(),
          }).eq('id', run.id);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, scanned: msgs.length, triggered }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
