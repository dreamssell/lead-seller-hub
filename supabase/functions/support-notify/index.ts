/**
 * Notificações omnichannel do módulo Central de Ajuda.
 *
 * Eventos:
 *  - created           → cliente + owner (crítico)
 *  - assigned          → cliente
 *  - status_changed    → cliente
 *  - resolved          → cliente (CSAT)
 *  - daily_reminders   → cron diário: relembra clientes + alerta owner sobre SLA
 *
 * Cada disparo é registrado em `support_notification_logs` com status
 * (pending → sent | failed | skipped) para auditoria na timeline do ticket.
 * Templates ficam em `support_notification_templates` por owner/sub_company e
 * caem para defaults embutidos quando não configurados.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType = 'created' | 'assigned' | 'status_changed' | 'resolved' | 'daily_reminder_customer' | 'daily_reminder_owner';
type Audience = 'customer' | 'owner' | 'assignee';

const DEFAULT_TEMPLATES: Record<string, string> = {
  created_customer: `✅ Recebemos seu ticket #{{number}}. Nossa equipe de {{department}} já foi notificada e retornará em breve.\n\nAssunto: {{title}}`,
  created_owner: `🚨 TICKET CRÍTICO #{{number}}\n\n{{title}}\n\nDepto: {{department}}\nAcesse o painel Master para atender.`,
  assigned_customer: `👤 {{assignee_name}} está cuidando do seu ticket #{{number}}: "{{title}}".\n\nVocê receberá atualizações por aqui.`,
  status_changed_customer: `{{status_label}}\n\nTicket #{{number}}: {{title}}`,
  resolved_customer: `✅ Ticket #{{number}} foi marcado como resolvido!\n\n"{{title}}"\n\nAvalie nosso atendimento no portal — leva menos de 10 segundos ⭐`,
  daily_reminder_customer_customer: `⏳ Lembrete — Ticket #{{number}}: "{{title}}"\n\nAinda aguardamos uma resposta sua para prosseguir. Acesse o portal e responda quando puder 🙂`,
  daily_reminder_owner_owner: `⚠️ {{count}} ticket(s) com SLA estourado:\n\n{{list}}`,
};

const STATUS_LABELS: Record<string, string> = {
  em_analise: "🔎 Estamos analisando",
  aguardando_cliente: "⏳ Aguardando informação sua",
  resolvido: "✅ Resolvido — avalie nosso atendimento no portal",
  fechado: "🔒 Ticket fechado",
};

function render(tpl: string, vars: Record<string, any>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? '').toString());
}

async function loadTemplate(admin: any, ownerId: string, subCompanyId: string | null, event: EventType, audience: Audience) {
  // Try sub_company override → owner default → hardcoded fallback
  let q = admin.from('support_notification_templates').select('*')
    .eq('owner_id', ownerId).eq('event_type', event).eq('audience', audience).eq('enabled', true);
  if (subCompanyId) {
    const { data } = await q.eq('sub_company_id', subCompanyId).maybeSingle();
    if (data) return data;
  }
  const { data } = await admin.from('support_notification_templates').select('*')
    .eq('owner_id', ownerId).is('sub_company_id', null)
    .eq('event_type', event).eq('audience', audience).eq('enabled', true).maybeSingle();
  if (data) return data;
  const fallback = DEFAULT_TEMPLATES[`${event}_${audience}`];
  return fallback ? { id: null, body_template: fallback, extra_recipients: [], enabled: true } : null;
}

async function dispatch(admin: any, opts: {
  ticket_id: string; event: EventType; audience: Audience; phone: string; body: string; template_id: string | null;
}) {
  // Log pending
  const { data: log } = await admin.from('support_notification_logs').insert({
    ticket_id: opts.ticket_id, event_type: opts.event, audience: opts.audience,
    channel: 'whatsapp', recipient: opts.phone, body: opts.body, status: 'pending',
    template_id: opts.template_id,
  }).select('id').maybeSingle();

  try {
    const res = await admin.functions.invoke("uaz-send-message", {
      body: { phone: opts.phone, content: opts.body, source: "support" },
    });
    const ok = !res.error;
    const msgId = (res.data as any)?.message_id ?? null;
    await admin.from('support_notification_logs').update({
      status: ok ? 'sent' : 'failed',
      provider_msg_id: msgId,
      error: ok ? null : (res.error?.message || 'send_failed'),
    }).eq('id', log?.id);
    return { phone: opts.phone, ok, log_id: log?.id };
  } catch (e: any) {
    await admin.from('support_notification_logs').update({
      status: 'failed', error: String(e?.message || e),
    }).eq('id', log?.id);
    return { phone: opts.phone, ok: false, error: String(e), log_id: log?.id };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ticket_id, event } = await req.json();
    if (!event) throw new Error("Missing event");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ownerPhoneEnv = Deno.env.get("SUPPORT_OWNER_PHONE") || '';

    // ============ Cron diário ============
    if (event === "daily_reminders") {
      const nowIso = new Date().toISOString();
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const { data: waiting } = await admin.from("support_tickets")
        .select("id, number, title, contact_phone, owner_id, sub_company_id, department")
        .eq("status", "aguardando_cliente")
        .or(`last_reminder_at.is.null,last_reminder_at.lt.${yesterday}`);

      const { data: overdue } = await admin.from("support_tickets")
        .select("id, number, title, contact_phone, owner_id, sub_company_id, priority")
        .in("status", ["novo", "em_analise"])
        .lt("resolution_due_at", nowIso)
        .or(`last_reminder_at.is.null,last_reminder_at.lt.${yesterday}`);

      const results: any[] = [];
      for (const t of waiting || []) {
        if (t.contact_phone) {
          const tpl = await loadTemplate(admin, t.owner_id, t.sub_company_id, 'daily_reminder_customer', 'customer');
          if (tpl) {
            const body = render(tpl.body_template, t);
            results.push(await dispatch(admin, {
              ticket_id: t.id, event: 'daily_reminder_customer', audience: 'customer',
              phone: t.contact_phone, body, template_id: tpl.id,
            }));
          }
        }
        await admin.from("support_tickets").update({ last_reminder_at: nowIso }).eq("id", t.id);
      }

      // Owner digest — grouped per owner
      const byOwner = new Map<string, any[]>();
      for (const t of overdue || []) {
        if (!byOwner.has(t.owner_id)) byOwner.set(t.owner_id, []);
        byOwner.get(t.owner_id)!.push(t);
      }
      for (const [ownerId, list] of byOwner) {
        const tpl = await loadTemplate(admin, ownerId, null, 'daily_reminder_owner', 'owner');
        if (!tpl) continue;
        const body = render(tpl.body_template, {
          count: list.length,
          list: list.slice(0, 8).map((t: any) => `• #${t.number} — ${t.title}`).join('\n'),
        });
        const phones = [...(tpl.extra_recipients || []), ownerPhoneEnv].filter(Boolean);
        for (const phone of phones) {
          // Log against first ticket in the batch (for auditability)
          results.push(await dispatch(admin, {
            ticket_id: list[0].id, event: 'daily_reminder_owner', audience: 'owner',
            phone, body, template_id: tpl.id,
          }));
        }
        for (const t of list) {
          await admin.from("support_tickets").update({ last_reminder_at: nowIso }).eq("id", t.id);
        }
      }
      return new Response(JSON.stringify({ ok: true, reminders: results.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Por ticket ============
    if (!ticket_id) throw new Error("Missing ticket_id");
    const { data: ticket, error } = await admin.from("support_tickets").select("*").eq("id", ticket_id).maybeSingle();
    if (error || !ticket) throw new Error("ticket_not_found");

    let assigneeName = '';
    if (ticket.assigned_to) {
      const { data: prof } = await admin.from("profiles").select("display_name").eq("user_id", ticket.assigned_to).maybeSingle();
      assigneeName = prof?.display_name || 'um especialista';
    }
    const vars = {
      number: ticket.number, title: ticket.title, department: ticket.department,
      priority: ticket.priority, status: ticket.status,
      status_label: STATUS_LABELS[ticket.status] || ticket.status,
      assignee_name: assigneeName,
    };

    const results: any[] = [];
    const audiences: Audience[] = event === 'created'
      ? (ticket.priority === 'critica' ? ['customer', 'owner'] : ['customer'])
      : ['customer'];

    for (const audience of audiences) {
      const tpl = await loadTemplate(admin, ticket.owner_id, ticket.sub_company_id, event as EventType, audience);
      if (!tpl) continue;
      const body = render(tpl.body_template, vars);

      const phones: string[] = [];
      if (audience === 'customer' && ticket.contact_phone) phones.push(ticket.contact_phone);
      if (audience === 'owner') {
        phones.push(...(tpl.extra_recipients || []));
        if (ownerPhoneEnv) phones.push(ownerPhoneEnv);
      }
      if (audience === 'assignee' && ticket.assigned_to) {
        const { data: prof } = await admin.from('profiles').select('phone').eq('user_id', ticket.assigned_to).maybeSingle();
        if ((prof as any)?.phone) phones.push((prof as any).phone);
      }

      if (phones.length === 0) {
        await admin.from('support_notification_logs').insert({
          ticket_id, event_type: event, audience, channel: 'whatsapp',
          recipient: '(sem destinatário)', body, status: 'skipped',
          error: 'no_recipient', template_id: tpl.id,
        });
        continue;
      }
      for (const phone of phones) {
        results.push(await dispatch(admin, {
          ticket_id, event: event as EventType, audience,
          phone, body, template_id: tpl.id,
        }));
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
