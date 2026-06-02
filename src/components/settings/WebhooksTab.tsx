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
  Database
} from 'lucide-react';
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
import { motion, AnimatePresence } from 'framer-motion';

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  api_key_id: string | null;
  events: string[];
  is_active: boolean;
  created_at: string;
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

export default function WebhooksTab() {
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
    events: [] as string[],
    is_active: true
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
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
      events: [],
      is_active: true
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
      events: webhook.events || [],
      is_active: webhook.is_active
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
      events: form.events,
      is_active: form.is_active,
      created_by: user.id,
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
              {selectedWebhook ? `Editar: ${selectedWebhook.name}` : 'Novo Webhook'}
            </h2>
            <p className="text-sm text-muted-foreground">Configure os detalhes e eventos do seu webhook</p>
          </div>
        </div>

        <Tabs defaultValue="config" className="w-full">
          <TabsList className="bg-secondary/50 p-1 rounded-xl">
            <TabsTrigger value="config" className="rounded-lg gap-2">
              <Settings className="w-4 h-4" /> Configuração
            </TabsTrigger>
            <TabsTrigger value="logs" className="rounded-lg gap-2">
              <ListRestart className="w-4 h-4" /> Logs
            </TabsTrigger>
            <TabsTrigger value="payload" className="rounded-lg gap-2">
              <Code2 className="w-4 h-4" /> Payload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="mt-6 space-y-6">
            <div className="glass-card p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nome do Webhook</Label>
                  <Input 
                    placeholder="Ex: Integração N8N" 
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
                <Label>URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input 
                    readOnly 
                    value={selectedWebhook ? `https://api.plataforma.com/wh/${selectedWebhook.id}` : 'Disponível após a criação'} 
                    className="bg-secondary/30"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    disabled={!selectedWebhook}
                    onClick={() => copyToClipboard(`https://api.plataforma.com/wh/${selectedWebhook?.id}`, 'url')}
                  >
                    {copiedId === 'url' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Esta é a URL que receberá as requisições externas</p>
              </div>

              <div className="space-y-2">
                <Label>Endpoint de Destino</Label>
                <Input 
                  placeholder="https://seu-servidor.com/webhook" 
                  value={form.url} 
                  onChange={(e) => setForm({ ...form, url: e.target.value })} 
                />
                <p className="text-[11px] text-muted-foreground">Onde enviaremos os dados processados</p>
              </div>

              <div className="space-y-2">
                <Label>Chave Secreta (Secret)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input 
                      type={showSecret ? 'text' : 'password'} 
                      value={form.secret} 
                      onChange={(e) => setForm({ ...form, secret: e.target.value })} 
                    />
                    <button 
                      onClick={() => setShowSecret((s) => !s)} 
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="outline" onClick={() => setForm({ ...form, secret: randomSecret() })}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Gerar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Assinatura HMAC-SHA256 enviada no header X-Webhook-Signature</p>
              </div>

              <div className="space-y-4">
                <Label className="text-base">Configuração de Eventos</Label>
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
                  {selectedWebhook ? 'Salvar Alterações' : 'Criar Webhook'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <div className="glass-card p-6 text-center space-y-4">
              <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">Logs de Execução</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Acompanhe as últimas requisições, status de entrega e latência deste webhook em tempo real.
                </p>
              </div>
              <div className="border border-dashed border-border rounded-xl p-8 bg-secondary/5">
                <p className="text-sm text-muted-foreground italic">Nenhum evento registrado nas últimas 24 horas.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="payload" className="mt-6">
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Exemplo de Payload</h3>
                  <p className="text-sm text-muted-foreground">Estrutura de dados que seu endpoint receberá</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(JSON.stringify(samplePayload, null, 2), 'payload')}>
                  {copiedId === 'payload' ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />} Copiar JSON
                </Button>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 text-slate-50 text-xs overflow-x-auto font-mono">
                {JSON.stringify(samplePayload, null, 2)}
              </pre>
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
            <WebhookIcon className="w-6 h-6 text-primary" /> Webhooks de Entrada
          </h2>
          <p className="text-sm text-muted-foreground">Gerencie seus endpoints e integre eventos da plataforma</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Adicionar Webhook
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
          <Database className="w-3 h-3" />
          <span>{filteredItems.length} webhooks cadastrados</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary/50" /></div>
      ) : items.length === 0 ? (
        <div className="glass-card p-16 text-center border-dashed">
          <div className="w-20 h-20 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-6">
            <WebhookIcon className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Configure seu primeiro webhook</h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            Receba notificações em tempo real quando eventos importantes ocorrerem, 
            como novos leads ou mensagens recebidas.
          </p>
          <Button onClick={openNew} size="lg" className="gap-2">
            <Plus className="w-5 h-5" /> Começar Agora
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden border-none shadow-xl">
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="font-bold">Nome</TableHead>
                <TableHead className="font-bold">URL</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="font-bold">Criado em</TableHead>
                <TableHead className="text-right font-bold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((w) => (
                <TableRow key={w.id} className="hover:bg-secondary/20 transition-colors border-border/50">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{w.name || 'Sem nome'}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{w.id.split('-')[0]}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    <div className="flex items-center gap-2 group">
                      <code className="text-[11px] bg-secondary/50 px-2 py-1 rounded truncate flex-1">
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
                    <Badge variant={w.is_active ? 'default' : 'secondary'} className={w.is_active ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20' : ''}>
                      {w.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(w.created_at).toLocaleDateString()}
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
                          <ListRestart className="w-4 h-4" /> Ver Logs
                        </DropdownMenuItem>
                        <div className="h-px bg-border my-1" />
                        <DropdownMenuItem onClick={() => remove(w.id)} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4" /> Excluir Webhook
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
            <p className="text-lg font-bold">99.8%</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Latência Média</p>
            <p className="text-lg font-bold">142ms</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Eventos Enviados (24h)</p>
            <p className="text-lg font-bold">1,245</p>
          </div>
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
      id: "contact_789",
      name: "João Silva",
      phone: "+5511999999999"
    },
    message: {
      type: "text",
      content: "Olá, gostaria de saber mais sobre o produto."
    },
    context: {
      channel: "whatsapp",
      sub_company_id: "sub_001"
    }
  },
  signature: "hmac_sha256_hash_here"
};
