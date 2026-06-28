import { useState } from 'react';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';

// Política mínima: 8+ caracteres, ao menos 1 letra e 1 número. O Supabase Auth
// faz a persistência atômica no banco — chamamos updateUser e o hash é gravado
// em auth.users em tempo real, sem necessidade de tabela intermediária.
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

export default function SecurityTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ current, next, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      // 1) Revalida a senha atual fazendo um signIn silencioso com o e-mail do usuário.
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.email) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: current,
      });
      if (signErr) {
        toast.error('Senha atual incorreta');
        return;
      }

      // 2) Persiste a nova senha — gravação em tempo real no auth.users.
      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) {
        toast.error(updateErr.message || 'Não foi possível atualizar a senha');
        return;
      }

      toast.success('Senha atualizada com sucesso');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      toast.error(err?.message || 'Erro inesperado ao atualizar a senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4 text-primary" /> Alterar senha
        </CardTitle>
        <CardDescription>
          Atualize sua senha de acesso. A nova senha é salva imediatamente e passa a valer no próximo login.
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
  );
}
