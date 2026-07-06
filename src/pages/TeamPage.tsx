import { useEffect, useMemo, useRef, useState } from 'react';
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
import { extractManageUserError } from '@/lib/manageAccountUserErrors';

type AccessLevel = 'atendimento' | 'supervisao' | 'administracao';

type Member = {
  user_id: string;
  is_account_admin: boolean;
  allowed_pages: string[];
  access_level?: AccessLevel;
  pipeline_ids?: string[];
  profile: {
    display_name?: string | null;
    email?: string | null;
    role_label?: string | null;
    is_active?: boolean | null;
  } | null;
};

type PipelineOption = { id: string; name: string };

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
    pipeline_ids: string[];
  }>({
    email: '', password: '', display_name: '',
    role_label: 'Atendente', access_level: 'atendimento',
    pipeline_ids: [],
  });

  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [pipelinesError, setPipelinesError] = useState<string | null>(null);
  const [pipelineFieldHighlight, setPipelineFieldHighlight] = useState(false);
  const pipelineFieldRef = useRef<HTMLDivElement | null>(null);

  const flashPipelineField = () => {
    setPipelineFieldHighlight(true);
    requestAnimationFrame(() => {
      pipelineFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.setTimeout(() => setPipelineFieldHighlight(false), 2600);
  };

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
    const ownerId = access?.owner_id ?? user?.id ?? null;
    if (!ownerId) { setMaxUsers(null); setPlanName('Ilimitado'); return; }
    // Fonte da verdade: RPC no banco (mesma regra usada pelo trigger de bloqueio).
    const { data: usage } = await (supabase as any).rpc('get_member_seat_usage', {
      p_owner_id: ownerId,
      p_sub_company_id: scopeSubId,
    });
    const row = Array.isArray(usage) ? usage[0] : usage;
    const slug: string | null = row?.plan_slug ?? null;
    setMaxUsers(row?.max_users ?? null);
    if (!slug) { setPlanName('Ilimitado'); return; }
    const { data: plan } = await supabase
      .from('plan_packages').select('name').eq('slug', slug).maybeSingle();
    setPlanName(plan?.name ?? slug);
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

  const loadPipelines = async () => {
    setPipelinesLoading(true);
    setPipelinesError(null);
    const ownerId = access?.owner_id ?? user?.id;
    if (!ownerId) {
      setPipelines([]);
      setPipelinesError('Escopo indisponível: faça login novamente para carregar seus funis.');
      setPipelinesLoading(false);
      return;
    }
    try {
      let q = supabase.from('pipelines').select('id, name').eq('owner_id', ownerId).order('name');
      q = scopeSubId ? q.eq('sub_company_id', scopeSubId) : q.is('sub_company_id', null);
      const { data, error } = await q;
      if (error) throw error;
      setPipelines((data || []) as PipelineOption[]);
    } catch (e: any) {
      const msg = e?.message || 'Falha ao carregar funis ativos.';
      setPipelines([]);
      setPipelinesError(msg);
      toast({ title: 'Erro ao carregar funis', description: msg, variant: 'destructive' });
    } finally {
      setPipelinesLoading(false);
    }
  };

  useEffect(() => { loadMembers(); loadPlanLimit(); loadPipelines(); /* eslint-disable-next-line */ }, [scopeSubId, isOwner, user?.id]);
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
    setForm({ email: '', password: '', display_name: '', role_label: 'Atendente', access_level: 'atendimento', pipeline_ids: [] });
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
      pipeline_ids: m.pipeline_ids || [],
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
    if (form.access_level === 'atendimento' && form.pipeline_ids.length === 0) {
      flashPipelineField();
      toast({
        title: '⚠ Selecione pelo menos 1 funil',
        description: 'O campo "Funis atribuídos" foi destacado abaixo. Marque um ou mais funis ativos para concluir o cadastro de um membro de Atendimento.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    const payload: any = editing
      ? {
          action: 'update', sub_company_id: scopeSubId, user_id: editing.user_id,
          name: form.display_name, role_label: form.role_label,
          access_level: form.access_level,
          pipeline_ids: form.pipeline_ids,
          ...(form.password ? { password: form.password } : {}),
          ...(isOwner && form.email.trim() && form.email.trim().toLowerCase() !== (editing.profile?.email || '').toLowerCase()
            ? { email: form.email.trim().toLowerCase() }
            : {}),
        }
      : {
          action: 'create', sub_company_id: scopeSubId,
          email: form.email.trim().toLowerCase(), name: form.display_name, password: form.password,
          role_label: form.role_label,
          access_level: form.access_level,
          pipeline_ids: form.pipeline_ids,
        };
    const { data, error } = await supabase.functions.invoke('manage-account-user', { body: payload });
    setSaving(false);
    const surfaced = await extractManageUserError(data, error);
    if (surfaced) {
      const isPipelineErr =
        surfaced.code === 'pipeline_required' ||
        /funil|pipeline/i.test(surfaced.message);
      if (isPipelineErr) {
        flashPipelineField();
        toast({
          title: '⚠ Selecione pelo menos 1 funil',
          description: `${surfaced.message} O campo "Funis atribuídos" foi destacado abaixo.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Erro', description: surfaced.message, variant: 'destructive' });
      }
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
    const surfaced = await extractManageUserError(data, error);
    if (surfaced) {
      toast({ title: 'Erro ao remover', description: surfaced.message, variant: 'destructive' });
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
            const pipelineMap = new Map(pipelines.map(p => [p.id, p.name]));
            const memberPipelines = (m.pipeline_ids || [])
              .map(id => pipelineMap.get(id))
              .filter(Boolean) as string[];
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

                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Funis atribuídos</p>
                  {memberPipelines.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground italic">Nenhum funil</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {memberPipelines.slice(0, 4).map((name, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 max-w-[140px] truncate"
                          title={name}
                        >
                          {name}
                        </span>
                      ))}
                      {memberPipelines.length > 4 && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground"
                          title={memberPipelines.slice(4).join(', ')}
                        >
                          +{memberPipelines.length - 4}
                        </span>
                      )}
                    </div>
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
              <Input
                type="email"
                data-testid="team-email-input"
                aria-label="E-mail do membro"
                readOnly={!!editing && !isOwner}
                disabled={!!editing && !isOwner}
                aria-disabled={!!editing && !isOwner || undefined}
                aria-describedby={editing && !isOwner ? 'team-email-lock-warning' : undefined}
                title={editing && !isOwner ? 'Somente o dono da plataforma pode alterar o e-mail.' : undefined}
                value={form.email}
                onChange={e => {
                  if (editing && !isOwner) return;
                  setForm(f => ({ ...f, email: e.target.value }));
                }}
                className={editing && !isOwner ? 'cursor-not-allowed opacity-70' : undefined}
              />
              {editing && !isOwner && (
                <p
                  id="team-email-lock-warning"
                  role="alert"
                  aria-live="polite"
                  aria-atomic="true"
                  data-testid="team-email-lock-warning"
                  className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Apenas o dono da plataforma pode alterar o e-mail deste usuário.
                </p>
              )}
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
            <div
              ref={pipelineFieldRef}
              className={
                'scroll-mt-4 rounded-lg transition-all ' +
                (pipelineFieldHighlight
                  ? 'ring-2 ring-destructive ring-offset-2 ring-offset-background animate-pulse -m-2 p-2'
                  : '')
              }
            >
              <div className="flex items-center justify-between">
                <Label>Funis atribuídos</Label>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  {pipelinesLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  {pipelinesLoading
                    ? 'Carregando...'
                    : pipelinesError
                    ? <span className="text-destructive">Falha ao carregar</span>
                    : `${form.pipeline_ids.length} de ${pipelines.length} selecionado(s)`}
                </span>
              </div>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {pipelinesLoading ? (
                  <div className="p-3 text-xs text-muted-foreground flex items-center gap-2" aria-live="polite">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando funis ativos...
                  </div>
                ) : pipelinesError ? (
                  <div className="p-3 text-xs text-destructive flex items-center justify-between gap-2" role="alert">
                    <span className="truncate" title={pipelinesError}>⚠ {pipelinesError}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] shrink-0"
                      onClick={loadPipelines}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : pipelines.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">
                    Nenhum funil ativo neste escopo. Crie funis na página Pipeline antes de atribuir.
                  </div>
                ) : (
                  pipelines.map(p => {
                    const checked = form.pipeline_ids.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-secondary/50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm(f => ({
                              ...f,
                              pipeline_ids: e.target.checked
                                ? Array.from(new Set([...f.pipeline_ids, p.id]))
                                : f.pipeline_ids.filter(id => id !== p.id),
                            }));
                          }}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Selecione um ou vários funis ativos deste escopo aos quais este membro terá acesso.
              </p>
              {form.access_level === 'atendimento' && form.pipeline_ids.length === 0 && !pipelinesLoading && !pipelinesError && (
                <p className="text-xs text-destructive mt-1.5 flex items-center gap-1" role="alert">
                  ⚠ Obrigatório para o nível <strong>Atendimento</strong>: escolha pelo menos 1 funil.
                </p>
              )}
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
            <Button
              onClick={save}
              disabled={saving || (form.access_level === 'atendimento' && form.pipeline_ids.length === 0)}
            >
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
