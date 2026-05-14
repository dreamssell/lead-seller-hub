import { supabase } from '@/integrations/supabase/client';

export type AuditAction = 'create' | 'update' | 'delete';

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /senha/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /access[_-]?key/i,
  /private[_-]?key/i,
  /credential/i,
  /cvv/i,
  /card[_-]?number/i,
];

const MASK = '••••••••';

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(re => re.test(key));
}

export function maskSensitive(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value)) {
      if (isSensitiveKey(k)) {
        out[k] = MASK;
      } else if (k === 'from' || k === 'to') {
        // diff entry — recurse on the value (could itself be primitive or object)
        out[k] = maskSensitive(value[k]);
      } else {
        out[k] = maskSensitive(value[k]);
      }
    }
    return out;
  }
  return value;
}

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
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diff[k] = isSensitiveKey(k)
          ? { from: MASK, to: MASK }
          : { from: maskSensitive(a), to: maskSensitive(b) };
      }
    });
    changes = diff;
  } else if (params.action === 'create') {
    changes = maskSensitive(params.after ?? null);
  } else if (params.action === 'delete') {
    changes = maskSensitive(params.before ?? null);
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
