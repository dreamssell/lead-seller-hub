import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, ToggleLeft, ToggleRight, Loader2, AlertCircle, Code2, ExternalLink, ShieldCheck, Terminal, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  is_active: boolean | null;
  last_used_at: string | null;
  created_at: string;
  created_by: string;
  scopes?: string[] | null;
}

const AVAILABLE_SCOPES = [
  { id: 'auth:verify', label: 'auth:verify', desc: 'Verificar e-mail (login externo - etapa 1)' },
  { id: 'auth:login', label: 'auth:login', desc: 'Autenticar com senha (login externo - etapa 2)' },
  { id: 'data:read', label: 'data:read', desc: 'Leitura de dados via API' },
  { id: 'data:write', label: 'data:write', desc: 'Escrita de dados via API' },
  { id: 'admin:full', label: 'admin:full', desc: 'Acesso administrativo total' },
];

export default function ApiTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['auth:verify', 'auth:login']);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'GET',
      });
      if (error) throw error;
      setKeys(data || []);
    } catch (err: any) {
      console.error('Error loading API keys:', err);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar as chaves.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'POST',
        body: { name: newKeyName.trim(), scopes: newKeyScopes },
      });
      if (error) throw error;
      setNewlyCreatedKey(data.full_key);
      setKeys(prev => [data, ...prev]);
      setNewKeyName('');
      setShowCreateModal(false);
      toast({ title: 'Chave criada!', description: 'Copie a chave agora.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message || 'Erro ao criar chave.' });
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta chave?')) return;
    try {
      const { error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'DELETE',
        body: { id },
      });
      if (error) throw error;
      setKeys(prev => prev.filter(k => k.id !== id));
      toast({ title: 'Chave removida' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao remover chave.' });
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
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao atualizar status.' });
    }
  };

  const copyKey = (val: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: 'Copiado!', description: 'Chave copiada com sucesso.' });
  };

  const maskKey = (key: string) => `${key.substring(0, 8)}${'•'.repeat(20)}${key.slice(-4)}`;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Key className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Chaves Ativas</p>
          </div>
          <p className="text-2xl font-bold">{keys.filter(k => k.is_active).length}</p>
        </div>
        <div className="glass-card p-5 border-emerald-500/10 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500"><ShieldCheck className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Status API</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-sm font-medium text-emerald-600">Operacional</p>
          </div>
        </div>
        <div className="glass-card p-5 border-amber-500/10 bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500"><Terminal className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Base URL</p>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground truncate">https://api.plataforma.com/v1</p>
        </div>
      </div>

      {/* Main Section: Tokens */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">Tokens API</h3>
            <p className="text-xs text-muted-foreground">Gerencie seus tokens de acesso para integrações externas e webhooks.</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Gerar Token
          </Button>
        </div>

        {newlyCreatedKey && (
          <div className="mb-6 p-4 rounded-xl border border-primary/30 bg-primary/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2">
              <Button variant="ghost" size="sm" onClick={() => setNewlyCreatedKey(null)} className="h-6 w-6 p-0 rounded-full">×</Button>
            </div>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Copie seu novo token agora!</p>
                <p className="text-xs text-muted-foreground mb-3">Esta é a única vez que você poderá vê-lo por completo.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2.5 rounded-lg bg-secondary/50 font-mono text-[11px] break-all border border-border">
                    {newlyCreatedKey}
                  </code>
                  <Button variant="secondary" size="icon" onClick={() => copyKey(newlyCreatedKey)} className="shrink-0 rounded-lg">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
              <Key className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum token gerado ainda.</p>
              <Button variant="link" onClick={() => setShowCreateModal(true)}>Gerar meu primeiro token</Button>
            </div>
          ) : (
            keys.map((k) => (
              <div key={k.id} className="group p-4 rounded-xl border border-border hover:border-primary/20 hover:bg-primary/[0.01] transition-all">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${k.is_active ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                      <Key className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold truncate">{k.name}</h4>
                        <Badge variant={k.is_active ? 'default' : 'secondary'} className="text-[10px] h-4">
                          {k.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-[11px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded truncate max-w-[200px]">
                          {visibleKeys.has(k.id) ? k.key : maskKey(k.key)}
                        </code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleKeys(prev => {
                          const next = new Set(prev);
                          next.has(k.id) ? next.delete(k.id) : next.add(k.id);
                          return next;
                        })}>
                          {visibleKeys.has(k.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyKey(k.key)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex flex-col items-end text-[10px] text-muted-foreground mr-2">
                      <span>Criado: {new Date(k.created_at).toLocaleDateString('pt-BR')}</span>
                      <span>Uso: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('pt-BR') : 'Nunca'}</span>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => toggleKeyStatus(k.id, k.is_active)} className="rounded-lg h-9 w-9">
                            {k.is_active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{k.is_active ? 'Desativar' : 'Ativar'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button variant="ghost" size="icon" onClick={() => deleteKey(k.id)} className="rounded-lg h-9 w-9 hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3 ml-13">
                  {(k.scopes ?? []).map(s => (
                    <Badge key={s} variant="outline" className="text-[9px] bg-secondary/30 px-1.5 py-0 border-transparent text-muted-foreground">{s}</Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Documentation Section */}
      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-border bg-gradient-to-r from-secondary/30 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><BookOpen className="w-5 h-5" /></div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Documentação Rápida</h3>
              <p className="text-xs text-muted-foreground">Exemplos de chamadas e endpoints fundamentais.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-xl">
            <a href="https://docs.lovable.dev" target="_blank" rel="noreferrer">
              Doc Completa <ExternalLink className="w-3.5 h-3.5 ml-2" />
            </a>
          </Button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary border-primary/20 uppercase px-2 py-0.5">POST</Badge>
              <span className="text-xs font-semibold">/api/v1/auth/verify</span>
              <p className="text-[11px] text-muted-foreground ml-auto">Primeira etapa do login externo</p>
            </div>
            <div className="relative group">
              <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/50 backdrop-blur-sm shadow-sm" onClick={() => copyKey('curl -X POST https://api.plataforma.com/v1/auth/verify \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -d \'{"email": "user@example.com"}\'')}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <pre className="bg-secondary/40 p-4 rounded-xl text-[11px] font-mono overflow-x-auto text-foreground/80 leading-relaxed border border-border/50">
{`curl -X POST https://api.plataforma.com/v1/auth/verify \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{"email": "user@example.com"}'`}
              </pre>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/5 text-emerald-600 border-emerald-500/20 uppercase px-2 py-0.5">POST</Badge>
              <span className="text-xs font-semibold">/api/v1/auth/login</span>
              <p className="text-[11px] text-muted-foreground ml-auto">Autenticação com e-mail e senha</p>
            </div>
            <div className="relative group">
              <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/50 backdrop-blur-sm shadow-sm" onClick={() => copyKey('curl -X POST https://api.plataforma.com/v1/auth/login \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -d \'{"email": "user@example.com", "password": "..."}\'')}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <pre className="bg-secondary/40 p-4 rounded-xl text-[11px] font-mono overflow-x-auto text-foreground/80 leading-relaxed border border-border/50">
{`curl -X POST https://api.plataforma.com/v1/auth/login \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{"email": "user@example.com", "password": "YOUR_PASSWORD"}'`}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Gerar novo token</DialogTitle>
            <DialogDescription>
              Dê um nome para identificar este token e selecione as permissões.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome do Token</Label>
              <Input
                id="name"
                placeholder="Ex: Integração Site"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Permissões (Escopos)</Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_SCOPES.map(s => {
                  const active = newKeyScopes.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setNewKeyScopes(prev => 
                        prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                      )}
                      className={`text-left p-3 rounded-xl border transition-all ${active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-secondary/30 hover:border-primary/40'}`}
                    >
                      <p className="text-xs font-semibold">{s.label}</p>
                      <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={createKey} disabled={creating || !newKeyName.trim()} className="rounded-xl min-w-[100px]">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gerar Token'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
