/**
 * Seletor de Funil (pipeline) + Etapa para a conversa aberta no Chat.
 * Lista apenas os funis ativos da empresa (ou sub-empresa) do cliente e as
 * etapas cadastradas na criação do funil. A escolha é gravada em
 * `customers.pipeline_id` / `customers.stage_id`, o que reflete em tempo real
 * na aba de conversas (badge com o nome do funil).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitBranch } from 'lucide-react';
import { toast } from 'sonner';

type Pipeline = { id: string; name: string; sub_company_id: string | null };
type Stage = { id: string; name: string; pipeline_id: string; position: number };

interface Props {
  customerId: string;
  ownerId: string | null;
  subCompanyId?: string | null;
  pipelineId: string | null;
  stageId: string | null;
  onChanged?: (patch: { pipeline_id: string | null; stage_id: string | null }) => void;
}

export function FunnelSelect({ customerId, ownerId, subCompanyId, pipelineId, stageId, onChanged }: Props) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipeline, setPipeline] = useState<string | null>(pipelineId);
  const [stage, setStage] = useState<string | null>(stageId);

  useEffect(() => { setPipeline(pipelineId); }, [pipelineId]);
  useEffect(() => { setStage(stageId); }, [stageId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ownerId) { setPipelines([]); return; }
      let q = supabase.from('pipelines').select('id, name, sub_company_id').eq('owner_id', ownerId);
      // Escopo: sub-empresa vê os funis dela + os globais da empresa.
      if (subCompanyId) q = q.or(`sub_company_id.eq.${subCompanyId},sub_company_id.is.null`);
      const { data } = await q.order('created_at', { ascending: true });
      if (!cancelled) setPipelines((data as Pipeline[]) || []);
    })();
    return () => { cancelled = true; };
  }, [ownerId, subCompanyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pipeline) { setStages([]); return; }
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name, pipeline_id, position')
        .eq('pipeline_id', pipeline)
        .order('position', { ascending: true });
      if (!cancelled) setStages((data as Stage[]) || []);
    })();
    return () => { cancelled = true; };
  }, [pipeline]);

  const persist = async (patch: { pipeline_id?: string | null; stage_id?: string | null }) => {
    const { error } = await supabase.from('customers').update(patch as any).eq('id', customerId);
    if (error) { toast.error('Falha ao salvar o funil'); return false; }
    onChanged?.({
      pipeline_id: patch.pipeline_id !== undefined ? patch.pipeline_id : pipeline,
      stage_id: patch.stage_id !== undefined ? patch.stage_id : stage,
    });
    return true;
  };

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1">
      <GitBranch className="w-3 h-3 text-primary" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Funil</span>
      <Select
        value={pipeline || ''}
        onValueChange={async (v) => {
          setPipeline(v);
          setStage(null);
          await persist({ pipeline_id: v, stage_id: null });
        }}
      >
        <SelectTrigger className="h-8 text-xs w-[150px]">
          <SelectValue placeholder="Selecionar funil" />
        </SelectTrigger>
        <SelectContent>
          {pipelines.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum funil ativo</div>
          )}
          {pipelines.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pipeline && (
        <Select
          value={stage || ''}
          onValueChange={async (v) => { setStage(v); await persist({ stage_id: v }); }}
        >
          <SelectTrigger className="h-8 text-xs w-[150px]">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem etapas cadastradas</div>
            )}
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
