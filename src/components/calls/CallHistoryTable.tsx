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
import { Loader2, Play, Pause, Download, Cloud, Search, RefreshCw, PhoneCall } from 'lucide-react';
import { formatDuration, getRecordingSignedUrl, type CallChannel } from '@/lib/callHistory';
import { downloadCsv } from '@/lib/ceoExport';
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
  recording_path: string | null;
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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [connFilter, setConnFilter] = useState<string>(filter?.connectionLabel ?? 'all');
  const [search, setSearch] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const load = async () => {
    setLoading(true);
    let q: any = (supabase as any).from('call_history').select('*')
      .order('started_at', { ascending: false })
      .limit(filter?.limit ?? 200);
    if (filter?.ownerId) q = q.eq('owner_id', filter.ownerId);
    if (filter?.subCompanyId) q = q.eq('sub_company_id', filter.subCompanyId);
    if (filter?.userId) q = q.eq('user_id', filter.userId);
    if (filter?.channel && filter.channel !== 'all') q = q.eq('channel', filter.channel);
    if (customerId) q = q.eq('customer_id', customerId);
    const { data, error } = await q;
    if (error) console.warn('[CallHistoryTable]', error);
    setRows((data as Row[]) || []);
    const uids = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean)));
    const sids = Array.from(new Set((data || []).map((r: any) => r.sub_company_id).filter(Boolean)));
    if (uids.length) {
      const { data: p } = await supabase.from('profiles').select('user_id,display_name,email').in('user_id', uids);
      const map: Record<string, string> = {};
      (p || []).forEach((x: any) => { map[x.user_id] = x.display_name || x.email || x.user_id.slice(0, 8); });
      setProfiles(map);
    }
    if (sids.length) {
      const { data: s } = await (supabase as any).from('sub_companies').select('id,name').in('id', sids);
      const map: Record<string, string> = {};
      (s || []).forEach((x: any) => { map[x.id] = x.name; });
      setSubs(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [
    filter?.ownerId, filter?.subCompanyId, filter?.userId, filter?.channel, customerId,
  ]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffDays: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };
    const days = cutoffDays[period];
    return rows.filter((r) => {
      if (days && now - new Date(r.started_at).getTime() > days * 86400_000) return false;
      if (userFilter !== 'all' && r.user_id !== userFilter) return false;
      if (connFilter !== 'all' && (r.connection_label || '') !== connFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(r.contact_name || '').toLowerCase().includes(q) &&
          !r.phone_number.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [rows, period, userFilter, connFilter, search]);

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

  const handlePlay = async (r: Row) => {
    if (!r.recording_path) return;
    if (playingId === r.id && audioEl) { audioEl.pause(); setPlayingId(null); return; }
    const url = await getRecordingSignedUrl(r.recording_path);
    if (!url) { toast({ title: 'Gravação indisponível', variant: 'destructive' }); return; }
    if (audioEl) audioEl.pause();
    const a = new Audio(url);
    a.play().catch(() => {});
    a.onended = () => setPlayingId(null);
    setAudioEl(a);
    setPlayingId(r.id);
  };

  const handleDownload = async (r: Row) => {
    if (!r.recording_path) return;
    const url = await getRecordingSignedUrl(r.recording_path);
    if (!url) { toast({ title: 'Falha ao gerar link', variant: 'destructive' }); return; }
    const a = document.createElement('a');
    a.href = url; a.download = `chamada-${r.id}.webm`; a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const exportCsv = () => {
    downloadCsv(`historico-chamadas-${Date.now()}.csv`, filtered.map((r) => ({
      data: new Date(r.started_at).toLocaleString('pt-BR'),
      contato: r.contact_name || '—',
      numero: r.phone_number,
      canal: r.channel,
      conexao: r.connection_label || '—',
      direcao: r.direction,
      status: r.status,
      duracao: formatDuration(r.duration_seconds),
      usuario: profiles[r.user_id || ''] || '—',
      sub_empresa: subs[r.sub_company_id || ''] || '—',
    })));
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      answered: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      ended: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      missed: 'bg-destructive/10 text-destructive border-destructive/30',
      failed: 'bg-destructive/10 text-destructive border-destructive/30',
      rejected: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
      initiated: 'bg-primary/10 text-primary border-primary/30',
      ringing: 'bg-primary/10 text-primary border-primary/30',
    };
    return <Badge variant="outline" className={map[s] || ''}>{s}</Badge>;
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
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
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
                  <TableHead>Duração</TableHead>
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
                    <TableCell className="font-mono text-xs">{formatDuration(r.duration_seconds)}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.recording_path ? (
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
