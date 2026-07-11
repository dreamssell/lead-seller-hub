// Retorna a URL completa (com token) do webhook Wavoip para ser copiada
// no painel da Wavoip. Somente admins autenticados podem acessar.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SECRET = Deno.env.get('WAVOIP_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error } = await supabase.auth.getClaims(token);
  if (error || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = claims.claims.sub as string;
  const { data: isAdmin } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'admin',
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!SECRET) {
    return new Response(
      JSON.stringify({ configured: false, error: 'WAVOIP_WEBHOOK_SECRET not set' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const webhookUrl = `${SUPABASE_URL}/functions/v1/wavoip-webhook?token=${encodeURIComponent(SECRET)}`;

  return new Response(
    JSON.stringify({ configured: true, webhook_url: webhookUrl, token_preview: `${SECRET.slice(0, 4)}…${SECRET.slice(-4)}` }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
