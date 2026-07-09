import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { OwnerFilterBar, type OwnerFilters } from './OwnerFilterBar';
import type { CompanyRow, SubCompanyRow } from '@/hooks/useOwnerPlatformMetrics';
import { CompanyDetailPanel } from './CompanyDetailPanel';

interface Props {
  companies: CompanyRow[];
  subCompanies: SubCompanyRow[];
  onRefresh: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

function statusBadge(status: string | null) {
  const s = status || 'unknown';
  const cls =
    s === 'active' ? 'bg-success/10 text-success border-success/20'
    : s === 'blocked' ? 'bg-destructive/10 text-destructive border-destructive/20'
    : 'bg-muted text-muted-foreground';
  return <Badge variant="outline" className={cls}>{s}</Badge>;
}

export function CompaniesTable({ companies, subCompanies, onRefresh }: Props) {
  const [filters, setFilters] = useState<OwnerFilters>({ search: '', plan: 'all', status: 'all' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const plans = useMemo(
    () => Array.from(new Set(companies.map((c) => c.plan_slug).filter(Boolean))) as string[],
    [companies],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return companies.filter((c) => {
      if (filters.plan !== 'all' && (c.plan_slug || '') !== filters.plan) return false;
      if (filters.status !== 'all' && (c.status || '') !== filters.status) return false;
      if (q && !`${c.name} ${c.login_email || ''} ${c.segment || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies, filters]);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Empresas ({filtered.length})</h3>
        </div>
      </div>
      <div className="p-4 border-b border-border">
        <OwnerFilterBar
          filters={filters}
          onChange={setFilters}
          onRefresh={onRefresh}
          plans={plans}
          placeholder="Buscar por empresa, e-mail, segmento..."
        />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sub-empresas</TableHead>
              <TableHead className="text-right">Usuários</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Ganhos</TableHead>
              <TableHead className="text-right">Msgs 30d</TableHead>
              <TableHead className="text-right">Receita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">Nenhuma empresa encontrada.</TableCell></TableRow>
            )}
            {filtered.map((c) => {
              const isOpen = expanded === c.id;
              const subs = subCompanies.filter((s) => s.owner_id === c.auth_user_id);
              return (
                <>
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded(isOpen ? null : c.id)}>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{c.name}</span>
                        {c.login_email && <span className="text-xs text-muted-foreground">{c.login_email}</span>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{c.plan_slug || '—'}</Badge></TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-right">{fmt(c.sub_companies)}</TableCell>
                    <TableCell className="text-right">{fmt(c.users)}</TableCell>
                    <TableCell className="text-right">{fmt(c.leads)}</TableCell>
                    <TableCell className="text-right text-success">{fmt(c.won_leads)}</TableCell>
                    <TableCell className="text-right">{fmt(c.messages_30d)}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(c.revenue)}</TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={c.id + '-detail'} className="bg-muted/20">
                      <TableCell colSpan={10} className="p-0">
                        <CompanyDetailPanel company={c} subCompanies={subs} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
