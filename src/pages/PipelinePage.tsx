import { useEffect, useMemo, useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Plus, MoreVertical, User, Loader2, GitBranch, Settings2 } from 'lucide-react';
import { PipelineManagerDialog } from '@/components/pipeline/PipelineManagerDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type SubCompany = { id: string; name: string };
type Pipeline = { id: string; name: string; sub_company_id: string | null; is_default: boolean };
type Stage = { id: string; pipeline_id: string; name: string; position: number; color: string | null };
type Lead = {
  id: string;
  name: string;
  estimated_value: number | null;
  stage_id: string | null;
  pipeline_id: string | null;
  channel: string | null;
  sub_company_id: string | null;
  source: string | null;
};
type Routing = { channel: string; pipeline_id: string | null; sub_company_id: string | null };

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  widget: 'Widget',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

function formatCurrency(v: number | null) {
  if (!v) return 'R$ 0';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export default function PipelinePage() {
  const { user, access } = useAuth();
  const ownerId = access?.owner_id || user?.id;

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<SubCompany[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [routings, setRoutings] = useState<Routing[]>([]);

  const [selectedSub, setSelectedSub] = useState<string>('all');
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [managerOpen, setManagerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [s, p, l, r] = await Promise.all([
      supabase.from('sub_companies').select('id,name').eq('owner_id', ownerId).order('name'),
      supabase.from('pipelines').select('id,name,sub_company_id,is_default').eq('owner_id', ownerId).order('created_at'),
      supabase.from('leads').select('id,name,estimated_value,stage_id,pipeline_id,channel,sub_company_id,source').order('updated_at', { ascending: false }).limit(500),
      supabase.from('channel_routing').select('channel,pipeline_id,sub_company_id').eq('owner_id', ownerId),
    ]);
    setSubs((s.data as SubCompany[]) || []);
    const pl = (p.data as Pipeline[]) || [];
    setPipelines(pl);
    setLeads((l.data as Lead[]) || []);
    setRoutings((r.data as Routing[]) || []);
    if (pl.length) {
      const ids = pl.map(x => x.id);
      const { data: st } = await supabase.from('pipeline_stages').select('id,pipeline_id,name,position,color').in('pipeline_id', ids).order('position');
      setStages((st as Stage[]) || []);
    } else {
      setStages([]);
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  // Sub-company scoped pipelines
  const subScope = selectedSub === 'all' ? undefined : selectedSub === 'global' ? null : selectedSub;
  const visiblePipelines = useMemo(() => {
    if (subScope === undefined) return pipelines;
    return pipelines.filter(p => (p.sub_company_id ?? null) === subScope);
  }, [pipelines, subScope]);

  // Resolve active pipeline (from channel routing if channel set)
  useEffect(() => {
    if (!visiblePipelines.length) { setSelectedPipeline(''); return; }
    if (selectedChannel !== 'all') {
      const route = routings.find(r =>
        r.channel === selectedChannel &&
        (subScope === undefined || (r.sub_company_id ?? null) === subScope) &&
        r.pipeline_id
      );
      if (route?.pipeline_id && visiblePipelines.find(p => p.id === route.pipeline_id)) {
        setSelectedPipeline(route.pipeline_id);
        return;
      }
    }
    if (!visiblePipelines.find(p => p.id === selectedPipeline)) {
      const def = visiblePipelines.find(p => p.is_default) || visiblePipelines[0];
      setSelectedPipeline(def.id);
    }
  }, [visiblePipelines, selectedChannel, routings, subScope, selectedPipeline]);

  const activePipeline = pipelines.find(p => p.id === selectedPipeline) || null;
  const activeStages = stages.filter(s => s.pipeline_id === selectedPipeline).sort((a, b) => a.position - b.position);

  const filteredLeads = leads.filter(l => {
    if (l.pipeline_id !== selectedPipeline) return false;
    if (subScope !== undefined && (l.sub_company_id ?? null) !== subScope) return false;
    if (selectedChannel !== 'all' && l.channel !== selectedChannel) return false;
    return true;
  });

  const moveLead = async (leadId: string, stageId: string) => {
    const { error } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', leadId);
    if (error) return toast.error(error.message);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: stageId } : l));
  };

  return (
    <AppLayout title="Pipeline & Kanban" subtitle="Gerencie seu funil de vendas">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <Label className="text-xs">Sub-empresa</Label>
          <Select value={selectedSub} onValueChange={setSelectedSub}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="global">Conta principal</SelectItem>
              {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Funil</Label>
          <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={visiblePipelines.length ? 'Selecionar funil' : 'Nenhum funil'} />
            </SelectTrigger>
            <SelectContent>
              {visiblePipelines.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.is_default ? ' (padrão)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Canal de origem</Label>
          <Select value={selectedChannel} onValueChange={setSelectedChannel}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              {Object.entries(CHANNEL_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="ml-auto">Atualizar</Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Carregando funis…
        </div>
      ) : !activePipeline ? (
        <div className="p-12 text-center border border-dashed rounded-xl">
          <GitBranch className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Nenhum funil cadastrado para este escopo.
          </p>
          <p className="text-xs text-muted-foreground">
            Acesse <b>Developer Center → Roteamento Omnichannel</b> para criar funis e mapear canais.
          </p>
        </div>
      ) : activeStages.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Este funil ainda não tem etapas.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activeStages.map((col, ci) => {
            const cards = filteredLeads.filter(l => l.stage_id === col.id);
            return (
              <motion.div
                key={col.id}
                className="min-w-[280px] flex-shrink-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: ci * 0.05 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const leadId = e.dataTransfer.getData('text/lead-id');
                  if (leadId) moveLead(leadId, col.id);
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.color || 'bg-muted-foreground'}`} />
                  <h3 className="text-sm font-semibold text-foreground">{col.name}</h3>
                  <span className="text-xs text-muted-foreground ml-auto">{cards.length}</span>
                </div>

                <div className="space-y-2 min-h-[80px]">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/lead-id', card.id)}
                      className="glass-card p-4 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors group"
                      onClick={() => { window.location.href = `/cadastros?entity=leads&id=${card.id}`; }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium text-foreground">{card.name}</p>
                        <button className="p-1 rounded hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {card.channel && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            {CHANNEL_LABEL[card.channel] || card.channel}
                          </Badge>
                        )}
                        {card.source && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">{card.source}</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-primary">{formatCurrency(card.estimated_value)}</p>
                        <div className="flex -space-x-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center border border-background shadow-sm">
                            <User className="w-2.5 h-2.5 text-primary" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    onClick={() => { window.location.href = `/cadastros?entity=leads&new=1&stage=${col.id}&pipeline=${selectedPipeline}`; }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
