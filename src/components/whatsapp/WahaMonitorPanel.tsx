import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Save, Smartphone, Wifi, WifiOff, QrCode, AlertTriangle } from 'lucide-react';

type WahaConn = {
  id: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  owner_id: string;
  sub_company_id: string | null;
  last_checked_at: string | null;
  metadata: any;
};

type LiveState = {
  loading: boolean;
  status?: string;
  phone?: string | null;
  connected?: boolean;
  error?: string;
  checkedAt?: string;
};

type SubCompany = { id: string; name: string; owner_id: string };
type Pipeline = { id: string; name: string; owner_id: string; sub_company_id: string | null };
type Routing = { sub_company_id: string | null; pipeline_id: string | null };

const STATUS_MAP: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  WORKING: { label: 'WORKING', tone: 'ok' },
  SCAN_QR_CODE: { label: 'SCAN_QR_CODE', tone: 'warn' },
  STARTING: { label: 'STARTING', tone: 'warn' },
  STOPPED: { label: 'STOPPED', tone: 'muted' },
  FAILED: { label: 'FAILED', tone: 'bad' },
  UNKNOWN: { label: 'UNKNOWN', tone: 'muted' },
};

function StatusBadge({ status }: { status?: string }) {
  const key = (status ?? 'UNKNOWN').toUpperCase();
  const info = STATUS_MAP[key] ?? { label: key, tone: 'muted' as const };
  const cls =
    info.tone === 'ok'
      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
      : info.tone === 'warn'
      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
      : info.tone === 'bad'
      ? 'bg-red-500/15 text-red-500 border-red-500/30'
      : 'bg-secondary text-muted-foreground border-border';
  const Icon =
    info.tone === 'ok' ? Wifi : info.tone === 'warn' ? QrCode : info.tone === 'bad' ? AlertTriangle : WifiOff;
  return (
    <Badge variant="outline" className={`gap-1.5 ${cls}`}>
      <Icon className="w-3 h-3" />
      {info.label}
    </Badge>
  );
}

export function WahaMonitorPanel() {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<WahaConn[]>([]);
  const [subCompanies, setSubCompanies] = useState<SubCompany[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [routings, setRoutings] = useState<Record<string, Routing>>({}); // key = `${owner}|${sub_or_none}`
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [drafts, setDrafts] = useState<Record<string, { sub_company_id: string | 'none'; pipeline_id: string | 'none' }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [connRes, subRes, pipeRes, routeRes] = await Promise.all([
      supabase
        .from('whatsapp_connections')
        .select('id, display_name, phone_number, status, owner_id, sub_company_id, last_checked_at, metadata')
        .eq('provider', 'waha')
        .order('created_at', { ascending: false }),
      supabase.from('sub_companies').select('id, name, owner_id').order('name'),
      supabase.from('pipelines').select('id, name, owner_id, sub_company_id').order('name'),
      supabase.from('channel_routing').select('owner_id, sub_company_id, pipeline_id, channel').eq('channel', 'waha'),
    ]);
    if (connRes.error) toast.error('Erro ao carregar conexões WAHA');
    setConnections((connRes.data ?? []) as WahaConn[]);
    setSubCompanies((subRes.data ?? []) as SubCompany[]);
    setPipelines((pipeRes.data ?? []) as Pipeline[]);
    const map: Record<string, Routing> = {};
    (routeRes.data ?? []).forEach((r: any) => {
      map[`${r.owner_id}|${r.sub_company_id ?? 'none'}`] = {
        sub_company_id: r.sub_company_id ?? null,
        pipeline_id: r.pipeline_id ?? null,
      };
    });
    setRoutings(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Initialize drafts from stored data
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      connections.forEach((c) => {
        if (next[c.id]) return;
        const routing = routings[`${c.owner_id}|${c.sub_company_id ?? 'none'}`];
        next[c.id] = {
          sub_company_id: c.sub_company_id ?? 'none',
          pipeline_id: routing?.pipeline_id ?? 'none',
        };
      });
      return next;
    });
  }, [connections, routings]);

  const probe = useCallback(async (conn: WahaConn) => {
    setLive((p) => ({ ...p, [conn.id]: { ...(p[conn.id] ?? {}), loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'status', connection_id: conn.id },
      });
      if (error) throw error;
      const ok = (data as any)?.ok !== false;
      const status = (data as any)?.status ?? 'UNKNOWN';
      const phone = (data as any)?.phone ?? null;
      const connected = !!(data as any)?.connected;
      setLive((p) => ({
        ...p,
        [conn.id]: {
          loading: false,
          status: ok ? status : 'FAILED',
          phone,
          connected,
          error: ok ? undefined : ((data as any)?.error ?? 'Falha ao consultar WAHA'),
          checkedAt: new Date().toISOString(),
        },
      }));
      // Persist last_checked_at + phone/status when meaningful
      const updates: any = { last_checked_at: new Date().toISOString() };
      if (phone && !conn.phone_number) updates.phone_number = String(phone).replace(/@c\.us$/, '');
      if (ok) updates.status = connected ? 'connected' : status?.toLowerCase() === 'scan_qr_code' ? 'connecting' : conn.status;
      await supabase.from('whatsapp_connections').update(updates).eq('id', conn.id);
    } catch (err: any) {
      setLive((p) => ({
        ...p,
        [conn.id]: { loading: false, status: 'FAILED', error: err?.message ?? 'Erro', checkedAt: new Date().toISOString() },
      }));
    }
  }, []);

  const configureWebhook = useCallback(async (conn: WahaConn) => {
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: { action: 'configure_webhook', connection_id: conn.id },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast({ title: 'Webhook configurado', description: 'Novas mensagens agora serão sincronizadas.' });
        setTimeout(() => probe(conn), 3000);
      } else {
        toast({ title: 'Falha ao configurar webhook', description: JSON.stringify(data).slice(0, 200), variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message ?? 'Erro', variant: 'destructive' });
    }
  }, [probe]);


  // Auto-probe once when connections load
  useEffect(() => {
    connections.forEach((c) => {
      if (!live[c.id]) probe(c);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections]);

  const saveMapping = useCallback(
    async (conn: WahaConn) => {
      const draft = drafts[conn.id];
      if (!draft) return;
      setSaving((p) => ({ ...p, [conn.id]: true }));
      try {
        const nextSub = draft.sub_company_id === 'none' ? null : draft.sub_company_id;
        const nextPipe = draft.pipeline_id === 'none' ? null : draft.pipeline_id;

        // Update connection scope (sub_company)
        const { error: connErr } = await supabase
          .from('whatsapp_connections')
          .update({ sub_company_id: nextSub })
          .eq('id', conn.id);
        if (connErr) throw connErr;

        // Upsert channel routing
        const { error: routeErr } = await supabase
          .from('channel_routing')
          .upsert(
            {
              owner_id: conn.owner_id,
              sub_company_id: nextSub,
              channel: 'waha',
              chat_provider: 'waha',
              pipeline_id: nextPipe,
              enabled: true,
            },
            { onConflict: 'owner_id,sub_company_id,channel' },
          );
        if (routeErr) throw routeErr;

        toast.success('Mapeamento salvo');
        await load();
      } catch (err: any) {
        toast.error('Erro ao salvar mapeamento', { description: err?.message });
      } finally {
        setSaving((p) => ({ ...p, [conn.id]: false }));
      }
    },
    [drafts, load],
  );

  const subsFor = useCallback(
    (ownerId: string) => subCompanies.filter((s) => s.owner_id === ownerId),
    [subCompanies],
  );
  const pipelinesFor = useCallback(
    (ownerId: string, subId: string | null) =>
      pipelines.filter((p) => p.owner_id === ownerId && (p.sub_company_id === subId || p.sub_company_id === null)),
    [pipelines],
  );

  const empty = useMemo(() => !loading && connections.length === 0, [loading, connections.length]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Monitor & Mapeamento WAHA</h3>
          <p className="text-sm text-muted-foreground">
            Acompanhe o status da sessão em tempo real e associe cada número a uma sub-empresa e funil.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Recarregar
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {empty && (
        <Card className="glass-card border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma conexão WAHA disponível. Crie uma na aba <strong>Conexões</strong>.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {connections.map((conn) => {
          const st = live[conn.id];
          const draft = drafts[conn.id] ?? { sub_company_id: 'none', pipeline_id: 'none' };
          const subs = subsFor(conn.owner_id);
          const subId = draft.sub_company_id === 'none' ? null : draft.sub_company_id;
          const pipes = pipelinesFor(conn.owner_id, subId);
          const isSaving = !!saving[conn.id];
          const lastSync = st?.checkedAt ?? conn.last_checked_at;
          return (
            <Card key={conn.id} className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-primary" />
                      {conn.display_name}
                    </CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span>
                        Sessão: <code className="font-mono">{conn.metadata?.session ?? '—'}</code>
                      </span>
                      <span>
                        Número: <strong>{st?.phone ? String(st.phone).replace(/@c\.us$/, '') : conn.phone_number ?? '—'}</strong>
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {st?.loading ? (
                      <Badge variant="outline" className="gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Consultando…
                      </Badge>
                    ) : (
                      <StatusBadge status={st?.status ?? conn.status?.toUpperCase()} />
                    )}
                    <Button variant="ghost" size="sm" onClick={() => probe(conn)}>
                      <RefreshCw className={`w-3.5 h-3.5 ${st?.loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {st?.error && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
                    {st.error}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sub-empresa</Label>
                    <Select
                      value={draft.sub_company_id}
                      onValueChange={(v) =>
                        setDrafts((p) => ({
                          ...p,
                          [conn.id]: { sub_company_id: v as any, pipeline_id: 'none' },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma sub-empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Conta principal —</SelectItem>
                        {subs.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Funil de destino</Label>
                    <Select
                      value={draft.pipeline_id}
                      onValueChange={(v) =>
                        setDrafts((p) => ({ ...p, [conn.id]: { ...draft, pipeline_id: v as any } }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um funil" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sem roteamento automático —</SelectItem>
                        {pipes.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Última sincronização:{' '}
                    {lastSync ? new Date(lastSync).toLocaleString('pt-BR') : '—'}
                  </span>
                  <Button size="sm" onClick={() => saveMapping(conn)} disabled={isSaving}>
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar mapeamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
