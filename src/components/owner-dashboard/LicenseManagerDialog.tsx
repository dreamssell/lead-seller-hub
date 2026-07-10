import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert, Save } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: 'company' | 'sub_company';
  accountId: string; // client_companies.id OR sub_companies.id
  accountName: string;
  planSlug?: string | null;
  currentOverride: number | null;
  currentBlocked: boolean;
  planMax: number | null;
  currentUsers: number;
  onSaved: () => void;
}

export function LicenseManagerDialog({
  open, onOpenChange, kind, accountId, accountName, planSlug,
  currentOverride, currentBlocked, planMax, currentUsers, onSaved,
}: Props) {
  const { toast } = useToast();
  const [override, setOverride] = useState<string>('');
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOverride(currentOverride == null ? '' : String(currentOverride));
    setBlocked(!!currentBlocked);
  }, [currentOverride, currentBlocked, open]);

  const eligible = ['platinum', 'enterprise'].includes((planSlug || '').toLowerCase());

  const save = async () => {
    setSaving(true);
    const table = kind === 'sub_company' ? 'sub_companies' : 'client_companies';
    const parsed = override.trim() === '' ? null : Math.max(1, parseInt(override, 10) || 0);
    const { error } = await (supabase as any)
      .from(table)
      .update({ max_users_override: parsed, seat_additions_blocked: blocked })
      .eq('id', accountId);
    setSaving(false);
    if (error) {
      toast({ title: 'Falha ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Licenças atualizadas', description: `Alterações aplicadas em ${accountName}.` });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Gestão de licenças · {accountName}</DialogTitle>
        </DialogHeader>

        {!eligible ? (
          <div className="p-4 bg-warning/10 rounded-lg text-sm flex gap-2">
            <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p>A adição manual de licenças está disponível apenas para contas nos planos <b>Platinum</b> ou <b>Enterprise</b>. Plano atual: {planSlug || '—'}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Plano base: <b>{planSlug}</b> · Limite do plano: <b>{planMax ?? 'sob consulta'}</b> · Em uso: <b>{currentUsers}</b>
            </div>
            <div>
              <Label htmlFor="ov">Licenças adicionais (override)</Label>
              <Input id="ov" type="number" min={1} value={override}
                     onChange={(e) => setOverride(e.target.value)}
                     placeholder="Deixe vazio para usar o padrão do plano" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Este valor substitui o limite do plano. Ex: contrato Enterprise com 30 assentos → digite 30.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="text-sm font-medium">Pausar novos cadastros</p>
                <p className="text-[11px] text-muted-foreground">Bloqueia manualmente qualquer novo usuário até você desativar.</p>
              </div>
              <Switch checked={blocked} onCheckedChange={setBlocked} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !eligible}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
