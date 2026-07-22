import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Eye, Globe, Loader2, MapPin, MousePointerClick, Sparkles } from 'lucide-react';
import { getPublicLandingUrl, getPublicLinkUrl } from '@/lib/publicLinks';

const PAGE_SIZES = [25, 50, 100];

type EventRow = {
  id: string;
  type: string;
  created_at: string;
  referrer: string | null;
  user_agent: string | null;
  ip_address: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  lead_id: string | null;
  button_id: string | null;
};

export default function OutrosDataPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [page, setPage] = useState<any>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('landing_pages').select('*').eq('id', id).maybeSingle();
      setPage(data);
    })();
  }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    let q = supabase.from('landing_events').select('*', { count: 'exact' }).eq('page_id', id).order('created_at', { ascending: false });
    if (typeFilter !== 'all') q = q.eq('type', typeFilter);
    const from = (pageNum - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, count, error } = await q.range(from, to);
    if (error) { toast({ title: 'Erro ao carregar eventos', description: error.message, variant: 'destructive' }); }
    setEvents((data as any) || []);
    setTotal(count || 0);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, pageNum, pageSize, typeFilter]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`outros-data-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'landing_events', filter: `page_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [id, pageNum, pageSize, typeFilter]);

  const filtered = useMemo(() => {
    if (!query) return events;
    const q = query.toLowerCase();
    return events.filter(e =>
      (e.ip_address || '').toLowerCase().includes(q) ||
      (e.country || '').toLowerCase().includes(q) ||
      (e.region || '').toLowerCase().includes(q) ||
      (e.city || '').toLowerCase().includes(q) ||
      (e.neighborhood || '').toLowerCase().includes(q) ||
      (e.referrer || '').toLowerCase().includes(q) ||
      (e.user_agent || '').toLowerCase().includes(q)
    );
  }, [events, query]);

  const publicUrl = page ? (page.page_type === 'link' ? getPublicLinkUrl(page.slug) : getPublicLandingUrl(page.slug)) : '';
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const exportCsv = () => {
    const rows = [
      ['Tipo', 'Quando', 'IP', 'País', 'Estado', 'Cidade', 'Bairro', 'Latitude', 'Longitude', 'Referrer', 'User-Agent', 'Lead'],
      ...filtered.map(e => [
        e.type,
        new Date(e.created_at).toISOString(),
        e.ip_address || '',
        e.country || '',
        e.region || '',
        e.city || '',
        e.neighborhood || '',
        e.latitude ?? '',
        e.longitude ?? '',
        e.referrer || '',
        e.user_agent || '',
        e.lead_id || '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dados-${page?.slug || id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <AppLayout title={page?.title || 'Dados'} subtitle={page ? `${page.page_type === 'link' ? 'Link' : 'Página'} · /${page.slug}` : 'Carregando...'}>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => nav('/outros')}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
          {publicUrl && (
            <>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: 'Link copiado' }); }}>
                <Copy className="w-4 h-4 mr-1" />Copiar link
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(publicUrl, '_blank')}>
                <ExternalLink className="w-4 h-4 mr-1" />Abrir
              </Button>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="glass-card"><CardContent className="p-5"><p className="text-xs uppercase text-muted-foreground font-semibold">Total de eventos</p><p className="text-2xl font-bold mt-1">{total}</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-5 flex items-start justify-between"><div><p className="text-xs uppercase text-muted-foreground font-semibold">Visualizações</p><p className="text-2xl font-bold mt-1">{page?.view_count ?? 0}</p></div><Eye className="w-5 h-5 text-primary" /></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-5 flex items-start justify-between"><div><p className="text-xs uppercase text-muted-foreground font-semibold">Cliques</p><p className="text-2xl font-bold mt-1">{page?.click_count ?? 0}</p></div><MousePointerClick className="w-5 h-5 text-primary" /></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-5 flex items-start justify-between"><div><p className="text-xs uppercase text-muted-foreground font-semibold">Leads</p><p className="text-2xl font-bold mt-1">{page?.lead_count ?? 0}</p></div><Sparkles className="w-5 h-5 text-primary" /></CardContent></Card>
        </div>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" /> Eventos com IP e georreferência</CardTitle>
              <CardDescription>Cada acesso registrado com localização aproximada (bairro, cidade, estado e país).</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Buscar IP, cidade, referrer..." value={query} onChange={e => setQuery(e.target.value)} className="w-56" />
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPageNum(1); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="view">Visualizações</SelectItem>
                  <SelectItem value="click">Cliques</SelectItem>
                  <SelectItem value="lead">Leads</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPageNum(1); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}/pág</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />CSV</Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando eventos…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Nenhum evento encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Quando</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Referrer</TableHead>
                      <TableHead>Dispositivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(e => {
                      const loc = [e.neighborhood, e.city, e.region, e.country].filter(Boolean).join(', ');
                      const mapsUrl = e.latitude != null && e.longitude != null
                        ? `https://maps.google.com/?q=${e.latitude},${e.longitude}` : null;
                      return (
                        <TableRow key={e.id}>
                          <TableCell><Badge variant={e.type === 'lead' ? 'default' : 'outline'}>{e.type}</Badge></TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-xs font-mono">{e.ip_address || '—'}</TableCell>
                          <TableCell className="text-xs">
                            {loc ? (
                              mapsUrl ? (
                                <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                                  <MapPin className="w-3 h-3" />{loc}
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{loc}</span>
                              )
                            ) : <span className="text-muted-foreground">Sem geo</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">{e.referrer || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">{e.user_agent || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-muted-foreground">
                Página {pageNum} de {totalPages} · {total} registro{total === 1 ? '' : 's'}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={pageNum <= 1} onClick={() => setPageNum(p => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /></Button>
                <Button size="sm" variant="outline" disabled={pageNum >= totalPages} onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
