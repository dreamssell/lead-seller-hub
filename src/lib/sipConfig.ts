import { supabase } from '@/integrations/supabase/client';

export type SipConfig = {
  server: string;
  port?: string;
  ws_uri?: string;
  username: string;
  password: string;
  display_name?: string;
  transport?: string;
  auto_record?: boolean;
};

export type SipScope = {
  owner_id?: string | null;
  sub_company_id?: string | null;
  client_company_id?: string | null;
};

export class SipError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SipError';
    this.status = status;
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  missing_auth: 'Sessão expirada. Faça login novamente.',
  unauthenticated: 'Sessão expirada. Faça login novamente.',
  forbidden: 'Apenas o dono da plataforma pode acessar as configurações SIP.',
  invalid_json: 'Requisição inválida. Recarregue a página e tente novamente.',
  missing_fields: 'Preencha servidor e usuário antes de salvar.',
  unknown_action: 'Ação SIP não reconhecida pelo servidor.',
  internal: 'Falha interna ao processar credenciais SIP. Verifique a chave de criptografia (SIP_ENCRYPTION_KEY).',
};

function describe(status: number, code: string, fallback?: string) {
  if (MESSAGES[code]) return MESSAGES[code];
  if (status === 401) return MESSAGES.unauthenticated;
  if (status === 403) return MESSAGES.forbidden;
  if (status >= 500) return MESSAGES.internal;
  return fallback || 'Erro desconhecido ao chamar manage-sip-config.';
}

async function invoke(action: string, payload: Record<string, unknown> = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new SipError(401, 'missing_auth', MESSAGES.missing_auth);

  const url = `https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1/manage-sip-config`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (e: any) {
    throw new SipError(0, 'network', `Falha de rede: ${e?.message || e}`);
  }

  let json: any = null;
  try { json = await res.json(); } catch {}

  if (!res.ok || json?.error) {
    const code = String(json?.error || `http_${res.status}`);
    throw new SipError(res.status, code, describe(res.status, code, json?.message));
  }
  return json;
}

export async function fetchSipConfig(scope: SipScope = {}): Promise<SipConfig | null> {
  const data = await invoke('get', { scope });
  return data?.config ?? null;
}

export async function saveSipConfig(config: SipConfig, scope: SipScope = {}) {
  return invoke('upsert', { scope, config });
}

export async function deleteSipConfig(scope: SipScope = {}) {
  return invoke('delete', { scope });
}

export async function listSipAudit(scope: SipScope = {}, limit = 50) {
  const data = await invoke('audit_list', { scope, limit });
  return (data?.entries ?? []) as Array<{
    id: string;
    action: string;
    changed_by: string | null;
    changed_by_email: string | null;
    created_at: string;
    changes: any;
  }>;
}
