import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useVoip } from '@/contexts/VoipContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSipConfig, normalizeSipServer, normalizeSipWsUri, type SipConfig, type SipScope } from '@/lib/sipConfig';
import { getActiveOwnerId } from '@/lib/chatTenantScope';
import { RefreshCw, Phone, Server, Radio } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantLabel: string;
}

const STATUS_LABEL: Record<string, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
  error: 'Falhou',
};

function computeWssUri(cfg: SipConfig | null): string {
  if (!cfg?.server) return '—';
  return normalizeSipWsUri(cfg.server, cfg.ws_uri, cfg.username);
}

/**
 * Modal de diagnóstico do dono: exibe todas as integrações ativas do tenant
 * atual (Empresa/Sub-empresa). Iniciamos com o tronco SIP/Yeastar mostrando
 * host/porta WSS usados, o último status do UA e o endpoint de registro.
 */
export function TenantDiagnosticsDialog({ open, onOpenChange, tenantLabel }: Props) {
  const { user, access } = useAuth();
  const voip = useVoip();
  const [cfg, setCfg] = useState<SipConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scope: SipScope = useMemo(() => {
    const ownerId = getActiveOwnerId(access?.owner_id, user?.id);
    return ownerId
      ? { owner_id: ownerId, sub_company_id: access?.sub_company_id ?? null }
      : {};
  }, [access?.owner_id, access?.sub_company_id, user?.id]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const c = await fetchSipConfig(scope);
      setCfg(c);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar tronco SIP.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope.owner_id, scope.sub_company_id]);

  const wssUri = computeWssUri(cfg);
  const normalizedServer = normalizeSipServer(cfg?.server);
  const endpoint = normalizedServer && cfg?.username ? `sip:${cfg.username}@${normalizedServer}` : '—';
  const statusLabel = STATUS_LABEL[voip.status] ?? voip.status;
  const statusColor =
    voip.status === 'connected' ? 'bg-emerald-500'
    : voip.status === 'connecting' ? 'bg-amber-500'
    : voip.status === 'error' ? 'bg-red-500'
    : 'bg-muted-foreground/50';
  const lastCheckedLabel = voip.lastCheckedAt
    ? new Date(voip.lastCheckedAt).toLocaleString('pt-BR')
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Diagnóstico · {tenantLabel}</DialogTitle>
          <DialogDescription>
            Painel do dono da plataforma. Integrações ativas do tenant atual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* SIP / Yeastar */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Phone className="w-4 h-4 text-primary shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Tronco SIP (VoIP / Yeastar)</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                  <span className="text-foreground font-medium">{statusLabel}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={load} disabled={loading} aria-label="Recarregar">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {err && (
              <p className="mt-2 text-xs text-destructive">Erro ao carregar: {err}</p>
            )}

            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Host / Porta WSS</dt>
                <dd className="font-mono text-foreground break-all flex items-center gap-1.5">
                  <Server className="w-3 h-3 text-muted-foreground" /> {wssUri}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Endpoint de registro</dt>
                <dd className="font-mono text-foreground break-all flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-muted-foreground" /> {endpoint}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Usuário</dt>
                <dd className="font-mono text-foreground">{cfg?.username || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Display name</dt>
                <dd className="text-foreground">{cfg?.display_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ramal configurado</dt>
                <dd>
                  {voip.hasConfig ? (
                    <Badge variant="secondary">Sim</Badge>
                  ) : (
                    <Badge variant="destructive">Não</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Última verificação</dt>
                <dd className="text-foreground">{lastCheckedLabel}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Último erro do UA</dt>
                <dd className="text-foreground break-words">
                  {voip.lastError ? (
                    <span className="text-red-500">{voip.lastError}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Escopo do tenant</dt>
                <dd className="font-mono text-[11px] text-muted-foreground break-all">
                  owner_id={scope.owner_id ?? '—'} · sub_company_id={scope.sub_company_id ?? 'root'}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  window.dispatchEvent(new Event('sip:reload'));
                }}
              >
                Reconectar SIP
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => voip.testConnection()}
              >
                Testar registro
              </Button>
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground">
            Mais integrações (WAHA, Wavoip, Webhooks) serão adicionadas neste painel conforme forem
            padronizadas por tenant.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TenantDiagnosticsDialog;
