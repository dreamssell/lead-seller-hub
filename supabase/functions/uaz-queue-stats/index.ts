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

  try {
    // Current queue size: messages with status 'sending' or 'pending' in the last 24h
    // Since our current chat_messages schema doesn't have a broad 'status' column yet for ALL messages,
    // we use a combination of audit logs to estimate "active" or "stuck" messages.
    // Realistically, we'll count uaz_audit_logs with status='error' or 'warning' that haven't been remediated.
    
    const now = new Date();
    const history: any[] = [];
    
    // Simulate trend for the last 6 hours
    for (let i = 6; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60000);
      const startTime = new Date(time.getTime() - 30 * 60000).toISOString();
      const endTime = time.toISOString();

      const { count } = await supabaseAdmin
        .from('uaz_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'error')
        .gte('created_at', startTime)
        .lte('created_at', endTime);

      history.push({
        time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pending: count || 0
      });
    }

    return new Response(JSON.stringify({ 
      current_queue: history[history.length - 1].pending,
      trend: history 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
