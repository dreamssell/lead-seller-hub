import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Bell, Save } from 'lucide-react';

type EventKey = 'created' | 'assigned' | 'status_changed' | 'resolved' | 'daily_reminder_customer' | 'daily_reminder_owner';
type Audience = 'customer' | 'owner';

type Row = {
  event_type: EventKey;
  audience: Audience;
  label: string;
  vars: string;
};

const ROWS: Row[] = [
  { event_type: 'created', audience: 'customer', label: 'Ticket criado → Cliente', vars: '{{number}} {{title}} {{department}} {{priority}}' },
  { event_type: 'created', audience: 'owner', label: 'Ticket crítico criado → Dono / equipe', vars: '{{number}} {{title}} {{department}}' },
  { event_type: 'assigned', audience: 'customer', label: 'Responsável designado → Cliente', vars: '{{number}} {{title}} {{assignee_name}}' },
  { event_type: 'status_changed', audience: 'customer', label: 'Status alterado → Cliente', vars: '{{number}} {{title}} {{status_label}}' },
  { event_type: 'resolved', audience: 'customer', label: 'Resolvido (CSAT) → Cliente', vars: '{{number}} {{title}}' },
  { event_type: 'daily_reminder_customer', audience: 'customer', label: 'Lembrete diário → Cliente aguardando', vars: '{{number}} {{title}}' },
  { event_type: 'daily_reminder_owner', audience: 'owner', label: 'Digest diário → Dono (SLA estourado)', vars: '{{count}} {{list}}' },
];

type Draft = {
  id?: string | null;
  body_template: string;
  extra_recipients: string;
  enabled: boolean;
};

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

  async function load() {
    setLoading(true);
    let q = supabase.from('support_notification_templates' as any).select('*').eq('owner_id', ownerId);
    q = subCompanyId ? q.eq('sub_company_id', subCompanyId) : q.is('sub_company_id', null);
    const { data } = await q;
    const next: Record<string, Draft> = {};
    for (const r of ROWS) {
      const key = `${r.event_type}_${r.audience}`;
      const existing = (data as any[] || []).find(t => t.event_type === r.event_type && t.audience === r.audience);
      next[key] = existing ? {
        id: existing.id,
        body_template: existing.body_template,
        extra_recipients: (existing.extra_recipients || []).join(', '),
        enabled: existing.enabled,
      } : { id: null, body_template: '', extra_recipients: '', enabled: true };
    }
    setDrafts(next);
    setLoading(false);
  }

  useEffect(() => { if (open) void load(); /* eslint-disable-next-line */ }, [open, ownerId, subCompanyId]);

  async function save(row: Row) {
    const key = `${row.event_type}_${row.audience}`;
    const d = drafts[key];
    if (!d) return;
    setSaving(key);
    const payload = {
      owner_id: ownerId,
      sub_company_id: subCompanyId ?? null,
      event_type: row.event_type,
      audience: row.audience,
      channel: 'whatsapp',
      body_template: d.body_template || '',
      extra_recipients: d.extra_recipients.split(',').map(s => s.trim()).filter(Boolean),
      enabled: d.enabled,
    };
    const { error } = await supabase.from('support_notification_templates' as any)
      .upsert(payload, { onConflict: 'owner_id,sub_company_id,event_type,audience' });
    setSaving(null);
    if (error) toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Template salvo' }); void load(); }
  }

  function patch(key: string, p: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...p } }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4"/> Templates de notificação · WhatsApp</DialogTitle>
          <DialogDescription>
            {subCompanyId ? 'Override para esta sub-empresa. Vazio = usa o template da empresa.' :
              'Templates padrão desta empresa. Cada sub-empresa pode sobrescrever depois.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
        ) : (
          <div className="space-y-3">
            {ROWS.map(row => {
              const key = `${row.event_type}_${row.audience}`;
              const d = drafts[key];
              if (!d) return null;
              return (
                <div key={key} className="p-3 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">Variáveis: {row.vars}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Ativo</span>
                      <Switch checked={d.enabled} onCheckedChange={(v) => patch(key, { enabled: v })} />
                    </div>
                  </div>
                  <Textarea rows={3} value={d.body_template} onChange={(e) => patch(key, { body_template: e.target.value })}
                    placeholder="Ex.: Recebemos seu ticket #{{number}}. Assunto: {{title}}"/>
                  {row.audience === 'owner' && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Destinatários extras (telefones separados por vírgula)</label>
                      <Input value={d.extra_recipients} onChange={(e) => patch(key, { extra_recipients: e.target.value })}
                        placeholder="5511999998888, 5521988887777" className="text-xs mt-1" />
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => save(row)} disabled={saving === key} className="gap-1">
                      <Save className="w-3.5 h-3.5"/> {saving === key ? 'Salvando…' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
