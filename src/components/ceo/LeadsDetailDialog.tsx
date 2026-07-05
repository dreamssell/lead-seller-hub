import { useMemo, useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, X, Filter, Download, Loader2 } from 'lucide-react';
import { downloadCsv } from '@/lib/ceoExport';

export type LeadRow = any;

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  { value: 'em_atendimento', label: 'Em atendimento', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  { value: 'ganho', label: 'Ganho', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  { value: 'perdido', label: 'Perdido', color: 'bg-rose-500/10 text-rose-600 border-rose-500/30' },
];

const STORAGE_KEY = 'leads-detail-dialog-filters:v1';
const PAGE_SIZE = 50;

type Persisted = {
  search: string;
  statuses: string[];
  origin: string;
  valueRange: [number, number];
};

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  /** Leads already pré-filtrados pelo CeoFilterBar (período/sub-empresa/colaborador). */
  leads: LeadRow[];
  /** Função de classificação da origem (mesma da página). */
  classify: (source?: string | null) => string;
  /** Nome de responsável a partir do UID. */
  profileName: (uid?: string | null) => string;
  /** Origem pré-selecionada (Holmes, DealerSpace, all…). */
  initialOrigin?: string;
}

export function LeadsDetailDialog({
  open, onOpenChange, title, description, leads, classify, profileName, initialOrigin = 'all',
}: Props) {
  const persisted = useRef<Partial<Persisted>>(loadPersisted());
  const [search, setSearch] = useState(persisted.current.search ?? '');
  const [statuses, setStatuses] = useState<string[]>(persisted.current.statuses ?? []);
  const [origin, setOrigin] = useState<string>(persisted.current.origin ?? initialOrigin);
  const [valueRange, setValueRange] = useState<[number, number]>(persisted.current.valueRange ?? [0, 0]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const maxValue = useMemo(
    () => Math.max(0, ...leads.map(l => Number(l.estimated_value || 0))),
    [leads]
  );

  // Ao abrir, aplica origem sugerida apenas quando o caller pediu explicitamente
  // (initialOrigin !== 'all') — caso contrário, respeita o que estava salvo.
  useEffect(() => {
    if (open && initialOrigin && initialOrigin !== 'all') {
      setOrigin(initialOrigin);
    }
    if (open) setVisibleCount(PAGE_SIZE);
  }, [open, initialOrigin]);

  // Ajusta o topo do slider quando o maxValue muda e ainda estava zerado
  useEffect(() => {
    if (valueRange[1] === 0 && maxValue > 0) {
      setValueRange([0, Math.ceil(maxValue)]);
    }
  }, [maxValue, valueRange]);

  // Persiste filtros
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ search, statuses, origin, valueRange }));
    } catch { /* noop */ }
  }, [search, statuses, origin, valueRange]);

  const origins = useMemo(() => {
    const set = new Set<string>();
    leads.forEach(l => set.add(classify(l.source)));
    return Array.from(set).sort();
  }, [leads, classify]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (origin !== 'all' && classify(l.source) !== origin) return false;
      if (statuses.length && !statuses.includes(l.status)) return false;
      const v = Number(l.estimated_value || 0);
      if (v < valueRange[0] || (valueRange[1] > 0 && v > valueRange[1])) return false;
      if (q) {
        const hay = `${l.name || ''} ${l.email || ''} ${l.phone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, statuses, origin, valueRange, classify]);

  // Reset do cursor de paginação quando filtros mudam
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, statuses, origin, valueRange]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const totalValue = filtered.reduce((s, l) => s + Number(l.estimated_value || 0), 0);

  const toggleStatus = (s: string) =>
    setStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const clearAll = () => {
    setSearch(''); setStatuses([]); setOrigin('all'); setValueRange([0, Math.ceil(maxValue)]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  };

  const exportRows = () => filtered.map(l => ({
    nome: l.name, email: l.email || '', telefone: l.phone || '',
    canal: l.channel || '', origem: l.source || '', categoria: classify(l.source),
    status: l.status, valor_estimado: Number(l.estimated_value || 0),
    responsavel: profileName(l.assigned_to || l.created_by),
    criado_em: new Date(l.created_at).toLocaleString('pt-BR'),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 gap-0 max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg">{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(`leads-detalhe-${Date.now()}.csv`, exportRows())}
            >
              <Download className="w-4 h-4 mr-1" />CSV
            </Button>
          </div>
        </DialogHeader>

        {/* Filtros */}
        <div className="px-6 py-4 border-b border-border space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {origins.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            {STATUS_OPTIONS.map(s => {
              const active = statuses.includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => toggleStatus(s.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    active ? s.color : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
            {(search || statuses.length || origin !== 'all' || valueRange[0] > 0 || (maxValue > 0 && valueRange[1] < maxValue)) ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" />Limpar
              </Button>
            ) : null}
          </div>

          {maxValue > 0 && (
            <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">Valor estimado (R$)</p>
                <Slider
                  min={0}
                  max={Math.ceil(maxValue)}
                  step={Math.max(1, Math.ceil(maxValue / 100))}
                  value={valueRange}
                  onValueChange={(v) => setValueRange([v[0], v[1]] as [number, number])}
                />
              </div>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                R$ {valueRange[0].toLocaleString('pt-BR')} – R$ {valueRange[1].toLocaleString('pt-BR')}
              </p>
            </div>
          )}
        </div>

        {/* Resumo */}
        <div className="px-6 py-2 flex items-center gap-4 text-xs text-muted-foreground border-b border-border">
          <span><strong className="text-foreground">{filtered.length}</strong> leads</span>
          <span>·</span>
          <span>Valor total: <strong className="text-foreground">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
          {filtered.length > visible.length && (
            <>
              <span>·</span>
              <span>Exibindo <strong className="text-foreground">{visible.length}</strong> de {filtered.length}</span>
            </>
          )}
        </div>

        {/* Tabela */}
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    Nenhum lead corresponde aos filtros.
                  </TableCell>
                </TableRow>
              ) : visible.map(l => {
                const st = STATUS_OPTIONS.find(o => o.value === l.status);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{l.email || '—'}</div>
                      <div>{l.phone || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{classify(l.source)}</Badge>
                      {l.source && <div className="text-[10px] text-muted-foreground mt-0.5">{l.source}</div>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${st?.color || 'border-border text-muted-foreground'}`}>
                        {st?.label || l.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      R$ {Number(l.estimated_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs">{profileName(l.assigned_to || l.created_by)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {hasMore && (
            <div className="flex justify-center py-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                <Loader2 className="w-3.5 h-3.5 mr-1.5" />
                Carregar mais {Math.min(PAGE_SIZE, filtered.length - visible.length)} de {filtered.length - visible.length}
              </Button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
