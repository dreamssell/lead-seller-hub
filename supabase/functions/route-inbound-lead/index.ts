import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Body {
  customer_id: string;
  channel?: string;
  origin?: string;
  keywords?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.customer_id || typeof body.customer_id !== 'string') {
      return json({ error: 'customer_id required' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await admin.rpc('route_inbound_lead', {
      _customer_id: body.customer_id,
      _channel: body.channel ?? null,
      _origin: body.origin ?? null,
      _keywords: body.keywords ?? null,
    });

    if (error) {
      console.error('route_inbound_lead error', error);
      return json({ error: error.message }, 500);
    }

    return json({ assignment_id: data });
  } catch (err) {
    console.error('route-inbound-lead failed', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
