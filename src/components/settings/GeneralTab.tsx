import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Loader2, Save, Upload, UserCircle, Plug, BarChart3, Bell, Shield, Code2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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

const empty: CompanySettings = {
  name: '', logo_url: null, email: '', phone: '', website: '',
  document: '', address: '', timezone: 'America/Sao_Paulo',
};

const QUICK = [
  { to: '/profile',  icon: UserCircle, label: 'Perfil do Usuário', desc: 'Foto, nome e senha',           color: 'bg-blue-500/10 text-blue-500' },
  { to: '#connections', tab: true, icon: Plug,    label: 'Conexões',          desc: 'WhatsApp, Instagram',      color: 'bg-purple-500/10 text-purple-500' },
  { to: '/pipeline', icon: BarChart3, label: 'Funil de Vendas',    desc: 'Configure etapas e automações', color: 'bg-cyan-500/10 text-cyan-500' },
  { to: '#',         icon: Bell,      label: 'Notificações',       desc: 'Alertas e notificações do sistema', color: 'bg-orange-500/10 text-orange-500' },
  { to: '#',         icon: Shield,    label: 'Segurança',          desc: 'Privacidade e autenticação',    color: 'bg-emerald-500/10 text-emerald-500' },
  { to: '#api',      tab: true, icon: Code2,     label: 'API & Webhooks',     desc: 'Chaves de API e integrações externas', color: 'bg-pink-500/10 text-pink-500' },
];

export default function GeneralTab() {
  const [company, setCompany] = useState<CompanySettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [hideGroups, setHideGroups] = useState(() => localStorage.getItem('hide_wa_groups') === '1');
  const [leadNotif, setLeadNotif] = useState(() => localStorage.getItem('lead_group_notif') === '1');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('company_settings').select('*').order('created_at').limit(1).maybeSingle();
      if (data) setCompany(data as CompanySettings);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = { ...company };
    let res;
    if (company.id) {
      res = await supabase.from('company_settings').update(payload).eq('id', company.id);
    } else {
      const { id, ...ins } = payload;
      res = await supabase.from('company_settings').insert(ins).select().single();
      if (res.data) setCompany(res.data as CompanySettings);
    }
    setSaving(false);
    if (res.error) toast({ title: 'Erro ao salvar', description: res.error.message, variant: 'destructive' });
    else toast({ title: 'Configurações salvas' });
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `company/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
    if (error) { setUploadingLogo(false); toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    const { data: pub } = supabase.storage.from('company-logos').getPublicUrl(path);
    setCompany((c) => ({ ...c, logo_url: pub.publicUrl }));
    setUploadingLogo(false);
    toast({ title: 'Logo enviado', description: 'Clique em Salvar para confirmar.' });
  };

  const toggleHide = (v: boolean) => { setHideGroups(v); localStorage.setItem('hide_wa_groups', v ? '1' : '0'); };
  const toggleLeadNotif = (v: boolean) => { setLeadNotif(v); localStorage.setItem('lead_group_notif', v ? '1' : '0'); };

  return (
    <div className="space-y-6">
      {/* Toggle group */}
      <div className="glass-card p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Ocultar Grupos do WhatsApp</p>
          <p className="text-xs text-muted-foreground">Grupos não aparecerão na lista de conversas</p>
        </div>
        <Switch checked={hideGroups} onCheckedChange={toggleHide} />
      </div>

      {/* Acesso rápido */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Acesso Rápido</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {QUICK.map((q) => {
            const Inner = (
              <div className="glass-card p-4 hover:border-primary/40 transition-all h-full">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${q.color}`}>
                  <q.icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-foreground">{q.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.desc}</p>
              </div>
            );
            return q.to.startsWith('/') ? (
              <Link key={q.label} to={q.to}>{Inner}</Link>
            ) : (
              <div key={q.label}>{Inner}</div>
            );
          })}
        </div>
      </div>

      {/* Empresa */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl bg-secondary border border-border flex items-center justify-center overflow-hidden">
              {company.logo_url ? <img src={company.logo_url} alt="Logo" className="w-full h-full object-contain" /> : <Building2 className="w-10 h-10 text-muted-foreground" />}
            </div>
            <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo} className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-50">
              {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Dados da Empresa</h3>
            <p className="text-xs text-muted-foreground">Logo PNG, JPG ou SVG (512×512 recomendado).</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Nome da empresa</Label><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} disabled={loading} /></div>
          <div><Label>CNPJ / Documento</Label><Input value={company.document} onChange={(e) => setCompany({ ...company, document: e.target.value })} disabled={loading} /></div>
          <div><Label>E-mail corporativo</Label><Input value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} disabled={loading} /></div>
          <div><Label>Telefone</Label><Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} disabled={loading} /></div>
          <div><Label>Site</Label><Input value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} disabled={loading} /></div>
          <div><Label>Fuso horário</Label><Input value={company.timezone} onChange={(e) => setCompany({ ...company, timezone: e.target.value })} disabled={loading} /></div>
          <div className="md:col-span-2"><Label>Endereço</Label><Textarea rows={2} value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} disabled={loading} /></div>
        </div>

        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar Alterações
        </Button>
      </div>

      {/* Notificação Lead */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">Notificação de Lead no Grupo</h3>
        <p className="text-xs text-muted-foreground mb-4">Envie automaticamente um resumo da conversa para um grupo WhatsApp quando ela for finalizada</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Ativar notificações no grupo</p>
            <p className="text-xs text-muted-foreground">Um resumo será enviado ao grupo toda vez que uma conversa for finalizada</p>
          </div>
          <Switch checked={leadNotif} onCheckedChange={toggleLeadNotif} />
        </div>
      </div>
    </div>
  );
}
