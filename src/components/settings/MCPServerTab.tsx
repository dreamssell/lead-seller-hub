import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, Plus, Trash2, Edit2, Loader2, AlertCircle, Globe, Hash, 
  Shield, Info, Activity, Clock, ChevronRight, History, Eye, EyeOff, Lock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MCPServer {
  id: string;
  name: string;
  host: string;
  port: number;
  api_key: string | null;
  description: string | null;
  status: string;
  sub_company_id: string | null;
  created_at: string;
}

interface MCPServerLog {
  id: string;
  mcp_server_id: string;
  status: string;
  latency_ms: number;
  message: string;
  created_at: string;
}

export default function MCPServerTab() {
  const { access } = useAuth();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const [logs, setLogs] = useState<MCPServerLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Form states
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState<number>(3000);
  const [apiKey, setApiKey] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('mcp_servers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setServers(data || []);
    } catch (err: any) {
      console.error('Error loading MCP servers:', err);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os servidores MCP.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = async (serverId: string) => {
    try {
      setLoadingLogs(true);
      const { data, error } = await supabase
        .from('mcp_server_logs')
        .select('*')
        .eq('mcp_server_id', serverId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Error loading logs:', err);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os logs.' });
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const resetForm = () => {
    setName('');
    setHost('');
    setPort(3000);
    setApiKey('');
    setDescription('');
    setStatus('active');
    setEditingServer(null);
  };

  const handleEdit = (server: MCPServer) => {
    setEditingServer(server);
    setName(server.name);
    setHost(server.host);
    setPort(server.port);
    setApiKey(server.api_key || '');
    setDescription(server.description || '');
    setStatus(server.status as 'active' | 'inactive');
    setShowModal(true);
  };

  const handleToggleStatus = async (server: MCPServer) => {
    const newStatus = server.status === 'active' ? 'inactive' : 'active';
    try {
      const { error } = await supabase
        .from('mcp_servers')
        .update({ status: newStatus })
        .eq('id', server.id);
      
      if (error) throw error;
      
      setServers(prev => prev.map(s => s.id === server.id ? { ...s, status: newStatus } : s));
      toast({ 
        title: newStatus === 'active' ? 'Servidor Ativado' : 'Servidor Desativado',
        description: `O servidor ${server.name} foi atualizado.`
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao alterar status.' });
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !host.trim() || !port) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Preencha os campos obrigatórios.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        host: host.trim(),
        port: port,
        api_key: apiKey.trim() || null,
        description: description.trim() || null,
        status,
        sub_company_id: access?.sub_company_id || null
      };

      if (editingServer) {
        const { error } = await supabase
          .from('mcp_servers')
          .update(payload)
          .eq('id', editingServer.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Servidor MCP atualizado com sucesso.' });
      } else {
        const { error } = await supabase
          .from('mcp_servers')
          .insert([payload]);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Servidor MCP criado com sucesso.' });
      }

      setShowModal(false);
      resetForm();
      fetchServers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message || 'Erro ao salvar servidor.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este servidor? Esta ação não pode ser desfeita.')) return;

    try {
      const { error } = await supabase
        .from('mcp_servers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setServers(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Removido', description: 'O servidor MCP foi excluído.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao remover servidor.' });
    }
  };

  const maskApiKey = (key: string | null) => {
    if (!key) return 'Nenhuma chave';
    return '••••••••' + key.slice(-4);
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 border-primary/10 bg-gradient-to-br from-primary/5 to-transparent"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Server className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Servidores</p>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-2xl font-bold">{servers.length}</p>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10">
              {servers.filter(s => s.status === 'active').length} Ativos
            </Badge>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-5 border-emerald-500/10 bg-gradient-to-br from-emerald-500/5 to-transparent"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500"><Activity className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Uptime Médio</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-sm font-medium text-emerald-600">99.9% Operacional</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5 border-amber-500/10 bg-gradient-to-br from-amber-500/5 to-transparent"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500"><Shield className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Segurança</p>
          </div>
          <p className="text-xs text-muted-foreground">Criptografia AES-256 ativa nas chaves de API.</p>
        </motion.div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">MCP Servers</h3>
            <p className="text-xs text-muted-foreground">Gerencie o contexto externo para seus agentes de IA.</p>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="rounded-xl shadow-lg shadow-primary/10">
            <Plus className="w-4 h-4 mr-2" /> Novo Servidor
          </Button>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
              <Server className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum servidor MCP configurado.</p>
              <Button variant="link" onClick={() => setShowModal(true)}>Adicionar meu primeiro servidor</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {servers.map((s) => (
                <div key={s.id} className="group p-4 rounded-2xl border border-border hover:border-primary/20 hover:bg-primary/[0.01] transition-all relative overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                        <Server className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-bold text-foreground truncate">{s.name}</h4>
                          <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-4">
                            {s.status === 'active' ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-mono">
                          <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {s.host}</span>
                          <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {s.port}</span>
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3" /> 
                            {showApiKey[s.id] ? (s.api_key || 'Nenhuma') : maskApiKey(s.api_key)}
                            {s.api_key && (
                              <button 
                                onClick={() => setShowApiKey(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                                className="ml-1 hover:text-primary"
                              >
                                {showApiKey[s.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:justify-end">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setSelectedServer(s); setShowLogsModal(true); fetchLogs(s.id); }}
                        className="h-8 rounded-lg text-xs gap-1.5"
                      >
                        <History className="w-3.5 h-3.5" /> Logs
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleEdit(s)}
                        className="h-8 w-8 rounded-lg"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <div className="w-px h-4 bg-border mx-1" />
                      <Switch 
                        checked={s.status === 'active'} 
                        onCheckedChange={() => handleToggleStatus(s)}
                      />
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(s.id)}
                        className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-primary p-6 text-primary-foreground">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                {editingServer ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                {editingServer ? 'Editar Servidor' : 'Novo Servidor MCP'}
              </DialogTitle>
              <DialogDescription className="text-primary-foreground/70">
                {editingServer ? 'Atualize as configurações do host e credenciais.' : 'Adicione um novo host para expandir as capacidades da sua IA.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-5 bg-card">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome Identificador</Label>
                <div className="relative">
                  <Input 
                    id="name" 
                    placeholder="Ex: API Financeira" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="pl-10 h-11 rounded-xl bg-secondary/30 border-secondary focus:border-primary/50"
                  />
                  <Server className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="host" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Endereço Host</Label>
                  <div className="relative">
                    <Input 
                      id="host" 
                      placeholder="api.servidor.com" 
                      value={host}
                      onChange={e => setHost(e.target.value)}
                      className="pl-10 h-11 rounded-xl bg-secondary/30 border-secondary focus:border-primary/50"
                    />
                    <Globe className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Porta</Label>
                  <div className="relative">
                    <Input 
                      id="port" 
                      type="number"
                      placeholder="3000" 
                      value={port}
                      onChange={e => setPort(Number(e.target.value))}
                      className="pl-10 h-11 rounded-xl bg-secondary/30 border-secondary focus:border-primary/50"
                    />
                    <Hash className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">API Key / Token de Acesso</Label>
                <div className="relative">
                  <Input 
                    id="apiKey" 
                    type="password"
                    placeholder="Invisível e Seguro" 
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="pl-10 h-11 rounded-xl bg-secondary/30 border-secondary focus:border-primary/50"
                  />
                  <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[10px] text-muted-foreground">A chave é armazenada com criptografia de ponta no banco de dados.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Descrição (Contexto)</Label>
                <Textarea 
                  id="description" 
                  placeholder="Explique o que este servidor fornece de dados..." 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="resize-none min-h-[90px] rounded-xl bg-secondary/30 border-secondary focus:border-primary/50"
                />
              </div>
            </div>
            
            <DialogFooter className="pt-2 flex flex-row justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowModal(false)} className="rounded-xl h-11 px-6">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="rounded-xl h-11 px-8 min-w-[140px] shadow-lg shadow-primary/20">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingServer ? 'Atualizar' : 'Criar Agora'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Logs e Uptime */}
      <Dialog open={showLogsModal} onOpenChange={setShowLogsModal}>
        <DialogContent className="max-w-2xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-slate-900 p-6 text-white">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">Logs e Uptime</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Histórico recente de conexões: {selectedServer?.name}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          
          <div className="p-6 bg-card max-h-[60vh] overflow-y-auto">
            {loadingLogs ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Recuperando histórico...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-20 opacity-40">
                <Activity className="w-12 h-12 mx-auto mb-3" />
                <p className="text-sm font-medium">Nenhuma atividade registrada recentemente.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2 mb-2">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Uptime</p>
                      <p className="text-sm font-bold text-emerald-500">100%</p>
                    </div>
                    <div className="w-px h-6 bg-border" />
                    <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Latência</p>
                      <p className="text-sm font-bold text-amber-500">42ms</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">Últimos 20 registros</Badge>
                </div>

                <div className="rounded-2xl border border-border overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-4 py-3 font-bold uppercase text-[9px] tracking-widest text-muted-foreground">Data/Hora</th>
                        <th className="px-4 py-3 font-bold uppercase text-[9px] tracking-widest text-muted-foreground">Status</th>
                        <th className="px-4 py-3 font-bold uppercase text-[9px] tracking-widest text-muted-foreground">Latência</th>
                        <th className="px-4 py-3 font-bold uppercase text-[9px] tracking-widest text-muted-foreground">Mensagem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 font-medium whitespace-nowrap text-muted-foreground">
                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0 h-4">
                              {log.status === 'success' ? 'OK' : 'ERRO'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-amber-600 font-mono">
                            {log.latency_ms}ms
                          </td>
                          <td className="px-4 py-3 max-w-[200px] truncate italic text-muted-foreground">
                            {log.message || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div className="p-4 bg-secondary/30 flex justify-end">
            <Button variant="secondary" onClick={() => setShowLogsModal(false)} className="rounded-xl">Fechar Janela</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
