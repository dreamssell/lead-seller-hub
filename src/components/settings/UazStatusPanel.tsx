import { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  RefreshCw, 
  XCircle,
  Zap,
  Filter,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function UazStatusPanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [filterTenant, setFilterTenant] = useState<string>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [subCompanies, setSubCompanies] = useState<any[]>([]);
  const [queueStats, setQueueStats] = useState<any>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('uaz-healthcheck', {
        body: { tenant_id: filterTenant === 'all' ? null : filterTenant, channel_type: filterChannel === 'all' ? null : filterChannel }
      });
      if (error) throw error;
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async () => {
    setLoadingQueue(true);
    try {
      const { data: res } = await supabase.functions.invoke('uaz-queue-stats', {
        body: { tenant_id: filterTenant === 'all' ? null : filterTenant, channel_type: filterChannel === 'all' ? null : filterChannel }
      });
      if (res) setQueueStats(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQueue(false);
    }
  };

  const fetchSubCompanies = async () => {
    const { data } = await supabase.from('sub_companies').select('id, name');
    if (data) setSubCompanies(data);
  };

  useEffect(() => {
    fetchSubCompanies();
  }, []);

  useEffect(() => {
    fetchData();
    fetchQueue();
    const interval = setInterval(() => {
      fetchData();
      fetchQueue();
    }, 60000);
    return () => clearInterval(interval);
  }, [filterTenant, filterChannel]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isHealthy = data?.status === 'online';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center justify-between">
              Status Geral
              <Badge variant="outline" className={isHealthy ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}>
                {isHealthy ? 'Operacional' : data?.status === 'degraded' ? 'Degradado' : 'Offline'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isHealthy ? 'bg-success/10' : 'bg-destructive/10'}`}>
                {isHealthy ? <CheckCircle2 className="w-6 h-6 text-success" /> : <XCircle className="w-6 h-6 text-destructive" />}
              </div>
              <div>
                <p className="text-2xl font-bold">{isHealthy ? '100%' : 'Degradado'}</p>
                <p className="text-[10px] text-muted-foreground">Disponibilidade atual</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Latência Média</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data?.latency_ms}ms</p>
                <p className="text-[10px] text-muted-foreground">Tempo de resposta (50 reqs)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Taxa de Falhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{data?.failure_rate?.toFixed(1)}%</p>
                <Progress value={data?.failure_rate} className="h-1.5 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          Última verificação: {new Date(data?.last_check).toLocaleString()}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchStatus} className="h-7 text-[10px] gap-2">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Atualizar agora
        </Button>
      </div>
    </div>
  );
}
