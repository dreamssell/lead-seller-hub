import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function checkUaz(url: string, token: string) {
  try {
    const headers = { 
      "Authorization": `Bearer ${token}`,
      "apikey": token,
      "token": token,
      "Content-Type": "application/json"
    };

    const baseUrl = url.replace(/\/$/, "");
    console.log(`[UAZ DEBUG] Testing connection to: ${baseUrl}`);
    console.log(`[UAZ DEBUG] Headers keys sent: ${Object.keys(headers).join(", ")}`);
    
    // Attempt 1: /instance/status
    console.log(`[UAZ DEBUG] Trying endpoint: ${baseUrl}/instance/status`);
    let res = await fetch(`${baseUrl}/instance/status`, { headers });
    let text = await res.text();
    
    // Attempt 2 Fallback: /status/instance
    if (!res.ok && (res.status === 404 || res.status === 401)) {
       console.log(`[UAZ DEBUG] Fallback 1: Trying ${baseUrl}/status/instance (Previous status: ${res.status})`);
       const res2 = await fetch(`${baseUrl}/status/instance`, { headers });
       if (res2.ok || res2.status !== 404) {
         res = res2;
         text = await res2.text();
       }
    }

    // Attempt 3 Fallback: /instance/connect (Some versions use this for status/init)
    if (!res.ok && res.status === 404) {
       console.log(`[UAZ DEBUG] Fallback 2: Trying ${baseUrl}/instance/connect`);
       const res3 = await fetch(`${baseUrl}/instance/connect`, { headers });
       if (res3.ok) {
         res = res3;
         text = await res3.text();
       }
    }
    
    if (!res.ok) {
      console.error(`[UAZ DEBUG] Final Error [${res.status}]: ${text}`);
      // Returning full raw response for UI display as requested
      return { 
        connected: false, 
        status: "error", 
        error: `UAZ [${res.status}]: ${text.slice(0, 500)}`,
        raw_error: text,
        status_code: res.status
      };
    }
    
    const data = JSON.parse(text);
    
    // Improved UAZ connection detection based on common API responses
    // Checking both root level and nested 'status' or 'instance' objects
    const isConnected = 
      data.status === "open" || 
      data.status === "connected" ||
      data.state === "CONNECTED" || 
      data.instanceStatus === "CONNECTED" || 
      data.connectionStatus === "open" ||
      data.connected === true ||
      data.loggedIn === true ||
      data.instance?.status === "connected" ||
      data.status?.connected === true;
    
    // Ensure status is a string
    let displayStatus = data.status || data.state || data.instanceStatus || data.connectionStatus || data.instance?.status || (data.status?.connected ? "connected" : null) || (data.connected ? "connected" : "disconnected");
    if (typeof displayStatus === 'object') {
      displayStatus = displayStatus.connected ? "connected" : JSON.stringify(displayStatus);
    }

    console.log(`[UAZ DEBUG] Success! Status: ${displayStatus}`);

    return { 
      connected: isConnected, 
      status: displayStatus,
      phone: data.instance?.owner || data.status?.jid || data.jid || null,
      raw: data 
    };
  } catch (err) {
    console.error(`[UAZ DEBUG] Fetch exception: ${err.message}`);
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
    let sessionFromDb: string | undefined;
    connectionId = body?.connection_id;

    if (connectionId) {
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("*")
        .eq("id", connectionId)
        .single();

      if (conn) {
        if (!provider) provider = conn.provider;
        if (!url) url = conn.metadata?.url;
        if (!token) token = conn.metadata?.token;
        sessionFromDb = conn.metadata?.session || conn.metadata?.instance;
      }
    }

    if (!provider || !["uaz", "meta", "wavoip", "evolution", "waha"].includes(provider)) {
      throw new Error("Provedor inválido ou ausente");
    }

    if (provider === "uaz") {
      const uazUrl = url || Deno.env.get("UAZ_API_URL") || "https://api.uazapi.dev";
      if (!token) throw new Error("Token UAZ ausente");

      result = await checkUaz(uazUrl, token);
    } else if (provider === "wavoip") {
      // Basic Wavoip health check simulation
      // In a real scenario, this would call the Wavoip /health or /status endpoint
      const wavoipUrl = url || "https://api.wavoip.com/v1";
      console.log(`[WAVOIP] Checking health for: ${wavoipUrl}`);
      
      // Placeholder: assuming success for now if token is present
      result = { 
        connected: token ? true : false, 
        status: token ? "connected" : "disconnected",
        provider: "wavoip" 
      };
    } else if (provider === "evolution") {
      const rawEvo = (url || "").trim().replace(/\/$/, "");
      const evoUrl = rawEvo && !/^https?:\/\//i.test(rawEvo) ? `https://${rawEvo}` : rawEvo;
      const instance = body?.instance || body?.phone_number_id;
      if (!evoUrl || !token || !instance) {
        result = { connected: false, status: "unconfigured", error: "URL, API Key e Instance Name são obrigatórios." };
      } else {
        try {
          const res = await fetch(`${evoUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
            headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          });
          const data = await res.json().catch(() => ({}));
          const state = data?.instance?.state || data?.state || "unknown";
          result = {
            connected: state === "open",
            status: state,
            phone: data?.instance?.owner ? String(data.instance.owner).split("@")[0] : null,
            raw: data,
          };
        } catch (e) {
          result = { connected: false, status: "error", error: (e as Error).message };
        }
      }
    } else if (provider === "waha") {
      const rawWaha = (url || "").trim().replace(/\/$/, "");
      const wahaUrl = rawWaha && !/^https?:\/\//i.test(rawWaha) ? `https://${rawWaha}` : rawWaha;
      const session = body?.instance || body?.session || "default";
      if (!wahaUrl) {
        result = { connected: false, status: "unconfigured", error: "URL WAHA é obrigatória." };
      } else {
        try {
          const res = await fetch(`${wahaUrl}/api/sessions/${encodeURIComponent(session)}`, {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { "X-Api-Key": token } : {}),
            },
          });
          const text = await res.text();
          let data: any = {};
          try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
          if (!res.ok) {
            result = { connected: false, status: "error", error: `WAHA [${res.status}]: ${text.slice(0, 300)}`, status_code: res.status };
          } else {
            const state = String(data?.status || data?.state || "unknown");
            result = {
              connected: /working|connected|open|running/i.test(state),
              status: state,
              phone: data?.me?.id || null,
              raw: data,
            };
          }
        } catch (e) {
          result = { connected: false, status: "error", error: (e as Error).message };
        }
      }
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
