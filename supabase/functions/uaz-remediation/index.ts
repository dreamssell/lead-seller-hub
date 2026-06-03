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
  let remediations: string[] = [];

  try {
    // 1. Get settings
    const { data: settings } = await supabaseAdmin
      .from("uaz_system_settings")
      .select("*")
      .eq("id", "global")
      .single();

    const interval = settings?.remediation_interval_minutes || 15;

    // 2. Check for persistent errors (at least 3 errors in the last X minutes)
    const since = new Date(Date.now() - interval * 60000).toISOString();
    
    const { data: recentErrors } = await supabaseAdmin
      .from("uaz_audit_logs")
      .select("*")
      .eq("status", "error")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (recentErrors && recentErrors.length >= 3) {
      console.log(`Persistent degradation detected: ${recentErrors.length} errors in ${interval}m`);
      
      // ACTION: Re-enqueue failed send_message tasks that haven't been remediated yet
      const sendErrors = recentErrors.filter(l => l.event_type === 'send_message' && !l.is_remediation);
      
      for (const err of sendErrors) {
        if (err.payload?.customer_id && err.payload?.content) {
          // Re-trigger send-message via internal call or just record for worker
          remediations.push(`Retrying msg for customer ${err.payload.customer_id}`);
          
          await supabaseAdmin.functions.invoke('uaz-send-message', {
            body: {
              customer_id: err.payload.customer_id,
              content: err.payload.content,
              client_msg_id: `retry-${err.id}` // New ID to allow retry
            }
          });

          // Mark as remediated
          await supabaseAdmin.from("uaz_audit_logs")
            .update({ is_remediation: true })
            .eq("id", err.id);
        }
      }
    }

    // 3. Log results
    if (remediations.length > 0) {
      await supabaseAdmin.from("uaz_audit_logs").insert({
        event_type: 'remediation',
        status: 'success',
        message: `Remediação concluída: ${remediations.length} ações executadas.`,
        response: { remediations },
        latency_ms: Date.now() - startTime
      });
    }

    return new Response(JSON.stringify({ success: true, actions: remediations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
