// Authenticated edge function: create document, generate token, send via Resend/Twilio
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildHubUrl } from "../_shared/redirect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
const GATEWAY = "https://connector-gateway.lovable.dev";

function rand(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, len);
}
function pin6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !LOVABLE_API_KEY) return { skipped: true };
  const r = await fetch(`${GATEWAY}/resend/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({ from: "Lead Seller <onboarding@resend.dev>", to: [to], subject, html }),
  });
  return { status: r.status, body: await r.text() };
}

async function sendSms(to: string, body: string) {
  if (!TWILIO_API_KEY || !LOVABLE_API_KEY) return { skipped: true };
  const from = Deno.env.get("TWILIO_FROM_NUMBER") || "";
  const r = await fetch(`${GATEWAY}/twilio/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  return { status: r.status, body: await r.text() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const {
        title, description, lead_id, sub_company_id, owner_id,
        method, signer_name, signer_email, signer_phone,
        original_file_path, expires_in_hours = 168, send_now = true,
      } = body;

      const { data: doc, error } = await admin
        .from("signature_documents")
        .insert({
          owner_id: owner_id || user.id,
          sub_company_id, created_by: user.id, lead_id,
          title, description, original_file_path,
          method, signer_name, signer_email, signer_phone,
          status: send_now ? "pending" : "draft",
          expires_at: new Date(Date.now() + expires_in_hours * 3600 * 1000).toISOString(),
        })
        .select().single();

      if (error) throw error;

      const token = rand(40);
      const sms_pin = method === "sms" ? pin6() : null;
      const expires_at = new Date(Date.now() + expires_in_hours * 3600 * 1000).toISOString();

      await admin.from("signature_tokens").insert({
        document_id: doc.id, token, sms_pin, expires_at,
      });

      const portal_url = `${req.headers.get("origin") || "https://app.leadseller.com.br"}/sign/${token}`;

      await admin.from("signature_events").insert({
        document_id: doc.id, event_type: "created", status: "draft", actor_id: user.id,
        metadata: { method, portal_url },
      });

      if (send_now) {
        await admin.from("signature_events").insert({
          document_id: doc.id, event_type: "link_generated", status: "pending", actor_id: user.id,
          metadata: { portal_url },
        });

        if (method === "email" && signer_email) {
          await sendEmail(
            signer_email,
            `Documento para assinatura: ${title}`,
            `<p>Olá ${signer_name || ""},</p><p>Você recebeu um documento para assinatura digital.</p><p><a href="${portal_url}">Clique aqui para assinar</a></p><p>Link expira em ${expires_in_hours}h.</p>`,
          );
        }
        if (method === "sms" && signer_phone) {
          await sendSms(signer_phone, `Documento para assinar: ${portal_url} - PIN: ${sms_pin}`);
        }

        // Notas internas no chat se houver lead_id (busca customer_id via lead)
        if (lead_id) {
          const { data: lead } = await admin.from("leads").select("customer_id, contact_id").eq("id", lead_id).maybeSingle();
          const customer_id = (lead as any)?.customer_id || (lead as any)?.contact_id;
          if (customer_id) {
            await admin.from("chat_messages").insert({
              customer_id, sender_type: "system",
              content: `📄 Documento "${title}" enviado para assinatura via ${method.toUpperCase()}.`,
              metadata: { type: "signature_event", document_id: doc.id, event: "link_generated" },
            } as any);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, document: doc, token, portal_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel") {
      const { document_id } = body;
      await admin.from("signature_documents").update({ status: "cancelled" }).eq("id", document_id);
      await admin.from("signature_events").insert({
        document_id, event_type: "cancelled", status: "cancelled", actor_id: user.id,
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
