
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Globe, Code, Settings, Copy, Check, 
  MessageSquare, Activity, CheckCircle2, XCircle, Clock,
  Search, Filter, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, Play, ShieldAlert, Terminal,
  FileSpreadsheet, Palette
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection } from './types';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WidgetSettingsProps {
  conn: WhatsAppConnection;
  onSaved: () => void;
}

interface UnauthorizedAttempt {
  id: string;
  domain: string;
  user_agent: string;
  ip_address: string;
  created_at: string;
}

export function WidgetSettings({ conn, onSaved }: WidgetSettingsProps) {
  const [domain, setDomain] = useState(conn.metadata?.domain || '');
  const [authorizedDomains, setAuthorizedDomains] = useState<string[]>(conn.authorized_domains || []);
  const [logRetentionDays, setLogRetentionDays] = useState(conn.log_retention_days || 30);
  const [unauthorizedAttempts, setUnauthorizedAttempts] = useState<UnauthorizedAttempt[]>([]);
  const [primaryColor, setPrimaryColor] = useState(conn.metadata?.color || '#8B5CF6');
  const [welcomeMsg, setWelcomeMsg] = useState(conn.metadata?.welcome_msg || 'Olá! Como podemos ajudar hoje?');
  const [autoOpen, setAutoOpen] = useState(conn.metadata?.auto_open || false);
  const [copied, setCopied] = useState(false);
  
  // Logs & Pagination
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isTesting, setIsTesting] = useState(false);

  const embedScript = `
<!-- Lovable Chat Widget -->
<script src="https://widget.lovable.dev/v1/widget.js" 
  data-id="${conn.id}" 
  data-color="${primaryColor}"
  data-auto-open="${autoOpen}"
  defer></script>
<!-- End Lovable Chat Widget -->
  `.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(embedScript);
    setCopied(true);
    toast.success('Script copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    // Basic domain validation logic simulation
    if (domain && !domain.includes('.')) {
      toast.error('Domínio inválido', { description: 'O domínio deve ter um formato válido (ex: site.com)' });
      return;
    }

    const metadata = {
      ...conn.metadata,
      domain,
      color: primaryColor,
      welcome_msg: welcomeMsg,
      auto_open: autoOpen
    };

    const { error } = await supabase
      .from('whatsapp_connections')
      .update({ 
        metadata,
        authorized_domains: authorizedDomains,
        log_retention_days: logRetentionDays
      })
      .eq('id', conn.id);

    if (error) {
      toast.error('Erro ao salvar configurações do widget');
    } else {
      toast.success('Configurações do widget atualizadas!');
      onSaved();
    }
  };

  const loadUnauthorizedAttempts = async () => {
    const { data } = await supabase
      .from('unauthorized_embed_attempts')
      .select('*')
      .eq('connection_id', conn.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) setUnauthorizedAttempts(data as UnauthorizedAttempt[]);
  };

  const handleExportLogs = async (format: 'csv' | 'json') => {
    toast.info(`Iniciando exportação em ${format.toUpperCase()}...`);
    
    let query = supabase
      .from('connection_events')
      .select('*')
      .eq('connection_id', conn.id);

    if (typeFilter !== 'all') query = query.eq('event_type', typeFilter);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error || !data) {
      toast.error('Erro ao buscar dados para exportação');
      return;
    }

    let content = '';
    let fileName = `logs_widget_${conn.id}_${new Date().toISOString()}`;

    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      fileName += '.json';
    } else {
      const headers = ['id', 'event_type', 'status', 'created_at', 'payload'];
      const rows = data.map(log => [
        log.id,
        log.event_type,
        log.status,
        log.created_at,
        JSON.stringify(log.payload).replace(/"/g, '""')
      ].join(','));
      content = [headers.join(','), ...rows].join('\n');
      fileName += '.csv';
    }

    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Exportação concluída!');
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    let query = supabase
      .from('connection_events')
      .select('*', { count: 'exact' })
      .eq('connection_id', conn.id);

    if (search) {
      query = query.or(`error_message.ilike.%${search}%,event_type.ilike.%${search}%`);
    }

    if (typeFilter !== 'all') {
      query = query.eq('event_type', typeFilter);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (data) {
      setLogs(data);
      setTotalCount(count || 0);
    }
    setLoadingLogs(false);
  };

  const handleSendTestEvent = async (type: 'lead' | 'message') => {
    setIsTesting(true);
    const testPayload = {
      type,
      name: "Lead de Teste",
      message: type === 'lead' ? "Interesse em produto" : "Olá, gostaria de mais informações.",
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('connection_events')
        .insert({
          connection_id: conn.id,
          event_type: type,
          status: 'success',
          payload: testPayload,
          metadata_json: { is_test: true }
        })
        .select()
        .single();

      if (error) throw error;
      toast.success(`Evento de teste (${type}) enviado!`, { 
        description: `ID do Evento: ${data.id.substring(0, 8)}` 
      });
      loadLogs();
    } catch (err: any) {
      toast.error('Falha ao enviar evento de teste', { description: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    loadLogs();
    loadUnauthorizedAttempts();
    const channel = supabase
      .channel(`widget-logs-${conn.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'connection_events',
        filter: `connection_id=eq.${conn.id}`
      }, () => loadLogs())
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'unauthorized_embed_attempts',
        filter: `connection_id=eq.${conn.id}`
      }, () => loadUnauthorizedAttempts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conn.id, page, typeFilter, statusFilter]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6 pt-4">
      <Tabs defaultValue="config" className="w-full">
        <TabsList className="bg-secondary/40 w-full grid grid-cols-4">
          <TabsTrigger value="config" className="gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">Ajustes</span>
          </TabsTrigger>
          <TabsTrigger value="embed" className="gap-2">
            <Code className="w-4 h-4" />
            <span className="hidden md:inline">Embed</span>
          </TabsTrigger>
          <TabsTrigger value="status" className="gap-2">
            <Activity className="w-4 h-4" />
            <span className="hidden md:inline">Logs</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span className="hidden md:inline">Segurança</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase">Domínios Autorizados</Label>
                {authorizedDomains.length > 0 && (
                  <Badge variant="outline" className="h-4 text-[8px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <ShieldAlert className="w-2.5 h-2.5 mr-1" /> {authorizedDomains.length} Domínios
                  </Badge>
                )}
              </div>
              <Input 
                value={domain} 
                onChange={(e) => setDomain(e.target.value)} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && domain) {
                    setAuthorizedDomains(prev => [...new Set([...prev, domain])]);
                    setDomain('');
                    e.preventDefault();
                  }
                }}
                placeholder="Pressione Enter para adicionar domínio" 
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {authorizedDomains.map(d => (
                  <Badge key={d} variant="secondary" className="gap-1 text-[9px]">
                    {d}
                    <XCircle 
                      className="w-3 h-3 cursor-pointer hover:text-destructive" 
                      onClick={() => setAuthorizedDomains(prev => prev.filter(x => x !== d))}
                    />
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">O widget só funcionará nos domínios listados aqui.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase">Retenção de Logs (Dias)</Label>
              <Select value={logRetentionDays.toString()} onValueChange={(v) => setLogRetentionDays(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a retenção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Dias</SelectItem>
                  <SelectItem value="15">15 Dias</SelectItem>
                  <SelectItem value="30">30 Dias</SelectItem>
                  <SelectItem value="60">60 Dias</SelectItem>
                  <SelectItem value="90">90 Dias</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Logs mais antigos que este período serão limpos automaticamente.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase">Cor Principal</Label>
              <div className="flex gap-2">
                <Input 
                  type="color" 
                  value={primaryColor} 
                  onChange={(e) => setPrimaryColor(e.target.value)} 
                  className="w-12 h-9 p-1"
                />
                <Input 
                  value={primaryColor} 
                  onChange={(e) => setPrimaryColor(e.target.value)} 
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Mensagem de Boas-vindas</Label>
            <Input 
              value={welcomeMsg} 
              onChange={(e) => setWelcomeMsg(e.target.value)} 
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/20">
            <div className="space-y-0.5">
              <Label className="text-sm font-bold">Abertura Automática</Label>
              <p className="text-xs text-muted-foreground">Abrir o chat automaticamente após carregar.</p>
            </div>
            <Switch checked={autoOpen} onCheckedChange={setAutoOpen} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <Button onClick={handleSave} className="w-full">
              Salvar Configurações
            </Button>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleSendTestEvent('lead')} 
                disabled={isTesting}
                className="gap-2 flex-1"
              >
                {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Lead Teste
              </Button>
              <Button 
                variant="outline" 
                onClick={() => handleSendTestEvent('message')} 
                disabled={isTesting}
                className="gap-2 flex-1"
              >
                {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                Msg Teste
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="embed" className="space-y-4 pt-4">
          <Card className="bg-secondary/20 border-border/40 border-dashed">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Script de Instalação</CardTitle>
              <CardDescription className="text-xs">Copie e cole este código antes da tag &lt;/body&gt; do seu site.</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="relative group">
                <pre className="p-4 bg-black/60 text-white rounded-lg text-xs font-mono overflow-x-auto">
                  {embedScript}
                </pre>
                <Button 
                  size="icon" 
                  variant="secondary" 
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/40 bg-secondary/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Leads Hoje</p>
                <p className="text-lg font-bold">12</p>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-border/40 bg-secondary/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Origem Ativa</p>
                <p className="text-xs font-medium truncate max-w-[120px]">{authorizedDomains[0] || 'Aguardando site...'}</p>
              </div>
            </div>
          </div>

          <Card className="bg-secondary/10 border-border/40">
            <CardHeader className="p-4 pb-0">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-primary" />
                    <CardTitle className="text-xs font-bold uppercase tracking-wider">Histórico de Eventos</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Exportar CSV" onClick={() => handleExportLogs('csv')}>
                      <FileSpreadsheet className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Exportar JSON" onClick={() => handleExportLogs('json')}>
                      <Code className="w-3 h-3" />
                    </Button>
                    <Badge variant="outline" className="text-[9px] h-5">Total: {totalCount}</Badge>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input 
                      placeholder="Filtrar eventos..." 
                      className="h-7 pl-7 text-[10px]"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-7 w-[90px] text-[10px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="lead">Leads</SelectItem>
                      <SelectItem value="message">Mensagem</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-7 w-[90px] text-[10px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="success">Sucesso</SelectItem>
                      <SelectItem value="failure">Falha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <ScrollArea className="h-[200px] w-full pr-4">
                {loadingLogs && logs.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 text-center">
                    <Clock className="w-8 h-8 opacity-20" />
                    <p className="text-[10px]">Nenhum evento registrado.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-2 rounded bg-background/40 border border-border/10 text-[10px] group hover:border-primary/20">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-destructive'}`} />
                          <span className="font-bold text-primary uppercase">{log.event_type}</span>
                          {log.metadata_json?.is_test && (
                            <Badge className="h-3 text-[7px] py-0 bg-primary/20 text-primary border-none">TESTE</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] text-muted-foreground font-mono">
                            ID: {log.id.substring(0, 8)}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {format(new Date(log.created_at), "HH:mm:ss")}
                          </span>
                          {log.status === 'failure' && (
                            <AlertTriangle className="w-3 h-3 text-destructive" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-3 pt-2 border-t border-border/10">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </Button>
                  <span className="text-[9px] font-bold">
                    {page + 1} / {totalPages}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4 pt-4">
          <Card className="bg-destructive/5 border-destructive/20">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive" />
                <CardTitle className="text-sm">Acessos Não Autorizados</CardTitle>
              </div>
              <CardDescription className="text-xs">Tentativas de embutir o widget em domínios não permitidos.</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <ScrollArea className="h-[250px] pr-4">
                {unauthorizedAttempts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                    <CheckCircle2 className="w-8 h-8 opacity-20 text-emerald-500" />
                    <p className="text-[10px]">Nenhuma tentativa de acesso não autorizado registrada.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unauthorizedAttempts.map((attempt) => (
                      <div key={attempt.id} className="p-2 rounded bg-background/50 border border-destructive/10 text-[10px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-destructive">{attempt.domain}</span>
                          <span className="text-muted-foreground">{format(new Date(attempt.created_at), "dd/MM HH:mm:ss")}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[9px] text-muted-foreground">
                          <p><span className="font-semibold">IP:</span> {attempt.ip_address}</p>
                          <p className="truncate"><span className="font-semibold">User-Agent:</span> {attempt.user_agent}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
