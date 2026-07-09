import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, PieChart, Pie, Legend } from 'recharts';
import type { DailyPoint, Slice } from '@/hooks/useOwnerPlatformMetrics';

const PALETTE = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--accent))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="h-64">{children}</div>
    </div>
  );
}

export function PlatformCharts({ messagesByDay, companiesByPlan, leadsByCompany }: {
  messagesByDay: DailyPoint[]; companiesByPlan: Slice[]; leadsByCompany: Slice[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Mensagens (14 dias)" subtitle="Volume total de mensagens na plataforma">
        <ResponsiveContainer>
          <LineChart data={messagesByDay} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Empresas por plano" subtitle="Distribuição de assinantes por plano">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={companiesByPlan} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {companiesByPlan.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Top empresas por leads" subtitle="8 maiores geradoras de oportunidades">
        <ResponsiveContainer>
          <BarChart data={leadsByCompany} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={110} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {leadsByCompany.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
