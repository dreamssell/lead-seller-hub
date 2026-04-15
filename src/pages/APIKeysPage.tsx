import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  is_active: boolean | null;
  last_used_at: string | null;
  created_at: string;
  created_by: string;
}

export default function APIKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'GET',
      });

      if (error) throw error;
      setKeys(data || []);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar as chaves.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Faça login para gerenciar chaves.' });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'POST',
        body: { name: newKeyName.trim() },
      });
      if (error) throw error;
      setNewlyCreatedKey(data.full_key);
      setKeys(prev => [data, ...prev]);
      setNewKeyName('');
      setShowCreateForm(false);
      toast({ title: 'Chave criada!', description: 'Copie a chave agora — ela não será exibida novamente por completo.' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível criar a chave.' });
    } finally {
      setCreating(false);
    }
  };

  const toggleKeyStatus = async (id: string, currentStatus: boolean | null) => {
    try {
      const { error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'PATCH',
        body: { id, is_active: !currentStatus },
      });
      if (error) throw error;
      setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: !currentStatus } : k));
      toast({ title: !currentStatus ? 'Chave ativada' : 'Chave desativada' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao atualizar status.' });
    }
  };

  const deleteKey = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'DELETE',
        body: { id },
      });
      if (error) throw error;
      setKeys(prev => prev.filter(k => k.id !== id));
      toast({ title: 'Chave removida' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao remover chave.' });
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Copiado!', description: 'Chave copiada para a área de transferência.' });
  };

  const toggleVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const maskKey = (key: string) => `${key.substring(0, 8)}${'•'.repeat(20)}${key.slice(-4)}`;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const formatRelative = (d: string | null) => {
    if (!d) return 'Nunca';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Agora';
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  };

  return (
    <AppLayout title="Chaves API" subtitle="Gerencie suas credenciais de integração">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            Use chaves API para integrar a autenticação externa com esta plataforma.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Nova Chave
          </button>
        </div>

        {/* Create form */}
        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              className="glass-card p-5 mb-4"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <h4 className="text-sm font-semibold text-foreground mb-3">Criar nova chave API</h4>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  placeholder="Ex: Produção - Auth Login"
                  className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  onKeyDown={e => e.key === 'Enter' && createKey()}
                />
                <button
                  onClick={createKey}
                  disabled={creating || !newKeyName.trim()}
                  className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gerar'}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewKeyName(''); }}
                  className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Newly created key banner */}
        <AnimatePresence>
          {newlyCreatedKey && (
            <motion.div
              className="glass-card p-4 mb-4 border-primary/30 bg-primary/5"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Copie sua chave agora!</p>
                  <p className="text-xs text-muted-foreground mb-2">Esta é a única vez que a chave completa será exibida.</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-secondary px-3 py-2 rounded-lg break-all flex-1">
                      {newlyCreatedKey}
                    </code>
                    <button onClick={() => copyKey(newlyCreatedKey)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                      <Copy className="w-4 h-4 text-primary" />
                    </button>
                  </div>
                </div>
                <button onClick={() => setNewlyCreatedKey(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  Fechar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {/* Empty state */}
        {!loading && keys.length === 0 && (
          <div className="text-center py-16">
            <Key className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma chave API criada.</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em "Nova Chave" para começar.</p>
          </div>
        )}

        {/* Keys list */}
        <div className="space-y-3">
          {keys.map((k, i) => (
            <motion.div
              key={k.id}
              className="glass-card p-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Key className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{k.name}</h4>
                      <span className={`w-2 h-2 rounded-full ${k.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      <span className="text-[10px] text-muted-foreground">{k.is_active ? 'Ativa' : 'Inativa'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded">
                        {visibleKeys.has(k.id) ? k.key : maskKey(k.key)}
                      </code>
                      <button onClick={() => toggleVisibility(k.id)} className="p-1 hover:bg-secondary rounded transition-colors">
                        {visibleKeys.has(k.id) ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                      <button onClick={() => copyKey(k.key)} className="p-1 hover:bg-secondary rounded transition-colors">
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>Criada: {formatDate(k.created_at)}</span>
                      <span>•</span>
                      <span>Último uso: {formatRelative(k.last_used_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleKeyStatus(k.id, k.is_active)}
                    className="p-2 rounded-lg hover:bg-secondary transition-colors"
                    title={k.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {k.is_active ? (
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteKey(k.id)}
                    className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* API docs section */}
        <motion.div
          className="glass-card p-6 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-3">📡 Como integrar</h3>
          <div className="space-y-3 text-xs text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">1. Verificar e-mail (Step 1 do login externo)</p>
              <code className="block bg-secondary p-3 rounded-lg overflow-x-auto">
                {`POST /functions/v1/verify-email\n{ "email": "usuario@email.com", "api_key": "ls_..." }`}
              </code>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">2. Autenticar (Step 2 do login externo)</p>
              <code className="block bg-secondary p-3 rounded-lg overflow-x-auto">
                {`POST /functions/v1/authenticate\n{ "email": "usuario@email.com", "password": "***", "api_key": "ls_..." }`}
              </code>
            </div>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
