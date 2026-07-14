// Progress dialog for WAHA "Importar histórico" jobs.
// Owner-only: RLS on waha_import_runs already restricts SELECT to owner /
// account admin / platform admin. Also shows a "Reprocessar apenas falhas"
// button that reruns the edge function limited to the failed chats.
//
// Isolated to WAHA — does not touch UAZ / Evolution / Wavoip.

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, AlertOctagon, CheckCircle2, XCircle, PlayCircle, StopCircle, FlaskConical, Ban, FileDown, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/ceoExport';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { WhatsAppConnection } from './types';

export interface WahaImportRun {
  id: string;
  connection_id: string;
  owner_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancel_requested' | 'cancelled' | 'completed_dry_run' | string;
  chats_total: number;
  chats_processed: number;
  current_chat_label: string | null;
  messages_considered: number;
  messages_inserted: number;
  messages_skipped: number;
  customers_created: number;
  failed_items: Array<{
    chat_id?: string | null;
    phone?: string | null;
    provider_msg_id?: string | null;
    stage?: string;
    reason?: string;
    at?: string;
  }>;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  updated_at: string;
  params?: { dry_run?: boolean; action?: string; processed_chat_ids?: string[]; auto_retry_count?: number } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  runId: string | null;
  conn: WhatsAppConnection;
  /** Full WAHA creds so we can trigger a retry without asking again. */
  creds: { url: string; token: string; session: string };
  onRetryStarted?: (newRunId: string) => void;
}

const STAGE_LABEL: Record<string, string> = {
  chat_id_missing: 'Chat sem ID',
  phone_normalize: 'Telefone inválido',
  customer_upsert: 'Falha ao criar contato',
  waha_fetch_messages: 'Falha ao buscar mensagens do WAHA',
  message_insert: 'Falha ao inserir mensagem',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso;
  }
}

export function WahaImportProgressDialog({ open, onOpenChange, runId, conn, creds, onRetryStarted }: Props) {
  const [run, setRun] = useState<WahaImportRun | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [batchRetryingKey, setBatchRetryingKey] = useState<string | null>(null);

  // Poll every 1.5s while running, and subscribe to realtime updates.
  useEffect(() => {
    if (!open || !runId) return;
    let cancelled = false;

    const fetchOnce = async () => {
      const { data, error } = await supabase
        .from('waha_import_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle();
      if (!cancelled && !error && data) setRun(data as unknown as WahaImportRun);
    };

    fetchOnce();
    const poll = setInterval(fetchOnce, 1500);

    const channel = supabase
      .channel(`waha-import-run-${runId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'waha_import_runs', filter: `id=eq.${runId}`,
      }, (payload) => {
        if (payload.new) setRun(payload.new as unknown as WahaImportRun);
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [open, runId]);

  const pct = useMemo(() => {
    if (!run || !run.chats_total) return 0;
    return Math.min(100, Math.round((run.chats_processed / run.chats_total) * 100));
  }, [run]);

  const isRunning = run?.status === 'running' || run?.status === 'cancel_requested';
  const isDryRun = run?.params?.dry_run === true;
  const canResume = run?.status === 'failed' || run?.status === 'cancelled';
  const autoRetryCount = run?.params?.auto_retry_count ?? 0;
  const failedCount = run?.failed_items?.length ?? 0;

  // Group failures by (stage, reason) so the user sees "5 chats falharam ao
  // buscar mensagens (HTTP 502)" instead of a flat 500-line list. Groups are
  // sorted by count desc; each group can be expanded and reprocessed alone.
  const failureGroups = useMemo(() => {
    const map = new Map<string, { stage: string; reason: string; items: WahaImportRun['failed_items'] }>();
    for (const item of run?.failed_items ?? []) {
      const stage = item.stage ?? 'unknown';
      const reason = item.reason ?? '(sem motivo)';
      const key = `${stage}::${reason}`;
      const g = map.get(key) ?? { stage, reason, items: [] };
      g.items.push(item);
      map.set(key, g);
    }
    return Array.from(map.entries())
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [run?.failed_items]);

  const cancelRun = async () => {
    if (!runId) return;
    setCancelling(true);
    const toastId = toast.loading('Solicitando cancelamento…');
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'cancel_run', connection_id: conn.id, run_id: runId },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha ao cancelar');
      toast.success('Cancelamento solicitado', {
        id: toastId,
        description: 'O job vai parar em segurança no próximo chat.',
      });
    } catch (e: any) {
      toast.error('Falha ao cancelar', { id: toastId, description: e?.message ?? String(e) });
    } finally {
      setCancelling(false);
    }
  };

  const exportCsv = () => {
    if (!run) return;
    const kind = isDryRun ? 'simulacao' : 'importacao';
    const stamp = new Date(run.started_at).toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const stats = [{
      run_id: run.id,
      tipo: isDryRun ? 'Simulação (dry-run)' : 'Importação real',
      status: run.status,
      iniciado_em: fmtDate(run.started_at),
      finalizado_em: fmtDate(run.finished_at),
      chats_total: run.chats_total,
      chats_processados: run.chats_processed,
      mensagens_consideradas: run.messages_considered,
      mensagens_inseridas: run.messages_inserted,
      mensagens_ignoradas: run.messages_skipped,
      contatos_criados: run.customers_created,
      falhas: run.failed_items?.length ?? 0,
      erro: run.error_message ?? '',
    }];
    downloadCsv(`waha-${kind}-${stamp}-stats.csv`, stats);

    if (run.failed_items?.length) {
      const failures = run.failed_items.map((f) => ({
        estagio: STAGE_LABEL[f.stage ?? ''] ?? f.stage ?? '',
        motivo: f.reason ?? '',
        telefone: f.phone ?? '',
        chat_id: f.chat_id ?? '',
        provider_msg_id: f.provider_msg_id ?? '',
        quando: fmtDate(f.at ?? null),
      }));
      downloadCsv(`waha-${kind}-${stamp}-falhas.csv`, failures);
    }
    toast.success('Relatório CSV gerado');
  };


  const runRetry = async (opts?: { stage?: string; reason?: string; label?: string }) => {
    if (!run || !runId) return;
    if (!creds.url || !creds.token || !creds.session) {
      return toast.error('Preencha URL, API Key e Session Name antes.');
    }
    const setBusy = opts?.stage || opts?.reason ? setBatchRetryingKey : setRetrying;
    const busyPayload: any = opts?.stage || opts?.reason ? `${opts?.stage ?? ''}::${opts?.reason ?? ''}` : true;
    setBusy(busyPayload as any);
    const label = opts?.label ?? `${failedCount} itens falhos`;
    const toastId = toast.loading(`Reprocessando ${label}…`);
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: {
          action: 'retry_failed',
          connection_id: conn.id,
          url: creds.url,
          token: creds.token,
          session: creds.session,
          run_id: runId,
          chat_limit: 500,
          msg_limit: 200,
          only_stage: opts?.stage,
          only_reason: opts?.reason,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha ao reprocessar');
      toast.success('Reprocessamento iniciado', {
        id: toastId,
        description: 'Acompanhe o progresso do novo run na tela que abrirá.',
      });
      if (data.run_id && onRetryStarted) onRetryStarted(data.run_id);
    } catch (e: any) {
      toast.error('Falha ao reprocessar', { id: toastId, description: e?.message ?? String(e) });
    } finally {
      if (opts?.stage || opts?.reason) setBatchRetryingKey(null);
      else setRetrying(false);
    }
  };

  const resumeRun = async () => {
    if (!run || !runId) return;
    if (!creds.url || !creds.token || !creds.session) {
      return toast.error('Preencha URL, API Key e Session Name antes.');
    }
    setResuming(true);
    const remaining = Math.max(0, run.chats_total - run.chats_processed);
    const toastId = toast.loading(`Retomando importação (${remaining} chats restantes)…`);
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: {
          action: 'resume_run',
          connection_id: conn.id,
          url: creds.url,
          token: creds.token,
          session: creds.session,
          run_id: runId,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha ao retomar');
      toast.success('Retomada agendada', {
        id: toastId,
        description: 'O job continuará do último chat processado. Dedup por provider_msg_id mantém a idempotência.',
      });
    } catch (e: any) {
      toast.error('Falha ao retomar', { id: toastId, description: e?.message ?? String(e) });
    } finally {
      setResuming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
              : run?.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              : run?.status === 'completed_dry_run' ? <FlaskConical className="w-4 h-4 text-sky-500" />
              : run?.status === 'cancelled' ? <Ban className="w-4 h-4 text-amber-500" />
              : run?.status === 'failed' ? <XCircle className="w-4 h-4 text-destructive" />
              : <PlayCircle className="w-4 h-4" />}
            {isDryRun ? 'Simulação de importação do WAHA' : 'Importação de histórico do WAHA'}
            {isDryRun && <Badge variant="outline" className="text-[10px] gap-1"><FlaskConical className="w-3 h-3" /> Modo simulação</Badge>}
            {run?.status === 'cancel_requested' && <Badge variant="secondary" className="text-[10px]">Parando…</Badge>}
            {run?.status === 'cancelled' && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">Cancelado</Badge>}
          </DialogTitle>
          <DialogDescription>
            {isDryRun
              ? 'Contagem apenas — nenhuma mensagem ou contato é gravado no banco. Use o resultado para decidir se roda a importação real.'
              : 'Acompanhe em tempo real quantos chats e mensagens foram varridos. A operação não afeta o fluxo ao vivo, nem UAZ, Evolution ou Wavoip.'}
          </DialogDescription>
        </DialogHeader>

        {!run ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando estado do job…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div>Início: {fmtDate(run.started_at)}</div>
              <div>Fim: {fmtDate(run.finished_at)}</div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Chats processados</span>
                <span className="tabular-nums">{run.chats_processed} / {run.chats_total} ({pct}%)</span>
              </div>
              <Progress value={pct} className="h-2" />
              {isRunning && run.current_chat_label && (
                <div className="text-[11px] text-muted-foreground truncate">
                  Atualmente: <span className="font-mono">{run.current_chat_label}</span>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportCsv}
                  disabled={!run}
                  className="gap-1.5"
                  title="Baixa CSV com estatísticas e falhas deste run."
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Exportar CSV
                </Button>
                {isRunning && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={cancelling || run?.status === 'cancel_requested'}
                        className="gap-1.5"
                      >
                        {cancelling || run?.status === 'cancel_requested'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <StopCircle className="w-3.5 h-3.5" />}
                        {run?.status === 'cancel_requested' ? 'Cancelando…' : 'Cancelar importação'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar a importação em andamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O job vai parar em segurança no próximo chat. Tudo que já foi importado
                          será mantido no banco — apenas os chats ainda não processados serão
                          ignorados. Você poderá rodar a importação novamente depois.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Continuar importando</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={cancelRun}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Sim, cancelar job
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Consideradas" value={run.messages_considered} />
              <Stat label={isDryRun ? 'Seriam inseridas' : 'Inseridas'} value={run.messages_inserted} highlight="emerald" />
              <Stat label="Ignoradas" value={run.messages_skipped} />
              <Stat label={isDryRun ? 'Contatos que seriam criados' : 'Contatos novos'} value={run.customers_created} highlight="teal" />
            </div>

            {run.error_message && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive flex items-start gap-2">
                <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Job encerrado com erro</div>
                  <div className="font-mono break-all">{run.error_message}</div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertOctagon className="w-4 h-4 text-amber-500" />
                  Itens com falha
                  <Badge variant="secondary" className="tabular-nums">{failedCount}</Badge>
                </div>
                <Button
                  size="sm"
                  variant={failedCount > 0 ? 'default' : 'outline'}
                  disabled={retrying || isRunning || failedCount === 0}
                  onClick={runRetry}
                  className="gap-1.5"
                >
                  {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Reprocessar {failedCount > 0 ? `(${failedCount})` : ''}
                </Button>
              </div>

              {failedCount === 0 ? (
                <div className="text-xs text-muted-foreground italic">Nenhuma falha registrada.</div>
              ) : (
                <ScrollArea className="h-56 rounded-md border">
                  <ul className="divide-y">
                    {run.failed_items.map((f, i) => (
                      <li key={i} className="p-2 text-[11px] space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {STAGE_LABEL[f.stage ?? ''] ?? f.stage ?? 'Falha'}
                          </Badge>
                          {f.phone && <span className="font-mono text-muted-foreground">{f.phone}</span>}
                          {f.chat_id && !f.phone && <span className="font-mono text-muted-foreground truncate">{f.chat_id}</span>}
                          <span className="ml-auto text-muted-foreground">{fmtDate(f.at ?? null)}</span>
                        </div>
                        <div className="text-destructive font-mono break-all">{f.reason}</div>
                        {f.provider_msg_id && (
                          <div className="text-muted-foreground font-mono truncate">msg: {f.provider_msg_id}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: 'emerald' | 'teal' }) {
  const color =
    highlight === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : highlight === 'teal' ? 'text-teal-600 dark:text-teal-400'
    : 'text-foreground';
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
