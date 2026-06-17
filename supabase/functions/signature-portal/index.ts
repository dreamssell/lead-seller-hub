// Public endpoint (no JWT): view document by token, request PIN, finalize signature
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function sha256hex(buf: ArrayBuffer | Uint8Array) {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const h = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body.action as string;
    const token = body.token as string;
    if (!token) return new Response(JSON.stringify({ error: "token_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: tok } = await admin.from("signature_tokens").select("*, document:signature_documents(*)").eq("token", token).maybeSingle();
    if (!tok) return new Response(JSON.stringify({ error: "invalid_token" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (new Date(tok.expires_at) < new Date()) {
      await admin.from("signature_documents").update({ status: "expired" }).eq("id", tok.document_id);
      return new Response(JSON.stringify({ error: "expired" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (tok.used_at) return new Response(JSON.stringify({ error: "already_used" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const doc = tok.document as any;
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const ua = req.headers.get("user-agent") || "unknown";

    if (action === "view") {
      const { data: signed } = await admin.storage.from("signed-documents").createSignedUrl(doc.original_file_path, 3600);
      if (!doc.viewed_at) {
        await admin.from("signature_documents").update({ viewed_at: new Date().toISOString(), status: "viewed" }).eq("id", doc.id);
        await admin.from("signature_events").insert({
          document_id: doc.id, event_type: "viewed", status: "viewed", ip, user_agent: ua,
        });
        // nota interna no chat
        if (doc.lead_id) {
          const { data: lead } = await admin.from("leads").select("customer_id").eq("id", doc.lead_id).maybeSingle();
          if ((lead as any)?.customer_id) {
            await admin.from("chat_messages").insert({
              customer_id: (lead as any).customer_id, sender_type: "system",
              content: `👁️ Documento "${doc.title}" visualizado pelo lead.`,
              metadata: { type: "signature_event", document_id: doc.id, event: "viewed" },
            } as any);
          }
        }
      }
      return new Response(JSON.stringify({
        ok: true,
        document: { id: doc.id, title: doc.title, description: doc.description, method: doc.method, signer_name: doc.signer_name },
        file_url: signed?.signedUrl,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "verify_pin") {
      if (doc.method !== "sms") return new Response(JSON.stringify({ error: "method_mismatch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (body.pin !== tok.sms_pin) {
        await admin.from("signature_events").insert({ document_id: doc.id, event_type: "pin_failed", ip, user_agent: ua });
        return new Response(JSON.stringify({ error: "invalid_pin" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await admin.from("signature_tokens").update({ sms_verified_at: new Date().toISOString() }).eq("id", tok.id);
      await admin.from("signature_events").insert({ document_id: doc.id, event_type: "pin_verified", status: "authenticating", ip, user_agent: ua });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sign") {
      // body: { signature_data_url, signer_name? }
      const sigDataUrl = body.signature_data_url as string;
      if (!sigDataUrl?.startsWith("data:image/")) {
        return new Response(JSON.stringify({ error: "signature_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (doc.method === "sms" && !tok.sms_verified_at) {
        return new Response(JSON.stringify({ error: "pin_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Download original PDF (if PDF) and stamp signature + audit page
      const { data: orig } = await admin.storage.from("signed-documents").download(doc.original_file_path);
      let signedBytes: Uint8Array;
      const sigPngB64 = sigDataUrl.split(",")[1];
      const sigBytes = Uint8Array.from(atob(sigPngB64), (c) => c.charCodeAt(0));

      try {
        const pdfBytes = new Uint8Array(await orig!.arrayBuffer());
        const pdf = await PDFDocument.load(pdfBytes);
        const png = await pdf.embedPng(sigBytes);
        const last = pdf.getPages()[pdf.getPageCount() - 1];
        const { width } = last.getSize();
        const sigW = 200, sigH = 80;
        last.drawImage(png, { x: width - sigW - 40, y: 60, width: sigW, height: sigH });

        // Audit page
        const auditPage = pdf.addPage();
        const { height: ah } = auditPage.getSize();
        const now = new Date().toISOString();
        const hash = await sha256hex(pdfBytes);
        const lines = [
          "Termo de Assinatura Eletrônica",
          "",
          `Documento: ${doc.title}`,
          `Signatário: ${doc.signer_name || "—"}`,
          `Método: ${doc.method.toUpperCase()}`,
          `Data: ${now}`,
          `IP de origem: ${ip}`,
          `User-Agent: ${ua}`,
          `Hash SHA-256 (original): ${hash}`,
          tok.sms_verified_at ? `PIN SMS verificado em: ${tok.sms_verified_at}` : "",
        ].filter(Boolean);
        lines.forEach((ln, i) => {
          auditPage.drawText(ln, { x: 40, y: ah - 60 - i * 18, size: i === 0 ? 16 : 10, color: rgb(0, 0, 0) });
        });

        signedBytes = await pdf.save();
      } catch {
        // Não-PDF: salva apenas a assinatura ao lado
        signedBytes = sigBytes;
      }

      const signedPath = doc.original_file_path.replace(/(\.[^.]+)?$/, "_signed.pdf");
      const finalHash = await sha256hex(signedBytes);

      await admin.storage.from("signed-documents").upload(signedPath, signedBytes, { contentType: "application/pdf", upsert: true });

      await admin.from("signature_documents").update({
        status: "signed",
        signed_file_path: signedPath,
        validation_hash: finalHash,
        signed_ip: ip,
        signed_user_agent: ua,
        signed_at: new Date().toISOString(),
      }).eq("id", doc.id);

      await admin.from("signature_tokens").update({ used_at: new Date().toISOString() }).eq("id", tok.id);
      await admin.from("signature_events").insert({
        document_id: doc.id, event_type: "signed", status: "signed", ip, user_agent: ua,
        metadata: { hash: finalHash, method: doc.method },
      });

      if (doc.lead_id) {
        const { data: lead } = await admin.from("leads").select("customer_id").eq("id", doc.lead_id).maybeSingle();
        if ((lead as any)?.customer_id) {
          await admin.from("chat_messages").insert({
            customer_id: (lead as any).customer_id, sender_type: "system",
            content: `✅ Documento "${doc.title}" ASSINADO. Hash: ${finalHash.slice(0, 12)}...`,
            metadata: { type: "signature_event", document_id: doc.id, event: "signed", hash: finalHash },
          } as any);
        }
      }

      return new Response(JSON.stringify({ ok: true, hash: finalHash }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
