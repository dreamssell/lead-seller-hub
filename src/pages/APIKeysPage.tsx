import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';

const mockKeys = [
  { id: 1, name: 'Produção - Auth Login', key: 'ls_prod_a1b2c3d4e5f6...', created: '10/04/2026', lastUsed: 'Hoje', active: true },
  { id: 2, name: 'Sandbox - Testes', key: 'ls_test_x7y8z9w0v1u2...', created: '05/04/2026', lastUsed: 'Ontem', active: true },
  { id: 3, name: 'Webhook - Notificações', key: 'ls_wh_m3n4o5p6q7r8...', created: '01/04/2026', lastUsed: '3 dias atrás', active: false },
];

export default function APIKeysPage() {
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());

  const toggleVisibility = (id: number) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <AppLayout title="Chaves API" subtitle="Gerencie suas credenciais de integração">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            Use chaves API para integrar a autenticação externa com esta plataforma.
          </p>
          <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" />
            Nova Chave
          </button>
        </div>

        <div className="space-y-3">
          {mockKeys.map((k, i) => (
            <motion.div
              key={k.id}
              className="glass-card p-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Key className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{k.name}</h4>
                      <span className={`w-2 h-2 rounded-full ${k.active ? 'bg-success' : 'bg-muted-foreground'}`} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded">
                        {visibleKeys.has(k.id) ? k.key.replace('...', 'abcdef1234') : k.key}
                      </code>
                      <button onClick={() => toggleVisibility(k.id)} className="p-1 hover:bg-secondary rounded transition-colors">
                        {visibleKeys.has(k.id) ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                      <button className="p-1 hover:bg-secondary rounded transition-colors">
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>Criada: {k.created}</span>
                      <span>•</span>
                      <span>Último uso: {k.lastUsed}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
