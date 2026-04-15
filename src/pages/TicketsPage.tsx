import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Headphones, Clock, CheckCircle, AlertCircle, MoreVertical } from 'lucide-react';

const tickets = [
  { id: '#1042', client: 'Maria Santos', subject: 'Erro na integração WhatsApp', status: 'open', priority: 'high', time: '5min', channel: 'Chat' },
  { id: '#1041', client: 'Carlos Oliveira', subject: 'Dúvida sobre planos', status: 'in_progress', priority: 'medium', time: '15min', channel: 'WhatsApp' },
  { id: '#1040', client: 'Ana Costa', subject: 'Solicitação de cancelamento', status: 'open', priority: 'high', time: '30min', channel: 'Email' },
  { id: '#1039', client: 'Pedro Lima', subject: 'Configuração de agente I.A.', status: 'resolved', priority: 'low', time: '1h', channel: 'Chat' },
  { id: '#1038', client: 'Julia Ferreira', subject: 'Problema com chamadas VoIP', status: 'in_progress', priority: 'medium', time: '2h', channel: 'VoIP' },
];

const statusMap = {
  open: { label: 'Aberto', color: 'bg-warning/10 text-warning' },
  in_progress: { label: 'Em andamento', color: 'bg-primary/10 text-primary' },
  resolved: { label: 'Resolvido', color: 'bg-success/10 text-success' },
};

const priorityMap = {
  high: { label: 'Alta', color: 'text-destructive' },
  medium: { label: 'Média', color: 'text-warning' },
  low: { label: 'Baixa', color: 'text-muted-foreground' },
};

export default function TicketsPage() {
  return (
    <AppLayout title="Atendimentos" subtitle="Gerencie todos os tickets de suporte">
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Ticket', 'Cliente', 'Assunto', 'Canal', 'Prioridade', 'Status', 'Tempo', ''].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((t) => {
                const status = statusMap[t.status as keyof typeof statusMap];
                const priority = priorityMap[t.priority as keyof typeof priorityMap];
                return (
                  <tr key={t.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono font-medium text-foreground">{t.id}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{t.client}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{t.subject}</td>
                    <td className="px-6 py-4 text-xs text-primary font-medium">{t.channel}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium ${priority.color}`}>{priority.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{t.time}</td>
                    <td className="px-6 py-4">
                      <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </AppLayout>
  );
}
