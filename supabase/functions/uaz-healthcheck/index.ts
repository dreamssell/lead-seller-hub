import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startTime = Date.now();
  let status = "online";
  let metrics: any = {};

  try {
    // 1. Get UAZ connection
    const { data: conn } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("*")
      .eq("provider", "uaz")
      .single();

    if (!conn) throw new Error("Connection not found");

    // 2. Simple Status Check
    const uazUrl = conn.metadata?.url || "https://api.uazapi.dev";
    const uazToken = conn.metadata?.token;

    const res = await fetch(`${uazUrl}/instance/status`, {
      headers: { "Authorization": `Bearer ${uazToken}` }
    });

    if (!res.ok) status = "degraded";
    
    // 3. Gather Recent Metrics
    const { data: recentLogs } = await supabaseAdmin
      .from("uaz_audit_logs")
      .select("latency_ms, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    const failures = recentLogs?.filter(l => l.status === "error").length || 0;
    const avgLatency = recentLogs?.length 
      ? Math.round(recentLogs.reduce((acc, curr) => acc + (curr.latency_ms || 0), 0) / recentLogs.length)
      : 0;

    metrics = {
      status,
      latency_ms: avgLatency,
      failure_rate: (failures / 50) * 100,
      last_check: new Date().toISOString(),
      uaz_status_code: res.status
    };

    // Audit the healthcheck
    await supabaseAdmin.from("uaz_audit_logs").insert({
      event_type: 'healthcheck',
      status: status === 'online' ? 'success' : 'warning',
      message: `Healthcheck: ${status}`,
      response: metrics,
      latency_ms: Date.now() - startTime
    });

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ status: "offline", error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
