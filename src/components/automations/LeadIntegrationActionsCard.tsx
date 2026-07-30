/**
 * Ações automáticas por plataforma de Leads (Holmes / DealerSpace).
 * Persistido em public.lead_integration_settings e consumido pela
 * Edge Function handle-inbound-webhook no momento em que o Lead chega.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveOwnerId } from '@/lib/chatTenantScope';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Workflow } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { FLOW_STAGES } from '@/lib/attendanceFlow';

type Settings = {
  id?: string;
  enabled: boolean;
  pipeline_id: string | null;
  stage_id: string | null;
  default_status: string;
  create_crm_event: boolean;
  save_contact: boolean;
  create_attendance: boolean;
  attendance_stage: string;
  queue_id: string | null;
};

const DEFAULTS: Settings = {
  enabled: true,
  pipeline_id: null,
  stage_id: null,
  default_status: 'novo',
  create_crm_event: true,
  save_contact: true,
  create_attendance: true,
  attendance_stage: 'auto',
  queue_id: null,
};

const NONE = '__none__';

interface Props {
  provider: string;
  providerName: string;
}

export function LeadIntegrationActionsCard({ provider, providerName }: Props) {
  const { access, user } = useAuth();
  const ownerId = getActiveOwnerId(access?.owner_id, user?.id);
  const subCompanyId = access?.sub_company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ownerId) { setLoading(false); return; }
      setLoading(true);
      const [s, p, q] = await Promise.all([
        (supabase as any).from('lead_integration_settings').select('*').eq('owner_id', ownerId).eq('provider', provider),
        supabase.from('pipelines').select('id,name').eq('owner_id', ownerId).order('created_at'),
        (supabase as any).from('attendance_queues').select('id,name').eq('owner_id', ownerId).eq('is_active', true).order('name'),
      ]);
      if (cancelled) return;
      const rows = (s.data as any[]) || [];
      const row = rows.find(r => r.sub_company_id === subCompanyId) || rows[0] || null;
      setSettings(row ? { ...DEFAULTS, ...row } : DEFAULTS);
      setPipelines((p.data as any[]) || []);
      setQueues((q.data as any[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ownerId, subCompanyId, provider]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!settings.pipeline_id) { setStages([]); return; }
      const { data } = await supabase
        .from('pipeline_stages').select('id,name,position')
        .eq('pipeline_id', settings.pipeline_id).order('position');
      if (!cancelled) setStages((data as any[]) || []);
    })();
    return () => { cancelled = true; };
  }, [settings.pipeline_id]);

  const firstStageName = useMemo(() => stages[0]?.name ?? 'primeira etapa', [stages]);

  const patch = (p: Partial<Settings>) => setSettings(prev => ({ ...prev, ...p }));

  const save = async () => {
    if (!ownerId) { toast({ title: 'Sem empresa ativa', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      owner_id: ownerId,
      sub_company_id: subCompanyId,
      provider,
      enabled: settings.enabled,
      pipeline_id: settings.pipeline_id,
      stage_id: settings.stage_id,
      default_status: settings.default_status,
      create_crm_event: settings.create_crm_event,
      save_contact: settings.save_contact,
      create_attendance: settings.create_attendance,
      attendance_stage: settings.attendance_stage,
      queue_id: settings.queue_id,
    };
    const { data, error } = settings.id
      ? await (supabase as any).from('lead_integration_settings').update(payload).eq('id', settings.id).select('id').maybeSingle()
      : await (supabase as any).from('lead_integration_settings').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (error) { toast({ title: 'Erro ao salvar ações', description: error.message, variant: 'destructive' }); return; }
    if (data?.id) patch({ id: data.id });
    toast({ title: `Ações da ${providerName} salvas`, description: 'Aplicadas a cada novo Lead recebido pelo webhook.' });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando ações…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Ações automáticas do Lead</p>
            <p className="text-[11px] text-muted-foreground">Executadas assim que o webhook da {providerName} recebe um Lead.</p>
          </div>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
      </div>

      <div className="space-y-1.5">
        <Label>Funil ativo que receberá os Leads</Label>
        <Select
          value={settings.pipeline_id ?? NONE}
          onValueChange={(v) => patch({ pipeline_id: v === NONE ? null : v, stage_id: null })}
        >
          <SelectTrigger><SelectValue placeholder="Selecionar funil" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Usar o funil padrão da empresa</SelectItem>
            {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Etapa de entrada</Label>
        <Select
          value={settings.stage_id ?? NONE}
          onValueChange={(v) => patch({ stage_id: v === NONE ? null : v })}
          disabled={!settings.pipeline_id}
        >
          <SelectTrigger><SelectValue placeholder="Etapa inicial" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Etapa inicial do funil ({firstStageName})</SelectItem>
            {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <ToggleRow
          label="Criar registro no CRM 360"
          hint="Grava a entrada do Lead e a origem na linha do tempo."
          checked={settings.create_crm_event}
          onChange={(v) => patch({ create_crm_event: v })}
        />
        <ToggleRow
          label="Salvar contato na Agenda"
          hint="Cria/atualiza o contato do Lead na agenda de clientes."
          checked={settings.save_contact}
          onChange={(v) => patch({ save_contact: v })}
        />
        <ToggleRow
          label="Enviar ao Fluxo de Atendimento"
          hint="Coloca o Lead direto no fluxo escolhido abaixo."
          checked={settings.create_attendance}
          onChange={(v) => patch({ create_attendance: v })}
        />
      </div>

      {settings.create_attendance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Fluxo de destino</Label>
            <Select value={settings.attendance_stage} onValueChange={(v) => patch({ attendance_stage: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLOW_STAGES.filter(s => s.value !== 'closed').map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fila (opcional)</Label>
            <Select value={settings.queue_id ?? NONE} onValueChange={(v) => patch({ queue_id: v === NONE ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Sem fila" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem fila específica</SelectItem>
                {queues.map(q => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Status inicial do Lead</Label>
        <Select value={settings.default_status} onValueChange={(v) => patch({ default_status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="novo">Novo</SelectItem>
            <SelectItem value="em_atendimento">Em atendimento</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Salvar ações
      </Button>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
