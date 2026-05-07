import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { FileText, Download, Calendar as CalendarIcon, Filter, BarChart3, TrendingUp, Users, Clock, Bot, UserCog, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const reports = [
  { id: 1, title: 'Relatório de Atendimentos', date: '15/04/2026', type: 'Mensal', size: '2.4 MB' },
  { id: 2, title: 'Performance dos Agentes I.A.', date: '14/04/2026', type: 'Semanal', size: '1.8 MB' },
  { id: 3, title: 'Métricas de Conversão', date: '10/04/2026', type: 'Mensal', size: '3.1 MB' },
  { id: 4, title: 'Gravações & Transcrições', date: '08/04/2026', type: 'Semanal', size: '12.5 MB' },
];

type Task = {
  id: number;
  date: string; // YYYY-MM-DD
  time: string;
  title: string;
  lead: string;
  responsible: string;
  type: 'human' | 'ai';
  priority: 'high' | 'medium' | 'low';
};

const today = new Date();
const d = (offset: number) => {
  const x = new Date(today);
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

const tasks: Task[] = [
  { id: 1, date: d(0), time: '09:00', title: 'Ligação de qualificação', lead: 'Maria Santos', responsible: 'João Silva', type: 'human', priority: 'high' },
  { id: 2, date: d(0), time: '11:30', title: 'Follow-up proposta Plano Pro', lead: 'Carlos Oliveira', responsible: 'Agente de Vendas IA', type: 'ai', priority: 'medium' },
  { id: 3, date: d(0), time: '15:00', title: 'Demo do produto', lead: 'Patricia Gomes', responsible: 'Maria Costa', type: 'human', priority: 'high' },
  { id: 4, date: d(1), time: '10:00', title: 'Envio de contrato', lead: 'Eduardo Mendes', responsible: 'Pedro Alves', type: 'human', priority: 'medium' },
  { id: 5, date: d(1), time: '14:00', title: 'Re-engajamento lead frio', lead: '@lucas.dev', responsible: 'Qualificador de Leads IA', type: 'ai', priority: 'low' },
  { id: 6, date: d(2), time: '09:30', title: 'Reunião de descoberta', lead: 'Ana Paula', responsible: 'João Silva', type: 'human', priority: 'high' },
  { id: 7, date: d(3), time: '16:00', title: 'Cobrança fatura em atraso', lead: 'Roberto Lima', responsible: 'Cobrança IA', type: 'ai', priority: 'high' },
  { id: 8, date: d(5), time: '11:00', title: 'Apresentação para diretoria', lead: 'Marina Costa', responsible: 'Maria Costa', type: 'human', priority: 'high' },
  { id: 9, date: d(7), time: '15:30', title: 'Renovação anual', lead: 'Visitante #4821', responsible: 'Agente de Atendimento IA', type: 'ai', priority: 'medium' },
  { id: 10, date: d(-1), time: '10:00', title: 'Resgate de carrinho abandonado', lead: 'Julia Ferreira', responsible: 'Agente de Vendas IA', type: 'ai', priority: 'medium' },
];

const priorityColor = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-success/10 text-success border-success/20',
};

const priorityLabel = { high: 'Alta', medium: 'Média', low: 'Baixa' };

export default function ReportsPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(today);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const dayTasks = useMemo(
    () => tasks.filter((t) => selectedDate && isSameDay(new Date(t.date), selectedDate))
      .sort((a, b) => a.time.localeCompare(b.time)),
    [selectedDate],
  );

  const taskDates = useMemo(() => tasks.map((t) => new Date(t.date)), []);

  return (
    <AppLayout title="Relatórios" subtitle="Analytics, exportação de dados e agenda">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      {/* Agenda */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <motion.div className="glass-card p-5 lg:col-span-1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarIcon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Agenda de Tarefas</h3>
          </div>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={ptBR}
            className="rounded-md"
            modifiers={{ hasTask: taskDates }}
            modifiersClassNames={{
              hasTask: 'relative font-bold text-primary after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-primary after:rounded-full',
            }}
          />
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total de tarefas</span>
              <Badge variant="secondary">{tasks.length}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Humanas / IA</span>
              <span className="font-medium">
                {tasks.filter((t) => t.type === 'human').length} / {tasks.filter((t) => t.type === 'ai').length}
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div className="glass-card lg:col-span-2 overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                {selectedDate ? format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR }) : 'Selecione uma data'}
              </h3>
              <p className="text-xs text-muted-foreground">{dayTasks.length} agendamento(s)</p>
            </div>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nova tarefa
            </Button>
          </div>

          <div className="p-3 max-h-[480px] overflow-y-auto space-y-2">
            {dayTasks.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Sem agendamentos nesta data.
              </div>
            ) : dayTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setOpenTask(t)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-secondary/40 transition-all text-left"
              >
                <div className="w-14 shrink-0 text-center">
                  <p className="text-base font-bold text-foreground">{t.time}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  t.type === 'ai' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-600'
                }`}>
                  {t.type === 'ai' ? <Bot className="w-4 h-4" /> : <UserCog className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Lead: <span className="text-foreground">{t.lead}</span> • {t.responsible}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${priorityColor[t.priority]}`}>
                  {priorityLabel[t.priority]}
                </Badge>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Reports List */}
      <div className="glass-card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Relatórios Disponíveis</h3>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <CalendarIcon className="w-3.5 h-3.5" />
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

      <Dialog open={!!openTask} onOpenChange={(o) => !o && setOpenTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openTask?.title}</DialogTitle>
            <DialogDescription>
              {openTask && format(new Date(openTask.date), "EEEE, d 'de' MMMM", { locale: ptBR })} às {openTask?.time}
            </DialogDescription>
          </DialogHeader>
          {openTask && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-muted-foreground">Lead</span>
                <span className="font-medium">{openTask.lead}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-muted-foreground">Responsável</span>
                <span className="font-medium flex items-center gap-1.5">
                  {openTask.type === 'ai' ? <Bot className="w-3.5 h-3.5 text-primary" /> : <UserCog className="w-3.5 h-3.5 text-emerald-600" />}
                  {openTask.responsible}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-muted-foreground">Tipo</span>
                <Badge variant="secondary">{openTask.type === 'ai' ? 'Agente IA' : 'Atendente Humano'}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-muted-foreground">Prioridade</span>
                <Badge variant="outline" className={priorityColor[openTask.priority]}>{priorityLabel[openTask.priority]}</Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
