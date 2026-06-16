import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowRight, Sparkles, History, X, Download, FileText, Clock, RotateCcw, Settings2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

type Event = {
  id: string;
  type: string;
  from_stage_name: string | null;
  to_stage_name: string | null;
  channel: string | null;
  source: string | null;
  created_at: string;
  metadata: any;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string | null;
  leadName?: string;
}

const TYPE_LABEL: Record<string, string> = {
  created: 'Lead criado',
  stage_changed: 'Mudança de etapa',
  assigned: 'Atribuição',
  status_changed: 'Status alterado',
  note: 'Nota',
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  telegram: 'Telegram', widget: 'Widget', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube',
};

const PAGE_SIZE = 100;

export function LeadHistoryDialog({ open, onOpenChange, leadId, leadName }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Cursor pagination state — stable order: created_at desc, id desc.
  // Using a cursor (instead of offset) avoids duplicating or skipping rows
  // when new events arrive between page loads.
  const [cursor, setCursor] = useState<{ created_at: string; id: string } | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Base query factory (used by exports — count + offset is fine there since
  // exports snapshot the full filtered set in one pass).
  const buildQuery = useCallback(() => {
    let q = supabase.from('lead_events')
      .select('id,type,from_stage_name,to_stage_name,channel,source,created_at,metadata', { count: 'exact' })
      .eq('lead_id', leadId as string);
    if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
    return q.order('created_at', { ascending: false }).order('id', { ascending: false });
  }, [leadId, channelFilter, dateFrom, dateTo]);

  // Cursor-based fetcher used by the dialog list itself.
  const fetchPage = useCallback(async (after: { created_at: string; id: string } | null) => {
    let q = supabase.from('lead_events')
      .select('id,type,from_stage_name,to_stage_name,channel,source,created_at,metadata')
      .eq('lead_id', leadId as string);
    if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
    if (after) {
      // (created_at, id) < (cursor.created_at, cursor.id) in DESC order
      q = q.or(
        `created_at.lt.${after.created_at},and(created_at.eq.${after.created_at},id.lt.${after.id})`
      );
    }
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) throw error;
    return (data as Event[]) || [];
  }, [leadId, channelFilter, dateFrom, dateTo]);

  const refreshTotal = useCallback(async () => {
    if (!leadId) return;
    let q = supabase.from('lead_events').select('id', { count: 'exact', head: true }).eq('lead_id', leadId);
    if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
    const { count } = await q;
    setTotal(count || 0);
  }, [leadId, channelFilter, dateFrom, dateTo]);

  const loadFirstPage = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    seenIdsRef.current = new Set();
    try {
      const [rows] = await Promise.all([fetchPage(null), refreshTotal()]);
      const deduped: Event[] = [];
      for (const r of rows) {
        if (!seenIdsRef.current.has(r.id)) { seenIdsRef.current.add(r.id); deduped.push(r); }
      }
      setEvents(deduped);
      const last = deduped[deduped.length - 1];
      setCursor(last ? { created_at: last.created_at, id: last.id } : null);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoading(false);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [leadId, fetchPage, refreshTotal]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !leadId || !cursor) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(cursor);
      const fresh: Event[] = [];
      for (const r of rows) {
        if (!seenIdsRef.current.has(r.id)) { seenIdsRef.current.add(r.id); fresh.push(r); }
      }
      if (fresh.length) {
        setEvents(prev => [...prev, ...fresh]);
        const last = fresh[fresh.length - 1];
        setCursor({ created_at: last.created_at, id: last.id });
      }
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, leadId, cursor, fetchPage]);

  // First load + reload whenever filters change
  useEffect(() => {
    if (!open || !leadId) return;
    loadFirstPage();
  }, [open, leadId, channelFilter, dateFrom, dateTo, loadFirstPage]);

  // Load full list of distinct channels for the dropdown (independent of filters)
  useEffect(() => {
    if (!open || !leadId) return;
    supabase.from('lead_events').select('channel').eq('lead_id', leadId).not('channel', 'is', null).limit(1000)
      .then(({ data }) => {
        const set = new Set<string>();
        (data as { channel: string | null }[] | null)?.forEach(r => r.channel && set.add(r.channel));
        setAvailableChannels(Array.from(set));
      });
  }, [open, leadId]);

  // Reset transient state when the dialog closes (filters are restored from DB on next open)
  useEffect(() => {
    if (!open) {
      setEvents([]); setTotal(0); setHasMore(false); setHydrated(false);
      setCursor(null); seenIdsRef.current = new Set();
    }
  }, [open]);

  // -------- Cross-device filter & scroll persistence (user_ui_state) --------
  const [hydrated, setHydrated] = useState(false);
  const [restoredLoadedCount, setRestoredLoadedCount] = useState<number | null>(null);
  const [restoredScrollTop, setRestoredScrollTop] = useState<number | null>(null);
  const scrollTopRef = useRef(0);
  const ownerIdRef = useRef<string | null>(null);
  const scope = leadId ? `lead_history:${leadId}` : null;

  // Hydrate filters from DB on open
  useEffect(() => {
    if (!open || !leadId || !scope) return;
    let cancelled = false;
    (async () => {
      const [{ data: userRes }, { data: leadRow }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('leads').select('owner_id').eq('id', leadId).maybeSingle(),
      ]);
      const uid = userRes.user?.id;
      const ownerId = (leadRow as any)?.owner_id;
      ownerIdRef.current = ownerId || null;
      if (!uid || !ownerId) { if (!cancelled) setHydrated(true); return; }
      const { data } = await (supabase as any).from('user_ui_state')
        .select('state').eq('user_id', uid).eq('owner_id', ownerId).eq('scope', scope).maybeSingle();
      if (cancelled) return;
      const s = (data?.state as any) || {};
      if (typeof s.channelFilter === 'string') setChannelFilter(s.channelFilter);
      if (typeof s.dateFrom === 'string') setDateFrom(s.dateFrom);
      if (typeof s.dateTo === 'string') setDateTo(s.dateTo);
      if (typeof s.loadedCount === 'number' && s.loadedCount > PAGE_SIZE) setRestoredLoadedCount(s.loadedCount);
      if (typeof s.scrollTop === 'number' && s.scrollTop > 0) setRestoredScrollTop(s.scrollTop);
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [open, leadId, scope]);

  // After first page loads, if we had a restored offset, keep paging (via cursor) until we reach it
  useEffect(() => {
    if (!restoredLoadedCount || loading) return;
    if (events.length >= restoredLoadedCount || !hasMore) { setRestoredLoadedCount(null); return; }
    loadMore();
  }, [restoredLoadedCount, events.length, hasMore, loading, loadMore]);

  // Restore scroll position once the catch-up has finished
  useEffect(() => {
    if (restoredScrollTop == null) return;
    if (loading || restoredLoadedCount != null) return;
    const el = scrollRef.current;
    if (!el) return;
    // Wait a frame for layout to settle
    const id = requestAnimationFrame(() => {
      const target = Math.min(restoredScrollTop, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.max(0, target);
      scrollTopRef.current = el.scrollTop;
      setRestoredScrollTop(null);
    });
    return () => cancelAnimationFrame(id);
  }, [restoredScrollTop, restoredLoadedCount, loading, events.length]);

  // Debounced upsert of current filters + loaded count + cursor + scroll position
  useEffect(() => {
    if (!open || !hydrated || !leadId || !scope) return;
    const t = window.setTimeout(async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const ownerId = ownerIdRef.current;
      if (!uid || !ownerId) return;
      await (supabase as any).from('user_ui_state').upsert({
        user_id: uid,
        owner_id: ownerId,
        scope,
        state: {
          channelFilter,
          dateFrom,
          dateTo,
          loadedCount: events.length,
          cursor,
          scrollTop: scrollTopRef.current,
        },
      }, { onConflict: 'user_id,owner_id,scope' });
    }, 600);
    return () => window.clearTimeout(t);
  }, [open, hydrated, leadId, scope, channelFilter, dateFrom, dateTo, events.length, cursor]);


  // Infinite scroll with debounce + prefetch (triggers earlier and coalesces rapid scroll events)
  // Also tracks scroll position for cross-device restore.
  const scrollPersistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer: number | null = null;
    const onScroll = () => {
      // Track position for persistence (debounced via the upsert effect)
      scrollTopRef.current = el.scrollTop;
      if (scrollPersistTimerRef.current !== null) window.clearTimeout(scrollPersistTimerRef.current);
      scrollPersistTimerRef.current = window.setTimeout(async () => {
        if (!hydrated || !leadId || !scope || !ownerIdRef.current) return;
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes.user?.id;
        if (!uid) return;
        await (supabase as any).from('user_ui_state').upsert({
          user_id: uid,
          owner_id: ownerIdRef.current,
          scope,
          state: {
            channelFilter, dateFrom, dateTo,
            loadedCount: events.length, cursor,
            scrollTop: scrollTopRef.current,
          },
        }, { onConflict: 'user_id,owner_id,scope' });
      }, 800);

      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) loadMore();
      }, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [loadMore, hydrated, leadId, scope, channelFilter, dateFrom, dateTo, events.length, cursor]);

  // Prefetch next page proactively after first load completes (warm cache for fast scroll)
  useEffect(() => {
    if (!loading && hasMore && events.length === PAGE_SIZE) {
      const t = window.setTimeout(() => loadMore(), 250);
      return () => window.clearTimeout(t);
    }
  }, [loading, hasMore, events.length, loadMore]);



  const filtered = events; // server-filtered already

  const clearFilters = () => { setChannelFilter('all'); setDateFrom(''); setDateTo(''); };
  const hasFilters = channelFilter !== 'all' || dateFrom || dateTo;


  const [exporting, setExporting] = useState<null | 'csv' | 'pdf'>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const exportCancelRef = useRef(false);

  // -------- Export options (custom date range + columns) --------
  type ColKey = 'data' | 'tipo' | 'canal' | 'origem' | 'de' | 'para';
  const ALL_COLS: { key: ColKey; label: string }[] = [
    { key: 'data', label: 'Data' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'canal', label: 'Canal' },
    { key: 'origem', label: 'Origem' },
    { key: 'de', label: 'De' },
    { key: 'para', label: 'Para' },
  ];
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportCols, setExportCols] = useState<ColKey[]>(['data','tipo','canal','origem','de','para']);
  const toggleCol = (k: ColKey) =>
    setExportCols(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k]);

  // Build a query honoring either current filters or export-specific date range.
  const buildExportQuery = useCallback(() => {
    let q = supabase.from('lead_events')
      .select('id,type,from_stage_name,to_stage_name,channel,source,created_at,metadata', { count: 'exact' })
      .eq('lead_id', leadId as string);
    if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
    const from = useCustomRange ? exportFrom : dateFrom;
    const to = useCustomRange ? exportTo : dateTo;
    if (from) q = q.gte('created_at', `${from}T00:00:00`);
    if (to)   q = q.lte('created_at', `${to}T23:59:59`);
    return q.order('created_at', { ascending: false }).order('id', { ascending: false });
  }, [leadId, channelFilter, dateFrom, dateTo, useCustomRange, exportFrom, exportTo]);

  // Fetch ALL events that match the current filters, in batches, with progress.
  const fetchAllFiltered = async (onProgress: (loaded: number, total: number) => void): Promise<Event[]> => {
    if (!leadId) return [];
    const BATCH = 500;
    const first = await buildExportQuery().range(0, BATCH - 1);
    const totalCount = first.count || 0;
    let all: Event[] = (first.data as Event[]) || [];
    onProgress(all.length, totalCount);
    while (all.length < totalCount) {
      if (exportCancelRef.current) break;
      const from = all.length;
      const { data } = await buildExportQuery().range(from, from + BATCH - 1);
      const chunk = (data as Event[]) || [];
      if (!chunk.length) break;
      all = all.concat(chunk);
      onProgress(all.length, totalCount);
      await new Promise(r => setTimeout(r, 0));
    }
    return all;
  };

  const buildRowsFrom = (list: Event[]) => list.map(ev => ({
    data: format(new Date(ev.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    tipo: TYPE_LABEL[ev.type] || ev.type,
    canal: ev.channel ? (CHANNEL_LABEL[ev.channel] || ev.channel) : '',
    origem: ev.source || '',
    de: ev.from_stage_name || '',
    para: ev.to_stage_name || '',
  }));

  const filenameBase = () => {
    const safe = (leadName || 'lead').replace(/[^a-z0-9\-_]+/gi, '_').toLowerCase();
    const parts = [safe, 'historico'];
    if (channelFilter !== 'all') parts.push(channelFilter);
    const from = useCustomRange ? exportFrom : dateFrom;
    const to = useCustomRange ? exportTo : dateTo;
    if (from) parts.push(`de-${from}`);
    if (to) parts.push(`ate-${to}`);
    return parts.join('_');
  };

  const runExport = async (kind: 'csv' | 'pdf') => {
    if (exporting) return;
    if (exportCols.length === 0) return toast.error('Selecione ao menos uma coluna.');
    setExporting(kind);
    setExportProgress(0);
    exportCancelRef.current = false;
    try {
      const all = await fetchAllFiltered((loaded, t) => {
        setExportProgress(t ? Math.round((loaded / t) * 100) : 100);
      });
      if (exportCancelRef.current) { toast.info('Exportação cancelada'); return; }
      if (all.length === 0) { toast.error('Nada a exportar com os filtros atuais.'); return; }
      const rows = buildRowsFrom(all);
      const selected = ALL_COLS.filter(c => exportCols.includes(c.key));
      if (kind === 'csv') {
        const headers = selected.map(c => c.label);
        const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = [
          headers.join(','),
          ...rows.map(r => selected.map(c => escape((r as any)[c.key])).join(','))
        ].join('\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${filenameBase()}.csv`; a.click();
        URL.revokeObjectURL(url);
        toast.success(`CSV exportado (${rows.length} eventos)`);
      } else {
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const margin = 36;
        let y = margin;
        doc.setFontSize(14); doc.text('Histórico do Lead', margin, y); y += 18;
        doc.setFontSize(10); doc.setTextColor(90);
        doc.text(`Lead: ${leadName || '—'}`, margin, y); y += 14;
        const efrom = useCustomRange ? exportFrom : dateFrom;
        const eto = useCustomRange ? exportTo : dateTo;
        const filtersTxt = [
          channelFilter !== 'all' ? `Canal: ${CHANNEL_LABEL[channelFilter] || channelFilter}` : 'Canal: Todos',
          efrom ? `De: ${efrom}` : null,
          eto ? `Até: ${eto}` : null,
          `Total: ${rows.length}`,
        ].filter(Boolean).join('  ·  ');
        doc.text(filtersTxt, margin, y); y += 14;
        doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, margin, y); y += 16;
        doc.setDrawColor(200); doc.line(margin, y, 559, y); y += 14;
        doc.setTextColor(20); doc.setFontSize(9);
        // Distribute columns evenly across usable width
        const usable = 559 - margin;
        const colW = Math.floor(usable / selected.length);
        const colX = selected.map((_, i) => margin + i * colW);
        doc.setFont(undefined, 'bold');
        selected.forEach((c, i) => doc.text(c.label, colX[i], y));
        doc.setFont(undefined, 'normal');
        y += 12;
        for (let idx = 0; idx < rows.length; idx++) {
          if (y > 800) { doc.addPage(); y = margin; }
          const r = rows[idx];
          selected.forEach((c, i) => {
            doc.text(doc.splitTextToSize(String((r as any)[c.key] ?? ''), colW - 4), colX[i], y);
          });
          y += 14;
          if (idx % 200 === 0) await new Promise(r => setTimeout(r, 0));
        }
        doc.save(`${filenameBase()}.pdf`);
        toast.success(`PDF exportado (${rows.length} eventos)`);
      }
    } catch (e: any) {
      toast.error('Falha ao exportar: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setExporting(null);
      setExportProgress(0);
      exportCancelRef.current = false;
    }
  };

  const cancelExport = () => { exportCancelRef.current = true; };

  // -------- Scheduled (background) exports --------
  // Runs an export detached from the dialog lifecycle. The user can close the
  // dialog and they'll get a toast + an entry in the notifications table when ready.
  const [scheduling, setScheduling] = useState(false);
  const scheduleExport = async (kind: 'csv' | 'pdf') => {
    if (!leadId) return;
    if (total === 0) { toast.error('Nada a exportar com os filtros atuais.'); return; }
    setScheduling(true);
    const capturedFilters = { channel: channelFilter, from: dateFrom, to: dateTo };
    const capturedLeadId = leadId;
    const capturedLeadName = leadName;
    const fileBase = filenameBase();
    toast.message('Exportação agendada', {
      description: `O ${kind.toUpperCase()} será baixado automaticamente quando ficar pronto. Você pode fechar este diálogo.`,
    });
    // Detach: do not await, run in background.
    (async () => {
      try {
        const cancelled = { v: false };
        // Replicate fetchAllFiltered locally so it survives dialog close (no refs)
        const BATCH = 500;
        const baseQuery = () => {
          let q = supabase.from('lead_events')
            .select('id,type,from_stage_name,to_stage_name,channel,source,created_at,metadata', { count: 'exact' })
            .eq('lead_id', capturedLeadId);
          if (capturedFilters.channel !== 'all') q = q.eq('channel', capturedFilters.channel);
          if (capturedFilters.from) q = q.gte('created_at', `${capturedFilters.from}T00:00:00`);
          if (capturedFilters.to)   q = q.lte('created_at', `${capturedFilters.to}T23:59:59`);
          return q.order('created_at', { ascending: false });
        };
        const first = await baseQuery().range(0, BATCH - 1);
        const totalCount = first.count || 0;
        let all: Event[] = (first.data as Event[]) || [];
        while (all.length < totalCount) {
          if (cancelled.v) break;
          const { data } = await baseQuery().range(all.length, all.length + BATCH - 1);
          const chunk = (data as Event[]) || [];
          if (!chunk.length) break;
          all = all.concat(chunk);
          // Yield to keep UI responsive even when running in background
          await new Promise(r => setTimeout(r, 30));
        }
        const rows = buildRowsFrom(all);
        if (kind === 'csv') {
          const headers = ['Data', 'Tipo', 'Canal', 'Origem', 'De', 'Para'];
          const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          const csv = [headers.join(','), ...rows.map(r => [r.data, r.tipo, r.canal, r.origem, r.de, r.para].map(escape).join(','))].join('\n');
          const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${fileBase}.csv`; a.click();
          URL.revokeObjectURL(url);
        } else {
          const doc = new jsPDF({ unit: 'pt', format: 'a4' });
          const margin = 36;
          let y = margin;
          doc.setFontSize(14); doc.text('Histórico do Lead', margin, y); y += 18;
          doc.setFontSize(10); doc.setTextColor(90);
          doc.text(`Lead: ${capturedLeadName || '—'}`, margin, y); y += 14;
          doc.text(`Total: ${rows.length}  ·  Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, margin, y); y += 16;
          doc.setDrawColor(200); doc.line(margin, y, 559, y); y += 14;
          doc.setTextColor(20); doc.setFontSize(9);
          const colX = [margin, margin + 95, margin + 200, margin + 270, margin + 340, margin + 430];
          const header = ['Data', 'Tipo', 'Canal', 'Origem', 'De', 'Para'];
          doc.setFont(undefined, 'bold'); header.forEach((h, i) => doc.text(h, colX[i], y)); doc.setFont(undefined, 'normal');
          y += 12;
          for (let idx = 0; idx < rows.length; idx++) {
            if (y > 800) { doc.addPage(); y = margin; }
            const r = rows[idx];
            const cells = [r.data, r.tipo, r.canal, r.origem, r.de, r.para];
            cells.forEach((c, i) => {
              const max = i === 0 ? 95 : i === 1 ? 100 : i === 2 ? 65 : i === 3 ? 65 : i === 4 ? 85 : 125;
              doc.text(doc.splitTextToSize(String(c), max), colX[i], y);
            });
            y += 14;
            if (idx % 200 === 0) await new Promise(r => setTimeout(r, 0));
          }
          doc.save(`${fileBase}.pdf`);
        }
        // Persist a notification row so the user can find it later in the bell
        try {
          const [{ data: userRes }, { data: leadRow }] = await Promise.all([
            supabase.auth.getUser(),
            supabase.from('leads').select('owner_id, sub_company_id').eq('id', capturedLeadId).maybeSingle(),
          ]);
          const uid = userRes.user?.id;
          const ownerId = (leadRow as any)?.owner_id || uid;
          if (uid && ownerId) {
            await supabase.from('notifications').insert({
              user_id: uid,
              owner_id: ownerId,
              sub_company_id: (leadRow as any)?.sub_company_id ?? null,
              type: 'export_ready',
              title: `Exportação ${kind.toUpperCase()} pronta`,
              body: `${rows.length} eventos · ${capturedLeadName || 'Lead'}`,
              lead_id: capturedLeadId,
            });
          }
        } catch { /* notification is best-effort */ }
        toast.success(`Exportação ${kind.toUpperCase()} concluída (${rows.length} eventos)`);
      } catch (e: any) {
        toast.error('Falha na exportação agendada: ' + (e?.message || 'erro desconhecido'));
      }
    })();
    // Release the button after a brief delay so the user sees the toast
    setTimeout(() => setScheduling(false), 600);
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Histórico do lead</DialogTitle>
          <DialogDescription>{leadName || 'Eventos e mudanças de etapa'}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3 mb-2">
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase text-muted-foreground">Canal</Label>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableChannels.map(c => (
                  <SelectItem key={c} value={c}>{CHANNEL_LABEL[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase text-muted-foreground">De</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-40 text-xs" />
          </div>
          <div className="flex flex-col">
            <Label className="text-[10px] uppercase text-muted-foreground">Até</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-40 text-xs" />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={clearFilters}
            disabled={!hasFilters}
            title="Voltar aos filtros padrão"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Resetar filtros
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{events.length} de {total}</span>
            <Button size="sm" variant="outline" className="h-8" onClick={() => runExport('csv')} disabled={!!exporting || total === 0}>
              {exporting === 'csv' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => runExport('pdf')} disabled={!!exporting || total === 0}>
              {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1" />}
              PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => scheduleExport('csv')}
              disabled={scheduling || total === 0}
              title="Agendar CSV em segundo plano"
            >
              <Clock className="w-3.5 h-3.5 mr-1" /> Agendar CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => scheduleExport('pdf')}
              disabled={scheduling || total === 0}
              title="Agendar PDF em segundo plano"
            >
              <Clock className="w-3.5 h-3.5 mr-1" /> Agendar PDF
            </Button>
          </div>
        </div>

        {exporting && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">
                Exportando {exporting.toUpperCase()}… {exportProgress}%
              </div>
              <Progress value={exportProgress} className="h-1.5" />
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelExport}>Cancelar</Button>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {total === 0 ? 'Sem eventos registrados ainda.' : 'Nenhum evento corresponde aos filtros.'}
          </p>
        ) : (
          <div ref={scrollRef} className="max-h-[50vh] overflow-y-auto pr-2">
            <ol className="relative border-l border-border pl-5 space-y-4">
              {filtered.map(ev => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{TYPE_LABEL[ev.type] || ev.type}</span>
                    {ev.channel && <Badge variant="secondary" className="text-[10px]">{CHANNEL_LABEL[ev.channel] || ev.channel}</Badge>}
                    {ev.source && <Badge variant="outline" className="text-[10px]">{ev.source}</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  {ev.type === 'stage_changed' && (
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{ev.from_stage_name || '—'}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="text-foreground font-medium">{ev.to_stage_name || '—'}</span>
                    </div>
                  )}
                  {ev.type === 'created' && (
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Entrou em {ev.to_stage_name || 'sem etapa'}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-center py-3">
              {loadingMore ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : hasMore ? (
                <Button size="sm" variant="ghost" onClick={loadMore}>Carregar mais</Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Fim do histórico</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
