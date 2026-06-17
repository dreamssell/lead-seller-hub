import { useEffect, useState } from 'react';
import { Fingerprint, Plus, Trash2, Loader2, ShieldCheck, AlertCircle, Pencil, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  isWebAuthnAvailable,
  isPlatformAuthenticatorAvailable,
  registerBiometric,
  listMyBiometricCredentials,
  deleteBiometricCredential,
  renameBiometricCredential,
  StoredCredential,
} from '@/lib/webauthn';

export default function BiometricCredentialsCard() {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [platform, setPlatform] = useState(false);
  const [creds, setCreds] = useState<StoredCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [friendly, setFriendly] = useState('');

  useEffect(() => {
    setSupported(isWebAuthnAvailable());
    isPlatformAuthenticatorAvailable().then(setPlatform);
    refresh();
  }, []);

  const refresh = async () => {
    setLoading(true);
    setCreds(await listMyBiometricCredentials());
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!user) return;
    setRegistering(true);
    const r = await registerBiometric({
      user_id: user.id,
      user_name: user.email ?? user.id,
      user_display_name: user.user_metadata?.display_name ?? user.email ?? 'Usuário',
      friendly_name: friendly.trim() || 'Dispositivo biométrico',
    });
    setRegistering(false);
    if (!r.ok) {
      toast({
        title: 'Não foi possível cadastrar a biometria',
        description: r.error,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Biometria cadastrada',
      description: r.stub
        ? 'Salva — a verificação criptográfica de assinatura ainda está em homologação.'
        : 'Agora você pode entrar com Face ID, Touch ID ou Windows Hello.',
    });
    setFriendly('');
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta credencial biométrica? Você poderá cadastrar uma nova depois.')) return;
    const { error } = await deleteBiometricCredential(id);
    if (error) {
      toast({ title: 'Falha ao remover', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Credencial removida' });
    refresh();
  };

  const handleRename = async (id: string) => {
    if (!editingValue.trim()) return;
    const { error } = await renameBiometricCredential(id, editingValue);
    if (error) {
      toast({ title: 'Falha ao renomear', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingId(null);
    refresh();
  };

  return (
    <motion.div
      className="glass-card p-6 space-y-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Acesso biométrico (Passkey)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              Cadastre Face ID, Touch ID, Windows Hello ou uma chave de segurança para entrar sem
              digitar senha. Funciona em conjunto com o login tradicional.
            </p>
          </div>
        </div>
      </div>

      {!supported && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Este navegador não suporta WebAuthn
            </p>
            <p className="opacity-80">
              Use Chrome, Safari, Edge ou Firefox em uma versão recente. O login por senha continua
              funcionando normalmente.
            </p>
          </div>
        </div>
      )}

      {supported && !platform && (
        <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-900 dark:text-sky-100">
          Nenhum leitor biométrico foi detectado neste dispositivo — você ainda pode cadastrar uma
          chave de segurança USB/NFC.
        </div>
      )}

      {supported && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={friendly}
              onChange={(e) => setFriendly(e.target.value)}
              placeholder="Apelido (ex.: iPhone do João, Notebook do trabalho)"
              className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              maxLength={80}
            />
            <button
              onClick={handleRegister}
              disabled={registering}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {registering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {registering ? 'Aguardando…' : 'Cadastrar biometria'}
            </button>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20">
            <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Credenciais cadastradas
              <span className="text-muted-foreground font-normal">({creds.length})</span>
            </div>
            {loading ? (
              <div className="p-4 text-center text-muted-foreground text-xs">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Carregando…
              </div>
            ) : creds.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhuma credencial cadastrada ainda. Clique em "Cadastrar biometria" acima.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {creds.map((c) => (
                  <li key={c.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <Fingerprint className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      {editingId === c.id ? (
                        <input
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(c.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full bg-secondary rounded px-2 py-1 outline-none"
                          maxLength={80}
                        />
                      ) : (
                        <p className="font-medium truncate">{c.friendly_name}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        cadastrada em {new Date(c.created_at).toLocaleDateString('pt-BR')}
                        {c.last_used_at &&
                          ` · usada ${new Date(c.last_used_at).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editingId === c.id ? (
                        <>
                          <button
                            onClick={() => handleRename(c.id)}
                            className="p-1.5 rounded hover:bg-secondary"
                            aria-label="Salvar nome"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded hover:bg-secondary"
                            aria-label="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(c.id);
                              setEditingValue(c.friendly_name);
                            }}
                            className="p-1.5 rounded hover:bg-secondary"
                            aria-label="Renomear"
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-1.5 rounded hover:bg-destructive/10"
                            aria-label="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Se a biometria falhar no login, o sistema automaticamente oferece o fallback por senha.
          </p>
        </div>
      )}
    </motion.div>
  );
}
