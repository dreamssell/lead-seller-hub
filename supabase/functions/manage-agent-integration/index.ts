import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ---------- provider test helpers ----------
async function testProvider(provider: string, credentials: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  try {
    switch (provider) {
      case 'openai': {
        const key = credentials.api_key;
        if (!key) return { ok: false, message: 'API key obrigatória' };
        const r = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        return r.ok
          ? { ok: true, message: 'Chave OpenAI válida' }
          : { ok: false, message: `OpenAI rejeitou a chave (${r.status})` };
      }
      case 'google_calendar': {
        const token = credentials.access_token;
        if (!token) return { ok: false, message: 'Access token obrigatório' };
        const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return r.ok
          ? { ok: true, message: 'Conectado ao Google Calendar' }
          : { ok: false, message: `Google rejeitou o token (${r.status})` };
      }
      case 'linkedin': {
        const token = credentials.access_token;
        if (!token) return { ok: false, message: 'Access token obrigatório' };
        const r = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return r.ok ? { ok: true, message: 'Conectado ao LinkedIn' } : { ok: false, message: `LinkedIn (${r.status})` };
      }
      case 'meta':
      case 'instagram':
      case 'whatsapp_business': {
        const token = credentials.access_token;
        if (!token) return { ok: false, message: 'Access token obrigatório' };
        const r = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}`);
        return r.ok ? { ok: true, message: 'Conectado ao Meta' } : { ok: false, message: `Meta (${r.status})` };
      }
      case 'elevenlabs': {
        const key = credentials.api_key;
        if (!key) return { ok: false, message: 'API key obrigatória' };
        const r = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': key } });
        return r.ok ? { ok: true, message: 'Conectado à ElevenLabs' } : { ok: false, message: `ElevenLabs (${r.status})` };
      }
      case 'slack': {
        const token = credentials.bot_token;
        if (!token) return { ok: false, message: 'Bot token obrigatório' };
        const r = await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json();
        return data.ok ? { ok: true, message: `Slack: ${data.team}` } : { ok: false, message: data.error || 'erro' };
      }
      case 'hubspot': {
        const token = credentials.access_token;
        if (!token) return { ok: false, message: 'Access token obrigatório' };
        const r = await fetch('https://api.hubapi.com/account-info/v3/details', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return r.ok ? { ok: true, message: 'Conectado ao HubSpot' } : { ok: false, message: `HubSpot (${r.status})` };
      }
      case 'rd_station': {
        const token = credentials.access_token;
        if (!token) return { ok: false, message: 'Access token obrigatório' };
        const r = await fetch('https://api.rd.services/marketing/account_info', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return r.ok ? { ok: true, message: 'Conectado à RD Station' } : { ok: false, message: `RD (${r.status})` };
      }
      case 'zapier':
      case 'webhook': {
        const url = credentials.webhook_url;
        if (!url) return { ok: false, message: 'URL obrigatória' };
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'lead_seller.test', timestamp: new Date().toISOString() }),
          });
          return r.ok ? { ok: true, message: `Webhook respondeu ${r.status}` } : { ok: false, message: `Webhook ${r.status}` };
        } catch (e) {
          return { ok: false, message: `Falha ao chamar webhook: ${(e as Error).message}` };
        }
      }
      default:
        return { ok: true, message: 'Credenciais salvas (sem teste automático)' };
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json();
    const { action, agent_id, provider, label, credentials, config, id } = body || {};

    // verify ownership of agent
    if (agent_id) {
      const { data: agent } = await supabase.from('ai_agents').select('id, created_by').eq('id', agent_id).maybeSingle();
      if (!agent || agent.created_by !== user.id) return json({ error: 'forbidden' }, 403);
    }

    if (action === 'list') {
      const { data, error } = await supabase
        .from('agent_integrations')
        .select('*')
        .eq('agent_id', agent_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      // strip secrets in list response
      const safe = (data || []).map((row: any) => ({
        ...row,
        credentials: Object.fromEntries(Object.keys(row.credentials || {}).map((k) => [k, '••••'])),
      }));
      return json({ items: safe });
    }

    if (action === 'test') {
      const result = await testProvider(provider, credentials || {});
      return json(result);
    }

    if (action === 'save') {
      const result = await testProvider(provider, credentials || {});
      const payload = {
        agent_id,
        created_by: user.id,
        provider,
        label: label || provider,
        credentials: credentials || {},
        config: config || {},
        status: result.ok ? 'connected' : 'error',
        last_tested_at: new Date().toISOString(),
        last_error: result.ok ? null : result.message,
      };
      const { data, error } = await supabase
        .from('agent_integrations')
        .upsert(payload, { onConflict: 'agent_id,provider' })
        .select()
        .single();
      if (error) throw error;
      return json({ item: { ...data, credentials: {} }, test: result });
    }

    if (action === 'delete') {
      const { error } = await supabase.from('agent_integrations').delete().eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'invalid_action' }, 400);
  } catch (e) {
    console.error('manage-agent-integration error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
