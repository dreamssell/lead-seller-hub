import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Users, Plus, Bot, UserCheck, MoreVertical, Shield } from 'lucide-react';

const teamMembers = [
  { id: 1, name: 'Ana Luíza', role: 'SDR (Agente I.A.)', type: 'ai', status: 'active', conversations: 45 },
  { id: 2, name: 'Rafael Costa', role: 'Closer (Vendedor)', type: 'human', status: 'active', conversations: 23 },
  { id: 3, name: 'Bot Qualificador', role: 'SDR (Agente I.A.)', type: 'ai', status: 'active', conversations: 120 },
  { id: 4, name: 'Juliana Alves', role: 'Closer (Vendedor)', type: 'human', status: 'active', conversations: 18 },
  { id: 5, name: 'Bot Triagem', role: 'SDR (Agente I.A.)', type: 'ai', status: 'paused', conversations: 0 },
];

export default function TeamPage() {
  return (
    <AppLayout title="Equipe (SDR/Closers)" subtitle="Gerencie seus atendentes e agentes de I.A.">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{teamMembers.length}/10 usuários</span>
          <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(teamMembers.length / 10) * 100}%` }}
            />
          </div>
        </div>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Adicionar Membro
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teamMembers.map((member, i) => (
          <motion.div
            key={member.id}
            className="glass-card p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  member.type === 'ai' ? 'bg-primary/10' : 'bg-success/10'
                }`}>
                  {member.type === 'ai' ? (
                    <Bot className="w-5 h-5 text-primary" />
                  ) : (
                    <UserCheck className="w-5 h-5 text-success" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>
              </div>
              <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${member.status === 'active' ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground capitalize">{member.status === 'active' ? 'Ativo' : 'Pausado'}</span>
              </div>
              <span className="text-xs text-muted-foreground">{member.conversations} conversas</span>
            </div>
          </motion.div>
        ))}
      </div>
    </AppLayout>
  );
}
