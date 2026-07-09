import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCw, Search } from 'lucide-react';

export interface OwnerFilters {
  search: string;
  plan: string;
  status: string;
}

interface Props {
  filters: OwnerFilters;
  onChange: (f: OwnerFilters) => void;
  onRefresh?: () => void;
  plans: string[];
  placeholder?: string;
}

export function OwnerFilterBar({ filters, onChange, onRefresh, plans, placeholder }: Props) {
  return (
    <div className="flex flex-col md:flex-row gap-2 md:items-center">
      <div className="relative flex-1">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder={placeholder || 'Buscar por nome, e-mail...'}
          className="pl-9"
        />
      </div>
      <Select value={filters.plan} onValueChange={(v) => onChange({ ...filters, plan: v })}>
        <SelectTrigger className="md:w-48"><SelectValue placeholder="Plano" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os planos</SelectItem>
          {plans.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v })}>
        <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Ativos</SelectItem>
          <SelectItem value="blocked">Bloqueados</SelectItem>
          <SelectItem value="inactive">Inativos</SelectItem>
        </SelectContent>
      </Select>
      {onRefresh && (
        <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Atualizar">
          <RotateCw className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
