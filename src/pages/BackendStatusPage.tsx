import { AppLayout } from '@/components/layout/AppLayout';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2, XCircle, RefreshCw, Database, Shield, Zap, AlertTriangle, Download, History as HistoryIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface CheckResult {
  label: string;
  status: 'ok' | 'fail' | 'pending';
  latencyMs?: number;
  detail?: string;
}

import UazStatusPanel from '@/components/settings/UazStatusPanel';
import UazAlertHistoryTab from '@/components/settings/UazAlertHistoryTab';
import UazRemediationTab from '@/components/settings/UazRemediationTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AlertCircle, MoreHorizontal, User } from 'lucide-react';

export default function BackendStatusPage() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<{ at: string; message: string }[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    const results: CheckResult[] = [];
    const PROJECT_URL = import.meta.env.VITE_SUPABASE_URL as string;

    // 1) Auth session
    const t0 = performance.now();
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      results.push({
        label: 'Sessão de autenticação',
        status: data.session ? 'ok' : 'fail',
        latencyMs: Math.round(performance.now() - t0),
        detail: data.session ? `Logado como ${data.session.user.email}` : 'Sem sessão ativa',
      });
    } catch (e) {
      results.push({ label: 'Sessão de autenticação', status: 'fail', detail: String(e) });
    }

    // 2) PostgREST reachability (HEAD /rest/v1/)
    const t1 = performance.now();
    try {
      const res = await fetch(`${PROJECT_URL}/rest/v1/`, {
        method: 'GET',
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
      });
      results.push({
        label: 'PostgREST (REST API)',
        status: res.ok ? 'ok' : 'fail',
        latencyMs: Math.round(performance.now() - t1),
        detail: `HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({ label: 'PostgREST (REST API)', status: 'fail', detail: String(e) });
    }

    // 3) Query simples (profiles)
    const t2 = performance.now();
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
      results.push({
        label: 'Consulta SQL básica',
        status: 'ok',
        latencyMs: Math.round(performance.now() - t2),
        detail: 'SELECT em profiles ok',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ label: 'Consulta SQL básica', status: 'fail', detail: msg });
      setErrors(prev => [{ at: new Date().toISOString(), message: msg }, ...prev].slice(0, 20));
    }

    // 4) Realtime
    const t3 = performance.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const ch = supabase.channel(`status-${Date.now()}`);
        const timer = setTimeout(() => { supabase.removeChannel(ch); reject(new Error('Timeout (5s)')); }, 5000);
        ch.subscribe(status => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            supabase.removeChannel(ch);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timer);
            supabase.removeChannel(ch);
            reject(new Error(status));
          }
        });
      });
      results.push({ label: 'Realtime (WebSocket)', status: 'ok', latencyMs: Math.round(performance.now() - t3) });
    } catch (e) {
      results.push({ label: 'Realtime (WebSocket)', status: 'fail', detail: String(e) });
    }

    // 5) Edge Functions
    const t4 = performance.now();
    try {
      const res = await fetch(`${PROJECT_URL}/functions/v1/manage-api-keys`, { method: 'OPTIONS' });
      results.push({
        label: 'Edge Functions',
        status: res.ok ? 'ok' : 'fail',
        latencyMs: Math.round(performance.now() - t4),
        detail: `HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({ label: 'Edge Functions', status: 'fail', detail: String(e) });
    }

    // 6) UAZ Integration Health
    const t5 = performance.now();
    try {
      const { data: uazHealth } = await supabase.functions.invoke('uaz-healthcheck');
      results.push({ 
        label: 'Integração UAZ WhatsApp', 
        status: uazHealth?.status === 'online' ? 'ok' : 'fail',
        latencyMs: Math.round(performance.now() - t5),
        detail: uazHealth?.status === 'online' ? `Operacional (${uazHealth.latency_ms}ms)` : 'Instável ou offline'
      });
    } catch (e) {
      results.push({ label: 'Integração UAZ WhatsApp', status: 'fail', detail: 'Erro ao conectar' });
    }

    // 7) Permissões do usuário (admin?)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
        const labels = (roles ?? []).map(r => r.role).join(', ') || 'sem papéis (usuário comum)';
        results.push({ label: 'Permissões da credencial', status: 'ok', detail: labels });
      } else {
        results.push({ label: 'Permissões da credencial', status: 'fail', detail: 'Não autenticado' });
      }
    } catch (e) {
      results.push({ label: 'Permissões da credencial', status: 'fail', detail: String(e) });
    }

    setChecks(results);
    setLastRun(new Date());
    setRunning(false);
  }, []);

  useEffect(() => {
    run();
    const onErr = (ev: ErrorEvent) =>
      setErrors(prev => [{ at: new Date().toISOString(), message: ev.message }, ...prev].slice(0, 20));
    const onRej = (ev: PromiseRejectionEvent) =>
      setErrors(prev => [{ at: new Date().toISOString(), message: String(ev.reason) }, ...prev].slice(0, 20));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, [run]);

  const exportSnapshot = async () => {
    try {
      const [{ data: profiles }, { data: customers }, { data: leads }, { data: tasks }, { data: products }, { data: audit }] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('leads').select('*'),
        supabase.from('tasks').select('*'),
        supabase.from('products').select('*'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5000),
      ]);
      const snapshot = {
        exported_at: new Date().toISOString(),
        tables: { profiles, customers, leads, tasks, products, audit_logs: audit },
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 19)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Backup gerado', description: 'O dump em JSON foi baixado.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Falha no backup', description: String(e) });
    }
  };

  const allOk = checks.length > 0 && checks.every(c => c.status === 'ok');

  return (
    <AppLayout title="Status do Backend" subtitle="Diagnóstico, conexões e monitoramento">
      <Tabs defaultValue="overview" className="max-w-5xl space-y-6">
        <TabsList className="bg-secondary/40 p-1 border border-border/40">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="w-4 h-4" /> Geral
          </TabsTrigger>
          <TabsTrigger value="uaz-status" className="gap-2">
            <Zap className="w-4 h-4" /> Status UAZ
          </TabsTrigger>
          <TabsTrigger value="uaz-alerts" className="gap-2">
            <AlertTriangle className="w-4 h-4" /> Alertas UAZ
          </TabsTrigger>
          <TabsTrigger value="uaz-remediation" className="gap-2">
            <HistoryIcon className="w-4 h-4" /> Auditoria Remediação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uaz-remediation">
          <UazRemediationTab />
        </TabsContent>

        <TabsContent value="uaz-status">
          <UazStatusPanel />
        </TabsContent>

        <TabsContent value="uaz-alerts">
          <UazAlertHistoryTab />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
        {/* Header status */}
        <div className="glass-card p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${allOk ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
              <Activity className={`w-6 h-6 ${allOk ? 'text-green-500' : 'text-destructive'}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {running ? 'Verificando...' : allOk ? 'Todos os sistemas operacionais' : 'Há serviços com falha'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {lastRun ? `Última verificação: ${lastRun.toLocaleTimeString('pt-BR')}` : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportSnapshot}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-sm transition-colors"
            >
              <Download className="w-4 h-4" /> Backup (JSON)
            </button>
            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} /> Re-testar
            </button>
          </div>
        </div>

        {/* Checks grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {checks.map((c, i) => (
            <motion.div
              key={c.label}
              className="glass-card p-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className="flex items-start gap-3">
                {c.status === 'ok' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    {c.latencyMs != null && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">{c.latencyMs}ms</span>
                    )}
                  </div>
                  {c.detail && <p className="text-xs text-muted-foreground mt-1 truncate">{c.detail}</p>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Backup info */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-primary" /> Backups automáticos
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            O Lovable Cloud executa <strong>backups diários automáticos</strong> do banco de dados com retenção
            gerenciada pela infraestrutura. Para um dump pontual sob demanda, use o botão <em>Backup (JSON)</em>
            acima — ele exporta os principais snapshots (clientes, leads, tarefas, produtos, perfis e auditoria)
            em um único arquivo restaurável.
          </p>
        </div>

        {/* Permissions hint */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-primary" /> Credenciais & acesso ao banco
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Seu acesso ao banco é validado via JWT do Lovable Cloud com Row-Level Security (RLS). Operações
            via SQL e APIs ocorrem como o usuário logado e respeitam as políticas das tabelas. Papéis
            administrativos (<code className="bg-secondary px-1 rounded">admin</code>) habilitam ações
            sensíveis como gerenciar chaves API e visualizar toda a auditoria.
          </p>
        </div>

        {/* Errors monitor */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Monitor de erros (sessão atual)
          </h3>
          {errors.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="w-3.5 h-3.5" /> Nenhum erro capturado nesta sessão.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {errors.map((e, i) => (
                <div key={i} className="text-xs border-l-2 border-destructive pl-3 py-1">
                  <p className="text-muted-foreground">{new Date(e.at).toLocaleString('pt-BR')}</p>
                  <p className="text-foreground font-mono break-all">{e.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
