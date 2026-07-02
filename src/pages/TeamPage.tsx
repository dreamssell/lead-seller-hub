import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Bot, UserCheck, MoreVertical, Infinity as InfinityIcon, Loader2, Pencil, Trash2, ShieldCheck, History, Shield, Headset } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';

type AccessLevel = 'atendimento' | 'supervisao' | 'administracao';

type Member = {
  user_id: string;
  is_account_admin: boolean;
  allowed_pages: string[];
  access_level?: AccessLevel;
  profile: {
    display_name?: string | null;
    email?: string | null;
    role_label?: string | null;
    is_active?: boolean | null;
  } | null;
};

const ACCESS_LEVELS: Array<{ value: AccessLevel; label: string; description: string; icon: any }> = [
  { value: 'atendimento', label: 'Atendimento', description: 'Usuários operacionais (SDR, Closer, Atendente).', icon: Headset },
  { value: 'supervisao', label: 'Supervisão', description: 'Coordenadores, Supervisores e Gestores de equipe.', icon: ShieldCheck },
  { value: 'administracao', label: 'Administração', description: 'Administradores da conta, Diretores ou Donos.', icon: Shield },
];

const levelMeta = (v?: AccessLevel) => ACCESS_LEVELS.find(l => l.value === v) || ACCESS_LEVELS[0];

export default function TeamPage() {
  const { access, user } = useAuth();
  const { isOwner } = usePlatformOwner();
  const scopeSubId = access?.sub_company_id ?? null;

  // Management gate: platform owner OR account admin of current scope
  const isManagement = isOwner || !!access?.is_account_admin;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxUsers, setMaxUsers] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    email: string; password: string; display_name: string;
    role_label: string; access_level: AccessLevel;
  }>({
    email: '', password: '', display_name: '',
    role_label: 'Atendente', access_level: 'atendimento',
  });

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const unlimited = isOwner || maxUsers == null;
  const total = members.length;
  const limitReached = !unlimited && total >= (maxUsers ?? 0);
  const canManage = isManagement;

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
      const { data } = await supabase.from('client_companies').select('plan_slug').eq('owner_id', user.id).limit(1).maybeSingle();
      planSlug = data?.plan_slug ?? null;
    }
    if (!planSlug) { setMaxUsers(null); setPlanName('Ilimitado'); return; }
    const { data: plan } = await supabase
      .from('plan_packages').select('name, max_users').eq('slug', planSlug).maybeSingle();
    setMaxUsers(plan?.max_users ?? null);
    setPlanName(plan?.name ?? planSlug);
  };

  const loadAudit = async () => {
    if (!isManagement) return;
    setAuditLoading(true);
    const ids = members.map(m => m.user_id);
    const q = supabase
      .from('audit_logs')
      .select('id, created_at, action, record_label, changes, changed_by, record_id')
      .eq('table_name', 'user_account_access')
      .order('created_at', { ascending: false })
      .limit(50);
    const { data } = ids.length > 0 ? await q.in('record_id', ids) : await q;
    // Resolve author names
    const authorIds = Array.from(new Set((data || []).map((r: any) => r.changed_by).filter(Boolean)));
    let authorMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name, email').in('user_id', authorIds);
      (profs || []).forEach((p: any) => authorMap.set(p.user_id, p.display_name || p.email || p.user_id));
    }
    setAuditRows((data || []).map((r: any) => ({ ...r, changed_by_name: authorMap.get(r.changed_by) || 'Sistema' })));
    setAuditLoading(false);
  };

  useEffect(() => { loadMembers(); loadPlanLimit(); /* eslint-disable-next-line */ }, [scopeSubId, isOwner, user?.id]);
  useEffect(() => { if (auditOpen) loadAudit(); /* eslint-disable-next-line */ }, [auditOpen, members.length]);

  const openNew = () => {
    if (!canManage) {
      toast({ title: 'Permissão negada', description: 'Apenas administradores podem adicionar membros.', variant: 'destructive' });
      return;
    }
    if (limitReached) {
      toast({
        title: 'Limite do plano atingido',
        description: `Seu plano ${planName} permite ${maxUsers} usuários. Faça upgrade para adicionar mais.`,
        variant: 'destructive',
      });
      return;
    }
    setEditing(null);
    setForm({ email: '', password: '', display_name: '', role_label: 'Atendente', access_level: 'atendimento' });
    setDialogOpen(true);
  };

  const openEdit = (m: Member) => {
    if (!canManage) return;
    setEditing(m);
    setForm({
      email: m.profile?.email || '',
      password: '',
      display_name: m.profile?.display_name || '',
      role_label: m.profile?.role_label || 'Atendente',
      access_level: m.access_level || (m.is_account_admin ? 'administracao' : 'atendimento'),
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
          access_level: form.access_level,
          ...(form.password ? { password: form.password } : {}),
        }
      : {
          action: 'create', sub_company_id: scopeSubId,
          email: form.email.trim().toLowerCase(), name: form.display_name, password: form.password,
          role_label: form.role_label,
          access_level: form.access_level,
        };
    const { data, error } = await supabase.functions.invoke('manage-account-user', { body: payload });
    setSaving(false);
    let errMsg = (data as any)?.error as string | undefined;
    if (error && !errMsg) {
      // supabase-js stores the failed HTTP Response directly in error.context.
      // Older mocks/wrappers may expose it as context.response, so support both.
      try {
        const context = (error as any)?.context;
        const resp = (typeof Response !== 'undefined' && context instanceof Response)
          ? context
          : context?.response as Response | undefined;
        if (resp) {
          const body = await resp.clone().json().catch(() => null);
          errMsg = body?.error || body?.message;
        }
      } catch { /* ignore */ }
      if (!errMsg) errMsg = error.message;
    }
    if (errMsg) {
      toast({ title: 'Erro', description: errMsg, variant: 'destructive' });
      return;
    }
    toast({ title: editing ? 'Membro atualizado' : 'Membro adicionado' });
    setDialogOpen(false);
    loadMembers();
  };

  const remove = async (m: Member) => {
    if (!canManage) return;
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
        <div className="flex items-center gap-2">
          {isManagement && (
            <Button variant="outline" onClick={() => setAuditOpen(true)}>
              <History className="w-4 h-4 mr-2" /> Auditoria
            </Button>
          )}
          <Button
            onClick={openNew}
            disabled={!canManage || (limitReached && !unlimited)}
            title={!canManage ? 'Apenas administradores podem adicionar membros' : undefined}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Membro
          </Button>
        </div>
      </div>

      {limitReached && (
        <div
          role="alert"
          aria-label="limite-plano-atingido"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        >
          <div>
            <p className="font-semibold">Limite do plano {planName} atingido</p>
            <p className="text-destructive/80">
              Você já utiliza <b>{total}</b> de <b>{maxUsers}</b> usuários disponíveis no plano <b>{planName}</b>.
              Para adicionar novos membros, remova um usuário existente ou solicite um aumento de licenças.
            </p>
          </div>
          <a
            href={`mailto:suporte@leadseller.com?subject=${encodeURIComponent(
              `Solicitação de aumento de usuários – Plano ${planName}`
            )}&body=${encodeURIComponent(
              `Olá, gostaria de aumentar o limite de usuários do meu plano ${planName} (atual: ${maxUsers}).\n\nEscopo: ${scopeSubId ? 'sub-empresa' : 'conta principal'}\nUsuário: ${user?.email || ''}`
            )}`}
            data-testid="request-plan-upgrade"
            className="inline-flex items-center justify-center rounded-lg bg-destructive text-destructive-foreground px-3 py-2 text-xs font-medium hover:opacity-90 whitespace-nowrap"
          >
            Solicitar aumento de usuários
          </a>
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
            const lvl = levelMeta(m.access_level || (m.is_account_admin ? 'administracao' : 'atendimento'));
            const LvlIcon = lvl.icon;
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
                        {m.profile?.role_label || 'Membro'}
                      </p>
                    </div>
                  </div>
                  {canManage && (
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
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${active ? 'bg-success' : 'bg-muted-foreground'}`} />
                    <span className="text-xs text-muted-foreground">{active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    <LvlIcon className="w-3 h-3" /> {lvl.label}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add/Edit dialog */}
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
                placeholder="Atendente, Closer, SDR, Coordenador..." />
            </div>
            <div>
              <Label>Nível de acesso</Label>
              <Select value={form.access_level} onValueChange={(v: AccessLevel) => setForm(f => ({ ...f, access_level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.map(l => (
                    <SelectItem key={l.value} value={l.value} className="group">
                      <div className="flex items-start gap-2">
                        <l.icon className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{l.label}</p>
                          <p className="text-xs text-muted-foreground group-data-[highlighted]:text-accent-foreground/85 group-data-[state=checked]:text-accent-foreground/85">{l.description}</p>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Administração concede permissões totais dentro deste escopo. Supervisão libera dashboards de gestão e assinaturas de nível supervisor.
              </p>
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

      {/* Audit dialog (management only) */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Auditoria da Equipe</DialogTitle>
            <DialogDescription>
              Ações recentes de criação, edição e remoção de membros neste escopo
              {scopeSubId ? ' (sub-empresa atual)' : ' (conta principal)'}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {auditLoading ? (
              <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando...</div>
            ) : auditRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma ação registrada ainda.</div>
            ) : auditRows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    r.action === 'create' ? 'bg-success/10 text-success' :
                    r.action === 'delete' ? 'bg-destructive/10 text-destructive' :
                    'bg-primary/10 text-primary'
                  }`}>{r.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{r.record_label || r.record_id}</p>
                <p className="text-xs text-muted-foreground">Por: {r.changed_by_name}</p>
                {r.changes && (
                  <pre className="mt-2 text-[11px] bg-secondary/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(r.changes, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
