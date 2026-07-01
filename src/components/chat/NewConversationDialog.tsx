import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, ShieldCheck, PhoneCall } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { WhatsAppConnection } from '@/components/whatsapp/types';
import { getProviderAdapter } from '@/components/whatsapp/adapters';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  connection: WhatsAppConnection | null;
  onCreated: (customerId: string) => void;
}

function normalizeBRPhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // If starts with 0, drop
  let d = digits.replace(/^0+/, '');
  // Add country code 55 for BR mobile if missing (10-11 digits typical)
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

export function NewConversationDialog({ open, onOpenChange, connection, onCreated }: Props) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'creating' | 'sending'>('form');

  const reset = () => {
    setPhone(''); setName(''); setFirstMessage(''); setStep('form'); setLoading(false);
  };

  const handleSubmit = async () => {
    const normalized = normalizeBRPhone(phone);
    if (!normalized) {
      toast({ title: 'Número inválido', description: 'Informe DDI+DDD+Número, ex: 5527997784501.', variant: 'destructive' });
      return;
    }
    if (!connection) {
      toast({ title: 'Sem conexão ativa', description: 'Selecione uma conexão WhatsApp antes de iniciar.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setStep('creating');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Sessão expirada.');

      // Check for existing customer (avoid duplicates) within same owner
      const ownerId = connection.owner_id || userId;
      const { data: existing } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('owner_id', ownerId)
        .eq('phone', normalized)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let customerId = existing?.id as string | undefined;

      if (!customerId) {
        const { data: inserted, error } = await supabase
          .from('customers')
          .insert({
            name: name.trim() || `Contato ${normalized.slice(-4)}`,
            phone: normalized,
            channel: 'whatsapp',
            owner_id: ownerId,
            sub_company_id: connection.sub_company_id ?? null,
            origin_connection_id: connection.id,
            created_by: userId,
          } as any)
          .select('id')
          .single();
        if (error) throw error;
        customerId = inserted.id;
      } else if (name.trim() && existing?.name !== name.trim()) {
        await supabase.from('customers').update({ name: name.trim() }).eq('id', customerId);
      }

      // Optional first message
      if (firstMessage.trim() && customerId) {
        setStep('sending');
        try {
          const adapter = getProviderAdapter(connection.provider);
          await adapter.sendMessage(connection, customerId, firstMessage.trim());
        } catch (err: any) {
          toast({
            title: 'Contato criado, mas o envio falhou',
            description: err?.message || 'Você pode reenviar pelo chat.',
            variant: 'destructive',
          });
        }
      }

      toast({ title: 'Conversa iniciada', description: `Contato ${normalized} pronto no chat.` });
      onCreated(customerId!);
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: 'Falha ao iniciar conversa', description: err?.message || 'Erro desconhecido', variant: 'destructive' });
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-500" />
            Iniciar nova conversa
          </DialogTitle>
          <DialogDescription>
            Informe o número de WhatsApp (com DDI e DDD). O contato será criado e vinculado à conexão ativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-conv-phone" className="text-xs uppercase tracking-wider text-muted-foreground">Número</Label>
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-muted-foreground" />
              <Input
                id="new-conv-phone"
                placeholder="55 27 99778-4501"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Formato aceito: 5527997784501 · (27) 99778-4501 · +55 27 99778-4501</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-conv-name" className="text-xs uppercase tracking-wider text-muted-foreground">Nome (opcional)</Label>
            <Input
              id="new-conv-name"
              placeholder="Ex: Maria Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-conv-msg" className="text-xs uppercase tracking-wider text-muted-foreground">Primeira mensagem (opcional)</Label>
            <Textarea
              id="new-conv-msg"
              placeholder="Olá! Tudo bem?"
              rows={3}
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
            />
          </div>

          {connection && (
            <div className="rounded-lg border border-border bg-secondary/40 p-2.5 text-[11px] flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-medium">Conexão ativa: <span className="text-primary">{connection.provider.toUpperCase()}</span></p>
                <p className="text-muted-foreground">O envio respeitará as regras de posse e sub-empresa desta instância.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !phone.trim()}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {step === 'sending' ? 'Enviando…' : 'Criando…'}
              </>
            ) : (
              <>
                <MessageCircle className="w-4 h-4 mr-2" />
                Iniciar conversa
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
