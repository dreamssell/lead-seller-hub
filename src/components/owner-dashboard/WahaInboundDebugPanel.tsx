// Owner-only debug panel for the WAHA inbound pipeline (webhook → recording →
// realtime → render). Consumes the `waha-audit` edge function and subscribes
// to Realtime updates so the owner can watch each stage in real time from the
// company detail screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AlertTriangle, RefreshCcw, Search, Radio, Activity, FileDown, FileText, ArrowDown, ArrowUp, ExternalLink, Filter } from 'lucide-react';
import { downloadCsv, downloadPdf } from '@/lib/ceoExport';

interface AuditEvent {
  id: string;
  connection_id: string;
  created_at: string;
  event_type: string;
  status: string | null;
  metadata_json: any;
}
interface AuditMessage {
  id: string;
  created_at: string;
  uaz_msg_id: string | null;
  connection_id: string | null;
  content: string | null;
  customers?: { owner_id?: string; phone?: string; name?: string };
  metadata?: any;
}
interface AuditGap {
  event_id: string;
  created_at: string;
  connection_id: string;
  provider_msg_id: string;
  sender_lid?: string | null;
  sender_jid?: string | null;
  owner_id?: string | null;
  raw_event?: string;
}
interface AuditCall {
  id: string; wavoip_call_id: string | null; phone_number: string | null; contact_name: string | null;
  direction: string | null; status: string | null; duration_seconds: number | null;
  started_at: string | null; answered_at: string | null; ended_at: string | null; created_at: string;
}
interface AuditResponse {
  ok: boolean;
  owner_id: string;
  connections: any[];
  events: AuditEvent[];
  messages: AuditMessage[];
  gaps: AuditGap[];
  stats: {
    events_total: number;
    message_events: number;
    messages_stored: number;
    gaps: number;
    gap_rate: number;
    since_iso: string;
  };
  alerts: string[];
  calls?: AuditCall[];
  pagination?: { limit: number; order: 'asc' | 'desc'; next_cursor: string | null; cursor_used: string | null };
  meta?: { request_id?: string; owner_hash?: string };
}

const dt = (iso: string) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');
const safeStamp = (iso?: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 19).replace(/[:T]/g, '-') : 'inicio';

function StageBadge({ label, ok, tone = 'default' }: { label: string; ok: boolean; tone?: 'default' | 'warn' }) {
  const cls = ok
    ? 'bg-success/10 text-success border-success/20'
    : tone === 'warn'
    ? 'bg-warning/10 text-warning border-warning/20'
    : 'bg-destructive/10 text-destructive border-destructive/20';
  return <Badge variant="outline" className={cls}>{ok ? '✓ ' : '✗ '}{label}</Badge>;
}

export function WahaInboundDebugPanel({ ownerId, connectionIds }: { ownerId: string | null; connectionIds: string[] }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageIdFilter, setMessageIdFilter] = useState('');
  const [pendingMsgId, setPendingMsgId] = useState('');
  const [callIdFilter, setCallIdFilter] = useState('');
  const [pendingCallId, setPendingCallId] = useState('');
  const [renderTick, setRenderTick] = useState(0);
  const lastRealtimeRef = useRef<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const [gapsOnly, setGapsOnly] = useState(false);
  // Estado de exportação em andamento. Enquanto !== null, todos os botões de
  // export ficam desabilitados para prevenir cliques concorrentes / arquivos
  // duplicados. O valor descreve qual export está rodando (útil no E2E).
  const [exporting, setExporting] = useState<null | 'csv' | 'pdf' | 'csv-consolidado' | 'pdf-consolidado'>(null);
  const runExport = useCallback(async (kind: NonNullable<typeof exporting>, fn: () => void | Promise<void>) => {
    if (exporting) return;
    setExporting(kind);
    try {
      // Cede o frame para o React pintar o disabled antes do trabalho síncrono
      // pesado (jsPDF pode bloquear >100ms para PDFs grandes).
      await new Promise((r) => setTimeout(r, 0));
      await fn();
    } finally {
      setExporting(null);
    }
  }, [exporting]);

  const fetchAudit = useCallback(async (opts?: { cursor?: string | null; order?: 'asc' | 'desc' }) => {
    if (!ownerId) return;
    setLoading(true); setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('waha-audit', {
        body: {
          owner_id: ownerId,
          message_id: messageIdFilter || null,
          call_id: callIdFilter || null,
          limit: 200,
          since_hours: 24,
          order: opts?.order ?? order,
          cursor: opts?.cursor ?? cursor,
        },
      });
      if (fnErr) throw fnErr;
      setData(res as AuditResponse);
    } catch (e: any) {
      setError(e?.message || 'Falha ao consultar auditoria WAHA');
    } finally {
      setLoading(false);
    }
  }, [ownerId, messageIdFilter, callIdFilter, order, cursor]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const handleNextPage = () => {
    const next = data?.pagination?.next_cursor ?? null;
    if (!next) return;
    setCursorStack((s) => [...s, cursor]);
    setCursor(next);
  };
  const handlePrevPage = () => {
    setCursorStack((s) => {
      const copy = [...s];
      const prev = copy.pop() ?? null;
      setCursor(prev);
      return copy;
    });
  };
  const toggleOrder = () => {
    setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    setCursor(null); setCursorStack([]);
  };

  // Aggregated rows (per-event, joined to messages and calls)
  const exportRows = useMemo(() => {
    if (!data) return [] as Array<Record<string, string | number>>;
    const callsByPhone = new Map<string, AuditCall>();
    (data.calls || []).forEach((c) => {
      const key = (c.phone_number || '').replace(/\D/g, '');
      if (key) callsByPhone.set(key, c);
    });
    const msgByPid = new Map<string, AuditMessage>();
    (data.messages || []).forEach((m) => { if (m.uaz_msg_id) msgByPid.set(m.uaz_msg_id, m); });
    const gapIds = new Set(data.gaps.map((g) => g.event_id));
    const rowsOut: Array<Record<string, string | number>> = [];
    for (const ev of data.events || []) {
      const meta = ev.metadata_json || {};
      if (meta.bucket !== 'message') continue;
      const isGap = gapIds.has(ev.id);
      if (gapsOnly && !isGap) continue;
      const msg = meta.provider_msg_id ? msgByPid.get(meta.provider_msg_id) : undefined;
      const phone = (msg?.customers?.phone || meta.sender_jid || '').replace(/\D/g, '');
      const call = phone ? callsByPhone.get(phone) : undefined;
      rowsOut.push({
        webhook_at: ev.created_at,
        message_id: meta.provider_msg_id || '',
        sender_lid: meta.sender_lid || meta.sender_jid || '',
        owner_id: meta.owner_id || msg?.customers?.owner_id || '',
        recorded: msg ? 'sim' : 'nao',
        is_gap: isGap ? 'sim' : 'nao',
        recorded_at: msg?.created_at || '',
        preview: (msg?.content || meta.raw_event || '').toString().slice(0, 200),
        call_id: call?.id || '',
        wavoip_call_id: call?.wavoip_call_id || '',
        call_answered_at: call?.answered_at || '',
        call_ended_at: call?.ended_at || '',
      });
    }
    return rowsOut;
  }, [data, gapsOnly]);

  // Consolidated aggregation: per-sender + per-hour bucket (owner-scoped).
  const consolidatedRows = useMemo(() => {
    if (!data) return [] as Array<Record<string, string | number>>;
    const gapIds = new Set(data.gaps.map((g) => g.event_id));
    const storedPids = new Set((data.messages || []).map((m) => m.uaz_msg_id).filter(Boolean));
    const buckets = new Map<string, { sender: string; hour: string; webhooks: number; recorded: number; gaps: number; last_at: string }>();
    for (const ev of data.events || []) {
      const meta = ev.metadata_json || {};
      if (meta.bucket !== 'message') continue;
      const sender = meta.sender_lid || meta.sender_jid || 'desconhecido';
      const hour = ev.created_at.slice(0, 13) + ':00';
      const key = `${sender}::${hour}`;
      const row = buckets.get(key) || { sender, hour, webhooks: 0, recorded: 0, gaps: 0, last_at: ev.created_at };
      row.webhooks += 1;
      if (meta.provider_msg_id && storedPids.has(meta.provider_msg_id)) row.recorded += 1;
      if (gapIds.has(ev.id)) row.gaps += 1;
      if (ev.created_at > row.last_at) row.last_at = ev.created_at;
      buckets.set(key, row);
    }
    return Array.from(buckets.values())
      .sort((a, b) => (a.hour === b.hour ? a.sender.localeCompare(b.sender) : b.hour.localeCompare(a.hour)))
      .map((r) => ({
        hora: r.hour, sender: r.sender, webhooks: r.webhooks, gravadas: r.recorded,
        gaps: r.gaps, gap_rate_pct: r.webhooks > 0 ? Math.round((r.gaps / r.webhooks) * 100) : 0,
        ultima: r.last_at,
      }));
  }, [data]);

  const rangeFrom = data?.stats.since_iso ?? null;
  const rangeTo = useMemo(() => {
    if (!data?.events?.length) return null;
    return data.events.reduce((max, e) => (e.created_at > max ? e.created_at : max), data.events[0].created_at);
  }, [data]);

  const filenameBase = () => {
    const ownerFrag = (ownerId || 'owner').slice(0, 8);
    return `waha-audit-${ownerFrag}-${safeStamp(rangeFrom)}_to_${safeStamp(rangeTo)}`;
  };

  const filtersLine = () => {
    const parts = [
      `filtros: msg=${messageIdFilter || '—'}`,
      `call=${callIdFilter || '—'}`,
      `gaps_only=${gapsOnly ? 'sim' : 'nao'}`,
      `ordem=${order}`,
    ];
    return parts.join(' · ');
  };

  const handleExportCsv = () => {
    downloadCsv(`${filenameBase()}.csv`, exportRows);
  };
  const handleExportPdf = () => {
    if (!data) return;
    downloadPdf(
      `${filenameBase()}.pdf`,
      'Auditoria WAHA — pipeline inbound',
      `Owner ${ownerId} · janela ${dt(rangeFrom || '')} → ${dt(rangeTo || '')} · ${filtersLine()}`,
      [
        { label: 'Webhooks msg', value: data.stats.message_events },
        { label: 'Gravados', value: data.stats.messages_stored },
        { label: 'Gaps', value: data.stats.gaps },
        { label: 'Gap rate', value: `${Math.round(data.stats.gap_rate * 100)}%` },
        { label: 'Ligações', value: (data.calls || []).length },
      ],
      exportRows,
    );
  };
  const handleExportConsolidatedCsv = () => {
    downloadCsv(`${filenameBase()}-consolidado.csv`, consolidatedRows);
  };
  const handleExportConsolidatedPdf = () => {
    if (!data) return;
    downloadPdf(
      `${filenameBase()}-consolidado.pdf`,
      'Auditoria WAHA — consolidado por sender/hora',
      `Owner ${ownerId} · janela ${dt(rangeFrom || '')} → ${dt(rangeTo || '')} · ${filtersLine()}`,
      [
        { label: 'Senders únicos', value: new Set(consolidatedRows.map((r) => r.sender)).size },
        { label: 'Horas cobertas', value: new Set(consolidatedRows.map((r) => r.hora)).size },
        { label: 'Webhooks msg', value: data.stats.message_events },
        { label: 'Gaps totais', value: data.stats.gaps },
      ],
      consolidatedRows,
    );
  };

  // Realtime subscription
  useEffect(() => {
    if (!ownerId || connectionIds.length === 0) return;
    const filter = `connection_id=in.(${connectionIds.join(',')})`;
    const channel = supabase
      .channel(`waha-debug-${ownerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        lastRealtimeRef.current = new Date().toISOString();
        setRenderTick((t) => t + 1);
        fetchAudit();
        // eslint-disable-next-line no-console
        console.info('[WahaDebug] realtime insert', payload.new);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
      });
    return () => { supabase.removeChannel(channel); };
  }, [ownerId, connectionIds.join(','), fetchAudit]);

  const rows = useMemo(() => {
    if (!data) return [] as Array<{
      event: AuditEvent | null; message: AuditMessage | null; providerMsgId: string | null; isGap: boolean; call: AuditCall | null;
    }>;
    const byMsgId = new Map<string, AuditMessage>();
    (data.messages || []).forEach((m) => { if (m.uaz_msg_id) byMsgId.set(m.uaz_msg_id, m); });
    const callsByPhone = new Map<string, AuditCall>();
    (data.calls || []).forEach((c) => {
      const key = (c.phone_number || '').replace(/\D/g, '');
      if (key) callsByPhone.set(key, c);
    });
    const gapIds = new Set(data.gaps.map((g) => g.event_id));
    const seen = new Set<string>();
    const out: Array<{ event: AuditEvent | null; message: AuditMessage | null; providerMsgId: string | null; isGap: boolean; call: AuditCall | null }> = [];
    for (const ev of data.events || []) {
      const meta = ev.metadata_json || {};
      if (meta.bucket !== 'message') continue;
      const pid = meta.provider_msg_id || null;
      const key = `ev:${ev.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const msg = pid ? byMsgId.get(pid) || null : null;
      const phone = (msg?.customers?.phone || meta.sender_jid || '').replace(/\D/g, '');
      const call = phone ? callsByPhone.get(phone) || null : null;
      const isGap = gapIds.has(ev.id);
      if (gapsOnly && !isGap) continue;
      out.push({ event: ev, message: msg, providerMsgId: pid, isGap, call });
    }
    if (!gapsOnly) {
      const eventPids = new Set((data.events || []).map((e) => e.metadata_json?.provider_msg_id).filter(Boolean));
      for (const m of data.messages || []) {
        if (!m.uaz_msg_id || eventPids.has(m.uaz_msg_id)) continue;
        out.push({ event: null, message: m, providerMsgId: m.uaz_msg_id, isGap: false, call: null });
      }
    }
    return out.slice(0, 120);
  }, [data, gapsOnly]);

  if (!ownerId) {
    return <Card className="p-6 text-sm text-muted-foreground">Owner sem canal WAHA para auditar.</Card>;
  }

  const cursorLabel = cursor ? dt(cursor) : 'início da janela';
  const nextLabel = data?.pagination?.next_cursor ? dt(data.pagination.next_cursor) : null;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-[11px] text-muted-foreground">Filtrar por message_id</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={pendingMsgId}
                onChange={(e) => setPendingMsgId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setMessageIdFilter(pendingMsgId.trim())}
                placeholder="ex.: false_5511999999999@c.us_XYZ"
                className="h-9 pl-7 font-mono text-xs"
              />
            </div>
          </div>
          <div className="min-w-[200px]">
            <Label className="text-[11px] text-muted-foreground">Filtrar por call_id</Label>
            <Input
              value={pendingCallId}
              onChange={(e) => setPendingCallId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setCallIdFilter(pendingCallId.trim())}
              placeholder="uuid da chamada"
              className="h-9 font-mono text-xs"
            />
          </div>
          <Button size="sm" onClick={() => { setMessageIdFilter(pendingMsgId.trim()); setCallIdFilter(pendingCallId.trim()); setCursor(null); setCursorStack([]); }}>Aplicar</Button>
          <Button size="sm" variant="outline" onClick={() => { setPendingMsgId(''); setMessageIdFilter(''); setPendingCallId(''); setCallIdFilter(''); setCursor(null); setCursorStack([]); }}>Limpar</Button>
          <Button size="sm" variant={gapsOnly ? 'default' : 'outline'} onClick={() => setGapsOnly((v) => !v)} title="Mostrar apenas gaps/deduplicações suspeitas">
            <Filter className="w-3.5 h-3.5 mr-1" /> {gapsOnly ? 'Somente gaps ✓' : 'Somente gaps'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => fetchAudit()} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Recarregar
          </Button>
          <Button size="sm" variant="outline" onClick={toggleOrder} title="Alternar ordenação por created_at">
            {order === 'desc' ? <ArrowDown className="w-3.5 h-3.5 mr-1" /> : <ArrowUp className="w-3.5 h-3.5 mr-1" />}
            {order === 'desc' ? 'Mais recentes' : 'Mais antigos'}
          </Button>
          <Button size="sm" variant="outline" data-testid="export-csv" aria-busy={exporting === 'csv'} onClick={() => runExport('csv', handleExportCsv)} disabled={loading || !data || exporting !== null}>
            <FileDown className={`w-3.5 h-3.5 mr-1 ${exporting === 'csv' ? 'animate-spin' : ''}`} /> {exporting === 'csv' ? 'Exportando…' : 'CSV'}
          </Button>
          <Button size="sm" variant="outline" data-testid="export-pdf" aria-busy={exporting === 'pdf'} onClick={() => runExport('pdf', handleExportPdf)} disabled={loading || !data || exporting !== null}>
            <FileText className={`w-3.5 h-3.5 mr-1 ${exporting === 'pdf' ? 'animate-spin' : ''}`} /> {exporting === 'pdf' ? 'Exportando…' : 'PDF'}
          </Button>
          <Button size="sm" variant="outline" data-testid="export-csv-consolidado" aria-busy={exporting === 'csv-consolidado'} onClick={() => runExport('csv-consolidado', handleExportConsolidatedCsv)} disabled={loading || !data || exporting !== null}>
            <FileDown className={`w-3.5 h-3.5 mr-1 ${exporting === 'csv-consolidado' ? 'animate-spin' : ''}`} /> CSV consolidado
          </Button>
          <Button size="sm" variant="outline" data-testid="export-pdf-consolidado" aria-busy={exporting === 'pdf-consolidado'} onClick={() => runExport('pdf-consolidado', handleExportConsolidatedPdf)} disabled={loading || !data || exporting !== null}>
            <FileText className={`w-3.5 h-3.5 mr-1 ${exporting === 'pdf-consolidado' ? 'animate-spin' : ''}`} /> PDF consolidado
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Radio className={`w-3.5 h-3.5 ${realtimeStatus === 'connected' ? 'text-success' : realtimeStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
            Realtime {realtimeStatus === 'connected' ? 'ativo' : realtimeStatus === 'error' ? 'com erro' : 'inicializando'}
            {renderTick > 0 && <span className="text-muted-foreground">· {renderTick} eventos renderizados</span>}
          </div>
        </div>

        {/* Pagination row */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
          <span>Cursor atual: <strong className="text-foreground font-mono">{cursorLabel}</strong></span>
          <span>· Ordenando por <strong className="text-foreground">created_at {order}</strong></span>
          {nextLabel && <span>· Próximo lote inicia em <strong className="text-foreground font-mono">{nextLabel}</strong></span>}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={handlePrevPage} disabled={loading || cursorStack.length === 0}>← Anterior</Button>
            <Button size="sm" variant="outline" onClick={handleNextPage} disabled={loading || !data?.pagination?.next_cursor}>Próxima →</Button>
          </div>
        </div>
      </Card>

      {/* Backend-side alerts (from waha-audit response) */}
      {data && data.alerts?.length > 0 && (
        <Card className="p-3 border-warning/40 bg-warning/5">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
            <div>
              <p className="font-semibold text-warning">Alertas de telemetria (backend)</p>
              <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                {data.alerts.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Live alerts derived from the events window (client-side) */}
      <RecentAlertsCard data={data} />


      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: 'Webhooks (msg)', value: data.stats.message_events, tone: 'text-primary' },
            { label: 'Gravados', value: data.stats.messages_stored, tone: 'text-success' },
            { label: 'Gaps', value: data.stats.gaps, tone: data.stats.gaps > 0 ? 'text-destructive' : 'text-muted-foreground' },
            { label: 'Gap rate', value: `${Math.round(data.stats.gap_rate * 100)}%`, tone: data.stats.gap_rate > 0.1 ? 'text-destructive' : 'text-muted-foreground' },
            { label: 'Eventos totais', value: data.stats.events_total, tone: 'text-muted-foreground' },
          ].map((s) => (
            <Card key={s.label} className="p-3">
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold tabular-nums ${s.tone}`}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {error && <Card className="p-3 text-sm text-destructive">Erro: {error}</Card>}

      {/* Pipeline table */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">
            Pipeline webhook → gravação → realtime → render {gapsOnly && <span className="text-destructive">· somente gaps</span>}
          </p>
          <span className="text-xs text-muted-foreground ml-auto">Últimas {rows.length} entradas</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum evento WAHA nas últimas 24h para este owner.</p>
        ) : (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left p-2">Quando</th>
                  <th className="text-left p-2">Message ID</th>
                  <th className="text-left p-2">Sender @lid</th>
                  <th className="text-left p-2">Owner</th>
                  <th className="text-left p-2">Webhook</th>
                  <th className="text-left p-2">Gravado</th>
                  <th className="text-left p-2">Call</th>
                  <th className="text-left p-2">Preview</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const meta = r.event?.metadata_json || {};
                  const stageWebhook = !!r.event;
                  const stageRecorded = !!r.message || !!meta.chat_message_id;
                  return (
                    <tr key={`${r.event?.id || r.message?.id || i}`} className={`border-t border-border align-top ${r.isGap ? 'bg-destructive/5' : ''}`}>
                      <td className="p-2 whitespace-nowrap">{dt(r.event?.created_at || r.message?.created_at || '')}</td>
                      <td className="p-2 font-mono truncate max-w-[200px]" title={r.providerMsgId || ''}>{r.providerMsgId || '—'}</td>
                      <td className="p-2 font-mono truncate max-w-[160px]" title={meta.sender_lid || meta.sender_jid || ''}>{meta.sender_lid || meta.sender_jid || r.message?.customers?.phone || '—'}</td>
                      <td className="p-2 font-mono truncate max-w-[130px]" title={meta.owner_id || r.message?.customers?.owner_id || ''}>{(meta.owner_id || r.message?.customers?.owner_id || '').slice(0, 8) || '—'}</td>
                      <td className="p-2"><StageBadge label="webhook" ok={stageWebhook} /></td>
                      <td className="p-2">
                        <StageBadge label={stageRecorded ? 'gravado' : 'pendente'} ok={stageRecorded} tone={stageWebhook && !stageRecorded ? 'warn' : 'default'} />
                      </td>
                      <td className="p-2">
                        {r.call ? (
                          <a
                            href={`/calls?call_id=${r.call.id}${r.call.wavoip_call_id ? `&wavoip_call_id=${r.call.wavoip_call_id}` : ''}`}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline font-mono"
                            title={`Abrir detalhes da chamada ${r.call.id}`}
                          >
                            <ExternalLink className="w-3 h-3" />
                            {r.call.id.slice(0, 8)}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="p-2 max-w-[260px] truncate text-muted-foreground">{r.message?.content || meta.raw_event || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Gaps focus */}
      {data && data.gaps.length > 0 && (
        <Card className="p-3 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <p className="text-sm font-semibold text-destructive">Eventos WAHA sem gravação ({data.gaps.length})</p>
          </div>
          <div className="max-h-[260px] overflow-y-auto text-xs space-y-1">
            {data.gaps.map((g) => (
              <div key={g.event_id} className="grid grid-cols-4 gap-2 border-b border-border/60 py-1">
                <span className="text-muted-foreground">{dt(g.created_at)}</span>
                <span className="font-mono truncate" title={g.provider_msg_id}>{g.provider_msg_id}</span>
                <span className="font-mono truncate">{g.sender_lid || g.sender_jid || '—'}</span>
                <span className="text-muted-foreground truncate">{g.raw_event}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Recent alerts card — highlights, for the last X minutes, requests that show
// high recording latency, recording errors, or suspicious gaps/dedupes. Fully
// derived from the audit response, no extra network calls.
// -----------------------------------------------------------------------------
type AlertKind = 'gap' | 'latency' | 'recording_error';
interface DerivedAlert {
  kind: AlertKind;
  createdAt: string;
  providerMsgId: string | null;
  senderLid: string | null;
  connectionId: string | null;
  detail: string;
}

function RecentAlertsCard({ data }: { data: AuditResponse | null }) {
  const [windowMin, setWindowMin] = useState(15);
  const [latencyThresholdSec, setLatencyThresholdSec] = useState(30);

  const alerts = useMemo<DerivedAlert[]>(() => {
    if (!data) return [];
    const cutoff = Date.now() - windowMin * 60 * 1000;
    const gapIds = new Set(data.gaps.map((g) => g.event_id));
    const msgByPid = new Map<string, AuditMessage>();
    (data.messages || []).forEach((m) => { if (m.uaz_msg_id) msgByPid.set(m.uaz_msg_id, m); });

    const out: DerivedAlert[] = [];
    for (const ev of data.events || []) {
      const ts = Date.parse(ev.created_at);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      const meta = ev.metadata_json || {};
      if (meta.bucket !== 'message') continue;

      const pid = meta.provider_msg_id || null;
      const senderLid = meta.sender_lid || meta.sender_jid || null;

      // Recording error surfaces from event status or explicit error metadata.
      const status = String(ev.status || meta.status || '').toLowerCase();
      const errText = meta.error || meta.error_message || meta.failure_reason || null;
      if (status.includes('error') || status.includes('failed') || errText) {
        out.push({
          kind: 'recording_error', createdAt: ev.created_at, providerMsgId: pid,
          senderLid, connectionId: ev.connection_id,
          detail: String(errText || status || 'erro'),
        });
        continue;
      }

      // Gap = webhook received but nothing landed in chat_messages.
      if (gapIds.has(ev.id)) {
        out.push({
          kind: 'gap', createdAt: ev.created_at, providerMsgId: pid,
          senderLid, connectionId: ev.connection_id,
          detail: 'webhook sem gravação',
        });
        continue;
      }

      // Latency = webhook stored, but the delta to chat_messages exceeds threshold.
      if (pid) {
        const msg = msgByPid.get(pid);
        if (msg?.created_at) {
          const deltaSec = (Date.parse(msg.created_at) - ts) / 1000;
          if (deltaSec >= latencyThresholdSec) {
            out.push({
              kind: 'latency', createdAt: ev.created_at, providerMsgId: pid,
              senderLid, connectionId: ev.connection_id,
              detail: `gravação demorou ${Math.round(deltaSec)}s`,
            });
          }
        }
      }
    }
    return out
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40);
  }, [data, windowMin, latencyThresholdSec]);

  const counts = useMemo(() => {
    const c = { gap: 0, latency: 0, recording_error: 0 };
    for (const a of alerts) c[a.kind] += 1;
    return c;
  }, [alerts]);

  const kindStyle: Record<AlertKind, { label: string; className: string }> = {
    gap: { label: 'Gap', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    latency: { label: 'Latência alta', className: 'bg-warning/10 text-warning border-warning/20' },
    recording_error: { label: 'Erro de gravação', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  };

  return (
    <Card className={`p-3 ${alerts.length > 0 ? 'border-warning/40' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <AlertTriangle className={`w-4 h-4 ${alerts.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
        <p className="text-sm font-semibold">
          Alertas recentes <span className="text-muted-foreground font-normal">— últimos {windowMin} min</span>
        </p>
        <Badge variant="outline" className="ml-1">{alerts.length}</Badge>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>Janela:</span>
            {[5, 15, 30, 60].map((m) => (
              <Button key={m} size="sm" variant={windowMin === m ? 'default' : 'outline'}
                className="h-6 px-2 text-[11px]" onClick={() => setWindowMin(m)}>
                {m}m
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span>Latência ≥</span>
            <Input
              type="number" min={1} value={latencyThresholdSec}
              onChange={(e) => setLatencyThresholdSec(Math.max(1, Number(e.target.value) || 30))}
              className="h-6 w-16 text-[11px]"
            />
            <span>s</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="rounded border border-border p-2 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Gaps</p>
          <p className={`text-base font-bold tabular-nums ${counts.gap > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{counts.gap}</p>
        </div>
        <div className="rounded border border-border p-2 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Latência alta</p>
          <p className={`text-base font-bold tabular-nums ${counts.latency > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{counts.latency}</p>
        </div>
        <div className="rounded border border-border p-2 text-center">
          <p className="text-[10px] uppercase text-muted-foreground">Erros de gravação</p>
          <p className={`text-base font-bold tabular-nums ${counts.recording_error > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{counts.recording_error}</p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum alerta na janela selecionada.</p>
      ) : (
        <div className="max-h-[220px] overflow-y-auto text-xs">
          <table className="w-full">
            <thead className="text-muted-foreground uppercase text-[10px]">
              <tr>
                <th className="text-left p-1">Quando</th>
                <th className="text-left p-1">Tipo</th>
                <th className="text-left p-1">Message ID</th>
                <th className="text-left p-1">Sender</th>
                <th className="text-left p-1">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, idx) => (
                <tr key={`${a.kind}-${a.providerMsgId || idx}-${a.createdAt}`} className="border-t border-border align-top">
                  <td className="p-1 whitespace-nowrap">{dt(a.createdAt)}</td>
                  <td className="p-1"><Badge variant="outline" className={kindStyle[a.kind].className}>{kindStyle[a.kind].label}</Badge></td>
                  <td className="p-1 font-mono truncate max-w-[200px]" title={a.providerMsgId || ''}>{a.providerMsgId || '—'}</td>
                  <td className="p-1 font-mono truncate max-w-[140px]" title={a.senderLid || ''}>{a.senderLid || '—'}</td>
                  <td className="p-1 text-muted-foreground truncate max-w-[260px]" title={a.detail}>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

