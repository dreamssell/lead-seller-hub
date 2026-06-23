import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { LogIn, KeyRound, Bell, Settings2, Copy, Check, RefreshCw, Trash2, Plus, AlertTriangle, Clock, Building2, Power, UserPlus } from 'lucide-react';
import { ALL_PERMISSION_KEYS } from '@/lib/navigation';

type SubCompany = {
  id: string; owner_id: string; name: string; admin_name: string; admin_email: string;
  blocked_pages?: string[];
  credit_limit: number; credit_balance: number; credit_alert_threshold: number;
  auto_action: 'alert' | 'request_recharge' | 'block'; status: string;
  allow_custom_logic: boolean;
  feature_landing_builder?: boolean;
};

type LoginToken = {
  id: string; token: string; expires_at: string; revoked: boolean;
  created_at: string; last_used_at: string | null; label: string | null;
};

type ApiKey = {
  id: string; name: string; key: string; scopes: string[];
  is_active: boolean; last_used_at: string | null; created_at: string;
};

type Alert = {
  id: string; type: string; message: string; percent: number | null;
  action_taken: string | null; is_read: boolean; created_at: string;
};

const SCOPES = [
  { id: 'auth:verify', label: 'Verificar e-mail' },
  { id: 'auth:login', label: 'Login externo' },
  { id: 'leads:read', label: 'Ler leads' },
  { id: 'leads:write', label: 'Escrever leads' },
  { id: 'messages:send', label: 'Enviar mensagens' },
];

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
      navigator.clipboard.writeText(value);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
      toast({ title: 'Copiado' });
    }}>
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

export function SubCompanyManageDialog({
  sub, open, onOpenChange,
}: { sub: SubCompany | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!sub) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> {sub.name}</SheetTitle>
          <SheetDescription>Gerencie acessos, chaves API, alertas e regras de consumo desta sub-empresa.</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="login" className="mt-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="login"><LogIn className="w-3.5 h-3.5 mr-1" />Acesso</TabsTrigger>
            <TabsTrigger value="api"><KeyRound className="w-3.5 h-3.5 mr-1" />Chaves API</TabsTrigger>
            <TabsTrigger value="alerts"><Bell className="w-3.5 h-3.5 mr-1" />Alertas</TabsTrigger>
            <TabsTrigger value="rules"><Settings2 className="w-3.5 h-3.5 mr-1" />Regras</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="mt-4"><LoginTokensTab sub={sub} /></TabsContent>
          <TabsContent value="api" className="mt-4"><ApiKeysTab sub={sub} /></TabsContent>
          <TabsContent value="alerts" className="mt-4"><AlertsTab sub={sub} /></TabsContent>
          <TabsContent value="rules" className="mt-4"><RulesTab sub={sub} /></TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ============ PROVISION ADMIN USER ============ */
function ProvisionAdminUser({ sub }: { sub: SubCompany }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'unknown' | 'exists' | 'missing'>('unknown');

  const check = useCallback(async () => {
    const { data } = await supabase
      .from('user_account_access')
      .select('user_id')
      .eq('sub_company_id', sub.id)
      .limit(1)
      .maybeSingle();
    setStatus(data ? 'exists' : 'missing');
  }, [sub.id]);

  useEffect(() => { check(); }, [check]);

  const provision = async () => {
    if (password.length < 6) {
      toast({ title: 'Senha muito curta', description: 'Use ao menos 6 caracteres.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const allowedPages = ALL_PERMISSION_KEYS.filter(k => !(sub.blocked_pages || []).includes(k));
    const { error } = await supabase.functions.invoke('create-sub-company-user', {
      body: {
        sub_company_id: sub.id,
        email: sub.admin_email,
        name: sub.admin_name,
        password,
        allowed_pages: allowedPages,
        is_account_admin: true,
      },
    });
    setLoading(false);
    if (error) { toast({ title: 'Erro ao provisionar usuário', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Usuário provisionado', description: `${sub.admin_email} já pode fazer login.` });
    setPassword('');
    check();
  };

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${status === 'missing' ? 'border-orange-500/40 bg-orange-500/5' : 'border-border bg-card/40'}`}>
      <div className="flex items-start gap-2">
        <UserPlus className={`w-4 h-4 mt-0.5 ${status === 'missing' ? 'text-orange-500' : 'text-primary'}`} />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {status === 'missing' ? 'Administrador ainda sem acesso' : 'Provisionar / redefinir senha do administrador'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {sub.admin_email} — defina uma senha para que o login externo encontre este usuário.
          </p>
        </div>
        {status === 'exists' && <Badge variant="default" className="text-[10px]">Ativo</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          placeholder="Senha inicial (mín. 6 caracteres)"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <Button onClick={provision} disabled={loading || !password}>
          {loading ? 'Salvando...' : status === 'missing' ? 'Criar acesso' : 'Atualizar senha'}
        </Button>
      </div>
    </div>
  );
}

/* ============ LOGIN TOKENS ============ */
function LoginTokensTab({ sub }: { sub: SubCompany }) {
  const [tokens, setTokens] = useState<LoginToken[]>([]);
  const [hours, setHours] = useState(24);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('sub_company_login_tokens')
      .select('*').eq('sub_company_id', sub.id).order('created_at', { ascending: false });
    setTokens((data as any) || []);
  }, [sub.id]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('generate_sub_login_token', {
      p_sub_company_id: sub.id, p_hours: hours, p_label: label || null,
    });
    setLoading(false);
    if (error) { toast({ title: 'Erro ao gerar link', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Link de login gerado', description: `Expira em ${hours}h.` });
    setLabel('');
    load();
    const url = `${window.location.origin}/s/${sub.id}/login?t=${data.token}`;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from('sub_company_login_tokens').update({ revoked: true }).eq('id', id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Link revogado' }); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm('Remover este link permanentemente?')) return;
    await supabase.from('sub_company_login_tokens').delete().eq('id', id);
    load();
  };

  const buildUrl = (t: LoginToken) => `${window.location.origin}/s/${sub.id}/login?t=${t.token}`;

  return (
    <div className="space-y-4">
      <ProvisionAdminUser sub={sub} />

      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><LogIn className="w-4 h-4" /> Gerar novo link de acesso</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rótulo (opcional)</Label>
            <Input placeholder="Ex: João — onboarding" value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Expira em</Label>
            <Select value={String(hours)} onValueChange={v => setHours(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hora</SelectItem>
                <SelectItem value="24">24 horas</SelectItem>
                <SelectItem value="72">3 dias</SelectItem>
                <SelectItem value="168">7 dias</SelectItem>
                <SelectItem value="720">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={generate} disabled={loading} className="w-full">
          <Plus className="w-4 h-4 mr-2" />{loading ? 'Gerando...' : 'Gerar link e copiar'}
        </Button>
      </div>

      <div className="space-y-2">
        {tokens.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum link gerado ainda.</p>}
        {tokens.map(t => {
          const expired = new Date(t.expires_at) < new Date();
          const status = t.revoked ? 'revoked' : expired ? 'expired' : 'active';
          const url = buildUrl(t);
          return (
            <div key={t.id} className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.label || 'Link de acesso'}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <Clock className="w-3 h-3" /> {expired ? 'Expirado em' : 'Expira em'} {new Date(t.expires_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Badge variant={status === 'active' ? 'default' : status === 'revoked' ? 'destructive' : 'secondary'}>
                  {status === 'active' ? 'Ativo' : status === 'revoked' ? 'Revogado' : 'Expirado'}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Input readOnly value={url} className="font-mono text-[11px] h-8" />
                <CopyBtn value={url} />
                {!t.revoked && status === 'active' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Revogar" onClick={() => revoke(t.id)}>
                    <Power className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir" onClick={() => remove(t.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ API KEYS ============ */
function ApiKeysTab({ sub }: { sub: SubCompany }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['auth:verify', 'auth:login']);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('sub_company_api_keys')
      .select('*').eq('sub_company_id', sub.id).order('created_at', { ascending: false });
    setKeys((data as any) || []);
  }, [sub.id]);
  useEffect(() => { load(); }, [load]);

  const genKey = () => 'sk_' + crypto.getRandomValues(new Uint8Array(24)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');

  const create = async () => {
    if (!name.trim()) { toast({ title: 'Informe um nome', variant: 'destructive' }); return; }
    const newKey = genKey();
    const { error } = await supabase.from('sub_company_api_keys').insert({
      sub_company_id: sub.id, owner_id: sub.owner_id, name, key: newKey, scopes,
    } as any);
    if (error) { toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Chave criada e copiada', description: 'Guarde-a em local seguro.' });
    navigator.clipboard.writeText(newKey).catch(() => {});
    setName(''); load();
  };

  const rotate = async (k: ApiKey) => {
    if (!confirm(`Rotacionar a chave "${k.name}"? A chave atual deixará de funcionar.`)) return;
    const newKey = genKey();
    const { error } = await supabase.from('sub_company_api_keys').update({ key: newKey }).eq('id', k.id);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Chave rotacionada e copiada' });
    navigator.clipboard.writeText(newKey).catch(() => {});
    load();
  };

  const toggleActive = async (k: ApiKey) => {
    await supabase.from('sub_company_api_keys').update({ is_active: !k.is_active }).eq('id', k.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir esta chave?')) return;
    await supabase.from('sub_company_api_keys').delete().eq('id', id);
    load();
  };

  const toggleScope = (s: string) => setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const mask = (key: string) => key.slice(0, 6) + '••••••••••••' + key.slice(-4);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><KeyRound className="w-4 h-4" /> Nova chave API</p>
        <Input placeholder="Nome (ex: Integração login externo)" value={name} onChange={e => setName(e.target.value)} />
        <div>
          <Label className="text-xs mb-2 block">Escopos</Label>
          <div className="grid grid-cols-2 gap-2">
            {SCOPES.map(s => (
              <label key={s.id} className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer text-xs ${scopes.includes(s.id) ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggleScope(s.id)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <Button onClick={create} className="w-full"><Plus className="w-4 h-4 mr-2" />Gerar chave</Button>
      </div>

      <div className="space-y-2">
        {keys.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma chave criada.</p>}
        {keys.map(k => (
          <div key={k.id} className="rounded-xl border border-border bg-card/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{k.name}</p>
                <p className="text-[11px] text-muted-foreground">Criada em {new Date(k.created_at).toLocaleDateString('pt-BR')}{k.last_used_at && ` · usada ${new Date(k.last_used_at).toLocaleDateString('pt-BR')}`}</p>
              </div>
              <Badge variant={k.is_active ? 'default' : 'secondary'}>{k.is_active ? 'Ativa' : 'Inativa'}</Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {k.scopes.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
            </div>
            <div className="flex items-center gap-1">
              <Input readOnly value={reveal[k.id] ? k.key : mask(k.key)} className="font-mono text-[11px] h-8" />
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setReveal(r => ({ ...r, [k.id]: !r[k.id] }))}>
                {reveal[k.id] ? 'Ocultar' : 'Ver'}
              </Button>
              <CopyBtn value={k.key} />
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Rotacionar" onClick={() => rotate(k)}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title={k.is_active ? 'Desativar' : 'Ativar'} onClick={() => toggleActive(k)}>
                <Power className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir" onClick={() => remove(k.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ ALERTS ============ */
function AlertsTab({ sub }: { sub: SubCompany }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from('sub_company_alerts')
      .select('*').eq('sub_company_id', sub.id).order('created_at', { ascending: false }).limit(50);
    setAlerts((data as any) || []);
  }, [sub.id]);
  useEffect(() => {
    load();
    const ch = supabase.channel(`alerts_${sub.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_company_alerts', filter: `sub_company_id=eq.${sub.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sub.id, load]);

  const markRead = async (id: string) => {
    await supabase.from('sub_company_alerts').update({ is_read: true }).eq('id', id); load();
  };

  const usagePct = sub.credit_limit > 0
    ? Math.min(100, Math.round(((sub.credit_limit - sub.credit_balance) / sub.credit_limit) * 100))
    : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Consumo atual</p>
          <Badge variant={usagePct >= sub.credit_alert_threshold ? 'destructive' : 'secondary'}>{usagePct}%</Badge>
        </div>
        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full ${usagePct >= sub.credit_alert_threshold ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${usagePct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Limite definido: {sub.credit_alert_threshold}% · Ação: {sub.auto_action}</p>
      </div>

      <div className="space-y-2">
        {alerts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum alerta registrado.</p>}
        {alerts.map(a => (
          <div key={a.id} className={`rounded-xl border p-3 ${a.is_read ? 'border-border bg-card/40' : 'border-orange-500/40 bg-orange-500/5'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${a.is_read ? 'text-muted-foreground' : 'text-orange-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{a.message}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(a.created_at).toLocaleString('pt-BR')}
                  {a.action_taken && <> · ação: <Badge variant="outline" className="text-[10px]">{a.action_taken}</Badge></>}
                </p>
              </div>
              {!a.is_read && <Button variant="ghost" size="sm" onClick={() => markRead(a.id)}>Marcar lido</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ RULES ============ */
function RulesTab({ sub }: { sub: SubCompany }) {
  const [threshold, setThreshold] = useState(sub.credit_alert_threshold);
  const [action, setAction] = useState(sub.auto_action);
  const [allowCustom, setAllowCustom] = useState(sub.allow_custom_logic);
  const [landingBuilder, setLandingBuilder] = useState(!!sub.feature_landing_builder);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('sub_companies')
      .update({
        credit_alert_threshold: threshold,
        auto_action: action,
        allow_custom_logic: allowCustom,
        feature_landing_builder: landingBuilder,
      } as any).eq('id', sub.id);
    setSaving(false);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else toast({ title: 'Regras salvas' });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
        <div>
          <Label className="flex items-center justify-between">
            <span>Disparar alerta ao atingir</span>
            <span className="text-primary font-semibold">{threshold}%</span>
          </Label>
          <input
            type="range" min={50} max={100} step={5} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-full accent-primary mt-2"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>
        <Separator />
        <div>
          <Label className="mb-2 block">Ação automática</Label>
          <div className="space-y-2">
            {[
              { value: 'alert', label: 'Apenas avisar', desc: 'Cria um alerta interno para o administrador.' },
              { value: 'request_recharge', label: 'Solicitar recarga', desc: 'Notifica e abre fluxo de recarga de créditos.' },
              { value: 'block', label: 'Bloquear ao zerar', desc: 'Bloqueia automaticamente a sub-empresa quando o saldo zerar.' },
            ].map(o => (
              <label key={o.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${action === o.value ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" checked={action === o.value} onChange={() => setAction(o.value as any)} className="mt-0.5" />
                <div><p className="text-sm font-medium">{o.label}</p><p className="text-xs text-muted-foreground">{o.desc}</p></div>
              </label>
            ))}
          </div>
        </div>
        <Separator />
        <div className="flex items-start gap-3 rounded-lg border p-3 bg-secondary/20">
          <Switch checked={allowCustom} onCheckedChange={setAllowCustom} />
          <div>
            <p className="text-sm font-medium">Liberdade de customização</p>
            <p className="text-xs text-muted-foreground">Permite que esta sub-empresa adicione personalizações à parte do código matriz.</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Salvando...' : 'Salvar regras'}</Button>
      </div>
    </div>
  );
}
