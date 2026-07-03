// Secure SIP configuration handler.
// - Requires authenticated user
// - Requires platform admin role (public.has_role admin)
// - Encrypts password at rest with AES-GCM using SIP_ENCRYPTION_KEY
// - Records every read/write in sip_config_audit
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ENC_KEY_RAW = Deno.env.get('SIP_ENCRYPTION_KEY') || '';

if (!ENC_KEY_RAW || ENC_KEY_RAW.length < 32) {
  console.error('SIP_ENCRYPTION_KEY missing or too short');
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Formal error contract. Every failure response returned by this function
// MUST go through `fail()` so clients (see src/lib/sipConfig.ts) can rely on
// a stable, machine-readable shape:
//   { error: string, code: string, message: string, status: number }
// `error` mirrors `code` for backward compatibility with older callers that
// still read `json.error` as the code discriminator.
const ERROR_MESSAGES: Record<string, string> = {
  method_not_allowed: 'Método HTTP não suportado. Use POST.',
  missing_auth: 'Cabeçalho Authorization ausente ou mal formatado.',
  unauthenticated: 'Sessão inválida ou expirada.',
  forbidden: 'Apenas o dono da plataforma pode acessar configurações SIP.',
  invalid_json: 'Corpo da requisição não é um JSON válido.',
  missing_action: 'Campo "action" é obrigatório.',
  unknown_action: 'Ação SIP não reconhecida.',
  missing_fields: 'Preencha "server" e "username" antes de salvar.',
  internal: 'Falha interna ao processar credenciais SIP.',
};

function fail(status: number, code: string, message?: string) {
  const msg = message ?? ERROR_MESSAGES[code] ?? 'Erro desconhecido.';
  return json(status, { error: code, code, message: msg, status });
}


async function getAesKey(): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(ENC_KEY_RAW);
  // Derive a stable 32-byte key from the secret via SHA-256
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function encryptPassword(plain: string) {
  if (!plain) return { ciphertext: '', iv: '' };
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { ciphertext: b64encode(ct), iv: b64encode(iv.buffer) };
}

async function decryptPassword(ciphertext: string, iv: string): Promise<string> {
  if (!ciphertext || !iv) return '';
  const key = await getAesKey();
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(iv) },
    key,
    b64decode(ciphertext),
  );
  return new TextDecoder().decode(pt);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'missing_auth' });

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'unauthenticated' });
  const user = userData.user;

  // Admin gate — every operation on SIP configs requires platform admin role.
  const { data: isAdmin, error: roleErr } = await userClient.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  });
  if (roleErr || isAdmin !== true) {
    return json(403, { error: 'forbidden', message: 'Apenas o dono da plataforma pode acessar configurações SIP.' });
  }

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const action = String(body?.action || '');
  const scope = body?.scope || {};
  const ownerId: string | null = scope.owner_id || user.id;
  const subCompanyId: string | null = scope.sub_company_id ?? null;
  const clientCompanyId: string | null = scope.client_company_id ?? null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const ip = req.headers.get('x-forwarded-for') || '';
  const ua = req.headers.get('user-agent') || '';

  async function audit(actionName: string, configId: string | null, changes: unknown) {
    await admin.from('sip_config_audit').insert({
      config_id: configId,
      owner_id: ownerId,
      sub_company_id: subCompanyId,
      client_company_id: clientCompanyId,
      action: actionName,
      changes,
      changed_by: user.id,
      changed_by_email: user.email,
      ip_address: ip,
      user_agent: ua,
    });
  }

  try {
    if (action === 'get') {
      const q = admin.from('sip_configurations').select('*').eq('owner_id', ownerId);
      const { data, error } = subCompanyId
        ? await q.eq('sub_company_id', subCompanyId).maybeSingle()
        : clientCompanyId
          ? await q.eq('client_company_id', clientCompanyId).maybeSingle()
          : await q.is('sub_company_id', null).is('client_company_id', null).maybeSingle();
      if (error) throw error;
      if (!data) return json(200, { config: null });
      const password = await decryptPassword(data.password_ciphertext, data.password_iv);
      await audit('read', data.id, null);
      return json(200, {
        config: {
          id: data.id,
          server: data.server,
          port: data.port,
          ws_uri: data.ws_uri,
          username: data.username,
          password,
          display_name: data.display_name,
          transport: data.transport,
          auto_record: data.auto_record,
        },
      });
    }

    if (action === 'upsert') {
      const cfg = body.config || {};
      if (!cfg.server || !cfg.username) return json(400, { error: 'missing_fields' });
      const { ciphertext, iv } = await encryptPassword(String(cfg.password || ''));
      const payload = {
        owner_id: ownerId,
        sub_company_id: subCompanyId,
        client_company_id: clientCompanyId,
        server: cfg.server,
        port: cfg.port ?? null,
        ws_uri: cfg.ws_uri ?? null,
        username: cfg.username,
        password_ciphertext: ciphertext,
        password_iv: iv,
        display_name: cfg.display_name ?? null,
        transport: cfg.transport ?? 'WSS',
        auto_record: cfg.auto_record ?? true,
        updated_by: user.id,
      };

      // Find existing to distinguish create vs update
      let existingQ = admin.from('sip_configurations').select('id').eq('owner_id', ownerId);
      existingQ = subCompanyId ? existingQ.eq('sub_company_id', subCompanyId) : existingQ.is('sub_company_id', null);
      existingQ = clientCompanyId ? existingQ.eq('client_company_id', clientCompanyId) : existingQ.is('client_company_id', null);
      const { data: existing } = await existingQ.maybeSingle();

      if (existing) {
        const { error } = await admin.from('sip_configurations').update(payload).eq('id', existing.id);
        if (error) throw error;
        await audit('update', existing.id, { fields: Object.keys(payload).filter(k => k !== 'password_ciphertext' && k !== 'password_iv') });
        return json(200, { ok: true, id: existing.id, mode: 'update' });
      } else {
        const { data: inserted, error } = await admin
          .from('sip_configurations')
          .insert({ ...payload, created_by: user.id })
          .select('id')
          .single();
        if (error) throw error;
        await audit('create', inserted.id, { server: cfg.server, username: cfg.username });
        return json(200, { ok: true, id: inserted.id, mode: 'create' });
      }
    }

    if (action === 'delete') {
      const q = admin.from('sip_configurations').delete().eq('owner_id', ownerId);
      const q2 = subCompanyId ? q.eq('sub_company_id', subCompanyId) : q.is('sub_company_id', null);
      const q3 = clientCompanyId ? q2.eq('client_company_id', clientCompanyId) : q2.is('client_company_id', null);
      const { error } = await q3;
      if (error) throw error;
      await audit('delete', null, { scope });
      return json(200, { ok: true });
    }

    if (action === 'audit_list') {
      let q = admin
        .from('sip_config_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(body.limit) || 50);
      if (ownerId) q = q.eq('owner_id', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return json(200, { entries: data });
    }

    return json(400, { error: 'unknown_action' });
  } catch (e: any) {
    console.error('manage-sip-config error', e);
    return json(500, { error: 'internal', message: e?.message ?? String(e) });
  }
});
