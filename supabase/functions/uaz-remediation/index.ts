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
    const { data: settings } = await supabaseAdmin
      .from("uaz_system_settings")
      .select("*")
      .eq("id", "global")
      .single();

    const interval = settings?.remediation_interval_minutes || 15;
    const incidentThreshold = settings?.incident_threshold_retries || 5;

    const since = new Date(Date.now() - interval * 60000).toISOString();
    
    const { data: recentErrors } = await supabaseAdmin
      .from("uaz_audit_logs")
      .select("*")
      .eq("status", "error")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (recentErrors && recentErrors.length >= 3) {
      const sendErrors = recentErrors.filter(l => 
        l.event_type === 'send_message' && 
        !l.is_remediation
      );
      
      for (const err of sendErrors) {
        if (err.payload?.customer_id && err.payload?.content) {
          const currentRetryCount = (err.payload?.remediation_count || 0) + 1;
          
          // Check if we hit the incident threshold
          if (currentRetryCount > incidentThreshold) {
            console.log(`Incident threshold reached for ${err.id}`);
            
            // Create automatic incident
            await supabaseAdmin.from("uaz_incidents").insert({
              original_log_id: err.id,
              customer_id: err.payload.customer_id,
              cause: `Retries exhausted after ${incidentThreshold} attempts`,
              trace: { last_response: err.response, last_message: err.message },
              severity: 'high'
            });

            // Mark as remediated (stop the loop) but with a note
            await supabaseAdmin.from("uaz_audit_logs")
              .update({ 
                is_remediation: true,
                final_cause: 'Incident threshold reached'
              })
              .eq("id", err.id);
            
            continue;
          }

          const minDelay = Math.pow(2, currentRetryCount) * 60000;
          const timeSinceError = Date.now() - new Date(err.created_at).getTime();
          
          if (timeSinceError < minDelay) continue;

          remediations.push(`Retrying customer ${err.payload.customer_id} (Attempt ${currentRetryCount})`);
          
          await supabaseAdmin.functions.invoke('uaz-send-message', {
            body: {
              customer_id: err.payload.customer_id,
              content: err.payload.content,
              client_msg_id: `remedy-${err.id}-${currentRetryCount}`,
              metadata: {
                ...err.payload.metadata,
                remediation_count: currentRetryCount,
                original_error_id: err.id
              }
            }
          });

          await supabaseAdmin.from("uaz_audit_logs")
            .update({ 
              is_remediation: true,
              remediation_target_id: err.id
            })
            .eq("id", err.id);
        }
      }
    }

    if (remediations.length > 0) {
      await supabaseAdmin.from("uaz_audit_logs").insert({
        event_type: 'remediation',
        status: 'success',
        message: `Remediação concluída: ${remediations.length} ações.`,
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
