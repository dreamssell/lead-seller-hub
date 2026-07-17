/**
 * Notificações omnichannel do módulo Central de Ajuda.
 *
 * Eventos:
 *  - created           → mensagem ao cliente + alerta ao dono (críticos)
 *  - assigned          → aviso ao cliente que um responsável foi designado
 *  - status_changed    → progressão no funil
 *  - resolved          → convite para avaliar CSAT
 *  - daily_reminders   → cron diário: relembra tickets aguardando cliente ou próximos do SLA
 *
 * Entrega best-effort — falhas não impedem operação.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsApp(admin: any, phone: string, text: string) {
  try {
    const res = await admin.functions.invoke("uaz-send-message", {
      body: { phone, content: text, source: "support" },
    });
    return { phone, ok: !res.error };
  } catch (e) {
    return { phone, ok: false, error: String(e) };
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

    // ============ Cron diário ============
    if (event === "daily_reminders") {
      const nowIso = new Date().toISOString();
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      // Aguardando cliente há +24h sem lembrete recente
      const { data: waiting } = await admin
        .from("support_tickets")
        .select("id, number, title, contact_phone, last_reminder_at")
        .eq("status", "aguardando_cliente")
        .or(`last_reminder_at.is.null,last_reminder_at.lt.${yesterday}`);

      // Em análise próximos ou estourando resolução
      const { data: overdue } = await admin
        .from("support_tickets")
        .select("id, number, title, contact_phone, resolution_due_at, last_reminder_at, priority")
        .in("status", ["novo", "em_analise"])
        .lt("resolution_due_at", nowIso)
        .or(`last_reminder_at.is.null,last_reminder_at.lt.${yesterday}`);

      const results: any[] = [];
      for (const t of waiting || []) {
        if (t.contact_phone) {
          results.push(await sendWhatsApp(admin, t.contact_phone,
            `⏳ Lembrete — Ticket #${t.number}: "${t.title}"\n\nAinda aguardamos uma resposta sua para prosseguir. Acesse o portal e responda quando puder 🙂`));
        }
        await admin.from("support_tickets").update({ last_reminder_at: nowIso }).eq("id", t.id);
      }
      const ownerPhone = Deno.env.get("SUPPORT_OWNER_PHONE");
      if (ownerPhone && (overdue?.length || 0) > 0) {
        results.push(await sendWhatsApp(admin, ownerPhone,
          `⚠️ ${overdue!.length} ticket(s) com SLA estourado:\n\n` +
          overdue!.slice(0, 8).map((t) => `• #${t.number} — ${t.title}`).join("\n")));
        for (const t of overdue!) {
          await admin.from("support_tickets").update({ last_reminder_at: nowIso }).eq("id", t.id);
        }
      }
      return new Response(JSON.stringify({ ok: true, reminders: results.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Eventos por ticket ============
    if (!ticket_id) throw new Error("Missing ticket_id");
    const { data: ticket, error } = await admin
      .from("support_tickets").select("*").eq("id", ticket_id).maybeSingle();
    if (error || !ticket) throw new Error("ticket_not_found");

    const messages: Array<{ phone: string; text: string }> = [];
    const num = `#${ticket.number}`;

    if (event === "created") {
      if (ticket.contact_phone) {
        messages.push({
          phone: ticket.contact_phone,
          text: `✅ Recebemos seu ticket ${num}. Nossa equipe de ${ticket.department} já foi notificada e retornará em breve.\n\nAssunto: ${ticket.title}`,
        });
      }
      const ownerPhone = Deno.env.get("SUPPORT_OWNER_PHONE");
      if (ownerPhone && ticket.priority === "critica") {
        messages.push({
          phone: ownerPhone,
          text: `🚨 TICKET CRÍTICO ${num}\n\n${ticket.title}\n\nDepto: ${ticket.department}\nAcesse o painel Master para atender.`,
        });
      }
    } else if (event === "assigned") {
      if (ticket.contact_phone && ticket.assigned_to) {
        const { data: prof } = await admin.from("profiles")
          .select("display_name").eq("user_id", ticket.assigned_to).maybeSingle();
        const who = prof?.display_name || "um especialista";
        messages.push({
          phone: ticket.contact_phone,
          text: `👤 ${who} está cuidando do seu ticket ${num}: "${ticket.title}".\n\nVocê receberá atualizações por aqui.`,
        });
      }
    } else if (event === "resolved") {
      if (ticket.contact_phone) {
        messages.push({
          phone: ticket.contact_phone,
          text: `✅ Ticket ${num} foi marcado como resolvido!\n\n"${ticket.title}"\n\nAvalie nosso atendimento no portal — leva menos de 10 segundos ⭐`,
        });
      }
    } else if (event === "status_changed") {
      const map: Record<string, string> = {
        em_analise: "🔎 Estamos analisando",
        aguardando_cliente: "⏳ Aguardando informação sua",
        resolvido: "✅ Resolvido — avalie nosso atendimento no portal",
        fechado: "🔒 Ticket fechado",
      };
      const label = map[ticket.status];
      if (label && ticket.contact_phone) {
        messages.push({ phone: ticket.contact_phone, text: `${label}\n\nTicket ${num}: ${ticket.title}` });
      }
    }

    const results: any[] = [];
    for (const m of messages) results.push(await sendWhatsApp(admin, m.phone, m.text));

    return new Response(JSON.stringify({ ok: true, sent: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
