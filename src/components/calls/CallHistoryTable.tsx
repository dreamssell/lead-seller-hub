// Tabela reutilizável de histórico de chamadas com filtros
// (período, usuário, conexão), player de áudio, download e export CSV.
// Também mostra placeholder para "Enviar ao Google Drive" (a configurar).
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Play, Pause, Download, Cloud, Search, RefreshCw, PhoneCall, FileText } from 'lucide-react';
import { formatDuration, getRecordingSignedUrl, type CallChannel } from '@/lib/callHistory';
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

export function CallHistoryTable({
  filter,
  title = 'Histórico de chamadas',
  description = 'Todas as ligações registradas na plataforma',
  compact,
  customerId,
  showFilters = true,
}: Props) {
  const pageSize = filter?.limit ?? 50;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | '90d' | 'all'>('30d');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [connFilter, setConnFilter] = useState<string>(filter?.connectionLabel ?? 'all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);


  const buildQuery = (from: number, to: number) => {
    let q: any = (supabase as any).from('call_history').select('*')
      .order('started_at', { ascending: false })
      .range(from, to);
    if (filter?.ownerId) q = q.eq('owner_id', filter.ownerId);
    if (filter?.subCompanyId) q = q.eq('sub_company_id', filter.subCompanyId);
    if (filter?.userId) q = q.eq('user_id', filter.userId);
    if (filter?.channel && filter.channel !== 'all') q = q.eq('channel', filter.channel);
    if (customerId) q = q.eq('customer_id', customerId);
    return q;
  };

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
    const { data, error } = await buildQuery(0, pageSize - 1);
    if (error) console.warn('[CallHistoryTable]', error);
    const list = (data as Row[]) || [];
    setRows(list);
    setHasMore(list.length === pageSize);
    await enrich(list);
    setLoading(false);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const { data, error } = await buildQuery(rows.length, rows.length + pageSize - 1);
    if (error) console.warn('[CallHistoryTable]', error);
    const list = (data as Row[]) || [];
    setRows((prev) => [...prev, ...list]);
    setHasMore(list.length === pageSize);
    await enrich(list);
    setLoadingMore(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [
    filter?.ownerId, filter?.subCompanyId, filter?.userId, filter?.channel, customerId,
  ]);

  // Polling: verifica se gravações da Wavoip já foram publicadas e atualiza a linha.
  // Wavoip publica em https://storage.wavoip.com/{callId} alguns minutos após o fim.
  useEffect(() => {
    const pending = rows.filter(
      (r) => !r.recording_url && !r.recording_path && (r.metadata as any)?.wavoip_call_id,
    );
    if (pending.length === 0) return;
    let cancelled = false;
    const check = async () => {
      for (const r of pending) {
        if (cancelled) return;
        const id = (r.metadata as any).wavoip_call_id as string;
        const url = `https://storage.wavoip.com/${id}`;
        try {
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          if (res.ok) {
            await (supabase as any).from('call_history').update({ recording_url: url }).eq('id', r.id);
            if (!cancelled) setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, recording_url: url } : x)));
          }
        } catch { /* CORS/404 → ainda não disponível */ }
      }
    };
    const t = setInterval(check, 30000);
    check();
    return () => { cancelled = true; clearInterval(t); };
  }, [rows]);

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
        // agrupa answered/ended como "atendida"
        const bucket = r.status === 'ended' && r.answered_at ? 'answered' : r.status;
        if (bucket !== statusFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !(r.contact_name || '').toLowerCase().includes(q) &&
          !r.phone_number.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, period, userFilter, connFilter, statusFilter, directionFilter, search]);


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
    // 1) URL direta (Wavoip storage.wavoip.com ou externo)
    if (r.recording_url) return r.recording_url;
    // 2) ID Wavoip salvo em metadata → monta a URL oficial
    const wavoipId = (r.metadata as any)?.wavoip_call_id;
    if (wavoipId) return `https://storage.wavoip.com/${wavoipId}`;
    // 3) Fallback: arquivo em bucket privado
    if (r.recording_path) return await getRecordingSignedUrl(r.recording_path);
    return null;
  };

  const handlePlay = async (r: Row) => {
    const url = await resolveRecordingUrl(r);
    if (!url) { toast({ title: 'Gravação indisponível', description: 'A Wavoip pode levar alguns minutos para publicar o áudio após o fim da chamada.', variant: 'destructive' }); return; }
    if (playingId === r.id && audioEl) { audioEl.pause(); setPlayingId(null); return; }
    if (audioEl) audioEl.pause();
    const a = new Audio(url);
    a.play().catch(() => toast({ title: 'Não foi possível reproduzir', description: 'A gravação pode ainda não estar disponível.', variant: 'destructive' }));
    a.onended = () => setPlayingId(null);
    setAudioEl(a);
    setPlayingId(r.id);
  };

  const handleDownload = async (r: Row) => {
    let url = await resolveRecordingUrl(r);
    if (!url) { toast({ title: 'Gravação indisponível', description: 'A Wavoip pode levar alguns minutos para publicar o áudio.', variant: 'destructive' }); return; }
    // Para arquivos privados no bucket, resolveRecordingUrl já devolve signed URL.
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `chamada-${r.id}.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'mp3'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch (e: any) {
      // Fallback: abre em nova aba (CORS-safe)
      window.open(url, '_blank', 'noopener');
    }
  };

  const durationDisplay = (r: Row): string => {
    if (r.duration_seconds && r.duration_seconds > 0) return formatDuration(r.duration_seconds);
    // Fallback: se não temos duração salva, calcula pelo dial time até now/ended_at.
    const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
    const start = r.answered_at ? new Date(r.answered_at).getTime() : new Date(r.started_at).getTime();
    const s = Math.max(0, Math.round((end - start) / 1000));
    return s > 0 ? formatDuration(s) : '—';
  };


  const exportCsv = () => {
    downloadCsv(`historico-chamadas-${Date.now()}.csv`, filtered.map((r) => ({
      data: new Date(r.started_at).toLocaleString('pt-BR'),
      contato: r.contact_name || '—',
      numero: r.phone_number,
      canal: r.channel,
      conexao: r.connection_label || '—',
      direcao: directionLabel(r.direction),
      status: statusLabelPt(r.status, r.direction),
      duracao: formatDuration(r.duration_seconds),
      usuario: profiles[r.user_id || ''] || '—',
      sub_empresa: subs[r.sub_company_id || ''] || '—',
    })));
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
        </div>
      </CardHeader>
      <CardContent>
        {showFilters && (
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contato ou número"
                className="h-8 pl-7 w-56 text-xs" />
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
        ) : filtered.length === 0 ? (
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
                  <TableHead>Direção</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Atendida em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Gravação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.contact_name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.phone_number}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{r.connection_label || r.channel}</Badge>
                    </TableCell>
                    {!compact && <TableCell className="text-xs">{profiles[r.user_id || ''] || '—'}</TableCell>}
                    <TableCell className="text-xs">{directionLabel(r.direction)}</TableCell>
                    <TableCell className="font-mono text-xs">{durationDisplay(r)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.answered_at
                        ? new Date(r.answered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(r.status, r.direction)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>

                    <TableCell className="text-right">
                      {(r.recording_url || r.recording_path || (r.metadata as any)?.wavoip_call_id) ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePlay(r)} title="Ouvir">
                            {playingId === r.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(r)} title="Baixar">
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => toast({ title: 'Google Drive em breve', description: 'A integração será configurada em uma próxima etapa.' })}
                            title="Enviar ao Google Drive">
                            <Cloud className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground italic">sem áudio</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hasMore && (
              <div className="flex justify-center pt-3">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
