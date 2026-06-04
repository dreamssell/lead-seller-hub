import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { GripVertical, Plus, MoreVertical } from 'lucide-react';

const columns = [
  {
    title: 'Novo Lead',
    color: 'bg-muted-foreground',
    cards: [
      { id: 1, name: 'Maria Santos', company: 'Tech Corp', value: 'R$ 12.000' },
      { id: 2, name: 'Carlos Oliveira', company: 'Vendas SA', value: 'R$ 8.500' },
    ],
  },
  {
    title: 'Qualificação',
    color: 'bg-primary',
    cards: [
      { id: 3, name: 'Ana Costa', company: 'Digital Ltda', value: 'R$ 25.000' },
    ],
  },
  {
    title: 'Proposta',
    color: 'bg-warning',
    cards: [
      { id: 4, name: 'Pedro Lima', company: 'Innovate Inc', value: 'R$ 45.000' },
      { id: 5, name: 'Julia Ferreira', company: 'Startup XYZ', value: 'R$ 18.000' },
    ],
  },
  {
    title: 'Fechamento',
    color: 'bg-success',
    cards: [
      { id: 6, name: 'Ricardo Mendes', company: 'Global SA', value: 'R$ 67.000' },
    ],
  },
];

export default function PipelinePage() {
  return (
    <AppLayout title="Pipeline & Kanban" subtitle="Gerencie seu funil de vendas">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col, ci) => (
          <motion.div
            key={col.title}
            className="min-w-[280px] flex-shrink-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: ci * 0.1 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <span className="text-xs text-muted-foreground ml-auto">{col.cards.length}</span>
            </div>

            <div className="space-y-2">
              {col.cards.map((card) => (
                <div 
                  key={card.id} 
                  className="glass-card p-4 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors group"
                  onClick={() => {
                    // Simular abertura de detalhe no CRM
                    window.location.href = `/cadastros?entity=contacts&id=${card.id}`;
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-foreground">{card.name}</p>
                    <button className="p-1 rounded hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{card.company}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-semibold text-primary">{card.value}</p>
                    <div className="flex -space-x-1.5">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center border border-background shadow-sm">
                        <User className="w-2.5 h-2.5 text-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </AppLayout>
  );
}
