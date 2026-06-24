import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { Link2, Plus, Eye, MousePointerClick, Sparkles, Copy, ExternalLink, Trash2, Pencil, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { TemplatePickerDialog } from '@/components/outros/TemplatePickerDialog';
import { QrCodeStudio } from '@/components/outros/QrCodeStudio';
import { downloadPdf } from '@/lib/ceoExport';
import type { LandingTemplate } from '@/lib/landingTemplates';

type Page = {
  id: string; slug: string; title: string; status: 'draft' | 'published';
  tracking_label: string | null; view_count: number; click_count: number; lead_count: number;
  created_at: string; updated_at: string;
};

const publicUrl = (slug: string) => `${window.location.origin}/p/${slug}`;

export default function OutrosPage() {
  const nav = useNavigate();
  const { access } = useAuth();
  const [pages, setPages] = useState<Page[]>([]);
  const [buttons, setButtons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [p, b] = await Promise.all([
      supabase.from('landing_pages').select('*').order('updated_at', { ascending: false }),
      supabase.from('landing_buttons').select('id,label,url,action_type,click_count,page_id'),
    ]);
    setPages((p.data as any) || []);
    setButtons((b.data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => pages.filter(p => !query || p.title.toLowerCase().includes(query.toLowerCase()) || p.slug.includes(query.toLowerCase())),
    [pages, query]
  );

  const totals = useMemo(() => ({
    views: filtered.reduce((s, p) => s + (p.view_count || 0), 0),
    clicks: filtered.reduce((s, p) => s + (p.click_count || 0), 0),
    leads: filtered.reduce((s, p) => s + (p.lead_count || 0), 0),
  }), [filtered]);

  const CHANNEL_LABEL: Record<string, string> = {
    whatsapp: 'WhatsApp', site: 'Site', link: 'Link externo', form: 'Formulário',
  };

  const channelBreakdown = useMemo(() => {
    const pageIds = new Set(filtered.map(p => p.id));
    const m: Record<string, { ctas: number; clicks: number }> = {};
    buttons.filter(b => pageIds.has(b.page_id)).forEach(b => {
      const k = CHANNEL_LABEL[b.action_type] || b.action_type || 'Outro';
      m[k] = m[k] || { ctas: 0, clicks: 0 };
      m[k].ctas++;
      m[k].clicks += Number(b.click_count || 0);
    });
    return Object.entries(m).map(([canal, v]) => ({ canal, ctas: v.ctas, cliques: v.clicks }))
      .sort((a, b) => b.cliques - a.cliques);
  }, [filtered, buttons]);

  const createFromTemplate = async (tpl: LandingTemplate | null) => {
    if (!access?.owner_id) { toast({ title: 'Conta não detectada', variant: 'destructive' }); return; }
    const slug = `cap-${Math.random().toString(36).slice(2, 8)}`;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const base = tpl ? tpl.page : {
      title: 'Nova página de captura', headline: 'Fale com a nossa equipe',
      subheadline: 'Escolha um canal e iniciamos seu atendimento agora.',
      page_bg_color: '#0F172A', text_color: '#FFFFFF', align: 'center',
      form_mode: 'none', auto_create_lead: false,
    };
    const { data, error } = await supabase.from('landing_pages').insert({
      owner_id: access.owner_id, sub_company_id: access.sub_company_id, slug,
      ...base, created_by: userId,
    } as any).select('id').maybeSingle();
    if (error) return toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
    if (data?.id) {
      if (tpl?.buttons?.length) {
        await supabase.from('landing_buttons').insert(
          tpl.buttons.map((b, i) => ({ page_id: data.id, ...b, sort_order: i })) as any
        );
      }
      nav(`/outros/${data.id}/editar`);
    }
  };
  const createNew = () => createFromTemplate(null);

  const exportCsv = () => {
    const rows = [
      ['Página', 'Slug', 'Rastreio', 'Status', 'Views', 'Cliques', 'Leads', 'Criado em', 'Atualizado em'],
      ...filtered.map(p => [
        p.title, p.slug, p.tracking_label || '', p.status,
        String(p.view_count), String(p.click_count), String(p.lead_count),
        new Date(p.created_at).toISOString(), new Date(p.updated_at).toISOString(),
      ]),
      [],
      ['Breakdown por canal detectado'],
      ['Canal', 'CTAs', 'Cliques'],
      ...channelBreakdown.map(c => [c.canal, String(c.ctas), String(c.cliques)]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `captura-leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast({ title: 'CSV exportado' });
  };

  const exportCtaCsv = async () => {
    const pageIds = new Set(filtered.map(p => p.id));
    const pageMap = new Map(filtered.map(p => [p.id, p]));
    const rows = [
      ['Página', 'Slug', 'CTA', 'Tipo', 'Destino', 'Cliques'],
      ...buttons
        .filter(b => pageIds.has(b.page_id))
        .sort((a, b) => (b.click_count || 0) - (a.click_count || 0))
        .map(b => {
          const p = pageMap.get(b.page_id);
          return [p?.title || '', p?.slug || '', b.label, b.action_type, b.url, String(b.click_count || 0)];
        }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `captura-leads-ctas-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast({ title: 'CSV de CTAs exportado' });
  };

  const exportPdf = () => {
    const kpis = [
      { label: 'Páginas', value: filtered.length },
      { label: 'Views', value: totals.views },
      { label: 'Cliques', value: totals.clicks },
      { label: 'Leads', value: totals.leads },
    ];
    const pageRows = filtered.map(p => ({
      pagina: p.title,
      slug: p.slug,
      status: p.status === 'published' ? 'Publicada' : 'Rascunho',
      views: p.view_count,
      cliques: p.click_count,
      leads: p.lead_count,
    }));
    const channelRows = channelBreakdown.map(c => ({ canal: c.canal, ctas: c.ctas, cliques: c.cliques }));
    downloadPdf(
      `captura-leads-${new Date().toISOString().slice(0, 10)}.pdf`,
      'Captura de Leads',
      query ? `Filtro: "${query}"` : 'Todas as páginas',
      kpis,
      [...pageRows, ...(channelRows.length ? [{ pagina: '— Breakdown por canal —', slug: '', status: '', views: '', cliques: '', leads: '' }, ...channelRows.map(c => ({ pagina: c.canal, slug: '', status: 'canal', views: '', cliques: c.cliques, leads: c.ctas }))] : [])],
    );
    toast({ title: 'PDF exportado' });
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir esta página?')) return;
    const { error } = await supabase.from('landing_pages').delete().eq('id', id);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    toast({ title: 'Página excluída' });
    load();
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(publicUrl(slug));
    toast({ title: 'Link copiado!' });
  };

  return (
    <AppLayout title="Captura de Leads" subtitle="Páginas, CTAs e QR Codes — métricas por canal detectado.">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="glass-card"><CardContent className="p-5"><p className="text-xs uppercase text-muted-foreground font-semibold">Páginas</p><p className="text-2xl font-bold mt-1">{filtered.length}</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-5 flex items-start justify-between"><div><p className="text-xs uppercase text-muted-foreground font-semibold">Visualizações</p><p className="text-2xl font-bold mt-1">{totals.views}</p></div><Eye className="w-5 h-5 text-primary" /></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-5 flex items-start justify-between"><div><p className="text-xs uppercase text-muted-foreground font-semibold">Cliques em CTA</p><p className="text-2xl font-bold mt-1">{totals.clicks}</p></div><MousePointerClick className="w-5 h-5 text-primary" /></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-5 flex items-start justify-between"><div><p className="text-xs uppercase text-muted-foreground font-semibold">Leads gerados</p><p className="text-2xl font-bold mt-1">{totals.leads}</p></div><Sparkles className="w-5 h-5 text-primary" /></CardContent></Card>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Total de leads · breakdown por canal detectado</CardTitle>
            <CardDescription>Distribuição de CTAs e cliques por tipo de canal nas páginas filtradas.</CardDescription>
          </CardHeader>
          <CardContent>
            {channelBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum CTA configurado nas páginas filtradas.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {channelBreakdown.map(c => {
                  const pct = totals.clicks ? Math.round((c.cliques / totals.clicks) * 100) : 0;
                  return (
                    <div key={c.canal} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{c.canal}</span>
                        <Badge variant="secondary">{c.ctas} CTAs</Badge>
                      </div>
                      <p className="text-xl font-bold">{c.cliques}</p>
                      <p className="text-xs text-muted-foreground">cliques · {pct}% do total</p>
                    </div>
                  );
                })}
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <span className="text-sm font-medium">Total de leads</span>
                  <p className="text-xl font-bold mt-1">{totals.leads}</p>
                  <p className="text-xs text-muted-foreground">capturados nas páginas filtradas</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Suas páginas</CardTitle>
              <CardDescription>Cada página gera um link público e um QR Code para compartilhar.</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Buscar..." value={query} onChange={e => setQuery(e.target.value)} className="w-48" />
              <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />CSV</Button>
              <Button variant="outline" onClick={exportPdf}><FileText className="w-4 h-4 mr-1" />PDF</Button>
              <Button variant="outline" onClick={exportCtaCsv}><FileSpreadsheet className="w-4 h-4 mr-1" />CTAs CSV</Button>
              <Button variant="outline" onClick={() => setTplOpen(true)}><Sparkles className="w-4 h-4 mr-1" />Templates</Button>
              <Button onClick={createNew}><Plus className="w-4 h-4 mr-1" />Nova página</Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
              : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <Link2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">Você ainda não criou nenhuma página de captura.</p>
                  <Button onClick={createNew}><Plus className="w-4 h-4 mr-1" />Criar a primeira</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Página</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Visualizações</TableHead>
                      <TableHead className="text-right">Cliques</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => setAnalyticsId(p.id)}>
                        <TableCell>
                          <div className="font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">/{p.slug}{p.tracking_label ? ` · ${p.tracking_label}` : ''}</div>
                        </TableCell>
                        <TableCell><Badge variant={p.status === 'published' ? 'default' : 'secondary'}>{p.status === 'published' ? 'Publicada' : 'Rascunho'}</Badge></TableCell>
                        <TableCell className="text-right">{p.view_count}</TableCell>
                        <TableCell className="text-right">{p.click_count}</TableCell>
                        <TableCell className="text-right">{p.lead_count}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" title="Copiar link" onClick={() => copyLink(p.slug)}><Copy className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" title="Abrir" onClick={() => window.open(publicUrl(p.slug), '_blank')}><ExternalLink className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" title="Editar" onClick={() => nav(`/outros/${p.id}/editar`)}><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" title="Excluir" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      </div>

      <AnalyticsModal pageId={analyticsId} onClose={() => setAnalyticsId(null)} />
      <TemplatePickerDialog open={tplOpen} onOpenChange={setTplOpen} onApply={createFromTemplate} />
    </AppLayout>
  );
}

function AnalyticsModal({ pageId, onClose }: { pageId: string | null; onClose: () => void }) {
  const [page, setPage] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [buttons, setButtons] = useState<any[]>([]);

  useEffect(() => {
    if (!pageId) return;
    (async () => {
      const [p, b, ev] = await Promise.all([
        supabase.from('landing_pages').select('*').eq('id', pageId).maybeSingle(),
        supabase.from('landing_buttons').select('*').eq('page_id', pageId).order('sort_order'),
        supabase.from('landing_events').select('*').eq('page_id', pageId).order('created_at', { ascending: false }).limit(100),
      ]);
      setPage(p.data); setButtons((b.data as any) || []); setEvents((ev.data as any) || []);
    })();
  }, [pageId]);

  if (!pageId || !page) return null;
  const link = publicUrl(page.slug);

  return (
    <Dialog open={!!pageId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{page.title}</DialogTitle>
          <DialogDescription>/{page.slug}{page.tracking_label ? ` · rastreio: ${page.tracking_label}` : ''}</DialogDescription>
        </DialogHeader>

        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold uppercase mb-2 text-muted-foreground">Link público</p>
          <div className="flex gap-2"><Input readOnly value={link} /><Button variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast({ title: 'Copiado' }); }}><Copy className="w-4 h-4" /></Button></div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div><p className="text-xs text-muted-foreground">Views</p><p className="font-bold">{page.view_count}</p></div>
            <div><p className="text-xs text-muted-foreground">Cliques</p><p className="font-bold">{page.click_count}</p></div>
            <div><p className="text-xs text-muted-foreground">Leads</p><p className="font-bold">{page.lead_count}</p></div>
          </div>
        </CardContent></Card>

        <QrCodeStudio value={link} filename={page.slug} />

        <div>
          <h4 className="text-sm font-semibold mb-2">Desempenho por CTA</h4>
          <Table>
            <TableHeader><TableRow><TableHead>Botão</TableHead><TableHead>Destino</TableHead><TableHead className="text-right">Cliques</TableHead></TableRow></TableHeader>
            <TableBody>
              {buttons.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum CTA.</TableCell></TableRow>
                : buttons.map(b => <TableRow key={b.id}><TableCell>{b.label}</TableCell><TableCell className="text-xs text-muted-foreground truncate max-w-[280px]">{b.url}</TableCell><TableCell className="text-right font-medium">{b.click_count}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Últimos eventos</h4>
          <div className="max-h-64 overflow-y-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Quando</TableHead><TableHead>Detalhes</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sem eventos ainda.</TableCell></TableRow>
                  : events.map(e => (
                  <TableRow key={e.id}>
                    <TableCell><Badge variant="outline">{e.type}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(e.created_at).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">{e.lead_id ? `Lead criado: ${e.lead_id.slice(0,8)}…` : e.referrer || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
