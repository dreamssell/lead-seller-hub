import { useEffect, useState } from 'react';
import { Mail, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Smtp {
  id?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  is_active: boolean;
}

const empty: Smtp = {
  host: '', port: 587, username: '', password: '',
  from_email: '', from_name: '', use_tls: true, is_active: true,
};

export default function SmtpTab() {
  const [s, setS] = useState<Smtp>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('smtp_settings').select('*').order('created_at').limit(1).maybeSingle();
      if (data) setS(data as Smtp);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!s.host || !s.from_email) { toast({ title: 'Host e e-mail de origem são obrigatórios', variant: 'destructive' }); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const payload = { ...s, created_by: user.id };
    let res;
    if (s.id) res = await supabase.from('smtp_settings').update(payload).eq('id', s.id);
    else {
      const { id, ...ins } = payload;
      res = await supabase.from('smtp_settings').insert(ins).select().single();
      if (res.data) setS(res.data as Smtp);
    }
    setSaving(false);
    if (res.error) toast({ title: 'Erro', description: res.error.message, variant: 'destructive' });
    else toast({ title: 'Configuração SMTP salva' });
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Mail className="w-5 h-5" />Configuração SMTP</h3>
          <p className="text-xs text-muted-foreground mt-1">Configure um servidor SMTP da sua empresa para que os blocos "Email" dos seus fluxos enviem emails com seu domínio.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Host SMTP</Label><Input placeholder="smtp.gmail.com" value={s.host} onChange={(e) => setS({ ...s, host: e.target.value })} disabled={loading} /></div>
          <div><Label>Porta</Label><Input type="number" value={s.port} onChange={(e) => setS({ ...s, port: parseInt(e.target.value || '0') })} disabled={loading} /></div>
          <div><Label>Usuário</Label><Input placeholder="usuario@dominio.com" value={s.username} onChange={(e) => setS({ ...s, username: e.target.value })} disabled={loading} /></div>
          <div><Label>Senha / App Password</Label><Input type="password" placeholder="••••••••" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} disabled={loading} /></div>
          <div><Label>Email de origem (From)</Label><Input placeholder="contato@empresa.com" value={s.from_email} onChange={(e) => setS({ ...s, from_email: e.target.value })} disabled={loading} /></div>
          <div><Label>Nome de exibição (opcional)</Label><Input placeholder="Sua Empresa" value={s.from_name} onChange={(e) => setS({ ...s, from_name: e.target.value })} disabled={loading} /></div>
        </div>

        <div className="border border-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Usar TLS/STARTTLS</p>
            <p className="text-xs text-muted-foreground">Recomendado para a maioria dos provedores (porta 587).</p>
          </div>
          <Switch checked={s.use_tls} onCheckedChange={(v) => setS({ ...s, use_tls: v })} />
        </div>

        <div className="border border-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Ativo</p>
            <p className="text-xs text-muted-foreground">Quando desativado, os blocos Email não conseguem enviar.</p>
          </div>
          <Switch checked={s.is_active} onCheckedChange={(v) => setS({ ...s, is_active: v })} />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
