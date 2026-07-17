import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Bell, Save, Send, History, AlertCircle, CheckCircle2, RotateCcw, Eye, XCircle, ClipboardList } from 'lucide-react';

/** Client-side mirror of the server `{{var}}` render — used to preview text before firing the test. */
function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return (tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? '').toString());
}

type TestResult = { phone: string; ok: boolean; error?: string | null };

type TestLog = {
  id: string;
  created_at: string;
  event_type: string;
  audience: string;
  template_id: string | null;
  rendered_body: string;
  sample_payload: Record<string, any>;
  recipients: string[];
  per_recipient: TestResult[];
  ok_count: number;
  fail_count: number;
  triggered_by: string | null;
};

type EventKey =
  | 'created' | 'assigned' | 'status_changed' | 'resolved'
  | 'daily_reminder_customer' | 'daily_reminder_owner';
type Audience = 'customer' | 'owner';

type Row = {
  event_type: EventKey;
  audience: Audience;
  label: string;
  allowedVars: string[];
  sample: Record<string, string>;
};

/**
 * Each row declares the full set of variables the server exposes for that
 * event. We use this list twice:
 *   1. Guard the "Ativo" switch: a template can only be enabled if every
 *      `{{var}}` it references is in `allowedVars` (unknown vars would
 *      render as empty strings in production).
 *   2. Seed the sample payload used by the "Enviar teste" flow.
 */
const ROWS: Row[] = [
  { event_type: 'created', audience: 'customer',
    label: 'Ticket criado → Cliente',
    allowedVars: ['number', 'title', 'department', 'priority', 'status', 'status_label'],
    sample: { number: '1042', title: 'Boleto não recebido', department: 'financeiro', priority: 'alta', status: 'novo', status_label: '📥 Novo' } },
  { event_type: 'created', audience: 'owner',
    label: 'Ticket crítico criado → Dono / equipe',
    allowedVars: ['number', 'title', 'department', 'priority'],
    sample: { number: '1042', title: 'Sistema fora do ar', department: 'suporte', priority: 'critica' } },
  { event_type: 'assigned', audience: 'customer',
    label: 'Responsável designado → Cliente',
    allowedVars: ['number', 'title', 'assignee_name'],
    sample: { number: '1042', title: 'Boleto não recebido', assignee_name: 'Adriele' } },
  { event_type: 'status_changed', audience: 'customer',
    label: 'Status alterado → Cliente',
    allowedVars: ['number', 'title', 'status', 'status_label'],
    sample: { number: '1042', title: 'Boleto não recebido', status: 'em_analise', status_label: '🔎 Estamos analisando' } },
  { event_type: 'resolved', audience: 'customer',
    label: 'Resolvido (CSAT) → Cliente',
    allowedVars: ['number', 'title'],
    sample: { number: '1042', title: 'Boleto não recebido' } },
  { event_type: 'daily_reminder_customer', audience: 'customer',
    label: 'Lembrete diário → Cliente aguardando',
    allowedVars: ['number', 'title'],
    sample: { number: '1042', title: 'Boleto não recebido' } },
  { event_type: 'daily_reminder_owner', audience: 'owner',
    label: 'Digest diário → Dono (SLA estourado)',
    allowedVars: ['count', 'list'],
    sample: { count: '3', list: '• #1042 — Boleto não recebido\n• #1043 — Renovação atrasada' } },
];

type Draft = {
  id?: string | null;
  body_template: string;
  extra_recipients: string;
  enabled: boolean;
  current_version: number;
  last_tested_at: string | null;
  original: { body_template: string; extra_recipients: string; enabled: boolean };
};

type Version = { id: string; version: number; body_template: string; extra_recipients: string[]; notes: string | null; created_at: string };

/** Return the `{{var}}` tokens present in a template. */
function extractVars(tpl: string): string[] {
  const set = new Set<string>();
  for (const m of tpl.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) set.add(m[1]);
  return [...set];
}

/**
 * Normalize an operator-typed phone to E.164 (`+55DDNNNNNNNNN`).
 * Rules geared to Brazil (default DDI 55) but tolerant of pre-prefixed inputs:
 *   - strip everything non-digit, drop leading `00` (international dial prefix)
 *   - if it already starts with `55` and length is 12–13 → keep
 *   - if length is 10 (fixed) or 11 (mobile with 9) → prepend `55`
 *   - if it starts with another 1–3 digit country code (11–15 digits) → keep as-is
 * Returns `null` when nothing valid can be produced.
 */
function toE164(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if (d.length >= 11 && d.length <= 15) return `+${d}`;
  return null;
}

/** Parse the operator's textarea into an ordered, deduped list of E.164 phones plus the invalid tokens. */
function parseAndDedupe(raw: string): { valid: string[]; invalid: string[] } {
  const tokens = (raw || '').split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const e164 = toE164(t);
    if (!e164) { invalid.push(t); continue; }
    if (seen.has(e164)) continue;
    seen.add(e164);
    valid.push(e164);
  }
  return { valid, invalid };
}

export function NotificationTemplatesDialog({
  open, onOpenChange, ownerId, subCompanyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  subCompanyId?: string | null;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testPhones, setTestPhones] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult[]>>({});
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<TestLog[]>([]);
  const [auditFilter, setAuditFilter] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    let q = supabase.from('support_notification_templates' as any).select('*').eq('owner_id', ownerId);
    q = subCompanyId ? q.eq('sub_company_id', subCompanyId) : q.is('sub_company_id', null);
    const { data } = await q;
    const next: Record<string, Draft> = {};
    for (const r of ROWS) {
      const key = `${r.event_type}_${r.audience}`;
      const existing = (data as any[] || []).find(t => t.event_type === r.event_type && t.audience === r.audience);
      const body = existing?.body_template || '';
      const recips = (existing?.extra_recipients || []).join(', ');
      const enabled = existing?.enabled ?? true;
      next[key] = {
        id: existing?.id ?? null,
        body_template: body,
        extra_recipients: recips,
        enabled,
        current_version: existing?.current_version || 1,
        last_tested_at: existing?.last_tested_at || null,
        original: { body_template: body, extra_recipients: recips, enabled },
      };
    }
    setDrafts(next);
    setLoading(false);
  }

  useEffect(() => { if (open) void load(); /* eslint-disable-next-line */ }, [open, ownerId, subCompanyId]);

  /** Compute variable-validation state for a row. */
  function validate(row: Row, d: Draft): { unknown: string[]; canEnable: boolean } {
    const used = extractVars(d.body_template || '');
    const unknown = used.filter((v) => !row.allowedVars.includes(v));
    return { unknown, canEnable: unknown.length === 0 && d.body_template.trim().length > 0 };
  }

  async function loadVersions(templateId: string) {
    setVersionsFor(templateId);
    const { data } = await supabase.from('support_notification_template_versions' as any)
      .select('*').eq('template_id', templateId).order('version', { ascending: false });
    setVersions((data as any) || []);
  }

  async function save(row: Row) {
    const key = `${row.event_type}_${row.audience}`;
    const d = drafts[key];
    if (!d) return;
    const v = validate(row, d);
    if (d.enabled && !v.canEnable) {
      toast({
        title: 'Variáveis inválidas',
        description: v.unknown.length > 0
          ? `Removidas ou não suportadas: ${v.unknown.map((x) => `{{${x}}}`).join(', ')}`
          : 'O corpo do template está vazio.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(key);
    const bodyChanged = d.body_template !== d.original.body_template
      || d.extra_recipients !== d.original.extra_recipients;
    const newVersion = bodyChanged ? d.current_version + 1 : d.current_version;

    const payload = {
      owner_id: ownerId,
      sub_company_id: subCompanyId ?? null,
      event_type: row.event_type,
      audience: row.audience,
      channel: 'whatsapp',
      body_template: d.body_template || '',
      extra_recipients: d.extra_recipients.split(',').map(s => s.trim()).filter(Boolean),
      enabled: d.enabled,
      current_version: newVersion,
      last_validated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await supabase.from('support_notification_templates' as any)
      .upsert(payload, { onConflict: 'owner_id,sub_company_id,event_type,audience' })
      .select('id')
      .maybeSingle();

    if (!error && saved && bodyChanged) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('support_notification_template_versions' as any).insert({
        template_id: (saved as any).id,
        version: newVersion,
        body_template: payload.body_template,
        extra_recipients: payload.extra_recipients,
        notes: d.original.body_template ? 'Editado no painel' : 'Versão inicial',
        created_by: user?.id ?? null,
      });
    }

    setSaving(null);
    if (error) toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    else { toast({ title: bodyChanged ? `Template salvo · v${newVersion}` : 'Configuração salva' }); void load(); }
  }

  /**
   * Fire the server-side `test_send` once per recipient. Client-side we already
   * validated the template body against `row.allowedVars`; the server still
   * cross-checks the sample payload so we surface `missing_variables` per phone.
   */
  async function testSend(row: Row) {
    const key = `${row.event_type}_${row.audience}`;
    const d = drafts[key];
    if (!d?.id) return toast({ title: 'Salve o template antes de testar', variant: 'destructive' });

    const { valid: phones, invalid } = parseAndDedupe(testPhones[key] || '');
    if (invalid.length > 0) {
      return toast({
        title: 'Telefones inválidos',
        description: `Não foi possível normalizar para E.164: ${invalid.join(', ')}.`,
        variant: 'destructive',
      });
    }
    if (phones.length === 0) {
      return toast({
        title: 'Informe ao menos um telefone',
        description: 'Números com DDD (BR) ou DDI internacional. Separe múltiplos por vírgula ou nova linha — duplicados são removidos automaticamente.',
        variant: 'destructive',
      });
    }
    const v = validate(row, d);
    if (!v.canEnable) {
      return toast({ title: 'Corrija as variáveis antes de testar', description: v.unknown.length ? `Não suportadas: ${v.unknown.map((x) => `{{${x}}}`).join(', ')}` : 'Template vazio.', variant: 'destructive' });
    }

    setTesting(key);
    setTestResults((prev) => ({ ...prev, [key]: [] }));
    const results: TestResult[] = [];
    for (const phone of phones) {
      const { data, error } = await supabase.functions.invoke('support-notify', {
        body: { event: 'test_send', template_id: d.id, phone, sample: row.sample },
      });
      const res = data as any;
      if (error) results.push({ phone, ok: false, error: error.message });
      else if (res?.ok) results.push({ phone, ok: true });
      else if (res?.error === 'missing_variables') results.push({ phone, ok: false, error: `faltam: ${(res.missing || []).join(', ')}` });
      else results.push({ phone, ok: false, error: res?.error || 'erro desconhecido' });
      setTestResults((prev) => ({ ...prev, [key]: [...results] }));
    }
    setTesting(null);

    // Audit log: one row per batch, readable in the "Auditoria de testes" panel.
    const { data: { user } } = await supabase.auth.getUser();
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    await supabase.from('support_notification_test_logs' as any).insert({
      owner_id: ownerId,
      sub_company_id: subCompanyId ?? null,
      template_id: d.id,
      event_type: row.event_type,
      audience: row.audience,
      channel: 'whatsapp',
      rendered_body: renderTemplate(d.body_template, row.sample),
      sample_payload: row.sample,
      recipients: phones,
      per_recipient: results,
      ok_count: okCount,
      fail_count: failCount,
      triggered_by: user?.id ?? null,
    });

    toast({
      title: okCount === results.length ? `✅ ${okCount} teste(s) enviado(s)` : `${okCount}/${results.length} enviados`,
      description: okCount < results.length ? 'Confira os detalhes por destinatário abaixo.' : undefined,
      variant: okCount === 0 ? 'destructive' : 'default',
    });
    void load();
    if (auditOpen) void loadAuditLogs(auditFilter);
  }

  /** Load the last 50 test-send audit rows for this owner (optionally scoped to one template). */
  async function loadAuditLogs(templateId: string | null) {
    let q = supabase.from('support_notification_test_logs' as any)
      .select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
    if (templateId) q = q.eq('template_id', templateId);
    const { data } = await q;
    setAuditLogs((data as any) || []);
  }

  function openAudit(templateId: string | null) {
    setAuditFilter(templateId);
    setAuditOpen(true);
    void loadAuditLogs(templateId);
  }

  async function restoreVersion(v: Version) {
    if (!versionsFor) return;
    const rowEntry = Object.entries(drafts).find(([, d]) => d.id === versionsFor);
    if (!rowEntry) return;
    const [key] = rowEntry;
    patch(key, {
      body_template: v.body_template,
      extra_recipients: (v.extra_recipients || []).join(', '),
    });
    setVersionsFor(null);
    toast({ title: `Versão v${v.version} carregada`, description: 'Clique em Salvar para publicar como nova versão.' });
  }

  function patch(key: string, p: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...p } }));
  }

  const versionsRow = useMemo(() => {
    if (!versionsFor) return null;
    return ROWS.find((r) => drafts[`${r.event_type}_${r.audience}`]?.id === versionsFor) || null;
  }, [versionsFor, drafts]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4"/> Templates de notificação · WhatsApp</DialogTitle>
            <DialogDescription>
              {subCompanyId ? 'Override para esta sub-empresa. Vazio = usa o template da empresa.' :
                'Templates padrão desta empresa. Cada sub-empresa pode sobrescrever depois.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end -mt-2">
            <Button size="sm" variant="ghost" className="gap-1 h-8" onClick={() => openAudit(null)}>
              <ClipboardList className="w-3.5 h-3.5"/> Auditoria de testes
            </Button>
          </div>

          {loading ? (
            <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
          ) : (
            <div className="space-y-3">
              {ROWS.map(row => {
                const key = `${row.event_type}_${row.audience}`;
                const d = drafts[key];
                if (!d) return null;
                const v = validate(row, d);
                const disabledReason = !v.canEnable && d.enabled;
                return (
                  <div key={key} className="p-3 rounded-xl border border-border bg-card space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{row.label}</p>
                          {d.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">v{d.current_version}</span>}
                          {d.last_tested_at && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3"/> Testado {new Date(d.last_tested_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          Variáveis: {row.allowedVars.map((x) => `{{${x}}}`).join(' ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Ativo</span>
                        <Switch
                          checked={d.enabled}
                          disabled={!v.canEnable && !d.enabled}
                          onCheckedChange={(val) => {
                            if (val && !v.canEnable) {
                              toast({ title: 'Corrija as variáveis antes de habilitar', variant: 'destructive' });
                              return;
                            }
                            patch(key, { enabled: val });
                          }}
                        />
                      </div>
                    </div>

                    <Textarea rows={3} value={d.body_template} onChange={(e) => patch(key, { body_template: e.target.value })}
                      placeholder="Ex.: Recebemos seu ticket #{{number}}. Assunto: {{title}}"/>

                    {v.unknown.length > 0 && (
                      <div className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0"/>
                        <span>
                          Variáveis não suportadas: {v.unknown.map((x) => `{{${x}}}`).join(', ')}.
                          Corrija antes de ativar (elas rendem em branco em produção).
                        </span>
                      </div>
                    )}
                    {disabledReason && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Este template não pode ser habilitado até as variáveis serem válidas.
                      </p>
                    )}

                    {row.audience === 'owner' && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Destinatários extras (telefones separados por vírgula)</label>
                        <Input value={d.extra_recipients} onChange={(e) => patch(key, { extra_recipients: e.target.value })}
                          placeholder="5511999998888, 5521988887777" className="text-xs mt-1" />
                      </div>
                    )}

                    {(() => {
                      const parsed = parseAndDedupe(testPhones[key] || '');
                      const rawPhones = parsed.valid;
                      const invalidPhones = parsed.invalid;
                      const preview = renderTemplate(d.body_template, row.sample);
                      const results = testResults[key] || [];
                      const isPreviewOpen = !!previewOpen[key];
                      return (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-wrap items-start gap-2">
                            <Textarea
                              rows={2}
                              value={testPhones[key] || ''}
                              onChange={(e) => setTestPhones((p) => ({ ...p, [key]: e.target.value }))}
                              placeholder="Testar em múltiplos números — separe por vírgula ou nova linha (ex.: 5511999998888, 5521988887777)"
                              className="text-xs flex-1 min-w-[220px]"
                            />
                            <div className="flex flex-col gap-2">
                              <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => setPreviewOpen((p) => ({ ...p, [key]: !p[key] }))}>
                                <Eye className="w-3.5 h-3.5"/> {isPreviewOpen ? 'Ocultar prévia' : 'Prévia renderizada'}
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => testSend(row)} disabled={testing === key || !d.id}>
                                <Send className="w-3.5 h-3.5"/> {testing === key ? `Enviando (${(testResults[key] || []).length}/${rawPhones.length})…` : `Enviar teste${rawPhones.length > 1 ? ` (${rawPhones.length})` : ''}`}
                              </Button>
                            </div>
                          </div>
                          {(rawPhones.length > 0 || invalidPhones.length > 0) && (
                            <div className="text-[11px] space-y-1">
                              {rawPhones.length > 0 && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{rawPhones.length}</span> destinatário(s) após normalização E.164
                                  {(testPhones[key] || '').split(/[,;\n]/).filter((t) => t.trim()).length > rawPhones.length + invalidPhones.length && ' · duplicados removidos'}:
                                  <span className="ml-1 font-mono">{rawPhones.join(', ')}</span>
                                </p>
                              )}
                              {invalidPhones.length > 0 && (
                                <p className="text-red-500 flex items-start gap-1">
                                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0"/>
                                  Inválidos (não serão enviados): <span className="font-mono">{invalidPhones.join(', ')}</span>
                                </p>
                              )}
                            </div>
                          )}
                          {isPreviewOpen && (
                            <div className="rounded-lg border border-border bg-muted/40 p-2">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Prévia com o payload de exemplo</p>
                              <pre className="text-[11px] whitespace-pre-wrap font-sans">{preview || <span className="italic text-muted-foreground">(vazio)</span>}</pre>
                            </div>
                          )}
                          {results.length > 0 && (
                            <ul className="text-[11px] space-y-1">
                              {results.map((r) => (
                                <li key={r.phone} className="flex items-center gap-2">
                                  {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/> : <XCircle className="w-3.5 h-3.5 text-red-500"/>}
                                  <span className="font-mono">{r.phone}</span>
                                  {!r.ok && <span className="text-red-500">— {r.error}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex items-center gap-2">
                            {d.id && (
                              <Button size="sm" variant="ghost" className="gap-1 h-8" onClick={() => loadVersions(d.id!)}>
                                <History className="w-3.5 h-3.5"/> Versões
                              </Button>
                            )}
                            <Button size="sm" className="gap-1 h-8 ml-auto" onClick={() => save(row)} disabled={saving === key}>
                              <Save className="w-3.5 h-3.5"/> {saving === key ? 'Salvando…' : 'Salvar'}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!versionsFor} onOpenChange={(v) => !v && setVersionsFor(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4"/> Histórico de versões</DialogTitle>
            <DialogDescription>{versionsRow?.label}</DialogDescription>
          </DialogHeader>
          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Sem versões anteriores salvas.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="p-3 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-secondary">v{v.version}</span>
                    <span className="text-[11px] text-muted-foreground">{new Date(v.created_at).toLocaleString('pt-BR')}</span>
                    {v.notes && <span className="text-[11px] text-muted-foreground italic">— {v.notes}</span>}
                    <Button size="sm" variant="outline" className="ml-auto h-7 gap-1" onClick={() => restoreVersion(v)}>
                      <RotateCcw className="w-3 h-3"/> Carregar
                    </Button>
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap font-sans bg-muted/40 p-2 rounded">{v.body_template}</pre>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
