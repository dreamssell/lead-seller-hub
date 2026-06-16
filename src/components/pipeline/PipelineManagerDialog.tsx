import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Pencil, Check, X, Link2, Lock, History } from 'lucide-react';
import { toast } from 'sonner';

type Pipeline = { id: string; name: string; is_default: boolean; sub_company_id: string | null };
type Stage = { id: string; pipeline_id: string; name: string; position: number; color: string | null };
type Routing = { id: string; sub_company_id: string | null; channel: string; pipeline_id: string | null; stage_id: string | null; enabled: boolean };
type AuditRow = {
  id: string; created_at: string; entity: string; action: string; label: string | null;
  actor_email: string | null; before: any; after: any; pipeline_id: string | null; stage_id: string | null;
};

const COLORS = [
  { v: 'bg-muted-foreground', l: 'Cinza' },
  { v: 'bg-primary', l: 'Azul' },
  { v: 'bg-warning', l: 'Amarelo' },
  { v: 'bg-success', l: 'Verde' },
  { v: 'bg-destructive', l: 'Vermelho' },
  { v: 'bg-accent', l: 'Accent' },
];

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  telegram: 'Telegram', widget: 'Widget', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube',
};

const ACTION_LABEL: Record<string, string> = {
  create: 'Criou', update: 'Editou', delete: 'Excluiu', reorder: 'Reordenou', link_channel: 'Vinculou canal',
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  subScope: string | null | undefined;
  channel: string;
  initialPipelineId?: string;
  onChanged: () => void;
}

export function PipelineManagerDialog({ open, onOpenChange, ownerId, subScope, channel, initialPipelineId, onChanged }: Props) {
  const scope = subScope === undefined ? null : subScope;

  const [loading, setLoading] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [routings, setRoutings] = useState<Routing[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newStageName, setNewStageName] = useState('');
  const [editingPipeline, setEditingPipeline] = useState(false);
  const [pipelineDraft, setPipelineDraft] = useState('');
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [stageDraft, setStageDraft] = useState('');
  const [savingReorder, setSavingReorder] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Permission check
  useEffect(() => {
    if (!open || !ownerId) return;
    (supabase.rpc as any)('can_user_manage_pipelines', { p_owner_id: ownerId, p_sub_company_id: scope })
      .then(({ data }: { data: boolean | null }) => setCanManage(!!data));
  }, [open, ownerId, scope]);

  const logAuditEntry = useCallback(async (params: {
    entity: 'pipeline' | 'stage';
    action: 'create' | 'update' | 'delete' | 'reorder' | 'link_channel';
    pipeline_id?: string | null;
    stage_id?: string | null;
    label?: string | null;
    before?: any; after?: any;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from('pipeline_audit_logs').insert({
      owner_id: ownerId,
      sub_company_id: scope,
      pipeline_id: params.pipeline_id ?? null,
      stage_id: params.stage_id ?? null,
      entity: params.entity,
      action: params.action,
      label: params.label ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
    });
  }, [ownerId, scope]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [p, r] = await Promise.all([
      supabase.from('pipelines').select('id,name,is_default,sub_company_id').eq('owner_id', ownerId).order('created_at'),
      supabase.from('channel_routing').select('id,sub_company_id,channel,pipeline_id,stage_id,enabled').eq('owner_id', ownerId),
    ]);
    const pl = ((p.data as Pipeline[]) || []).filter(x => (x.sub_company_id ?? null) === scope);
    setPipelines(pl);
    setRoutings((r.data as Routing[]) || []);
    if (pl.length) {
      const { data: st } = await supabase.from('pipeline_stages')
        .select('id,pipeline_id,name,position,color')
        .in('pipeline_id', pl.map(x => x.id))
        .order('position');
      setStages((st as Stage[]) || []);
      const focus = initialPipelineId && pl.find(x => x.id === initialPipelineId)
        ? initialPipelineId
        : (pl.find(x => x.is_default) || pl[0]).id;
      setSelectedPipeline(prev => prev && pl.find(x => x.id === prev) ? prev : focus);
    } else {
      setStages([]);
      setSelectedPipeline('');
    }
    setLoading(false);
  }, [ownerId, scope, initialPipelineId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    const q = supabase.from('pipeline_audit_logs').select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (scope === null) q.is('sub_company_id', null); else q.eq('sub_company_id', scope as any);
    const { data } = await q;
    setAudit((data as AuditRow[]) || []);
    setAuditLoading(false);
  }, [ownerId, scope]);

  useEffect(() => { if (auditOpen) loadAudit(); }, [auditOpen, loadAudit]);

  const current = pipelines.find(p => p.id === selectedPipeline) || null;
  const currentStages = useMemo(
    () => stages.filter(s => s.pipeline_id === selectedPipeline).sort((a, b) => a.position - b.position),
    [stages, selectedPipeline]
  );

  const refresh = async () => { await load(); onChanged(); };

  const guard = () => {
    if (!canManage) { toast.error('Você não tem permissão para gerenciar funis neste escopo.'); return false; }
    return true;
  };

  const createPipeline = async () => {
    if (!guard()) return;
    const name = newPipelineName.trim();
    if (!name) return toast.error('Informe um nome para o funil.');
    if (pipelines.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return toast.error('Já existe um funil com esse nome neste escopo.');
    }
    const { data, error } = await supabase.from('pipelines').insert({
      owner_id: ownerId, sub_company_id: scope, name, is_default: pipelines.length === 0,
    }).select().single();
    if (error) return toast.error(error.message);
    const defaults = [
      { pipeline_id: data.id, name: 'Novo Lead', position: 0, color: 'bg-muted-foreground' },
      { pipeline_id: data.id, name: 'Qualificação', position: 1, color: 'bg-primary' },
      { pipeline_id: data.id, name: 'Proposta', position: 2, color: 'bg-warning' },
      { pipeline_id: data.id, name: 'Fechamento', position: 3, color: 'bg-success' },
    ];
    await supabase.from('pipeline_stages').insert(defaults);
    await logAuditEntry({ entity: 'pipeline', action: 'create', pipeline_id: data.id, label: name, after: { name, stages: defaults.map(d => d.name) } });
    setNewPipelineName('');
    setSelectedPipeline(data.id);
    toast.success('Funil criado');
    refresh();
  };

  const renamePipeline = async () => {
    if (!guard() || !current) return;
    const name = pipelineDraft.trim();
    if (!name) return toast.error('Nome obrigatório.');
    if (pipelines.some(p => p.id !== current.id && p.name.toLowerCase() === name.toLowerCase())) {
      return toast.error('Já existe outro funil com esse nome.');
    }
    const before = { name: current.name };
    const { error } = await supabase.from('pipelines').update({ name }).eq('id', current.id);
    if (error) return toast.error(error.message);
    await logAuditEntry({ entity: 'pipeline', action: 'update', pipeline_id: current.id, label: name, before, after: { name } });
    setEditingPipeline(false);
    refresh();
  };

  const setDefault = async () => {
    if (!guard() || !current) return;
    await supabase.from('pipelines').update({ is_default: false }).eq('owner_id', ownerId).eq('sub_company_id', scope as any);
    const { error } = await supabase.from('pipelines').update({ is_default: true }).eq('id', current.id);
    if (error) return toast.error(error.message);
    await logAuditEntry({ entity: 'pipeline', action: 'update', pipeline_id: current.id, label: current.name, after: { is_default: true } });
    toast.success('Definido como padrão');
    refresh();
  };

  const deletePipeline = async () => {
    if (!guard() || !current) return;
    if (!confirm(`Excluir funil "${current.name}" e todas as suas etapas?`)) return;
    const before = { name: current.name, stages: currentStages.map(s => s.name) };
    const { error } = await supabase.from('pipelines').delete().eq('id', current.id);
    if (error) return toast.error(error.message);
    await logAuditEntry({ entity: 'pipeline', action: 'delete', pipeline_id: current.id, label: current.name, before });
    toast.success('Funil excluído');
    setSelectedPipeline('');
    refresh();
  };

  const addStage = async () => {
    if (!guard() || !current) return;
    const name = newStageName.trim();
    if (!name) return toast.error('Informe um nome para a etapa.');
    if (currentStages.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      return toast.error('Já existe uma etapa com esse nome.');
    }
    const pos = currentStages.length;
    const { data, error } = await supabase.from('pipeline_stages').insert({
      pipeline_id: current.id, name, position: pos, color: 'bg-primary',
    }).select().single();
    if (error) return toast.error(error.message);
    await logAuditEntry({ entity: 'stage', action: 'create', pipeline_id: current.id, stage_id: data.id, label: name, after: { name, position: pos } });
    setNewStageName('');
    refresh();
  };

  const renameStage = async (id: string) => {
    if (!guard()) return;
    const name = stageDraft.trim();
    if (!name) return toast.error('Nome da etapa não pode ficar vazio.');
    if (currentStages.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      return toast.error('Já existe uma etapa com esse nome.');
    }
    const before = currentStages.find(s => s.id === id);
    const { error } = await supabase.from('pipeline_stages').update({ name }).eq('id', id);
    if (error) return toast.error(error.message);
    await logAuditEntry({ entity: 'stage', action: 'update', pipeline_id: current?.id, stage_id: id, label: name, before: { name: before?.name }, after: { name } });
    setEditingStage(null);
    refresh();
  };

  const changeStageColor = async (id: string, color: string) => {
    if (!guard()) return;
    const before = currentStages.find(s => s.id === id);
    await supabase.from('pipeline_stages').update({ color }).eq('id', id);
    await logAuditEntry({ entity: 'stage', action: 'update', pipeline_id: current?.id, stage_id: id, label: before?.name ?? null, before: { color: before?.color }, after: { color } });
    refresh();
  };

  /**
   * Robust reorder with autosave: swaps two adjacent positions atomically by
   * first parking the moved stage at a negative offset, then renumbering ALL
   * stages in the pipeline 0..n to guarantee no duplicate or sparse positions.
   */
  const moveStage = async (id: string, dir: -1 | 1) => {
    if (!guard()) return;
    const idx = currentStages.findIndex(s => s.id === id);
    const swap = currentStages[idx + dir];
    if (!swap || !current) return;

    setSavingReorder(true);
    const reordered = [...currentStages];
    [reordered[idx], reordered[idx + dir]] = [reordered[idx + dir], reordered[idx]];

    // Optimistic UI
    setStages(prev => prev.map(s => {
      const found = reordered.find(r => r.id === s.id);
      if (!found) return s;
      return { ...s, position: reordered.indexOf(found) };
    }));

    try {
      // Pre-save validations: no empty names, no duplicate ids, no duplicate target positions
      const empties = reordered.filter(s => !s.name?.trim());
      if (empties.length) {
        toast.error('Há etapas sem nome. Corrija antes de reordenar.');
        await load();
        return;
      }
      const idSet = new Set(reordered.map(s => s.id));
      if (idSet.size !== reordered.length) {
        toast.error('Conflito: stage_id duplicado detectado. Reordenação cancelada.');
        await load();
        return;
      }
      const targetPositions = reordered.map((_, i) => i);
      if (new Set(targetPositions).size !== targetPositions.length) {
        toast.error('Conflito de ordem: posições duplicadas. Reordenação cancelada.');
        await load();
        return;
      }
      // Confirm DB still matches the current ordering we based the swap on
      const { data: fresh } = await supabase.from('pipeline_stages')
        .select('id,position').eq('pipeline_id', current.id).order('position');
      const freshIds = (fresh || []).map((s: any) => s.id);
      const expected = currentStages.map(s => s.id);
      if (freshIds.length !== expected.length || freshIds.some((id, i) => id !== expected[i])) {
        toast.error('A ordem foi alterada por outro usuário. Recarregando…');
        await load();
        return;
      }

      // Park all involved positions in negative space to avoid uniqueness/race issues
      await Promise.all(reordered.map((s, i) =>
        supabase.from('pipeline_stages').update({ position: -1000 - i }).eq('id', s.id)
      ));
      // Final renumber 0..n
      await Promise.all(reordered.map((s, i) =>
        supabase.from('pipeline_stages').update({ position: i }).eq('id', s.id)
      ));
      await logAuditEntry({
        entity: 'stage', action: 'reorder', pipeline_id: current.id,
        label: current.name,
        before: { order: currentStages.map(s => s.name) },
        after: { order: reordered.map(s => s.name) },
      });
      refresh();
    } catch (e: any) {
      toast.error('Falha ao reordenar. Recarregando ordem original.');
      await load();
    } finally {
      setSavingReorder(false);
    }
  };

  const deleteStage = async (id: string) => {
    if (!guard()) return;
    if (!confirm('Excluir esta etapa? Leads vinculados ficarão sem etapa.')) return;
    const before = currentStages.find(s => s.id === id);
    await supabase.from('pipeline_stages').delete().eq('id', id);
    await logAuditEntry({ entity: 'stage', action: 'delete', pipeline_id: current?.id, stage_id: id, label: before?.name ?? null, before: { name: before?.name, position: before?.position } });
    // After deletion, compact positions 0..n
    const remaining = currentStages.filter(s => s.id !== id);
    await Promise.all(remaining.map((s, i) =>
      s.position !== i ? supabase.from('pipeline_stages').update({ position: i }).eq('id', s.id) : Promise.resolve()
    ));
    refresh();
  };

  const channelRouting = channel !== 'all'
    ? routings.find(r => r.channel === channel && (r.sub_company_id ?? null) === scope)
    : null;

  const linkChannel = async () => {
    if (!guard() || !current || channel === 'all') return;
    if (channelRouting) {
      await supabase.from('channel_routing').update({ pipeline_id: current.id, stage_id: null, enabled: true }).eq('id', channelRouting.id);
    } else {
      await supabase.from('channel_routing').insert({
        owner_id: ownerId, sub_company_id: scope, channel,
        chat_provider: 'uaz', voice_provider: channel === 'whatsapp' ? 'wavoip' : null,
        pipeline_id: current.id, enabled: true,
      });
    }
    await logAuditEntry({ entity: 'pipeline', action: 'link_channel', pipeline_id: current.id, label: current.name, after: { channel } });
    toast.success(`Canal ${CHANNEL_LABEL[channel] || channel} vinculado a "${current.name}"`);
    refresh();
  };

  const readOnly = !canManage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Gerenciar funis e etapas
            {readOnly && <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Somente leitura</Badge>}
          </DialogTitle>
          <DialogDescription>
            Escopo: <b>{scope ? 'Sub-empresa selecionada' : 'Conta principal (global)'}</b>
            {channel !== 'all' && <> · Canal foco: <b>{CHANNEL_LABEL[channel] || channel}</b></>}
          </DialogDescription>
        </DialogHeader>

        {readOnly && !loading && (
          <div className="text-xs rounded-md border border-dashed px-3 py-2 text-muted-foreground flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" /> Você não tem permissão para criar, editar ou excluir funis neste escopo. Solicite ao administrador a permissão <b>can_manage_pipelines</b>.
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-end">
              <Button size="sm" variant="ghost" onClick={() => setAuditOpen(true)}>
                <History className="w-4 h-4 mr-1" /> Ver histórico de alterações
              </Button>
            </div>

            {/* Pipelines list + create */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Funis deste escopo</Label>
              {pipelines.length === 0 && <p className="text-sm text-muted-foreground">Nenhum funil ainda. Crie o primeiro abaixo.</p>}
              <div className="flex flex-wrap gap-2">
                {pipelines.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPipeline(p.id); setEditingPipeline(false); }}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      selectedPipeline === p.id ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent'
                    }`}
                  >
                    {p.name}{p.is_default && <span className="ml-1 opacity-70">★</span>}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Nome do novo funil"
                  value={newPipelineName}
                  onChange={e => setNewPipelineName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createPipeline()}
                  disabled={readOnly}
                />
                <Button onClick={createPipeline} disabled={readOnly}><Plus className="w-4 h-4 mr-1" /> Criar funil</Button>
              </div>
            </div>

            {/* Pipeline editor */}
            {current && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {editingPipeline ? (
                    <>
                      <Input value={pipelineDraft} onChange={e => setPipelineDraft(e.target.value)} className="max-w-sm" />
                      <Button size="sm" onClick={renamePipeline}><Check className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPipeline(false)}><X className="w-4 h-4" /></Button>
                    </>
                  ) : (
                    <>
                      <h3 className="font-semibold">{current.name}</h3>
                      {current.is_default && <Badge variant="secondary">Padrão</Badge>}
                      <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => { setEditingPipeline(true); setPipelineDraft(current.name); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {!current.is_default && (
                      <Button size="sm" variant="outline" disabled={readOnly} onClick={setDefault}>Definir como padrão</Button>
                    )}
                    {channel !== 'all' && (
                      <Button size="sm" variant="outline" disabled={readOnly} onClick={linkChannel}>
                        <Link2 className="w-3.5 h-3.5 mr-1" /> Vincular canal {CHANNEL_LABEL[channel] || channel}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={readOnly} onClick={deletePipeline}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {channelRouting?.pipeline_id === current.id && (
                  <div className="text-xs text-success flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> Este funil já recebe leads do canal {CHANNEL_LABEL[channel] || channel}.
                  </div>
                )}

                {/* Stages */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Etapas</Label>
                    {savingReorder && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Salvando ordem…</span>}
                  </div>
                  {currentStages.length === 0 && <p className="text-sm text-muted-foreground">Sem etapas. Adicione abaixo.</p>}
                  {currentStages.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
                      <span className="text-[10px] text-muted-foreground w-5 text-center">{i + 1}</span>
                      <div className={`w-3 h-3 rounded-full ${s.color || 'bg-muted-foreground'}`} />
                      {editingStage === s.id ? (
                        <>
                          <Input value={stageDraft} onChange={e => setStageDraft(e.target.value)} className="h-8" autoFocus />
                          <Button size="sm" onClick={() => renameStage(s.id)}><Check className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingStage(null)}><X className="w-4 h-4" /></Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm">{s.name}</span>
                          <Select value={s.color || 'bg-muted-foreground'} onValueChange={(v) => changeStageColor(s.id, v)} disabled={readOnly}>
                            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {COLORS.map(c => (
                                <SelectItem key={c.v} value={c.v}>
                                  <span className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${c.v}`} />{c.l}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" disabled={readOnly || savingReorder || i === 0} onClick={() => moveStage(s.id, -1)}>
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={readOnly || savingReorder || i === currentStages.length - 1} onClick={() => moveStage(s.id, 1)}>
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={readOnly} onClick={() => { setEditingStage(s.id); setStageDraft(s.name); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={readOnly} onClick={() => deleteStage(s.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Input
                      placeholder="Nome da nova etapa"
                      value={newStageName}
                      onChange={e => setNewStageName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addStage()}
                      disabled={readOnly}
                    />
                    <Button onClick={addStage} disabled={readOnly}><Plus className="w-4 h-4 mr-1" /> Adicionar etapa</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>

        {/* Audit log dialog */}
        <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="w-4 h-4" /> Histórico de alterações
              </DialogTitle>
              <DialogDescription>
                Últimas 100 ações em funis/etapas deste escopo.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[55vh] pr-3">
              {auditLoading ? (
                <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
              ) : audit.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma alteração registrada ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {audit.map(a => (
                    <li key={a.id} className="rounded-md border p-2.5 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{a.entity === 'pipeline' ? 'Funil' : 'Etapa'}</Badge>
                        <span className="font-medium">{ACTION_LABEL[a.action] || a.action}</span>
                        {a.label && <span className="text-foreground">"{a.label}"</span>}
                        <span className="ml-auto text-muted-foreground">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="text-muted-foreground mt-1">
                        por {a.actor_email || 'usuário desconhecido'}
                      </div>
                      {(a.before || a.after) && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">detalhes</summary>
                          <pre className="text-[10px] mt-1 bg-muted/50 rounded p-2 overflow-x-auto">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={loadAudit}>Atualizar</Button>
              <Button size="sm" onClick={() => setAuditOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
