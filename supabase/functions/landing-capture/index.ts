// Public endpoint used by landing pages/links to register views/clicks/leads.
// Anyone can call it. Uses service role to safely create lead records and
// enriches each event with IP + geolocation.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function pickIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip');
  if (!xff) return null;
  const ip = xff.split(',')[0].trim();
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return null;
  return ip;
}

async function geoLookup(ip: string | null) {
  if (!ip) return null;
  try {
    // ipapi.co free tier — no key required, ~1k req/day
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { headers: { 'User-Agent': 'LeadSeller/1.0' } });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      country: j.country_name || j.country || null,
      region: j.region || null,
      city: j.city || null,
      neighborhood: j.district || j.suburb || null,
      latitude: typeof j.latitude === 'number' ? j.latitude : null,
      longitude: typeof j.longitude === 'number' ? j.longitude : null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(url, serviceKey);

    // GET /?slug=xxx&redirect=1 → resolve link, log view+click, 302 to redirect_url.
    if (req.method === 'GET') {
      const u = new URL(req.url);
      const slug = u.searchParams.get('slug');
      if (!slug) return new Response('missing slug', { status: 400, headers: corsHeaders });

      const { data: page } = await sb.from('landing_pages')
        .select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
      if (!page || page.page_type !== 'link' || !page.redirect_url) {
        return new Response('link not found', { status: 404, headers: corsHeaders });
      }

      const ip = pickIp(req);
      const geo = await geoLookup(ip);

      // Dedupe lead creation for same IP+page within 24h (avoids duplicates
      // when the same visitor clicks the short-link multiple times).
      let createdLeadId: string | null = null;
      let stageId: string | null = null;
      let stageName: string | null = null;
      let shouldCreateLead = !!page.pipeline_id;
      if (shouldCreateLead && ip) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: prior } = await sb
          .from('landing_events')
          .select('id')
          .eq('page_id', page.id)
          .eq('type', 'click')
          .eq('ip_address', ip)
          .gte('created_at', since)
          .limit(1);
        if (prior && prior.length > 0) shouldCreateLead = false;
      }

      if (shouldCreateLead && page.pipeline_id) {
        const { data: st } = await sb
          .from('pipeline_stages').select('id,name,position').eq('pipeline_id', page.pipeline_id)
          .order('position', { ascending: true }).limit(1).maybeSingle();
        stageId = st?.id ?? null;
        stageName = st?.name ?? null;

        const locationParts = [geo?.city, geo?.region, geo?.country].filter(Boolean).join(' / ');
        const label = page.tracking_label || page.slug;
        const leadName = `Lead do link · ${label}${locationParts ? ` (${locationParts})` : ''}`;
        const { data: ld } = await sb.from('leads').insert({
          name: leadName,
          status: 'novo',
          source: `landing-link:${label}`,
          channel: 'landing',
          created_by: page.created_by ?? page.owner_id,
          owner_id: page.owner_id,
          sub_company_id: page.sub_company_id,
          pipeline_id: page.pipeline_id,
          stage_id: stageId,
          notes: `Origem: link curto /l/${page.slug}\nDestino: ${page.redirect_url}${locationParts ? `\nLocal aproximado: ${locationParts}` : ''}${ip ? `\nIP: ${ip}` : ''}`,
        }).select('id').maybeSingle();
        createdLeadId = ld?.id ?? null;

        // Timeline event visível no CRM 360
        if (createdLeadId) {
          await sb.from('lead_events').insert({
            lead_id: createdLeadId,
            owner_id: page.owner_id,
            sub_company_id: page.sub_company_id,
            type: 'created_from_landing_link',
            to_stage_id: stageId,
            to_stage_name: stageName,
            channel: 'landing',
            source: `landing-link:${label}`,
            metadata: {
              page_id: page.id,
              slug: page.slug,
              redirect_url: page.redirect_url,
              ip,
              ...(geo || {}),
              referrer: req.headers.get('referer'),
              user_agent: req.headers.get('user-agent'),
            },
          });
        }
      }

      // Log view+click atomically (link the click event to the lead, se criado)
      await sb.from('landing_events').insert([
        { page_id: page.id, type: 'view', referrer: req.headers.get('referer'), user_agent: req.headers.get('user-agent'), ip_address: ip, ...(geo || {}) },
        { page_id: page.id, type: 'click', lead_id: createdLeadId, referrer: req.headers.get('referer'), user_agent: req.headers.get('user-agent'), ip_address: ip, ...(geo || {}) },
      ]);
      const updates: Record<string, number> = {
        view_count: (page.view_count || 0) + 1,
        click_count: (page.click_count || 0) + 1,
      };
      if (createdLeadId) updates.lead_count = (page.lead_count || 0) + 1;
      await sb.from('landing_pages').update(updates).eq('id', page.id);

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: page.redirect_url },
      });
    }

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

    const ip = pickIp(req);
    const geo = await geoLookup(ip);

    await sb.from('landing_events').insert({
      page_id,
      button_id: button_id ?? null,
      type,
      lead_id: createdLeadId,
      referrer: referrer ?? null,
      user_agent: user_agent ?? null,
      metadata: lead ? { lead } : {},
      ip_address: ip,
      ...(geo || {}),
    });

    const col = type === 'view' ? 'view_count' : type === 'click' ? 'click_count' : 'lead_count';
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
