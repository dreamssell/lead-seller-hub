import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';

export type DocRow = {
  id: string;
  title: string;
  signer_name?: string | null;
  signer_email?: string | null;
  status: string;
  method: string;
  created_at: string;
  signed_at?: string | null;
  creator_name?: string | null;
  sub_company_name?: string | null;
};

type SortKey = 'title' | 'status' | 'created_at' | 'signed_at' | 'creator_name' | 'sub_company_name';

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', pending: 'Aguardando', viewed: 'Visualizado',
  authenticating: 'Processando', signed: 'Assinado', expired: 'Expirado', cancelled: 'Cancelado',
};

const PAGE_SIZE = 25;

interface Props { docs: DocRow[]; onOpen?: (d: DocRow) => void; }

export function SignatureDocumentsTable({ docs, onOpen }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const arr = [...docs];
    arr.sort((a, b) => {
      const av = (a as any)[sortKey] ?? '';
      const bv = (b as any)[sortKey] ?? '';
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [docs, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const slice = sorted.slice(start, start + PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const Th = ({ k, children }: { k: SortKey; children: any }) => (
    <TableHead>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-primary">
        {children}
        {sortKey === k && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="glass-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <Th k="title">Título</Th>
            <TableHead>Signatário</TableHead>
            <Th k="status">Status</Th>
            <Th k="creator_name">Criado por</Th>
            <Th k="sub_company_name">Sub-empresa</Th>
            <Th k="created_at">Criado</Th>
            <Th k="signed_at">Assinado</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">Nenhum documento encontrado.</TableCell></TableRow>
          ) : slice.map((d) => (
            <TableRow key={d.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => onOpen?.(d)}>
              <TableCell className="font-medium text-sm">{d.title}</TableCell>
              <TableCell className="text-xs">
                <div>{d.signer_name || '—'}</div>
                <div className="text-muted-foreground">{d.signer_email}</div>
              </TableCell>
              <TableCell><Badge variant="outline" className="text-[10px]">{STATUS_LABEL[d.status] ?? d.status}</Badge></TableCell>
              <TableCell className="text-xs">{d.creator_name ?? '—'}</TableCell>
              <TableCell className="text-xs">{d.sub_company_name ?? '—'}</TableCell>
              <TableCell className="text-xs">{fmt(d.created_at)}</TableCell>
              <TableCell className="text-xs">{fmt(d.signed_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs">
        <span className="text-muted-foreground">
          {sorted.length === 0 ? '0' : `${start + 1}–${Math.min(start + PAGE_SIZE, sorted.length)}`} de {sorted.length}
        </span>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span>{safePage} / {totalPages}</span>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
