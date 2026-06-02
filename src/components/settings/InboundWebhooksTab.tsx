import { useEffect, useState } from 'react';
import { 
  ArrowRightLeft, 
  Plus, 
  Trash2, 
  Loader2, 
  Copy, 
  Check, 
  Search, 
  Calendar,
  Settings,
  Code2,
  ChevronRight,
  MoreVertical,
  Activity,
  ArrowDownLeft,
  Database,
  Globe,
  ShieldCheck
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
import { motion } from 'framer-motion';

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  api_key_id: string | null;
  is_active: boolean;
  created_at: string;
  type: string;
}

export default function InboundWebhooksTab() {
  const [items, setItems] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  
  // Form state
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({ 
    name: '', 
    is_active: true
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('type', 'inbound')
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
      is_active: true
    });
    setSelectedWebhook(null);
    setView('edit');
  };

  const openEdit = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setForm({
      name: webhook.name || '',
      is_active: webhook.is_active
    });
    setView('edit');
  };

  const save = async () => {
    if (!form.name) {
      toast({ title: 'Preencha o nome do webhook', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      name: form.name,
      is_active: form.is_active,
      created_by: user.id,
      type: 'inbound',
      url: 'internal_lead_handler', // Inbound doesn't need a destination URL, it's the platform itself
      events: ['lead.received']
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
    item.name?.toLowerCase().includes(searchTerm.toLowerCase())
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
              {selectedWebhook ? `Editar: ${selectedWebhook.name}` : 'Novo Webhook de Entrada'}
            </h2>
            <p className="text-sm text-muted-foreground">Configurações para receber leads de fontes externas</p>
          </div>
        </div>

        <Tabs defaultValue="config" className="w-full">
          <TabsList className="bg-secondary/50 p-1 rounded-xl">
            <TabsTrigger value="config" className="rounded-lg gap-2">
              <Settings className="w-4 h-4" /> Configuração
            </TabsTrigger>
            <TabsTrigger value="payload" className="rounded-lg gap-2">
              <Code2 className="w-4 h-4" /> Payload Esperado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="mt-6 space-y-6">
            <div className="glass-card p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nome Identificador</Label>
                  <Input 
                    placeholder="Ex: Landing Page Campanha X" 
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

              {selectedWebhook && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-bold">URL do seu Webhook</p>
                      <p className="text-xs text-muted-foreground">Envie requisições POST para este endereço:</p>
                      <div className="flex gap-2 mt-2">
                        <Input 
                          readOnly 
                          value={`https://api.plataforma.com/v1/inbound/wh/${selectedWebhook.id}`} 
                          className="bg-background/50 font-mono text-xs"
                        />
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => copyToClipboard(`https://api.plataforma.com/v1/inbound/wh/${selectedWebhook.id}`, 'url')}
                        >
                          {copiedId === 'url' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-bold">Segurança & Autenticação</p>
                      <p className="text-xs text-muted-foreground">Cada requisição deve conter o header API-Key ou passar o token via query param.</p>
                      <div className="mt-2 space-y-2">
                        <code className="block text-[10px] bg-slate-900 text-slate-100 p-2 rounded">
                          Header: X-API-Key: {selectedWebhook.id.split('-')[0]}...
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-border/40">
                <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {selectedWebhook ? 'Salvar Alterações' : 'Criar Webhook de Entrada'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="payload" className="mt-6">
            <div className="glass-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Exemplo de Payload (Lead)</h3>
                  <p className="text-sm text-muted-foreground">Estrutura de dados para envio de novos leads</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(JSON.stringify(leadPayload, null, 2), 'payload')}>
                  {copiedId === 'payload' ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />} Copiar JSON
                </Button>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 text-slate-50 text-xs overflow-x-auto font-mono border border-white/5">
                {JSON.stringify(leadPayload, null, 2)}
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
            <ArrowRightLeft className="w-6 h-6 text-primary" /> Webhooks de Entrada
          </h2>
          <p className="text-sm text-muted-foreground">Receba leads de sites externos, formulários e CRMs</p>
        </div>
        <Button onClick={openNew} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Novo Webhook de Entrada
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-secondary/30 p-4 rounded-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar por nome..." 
            className="pl-9 bg-background border-none shadow-none focus-visible:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-muted-foreground">
          <Database className="w-3 h-3" />
          <span>{filteredItems.length} entradas configuradas</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary/50" /></div>
      ) : items.length === 0 ? (
        <div className="glass-card p-16 text-center border-dashed border-2">
          <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center mx-auto mb-6 rotate-3">
            <ArrowDownLeft className="w-10 h-10 text-primary/40" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Sem webhooks de entrada</h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
            Crie um endpoint para receber dados de leads automaticamente de formulários externos ou landing pages.
          </p>
          <Button onClick={openNew} size="lg" className="gap-2">
            <Plus className="w-5 h-5" /> Criar Primeiro Webhook
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden border-none shadow-xl">
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="font-bold">Nome</TableHead>
                <TableHead className="font-bold">Endpoint ID</TableHead>
                <TableHead className="font-bold">Status</TableHead>
                <TableHead className="font-bold text-center">Leads Recebidos</TableHead>
                <TableHead className="text-right font-bold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((w) => (
                <TableRow key={w.id} className="hover:bg-secondary/10 transition-colors border-border/50">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{w.name}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(w.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] bg-secondary px-1.5 py-0.5 rounded font-mono">
                        {w.id}
                      </code>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(`https://api.plataforma.com/v1/inbound/wh/${w.id}`, w.id)}
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
                  <TableCell className="text-center font-mono text-sm font-bold text-primary">
                    0
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
                          <Activity className="w-4 h-4" /> Ver Estatísticas
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
    </div>
  );
}

const leadPayload = {
  name: "João Silva",
  email: "joao.silva@exemplo.com",
  phone: "+5511999999999",
  source: "Webhook Entrada",
  custom_fields: {
    empresa: "Minha Empresa LTDA",
    interesse: "Produto Premium",
    origem_utms: "google_ads_search"
  }
};
