import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Bell, Shield, Globe, Webhook, Building2, Loader2, Save, Upload, Lock, Smartphone, UserCircle, Camera, Mail, Phone } from 'lucide-react';
import { useThemeContext } from '@/contexts/ThemeContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface CompanySettings {
  id?: string;
  name: string;
  logo_url: string | null;
  email: string;
  phone: string;
  website: string;
  document: string;
  address: string;
  timezone: string;
}

const emptyCompany: CompanySettings = {
  name: '',
  logo_url: null,
  email: '',
  phone: '',
  website: '',
  document: '',
  address: '',
  timezone: 'America/Sao_Paulo',
};

export default function SettingsPage() {
  const { theme, toggleTheme } = useThemeContext();
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanySettings>(emptyCompany);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Notifications prefs (local)
  const [notif, setNotif] = useState(() => {
    const saved = localStorage.getItem('notif_prefs');
    return saved ? JSON.parse(saved) : { email: true, push: true, sound: true, desktop: false };
  });

  // Webhooks (local)
  const [webhooks, setWebhooks] = useState(() => {
    const saved = localStorage.getItem('webhooks');
    return saved ? JSON.parse(saved) : { onMessage: '', onCall: '', onTicket: '' };
  });

  // Security
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [changingPwd, setChangingPwd] = useState(false);

  // Profile
  const [profile, setProfile] = useState({ display_name: '', phone: '', role_label: 'Atendente', avatar_url: null as string | null });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('company_settings')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) setCompany(data as CompanySettings);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, phone, role_label, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setProfile({
        display_name: data.display_name ?? '',
        phone: data.phone ?? '',
        role_label: data.role_label ?? 'Atendente',
        avatar_url: data.avatar_url ?? null,
      });
    })();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from('profiles').update({
      display_name: profile.display_name,
      phone: profile.phone,
      role_label: profile.role_label,
    }).eq('user_id', user.id);
    setSavingProfile(false);
    if (error) toast({ title: 'Erro ao salvar perfil', description: error.message, variant: 'destructive' });
    else toast({ title: 'Perfil atualizado' });
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) {
      setUploadingAvatar(false);
      toast({ title: 'Erro no upload', description: upErr.message, variant: 'destructive' });
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = pub.publicUrl;
    await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
    setProfile((p) => ({ ...p, avatar_url: url }));
    setUploadingAvatar(false);
    toast({ title: 'Foto atualizada' });
  };

  const saveCompany = async () => {
    setSaving(true);
    const payload = { ...company };
    let res;
    if (company.id) {
      res = await supabase.from('company_settings').update(payload).eq('id', company.id);
    } else {
      const { id, ...insertPayload } = payload;
      res = await supabase.from('company_settings').insert(insertPayload).select().single();
      if (res.data) setCompany(res.data as CompanySettings);
    }
    setSaving(false);
    if (res.error) {
      toast({ title: 'Erro ao salvar', description: res.error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configurações salvas', description: 'Dados da empresa atualizados.' });
    }
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `company/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
    if (upErr) {
      setUploadingLogo(false);
      toast({ title: 'Erro no upload', description: upErr.message, variant: 'destructive' });
      return;
    }
    const { data: pub } = supabase.storage.from('company-logos').getPublicUrl(path);
    setCompany((c) => ({ ...c, logo_url: pub.publicUrl }));
    setUploadingLogo(false);
    toast({ title: 'Logo enviado', description: 'Clique em Salvar para confirmar.' });
  };

  const saveNotif = (next: typeof notif) => {
    setNotif(next);
    localStorage.setItem('notif_prefs', JSON.stringify(next));
  };

  const saveWebhooks = () => {
    localStorage.setItem('webhooks', JSON.stringify(webhooks));
    toast({ title: 'Webhooks salvos', description: 'URLs de callback atualizadas.' });
  };

  const changePassword = async () => {
    if (pwd.next.length < 8) {
      toast({ title: 'Senha muito curta', description: 'Use ao menos 8 caracteres.', variant: 'destructive' });
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast({ title: 'Senhas não conferem', variant: 'destructive' });
      return;
    }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.next });
    setChangingPwd(false);
    if (error) {
      toast({ title: 'Erro ao alterar senha', description: error.message, variant: 'destructive' });
    } else {
      setPwd({ current: '', next: '', confirm: '' });
      toast({ title: 'Senha alterada', description: 'Use a nova senha no próximo login.' });
    }
  };

  return (
    <AppLayout title="Configurações" subtitle="Personalize sua plataforma">
      <div className="max-w-4xl space-y-6">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full overflow-x-auto flex-wrap h-auto justify-start">
            <TabsTrigger value="profile"><UserCircle className="w-4 h-4 mr-2" />Perfil</TabsTrigger>
            <TabsTrigger value="company"><Building2 className="w-4 h-4 mr-2" />Empresa</TabsTrigger>
            <TabsTrigger value="appearance"><Globe className="w-4 h-4 mr-2" />Aparência</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="w-4 h-4 mr-2" />Notificações</TabsTrigger>
            <TabsTrigger value="security"><Shield className="w-4 h-4 mr-2" />Segurança</TabsTrigger>
            <TabsTrigger value="webhooks"><Webhook className="w-4 h-4 mr-2" />Webhooks</TabsTrigger>
          </TabsList>

          {/* Profile */}
          <TabsContent value="profile">
            <motion.div className="glass-card p-6 space-y-5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="relative">
                  <div className="w-24 h-24 rounded-2xl bg-primary/10 border border-border flex items-center justify-center overflow-hidden">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle className="w-12 h-12 text-muted-foreground" />
                    )}
                  </div>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-50"
                  >
                    {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                  />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Foto de Perfil</h3>
                  <p className="text-xs text-muted-foreground">PNG ou JPG. Recomendado quadrada, mínimo 256×256.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome de exibição</Label>
                  <Input value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
                </div>
                <div>
                  <Label>Cargo / Função</Label>
                  <Input value={profile.role_label} onChange={(e) => setProfile({ ...profile, role_label: e.target.value })} />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />E-mail</Label>
                  <Input value={user?.email ?? ''} disabled />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Telefone</Label>
                  <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                </div>
              </div>

              <Button onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Perfil
              </Button>
            </motion.div>
          </TabsContent>

          {/* Company */}
          <TabsContent value="company">
            <motion.div className="glass-card p-6 space-y-5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="relative">
                  <div className="w-24 h-24 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-10 h-10 text-muted-foreground" />
                    )}
                  </div>
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-50"
                  >
                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                  />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Logo da empresa</h3>
                  <p className="text-xs text-muted-foreground">PNG, JPG ou SVG. Recomendado 512×512.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome da empresa</Label>
                  <Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} disabled={loading} />
                </div>
                <div>
                  <Label>CNPJ / Documento</Label>
                  <Input value={company.document} onChange={(e) => setCompany({ ...company, document: e.target.value })} disabled={loading} />
                </div>
                <div>
                  <Label>E-mail corporativo</Label>
                  <Input type="email" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} disabled={loading} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} disabled={loading} />
                </div>
                <div>
                  <Label>Site</Label>
                  <Input value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} disabled={loading} />
                </div>
                <div>
                  <Label>Fuso horário</Label>
                  <Input value={company.timezone} onChange={(e) => setCompany({ ...company, timezone: e.target.value })} disabled={loading} />
                </div>
                <div className="md:col-span-2">
                  <Label>Endereço</Label>
                  <Textarea value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} disabled={loading} rows={2} />
                </div>
              </div>

              <Button onClick={saveCompany} disabled={saving || loading}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Alterações
              </Button>
            </motion.div>
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance">
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Tema da interface</h3>
              <div className="flex items-center gap-2 bg-secondary rounded-xl p-1 w-fit">
                <button
                  onClick={() => theme === 'dark' && toggleTheme()}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${theme === 'light' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >Claro</button>
                <button
                  onClick={() => theme === 'light' && toggleTheme()}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${theme === 'dark' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >Escuro</button>
              </div>
            </div>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications">
            <div className="glass-card p-6 space-y-4">
              {[
                { key: 'email', label: 'Notificações por e-mail', desc: 'Receba resumos diários e alertas críticos' },
                { key: 'push', label: 'Notificações push', desc: 'Notificações no navegador' },
                { key: 'desktop', label: 'Notificações desktop', desc: 'Alertas nativos do sistema operacional' },
                { key: 'sound', label: 'Som ao receber mensagem', desc: 'Tocar som em novas mensagens' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={notif[item.key]} onCheckedChange={(v) => saveNotif({ ...notif, [item.key]: v })} />
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security">
            <div className="glass-card p-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Alterar Senha
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Use uma senha forte com no mínimo 8 caracteres.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Nova senha</Label>
                    <Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Confirmar nova senha</Label>
                    <Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
                  </div>
                </div>
                <Button className="mt-4" onClick={changePassword} disabled={changingPwd}>
                  {changingPwd ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Alterar Senha
                </Button>
              </div>

              <div className="border-t border-border pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Smartphone className="w-4 h-4" /> Autenticação de dois fatores (2FA)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">Adicione uma camada extra de segurança via aplicativo autenticador.</p>
                  </div>
                  <Button variant="outline" onClick={() => toast({ title: 'Em breve', description: '2FA será disponibilizado em breve.' })}>
                    Configurar
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <p className="text-xs text-muted-foreground">Sessão ativa: <span className="text-foreground">{user?.email}</span></p>
              </div>
            </div>
          </TabsContent>

          {/* Webhooks */}
          <TabsContent value="webhooks">
            <div className="glass-card p-6 space-y-4">
              <div>
                <Label>Nova mensagem</Label>
                <Input placeholder="https://..." value={webhooks.onMessage} onChange={(e) => setWebhooks({ ...webhooks, onMessage: e.target.value })} />
              </div>
              <div>
                <Label>Nova chamada</Label>
                <Input placeholder="https://..." value={webhooks.onCall} onChange={(e) => setWebhooks({ ...webhooks, onCall: e.target.value })} />
              </div>
              <div>
                <Label>Novo ticket</Label>
                <Input placeholder="https://..." value={webhooks.onTicket} onChange={(e) => setWebhooks({ ...webhooks, onTicket: e.target.value })} />
              </div>
              <Button onClick={saveWebhooks}><Save className="w-4 h-4 mr-2" />Salvar Webhooks</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
