import { Users, MessagesSquare, TrendingUp, PenLine } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import type { CompanyRow, SubCompanyRow } from '@/hooks/useOwnerPlatformMetrics';

interface Props {
  company: CompanyRow;
  subCompanies: SubCompanyRow[];
}

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

const PALETTE = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

function MiniKpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

export function CompanyDetailPanel({ company, subCompanies }: Props) {
  const chartData = subCompanies.length > 0
    ? subCompanies.map((s) => ({ name: s.name.slice(0, 14), leads: s.leads, ganhos: s.won_leads }))
    : [{ name: 'Matriz', leads: company.leads, ganhos: company.won_leads }];

  const convRate = company.leads > 0 ? Math.round((company.won_leads / company.leads) * 100) : 0;

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi icon={Users} label="Usuários" value={fmt(company.users)} />
        <MiniKpi icon={PenLine} label="Clientes" value={fmt(company.customers)} />
        <MiniKpi icon={MessagesSquare} label="Mensagens 30d" value={fmt(company.messages_30d)} />
        <MiniKpi icon={TrendingUp} label="Conversão" value={`${convRate}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <h4 className="text-sm font-semibold mb-2">Leads por unidade</h4>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="leads" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
                <Bar dataKey="ganhos" radius={[6, 6, 0, 0]} fill="hsl(var(--success))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/60 p-4">
          <h4 className="text-sm font-semibold mb-2">Sub-empresas ({subCompanies.length})</h4>
          {subCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem sub-empresas cadastradas.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-1.5">Nome</th>
                    <th className="text-right">Usuários</th>
                    <th className="text-right">Leads</th>
                    <th className="text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {subCompanies.map((s) => (
                    <tr key={s.id} className="border-t border-border/60">
                      <td className="py-1.5">{s.name}</td>
                      <td className="text-right">{fmt(s.users)}</td>
                      <td className="text-right">{fmt(s.leads)}</td>
                      <td className="text-right font-medium">{brl(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
