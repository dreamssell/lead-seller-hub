import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Building2, Plus, Pencil, Trash2, Search, Mail, Phone, Globe, MapPin, FileText, Info } from 'lucide-react';
import { motion } from 'framer-motion';

type Company = {
  id: string;
  owner_id: string;
  sub_company_id: string | null;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  plan_slug: string | null;
  status: string;
  logo_url: string | null;
  notes: string | null;
  login_email: string | null;
  auth_user_id: string | null;
  display_name: string | null;
  created_at: string;
};

const EMPTY: Partial<Company> & { password?: string } = {
  name: '', document: '', email: '', phone: '', website: '',
  address: '', city: '', state: '', segment: '', plan_slug: 'basic',
  status: 'active', notes: '', login_email: '', password: '', display_name: '',
};

export default function CompaniesTab() {
  const { user, access } = useAuth();
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<(Partial<Company> & { password?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Company | null>(null);

  const subCompanyId = access?.sub_company_id ?? null;
  const ownerId = access?.owner_id ?? user?.id ?? null;

  const load = async () => {
    setLoading(true);
    let query = supabase.from('client_companies').select('*').order('created_at', { ascending: false });
    const { data, error } = await query;
    setLoading(false);
    if (error) return toast({ title: 'Erro ao carregar empresas', description: error.message, variant: 'destructive' });
    setRows((data || []) as Company[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.name, r.document, r.email, r.phone, r.city, r.segment]
      .some((v) => v?.toLowerCase().includes(s)));
  }, [rows, q]);

  const save = async () => {
    if (!editing?.name?.trim()) return toast({ title: 'Informe o nome da empresa', variant: 'destructive' });
    if (!ownerId) return toast({ title: 'Sessão inválida', variant: 'destructive' });
    setSaving(true);
    const payload: any = {
      name: editing.name?.trim(),
      document: editing.document || null,
      email: editing.email || null,
      phone: editing.phone || null,
      website: editing.website || null,
      address: editing.address || null,
      city: editing.city || null,
      state: editing.state || null,
      segment: editing.segment || null,
      plan_slug: editing.plan_slug || 'basic',
      status: editing.status || 'active',
      notes: editing.notes || null,
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from('client_companies').update(payload).eq('id', editing.id));
    } else {
      payload.owner_id = ownerId;
      payload.sub_company_id = subCompanyId;
      payload.created_by = user?.id ?? null;
      ({ error } = await supabase.from('client_companies').insert(payload));
    }
    setSaving(false);
    if (error) return toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    toast({ title: editing.id ? 'Empresa atualizada' : 'Empresa cadastrada' });
    setEditing(null);
    load();
  };

  const remove = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.from('client_companies').delete().eq('id', confirmDel.id);
    if (error) return toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    toast({ title: 'Empresa excluída' });
    setConfirmDel(null);
    load();
  };

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 flex items-start gap-3 border border-primary/10"
      >
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-0.5">Cadastro de Empresas (consumidor final)</p>
          <p>Registre aqui as empresas que consomem sua plataforma como clientes. Este cadastro <strong>não cria sub-empresas</strong> nem concede acesso ao painel — para isso utilize <em>Cadastros de Sub-Empresas</em> em White Label.</p>
        </div>
      </motion.div>

      <div className="flex items-center gap-2 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CNPJ, e-mail…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Empresa
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma empresa cadastrada.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{r.name}</p>
                      {r.website && <p className="text-xs text-muted-foreground">{r.website}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.document || '—'}</TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {r.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</div>}
                    {r.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</div>}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{[r.city, r.state].filter(Boolean).join(' / ') || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.segment || '—'}</TableCell>
                <TableCell><Badge variant="outline">{r.plan_slug || 'basic'}</Badge></TableCell>
                <TableCell>
                  <Badge variant={r.status === 'active' ? 'default' : 'secondary'}>
                    {r.status === 'active' ? 'Ativa' : r.status === 'blocked' ? 'Bloqueada' : r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDel(r)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {editing?.id ? 'Editar Empresa' : 'Nova Empresa'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="md:col-span-2">
              <Label>Nome da empresa *</Label>
              <Input value={editing?.name || ''} onChange={(e) => setEditing((p) => ({ ...p!, name: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><FileText className="w-3 h-3" />CNPJ/CPF</Label>
              <Input value={editing?.document || ''} onChange={(e) => setEditing((p) => ({ ...p!, document: e.target.value }))} />
            </div>
            <div>
              <Label>Segmento</Label>
              <Input placeholder="Ex.: Seguros, Varejo, Educação…" value={editing?.segment || ''} onChange={(e) => setEditing((p) => ({ ...p!, segment: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Mail className="w-3 h-3" />E-mail</Label>
              <Input type="email" value={editing?.email || ''} onChange={(e) => setEditing((p) => ({ ...p!, email: e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Phone className="w-3 h-3" />Telefone</Label>
              <Input value={editing?.phone || ''} onChange={(e) => setEditing((p) => ({ ...p!, phone: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label className="flex items-center gap-1"><Globe className="w-3 h-3" />Website</Label>
              <Input placeholder="https://" value={editing?.website || ''} onChange={(e) => setEditing((p) => ({ ...p!, website: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label className="flex items-center gap-1"><MapPin className="w-3 h-3" />Endereço</Label>
              <Input value={editing?.address || ''} onChange={(e) => setEditing((p) => ({ ...p!, address: e.target.value }))} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={editing?.city || ''} onChange={(e) => setEditing((p) => ({ ...p!, city: e.target.value }))} />
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Input maxLength={2} value={editing?.state || ''} onChange={(e) => setEditing((p) => ({ ...p!, state: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <Label>Plano contratado</Label>
              <Select value={editing?.plan_slug || 'basic'} onValueChange={(v) => setEditing((p) => ({ ...p!, plan_slug: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editing?.status || 'active'} onValueChange={(v) => setEditing((p) => ({ ...p!, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="blocked">Bloqueada</SelectItem>
                  <SelectItem value="churn">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Notas internas</Label>
              <Textarea rows={3} value={editing?.notes || ''} onChange={(e) => setEditing((p) => ({ ...p!, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar Empresa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{confirmDel?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
