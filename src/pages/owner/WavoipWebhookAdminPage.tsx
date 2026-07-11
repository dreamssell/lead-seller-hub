import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Copy, RefreshCw, PlayCircle, ShieldAlert, CheckCircle2, Loader2, Search } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

type EventRow = {
  id: string;
  received_at: string;
  event: string | null;
  status: string;
  wavoip_call_id: string | null;
  phone_number: string | null;
  call_history_id: string | null;
  http_status: number | null;
  error_message: string | null;
  payload: any;
  source_ip: string | null;
};

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  success: { label: 'Sucesso', variant: 'default' },
  inserted_stub: { label: 'Registro criado', variant: 'default' },
  not_found: { label: 'Não encontrado', variant: 'destructive' },
  update_error: { label: 'Erro ao atualizar', variant: 'destructive' },
  bad_payload: { label: 'Payload inválido', variant: 'destructive' },
  unauthorized: { label: 'Token inválido', variant: 'destructive' },
};

export default function WavoipWebhookAdminPage() {
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [testing, setTesting] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [callIdFilter, setCallIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detail, setDetail] = useState<EventRow | null>(null);

  const failuresLast24h = useMemo(
    () => events.filter((e) => ['not_found', 'update_error', 'unauthorized', 'bad_payload'].includes(e.status)
      && Date.now() - new Date(e.received_at).getTime() < 86_400_000).length,
    [events],
  );

  const loadConfig = useCallback(async () => {
    setLoadingUrl(true);
    const { data, error } = await supabase.functions.invoke('wavoip-webhook-config');
    if (error) {
      toast.error('Falha ao carregar URL do webhook', { description: error.message });
      setConfigured(false);
    } else if (data) {
      setConfigured(Boolean(data.configured));
      setWebhookUrl(data.webhook_url ?? null);
      setTokenPreview(data.token_preview ?? null);
    }
    setLoadingUrl(false);
  }, []);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    let q = (supabase as any)
      .from('wavoip_webhook_events')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(200);
    if (callIdFilter.trim()) q = q.ilike('wavoip_call_id', `%${callIdFilter.trim()}%`);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) toast.error('Falha ao carregar eventos', { description: error.message });
    else setEvents((data as EventRow[]) || []);
    setLoadingEvents(false);
  }, [callIdFilter, statusFilter]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Realtime — novos eventos aparecem sozinhos
  useEffect(() => {
    const ch = supabase
      .channel('wavoip-webhook-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wavoip_webhook_events' }, () => {
        loadEvents();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadEvents]);

  const copyUrl = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    toast.success('URL copiada', { description: 'Cole no painel da Wavoip → Integrações → Webhook.' });
  };

  const testWebhook = async () => {
    if (!webhookUrl) return;
    setTesting(true);
    try {
      const fakeId = `test-${crypto.randomUUID()}`;
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'ended',
          data: {
            wavoip_call_id: fakeId,
            phone: '+5511999999999',
            direction: 'outbound',
            started_at: new Date(Date.now() - 60_000).toISOString(),
            answered_at: new Date(Date.now() - 45_000).toISOString(),
            ended_at: new Date().toISOString(),
            duration: 45,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && (body.ok || body.outcome === 'inserted_stub')) {
        toast.success('Webhook respondeu com sucesso', {
          description: `outcome=${body.outcome} • call_id=${fakeId.slice(0, 12)}…`,
        });
      } else {
        toast.error('Webhook retornou erro', {
          description: `HTTP ${res.status} • ${body.error || body.outcome || 'sem detalhes'}`,
        });
      }
      loadEvents();
    } catch (e) {
      toast.error('Falha ao invocar webhook', { description: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <AppLayout title="Webhook Wavoip" subtitle="Configuração, testes e histórico de eventos">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhook Wavoip</h1>
          <p className="text-sm text-muted-foreground">
            Configure a URL abaixo no painel da Wavoip para receber eventos de chamada em tempo real.
          </p>
        </div>

        {failuresLast24h > 0 && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>{failuresLast24h} falha(s) nas últimas 24 h</AlertTitle>
            <AlertDescription>
              Confira os registros abaixo com status <b>Token inválido</b>, <b>Não encontrado</b> ou <b>Erro ao atualizar</b>.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Endpoint do webhook
            </CardTitle>
            <CardDescription>
              Cole a URL completa (com token) no campo <b>Endpoint</b> em Wavoip → Integrações → Webhook e clique em Salvar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingUrl ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            ) : !configured || !webhookUrl ? (
              <Alert variant="destructive">
                <AlertTitle>Segredo não configurado</AlertTitle>
                <AlertDescription>
                  `WAVOIP_WEBHOOK_SECRET` não está definido no backend. Contate o administrador.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                  <Button onClick={copyUrl}><Copy className="w-4 h-4 mr-1" /> Copiar</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Token ativo: <span className="font-mono">{tokenPreview}</span> — a URL contém o segredo, trate-a como sensível.
                </p>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={testWebhook} disabled={testing}>
                    {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />}
                    Testar webhook
                  </Button>
                  <Button variant="ghost" onClick={loadConfig}>
                    <RefreshCw className="w-4 h-4 mr-1" /> Recarregar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Últimos eventos recebidos</CardTitle>
              <CardDescription>
                Consulte por <code>wavoip_call_id</code> e status. Payload bruto disponível ao clicar em uma linha.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadEvents}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Filtrar por wavoip_call_id"
                  value={callIdFilter}
                  onChange={(e) => setCallIdFilter(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recebido em</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Call ID</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingEvents ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
                    </TableCell></TableRow>
                  ) : events.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum evento registrado.
                    </TableCell></TableRow>
                  ) : events.map((ev) => {
                    const s = STATUS_LABEL[ev.status] || { label: ev.status, variant: 'outline' as const };
                    return (
                      <TableRow key={ev.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetail(ev)}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(ev.received_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-xs">{ev.event || '—'}</TableCell>
                        <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{ev.wavoip_call_id?.slice(0, 16) || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{ev.phone_number || '—'}</TableCell>
                        <TableCell className="text-xs text-destructive truncate max-w-[220px]">{ev.error_message || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-w-2xl">
            {detail && (
              <>
                <DialogHeader>
                  <DialogTitle>Evento {detail.event || 'desconhecido'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><b>Recebido:</b> {new Date(detail.received_at).toLocaleString('pt-BR')}</div>
                    <div><b>Status:</b> {STATUS_LABEL[detail.status]?.label || detail.status}</div>
                    <div><b>Call ID:</b> <span className="font-mono text-xs">{detail.wavoip_call_id || '—'}</span></div>
                    <div><b>Telefone:</b> <span className="font-mono text-xs">{detail.phone_number || '—'}</span></div>
                    <div><b>HTTP:</b> {detail.http_status ?? '—'}</div>
                    <div><b>IP origem:</b> <span className="font-mono text-xs">{detail.source_ip || '—'}</span></div>
                  </div>
                  {detail.error_message && (
                    <Alert variant="destructive"><AlertDescription>{detail.error_message}</AlertDescription></Alert>
                  )}
                  <div>
                    <p className="text-xs uppercase text-muted-foreground font-semibold mt-2">Payload bruto</p>
                    <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-80">{JSON.stringify(detail.payload, null, 2)}</pre>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
