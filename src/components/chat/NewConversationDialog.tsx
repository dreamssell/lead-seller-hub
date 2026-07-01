import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, ShieldCheck, PhoneCall, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { WhatsAppConnection } from '@/components/whatsapp/types';
import { getProviderAdapter } from '@/components/whatsapp/adapters';
import { validatePhone } from '@/lib/phoneValidation';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  connection: WhatsAppConnection | null;
  onCreated: (customerId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, connection, onCreated }: Props) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'creating' | 'sending'>('form');

  const validation = useMemo(() => validatePhone(phone), [phone]);
  const showError = touched && !!phone && !validation.ok;
  const showSuccess = !!phone && validation.ok;

  // Dynamic example based on the specific validation error the user hit.
  const dynamicExample = useMemo(() => {
    switch (validation.errorCode) {
      case 'missing_ddi':      return 'Comece pelo DDI. Ex: +55 11 9XXXX-XXXX';
      case 'invalid_ddd':      return 'Use um DDD válido do Brasil. Ex: +55 11 9XXXX-XXXX';
      case 'invalid_br_mobile':return 'Celular BR começa com 9. Ex: +55 11 9XXXX-XXXX';
      case 'too_short':        return 'Faltam dígitos. Ex: +55 11 9XXXX-XXXX';
      case 'too_long':         return 'Máximo 15 dígitos (E.164). Ex: +55 11 9XXXX-XXXX';
      case 'invalid_chars':    return 'Use apenas dígitos, espaços, hífens ou parênteses.';
      default:                 return 'Formato aceito: +55 DDD 9XXXX-XXXX';
    }
  }, [validation.errorCode]);

  const reset = () => {
    setPhone(''); setName(''); setFirstMessage(''); setStep('form'); setLoading(false); setTouched(false);
  };

  const handleSubmit = async () => {
    setTouched(true);
    const startedAt = Date.now();
    const logBase = {
      scope: 'NewConversationDialog',
      phone_original: phone,
      phone_normalized: validation.e164 ?? null,
      owner_id: connection?.owner_id ?? null,
      sub_company_id: connection?.sub_company_id ?? null,
      connection_id: connection?.id ?? null,
    };

    if (!validation.ok || !validation.e164) {
      console.warn('[NewConversationDialog] rejected (client)', {
        ...logBase,
        reason: validation.errorCode,
        message: validation.errorMessage,
      });
      toast({
        title: 'Número inválido',
        description: validation.errorMessage || 'Verifique DDI e DDD.',
        variant: 'destructive',
      });
      return;
    }
    if (!connection) {
      console.warn('[NewConversationDialog] rejected (no connection)', logBase);
      toast({ title: 'Sem conexão ativa', description: 'Selecione uma conexão WhatsApp antes de iniciar.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setStep('creating');
    try {
      const { data, error } = await supabase.functions.invoke('start-conversation', {
        body: {
          phone_raw: phone,
          name: name.trim() || null,
          connection_id: connection.id,
          first_message: firstMessage.trim() || null,
        },
      });

      if (error || !data?.ok) {
        const msg = (data as any)?.error || error?.message || 'Falha ao iniciar conversa.';
        const code = (data as any)?.code;
        console.error('[NewConversationDialog] backend rejected', { ...logBase, code, message: msg });
        toast({ title: 'Não foi possível iniciar a conversa', description: msg, variant: 'destructive' });
        setStep('form');
        return;
      }

      const customerId = data.customer_id as string;
      console.info('[NewConversationDialog] customer ready', {
        ...logBase,
        customer_id: customerId,
        created: data.created,
        duration_ms: Date.now() - startedAt,
      });

      if (firstMessage.trim() && customerId) {
        setStep('sending');
        try {
          const adapter = getProviderAdapter(connection.provider);
          await adapter.sendMessage(connection, customerId, firstMessage.trim());
        } catch (err: any) {
          console.error('[NewConversationDialog] send failed', { ...logBase, customer_id: customerId, err: err?.message });
          toast({
            title: 'Contato criado, mas o envio falhou',
            description: err?.message || 'Você pode reenviar pelo chat.',
            variant: 'destructive',
          });
        }
      }

      toast({ title: 'Conversa iniciada', description: `Contato ${validation.formatted} pronto no chat.` });
      onCreated(customerId);
      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error('[NewConversationDialog] fatal', { ...logBase, err: err?.message });
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
            Informe o número de WhatsApp com <strong>DDI + DDD + número</strong>. O contato será criado e vinculado à conexão ativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-conv-phone" className="text-xs uppercase tracking-wider text-muted-foreground">
              Número <span className="text-destructive">*</span>
            </Label>
            <div
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 transition-colors',
                showError ? 'border-destructive ring-1 ring-destructive/30' :
                showSuccess ? 'border-emerald-500/60 ring-1 ring-emerald-500/20' :
                'border-input',
              )}
            >
              <PhoneCall className={cn('w-4 h-4 shrink-0', showError ? 'text-destructive' : showSuccess ? 'text-emerald-500' : 'text-muted-foreground')} />
              <Input
                id="new-conv-phone"
                placeholder="+DDI DDD 9XXXX-XXXX"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setTouched(true)}
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                autoFocus
                aria-invalid={showError}
                aria-describedby="new-conv-phone-help"
              />
              {showSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
              {showError && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
            </div>

            {showError ? (
              <div id="new-conv-phone-help" className="text-[11px] text-destructive space-y-0.5">
                <p className="font-medium">{validation.errorMessage}</p>
                <p className="text-destructive/80">{dynamicExample}</p>
                {validation.hint && <p className="text-destructive/70">{validation.hint}</p>}
              </div>
            ) : showSuccess ? (
              <p id="new-conv-phone-help" className="text-[11px] text-emerald-600 dark:text-emerald-400">
                ✓ {validation.formatted}
                {validation.countryCode === '55' && validation.areaCode && (
                  <span className="text-muted-foreground"> · DDI 55 · DDD {validation.areaCode}{validation.isMobile ? ' · celular' : ' · fixo'}</span>
                )}
              </p>
            ) : (
              <p id="new-conv-phone-help" className="text-[10px] text-muted-foreground leading-relaxed">
                Formato aceito: <code className="text-[10px]">+55 DDD 9XXXX-XXXX</code><br />
                Inclua <strong>DDI</strong> (país) + <strong>DDD</strong> + número. Celulares BR começam com 9.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-conv-name" className="text-xs uppercase tracking-wider text-muted-foreground">Nome (opcional)</Label>
            <Input
              id="new-conv-name"
              placeholder="Ex: Maria Silva"
              maxLength={100}
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
              maxLength={1000}
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground text-right">{firstMessage.length}/1000</p>
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
          <Button onClick={handleSubmit} disabled={loading || !validation.ok}>
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
