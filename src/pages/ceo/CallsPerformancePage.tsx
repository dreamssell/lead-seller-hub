import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CeoFilterBar, periodStart, PERIOD_LABELS } from '@/components/ceo/CeoFilterBar';
import { useCeoFilters } from '@/hooks/useCeoFilters';
import { TopRanking } from '@/components/ceo/TopRanking';
import { supabase } from '@/integrations/supabase/client';
import { downloadCsv, downloadPdf } from '@/lib/ceoExport';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, TrendingUp, Wifi, Activity, Download, FileText } from 'lucide-react';

type Channel = 'all' | 'voip' | 'wavoip';

function Kpi({ icon: Icon, label, value, hint, accent }: any) {
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className={`text-2xl font-bold mt-1.5 ${accent || ''}`}>{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function classifyChannel(log: any): 'voip' | 'wavoip' {
  const t = String(log.type || log.metadata?.channel || '').toLowerCase();
  return t.includes('wavoip') ? 'wavoip' : 'voip';
}

export default function CallsPerformancePage() {
  const { filters, setFilters, setExtra } = useCeoFilters({ period: '30d' }, { ch: 'all' });
  const channel = filters.ch as Channel;
  const setChannel = (v: string) => setExtra({ ch: v });
  const [logs, setLogs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [l, p] = await Promise.all([
        (supabase as any).from('wavoip_audit_logs').select('*').limit(5000),
        supabase.from('profiles').select('user_id,display_name'),
      ]);
      setLogs((l.data as any) || []);
      setProfiles((p.data as any) || []);
    })();
  }, []);

  const profileName = (uid?: string | null) =>
    !uid ? '—' : (profiles.find(p => p.user_id === uid)?.display_name || uid.slice(0, 8) + '…');

  const filtered = useMemo(() => {
    const start = periodStart(filters.period);
    return logs.filter(l => {
      const ts = new Date(l.timestamp || l.created_at);
      if (start && ts < start) return false;
      if (filters.subCompanyId !== 'all' && String(l.sub_company_id) !== filters.subCompanyId) return false;
      const uid = l.metadata?.user_id || l.replay_user_id;
      if (filters.collaboratorId !== 'all' && uid !== filters.collaboratorId) return false;
      if (channel !== 'all' && classifyChannel(l) !== channel) return false;
      return true;
    });
  }, [logs, filters, channel]);

  const counts = useMemo(() => {
    const inbound = filtered.filter(l => /inbound|received|incoming/i.test(String(l.type) + String(l.metadata?.direction))).length;
    const outbound = filtered.filter(l => /outbound|outgoing|dial/i.test(String(l.type) + String(l.metadata?.direction))).length;
    const missed = filtered.filter(l => /missed|fail|abandon|rejected/i.test(String(l.status))).length;
    const voip = filtered.filter(l => classifyChannel(l) === 'voip').length;
    const wavoip = filtered.filter(l => classifyChannel(l) === 'wavoip').length;
    const total = filtered.length;
    const answerRate = total ? Math.round(((total - missed) / total) * 100) : 0;
    return { inbound, outbound, missed, voip, wavoip, total, answerRate };
  }, [filtered]);

  const byDay = useMemo(() => {
    const m: Record<string, { day: string; voip: number; wavoip: number }> = {};
    filtered.forEach(l => {
      const d = new Date(l.timestamp || l.created_at);
      const k = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      m[k] = m[k] || { day: k, voip: 0, wavoip: 0 };
      m[k][classifyChannel(l)]++;
    });
    return Object.values(m).slice(-30);
  }, [filtered]);

  const ranking = useMemo(() => {
    const m: Record<string, { id: string; total: number; answered: number }> = {};
    filtered.forEach(l => {
      const uid = l.metadata?.user_id || l.replay_user_id;
      if (!uid) return;
      m[uid] = m[uid] || { id: uid, total: 0, answered: 0 };
      m[uid].total++;
      if (!/missed|fail|abandon|rejected/i.test(String(l.status))) m[uid].answered++;
    });
    return Object.values(m).map(x => ({
      id: x.id,
      name: profileName(x.id),
      primary: x.total,
      primaryLabel: `${x.total} chamadas`,
      hint: `${x.total ? Math.round((x.answered / x.total) * 100) : 0}% atendimento · ${x.answered} atendidas`,
    }));
  }, [filtered, profiles]);

  const exportRows = () => filtered.map(l => ({
    data: new Date(l.timestamp || l.created_at).toLocaleString('pt-BR'),
    canal: classifyChannel(l), tipo: l.type || '', status: l.status || '',
    direcao: l.metadata?.direction || '', usuario: profileName(l.metadata?.user_id || l.replay_user_id),
  }));
  const kpisExport = [
    { label: 'Total', value: counts.total }, { label: 'Recebidas', value: counts.inbound },
    { label: 'Realizadas', value: counts.outbound }, { label: 'Perdidas', value: counts.missed },
    { label: 'Atendimento', value: `${counts.answerRate}%` },
    { label: 'VoIP', value: counts.voip }, { label: 'Wavoip', value: counts.wavoip },
  ];

  return (
    <AppLayout title="Ligações — VoIP & Wavoip" subtitle="Performance e KPIs reais de telefonia">
      <div className="space-y-6">
        <CeoFilterBar value={filters} onChange={setFilters} extraRight={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`ligacoes-${Date.now()}.csv`, exportRows())}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => downloadPdf(`ligacoes-${Date.now()}.pdf`, 'Ligações — VoIP & Wavoip', `Período: ${PERIOD_LABELS[filters.period]}`, kpisExport, exportRows())}><FileText className="w-4 h-4 mr-1" />PDF</Button>
          </>
        } />


        <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <TabsList>
            <TabsTrigger value="all"><Phone className="w-4 h-4 mr-2" />Todas</TabsTrigger>
            <TabsTrigger value="voip"><Wifi className="w-4 h-4 mr-2" />VoIP</TabsTrigger>
            <TabsTrigger value="wavoip"><Activity className="w-4 h-4 mr-2" />Wavoip</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Kpi icon={Phone} label="Total" value={counts.total.toLocaleString('pt-BR')} hint={PERIOD_LABELS[filters.period]} />
          <Kpi icon={PhoneIncoming} label="Recebidas" value={counts.inbound.toLocaleString('pt-BR')} accent="text-emerald-500" />
          <Kpi icon={PhoneOutgoing} label="Realizadas" value={counts.outbound.toLocaleString('pt-BR')} accent="text-sky-500" />
          <Kpi icon={PhoneMissed} label="Perdidas" value={counts.missed.toLocaleString('pt-BR')} accent="text-destructive" />
          <Kpi icon={TrendingUp} label="Taxa de atendimento" value={`${counts.answerRate}%`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-card"><CardHeader><CardTitle className="text-base">VoIP</CardTitle><CardDescription>Linhas SIP/telefonia tradicional</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold">{counts.voip}</p><Badge variant="outline" className="mt-2">chamadas no período</Badge></CardContent></Card>
          <Card className="glass-card"><CardHeader><CardTitle className="text-base">Wavoip</CardTitle><CardDescription>Ligações via WhatsApp Cloud</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold">{counts.wavoip}</p><Badge variant="outline" className="mt-2">chamadas no período</Badge></CardContent></Card>
        </div>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Volume diário por canal</CardTitle><CardDescription>VoIP vs Wavoip</CardDescription></CardHeader>
          <CardContent className="h-[320px]">
            {byDay.length === 0 ? <p className="text-sm text-muted-foreground text-center py-12">Sem dados no período.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="voip" name="VoIP" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="wavoip" name="Wavoip" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <TopRanking title="Top 3 colaboradores em ligações" description="Ranqueado por volume e taxa de atendimento" items={ranking} />
      </div>
    </AppLayout>
  );
}
