// Edge Function: verifica status de conexão WhatsApp (UAZ ou Meta)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CheckPayload {
  provider: "uaz" | "meta";
  // Overrides opcionais por cliente — se não vierem, usa secrets globais
  url?: string;
  token?: string;
  phone_number_id?: string;
}

async function checkUaz(url: string, token: string) {
  const base = url.replace(/\/+$/, "");
  const res = await fetch(`${base}/instance/status`, {
    headers: { token, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`UAZ [${res.status}]: ${text.slice(0, 300)}`);
  }
  const connected =
    data?.connected === true ||
    data?.instance?.status === "connected" ||
    data?.status === "connected";
  return {
    connected,
    phone: data?.instance?.phone ?? data?.phone ?? null,
    raw: data,
  };
}

async function checkMeta(token: string, phoneNumberId: string) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Meta [${res.status}]: ${data?.error?.message ?? JSON.stringify(data)}`
    );
  }
  return {
    connected: true,
    phone: data?.display_phone_number ?? null,
    raw: data,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as CheckPayload;
    if (!body?.provider || !["uaz", "meta"].includes(body.provider)) {
      return new Response(JSON.stringify({ error: "Invalid provider" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: { connected: boolean; phone: string | null; raw: unknown };
    let lastError: string | null = null;

    try {
      if (body.provider === "uaz") {
        const url =
          body.url ||
          Deno.env.get("UAZ_API_URL") ||
          "https://api.uazapi.dev"; // fictício
        const token =
          body.token ||
          Deno.env.get("UAZ_API_TOKEN") ||
          "demo-uaz-token-placeholder";
        result = await checkUaz(url, token);
      } else {
        const token =
          body.token ||
          Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ||
          "demo-meta-token-placeholder";
        const phoneId =
          body.phone_number_id ||
          Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ||
          "000000000000000";
        result = await checkMeta(token, phoneId);
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : "Erro desconhecido";
      result = { connected: false, phone: null, raw: null };
    }

    // Atualiza a tabela whatsapp_connections (admin)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await adminClient
      .from("whatsapp_connections")
      .update({
        status: lastError
          ? "error"
          : result.connected
          ? "connected"
          : "disconnected",
        phone_number: result.phone,
        last_checked_at: new Date().toISOString(),
        last_error: lastError,
      })
      .eq("provider", body.provider);

    return new Response(
      JSON.stringify({
        provider: body.provider,
        connected: result.connected,
        phone: result.phone,
        error: lastError,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
