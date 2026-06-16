import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WhatsAppConnection } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conn: WhatsAppConnection;
  onConnected: () => void;
}

type Step = 'credentials' | 'qr' | 'connected';

export function EvolutionWizardDialog({ open, onOpenChange, conn, onConnected }: Props) {
  const initialMeta = (conn.metadata ?? {}) as Record<string, any>;
  const [step, setStep] = useState<Step>('credentials');
  const [url, setUrl] = useState<string>(initialMeta.url ?? 'https://evolution.api.example.com');
  const [token, setToken] = useState<string>(initialMeta.token ?? '');
  const [instance, setInstance] = useState<string>(
    initialMeta.instance ?? `inst-${conn.id.slice(0, 6)}`,
  );
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stateText, setStateText] = useState<string>('');
  const pollRef = useRef<number | null>(null);
  const qrRefreshRef = useRef<number | null>(null);

  // Reset every time the dialog opens.
  useEffect(() => {
    if (open) {
      const meta = (conn.metadata ?? {}) as Record<string, any>;
      setUrl(meta.url ?? 'https://evolution.api.example.com');
      setToken(meta.token ?? '');
      setInstance(meta.instance ?? `inst-${conn.id.slice(0, 6)}`);
      setQr(null);
      setPairingCode(null);
      setStateText('');
      setStep(conn.status === 'connected' ? 'connected' : 'credentials');
    } else {
      stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (qrRefreshRef.current) window.clearInterval(qrRefreshRef.current);
    pollRef.current = null;
    qrRefreshRef.current = null;
  };

  const invoke = (action: string, extra: Record<string, any> = {}) =>
    supabase.functions.invoke('evolution-instance', {
      body: { action, connection_id: conn.id, url, token, instance, ...extra },
    });

  const startInstance = async () => {
    if (!url.trim() || !token.trim() || !instance.trim()) {
      toast.error('Preencha URL, API Key e nome da instância.');
      return;
    }
    setBusy(true);
    const { data, error } = await invoke('create');
    setBusy(false);
    if (error) {
      toast.error('Falha ao criar instância', { description: error.message });
      return;
    }
    if (data?.error) {
      toast.error('Evolution recusou a requisição', { description: data.hint || data.error });
      return;
    }
    setQr(data?.qr ?? null);
    setPairingCode(data?.pairing_code ?? null);
    setStep('qr');
    beginPolling();
    if (!data?.qr) {
      // Some Evolution versions only return QR on /instance/connect — fetch it.
      refreshQr();
    }
    toast.success(data?.already_existed ? 'Instância já existia — conectando.' : 'Instância criada!');
  };

  const refreshQr = async () => {
    const { data, error } = await invoke('qr');
    if (error) return;
    if (data?.qr) setQr(data.qr);
    if (data?.pairing_code) setPairingCode(data.pairing_code);
  };

  const beginPolling = () => {
    stopPolling();
    // Poll connection state every 3s.
    pollRef.current = window.setInterval(async () => {
      const { data } = await invoke('state');
      if (data?.state) setStateText(data.state);
      if (data?.connected) {
        stopPolling();
        setStep('connected');
        toast.success('WhatsApp conectado!');
        onConnected();
      }
    }, 3000);
    // Refresh QR every 30s while waiting.
    qrRefreshRef.current = window.setInterval(refreshQr, 30000);
  };

  const handleLogout = async () => {
    setBusy(true);
    await invoke('logout');
    setBusy(false);
    toast.info('Sessão encerrada.');
    setStep('credentials');
    onConnected();
  };

  const renderCredentials = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Informe os dados do seu servidor Evolution API. Você só precisa fazer isso uma vez por instância.
      </p>
      <div className="space-y-2">
        <Label>URL do Servidor</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://evolution.seu-dominio.com" />
      </div>
      <div className="space-y-2">
        <Label>API Key (Global)</Label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="cole sua AUTHENTICATION_API_KEY"
        />
      </div>
      <div className="space-y-2">
        <Label>Nome da Instância</Label>
        <Input
          value={instance}
          onChange={(e) => setInstance(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
          placeholder="ex: vendas-01"
        />
        <p className="text-xs text-muted-foreground">
          Apenas letras, números, hífen e underline. Será o identificador no Evolution.
        </p>
      </div>
    </div>
  );

  const renderQr = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Escaneie com o WhatsApp</p>
          <p className="text-xs text-muted-foreground">
            Abra WhatsApp → Aparelhos conectados → Conectar um aparelho.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          {stateText || 'aguardando'}
        </Badge>
      </div>
      <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 flex items-center justify-center min-h-[280px]">
        {qr ? (
          <img
            src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
            alt="QR Code Evolution"
            className="w-64 h-64 rounded-lg bg-white p-2"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-xs">Gerando QR Code...</p>
          </div>
        )}
      </div>
      {pairingCode && (
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Código de pareamento</p>
            <p className="font-mono text-lg tracking-widest">{pairingCode}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(pairingCode);
              toast.success('Código copiado');
            }}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      )}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 rounded-lg p-3">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          O QR é atualizado automaticamente a cada 30s e a conexão é detectada em tempo real.
        </span>
      </div>
    </div>
  );

  const renderConnected = () => (
    <div className="text-center py-8 space-y-3">
      <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <div>
        <p className="font-semibold">WhatsApp conectado com sucesso</p>
        <p className="text-sm text-muted-foreground">
          Instância <span className="font-mono">{instance}</span>
          {conn.phone_number && <> · {conn.phone_number}</>}
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-violet-500" />
            Conectar Evolution API
          </DialogTitle>
          <DialogDescription>
            Espelhe seu WhatsApp via QR Code em poucos passos.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {step === 'credentials' && renderCredentials()}
        {step === 'qr' && renderQr()}
        {step === 'connected' && renderConnected()}

        <DialogFooter className="gap-2">
          {step === 'credentials' && (
            <Button onClick={startInstance} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
              Gerar QR Code
            </Button>
          )}
          {step === 'qr' && (
            <>
              <Button variant="outline" onClick={refreshQr}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar QR
              </Button>
              <Button variant="ghost" onClick={() => setStep('credentials')}>
                Voltar
              </Button>
            </>
          )}
          {step === 'connected' && (
            <>
              <Button variant="outline" onClick={handleLogout} disabled={busy}>
                Desconectar
              </Button>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
