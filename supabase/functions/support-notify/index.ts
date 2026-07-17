/**
 * Envia notificações via WhatsApp (UAZ) para eventos de tickets de suporte.
 *
 * Payload: { ticket_id: string, event: 'created' | 'status_changed' | 'assigned' }
 *
 * - Ao cliente: mensagem no WhatsApp cadastrado no próprio ticket (contact_phone).
 * - Ao dono da plataforma: WhatsApp apenas para prioridade "critica" (usa SUPPORT_OWNER_PHONE).
 *
 * A entrega é best-effort — falhas não impedem a operação do ticket.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ticket_id, event } = await req.json();
    if (!ticket_id || !event) throw new Error("Missing ticket_id or event");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
      // Owner WhatsApp em críticos
      const ownerPhone = Deno.env.get("SUPPORT_OWNER_PHONE");
      if (ownerPhone && ticket.priority === "critica") {
        messages.push({
          phone: ownerPhone,
          text: `🚨 TICKET CRÍTICO ${num}\n\n${ticket.title}\n\nDepto: ${ticket.department}\nAcesse o painel Master para atender.`,
        });
      }
    } else if (event === "status_changed") {
      if (ticket.contact_phone) {
        const map: Record<string, string> = {
          em_analise: "🔎 Estamos analisando",
          aguardando_cliente: "⏳ Aguardando informação sua",
          resolvido: "✅ Resolvido — avalie nosso atendimento no portal",
          fechado: "🔒 Ticket fechado",
        };
        const label = map[ticket.status];
        if (label) messages.push({ phone: ticket.contact_phone, text: `${label}\n\nTicket ${num}: ${ticket.title}` });
      }
    }

    // Envia via a função existente uaz-send-message (WhatsApp direto ao número).
    // Se a instalação usar outra função de envio direto por número, ajustar aqui.
    const results: any[] = [];
    for (const m of messages) {
      try {
        const res = await admin.functions.invoke("uaz-send-message", {
          body: { phone: m.phone, content: m.text, source: "support" },
        });
        results.push({ phone: m.phone, ok: !res.error });
      } catch (e) {
        results.push({ phone: m.phone, ok: false, error: String(e) });
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
