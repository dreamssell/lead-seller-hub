import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function checkUaz(url: string, token: string) {
  try {
    // Note: User report says "Missing token" despite Authorization header.
    // Some versions or reverse proxies for UAZ require headers in lowercase or specific keys.
    const headers = { 
      "Authorization": `Bearer ${token}`,
      "apikey": token,
      "token": token
    };

    // Constructing URL for UAZ v1 and v2 status endpoints
    // Some use /instance/status, others /status/instance
    const baseUrl = url.replace(/\/$/, "");
    console.log(`Checking UAZ status at: ${baseUrl}/instance/status`);
    
    let res = await fetch(`${baseUrl}/instance/status`, { headers });
    let text = await res.text();
    
    // Fallback to /status/instance if /instance/status fails
    if (res.status === 404 || res.status === 401) {
       console.log("Trying fallback endpoint /status/instance...");
       const res2 = await fetch(`${baseUrl}/status/instance`, { headers });
       const text2 = await res2.text();
       if (res2.ok) {
         res = res2;
         text = text2;
       }
    }
    
    if (!res.ok) {
      console.error(`UAZ Error [${res.status}]: ${text}`);
      return { connected: false, status: "error", error: `UAZ [${res.status}]: ${text.slice(0, 300)}` };
    }
    
    const data = JSON.parse(text);
    // UAZ returns status: "open", "connecting", "close", etc. or state: "CONNECTED"
    const isConnected = data.status === "open" || data.state === "CONNECTED" || data.instanceStatus === "CONNECTED" || data.connectionStatus === "open";
    return { 
      connected: isConnected, 
      status: data.status || data.state || data.instanceStatus || data.connectionStatus,
      raw: data 
    };
  } catch (err) {
    console.error(`Fetch exception: ${err.message}`);
    return { connected: false, status: "error", error: err.message };
  }
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
  let connectionId: string | null = null;

  try {
    const body = await req.json();
    let provider = body?.provider;
    let url = body?.url;
    let token = body?.token;
    connectionId = body?.connection_id;

    if (connectionId && !provider) {
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("*")
        .eq("id", connectionId)
        .single();
      
      if (conn) {
        provider = conn.provider;
        url = conn.metadata?.url;
        token = conn.metadata?.token;
      }
    }

    if (!provider || !["uaz", "meta"].includes(provider)) {
      throw new Error("Provedor inválido ou ausente");
    }

    if (provider === "uaz") {
      const uazUrl = url || Deno.env.get("UAZ_API_URL") || "https://api.uazapi.dev";
      if (!token) throw new Error("Token UAZ ausente");

      result = await checkUaz(uazUrl, token);
    } else {
      // Mock Meta for now
      result = { connected: false, status: "disconnected" };
    }

    // Update Database Status
    if (connectionId) {
      let dbStatus: "connected" | "disconnected" | "connecting" | "error" = "disconnected";
      
      if (result.connected) {
        dbStatus = "connected";
      } else if (result.status === "connecting") {
        dbStatus = "connecting";
      } else if (result.status === "error") {
        dbStatus = "error";
      }

      await supabaseAdmin
        .from("whatsapp_connections")
        .update({ 
          status: dbStatus,
          last_checked_at: new Date().toISOString(),
          last_error: result.error || null
        })
        .eq("id", connectionId);
    }

  } catch (err) {
    status = "error";
    message = err.message;
    result = { error: err.message, connected: false };
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
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
