import { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Zap, 
  Clock, 
  Loader2,
  RefreshCw,
  Info,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function PublicStatusPage() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [selectedError, setSelectedError] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Healthcheck
      const { data: hData, error: hErr } = await supabase.functions.invoke('uaz-healthcheck');
      if (hErr) throw hErr;
      setHealth(hData);

      // 2. Recent Logs for aggregation
      const { data: logs } = await supabase
        .from('uaz_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      setRecentLogs(logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000); // 2 min
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health?.status === 'online';
  const lastError = recentLogs.find(l => l.status === 'error');

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">System Status</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Status da Plataforma</h1>
            <p className="text-muted-foreground mt-1">Monitoramento em tempo real da integração WhatsApp (UAZ).</p>
          </div>
          
          <Badge variant="outline" className={`h-10 px-4 gap-2 text-sm font-medium ${isHealthy ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}`}>
            {isHealthy ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {isHealthy ? 'Sistemas Operacionais' : 'Degradação Identificada'}
          </Badge>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card className="glass-card overflow-hidden">
            <CardContent className="p-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-4 tracking-wider">Uptime 24h</p>
              <div className="flex items-end justify-between">
                <h3 className="text-3xl font-bold">99.9%</h3>
                <div className="flex gap-0.5 h-6 items-end">
                  {[...Array(20)].map((_, i) => (
                    <div key={i} className="w-1 bg-success/40 rounded-t-sm" style={{ height: `${50 + Math.random() * 50}%` }} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-4 tracking-wider">Latência Média</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">{health?.latency_ms || 0}</h3>
                <span className="text-sm font-medium text-muted-foreground">ms</span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-4 tracking-wider">Incidentes</p>
              <div className="flex items-center gap-2">
                <h3 className="text-3xl font-bold">{recentLogs.filter(l => l.status === 'error').length}</h3>
                <Badge variant="secondary" className="text-[10px] uppercase font-bold">Últimas 24h</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Eventos Recentes
            </h2>
            <Button variant="ghost" size="sm" onClick={fetchData} className="h-8 gap-2 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          <div className="space-y-3">
            {recentLogs.map((log) => (
              <motion.div 
                key={log.id} 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                onClick={() => log.status === 'error' && setSelectedError(log)}
                className={`group glass-card p-4 flex items-center justify-between transition-all ${log.status === 'error' ? 'cursor-pointer hover:bg-destructive/5' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${log.status === 'success' ? 'bg-success/10' : log.status === 'error' ? 'bg-destructive/10' : 'bg-amber-500/10'}`}>
                    {log.status === 'success' ? <CheckCircle2 className="w-5 h-5 text-success" /> : log.status === 'error' ? <XCircle className="w-5 h-5 text-destructive" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{log.message}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{log.event_type.toUpperCase()} • {new Date(log.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
                {log.status === 'error' && (
                  <div className="flex items-center gap-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ver Detalhes</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        <footer className="mt-20 pt-12 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-6 text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
          <p>© 2026 Lovable Platform</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
            <a href="#" className="hover:text-foreground transition-colors">Documentation</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
          </div>
        </footer>
      </div>

      <Dialog open={!!selectedError} onOpenChange={(o) => !o && setSelectedError(null)}>
        <DialogContent className="max-w-2xl bg-black/95 border-border/40 shadow-2xl backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Detalhes do Incidente
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Rastreamento técnico da falha para fins de depuração.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/20 p-3 rounded-xl border border-border/40">
                <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Timestamp</p>
                <p className="text-xs font-mono">{selectedError && new Date(selectedError.created_at).toLocaleString()}</p>
              </div>
              <div className="bg-secondary/20 p-3 rounded-xl border border-border/40">
                <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Status Code</p>
                <Badge variant="destructive" className="h-5 text-[9px]">ERROR</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[9px] font-bold text-muted-foreground uppercase px-1">Mensagem de Erro</p>
              <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-xl">
                <p className="text-sm font-medium text-destructive leading-relaxed italic">
                  "{selectedError?.message}"
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[9px] font-bold text-muted-foreground uppercase px-1">Técnico (Payload/Trace)</p>
              <pre className="bg-background/80 p-4 rounded-xl border border-border/20 text-[10px] font-mono overflow-auto max-h-60 custom-scrollbar text-emerald-500/90 leading-relaxed">
                {JSON.stringify(selectedError?.response || selectedError?.payload, null, 2)}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
