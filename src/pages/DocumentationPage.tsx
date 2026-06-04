import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Book, Code, Terminal, Zap, Shield, Globe, 
  MessageSquare, ChevronRight, Hash, Server, Play, 
  Copy, Check, Info, AlertTriangle, Cpu, Activity,
  Webhook, Key, FileJson, CheckCircle2, Brackets, Download,
  RefreshCw, Lock, AlertCircle, History, FileDown, Eye, RotateCw,
  Filter, X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MCPConsole from '@/components/settings/MCPConsole';
import { ErrorBoundary } from 'react-error-boundary';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Utilitário para mascarar dados sensíveis em objetos de log.
 */
const redactSensitiveInfo = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;
  const redacted = { ...obj };
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'authorization', 'bearer', 'cookie'];
  
  Object.keys(redacted).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveInfo(redacted[key]);
    }
  });
  return redacted;
};

/**
 * Hook centralizado para gerenciar telemetria e ID de correlação.
 */
function useDocTelemetry() {
  const [correlationId, setCorrelationId] = useState(() => {
    const stored = sessionStorage.getItem('doc_correlation_id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    sessionStorage.setItem('doc_correlation_id', newId);
    return newId;
  });

  const regenerateId = useCallback(() => {
    const newId = crypto.randomUUID();
    sessionStorage.setItem('doc_correlation_id', newId);
    setCorrelationId(newId);
    toast({ title: "ID Regenerado", description: "Novo ID de correlação gerado para a sessão." });
    return newId;
  }, []);

  const sendLog = async (payload: any) => {
    try {
      const sanitized = redactSensitiveInfo({
        ...payload,
        correlation_id: correlationId,
        metadata: {
          ...payload.metadata,
          url: window.location.href,
          userAgent: navigator.userAgent,
          correlation_header: correlationId
        }
      });

      const { error } = await supabase
        .from('telemetry_logs')
        .insert([sanitized]);
      
      if (error) console.warn('[Telemetry] Fail:', error);
    } catch (e) {
      // Falha silenciosa
    }
  };

  return { correlationId, sendLog, regenerateId };
}

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const { signOut } = useAuth();
  const { correlationId, sendLog } = useDocTelemetry();
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [nextRetryTime, setNextRetryTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [stats, setStats] = useState({ network: 0, auth: 0 });
  const [alertLimit, setAlertLimit] = useState(3);
  const MAX_RETRIES = 5;

  // Carregar limite configurável
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('company_settings').select('config').limit(1).maybeSingle();
      if (data?.config && typeof (data.config as any).doc_retry_alert_limit === 'number') {
        setAlertLimit((data.config as any).doc_retry_alert_limit);
      }
    })();
  }, []);
  const is403 = error.message.includes('403') || error.message.includes('permission');
  
  useEffect(() => {
    const isNetwork = !is403;
    setStats(prev => ({
      network: prev.network + (isNetwork ? 1 : 0),
      auth: prev.auth + (is403 ? 1 : 0)
    }));

    sendLog({
      message: error.message,
      type: is403 ? '403_FORBIDDEN' : 'NETWORK_OR_STATE_FAILURE',
      retry_count: retryCount,
      metadata: { 
        stack: error.stack, 
        isCritical: retryCount >= alertLimit,
        header: 'X-Correlation-ID' // Padronização do nome
      }
    });
  }, [error, is403, correlationId, alertLimit]);

  useEffect(() => {
    if (!nextRetryTime) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextRetryTime - Date.now()) / 1000));
      setTimeRemaining(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [nextRetryTime]);

  const handleRetry = () => {
    if (retryCount >= MAX_RETRIES) return;
    setIsRetrying(true);
    const nextRetry = retryCount + 1;
    const delay = Math.pow(2, retryCount) * 1000;
    const estimatedTime = Date.now() + delay;
    setNextRetryTime(estimatedTime);
    setTimeRemaining(Math.ceil(delay / 1000));
    setTimeout(() => {
      setRetryCount(nextRetry);
      setIsRetrying(false);
      setNextRetryTime(null);
      setTimeRemaining(null);
      resetErrorBoundary();
    }, delay);
  };

  return (
    <div className="min-h-[600px] flex items-center justify-center p-6 bg-background/50">
      <Card className="max-w-md w-full border-border/40 shadow-2xl rounded-3xl overflow-hidden backdrop-blur-sm bg-card/80">
        <div className={`h-2 ${is403 ? 'bg-amber-500' : 'bg-destructive'}`} />
        <CardHeader className="text-center pt-10 pb-6">
          <div className={`mx-auto w-20 h-20 ${is403 ? 'bg-amber-500/10' : 'bg-destructive/10'} rounded-2xl flex items-center justify-center mb-6 shadow-inner`}>
            {is403 ? <Lock className="w-10 h-10 text-amber-500" /> : <AlertTriangle className="w-10 h-10 text-destructive" />}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">{is403 ? 'Acesso Restrito' : 'Algo deu errado'}</CardTitle>
          <CardDescription className="text-sm px-6 mt-2 leading-relaxed">
            {is403 
              ? 'Sua conta não possui permissão para visualizar a documentação. Contate o administrador.' 
              : retryCount >= alertLimit 
                ? 'Detectamos múltiplas falhas. Por favor, reporte o Correlation ID abaixo ao suporte.'
                : 'Não foi possível carregar a documentação.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pb-10 text-center px-8">
          {retryCount >= alertLimit && (
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 text-xs font-bold animate-pulse">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Limite de resiliência atingido.</span>
            </div>
          )}
          <div className="flex flex-col gap-3 p-5 bg-secondary/30 rounded-2xl border border-border/20 shadow-inner">
            <div className="flex justify-between items-center group/id">
                <span>Correlation ID:</span>
                <div className="flex items-center gap-2">
                  <span className="truncate max-w-[80px]">{correlationId.split('-')[0]}</span>
                  <button 
                    onClick={() => { 
                      navigator.clipboard.writeText(correlationId); 
                      toast({ title: "ID Copiado", description: "O ID foi copiado e pode ser usado para busca global." }); 
                    }} 
                    className="p-1 hover:bg-background/80 rounded transition-colors"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
             <Button onClick={handleRetry} className="w-full rounded-2xl gap-2 h-12 font-bold shadow-lg">
                <RefreshCw className="w-4 h-4" /> {isRetrying ? 'Tentando...' : 'Tentar novamente'}
             </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DocumentationPage() {
  const { canAccessPage } = useAuth();
  const { correlationId, regenerateId } = useDocTelemetry();
  if (!canAccessPage('documentation')) throw new Error('403: Permission denied');
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => console.log('Reset')}>
      <DocumentationContent correlationId={correlationId} onRegenerateId={regenerateId} />
    </ErrorBoundary>
  );
}

function DocumentationContent({ correlationId, onRegenerateId }: { correlationId: string, onRegenerateId: () => void }) {
  const [telemetryHistory, setTelemetryHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSection, setActiveSection] = useState("MCP Server");
  
  // Estados de Filtro
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchEndpoint, setSearchEndpoint] = useState("");
  const [filterTimeRange, setFilterTimeRange] = useState<string>("all");

  const fetchHistory = async () => {
    let query = supabase
      .from('telemetry_logs')
      .select('*')
      .eq('correlation_id', correlationId);

    if (filterStatus !== "all") {
      query = query.eq('type', filterStatus);
    }

    if (filterTimeRange !== "all") {
      const now = new Date();
      let startTime = new Date();
      if (filterTimeRange === "1h") startTime.setHours(now.getHours() - 1);
      else if (filterTimeRange === "24h") startTime.setHours(now.getHours() - 24);
      else if (filterTimeRange === "7d") startTime.setDate(now.getDate() - 7);
      query = query.gte('created_at', startTime.toISOString());
    }

    const { data } = await query.order('created_at', { ascending: false });
    
    if (data) {
      // Filtro local para busca rápida por endpoint (assumindo que endpoint está na mensagem ou metadados)
      const filtered = searchEndpoint 
        ? data.filter(log => 
            log.message?.toLowerCase().includes(searchEndpoint.toLowerCase()) || 
            JSON.stringify(log.metadata)?.toLowerCase().includes(searchEndpoint.toLowerCase())
          )
        : data;
      setTelemetryHistory(filtered);
    }
  };

  useEffect(() => { 
    if (showHistory) fetchHistory(); 
  }, [showHistory, filterStatus, filterTimeRange, searchEndpoint]);

  return (
    <AppLayout title="Documentação Técnica" subtitle="API REST, MCP e Webhooks.">
        <div className="max-w-7xl mx-auto space-y-8">
            <Tabs defaultValue="rest" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="rest">REST API</TabsTrigger>
                <TabsTrigger value="mcp">MCP Server</TabsTrigger>
                <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
                <TabsTrigger value="test">Console</TabsTrigger>
              </TabsList>
              
              <TabsContent value="rest">
                {/* Conteúdo da API REST aqui */}
              </TabsContent>
              
              <TabsContent value="mcp">
                {/* Conteúdo do MCP aqui */}
              </TabsContent>

              <TabsContent value="webhooks">
                {/* Conteúdo de Webhooks aqui */}
              </TabsContent>

              <TabsContent value="test" className="pt-4">
                <MCPConsole correlationId={correlationId} />
              </TabsContent>
            </Tabs>
            
            <div className="p-6 bg-card border border-border/40 rounded-3xl shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-primary" />
                        <h3 className="text-sm font-bold text-foreground">Diagnóstico de Sessão</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-[10px] gap-1.5 rounded-lg border-border/60 hover:bg-secondary"
                          onClick={() => {
                            const data = telemetryHistory.map(l => {
                              const sanitized = redactSensitiveInfo({
                                ...l,
                                correlation_id: correlationId
                              });
                              return {
                                timestamp: new Date(l.created_at).toISOString(),
                                type: l.type,
                                message: sanitized.message,
                                retry_count: l.retry_count,
                                correlation_id: sanitized.correlation_id,
                                metadata: sanitized.metadata
                              };
                            });
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `telemetry-audit-${correlationId.split('-')[0]}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "Histórico para auditoria exportado" });
                          }}
                        >
                            <FileDown className="w-3.5 h-3.5" /> Exportar JSON
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-[10px] gap-1.5 rounded-lg border-border/60 hover:bg-secondary"
                          onClick={onRegenerateId}
                        >
                            <RotateCw className="w-3.5 h-3.5" /> Novo ID
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setShowHistory(!showHistory)}
                          className="h-8 text-[10px] rounded-lg"
                        >
                            {showHistory ? 'Ocultar Detalhes' : 'Ver Eventos'}
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-2xl border border-border/10">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">ID de Correlação (Header: X-Correlation-ID)</span>
                    <div className="flex items-center gap-2 ml-auto">
                        <code className="text-xs font-bold text-foreground bg-background px-2 py-1 rounded border border-border/20">{correlationId}</code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(correlationId);
                            toast({ title: "ID Copiado" });
                          }}
                          className="p-1.5 hover:bg-primary/10 rounded-lg text-primary transition-colors"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {showHistory && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 pt-2"
                    >
                        {/* Filtros */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input 
                              placeholder="Buscar endpoint..." 
                              value={searchEndpoint}
                              onChange={(e) => setSearchEndpoint(e.target.value)}
                              className="pl-9 h-9 text-xs rounded-xl bg-secondary/20 border-border/40"
                            />
                          </div>
                          <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="h-9 text-xs rounded-xl bg-secondary/20 border-border/40">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos Status</SelectItem>
                              <SelectItem value="403_FORBIDDEN">403 Forbidden</SelectItem>
                              <SelectItem value="NETWORK_OR_STATE_FAILURE">Falha de Rede</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={filterTimeRange} onValueChange={setFilterTimeRange}>
                            <SelectTrigger className="h-9 text-xs rounded-xl bg-secondary/20 border-border/40">
                              <SelectValue placeholder="Período" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Sempre</SelectItem>
                              <SelectItem value="1h">Última Hora</SelectItem>
                              <SelectItem value="24h">Últimas 24h</SelectItem>
                              <SelectItem value="7d">Últimos 7 dias</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setFilterStatus("all");
                              setSearchEndpoint("");
                              setFilterTimeRange("all");
                            }}
                            className="h-9 text-[10px] gap-1.5 rounded-xl text-muted-foreground"
                          >
                            <X className="w-3.5 h-3.5" /> Limpar Filtros
                          </Button>
                        </div>

                        {telemetryHistory.length === 0 ? (
                            <p className="text-center py-6 text-xs text-muted-foreground italic">Nenhum evento registrado nesta sessão.</p>
                        ) : (
                            <div className="space-y-2">
                              {telemetryHistory.map(log => (
                                  <div key={log.id} className="group p-3 bg-secondary/20 hover:bg-secondary/40 rounded-xl border border-border/10 transition-all">
                                      <div className="flex items-center justify-between mb-1.5">
                                          <Badge variant={log.type.includes('FORBIDDEN') ? 'destructive' : 'outline'} className="text-[9px] h-4">
                                              {log.type}
                                          </Badge>
                                          <span className="text-[10px] text-muted-foreground font-mono">
                                              {new Date(log.created_at).toLocaleTimeString()}
                                          </span>
                                      </div>
                                      <div className="flex items-start gap-4">
                                          <p className="text-xs font-medium text-foreground line-clamp-1 flex-1">{log.message}</p>
                                          <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-bold text-muted-foreground bg-background px-1.5 rounded">Retry #{log.retry_count}</span>
                                              <Dialog>
                                                <DialogTrigger asChild>
                                                  <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                  >
                                                    <Eye className="w-3 h-3" />
                                                  </Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-md rounded-2xl">
                                                  <DialogHeader>
                                                    <DialogTitle className="text-base flex items-center gap-2">
                                                      <Info className="w-4 h-4 text-primary" />
                                                      Detalhes do Evento
                                                    </DialogTitle>
                                                    <DialogDescription className="text-xs">
                                                      Metadados técnicos do log registrados às {new Date(log.created_at).toLocaleString()}
                                                    </DialogDescription>
                                                  </DialogHeader>
                                                  <div className="space-y-4 pt-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                      <div className="space-y-1">
                                                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Tipo</p>
                                                        <Badge variant={log.type.includes('FORBIDDEN') ? 'destructive' : 'outline'} className="text-[10px]">
                                                          {log.type}
                                                        </Badge>
                                                      </div>
                                                      <div className="space-y-1 text-right">
                                                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Tentativa</p>
                                                        <p className="text-sm font-mono font-bold">#{log.retry_count}</p>
                                                      </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Mensagem</p>
                                                      <p className="text-xs bg-secondary/50 p-2 rounded-lg border border-border/10 italic">"{log.message}"</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Raw Payload (Sanitized)</p>
                                                      <pre className="text-[9px] bg-slate-950 p-3 rounded-xl text-slate-300 overflow-auto max-h-48 custom-scrollbar border border-white/5">
                                                        {JSON.stringify(redactSensitiveInfo({
                                                          ...log,
                                                          correlation_id_fallback: correlationId
                                                        }), null, 2)}
                                                      </pre>
                                                    </div>
                                                    <Button 
                                                      variant="secondary" 
                                                      className="w-full rounded-xl gap-2 h-10 text-xs"
                                                      onClick={() => {
                                                        navigator.clipboard.writeText(JSON.stringify(log, null, 2));
                                                        toast({ title: "Copiado", description: "Payload completo copiado." });
                                                      }}
                                                    >
                                                      <Copy className="w-3.5 h-3.5" /> Copiar JSON Completo
                                                    </Button>
                                                  </div>
                                                </DialogContent>
                                              </Dialog>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    </AppLayout>
  );
}
