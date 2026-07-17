/**
 * Notificações omnichannel do módulo Central de Ajuda.
 *
 * Eventos:
 *  - created / assigned / status_changed / resolved  → notificação por ticket
 *  - daily_reminders                                 → cron diário (cliente + owner)
 *  - retry_queue                                     → cron curto, reprocessa fila `retrying`
 *  - test_send                                       → dry-run do painel de templates
 *
 * Fila de retry: cada disparo falho vira `retrying` com `next_retry_at =
 * now() + backoff(attempt)` até `max_attempts`. Só depois disso vira `failed`.
 * Tickets com `notifications_cancelled_at` pulam disparos futuros (skipped).
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType =
  | 'created' | 'assigned' | 'status_changed' | 'resolved'
  | 'daily_reminder_customer' | 'daily_reminder_owner';
type Audience = 'customer' | 'owner' | 'assignee';

const MAX_ATTEMPTS = 4;
// exponential backoff in seconds: 30s, 2min, 10min, 60min
const BACKOFF_S = [30, 120, 600, 3600];

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

/** Extract {{var}} tokens from a template. */
function extractVars(tpl: string): string[] {
  const set = new Set<string>();
  for (const m of tpl.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) set.add(m[1]);
  return [...set];
}

async function loadTemplate(admin: any, ownerId: string, subCompanyId: string | null, event: EventType, audience: Audience) {
  if (subCompanyId) {
    const { data } = await admin.from('support_notification_templates').select('*')
      .eq('owner_id', ownerId).eq('sub_company_id', subCompanyId)
      .eq('event_type', event).eq('audience', audience).eq('enabled', true).maybeSingle();
    if (data) return data;
  }
  const { data } = await admin.from('support_notification_templates').select('*')
    .eq('owner_id', ownerId).is('sub_company_id', null)
    .eq('event_type', event).eq('audience', audience).eq('enabled', true).maybeSingle();
  if (data) return data;
  const fallback = DEFAULT_TEMPLATES[`${event}_${audience}`];
  return fallback ? { id: null, body_template: fallback, extra_recipients: [], enabled: true } : null;
}

/** Send one WhatsApp message via the UAZ edge function. */
async function sendWhatsApp(admin: any, phone: string, body: string): Promise<{ ok: boolean; msgId: string | null; error: string | null }> {
  try {
    const res = await admin.functions.invoke("uaz-send-message", {
      body: { phone, content: body, source: "support" },
    });
    if (res.error) return { ok: false, msgId: null, error: res.error?.message || 'send_failed' };
    const msgId = (res.data as any)?.message_id ?? null;
    return { ok: true, msgId, error: null };
  } catch (e: any) {
    return { ok: false, msgId: null, error: String(e?.message || e) };
  }
}

/** Advance a log row: success → 'sent'; failure → 'retrying' (with next_retry_at) or 'failed' if out of attempts. */
async function persistOutcome(admin: any, logId: string, attempt: number, maxAttempts: number, r: { ok: boolean; msgId: string | null; error: string | null }) {
  if (r.ok) {
    await admin.from('support_notification_logs').update({
      status: 'sent', provider_msg_id: r.msgId, error: null,
    }).eq('id', logId);
    return;
  }
  if (attempt >= maxAttempts) {
    await admin.from('support_notification_logs').update({
      status: 'failed', error: r.error, last_error_at: new Date().toISOString(),
    }).eq('id', logId);
    return;
  }
  const seconds = BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)];
  await admin.from('support_notification_logs').update({
    status: 'retrying', error: r.error, last_error_at: new Date().toISOString(),
    next_retry_at: new Date(Date.now() + seconds * 1000).toISOString(),
  }).eq('id', logId);
}

/** First-time dispatch: create the log row then try once. */
async function dispatchNew(admin: any, opts: {
  ticket_id: string; event: EventType; audience: Audience;
  phone: string; body: string; template_id: string | null;
}) {
  const { data: log } = await admin.from('support_notification_logs').insert({
    ticket_id: opts.ticket_id, event_type: opts.event, audience: opts.audience,
    channel: 'whatsapp', recipient: opts.phone, body: opts.body, status: 'pending',
    template_id: opts.template_id, attempt: 1, max_attempts: MAX_ATTEMPTS,
  }).select('id').maybeSingle();
  if (!log?.id) return { ok: false, error: 'log_insert_failed' };
  const r = await sendWhatsApp(admin, opts.phone, opts.body);
  await persistOutcome(admin, log.id, 1, MAX_ATTEMPTS, r);
  return { ok: r.ok, log_id: log.id, error: r.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { ticket_id, event } = body;
    if (!event) throw new Error("Missing event");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ownerPhoneEnv = Deno.env.get("SUPPORT_OWNER_PHONE") || '';

    // ============ Test send from the templates panel ============
    if (event === "test_send") {
      const { template_id, phone, sample } = body;
      if (!template_id || !phone) throw new Error("Missing template_id/phone");
      const { data: tpl } = await admin.from('support_notification_templates').select('*').eq('id', template_id).maybeSingle();
      if (!tpl) throw new Error('template_not_found');
      const missing = extractVars(tpl.body_template).filter((v) => sample?.[v] == null || sample?.[v] === '');
      if (missing.length > 0) {
        return new Response(JSON.stringify({ ok: false, error: 'missing_variables', missing }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const rendered = render(tpl.body_template, sample || {});
      const r = await sendWhatsApp(admin, phone, `[TESTE] ${rendered}`);
      await admin.from('support_notification_templates').update({ last_tested_at: new Date().toISOString() }).eq('id', template_id);
      return new Response(JSON.stringify({ ok: r.ok, error: r.error, preview: rendered }), {
        status: r.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Retry queue (short cron) ============
    if (event === "retry_queue") {
      const nowIso = new Date().toISOString();
      const { data: due } = await admin.from('support_notification_logs')
        .select('id, recipient, body, attempt, max_attempts, ticket_id')
        .eq('status', 'retrying').lte('next_retry_at', nowIso).limit(50);
      const outcomes: any[] = [];
      for (const l of due || []) {
        // Skip if the ticket had future notifications cancelled after this log was queued.
        const { data: tk } = await admin.from('support_tickets')
          .select('notifications_cancelled_at').eq('id', l.ticket_id).maybeSingle();
        if (tk?.notifications_cancelled_at) {
          await admin.from('support_notification_logs').update({
            status: 'cancelled', error: 'ticket_notifications_cancelled',
          }).eq('id', l.id);
          outcomes.push({ id: l.id, cancelled: true });
          continue;
        }
        const nextAttempt = (l.attempt || 1) + 1;
        await admin.from('support_notification_logs').update({ attempt: nextAttempt, status: 'pending' }).eq('id', l.id);
        const r = await sendWhatsApp(admin, l.recipient, l.body);
        await persistOutcome(admin, l.id, nextAttempt, l.max_attempts || MAX_ATTEMPTS, r);
        outcomes.push({ id: l.id, ok: r.ok, attempt: nextAttempt });
      }
      return new Response(JSON.stringify({ ok: true, processed: outcomes.length, outcomes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Daily reminders ============
    if (event === "daily_reminders") {
      const nowIso = new Date().toISOString();
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const { data: waiting } = await admin.from("support_tickets")
        .select("id, number, title, contact_phone, owner_id, sub_company_id, department, notifications_cancelled_at")
        .eq("status", "aguardando_cliente")
        .is("notifications_cancelled_at", null)
        .or(`last_reminder_at.is.null,last_reminder_at.lt.${yesterday}`);

      const { data: overdue } = await admin.from("support_tickets")
        .select("id, number, title, contact_phone, owner_id, sub_company_id, priority, notifications_cancelled_at")
        .in("status", ["novo", "em_analise"])
        .is("notifications_cancelled_at", null)
        .lt("resolution_due_at", nowIso)
        .or(`last_reminder_at.is.null,last_reminder_at.lt.${yesterday}`);

      const results: any[] = [];
      for (const t of waiting || []) {
        if (t.contact_phone) {
          const tpl = await loadTemplate(admin, t.owner_id, t.sub_company_id, 'daily_reminder_customer', 'customer');
          if (tpl) {
            const rendered = render(tpl.body_template, t);
            results.push(await dispatchNew(admin, {
              ticket_id: t.id, event: 'daily_reminder_customer', audience: 'customer',
              phone: t.contact_phone, body: rendered, template_id: tpl.id,
            }));
          }
        }
        await admin.from("support_tickets").update({ last_reminder_at: nowIso }).eq("id", t.id);
      }

      const byOwner = new Map<string, any[]>();
      for (const t of overdue || []) {
        if (!byOwner.has(t.owner_id)) byOwner.set(t.owner_id, []);
        byOwner.get(t.owner_id)!.push(t);
      }
      for (const [ownerId, list] of byOwner) {
        const tpl = await loadTemplate(admin, ownerId, null, 'daily_reminder_owner', 'owner');
        if (!tpl) continue;
        const rendered = render(tpl.body_template, {
          count: list.length,
          list: list.slice(0, 8).map((t: any) => `• #${t.number} — ${t.title}`).join('\n'),
        });
        const phones = [...(tpl.extra_recipients || []), ownerPhoneEnv].filter(Boolean);
        for (const phone of phones) {
          results.push(await dispatchNew(admin, {
            ticket_id: list[0].id, event: 'daily_reminder_owner', audience: 'owner',
            phone, body: rendered, template_id: tpl.id,
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

    // ============ Per-ticket event ============
    if (!ticket_id) throw new Error("Missing ticket_id");
    const { data: ticket, error } = await admin.from("support_tickets").select("*").eq("id", ticket_id).maybeSingle();
    if (error || !ticket) throw new Error("ticket_not_found");

    if (ticket.notifications_cancelled_at) {
      // Skip and log the reason for audit.
      await admin.from('support_notification_logs').insert({
        ticket_id, event_type: event, audience: 'customer', channel: 'whatsapp',
        recipient: ticket.contact_phone || '(sem destinatário)',
        body: '(evento suprimido)', status: 'skipped', error: 'ticket_notifications_cancelled',
      });
      return new Response(JSON.stringify({ ok: true, skipped: 'notifications_cancelled' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      const rendered = render(tpl.body_template, vars);

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
          recipient: '(sem destinatário)', body: rendered, status: 'skipped',
          error: 'no_recipient', template_id: tpl.id,
        });
        continue;
      }
      for (const phone of phones) {
        results.push(await dispatchNew(admin, {
          ticket_id, event: event as EventType, audience,
          phone, body: rendered, template_id: tpl.id,
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
