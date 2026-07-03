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

async function invoke(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('manage-sip-config', {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data;
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
