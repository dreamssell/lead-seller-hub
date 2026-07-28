// Secure SIP configuration handler.
// - Requires authenticated user
// - Requires platform admin role (public.has_role admin)
// - Encrypts password at rest with AES-GCM using SIP_ENCRYPTION_KEY
// - Records every read/write in sip_config_audit
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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
  forbidden: 'Apenas administradores da Empresa/Sub-empresa podem alterar configurações SIP.',
  invalid_json: 'Corpo da requisição não é um JSON válido.',
  missing_action: 'Campo "action" é obrigatório.',
  unknown_action: 'Ação SIP não reconhecida.',
  missing_fields: 'Preencha "server" e "username" antes de salvar.',
  missing_webrtc_secret: 'Informe a assinatura/secret do Linkus SDK para registrar o WebRTC Yeastar no navegador.',
  pbx_auth_failed: 'Yeastar recusou a autenticação Linkus SDK. Verifique o usuário Linkus e a assinatura/secret WebRTC.',
  pbx_api_failed: 'Yeastar respondeu com erro ao consultar as credenciais WebRTC.',
  pbx_network_failed: 'Não foi possível consultar o PBX Yeastar pelo backend.',
  internal: 'Falha interna ao processar credenciais SIP.',
};

function fail(status: number, code: string, message?: string) {
  const msg = message ?? ERROR_MESSAGES[code] ?? 'Erro desconhecido.';
  return json(status, { error: code, code, message: msg, status });
}

function hasOwn(obj: unknown, key: string) {
  return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
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

function normalizeHost(input: string) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.host.replace(/\/$/, '');
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/.*$/, '').replace(/\/$/, '');
  }
}

function pbxOrigin(server: string) {
  const host = normalizeHost(server);
  if (!host) return '';
  return `https://${host}`;
}

async function fetchYeastarRegisterInfo(server: string, username: string, secret: string) {
  const origin = pbxOrigin(server);
  if (!origin || !username || !secret) throw new Error('missing_webrtc_secret');

  let token = '';
  try {
    const loginRes = await fetch(`${origin}/api/v1.0/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: secret }),
    });
    const loginJson = await loginRes.json().catch(() => null) as any;
    if (!loginRes.ok) throw new Error(`http_${loginRes.status}`);
    if (Number(loginJson?.errcode ?? 0) !== 0 || !loginJson?.access_token) {
      throw new Error(String(loginJson?.errmsg || loginJson?.errcode || 'pbx_auth_failed'));
    }
    token = String(loginJson.access_token);
  } catch (e: any) {
    if (e?.message === 'missing_webrtc_secret') throw e;
    throw new Error(`pbx_auth_failed:${e?.message || e}`);
  }

  try {
    const infoRes = await fetch(`${origin}/api/v1.0/extension/getregisterinfo`, {
      method: 'GET',
      headers: { Authorization: token },
    });
    const infoJson = await infoRes.json().catch(() => null) as any;
    if (!infoRes.ok) throw new Error(`http_${infoRes.status}`);
    const data = infoJson?.data ?? infoJson;
    const registername = String(data?.registername || '').trim();
    const registerpassword = String(data?.registerpassword || '').trim();
    const realm = String(data?.realm || 'YSAsterisk').trim() || 'YSAsterisk';
    if (!registername || !registerpassword) {
      throw new Error(String(infoJson?.errmsg || infoJson?.errcode || 'missing_register_info'));
    }
    return { registername, registerpassword, realm };
  } catch (e: any) {
    throw new Error(`pbx_api_failed:${e?.message || e}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'missing_auth');

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return fail(401, 'unauthenticated');
  const user = userData.user;

  // Admin gate — write/delete/audit require platform admin.
  // Reads (action=get) are allowed for any authenticated user of the tenant,
  // so agents/coordinators can register the shared Wavoip trunk from CallsPage.
  const { data: isAdmin } = await userClient.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  });

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'invalid_json'); }
  const action = String(body?.action || '');
  if (!action) return fail(400, 'missing_action');

  const scope = body?.scope || {};
  // Non-admins can only fetch their OWN tenant SIP — never accept a caller-supplied owner_id.
  // Admins may pass an explicit owner_id when configuring a client tenant; when omitted,
  // resolve the same canonical tenant used by the app instead of falling back blindly to user.id.
  const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE);
  let effectiveOwnerId: string | null = null;
  let effectiveSubCompanyId: string | null = null;
  const { data: accessRows } = await admin0
    .from('user_account_access')
    .select('owner_id, sub_company_id, is_account_admin, is_owner, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  const accessList = Array.isArray(accessRows) ? accessRows : [];
  const acc = accessList.find((item: any) => item?.owner_id && item.owner_id !== user.id) || accessList[0] || null;
  const { data: cc } = await admin0
    .from('client_companies')
    .select('id, owner_id, auth_user_id, sub_company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const canManageTenantSip = Boolean(
    isAdmin === true
    || acc?.is_account_admin === true
    || acc?.is_owner === true
    || cc?.auth_user_id === user.id
  );
  if (action !== 'get' && action !== 'webrtc_register_info' && !canManageTenantSip) return fail(403, 'forbidden');

  if (isAdmin === true) {
    effectiveOwnerId = scope.owner_id || acc?.owner_id || (cc ? (cc.auth_user_id === user.id ? user.id : (cc.owner_id || user.id)) : null) || user.id;
    effectiveSubCompanyId = hasOwn(scope, 'sub_company_id') ? (scope.sub_company_id ?? null) : (acc?.sub_company_id ?? cc?.sub_company_id ?? null);
  } else {
    if (acc?.owner_id) effectiveOwnerId = acc.owner_id;
    if (acc?.sub_company_id) effectiveSubCompanyId = acc.sub_company_id;
    if (!effectiveOwnerId && cc) {
      effectiveOwnerId = cc.auth_user_id === user.id ? user.id : (cc.owner_id || user.id);
      effectiveSubCompanyId = cc.sub_company_id ?? null;
    }
    if (!effectiveOwnerId) effectiveOwnerId = user.id;
  }
  const ownerId: string | null = effectiveOwnerId;
  const subCompanyId: string | null = effectiveSubCompanyId;
  const clientCompanyId: string | null = isAdmin === true && hasOwn(scope, 'client_company_id') ? (scope.client_company_id ?? null) : null;

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
      let data: any = null;
      let error: any = null;
      if (subCompanyId) {
        const exact = await q.eq('sub_company_id', subCompanyId).maybeSingle();
        data = exact.data;
        error = exact.error;
        if (!error && !data) {
          const inherited = await admin
            .from('sip_configurations')
            .select('*')
            .eq('owner_id', ownerId)
            .is('sub_company_id', null)
            .is('client_company_id', null)
            .maybeSingle();
          data = inherited.data;
          error = inherited.error;
        }
      } else if (clientCompanyId) {
        const exact = await q.eq('client_company_id', clientCompanyId).maybeSingle();
        data = exact.data;
        error = exact.error;
      } else {
        const root = await q.is('sub_company_id', null).is('client_company_id', null).maybeSingle();
        data = root.data;
        error = root.error;
      }
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
          auth_username: data.auth_username ?? null,
          password,
          webrtc_username: data.webrtc_username ?? null,
          webrtc_secret_configured: Boolean(data.webrtc_secret_ciphertext && data.webrtc_secret_iv),
          display_name: data.display_name,
          transport: data.transport,
          auto_record: data.auto_record,
        },
      });
    }

    if (action === 'webrtc_register_info') {
      const cfg = body.config || {};
      let data: any = null;
      if (!cfg.server || !cfg.webrtc_username || !cfg.webrtc_secret) {
        let q = admin.from('sip_configurations').select('*').eq('owner_id', ownerId);
        q = subCompanyId ? q.eq('sub_company_id', subCompanyId) : q.is('sub_company_id', null);
        q = clientCompanyId ? q.eq('client_company_id', clientCompanyId) : q.is('client_company_id', null);
        const db = await q.maybeSingle();
        if (db.error) throw db.error;
        data = db.data;
        if (!data && subCompanyId) {
          const inherited = await admin
            .from('sip_configurations')
            .select('*')
            .eq('owner_id', ownerId)
            .is('sub_company_id', null)
            .is('client_company_id', null)
            .maybeSingle();
          if (inherited.error) throw inherited.error;
          data = inherited.data;
        }
      }
      const server = String(cfg.server || data?.server || '');
      const webrtcUsername = String(cfg.webrtc_username || data?.webrtc_username || data?.username || '').trim();
      let webrtcSecret = String(cfg.webrtc_secret || '').trim();
      if (!webrtcSecret && data?.webrtc_secret_ciphertext && data?.webrtc_secret_iv) {
        webrtcSecret = await decryptPassword(data.webrtc_secret_ciphertext, data.webrtc_secret_iv);
      }
      if (!server || !webrtcUsername || !webrtcSecret) return fail(400, 'missing_webrtc_secret');
      try {
        const webrtc = await fetchYeastarRegisterInfo(server, webrtcUsername, webrtcSecret);
        await audit('webrtc_register_info', data?.id ?? null, { server: normalizeHost(server), webrtc_username: webrtcUsername });
        return json(200, { webrtc });
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.startsWith('pbx_auth_failed')) return fail(502, 'pbx_auth_failed', ERROR_MESSAGES.pbx_auth_failed);
        if (msg.startsWith('pbx_api_failed')) return fail(502, 'pbx_api_failed', ERROR_MESSAGES.pbx_api_failed);
        return fail(502, 'pbx_network_failed', ERROR_MESSAGES.pbx_network_failed);
      }
    }

    if (action === 'upsert') {
      const cfg = body.config || {};
      if (!cfg.server || !cfg.username) return fail(400, 'missing_fields');
      const { ciphertext, iv } = await encryptPassword(String(cfg.password || ''));
      let existingQ = admin.from('sip_configurations').select('id, webrtc_secret_ciphertext, webrtc_secret_iv').eq('owner_id', ownerId);
      existingQ = subCompanyId ? existingQ.eq('sub_company_id', subCompanyId) : existingQ.is('sub_company_id', null);
      existingQ = clientCompanyId ? existingQ.eq('client_company_id', clientCompanyId) : existingQ.is('client_company_id', null);
      const { data: existing } = await existingQ.maybeSingle();
      const hasWebrtcSecret = typeof cfg.webrtc_secret === 'string' && cfg.webrtc_secret.trim().length > 0;
      const encryptedWebrtc = hasWebrtcSecret ? await encryptPassword(String(cfg.webrtc_secret)) : null;
      const payload = {
        owner_id: ownerId,
        sub_company_id: subCompanyId,
        client_company_id: clientCompanyId,
        server: cfg.server,
        port: cfg.port ?? null,
        ws_uri: cfg.ws_uri ?? null,
        username: cfg.username,
        auth_username: cfg.auth_username ?? null,
        password_ciphertext: ciphertext,
        password_iv: iv,
        webrtc_username: cfg.webrtc_username ?? null,
        webrtc_secret_ciphertext: encryptedWebrtc?.ciphertext ?? existing?.webrtc_secret_ciphertext ?? null,
        webrtc_secret_iv: encryptedWebrtc?.iv ?? existing?.webrtc_secret_iv ?? null,
        display_name: cfg.display_name ?? null,
        transport: cfg.transport ?? 'WSS',
        auto_record: cfg.auto_record ?? true,
        updated_by: user.id,
      };

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
        await audit('create', inserted.id, { server: cfg.server, username: cfg.username, auth_username: cfg.auth_username ?? null });
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
      // Admins may request cross-tenant history via { all: true }; agents are
      // always scoped to their own tenant.
      const wantAll = isAdmin === true && body?.all === true;
      if (!wantAll && ownerId) q = q.eq('owner_id', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return json(200, { entries: data });
    }

    return fail(400, 'unknown_action');
  } catch (e: any) {
    console.error('manage-sip-config error', e);
    return fail(500, 'internal', e?.message ?? String(e));
  }

});
