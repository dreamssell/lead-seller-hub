import { UserCircle, Mail, Phone, Lock, Camera, Save, LogOut, Loader2, RotateCcw, X, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { sanitizeFilename } from '@/lib/sanitizeFilename';

const MAX_AVATAR_MB = 5;
const MAX_AVATAR_BYTES = MAX_AVATAR_MB * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}


type UploadPhase = 'idle' | 'converting' | 'validating' | 'uploading' | 'saving' | 'done' | 'error';

/** Convert HEIC/HEIF → JPEG in the browser. Loads heic2any lazily. */
async function convertHeicToJpeg(file: File): Promise<File> {
  const mod = await import('heic2any');
  const heic2any = (mod as any).default ?? mod;
  const blob = (await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })) as Blob | Blob[];
  const outBlob = Array.isArray(blob) ? blob[0] : blob;
  const base = file.name.replace(/\.(heic|heif)$/i, '') || 'avatar';
  return new File([outBlob], `${base}.jpg`, { type: 'image/jpeg' });
}

function isHeic(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t === 'image/heic' || t === 'image/heif' || n.endsWith('.heic') || n.endsWith('.heif');
}

export default function ProfileTab() {
  const { signOut, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Upload state
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

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

  const resetUpload = () => {
    setPhase('idle');
    setProgress(0);
    setErrorMsg(null);
    setPendingFile(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const cancelUpload = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    resetUpload();
  };

  const runUpload = async (rawFile: File) => {
    if (!user) {
      toast({ title: 'Sessão expirada', description: 'Faça login novamente.', variant: 'destructive' });
      return;
    }
    setErrorMsg(null);
    setProgress(0);
    setPendingFile(rawFile);

    try {
      let file = rawFile;

      // 1. HEIC conversion (client-side) — unblocks iPhone users
      if (isHeic(file)) {
        setPhase('converting');
        try {
          file = await convertHeicToJpeg(file);
        } catch (e) {
          console.error('[avatar] HEIC conversion failed', e);
          throw new Error(
            'Não foi possível converter a foto HEIC neste navegador. Salve como JPG no iPhone (Ajustes → Câmera → Formatos → Mais Compatível) ou envie outra imagem.',
          );
        }
      }

      // 2. Client-side validation (fast fail, no server round-trip)
      setPhase('validating');
      setProgress(5);
      if (file.size > MAX_AVATAR_BYTES) {
        throw new Error(
          `A foto tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é ${MAX_AVATAR_MB} MB.`,
        );
      }
      const mime = (file.type || '').toLowerCase();
      const ext = extOf(file.name);
      const typeOk = mime ? ALLOWED_MIME.has(mime) : ALLOWED_EXT.has(ext);
      if (!typeOk) {
        throw new Error('Formato não suportado. Envie uma imagem JPG, PNG, WEBP ou GIF.');
      }

      // 3. Refresh session and upload via supabase-js (handles auth + upsert)
      setPhase('uploading');
      setProgress(20);
      let { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr || !sess?.session?.access_token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      // Se o `sub` do JWT não bater com o user.id do contexto, força refresh —
      // isto acontece após rotação de chaves ou troca de tenant e é a causa
      // mais comum do 403 "row-level security" no upload.
      const jwtSub = (() => {
        try {
          const payload = JSON.parse(atob(sess.session.access_token.split('.')[1]));
          return payload?.sub as string | undefined;
        } catch {
          return undefined;
        }
      })();
      if (jwtSub && jwtSub !== user.id) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) {
          sess = { session: refreshed.session } as any;
        }
      }

      const safeName = sanitizeFilename(file.name || 'avatar.jpg');
      const path = `${user.id}/${Date.now()}_${safeName}`;

      // Animação de progresso enquanto o storage não expõe onProgress nativo:
      // sobe suavemente até 85% durante o upload, e salta para 100% ao concluir.
      setProgress(35);
      const progressTimer = window.setInterval(() => {
        setProgress((p) => (p < 85 ? p + 3 : p));
      }, 180);

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'image/jpeg',
        });
      window.clearInterval(progressTimer);

      if (upErr) {
        const status = (upErr as any)?.statusCode ?? (upErr as any)?.status ?? '';
        console.error('[avatar] storage upload error', { status, upErr, path, userId: user.id });
        const raw = (upErr as any)?.message || '';
        if (/row-level security|permission|unauthorized|403|401/i.test(raw) || status === 401 || status === 403) {
          throw new Error(
            'Sem permissão para enviar a foto. Sua sessão pode ter expirado — saia e entre novamente e tente outra vez.',
          );
        }
        if (/payload too large|413/i.test(raw) || status === 413) {
          throw new Error(`A foto excede o limite de ${MAX_AVATAR_MB} MB.`);
        }
        throw new Error(raw || `Falha no upload da foto${status ? ` (código ${status})` : ''}.`);
      }

      // 4. Persist URL in profile
      setPhase('saving');
      setProgress(90);
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: updErr } = await supabase
        .from('profiles')
        .upsert(
          { user_id: user.id, email: user.email ?? '', avatar_url: url },
          { onConflict: 'user_id' },
        );
      if (updErr) {
        console.error('[avatar] profile upsert error', updErr);
        throw new Error(updErr.message || 'Falha ao salvar a foto no perfil.');
      }



      setProgress(100);
      setPhase('done');
      setAvatarUrl(url);
      window.dispatchEvent(new Event('profile:updated'));
      toast({ title: 'Foto atualizada', description: 'Sua nova foto de perfil foi salva.' });
      setTimeout(resetUpload, 800);
    } catch (err: any) {
      console.error('[avatar] upload failed', err);
      const msg = err?.message || 'Não foi possível enviar a foto. Tente novamente.';
      setErrorMsg(msg);
      setPhase('error');
      toast({ title: 'Erro no upload', description: msg, variant: 'destructive' });
    }
  };

  const retry = () => {
    if (pendingFile) runUpload(pendingFile);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: form.name, phone: form.phone })
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

  const uploading = phase === 'converting' || phase === 'validating' || phase === 'uploading' || phase === 'saving';
  const phaseLabel: Record<UploadPhase, string> = {
    idle: '',
    converting: 'Convertendo HEIC → JPG…',
    validating: 'Validando arquivo…',
    uploading: 'Enviando foto…',
    saving: 'Salvando no perfil…',
    done: 'Concluído',
    error: 'Falhou',
  };

  return (
    <div className="space-y-6">
      <motion.div
        className="glass-card p-6 flex items-start gap-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-primary">{initials}</span>
            )}
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-50"
            aria-label="Alterar foto"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && runUpload(e.target.files[0])}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground truncate">{form.name || 'Sem nome'}</h3>
          <p className="text-sm text-muted-foreground">{form.role}</p>
          <p className="text-xs text-primary mt-1 truncate">{form.email}</p>

          {/* Progress */}
          {(uploading || phase === 'done') && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{phaseLabel[phase]}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.25 }}
                />
              </div>
              {phase === 'uploading' && (
                <button
                  onClick={cancelUpload}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3 h-3" /> Cancelar envio
                </button>
              )}
            </div>
          )}

          {/* Error + retry */}
          {phase === 'error' && errorMsg && (
            <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive space-y-2">
              <p className="font-medium">{errorMsg}</p>
              <div className="flex flex-wrap items-center gap-2">
                {pendingFile && (
                  <button
                    onClick={retry}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-medium hover:opacity-90"
                  >
                    <RotateCcw className="w-3 h-3" /> Tentar novamente
                  </button>
                )}
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-destructive/40 hover:bg-destructive/10"
                >
                  Escolher outra foto
                </button>
                <button onClick={resetUpload} className="px-3 py-1.5 rounded-lg hover:bg-destructive/10">
                  Fechar
                </button>
              </div>
            </div>
          )}

          {/* Helper: HEIC guide */}
          {phase === 'idle' && (
            <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Aceitamos JPG, PNG, WEBP ou GIF até {MAX_AVATAR_MB} MB. Fotos HEIC do iPhone são convertidas
                automaticamente. Se falhar, ative <strong>Ajustes → Câmera → Formatos → Mais Compatível</strong>{' '}
                no seu iPhone.
              </span>
            </div>
          )}
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
