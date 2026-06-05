
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
  MessageSquare, Layout, Palette, Terminal,
  Activity, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WhatsAppConnection } from './types';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

interface WidgetSettingsProps {
  conn: WhatsAppConnection;
  onSaved: () => void;
}

export function WidgetSettings({ conn, onSaved }: WidgetSettingsProps) {
  const [domain, setDomain] = useState(conn.metadata?.domain || '');
  const [primaryColor, setPrimaryColor] = useState(conn.metadata?.color || '#8B5CF6');
  const [welcomeMsg, setWelcomeMsg] = useState(conn.metadata?.welcome_msg || 'Olá! Como podemos ajudar hoje?');
  const [autoOpen, setAutoOpen] = useState(conn.metadata?.auto_open || false);
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

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
    const metadata = {
      ...conn.metadata,
      domain,
      color: primaryColor,
      welcome_msg: welcomeMsg,
      auto_open: autoOpen
    };

    const { error } = await supabase
      .from('whatsapp_connections')
      .update({ metadata })
      .eq('id', conn.id);

    if (error) {
      toast.error('Erro ao salvar configurações do widget');
    } else {
      toast.success('Configurações do widget atualizadas!');
      onSaved();
    }
  };

  const loadLogs = async () => {
    const { data } = await supabase
      .from('connection_events')
      .select('*')
      .eq('connection_id', conn.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setLogs(data);
  };

  useEffect(() => {
    loadLogs();
    const channel = supabase
      .channel(`widget-logs-${conn.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'connection_events',
        filter: `connection_id=eq.${conn.id}`
      }, () => loadLogs())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conn.id]);

  return (
    <div className="space-y-6 pt-4">
      <Tabs defaultValue="config" className="w-full">
        <TabsList className="bg-secondary/40 w-full grid grid-cols-3">
          <TabsTrigger value="config" className="gap-2">
            <Settings className="w-4 h-4" />
            Ajustes
          </TabsTrigger>
          <TabsTrigger value="embed" className="gap-2">
            <Code className="w-4 h-4" />
            Script de Embed
          </TabsTrigger>
          <TabsTrigger value="status" className="gap-2">
            <Activity className="w-4 h-4" />
            Status & Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase">Domínio Autorizado</Label>
              <Input 
                value={domain} 
                onChange={(e) => setDomain(e.target.value)} 
                placeholder="ex: meusite.com.br" 
              />
              <p className="text-[10px] text-muted-foreground">O widget só funcionará nos domínios listados aqui.</p>
            </div>
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

          <Button onClick={handleSave} className="w-full">
            Salvar Alterações do Widget
          </Button>
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
                <p className="text-xs font-medium truncate max-w-[120px]">{domain || 'Aguardando site...'}</p>
              </div>
            </div>
          </div>

          <Card className="bg-secondary/10 border-border/40">
            <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <CardTitle className="text-xs font-bold uppercase tracking-wider">Eventos do Widget</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <ScrollArea className="h-[150px] w-full pr-4">
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                    <Clock className="w-8 h-8 opacity-20" />
                    <p className="text-[10px]">Sem eventos recentes...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-2 rounded bg-background/40 border border-border/10 text-[10px]">
                        <div className="flex items-center gap-2">
                          {log.status === 'success' ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                          )}
                          <span className="font-bold text-primary uppercase">{log.event_type}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {format(new Date(log.created_at), "HH:mm:ss")}
                        </span>
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
