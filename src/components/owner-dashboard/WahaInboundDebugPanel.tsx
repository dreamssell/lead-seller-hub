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
import { AlertTriangle, RefreshCcw, Search, Radio, Activity, FileDown, FileText, ArrowDown, ArrowUp } from 'lucide-react';
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
  calls?: Array<{
    id: string; wavoip_call_id: string | null; phone_number: string | null; contact_name: string | null;
    direction: string | null; status: string | null; duration_seconds: number | null;
    started_at: string | null; answered_at: string | null; ended_at: string | null; created_at: string;
  }>;
  pagination?: { limit: number; order: 'asc' | 'desc'; next_cursor: string | null };
}

const dt = (iso: string) => new Date(iso).toLocaleString('pt-BR');

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
  const [renderTick, setRenderTick] = useState(0);
  const lastRealtimeRef = useRef<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);

  const fetchAudit = useCallback(async (opts?: { cursor?: string | null; order?: 'asc' | 'desc' }) => {
    if (!ownerId) return;
    setLoading(true); setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('waha-audit', {
        body: {
          owner_id: ownerId,
          message_id: messageIdFilter || null,
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
  }, [ownerId, messageIdFilter, order, cursor]);

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

  const exportRows = useMemo(() => {
    if (!data) return [] as Array<Record<string, string | number>>;
    const callsByPhone = new Map<string, { call_id: string; wavoip_call_id: string | null; answered_at: string | null; ended_at: string | null }>();
    (data.calls || []).forEach((c) => {
      const key = (c.phone_number || '').replace(/\D/g, '');
      if (key) callsByPhone.set(key, { call_id: c.id, wavoip_call_id: c.wavoip_call_id, answered_at: c.answered_at, ended_at: c.ended_at });
    });
    const msgByPid = new Map<string, AuditMessage>();
    (data.messages || []).forEach((m) => { if (m.uaz_msg_id) msgByPid.set(m.uaz_msg_id, m); });
    const rowsOut: Array<Record<string, string | number>> = [];
    for (const ev of data.events || []) {
      const meta = ev.metadata_json || {};
      if (meta.bucket !== 'message') continue;
      const msg = meta.provider_msg_id ? msgByPid.get(meta.provider_msg_id) : undefined;
      const phone = (msg?.customers?.phone || meta.sender_jid || '').replace(/\D/g, '');
      const call = phone ? callsByPhone.get(phone) : undefined;
      rowsOut.push({
        webhook_at: ev.created_at,
        message_id: meta.provider_msg_id || '',
        sender_lid: meta.sender_lid || meta.sender_jid || '',
        owner_id: meta.owner_id || msg?.customers?.owner_id || '',
        recorded: msg ? 'sim' : 'nao',
        recorded_at: msg?.created_at || '',
        preview: (msg?.content || meta.raw_event || '').toString().slice(0, 200),
        call_id: call?.call_id || '',
        wavoip_call_id: call?.wavoip_call_id || '',
        call_answered_at: call?.answered_at || '',
        call_ended_at: call?.ended_at || '',
      });
    }
    return rowsOut;
  }, [data]);

  const handleExportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadCsv(`waha-audit-${ownerId}-${stamp}.csv`, exportRows);
  };
  const handleExportPdf = () => {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadPdf(
      `waha-audit-${ownerId}-${stamp}.pdf`,
      'Auditoria WAHA — pipeline inbound',
      `Owner ${ownerId} · desde ${new Date(data.stats.since_iso).toLocaleString('pt-BR')} · ordem ${order}`,
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

  // Realtime subscription
  useEffect(() => {
    if (!ownerId || connectionIds.length === 0) return;
    const filter = `connection_id=in.(${connectionIds.join(',')})`;
    const channel = supabase
      .channel(`waha-debug-${ownerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        lastRealtimeRef.current = new Date().toISOString();
        setRenderTick((t) => t + 1);
        // opportunistic refresh so gap counts update
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
      event: AuditEvent | null; message: AuditMessage | null; providerMsgId: string | null;
    }>;
    const byMsgId = new Map<string, AuditMessage>();
    (data.messages || []).forEach((m) => { if (m.uaz_msg_id) byMsgId.set(m.uaz_msg_id, m); });
    const seen = new Set<string>();
    const out: Array<{ event: AuditEvent | null; message: AuditMessage | null; providerMsgId: string | null }> = [];
    for (const ev of data.events || []) {
      const meta = ev.metadata_json || {};
      if (meta.bucket !== 'message') continue;
      const pid = meta.provider_msg_id || null;
      const key = `ev:${ev.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ event: ev, message: pid ? byMsgId.get(pid) || null : null, providerMsgId: pid });
    }
    // orphan messages (no matching event within window)
    const eventPids = new Set((data.events || []).map((e) => e.metadata_json?.provider_msg_id).filter(Boolean));
    for (const m of data.messages || []) {
      if (!m.uaz_msg_id || eventPids.has(m.uaz_msg_id)) continue;
      out.push({ event: null, message: m, providerMsgId: m.uaz_msg_id });
    }
    return out.slice(0, 120);
  }, [data]);

  if (!ownerId) {
    return <Card className="p-6 text-sm text-muted-foreground">Owner sem canal WAHA para auditar.</Card>;
  }

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
          <Button size="sm" onClick={() => setMessageIdFilter(pendingMsgId.trim())}>Aplicar filtro</Button>
          <Button size="sm" variant="outline" onClick={() => { setPendingMsgId(''); setMessageIdFilter(''); }}>Limpar</Button>
          <Button size="sm" variant="outline" onClick={() => fetchAudit()} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Recarregar
          </Button>
          <Button size="sm" variant="outline" onClick={toggleOrder} title="Alternar ordenação por created_at">
            {order === 'desc' ? <ArrowDown className="w-3.5 h-3.5 mr-1" /> : <ArrowUp className="w-3.5 h-3.5 mr-1" />}
            {order === 'desc' ? 'Mais recentes' : 'Mais antigos'}
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrevPage} disabled={loading || cursorStack.length === 0}>← Anterior</Button>
          <Button size="sm" variant="outline" onClick={handleNextPage} disabled={loading || !data?.pagination?.next_cursor}>Próxima →</Button>
          <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={loading || !data}>
            <FileDown className="w-3.5 h-3.5 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={loading || !data}>
            <FileText className="w-3.5 h-3.5 mr-1" /> PDF
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Radio className={`w-3.5 h-3.5 ${realtimeStatus === 'connected' ? 'text-success' : realtimeStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
            Realtime {realtimeStatus === 'connected' ? 'ativo' : realtimeStatus === 'error' ? 'com erro' : 'inicializando'}
            {renderTick > 0 && <span className="text-muted-foreground">· {renderTick} eventos renderizados</span>}
          </div>
        </div>
      </Card>

      {/* Alerts */}
      {data && data.alerts?.length > 0 && (
        <Card className="p-3 border-warning/40 bg-warning/5">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
            <div>
              <p className="font-semibold text-warning">Alertas de telemetria</p>
              <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                {data.alerts.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          </div>
        </Card>
      )}

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
          <p className="text-sm font-semibold">Pipeline webhook → gravação → realtime → render</p>
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
                  <th className="text-left p-2">Preview</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const meta = r.event?.metadata_json || {};
                  const stageWebhook = !!r.event;
                  const stageRecorded = !!r.message || !!meta.chat_message_id;
                  return (
                    <tr key={`${r.event?.id || r.message?.id || i}`} className="border-t border-border align-top">
                      <td className="p-2 whitespace-nowrap">{dt(r.event?.created_at || r.message?.created_at || '')}</td>
                      <td className="p-2 font-mono truncate max-w-[200px]" title={r.providerMsgId || ''}>{r.providerMsgId || '—'}</td>
                      <td className="p-2 font-mono truncate max-w-[160px]" title={meta.sender_lid || meta.sender_jid || ''}>{meta.sender_lid || meta.sender_jid || r.message?.customers?.phone || '—'}</td>
                      <td className="p-2 font-mono truncate max-w-[130px]" title={meta.owner_id || r.message?.customers?.owner_id || ''}>{(meta.owner_id || r.message?.customers?.owner_id || '').slice(0, 8) || '—'}</td>
                      <td className="p-2"><StageBadge label="webhook" ok={stageWebhook} /></td>
                      <td className="p-2">
                        <StageBadge label={stageRecorded ? 'gravado' : 'pendente'} ok={stageRecorded} tone={stageWebhook && !stageRecorded ? 'warn' : 'default'} />
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
