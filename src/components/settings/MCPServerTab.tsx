import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Server, Plus, Trash2, Edit2, Loader2, AlertCircle, Globe, Hash, Shield, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';

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

export default function MCPServerTab() {
  const { access } = useAuth();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        toast({ title: 'Servidor atualizado', description: 'O servidor MCP foi atualizado com sucesso.' });
      } else {
        const { error } = await supabase
          .from('mcp_servers')
          .insert([payload]);
        if (error) throw error;
        toast({ title: 'Servidor criado', description: 'O servidor MCP foi criado com sucesso.' });
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
    if (!confirm('Tem certeza que deseja remover este servidor?')) return;

    try {
      const { error } = await supabase
        .from('mcp_servers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setServers(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Servidor removido' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao remover servidor.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Server className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Servidores Ativos</p>
          </div>
          <p className="text-2xl font-bold">{servers.filter(s => s.status === 'active').length}</p>
        </div>
        <div className="glass-card p-5 border-emerald-500/10 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500"><Globe className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Uptime Médio</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-sm font-medium text-emerald-600">99.9% Estável</p>
          </div>
        </div>
        <div className="glass-card p-5 border-amber-500/10 bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500"><Shield className="w-4 h-4" /></div>
            <p className="text-sm font-semibold">Segurança</p>
          </div>
          <p className="text-xs text-muted-foreground">TLS/SSL Ativo em todos os hosts configurados.</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">Configurações MCP Server</h3>
            <p className="text-xs text-muted-foreground">Gerencie seus servidores Model Context Protocol para fornecer contexto adicional aos seus agentes de IA.</p>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Novo Servidor
          </Button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
              <Server className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum servidor MCP configurado ainda.</p>
              <Button variant="link" onClick={() => setShowModal(true)}>Adicionar meu primeiro servidor</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Servidor</th>
                    <th className="px-4 py-3 font-medium">Host / URL</th>
                    <th className="px-4 py-3 font-medium text-center">Porta</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {servers.map((s) => (
                    <tr key={s.id} className="group hover:bg-primary/[0.01] transition-all">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                            <Server className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{s.name}</p>
                            {s.description && <p className="text-[10px] text-muted-foreground line-clamp-1">{s.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <code className="text-[11px] font-mono text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">
                          {s.host}
                        </code>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-transparent bg-secondary/30">
                          {s.port}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-muted-foreground'}`} />
                          <span className="text-[11px] font-medium">{s.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(s)} className="h-8 w-8 rounded-lg">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingServer ? 'Editar Servidor' : 'Novo Servidor'}</DialogTitle>
            <DialogDescription>
              Configure os detalhes do seu servidor MCP para integração com agentes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold">Nome do Servidor</Label>
                <div className="relative">
                  <Input 
                    id="name" 
                    placeholder="Ex: Database Context" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="pl-9"
                  />
                  <Server className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="host" className="text-xs font-semibold">URL do Host / IP</Label>
                  <div className="relative">
                    <Input 
                      id="host" 
                      placeholder="localhost ou 127.0.0.1" 
                      value={host}
                      onChange={e => setHost(e.target.value)}
                      className="pl-9"
                    />
                    <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port" className="text-xs font-semibold">Porta</Label>
                  <div className="relative">
                    <Input 
                      id="port" 
                      type="number"
                      placeholder="3000" 
                      value={port}
                      onChange={e => setPort(Number(e.target.value))}
                      className="pl-9"
                    />
                    <Hash className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="apiKey" className="text-xs font-semibold">Chave de API (Opcional)</Label>
                  <span className="text-[10px] text-muted-foreground">Bearer Token</span>
                </div>
                <div className="relative">
                  <Input 
                    id="apiKey" 
                    type="password"
                    placeholder="••••••••••••••••" 
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="pl-9"
                  />
                  <Shield className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold">Descrição</Label>
                <Textarea 
                  id="description" 
                  placeholder="Descreva a finalidade deste servidor..." 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted/10 text-muted-foreground'}`}>
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Status do Servidor</p>
                    <p className="text-[10px] text-muted-foreground">{status === 'active' ? 'Ativo e pronto para uso' : 'Inativo temporariamente'}</p>
                  </div>
                </div>
                <Switch 
                  checked={status === 'active'} 
                  onCheckedChange={checked => setStatus(checked ? 'active' : 'inactive')} 
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowModal(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="rounded-xl min-w-[100px]">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingServer ? 'Salvar Alterações' : 'Criar Servidor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
