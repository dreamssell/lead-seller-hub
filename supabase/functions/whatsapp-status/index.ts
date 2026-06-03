import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function checkUaz(url: string, token: string) {
  const res = await fetch(`${url}/instance/status`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`UAZ [${res.status}]: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startTime = Date.now();
  let result: any = null;
  let status = "success";
  let message = "Status verificado com sucesso";

  try {
    const body = await req.json();
    if (!body?.provider || !["uaz", "meta"].includes(body.provider)) {
      throw new Error("Provedor inválido ou ausente");
    }

    if (body.provider === "uaz") {
      const url = body.url || Deno.env.get("UAZ_API_URL") || "https://api.uazapi.dev";
      const token = body.token;
      if (!token) throw new Error("Token UAZ ausente");

      result = await checkUaz(url, token);
    } else {
      // Mock Meta for now
      result = { connected: false };
    }

  } catch (err) {
    status = "error";
    message = err.message;
    result = { error: err.message };
  } finally {
    // Audit status check
    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'status_check',
      status,
      message,
      response: result,
      latency_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify(result), {
      status: status === "success" ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
