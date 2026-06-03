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
    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id;
    const channelType = body.channel_type; // 'whatsapp', 'voip', 'video'
    
    const now = new Date();
    const history: any[] = [];
    
    // Simulate trend for the last 6 hours
    for (let i = 6; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60000);
      const startTime = new Date(time.getTime() - 30 * 60000).toISOString();
      const endTime = time.toISOString();

      let query = supabaseAdmin
        .from('uaz_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'error')
        .gte('created_at', startTime)
        .lte('created_at', endTime);

      if (tenantId) {
        // Assuming metadata contains tenant info or we filter by related customer's tenant
        // For now, let's look in payload or metadata if available
        query = query.or(`payload->>tenant_id.eq.${tenantId},payload->>sub_company_id.eq.${tenantId}`);
      }

      if (channelType) {
        // If channelType is provided, filter by it in event_type or metadata
        // For simplicity, we assume event_type starts with channelType or it's in metadata
        query = query.filter('event_type', 'ilike', `${channelType}%`);
      }

      const { count } = await query;

      history.push({
        time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: time.toISOString(),
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
