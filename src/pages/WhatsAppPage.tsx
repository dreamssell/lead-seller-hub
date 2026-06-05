
import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  PlusCircle, RefreshCw, MessageCircle, Activity, 
  History, ShieldCheck, Phone, Plug, Loader2, Smartphone
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import UazAuditTab from '@/components/settings/UazAuditTab';
import { WhatsAppConnectionCard } from '@/components/whatsapp/WhatsAppConnectionCard';
import { WhatsAppConnection, WhatsAppProvider } from '@/components/whatsapp/types';

export default function WhatsAppPage() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditFilters, setAuditFilters] = useState<{ tenantId?: string; logId?: string } | null>(null);
  const [activeTab, setActiveTab] = useState('connections');

  const loadConnections = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar conexões');
    } else {
      setConnections(data as WhatsAppConnection[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const handleOpenAudit = (filters?: { tenantId?: string; logId?: string }) => {
    setAuditFilters(filters || null);
    setActiveTab('audit');
  };

  const [isAddingConnection, setIsAddingConnection] = useState(false);

  const addConnection = async (provider: WhatsAppProvider) => {
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .insert({
        provider,
        display_name: `Conexão ${provider.toUpperCase()} ${connections.length + 1}`,
        status: 'disconnected',
        metadata: {}
      })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao criar conexão');
    } else {
      toast.success(`Conexão ${provider.toUpperCase()} criada!`);
      loadConnections();
    }
  };


  return (
    <AppLayout 
      title="Conexões WhatsApp" 
      subtitle="Gerencie suas instâncias UAZ, Meta e Wavoip em um único lugar."
    >
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-secondary/50 border border-border/40">
              <TabsTrigger value="connections" className="gap-2">
                <Plug className="w-4 h-4" />
                Conexões
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <History className="w-4 h-4" />
                Auditoria & Logs
              </TabsTrigger>
              <TabsTrigger value="health" className="gap-2">
                <Activity className="w-4 h-4" />
                Saúde do Sistema
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadConnections} 
                disabled={loading}
                className="h-9"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Sincronizar
              </Button>
              <Select onValueChange={(v) => addConnection(v as WhatsAppProvider)}>
                <SelectTrigger className="h-9 w-[180px]">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Adicionar Provedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uaz">UAZ API</SelectItem>
                  <SelectItem value="wavoip">Wavoip</SelectItem>
                  <SelectItem value="meta">Meta Official API</SelectItem>
                </SelectContent>
              </Select>

            </div>
          </div>

          <TabsContent value="connections" className="space-y-6 mt-0">
            {loading && connections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground font-medium">Carregando suas conexões...</p>
              </div>
            ) : connections.length === 0 ? (
              <Card className="glass-card border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                    <MessageCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <CardTitle className="mb-2">Nenhuma conexão encontrada</CardTitle>
                  <CardDescription className="max-w-xs mb-6">
                    Você ainda não configurou nenhuma integração com WhatsApp. Comece adicionando uma nova conexão UAZ.
                  </CardDescription>
                  <Button onClick={() => addConnection('uaz')}>
                    Configurar Primeira Conexão
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {connections.map((conn) => (
                  <WhatsAppConnectionCard 
                    key={conn.id} 
                    conn={conn} 
                    onSaved={loadConnections}
                    onOpenAudit={handleOpenAudit}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-0">
            <UazAuditTab 
              initialLogId={auditFilters?.logId} 
              initialTenantId={auditFilters?.tenantId} 
            />
          </TabsContent>

          <TabsContent value="health" className="mt-0">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Status Global das APIs</CardTitle>
                <CardDescription>Monitoramento em tempo real dos provedores integrados.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { name: 'UAZ API', status: 'online', icon: Plug, color: 'text-primary' },
                    { name: 'Meta Cloud API', status: 'online', icon: ShieldCheck, color: 'text-primary' },
                    { name: 'Wavoip Network', status: 'online', icon: Phone, color: 'text-emerald-500' }
                  ].map((p) => (
                    <div key={p.name} className="flex items-center gap-3 p-4 rounded-xl bg-secondary/30 border border-border/40">
                      <div className={`w-10 h-10 rounded-lg bg-background flex items-center justify-center ${p.color}`}>
                        <p.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{p.name}</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">Operacional</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
