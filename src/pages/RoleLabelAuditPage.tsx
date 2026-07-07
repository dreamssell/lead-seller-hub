import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, PlayCircle, ShieldCheck, AlertTriangle, History } from 'lucide-react';

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  titulares_ceo: number;
  empty_defaulted: number;
  errors: unknown;
  status: string;
  triggered_by: string;
};

type HistoryRow = {
  id: string;
  user_id: string;
  owner_id: string | null;
  from_label: string | null;
  to_label: string | null;
  source: string;
  changed_by_email: string | null;
  target_email: string | null;
  created_at: string;
};

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('pt-BR'); } catch { return v; }
}

export default function RoleLabelAuditPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const [runsRes, histRes] = await Promise.all([
      (supabase as any).from('role_label_backfill_runs').select('*').order('started_at', { ascending: false }).limit(50),
      (supabase as any).from('role_label_history').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    if (runsRes.error) toast({ title: 'Erro ao carregar execuções', description: runsRes.error.message, variant: 'destructive' });
    if (histRes.error) toast({ title: 'Erro ao carregar histórico', description: histRes.error.message, variant: 'destructive' });
    setRuns(runsRes.data || []);
    setHistory(histRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('role-label-backfill', {
      body: { triggered_by: 'manual' },
    });
    setRunning(false);
    if (error) {
      toast({ title: 'Falha ao executar', description: error.message, variant: 'destructive' });
      return;
    }
    const summary = data as any;
    toast({
      title: 'Execução concluída',
      description: `Titulares corrigidos: ${summary?.titulares_ceo ?? 0} · Vazios: ${summary?.empty_defaulted ?? 0}`,
    });
    load();
  };

  const lastRun = runs[0];
  const errorCount = runs.filter(r => r.status !== 'success').length;
  const totalFixed = runs.reduce((sum, r) => sum + (r.titulares_ceo || 0) + (r.empty_defaulted || 0), 0);

  return (
    <AppLayout title="Auditoria de Cargos">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Auditoria de Cargos</h1>
            <p className="text-sm text-muted-foreground">
              Execuções do job automático de correção do campo Cargo e histórico de alterações.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button size="sm" onClick={runNow} disabled={running}>
              <PlayCircle className="w-4 h-4 mr-2" />
              {running ? 'Executando…' : 'Executar agora'}
            </Button>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Última execução</CardTitle>
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">{fmtDate(lastRun?.started_at)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {lastRun ? (
                  <>Status: <Badge variant={lastRun.status === 'success' ? 'default' : 'destructive'}>{lastRun.status}</Badge> · Disparo: {lastRun.triggered_by}</>
                ) : 'Nenhuma execução registrada ainda.'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de perfis corrigidos</CardTitle>
              <History className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalFixed}</div>
              <div className="text-xs text-muted-foreground mt-1">Somatório das últimas {runs.length} execuções.</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Execuções com falha</CardTitle>
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{errorCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Considerando o mesmo intervalo.</div>
            </CardContent>
          </Card>
        </div>

        {/* Execuções */}
        <Card>
          <CardHeader>
            <CardTitle>Execuções do job</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Disparo</TableHead>
                    <TableHead className="text-right">Titulares → CEO</TableHead>
                    <TableHead className="text-right">Vazios → Colaborador</TableHead>
                    <TableHead>Erros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
                  ) : runs.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma execução registrada.</TableCell></TableRow>
                  ) : runs.map(r => {
                    const errs = Array.isArray(r.errors) ? r.errors as string[] : [];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.started_at)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.finished_at)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'success' ? 'default' : r.status === 'partial' ? 'secondary' : 'destructive'}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell><span className="text-xs text-muted-foreground">{r.triggered_by}</span></TableCell>
                        <TableCell className="text-right font-medium">{r.titulares_ceo}</TableCell>
                        <TableCell className="text-right font-medium">{r.empty_defaulted}</TableCell>
                        <TableCell className="max-w-md text-xs text-destructive truncate" title={errs.join(' | ')}>
                          {errs.length === 0 ? '—' : errs.join(' | ')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Histórico */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de alterações de Cargo</CardTitle>
            <p className="text-xs text-muted-foreground">Últimas 100 alterações registradas (quem alterou, de → para, origem).</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Usuário alvo</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Para</TableHead>
                    <TableHead>Alterado por</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
                  ) : history.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhum registro ainda.</TableCell></TableRow>
                  ) : history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(h.created_at)}</TableCell>
                      <TableCell className="text-xs">{h.target_email || h.user_id.slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="outline">{h.from_label ?? '—'}</Badge></TableCell>
                      <TableCell><Badge>{h.to_label ?? '—'}</Badge></TableCell>
                      <TableCell className="text-xs">{h.changed_by_email || (h.source.includes('backfill') ? 'sistema' : '—')}</TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{h.source}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
