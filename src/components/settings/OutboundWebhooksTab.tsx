import { useEffect, useState } from 'react';
import { 
  Webhook as WebhookIcon, 
  Plus, 
  Trash2, 
  Power, 
  Loader2, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  Search, 
  Calendar,
  Settings,
  ListRestart,
  Code2,
  ChevronRight,
  MoreVertical,
  Activity,
  ArrowRight,
  Database,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  History,
  Download,
  Terminal,
  FileJson,
  FlaskConical,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import WebhookLogsTab from './WebhookLogsTab';
import WebhookAuditTab from './WebhookAuditTab';
import WebhookHealthDashboard from './WebhookHealthDashboard';
import OutboundWebhookTestConsole from './OutboundWebhookTestConsole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion } from 'framer-motion';

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  previous_secret: string | null;
  secret_version: number;
  last_rotated_at: string | null;
  api_key_id: string | null;
  events: string[];
  is_active: boolean;
  created_at: string;
  type: string;
  max_retries: number;
  timeout_seconds: number;
  alert_slack_url?: string;
  alert_email?: string;
  alert_threshold?: number;
  payload_schema?: any;
  idempotency_header?: string;
  idempotency_missing_behavior?: string;
  idempotency_ttl_hours?: number;
}

const EVENT_GROUPS = [
  { name: 'Mensagens',   events: [['message.received','Mensagem recebida'],['message.sent','Mensagem enviada'],['message.delivered','Mensagem entregue'],['message.read','Mensagem lida']] },
  { name: 'Conversas',   events: [['conversation.assigned','Conversa atribuída'],['conversation.closed','Conversa encerrada'],['conversation.reopened','Conversa reaberta']] },
  { name: 'Leads',       events: [['lead.created','Lead criado'],['lead.updated','Lead atualizado'],['lead.deleted','Lead excluído'],['lead.stage_changed','Lead mudou de estágio']] },
  { name: 'Agendamentos', events: [['appointment.created','Agendamento criado'],['appointment.cancelled','Agendamento cancelado']] },
  { name: 'Automações',  events: [['automation.completed','Automação concluída'],['automation.failed','Automação falhou']] },
] as const;

function randomSecret() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function OutboundWebhooksTab() {
  const [items, setItems] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  
  // Form state
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({ 
    name: '', 
    url: '', 
    secret: randomSecret(), 
    previous_secret: null as string | null,
    secret_version: 1,
    events: [] as string[],
    is_active: true,
    max_retries: 3,
    timeout_seconds: 30,
    alert_slack_url: '',
    alert_email: '',
    alert_threshold: 3,
    idempotency_header: 'X-Idempotency-Key',
    idempotency_missing_behavior: 'generate',
    idempotency_ttl_hours: 24
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('type', 'outbound')
      .order('created_at', { ascending: false });
    
    if (error) {
      toast({ title: 'Erro ao carregar webhooks', description: error.message, variant: 'destructive' });
    } else {
      setItems((data as Webhook[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ 
      name: '', 
      url: '', 
      secret: randomSecret(), 
      previous_secret: null,
      secret_version: 1,
      events: [],
      is_active: true,
      max_retries: 3,
      timeout_seconds: 30,
      alert_slack_url: '',
      alert_email: '',
      alert_threshold: 3,
      idempotency_header: 'X-Idempotency-Key',
      idempotency_missing_behavior: 'generate'
    });
    setSelectedWebhook(null);
    setView('edit');
  };

  const openEdit = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setForm({
      name: webhook.name || '',
      url: webhook.url,
      secret: webhook.secret || '',
      previous_secret: webhook.previous_secret,
      secret_version: webhook.secret_version || 1,
      events: webhook.events || [],
      is_active: webhook.is_active,
      max_retries: webhook.max_retries || 3,
      timeout_seconds: webhook.timeout_seconds || 30,
      alert_slack_url: webhook.alert_slack_url || '',
      alert_email: webhook.alert_email || '',
      alert_threshold: webhook.alert_threshold || 3,
      idempotency_header: webhook.idempotency_header || 'X-Idempotency-Key',
      idempotency_missing_behavior: webhook.idempotency_missing_behavior || 'generate'
    });
    setView('edit');
  };

  const toggleEvent = (ev: string) => {
    setForm((f) => ({ 
      ...f, 
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev] 
    }));
  };

  const selectGroup = (groupEvents: readonly (readonly [string, string])[]) => {
    const ids = groupEvents.map(([id]) => id);
    const allSelected = ids.every((id) => form.events.includes(id));
    setForm((f) => ({ 
      ...f, 
      events: allSelected ? f.events.filter((e) => !ids.includes(e)) : Array.from(new Set([...f.events, ...ids])) 
    }));
  };

  const save = async () => {
    if (!form.name || !form.url || form.events.length === 0) {
      toast({ title: 'Preencha os campos obrigatórios e selecione ao menos 1 evento', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      name: form.name,
      url: form.url,
      secret: form.secret,
      previous_secret: form.previous_secret,
      secret_version: form.secret_version,
      events: form.events,
      is_active: form.is_active,
      max_retries: form.max_retries,
      timeout_seconds: form.timeout_seconds,
      alert_slack_url: form.alert_slack_url,
      alert_email: form.alert_email,
      alert_threshold: form.alert_threshold,
      idempotency_header: form.idempotency_header,
      idempotency_missing_behavior: form.idempotency_missing_behavior,
      created_by: user.id,
      type: 'outbound'
    };

    let error;
    if (selectedWebhook) {
      const { error: err } = await supabase
        .from('webhooks')
        .update(payload)
        .eq('id', selectedWebhook.id);
      error = err;
    } else {
      const { error: err } = await supabase
        .from('webhooks')
        .insert(payload);
      error = err;
    }

    setSaving(false);
    if (error) { 
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); 
      return; 
    }
    
    toast({ title: selectedWebhook ? 'Webhook atualizado' : 'Webhook criado' });
    setView('list');
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este webhook?')) return;
    const { error } = await supabase.from('webhooks').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Webhook excluído' });
      load();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: 'Copiado para a área de transferência' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadSchema = (webhook: Webhook | null) => {
    if (!webhook) return;
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: `Webhook Schema: ${webhook.name}`,
      description: "Especificação do payload enviado pela plataforma",
      type: "object",
      required: ["event", "timestamp", "data"],
      properties: {
        event: { 
          type: "string", 
          enum: webhook.events,
          description: "O tipo técnico do evento disparado"
        },
        timestamp: { 
          type: "string", 
          format: "date-time",
          description: "Data e hora do evento em UTC (ISO-8601)"
        },
        data: { 
          type: "object",
          description: "Dados específicos do recurso associado ao evento"
        },
        idempotency_key: {
          type: "string",
          description: "Chave única para evitar processamento duplicado (enviada via header X-Idempotency-Key)"
        }
      }
    };
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `webhook-schema-${webhook.id}.json`;
    link.click();
    
    // Also generate OpenAPI if requested (conceptual here, keeping it to JSON Schema for now as requested)
    toast({ title: 'Schema gerado para download' });
  };

  const downloadOpenAPI = (webhook: Webhook | null) => {
    if (!webhook) return;
    
    const spec = {
      openapi: "3.0.0",
      info: {
        title: `Outbound Webhook API: ${webhook.name}`,
        version: `1.0.${webhook.secret_version}`,
        description: "Documentação técnica para o recebimento de eventos disparados por este webhook."
      },
      servers: [
        {
          url: webhook.url,
          description: "Endpoint de destino configurado"
        }
      ],
      paths: {
        "/": {
          post: {
            summary: "Receber evento de webhook",
            description: "Este endpoint será chamado via POST sempre que um dos eventos configurados ocorrer.",
            parameters: [
              {
                name: webhook.idempotency_header || "X-Idempotency-Key",
                in: "header",
                required: webhook.idempotency_missing_behavior === 'fail',
                schema: { type: "string" },
                description: "Chave única de idempotência para evitar processamento duplicado."
              },
              {
                name: "X-Webhook-Signature",
                in: "header",
                required: !!webhook.secret,
                schema: { type: "string" },
                description: "Assinatura HMAC-SHA256 para verificação de autenticidade."
              },
              {
                name: "X-Webhook-Timestamp",
                in: "header",
                required: true,
                schema: { type: "integer" },
                description: "Timestamp UNIX do momento do disparo."
              }
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["event", "timestamp", "data"],
                    properties: {
                      event: { 
                        type: "string", 
                        enum: webhook.events,
                        example: webhook.events[0] || "message.received"
                      },
                      timestamp: { 
                        type: "string", 
                        format: "date-time",
                        example: new Date().toISOString()
                      },
                      data: { 
                        type: "object",
                        description: "Dados específicos do evento"
                      }
                    }
                  },
                  example: samplePayload
                }
              }
            },
            responses: {
              "200": {
                description: "Evento recebido e processado com sucesso."
              },
              "202": {
                description: "Evento recebido e aceito para processamento assíncrono."
              },
              "4xx": {
                description: "Erro no payload ou autenticação."
              },
              "5xx": {
                description: "Erro interno no servidor de destino."
              }
            }
          }
        }
      }
    };

    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openapi-${webhook.id}.json`;
    link.click();
    
    toast({ title: 'OpenAPI Spec gerado para download' });
  };

  const filteredItems = items.filter(item => 
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (view === 'edit') {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setView('list')}>
            <ChevronRight className="w-5 h-5 rotate-180" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {selectedWebhook ? `Editar: ${selectedWebhook.name}` : 'Novo Webhook de Saída'}
            </h2>
            <p className="text-sm text-muted-foreground">Configure o endpoint que receberá as notificações de eventos</p>
          </div>
        </div>

        <Tabs defaultValue="config" className="w-full">
          <TabsList className="bg-secondary/50 p-1 rounded-xl">
            <TabsTrigger value="config" className="rounded-lg gap-2">
              <Settings className="w-4 h-4" /> Configuração
            </TabsTrigger>
            <TabsTrigger value="health" className="rounded-lg gap-2">
              <Activity className="w-4 h-4" /> Saúde & Métricas
            </TabsTrigger>
            <TabsTrigger value="test" className="rounded-lg gap-2">
              <FlaskConical className="w-4 h-4" /> Teste
            </TabsTrigger>
            <TabsTrigger value="logs" className="rounded-lg gap-2">
              <ListRestart className="w-4 h-4" /> Logs de Envio
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-lg gap-2">
              <History className="w-4 h-4" /> Auditoria
            </TabsTrigger>
            <TabsTrigger value="payload" className="rounded-lg gap-2">
              <Code2 className="w-4 h-4" /> Schema & Payload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="mt-6 space-y-6">
            <div className="glass-card p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nome do Webhook</Label>
                  <Input 
                    placeholder="Ex: Enviar para CRM" 
                    value={form.name} 
                    onChange={(e) => setForm({ ...form, name: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-3 h-10">
                    <Switch 
                      checked={form.is_active} 
                      onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} 
                    />
                    <span className="text-sm font-medium">
                      {form.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>URL de Destino (Endpoint)</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="https://seu-servidor.com/webhook" 
                    value={form.url} 
                    onChange={(e) => setForm({ ...form, url: e.target.value })} 
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyToClipboard(form.url, 'form_url')}
                  >
                    {copiedId === 'form_url' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Onde enviaremos os dados quando os eventos ocorrerem</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-primary/5 p-4 rounded-xl border border-primary/10">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-primary font-bold">Política de Retry</Label>
                    <Badge className="bg-primary/20 text-primary border-none text-[9px] uppercase tracking-tighter hover:bg-primary/30">Backoff Exponencial</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input 
                      type="number" 
                      min="0" 
                      max="10" 
                      value={form.max_retries} 
                      onChange={(e) => setForm({ ...form, max_retries: parseInt(e.target.value) })}
                      className="w-20 bg-background border-primary/20 focus-visible:ring-primary"
                    />
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-bold">Máximo de tentativas</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">Falhas no endpoint (5xx, Timeout, DNS)</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground">Timeout da Requisição</Label>
                  <div className="flex items-center gap-3">
                    <Input 
                      type="number" 
                      min="1" 
                      max="120" 
                      value={form.timeout_seconds} 
                      onChange={(e) => setForm({ ...form, timeout_seconds: parseInt(e.target.value) })}
                      className="w-20 bg-background border-primary/20 focus-visible:ring-primary"
                    />
                    <span className="text-[11px] font-medium">segundos</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Tempo máximo para resposta do servidor.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-secondary/5 p-4 rounded-xl border border-border/40">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-bold">Configuração de Idempotência</Label>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-tighter">Opcional</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Nome do Header</Label>
                    <Input 
                      placeholder="X-Idempotency-Key" 
                      value={form.idempotency_header} 
                      onChange={(e) => setForm({ ...form, idempotency_header: e.target.value })}
                      className="bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground mt-6">Comportamento sem chave</Label>
                  <select 
                    value={form.idempotency_missing_behavior} 
                    onChange={(e) => setForm({ ...form, idempotency_missing_behavior: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="generate">Gerar UUID automaticamente (Recomendado)</option>
                    <option value="fail">Falhar o envio (Requer chave no gatilho)</option>
                    <option value="skip">Não enviar header de idempotência</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground mt-6">Expiração da Chave (TTL)</Label>
                  <div className="flex items-center gap-3">
                    <Input 
                      type="number" 
                      min="1" 
                      max="720" 
                      value={form.idempotency_ttl_hours} 
                      onChange={(e) => setForm({ ...form, idempotency_ttl_hours: parseInt(e.target.value) })}
                      className="w-20 bg-background border-border/40 focus-visible:ring-primary"
                    />
                    <span className="text-[11px] font-medium">horas</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">Período de retenção para evitar duplicidade.</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 p-4 rounded-xl border border-destructive/20 bg-destructive/5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-destructive/10 text-destructive border-none text-[9px] uppercase tracking-tighter">Regras de Alerta</Badge>
                  <Label className="text-sm font-bold">Monitoramento de Instabilidade</Label>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground uppercase">Slack Webhook URL (Destino por Endpoint)</Label>
                    <Input 
                      placeholder="https://hooks.slack.com/services/..." 
                      value={form.alert_slack_url} 
                      onChange={(e) => setForm({ ...form, alert_slack_url: e.target.value })}
                      className="bg-background border-destructive/10 focus-visible:ring-destructive/30 h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground uppercase">E-mail para Alertas (Destino por Endpoint)</Label>
                    <Input 
                      placeholder="dev@empresa.com" 
                      value={form.alert_email} 
                      onChange={(e) => setForm({ ...form, alert_email: e.target.value })}
                      className="bg-background border-destructive/10 focus-visible:ring-destructive/30 h-9"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex-1 space-y-0.5">
                    <Label className="text-xs font-bold">Limiar de Alerta (Consecutivo)</Label>
                    <p className="text-[10px] text-muted-foreground">O alerta será disparado especificamente para este destino após o número de falhas seguidas.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      min="1" 
                      max="20" 
                      value={form.alert_threshold} 
                      onChange={(e) => setForm({ ...form, alert_threshold: parseInt(e.target.value) })}
                      className="w-16 h-8 text-center"
                    />
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Timeouts</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-bold">Segurança (HMAC)</Label>
                  {selectedWebhook && (
                    <Badge variant="outline" className="text-[10px]">
                      Versão: {form.secret_version}
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Chave Secreta Atual (Secret Key)</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input 
                        type={showSecret ? 'text' : 'password'} 
                        value={form.secret} 
                        readOnly
                        className="bg-secondary/20"
                      />
                      <button 
                        onClick={() => setShowSecret((s) => !s)} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        if (confirm('Deseja rotacionar o segredo? O segredo atual será mantido como "anterior" para evitar interrupções.')) {
                          setForm({ 
                            ...form, 
                            previous_secret: form.secret,
                            secret: randomSecret(),
                            secret_version: form.secret_version + 1
                          });
                          toast({ title: 'Segredo rotacionado', description: 'Salve as alterações para aplicar.' });
                        }
                      }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Rotacionar
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Onde enviaremos os dados quando os eventos ocorrerem</p>
                </div>

                {form.previous_secret && (
                  <div className="space-y-2 opacity-60">
                    <Label className="text-xs">Chave Secreta Anterior (Transition Key)</Label>
                    <div className="flex gap-2">
                      <Input 
                        type="password" 
                        value={form.previous_secret} 
                        readOnly
                        className="bg-secondary/10"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">Mantida para validar eventos em cache ou em trânsito durante a rotação.</p>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Prévia dos Headers de Assinatura</span>
                  </div>
                  <div className="space-y-1 font-mono text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">X-Webhook-Signature:</span>
                      <span className="text-foreground">sha256={"{hash_calculado}"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">X-Webhook-Timestamp:</span>
                      <span className="text-foreground">{Math.floor(Date.now() / 1000)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">X-Webhook-Version:</span>
                      <span className="text-foreground">v{form.secret_version}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-bold">Eventos que disparam este Webhook</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {EVENT_GROUPS.map((g) => (
                    <div key={g.name} className="border border-border/40 rounded-xl p-4 bg-secondary/10">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-foreground">{g.name}</span>
                        <button 
                          onClick={() => selectGroup(g.events)} 
                          className="text-[10px] uppercase tracking-wider font-bold text-primary hover:text-primary/80"
                        >
                          {g.events.every(([id]) => form.events.includes(id)) ? 'Desmarcar' : 'Selecionar'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {g.events.map(([id, label]) => (
                          <label key={id} className="flex items-center gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={form.events.includes(id)} 
                              onChange={() => toggleEvent(id)} 
                              className="rounded border-border text-primary focus:ring-primary w-4 h-4" 
                            />
                            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/40">
                <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {selectedWebhook ? 'Atualizar Webhook' : 'Salvar Webhook de Saída'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="health" className="mt-6">
            {selectedWebhook ? (
              <WebhookHealthDashboard webhookId={selectedWebhook.id} />
            ) : (
              <div className="glass-card p-12 text-center">Salve o webhook primeiro para ver as métricas de saúde.</div>
            )}
          </TabsContent>

          <TabsContent value="test" className="mt-6">
            {selectedWebhook ? (
              <OutboundWebhookTestConsole webhook={selectedWebhook} />
            ) : (
              <div className="glass-card p-12 text-center bg-secondary/10 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                  <FlaskConical className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold">Webhook ainda não salvo</p>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Você precisa salvar as configurações do webhook antes de poder disparar eventos de teste.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            {selectedWebhook ? (
              <WebhookLogsTab webhookId={selectedWebhook.id} />
            ) : (
              <div className="glass-card p-12 text-center">Salve o webhook primeiro para ver os logs.</div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            {selectedWebhook ? (
              <WebhookAuditTab webhookId={selectedWebhook.id} />
            ) : (
              <div className="glass-card p-12 text-center">Salve o webhook primeiro para ver a auditoria.</div>
            )}
          </TabsContent>

          <TabsContent value="payload" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileJson className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold">Validador de Payload</h3>
                </div>
                
                <div className="glass-card p-5 space-y-5 bg-secondary/10 border-none shadow-inner">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Campos Padrão no Body</span>
                      <Badge variant="outline" className="text-[10px] text-primary bg-primary/5">JSON Estruturado</Badge>
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: 'event', type: 'String', desc: 'Nome técnico do evento disparado' },
                        { name: 'timestamp', type: 'DateTime', desc: 'Data/hora do evento em formato ISO-8601' },
                        { name: 'data', type: 'Object', desc: 'Objeto contendo os dados específicos do recurso' }
                      ].map(field => (
                        <div key={field.name} className="flex items-start gap-3 p-3 bg-background rounded-lg border border-border/40 group hover:border-primary/30 transition-colors">
                          <div className="w-1 h-8 rounded-full bg-primary/20 group-hover:bg-primary transition-colors" />
                          <div>
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-bold text-foreground font-mono">{field.name}</code>
                              <span className="text-[10px] text-muted-foreground bg-secondary px-1 rounded">{field.type}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{field.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Headers de Controle</span>
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: 'X-Webhook-Signature', desc: 'Assinatura HMAC-SHA256 para segurança' },
                        { name: form.idempotency_header || 'X-Idempotency-Key', desc: 'Chave única para evitar duplicidades' },
                        { name: 'X-Webhook-ID', desc: 'Identificador único deste webhook' }
                      ].map(header => (
                        <div key={header.name} className="flex items-center justify-between p-2 bg-background/50 rounded border border-dashed border-border/60">
                          <code className="text-[10px] font-bold text-primary">{header.name}</code>
                          <span className="text-[9px] text-muted-foreground italic">{header.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-2">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Regras de Validação</span>
                    </div>
                    <ul className="text-[10px] text-amber-700/70 space-y-1 list-disc pl-4">
                      <li>O body deve ser obrigatoriamente um JSON válido.</li>
                      <li>A assinatura HMAC deve ser validada usando o header X-Webhook-Signature.</li>
                      <li>Eventos de teste usam o tipo <code>webhook.test</code>.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-bold">Exemplo do Body</h3>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadSchema(selectedWebhook)} className="h-8 text-[11px] bg-background">
                      <Download className="w-3.5 h-3.5 mr-2" /> Schema
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadOpenAPI(selectedWebhook)} className="h-8 text-[11px] bg-background">
                      <Terminal className="w-3.5 h-3.5 mr-2" /> OpenAPI
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(JSON.stringify(samplePayload, null, 2), 'payload')} className="h-8 text-[11px] bg-background">
                      {copiedId === 'payload' ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />} JSON
                    </Button>
                  </div>
                </div>
                <div className="relative group">
                  <pre className="p-5 rounded-2xl bg-slate-950 text-slate-50 text-xs overflow-x-auto font-mono border border-white/5 shadow-2xl h-[400px]">
                    {JSON.stringify(samplePayload, null, 2)}
                  </pre>
                  <div className="absolute top-4 right-4 flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/50" />
                    <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                    <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <WebhookIcon className="w-6 h-6 text-primary" /> Webhooks de Saída
          </h2>
          <p className="text-sm text-muted-foreground">O sistema notifica sua URL quando eventos ocorrem</p>
        </div>
        <Button onClick={openNew} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Novo Webhook de Saída
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-secondary/30 p-4 rounded-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar por nome ou URL..." 
            className="pl-9 bg-background border-none shadow-none focus-visible:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-muted-foreground">
          <Activity className="w-3 h-3 text-emerald-500" />
          <span>{filteredItems.length} webhooks ativos</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary/50" /></div>
      ) : items.length === 0 ? (
        <div className="glass-card p-16 text-center border-dashed border-2">
          <div className="w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-6">
            <WebhookIcon className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Configure os disparos de eventos</h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            Integre a plataforma com seu próprio sistema ou ferramentas como N8N, Zapier e Make.
          </p>
          <Button onClick={openNew} size="lg" className="gap-2">
            <Plus className="w-5 h-5" /> Criar Webhook de Saída
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden border-none shadow-xl">
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="font-bold">Identificação</TableHead>
                <TableHead className="font-bold">URL de Destino</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="font-bold">Eventos</TableHead>
                <TableHead className="text-right font-bold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((w) => (
                <TableRow key={w.id} className="hover:bg-secondary/10 transition-colors border-border/50">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{w.name || 'Sem nome'}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{w.id.split('-')[0]}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[250px]">
                    <div className="flex items-center gap-2 group">
                      <code className="text-[10px] bg-secondary px-1.5 py-0.5 rounded truncate flex-1 font-mono">
                        {w.url}
                      </code>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100 h-6 w-6"
                        onClick={() => copyToClipboard(w.url, w.id)}
                      >
                        {copiedId === w.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={w.is_active ? 'default' : 'secondary'} className={w.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}>
                      {w.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] bg-secondary/30">
                        {w.events?.length || 0} eventos
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 p-2">
                        <DropdownMenuItem onClick={() => openEdit(w)} className="gap-2 cursor-pointer">
                          <Settings className="w-4 h-4" /> Editar Configurações
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelectedWebhook(w); setView('edit'); }} className="gap-2 cursor-pointer">
                          <ListRestart className="w-4 h-4" /> Histórico de Envios
                        </DropdownMenuItem>
                        <div className="h-px bg-border my-1" />
                        <DropdownMenuItem onClick={() => remove(w.id)} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4" /> Excluir Definitivamente
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-amber-800">Dica de Segurança</p>
          <p className="text-xs text-amber-700/80 leading-relaxed">
            Sempre verifique o header <code className="bg-amber-500/10 px-1 rounded">X-Webhook-Signature</code> no seu servidor de destino 
            para garantir que a requisição partiu legitimamente da nossa plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}

const samplePayload = {
  event: "message.received",
  timestamp: "2026-06-02T15:30:00Z",
  data: {
    id: "msg_123abc456",
    sender: {
      name: "João Silva",
      phone: "+5511999999999"
    },
    message: {
      content: "Olá, como posso ajudar?"
    }
  },
  signature: "hmac_sha256_hash_here"
};
