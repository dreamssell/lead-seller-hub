import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

interface AuditRow {
  id: string;
  created_at: string;
  table_name: string;
  action: string;
  record_id: string | null;
  record_label: string | null;
  changed_by: string;
  changed_by_name: string | null;
  changes: any;
  owner_id: string | null;
  sub_company_id: string | null;
  total_count: number;
}

interface Actor { user_id: string; name: string }

const TABLE_LABEL: Record<string, string> = {
  user_account_access: 'Vínculos de usuário',
  sub_companies: 'Sub-empresas',
  profiles: 'Cargo (perfil)',
  sip_configurations: 'SIP / Voz',
  whatsapp_connections: 'Conexões WhatsApp',
};

const ACTION_TONE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  insert: 'default',
  update: 'secondary',
  delete: 'destructive',
};

const PAGE_SIZE = 50;

export default function AuditTrailPage() {
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(false);
  const [table, setTable] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [actor, setActor] = useState<string>('all');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  const load = async (resetPage = false) => {
    setLoading(true);
    const targetPage = resetPage ? 0 : page;
    try {
      const { data, error } = await (supabase as any).rpc('search_audit_logs_scoped', {
        p_owner: null,
        p_sub: null,
        p_table: table === 'all' ? null : table,
        p_action: action === 'all' ? null : action,
        p_user: actor === 'all' ? null : actor,
        p_from: from ? new Date(from).toISOString() : null,
        p_to: to ? new Date(to).toISOString() : null,
        p_limit: PAGE_SIZE,
        p_offset: targetPage * PAGE_SIZE,
      });
      if (error) throw error;
      setRows((data ?? []) as AuditRow[]);
      if (resetPage) setPage(0);
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao carregar histórico de auditoria');
    } finally {
      setLoading(false);
    }
  };

  const loadActors = async () => {
    const { data } = await (supabase as any).rpc('list_audit_actors', { p_owner: null });
    setActors((data ?? []) as Actor[]);
  };

  useEffect(() => { if (isOwner) { void load(); void loadActors(); } }, [isOwner]);
  useEffect(() => { if (isOwner) void load(); }, [page]);

  if (ownerLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText className="text-primary" /> Histórico de auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Trilha completa de mudanças críticas em permissões, sub-empresas, cargos, SIP e conexões WhatsApp.
          </p>
        </div>
        <Button onClick={() => load(true)} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw className={loading ? 'animate-spin h-4 w-4' : 'h-4 w-4'} /> Atualizar
        </Button>
      </div>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger><SelectValue placeholder="Tabela" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as tabelas</SelectItem>
              {Object.entries(TABLE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              <SelectItem value="insert">Criação</SelectItem>
              <SelectItem value="update">Alteração</SelectItem>
              <SelectItem value="delete">Exclusão</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger><SelectValue placeholder="Autor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os autores</SelectItem>
              {actors.map(a => (
                <SelectItem key={a.user_id} value={a.user_id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button onClick={() => load(true)} disabled={loading}>Aplicar</Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Eventos ({total})</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button size="icon" variant="ghost" disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>{page + 1} / {pages}</span>
            <Button size="icon" variant="ghost" disabled={page >= pages - 1 || loading} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="animate-spin h-4 w-4" /> Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhum evento encontrado.</div>
          ) : (
            <div className="divide-y">
              {rows.map(r => {
                const isOpen = expanded === r.id;
                return (
                  <div key={r.id} className="py-3">
                    <button
                      className="w-full text-left flex items-start justify-between gap-4 hover:bg-muted/40 rounded-md px-2 py-1 transition"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={ACTION_TONE[r.action] ?? 'default'}>{r.action}</Badge>
                          <span className="text-sm font-medium">{TABLE_LABEL[r.table_name] ?? r.table_name}</span>
                          <span className="text-xs text-muted-foreground truncate">· {r.record_label ?? r.record_id}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          por <span className="font-medium">{r.changed_by_name ?? '—'}</span>
                          {r.owner_id ? ` · owner=${r.owner_id.slice(0, 8)}…` : ''}
                          {r.sub_company_id ? ` · sub=${r.sub_company_id.slice(0, 8)}…` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('pt-BR')}
                      </div>
                    </button>
                    {isOpen && r.changes && (
                      <pre className="mt-2 text-[11px] bg-muted/50 rounded p-3 overflow-auto max-h-80">
                        {JSON.stringify(r.changes, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
