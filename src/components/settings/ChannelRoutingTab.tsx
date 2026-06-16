import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, GitBranch, Phone, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Pipeline = { id: string; name: string; description: string | null; is_default: boolean; sub_company_id: string | null };
type Stage = { id: string; pipeline_id: string; name: string; position: number; color: string | null };
type Routing = {
  id: string;
  sub_company_id: string | null;
  channel: string;
  chat_provider: string;
  voice_provider: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  enabled: boolean;
};
type SubCompany = { id: string; name: string };

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook Messenger' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'widget', label: 'Widget de Site' },
];

const CHAT_PROVIDERS = [
  { value: 'uaz', label: 'UAZ API (chat WhatsApp)' },
  { value: 'evolution', label: 'Evolution API (chat WhatsApp)' },
  { value: 'meta', label: 'Meta Cloud API (oficial)' },
  { value: 'instagram', label: 'Instagram Direct' },
  { value: 'facebook', label: 'Facebook Page' },
  { value: 'telegram', label: 'Telegram Bot' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'widget', label: 'Widget' },
  { value: 'none', label: 'Sem chat (só voz)' },
];

export default function ChannelRoutingTab() {
  const { user } = useAuth();
  const ownerId = user?.id;
  const [subs, setSubs] = useState<SubCompany[]>([]);
  const [selectedSub, setSelectedSub] = useState<string>('global');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [routings, setRoutings] = useState<Routing[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPipelineName, setNewPipelineName] = useState('');

  const subScope = selectedSub === 'global' ? null : selectedSub;

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [s, p, r] = await Promise.all([
      supabase.from('sub_companies').select('id,name').eq('owner_id', ownerId).order('name'),
      supabase.from('pipelines').select('*').eq('owner_id', ownerId).order('created_at'),
      supabase.from('channel_routing').select('*').eq('owner_id', ownerId).order('channel'),
    ]);
    setSubs((s.data as SubCompany[]) || []);
    setPipelines((p.data as Pipeline[]) || []);
    setRoutings((r.data as Routing[]) || []);
    const pipelineIds = (p.data || []).map((x: any) => x.id);
    if (pipelineIds.length) {
      const { data: st } = await supabase.from('pipeline_stages').select('*').in('pipeline_id', pipelineIds).order('position');
      setStages((st as Stage[]) || []);
    } else {
      setStages([]);
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const subPipelines = pipelines.filter(p => (p.sub_company_id ?? null) === subScope);
  const subRoutings = routings.filter(r => (r.sub_company_id ?? null) === subScope);

  const createPipeline = async () => {
    if (!ownerId || !newPipelineName.trim()) return;
    const { data, error } = await supabase.from('pipelines').insert({
      owner_id: ownerId,
      sub_company_id: subScope,
      name: newPipelineName.trim(),
      is_default: subPipelines.length === 0,
    }).select().single();
    if (error) return toast.error(error.message);
    // Default stages
    await supabase.from('pipeline_stages').insert([
      { pipeline_id: data.id, name: 'Novo Lead', position: 0, color: 'bg-muted-foreground' },
      { pipeline_id: data.id, name: 'Qualificação', position: 1, color: 'bg-primary' },
      { pipeline_id: data.id, name: 'Proposta', position: 2, color: 'bg-warning' },
      { pipeline_id: data.id, name: 'Fechamento', position: 3, color: 'bg-success' },
    ]);
    setNewPipelineName('');
    toast.success('Funil criado com etapas padrão');
    load();
  };

  const deletePipeline = async (id: string) => {
    if (!confirm('Excluir este funil e todas as etapas?')) return;
    const { error } = await supabase.from('pipelines').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Funil removido');
    load();
  };

  const upsertRouting = async (channel: string, patch: Partial<Routing>) => {
    if (!ownerId) return;
    const existing = subRoutings.find(r => r.channel === channel);
    if (existing) {
      const { error } = await supabase.from('channel_routing').update(patch).eq('id', existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('channel_routing').insert({
        owner_id: ownerId,
        sub_company_id: subScope,
        channel,
        chat_provider: 'uaz',
        voice_provider: channel === 'whatsapp' ? 'wavoip' : null,
        enabled: true,
        ...patch,
      });
      if (error) return toast.error(error.message);
    }
    load();
  };

  const removeRouting = async (id: string) => {
    await supabase.from('channel_routing').delete().eq('id', id);
    load();
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="w-5 h-5" /> Roteamento Omnichannel</CardTitle>
          <CardDescription>
            Configure por sub-empresa qual provedor de <b>chat</b> (UAZ ou Evolution) e qual provedor de <b>voz</b> (Wavoip) será usado em cada canal — e em qual funil do CRM os novos leads devem entrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="min-w-[120px]">Sub-empresa:</Label>
            <Select value={selectedSub} onValueChange={setSelectedSub}>
              <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Conta principal (global)</SelectItem>
                {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funis ativos desta sub-empresa</CardTitle>
          <CardDescription>Cada canal pode entregar leads em um funil/etapa diferente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {subPipelines.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum funil cadastrado ainda.</p>
          )}
          {subPipelines.map(p => {
            const ps = stages.filter(s => s.pipeline_id === p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{p.name} {p.is_default && <Badge variant="secondary" className="ml-2">Padrão</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{ps.length} etapas: {ps.map(s => s.name).join(' → ')}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deletePipeline(p.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            );
          })}
          <div className="flex gap-2 pt-2">
            <Input placeholder="Nome do novo funil (ex: Vendas Inbound)" value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)} />
            <Button onClick={createPipeline}><Plus className="w-4 h-4 mr-1" /> Criar funil</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canais & roteamento</CardTitle>
          <CardDescription>Defina provedor de chat, provedor de voz e funil de destino para cada canal de entrada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNELS.map(ch => {
            const r = subRoutings.find(x => x.channel === ch.value);
            const pipelineId = r?.pipeline_id || '';
            const chStages = stages.filter(s => s.pipeline_id === pipelineId);
            return (
              <div key={ch.value} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span className="font-medium">{ch.label}</span>
                    {r?.enabled && <Badge variant="default">Ativo</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Habilitado</Label>
                    <Switch
                      checked={r?.enabled ?? false}
                      onCheckedChange={(v) => upsertRouting(ch.value, { enabled: v })}
                    />
                    {r && (
                      <Button variant="ghost" size="icon" onClick={() => removeRouting(r.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Provedor de chat</Label>
                    <Select value={r?.chat_provider || 'uaz'} onValueChange={(v) => upsertRouting(ch.value, { chat_provider: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHAT_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {ch.value === 'whatsapp' && (
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" /> Provedor de voz</Label>
                      <Select value={r?.voice_provider || 'wavoip'} onValueChange={(v) => upsertRouting(ch.value, { voice_provider: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wavoip">Wavoip (chamadas)</SelectItem>
                          <SelectItem value="none">Sem voz</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Funil de destino</Label>
                    <Select value={pipelineId} onValueChange={(v) => upsertRouting(ch.value, { pipeline_id: v, stage_id: null })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar funil" /></SelectTrigger>
                      <SelectContent>
                        {subPipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Etapa inicial</Label>
                    <Select value={r?.stage_id || ''} onValueChange={(v) => upsertRouting(ch.value, { stage_id: v })} disabled={!pipelineId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar etapa" /></SelectTrigger>
                      <SelectContent>
                        {chStages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 text-sm">
          <p className="font-medium mb-1">💡 Como funciona</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><b>Wavoip</b> agora cuida exclusivamente das <b>chamadas de voz</b> do WhatsApp.</li>
            <li><b>UAZ</b> ou <b>Evolution</b> cuida do <b>chat</b> (mensagens) — escolha por canal.</li>
            <li>Toda nova conversa cria automaticamente um <b>Lead + Contato no CRM</b> com a <b>origem do canal</b> registrada.</li>
            <li>O lead entra direto no funil/etapa configurado acima.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
