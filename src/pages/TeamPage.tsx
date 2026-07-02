import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Bot, UserCheck, MoreVertical, Infinity as InfinityIcon, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';

type Member = {
  user_id: string;
  is_account_admin: boolean;
  allowed_pages: string[];
  profile: {
    display_name?: string | null;
    email?: string | null;
    role_label?: string | null;
    is_active?: boolean | null;
  } | null;
};

export default function TeamPage() {
  const { access, user } = useAuth();
  const { isOwner } = usePlatformOwner();
  const scopeSubId = access?.sub_company_id ?? null;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxUsers, setMaxUsers] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', display_name: '',
    role_label: 'Atendente', is_account_admin: false,
  });

  const unlimited = isOwner || maxUsers == null;
  const total = members.length;
  const limitReached = !unlimited && total >= (maxUsers ?? 0);

  const loadMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('manage-account-user', {
      body: { action: 'list', sub_company_id: scopeSubId },
    });
    if (error) {
      toast({ title: 'Erro ao carregar equipe', description: error.message, variant: 'destructive' });
    } else {
      setMembers(((data as any)?.users || []) as Member[]);
    }
    setLoading(false);
  };

  const loadPlanLimit = async () => {
    if (isOwner) { setMaxUsers(null); setPlanName('Ilimitado (Dono)'); return; }
    let planSlug: string | null = null;
    if (scopeSubId) {
      const { data } = await supabase.from('sub_companies').select('plan_slug').eq('id', scopeSubId).maybeSingle();
      planSlug = data?.plan_slug ?? null;
    } else if (user?.id) {
      // Painel-owner (no sub_company): try own client_companies plan; fallback unlimited
      const { data } = await supabase.from('client_companies').select('plan_slug').eq('owner_id', user.id).limit(1).maybeSingle();
      planSlug = data?.plan_slug ?? null;
    }
    if (!planSlug) { setMaxUsers(null); setPlanName('Ilimitado'); return; }
    const { data: plan } = await supabase
      .from('plan_packages').select('name, max_users').eq('slug', planSlug).maybeSingle();
    setMaxUsers(plan?.max_users ?? null);
    setPlanName(plan?.name ?? planSlug);
  };

  useEffect(() => { loadMembers(); loadPlanLimit(); /* eslint-disable-next-line */ }, [scopeSubId, isOwner, user?.id]);

  const openNew = () => {
    if (limitReached) {
      toast({
        title: 'Limite do plano atingido',
        description: `Seu plano ${planName} permite ${maxUsers} usuários. Faça upgrade para adicionar mais.`,
        variant: 'destructive',
      });
      return;
    }
    setEditing(null);
    setForm({ email: '', password: '', display_name: '', role_label: 'Atendente', is_account_admin: false });
    setDialogOpen(true);
  };

  const openEdit = (m: Member) => {
    setEditing(m);
    setForm({
      email: m.profile?.email || '',
      password: '',
      display_name: m.profile?.display_name || '',
      role_label: m.profile?.role_label || 'Atendente',
      is_account_admin: !!m.is_account_admin,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.display_name.trim()) { toast({ title: 'Informe o nome', variant: 'destructive' }); return; }
    if (!editing) {
      if (!form.email.trim() || !form.password || form.password.length < 6) {
        toast({ title: 'E-mail e senha (mín. 6) obrigatórios', variant: 'destructive' });
        return;
      }
    }
    setSaving(true);
    const payload: any = editing
      ? {
          action: 'update', sub_company_id: scopeSubId, user_id: editing.user_id,
          name: form.display_name, role_label: form.role_label,
          is_account_admin: form.is_account_admin,
          ...(form.password ? { password: form.password } : {}),
        }
      : {
          action: 'create', sub_company_id: scopeSubId,
          email: form.email.trim().toLowerCase(), name: form.display_name, password: form.password,
          is_account_admin: form.is_account_admin,
        };
    const { data, error } = await supabase.functions.invoke('manage-account-user', { body: payload });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Erro', description: error?.message || (data as any)?.error, variant: 'destructive' });
      return;
    }
    toast({ title: editing ? 'Membro atualizado' : 'Membro adicionado' });
    setDialogOpen(false);
    loadMembers();
  };

  const remove = async (m: Member) => {
    if (m.user_id === user?.id) return;
    if (!confirm(`Remover ${m.profile?.display_name || m.profile?.email}?`)) return;
    const { data, error } = await supabase.functions.invoke('manage-account-user', {
      body: { action: 'delete', sub_company_id: scopeSubId, user_id: m.user_id },
    });
    if (error || (data as any)?.error) {
      toast({ title: 'Erro ao remover', description: error?.message || (data as any)?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Membro removido' });
    loadMembers();
  };

  const progressPct = useMemo(() => {
    if (unlimited) return 100;
    if (!maxUsers) return 0;
    return Math.min(100, (total / maxUsers) * 100);
  }, [unlimited, total, maxUsers]);

  return (
    <AppLayout title="Equipe (SDR/Closers)" subtitle="Gerencie seus atendentes e agentes de I.A.">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
            {unlimited ? (
              <><InfinityIcon className="w-4 h-4" /> {total} usuários · {planName || 'Ilimitado'}</>
            ) : (
              <>{total}/{maxUsers} usuários · Plano {planName}</>
            )}
          </span>
          <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${limitReached ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <Button onClick={openNew} disabled={limitReached && !unlimited}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Membro
        </Button>
      </div>

      {limitReached && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Você atingiu o limite de {maxUsers} usuários do plano {planName}. Faça upgrade para adicionar novos membros.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando equipe...
        </div>
      ) : members.length === 0 ? (
        <div className="glass-card p-10 text-center text-muted-foreground">
          Nenhum membro cadastrado ainda. Clique em <b>Adicionar Membro</b> para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m, i) => {
            const isAI = /bot|i\.?a\.?|agente/i.test(m.profile?.role_label || '');
            const active = m.profile?.is_active !== false;
            return (
              <motion.div
                key={m.user_id}
                className="glass-card p-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isAI ? 'bg-primary/10' : 'bg-success/10'
                    }`}>
                      {isAI ? <Bot className="w-5 h-5 text-primary" /> : <UserCheck className="w-5 h-5 text-success" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {m.profile?.display_name || m.profile?.email || '—'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.profile?.role_label || 'Membro'}{m.is_account_admin ? ' · Admin' : ''}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(m)}>
                        <Pencil className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={m.user_id === user?.id}
                        onClick={() => remove(m)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${active ? 'bg-success' : 'bg-muted-foreground'}`} />
                    <span className="text-xs text-muted-foreground">{active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate max-w-[60%]">{m.profile?.email}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar membro' : 'Adicionar membro'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Atualize os dados de acesso deste colaborador.' : 'Crie um novo acesso à plataforma.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" disabled={!!editing} value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>{editing ? 'Nova senha (opcional)' : 'Senha (mín. 6)'}</Label>
              <Input type="password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={form.role_label} onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                placeholder="Atendente, Closer, SDR..." />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Administrador da conta</p>
                <p className="text-xs text-muted-foreground">Concede permissões totais dentro deste escopo.</p>
              </div>
              <Switch checked={form.is_account_admin}
                onCheckedChange={v => setForm(f => ({ ...f, is_account_admin: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
