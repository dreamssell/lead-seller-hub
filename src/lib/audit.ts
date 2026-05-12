import { supabase } from '@/integrations/supabase/client';

export type AuditAction = 'create' | 'update' | 'delete';

export async function logAudit(params: {
  table: string;
  recordId?: string | null;
  action: AuditAction;
  label?: string | null;
  before?: any;
  after?: any;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  let changes: any = null;
  if (params.action === 'update' && params.before && params.after) {
    const diff: Record<string, { from: any; to: any }> = {};
    const keys = new Set([...Object.keys(params.before), ...Object.keys(params.after)]);
    keys.forEach(k => {
      if (['updated_at', 'created_at'].includes(k)) return;
      const a = params.before[k];
      const b = params.after[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = { from: a, to: b };
    });
    changes = diff;
  } else if (params.action === 'create') {
    changes = params.after ?? null;
  } else if (params.action === 'delete') {
    changes = params.before ?? null;
  }

  await (supabase as any).from('audit_logs').insert({
    table_name: params.table,
    record_id: params.recordId ?? null,
    action: params.action,
    record_label: params.label ?? null,
    changes,
    changed_by: user.id,
  });
}
