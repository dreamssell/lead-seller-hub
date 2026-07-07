import { UserCircle, Mail, Phone, Lock, Camera, Save, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { sanitizeFilename } from '@/lib/sanitizeFilename';

const MAX_AVATAR_MB = 5;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

export default function ProfileTab() {
  const { signOut, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Atendente',
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, phone, role_label, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        toast({ title: 'Erro ao carregar perfil', description: error.message, variant: 'destructive' });
      }

      setForm({
        name: data?.display_name ?? user.user_metadata?.display_name ?? '',
        email: user.email ?? '',
        phone: data?.phone ?? '',
        role: data?.role_label ?? 'Atendente',
      });
      setAvatarUrl(data?.avatar_url ?? null);
      setLoading(false);
    })();
  }, [user]);

  const handleAvatarUpload = async (file: File) => {
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
    const { error: updErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
    setUploadingAvatar(false);
    if (updErr) {
      toast({ title: 'Erro ao salvar', description: updErr.message, variant: 'destructive' });
      return;
    }
    setAvatarUrl(url);
    toast({ title: 'Foto atualizada' });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: form.name,
        phone: form.phone,
      })
      .eq('user_id', user.id);

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Perfil atualizado', description: 'Suas alterações foram salvas com sucesso.' });
  };

  const initials = (form.name || form.email || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <motion.div
        className="glass-card p-6 flex items-center gap-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-primary">{initials}</span>
            )}
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-50"
          >
            {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
          />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{form.name || 'Sem nome'}</h3>
          <p className="text-sm text-muted-foreground">{form.role}</p>
          <p className="text-xs text-primary mt-1">{form.email}</p>
        </div>
      </motion.div>

      <motion.div
        className="glass-card p-6 space-y-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-4">Informações Pessoais</h3>

        {[
          { icon: UserCircle, label: 'Nome completo', key: 'name' as const, disabled: false },
          { icon: Mail, label: 'E-mail', key: 'email' as const, disabled: true },
          { icon: Phone, label: 'Telefone', key: 'phone' as const, disabled: false },
        ].map((field) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
              <field.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={form[field.key]}
                disabled={field.disabled || loading}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="bg-transparent text-sm outline-none flex-1 text-foreground disabled:opacity-60"
              />
            </div>
          </div>
        ))}

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary transition-colors">
            <Lock className="w-4 h-4" />
            Alterar Senha
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </motion.div>
    </div>
  );
}
