import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Loader2, Stethoscope, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Severity = 'ok' | 'warn' | 'error';
interface Check { key: string; label: string; severity: Severity; detail: string; hint?: string }
interface Report {
  ok: boolean;
  connection_id: string;
  generated_at?: string;
  display_name?: string;
  engine?: string | null;
  session_status?: string | null;
  checks: Check[];
  summary: Severity;
  expected_webhook_url?: string;
}

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  error: <AlertCircle className="h-4 w-4 text-destructive" />,
};
const BADGE_TONE: Record<Severity, 'default' | 'destructive' | 'secondary'> = {
  ok: 'secondary', warn: 'default', error: 'destructive',
};

/**
 * Painel de diagnóstico WAHA por conexão — consolida sessão, engine,
 * webhook, recebimento e envio recentes em um único relatório com ações
 * de auto-reparo (reconfigurar webhook / reiniciar sessão).
 */
export function WahaDiagnosticsPanel({ connectionId }: { connectionId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('waha-diagnose', {
        body: { connection_id: connectionId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Falha no diagnóstico');
      setReport(data as Report);
    } catch (err: any) {
      toast.error(err?.message ?? 'Não foi possível gerar o diagnóstico');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (action: 'configure_webhook' | 'restart', label: string) => {
    setFixing(action);
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action, connection_id: connectionId, auto_heal: true },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error ?? 'Ação falhou');
      toast.success(`${label} concluído`);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? `Falha em ${label.toLowerCase()}`);
    } finally {
      setFixing(null);
    }
  };

  const hasWebhookIssue = report?.checks.some((c) => c.key === 'webhook' && c.severity !== 'ok');
  const hasSessionIssue = report?.checks.some((c) => c.key === 'session' && c.severity !== 'ok');

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              Diagnóstico WAHA
              {report && (
                <Badge variant={BADGE_TONE[report.summary]}>
                  {report.summary === 'ok' ? 'Saudável' : report.summary === 'warn' ? 'Atenção' : 'Crítico'}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {report?.display_name ? <>Conexão: <strong>{report.display_name}</strong> · </> : null}
              {report?.engine ? `engine ${report.engine}` : 'Health check da conexão'}
            </CardDescription>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reexecutar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !report ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Analisando conexão…
          </div>
        ) : !report ? (
          <div className="text-sm text-muted-foreground">Sem dados de diagnóstico ainda.</div>
        ) : (
          <>
            <ul className="space-y-2">
              {report.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3 rounded-lg border bg-background/50 p-3">
                  <div className="mt-0.5">{ICON[c.severity]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.detail}</div>
                    {c.hint && (
                      <div className="text-[11px] text-primary mt-1">{c.hint}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {(hasWebhookIssue || hasSessionIssue) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {hasWebhookIssue && (
                  <Button
                    size="sm" variant="secondary" className="gap-1.5"
                    disabled={fixing !== null}
                    onClick={() => runAction('configure_webhook', 'Reconfigurar webhook')}
                  >
                    {fixing === 'configure_webhook' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                    Reconfigurar webhook
                  </Button>
                )}
                {hasSessionIssue && (
                  <Button
                    size="sm" variant="secondary" className="gap-1.5"
                    disabled={fixing !== null}
                    onClick={() => runAction('restart', 'Reiniciar sessão')}
                  >
                    {fixing === 'restart' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Reiniciar sessão
                  </Button>
                )}
              </div>
            )}
            {report.expected_webhook_url && (
              <div className="text-[10px] text-muted-foreground pt-2 border-t break-all">
                Webhook esperado: <code>{report.expected_webhook_url}</code>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default WahaDiagnosticsPanel;
