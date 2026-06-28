import { useState } from 'react';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import PasswordAuditLog from '@/components/settings/PasswordAuditLog';

const schema = z.object({
  current: z.string().min(1, 'Informe a senha atual'),
  next: z
    .string()
    .min(8, 'A nova senha precisa ter ao menos 8 caracteres')
    .max(72, 'A senha pode ter no máximo 72 caracteres')
    .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
    .regex(/[0-9]/, 'Inclua ao menos um número'),
  confirm: z.string().min(1, 'Confirme a nova senha'),
}).refine((v) => v.next === v.confirm, {
  message: 'A confirmação não confere com a nova senha',
  path: ['confirm'],
}).refine((v) => v.next !== v.current, {
  message: 'A nova senha precisa ser diferente da atual',
  path: ['next'],
});

// Captura best-effort do IP público — falha silenciosa quando offline ou bloqueado.
async function detectIp(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.ip ?? null;
  } catch {
    return null;
  }
}

async function recordAudit(params: {
  userId: string;
  email: string | null;
  status: 'success' | 'failure';
  failureReason?: string | null;
  signedOutOthers?: boolean;
}) {
  const ip = await detectIp();
  await (supabase as any).from('password_change_audit').insert({
    user_id: params.userId,
    user_email: params.email,
    ip_address: ip,
    user_agent: navigator.userAgent,
    status: params.status,
    failure_reason: params.failureReason ?? null,
    signed_out_others: params.signedOutOthers ?? false,
  });
}

export default function SecurityTab() {
  const { isOwner } = usePlatformOwner();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ current, next, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    let userId: string | null = null;
    let email: string | null = null;
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.email) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }
      userId = userData.user.id;
      email = userData.user.email;

      // Reautenticação obrigatória — valida senha atual antes de qualquer mudança.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signErr) {
        await recordAudit({ userId, email, status: 'failure', failureReason: 'invalid_current_password' });
        toast.error('Senha atual incorreta');
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) {
        await recordAudit({ userId, email, status: 'failure', failureReason: updateErr.message });
        toast.error(updateErr.message || 'Não foi possível atualizar a senha');
        return;
      }

      // Encerra as demais sessões (mantém a atual ativa).
      let othersClosed = false;
      if (signOutOthers) {
        const { error: soErr } = await supabase.auth.signOut({ scope: 'others' });
        if (!soErr) othersClosed = true;
      }

      await recordAudit({ userId, email, status: 'success', signedOutOthers: othersClosed });

      toast.success(
        othersClosed
          ? 'Senha atualizada. Outras sessões foram encerradas.'
          : 'Senha atualizada com sucesso',
      );
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      if (userId) {
        await recordAudit({ userId, email, status: 'failure', failureReason: err?.message ?? 'unexpected_error' });
      }
      toast.error(err?.message || 'Erro inesperado ao atualizar a senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary" /> Alterar senha
          </CardTitle>
          <CardDescription>
            Atualize sua senha de acesso. Para confirmar é necessário informar a senha atual; a nova senha entra em vigor imediatamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="current">Senha atual</Label>
              <Input
                id="current"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next">Nova senha</Label>
              <Input
                id="next"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 8 caracteres, com letras e números.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar nova senha</Label>
              <Input
                id="confirm"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer pt-1">
              <Checkbox
                checked={signOutOthers}
                onCheckedChange={(v) => setSignOutOthers(v === true)}
                id="sign-out-others"
              />
              <span className="leading-tight">
                <span className="font-medium">Encerrar outras sessões ativas</span>
                <span className="block text-xs text-muted-foreground">
                  Força novo login em todos os outros dispositivos onde você está conectado.
                </span>
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShow((s) => !s)}
                className="gap-2"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {show ? 'Ocultar' : 'Mostrar'} senhas
              </Button>
              <Button type="submit" disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Salvar nova senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isOwner && <PasswordAuditLog />}
    </div>
  );
}
