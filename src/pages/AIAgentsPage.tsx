import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Bot, Plus, Zap, MessageSquare, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState } from 'react';

const agents = [
  { id: 1, name: 'Bot Qualificador', description: 'Qualifica leads e coleta informações iniciais', active: true, conversations: 120, accuracy: 94 },
  { id: 2, name: 'Bot Triagem', description: 'Direciona atendimentos para o setor correto', active: true, conversations: 89, accuracy: 91 },
  { id: 3, name: 'Bot FAQ', description: 'Responde perguntas frequentes automaticamente', active: false, conversations: 45, accuracy: 87 },
];

export default function AIAgentsPage() {
  const [agentStates, setAgentStates] = useState(agents.map(a => a.active));

  const toggleAgent = (index: number) => {
    setAgentStates(prev => prev.map((s, i) => i === index ? !s : s));
  };

  return (
    <AppLayout title="Agentes de I.A." subtitle="Configure e treine seus agentes inteligentes">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">{agents.length} agentes configurados</p>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Novo Agente
        </button>
      </div>

      <div className="space-y-4">
        {agents.map((agent, i) => (
          <motion.div
            key={agent.id}
            className="glass-card p-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{agent.description}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{agent.conversations} conversas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{agent.accuracy}% precisão</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => toggleAgent(i)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {agentStates[i] ? (
                    <ToggleRight className="w-8 h-8 text-success" />
                  ) : (
                    <ToggleLeft className="w-8 h-8" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </AppLayout>
  );
}
