import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Building2, Globe, LayoutDashboard, Plus, Pencil, Trash2, Ban, LogIn, Copy, Check, Sparkles, Crown, Star, Wand2, Upload, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';
import { SubCompanyManageDialog } from './SubCompanyManageDialog';
import { BLOCKABLE_PAGES, ALL_PERMISSION_KEYS } from '@/lib/navigation';
import { normalizeAdminEmail, dedupeSubCompaniesByEmail } from '@/lib/subCompanyUtils';

type Plan = {
  id: string; slug: string; name: string; tagline: string | null;
  monthly_price: number; credits_included: number; max_users: number | null;
  features: string[]; is_most_chosen: boolean; is_custom: boolean; sort_order: number;
};

type SubCompany = {
  id: string; owner_id: string; name: string; admin_name: string; admin_email: string;
  whatsapp_limit: number; plan_slug: string; monthly_fee: number;
  inherit_branding: boolean; byok_inherit: boolean; byok_api_key: string | null;
  blocked_pages: string[]; credit_limit: number; credit_balance: number;
  credits_used_today: number; credits_used_30d: number; status: string;
  allow_custom_logic: boolean;
};

type WLSettings = {
  id?: string; owner_id?: string;
  company_name: string | null; logo_light_url: string | null; logo_dark_url: string | null; logo_icon_url: string | null;
  primary_color: string | null; custom_domain: string | null; domain_active: boolean;
  login_panel_style: string; login_headline: string | null; login_subtext: string | null; login_image_url: string | null;
  domain_status?: 'pending' | 'active' | 'invalid';
  domain_verification_token?: string | null;
  domain_last_checked_at?: string | null;
  domain_check_message?: string | null;
};

export default function WhiteLabelTab() {
  return (
    <div className="space-y-6">
      <div className="glass-card p-5 bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Sparkles className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="text-base font-semibold text-foreground">White Label</h3>
            <p className="text-sm text-muted-foreground">Crie sub-empresas, personalize sua marca, conecte um domínio próprio e personalize a página de login. Suas sub-empresas herdam automaticamente sua identidade visual.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="subs" className="w-full">
        <TabsList className="bg-secondary/60 p-1 rounded-xl">
          <TabsTrigger value="subs"><Building2 className="w-4 h-4 mr-2" />Sub-empresas</TabsTrigger>
          <TabsTrigger value="domain"><Globe className="w-4 h-4 mr-2" />Domínio &amp; Marca</TabsTrigger>
          <TabsTrigger value="login"><LayoutDashboard className="w-4 h-4 mr-2" />Página de Login</TabsTrigger>
        </TabsList>
        <TabsContent value="subs" className="mt-6"><SubCompaniesSection /></TabsContent>
        <TabsContent value="domain" className="mt-6"><DomainBrandSection /></TabsContent>
        <TabsContent value="login" className="mt-6"><LoginPageSection /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
   SUB-EMPRESAS
============================================================ */
function SubCompaniesSection() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<SubCompany[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'plan' | 'details'>('plan');
  const [editing, setEditing] = useState<SubCompany | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [managing, setManaging] = useState<SubCompany | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('sub_companies').select('*').order('created_at', { ascending: false }),
      supabase.from('plan_packages').select('*').eq('active', true).order('sort_order'),
    ]);
    setSubs((s as any) || []);
    setPlans(((p as any) || []).map((x: any) => ({ ...x, features: Array.isArray(x.features) ? x.features : [] })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('sub_companies_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_companies' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const totalToday = subs.reduce((s, x) => s + Number(x.credits_used_today || 0), 0);
  const total30 = subs.reduce((s, x) => s + Number(x.credits_used_30d || 0), 0);

  const openNew = () => { setEditing(null); setSelectedPlan(null); setStep('plan'); setOpen(true); };
  const openEdit = (s: SubCompany) => {
    setEditing(s);
    setSelectedPlan(plans.find(p => p.slug === s.plan_slug) || null);
    setStep('details'); setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta sub-empresa?')) return;
    const { error } = await supabase.from('sub_companies').delete().eq('id', id);
    if (error) toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    else toast({ title: 'Sub-empresa excluída' });
  };

  const toggleStatus = async (s: SubCompany) => {
    const next = s.status === 'active' ? 'blocked' : 'active';
    const { error } = await supabase.from('sub_companies').update({ status: next }).eq('id', s.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
  };

  return (
    <div className="space-y-6">
      {/* Consumo */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">💰 Consumo de Créditos</h3>
            <p className="text-xs text-muted-foreground">Gerencie limites e acompanhe o uso de créditos das sub-empresas</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <p className="text-xs text-muted-foreground">📅 Consumo Hoje</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">{totalToday.toFixed(2).replace('.', ',')}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <p className="text-xs text-muted-foreground">📉 Consumo (30 dias)</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">{total30.toFixed(2).replace('.', ',')}</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left py-2">Empresa</th>
                <th className="text-left">Plano</th>
                <th className="text-right">Limite</th>
                <th className="text-right">Saldo</th>
                <th className="text-right">Hoje</th>
                <th className="text-right">30 Dias</th>
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && !loading && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma sub-empresa cadastrada</td></tr>
              )}
              {subs.map(s => {
                const plan = plans.find(p => p.slug === s.plan_slug);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> {s.name}</td>
                    <td>{plan?.name || s.plan_slug}</td>
                    <td className="text-right">{s.credit_limit}</td>
                    <td className="text-right">{Number(s.credit_balance).toFixed(0)}</td>
                    <td className="text-right text-orange-500">{Number(s.credits_used_today).toFixed(2)}</td>
                    <td className="text-right text-orange-500">{Number(s.credits_used_30d).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lista de sub-empresas */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Building2 className="w-4 h-4" /> Sub-empresas</h3>
            <p className="text-xs text-muted-foreground">Gerencie as empresas vinculadas à sua conta matriz</p>
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova Sub-empresa</Button>
        </div>

        <div className="space-y-2">
          {subs.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/40 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.admin_name} · {s.admin_email}</p>
                </div>
                <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">{plans.find(p => p.slug === s.plan_slug)?.name || s.plan_slug}</Badge>
                {s.status !== 'active' && <Badge variant="destructive">Bloqueada</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setManaging(s)} title="Acessos, chaves API e alertas"><LogIn className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(s)} title="Editar"><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => toggleStatus(s)} title="Bloquear/Ativar"><Ban className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SubCompanyDialog
        open={open} onOpenChange={setOpen}
        step={step} setStep={setStep}
        plans={plans} selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan}
        editing={editing}
        ownerId={user?.id || ''}
        onSaved={() => { setOpen(false); load(); }}
      />
      <SubCompanyManageDialog sub={managing as any} open={!!managing} onOpenChange={(o) => !o && setManaging(null)} />
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUB_ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Preencha todos os campos obrigatórios.',
  invalid_email: 'E-mail em formato inválido.',
  weak_password: 'A senha precisa ter pelo menos 6 caracteres.',
  email_already_used: 'Este e-mail já pertence a outro usuário.',
  provision_in_progress: 'Já existe uma criação em andamento para este e-mail. Aguarde alguns segundos.',
  forbidden: 'Você não tem permissão para provisionar esta sub-empresa.',
  sub_not_found: 'Sub-empresa não encontrada.',
  unauthenticated: 'Sessão expirada. Faça login novamente.',
};

function SubCompanyDialog({
  open, onOpenChange, step, setStep, plans, selectedPlan, setSelectedPlan, editing, ownerId, onSaved,
}: any) {
  const [form, setForm] = useState<Partial<SubCompany>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (editing) setForm(editing);
    else setForm({ name: '', admin_name: '', admin_email: '', admin_password: '', whatsapp_limit: 10, inherit_branding: true, byok_inherit: true, blocked_pages: [], allow_custom_logic: false } as any);
  }, [editing, open]);

  const togglePage = (id: string) => {
    const cur = form.blocked_pages || [];
    setForm({ ...form, blocked_pages: cur.includes(id) ? cur.filter(p => p !== id) : [...cur, id] });
  };

  const save = async () => {
    const name = (form.name || '').trim();
    const adminName = (form.admin_name || '').trim();
    const adminEmail = (form.admin_email || '').trim().toLowerCase();
    const adminPassword = String((form as any).admin_password || '');

    if (!name || !adminName || !adminEmail) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' }); return;
    }
    if (!EMAIL_RE.test(adminEmail)) {
      toast({ title: 'E-mail inválido', description: 'Informe um e-mail válido para o administrador.', variant: 'destructive' }); return;
    }
    if (!editing && adminPassword.length < 6) {
      toast({ title: 'Senha muito curta', description: 'Use ao menos 6 caracteres para a senha inicial.', variant: 'destructive' }); return;
    }
    if (!selectedPlan) { toast({ title: 'Selecione um plano', variant: 'destructive' }); return; }

    const payload = {
      owner_id: ownerId,
      name,
      admin_name: adminName,
      admin_email: adminEmail,
      whatsapp_limit: Number(form.whatsapp_limit) || 10,
      plan_slug: selectedPlan.slug,
      monthly_fee: selectedPlan.monthly_price,
      credit_limit: selectedPlan.credits_included,
      credit_balance: editing ? form.credit_balance : selectedPlan.credits_included,
      inherit_branding: !!form.inherit_branding,
      byok_inherit: !!form.byok_inherit,
      byok_api_key: form.byok_inherit ? null : (form.byok_api_key || null),
      blocked_pages: form.blocked_pages || [],
      allow_custom_logic: !!form.allow_custom_logic,
    };

    setSaving(true);
    try {
      const q = editing
        ? supabase.from('sub_companies').update(payload).eq('id', editing.id).select().single()
        : supabase.from('sub_companies').insert(payload as any).select().single();
      const { data: savedSub, error } = await q;
      if (error) { toast({ title: 'Erro ao salvar sub-empresa', description: error.message, variant: 'destructive' }); return; }

      if (savedSub && (!editing || adminPassword)) {
        const allowedPages = ALL_PERMISSION_KEYS.filter(k => !(payload.blocked_pages || []).includes(k));
        const { data: userData, error: userError } = await supabase.functions.invoke('create-sub-company-user', {
          body: {
            sub_company_id: savedSub.id,
            email: adminEmail,
            name: adminName,
            password: adminPassword,
            allowed_pages: allowedPages,
            is_account_admin: true,
          },
        });
        const code = (userData as any)?.code || (userError as any)?.context?.code;
        if (userError || (userData as any)?.error) {
          const rawMsg = (userData as any)?.message || (userData as any)?.error || userError?.message || 'Falha desconhecida';
          const friendly = SUB_ERROR_MESSAGES[code] || rawMsg;
          toast({ title: editing ? 'Erro ao atualizar acesso' : 'Sub-empresa criada, mas o usuário não foi criado', description: friendly, variant: 'destructive' });
          return;
        }
      }
      toast({ title: editing ? 'Sub-empresa atualizada' : 'Convite enviado!', description: editing ? '' : `Plano ${selectedPlan.name} aplicado.` });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {editing ? 'Editar Sub-empresa' : step === 'plan' ? 'Escolha o pacote ideal' : 'Nova Sub-empresa'}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {step === 'plan' && !editing
              ? 'Selecione o plano mensal para a nova sub-empresa. Os créditos do plano serão automaticamente atribuídos.'
              : 'Crie uma empresa vinculada que compartilhará os créditos da sua conta matriz'}
          </p>
        </DialogHeader>

        {step === 'plan' && !editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plans.map((p: Plan) => {
              const active = selectedPlan?.slug === p.slug;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlan(p)}
                  className={`text-left rounded-2xl border p-4 transition-all relative ${active ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-primary/40 bg-card/40'}`}
                >
                  {p.is_most_chosen && (
                    <span className="absolute -top-3 right-4 text-[10px] font-semibold uppercase bg-primary text-primary-foreground px-2 py-1 rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Mais escolhido</span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    {p.slug === 'start' && <Sparkles className="w-4 h-4 text-primary" />}
                    {p.slug === 'elite' && <Star className="w-4 h-4 text-primary" />}
                    {p.slug === 'platinum' && <Crown className="w-4 h-4 text-primary" />}
                    {p.slug === 'personalite' && <Wand2 className="w-4 h-4 text-primary" />}
                    <h4 className="text-base font-semibold">{p.name}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{p.tagline}</p>
                  <p className="text-2xl font-bold">
                    {p.is_custom ? 'Sob consulta' : `R$ ${Number(p.monthly_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    {!p.is_custom && <span className="text-xs font-normal text-muted-foreground">/mês</span>}
                  </p>
                  {!p.is_custom && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.credits_included.toLocaleString('pt-BR')} créditos {p.max_users ? `· até ${p.max_users} usuários` : ''}
                    </p>
                  )}
                  <ul className="mt-3 space-y-1">
                    {p.features.slice(0, 6).map((f, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2"><Check className="w-3 h-3 text-primary mt-0.5 shrink-0" /> {f}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-5">
            {selectedPlan && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Plano selecionado</p>
                  <p className="text-sm font-semibold">{selectedPlan.name} · {selectedPlan.is_custom ? 'Sob consulta' : `R$ ${Number(selectedPlan.monthly_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`}</p>
                </div>
                {!editing && <Button variant="ghost" size="sm" onClick={() => setStep('plan')}>Alterar</Button>}
              </div>
            )}

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Dados da Empresa</h4>
              <div className="space-y-3">
                <div>
                  <Label>Nome da Empresa *</Label>
                  <Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome da sub-empresa" />
                </div>
                <div>
                  <Label>Limite de conexões WhatsApp</Label>
                  <Input type="number" value={form.whatsapp_limit ?? 10} onChange={e => setForm({ ...form, whatsapp_limit: Number(e.target.value) })} />
                  <p className="text-[11px] text-muted-foreground mt-1">Quantidade máxima de instâncias WhatsApp que a sub-empresa poderá conectar</p>
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Administrador</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={form.admin_name || ''} onChange={e => setForm({ ...form, admin_name: e.target.value })} placeholder="Nome do administrador" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={form.admin_email || ''} onChange={e => setForm({ ...form, admin_email: e.target.value })} placeholder="email@exemplo.com" />
                </div>
                {(!editing || true) && (
                  <div className="md:col-span-2">
                    <Label>{editing ? 'Nova senha de acesso' : 'Senha inicial *'}</Label>
                    <Input type="password" value={(form as any).admin_password || ''} onChange={e => setForm({ ...form, admin_password: e.target.value } as any)} placeholder="Defina a senha de acesso" />
                    <p className="text-[11px] text-muted-foreground mt-1">{editing ? 'Preencha para criar ou atualizar o acesso deste administrador.' : 'Esta senha será usada no primeiro acesso da sub-empresa.'}</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Identidade Visual</h4>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${form.inherit_branding ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" checked={!!form.inherit_branding} onChange={() => setForm({ ...form, inherit_branding: true })} />
                  <div><p className="text-sm font-medium">Herdar da empresa matriz</p><p className="text-xs text-muted-foreground">Usa automaticamente logo e cores da empresa principal</p></div>
                </label>
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${!form.inherit_branding ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" checked={!form.inherit_branding} onChange={() => setForm({ ...form, inherit_branding: false })} />
                  <div><p className="text-sm font-medium">Personalizar</p><p className="text-xs text-muted-foreground">Definir logo e cores próprias para esta sub-empresa</p></div>
                </label>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">🔑 Configuração BYOK (OpenAI)</h4>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${form.byok_inherit ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" checked={!!form.byok_inherit} onChange={() => setForm({ ...form, byok_inherit: true })} />
                  <div><p className="text-sm font-medium">Herdar API key da matriz (padrão)</p><p className="text-xs text-muted-foreground">A sub-empresa usará a mesma chave configurada na empresa principal</p></div>
                </label>
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${!form.byok_inherit ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" checked={!form.byok_inherit} onChange={() => setForm({ ...form, byok_inherit: false })} />
                  <div className="flex-1"><p className="text-sm font-medium">Usar API key própria (override)</p><p className="text-xs text-muted-foreground">Configurar uma chave OpenAI específica para esta sub-empresa</p>
                    {!form.byok_inherit && (
                      <Input className="mt-2" placeholder="sk-..." value={form.byok_api_key || ''} onChange={e => setForm({ ...form, byok_api_key: e.target.value })} />
                    )}
                  </div>
                </label>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">🛠️ Customização Avançada</h4>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${form.allow_custom_logic ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <Switch checked={!!form.allow_custom_logic} onCheckedChange={v => setForm({ ...form, allow_custom_logic: v })} />
                  <div>
                    <p className="text-sm font-medium">Liberdade de customização</p>
                    <p className="text-xs text-muted-foreground">Permite que a sub-empresa adicione personalizações à parte do código matriz, dando liberdade de desenvolvimento.</p>
                  </div>
                </label>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Páginas bloqueadas</h4>
              <p className="text-xs text-muted-foreground mb-3">Selecione as páginas que a sub-empresa NÃO poderá acessar</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {BLOCKABLE_PAGES.map(p => {
                  const checked = (form.blocked_pages || []).includes(p.key);
                  return (
                    <label key={p.key} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${checked ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <input type="checkbox" checked={checked} onChange={() => togglePage(p.key)} className="mt-1" />
                      <div><p className="text-sm font-medium">{p.label}</p><p className="text-xs text-muted-foreground">{p.desc}</p></div>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {step === 'plan' && !editing ? (
            <Button onClick={() => setStep('details')} disabled={!selectedPlan}>Continuar</Button>
          ) : (
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : (editing ? 'Salvar' : 'Enviar Convite')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   DOMAIN & BRAND
============================================================ */
function useWLSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<WLSettings>({
    company_name: '', logo_light_url: null, logo_dark_url: null, logo_icon_url: null,
    primary_color: '', custom_domain: '', domain_active: false,
    login_panel_style: 'gradient', login_headline: '', login_subtext: '', login_image_url: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('white_label_settings').select('*').eq('owner_id', user.id).maybeSingle();
      if (data) setSettings(data as any);
      setLoading(false);
    })();
  }, [user]);

  const save = async (patch: Partial<WLSettings>) => {
    if (!user) return;
    const merged = { ...settings, ...patch, owner_id: user.id };
    const { data, error } = await supabase.from('white_label_settings').upsert(merged as any, { onConflict: 'owner_id' }).select().single();
    if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return; }
    setSettings(data as any);
    toast({ title: 'Configurações salvas' });
  };

  return { settings, setSettings, save, loading };
}

function DomainBrandSection() {
  const { user } = useAuth();
  const { settings, setSettings, save } = useWLSettings();
  const [copied, setCopied] = useState(false);

  const uploadLogo = async (field: 'logo_light_url' | 'logo_dark_url' | 'logo_icon_url', file: File) => {
    if (!user) return;
    const path = `${user.id}/${field}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
    if (error) { toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' }); return; }
    const { data } = supabase.storage.from('company-logos').getPublicUrl(path);
    setSettings({ ...settings, [field]: data.publicUrl });
    await save({ [field]: data.publicUrl } as any);
  };

  const LogoCard = ({ field, title, where, hint }: any) => (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="aspect-[2/1] rounded-xl bg-secondary/60 flex items-center justify-center mb-3 overflow-hidden">
        {settings[field as keyof WLSettings] ? (
          <img src={settings[field as keyof WLSettings] as string} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Building2 className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1"><span className="font-medium text-foreground">Onde aparece:</span> {where}</p>
      <p className="text-xs text-muted-foreground mt-1"><span className="font-medium text-foreground">Dica:</span> {hint}</p>
      <label className="mt-3 inline-flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-background hover:bg-accent text-sm py-2 cursor-pointer">
        <Upload className="w-4 h-4" />{settings[field as keyof WLSettings] ? 'Trocar' : 'Enviar'}
        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadLogo(field, e.target.files[0])} />
      </label>
      {settings[field as keyof WLSettings] && (
        <button onClick={async () => { setSettings({ ...settings, [field]: null }); await save({ [field]: null } as any); }} className="mt-2 text-xs text-destructive w-full text-center">Remover</button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 space-y-5">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Globe className="w-4 h-4" /> Domínio Personalizado e Marca</h3>
          <p className="text-xs text-muted-foreground">Conecte seu próprio domínio (ex: app.suaempresa.com), configure logo, nome e cor primária.</p>
        </div>

        <div>
          <Label>Nome da Empresa</Label>
          <Input value={settings.company_name || ''} onChange={e => setSettings({ ...settings, company_name: e.target.value })} onBlur={() => save({ company_name: settings.company_name })} />
        </div>

        <div>
          <Label>Logos da sua marca</Label>
          <p className="text-xs text-muted-foreground mb-3">Envie até 3 variações para que sua marca apareça perfeita em todo o sistema, em modo claro, modo escuro e em ícones quadrados.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LogoCard field="logo_light_url" title="Logo horizontal — claro" where="Tela de login (modo claro), tela inicial das conversas e e-mails." hint="Use PNG/SVG com texto escuro e fundo transparente." />
            <LogoCard field="logo_dark_url" title="Logo horizontal — escuro" where="Tela de login (modo escuro) e tela inicial das conversas no escuro." hint="Mesma logo, mas com texto claro/branco e fundo transparente." />
            <LogoCard field="logo_icon_url" title="Ícone quadrado" where="Menu lateral (40×40), favicon do navegador e notificações push." hint="Só o símbolo, sem texto, em formato quadrado. PNG transparente." />
          </div>
        </div>

        <div>
          <Label className="flex items-center gap-2">🎨 Cor Primária</Label>
          <div className="flex items-center gap-3 mt-2">
            <input type="color" value={settings.primary_color || '#00033e'} onChange={e => setSettings({ ...settings, primary_color: e.target.value })} onBlur={() => save({ primary_color: settings.primary_color })} className="w-12 h-10 rounded-lg border border-border cursor-pointer" />
            <Input value={settings.primary_color || ''} placeholder="#00033e" onChange={e => setSettings({ ...settings, primary_color: e.target.value })} onBlur={() => save({ primary_color: settings.primary_color })} className="max-w-[200px] font-mono" />
            <Button variant="ghost" size="sm" onClick={async () => { setSettings({ ...settings, primary_color: '' }); await save({ primary_color: null }); }}>Resetar</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Deixe vazio para usar a cor padrão do sistema</p>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold flex items-center gap-2"><Globe className="w-4 h-4" /> Domínio Personalizado</h4>
            <DomainStatusBadge status={(settings.domain_status as any) || 'pending'} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input className="max-w-md" placeholder="crm.suaempresa.com.br" value={settings.custom_domain || ''} onChange={e => setSettings({ ...settings, custom_domain: e.target.value })} onBlur={() => save({ custom_domain: settings.custom_domain, domain_status: 'pending' })} />
            <div className="flex items-center gap-2">
              <Label className="text-xs">Ativo</Label>
              <Switch checked={settings.domain_active} onCheckedChange={v => { setSettings({ ...settings, domain_active: v }); save({ domain_active: v }); }} />
            </div>
            {settings.custom_domain && (
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(settings.custom_domain!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check className="w-3.5 h-3.5 mr-2" /> : <Copy className="w-3.5 h-3.5 mr-2" />}Copiar
              </Button>
            )}
          </div>

          {settings.custom_domain && (
            <DomainVerificationPanel settings={settings} setSettings={setSettings} save={save} />
          )}
        </div>
      </div>
    </div>
  );
}

function DomainStatusBadge({ status }: { status: 'pending' | 'active' | 'invalid' }) {
  if (status === 'active') return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">✓ Ativo</Badge>;
  if (status === 'invalid') return <Badge variant="destructive">Inválido</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

function DomainVerificationPanel({ settings, setSettings, save }: {
  settings: WLSettings;
  setSettings: (s: WLSettings) => void;
  save: (patch: Partial<WLSettings>) => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);
  const token = settings.domain_verification_token || 'lovable_verify_' + (settings.id || '').slice(0, 8);
  const cnameTarget = (import.meta.env.VITE_SUPABASE_URL || 'app.lovable.dev').replace(/^https?:\/\//, '');
  const status = (settings.domain_status as any) || 'pending';

  const verify = async () => {
    setChecking(true);
    // Ensure verification token is persisted
    if (!settings.domain_verification_token) {
      await save({ domain_verification_token: token });
    }
    try {
      // Attempt a DNS-over-HTTPS lookup (Google) for the CNAME record
      const host = settings.custom_domain!.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const cnameRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=CNAME`).then(r => r.json()).catch(() => null);
      const txtRes = await fetch(`https://dns.google/resolve?name=_lovable.${encodeURIComponent(host)}&type=TXT`).then(r => r.json()).catch(() => null);

      const cnameOk = cnameRes?.Answer?.some((a: any) => a.data?.includes(cnameTarget.split('.').slice(-2).join('.')));
      const txtOk = txtRes?.Answer?.some((a: any) => (a.data || '').includes(token));

      let newStatus: 'pending' | 'active' | 'invalid' = 'pending';
      let msg = '';
      if (cnameOk && txtOk) { newStatus = 'active'; msg = 'CNAME e TXT verificados com sucesso.'; }
      else if (cnameRes?.Answer || txtRes?.Answer) { newStatus = 'invalid'; msg = `Registros encontrados mas não correspondem. CNAME: ${cnameOk ? 'ok' : 'falta'} · TXT: ${txtOk ? 'ok' : 'falta'}.`; }
      else { newStatus = 'pending'; msg = 'Aguardando propagação DNS. Pode levar até 72h.'; }

      const patch: Partial<WLSettings> = {
        domain_status: newStatus,
        domain_check_message: msg,
        domain_last_checked_at: new Date().toISOString(),
        domain_verification_token: token,
      };
      setSettings({ ...settings, ...patch } as WLSettings);
      await save(patch);
      toast({ title: newStatus === 'active' ? 'Domínio verificado' : 'Verificação concluída', description: msg });
    } catch (e: any) {
      toast({ title: 'Erro ao verificar', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Verificação DNS</p>
        <Button size="sm" variant="outline" onClick={verify} disabled={checking}>
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${checking ? 'animate-spin' : ''}`} />{checking ? 'Verificando...' : 'Verificar agora'}
        </Button>
      </div>

      {status === 'invalid' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5" />
          <span>{settings.domain_check_message || 'Os registros DNS não correspondem ao esperado.'}</span>
        </div>
      )}
      {status === 'active' && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">✅ Domínio ativo e funcionando.</div>
      )}
      {status === 'pending' && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-2 text-xs">⏳ Aguardando propagação. Adicione os registros abaixo no seu provedor de DNS.</div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase">1. Registro CNAME</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><span className="text-muted-foreground">Tipo</span><div className="font-mono mt-1">CNAME</div></div>
          <div><span className="text-muted-foreground">Nome</span><div className="font-mono mt-1 truncate">{settings.custom_domain || '@'}</div></div>
          <div><span className="text-muted-foreground">Valor</span><div className="font-mono mt-1 truncate flex items-center gap-1">{cnameTarget}<button onClick={() => navigator.clipboard.writeText(cnameTarget)} className="text-primary"><Copy className="w-3 h-3" /></button></div></div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase mt-3">2. Registro TXT (verificação)</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><span className="text-muted-foreground">Tipo</span><div className="font-mono mt-1">TXT</div></div>
          <div><span className="text-muted-foreground">Nome</span><div className="font-mono mt-1">_lovable</div></div>
          <div><span className="text-muted-foreground">Valor</span><div className="font-mono mt-1 truncate flex items-center gap-1">{token}<button onClick={() => navigator.clipboard.writeText(token)} className="text-primary"><Copy className="w-3 h-3" /></button></div></div>
        </div>
      </div>

      <div className="rounded-lg bg-card/40 p-2 text-[11px] text-muted-foreground space-y-1">
        <p>📋 <strong>Como configurar:</strong></p>
        <p>1. Acesse o painel de DNS do seu provedor (Cloudflare, Registro.br, GoDaddy, etc.).</p>
        <p>2. Adicione os dois registros acima exatamente como mostrados.</p>
        <p>3. Salve e aguarde a propagação (normalmente 5–60 min, podendo chegar a 72h).</p>
        <p>4. Volte aqui e clique em <strong>Verificar agora</strong>.</p>
        {settings.domain_last_checked_at && <p className="mt-1 italic">Última verificação: {new Date(settings.domain_last_checked_at).toLocaleString('pt-BR')}</p>}
      </div>
    </div>
  );
}

/* ============================================================
   LOGIN PAGE
============================================================ */
function LoginPageSection() {
  const { user } = useAuth();
  const { settings, setSettings, save } = useWLSettings();
  const [copied, setCopied] = useState(false);
  const loginUrl = user ? `${window.location.origin}/s/${user.id}/login` : '';

  const styles = [
    { value: 'gradient', label: 'Gradiente (padrão)', desc: 'Apenas a cor primária com sua frase. Visual limpo.' },
    { value: 'image', label: 'Imagem', desc: 'Imagem de fundo no painel lateral.' },
    { value: 'split', label: 'Dividido', desc: 'Layout dividido com destaque editorial.' },
  ];

  return (
    <div className="glass-card p-5 space-y-5">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2"><LayoutDashboard className="w-4 h-4" /> Página de Login</h3>
        <p className="text-xs text-muted-foreground">Personalize o painel lateral da página de login: imagem, gradiente, frase de destaque ou layout dividido.</p>
      </div>

      <div>
        <Label className="flex items-center gap-2">🔗 Link de Login Personalizado</Label>
        <div className="flex items-center gap-2 mt-2">
          <Input readOnly value={loginUrl} className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(loginUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Compartilhe este link para que seus usuários acessem por uma página de login com sua marca.</p>
      </div>

      <div>
        <Label>Estilo do painel</Label>
        <Select value={settings.login_panel_style} onValueChange={v => { setSettings({ ...settings, login_panel_style: v }); save({ login_panel_style: v }); }}>
          <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
          <SelectContent>
            {styles.map(s => (
              <SelectItem key={s.value} value={s.value}>
                <div><p className="text-sm">{s.label}</p><p className="text-xs text-muted-foreground">{s.desc}</p></div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="flex items-center gap-2">✨ Frase de destaque</Label>
        <Input maxLength={60} value={settings.login_headline || ''} onChange={e => setSettings({ ...settings, login_headline: e.target.value })} onBlur={() => save({ login_headline: settings.login_headline })} placeholder="Ex: Atendimento que escala com você" className="mt-2" />
        <p className="text-[11px] text-muted-foreground text-right mt-1">{(settings.login_headline || '').length}/60</p>
      </div>

      <div>
        <Label>Subtexto</Label>
        <Textarea maxLength={200} value={settings.login_subtext || ''} onChange={e => setSettings({ ...settings, login_subtext: e.target.value })} onBlur={() => save({ login_subtext: settings.login_subtext })} placeholder="Ex: Centralize conversas, automatize respostas e venda mais." className="mt-2" />
        <p className="text-[11px] text-muted-foreground text-right mt-1">{(settings.login_subtext || '').length}/200</p>
      </div>

      <div>
        <Label>Pré-visualização</Label>
        <div
          className="mt-2 h-48 rounded-2xl flex items-center justify-center text-primary-foreground p-6"
          style={{
            background: settings.login_panel_style === 'gradient'
              ? `linear-gradient(135deg, ${settings.primary_color || 'hsl(var(--primary))'}, #1a1a3e)`
              : 'hsl(var(--secondary))',
          }}
        >
          <div className="text-center">
            <h3 className="text-2xl font-bold">{settings.login_headline || 'Sua frase em destaque'}</h3>
            <p className="text-sm opacity-80 mt-2">{settings.login_subtext || 'Sua mensagem secundária aparece aqui.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
