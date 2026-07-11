// Tabela reutilizável de histórico de chamadas com filtros, busca, ordenação,
// paginação, modal de detalhes e assinatura em tempo real do Supabase para
// atualização automática das gravações Wavoip.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  ShieldCheck, Sigma, Clock,
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

type SortKey = 'status' | 'direction' | 'duration_seconds' | 'answered_at' | 'started_at';
type SortDir = 'asc' | 'desc';

export function CallHistoryTable({
  filter,
  title = 'Histórico de chamadas',
  description = 'Todas as ligações registradas na plataforma',
  compact,
  customerId,
  showFilters = true,
}: Props) {
  const pageSize = filter?.limit ?? 25;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Record<string, string>>({});
  // URL persistence (search/filters/sort/page compartilháveis)
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = `ch_${filter?.subCompanyId ?? filter?.ownerId ?? customerId ?? 'g'}`;
  const p = (k: string) => `${scope}.${k}`;
  const gp = (k: string, dflt = '') => searchParams.get(p(k)) ?? dflt;
  const setUrl = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      const key = p(k);
      if (v === null || v === '' || v === 'all' || v === undefined) next.delete(key);
      else next.set(key, String(v));
    });
    setSearchParams(next, { replace: true });
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
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

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
          setRows((prev) => (prev.some((x) => x.id === nrow!.id) ? prev : [nrow as Row, ...prev]));
          enrich([nrow as Row]);
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
        const bucket = r.status === 'ended' && r.answered_at ? 'answered' : r.status;
        if (bucket !== statusFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase().trim();
        const digits = q.replace(/\D+/g, '');
        const phoneDigits = r.phone_number.replace(/\D+/g, '');
        const metadataPhones = [
          (r.metadata as any)?.caller,
          (r.metadata as any)?.callee,
          (r.metadata as any)?.receiver,
          (r.metadata as any)?.from,
          (r.metadata as any)?.to,
        ].map((v) => String(v || ''));
        const matchContact = (r.contact_name || '').toLowerCase().includes(q);
        const matchPhone = r.phone_number.toLowerCase().includes(q)
          || metadataPhones.some((v) => v.toLowerCase().includes(q))
          || (digits.length > 0 && (
            phoneDigits.includes(digits)
            || metadataPhones.some((v) => v.replace(/\D+/g, '').includes(digits))
          ));
        if (!matchContact && !matchPhone) return false;
      }
      return true;
    });
  }, [rows, period, userFilter, connFilter, statusFilter, directionFilter, search]);

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

  // Reset página ao mudar filtros/ordenação
  useEffect(() => { setPage(0); }, [period, userFilter, connFilter, statusFilter, directionFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
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
        status: statusLabelPt(r.status, r.direction),
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
      statusFilter !== 'all' ? `Status: ${statusLabelPt(statusFilter, 'outbound')}` : null,
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
      })),
      { title, subtitle: `${sorted.length} chamada(s) · ${filterSummary}`, filterSummary },
    );
  };

  const directionLabel = (d: string) => d === 'inbound' ? 'Recebida' : 'Efetuada';

  const statusLabelPt = (s: string, direction: string) => {
    const ptMap: Record<string, string> = {
      answered: 'Atendida',
      ended: direction === 'inbound' ? 'Recebida' : 'Efetuada',
      missed: direction === 'inbound' ? 'Perdida' : 'Não atendida',
      failed: 'Falhou',
      rejected: 'Rejeitada',
      initiated: 'Iniciando',
      ringing: 'Chamando',
    };
    return ptMap[s] || s;
  };

  const statusBadge = (s: string, direction: string) => {
    const map: Record<string, string> = {
      answered: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      ended: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      missed: 'bg-destructive/10 text-destructive border-destructive/30',
      failed: 'bg-destructive/10 text-destructive border-destructive/30',
      rejected: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
      initiated: 'bg-primary/10 text-primary border-primary/30',
      ringing: 'bg-primary/10 text-primary border-primary/30',
    };
    return <Badge variant="outline" className={map[s] || ''}>{statusLabelPt(s, direction)}</Badge>;
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
        <div className="flex items-center gap-2">
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
                <SelectItem value="initiated">Iniciando</SelectItem>
                <SelectItem value="ringing">Chamando</SelectItem>
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
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sem chamadas no filtro atual.</p>
        ) : (
          <div className="overflow-x-auto">
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
                    <TableCell>{statusBadge(r.status, r.direction)}</TableCell>
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

            {/* Paginação */}
            <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
              <div>
                Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} de {sorted.length}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7"
                  onClick={() => setPage(0)} disabled={page === 0}>«</Button>
                <Button variant="outline" size="sm" className="h-7"
                  onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="px-2">Página {page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7"
                  onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</Button>
              </div>
            </div>
          </div>
        )}
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
                  <Field label="Status">{statusBadge(detail.status, detail.direction)}</Field>
                  <Field label="Duração" value={durationDisplay(detail)} mono />
                  <Field label="Conexão" value={detail.connection_label || detail.channel} />
                  <Field label="Atendida em"
                    value={detail.answered_at ? new Date(detail.answered_at).toLocaleString('pt-BR') : '—'} />
                  <Field label="Encerrada em"
                    value={detail.ended_at ? new Date(detail.ended_at).toLocaleString('pt-BR') : '—'} />
                  <Field label="Iniciada em"
                    value={new Date(detail.started_at).toLocaleString('pt-BR')} />
                  <Field label="Usuário" value={profiles[detail.user_id || ''] || '—'} />
                </div>
                <div className="pt-2 border-t flex items-center gap-2">
                  {(detail.recording_url || detail.recording_path || (detail.metadata as any)?.wavoip_call_id) ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handlePlay(detail)}>
                        {playingId === detail.id ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                        {playingId === detail.id ? 'Pausar' : 'Ouvir'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDownload(detail)}>
                        <Download className="w-4 h-4 mr-1" /> Baixar
                      </Button>
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
