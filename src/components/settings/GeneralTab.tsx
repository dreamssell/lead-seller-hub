import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Loader2, Save, Upload, UserCircle, Plug, BarChart3, Bell, Shield, Code2, AlertTriangle } from 'lucide-react';
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
  const [appConfig, setAppConfig] = useState<{ doc_retry_alert_limit: number }>({ doc_retry_alert_limit: 3 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [hideGroups, setHideGroups] = useState(() => localStorage.getItem('hide_wa_groups') === '1');
  const [leadNotif, setLeadNotif] = useState(() => localStorage.getItem('lead_group_notif') === '1');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('company_settings').select('*').order('created_at').limit(1).maybeSingle();
      if (data) {
        setCompany(data as CompanySettings);
        if ((data as any).config) {
          setAppConfig({ ...appConfig, ...(data as any).config });
        }
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = { ...company, config: appConfig };
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

      {/* Empresa removida conforme solicitação para evitar duplicidade */}

      {/* Diagnóstico & Resiliência */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-semibold text-foreground">Diagnóstico & Resiliência</h3>
        </div>
        <p className="text-xs text-muted-foreground">Configure os limites de tolerância para falhas automáticas na documentação técnica.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Limite de Retries para Alerta</Label>
            <Input 
              type="number" 
              min={1} 
              max={10} 
              value={appConfig.doc_retry_alert_limit} 
              onChange={(e) => setAppConfig({ ...appConfig, doc_retry_alert_limit: parseInt(e.target.value || '3') })}
              className="h-10 rounded-xl"
            />
            <p className="text-[10px] text-muted-foreground">O alerta de Correlation ID aparecerá após este número de tentativas falhas.</p>
          </div>
        </div>
        
        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving || loading} className="rounded-xl h-10 px-6">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Preferências
          </Button>
        </div>
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
