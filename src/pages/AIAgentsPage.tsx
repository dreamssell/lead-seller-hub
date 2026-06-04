import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Bot, Plus, Settings, ToggleLeft, ToggleRight, Trash2, Play, Loader2, Save, Sparkles, MessageSquare, X, Send, Clock, Bot as BotIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AIAgent {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  provider: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  channels: string[];
  knowledge_base: string | null;
  fallback_message: string | null;
  is_autonomous?: boolean;
  autonomous_config?: {
    trigger_events: string[];
    allowed_actions: string[];
    max_actions_per_run: number;
    monitoring_level: string;
  };
}

const MODELS = [
  { provider: 'lovable', label: 'Lovable AI (sem chave)', models: [
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro — raciocínio + multimodal' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash — equilíbrio (recomendado)' },
    { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite — mais rápido/barato' },
    { value: 'openai/gpt-5', label: 'GPT-5 — máxima precisão' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini — bom custo-benefício' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano — alta velocidade' },
  ]},
  { provider: 'anthropic', label: 'Anthropic (em breve — exige API key)', models: [
    { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
  ]},
  { provider: 'mistral', label: 'Mistral (em breve — exige API key)', models: [
    { value: 'mistral/large', label: 'Mistral Large' },
  ]},
];

const CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'LinkedIn', 'Site', 'Telefone'];

const emptyAgent: Omit<AIAgent, 'id' | 'created_by'> = {
  name: '',
  description: '',
  provider: 'lovable',
  model: 'google/gemini-2.5-flash',
  system_prompt: 'Você é um atendente cordial e profissional. Responda de forma clara e objetiva.',
  temperature: 0.7,
  max_tokens: 1024,
  is_active: true,
  channels: [],
  knowledge_base: '',
  fallback_message: 'Desculpe, não consegui entender. Vou transferir para um atendente humano.',
};

export default function AIAgentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<AIAgent> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<AIAgent | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('ai_agents').select('*').order('created_at', { ascending: false });
    if (error) toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    setAgents((data ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const openNew = () => setEditing({ ...emptyAgent });
  const openEdit = (a: AIAgent) => navigate(`/ai-agents/${a.id}/editar`);

  const save = async () => {
    if (!user || !editing) return;
    if (!editing.name?.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: editing.name!,
      description: editing.description ?? '',
      provider: editing.provider!,
      model: editing.model!,
      system_prompt: editing.system_prompt!,
      temperature: editing.temperature ?? 0.7,
      max_tokens: editing.max_tokens ?? 1024,
      is_active: editing.is_active ?? true,
      channels: editing.channels ?? [],
      knowledge_base: editing.knowledge_base ?? '',
      fallback_message: editing.fallback_message ?? '',
      is_autonomous: editing.is_autonomous ?? false,
      autonomous_config: editing.autonomous_config ?? {
        trigger_events: ["new_lead", "incoming_chat"],
        allowed_actions: ["send_whatsapp", "create_task", "update_crm_status"],
        max_actions_per_run: 5,
        monitoring_level: "high"
      }
    };

    let error;
    if (editing.id) {
      ({ error } = await supabase.from('ai_agents').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('ai_agents').insert({ ...payload, created_by: user.id }));
    }
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editing.id ? 'Agente atualizado' : 'Agente criado' });
    setEditing(null);
    fetchAgents();
  };

  const toggleActive = async (a: AIAgent) => {
    const { error } = await supabase.from('ai_agents').update({ is_active: !a.is_active }).eq('id', a.id);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    setAgents((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
  };

  const remove = async (a: AIAgent) => {
    if (!confirm(`Excluir agente "${a.name}"?`)) return;
    const { error } = await supabase.from('ai_agents').delete().eq('id', a.id);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    toast({ title: 'Agente excluído' });
    fetchAgents();
  };

  return (
    <AppLayout title="Agentes de I.A." subtitle="Configure agentes inteligentes com as melhores LLMs do mercado">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">{agents.length} agente(s) configurado(s)</p>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo Agente</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : agents.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Sparkles className="w-10 h-10 text-primary mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">Nenhum agente ainda</h3>
          <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro agente de IA com Lovable AI (Gemini, GPT-5).</p>
          <Button className="mt-4" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Criar Agente</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent, i) => (
            <motion.div key={agent.id} className="glass-card p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground truncate">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{agent.description || 'Sem descrição'}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-[10px]">{agent.model}</Badge>
                      <Badge variant="outline" className="text-[10px]">temp {agent.temperature}</Badge>
                      {agent.channels?.slice(0, 3).map((c) => (
                        <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => toggleActive(agent)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                  {agent.is_active ? <ToggleRight className="w-8 h-8 text-success" /> : <ToggleLeft className="w-8 h-8" />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                <Button size="sm" variant="outline" onClick={() => setTesting(agent)}><Play className="w-3.5 h-3.5 mr-1.5" />Testar</Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(agent)}><Settings className="w-3.5 h-3.5 mr-1.5" />Configurar</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(agent)} className="ml-auto text-destructive hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Configurar Agente' : 'Novo Agente de I.A.'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="autonomous">IA Autônoma</TabsTrigger>
              </TabsList>
              
              <TabsContent value="general" className="space-y-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome do agente *</Label>
                  <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Bot Qualificador" />
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                    <span className="text-sm text-muted-foreground">{editing.is_active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
              </div>

              <div>
                <Label>Descrição</Label>
                <Input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="O que esse agente faz?" />
              </div>

              <div>
                <Label>Modelo (LLM)</Label>
                <Select value={editing.model} onValueChange={(v) => {
                  const provider = MODELS.find((g) => g.models.some((m) => m.value === v))?.provider ?? 'lovable';
                  setEditing({ ...editing, model: v, provider });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELS.map((group) => (
                      <div key={group.provider}>
                        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">{group.label}</div>
                        {group.models.map((m) => (
                          <SelectItem key={m.value} value={m.value} disabled={group.provider !== 'lovable'}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Modelos Lovable AI funcionam imediatamente. Outros provedores exigirão chave de API.</p>
              </div>

              <div>
                <Label>Prompt do sistema (instruções)</Label>
                <Textarea rows={5} value={editing.system_prompt ?? ''} onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })} />
              </div>

              <div>
                <Label>Base de conhecimento (opcional)</Label>
                <Textarea rows={3} value={editing.knowledge_base ?? ''} onChange={(e) => setEditing({ ...editing, knowledge_base: e.target.value })} placeholder="Cole textos, FAQs, políticas que o agente deve conhecer..." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Criatividade (temperature): {editing.temperature?.toFixed(2)}</Label>
                  <Slider min={0} max={2} step={0.05} value={[editing.temperature ?? 0.7]} onValueChange={(v) => setEditing({ ...editing, temperature: v[0] })} className="mt-3" />
                </div>
                <div>
                  <Label>Tokens máximos: {editing.max_tokens}</Label>
                  <Slider min={128} max={8192} step={128} value={[editing.max_tokens ?? 1024]} onValueChange={(v) => setEditing({ ...editing, max_tokens: v[0] })} className="mt-3" />
                </div>
              </div>

              <div>
                <Label>Canais ativos</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CHANNELS.map((c) => {
                    const active = editing.channels?.includes(c);
                    return (
                      <button key={c} type="button" onClick={() => {
                        const cur = editing.channels ?? [];
                        setEditing({ ...editing, channels: active ? cur.filter((x) => x !== c) : [...cur, c] });
                      }} className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>Mensagem de fallback (transferência humana)</Label>
                <Input value={editing.fallback_message ?? ''} onChange={(e) => setEditing({ ...editing, fallback_message: e.target.value })} />
              </div>
            </TabsContent>

            <TabsContent value="autonomous" className="space-y-6 py-2">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <div className="space-y-0.5">
                  <Label className="text-base font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Modo Autônomo
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Permite que o agente tome ações proativas no CRM sem intervenção humana.
                  </p>
                </div>
                <Switch 
                  checked={editing.is_autonomous ?? false} 
                  onCheckedChange={(v) => setEditing({ ...editing, is_autonomous: v })} 
                />
              </div>

              {editing.is_autonomous && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-3">
                    <Label className="text-[11px] uppercase font-bold text-muted-foreground">Gatilhos de Ativação</Label>
                    <div className="flex flex-wrap gap-2">
                      {['new_lead', 'incoming_chat', 'stale_lead', 'outbound_followup'].map(event => (
                        <Badge 
                          key={event}
                          variant={editing.autonomous_config?.trigger_events?.includes(event) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            const current = editing.autonomous_config?.trigger_events ?? [];
                            const next = current.includes(event) ? current.filter(e => e !== event) : [...current, event];
                            setEditing({
                              ...editing,
                              autonomous_config: { ...editing.autonomous_config!, trigger_events: next }
                            });
                          }}
                        >
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-[11px] uppercase font-bold text-muted-foreground">Ações Permitidas (Tools)</Label>
                    <div className="flex flex-wrap gap-2">
                      {['send_whatsapp', 'create_task', 'update_crm_status', 'transfer_human'].map(action => (
                        <Badge 
                          key={action}
                          variant={editing.autonomous_config?.allowed_actions?.includes(action) ? 'secondary' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            const current = editing.autonomous_config?.allowed_actions ?? [];
                            const next = current.includes(action) ? current.filter(a => a !== action) : [...current, action];
                            setEditing({
                              ...editing,
                              autonomous_config: { ...editing.autonomous_config!, allowed_actions: next }
                            });
                          }}
                        >
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Ações Máx. por Rodada</Label>
                      <Input 
                        type="number" 
                        value={editing.autonomous_config?.max_actions_per_run ?? 5}
                        onChange={(e) => setEditing({
                          ...editing,
                          autonomous_config: { ...editing.autonomous_config!, max_actions_per_run: parseInt(e.target.value) }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nível de Monitoramento</Label>
                      <Select 
                        value={editing.autonomous_config?.monitoring_level ?? 'high'}
                        onValueChange={(v) => setEditing({
                          ...editing,
                          autonomous_config: { ...editing.autonomous_config!, monitoring_level: v }
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixo (Totalmente Autônomo)</SelectItem>
                          <SelectItem value="medium">Médio (Relatórios Diários)</SelectItem>
                          <SelectItem value="high">Alto (Humano revisa tudo)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <AutonomousPreview agent={editing} />
                </motion.div>
              )}
            </TabsContent>
          </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Chat */}
      <TestChatDialog agent={testing} onClose={() => setTesting(null)} />
    </AppLayout>
  );
}

function AutonomousPreview({ agent }: { agent: Partial<AIAgent> }) {
  if (!agent.is_autonomous) return null;

  return (
    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-4">
      <h4 className="text-xs font-bold flex items-center gap-2 uppercase tracking-wider text-primary">
        <Sparkles className="w-3.5 h-3.5" /> Pré-visualização da Autonomia
      </h4>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Clock className="w-3 h-3 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold">Quando ocorrer:</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.autonomous_config?.trigger_events?.length ? agent.autonomous_config.trigger_events.map(e => (
                <span key={e} className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded uppercase font-mono">{e}</span>
              )) : <span className="text-[10px] text-muted-foreground italic">Nenhum gatilho</span>}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center shrink-0">
            <BotIcon className="w-3 h-3 text-success" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold">O agente poderá:</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.autonomous_config?.allowed_actions?.length ? agent.autonomous_config.allowed_actions.map(a => (
                <span key={a} className="text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase font-mono">{a}</span>
              )) : <span className="text-[10px] text-muted-foreground italic">Nenhuma ação</span>}
            </div>
          </div>
        </div>
        <div className="p-2.5 bg-background/50 rounded-xl border border-border/40">
           <p className="text-[10px] text-muted-foreground leading-relaxed italic">
             "Baseado no gatilho acima, o agente analisará o contexto do CRM e executará até {agent.autonomous_config?.max_actions_per_run || 5} ações consecutivas, respeitando o limite de segurança definido."
           </p>
        </div>
      </div>
    </div>
  );
}

function TestChatDialog({ agent, onClose }: { agent: AIAgent | null; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent) setMessages([]);
  }, [agent?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (!agent) return null;

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user' as const, content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    const sys = agent.knowledge_base
      ? `${agent.system_prompt}\n\nBase de conhecimento:\n${agent.knowledge_base}`
      : agent.system_prompt;

    const { data, error } = await supabase.functions.invoke('ai-agent-chat', {
      body: {
        model: agent.model,
        system_prompt: sys,
        messages: next,
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
      },
    });

    setLoading(false);
    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || error?.message || 'Falha ao chamar IA', variant: 'destructive' });
      return;
    }
    setMessages([...next, { role: 'assistant', content: data.reply || '(sem resposta)' }]);
  };

  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Testar: {agent.name}
          </DialogTitle>
        </DialogHeader>
        <div ref={scrollRef} className="h-80 overflow-y-auto bg-secondary rounded-xl p-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Envie uma mensagem para testar este agente em tempo real.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border px-3 py-2 rounded-2xl">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Digite uma mensagem..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={loading}
          />
          <Button onClick={send} disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
