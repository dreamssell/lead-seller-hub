import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { FileText, Download, Calendar, Filter, BarChart3, TrendingUp, Users, Clock } from 'lucide-react';

const reports = [
  { id: 1, title: 'Relatório de Atendimentos', date: '15/04/2026', type: 'Mensal', size: '2.4 MB' },
  { id: 2, title: 'Performance dos Agentes I.A.', date: '14/04/2026', type: 'Semanal', size: '1.8 MB' },
  { id: 3, title: 'Métricas de Conversão', date: '10/04/2026', type: 'Mensal', size: '3.1 MB' },
  { id: 4, title: 'Gravações & Transcrições', date: '08/04/2026', type: 'Semanal', size: '12.5 MB' },
];

export default function ReportsPage() {
  return (
    <AppLayout title="Relatórios" subtitle="Analytics e exportação de dados em PDF">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: BarChart3, label: 'Atendimentos/mês', value: '3.2k' },
          { icon: TrendingUp, label: 'Satisfação', value: '96%' },
          { icon: Users, label: 'Leads qualificados', value: '847' },
          { icon: Clock, label: 'Tempo médio resposta', value: '1m 23s' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <s.icon className="w-5 h-5 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Reports List */}
      <div className="glass-card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Relatórios Disponíveis</h3>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Calendar className="w-3.5 h-3.5" />
              Período
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Filter className="w-3.5 h-3.5" />
              Filtrar
            </button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-6 py-4 hover:bg-secondary/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{r.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{r.date}</span>
                  <span>•</span>
                  <span>{r.type}</span>
                  <span>•</span>
                  <span>{r.size}</span>
                </div>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
