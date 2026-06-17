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
  TimerReset,
  ShieldAlert,
  Download,
  History,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WhatsAppConnection } from './types';
import { EvolutionAttemptsHistory } from './EvolutionAttemptsHistory';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conn: WhatsAppConnection;
  onConnected: () => void;
}

type Step = 'credentials' | 'qr' | 'connected' | 'failed';
type FailureReason = 'timeout' | 'auth' | 'forbidden' | 'unknown';

const MIN_POLL_MS = 3000;
const MAX_POLL_MS = 15000;
const POLL_BACKOFF = 1.4;

const INSTANCE_RE = /^[a-zA-Z0-9][a-zA-Z0-9-_]{2,49}$/;

function validateUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Informe a URL do servidor Evolution.';
  try {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol)) return 'A URL deve começar com http:// ou https://.';
    if (!u.hostname) return 'URL sem host válido.';
    return null;
  } catch {
    return 'URL inválida.';
  }
}
function validateToken(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Informe a API Key.';
  if (t.length < 8) return 'API Key parece curta demais (mín. 8 caracteres).';
  if (/\s/.test(t)) return 'A API Key não pode conter espaços.';
  return null;
}
function validateInstance(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Informe o nome da instância.';
  if (!INSTANCE_RE.test(t))
    return 'Use 3–50 caracteres: letras, números, hífen ou underline; comece com letra/número.';
  return null;
}

export function EvolutionWizardDialog({ open, onOpenChange, conn, onConnected }: Props) {
  const initialMeta = (conn.metadata ?? {}) as Record<string, any>;
  const [step, setStep] = useState<Step>('credentials');
  const [url, setUrl] = useState<string>(initialMeta.url ?? 'https://evolution.api.example.com');
  const [token, setToken] = useState<string>(initialMeta.token ?? '');
  const [instance, setInstance] = useState<string>(
    initialMeta.instance ?? `inst-${conn.id.slice(0, 6)}`,
  );
  const [timeoutSec, setTimeoutSec] = useState<number>(
    Math.max(30, Math.min(600, Number(initialMeta.qr_timeout_sec) || 180)),
  );
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stateText, setStateText] = useState<string>('');
  const [remaining, setRemaining] = useState<number>(0);
  const [failure, setFailure] = useState<{ reason: FailureReason; message: string } | null>(null);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(initialMeta.auto_reconnect ?? true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    checks: Record<string, { ok: boolean; status?: number; message: string }>;
  } | null>(null);

  const pollTimeoutRef = useRef<number | null>(null);
  const qrRefreshRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const deadlineRef = useRef<number>(0);
  const pollDelayRef = useRef<number>(MIN_POLL_MS);

  // Reset every time the dialog opens.
  useEffect(() => {
    if (open) {
      const meta = (conn.metadata ?? {}) as Record<string, any>;
      setUrl(meta.url ?? 'https://evolution.api.example.com');
      setToken(meta.token ?? '');
      setInstance(meta.instance ?? `inst-${conn.id.slice(0, 6)}`);
      setTimeoutSec(Math.max(30, Math.min(600, Number(meta.qr_timeout_sec) || 180)));
      setQr(null);
      setPairingCode(null);
      setStateText('');
      setFailure(null);
      setTestResult(null);
      setAutoReconnect(meta.auto_reconnect ?? true);
      setStep(conn.status === 'connected' ? 'connected' : 'credentials');
    } else {
      stopAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopAll = () => {
    if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current);
    if (qrRefreshRef.current) window.clearInterval(qrRefreshRef.current);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    pollTimeoutRef.current = null;
    qrRefreshRef.current = null;
    countdownRef.current = null;
  };

  const invoke = (action: string, extra: Record<string, any> = {}) =>
    supabase.functions.invoke('evolution-instance', {
      body: { action, connection_id: conn.id, url, token, instance, ...extra },
    });

  const failWith = (reason: FailureReason, message: string) => {
    stopAll();
    setFailure({ reason, message });
    setStep('failed');
  };

  const persistTimeout = async (sec: number) => {
    await supabase
      .from('whatsapp_connections')
      .update({ metadata: { ...(conn.metadata ?? {}), qr_timeout_sec: sec } })
      .eq('id', conn.id);
  };

  const urlError = validateUrl(url);
  const tokenError = validateToken(token);
  const instanceError = validateInstance(instance);
  const canSubmit = !urlError && !tokenError && !instanceError;

  const startInstance = async () => {
    if (!canSubmit) {
      toast.error('Corrija os campos destacados antes de gerar o QR Code.');
      return;
    }
    setBusy(true);
    setFailure(null);
    const { data, error } = await invoke('create');
    setBusy(false);
    if (error) {
      toast.error('Falha ao criar instância', { description: error.message });
      return;
    }
    if (data?.error === 'forbidden') {
      failWith('forbidden', data.hint || 'Você não tem permissão para esta instância.');
      return;
    }
    if (data?.error) {
      toast.error('Evolution recusou a requisição', { description: data.hint || data.error });
      return;
    }
    setQr(data?.qr ?? null);
    setPairingCode(data?.pairing_code ?? null);
    setStep('qr');
    persistTimeout(timeoutSec);
    beginPolling();
    if (!data?.qr) refreshQr();
    toast.success(data?.already_existed ? 'Instância já existia — conectando.' : 'Instância criada!');
  };

  const refreshQr = async () => {
    const { data, error } = await invoke('qr');
    if (error) return;
    if (data?.qr) setQr(data.qr);
    if (data?.pairing_code) setPairingCode(data.pairing_code);
  };

  const beginPolling = () => {
    stopAll();
    pollDelayRef.current = MIN_POLL_MS;
    deadlineRef.current = Date.now() + timeoutSec * 1000;
    setRemaining(timeoutSec);

    // Countdown UI tick.
    countdownRef.current = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
    }, 1000);

    // QR refresh every 30s.
    qrRefreshRef.current = window.setInterval(refreshQr, 30000);

    const tick = async () => {
      if (Date.now() >= deadlineRef.current) {
        failWith(
          'timeout',
          `A instância não ficou conectada em ${timeoutSec}s. Verifique se você escaneou o QR e tente novamente.`,
        );
        return;
      }
      const { data, error } = await invoke('state');
      if (error) {
        // Network/edge error — back off and retry.
        pollDelayRef.current = Math.min(MAX_POLL_MS, pollDelayRef.current * POLL_BACKOFF);
      } else if (data?.auth_error) {
        failWith('auth', data.hint || 'A API Key da Evolution foi recusada. Atualize o token e tente novamente.');
        return;
      } else if (data?.error === 'forbidden') {
        failWith('forbidden', data.hint || 'Permissão negada para esta instância.');
        return;
      } else {
        if (data?.state) setStateText(data.state);
        if (data?.connected) {
          stopAll();
          setStep('connected');
          toast.success('WhatsApp conectado!');
          onConnected();
          return;
        }
        // Successful poll, reset to min delay.
        pollDelayRef.current = MIN_POLL_MS;
      }
      pollTimeoutRef.current = window.setTimeout(tick, pollDelayRef.current);
    };
    pollTimeoutRef.current = window.setTimeout(tick, pollDelayRef.current);
  };

  const handleLogout = async () => {
    setBusy(true);
    await invoke('logout');
    setBusy(false);
    toast.info('Sessão encerrada.');
    setStep('credentials');
    onConnected();
  };

  const copyInstance = () => {
    navigator.clipboard.writeText(instance);
    toast.success('Identificador da instância copiado', { description: instance });
  };

  const downloadQr = () => {
    if (!qr) return;
    const src = qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
    const a = document.createElement('a');
    a.href = src;
    a.download = `evolution-qr-${instance || conn.id.slice(0, 6)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success('QR Code baixado');
  };

  const fieldError = (msg: string | null) =>
    msg ? <p className="text-[11px] text-destructive">{msg}</p> : null;

  const renderCredentials = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Informe os dados do seu servidor Evolution API. Os campos são validados em tempo real — o QR só pode ser gerado quando tudo estiver correto.
      </p>
      <div className="space-y-1.5">
        <Label>URL do Servidor</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://evolution.seu-dominio.com"
          aria-invalid={!!urlError}
          className={urlError ? 'border-destructive/60' : ''}
        />
        {fieldError(urlError)}
      </div>
      <div className="space-y-1.5">
        <Label>API Key (Global)</Label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="cole sua AUTHENTICATION_API_KEY"
          aria-invalid={!!tokenError}
          className={tokenError ? 'border-destructive/60' : ''}
        />
        {fieldError(tokenError)}
      </div>
      <div className="space-y-1.5">
        <Label className="flex items-center justify-between">
          <span>Nome da Instância</span>
          {instance && !instanceError && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={copyInstance}>
              <Copy className="w-3 h-3 mr-1" /> copiar
            </Button>
          )}
        </Label>
        <Input
          value={instance}
          onChange={(e) => setInstance(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
          placeholder="ex: vendas-01"
          aria-invalid={!!instanceError}
          className={instanceError ? 'border-destructive/60' : ''}
        />
        {fieldError(instanceError) ?? (
          <p className="text-xs text-muted-foreground">
            Apenas letras, números, hífen e underline. Será o identificador no Evolution.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <TimerReset className="w-4 h-4" /> Tempo máximo de espera pelo QR (segundos)
        </Label>
        <Input
          type="number"
          min={30}
          max={600}
          value={timeoutSec}
          onChange={(e) =>
            setTimeoutSec(Math.max(30, Math.min(600, Number(e.target.value) || 180)))
          }
        />
        <p className="text-xs text-muted-foreground">
          Entre 30 e 600 segundos. Após esse tempo sem leitura, o wizard cancela o polling.
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
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className="gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            {stateText || 'aguardando'}
          </Badge>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            restam {remaining}s
          </span>
        </div>
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
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2 pl-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Instância</p>
          <p className="font-mono text-xs truncate">{instance}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copyInstance}>
            <Copy className="w-3.5 h-3.5 mr-1" /> ID
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={downloadQr} disabled={!qr}>
            <Download className="w-3.5 h-3.5 mr-1" /> QR
          </Button>
        </div>
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
          O QR é atualizado a cada 30s. O polling começa em {MIN_POLL_MS / 1000}s e aplica
          backoff até {MAX_POLL_MS / 1000}s em caso de falhas temporárias.
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
          {(conn as any).phone_number && <> · {(conn as any).phone_number}</>}
        </p>
      </div>
    </div>
  );

  const renderFailed = () => {
    const isAuth = failure?.reason === 'auth' || failure?.reason === 'forbidden';
    return (
      <div className="text-center py-6 space-y-3">
        <div
          className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
            isAuth ? 'bg-amber-500/10' : 'bg-destructive/10'
          }`}
        >
          {isAuth ? (
            <ShieldAlert className="w-8 h-8 text-amber-500" />
          ) : (
            <AlertCircle className="w-8 h-8 text-destructive" />
          )}
        </div>
        <div>
          <p className="font-semibold">
            {failure?.reason === 'timeout' && 'Tempo esgotado'}
            {failure?.reason === 'auth' && 'Autenticação expirou'}
            {failure?.reason === 'forbidden' && 'Acesso negado'}
            {failure?.reason === 'unknown' && 'Não foi possível conectar'}
          </p>
          <p className="text-sm text-muted-foreground px-4">{failure?.message}</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

        <Tabs defaultValue="setup">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="setup">Configuração</TabsTrigger>
            <TabsTrigger value="history">
              <History className="w-3.5 h-3.5 mr-1.5" /> Histórico
            </TabsTrigger>
          </TabsList>
          <TabsContent value="setup" className="space-y-4 pt-3">
            {step === 'credentials' && renderCredentials()}
            {step === 'qr' && renderQr()}
            {step === 'connected' && renderConnected()}
            {step === 'failed' && renderFailed()}
          </TabsContent>
          <TabsContent value="history" className="pt-3">
            <EvolutionAttemptsHistory connectionId={conn.id} />
            <p className="text-[11px] text-muted-foreground mt-2">
              Registros visíveis para a empresa proprietária e para a sub-empresa associada à instância.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          {step === 'credentials' && (
            <Button onClick={startInstance} disabled={busy || !canSubmit}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
              {canSubmit ? 'Gerar QR Code' : 'Corrija os campos'}
            </Button>
          )}
          {step === 'qr' && (
            <>
              <Button variant="outline" onClick={refreshQr}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar QR
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  stopAll();
                  setStep('credentials');
                }}
              >
                Cancelar
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
          {step === 'failed' && (
            <>
              <Button variant="outline" onClick={() => setStep('credentials')}>
                Revisar credenciais
              </Button>
              <Button onClick={startInstance} disabled={busy}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
