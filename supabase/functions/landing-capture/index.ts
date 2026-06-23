// Public endpoint used by landing pages to register clicks/leads.
// Anyone can call it. Uses service role to safely create lead records.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(url, serviceKey);

    const body = await req.json();
    const { page_id, button_id, type, lead, referrer, user_agent } = body as {
      page_id: string;
      button_id?: string | null;
      type: 'view' | 'click' | 'lead';
      lead?: { name?: string; phone?: string; email?: string; message?: string };
      referrer?: string;
      user_agent?: string;
    };

    if (!page_id || !type) {
      return new Response(JSON.stringify({ error: 'page_id and type are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: page, error: pErr } = await sb
      .from('landing_pages').select('*').eq('id', page_id).eq('status', 'published').maybeSingle();
    if (pErr || !page) {
      return new Response(JSON.stringify({ error: 'page_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let createdLeadId: string | null = null;

    // Optionally materialize the lead into the CRM
    if ((type === 'lead' || (type === 'click' && page.auto_create_lead && lead?.name)) && lead?.name) {
      let stageId: string | null = null;
      if (page.pipeline_id) {
        const { data: st } = await sb
          .from('pipeline_stages').select('id,position').eq('pipeline_id', page.pipeline_id)
          .order('position', { ascending: true }).limit(1).maybeSingle();
        stageId = st?.id ?? null;
      }
      const { data: ld, error: lErr } = await sb.from('leads').insert({
        name: lead.name,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        status: 'novo',
        source: `landing:${page.tracking_label || page.slug}`,
        channel: 'landing',
        created_by: page.created_by ?? page.owner_id,
        owner_id: page.owner_id,
        sub_company_id: page.sub_company_id,
        pipeline_id: page.pipeline_id,
        stage_id: stageId,
        notes: lead.message ?? null,
      }).select('id').maybeSingle();
      if (!lErr) createdLeadId = ld?.id ?? null;
    }

    await sb.from('landing_events').insert({
      page_id,
      button_id: button_id ?? null,
      type,
      lead_id: createdLeadId,
      referrer: referrer ?? null,
      user_agent: user_agent ?? null,
      metadata: lead ? { lead } : {},
    });

    // Counters
    const col = type === 'view' ? 'view_count' : type === 'click' ? 'click_count' : 'lead_count';
    await sb.rpc('exec', {}).catch(() => null); // noop, simple inc via update below
    await sb.from('landing_pages').update({ [col]: (page as any)[col] + 1 }).eq('id', page_id);

    if (button_id && type === 'click') {
      const { data: btn } = await sb.from('landing_buttons').select('click_count').eq('id', button_id).maybeSingle();
      if (btn) await sb.from('landing_buttons').update({ click_count: (btn.click_count ?? 0) + 1 }).eq('id', button_id);
    }

    return new Response(JSON.stringify({ ok: true, lead_id: createdLeadId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
