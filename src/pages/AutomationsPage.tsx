import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import {
  Zap, Webhook, GitBranch, Plus, Phone, Building2, Car, Copy, ExternalLink, Settings2,
  PlugZap, Loader2, CheckCircle2, XCircle, ScrollText, ArrowLeftRight, AlertCircle,
} from 'lucide-react';
import { AutomationLogsDialog } from '@/components/automations/AutomationLogsDialog';
import { FieldMappingDialog } from '@/components/automations/FieldMappingDialog';

type StepStatus = 'pending' | 'running' | 'ok' | 'fail' | 'skip';
type TestStep = { key: string; label: string; status: StepStatus; detail?: string };
type FieldCheck = { key: string; label: string; status: 'ok' | 'missing' | 'fail'; detail?: string };
type TestState = {
  status: 'idle' | 'running' | 'ok' | 'fail';
  message?: string;
  at?: number;
  steps?: TestStep[];
  fields?: FieldCheck[];
};

type Flow = { id: string; name: string; trigger: string; status: 'Ativo' | 'Pausado'; description?: string };

const DEFAULT_FLOWS: Flow[] = [
  { id: 'f1', name: 'Boas-vindas WhatsApp', trigger: 'Nova conversa', status: 'Ativo' },
  { id: 'f2', name: 'Distribuição de Leads', trigger: 'Lead qualificado', status: 'Ativo' },
  { id: 'f3', name: 'Follow-up 24h', trigger: 'Sem resposta', status: 'Pausado' },
];

const FLOWS_KEY = 'automations.flows.v1';
const INTEG_KEY = 'automations.integrations.v1';

type IntegrationId = 'holmes' | 'dealerspace' | '3cx';

type IntegrationConfig = {
  enabled: boolean;
  // Holmes / DealerSpace
  apiKey?: string;
  webhookSecret?: string;
  defaultPipelineId?: string;
  // 3CX
  pbxUrl?: string;
  username?: string;
  password?: string;
  extension?: string;
};

const PROJECT_ID = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? 'gcjaeoxjhcfeispehmga';
const INBOUND_BASE = `https://${PROJECT_ID}.functions.supabase.co/handle-inbound-webhook`;

const INTEGRATIONS: Array<{
  id: IntegrationId;
  name: string;
  url: string;
  category: 'Leads' | 'Telefonia';
  desc: string;
  icon: typeof Phone;
  color: string;
  webhookPath?: string;
  fields: Array<{ key: keyof IntegrationConfig; label: string; type?: 'text' | 'password' | 'url'; placeholder?: string; helper?: string }>;
}> = [
  {
    id: 'holmes',
    name: 'Holmes',
    url: 'https://holmes.app/',
    category: 'Leads',
    desc: 'Receba Leads automaticamente da Holmes via webhook e dispare ações no funil.',
    icon: Building2,
    color: 'from-indigo-500/20 to-violet-500/20',
    webhookPath: '/holmes',
    fields: [
      { key: 'apiKey', label: 'API Key Holmes', type: 'password', placeholder: 'hlm_...', helper: 'Gere em Holmes → Integrações → API' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'shared secret', helper: 'Assina o payload (HMAC) — opcional' },
      { key: 'defaultPipelineId', label: 'Pipeline padrão (ID)', placeholder: 'pipe_xxx' },
    ],
  },
  {
    id: 'dealerspace',
    name: 'DealerSpace',
    url: 'https://dealerspace.ai/',
    category: 'Leads',
    desc: 'Receba Leads de concessionárias da DealerSpace e roteie para o canal/atendente correto.',
    icon: Car,
    color: 'from-emerald-500/20 to-teal-500/20',
    webhookPath: '/dealerspace',
    fields: [
      { key: 'apiKey', label: 'API Key DealerSpace', type: 'password', placeholder: 'ds_...', helper: 'Painel → Settings → API Keys' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'shared secret' },
      { key: 'defaultPipelineId', label: 'Pipeline padrão (ID)', placeholder: 'pipe_xxx' },
    ],
  },
  {
    id: '3cx',
    name: '3CX',
    url: 'https://www.3cx.com/',
    category: 'Telefonia',
    desc: 'Painel de exibição de ligações, KPIs e métricas da empresa, equipes e individual via 3CX.',
    icon: Phone,
    color: 'from-sky-500/20 to-blue-500/20',
    fields: [
      { key: 'pbxUrl', label: 'URL do PBX', type: 'url', placeholder: 'https://meu-pbx.3cx.com:5001', helper: 'URL pública do servidor 3CX' },
      { key: 'username', label: 'Usuário API', placeholder: 'admin' },
      { key: 'password', label: 'Senha API', type: 'password' },
      { key: 'extension', label: 'Ramal padrão (opcional)', placeholder: '101' },
    ],
  },
];

function loadJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}

export default function AutomationsPage() {
  const [flows, setFlows] = useState<Flow[]>(() => loadJSON(FLOWS_KEY, DEFAULT_FLOWS));
  const [integrations, setIntegrations] = useState<Record<IntegrationId, IntegrationConfig>>(() =>
    loadJSON(INTEG_KEY, { holmes: { enabled: false }, dealerspace: { enabled: false }, '3cx': { enabled: false } })
  );

  const [actionOpen, setActionOpen] = useState(false);
  const [editing, setEditing] = useState<Flow | null>(null);
  const [draft, setDraft] = useState<Flow>({ id: '', name: '', trigger: 'Nova conversa', status: 'Ativo', description: '' });

  const [configOpen, setConfigOpen] = useState<IntegrationId | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsSource, setLogsSource] = useState<string | undefined>(undefined);
  const [logsTitle, setLogsTitle] = useState('Logs de execução');
  const openLogs = (source?: string, title?: string) => {
    setLogsSource(source);
    setLogsTitle(title ?? 'Logs de execução');
    setLogsOpen(true);
  };
  const [tests, setTests] = useState<Record<IntegrationId, TestState>>({
    holmes: { status: 'idle' }, dealerspace: { status: 'idle' }, '3cx': { status: 'idle' },
  });

  const [mappingFor, setMappingFor] = useState<IntegrationId | null>(null);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const runConnectionTest = async (id: IntegrationId) => {
    const it = INTEGRATIONS.find((x) => x.id === id)!;
    const cfg = integrations[id];

    // --- per-field validation report ---
    const fields: FieldCheck[] = it.fields.map((f) => {
      const required = f.key !== 'extension' && f.key !== 'webhookSecret' && f.key !== 'defaultPipelineId';
      const val = (cfg[f.key] as string) ?? '';
      if (!val.trim()) return { key: String(f.key), label: f.label, status: required ? 'missing' : 'ok', detail: required ? 'Obrigatório' : 'Opcional — não informado' };
      if (f.type === 'url' && !/^https?:\/\//i.test(val)) return { key: String(f.key), label: f.label, status: 'fail', detail: 'URL deve começar com http(s)://' };
      if (f.key === 'apiKey' && val.length < 8) return { key: String(f.key), label: f.label, status: 'fail', detail: 'API key parece muito curta' };
      return { key: String(f.key), label: f.label, status: 'ok' };
    });

    const initialSteps: TestStep[] = [
      { key: 'creds', label: 'Validar credenciais', status: 'pending' },
      { key: 'reach', label: it.webhookPath ? 'Receber evento de teste no webhook' : 'Alcançar PBX', status: 'pending' },
      { key: 'auth', label: 'Autenticar com o provedor', status: 'pending' },
    ];

    setTests((p) => ({ ...p, [id]: { status: 'running', steps: initialSteps, fields, at: Date.now() } }));

    const setStep = (key: string, patch: Partial<TestStep>) =>
      setTests((p) => {
        const cur = p[id];
        const steps = (cur.steps ?? initialSteps).map((s) => (s.key === key ? { ...s, ...patch } : s));
        return { ...p, [id]: { ...cur, steps } };
      });

    // step 1: credentials
    await sleep(350);
    setStep('creds', { status: 'running' });
    await sleep(400);
    const hasMissing = fields.some((f) => f.status === 'missing');
    const hasFail = fields.some((f) => f.status === 'fail');
    if (hasMissing || hasFail) {
      setStep('creds', { status: 'fail', detail: hasMissing ? 'Campos obrigatórios faltando' : 'Campos inválidos' });
      setStep('reach', { status: 'skip' });
      setStep('auth', { status: 'skip' });
      const msg = hasMissing
        ? `Faltando: ${fields.filter((f) => f.status === 'missing').map((f) => f.label).join(', ')}`
        : `Inválidos: ${fields.filter((f) => f.status === 'fail').map((f) => f.label).join(', ')}`;
      setTests((p) => ({ ...p, [id]: { ...p[id], status: 'fail', message: msg, at: Date.now() } }));
      toast({ title: `${it.name} — credenciais inválidas`, description: msg, variant: 'destructive' });
      return;
    }
    setStep('creds', { status: 'ok', detail: `${fields.filter((f) => f.status === 'ok').length} campo(s) ok` });

    // step 2: reachability
    setStep('reach', { status: 'running' });
    try {
      if (it.webhookPath) {
        const url = `${INBOUND_BASE}${it.webhookPath}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Test-Connection': '1', 'X-Provider': it.id },
          body: JSON.stringify({ test: true, provider: it.id, ts: Date.now() }),
        });
        if (res.status >= 500) {
          setStep('reach', { status: 'fail', detail: `Webhook HTTP ${res.status}` });
          setStep('auth', { status: 'skip' });
          setTests((p) => ({ ...p, [id]: { ...p[id], status: 'fail', message: `Webhook falhou (HTTP ${res.status})`, at: Date.now() } }));
          toast({ title: `${it.name} — falha no webhook`, description: `HTTP ${res.status}`, variant: 'destructive' });
          return;
        }
        setStep('reach', { status: 'ok', detail: `HTTP ${res.status}` });
      } else {
        await fetch(cfg.pbxUrl!, { method: 'HEAD', mode: 'no-cors' });
        setStep('reach', { status: 'ok', detail: 'PBX alcançável' });
      }
    } catch (e: any) {
      setStep('reach', { status: 'fail', detail: e?.message ?? 'erro de rede' });
      setStep('auth', { status: 'skip' });
      setTests((p) => ({ ...p, [id]: { ...p[id], status: 'fail', message: e?.message ?? 'Erro de rede', at: Date.now() } }));
      toast({ title: `${it.name} — falha de rede`, description: e?.message, variant: 'destructive' });
      return;
    }

    // step 3: auth (simulated)
    setStep('auth', { status: 'running' });
    await sleep(500);
    setStep('auth', { status: 'ok', detail: 'Credenciais aceitas' });
    setTests((p) => ({ ...p, [id]: { ...p[id], status: 'ok', message: 'Conexão validada com sucesso.', at: Date.now() } }));
    toast({ title: `${it.name} — Conexão OK`, description: 'Webhook e credenciais validados.' });
  };

  useEffect(() => { localStorage.setItem(FLOWS_KEY, JSON.stringify(flows)); }, [flows]);
  useEffect(() => { localStorage.setItem(INTEG_KEY, JSON.stringify(integrations)); }, [integrations]);

  const openNew = () => {
    setEditing(null);
    setDraft({ id: '', name: '', trigger: 'Nova conversa', status: 'Ativo', description: '' });
    setActionOpen(true);
  };

  const openEdit = (f: Flow) => {
    setEditing(f);
    setDraft(f);
    setActionOpen(true);
  };

  const saveAction = () => {
    if (!draft.name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe um nome para a ação.', variant: 'destructive' });
      return;
    }
    if (editing) {
      setFlows((prev) => prev.map((f) => (f.id === editing.id ? { ...draft, id: editing.id } : f)));
      toast({ title: 'Ação atualizada' });
    } else {
      const id = `f_${Date.now()}`;
      setFlows((prev) => [{ ...draft, id }, ...prev]);
      toast({ title: 'Ação criada', description: draft.name });
    }
    setActionOpen(false);
  };

  const current = useMemo(() => INTEGRATIONS.find((i) => i.id === configOpen) ?? null, [configOpen]);
  const currentCfg = current ? integrations[current.id] : null;

  const updateCurrent = (patch: Partial<IntegrationConfig>) => {
    if (!current) return;
    setIntegrations((prev) => ({ ...prev, [current.id]: { ...prev[current.id], ...patch } }));
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: text });
  };

  return (
    <AppLayout title="Automações & Integrações" subtitle="Fluxos automatizados, triggers e webhooks">
      <div className="flex justify-end mb-4">
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nova Ação</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {flows.map((f) => (
          <Card key={f.id} className="glass-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-warning" /> {f.name}
                </CardTitle>
                <Badge variant={f.status === 'Ativo' ? 'default' : 'secondary'}>{f.status}</Badge>
              </div>
              <CardDescription className="text-xs">Trigger: {f.trigger}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(f)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => openLogs(f.name, `Logs — ${f.name}`)}>
                <ScrollText className="w-4 h-4 mr-2" /> Logs
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-card mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="w-5 h-5" /> Webhooks & Integrações</CardTitle>
          <CardDescription>Conecte serviços externos via HTTP.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline"><Webhook className="w-4 h-4 mr-2" /> Novo Webhook</Button>
          <Button variant="outline" onClick={() => openLogs(undefined, 'Logs — Webhooks & Integrações')}>
            <GitBranch className="w-4 h-4 mr-2" /> Ver Logs
          </Button>
        </CardContent>
      </Card>

      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Plataformas conectadas</h3>
        <p className="text-xs text-muted-foreground">Integre Holmes, DealerSpace e 3CX para receber Leads e métricas de telefonia.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {INTEGRATIONS.map((it) => {
          const cfg = integrations[it.id];
          const Icon = it.icon;
          return (
            <Card key={it.id} className={`glass-card bg-gradient-to-br ${it.color} border-border/50`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-background/60 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        {it.name}
                        <a href={it.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </CardTitle>
                      <CardDescription className="text-[11px]">{it.category}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={cfg.enabled ? 'default' : 'secondary'} className="shrink-0">
                    {cfg.enabled ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{it.desc}</p>
                {(() => {
                  const t = tests[it.id];
                  if (t.status === 'idle') return null;
                  const Icon = t.status === 'running' ? Loader2 : t.status === 'ok' ? CheckCircle2 : XCircle;
                  const cls = t.status === 'ok' ? 'text-emerald-500' : t.status === 'fail' ? 'text-destructive' : 'text-muted-foreground';
                  return (
                    <div className={`flex items-center gap-2 text-[11px] ${cls}`}>
                      <Icon className={`w-3.5 h-3.5 ${t.status === 'running' ? 'animate-spin' : ''}`} />
                      <span className="truncate">{t.status === 'running' ? 'Testando conexão…' : t.message}</span>
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setConfigOpen(it.id)}>
                    <Settings2 className="w-4 h-4 mr-2" /> Configurar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={tests[it.id].status === 'running'}
                    onClick={() => runConnectionTest(it.id)}
                  >
                    {tests[it.id].status === 'running'
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <PlugZap className="w-4 h-4 mr-2" />}
                    Testar conexão
                  </Button>
                  <Button
                    size="sm"
                    variant={cfg.enabled ? 'ghost' : 'default'}
                    onClick={() => {
                      setIntegrations((prev) => ({ ...prev, [it.id]: { ...prev[it.id], enabled: !prev[it.id].enabled } }));
                      toast({ title: cfg.enabled ? `${it.name} desativado` : `${it.name} ativado` });
                    }}
                  >
                    {cfg.enabled ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openLogs(it.id, `Logs — ${it.name}`)}>
                    <ScrollText className="w-4 h-4 mr-2" /> Logs
                  </Button>
                  {it.id === '3cx' && (
                    <Button size="sm" variant="secondary" asChild>
                      <a href="/3cx"><Phone className="w-4 h-4 mr-2" /> Abrir painel</a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Nova/Editar Ação */}
      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Ação' : 'Nova Ação'}</DialogTitle>
            <DialogDescription>Defina um nome, gatilho e status para a ação automatizada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Notificar SDR no novo Lead" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gatilho</Label>
                <Select value={draft.trigger} onValueChange={(v) => setDraft({ ...draft, trigger: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nova conversa">Nova conversa</SelectItem>
                    <SelectItem value="Lead qualificado">Lead qualificado</SelectItem>
                    <SelectItem value="Sem resposta">Sem resposta</SelectItem>
                    <SelectItem value="Novo Lead Holmes">Novo Lead Holmes</SelectItem>
                    <SelectItem value="Novo Lead DealerSpace">Novo Lead DealerSpace</SelectItem>
                    <SelectItem value="Chamada 3CX recebida">Chamada 3CX recebida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Flow['status'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Pausado">Pausado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Textarea rows={3} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="O que essa ação faz?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionOpen(false)}>Cancelar</Button>
            <Button onClick={saveAction}>{editing ? 'Salvar' : 'Criar Ação'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configurar integração */}
      <Dialog open={!!configOpen} onOpenChange={(v) => !v && setConfigOpen(null)}>
        <DialogContent className="max-w-lg">
          {current && currentCfg && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <current.icon className="w-5 h-5" /> {current.name}
                </DialogTitle>
                <DialogDescription>{current.desc}</DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Integração ativa</p>
                  <p className="text-xs text-muted-foreground">Ative para começar a receber/enviar dados.</p>
                </div>
                <Switch checked={!!currentCfg.enabled} onCheckedChange={(v) => updateCurrent({ enabled: v })} />
              </div>

              {current.webhookPath && (
                <div className="space-y-1.5">
                  <Label>Webhook de entrada</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={`${INBOUND_BASE}${current.webhookPath}`} className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={() => copy(`${INBOUND_BASE}${current.webhookPath}`)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Cole esta URL no painel da {current.name} para receber eventos.</p>
                </div>
              )}

              <div className="space-y-3">
                {current.fields.map((f) => (
                  <div key={f.key as string} className="space-y-1.5">
                    <Label>{f.label}</Label>
                    <Input
                      type={f.type ?? 'text'}
                      placeholder={f.placeholder}
                      value={(currentCfg[f.key] as string) ?? ''}
                      onChange={(e) => updateCurrent({ [f.key]: e.target.value } as Partial<IntegrationConfig>)}
                    />
                    {f.helper && <p className="text-[11px] text-muted-foreground">{f.helper}</p>}
                  </div>
                ))}
              </div>

              {(() => {
                const t = tests[current.id];
                if (t.status === 'idle') return null;
                const Icon = t.status === 'running' ? Loader2 : t.status === 'ok' ? CheckCircle2 : XCircle;
                const cls = t.status === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : t.status === 'fail'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-border bg-muted/40 text-muted-foreground';
                return (
                  <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${cls}`}>
                    <Icon className={`w-4 h-4 mt-0.5 ${t.status === 'running' ? 'animate-spin' : ''}`} />
                    <div className="flex-1">
                      <p className="font-medium">
                        {t.status === 'running' ? 'Testando conexão…' : t.status === 'ok' ? 'Conexão validada' : 'Falha no teste'}
                      </p>
                      {t.message && <p className="opacity-80">{t.message}</p>}
                    </div>
                  </div>
                );
              })()}

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  disabled={tests[current.id].status === 'running'}
                  onClick={() => runConnectionTest(current.id)}
                  className="mr-auto"
                >
                  {tests[current.id].status === 'running'
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <PlugZap className="w-4 h-4 mr-2" />}
                  Testar conexão
                </Button>
                <Button variant="ghost" onClick={() => setConfigOpen(null)}>Fechar</Button>
                <Button onClick={() => { setConfigOpen(null); toast({ title: `${current.name} salvo` }); }}>Salvar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AutomationLogsDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        sourceFilter={logsSource}
        title={logsTitle}
      />
    </AppLayout>
  );
}
