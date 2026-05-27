import { AppLayout } from '@/components/layout/AppLayout';
import IntegrationsCatalog from '@/components/agents/IntegrationsCatalog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, User, Briefcase, GraduationCap, Zap, Wifi, Folder, Server, Globe, Settings as SettingsIcon,
  Loader2, Save, FlaskConical, MessageCircle, Sparkles, Clock, Webhook, ArrowLeftRight, Trash2, Plus,
  ChevronDown, ChevronUp, Bot, Upload, FileText, Calendar as CalendarIcon, Copy, Check,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ============================================================
// Types & defaults
// ============================================================
const MODELS = [
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Rápido e Econômico' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Raciocínio avançado' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Mais barato' },
  { value: 'openai/gpt-5', label: 'GPT-5', desc: 'Máxima precisão' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini', desc: 'Custo-benefício' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano', desc: 'Alta velocidade' },
];

type Intent = { id: string; name: string; keywords: string; action: string };
type Webhook = { id: string; name: string; url: string; event: string; active: boolean };
type TransferRule = {
  id: string; type: 'agent' | 'team' | 'queue'; target: string;
  when: string; clientMessage: string; internalNote: string;
};
type InactivityAction = { id: string; after: string; action: string; message: string };
type McpServer = { id: string; name: string; url: string; token: string };

type AgentConfig = {
  conversa?: {
    transferHuman?: boolean;
    pauseWhenHuman?: boolean;
    useEmojis?: boolean;
    signName?: boolean;
    restrictTopics?: boolean;
    splitLong?: boolean;
    chunkSize?: number;
    chunkDelayMs?: number;
    showTyping?: boolean;
    allowReminders?: boolean;
    smartSearch?: boolean;
    timezone?: string;
    interactionLimit?: string;
  };
  interativo?: {
    internalCalendar?: boolean;
    googleCalendarConnected?: boolean;
    interactiveButtons?: boolean;
    pixCharges?: boolean;
  };
  inatividade?: { actions: InactivityAction[] };
  webhooks?: Webhook[];
  transferencia?: { rules: TransferRule[] };
  intencoes?: Intent[];
  integracoes?: { calendar?: boolean; elevenlabs?: boolean; pixProvider?: string };
  mcpServers?: McpServer[];
  acessoPlataforma?: { enabled: boolean; pages: string[] };
  widgetWeb?: { enabled: boolean; primaryColor: string; greeting: string; position: 'left' | 'right' };
  trabalho?: { objetivo?: string; tomVoz?: string; publicoAlvo?: string; produtos?: string };
  treinamentos?: { knowledgeBase?: string; faqs?: { q: string; a: string }[] };
  advanced?: {
    temperature?: number;
    maxTokens?: number;
    delayBufferMs?: number;
    autoReply?: boolean;
    agentActive?: boolean;
  };
};

const defaultConfig: AgentConfig = {
  conversa: {
    transferHuman: true, pauseWhenHuman: true, useEmojis: false, signName: false,
    restrictTopics: false, splitLong: true, chunkSize: 500, chunkDelayMs: 10000,
    showTyping: true, allowReminders: true, smartSearch: false,
    timezone: 'America/Sao_Paulo', interactionLimit: 'unlimited',
  },
  interativo: { internalCalendar: false, googleCalendarConnected: false, interactiveButtons: false, pixCharges: false },
  inatividade: { actions: [] },
  webhooks: [],
  transferencia: { rules: [] },
  intencoes: [],
  integracoes: {},
  mcpServers: [],
  acessoPlataforma: { enabled: false, pages: [] },
  widgetWeb: { enabled: false, primaryColor: '#3B82F6', greeting: 'Olá! Como posso ajudar?', position: 'right' },
  trabalho: {},
  treinamentos: { knowledgeBase: '', faqs: [] },
  advanced: { temperature: 0.7, maxTokens: 500, delayBufferMs: 0, autoReply: true, agentActive: true },
};

// Sections in the left card
const SECTIONS = [
  { key: 'perfil',       label: 'Perfil',            icon: User },
  { key: 'trabalho',     label: 'Trabalho',          icon: Briefcase },
  { key: 'treinamentos', label: 'Treinamentos',      icon: GraduationCap },
  { key: 'intencoes',    label: 'Intenções',         icon: Zap },
  { key: 'integracoes',  label: 'Integrações',       icon: Wifi },
  { key: 'arquivos',     label: 'Arquivos',          icon: Folder },
  { key: 'mcp',          label: 'Servidores MCP',    icon: Server },
  { key: 'acesso',       label: 'Acesso Plataforma', icon: Globe },
  { key: 'widget',       label: 'Widget Web',        icon: Globe },
  { key: 'configuracoes',label: 'Configurações',     icon: SettingsIcon },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

// ============================================================
// Page
// ============================================================
export default function EditAgentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [section, setSection] = useState<SectionKey>('perfil');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);

  // Core fields
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('google/gemini-2.5-flash');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [channels, setChannels] = useState<string[]>([]);
  const [fallback, setFallback] = useState('');
  const [config, setConfigState] = useState<AgentConfig>(defaultConfig);
  const [files, setFiles] = useState<{ name: string; size: number; updated_at?: string }[]>([]);

  const setConfig = (patch: Partial<AgentConfig>) => {
    setConfigState((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  const patchConfig = <K extends keyof AgentConfig>(key: K, patch: Partial<AgentConfig[K]>) => {
    setConfigState((c) => ({ ...c, [key]: { ...(c[key] as any), ...patch } }));
    setDirty(true);
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('ai_agents').select('*').eq('id', id).single();
    if (error || !data) {
      toast({ title: 'Agente não encontrado', variant: 'destructive' });
      navigate('/ai-agents');
      return;
    }
    setName(data.name || '');
    setRole((data as any).role || '');
    setAvatarUrl((data as any).avatar_url || null);
    setDescription(data.description || '');
    setModel(data.model || 'google/gemini-2.5-flash');
    setSystemPrompt(data.system_prompt || '');
    setIsActive(data.is_active);
    setChannels(data.channels || []);
    setFallback(data.fallback_message || '');
    const cfg = ((data as any).config || {}) as AgentConfig;
    setConfigState({ ...defaultConfig, ...cfg, conversa: { ...defaultConfig.conversa, ...(cfg.conversa || {}) }, advanced: { ...defaultConfig.advanced, ...(cfg.advanced || {}) } });
    setLoading(false);
    setDirty(false);
    await loadFiles();
  };

  const loadFiles = async () => {
    if (!id) return;
    const { data } = await supabase.storage.from('agent-files').list(id, { limit: 100 });
    if (data) setFiles(data.filter((f) => f.name !== '.emptyFolderPlaceholder').map((f) => ({ name: f.name, size: (f.metadata as any)?.size ?? 0, updated_at: f.updated_at })));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const payload: any = {
      name, role, description, model,
      avatar_url: avatarUrl,
      system_prompt: systemPrompt,
      is_active: isActive,
      channels,
      fallback_message: fallback,
      config,
    };
    const { error } = await supabase.from('ai_agents').update(payload).eq('id', id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    setDirty(false);
    toast({ title: 'Alterações salvas com sucesso' });
  };

  if (loading) {
    return (
      <AppLayout title="Editar agente">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const currentModel = MODELS.find((m) => m.value === model) ?? MODELS[0];

  return (
    <AppLayout title="">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <button onClick={() => navigate('/ai-agents')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-foreground">Editar agente</h1>
              {dirty && (
                <Badge variant="outline" className="border-warning text-warning gap-1">
                  <Clock className="w-3 h-3" /> Alterações não salvas
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Visualize informações, faça treinamentos, configure seu agente e conecte aos seus dispositivos
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left card */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 h-fit">
            <AvatarUploader agentId={id!} url={avatarUrl} onChange={(u) => { setAvatarUrl(u); setDirty(true); }} />
            <div className="text-center mt-3">
              <h2 className="text-lg font-bold text-foreground">{name || 'Sem nome'}</h2>
              <p className="text-xs text-muted-foreground">{role || 'Cargo não definido'}</p>
            </div>

            <div className="mt-5">
              <Select value={model} onValueChange={(v) => { setModel(v); setDirty(true); }}>
                <SelectTrigger className="h-auto py-2.5">
                  <div className="flex items-center gap-2 text-left">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    <div>
                      <div className="text-sm font-medium">{currentModel.label}</div>
                      <div className="text-xs text-muted-foreground">{currentModel.desc}</div>
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label} — {m.desc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground text-center mt-2">Consumo de créditos é gerenciado pela empresa matriz.</p>
            </div>

            <Separator className="my-4" />

            <nav className="space-y-1">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = section === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSection(s.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                      active
                        ? 'bg-primary text-primary-foreground font-semibold shadow-md'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">{s.label}</span>
                    {s.key === 'integracoes' && config.integracoes && (config.integracoes.calendar || config.integracoes.elevenlabs) && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <CalendarIcon className="w-3 h-3" /> Ativo
                      </Badge>
                    )}
                  </button>
                );
              })}
            </nav>
          </motion.div>

          {/* Right content */}
          <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 min-h-[400px]">
            {section === 'perfil' && (
              <PerfilSection
                name={name} setName={(v) => { setName(v); setDirty(true); }}
                role={role} setRole={(v) => { setRole(v); setDirty(true); }}
                description={description} setDescription={(v) => { setDescription(v); setDirty(true); }}
                isActive={isActive} setIsActive={(v) => { setIsActive(v); setDirty(true); }}
                channels={channels} setChannels={(v) => { setChannels(v); setDirty(true); }}
              />
            )}
            {section === 'trabalho' && (
              <TrabalhoSection
                systemPrompt={systemPrompt} setSystemPrompt={(v) => { setSystemPrompt(v); setDirty(true); }}
                trabalho={config.trabalho || {}}
                patch={(p) => patchConfig('trabalho', p)}
                fallback={fallback} setFallback={(v) => { setFallback(v); setDirty(true); }}
              />
            )}
            {section === 'treinamentos' && (
              <TreinamentosSection treinamentos={config.treinamentos || {}} patch={(p) => patchConfig('treinamentos', p)} />
            )}
            {section === 'intencoes' && (
              <IntencoesSection intents={config.intencoes || []} setIntents={(v) => setConfig({ intencoes: v })} />
            )}
            {section === 'integracoes' && (
              <IntegrationsCatalog agentId={id!} />
            )}
            {section === 'arquivos' && (
              <ArquivosSection agentId={id!} files={files} reload={loadFiles} />
            )}
            {section === 'mcp' && (
              <McpSection servers={config.mcpServers || []} setServers={(v) => setConfig({ mcpServers: v })} />
            )}
            {section === 'acesso' && (
              <AcessoSection acesso={config.acessoPlataforma || { enabled: false, pages: [] }} patch={(p) => patchConfig('acessoPlataforma', p)} />
            )}
            {section === 'widget' && (
              <WidgetSection agentId={id!} widget={config.widgetWeb || defaultConfig.widgetWeb!} patch={(p) => patchConfig('widgetWeb', p)} />
            )}
            {section === 'configuracoes' && (
              <ConfiguracoesSection config={config} setConfig={setConfig} patchConfig={patchConfig} />
            )}
          </motion.div>
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-end gap-3 sticky bottom-4 pt-2">
          <div className="glass-card px-4 py-3 flex items-center gap-3 shadow-lg">
            <Button variant="outline" onClick={() => navigate('/ai-agents')}>Cancelar</Button>
            <Button variant="outline" onClick={() => setTesting(true)}>
              <FlaskConical className="w-4 h-4 mr-2" /> Testar Agente
            </Button>
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar alterações
            </Button>
          </div>
        </div>
      </div>

      {testing && (
        <TestAgentDialog
          open={testing}
          onClose={() => setTesting(false)}
          agent={{ id: id!, name, model, system_prompt: systemPrompt, temperature: config.advanced?.temperature ?? 0.7, max_tokens: config.advanced?.maxTokens ?? 500, knowledge_base: config.treinamentos?.knowledgeBase ?? '' }}
        />
      )}
    </AppLayout>
  );
}

// ============================================================
// Avatar Uploader
// ============================================================
function AvatarUploader({ agentId, url, onChange }: { agentId: string; url: string | null; onChange: (u: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    const path = `${agentId}/avatar-${Date.now()}`;
    const { error } = await supabase.storage.from('agent-avatars').upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from('agent-avatars').getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  };

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => inputRef.current?.click()}
        className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-border hover:border-primary transition-colors relative group"
      >
        {url ? (
          <img src={url} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <Bot className="w-10 h-10 text-primary" />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Upload className="w-5 h-5 text-white" />}
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ============================================================
// Sections
// ============================================================
function PerfilSection({ name, setName, role, setRole, description, setDescription, isActive, setIsActive, channels, setChannels }: any) {
  const CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'LinkedIn', 'Site', 'Telefone'];
  return (
    <div className="space-y-5">
      <SectionHeader icon={User} title="Perfil do agente" subtitle="Informações básicas que identificam o agente." />
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amanda" />
        </div>
        <div>
          <Label>Cargo</Label>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="SDR, Atendente, Vendedor..." />
        </div>
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que esse agente faz?" />
      </div>
      <div className="flex items-center justify-between p-4 rounded-xl border border-border">
        <div>
          <div className="text-sm font-medium">Agente ativo</div>
          <div className="text-xs text-muted-foreground">Permite que o agente responda conversas em produção</div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <div>
        <Label>Canais</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {CHANNELS.map((c) => {
            const active = channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => setChannels(active ? channels.filter((x: string) => x !== c) : [...channels, c])}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TrabalhoSection({ systemPrompt, setSystemPrompt, trabalho, patch, fallback, setFallback }: any) {
  return (
    <div className="space-y-5">
      <SectionHeader icon={Briefcase} title="Trabalho" subtitle="Defina o papel, objetivo e tom de voz do agente." />
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Objetivo principal</Label>
          <Input value={trabalho.objetivo || ''} onChange={(e) => patch({ objetivo: e.target.value })} placeholder="Qualificar leads, agendar reuniões..." />
        </div>
        <div>
          <Label>Tom de voz</Label>
          <Select value={trabalho.tomVoz || 'profissional'} onValueChange={(v) => patch({ tomVoz: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="profissional">Profissional</SelectItem>
              <SelectItem value="casual">Casual e amigável</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="entusiasmado">Entusiasmado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Público-alvo</Label>
        <Input value={trabalho.publicoAlvo || ''} onChange={(e) => patch({ publicoAlvo: e.target.value })} placeholder="Pequenas empresas, profissionais autônomos..." />
      </div>
      <div>
        <Label>Produtos / serviços oferecidos</Label>
        <Textarea rows={3} value={trabalho.produtos || ''} onChange={(e) => patch({ produtos: e.target.value })} placeholder="Liste os principais produtos ou serviços que o agente pode oferecer..." />
      </div>
      <div>
        <Label>Prompt do sistema (instruções detalhadas)</Label>
        <Textarea rows={8} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Você é um atendente cordial e profissional..." />
        <p className="text-[11px] text-muted-foreground mt-1">Estas instruções definem o comportamento principal do agente.</p>
      </div>
      <div>
        <Label>Mensagem de fallback</Label>
        <Input value={fallback} onChange={(e) => setFallback(e.target.value)} placeholder="Vou transferir para um atendente humano..." />
      </div>
    </div>
  );
}

function TreinamentosSection({ treinamentos, patch }: any) {
  const faqs: { q: string; a: string }[] = treinamentos.faqs || [];
  const addFaq = () => patch({ faqs: [...faqs, { q: '', a: '' }] });
  const updateFaq = (i: number, f: Partial<{ q: string; a: string }>) =>
    patch({ faqs: faqs.map((x, idx) => idx === i ? { ...x, ...f } : x) });
  const removeFaq = (i: number) => patch({ faqs: faqs.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-5">
      <SectionHeader icon={GraduationCap} title="Treinamentos" subtitle="Alimente o agente com conhecimento, FAQs e contexto." />
      <div>
        <Label>Base de conhecimento (textos, políticas, scripts)</Label>
        <Textarea rows={8} value={treinamentos.knowledgeBase || ''} onChange={(e) => patch({ knowledgeBase: e.target.value })} placeholder="Cole aqui textos, FAQs, políticas internas, scripts de venda..." />
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="m-0">Perguntas frequentes (FAQs)</Label>
          <Button size="sm" variant="outline" onClick={addFaq}><Plus className="w-3.5 h-3.5 mr-1.5" />Adicionar</Button>
        </div>
        <div className="space-y-3">
          {faqs.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma FAQ cadastrada.</p>}
          {faqs.map((f, i) => (
            <div key={i} className="p-3 rounded-xl border border-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">FAQ {i + 1}</span>
                <button onClick={() => removeFaq(i)} className="text-destructive hover:opacity-70"><Trash2 className="w-4 h-4" /></button>
              </div>
              <Input placeholder="Pergunta" value={f.q} onChange={(e) => updateFaq(i, { q: e.target.value })} />
              <Textarea rows={2} placeholder="Resposta" value={f.a} onChange={(e) => updateFaq(i, { a: e.target.value })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntencoesSection({ intents, setIntents }: { intents: Intent[]; setIntents: (v: Intent[]) => void }) {
  const add = () => setIntents([...intents, { id: crypto.randomUUID(), name: '', keywords: '', action: '' }]);
  const update = (i: number, p: Partial<Intent>) => setIntents(intents.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const remove = (i: number) => setIntents(intents.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <SectionHeader icon={Zap} title="Intenções" subtitle="Detecte palavras-chave e dispare ações automáticas." />
      <Button variant="outline" onClick={add}><Plus className="w-4 h-4 mr-2" />Adicionar intenção</Button>
      <div className="space-y-3">
        {intents.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma intenção configurada.</p>}
        {intents.map((it, i) => (
          <div key={it.id} className="p-4 rounded-xl border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Intenção {i + 1}</span>
              <button onClick={() => remove(i)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            <Input placeholder="Nome (ex: Solicitar orçamento)" value={it.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input placeholder="Palavras-chave separadas por vírgula" value={it.keywords} onChange={(e) => update(i, { keywords: e.target.value })} />
            <Textarea rows={2} placeholder="Ação ou resposta automática" value={it.action} onChange={(e) => update(i, { action: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegracoesSection({ integracoes, patch }: any) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Wifi} title="Integrações" subtitle="Conecte serviços externos para ampliar o agente." />
      <ToggleCard
        title="Google Calendar"
        desc="Permite que o agente crie agendamentos no Google Calendar"
        checked={!!integracoes.calendar}
        onChange={(v) => patch({ calendar: v })}
      />
      <ToggleCard
        title="ElevenLabs (voz)"
        desc="Habilita respostas em áudio com voz natural"
        checked={!!integracoes.elevenlabs}
        onChange={(v) => patch({ elevenlabs: v })}
      />
      <div className="p-4 rounded-xl border border-border">
        <Label>Provedor PIX (opcional)</Label>
        <Input className="mt-2" value={integracoes.pixProvider || ''} onChange={(e) => patch({ pixProvider: e.target.value })} placeholder="Mercado Pago, Asaas, etc." />
      </div>
    </div>
  );
}

function ArquivosSection({ agentId, files, reload }: { agentId: string; files: { name: string; size: number }[]; reload: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    const { error } = await supabase.storage.from('agent-files').upload(`${agentId}/${file.name}`, file, { upsert: true });
    setUploading(false);
    if (error) return toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    toast({ title: 'Arquivo enviado' });
    reload();
  };
  const remove = async (name: string) => {
    if (!confirm(`Excluir "${name}"?`)) return;
    const { error } = await supabase.storage.from('agent-files').remove([`${agentId}/${name}`]);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    reload();
  };

  return (
    <div className="space-y-5">
      <SectionHeader icon={Folder} title="Arquivos" subtitle="Documentos que o agente pode consultar." />
      <div className="flex items-center gap-3">
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Enviar arquivo
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <span className="text-xs text-muted-foreground">PDF, TXT, DOCX, etc.</span>
      </div>
      <div className="space-y-2">
        {files.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Nenhum arquivo enviado.</p>}
        {files.map((f) => (
          <div key={f.name} className="flex items-center justify-between p-3 rounded-xl border border-border">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm truncate">{f.name}</p>
                <p className="text-[11px] text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={() => remove(f.name)} className="text-destructive hover:opacity-70"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function McpSection({ servers, setServers }: { servers: McpServer[]; setServers: (v: McpServer[]) => void }) {
  const add = () => setServers([...servers, { id: crypto.randomUUID(), name: '', url: '', token: '' }]);
  const update = (i: number, p: Partial<McpServer>) => setServers(servers.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const remove = (i: number) => setServers(servers.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-5">
      <SectionHeader icon={Server} title="Servidores MCP" subtitle="Conecte servidores Model Context Protocol para expandir as ferramentas do agente." />
      <Button variant="outline" onClick={add}><Plus className="w-4 h-4 mr-2" />Adicionar servidor</Button>
      <div className="space-y-3">
        {servers.map((s, i) => (
          <div key={s.id} className="p-4 rounded-xl border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Servidor {i + 1}</span>
              <button onClick={() => remove(i)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            <Input placeholder="Nome" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input placeholder="URL (https://...)" value={s.url} onChange={(e) => update(i, { url: e.target.value })} />
            <Input placeholder="Token (opcional)" type="password" value={s.token} onChange={(e) => update(i, { token: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AcessoSection({ acesso, patch }: any) {
  const PAGES = ['Chat', 'Pipeline', 'Tickets', 'Calendário', 'Relatórios', 'Cadastros'];
  const toggle = (p: string) => {
    const cur: string[] = acesso.pages || [];
    patch({ pages: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  };
  return (
    <div className="space-y-5">
      <SectionHeader icon={Globe} title="Acesso Plataforma" subtitle="Defina quais páginas o agente pode acessar via API interna." />
      <ToggleCard
        title="Habilitar acesso à plataforma"
        desc="Permite que o agente leia dados internos (leads, conversas, etc.)"
        checked={!!acesso.enabled}
        onChange={(v) => patch({ enabled: v })}
      />
      {acesso.enabled && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
          {PAGES.map((p) => {
            const active = acesso.pages?.includes(p);
            return (
              <button key={p} onClick={() => toggle(p)} className={`p-3 rounded-xl border text-sm text-left transition-colors ${active ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
                {active ? <Check className="w-3.5 h-3.5 inline mr-2 text-primary" /> : null}
                {p}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WidgetSection({ agentId, widget, patch }: any) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="https://leadseller.app/widget.js" data-agent="${agentId}"></script>`;
  const copy = () => { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="space-y-5">
      <SectionHeader icon={Globe} title="Widget Web" subtitle="Incorpore o agente em qualquer site." />
      <ToggleCard
        title="Habilitar Widget Web"
        desc="Disponibiliza um chat flutuante para incorporar em sites"
        checked={!!widget.enabled}
        onChange={(v) => patch({ enabled: v })}
      />
      {widget.enabled && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Cor primária</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={widget.primaryColor} onChange={(e) => patch({ primaryColor: e.target.value })} className="w-10 h-10 rounded border" />
                <Input value={widget.primaryColor} onChange={(e) => patch({ primaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Posição</Label>
              <Select value={widget.position} onValueChange={(v) => patch({ position: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="right">Direita</SelectItem>
                  <SelectItem value="left">Esquerda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Saudação inicial</Label>
            <Input value={widget.greeting} onChange={(e) => patch({ greeting: e.target.value })} />
          </div>
          <div>
            <Label>Código de incorporação</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 rounded-lg bg-secondary text-xs overflow-x-auto">{snippet}</code>
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Configurações section (with internal tabs)
// ============================================================
function ConfiguracoesSection({ config, setConfig, patchConfig }: any) {
  const [tab, setTab] = useState<'conversa' | 'interativo' | 'inatividade' | 'webhooks' | 'transferencia'>('conversa');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const TABS = [
    { key: 'conversa', label: 'Conversa' },
    { key: 'interativo', label: 'Interativo' },
    { key: 'inatividade', label: 'Inatividade' },
    { key: 'webhooks', label: 'Webhooks' },
    { key: 'transferencia', label: 'Transferência' },
  ] as const;

  return (
    <div className="space-y-5">
      <SectionHeader icon={SettingsIcon} title="Configurações" />
      <div className="flex items-center gap-1 p-1 bg-secondary rounded-xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'conversa' && <ConversaTab conversa={config.conversa || {}} patch={(p: any) => patchConfig('conversa', p)} />}
      {tab === 'interativo' && <InterativoTab interativo={config.interativo || {}} patch={(p: any) => patchConfig('interativo', p)} />}
      {tab === 'inatividade' && <InatividadeTab actions={config.inatividade?.actions || []} setActions={(v: any) => patchConfig('inatividade', { actions: v })} />}
      {tab === 'webhooks' && <WebhooksTab webhooks={config.webhooks || []} setWebhooks={(v: any) => setConfig({ webhooks: v })} />}
      {tab === 'transferencia' && <TransferenciaTab rules={config.transferencia?.rules || []} setRules={(v: any) => patchConfig('transferencia', { rules: v })} />}

      <button onClick={() => setShowAdvanced((s) => !s)} className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          <span className="text-sm font-semibold">Configurações Avançadas</span>
        </div>
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {showAdvanced && <AdvancedSettings advanced={config.advanced || {}} patch={(p: any) => patchConfig('advanced', p)} />}
    </div>
  );
}

function ConversaTab({ conversa, patch }: any) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold flex items-center gap-2"><MessageCircle className="w-4 h-4" />Configurações de Conversa</h3>
      <div className="p-5 rounded-xl border border-border space-y-4">
        <RowToggle title="Transferir para humano" desc="Permitir transferência para atendente humano" checked={!!conversa.transferHuman} onChange={(v) => patch({ transferHuman: v })} />
        <RowToggle title="Pausar IA quando humano responder" desc="Quando alguém responder pelo celular, o agente para automaticamente" checked={!!conversa.pauseWhenHuman} onChange={(v) => patch({ pauseWhenHuman: v })} />
        <RowToggle title="Usar emojis" desc="Permitir o uso de emojis nas respostas" checked={!!conversa.useEmojis} onChange={(v) => patch({ useEmojis: v })} />
        <RowToggle title="Assinar nome do agente" desc="Incluir nome do agente nas mensagens" checked={!!conversa.signName} onChange={(v) => patch({ signName: v })} />
        <RowToggle title="Restringir tópicos" desc="Limitar conversas a tópicos específicos" checked={!!conversa.restrictTopics} onChange={(v) => patch({ restrictTopics: v })} />
        <RowToggle title="Dividir mensagens longas" desc="Separar mensagens muito longas automaticamente" checked={!!conversa.splitLong} onChange={(v) => patch({ splitLong: v })} />
        {conversa.splitLong && (
          <div className="grid grid-cols-2 gap-3 pl-2">
            <div>
              <Label className="text-xs">Tamanho do chunk (caracteres)</Label>
              <Input type="number" value={conversa.chunkSize ?? 500} onChange={(e) => patch({ chunkSize: Number(e.target.value) })} />
              <p className="text-[10px] text-muted-foreground mt-1">Entre 200 e 2000</p>
            </div>
            <div>
              <Label className="text-xs">Intervalo entre mensagens (ms)</Label>
              <Input type="number" value={conversa.chunkDelayMs ?? 10000} onChange={(e) => patch({ chunkDelayMs: Number(e.target.value) })} />
              <p className="text-[10px] text-muted-foreground mt-1">Entre 500ms e 10000ms</p>
            </div>
          </div>
        )}
        <RowToggle title='Mostrar "digitando..."' desc="Exibe indicador de digitação para o cliente" checked={!!conversa.showTyping} onChange={(v) => patch({ showTyping: v })} />
        <RowToggle title="Permitir lembretes" desc="Agente pode criar lembretes" checked={!!conversa.allowReminders} onChange={(v) => patch({ allowReminders: v })} />
        <RowToggle title="Busca inteligente" desc="Ativar busca avançada com IA" badge="Beta" checked={!!conversa.smartSearch} onChange={(v) => patch({ smartSearch: v })} />
        <div className="pt-2">
          <Label className="text-xs">Fuso horário</Label>
          <Select value={conversa.timezone || 'America/Sao_Paulo'} onValueChange={(v) => patch({ timezone: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="America/Sao_Paulo">Brasília (GMT-3)</SelectItem>
              <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
              <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs"># Limite de interações</Label>
          <Select value={conversa.interactionLimit || 'unlimited'} onValueChange={(v) => patch({ interactionLimit: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unlimited">Sem limite</SelectItem>
              <SelectItem value="10">10 por conversa</SelectItem>
              <SelectItem value="20">20 por conversa</SelectItem>
              <SelectItem value="50">50 por conversa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function InterativoTab({ interativo, patch }: any) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4" />Recursos Interativos</h3>
      <p className="text-sm text-muted-foreground">Habilite recursos avançados para o agente enviar mensagens interativas e cobranças.</p>
      <ToggleCard icon={<CalendarIcon className="w-5 h-5 text-primary" />} title="📆 Calendário Interno" desc="Agendamentos aparecem na página de Calendário do sistema (sem Google)" checked={!!interativo.internalCalendar} onChange={(v) => patch({ internalCalendar: v })} />
      <div className="p-3 rounded-xl bg-success/10 border border-success/30">
        <p className="text-sm flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-success" /> ✅ Google Calendar está conectado e será usado para agendamentos</p>
      </div>
      <ToggleCard title="Botões Interativos" desc="Permite ao agente enviar listas e botões clicáveis" checked={!!interativo.interactiveButtons} onChange={(v) => patch({ interactiveButtons: v })} />
      <ToggleCard title="Cobranças PIX" desc="Permite ao agente enviar botões de pagamento PIX nativos" checked={!!interativo.pixCharges} onChange={(v) => patch({ pixCharges: v })} />
    </div>
  );
}

function InatividadeTab({ actions, setActions }: { actions: InactivityAction[]; setActions: (v: InactivityAction[]) => void }) {
  const add = () => setActions([...actions, { id: crypto.randomUUID(), after: '1 hora', action: 'interagir', message: 'Olá, conseguiu ver minha última mensagem?' }]);
  const update = (i: number, p: Partial<InactivityAction>) => setActions(actions.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const remove = (i: number) => setActions(actions.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold flex items-center gap-2"><Clock className="w-4 h-4" />Ações de Inatividade</h3>
      <p className="text-sm text-muted-foreground">Configure ações que o agente deve executar quando o cliente parar de responder.</p>
      {actions.map((a, i) => (
        <div key={a.id} className="p-4 rounded-xl border border-border space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm">Se não responder em</span>
              <Select value={a.after} onValueChange={(v) => update(i, { after: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15 min">15 min</SelectItem>
                  <SelectItem value="30 min">30 min</SelectItem>
                  <SelectItem value="1 hora">1 hora</SelectItem>
                  <SelectItem value="2 horas">2 horas</SelectItem>
                  <SelectItem value="24 horas">24 horas</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm">o agente deve</span>
              <Select value={a.action} onValueChange={(v) => update(i, { action: v })}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interagir">Interagir com cliente.</SelectItem>
                  <SelectItem value="encerrar">Encerrar conversa.</SelectItem>
                  <SelectItem value="transferir">Transferir para humano.</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button onClick={() => remove(i)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Mensagem</Label>
              <span className="text-[10px] text-muted-foreground">{(a.message || '').length}/512</span>
            </div>
            <Textarea rows={3} value={a.message} onChange={(e) => update(i, { message: e.target.value })} />
          </div>
        </div>
      ))}
      <Button variant="outline" className="w-full" onClick={add}><Plus className="w-4 h-4 mr-2" />Adicionar ação anterior</Button>
    </div>
  );
}

function WebhooksTab({ webhooks, setWebhooks }: { webhooks: Webhook[]; setWebhooks: (v: Webhook[]) => void }) {
  const add = () => setWebhooks([...webhooks, { id: crypto.randomUUID(), name: '', url: '', event: 'message.received', active: true }]);
  const update = (i: number, p: Partial<Webhook>) => setWebhooks(webhooks.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const remove = (i: number) => setWebhooks(webhooks.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold flex items-center gap-2"><Webhook className="w-4 h-4" />Webhooks</h3>
      <p className="text-sm text-muted-foreground">Envie eventos do agente para sistemas externos.</p>
      <Button variant="outline" onClick={add}><Plus className="w-4 h-4 mr-2" />Adicionar webhook</Button>
      {webhooks.map((w, i) => (
        <div key={w.id} className="p-4 rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Webhook {i + 1}</span>
            <div className="flex items-center gap-3">
              <Switch checked={w.active} onCheckedChange={(v) => update(i, { active: v })} />
              <button onClick={() => remove(i)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <Input placeholder="Nome" value={w.name} onChange={(e) => update(i, { name: e.target.value })} />
          <Input placeholder="https://seu-endpoint.com/webhook" value={w.url} onChange={(e) => update(i, { url: e.target.value })} />
          <Select value={w.event} onValueChange={(v) => update(i, { event: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="message.received">Mensagem recebida</SelectItem>
              <SelectItem value="message.sent">Mensagem enviada</SelectItem>
              <SelectItem value="conversation.started">Conversa iniciada</SelectItem>
              <SelectItem value="conversation.ended">Conversa encerrada</SelectItem>
              <SelectItem value="transfer.requested">Transferência solicitada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

function TransferenciaTab({ rules, setRules }: { rules: TransferRule[]; setRules: (v: TransferRule[]) => void }) {
  const add = () => setRules([...rules, { id: crypto.randomUUID(), type: 'agent', target: '', when: '', clientMessage: '', internalNote: '' }]);
  const update = (i: number, p: Partial<TransferRule>) => setRules(rules.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const remove = (i: number) => setRules(rules.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" />Regras de Transferência</h3>
      {rules.map((r, i) => (
        <div key={r.id} className="p-5 rounded-xl border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Regra {i + 1}</span>
            <button onClick={() => remove(i)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
          <div>
            <Label>Tipo de transferência</Label>
            <Select value={r.type} onValueChange={(v: any) => update(i, { type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">🤖 Agente IA</SelectItem>
                <SelectItem value="team">👥 Equipe</SelectItem>
                <SelectItem value="queue">📋 Fila</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Transferir para ({r.type === 'agent' ? 'Agente IA' : r.type === 'team' ? 'Equipe' : 'Fila'})</Label>
            <Input placeholder="Selecione..." value={r.target} onChange={(e) => update(i, { target: e.target.value })} />
          </div>
          <div>
            <Label>Quando transferir (instruções para IA)</Label>
            <Textarea rows={2} placeholder="Ex: Cliente menciona financiamento, preços ou formas de pagamento" value={r.when} onChange={(e) => update(i, { when: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">Descreva quando este agente deve fazer a transferência</p>
          </div>
          <div>
            <Label>Mensagem para o cliente</Label>
            <Textarea rows={2} placeholder="Ex: Vou te transferir para nossa equipe financeira..." value={r.clientMessage} onChange={(e) => update(i, { clientMessage: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">Esta mensagem será enviada ao cliente antes da transferência</p>
          </div>
          <div>
            <Label>Instruções internas para o próximo agente</Label>
            <Textarea rows={2} placeholder="Ex: Este cliente quer informações sobre financiamento..." value={r.internalNote} onChange={(e) => update(i, { internalNote: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">Contexto interno que será passado ao próximo agente (o cliente não verá)</p>
          </div>
        </div>
      ))}
      <Button variant="outline" className="w-full" onClick={add}><Plus className="w-4 h-4 mr-2" />Adicionar regra de transferência</Button>
    </div>
  );
}

function AdvancedSettings({ advanced, patch }: any) {
  return (
    <div className="p-5 rounded-xl border border-border space-y-4">
      <div>
        <Label>Criatividade (Temperature): {(advanced.temperature ?? 0.7).toFixed(2)}</Label>
        <Slider min={0} max={2} step={0.05} value={[advanced.temperature ?? 0.7]} onValueChange={(v) => patch({ temperature: v[0] })} className="mt-3" />
        <p className="text-[11px] text-muted-foreground mt-1">0 = Mais preciso, 1 = Mais criativo</p>
      </div>
      <div>
        <Label>Tamanho Máximo da Resposta</Label>
        <Input type="number" value={advanced.maxTokens ?? 500} onChange={(e) => patch({ maxTokens: Number(e.target.value) })} />
      </div>
      <div>
        <Label>Delay de Resposta (Buffer) em ms</Label>
        <Input type="number" placeholder="0" value={advanced.delayBufferMs ?? 0} onChange={(e) => patch({ delayBufferMs: Number(e.target.value) })} />
        <p className="text-[11px] text-muted-foreground mt-1">⏱ Tempo de espera antes de processar a resposta. Útil para agrupar múltiplas mensagens.<br /><strong>Recomendado: 10-30 segundos para conversas normais.</strong></p>
      </div>
      <RowToggle title="Auto-resposta Ativa" desc="Responde automaticamente às mensagens" checked={advanced.autoReply ?? true} onChange={(v) => patch({ autoReply: v })} />
      <RowToggle title="Agente Ativo" desc="Permite que o agente atenda conversas" checked={advanced.agentActive ?? true} onChange={(v) => patch({ agentActive: v })} />
    </div>
  );
}

// ============================================================
// Test Dialog (uses ai-agent-chat edge function)
// ============================================================
function TestAgentDialog({ open, onClose, agent }: any) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim() || loading) return;
    const next = [...messages, { role: 'user' as const, content: input }];
    setMessages(next);
    setInput('');
    setLoading(true);
    const sys = agent.knowledge_base ? `${agent.system_prompt}\n\nBase de conhecimento:\n${agent.knowledge_base}` : agent.system_prompt;
    const { data, error } = await supabase.functions.invoke('ai-agent-chat', {
      body: { model: agent.model, system_prompt: sys, messages: next, temperature: agent.temperature, max_tokens: agent.max_tokens },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({ title: 'Erro', description: data?.error || error?.message, variant: 'destructive' });
      return;
    }
    setMessages([...next, { role: 'assistant', content: data.reply || '(sem resposta)' }]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="w-4 h-4" />Testar: {agent.name || 'Agente'}</DialogTitle>
        </DialogHeader>
        <div className="h-80 overflow-y-auto bg-secondary rounded-xl p-3 space-y-2">
          {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Envie uma mensagem para testar.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>{m.content}</div>
            </div>
          ))}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Digite uma mensagem..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} disabled={loading} />
          <Button onClick={send} disabled={loading || !input.trim()}>Enviar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Shared small UI
// ============================================================
function SectionHeader({ icon: Icon, title, subtitle }: any) {
  return (
    <div>
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" /> {title}
      </h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function RowToggle({ title, desc, checked, onChange, badge }: any) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium flex items-center gap-2">
          {title}
          {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
        </div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ToggleCard({ icon, title, desc, checked, onChange }: any) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border">
      <div className="flex items-center gap-3 flex-1">
        {icon}
        <div>
          <div className="text-sm font-medium">{title}</div>
          {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
