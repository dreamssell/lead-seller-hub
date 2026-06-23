import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CeoFilterBar, periodStart, PERIOD_LABELS } from '@/components/ceo/CeoFilterBar';
import { useCeoFilters } from '@/hooks/useCeoFilters';
import { TopRanking } from '@/components/ceo/TopRanking';
import { SignatureDashboard } from '@/components/signature/SignatureDashboard';
import { supabase } from '@/integrations/supabase/client';
import { downloadCsv, downloadPdf } from '@/lib/ceoExport';
import { FileSignature, CheckCircle2, Clock, AlertCircle, Download, FileText } from 'lucide-react';

function Kpi({ icon: Icon, label, value, accent }: any) {
  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className={`text-2xl font-bold mt-1.5 ${accent || ''}`}>{value}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SignaturesPerformancePage() {
  const [filters, setFilters] = useState<CeoFilters>({ period: '30d', subCompanyId: 'all', collaboratorId: 'all' });
  const [docs, setDocs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [d, p, s] = await Promise.all([
        (supabase as any).from('signature_documents').select('*').limit(5000),
        supabase.from('profiles').select('user_id,display_name'),
        supabase.from('sub_companies').select('id,name'),
      ]);
      setDocs((d.data as any) || []);
      setProfiles((p.data as any) || []);
      setSubs((s.data as any) || []);
    })();
  }, []);

  const profileName = (uid?: string | null) =>
    !uid ? '—' : (profiles.find(p => p.user_id === uid)?.display_name || uid.slice(0, 8) + '…');

  const filtered = useMemo(() => {
    const start = periodStart(filters.period);
    return docs.filter(d => {
      if (start && new Date(d.created_at) < start) return false;
      if (filters.subCompanyId !== 'all' && d.sub_company_id !== filters.subCompanyId) return false;
      if (filters.collaboratorId !== 'all' && d.created_by !== filters.collaboratorId) return false;
      return true;
    });
  }, [docs, filters]);

  const counts = useMemo(() => {
    const signed = filtered.filter(d => d.status === 'signed').length;
    const pending = filtered.filter(d => ['pending', 'sent', 'viewed'].includes(d.status)).length;
    const expired = filtered.filter(d => d.status === 'expired' || (d.expires_at && new Date(d.expires_at) < new Date() && d.status !== 'signed')).length;
    return { total: filtered.length, signed, pending, expired };
  }, [filtered]);

  const ranking = useMemo(() => {
    const m: Record<string, { id: string; total: number; signed: number }> = {};
    filtered.forEach(d => {
      const uid = d.created_by;
      if (!uid) return;
      m[uid] = m[uid] || { id: uid, total: 0, signed: 0 };
      m[uid].total++;
      if (d.status === 'signed') m[uid].signed++;
    });
    return Object.values(m).map(x => ({
      id: x.id,
      name: profileName(x.id),
      primary: x.signed,
      primaryLabel: `${x.signed} assinados`,
      hint: `${x.total} enviados · ${x.total ? Math.round((x.signed / x.total) * 100) : 0}% conversão`,
    }));
  }, [filtered, profiles]);

  const userNames = useMemo(() => Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || p.user_id.slice(0, 8)])), [profiles]);
  const subNames = useMemo(() => Object.fromEntries(subs.map(s => [s.id, s.name])), [subs]);

  return (
    <AppLayout title="Assinaturas Eletrônicas" subtitle="Métricas, KPIs e status reais das assinaturas">
      <div className="space-y-6">
        <CeoFilterBar value={filters} onChange={setFilters} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi icon={FileSignature} label="Total enviados" value={counts.total} />
          <Kpi icon={CheckCircle2} label="Assinados" value={counts.signed} accent="text-emerald-500" />
          <Kpi icon={Clock} label="Pendentes" value={counts.pending} accent="text-amber-500" />
          <Kpi icon={AlertCircle} label="Expirados" value={counts.expired} accent="text-destructive" />
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Status no período</CardTitle>
            <CardDescription>Visão consolidada — {PERIOD_LABELS[filters.period]}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(filtered.reduce<Record<string, number>>((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {})).map(([s, n]) => (
              <Badge key={s} variant="secondary" className="text-sm py-1.5 px-3">{s}: <span className="ml-1 font-bold">{n}</span></Badge>
            ))}
          </CardContent>
        </Card>

        <SignatureDashboard docs={filtered as any} userNames={userNames} subNames={subNames} />

        <TopRanking title="Top 3 colaboradores em assinaturas" description="Ranqueado por documentos assinados" items={ranking} />
      </div>
    </AppLayout>
  );
}
