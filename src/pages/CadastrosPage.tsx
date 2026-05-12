import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Pencil, Trash2, Plus, Search, Users, Package, CheckSquare, UserCog, Briefcase, History, Eye } from 'lucide-react';
import { logAudit } from '@/lib/audit';

type Entity = 'leads' | 'customers' | 'products' | 'tasks' | 'users';

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
};

function formatCell(value: any, key: string) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'boolean') return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Sim' : 'Não'}</Badge>;
  if (key === 'price' || key === 'estimated_value') return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  if (key === 'due_date' || key === 'created_at') return new Date(value).toLocaleString('pt-BR');
  if (['status', 'priority', 'source'].includes(key)) return <Badge variant="outline">{String(value)}</Badge>;
  return String(value);
}

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

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from(schema.table).select('*').order('created_at', { ascending: false });
    if (error) toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entity]);

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
    schema.fields.forEach(field => {
      if (field.type === 'number') payload[field.name] = payload[field.name] === '' ? null : Number(payload[field.name]);
      if (field.type === 'datetime-local' && payload[field.name]) payload[field.name] = new Date(payload[field.name]).toISOString();
      if (payload[field.name] === '') payload[field.name] = null;
    });

    if (editing) {
      const { data, error } = await (supabase as any).from(schema.table).update(payload).eq('id', editing.id).select().single();
      if (error) return toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      await logAudit({ table: schema.table, recordId: editing.id, action: 'update', label: data?.[schema.titleKey], before: editing, after: data });
      toast({ title: 'Atualizado com sucesso' });
    } else {
      payload.created_by = user.id;
      const { data, error } = await (supabase as any).from(schema.table).insert(payload).select().single();
      if (error) return toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Novo
        </Button>
      </div>

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar registro' : 'Novo registro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {schema.fields.map(f => (
              <div key={f.name} className="space-y-1.5">
                <Label>{f.label}{f.required && ' *'}</Label>
                {f.type === 'textarea' ? (
                  <Textarea value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
                ) : f.type === 'select' ? (
                  <Select value={form[f.name] ?? ''} onValueChange={v => setForm({ ...form, [f.name]: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {f.options!.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : f.type === 'switch' ? (
                  <Switch checked={!!form[f.name]} onCheckedChange={v => setForm({ ...form, [f.name]: v })} />
                ) : (
                  <Input type={f.type || 'text'} value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
                )}
              </div>
            ))}
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
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ display_name: '', phone: '', role_label: 'Atendente', is_active: true, role: 'user' });
  const [deleteUid, setDeleteUid] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    const map: Record<string, string[]> = {};
    (r || []).forEach((row: any) => { map[row.user_id] = [...(map[row.user_id] || []), row.role]; });
    setRoles(map);
    setProfiles(p || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (profile: any) => {
    setEditing(profile);
    setForm({
      display_name: profile.display_name || '',
      phone: profile.phone || '',
      role_label: profile.role_label || 'Atendente',
      is_active: profile.is_active ?? true,
      role: roles[profile.user_id]?.[0] || 'user',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    const { error } = await supabase.from('profiles').update({
      display_name: form.display_name,
      phone: form.phone,
      role_label: form.role_label,
      is_active: form.is_active,
    }).eq('user_id', editing.user_id);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });

    // update role: delete existing and insert new (admin only operation per RLS)
    await supabase.from('user_roles').delete().eq('user_id', editing.user_id);
    await supabase.from('user_roles').insert({ user_id: editing.user_id, role: form.role as any });

    toast({ title: 'Usuário atualizado' });
    setOpen(false);
    load();
  };

  const toggleActive = async (profile: any) => {
    const { error } = await supabase.from('profiles').update({ is_active: !profile.is_active }).eq('user_id', profile.user_id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else load();
  };

  const remove = async () => {
    if (!deleteUid) return;
    // Soft delete: deactivate + remove roles
    await supabase.from('user_roles').delete().eq('user_id', deleteUid);
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('user_id', deleteUid);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else toast({ title: 'Usuário desativado', description: 'A exclusão definitiva precisa ser feita pelo administrador.' });
    setDeleteUid(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{profiles.length} usuário(s) cadastrado(s)</p>
        <p className="text-xs text-muted-foreground">Novos usuários se cadastram pela tela de login.</p>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Permissão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : profiles.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.display_name || '—'}</TableCell>
                <TableCell>{p.phone || '—'}</TableCell>
                <TableCell>{p.role_label || '—'}</TableCell>
                <TableCell>
                  {(roles[p.user_id] || ['user']).map(r => <Badge key={r} variant="outline" className="mr-1">{r}</Badge>)}
                </TableCell>
                <TableCell>
                  <Switch checked={!!p.is_active} onCheckedChange={() => toggleActive(p)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteUid(p.user_id)} disabled={p.user_id === user?.id}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Nome de exibição</Label><Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Cargo</Label><Input value={form.role_label} onChange={e => setForm({ ...form, role_label: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Permissão</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="moderator">Moderador</SelectItem>
                  <SelectItem value="user">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between"><Label>Ativo</Label><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUid} onOpenChange={o => !o && setDeleteUid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar usuário?</AlertDialogTitle>
            <AlertDialogDescription>O usuário será desativado e suas permissões removidas. A exclusão completa requer ação do administrador no painel de autenticação.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Desativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CadastrosPage() {
  return (
    <AppLayout title="Cadastros" subtitle="Gerencie leads, clientes, produtos, tarefas e usuários">
      <Tabs defaultValue="leads" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 mb-6">
          <TabsTrigger value="leads"><Users className="w-4 h-4 mr-2" />Leads</TabsTrigger>
          <TabsTrigger value="customers"><Briefcase className="w-4 h-4 mr-2" />Clientes</TabsTrigger>
          <TabsTrigger value="products"><Package className="w-4 h-4 mr-2" />Produtos</TabsTrigger>
          <TabsTrigger value="tasks"><CheckSquare className="w-4 h-4 mr-2" />Tarefas</TabsTrigger>
          <TabsTrigger value="users"><UserCog className="w-4 h-4 mr-2" />Usuários</TabsTrigger>
        </TabsList>
        <TabsContent value="leads"><CrudTab entity="leads" /></TabsContent>
        <TabsContent value="customers"><CrudTab entity="customers" /></TabsContent>
        <TabsContent value="products"><CrudTab entity="products" /></TabsContent>
        <TabsContent value="tasks"><CrudTab entity="tasks" /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
