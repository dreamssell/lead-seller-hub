import { useEffect, useState } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  TrendingUp,
  BarChart3,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface WebhookHealth {
  successRate: number;
  avgLatency: number;
  p95Latency: number;
  timeoutCount: number;
  totalAttempts: number;
  lastAttempt: string | null;
  status: 'healthy' | 'unstable' | 'down' | 'unknown';
}

export default function WebhookHealthDashboard({ webhookId }: { webhookId: string }) {
  const [health, setHealth] = useState<WebhookHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = async () => {
    setLoading(true);
    try {
      // Get last 100 attempts for metrics
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('response_status, latency_ms, created_at')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (!data || data.length === 0) {
        setHealth(null);
        return;
      }

      const total = data.length;
      const successes = data.filter(log => log.response_status >= 200 && log.response_status < 300).length;
      const timeouts = data.filter(log => log.response_status === 408 || log.response_status === 0).length;
      const latencies = data.map(log => log.latency_ms || 0).sort((a, b) => a - b);
      
      const successRate = (successes / total) * 100;
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / total;
      const p95Latency = latencies[Math.floor(total * 0.95)] || latencies[total - 1];

      let status: WebhookHealth['status'] = 'healthy';
      if (successRate < 70) status = 'down';
      else if (successRate < 95 || timeouts > 5) status = 'unstable';

      setHealth({
        successRate,
        avgLatency,
        p95Latency,
        timeoutCount: timeouts,
        totalAttempts: total,
        lastAttempt: data[0].created_at,
        status
      });
    } catch (err) {
      console.error('Error loading webhook health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, [webhookId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
      </div>
    );
  }

  if (!health) {
    return (
      <div className="glass-card p-8 text-center bg-secondary/10 border-dashed border-2">
        <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Sem dados suficientes para gerar métricas de saúde.</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Dispare alguns eventos para começar a monitorar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Success Rate */}
        <div className="glass-card p-4 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Taxa de Sucesso</span>
            {health.successRate > 95 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : health.successRate > 80 ? (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-2xl font-bold">{health.successRate.toFixed(1)}%</h4>
            <Progress value={health.successRate} className={`h-1.5 ${health.successRate > 95 ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`} />
          </div>
          <p className="text-[10px] text-muted-foreground">Últimas {health.totalAttempts} tentativas</p>
        </div>

        {/* P95 Latency */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Latência P95</span>
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-1">
            <h4 className="text-2xl font-bold">{Math.round(health.p95Latency)}ms</h4>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Média: {Math.round(health.avgLatency)}ms</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Tempo de resposta (95%)</p>
        </div>

        {/* Timeouts */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Contagem de Timeouts</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="space-y-1">
            <h4 className="text-2xl font-bold text-amber-600">{health.timeoutCount}</h4>
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Nas últimas 100 requisições</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Status 408 ou falha de rede</p>
        </div>

        {/* Availability Status */}
        <div className="glass-card p-4 space-y-3 bg-secondary/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status Geral</span>
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              health.status === 'healthy' ? 'bg-emerald-500' : 
              health.status === 'unstable' ? 'bg-amber-500' : 'bg-destructive'
            }`} />
          </div>
          <div className="space-y-1">
            <h4 className={`text-xl font-bold uppercase tracking-tight ${
              health.status === 'healthy' ? 'text-emerald-600' : 
              health.status === 'unstable' ? 'text-amber-600' : 'text-destructive'
            }`}>
              {health.status === 'healthy' ? 'Saudável' : 
               health.status === 'unstable' ? 'Instável' : 'Fora do Ar'}
            </h4>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Visto pela última vez: {health.lastAttempt ? new Date(health.lastAttempt).toLocaleTimeString() : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}
