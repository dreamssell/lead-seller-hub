import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Clock, CheckCircle2, BarChart3, Users } from 'lucide-react';

export type DashDoc = {
  id: string;
  status: string;
  created_at: string;
  signed_at?: string | null;
  created_by: string;
  signer_name?: string | null;
};

const Card = ({ icon: Icon, label, value, hint }: any) => (
  <motion.div className="stat-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <div className="flex items-center justify-between">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
    <div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  </motion.div>
);

interface Props {
  docs: DashDoc[];
  userNames?: Record<string, string>;
}

export function SignatureDashboard({ docs, userNames = {} }: Props) {
  const stats = useMemo(() => {
    const total = docs.length;
    const signed = docs.filter((d) => d.status === 'signed');
    const conversion = total ? ((signed.length / total) * 100).toFixed(1) + '%' : '0%';

    const durations = signed
      .map((d) => (d.signed_at ? new Date(d.signed_at).getTime() - new Date(d.created_at).getTime() : 0))
      .filter((n) => n > 0);
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const avgH = (avgMs / 3_600_000).toFixed(1);

    const byUser: Record<string, { total: number; signed: number }> = {};
    docs.forEach((d) => {
      const key = userNames[d.created_by] || d.created_by.slice(0, 8);
      byUser[key] = byUser[key] || { total: 0, signed: 0 };
      byUser[key].total++;
      if (d.status === 'signed') byUser[key].signed++;
    });
    const ranking = Object.entries(byUser)
      .map(([name, v]) => ({ name, ...v, rate: v.total ? (v.signed / v.total) * 100 : 0 }))
      .sort((a, b) => b.signed - a.signed)
      .slice(0, 8);

    return { total, signedCount: signed.length, conversion, avgH, ranking };
  }, [docs, userNames]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card icon={BarChart3} label="Documentos no período" value={stats.total} />
        <Card icon={CheckCircle2} label="Assinados" value={stats.signedCount} />
        <Card icon={TrendingUp} label="Taxa de conversão" value={stats.conversion} />
        <Card icon={Clock} label="Tempo médio de assinatura" value={`${stats.avgH}h`} />
      </div>

      <div className="glass-card">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Volume por usuário</h3>
        </div>
        <div className="p-4 space-y-2">
          {stats.ranking.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Sem dados no período.</p>
          ) : (
            stats.ranking.map((u) => (
              <div key={u.name} className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs font-medium truncate">{u.name}</div>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${stats.ranking[0].signed ? (u.signed / stats.ranking[0].signed) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground w-32 text-right">
                  {u.signed}/{u.total} · {u.rate.toFixed(0)}%
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
