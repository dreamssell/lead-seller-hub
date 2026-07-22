import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, User, Workflow } from 'lucide-react';
import { FLOW_STAGES, FLOW_STAGE_LABEL, moveConversationToStage, type FlowStage } from '@/lib/attendanceFlow';
import { useAuth } from '@/contexts/AuthContext';
import { postTransferInternalNotice } from '@/lib/internalNotice';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  ownerId: string | null;
  currentAssignee?: string | null;
  onTransferred?: () => void;
}

interface TeamUser {
  user_id: string;
  email: string;
  display_name: string | null;
  is_active?: boolean | null;
}

export function TransferConversationDialog({ open, onOpenChange, customerId, ownerId: ownerIdProp, onTransferred }: Props) {
  const { access, user } = useAuth();
  const ownerId = ownerIdProp || access?.owner_id || user?.id || null;

  const [mode, setMode] = useState<'user' | 'flow'>('user');
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [target, setTarget] = useState<string>('');
  const [stage, setStage] = useState<FlowStage>('active');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      // Usa RPC SECURITY DEFINER que retorna colegas visíveis no escopo do usuário
      // (funciona tanto para donos de empresa quanto membros de sub-empresa).
      const { data, error } = await supabase.rpc('list_internal_comms_members');
      if (error) {
        setUsers([]);
        return;
      }
      const mapped = (data || []).map((m: any) => ({
        user_id: m.user_id,
        email: m.email,
        display_name: m.display_name,
      }));
      mapped.sort((a: any, b: any) =>
        (a.display_name || a.email || '').localeCompare(b.display_name || b.email || ''),
      );
      setUsers(mapped);
    })();
  }, [open, ownerId]);

  const logAssignment = async (payload: Record<string, any>) => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from('conversation_assignments').insert({
      customer_id: customerId,
      owner_id: ownerId,
      from_user_id: u.user?.id,
      reason: reason.trim() || null,
      created_by: u.user?.id,
      ...payload,
    });
    return u.user?.id;
  };

  const handleTransfer = async () => {
    if (!ownerId) return toast.error('Sem contexto de empresa');
    if (mode === 'user' && !target) return toast.error('Selecione um colega');
    if (mode === 'flow' && !stage) return toast.error('Selecione um fluxo');
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const actorName =
        (user?.user_metadata as any)?.full_name ||
        (user?.user_metadata as any)?.name ||
        user?.email ||
        null;
      const reasonText = reason.trim() || null;
      if (mode === 'user') {
        await moveConversationToStage({
          customerId,
          ownerId,
          stage: 'active',
          assignedTo: target,
          actorId: u.user?.id,
          origin: 'transfer',
        });
        await logAssignment({ to_user_id: target });
        const targetUser = users.find((usr) => usr.user_id === target);
        await postTransferInternalNotice({
          customerId,
          noticeType: 'transfer_user',
          actorName,
          targetName: targetUser?.display_name || targetUser?.email || 'colega',
          targetUserId: target,
          reason: reasonText,
        });
        toast.success('Conversa transferida ao colega (Em Atendimento)');
      } else {
        let assignedTo: string | null | undefined;
        if (stage === 'closed' || stage === 'waiting') assignedTo = null;
        else if (stage === 'active') assignedTo = u.user?.id ?? null;
        else assignedTo = undefined;
        await moveConversationToStage({
          customerId,
          ownerId,
          stage,
          assignedTo,
          actorId: u.user?.id,
          origin: 'flow_move',
        });
        await logAssignment({ to_queue_id: null });
        await postTransferInternalNotice({
          customerId,
          noticeType: 'transfer_flow',
          actorName,
          targetStageLabel: FLOW_STAGE_LABEL[stage],
          targetStage: stage,
          reason: reasonText,
        });
        toast.success('Conversa movida para o fluxo');
      }
      onOpenChange(false);
      setReason('');
      setTarget('');
      onTransferred?.();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao transferir');
    } finally {
      setSaving(false);
    }
  };


  const handleAssignToMe = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !ownerId) return;
    setSaving(true);
    try {
      await moveConversationToStage({
        customerId,
        ownerId,
        stage: 'active',
        assignedTo: u.user.id,
        actorId: u.user.id,
        origin: 'self_assign',
      });
      toast.success('Conversa atribuída a você');
      onOpenChange(false);
      onTransferred?.();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao atribuir');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir atendimento</DialogTitle>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="user" className="gap-1.5">
              <User className="w-3.5 h-3.5" /> Para colega
            </TabsTrigger>
            <TabsTrigger value="flow" className="gap-1.5">
              <Workflow className="w-3.5 h-3.5" /> Para fluxo
            </TabsTrigger>
          </TabsList>
          <TabsContent value="user" className="space-y-3">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder={users.length ? 'Selecionar colega' : 'Nenhum usuário disponível'} />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.display_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              A conversa entrará em <b>Em Atendimento</b> do colega escolhido.
            </p>
          </TabsContent>
          <TabsContent value="flow" className="space-y-3">
            <Select value={stage} onValueChange={(v) => setStage(v as FlowStage)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar fluxo" />
              </SelectTrigger>
              <SelectContent>
                {FLOW_STAGES.filter((s) => s.value !== 'closed').map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Move a conversa entre os fluxos: Entrada Manual, Distribuição, Aguardando e Em Atendimento.
              Para encerrar o atendimento, use o botão <b>Encerrar</b> no cabeçalho da conversa.
            </p>
          </TabsContent>
        </Tabs>
        <Textarea
          placeholder="Motivo da transferência (opcional)..."
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
