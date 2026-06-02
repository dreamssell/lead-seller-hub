import { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  Download, 
  FileJson, 
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  RefreshCw,
  ZapOff,
  History,
  Clock,
  Search
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function WebhookAuditTab({ webhookId }: { webhookId: string }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number, hits: number, ratio: number } | null>(null);

  const loadStats = async () => {
    setLoading(true);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days
    
    const { data, error } = await supabase.rpc('get_webhook_idempotency_stats', {
      p_webhook_id: webhookId,
      p_start_date: startDate.toISOString(),
      p_end_date: new Date().toISOString()
    });

    if (!error && data && data.length > 0) {
      setStats({
        total: Number(data[0].total_requests),
        hits: Number(data[0].idempotency_hits),
        ratio: Number(data[0].hit_ratio)
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, [webhookId]);

  const exportAudit = async (format: 'json' | 'csv') => {
    try {
      const { data, error } = await supabase.rpc('get_idempotency_expiration_report', {
        p_webhook_id: webhookId
      });

      if (error) throw error;

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `webhook-idempotency-audit-${webhookId}.json`;
        link.click();
      } else {
        const report = data as any;
        const keys = report.keys_near_expiration || [];
        const headers = ['idempotency_key', 'created_at', 'expires_at'];
        const csvContent = [
          headers.join(','),
          ...keys.map((k: any) => `${k.idempotency_key},${k.created_at},${k.expires_at}`)
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `webhook-idempotency-audit-${webhookId}.csv`;
        link.click();
      }

      toast({ title: 'Relatório exportado com sucesso' });
    } catch (err: any) {
      toast({ title: 'Erro ao exportar relatório', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Estatísticas de Idempotência</h3>
              <p className="text-[10px] text-muted-foreground">Últimos 30 dias</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Taxa de Prevenção</span>
                <h4 className="text-2xl font-bold">{stats?.ratio || 0}%</h4>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Bloqueadas: <strong>{stats?.hits || 0}</strong></p>
                <p className="text-[10px] text-muted-foreground">Total: <strong>{stats?.total || 0}</strong></p>
              </div>
            </div>
            <Progress value={stats?.ratio || 0} className="h-1.5" />
          </div>
        </div>

        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Download className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Relatório de Auditoria</h3>
              <p className="text-[10px] text-muted-foreground">Exportar dados de expiração (TTL)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => exportAudit('json')}>
              <FileJson className="w-4 h-4" /> JSON
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => exportAudit('csv')}>
              <FileSpreadsheet className="w-4 h-4" /> CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold">Monitor de TTL das Chaves</h3>
            </div>
          </div>
          <KeysExpirationMonitor webhookId={webhookId} />
        </div>

        <CleanupLogsView webhookId={webhookId} />
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={loadStats}>
          <RefreshCw className="w-3 h-3" /> Atualizar métricas
        </Button>
      </div>
    </div>
  );
}

function KeysExpirationMonitor({ webhookId }: { webhookId: string }) {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState('');

  const loadKeys = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_idempotency_expiration_report', {
      p_webhook_id: webhookId
    });
    setKeys((data as any)?.keys_near_expiration || []);
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, [webhookId]);

  const filteredKeys = searchKey 
    ? keys.filter(k => k.idempotency_key.toLowerCase().includes(searchKey.toLowerCase()))
    : keys.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input 
          placeholder="Consultar Idempotency-Key ativa..." 
          className="pl-9 h-8 text-xs bg-background"
          value={searchKey}
          onChange={(e) => setSearchKey(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary/40" /></div>
        ) : filteredKeys.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic text-center py-2">Nenhuma chave encontrada.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filteredKeys.map((k) => {
              const expiresAt = new Date(k.expires_at);
              const now = new Date();
              const diffMs = expiresAt.getTime() - now.getTime();
              const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
              const isExpiringSoon = diffHours < 2;

              return (
                <div key={k.idempotency_key} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-bold truncate max-w-[120px]" title={k.idempotency_key}>
                      {k.idempotency_key}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{new Date(k.created_at).toLocaleTimeString()}</span>
                  </div>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          {isExpiringSoon && <AlertCircle className="w-3 h-3 text-amber-500 animate-pulse" />}
                          <Badge variant={isExpiringSoon ? "destructive" : "secondary"} className="text-[9px] px-1.5 py-0">
                            {diffHours.toFixed(1)}h
                          </Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-[10px]">Expira em: {expiresAt.toLocaleString()}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CleanupLogsView({ webhookId }: { webhookId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('idempotency_cleanup_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('clean_date', { ascending: false })
        .limit(5);
      setLogs(data || []);
      setLoading(false);
    };
    load();
  }, [webhookId]);

  return (
    <div className="glass-card p-4 space-y-3 bg-secondary/5 border-dashed">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground">Últimas Limpezas (TTL)</h4>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic text-center py-2">Nenhuma limpeza registrada recentemente.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => (
            <div key={log.id} className="flex justify-between items-center text-[10px] border-b border-border/20 pb-1">
              <span className="text-muted-foreground">{new Date(log.clean_date).toLocaleString()}</span>
              <Badge variant="outline" className="text-[9px] bg-amber-500/5 text-amber-600 border-amber-500/10">
                -{log.keys_removed} chaves
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
