import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Pencil, Check, X, Link2 } from 'lucide-react';
import { toast } from 'sonner';

type Pipeline = { id: string; name: string; is_default: boolean; sub_company_id: string | null };
type Stage = { id: string; pipeline_id: string; name: string; position: number; color: string | null };
type Routing = { id: string; sub_company_id: string | null; channel: string; pipeline_id: string | null; stage_id: string | null; enabled: boolean };

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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  /** undefined = all (treat as global), null = global, string = sub id */
  subScope: string | null | undefined;
  /** channel filter ('all' or value) */
  channel: string;
  /** focused pipeline id, optional */
  initialPipelineId?: string;
  onChanged: () => void;
}

export function PipelineManagerDialog({ open, onOpenChange, ownerId, subScope, channel, initialPipelineId, onChanged }: Props) {
  const scope = subScope === undefined ? null : subScope;

  const [loading, setLoading] = useState(false);
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

  const current = pipelines.find(p => p.id === selectedPipeline) || null;
  const currentStages = stages.filter(s => s.pipeline_id === selectedPipeline).sort((a, b) => a.position - b.position);

  const refresh = async () => { await load(); onChanged(); };

  const createPipeline = async () => {
    if (!newPipelineName.trim()) return;
    const { data, error } = await supabase.from('pipelines').insert({
      owner_id: ownerId, sub_company_id: scope, name: newPipelineName.trim(), is_default: pipelines.length === 0,
    }).select().single();
    if (error) return toast.error(error.message);
    await supabase.from('pipeline_stages').insert([
      { pipeline_id: data.id, name: 'Novo Lead', position: 0, color: 'bg-muted-foreground' },
      { pipeline_id: data.id, name: 'Qualificação', position: 1, color: 'bg-primary' },
      { pipeline_id: data.id, name: 'Proposta', position: 2, color: 'bg-warning' },
      { pipeline_id: data.id, name: 'Fechamento', position: 3, color: 'bg-success' },
    ]);
    setNewPipelineName('');
    setSelectedPipeline(data.id);
    toast.success('Funil criado');
    refresh();
  };

  const renamePipeline = async () => {
    if (!current || !pipelineDraft.trim()) return;
    const { error } = await supabase.from('pipelines').update({ name: pipelineDraft.trim() }).eq('id', current.id);
    if (error) return toast.error(error.message);
    setEditingPipeline(false);
    refresh();
  };

  const setDefault = async () => {
    if (!current) return;
    await supabase.from('pipelines').update({ is_default: false }).eq('owner_id', ownerId).eq('sub_company_id', scope as any);
    const { error } = await supabase.from('pipelines').update({ is_default: true }).eq('id', current.id);
    if (error) return toast.error(error.message);
    toast.success('Definido como padrão');
    refresh();
  };

  const deletePipeline = async () => {
    if (!current) return;
    if (!confirm(`Excluir funil "${current.name}" e todas as suas etapas?`)) return;
    const { error } = await supabase.from('pipelines').delete().eq('id', current.id);
    if (error) return toast.error(error.message);
    toast.success('Funil excluído');
    setSelectedPipeline('');
    refresh();
  };

  const addStage = async () => {
    if (!current || !newStageName.trim()) return;
    const pos = currentStages.length;
    const { error } = await supabase.from('pipeline_stages').insert({
      pipeline_id: current.id, name: newStageName.trim(), position: pos, color: 'bg-primary',
    });
    if (error) return toast.error(error.message);
    setNewStageName('');
    refresh();
  };

  const renameStage = async (id: string) => {
    if (!stageDraft.trim()) return;
    const { error } = await supabase.from('pipeline_stages').update({ name: stageDraft.trim() }).eq('id', id);
    if (error) return toast.error(error.message);
    setEditingStage(null);
    refresh();
  };

  const changeStageColor = async (id: string, color: string) => {
    await supabase.from('pipeline_stages').update({ color }).eq('id', id);
    refresh();
  };

  const moveStage = async (id: string, dir: -1 | 1) => {
    const idx = currentStages.findIndex(s => s.id === id);
    const swap = currentStages[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from('pipeline_stages').update({ position: swap.position }).eq('id', id),
      supabase.from('pipeline_stages').update({ position: currentStages[idx].position }).eq('id', swap.id),
    ]);
    refresh();
  };

  const deleteStage = async (id: string) => {
    if (!confirm('Excluir esta etapa? Leads vinculados ficarão sem etapa.')) return;
    await supabase.from('pipeline_stages').delete().eq('id', id);
    refresh();
  };

  // Channel routing link
  const channelRouting = channel !== 'all'
    ? routings.find(r => r.channel === channel && (r.sub_company_id ?? null) === scope)
    : null;

  const linkChannel = async () => {
    if (!current || channel === 'all') return;
    if (channelRouting) {
      await supabase.from('channel_routing').update({ pipeline_id: current.id, stage_id: null, enabled: true }).eq('id', channelRouting.id);
    } else {
      await supabase.from('channel_routing').insert({
        owner_id: ownerId, sub_company_id: scope, channel,
        chat_provider: 'uaz', voice_provider: channel === 'whatsapp' ? 'wavoip' : null,
        pipeline_id: current.id, enabled: true,
      });
    }
    toast.success(`Canal ${CHANNEL_LABEL[channel] || channel} vinculado a "${current.name}"`);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar funis e etapas</DialogTitle>
          <DialogDescription>
            Escopo: <b>{scope ? 'Sub-empresa selecionada' : 'Conta principal (global)'}</b>
            {channel !== 'all' && <> · Canal foco: <b>{CHANNEL_LABEL[channel] || channel}</b></>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-5">
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
                />
                <Button onClick={createPipeline}><Plus className="w-4 h-4 mr-1" /> Criar funil</Button>
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
                      <Button size="sm" variant="ghost" onClick={() => { setEditingPipeline(true); setPipelineDraft(current.name); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {!current.is_default && (
                      <Button size="sm" variant="outline" onClick={setDefault}>Definir como padrão</Button>
                    )}
                    {channel !== 'all' && (
                      <Button size="sm" variant="outline" onClick={linkChannel}>
                        <Link2 className="w-3.5 h-3.5 mr-1" /> Vincular canal {CHANNEL_LABEL[channel] || channel}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={deletePipeline}>
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
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Etapas</Label>
                  {currentStages.length === 0 && <p className="text-sm text-muted-foreground">Sem etapas. Adicione abaixo.</p>}
                  {currentStages.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
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
                          <Select value={s.color || 'bg-muted-foreground'} onValueChange={(v) => changeStageColor(s.id, v)}>
                            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {COLORS.map(c => (
                                <SelectItem key={c.v} value={c.v}>
                                  <span className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${c.v}`} />{c.l}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => moveStage(s.id, -1)}>
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={i === currentStages.length - 1} onClick={() => moveStage(s.id, 1)}>
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => { setEditingStage(s.id); setStageDraft(s.name); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteStage(s.id)}>
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
                    />
                    <Button onClick={addStage}><Plus className="w-4 h-4 mr-1" /> Adicionar etapa</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
