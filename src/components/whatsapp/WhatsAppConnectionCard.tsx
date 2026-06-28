
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
  Bug, Terminal, AlertOctagon, Phone, ShieldCheck, QrCode
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
  const [showEvolutionWizard, setShowEvolutionWizard] = useState(false);
  const [wizardAutoStart, setWizardAutoStart] = useState(false);

  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ url: string; headers: string[]; error: any } | null>(null);

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
    } else {
      toast.success('Configuração salva');
      onSaved();
    }
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
          {statusBadge(conn.status)}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {conn.provider === 'evolution' && (
          <EvolutionStatusBanner conn={conn} onOpenWizard={() => setShowEvolutionWizard(true)} />
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
                {conn.provider === 'evolution' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowEvolutionWizard(true)}
                    className="gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    {conn.status === 'connected' ? 'Gerenciar QR' : 'Conectar via QR Code'}
                  </Button>
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
      </CardContent>
      {conn.provider === 'evolution' && (
        <EvolutionWizardDialog
          open={showEvolutionWizard}
          onOpenChange={setShowEvolutionWizard}
          conn={conn}
          onConnected={onSaved}
        />
      )}
    </Card>
  );
}
