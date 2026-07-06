
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, Loader2, Plug, RefreshCw, XCircle, 
  Activity, AlertCircle, FileSpreadsheet, Eye, History,
  Bug, Terminal, AlertOctagon, Phone, ShieldCheck, QrCode, Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  WhatsAppConnection, 
  PROVIDER_CONFIGS, 
  ConnectionStatus 
} from './types';
import { UazStats } from './UazStats';
import { FacebookDiagnostics } from './FacebookDiagnostics';
import { WidgetSettings } from './WidgetSettings';
import { EvolutionWizardDialog } from './EvolutionWizardDialog';
import { EvolutionStatusBanner } from './EvolutionStatusBanner';
import { EvolutionDebugPanel } from './EvolutionDebugPanel';
import { EvolutionWebhookAlert } from './EvolutionWebhookAlert';
import { WahaConfigDialog } from './WahaConfigDialog';
import { WahaLiveBadge } from './WahaLiveBadge';
import { WahaQrCard } from './WahaQrCard';
import { WahaRestartButton } from './WahaRestartButton';
import { WahaMonitorDialog } from './WahaMonitorDialog';
import { Settings2 } from 'lucide-react';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';


interface ConnectionCardProps {
  conn: WhatsAppConnection;
  onSaved: () => void;
  onOpenAudit: (filters?: { tenantId?: string; logId?: string }) => void;
}

export function statusBadge(status: ConnectionStatus) {
  const map: Record<ConnectionStatus, { label: string; cls: string; icon: any }> = {
    connected: { label: 'Conectado', cls: 'text-success border-success/30', icon: CheckCircle2 },
    connecting: { label: 'Conectando...', cls: 'text-primary border-primary/30', icon: Loader2 },
    error: { label: 'Erro', cls: 'text-destructive border-destructive/30', icon: XCircle },
    disconnected: { label: 'Desconectado', cls: 'text-muted-foreground border-border', icon: Plug },
  };
  const { label, cls, icon: Icon } = map[status];
  return (
    <Badge variant="outline" className={cls}>
      <Icon className={`w-3 h-3 mr-1 ${status === 'connecting' ? 'animate-spin' : ''}`} />
      {label}
    </Badge>
  );
}

export function WhatsAppConnectionCard({ conn, onSaved, onOpenAudit }: ConnectionCardProps) {
  const { isOwner } = usePlatformOwner();

  const config = PROVIDER_CONFIGS[conn.provider] || PROVIDER_CONFIGS.uaz;
  const [url, setUrl] = useState<string>(conn.metadata?.url ?? config.url);
  const [token, setToken] = useState<string>(conn.metadata?.token ?? '');
  const [extra, setExtra] = useState<string>(
    conn.provider === 'evolution'
      ? (conn.metadata?.instance ?? '')
      : (conn.metadata?.phone_number_id ?? '')
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fixingWebhook, setFixingWebhook] = useState(false);
  const [showEvolutionWizard, setShowEvolutionWizard] = useState(false);
  const [wizardAutoStart, setWizardAutoStart] = useState(false);

  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ url: string; headers: string[]; error: any } | null>(null);
  const [showWahaConfig, setShowWahaConfig] = useState(false);
  const [showWahaMonitor, setShowWahaMonitor] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConnection = async () => {
    const msg = conn.provider === 'waha'
      ? `Excluir a conexão "${conn.display_name}"?\n\nIsto remove APENAS a conexão do Lead Seller.\nA sessão no servidor WAHA continua ativa — para removê-la também, use "Excluir sessão remota" em "Configuração completa" antes.`
      : `Excluir a conexão "${conn.display_name}"? Esta ação é irreversível.`;
    if (!window.confirm(msg)) return;
    setDeleting(true);
    const { error } = await supabase.from('whatsapp_connections').delete().eq('id', conn.id);
    setDeleting(false);
    if (error) return toast.error('Falha ao excluir', { description: error.message });
    toast.success('Conexão excluída');
    onSaved();
  };

  const handleSave = async () => {
    setSaving(true);
    const metadata = {
      ...(conn.metadata ?? {}),
      url,
      token,
      ...(conn.provider === 'meta' && { phone_number_id: extra }),
      ...(conn.provider === 'evolution' && { instance: extra })
    };
    const { error } = await supabase
      .from('whatsapp_connections')
      .update({ metadata })
      .eq('id', conn.id);

    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar', { description: error.message });
      return;
    }
    toast.success('Configuração salva');

    // For Evolution, validate that the webhook URL registered on the provider
    // still points at Lead Seller (and that "Webhook by Events" is off).
    if (conn.provider === 'evolution' && url && token && extra) {
      try {
        const { data } = await supabase.functions.invoke('evolution-instance', {
          body: { action: 'check_webhook', connection_id: conn.id, url, token, instance: extra },
        });
        if (data && data.matches === false) {
          toast.warning('Webhook desalinhado na Evolution', {
            description: `Configurado: ${data.remote_url ?? '(vazio)'} · Esperado: ${data.expected_url}. Use "Reconfigurar Webhook".`,
            duration: 10000,
          });
        } else if (data?.webhookByEvents) {
          toast.warning('"Webhook by Events" está ligado', {
            description: 'Desative na Evolution ou clique em "Reconfigurar Webhook" para normalizar.',
            duration: 10000,
          });
        }
      } catch {
        // best-effort validation, do not block save.
      }
    }
    onSaved();
  };

  const handleTest = async (isRetry = false) => {
    if (!url || !token) {
      toast.error('Campos obrigatórios ausentes', { 
        description: 'Por favor, preencha a URL e o Token antes de testar.' 
      });
      return;
    }

    setTesting(true);
    setDebugInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-status', { 
        body: { 
          connection_id: conn.id,
          provider: conn.provider, 
          url, 
          token, 
          ...(conn.provider === 'meta' && { phone_number_id: extra }),
          ...(conn.provider === 'evolution' && { instance: extra })
        } 
      });

      setTesting(false);

      if (error) {
        toast.error('Falha na comunicação com o servidor', { description: error.message });
        return;
      }

      if (data?.raw_error || data?.error || data?.raw) {
        setDebugInfo({
          url: url + (url.endsWith('/') ? 'instance/status' : '/instance/status'),
          headers: ['Authorization', 'apikey', 'token', 'Content-Type'],
          error: {
            provider: conn.provider,
            status_code: data.status_code || (data.error ? 500 : 200),
            payload: data.raw_error ? (typeof data.raw_error === 'string' ? JSON.parse(data.raw_error) : data.raw_error) : (data.raw || { message: data.error })
          }
        });
      }


      if (data?.status_code === 401 && !isRetry) {
        toast.info('Token inválido (401). Tentando refresh automático...', {
          description: 'Aguarde enquanto tentamos restabelecer a sessão.'
        });
        setTimeout(() => handleTest(true), 1500);
        return;
      }

      if (data?.raw_error) {
        toast.error(`Erro ${config.name}`, { 
          description: "Falha na validação. Verifique o painel de debug.",
          duration: 10000 
        });
        return;
      }

      if (data?.error) {
        toast.error('Conexão falhou', { description: data.error });
      } else if (data?.connected) {
        toast.success('Conectado!', { description: `Dispositivo: ${data.phone || 'WhatsApp Active'}` });
      } else {
        if (conn.provider === 'evolution') {
          toast.warning('Instância não está aberta — abrindo pareamento por QR Code…', {
            description: 'Vamos gerar o QR automaticamente. Tenha o WhatsApp em mãos.',
          });
          setWizardAutoStart(true);
          setShowEvolutionWizard(true);
        } else {
          toast.warning('Provedor respondeu, mas instância não está aberta');
        }
      }

      onSaved();
    } catch (err: any) {
      setTesting(false);
      toast.error('Erro inesperado', { description: err.message });
    }
  };

  const ProviderIcon = config.icon;

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 ${config.color}`}>
              <ProviderIcon className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {conn.display_name}
                <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                  {config.name}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1 line-clamp-1">
                {config.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(conn.status)}
            <Button
              variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={handleDeleteConnection}
              disabled={deleting}
              title="Excluir conexão"
              data-testid="delete-connection-button"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {conn.provider === 'evolution' && (
          <>
            <EvolutionStatusBanner conn={conn} onOpenWizard={() => setShowEvolutionWizard(true)} />
            <EvolutionWebhookAlert conn={conn} onFixed={onSaved} />
          </>
        )}

        {/* Provider Specific Stats/Metrics */}
        {conn.provider === 'uaz' && conn.status === 'connected' && (
          <UazStats 
            conn={conn} 
            onOpenAudit={onOpenAudit} 
          />
        )}

        {conn.provider === 'facebook' && isOwner && (
          <FacebookDiagnostics conn={conn} />
        )}


        {conn.provider === 'widget' && (
          <WidgetSettings conn={conn} onSaved={onSaved} />
        )}

        {conn.provider === 'waha' && (
          <div
            data-testid="waha-status-banner"
            data-status={conn.status}
            className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3 text-xs space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold uppercase text-teal-600 tracking-wider text-[10px] flex items-center gap-1">
                <Activity className="w-3 h-3" /> WAHA · Status detalhado
              </p>
              <div className="flex items-center gap-2">
                <WahaRestartButton conn={conn} />
                <WahaLiveBadge conn={conn} />
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${conn.status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-muted'}`} />
                Enviando
              </li>
              <li className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${conn.status === 'connected' ? 'bg-emerald-500' : 'bg-muted'}`} />
                Entregue
              </li>
              <li className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${conn.status === 'error' ? 'bg-red-500' : 'bg-muted'}`} />
                Falha
              </li>
              <li className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${conn.status === 'disconnected' ? 'bg-zinc-500' : 'bg-muted'}`} />
                Desconectado
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              {conn.status === 'connected'
                ? 'Sessão WAHA ativa — mensagens serão enviadas via /api/sendText, sendImage, sendVideo, sendFile ou sendVoice.'
                : conn.status === 'error'
                ? 'Falha na sessão WAHA. O adaptador fará fallback automático com retries e timeout; se persistir, o envio ficará indisponível até a reconexão (não afeta UAZ / Wavoip / Evolution).'
                : conn.status === 'disconnected'
                ? 'Sessão desconectada. Reautentique o QR na sua instância WAHA — os outros provedores continuam operando normalmente.'
                : 'Configure URL, X-Api-Key e o nome da sessão. Depois clique em Testar Conexão para validar antes de enviar.'}
            </p>
            <WahaQrCard conn={conn} />
          </div>
        )}




        {/* Common Configuration Fields (Only show if not widget or explicitly toggled) */}
        {conn.provider !== 'widget' && conn.provider !== 'facebook' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">URL da API</Label>
              <Input 
                value={url} 
                onChange={(e) => setUrl(e.target.value)} 
                placeholder={config.url} 
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">{config.tokenLabel}</Label>
              <Input 
                type="password" 
                value={token} 
                onChange={(e) => setToken(e.target.value)} 
                placeholder="••••••••" 
                className="h-9 text-sm"
              />
            </div>
            {config.extraLabel && (
              <div className="space-y-2 col-span-full">
                <Label className="text-xs font-bold uppercase text-muted-foreground">{config.extraLabel}</Label>
                <Input 
                  value={extra} 
                  onChange={(e) => setExtra(e.target.value)} 
                  placeholder={config.extraLabel} 
                  className="h-9 text-sm"
                />
              </div>
            )}
          </div>
        )}

        <Separator className="opacity-50" />
        
        {/* Debug Panel Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {conn.provider !== 'widget' && (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} 
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleTest()} disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} 
                  Testar Conexão
                </Button>
                {conn.provider === 'waha' && (
                  <Button size="sm" variant="secondary" onClick={() => setShowWahaConfig(true)} className="gap-2">
                    <Settings2 className="w-4 h-4" /> Configuração completa
                  </Button>
                )}
                {conn.provider === 'evolution' && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowEvolutionWizard(true)}
                      className="gap-2"
                    >
                      <QrCode className="w-4 h-4" />
                      {conn.status === 'connected' ? 'Gerenciar QR' : 'Conectar via QR Code'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={fixingWebhook}
                      onClick={async () => {
                        if (!url || !token || !extra) {
                          toast.error('Preencha URL, Token e Instância antes.');
                          return;
                        }
                        setFixingWebhook(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('evolution-instance', {
                            body: {
                              action: 'set_webhook',
                              connection_id: conn.id,
                              url,
                              token,
                              instance: extra,
                            },
                          });
                          if (error) throw error;
                          if (data?.error) throw new Error(data.error);
                          toast.success('Webhook reconfigurado na Evolution', {
                            description: 'URL apontada para o endpoint correto da plataforma. Envie uma mensagem para testar o ACK.',
                          });
                        } catch (e: any) {
                          toast.error('Falha ao reconfigurar webhook', { description: e?.message ?? String(e) });
                        } finally {
                          setFixingWebhook(false);
                        }
                      }}
                      className="gap-2"
                    >
                      {fixingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Reconfigurar Webhook
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-8 px-2 ${debugInfo ? 'text-destructive' : 'text-muted-foreground'}`}
            onClick={() => setShowDebug(!showDebug)}
          >
            <Bug className="w-4 h-4 mr-2" />
            {showDebug ? 'Ocultar Debug' : 'Debug'}
          </Button>
        </div>

        {showDebug && debugInfo && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-destructive/5 rounded-lg border border-destructive/20 space-y-2"
          >
            <div className="flex items-center gap-2 text-destructive">
              <Terminal className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase">Painel de Diagnóstico</span>
            </div>
            <div className="grid grid-cols-1 gap-1 text-[10px] font-mono">
              <p><span className="text-muted-foreground">Endpoint:</span> {debugInfo.url}</p>
              <div className="mt-1">
                <span className="text-muted-foreground">Payload de Resposta:</span>
                <pre className="mt-1 p-2 bg-black/10 rounded overflow-x-auto max-h-40 text-[9px]">
                  {JSON.stringify(debugInfo.error, null, 2)}
                </pre>
              </div>
            </div>
          </motion.div>
        )}

        {showDebug && conn.provider === 'evolution' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <EvolutionDebugPanel conn={conn} />
          </motion.div>
        )}
      </CardContent>
      {conn.provider === 'evolution' && (
        <EvolutionWizardDialog
          open={showEvolutionWizard}
          onOpenChange={(o) => {
            setShowEvolutionWizard(o);
            if (!o) setWizardAutoStart(false);
          }}
          conn={conn}
          onConnected={onSaved}
          autoStart={wizardAutoStart}
        />
      )}
      {conn.provider === 'waha' && (
        <WahaConfigDialog
          open={showWahaConfig}
          onOpenChange={setShowWahaConfig}
          conn={conn}
          onSaved={onSaved}
        />
      )}

    </Card>
  );
}
