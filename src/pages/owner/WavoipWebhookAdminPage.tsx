import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Copy, RefreshCw, PlayCircle, ShieldAlert, Loader2, Search, Plus, Trash2, ShieldCheck,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

type TokenRow = {
  id: string;
  owner_id: string;
  sub_company_id: string | null;
  token: string;
  label: string | null;
  is_active: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

type SubCompany = { id: string; name: string };

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
  owner_id: string | null;
  sub_company_id: string | null;
  token_id: string | null;
};

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  success: { label: 'Sucesso', variant: 'default' },
  inserted_stub: { label: 'Registro criado', variant: 'default' },
  not_found: { label: 'Não encontrado', variant: 'destructive' },
  update_error: { label: 'Erro ao atualizar', variant: 'destructive' },
  bad_payload: { label: 'Payload inválido', variant: 'destructive' },
  unauthorized: { label: 'Token inválido', variant: 'destructive' },
};

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;

function buildWebhookUrl(token: string) {
  return `${SUPABASE_URL}/functions/v1/wavoip-webhook?token=${encodeURIComponent(token)}`;
}

export default function WavoipWebhookAdminPage() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [subCompanies, setSubCompanies] = useState<SubCompany[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [callIdFilter, setCallIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detail, setDetail] = useState<EventRow | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createScope, setCreateScope] = useState<string>('company'); // 'company' | sub_company_id
  const [createLabel, setCreateLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const failuresLast24h = useMemo(
    () => events.filter((e) => ['not_found', 'update_error', 'unauthorized', 'bad_payload'].includes(e.status)
      && Date.now() - new Date(e.received_at).getTime() < 86_400_000).length,
    [events],
  );

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true);
    const { data, error } = await (supabase as any)
      .from('wavoip_webhook_tokens')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Falha ao listar tokens', { description: error.message });
    else setTokens((data as TokenRow[]) || []);
    setLoadingTokens(false);
  }, []);

  const loadSubCompanies = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await (supabase as any)
      .from('sub_companies')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('name');
    setSubCompanies((data as SubCompany[]) || []);
  }, [user?.id]);

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

  useEffect(() => { loadTokens(); loadSubCompanies(); }, [loadTokens, loadSubCompanies]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    const ch = supabase
      .channel('wavoip-webhook-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wavoip_webhook_events' }, () => {
        loadEvents();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadEvents]);

  const copyUrl = async (t: TokenRow) => {
    await navigator.clipboard.writeText(buildWebhookUrl(t.token));
    toast.success('URL copiada', { description: 'Cole em Wavoip → Integrações → Webhook.' });
  };

  const testToken = async (t: TokenRow) => {
    setTestingId(t.id);
    try {
      const fakeId = `test-${crypto.randomUUID()}`;
      const res = await fetch(buildWebhookUrl(t.token), {
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
      setTestingId(null);
    }
  };

  const createToken = async () => {
    if (!user?.id) return;
    setCreating(true);
    try {
      const p_sub = createScope === 'company' ? null : createScope;
      const { error } = await (supabase as any).rpc('generate_wavoip_webhook_token', {
        p_owner_id: user.id,
        p_sub_company_id: p_sub,
        p_label: createLabel.trim() || null,
      });
      if (error) throw error;
      toast.success('Token criado');
      setCreateOpen(false);
      setCreateLabel('');
      setCreateScope('company');
      loadTokens();
    } catch (e) {
      toast.error('Não foi possível criar o token', { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (t: TokenRow) => {
    if (!confirm(`Revogar o token "${t.label ?? t.id}"? A Wavoip parará de conseguir enviar eventos.`)) return;
    const { error } = await (supabase as any).rpc('revoke_wavoip_webhook_token', { p_token_id: t.id });
    if (error) toast.error('Falha ao revogar', { description: error.message });
    else { toast.success('Token revogado'); loadTokens(); }
  };

  const scopeLabel = (t: TokenRow) => {
    if (!t.sub_company_id) return 'Empresa (todas as sub-empresas)';
    const sub = subCompanies.find((s) => s.id === t.sub_company_id);
    return sub ? `Sub-empresa: ${sub.name}` : `Sub-empresa: ${t.sub_company_id.slice(0, 8)}…`;
  };

  return (
    <AppLayout title="Webhook Wavoip" subtitle="Um endpoint isolado por Empresa/Sub-empresa (LGPD)">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhook Wavoip</h1>
          <p className="text-sm text-muted-foreground">
            Cada Empresa (e cada Sub-empresa) recebe o próprio endpoint com um token exclusivo.
            Nenhum dado é compartilhado entre clientes.
          </p>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Isolamento por tenant</AlertTitle>
          <AlertDescription>
            O webhook só atualiza chamadas da Empresa/Sub-empresa que emitiu o token. Eventos e logs também
            ficam restritos ao dono do token — administradores de outras contas não conseguem vê-los.
          </AlertDescription>
        </Alert>

        {failuresLast24h > 0 && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>{failuresLast24h} falha(s) nas últimas 24 h</AlertTitle>
            <AlertDescription>
              Verifique abaixo os registros com status <b>Token inválido</b>, <b>Não encontrado</b> ou <b>Erro ao atualizar</b>.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Tokens ativos por Empresa/Sub-empresa</CardTitle>
              <CardDescription>
                Gere um token por cliente e cole a URL correspondente no painel da Wavoip → Integrações → Webhook.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={loadTokens}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Novo token
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rótulo</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTokens ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
                    </TableCell></TableRow>
                  ) : tokens.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum token ainda. Clique em <b>Novo token</b>.
                    </TableCell></TableRow>
                  ) : tokens.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.label || '—'}</TableCell>
                      <TableCell className="text-xs">{scopeLabel(t)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(t.created_at).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {t.last_used_at ? new Date(t.last_used_at).toLocaleString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell>
                        {t.is_active && !t.revoked_at
                          ? <Badge variant="default">Ativo</Badge>
                          : <Badge variant="destructive">Revogado</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => copyUrl(t)} disabled={!t.is_active}>
                            <Copy className="w-3.5 h-3.5 mr-1" /> URL
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => testToken(t)} disabled={!t.is_active || testingId === t.id}>
                            {testingId === t.id
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <PlayCircle className="w-3.5 h-3.5 mr-1" />}
                            Testar
                          </Button>
                          {t.is_active && !t.revoked_at && (
                            <Button variant="ghost" size="sm" onClick={() => revokeToken(t)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Últimos eventos recebidos</CardTitle>
              <CardDescription>
                Você vê apenas eventos dos seus próprios tokens. Clique numa linha para o payload bruto.
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
                        <TableCell className="text-xs whitespace-nowrap">{new Date(ev.received_at).toLocaleString('pt-BR')}</TableCell>
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

        {/* Novo token */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo token de webhook</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase text-muted-foreground font-semibold">Escopo</label>
                <Select value={createScope} onValueChange={setCreateScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">
                      {subCompanies.length > 0
                        ? 'Toda a minha conta (inclui minhas sub-empresas)'
                        : 'Toda a minha conta'}
                    </SelectItem>
                    {subCompanies.map((s) => (
                      <SelectItem key={s.id} value={s.id}>Somente a sub-empresa: {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground font-semibold">Rótulo (opcional)</label>
                <Input
                  placeholder="Ex.: Mult Seguros — tronco principal"
                  value={createLabel}
                  onChange={(e) => setCreateLabel(e.target.value)}
                />
              </div>
              <Alert>
                <AlertDescription className="text-xs">
                  O token é gerado no backend e nunca é exibido em log. Copie a URL depois de criar e
                  cole em Wavoip → Integrações → Webhook.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
              <Button onClick={createToken} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                Gerar token
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detalhes do evento */}
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
