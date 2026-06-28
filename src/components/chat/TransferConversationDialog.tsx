import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, User, Users } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  ownerId: string | null;
  currentAssignee?: string | null;
  onTransferred?: () => void;
}

export function TransferConversationDialog({ open, onOpenChange, customerId, ownerId, onTransferred }: Props) {
  const [mode, setMode] = useState<'user' | 'queue'>('user');
  const [users, setUsers] = useState<{ user_id: string; email: string; display_name: string | null }[]>([]);
  const [queues, setQueues] = useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = useState<string>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !ownerId) return;
    (async () => {
      const { data: acc } = await supabase.from('user_account_access').select('user_id').eq('owner_id', ownerId);
      const ids = Array.from(new Set([ownerId, ...(acc?.map((a) => a.user_id) || [])]));
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, email, display_name')
        .in('user_id', ids);
      setUsers(profs || []);
      const { data: qs } = await supabase.from('chat_queues').select('id, name').eq('owner_id', ownerId);
      setQueues(qs || []);
    })();
  }, [open, ownerId]);

  const handleTransfer = async () => {
    if (!target) return toast.error('Selecione um destino');
    if (!reason.trim()) return toast.error('Informe o motivo');
    setSaving(true);
    const update: any = mode === 'user' ? { assigned_to: target } : { queue_id: target };
    const { error } = await supabase.from('customers').update(update).eq('id', customerId);
    if (error) {
      toast.error('Falha ao transferir');
      setSaving(false);
      return;
    }
    // log reason
    const { data: u } = await supabase.auth.getUser();
    await supabase.from('conversation_assignments').insert({
      customer_id: customerId,
      owner_id: ownerId,
      from_user_id: u.user?.id,
      to_user_id: mode === 'user' ? target : null,
      to_queue_id: mode === 'queue' ? target : null,
      reason: reason.trim(),
      created_by: u.user?.id,
    });
    toast.success('Conversa transferida');
    setSaving(false);
    onOpenChange(false);
    setReason('');
    setTarget('');
    onTransferred?.();
  };

  const handleAssignToMe = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setSaving(true);
    const { error } = await supabase.from('customers').update({ assigned_to: u.user.id }).eq('id', customerId);
    setSaving(false);
    if (error) return toast.error('Falha ao atribuir');
    toast.success('Conversa atribuída a você');
    onOpenChange(false);
    onTransferred?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir conversa</DialogTitle>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="user" className="gap-1.5">
              <User className="w-3.5 h-3.5" /> Para colega
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5">
              <Users className="w-3.5 h-3.5" /> Para fila
            </TabsTrigger>
          </TabsList>
          <TabsContent value="user" className="space-y-3">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar colega" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.display_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabsContent>
          <TabsContent value="queue" className="space-y-3">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar fila" />
              </SelectTrigger>
              <SelectContent>
                {queues.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma fila cadastrada</div>
                )}
                {queues.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabsContent>
        </Tabs>
        <Textarea
          placeholder="Motivo da transferência (obrigatório)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleAssignToMe} disabled={saving}>
            Atribuir a mim
          </Button>
          <Button onClick={handleTransfer} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
