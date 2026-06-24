import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCcw, Shield, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AppLayout } from '@/components/layout/AppLayout';

type TelemetryRow = {
  id: string;
  correlation_id: string;
  type: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'route_404', label: '404 (rota não encontrada)' },
  { value: 'protected_route_blocked', label: 'ProtectedRoute · bloqueado' },
  { value: 'protected_route_unauthenticated', label: 'ProtectedRoute · sem sessão' },
  { value: 'api_unauthorized', label: 'API 401 (não autenticado)' },
  { value: 'api_forbidden', label: 'API 403 (não autorizado)' },
];

const TYPE_BADGE: Record<string, string> = {
  route_404: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  protected_route_blocked: 'bg-red-500/15 text-red-600 border-red-500/30',
  protected_route_unauthenticated: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  api_unauthorized: 'bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30',
  api_forbidden: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
};

export default function InternalTelemetryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [adminCheck, setAdminCheck] = useState<'loading' | 'allowed' | 'denied'>('loading');

  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // filters
  const [type, setType] = useState('all');
  const [path, setPath] = useState('');
  const [pageKey, setPageKey] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [reason, setReason] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);

  // admin gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setAdminCheck('denied');
        return;
      }
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin',
      });
      if (cancelled) return;
      if (error || data !== true) setAdminCheck('denied');
      else setAdminCheck('allowed');
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const fetchLogs = useMemo(
    () => async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('telemetry_logs')
          .select('id, correlation_id, type, message, metadata, created_at')
          .order('created_at', { ascending: false })
          .limit(500);

        if (type !== 'all') q = q.eq('type', type);
        if (from) q = q.gte('created_at', `${from}T00:00:00`);
        if (to) q = q.lte('created_at', `${to}T23:59:59`);

        const { data, error } = await q;
        if (error) throw error;
        let result = (data ?? []) as TelemetryRow[];

        // client-side filters on metadata json (small dataset, <=500 rows)
        const norm = (s: string) => s.trim().toLowerCase();
        if (path) {
          const p = norm(path);
          result = result.filter((r) =>
            String(r.metadata?.path ?? '').toLowerCase().includes(p),
          );
        }
        if (pageKey) {
          const k = norm(pageKey);
          result = result.filter((r) =>
            String(r.metadata?.pageKey ?? '').toLowerCase().includes(k),
          );
        }
        if (reason) {
          const r2 = norm(reason);
          result = result.filter(
            (r) =>
              String(r.message ?? '').toLowerCase().includes(r2) ||
              String(r.metadata?.reason ?? '').toLowerCase().includes(r2),
          );
        }
        if (userQuery) {
          const u = norm(userQuery);
          result = result.filter(
            (r) =>
              String(r.metadata?.user_email ?? '').toLowerCase().includes(u) ||
              String(r.metadata?.user_id ?? '').toLowerCase().includes(u),
          );
        }

        setRows(result);
      } finally {
        setLoading(false);
      }
    },
    [type, from, to, path, pageKey, userQuery, reason],
  );

  useEffect(() => {
    if (adminCheck === 'allowed') void fetchLogs();
  }, [adminCheck, fetchLogs]);

  if (adminCheck === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (adminCheck === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">Área restrita</h1>
          <p className="text-sm text-muted-foreground">
            Esta página só está disponível para administradores da plataforma.
          </p>
          <Button variant="outline" onClick={() => navigate('/')}>Voltar ao início</Button>
        </div>
      </div>
    );
  }

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    const t = r.type ?? 'unknown';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppLayout title="Telemetria interna">
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Telemetria interna
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Logs de 404, bloqueios de ProtectedRoute e respostas 401/403 da API. Visível apenas
              para administradores.
            </p>
          </div>
          <Button onClick={() => void fetchLogs()} disabled={loading} variant="outline">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Path</Label>
              <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/outros" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">pageKey</Label>
              <Input value={pageKey} onChange={(e) => setPageKey(e.target.value)} placeholder="outros" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo / mensagem</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="page_not_allowed" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Usuário (email ou id)</Label>
              <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="user@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => void fetchLogs()} disabled={loading} className="w-full">
                Aplicar filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Total: {rows.length}</Badge>
          {Object.entries(counts).map(([t, n]) => (
            <Badge key={t} variant="outline" className={TYPE_BADGE[t] ?? ''}>
              {t}: {n}
            </Badge>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Quando</TableHead>
                  <TableHead className="w-[180px]">Tipo</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead className="w-[140px]">pageKey</TableHead>
                  <TableHead>Endpoint / mensagem</TableHead>
                  <TableHead className="w-[220px]">Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin inline-block text-muted-foreground" />
                  </TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                    Nenhum registro para os filtros aplicados.
                  </TableCell></TableRow>
                ) : rows.map((r) => {
                  const m = (r.metadata ?? {}) as Record<string, unknown>;
                  const endpoint = (m.endpoint as string) || (m.method ? `${m.method} ${m.path ?? ''}` : '') || r.message || '';
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TYPE_BADGE[r.type ?? ''] ?? ''}>
                          {r.type ?? '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{String(m.path ?? '—')}</TableCell>
                      <TableCell className="text-xs">{String(m.pageKey ?? '—')}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono break-all">{String(endpoint)}</div>
                        {m.status ? (
                          <div className="text-muted-foreground">status {String(m.status)}</div>
                        ) : null}
                        {m.reason ? (
                          <div className="text-muted-foreground">motivo: {String(m.reason)}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{String(m.user_email ?? '—')}</div>
                        <div className="text-muted-foreground font-mono text-[10px]">
                          {String(m.user_id ?? '')}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
