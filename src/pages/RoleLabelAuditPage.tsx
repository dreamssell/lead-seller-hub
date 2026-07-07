import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, PlayCircle, ShieldCheck, AlertTriangle, History, Download, Search, Eye } from 'lucide-react';

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

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(',');
  const body = rows.map(r => columns.map(c => esc(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function RoleLabelAuditPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailsRun, setDetailsRun] = useState<Run | null>(null);

  // filtros
  const [runStatus, setRunStatus] = useState<string>('all');
  const [runTrigger, setRunTrigger] = useState<string>('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historySource, setHistorySource] = useState<string>('all');

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
    if (running) return;
    setConfirmOpen(false);
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

  const filteredRuns = useMemo(() => runs.filter(r => {
    if (runStatus !== 'all' && r.status !== runStatus) return false;
    if (runTrigger !== 'all' && r.triggered_by !== runTrigger) return false;
    return true;
  }), [runs, runStatus, runTrigger]);

  const triggerOptions = useMemo(() => {
    const set = new Set<string>();
    runs.forEach(r => r.triggered_by && set.add(r.triggered_by));
    return Array.from(set);
  }, [runs]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => h.source && set.add(h.source));
    return Array.from(set);
  }, [history]);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return history.filter(h => {
      if (historySource !== 'all' && h.source !== historySource) return false;
      if (!q) return true;
      return (
        (h.target_email || '').toLowerCase().includes(q) ||
        (h.changed_by_email || '').toLowerCase().includes(q) ||
        h.user_id.toLowerCase().includes(q) ||
        (h.from_label || '').toLowerCase().includes(q) ||
        (h.to_label || '').toLowerCase().includes(q)
      );
    });
  }, [history, historyQuery, historySource]);

  const lastRun = runs[0];
  const errorCount = runs.filter(r => r.status !== 'success').length;
  const totalFixed = runs.reduce((sum, r) => sum + (r.titulares_ceo || 0) + (r.empty_defaulted || 0), 0);

  const exportRunsCsv = () => {
    const rows = filteredRuns.map(r => ({
      ...r,
      errors: Array.isArray(r.errors) ? (r.errors as string[]).join(' | ') : String(r.errors ?? ''),
    }));
    downloadCsv(
      `role-label-runs-${new Date().toISOString().slice(0,10)}.csv`,
      toCsv(rows as any, ['id','started_at','finished_at','status','triggered_by','titulares_ceo','empty_defaulted','errors']),
    );
  };

  const exportHistoryCsv = () => {
    downloadCsv(
      `role-label-history-${new Date().toISOString().slice(0,10)}.csv`,
      toCsv(filteredHistory as any, ['id','created_at','user_id','target_email','from_label','to_label','changed_by','changed_by_email','source','owner_id']),
    );
  };

  return (
    <AppLayout title="Auditoria de Cargos">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
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
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={running}>
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
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Execuções do job</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Filtre por status ou origem do disparo.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={runStatus} onValueChange={setRunStatus}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="success">success</SelectItem>
                  <SelectItem value="partial">partial</SelectItem>
                  <SelectItem value="failed">failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={runTrigger} onValueChange={setRunTrigger}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Disparo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os disparos</SelectItem>
                  {triggerOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportRunsCsv} disabled={filteredRuns.length === 0}>
                <Download className="w-4 h-4 mr-2" /> Exportar CSV
              </Button>
            </div>
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
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
                  ) : filteredRuns.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhuma execução no filtro atual.</TableCell></TableRow>
                  ) : filteredRuns.map(r => {
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
                          {errs.length === 0 ? '—' : `${errs.length} erro(s)`}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setDetailsRun(r)}>
                            <Eye className="w-4 h-4 mr-1" /> Detalhes
                          </Button>
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
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Histórico de alterações de Cargo</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Últimas 100 alterações registradas (quem alterou, de → para, origem).</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historyQuery}
                  onChange={e => setHistoryQuery(e.target.value)}
                  placeholder="Buscar por email, usuário ou cargo…"
                  className="pl-8 w-[260px] h-9"
                />
              </div>
              <Select value={historySource} onValueChange={setHistorySource}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {sourceOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportHistoryCsv} disabled={filteredHistory.length === 0}>
                <Download className="w-4 h-4 mr-2" /> Exportar CSV
              </Button>
            </div>
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
                  ) : filteredHistory.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhum registro para o filtro atual.</TableCell></TableRow>
                  ) : filteredHistory.map(h => (
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

      {/* Confirmação Executar agora */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Executar backfill de Cargos agora?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Esta ação vai varrer todos os perfis da plataforma e aplicar as regras:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Titulares de Empresa/Sub-empresa sem cargo ou com rótulo genérico → <strong>CEO</strong>.</li>
                  <li>Demais perfis com Cargo vazio → <strong>Colaborador</strong>.</li>
                </ul>
                <p>É idempotente: perfis já corretos não são alterados. Cada alteração é registrada no histórico.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runNow} disabled={running}>
              {running ? 'Executando…' : 'Confirmar e executar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detalhes da execução */}
      <Dialog open={!!detailsRun} onOpenChange={(o) => !o && setDetailsRun(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da execução</DialogTitle>
            <DialogDescription>
              Iniciada em {fmtDate(detailsRun?.started_at)} · Disparo: {detailsRun?.triggered_by}
            </DialogDescription>
          </DialogHeader>
          {detailsRun && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={detailsRun.status === 'success' ? 'default' : detailsRun.status === 'partial' ? 'secondary' : 'destructive'}>{detailsRun.status}</Badge></div>
                <div><span className="text-muted-foreground">Finalizada:</span> {fmtDate(detailsRun.finished_at)}</div>
                <div><span className="text-muted-foreground">Titulares → CEO:</span> <strong>{detailsRun.titulares_ceo}</strong></div>
                <div><span className="text-muted-foreground">Vazios → Colaborador:</span> <strong>{detailsRun.empty_defaulted}</strong></div>
              </div>
              <div>
                <div className="font-medium mb-2">Erros retornados</div>
                {(() => {
                  const errs = Array.isArray(detailsRun.errors) ? detailsRun.errors as string[] : [];
                  if (errs.length === 0) return <p className="text-xs text-muted-foreground">Nenhum erro registrado.</p>;
                  return (
                    <ul className="space-y-1 max-h-60 overflow-y-auto rounded border p-3 bg-muted/30">
                      {errs.map((e, i) => (
                        <li key={i} className="text-xs text-destructive break-words font-mono">{e}</li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsRun(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
