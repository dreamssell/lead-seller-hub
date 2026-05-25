import { useEffect, useState } from 'react';
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
import { Pencil, Trash2, Plus, Search, Users, Package, CheckSquare, UserCog, Briefcase, History, Eye, Sparkles } from 'lucide-react';
import WhiteLabelTab from '@/components/cadastros/WhiteLabelTab';
import { logAudit } from '@/lib/audit';
import { BLOCKABLE_PAGES } from '@/lib/navigation';

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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scopeSubId]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Detect shape: { before, after } | { old, new } | flat object
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

export default function CadastrosPage() {
  return (
    <AppLayout title="Cadastros" subtitle="Gerencie leads, clientes, produtos, tarefas e usuários">
      <Tabs defaultValue="leads" className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-7 mb-6">
          <TabsTrigger value="leads"><Users className="w-4 h-4 mr-2" />Leads</TabsTrigger>
          <TabsTrigger value="customers"><Briefcase className="w-4 h-4 mr-2" />Clientes</TabsTrigger>
          <TabsTrigger value="products"><Package className="w-4 h-4 mr-2" />Produtos</TabsTrigger>
          <TabsTrigger value="tasks"><CheckSquare className="w-4 h-4 mr-2" />Tarefas</TabsTrigger>
          <TabsTrigger value="users"><UserCog className="w-4 h-4 mr-2" />Usuários</TabsTrigger>
          <TabsTrigger value="whitelabel"><Sparkles className="w-4 h-4 mr-2" />White Label</TabsTrigger>
          <TabsTrigger value="audit"><History className="w-4 h-4 mr-2" />Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="leads"><CrudTab entity="leads" /></TabsContent>
        <TabsContent value="customers"><CrudTab entity="customers" /></TabsContent>
        <TabsContent value="products"><CrudTab entity="products" /></TabsContent>
        <TabsContent value="tasks"><CrudTab entity="tasks" /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="whitelabel"><WhiteLabelTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
