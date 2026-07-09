import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, RefreshCw, Loader2, MessageSquare, PhoneCall, Wifi, Video, Building2, Bug } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { Navigate, Link } from 'react-router-dom';
import { toast } from 'sonner';

interface HealthData {
  generated_at: string;
  errors: { last_24h: number; critical: number; by_severity: Record<string, number> };
  errors_recent: Array<{ id: string; created_at: string; severity: string; source: string; message: string; route: string | null; owner_id: string | null; user_id: string | null }>;
  messages: { last_24h: number; delivered: number; failed: number; sent: number; deadletter: number };
  calls: { last_24h: number; answered: number; missed: number; avg_duration: number };
  whatsapp: { total: number; online: number; offline: number; by_status: Record<string, number> };
  video: { errors_24h: number; alerts_open: number };
  sub_alerts_open: Array<{ id: string; created_at: string; type: string; message: string; percent: number | null; action_taken: string | null; sub_company_name: string | null }>;
  accounts: { companies: number; blocked_companies: number; sub_companies: number; blocked_sub_companies: number; active_users_24h: number };
}

function Metric({ label, value, sub, tone = 'default' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'danger' | 'warn' | 'ok' }) {
  const toneCls = tone === 'danger' ? 'text-destructive' : tone === 'warn' ? 'text-amber-500' : tone === 'ok' ? 'text-emerald-500' : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function PlatformHealthPage() {
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await (supabase as any).rpc('get_platform_health');
      if (error) throw error;
      setData(res as HealthData);
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao carregar saúde da plataforma');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOwner) void load(); }, [isOwner, load]);

  // auto-refresh 60s
  useEffect(() => {
    if (!isOwner) return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [isOwner, load]);

  if (ownerLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (!isOwner) return <Navigate to="/" replace />;

  const deliveryRate = data && data.messages.last_24h > 0
    ? Math.round((data.messages.delivered / data.messages.last_24h) * 100)
    : null;
  const failureRate = data && data.messages.last_24h > 0
    ? Math.round((data.messages.failed / data.messages.last_24h) * 100)
    : 0;
  const answerRate = data && data.calls.last_24h > 0
    ? Math.round((data.calls.answered / data.calls.last_24h) * 100)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="text-primary" /> Saúde da plataforma
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão em tempo real (atualiza a cada 60s) — erros, entregas, chamadas e conexões nas últimas 24h.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/owner/access-health">Acessos</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/owner/audit-trail">Auditoria</Link></Button>
          <Button onClick={load} disabled={loading} variant="outline" className="gap-2" size="sm">
            <RefreshCw className={loading ? 'animate-spin h-4 w-4' : 'h-4 w-4'} /> Recarregar
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="animate-spin h-4 w-4" /> Coletando métricas…
        </div>
      ) : data && (
        <>
          {/* Contas */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Contas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Metric label="Empresas" value={data.accounts.companies} sub={`${data.accounts.blocked_companies} bloqueadas`} tone={data.accounts.blocked_companies > 0 ? 'warn' : 'default'} />
              <Metric label="Sub-empresas" value={data.accounts.sub_companies} sub={`${data.accounts.blocked_sub_companies} bloqueadas`} tone={data.accounts.blocked_sub_companies > 0 ? 'warn' : 'default'} />
              <Metric label="Usuários ativos 24h" value={data.accounts.active_users_24h} />
              <Metric label="Erros 24h" value={data.errors.last_24h} sub={`${data.errors.critical} críticos`} tone={data.errors.critical > 0 ? 'danger' : data.errors.last_24h > 0 ? 'warn' : 'ok'} />
              <Metric label="Alertas de sub" value={data.sub_alerts_open.length} sub="últimos 7 dias" tone={data.sub_alerts_open.length > 0 ? 'warn' : 'ok'} />
            </CardContent>
          </Card>

          {/* Mensagens & Chamadas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Mensagens (24h)</CardTitle>
                <CardDescription>Fluxo omnicanal composto → entregue.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Metric label="Total" value={data.messages.last_24h} />
                <Metric label="Entregues" value={data.messages.delivered} sub={deliveryRate !== null ? `${deliveryRate}%` : '—'} tone={deliveryRate !== null && deliveryRate >= 90 ? 'ok' : 'warn'} />
                <Metric label="Falhas" value={data.messages.failed} sub={`${failureRate}%`} tone={data.messages.failed > 0 ? 'danger' : 'ok'} />
                <Metric label="Dead-letter" value={data.messages.deadletter} tone={data.messages.deadletter > 0 ? 'danger' : 'ok'} />
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><PhoneCall className="h-4 w-4" /> Chamadas (24h)</CardTitle>
                <CardDescription>Wavoip / SIP / WhatsApp voice.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Metric label="Total" value={data.calls.last_24h} />
                <Metric label="Atendidas" value={data.calls.answered} sub={answerRate !== null ? `${answerRate}%` : '—'} tone={answerRate !== null && answerRate >= 60 ? 'ok' : 'warn'} />
                <Metric label="Perdidas" value={data.calls.missed} tone={data.calls.missed > 0 ? 'warn' : 'ok'} />
                <Metric label="Duração média" value={`${Math.floor(data.calls.avg_duration / 60)}m ${data.calls.avg_duration % 60}s`} />
              </CardContent>
            </Card>
          </div>

          {/* WhatsApp & Vídeo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Wifi className="h-4 w-4" /> Conexões WhatsApp</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <Metric label="Total" value={data.whatsapp.total} />
                  <Metric label="Online" value={data.whatsapp.online} tone="ok" />
                  <Metric label="Offline" value={data.whatsapp.offline} tone={data.whatsapp.offline > 0 ? 'warn' : 'ok'} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.whatsapp.by_status).map(([status, cnt]) => (
                    <Badge key={status} variant="secondary" className="text-xs">
                      {status}: {cnt}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Video className="h-4 w-4" /> Vídeo</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Metric label="Erros 24h" value={data.video.errors_24h} tone={data.video.errors_24h > 0 ? 'warn' : 'ok'} />
                <Metric label="Alertas abertos" value={data.video.alerts_open} sub="últimos 7 dias" tone={data.video.alerts_open > 0 ? 'warn' : 'ok'} />
              </CardContent>
            </Card>
          </div>

          {/* Erros recentes */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Bug className="h-4 w-4 text-destructive" /> Erros recentes</CardTitle>
              <CardDescription>Últimos 20 reports (24h).</CardDescription>
            </CardHeader>
            <CardContent>
              {data.errors_recent.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum erro reportado nas últimas 24h.</div>
              ) : (
                <ul className="divide-y">
                  {data.errors_recent.map((e) => (
                    <li key={e.id} className="py-2 text-sm flex items-start gap-3">
                      <Badge variant={e.severity === 'critical' ? 'destructive' : 'secondary'} className="mt-0.5 text-xs shrink-0">
                        {e.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{e.message}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {new Date(e.created_at).toLocaleString('pt-BR')} · {e.source || '—'} · {e.route || '—'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Alertas de sub-empresa */}
          {data.sub_alerts_open.length > 0 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas de sub-empresas</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {data.sub_alerts_open.map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{a.type}</Badge>
                        {a.percent != null && <Badge variant="secondary" className="text-xs">{a.percent}%</Badge>}
                        <span className="font-medium">{a.sub_company_name ?? '—'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{a.message}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString('pt-BR')}</div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="text-[11px] text-muted-foreground text-right">
            Atualizado em {new Date(data.generated_at).toLocaleString('pt-BR')}
          </div>
        </>
      )}
    </div>
  );
}
