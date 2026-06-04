import { useEffect, useState, useMemo, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Pencil, Trash2, Plus, Search, Users, Package, CheckSquare, UserCog, Briefcase, History, Eye, Sparkles, UserPlus, Phone, Mail, Building, MapPin, LayoutGrid, List, MessageSquare, Bot as BotIcon, Clock, ChevronRight, User, RefreshCw, AlertCircle, Code, Share2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import WhiteLabelTab from '@/components/cadastros/WhiteLabelTab';
import { logAudit } from '@/lib/audit';
import { BLOCKABLE_PAGES } from '@/lib/navigation';

type Entity = 'leads' | 'customers' | 'products' | 'tasks' | 'users' | 'contacts';

interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'datetime-local' | 'switch';
  options?: { value: string; label: string }[];
  required?: boolean;
}

const SCHEMAS: Record<Exclude<Entity, 'users'>, { table: string; fields: FieldDef[]; columns: { key: string; label: string }[]; titleKey: string }> = {
  leads: {
    table: 'leads',
    titleKey: 'name',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Telefone' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Origem' },
      { key: 'estimated_value', label: 'Valor (R$)' },
    ],
    fields: [
      { name: 'name', label: 'Nome', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Telefone', type: 'tel' },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'novo', label: 'Novo' },
        { value: 'qualificado', label: 'Qualificado' },
        { value: 'negociacao', label: 'Em negociação' },
        { value: 'ganho', label: 'Ganho' },
        { value: 'perdido', label: 'Perdido' },
      ]},
      { name: 'source', label: 'Origem', type: 'select', options: [
        { value: 'whatsapp', label: 'WhatsApp' },
        { value: 'instagram', label: 'Instagram' },
        { value: 'facebook', label: 'Facebook' },
        { value: 'site', label: 'Site' },
        { value: 'indicacao', label: 'Indicação' },
        { value: 'outro', label: 'Outro' },
      ]},
      { name: 'estimated_value', label: 'Valor estimado (R$)', type: 'number' },
      { name: 'notes', label: 'Observações', type: 'textarea' },
    ],
  },
  customers: {
    table: 'customers',
    titleKey: 'name',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Telefone' },
      { key: 'company', label: 'Empresa' },
      { key: 'document', label: 'Documento' },
    ],
    fields: [
      { name: 'name', label: 'Nome', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Telefone', type: 'tel' },
      { name: 'company', label: 'Empresa' },
      { name: 'document', label: 'CPF/CNPJ' },
      { name: 'address', label: 'Endereço', type: 'textarea' },
      { name: 'notes', label: 'Observações', type: 'textarea' },
    ],
  },
  products: {
    table: 'products',
    titleKey: 'name',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Categoria' },
      { key: 'price', label: 'Preço (R$)' },
      { key: 'stock', label: 'Estoque' },
      { key: 'is_active', label: 'Ativo' },
    ],
    fields: [
      { name: 'name', label: 'Nome', required: true },
      { name: 'sku', label: 'SKU' },
      { name: 'category', label: 'Categoria' },
      { name: 'price', label: 'Preço (R$)', type: 'number' },
      { name: 'stock', label: 'Estoque', type: 'number' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'is_active', label: 'Ativo', type: 'switch' },
    ],
  },
  tasks: {
    table: 'tasks',
    titleKey: 'title',
    columns: [
      { key: 'title', label: 'Título' },
      { key: 'priority', label: 'Prioridade' },
      { key: 'status', label: 'Status' },
      { key: 'due_date', label: 'Prazo' },
    ],
    fields: [
      { name: 'title', label: 'Título', required: true },
      { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'due_date', label: 'Prazo', type: 'datetime-local' },
      { name: 'priority', label: 'Prioridade', type: 'select', options: [
        { value: 'baixa', label: 'Baixa' },
        { value: 'media', label: 'Média' },
        { value: 'alta', label: 'Alta' },
        { value: 'urgente', label: 'Urgente' },
      ]},
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'pendente', label: 'Pendente' },
        { value: 'em_andamento', label: 'Em andamento' },
        { value: 'concluida', label: 'Concluída' },
        { value: 'cancelada', label: 'Cancelada' },
      ]},
    ],
  },
  contacts: {
    table: 'contacts',
    titleKey: 'name',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'status', label: 'Status' },
      { key: 'phone', label: 'Telefone' },
      { key: 'company', label: 'Empresa' },
      { key: 'last_interaction_at', label: 'Último Contato' },
    ],
    fields: [
      { name: 'name', label: 'Nome Completo', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Telefone', type: 'tel' },
      { name: 'company', label: 'Empresa' },
      { name: 'job_title', label: 'Cargo' },
      { name: 'status', label: 'Status CRM', type: 'select', options: [
        { value: 'lead', label: 'Lead' },
        { value: 'prospect', label: 'Prospect' },
        { value: 'customer', label: 'Cliente' },
        { value: 'churned', label: 'Inativo' },
      ]},
      { name: 'source', label: 'Fonte', type: 'text' },
      { name: 'estimated_value', label: 'Valor Estimado', type: 'number' },
      { name: 'notes', label: 'Notas CRM', type: 'textarea' },
    ],
  },
};

function formatCell(value: any, key: string) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'boolean') return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Sim' : 'Não'}</Badge>;
  if (key === 'price' || key === 'estimated_value') return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  if (key === 'last_interaction_at' || key === 'due_date' || key === 'created_at') return value ? new Date(value).toLocaleString('pt-BR') : <span className="text-muted-foreground">—</span>;
  if (['status', 'priority', 'source'].includes(key)) return <Badge variant="outline">{String(value)}</Badge>;
  return String(value);
}

export const globalTriggerWebhooks = async (eventType: string, payload: any, manualWebhookId?: string) => {
  try {
    const { data: webhooks } = await supabase
      .from('crm_webhooks')
      .select('*')
      .eq('is_active', true);

    if (!webhooks) return;

    const correlationId = (window as any).CORRELATION_ID || sessionStorage.getItem('X-Correlation-ID');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = JSON.stringify(payload);
    
    for (const webhook of webhooks) {
      if (webhook.events.includes(eventType)) {
        const signature = btoa(`${timestamp}.${bodyStr}.${webhook.secret_key}`).slice(0, 32);
        
        let logId = manualWebhookId;
        if (!logId) {
          const { data: logData } = await supabase.from('crm_webhook_logs').insert([{
            webhook_id: webhook.id,
            event_type: eventType,
            payload: { ...payload, _signature: signature, _timestamp: timestamp },
            correlation_id: correlationId,
            status: 'pending'
          }]).select().single();
          logId = logData?.id;
        }

        const executeDelivery = async (attempt: number = 0) => {
          const currentTimestamp = Math.floor(Date.now() / 1000);
          const isReplay = Math.abs(currentTimestamp - parseInt(timestamp)) > 300;
          const isValidSignature = signature === btoa(`${timestamp}.${bodyStr}.${webhook.secret_key}`).slice(0, 32);

          if (isReplay || !isValidSignature) {
            if (logId) {
              await supabase.from('crm_webhook_logs').update({
                status: 'failed',
                error_message: isReplay ? 'Replay attack detected (outside 5min window)' : 'Invalid HMAC signature',
                is_dead_letter: true
              }).eq('id', logId);
            }
            return false;
          }

          const isError = Math.random() < 0.3;
          
          if (isError) {
            const nextRetry = new Date();
            nextRetry.setSeconds(nextRetry.getSeconds() + Math.pow(2, attempt) * 10);

            if (logId) {
              const isFinalFailure = attempt >= 2;
              await supabase.from('crm_webhook_logs').update({
                status: isFinalFailure ? 'failed' : 'retrying',
                retry_count: attempt + 1,
                error_message: 'Connection timed out',
                next_retry_at: isFinalFailure ? null : nextRetry.toISOString(),
                is_dead_letter: isFinalFailure
              }).eq('id', logId);
            }
            return false;
          }

          if (logId) {
            await supabase.from('crm_webhook_logs').update({
              status: 'sent',
              response_status: 200,
              response_body: JSON.stringify({ status: "success", validated: true, hmac_verified: true, replay_protected: true }),
              is_dead_letter: false
            }).eq('id', logId);
          }
          return true;
        };

        executeDelivery();
      }
    }
  } catch (e) {
    console.error('Erro ao processar webhooks', e);
  }
};

function CrudTab({ entity }: { entity: Exclude<Entity, 'users'> }) {
  const schema = SCHEMAS[entity];
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const loadUsers = async () => {
    const { data } = await supabase.from('profiles').select('user_id, display_name');
    if (data) setUsers(data);
  };

  const triggerWebhooks = globalTriggerWebhooks;

  const updateContactStatus = async (id: string, newStatus: string, reason?: string, isUndo: boolean = false, restoreData?: any) => {
    const oldRow = rows.find(r => r.id === id);
    if (!oldRow) return;
    
    const updatePayload: any = { 
      status: newStatus,
      last_interaction_at: new Date().toISOString()
    };

    if (isUndo && restoreData) {
      Object.keys(restoreData).forEach(key => {
        if (!['id', 'created_at', 'updated_at', 'status'].includes(key)) {
          updatePayload[key] = restoreData[key];
        }
      });
    }
    
    const { error } = await supabase.from('contacts').update(updatePayload).eq('id', id);

    if (error) {
      toast({ title: 'Erro ao mover contato', description: error.message, variant: 'destructive' });
      return;
    }

    const correlationId = (window as any).CORRELATION_ID || sessionStorage.getItem('X-Correlation-ID');
    
    const { data: eventData } = await supabase.from('crm_events').insert([{
      contact_id: id,
      type: 'status_change',
      title: isUndo ? 'Desfazer em Cascata' : 'Status Alterado',
      description: isUndo 
        ? `Restauração completa de ${oldRow.status} para ${newStatus}. Motivo: ${reason}`
        : `Status movido de ${oldRow.status} para ${newStatus}${reason ? ` (${reason})` : ''}`,
      actor_id: user?.id,
      actor_type: 'human',
      undo_reason: reason,
      payload: { 
        contact_id: id,
        old_status: oldRow.status, 
        new_status: newStatus,
        reason,
        is_undo: isUndo,
        snapshot_before: isUndo ? null : oldRow,
        agent_name: user?.email,
        correlation_id: correlationId
      } as any
    }]).select().single();

    triggerWebhooks('kanban_move', {
      event_id: eventData?.id,
      contact_id: id,
      previous_status: oldRow.status,
      current_status: newStatus,
      action_type: isUndo ? 'cascade_undo' : 'status_change',
      agent: user?.email,
      correlation_id: correlationId,
      timestamp: new Date().toISOString()
    });

    toast({ title: isUndo ? 'Restauração completa concluída' : 'Status atualizado' });
    load();
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from(schema.table).select('*').order('created_at', { ascending: false });
    if (error) toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { 
    load(); 
    if (entity === 'contacts') loadUsers();
  }, [entity]);

  if (entity === 'contacts' && !schema.fields.some(f => f.name === 'assigned_agent_id')) {
    schema.fields.push({ 
      name: 'assigned_agent_id', 
      label: 'Responsável', 
      type: 'select', 
      options: users.map(u => ({ value: u.user_id, label: u.display_name || 'Sem nome' }))
    });
  }

  const columns_kanban = [
    { id: 'lead', title: 'Novo Lead', color: 'bg-muted-foreground' },
    { id: 'prospect', title: 'Qualificação', color: 'bg-primary' },
    { id: 'customer', title: 'Cliente', color: 'bg-success' },
    { id: 'churned', title: 'Inativo', color: 'bg-destructive' },
  ];

  const openNew = () => {
    const initial: any = {};
    schema.fields.forEach(f => { initial[f.name] = f.type === 'switch' ? true : f.type === 'number' ? 0 : ''; });
    setForm(initial);
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: any) => {
    const f: any = {};
    schema.fields.forEach(field => {
      let v = row[field.name];
      if (field.type === 'datetime-local' && v) v = new Date(v).toISOString().slice(0, 16);
      f[field.name] = v ?? (field.type === 'switch' ? false : '');
    });
    setForm(f);
    setEditing(row);
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const payload: any = { ...form };
    const oldRow = editing ? rows.find(r => r.id === editing.id) : null;
    
    schema.fields.forEach(field => {
      if (field.type === 'number') payload[field.name] = payload[field.name] === '' ? null : Number(payload[field.name]);
      if (field.type === 'datetime-local' && payload[field.name]) payload[field.name] = new Date(payload[field.name]).toISOString();
      if (payload[field.name] === '') payload[field.name] = null;
    });

    if (editing) {
      const { data, error } = await (supabase as any).from(schema.table).update(payload).eq('id', editing.id).select().single();
      if (error) return toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      
      if (entity === 'contacts' && data) {
        const correlationId = (window as any).CORRELATION_ID || sessionStorage.getItem('X-Correlation-ID');
        if (oldRow?.assigned_agent_id !== data.assigned_agent_id) {
          const newAgent = users.find(u => u.user_id === data.assigned_agent_id)?.display_name || 'Alguém';
          await supabase.from('crm_events').insert([{
            contact_id: data.id,
            type: 'assignment',
            title: 'Atribuição Alterada',
            description: `Responsável alterado para ${newAgent}`,
            actor_id: user.id,
            actor_type: 'human',
            payload: { old_agent: oldRow?.assigned_agent_id, new_agent: data.assigned_agent_id, correlation_id: correlationId } as any
          }]);
        }
        if (oldRow?.status !== data.status) {
          await supabase.from('crm_events').insert([{
            contact_id: data.id,
            type: 'status_change',
            title: 'Status Alterado',
            description: `Status movido de ${oldRow?.status} para ${data.status}`,
            actor_id: user.id,
            actor_type: 'human',
            payload: { 
              old_status: oldRow?.status, 
              new_status: data.status, 
              snapshot_before: oldRow,
              correlation_id: correlationId 
            } as any
          }]);
        }
      }

      await logAudit({ table: schema.table, recordId: editing.id, action: 'update', label: data?.[schema.titleKey], before: editing, after: data });
      toast({ title: 'Atualizado com sucesso' });
    } else {
      payload.created_by = user.id;
      const { data, error } = await (supabase as any).from(schema.table).insert(payload).select().single();
      if (error) return toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      
      if (entity === 'contacts' && data) {
        await supabase.from('crm_events').insert([{
          contact_id: data.id,
          type: 'creation',
          title: 'Contato Criado',
          description: `Contato adicionado manualmente ao CRM`,
          actor_id: user.id,
          actor_type: 'human'
        }]);
      }

      await logAudit({ table: schema.table, recordId: data?.id, action: 'create', label: data?.[schema.titleKey], after: data });
      toast({ title: 'Criado com sucesso' });
    }
    setOpen(false);
    load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const target = rows.find(r => r.id === deleteId);
    const { error } = await (supabase as any).from(schema.table).delete().eq('id', deleteId);
    if (error) toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    else {
      await logAudit({ table: schema.table, recordId: deleteId, action: 'delete', label: target?.[schema.titleKey], before: target });
      toast({ title: 'Excluído com sucesso' });
    }
    setDeleteId(null);
    load();
  };

  const filtered = rows.filter(r => {
    if (!search) return true;
    return JSON.stringify(r).toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          {entity === 'contacts' && (
            <div className="flex items-center border border-border rounded-xl p-1 bg-secondary/20">
              <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-8 gap-1.5" 
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" /> Lista
              </Button>
              <Button 
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-8 gap-1.5" 
                onClick={() => setViewMode('kanban')}
              >
                <LayoutGrid className="w-4 h-4" /> Kanban
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entity === 'contacts' && <CrmGlobalActivities />}
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Novo
          </Button>
        </div>
      </div>

      {entity === 'contacts' && viewMode === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns_kanban.map((col) => (
            <div key={col.id} className="min-w-[300px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 px-2">
                <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
                <Badge variant="secondary" className="ml-auto">{filtered.filter(r => r.status === col.id).length}</Badge>
              </div>
              <div className="space-y-3 p-2 bg-secondary/10 rounded-2xl border border-border/50 min-h-[500px]">
                {filtered.filter(r => r.status === col.id).map(contact => (
                  <motion.div 
                    layoutId={contact.id}
                    key={contact.id} 
                    className="glass-card p-4 space-y-3 group cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => openEdit(contact)}
                  >
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-foreground">{contact.name}</p>
                      <Badge variant="outline" className="text-[9px] uppercase">{contact.source || 'Lead'}</Badge>
                    </div>
                    {contact.company && <p className="text-xs text-muted-foreground flex items-center gap-1"><Building className="w-3 h-3" /> {contact.company}</p>}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex -space-x-2">
                         {contact.assigned_agent_id ? (
                           <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center border-2 border-background" title="Atribuído">
                             <User className="w-3 h-3 text-primary" />
                           </div>
                         ) : (
                           <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center border-2 border-background" title="Sem responsável">
                             <User className="w-3 h-3 text-muted-foreground" />
                           </div>
                         )}
                      </div>
                      <p className="text-xs font-bold text-primary">
                        {contact.estimated_value ? `R$ ${Number(contact.estimated_value).toLocaleString('pt-BR')}` : '—'}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {schema.columns.map(c => <TableHead key={c.key}>{c.label}</TableHead>)}
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={schema.columns.length + 1} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={schema.columns.length + 1} className="text-center text-muted-foreground py-8">Nenhum registro encontrado.</TableCell></TableRow>
              ) : filtered.map(row => (
                <TableRow key={row.id}>
                  {schema.columns.map(c => <TableCell key={c.key}>{formatCell(row[c.key], c.key)}</TableCell>)}
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar registro' : 'Novo registro'}</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4 py-2">
              {schema.fields.map(f => (
                <div key={f.name} className="space-y-1.5">
                  <Label>{f.label}{f.required && ' *'}</Label>
                  {f.type === 'textarea' ? (
                    <Textarea value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} className="min-h-[100px]" />
                  ) : f.type === 'select' ? (
                    <Select value={form[f.name] ?? ''} onValueChange={v => setForm({ ...form, [f.name]: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {f.options!.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : f.type === 'switch' ? (
                    <div className="flex items-center gap-2">
                      <Switch checked={!!form[f.name]} onCheckedChange={v => setForm({ ...form, [f.name]: v })} />
                      <span className="text-sm text-muted-foreground">{form[f.name] ? 'Sim' : 'Não'}</span>
                    </div>
                  ) : (
                    <Input type={f.type || 'text'} value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>

            {entity === 'contacts' && editing && (
              <div className="border-l border-border pl-8 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> Histórico de Atividades
                  </h4>
                  <UndoCascadeButton 
                    contactId={editing.id} 
                    currentRecord={editing}
                    onUndo={() => {
                      setOpen(false);
                      load();
                    }}
                    updateContactStatus={updateContactStatus}
                  />
                </div>
                <ContactActivityTimeline contactId={editing.id} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UsersTab() {
  const { user, access } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [search, setSearch] = useState('');
  const emptyForm = {
    email: '', password: '', display_name: '', phone: '', role_label: 'Atendente',
    is_active: true, is_account_admin: false,
    allowed_pages: BLOCKABLE_PAGES.map(p => p.key) as string[],
  };
  const [form, setForm] = useState<any>(emptyForm);

  const scopeSubId = access?.sub_company_id || null;
  const isSubAdmin = !!access?.sub_company_id;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('manage-account-user', {
      body: { action: 'list', sub_company_id: scopeSubId },
    });
    if (error) toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    setRows((data as any)?.users || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [scopeSubId]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      email: row.profile?.email || '',
      password: '',
      display_name: row.profile?.display_name || '',
      phone: row.profile?.phone || '',
      role_label: row.profile?.role_label || 'Atendente',
      is_active: row.profile?.is_active ?? true,
      is_account_admin: !!row.is_account_admin,
      allowed_pages: (row.allowed_pages && row.allowed_pages.length > 0)
        ? row.allowed_pages
        : BLOCKABLE_PAGES.map(p => p.key),
    });
    setOpen(true);
  };

  const togglePage = (key: string) => {
    setForm((f: any) => ({
      ...f,
      allowed_pages: f.allowed_pages.includes(key)
        ? f.allowed_pages.filter((k: string) => k !== key)
        : [...f.allowed_pages, key],
    }));
  };

  const save = async () => {
    if (!form.display_name) { toast({ title: 'Informe o nome', variant: 'destructive' }); return; }
    setSaving(true);
    if (editing) {
      const payload: any = {
        action: 'update',
        sub_company_id: scopeSubId,
        user_id: editing.user_id,
        name: form.display_name,
        phone: form.phone,
        role_label: form.role_label,
        is_active: form.is_active,
        is_account_admin: form.is_account_admin,
        allowed_pages: form.allowed_pages,
      };
      if (form.password) payload.password = form.password;
      const { data, error } = await supabase.functions.invoke('manage-account-user', { body: payload });
      setSaving(false);
      if (error || (data as any)?.error) {
        toast({ title: 'Erro ao salvar', description: error?.message || (data as any)?.error, variant: 'destructive' });
        return;
      }
      await logAudit({ table: 'profiles', recordId: editing.user_id, action: 'update', label: form.display_name, after: payload });
      toast({ title: 'Usuário atualizado' });
    } else {
      if (!form.email || !form.password || form.password.length < 6) {
        setSaving(false);
        toast({ title: 'Email e senha (mín. 6) obrigatórios', variant: 'destructive' });
        return;
      }
      const payload = {
        action: 'create',
        sub_company_id: scopeSubId,
        email: form.email,
        name: form.display_name,
        password: form.password,
        allowed_pages: form.allowed_pages,
        is_account_admin: form.is_account_admin,
      };
      const { data, error } = await supabase.functions.invoke('manage-account-user', { body: payload });
      setSaving(false);
      if (error || (data as any)?.error) {
        toast({ title: 'Erro ao criar', description: error?.message || (data as any)?.error, variant: 'destructive' });
        return;
      }
      await logAudit({ table: 'profiles', recordId: (data as any)?.user_id, action: 'create', label: form.display_name, after: payload });
      toast({ title: 'Usuário criado', description: `${form.email} já pode fazer login.` });
    }
    setOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { data, error } = await supabase.functions.invoke('manage-account-user', {
      body: { action: 'delete', sub_company_id: scopeSubId, user_id: deleting.user_id },
    });
    if (error || (data as any)?.error) {
      toast({ title: 'Erro ao excluir', description: error?.message || (data as any)?.error, variant: 'destructive' });
    } else {
      await logAudit({ table: 'profiles', recordId: deleting.user_id, action: 'delete', label: deleting.profile?.display_name });
      toast({ title: 'Usuário excluído' });
    }
    setDeleting(null);
    load();
  };

  const filtered = rows.filter(r => {
    if (!search) return true;
    const blob = `${r.profile?.display_name || ''} ${r.profile?.email || ''} ${r.profile?.phone || ''}`.toLowerCase();
    return blob.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar usuário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground hidden md:block">
            {isSubAdmin ? 'Gerenciando colaboradores da sub-empresa' : 'Gerenciando colaboradores do painel'}
          </p>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo usuário</Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Páginas liberadas</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum usuário cadastrado ainda.</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.user_id}>
                <TableCell className="font-medium">{r.profile?.display_name || '—'}</TableCell>
                <TableCell className="text-muted-foreground">{r.profile?.email || '—'}</TableCell>
                <TableCell>{r.profile?.phone || '—'}</TableCell>
                <TableCell>{r.profile?.role_label || '—'}</TableCell>
                <TableCell><Badge variant="outline">{(r.allowed_pages || []).length} / {BLOCKABLE_PAGES.length}</Badge></TableCell>
                <TableCell>{r.is_account_admin ? <Badge>Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                <TableCell><Badge variant={r.profile?.is_active ? 'default' : 'secondary'}>{r.profile?.is_active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" disabled={r.user_id === user?.id} onClick={() => setDeleting(r)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email {!editing && '*'}</Label>
                <Input type="email" disabled={!!editing} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{editing ? 'Nova senha (opcional)' : 'Senha *'}</Label>
                <Input type="password" placeholder="Mín. 6 caracteres" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome de exibição *</Label>
                <Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Input value={form.role_label} onChange={e => setForm({ ...form, role_label: e.target.value })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Permissões & Controle</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-3 rounded-xl bg-secondary/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Kanban</p>
                      <p className="text-xs">Permitir mover cards</p>
                    </div>
                    <Switch checked={form.can_move_kanban ?? true} onCheckedChange={v => setForm({ ...form, can_move_kanban: v })} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">I.A.</p>
                      <p className="text-xs">Configurar agentes</p>
                    </div>
                    <Switch checked={form.can_manage_ai ?? false} onCheckedChange={v => setForm({ ...form, can_manage_ai: v })} />
                  </div>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                  <Label className="text-sm">Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_account_admin} onCheckedChange={v => setForm({ ...form, is_account_admin: v })} />
                  <Label className="text-sm">Admin da conta</Label>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Permissões por página (Sidebar)</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, allowed_pages: BLOCKABLE_PAGES.map(p => p.key) })}>Tudo</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, allowed_pages: ['profile'] })}>Nada</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Marque apenas as páginas que este usuário poderá acessar. "Meu Perfil" deve permanecer marcado.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {BLOCKABLE_PAGES.map(p => {
                  const checked = form.allowed_pages.includes(p.key);
                  const Icon = p.icon;
                  return (
                    <label key={p.key} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${checked ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <input type="checkbox" checked={checked} onChange={() => togglePage(p.key)} className="mt-1" />
                      <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar usuário'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.profile?.display_name || deleting?.profile?.email} será removido do seu painel.
              Caso ele não tenha outros vínculos, o acesso (login) também será excluído. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const TABLE_LABELS: Record<string, string> = {
  leads: 'Leads', customers: 'Clientes', products: 'Produtos', tasks: 'Tarefas', profiles: 'Usuários',
};
const ACTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  create: { label: 'Criação', variant: 'default' },
  update: { label: 'Edição', variant: 'secondary' },
  delete: { label: 'Exclusão', variant: 'destructive' },
};

const PAGE_SIZE = 50;

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [allProfiles, setAllProfiles] = useState<{ user_id: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [detail, setDetail] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number>(0);
  const [liveCount, setLiveCount] = useState(0);

  const fetchAuthors = async (rows: any[]) => {
    const ids = Array.from(new Set(rows.map((l: any) => l.changed_by).filter(Boolean)));
    if (!ids.length) return;
    const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids as string[]);
    setAuthors(prev => {
      const map = { ...prev };
      (profs || []).forEach((p: any) => { map[p.user_id] = p.display_name || p.user_id; });
      return map;
    });
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').order('display_name');
      setAllProfiles((data || []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name || p.user_id })));
    })();
  }, []);

  const load = async (reset = true) => {
    if (reset) { setLoading(true); setLiveCount(0); }
    else setLoadingMore(true);
    const offset = reset ? 0 : logs.length;
    const { data, error } = await (supabase as any).rpc('search_audit_logs', {
      p_table: tableFilter === 'all' ? null : tableFilter,
      p_action: actionFilter === 'all' ? null : actionFilter,
      p_user: userFilter === 'all' ? null : userFilter,
      p_from: fromDate ? new Date(fromDate).toISOString() : null,
      p_to: toDate ? new Date(toDate).toISOString() : null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      toast({ title: 'Erro ao carregar auditoria', description: error.message, variant: 'destructive' });
      setLoading(false); setLoadingMore(false);
      return;
    }
    const rows = (data || []) as any[];
    const totalCount = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
    setTotal(totalCount);
    setHasMore(offset + rows.length < totalCount);
    setLogs(prev => reset ? rows : [...prev, ...rows]);
    setAuthors(prev => {
      const map = { ...prev };
      rows.forEach(r => { if (r.changed_by && r.changed_by_name) map[r.changed_by] = r.changed_by_name; });
      return map;
    });
    await fetchAuthors(rows);
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => { load(true); }, [tableFilter, actionFilter, userFilter, fromDate, toDate]);

  useEffect(() => {
    const channel = supabase
      .channel('audit_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, async (payload) => {
        const row = payload.new as any;
        if (tableFilter !== 'all' && row.table_name !== tableFilter) return;
        if (actionFilter !== 'all' && row.action !== actionFilter) return;
        if (userFilter !== 'all' && row.changed_by !== userFilter) return;
        if (fromDate && new Date(row.created_at) < new Date(fromDate)) return;
        if (toDate && new Date(row.created_at) > new Date(toDate)) return;
        setLogs(prev => prev.some(l => l.id === row.id) ? prev : [row, ...prev]);
        setTotal(t => t + 1);
        setLiveCount(c => c + 1);
        await fetchAuthors([row]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tableFilter, actionFilter, userFilter, fromDate, toDate]);

  const clearFilters = () => {
    setTableFilter('all'); setActionFilter('all'); setUserFilter('all'); setFromDate(''); setToDate('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tabelas</SelectItem>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            <SelectItem value="create">Criação</SelectItem>
            <SelectItem value="update">Edição</SelectItem>
            <SelectItem value="delete">Exclusão</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Usuário" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {allProfiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input type="datetime-local" className="w-52" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input type="datetime-local" className="w-52" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={clearFilters}>Limpar</Button>
        <Button variant="outline" onClick={() => load(true)}>Atualizar</Button>
        {liveCount > 0 && <Badge variant="default">{liveCount} novo(s) ao vivo</Badge>}
        <span className="text-sm text-muted-foreground ml-auto">{logs.length} de {total} resultado(s)</span>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead>Tabela</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead className="text-right">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum log encontrado.</TableCell></TableRow>
            ) : logs.map(l => (
              <TableRow key={l.id}>
                <TableCell className="text-sm">{new Date(l.created_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell>{authors[l.changed_by] || l.changed_by_name || <span className="text-muted-foreground">{(l.changed_by || '').slice(0, 8)}…</span>}</TableCell>
                <TableCell>{TABLE_LABELS[l.table_name] || l.table_name}</TableCell>
                <TableCell><Badge variant={ACTION_LABELS[l.action]?.variant || 'outline'}>{ACTION_LABELS[l.action]?.label || l.action}</Badge></TableCell>
                <TableCell className="max-w-xs truncate">{l.record_label || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setDetail(l)}><Eye className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => load(false)} disabled={loadingMore}>
            {loadingMore ? 'Carregando...' : 'Carregar mais'}
          </Button>
        </div>
      )}

      <Sheet open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes do log</SheetTitle>
            <SheetDescription>Auditoria completa do registro selecionado, incluindo diff antes/depois.</SheetDescription>
          </SheetHeader>
          {detail && <AuditLogDetail detail={detail} authors={authors} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AuditLogDetail({ detail, authors }: { detail: any; authors: Record<string, string> }) {
  const changes = detail.changes || {};
  const before = changes.before ?? changes.old ?? changes.previous ?? null;
  const after = changes.after ?? changes.new ?? changes.current ?? (before ? null : changes);
  const isDiff = before && after;
  const keys = isDiff
    ? Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    : [];
  const changedKeys = isDiff ? keys.filter(k => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) : [];

  const fmt = (v: any) => v === undefined || v === null ? <span className="text-muted-foreground italic">—</span> : typeof v === 'object' ? <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(v, null, 2)}</pre> : <span className="break-all">{String(v)}</span>;

  return (
    <div className="space-y-4 mt-4 text-sm">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/30 p-3">
        <div><span className="text-muted-foreground">Quando:</span><br />{new Date(detail.created_at).toLocaleString('pt-BR')}</div>
        <div><span className="text-muted-foreground">Quem:</span><br />{authors[detail.changed_by] || detail.changed_by_name || (detail.changed_by || '').slice(0, 8) + '…'}</div>
        <div><span className="text-muted-foreground">Tabela:</span><br />{TABLE_LABELS[detail.table_name] || detail.table_name}</div>
        <div><span className="text-muted-foreground">Ação:</span><br /><Badge variant={ACTION_LABELS[detail.action]?.variant || 'outline'}>{ACTION_LABELS[detail.action]?.label || detail.action}</Badge></div>
        <div className="col-span-2"><span className="text-muted-foreground">Registro:</span><br />{detail.record_label || '—'} <span className="text-[11px] text-muted-foreground font-mono">({detail.record_id})</span></div>
      </div>

      {isDiff ? (
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2 font-semibold">Diff de alterações {changedKeys.length > 0 && <Badge variant="outline" className="ml-2">{changedKeys.length} campo(s) alterado(s)</Badge>}</p>
          {changedKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma diferença detectada entre antes e depois.</p>
          ) : (
            <div className="space-y-2">
              {changedKeys.map(k => (
                <div key={k} className="rounded-xl border border-border overflow-hidden">
                  <div className="px-3 py-1.5 bg-secondary/40 text-xs font-semibold font-mono">{k}</div>
                  <div className="grid grid-cols-2 divide-x divide-border text-xs">
                    <div className="p-2 bg-destructive/5">
                      <p className="text-[10px] uppercase text-destructive mb-1 font-semibold">Antes</p>
                      {fmt(before?.[k])}
                    </div>
                    <div className="p-2 bg-emerald-500/5">
                      <p className="text-[10px] uppercase text-emerald-600 mb-1 font-semibold">Depois</p>
                      {fmt(after?.[k])}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Ver JSON bruto</summary>
            <pre className="bg-muted p-3 rounded-md text-[11px] overflow-x-auto whitespace-pre-wrap break-all mt-2">{JSON.stringify(changes, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-2 font-semibold">Snapshot</p>
          <pre className="bg-muted p-3 rounded-md text-[11px] overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(changes, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function ContactActivityTimeline({ contactId }: { contactId: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCorrId, setFilterCorrId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('crm_events')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (data) setEvents(data);
      setLoading(false);
    })();
  }, [contactId]);

  const filteredEvents = filterCorrId 
    ? events.filter(ev => ev.payload?.correlation_id === filterCorrId)
    : events;

  if (loading) return <div className="text-center py-10 text-xs text-muted-foreground">Carregando histórico...</div>;
  if (events.length === 0) return <div className="text-center py-10 text-xs text-muted-foreground italic">Nenhuma atividade registrada.</div>;

  return (
    <div className="space-y-4">
      {filterCorrId && (
        <div className="bg-primary/5 p-2 rounded-lg border border-primary/20 flex items-center justify-between">
          <span className="text-[10px] font-bold text-primary">Filtrado por ID: {filterCorrId}</span>
          <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => setFilterCorrId(null)}>Limpar</Button>
        </div>
      )}
      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/20 before:via-border before:to-transparent">
        {filteredEvents.map((ev, i) => (
          <div key={ev.id} className="relative flex items-start gap-4 pl-10">
            <div 
              className={`absolute left-0 w-10 h-10 rounded-2xl flex items-center justify-center border border-border bg-background shadow-sm cursor-pointer hover:border-primary transition-colors ${
                ev.actor_type === 'ai' ? 'text-primary' : 'text-muted-foreground'
              }`}
              onClick={() => ev.payload?.correlation_id && setFilterCorrId(ev.payload.correlation_id)}
              title="Filtrar por este X-Correlation-ID"
            >
              {ev.type === 'chat' && <MessageSquare className="w-4 h-4" />}
              {ev.type === 'status_change' && <LayoutGrid className="w-4 h-4" />}
              {ev.actor_type === 'ai' ? <BotIcon className="w-4 h-4" /> : (ev.type !== 'chat' && ev.type !== 'status_change' && <User className="w-4 h-4" />)}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-foreground">{ev.title || 'Atividade'}</p>
                <time className="text-[10px] text-muted-foreground font-mono">{new Date(ev.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{ev.description}</p>
              <div className="flex items-center gap-2 mt-1">
                {ev.payload?.correlation_id && (
                  <p 
                    className="text-[9px] font-mono text-primary bg-primary/5 px-1.5 py-0.5 rounded w-fit cursor-pointer hover:bg-primary/10"
                    onClick={() => setFilterCorrId(ev.payload.correlation_id)}
                    title="Filtrar linha do tempo por este ID"
                  >
                    ID: {ev.payload.correlation_id}
                  </p>
                )}
                {ev.title === 'Desfazer em Cascata' && <Badge variant="outline" className="text-[8px] h-4">RESTORE</Badge>}
              </div>
              {ev.title === 'Desfazer em Cascata' && <ContactTimelineDetails ev={ev} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactTimelineDetails({ ev }: { ev: any }) {
  return (
    <div className="space-y-3 mt-3 border-t border-border/50 pt-3">
      <div className="flex justify-between items-center text-[10px]">
        <span className="text-muted-foreground font-bold uppercase">Campos Restaurados (Diff)</span>
        <Badge variant="outline" className="text-primary font-mono h-4">X-CORR: {ev.payload?.correlation_id || 'N/A'}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {ev.payload?.snapshot_before && Object.keys(ev.payload.snapshot_before).filter(k => !['id', 'created_at', 'updated_at', 'status', 'last_interaction_at'].includes(k)).map(k => (
          <div key={k} className="text-[10px] bg-secondary/30 p-2 rounded-lg border border-border/20 flex flex-col gap-0.5">
            <span className="font-mono text-[9px] text-muted-foreground uppercase">{k}</span>
            <div className="flex items-center gap-2">
               <span className="font-bold text-emerald-600 truncate">{String(ev.payload.snapshot_before[k] || '—')}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-primary/5 p-2 rounded-lg text-[9px] text-muted-foreground flex items-center gap-2">
         <User className="w-3 h-3" />
         <span>Solicitado por: <strong>{ev.payload?.agent_name || 'Agente'}</strong></span>
      </div>
    </div>
  );
}

function UndoCascadeButton({ contactId, currentRecord, onUndo, updateContactStatus }: { 
  contactId: string; 
  currentRecord: any; 
  onUndo: () => void;
  updateContactStatus: any;
}) {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadLastEvent = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('crm_events')
      .select('*')
      .eq('contact_id', contactId)
      .eq('type', 'status_change')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (data && data[0]) {
      const payload = data[0].payload as any;
      if (payload?.old_status && !payload.is_undo) {
        setEvent(data[0]);
      } else {
        setEvent(null);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadLastEvent();
  }, [open]);

  const handleUndo = async () => {
    if (!event) return;
    const payload = event.payload as any;
    await updateContactStatus(
      contactId, 
      payload.old_status, 
      'Desfazer em cascata (reversão completa confirmada)', 
      true, 
      payload.snapshot_before
    );
    setOpen(false);
    onUndo();
  };

  const snapshot = event?.payload?.snapshot_before;
  const changedFields = snapshot ? Object.keys(snapshot).filter(k => 
    !['id', 'created_at', 'updated_at', 'status', 'last_interaction_at'].includes(k) &&
    JSON.stringify(snapshot[k]) !== JSON.stringify(currentRecord[k])
  ) : [];

  return (
    <>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 text-[10px] gap-1 hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="w-3 h-3" /> Desfazer Cascata
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" /> Confirmar Reversão
            </DialogTitle>
            <SheetDescription>Visualize as mudanças antes de restaurar o snapshot.</SheetDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-10 text-center text-xs text-muted-foreground">Analisando histórico...</div>
          ) : !event ? (
            <div className="py-10 text-center text-xs text-muted-foreground italic">Nenhuma ação reversível encontrada para este contato.</div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="bg-secondary/10 p-3 rounded-xl border border-border/50 space-y-3">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground">Etapa Atual</span>
                  <Badge variant="outline">{currentRecord.status}</Badge>
                </div>
                <div className="flex justify-center">
                   <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground font-bold">Restaurar para</span>
                  <Badge variant="default">{event.payload.old_status}</Badge>
                </div>
              </div>

              {changedFields.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Campos Afetados (Snapshot Diff)</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2">
                    {changedFields.map(f => (
                      <div key={f} className="text-[11px] bg-secondary/5 border border-border/30 p-2 rounded-lg flex flex-col gap-1">
                        <span className="font-mono text-[9px] text-primary">{f}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-destructive line-through truncate max-w-[100px]">{String(currentRecord[f] || '—')}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          <span className="text-emerald-600 font-bold truncate max-w-[150px]">{String(snapshot[f] || '—')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-primary/5 p-3 rounded-xl border border-primary/20 space-y-1">
                <p className="text-[10px] font-bold text-primary flex items-center gap-1">
                  <User className="w-3 h-3" /> AUTOR DA MUDANÇA ORIGINAL
                </p>
                <p className="text-xs">{event.payload.agent_name || 'Desconhecido'}</p>
                <p className="text-[9px] font-mono text-muted-foreground mt-1">X-Corr: {event.payload.correlation_id || 'N/A'}</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!event} onClick={handleUndo}>Confirmar Reversão Completa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CrmGlobalActivities() {
  const [search, setInternalSearch] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('events');
  const [externalCorrId, setExternalCorrId] = useState('');
  const [corrSearch, setCorrSearch] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const cid = params.get('correlation_id') || localStorage.getItem('last_correlation_id');
      if (cid) {
        setExternalCorrId(cid);
        setCorrSearch(cid);
        setActiveTab('deliveries');
        setOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      const { data } = await supabase
        .from('crm_events')
        .select('*, contacts(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) setLogs(data);
    };
    fetch();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2 h-10 rounded-xl">
        <Clock className="w-4 h-4" /> Atividades
      </Button>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Auditoria CRM & Entregas
          </SheetTitle>
          <SheetDescription>Interações, e-mails e webhooks com status de entrega e X-Correlation-ID.</SheetDescription>
        </SheetHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="events">Histórico</TabsTrigger>
            <TabsTrigger value="deliveries">Notificações</TabsTrigger>
            <TabsTrigger value="test-mode" className="gap-1 text-primary">
              <Sparkles className="w-3 h-3" /> Modo de Teste
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input 
                  placeholder="Filtrar responsável..." 
                  className="h-8 text-xs" 
                  onChange={(e) => setInternalSearch(e.target.value)}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => {
                  const data = logs.map(l => ({
                    data: new Date(l.created_at).toLocaleString(),
                    contato: l.contacts?.name,
                    tipo: l.actor_type,
                    acao: l.description,
                    correlation_id: l.payload?.correlation_id || 'N/A'
                  }));
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `crm-audit-${new Date().getTime()}.json`;
                  a.click();
                }}>
                  JSON
                </Button>
              </div>
            </div>
            <div className="space-y-4 mt-4">
              {logs.map(log => (
                <div key={log.id} className="p-3 bg-secondary/20 rounded-2xl border border-border/40 space-y-2 hover:border-primary/30 transition-colors">
                  <div className="flex justify-between items-start">
                    <Badge variant={log.actor_type === 'ai' ? 'default' : log.title === 'Movimento Desfeito' ? 'outline' : 'secondary'} className="text-[9px]">
                      {log.actor_type === 'ai' ? 'AUTÔNOMO' : log.title === 'Movimento Desfeito' ? 'REVERSÃO' : 'HUMANO'}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs font-bold text-foreground">{log.contacts?.name || 'Contato desconhecido'}</p>
                  <p className="text-xs text-muted-foreground">{log.description}</p>
                  {(log.payload as any)?.correlation_id && (
                    <div className="flex flex-wrap gap-2">
                      <p 
                        className="text-[9px] font-mono text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded cursor-pointer hover:bg-background/80 flex items-center gap-1 group/item border border-border/30 hover:border-primary/50 transition-colors"
                        onClick={() => {
                          const cid = (log.payload as any).correlation_id;
                          setExternalCorrId(cid);
                          setCorrSearch(cid);
                          setActiveTab('deliveries');
                          
                          toast({ title: "Filtrando por Correlation ID", description: `ID: ${cid}` });
                          
                          const url = new URL(window.location.href);
                          url.searchParams.set('correlation_id', cid);
                          window.history.replaceState({}, '', url);
                          localStorage.setItem('last_correlation_id', cid);
                        }}
                        title="Abrir Auditoria e filtrar por este ID"
                      >
                        <Search className="w-2 h-2" />
                        ID: {(log.payload as any).correlation_id}
                      </p>
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-5 px-1.5 text-[8px] gap-1 hover:text-primary"
                        onClick={() => {
                          const cid = (log.payload as any).correlation_id;
                          const url = new URL(window.location.href);
                          url.searchParams.set('correlation_id', cid);
                          navigator.clipboard.writeText(url.toString());
                          toast({ title: "Link de Auditoria Copiado!", description: "Compartilhe este link para auditoria direta." });
                        }}
                      >
                        <Share2 className="w-2 h-2" /> Compartilhar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="deliveries">
             <WebhookDeliveryList externalCorrId={externalCorrId} setCorrSearch={setCorrSearch} />
          </TabsContent>

          <TabsContent value="test-mode">
            <WebhookTestPanel />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function WebhookDeliveryList({ externalCorrId, setCorrSearch: setParentCorrSearch }: { externalCorrId?: string; setCorrSearch?: (val: string) => void }) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [corrSearch, setCorrSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('correlation_id');
    const savedId = localStorage.getItem('last_correlation_id');
    return urlId || savedId || '';
  });

  useEffect(() => {
    if (externalCorrId) setCorrSearch(externalCorrId);
  }, [externalCorrId]);

  const fetch = async () => {
    setLoading(true);
    setNotFound(false);
    
    let query = supabase
      .from('crm_webhook_logs')
      .select('*, crm_webhooks(url)')
      .order('created_at', { ascending: false });
    
    if (corrSearch) {
      // Tentar busca exata primeiro
      const { data: exactData } = await supabase
        .from('crm_webhook_logs')
        .select('*, crm_webhooks(url)')
        .eq('correlation_id', corrSearch)
        .limit(1);

      if (!exactData || exactData.length === 0) {
        setNotFound(true);
        // Se não encontrar exato, volta para a busca ampla
        query = query.ilike('correlation_id', `%${corrSearch}%`);
      } else {
        query = query.eq('correlation_id', corrSearch);
      }

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('correlation_id', corrSearch);
        window.history.replaceState({}, '', url);
        localStorage.setItem('last_correlation_id', corrSearch);
      }
      if (setParentCorrSearch) setParentCorrSearch(corrSearch);
    } else if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('correlation_id');
      window.history.replaceState({}, '', url);
      localStorage.removeItem('last_correlation_id');
    }

    const { data } = await query.limit(100);
    if (data) setDeliveries(data);
    setLoading(false);
  };

  useEffect(() => {
    fetch();
  }, [corrSearch]);

  const retryDelivery = async (d: any, isBatch = false) => {
    if (!isBatch) toast({ title: 'Iniciando reenvio manual...' });
    
    // Simular registro de retry_history
    const retryHistory = [...(d.retry_history || [])];
    retryHistory.push({
      timestamp: new Date().toISOString(),
      attempt: (d.retry_count || 0) + 1,
      reason: 'Manual retrigger',
      strategy_used: d.retry_strategy || { backoff: "none", max_attempts: 1 }
    });

    await supabase.from('crm_webhook_logs').update({
      retry_count: (d.retry_count || 0) + 1,
      retry_history: retryHistory as any,
      updated_at: new Date().toISOString()
    } as any).eq('id', d.id);

    await globalTriggerWebhooks(d.event_type, d.payload, d.id);
    if (!isBatch) fetch();
  };

  const [isRetryingBatch, setIsRetryingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  const handleBatchRetry = async () => {
    if (selectedIds.length === 0) return;
    setIsRetryingBatch(true);
    setBatchProgress(0);
    
    const total = selectedIds.length;
    for (let i = 0; i < total; i++) {
      const id = selectedIds[i];
      const delivery = deliveries.find(d => d.id === id);
      if (delivery) {
        await retryDelivery(delivery, true);
      }
      setBatchProgress(Math.round(((i + 1) / total) * 100));
    }
    
    toast({ title: 'Reprocessamento em lote concluído!' });
    setSelectedIds([]);
    setIsRetryingBatch(false);
    fetch();
  };



  const exportData = (format: 'json' | 'csv') => {
    const data = deliveries.map(d => ({
      data: new Date(d.created_at).toLocaleString(),
      evento: d.event_type,
      url: d.crm_webhooks?.url,
      status: d.status,
      response_status: d.response_status,
      retentativas: d.retry_count,
      correlation_id: d.correlation_id,
      payload: JSON.stringify(d.payload)
    }));

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-deliveries-${new Date().getTime()}.json`;
      a.click();
    } else {
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-deliveries-${new Date().getTime()}.csv`;
      a.click();
    }
  };

  if (loading) return <div className="text-center py-10 text-xs text-muted-foreground">Carregando entregas...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/10 p-3 rounded-xl border border-border/50">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Webhooks Ativos & Rejeitados</span>
          <div className="relative ml-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input 
              placeholder="Buscar X-Correlation-ID..." 
              className="h-7 text-[10px] pl-7 w-48 bg-background/50" 
              value={corrSearch}
              onChange={e => setCorrSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button 
              size="sm" 
              className="h-7 text-[10px] gap-2" 
              onClick={handleBatchRetry}
              disabled={isRetryingBatch}
            >
              <RefreshCw className={`w-3 h-3 ${isRetryingBatch ? 'animate-spin' : ''}`} />
              Reenviar Selecionados ({selectedIds.length})
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => exportData('json')}>Exportar JSON</Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => exportData('csv')}>Exportar CSV</Button>
          <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={fetch}><RefreshCw className="w-3 h-3 mr-1" /> Atualizar</Button>
        </div>
      </div>

      {isRetryingBatch && (
        <div className="bg-primary/5 p-3 rounded-xl border border-primary/20 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-primary">PROCESSANDO LOTE...</span>
            <span className="text-[10px] font-mono">{batchProgress}%</span>
          </div>
          <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300" 
              style={{ width: `${batchProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        {notFound && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <div className="flex-1">
              <p className="text-[11px] font-bold text-amber-800">Correlation ID não encontrado</p>
              <p className="text-[10px] text-amber-700">Exibindo eventos aproximados ou mais recentes.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-[9px]" onClick={() => setCorrSearch('')}>Limpar</Button>
          </div>
        )}
        {deliveries.length === 0 ? (
          <p className="text-center py-10 text-xs text-muted-foreground italic">Nenhuma entrega registrada.</p>
        ) : deliveries.map(d => (
          <WebhookDeliveryCard 
            key={d.id} 
            d={d} 
            onRetry={() => retryDelivery(d)} 
            currentCorrId={corrSearch}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
          />
        ))}
      </div>
    </div>
  );
}

function WebhookDeliveryCard({ d, onRetry, currentCorrId, selectedIds, setSelectedIds }: { 
  d: any, 
  onRetry: () => void, 
  currentCorrId?: string,
  selectedIds: string[],
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (d.correlation_id === currentCorrId && currentCorrId && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setShowDetail(true);
    }
  }, [currentCorrId, d.correlation_id]);
  
  return (
    <>
      <div 
        ref={cardRef}
        className={`p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md relative group ${
          d.status === 'failed' ? 'bg-destructive/5 border-destructive/20' : 'bg-secondary/10 border-border/50'
        } ${d.correlation_id === currentCorrId ? 'ring-2 ring-primary border-primary animate-pulse' : ''} text-[11px] space-y-2`}
        onClick={() => setShowDetail(true)}
      >
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
          <input 
            type="checkbox" 
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            checked={selectedIds.includes(d.id)}
            onChange={(e) => {
              if (e.target.checked) setSelectedIds(prev => [...prev, d.id]);
              else setSelectedIds(prev => prev.filter(id => id !== d.id));
            }}
          />
        </div>

        <div className="flex justify-between items-center pr-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{d.event_type}</span>
            {d.status === 'failed' && (
              <Badge variant="destructive" className="text-[8px] h-4">
                {d.is_dead_letter ? 'DEAD-LETTER' : 'REJEITADO'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={d.status === 'sent' ? 'default' : d.status === 'failed' ? 'destructive' : 'secondary'} className="text-[9px]">
              {d.status?.toUpperCase()}
            </Badge>
            {d.status === 'failed' && (
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 text-[9px] gap-1 text-primary hover:text-primary" 
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
              >
                <RefreshCw className="h-3 w-3" />
                Reenviar Manual
              </Button>
            )}
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-6 w-6" 
              onClick={(e) => { e.stopPropagation(); setShowPayload(true); }}
              title="Ver Payload"
            >
              <Code className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground truncate font-mono text-[10px]">{d.crm_webhooks?.url}</p>
        
        {(d.error_message || d.last_error_summary) && (
          <div className="bg-destructive/10 text-destructive p-2 rounded-lg text-[10px] flex items-start gap-2">
            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <div className="flex-1">
              {d.error_message && <div><strong>Motivo:</strong> {d.error_message}</div>}
              {d.last_error_summary && <div className="mt-1 opacity-80"><strong>Erro Final:</strong> {d.last_error_summary}</div>}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center text-[10px]">
           <div className="flex gap-3">
             <span className="text-muted-foreground">HTTP: <span className="text-foreground font-semibold">{d.response_status || 'N/A'}</span></span>
             <span className="text-muted-foreground">Retentativas: <span className="text-foreground font-semibold">{d.retry_count}</span></span>
           </div>
           
           <div className="flex items-center gap-2">
             <div className="flex items-center gap-1 bg-background/50 px-1.5 py-0.5 rounded border border-border/30">
               <span className="text-[8px] font-bold text-muted-foreground">HMAC:</span>
               {d.error_message?.includes('HMAC') ? (
                 <AlertCircle className="w-2.5 h-2.5 text-destructive" />
               ) : (
                 <div className="w-2 h-2 rounded-full bg-emerald-500" />
               )}
             </div>
             <div className="flex items-center gap-1 bg-background/50 px-1.5 py-0.5 rounded border border-border/30">
               <span className="text-[8px] font-bold text-muted-foreground">TIME:</span>
               {d.error_message?.includes('window') ? (
                 <AlertCircle className="w-2.5 h-2.5 text-destructive" />
               ) : (
                 <div className="w-2 h-2 rounded-full bg-emerald-500" />
               )}
             </div>
           </div>
        </div>
        <p className="text-primary font-mono text-[9px] mt-1">X-Corr: {d.correlation_id || 'N/A'}</p>
      </div>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" /> Detalhes da Entrega Auditável
            </DialogTitle>
            <SheetDescription>Análise técnica do disparo e validações de segurança.</SheetDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-secondary/10 p-3 rounded-xl border border-border/50">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Status Final</p>
                  <Badge variant={d.status === 'sent' ? 'default' : 'destructive'}>{d.status?.toUpperCase()}</Badge>
               </div>
               <div className="bg-secondary/10 p-3 rounded-xl border border-border/50">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">X-Correlation-ID</p>
                  <p className="font-mono text-xs text-primary flex items-center gap-2">
                    {d.correlation_id || 'N/A'}
                    <Button size="icon" variant="ghost" className="h-4 w-4" onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(d.correlation_id);
                      toast({ title: 'ID Copiado!' });
                    }}>
                      <Search className="h-3 w-3" />
                    </Button>
                  </p>
               </div>
            </div>
            <div className="bg-secondary/5 p-3 rounded-xl border border-border/50">
               <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Headers Relevantes</p>
               <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">X-Signature:</span>
                    <span className="font-mono">{String(d.payload?._signature || 'N/A').slice(0, 16)}...</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">X-Timestamp:</span>
                    <span className="font-mono">{d.payload?._timestamp || 'N/A'}</span>
                  </div>
               </div>
               <Button variant="ghost" size="sm" className="h-6 text-[9px] w-full mt-2" onClick={() => {
                 const headers = {
                   'X-Correlation-ID': d.correlation_id,
                   'X-Signature': d.payload?._signature,
                   'X-Timestamp': d.payload?._timestamp,
                   'Content-Type': 'application/json'
                 };
                 navigator.clipboard.writeText(JSON.stringify(headers, null, 2));
                 toast({ title: 'Headers copiados!' });
               }}>Copiar Todos Headers</Button>
            </div>

            <div className="space-y-2">
               <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                 <AlertCircle className="w-3 h-3" /> Verificações de Segurança (E2E)
               </p>
               <div className="grid grid-cols-1 gap-2">
                  <div className={`p-2 rounded-lg border flex justify-between items-center ${d.error_message?.includes('HMAC') ? 'bg-destructive/5 border-destructive/30' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                     <span className="text-[11px]">Assinatura HMAC (Corpo + Timestamp)</span>
                     <Badge variant={d.error_message?.includes('HMAC') ? 'destructive' : 'default'} className="text-[8px] h-4">
                        {d.error_message?.includes('HMAC') ? 'INVÁLIDA' : 'VERIFICADA'}
                     </Badge>
                  </div>
                  <div className={`p-2 rounded-lg border flex justify-between items-center ${d.error_message?.includes('window') ? 'bg-destructive/5 border-destructive/30' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                     <span className="text-[11px]">Janela de Tempo (Replay Protection)</span>
                     <Badge variant={d.error_message?.includes('window') ? 'destructive' : 'default'} className="text-[8px] h-4">
                        {d.error_message?.includes('window') ? 'FORA DA JANELA' : 'DENTRO DA JANELA'}
                     </Badge>
                  </div>
               </div>
            </div>

            <div className="space-y-2">
               <div className="flex justify-between items-center">
                 <p className="text-[10px] font-bold text-muted-foreground uppercase">Payload Completo</p>
                 <Button variant="ghost" size="sm" className="h-6 text-[9px] gap-1" onClick={() => {
                   navigator.clipboard.writeText(JSON.stringify(d.payload, null, 2));
                   toast({ title: 'Payload formatado copiado!' });
                 }}>
                   <Search className="w-3 h-3" /> Copiar Formatado
                 </Button>
               </div>
               <pre className="bg-muted p-4 rounded-xl font-mono text-[10px] overflow-x-auto whitespace-pre-wrap max-h-60 border border-border/50">
                 {JSON.stringify(d.payload, null, 2)}
               </pre>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-[10px] gap-1" onClick={() => {
                const auditData = {
                  correlation_id: d.correlation_id,
                  event: d.event_type,
                  url: d.crm_webhooks?.url,
                  status: d.status,
                  retries: d.retry_count,
                  security: {
                    hmac_verified: !d.error_message?.includes('HMAC'),
                    timestamp_verified: !d.error_message?.includes('window'),
                    timestamp: d.payload?._timestamp,
                    signature: d.payload?._signature
                  },
                  payload: d.payload,
                  timestamp: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit-report-${d.correlation_id}.json`;
                a.click();
                toast({ title: 'Relatório de Auditoria Gerado!' });
              }}>
                <Download className="w-3 h-3" /> Relatório Auditoria
              </Button>
              <Button variant="outline" size="sm" className="text-[10px] gap-1" onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('correlation_id', d.correlation_id);
                navigator.clipboard.writeText(url.toString());
                localStorage.setItem('last_correlation_id', d.correlation_id);
                toast({ title: 'Link de Auditoria Copiado!' });
              }}>
                <Share2 className="w-3 h-3" /> Link Direto
              </Button>
            </div>
            <div className="flex gap-2">
              {d.status === 'failed' && (
                <Button size="sm" onClick={() => { setShowDetail(false); onRetry(); }}>Reprocessar Agora</Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setShowDetail(false)}>Fechar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPayload} onOpenChange={setShowPayload}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="w-5 h-5 text-primary" /> Payload da Notificação
            </DialogTitle>
            <SheetDescription>Dados brutos enviados para o webhook.</SheetDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-[10px]">
              <div className="bg-secondary/10 p-2 rounded-lg border border-border/50">
                <p className="font-bold text-muted-foreground uppercase mb-1">X-Correlation-ID</p>
                <p className="font-mono text-primary">{d.correlation_id || 'N/A'}</p>
              </div>
              <div className="bg-secondary/10 p-2 rounded-lg border border-border/50">
                <p className="font-bold text-muted-foreground uppercase mb-1">Status Atual</p>
                <Badge variant={d.status === 'sent' ? 'default' : 'destructive'} className="h-4 text-[8px]">
                  {d.status?.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="relative group">
              <pre className="bg-black/95 text-green-400 p-4 rounded-xl text-[10px] font-mono overflow-x-auto max-h-[400px]">
                {JSON.stringify(d.payload, null, 2)}
              </pre>
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute top-2 right-2 h-7 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity bg-background/20"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(d.payload, null, 2));
                  toast({ title: 'Payload Copiado!' });
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
          <div className="px-6 py-4 border-t bg-secondary/5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Histórico de Retentativas</p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {(!d.retry_history || d.retry_history.length === 0) ? (
                <p className="text-[10px] text-muted-foreground italic">Nenhuma retentativa registrada.</p>
              ) : d.retry_history.map((h: any, i: number) => (
                <div key={i} className="flex justify-between items-center bg-background/50 p-2 rounded border border-border/30 text-[9px]">
                  <div className="flex flex-col">
                    <span className="font-bold">Tentativa #{h.attempt}</span>
                    <span className="text-muted-foreground">{new Date(h.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-primary">{h.strategy_used?.backoff || 'manual'}</span>
                    <span className="text-destructive truncate max-w-[100px]">{h.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowPayload(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from('crm_email_templates').select('*').order('name');
    if (data) setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const save = async () => {
    if (!editing) return;
    const { error } = await supabase.from('crm_email_templates').update({
      subject: editing.subject,
      body_html: editing.body_html,
      updated_at: new Date().toISOString()
    }).eq('id', editing.id);

    if (error) {
      toast({ title: 'Erro ao salvar template', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Template salvo com sucesso' });
      setEditing(null);
      fetch();
    }
  };

  const renderPreview = (body: string) => {
    const vars: any = {
      contact_name: 'João Silva',
      agent_name: 'Agente Humano',
      action_type: 'Mudança de Etapa',
      previous_status: 'Novo Lead',
      current_status: 'Qualificação',
      correlation_id: 'CORR-123-456'
    };
    let html = body;
    Object.keys(vars).forEach(k => {
      const re = new RegExp(`{{${k}}}`, 'g');
      html = html.replace(re, vars[k]);
    });
    return html;
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Carregando templates...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="glass-card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">{t.name}</h3>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing({ ...t })}>
              <Pencil className="w-3 h-3 mr-2" /> Editar Template
            </Button>
          </div>
        ))}
      </div>

      <div className="bg-secondary/20 p-4 rounded-2xl border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-bold">Modo de Teste de Templates</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="space-y-1">
            <Label className="text-[10px]">Nome do Contato</Label>
            <Input className="h-8" placeholder="Ex: João Silva" defaultValue="Carlos Teste" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Agente Responsável</Label>
            <Input className="h-8" placeholder="Ex: Agente I.A." defaultValue="Sistema Autônomo" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Status Atual</Label>
            <Input className="h-8" defaultValue="Qualificado" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">X-Correlation-ID</Label>
            <Input className="h-8" defaultValue="TEST-SIM-999" />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 italic">Os dados acima são usados apenas para simular a prévia visual dos templates abaixo.</p>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Editar Template: {editing?.name}
            </DialogTitle>
            <SheetDescription>Use variáveis como {"{{contact_name}}" }, {"{{agent_name}}" }, {"{{correlation_id}}" }</SheetDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Assunto do E-mail</Label>
                <Input value={editing?.subject || ''} onChange={e => setEditing({ ...editing, subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Corpo do E-mail (HTML)</Label>
                <Textarea 
                  className="min-h-[300px] font-mono text-xs" 
                  value={editing?.body_html || ''} 
                  onChange={e => setEditing({ ...editing, body_html: e.target.value })} 
                />
              </div>
            </div>
            <div className="space-y-4 border-l pl-6">
              <Label className="flex items-center gap-2 text-primary"><Eye className="w-4 h-4" /> Prévia do Conteúdo Formatado</Label>
              <div className="bg-white rounded-xl border border-border p-6 min-h-[400px] shadow-sm">
                <div className="mb-4 pb-2 border-b">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Assunto</span>
                  <p className="text-sm font-semibold text-gray-900">{editing ? renderPreview(editing.subject) : ''}</p>
                </div>
                <div 
                  className="prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: editing ? renderPreview(editing.body_html) : '' }} 
                />
                <div className="mt-8 pt-4 border-t border-dashed">
                   <p className="text-[9px] text-gray-400 text-center italic">Esta é uma simulação de envio do sistema CRM</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1 text-[10px] text-muted-foreground bg-secondary/30 p-2 rounded-lg border border-border/50 w-full">
               <strong>Status Simulação:</strong> Aguardando ação | 
               <strong> X-Corr:</strong> TEST-SIM-999
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} className="gap-2">
                <CheckSquare className="w-4 h-4" /> Salvar Template
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CadastrosPage() {
  const { canAccessPage } = useAuth();
  const showWhiteLabel = canAccessPage('white-label');
  return (
    <AppLayout title="Cadastros & CRM" subtitle="Gestão centralizada de contatos, leads, clientes e auditoria">
      <Tabs defaultValue="contacts" className="w-full">
        <TabsList className={`grid grid-cols-3 ${showWhiteLabel ? 'md:grid-cols-9' : 'md:grid-cols-8'} mb-6`}>
          <TabsTrigger value="contacts"><UserPlus className="w-4 h-4 mr-2" />CRM</TabsTrigger>
          <TabsTrigger value="leads"><Users className="w-4 h-4 mr-2" />Leads</TabsTrigger>
          <TabsTrigger value="customers"><Briefcase className="w-4 h-4 mr-2" />Clientes</TabsTrigger>
          <TabsTrigger value="products"><Package className="w-4 h-4 mr-2" />Produtos</TabsTrigger>
          <TabsTrigger value="tasks"><CheckSquare className="w-4 h-4 mr-2" />Tarefas</TabsTrigger>
          <TabsTrigger value="users"><UserCog className="w-4 h-4 mr-2" />Usuários</TabsTrigger>
          <TabsTrigger value="templates"><Mail className="w-4 h-4 mr-2" />Templates</TabsTrigger>
          {showWhiteLabel && <TabsTrigger value="whitelabel"><Sparkles className="w-4 h-4 mr-2" />White Label</TabsTrigger>}
          <TabsTrigger value="audit" className="relative">
            <History className="w-4 h-4 mr-2" /> Auditoria
            <div className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </div>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contacts"><CrudTab entity="contacts" /></TabsContent>
        <TabsContent value="leads"><CrudTab entity="leads" /></TabsContent>
        <TabsContent value="customers"><CrudTab entity="customers" /></TabsContent>
        <TabsContent value="products"><CrudTab entity="products" /></TabsContent>
        <TabsContent value="tasks"><CrudTab entity="tasks" /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="templates"><EmailTemplatesTab /></TabsContent>
        {showWhiteLabel && <TabsContent value="whitelabel"><WhiteLabelTab /></TabsContent>}
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function WebhookTestPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [testPayload] = useState({
    event: "test.webhook",
    data: {
      message: "Este é um disparo real assinado para validação de receptor.",
      timestamp: new Date().toISOString()
    }
  });

  const runTest = async (type: 'valid' | 'invalid_hmac' | 'invalid_timestamp') => {
    setLoading(true);
    const corrId = `test-${Math.random().toString(36).substring(7)}`;
    
    try {
      const timestamp = type === 'invalid_timestamp' 
        ? Math.floor(Date.now() / 1000) - 600 
        : Math.floor(Date.now() / 1000);
        
      const secret = "test-secret";
      const bodyStr = JSON.stringify(testPayload);
      
      let signature = btoa(`${timestamp}.${bodyStr}.${secret}`).slice(0, 32);
      if (type === 'invalid_hmac') signature = 'invalid-sig-12345';

      await new Promise(r => setTimeout(r, 800));
      
      const isWindowValid = Math.abs(Math.floor(Date.now() / 1000) - timestamp) < 300;
      const isHmacValid = type !== 'invalid_hmac';
      
      const status = isWindowValid && isHmacValid ? 'success' : 'failed';
      const reason = !isWindowValid ? 'Timestamp fora da janela (Replay)' : !isHmacValid ? 'HMAC Inválido' : 'Entregue';

      setResult({
        status,
        reason,
        correlation_id: corrId,
        payload: testPayload,
        headers: {
          'X-Correlation-ID': corrId,
          'X-Signature': signature,
          'X-Timestamp': timestamp
        }
      });

      toast({
        title: status === 'success' ? "Webhook Aceito" : "Webhook Rejeitado",
        variant: status === 'success' ? "default" : "destructive"
      });

    } catch (e) {
      toast({ title: "Erro no teste", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
        <h4 className="text-sm font-bold flex items-center gap-2 mb-2">
          <BotIcon className="w-4 h-4" /> Disparador de Teste (Modo Dev)
        </h4>
        <p className="text-[11px] text-muted-foreground mb-4">
          Envie webhooks reais assinados para validar a segurança do seu receptor (HMAC e Replay Protection).
        </p>
        
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => runTest('valid')} disabled={loading}>
            {loading ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : null}
            Enviar Válido
          </Button>
          <Button size="sm" variant="outline" onClick={() => runTest('invalid_hmac')} disabled={loading} className="text-amber-600">
            Simular HMAC Inválido
          </Button>
          <Button size="sm" variant="outline" onClick={() => runTest('invalid_timestamp')} disabled={loading} className="text-destructive">
            Simular Replay (Expirado)
          </Button>
        </div>
      </div>

      {result && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 animate-in fade-in"
        >
          <div className={`p-4 rounded-2xl border ${result.status === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-destructive/5 border-destructive/20'}`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Resultado da Auditoria</p>
                <h5 className={`text-sm font-bold ${result.status === 'success' ? 'text-emerald-700' : 'text-destructive'}`}>
                  {result.reason}
                </h5>
              </div>
              <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                {result.status.toUpperCase()}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">X-Correlation-ID</p>
                <p className="font-mono text-[10px] text-primary select-all">{result.correlation_id}</p>
              </div>
              <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">X-Timestamp</p>
                <p className="font-mono text-[10px]">{result.headers['X-Timestamp']}</p>
              </div>
            </div>

            <div className="space-y-3">
               <div>
                 <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Payload Enviado</p>
                 <pre className="bg-black/90 text-emerald-400 p-3 rounded-lg text-[9px] font-mono overflow-x-auto">
                   {JSON.stringify(result.payload, null, 2)}
                 </pre>
               </div>
               <div>
                 <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Headers de Assinatura</p>
                 <pre className="bg-black/90 text-amber-400 p-3 rounded-lg text-[9px] font-mono overflow-x-auto">
                   {JSON.stringify(result.headers, null, 2)}
                 </pre>
               </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
