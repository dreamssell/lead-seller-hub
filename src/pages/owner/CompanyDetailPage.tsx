import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { LicenseManagerDialog } from '@/components/owner-dashboard/LicenseManagerDialog';
import { generateExecutiveReport } from '@/lib/executiveReportPdf';
import {
  ArrowLeft, Users, MessagesSquare, Phone, TrendingUp, DollarSign,
  ShieldCheck, AlertTriangle, Activity, Bot, Building2, Building, CircleCheck, CircleX, Crown,
  FileDown, KeyRound,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';

const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n ?? 0);
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);
const dt = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--warning))', 'hsl(var(--success))', 'hsl(var(--destructive))', '#6366F1', '#22D3EE', '#F472B6'];

interface Detail {
  generated_at: string;
  company: any;
  seat_usage: { plan_slug: string | null; max_users: number | null; current_users: number; remaining: number | null };
  kpis: { leads_30d: number; leads_won: number; leads_lost: number; leads_open: number; revenue: number; conversion_rate: number };
  messages: { last_30d: number; sent: number; delivered: number; failed: number; inbound: number };
  messages_by_day: { day: string; value: number }[];
  leads_by_stage: { name: string; value: number }[];
  calls: { total_30d: number; answered: number; missed: number; avg_duration: number };
  whatsapp: any[];
  pipelines: { id: string; name: string; leads_total: number; leads_open: number }[];
  agents: { total: number; active: number };
  errors: { last_24h: number; critical: number; recent: any[] };
  audit_recent: any[];
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
      {ok ? <CircleCheck className="w-3.5 h-3.5" /> : <CircleX className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone = 'primary' }: any) {
  const tones: Record<string, string> = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    destructive: 'text-destructive bg-destructive/10',
    accent: 'text-accent bg-accent/10',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const kind = (search.get('kind') || 'company') as 'company' | 'sub_company';
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<{ max_users_override: number | null; seat_additions_blocked: boolean } | null>(null);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        let params: any;
        let lic: any = null;
        if (kind === 'sub_company') {
          const { data: sub } = await supabase.from('sub_companies').select('owner_id, max_users_override, seat_additions_blocked').eq('id', id).maybeSingle();
          if (!sub) throw new Error('Sub-empresa não encontrada.');
          params = { p_owner_id: sub.owner_id, p_sub_company_id: id };
          lic = { max_users_override: (sub as any).max_users_override ?? null, seat_additions_blocked: !!(sub as any).seat_additions_blocked };
        } else {
          const { data: cc } = await supabase.from('client_companies').select('auth_user_id, max_users_override, seat_additions_blocked').eq('id', id).maybeSingle();
          if (!cc?.auth_user_id) throw new Error('Empresa sem titular vinculado.');
          params = { p_owner_id: cc.auth_user_id, p_sub_company_id: null };
          lic = { max_users_override: (cc as any).max_users_override ?? null, seat_additions_blocked: !!(cc as any).seat_additions_blocked };
        }
        const { data: res, error: rpcErr } = await (supabase as any).rpc('get_owner_company_detail', params);
        if (rpcErr) throw rpcErr;
        if (!cancel) { setData(res as Detail); setLicenseInfo(lic); }
      } catch (e: any) {
        if (!cancel) setError(e?.message || 'Falha ao carregar detalhes.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id, kind, refreshKey]);

  if (ownerLoading) return null;
  if (!isOwner) return <Navigate to="/" replace />;

  const company = data?.company;
  const seat = data?.seat_usage;
  const seatMax = seat?.max_users;
  const seatCount = seat?.current_users ?? 0;
  const seatPct = seatMax ? Math.min(100, (seatCount / seatMax) * 100) : 0;
  const seatReached = seatMax != null && seatCount >= seatMax;
  const isEnterprise = (seat?.plan_slug || '').toLowerCase() === 'enterprise';

  const waOnline = (data?.whatsapp || []).filter((w) => ['connected', 'online', 'WORKING'].includes(String(w.status))).length;
  const waTotal = data?.whatsapp?.length ?? 0;

  return (
    <AppLayout
      title="Central Executiva da Conta"
      subtitle="Visão 360° de performance, canais, funis e integridade"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/owner-dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Central do Dono</Link>
        </Button>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Crown className="w-3.5 h-3.5 text-warning" /> Área restrita ao dono da plataforma
        </div>
        <div className="ml-auto flex gap-2">
          {data && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateExecutiveReport({
                accountName: data.company.name,
                planSlug: data.company.plan_slug,
                kind,
                errors: data.errors.recent || [],
                audit: data.audit_recent || [],
              })}
            >
              <FileDown className="w-4 h-4 mr-1" /> Exportar PDF
            </Button>
          )}
          {data && ['platinum','enterprise'].includes(String(data.company.plan_slug || '').toLowerCase()) && (
            <Button size="sm" onClick={() => setLicenseOpen(true)}>
              <KeyRound className="w-4 h-4 mr-1" /> Gerenciar licenças
            </Button>
          )}
        </div>
      </div>

      {data && licenseInfo && (
        <LicenseManagerDialog
          open={licenseOpen}
          onOpenChange={setLicenseOpen}
          kind={kind}
          accountId={id!}
          accountName={data.company.name}
          planSlug={data.company.plan_slug}
          currentOverride={licenseInfo.max_users_override}
          currentBlocked={licenseInfo.seat_additions_blocked}
          planMax={seat?.max_users ?? null}
          currentUsers={seatCount}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted/40 animate-pulse" />)}
        </div>
      )}

      {error && (
        <Card className="p-6 bg-destructive/5 border-destructive/20">
          <p className="text-sm text-destructive font-semibold">Erro ao carregar</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </Card>
      )}

      {!loading && !error && data && company && (
        <div className="space-y-6">
          {/* Header */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl grid place-items-center bg-primary/10 text-primary">
                  {kind === 'sub_company' ? <Building className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold truncate">{company.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge variant="secondary">{company.plan_slug || 'sem plano'}</Badge>
                    <Badge variant="outline" className={company.status === 'blocked' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success/10 text-success border-success/20'}>
                      {company.status || 'active'}
                    </Badge>
                    {kind === 'sub_company' && company.parent_name && (
                      <span className="text-xs text-muted-foreground">Empresa mãe: {company.parent_name}</span>
                    )}
                    {company.login_email && (
                      <span className="text-xs text-muted-foreground">{company.login_email}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="min-w-[260px] max-w-full">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Assentos {seatMax != null ? `(plano: ${seatMax})` : '(sob consulta)'}</span>
                  <span className="font-semibold">{seatCount}{seatMax != null ? ` / ${seatMax}` : ''}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${seatReached ? 'bg-destructive' : seatPct > 80 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${seatPct}%` }} />
                </div>
                {seatReached && (
                  <p className={`text-xs mt-2 ${isEnterprise ? 'text-warning' : 'text-destructive'}`}>
                    {isEnterprise
                      ? 'Limite Enterprise atingido — contate o consultor para adquirir mais licenças.'
                      : 'Limite do plano atingido — faça upgrade para adicionar novos usuários.'}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={TrendingUp} label="Leads (30d)" value={fmt(data.kpis.leads_30d)} hint={`${fmt(data.kpis.leads_won)} ganhos · ${fmt(data.kpis.leads_open)} em aberto`} tone="primary" />
            <Kpi icon={ShieldCheck} label="Conversão" value={`${data.kpis.conversion_rate}%`} hint="Ganhos ÷ leads (30d)" tone="success" />
            <Kpi icon={DollarSign} label="Receita (30d)" value={brl(Number(data.kpis.revenue))} hint="Somatório de leads ganhos" tone="success" />
            <Kpi icon={MessagesSquare} label="Mensagens (30d)" value={fmt(data.messages.last_30d)} hint={`${fmt(data.messages.delivered)} entregues · ${fmt(data.messages.failed)} falhas`} tone="accent" />
            <Kpi icon={Phone} label="Chamadas (30d)" value={fmt(data.calls.total_30d)} hint={`${fmt(data.calls.answered)} atendidas · ${fmt(data.calls.missed)} perdidas`} tone="warning" />
            <Kpi icon={Users} label="Usuários ativos" value={fmt(seatCount)} hint={seatMax != null ? `${seat?.remaining ?? 0} vagas restantes` : 'Sem limite definido'} tone={seatReached ? 'destructive' : 'primary'} />
            <Kpi icon={Bot} label="Agentes I.A." value={fmt(data.agents.active)} hint={`${fmt(data.agents.total)} cadastrados`} tone="accent" />
            <Kpi icon={AlertTriangle} label="Erros (24h)" value={fmt(data.errors.last_24h)} hint={`${fmt(data.errors.critical)} críticos`} tone={data.errors.critical > 0 ? 'destructive' : 'success'} />
          </div>

          {/* Charts + status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 lg:col-span-2">
              <h4 className="text-sm font-semibold mb-3">Mensagens · últimos 14 dias</h4>
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={data.messages_by_day}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-3">Status dos módulos</h4>
              <div className="space-y-2">
                <StatusPill ok={waTotal > 0 && waOnline > 0} label={`WhatsApp · ${waOnline}/${waTotal} online`} />
                <StatusPill ok={data.calls.total_30d > 0} label={`Chamadas · ${fmt(data.calls.total_30d)} nos últimos 30d`} />
                <StatusPill ok={data.agents.active > 0} label={`Agentes I.A. · ${fmt(data.agents.active)} ativos`} />
                <StatusPill ok={data.pipelines.length > 0} label={`Funis · ${fmt(data.pipelines.length)} configurados`} />
                <StatusPill ok={data.errors.critical === 0} label={`Erros críticos · ${fmt(data.errors.critical)} nas últimas 24h`} />
                <StatusPill ok={company.status !== 'blocked'} label={`Conta · ${company.status || 'active'}`} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-3">Leads por estágio</h4>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={data.leads_by_stage}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-3">Funil de mensagens (30d)</h4>
              <div className="h-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Entregues', value: data.messages.delivered },
                        { name: 'Enviadas', value: Math.max(data.messages.sent - data.messages.delivered, 0) },
                        { name: 'Recebidas', value: data.messages.inbound },
                        { name: 'Falhas', value: data.messages.failed },
                      ]}
                      dataKey="value"
                      innerRadius={50}
                      outerRadius={80}
                    >
                      {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Tabs defaultValue="channels">
            <TabsList>
              <TabsTrigger value="channels">Canais WhatsApp</TabsTrigger>
              <TabsTrigger value="funnels">Funis</TabsTrigger>
              <TabsTrigger value="errors">Erros & falhas</TabsTrigger>
              <TabsTrigger value="audit">Auditoria</TabsTrigger>
            </TabsList>

            <TabsContent value="channels" className="mt-4">
              <Card className="p-0 overflow-hidden">
                {data.whatsapp.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Nenhum canal WhatsApp cadastrado.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Nome</th>
                        <th className="text-left p-3">Número</th>
                        <th className="text-left p-3">Provider</th>
                        <th className="text-left p-3">Status</th>
                        <th className="text-left p-3">Atualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.whatsapp.map((w) => {
                        const ok = ['connected', 'online', 'WORKING'].includes(String(w.status));
                        return (
                          <tr key={w.id} className="border-t border-border">
                            <td className="p-3 font-medium">{w.name || '—'}</td>
                            <td className="p-3">{w.phone_number || '—'}</td>
                            <td className="p-3 text-muted-foreground">{w.provider || '—'}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={ok ? 'bg-success/10 text-success border-success/20' : 'bg-destructive/10 text-destructive border-destructive/20'}>
                                {w.status || 'unknown'}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">{w.updated_at ? dt(w.updated_at) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="funnels" className="mt-4">
              <Card className="p-0 overflow-hidden">
                {data.pipelines.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Nenhum funil configurado.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Funil</th>
                        <th className="text-right p-3">Leads totais</th>
                        <th className="text-right p-3">Em aberto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pipelines.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="p-3 font-medium">{p.name}</td>
                          <td className="p-3 text-right tabular-nums">{fmt(p.leads_total)}</td>
                          <td className="p-3 text-right tabular-nums">{fmt(p.leads_open)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="errors" className="mt-4">
              <Card className="p-0 overflow-hidden">
                {data.errors.recent.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Nenhum erro reportado nos últimos 7 dias. 🎉</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Quando</th>
                        <th className="text-left p-3">Severidade</th>
                        <th className="text-left p-3">Origem</th>
                        <th className="text-left p-3">Rota</th>
                        <th className="text-left p-3">Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errors.recent.map((e) => (
                        <tr key={e.id} className="border-t border-border">
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{dt(e.created_at)}</td>
                          <td className="p-3">
                            <Badge variant="outline" className={e.severity === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-warning/10 text-warning border-warning/20'}>
                              {e.severity || 'info'}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs">{e.source || '—'}</td>
                          <td className="p-3 text-xs text-muted-foreground truncate max-w-[200px]">{e.route || '—'}</td>
                          <td className="p-3 text-xs">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <Card className="p-0 overflow-hidden">
                {data.audit_recent.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Sem eventos de auditoria recentes.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Quando</th>
                        <th className="text-left p-3">Autor</th>
                        <th className="text-left p-3">Ação</th>
                        <th className="text-left p-3">Recurso</th>
                        <th className="text-left p-3">Alvo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.audit_recent.map((a) => (
                        <tr key={a.id} className="border-t border-border">
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{dt(a.created_at)}</td>
                          <td className="p-3 text-xs">{a.changed_by_name}</td>
                          <td className="p-3"><Badge variant="secondary">{a.action}</Badge></td>
                          <td className="p-3 text-xs text-muted-foreground">{a.table_name}</td>
                          <td className="p-3 text-xs truncate max-w-[280px]">{a.record_label || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> Dados gerados em {dt(data.generated_at)}
          </p>
        </div>
      )}
    </AppLayout>
  );
}
