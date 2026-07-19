// Tabela reutilizável de histórico de chamadas com filtros, busca, ordenação,
// paginação, modal de detalhes e assinatura em tempo real do Supabase para
// atualização automática das gravações Wavoip.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Loader2, Play, Pause, Download, Cloud, Search, RefreshCw, PhoneCall, FileText,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, PhoneIncoming, PhoneOutgoing,
  ShieldCheck, Sigma, Clock, PhoneOff, Radio, PhoneForwarded,
} from 'lucide-react';
import {
  formatDuration, getRecordingSignedUrl, getCallDurationDetails, getReliableCallDurationSeconds,
  formatCallDateTime, formatCallTime, formatCallShort, DISPLAY_TIMEZONE,
  CALL_DURATION_FALLBACK_LABEL, type CallChannel, type CallDurationDetails,
} from '@/lib/callHistory';
import { downloadCsv } from '@/lib/ceoExport';
import { exportCallHistoryPdf } from '@/lib/callsHistoryPdf';
import { toast } from '@/hooks/use-toast';

export interface CallHistoryFilter {
  ownerId?: string | null;
  subCompanyId?: string | null;
  userId?: string | null;
  channel?: CallChannel | 'all';
  connectionLabel?: string | null;
  limit?: number;
}

interface Props {
  filter?: CallHistoryFilter;
  title?: string;
  description?: string;
  compact?: boolean;
  customerId?: string | null;
  showFilters?: boolean;
  /** Persistência de página/tamanho por gestor em localStorage (ex.: "manager-dashboard"). */
  persistKey?: string;
  /** Opções de tamanho de página; quando definido, exibe seletor. */
  pageSizeOptions?: number[];
  /** Renderiza a paginação também no topo do card. */
  showTopPagination?: boolean;
  /** Exibe um seletor amigável "Mais recentes / Mais antigos" para a data. */
  showDateSort?: boolean;
}

interface Row {
  id: string;
  contact_name: string | null;
  phone_number: string;
  channel: string;
  connection_label: string | null;
  direction: string;
  status: string;
  duration_seconds: number;
  started_at: string;
  answered_at: string | null;
  ended_at?: string | null;
  recording_path: string | null;
  recording_url: string | null;
  metadata: Record<string, any> | null;
  user_id: string | null;
  sub_company_id: string | null;
}

interface WavoipEventRow {
  id: string;
  received_at: string;
  event: string | null;
  status: string | null;
  wavoip_call_id: string | null;
  call_id: string | null;
  http_status: number | null;
  error_message: string | null;
  payload: Record<string, any> | null;
}

type SortKey = 'status' | 'direction' | 'duration_seconds' | 'answered_at' | 'started_at';
type SortDir = 'asc' | 'desc';

export function CallHistoryTable({
  filter,
  title = 'Histórico de chamadas',
  description = 'Todas as ligações registradas na plataforma',
  compact,
  customerId,
  showFilters = true,
  persistKey,
  pageSizeOptions,
  showTopPagination = false,
  showDateSort = false,
}: Props) {
  // localStorage por gestor: chaveia por user_id + persistKey para isolar entre contas.
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setMeId(data.user?.id ?? null); });
    return () => { cancelled = true; };
  }, []);
  const lsKey = persistKey && meId ? `callHistoryTable:${persistKey}:${meId}` : null;
  const readLs = <T,>(field: 'page' | 'pageSize', fallback: T): T => {
    if (!lsKey || typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return (parsed?.[field] ?? fallback) as T;
    } catch { return fallback; }
  };
  const writeLs = (patch: { page?: number; pageSize?: number }) => {
    if (!lsKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(lsKey);
      const prev = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(lsKey, JSON.stringify({ ...prev, ...patch }));
    } catch { /* quota/JSON — silencioso */ }
  };

  const defaultPageSize = filter?.limit ?? 25;
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Record<string, string>>({});
  // URL persistence (search/filters/sort/page compartilháveis) sem depender
  // de Router, para funcionar também em testes isolados do componente.
  const [searchParamsSnapshot, setSearchParamsSnapshot] = useState(() => new URLSearchParams(window.location.search));
  const scope = `ch_${filter?.subCompanyId ?? filter?.ownerId ?? customerId ?? 'g'}`;
  const p = (k: string) => `${scope}.${k}`;
  const gp = (k: string, dflt = '') => searchParamsSnapshot.get(p(k)) ?? dflt;
  const setUrl = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(window.location.search);
    Object.entries(patch).forEach(([k, v]) => {
      const key = p(k);
      if (v === null || v === '' || v === 'all' || v === undefined) next.delete(key);
      else next.set(key, String(v));
    });
    const query = next.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    setSearchParamsSnapshot(next);
  };

  const [period, setPeriod] = useState<'today' | '7d' | '30d' | '90d' | 'all'>((gp('period', '30d') as any) || '30d');
  const [userFilter, setUserFilter] = useState<string>(gp('user', 'all'));
  const [connFilter, setConnFilter] = useState<string>(gp('conn', filter?.connectionLabel ?? 'all'));
  const [statusFilter, setStatusFilter] = useState<string>(gp('status', 'all'));
  const [directionFilter, setDirectionFilter] = useState<string>(gp('dir', 'all'));
  const [search, setSearch] = useState(gp('q', ''));
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<SortKey>((gp('sk', 'started_at') as SortKey));
  const [sortDir, setSortDir] = useState<SortDir>((gp('sd', 'desc') as SortDir));
  const [page, setPage] = useState(Math.max(0, parseInt(gp('pg', '0'), 10) || 0));
  const [detail, setDetail] = useState<Row | null>(null);
  const [wavoipEvents, setWavoipEvents] = useState<WavoipEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [pendingInserts, setPendingInserts] = useState<Row[]>([]);
  const liveEnabledRef = useRef(liveEnabled);
  liveEnabledRef.current = liveEnabled;
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;
  const hydratedRef = useRef(false);

  // Hidrata página/tamanho do localStorage quando o gestor é conhecido (uma vez).
  useEffect(() => {
    if (!lsKey || hydratedRef.current) return;
    const savedSize = readLs<number>('pageSize', defaultPageSize);
    const savedPage = readLs<number>('page', 0);
    if (Number.isFinite(savedSize) && savedSize > 0) setPageSize(savedSize);
    if (Number.isFinite(savedPage) && savedPage >= 0) setPage(savedPage);
    // Marca hidratação no próximo tick para evitar que o reset-por-filtro apague o valor restaurado.
    queueMicrotask(() => { hydratedRef.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  // Persiste alterações de página/tamanho.
  useEffect(() => { if (lsKey && hydratedRef.current) writeLs({ page }); /* eslint-disable-next-line */ }, [page, lsKey]);
  useEffect(() => { if (lsKey && hydratedRef.current) writeLs({ pageSize }); /* eslint-disable-next-line */ }, [pageSize, lsKey]);


  // Sincroniza estado -> URL (debounced para busca via effect padrão do React)
  useEffect(() => {
    setUrl({
      period, user: userFilter, conn: connFilter, status: statusFilter,
      dir: directionFilter, q: search, sk: sortKey, sd: sortDir, pg: page || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, userFilter, connFilter, statusFilter, directionFilter, search, sortKey, sortDir, page]);

  const enrich = async (list: Row[]) => {
    const uids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    const sids = Array.from(new Set(list.map((r) => r.sub_company_id).filter(Boolean))) as string[];
    if (uids.length) {
      const { data: p } = await supabase.from('profiles').select('user_id,display_name,email').in('user_id', uids);
      setProfiles((prev) => {
        const next = { ...prev };
        (p || []).forEach((x: any) => { next[x.user_id] = x.display_name || x.email || x.user_id.slice(0, 8); });
        return next;
      });
    }
    if (sids.length) {
      const { data: s } = await (supabase as any).from('sub_companies').select('id,name').in('id', sids);
      setSubs((prev) => {
        const next = { ...prev };
        (s || []).forEach((x: any) => { next[x.id] = x.name; });
        return next;
      });
    }
  };

  const load = async () => {
    setLoading(true);
    let q: any = (supabase as any).from('call_history').select('*')
      .order('started_at', { ascending: false })
      .range(0, 999);
    if (filter?.ownerId) q = q.eq('owner_id', filter.ownerId);
    if (filter?.subCompanyId) q = q.eq('sub_company_id', filter.subCompanyId);
    if (filter?.userId) q = q.eq('user_id', filter.userId);
    if (filter?.channel && filter.channel !== 'all') q = q.eq('channel', filter.channel);
    if (customerId) q = q.eq('customer_id', customerId);
    const { data, error } = await q;
    if (error) console.warn('[CallHistoryTable]', error);
    const list = (data as Row[]) || [];
    setRows(list);
    await enrich(list);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [
    filter?.ownerId, filter?.subCompanyId, filter?.userId, filter?.channel, customerId,
  ]);

  // Assinatura em tempo real: reflete UPDATE/INSERT/DELETE em call_history na UI
  // (substitui o polling anterior — a página não precisa mais ser recarregada).
  useEffect(() => {
    const channel = supabase
      .channel(`call_history_${filter?.ownerId ?? 'all'}_${filter?.subCompanyId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_history' }, (payload: any) => {
        const nrow = payload.new as Row | null;
        const orow = payload.old as Row | null;
        // filtro no cliente para respeitar o escopo do componente
        const scoped = (r: Row | null) => {
          if (!r) return false;
          if (filter?.ownerId && (r as any).owner_id !== filter.ownerId) return false;
          if (filter?.subCompanyId && r.sub_company_id !== filter.subCompanyId) return false;
          if (filter?.userId && r.user_id !== filter.userId) return false;
          if (customerId && (r as any).customer_id !== customerId) return false;
          return true;
        };
        if (payload.eventType === 'INSERT' && scoped(nrow)) {
          if (liveEnabledRef.current) {
            setRows((prev) => (prev.some((x) => x.id === nrow!.id) ? prev : [nrow as Row, ...prev]));
            enrich([nrow as Row]);
          } else {
            setPendingInserts((prev) => (prev.some((x) => x.id === nrow!.id) ? prev : [nrow as Row, ...prev]));
          }
        } else if (payload.eventType === 'UPDATE' && scoped(nrow)) {
          setRows((prev) => prev.map((x) => (x.id === nrow!.id ? { ...x, ...(nrow as Row) } : x)));
        } else if (payload.eventType === 'DELETE' && orow) {
          setRows((prev) => prev.filter((x) => x.id !== orow.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter?.ownerId, filter?.subCompanyId, filter?.userId, customerId]);

  // Sonda leve para detectar quando a Wavoip publica a gravação e persistir no
  // banco. A UI é atualizada via Realtime (canal acima) sem setRows local.
  useEffect(() => {
    const check = async () => {
      const pending = rowsRef.current.filter(
        (r) => !r.recording_url && !r.recording_path && (r.metadata as any)?.wavoip_call_id,
      );
      for (const r of pending) {
        const id = (r.metadata as any).wavoip_call_id as string;
        const url = `https://storage.wavoip.com/${id}`;
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          if (res.ok) {
            await (supabase as any).from('call_history').update({ recording_url: url }).eq('id', r.id);
          }
        } catch { /* ainda não disponível */ }
      }
    };
    const t = setInterval(check, 30000);
    check();
    return () => clearInterval(t);
  }, []);

  const isInProgress = (r: Pick<Row, 'status' | 'ended_at'>) => ['initiated', 'ringing', 'answered'].includes(r.status) && !r.ended_at;
  const isTransferred = (r: Row) => {
    const meta = (r.metadata || {}) as any;
    return r.status === 'transferred'
      || meta.transferred === true
      || Boolean(meta.transfer_type)
      || Boolean(meta.transferred_to)
      || Boolean(meta.transferred_from);
  };

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffMs: Record<string, number | null> = {
      today: 86400_000, '7d': 7 * 86400_000, '30d': 30 * 86400_000, '90d': 90 * 86400_000, all: null,
    };
    const win = cutoffMs[period];
    return rows.filter((r) => {
      if (win && now - new Date(r.started_at).getTime() > win) return false;
      if (userFilter !== 'all' && r.user_id !== userFilter) return false;
      if (connFilter !== 'all' && (r.connection_label || '') !== connFilter) return false;
      if (directionFilter !== 'all' && r.direction !== directionFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'transferred') {
          if (!isTransferred(r)) return false;
        } else {
          const bucket = isInProgress(r) ? 'initiated' : (r.status === 'ended' && r.answered_at ? 'answered' : r.status);
          if (bucket !== statusFilter) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase().trim();
        const digits = q.replace(/\D+/g, '');
        const phoneDigits = r.phone_number.replace(/\D+/g, '');
        const meta = (r.metadata || {}) as any;
        const metadataPhones = [meta.caller, meta.callee, meta.receiver, meta.from, meta.to].map((v) => String(v || ''));
        const agentName = String(profiles[r.user_id || ''] || '').toLowerCase();
        const callIds = [r.id, meta.call_id, meta.wavoip_call_id, meta.session_id]
          .filter(Boolean).map((v) => String(v).toLowerCase());
        const matchContact = (r.contact_name || '').toLowerCase().includes(q);
        const matchAgent = agentName.includes(q);
        const matchIds = callIds.some((v) => v.includes(q));
        const matchPhone = r.phone_number.toLowerCase().includes(q)
          || metadataPhones.some((v) => v.toLowerCase().includes(q))
          || (digits.length > 0 && (
            phoneDigits.includes(digits)
            || metadataPhones.some((v) => v.replace(/\D+/g, '').includes(digits))
          ));
        if (!matchContact && !matchPhone && !matchAgent && !matchIds) return false;
      }
      return true;
    });
  }, [rows, period, userFilter, connFilter, statusFilter, directionFilter, search, profiles]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av: any = (a as any)[sortKey];
      const bv: any = (b as any)[sortKey];
      if (sortKey === 'answered_at' || sortKey === 'started_at') {
        const at = av ? new Date(av).getTime() : 0;
        const bt = bv ? new Date(bv).getTime() : 0;
        return (at - bt) * dir;
      }
      if (sortKey === 'duration_seconds') {
        const ad = getReliableCallDurationSeconds(a) ?? -1;
        const bd = getReliableCallDurationSeconds(b) ?? -1;
        return (ad - bd) * dir;
      }
      return String(av || '').localeCompare(String(bv || '')) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Reset página ao mudar filtros/ordenação — pula a primeira execução para preservar a página restaurada do localStorage.
  const skipFirstResetRef = useRef(true);
  useEffect(() => {
    if (skipFirstResetRef.current) { skipFirstResetRef.current = false; return; }
    setPage(0);
  }, [period, userFilter, connFilter, statusFilter, directionFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Clampa a página quando a paginação encolhe (mudança de tamanho, remoção de linhas em realtime, etc.).
  useEffect(() => { if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1)); }, [page, totalPages]);
  const pageRows = useMemo(
    () => sorted.slice(page * pageSize, page * pageSize + pageSize),
    [sorted, page, pageSize],
  );

  const uniqueUsers = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.user_id && s.add(r.user_id));
    return Array.from(s);
  }, [rows]);

  const uniqueConns = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.connection_label && s.add(r.connection_label));
    return Array.from(s);
  }, [rows]);

  const resolveRecordingUrl = async (r: Row): Promise<string | null> => {
    if (r.recording_url) return r.recording_url;
    const wavoipId = (r.metadata as any)?.wavoip_call_id;
    if (wavoipId) return `https://storage.wavoip.com/${wavoipId}`;
    if (r.recording_path) return await getRecordingSignedUrl(r.recording_path);
    return null;
  };

  const setError = (id: string, msg: string | null) =>
    setAudioErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg; else delete next[id];
      return next;
    });

  const handlePlay = async (r: Row) => {
    if (playingId === r.id && audioEl) { audioEl.pause(); setPlayingId(null); return; }
    setError(r.id, null);
    setAudioLoading(r.id);
    try {
      const url = await resolveRecordingUrl(r);
      if (!url) {
        setError(r.id, 'Gravação ainda não publicada pela Wavoip.');
        toast({ title: 'Gravação indisponível', description: 'Pode levar alguns minutos após o fim da chamada.', variant: 'destructive' });
        return;
      }
      if (audioEl) audioEl.pause();
      const a = new Audio(url);
      a.onended = () => setPlayingId(null);
      a.onerror = () => {
        setError(r.id, 'Falha ao carregar áudio.');
        setPlayingId(null);
        toast({ title: 'Falha ao reproduzir', description: 'Não foi possível carregar a gravação.', variant: 'destructive' });
      };
      await a.play();
      setAudioEl(a);
      setPlayingId(r.id);
    } catch (err: any) {
      setError(r.id, err?.message || 'Erro ao reproduzir.');
      toast({ title: 'Falha ao reproduzir', description: String(err?.message || err), variant: 'destructive' });
    } finally {
      setAudioLoading(null);
    }
  };

  const handleDownload = async (r: Row) => {
    setError(r.id, null);
    setDownloadingId(r.id);
    try {
      const url = await resolveRecordingUrl(r);
      if (!url) {
        setError(r.id, 'Gravação ainda não publicada.');
        toast({ title: 'Gravação indisponível', description: 'Aguarde a Wavoip publicar o áudio.', variant: 'destructive' });
        return;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `chamada-${r.id}.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'mp3'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch (err: any) {
      setError(r.id, err?.message || 'Falha no download.');
      toast({ title: 'Falha ao baixar', description: 'Abrindo em nova aba como alternativa.', variant: 'destructive' });
      const url = await resolveRecordingUrl(r);
      if (url) window.open(url, '_blank', 'noopener');
    } finally {
      setDownloadingId(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(`historico-chamadas-${Date.now()}.csv`, sorted.map((r) => {
      const d = getCallDurationDetails(r);
      return {
        iniciada_em: formatCallDateTime(r.started_at),
        atendida_em: formatCallDateTime(r.answered_at),
        encerrada_em: formatCallDateTime(r.ended_at),
        iniciada_em_iso: r.started_at || '',
        atendida_em_iso: r.answered_at || '',
        encerrada_em_iso: r.ended_at || '',
        timezone: DISPLAY_TIMEZONE,
        contato: r.contact_name || '—',
        numero: r.phone_number,
        canal: r.channel,
        conexao: r.connection_label || '—',
        direcao: directionLabel(r.direction),
        status: statusLabelPt(r),
        duracao_hms: d.seconds !== null ? formatDuration(d.seconds) : (CALL_DURATION_FALLBACK_LABEL[d.reason || 'invalid']),
        duracao_segundos: d.seconds ?? '',
        origem_duracao: d.source ?? 'indisponivel',
        usuario: profiles[r.user_id || ''] || '—',
        sub_empresa: subs[r.sub_company_id || ''] || '—',
      };
    }));
  };

  const exportPdf = async () => {
    const filterSummary = [
      period !== 'all' ? { today: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias' }[period] : 'Todo período',
      directionFilter !== 'all' ? `Direção: ${directionLabel(directionFilter)}` : null,
      statusFilter !== 'all' ? `Status: ${statusFilterLabel(statusFilter)}` : null,
      search ? `Busca: "${search}"` : null,
      `Fuso: ${DISPLAY_TIMEZONE}`,
    ].filter(Boolean).join(' · ');
    await exportCallHistoryPdf(
      sorted.map((r) => ({
        started_at: r.started_at,
        answered_at: r.answered_at,
        ended_at: r.ended_at,
        duration_seconds: getReliableCallDurationSeconds(r) ?? 0,
        contact_name: r.contact_name,
        phone_number: r.phone_number,
        direction: r.direction,
        status: r.status,
        channel: r.channel,
        connection_label: r.connection_label,
        user_name: profiles[r.user_id || ''] || null,
        call_id: (r.metadata as any)?.call_id ?? r.id,
        wavoip_call_id: (r.metadata as any)?.wavoip_call_id ?? null,
        audit_timestamps: [
          r.answered_at ? `answeredAt ${formatCallDateTime(r.answered_at)}` : null,
          r.ended_at ? `endedAt ${formatCallDateTime(r.ended_at)}` : null,
          (r.metadata as any)?.last_webhook_received_at ? `recv ${formatCallDateTime((r.metadata as any).last_webhook_received_at)}` : null,
          (r.metadata as any)?.webhook_answered_at ? `ans ${formatCallDateTime((r.metadata as any).webhook_answered_at)}` : null,
          (r.metadata as any)?.webhook_ended_at ? `end ${formatCallDateTime((r.metadata as any).webhook_ended_at)}` : null,
        ].filter(Boolean).join(' | '),
      })),
      { title, subtitle: `${sorted.length} chamada(s) · ${filterSummary}`, filterSummary },
    );
  };

  useEffect(() => {
    let cancelled = false;
    const loadTimeline = async () => {
      if (!detail) {
        setWavoipEvents([]);
        return;
      }
      const meta = (detail.metadata || {}) as any;
      const wavoipId = meta.wavoip_call_id;
      const callId = meta.call_id;
      if (!wavoipId && !callId && !detail.id) {
        setWavoipEvents([]);
        return;
      }
      setEventsLoading(true);
      try {
        let q: any = (supabase as any)
          .from('wavoip_webhook_events')
          .select('id,received_at,event,status,wavoip_call_id,call_id,http_status,error_message,payload')
          .order('received_at', { ascending: true })
          .limit(80);
        const filters = [`call_history_id.eq.${detail.id}`];
        if (wavoipId) filters.push(`wavoip_call_id.eq.${wavoipId}`);
        if (callId) filters.push(`call_id.eq.${callId}`);
        q = q.or(filters.join(','));
        const { data, error } = await q;
        if (!cancelled) setWavoipEvents(error ? [] : (data || []));
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    };
    loadTimeline();
    return () => { cancelled = true; };
  }, [detail?.id]);

  const directionLabel = (d: string) => d === 'inbound' ? 'Recebida' : 'Efetuada';

  const statusLabelPt = (r: Pick<Row, 'status' | 'direction' | 'ended_at'>) => {
    if (isInProgress(r)) return 'Em ligação';
    const ptMap: Record<string, string> = {
      answered: 'Atendida',
      ended: r.direction === 'inbound' ? 'Recebida' : 'Efetuada',
      missed: r.direction === 'inbound' ? 'Perdida' : 'Não atendida',
      failed: 'Falhou',
      rejected: 'Rejeitada',
      initiated: 'Em ligação',
      ringing: 'Em ligação',
    };

    return ptMap[r.status] || r.status;
  };

  const statusFilterLabel = (status: string) => {
    if (status === 'initiated' || status === 'ringing') return 'Em ligação';
    return statusLabelPt({ status, direction: 'outbound', ended_at: new Date().toISOString() } as Row);
  };

  const statusBadge = (r: Pick<Row, 'status' | 'direction' | 'ended_at'>) => {
    const map: Record<string, string> = {
      answered: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      ended: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      missed: 'bg-destructive/10 text-destructive border-destructive/30',
      failed: 'bg-destructive/10 text-destructive border-destructive/30',
      rejected: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
      initiated: 'bg-primary/10 text-primary border-primary/30',
      ringing: 'bg-primary/10 text-primary border-primary/30',
    };
    const badgeClass = isInProgress(r) ? map.initiated : map[r.status];
    return <Badge variant="outline" className={badgeClass || ''}>{statusLabelPt(r)}</Badge>;
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const SortableHead = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        aria-label={`Ordenar por ${children}`}
      >
        {children} <SortIcon col={col} />
      </button>
    </TableHead>
  );

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><PhoneCall className="w-4 h-4" />{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setLiveEnabled((v) => !v)}
            aria-pressed={liveEnabled}
            title={liveEnabled ? 'Atualização em tempo real ativa — clique para pausar' : 'Pausado — clique para retomar'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-medium transition-colors ${liveEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-border bg-muted text-muted-foreground'}`}
          >
            <Radio className={`w-3 h-3 ${liveEnabled ? 'animate-pulse' : ''}`} />
            {liveEnabled ? 'Ao vivo' : 'Pausado'}
          </button>
          {pendingInserts.length > 0 && (
            <Button
              size="sm" variant="outline"
              className="h-7 text-[11px] border-primary/40 text-primary"
              onClick={() => {
                setRows((prev) => {
                  const seen = new Set(prev.map((x) => x.id));
                  const merged = [...pendingInserts.filter((x) => !seen.has(x.id)), ...prev];
                  return merged;
                });
                enrich(pendingInserts);
                setPendingInserts([]);
              }}
            >
              {pendingInserts.length} nova{pendingInserts.length > 1 ? 's' : ''} — mostrar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="w-4 h-4 mr-1" />PDF</Button>
        </div>
      </CardHeader>
      <CardContent>
        {showFilters && (
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por contato ou número (origem/destino)"
                aria-label="Buscar histórico de chamadas"
                className="h-8 pl-7 w-72 text-xs" />
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
              </SelectContent>
            </Select>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Direção" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas direções</SelectItem>
                <SelectItem value="outbound">Efetuadas</SelectItem>
                <SelectItem value="inbound">Recebidas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="answered">Atendida</SelectItem>
                <SelectItem value="ended">Encerrada</SelectItem>
                <SelectItem value="missed">Perdida / Não atendida</SelectItem>
                <SelectItem value="rejected">Rejeitada</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="initiated">Em ligação</SelectItem>
                <SelectItem value="ringing">Em ligação (chamando)</SelectItem>

              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Usuário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos usuários</SelectItem>
                {uniqueUsers.map((u) => <SelectItem key={u} value={u}>{profiles[u] || u.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={connFilter} onValueChange={setConnFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Conexão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas conexões</SelectItem>
                {uniqueConns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {(() => {
          const PaginationBar = ({ position }: { position: 'top' | 'bottom' }) => (
            <div
              data-testid={`call-history-pagination-${position}`}
              className={`flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground ${position === 'top' ? 'pb-3' : 'pt-3'}`}
            >
              <div>
                Mostrando {sorted.length === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} de {sorted.length}
              </div>
              <div className="flex items-center gap-1">
                {pageSizeOptions && pageSizeOptions.length > 0 && (
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                    <SelectTrigger className="h-7 w-24 text-xs" aria-label="Itens por página">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pageSizeOptions.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} / pág.</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" className="h-7"
                  aria-label="Primeira página"
                  onClick={() => setPage(0)} disabled={page === 0}>«</Button>
                <Button variant="outline" size="sm" className="h-7"
                  aria-label="Página anterior"
                  onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="px-2">Página {page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7"
                  aria-label="Próxima página"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7"
                  aria-label="Última página"
                  onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</Button>
              </div>
            </div>
          );

          const DateSortSelector = () => (
            <div className="flex items-center gap-2 pb-3">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Ordenar por data</span>
              <Select
                value={sortKey === 'started_at' && sortDir === 'desc' ? 'newest' : sortKey === 'started_at' && sortDir === 'asc' ? 'oldest' : 'custom'}
                onValueChange={(v) => {
                  if (v === 'newest') { setSortKey('started_at'); setSortDir('desc'); }
                  else if (v === 'oldest') { setSortKey('started_at'); setSortDir('asc'); }
                }}
              >
                <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Mais recentes primeiro</SelectItem>
                  <SelectItem value="oldest">Mais antigas primeiro</SelectItem>
                  {sortKey !== 'started_at' && <SelectItem value="custom">Personalizada ({sortKey})</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          );

          if (loading) {
            return (
              <div data-testid="call-history-skeleton" className="space-y-2 py-2" aria-busy="true" aria-live="polite">
                <span className="sr-only">Carregando chamadas…</span>
                {Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-md bg-muted/40 animate-pulse h-10 px-3">
                    <div className="h-3 w-32 bg-muted rounded" />
                    <div className="h-3 w-24 bg-muted rounded" />
                    <div className="h-3 w-20 bg-muted rounded ml-auto" />
                  </div>
                ))}
              </div>
            );
          }

          if (sorted.length === 0) {
            return (
              <div
                data-testid="call-history-empty"
                className="flex flex-col items-center justify-center text-center py-10 gap-2"
              >
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                  <PhoneOff className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Nenhuma chamada recente</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Assim que a equipe realizar ou receber ligações, elas aparecerão aqui em tempo real.
                </p>
                <Button variant="outline" size="sm" className="mt-1 h-8" onClick={load}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
                </Button>
              </div>
            );
          }

          return (
            <div className="overflow-x-auto">
              {showDateSort && <DateSortSelector />}
              {showTopPagination && <PaginationBar position="top" />}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contato</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Conexão</TableHead>
                    {!compact && <TableHead>Usuário</TableHead>}
                    <SortableHead col="direction">Direção</SortableHead>
                    <SortableHead col="duration_seconds">Duração</SortableHead>
                    <SortableHead col="answered_at">Atendida em</SortableHead>
                    <SortableHead col="status">Status</SortableHead>
                    <SortableHead col="started_at">Data</SortableHead>
                    <TableHead className="text-right">Gravação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setDetail(r)}
                    >
                      <TableCell className="font-medium">{r.contact_name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.phone_number}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{r.connection_label || r.channel}</Badge>
                      </TableCell>
                      {!compact && <TableCell className="text-xs">{profiles[r.user_id || ''] || '—'}</TableCell>}
                      <TableCell className="text-xs">{directionLabel(r.direction)}</TableCell>
                      <TableCell className="font-mono text-xs"><DurationCell call={r} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatCallTime(r.answered_at)}</TableCell>
                      <TableCell>{statusBadge(r)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatCallShort(r.started_at)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {(r.recording_url || r.recording_path || (r.metadata as any)?.wavoip_call_id) ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                disabled={audioLoading === r.id}
                                onClick={() => handlePlay(r)} title="Ouvir">
                                {audioLoading === r.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : playingId === r.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                disabled={downloadingId === r.id}
                                onClick={() => handleDownload(r)} title="Baixar">
                                {downloadingId === r.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Download className="w-3.5 h-3.5" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => toast({ title: 'Google Drive em breve', description: 'A integração será configurada em uma próxima etapa.' })}
                                title="Enviar ao Google Drive">
                                <Cloud className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            {audioErrors[r.id] && (
                              <span className="text-[10px] text-destructive">{audioErrors[r.id]}</span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-dashed">
                            Aguardando gravação
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <PaginationBar position="bottom" />
            </div>
          );
        })()}
      </CardContent>

      {/* Modal de detalhes da chamada */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.direction === 'inbound'
                    ? <PhoneIncoming className="w-4 h-4 text-emerald-500" />
                    : <PhoneOutgoing className="w-4 h-4 text-sky-500" />}
                  {detail.contact_name || detail.phone_number}
                </DialogTitle>
                <DialogDescription>Detalhes da chamada</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={detail.direction === 'inbound' ? 'Origem (caller)' : 'Destino (callee)'} value={detail.phone_number} mono />
                  <Field label="Contato" value={detail.contact_name || '—'} />
                  <Field label="Direção" value={directionLabel(detail.direction)} />
                  <Field label="Status">{statusBadge(detail)}</Field>
                  <Field label="Duração"><DurationCell call={detail} /></Field>
                  <Field label="Conexão" value={detail.connection_label || detail.channel} />
                  <Field label="Atendida em" value={formatCallDateTime(detail.answered_at)} />
                  <Field label="Encerrada em" value={formatCallDateTime(detail.ended_at)} />
                  <Field label="Iniciada em" value={formatCallDateTime(detail.started_at)} />
                  <Field label="Usuário" value={profiles[detail.user_id || ''] || '—'} />
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Auditoria Wavoip</p>
                    <Badge variant="outline" className="text-[10px]">{wavoipEvents.length} eventos</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Field label="call_id" value={(detail.metadata as any)?.call_id || '—'} mono />
                    <Field label="wavoip_call_id" value={(detail.metadata as any)?.wavoip_call_id || '—'} mono />
                    <Field label="Webhook recebido" value={formatCallDateTime((detail.metadata as any)?.last_webhook_received_at)} />
                    <Field label="Answered webhook" value={formatCallDateTime((detail.metadata as any)?.webhook_answered_at)} />
                    <Field label="Ended webhook" value={formatCallDateTime((detail.metadata as any)?.webhook_ended_at)} />
                    <Field label="Fonte duração" value={(detail.metadata as any)?.duration_source || '—'} />
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Timeline dos eventos</p>
                    {eventsLoading ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Carregando eventos…</p>
                    ) : wavoipEvents.length ? (
                      <ol className="space-y-2 max-h-56 overflow-y-auto">
                        {wavoipEvents.map((ev) => (
                          <li key={ev.id} className="grid grid-cols-[92px_1fr] gap-2 text-xs">
                            <span className="font-mono text-muted-foreground">{formatCallTime(ev.received_at)}</span>
                            <span>
                              <span className="font-semibold">{ev.event || 'evento'}</span>
                              {ev.status && <span className="text-muted-foreground"> · {ev.status}</span>}
                              {ev.http_status && <span className="text-muted-foreground"> · HTTP {ev.http_status}</span>}
                              {ev.error_message && <span className="text-destructive"> · {ev.error_message}</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum evento de webhook vinculado a esta chamada.</p>
                    )}
                  </div>
                </div>
                <div className="pt-2 border-t flex flex-col gap-2">
                  {(detail.recording_url || detail.recording_path || (detail.metadata as any)?.wavoip_call_id) ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" disabled={audioLoading === detail.id} onClick={() => handlePlay(detail)}>
                          {audioLoading === detail.id
                            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            : playingId === detail.id ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                          {audioLoading === detail.id ? 'Carregando…' : playingId === detail.id ? 'Pausar' : 'Ouvir'}
                        </Button>
                        <Button size="sm" variant="outline" disabled={downloadingId === detail.id} onClick={() => handleDownload(detail)}>
                          {downloadingId === detail.id
                            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            : <Download className="w-4 h-4 mr-1" />}
                          {downloadingId === detail.id ? 'Baixando…' : 'Baixar'}
                        </Button>
                      </div>
                      {audioErrors[detail.id] && (
                        <p className="text-xs text-destructive">{audioErrors[detail.id]}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Gravação ainda não publicada. A tabela atualiza automaticamente quando ficar disponível.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, value, children, mono }: { label: string; value?: string; children?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      {children ?? <p className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</p>}
    </div>
  );
}

// Célula profissional de duração: exibe hh:mm:ss quando há duração confiável,
// e um badge indicando o motivo (Em andamento / Sem encerramento) caso contrário.
// Ocultamos cálculos aproximados — só mostramos tempos com marco terminal real.
function DurationCell({ call }: { call: Parameters<typeof getCallDurationDetails>[0] }) {
  const d = getCallDurationDetails(call);
  if (d.seconds === null) {
    const label = CALL_DURATION_FALLBACK_LABEL[d.reason || 'invalid'];
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-dashed gap-1">
              <Clock className="w-3 h-3" />{label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">
            Sem marco de encerramento — duração não é calculada até haver ended_at oficial.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const icon = d.source === 'official'
    ? <ShieldCheck className="w-3 h-3 text-emerald-500" />
    : <Sigma className="w-3 h-3 text-muted-foreground" />;
  const tip = d.source === 'official'
    ? 'Duração oficial reportada pelo Wavoip.'
    : 'Duração derivada de answered_at → ended_at (auditável).';
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            {icon}
            <span className="font-mono">{formatDuration(d.seconds)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
