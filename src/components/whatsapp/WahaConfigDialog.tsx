// WAHA Configuration Dialog — mirrors the WAHA VPS/Chatwoot App panel.
// Standalone: does not import from UAZ/Evolution/Wavoip code. Safe to edit or
// remove without impacting other providers.

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, Loader2, ExternalLink, Wifi, PlusCircle, Trash2, LogOut, ListRestart, DownloadCloud } from 'lucide-react';
import { WahaConfigSchema, readWahaConfig, buildWahaWebhookUrl, type WahaConfig } from './wahaConfig';
import type { WhatsAppConnection } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conn: WhatsAppConnection;
  onSaved: () => void;
}

export function WahaConfigDialog({ open, onOpenChange, conn, onSaved }: Props) {
  const initial = useMemo(() => readWahaConfig(conn.metadata), [conn]);
  const [cfg, setCfg] = useState<WahaConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [busyAction, setBusyAction] = useState<null | 'create' | 'delete' | 'logout' | 'list' | 'backfill'>(null);
  const [remoteSessions, setRemoteSessions] = useState<any[] | null>(null);
  const [backfillResult, setBackfillResult] = useState<null | { chatsSeen: number; inserted: number; skipped: number; customersCreated: number }>(null);

  const functionsBase = (import.meta as any).env?.VITE_SUPABASE_URL
    ? `${(import.meta as any).env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1`
    : '';
  const webhookUrl = buildWahaWebhookUrl(functionsBase, conn.id);

  const set = <K extends keyof WahaConfig>(k: K, v: WahaConfig[K]) =>
    setCfg((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const parsed = WahaConfigSchema.safeParse(cfg);
    if (!parsed.success) {
      toast.error('Configuração inválida', {
        description: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '),
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('whatsapp_connections')
      .update({ metadata: { ...(conn.metadata ?? {}), ...parsed.data } })
      .eq('id', conn.id);
    setSaving(false);
    if (error) return toast.error('Falha ao salvar', { description: error.message });
    toast.success('Configuração WAHA salva');
    onSaved();
    onOpenChange(false);
  };

  const handleTest = async () => {
    if (!cfg.url || !cfg.token) return toast.error('Preencha URL e API Key antes de testar.');
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-status', {
        body: {
          connection_id: conn.id,
          provider: 'waha',
          url: cfg.url,
          token: cfg.token,
          session: cfg.session,
        },
      });
      if (error) throw error;
      if (data?.connected) toast.success('WAHA conectado', { description: data.phone ?? data.status });
      else toast.warning('Sessão WAHA não está aberta', { description: data?.status || data?.error });
    } catch (e: any) {
      toast.error('Falha ao testar', { description: e.message });
    } finally {
      setTesting(false);
    }
  };

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  const runSessionAction = async (
    action: 'create' | 'delete' | 'logout' | 'list_remote',
    confirmMsg?: string,
  ) => {
    if (!cfg.url || !cfg.token) return toast.error('Preencha URL e API Key antes.');
    if ((action === 'create' || action === 'delete') && !cfg.session)
      return toast.error('Informe o Session Name antes.');
    if (confirmMsg && !window.confirm(confirmMsg)) return;

    const key = action === 'list_remote' ? 'list' : (action as 'create' | 'delete' | 'logout');
    setBusyAction(key);
    const toastId = toast.loading(
      action === 'create' ? 'Criando sessão no servidor WAHA…'
      : action === 'delete' ? 'Excluindo sessão do servidor WAHA…'
      : action === 'logout' ? 'Encerrando sessão do dispositivo…'
      : 'Listando sessões remotas…',
    );
    try {
      const { data, error } = await supabase.functions.invoke('waha-session', {
        body: {
          action,
          connection_id: conn.id,
          url: cfg.url,
          token: cfg.token,
          session: cfg.session,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'Falha WAHA');

      if (action === 'list_remote') {
        const arr = Array.isArray(data.sessions) ? data.sessions : [];
        setRemoteSessions(arr);
        toast.success(`${arr.length} sessão(ões) encontradas`, { id: toastId });
      } else if (action === 'create') {
        toast.success('Sessão criada no servidor WAHA', {
          id: toastId,
          description: 'Webhook já configurado. Escaneie o QR para autenticar.',
        });
        onSaved();
      } else if (action === 'delete') {
        toast.success('Sessão removida do servidor WAHA', { id: toastId });
        onSaved();
      } else {
        toast.success('Dispositivo desconectado', { id: toastId });
        onSaved();
      }
    } catch (e: any) {
      toast.error('Falha WAHA', { id: toastId, description: e?.message ?? String(e) });
    } finally {
      setBusyAction(null);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar WAHA (WhatsApp HTTP API)</DialogTitle>
          <DialogDescription>
            Preencha os mesmos campos do painel WAHA/Chatwoot App. Isolado dos provedores UAZ, Evolution e Wavoip.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Webhook URL */}
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 space-y-2">
            <Label className="text-[10px] uppercase font-bold text-teal-600 tracking-wider">Webhook URL (cole no painel WAHA)</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="h-9 text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={() => copy(webhookUrl, 'Webhook URL')}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Substitui o <code>WAHA_BASE_URL</code>/webhooks/… — aponta para a nossa edge function
              <code className="ml-1">waha-inbound</code>.
            </p>
          </div>

          {/* WAHA core */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">WAHA — Conexão</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="WAHA Base URL *">
                <Input value={cfg.url} onChange={(e) => set('url', e.target.value)} placeholder="https://waha.meudominio.com" />
              </Field>
              <Field label="API Key (X-Api-Key) *">
                <Input type="password" value={cfg.token} onChange={(e) => set('token', e.target.value)} placeholder="••••••••" />
              </Field>
              <Field label="Session Name *">
                <Input value={cfg.session} onChange={(e) => set('session', e.target.value)} placeholder="default" />
              </Field>
              <Field label="App ID (opcional)">
                <Input value={cfg.app_id ?? ''} onChange={(e) => set('app_id', e.target.value)} placeholder="app_xxxxxxxxxxxx" />
              </Field>
            </div>
          </section>

          <Separator />

          {/* Chatwoot-compat */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Conexão Chatwoot (paridade com WAHA VPS)</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Chatwoot URL">
                <Input value={cfg.chatwoot_url ?? ''} onChange={(e) => set('chatwoot_url', e.target.value)} placeholder="https://app.chatwoot.com" />
              </Field>
              <Field label="Account ID *">
                <Input value={cfg.chatwoot_account_id} onChange={(e) => set('chatwoot_account_id', e.target.value)} />
              </Field>
              <Field label="Account Token *">
                <Input type="password" value={cfg.chatwoot_account_token} onChange={(e) => set('chatwoot_account_token', e.target.value)} placeholder="••••••••" />
              </Field>
              <Field label="Inbox ID *">
                <Input value={cfg.chatwoot_inbox_id} onChange={(e) => set('chatwoot_inbox_id', e.target.value)} />
              </Field>
              <Field label="Inbox Identifier *">
                <Input type="password" value={cfg.chatwoot_inbox_identifier} onChange={(e) => set('chatwoot_inbox_identifier', e.target.value)} placeholder="••••••••" />
              </Field>
            </div>
          </section>

          <Separator />

          {/* Conversations */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Conversas</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Conversation Behavior">
                <Select value={cfg.conversation_behavior} onValueChange={(v) => set('conversation_behavior', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reuse_open">Reutilizar conversas abertas</SelectItem>
                    <SelectItem value="reuse_last">Reutilizar última conversa</SelectItem>
                    <SelectItem value="create_new">Sempre criar nova</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <ToggleField
                label="Marcar como lido no ACK do WhatsApp"
                checked={cfg.mark_read_on_ack}
                onChange={(v) => set('mark_read_on_ack', v)}
              />
              <ToggleField
                label="Preview de links em mensagens"
                checked={cfg.message_link_preview}
                onChange={(v) => set('message_link_preview', v)}
              />
              <ToggleField
                label="Templates com nome do agente"
                checked={cfg.templates_with_agent_name}
                onChange={(v) => set('templates_with_agent_name', v)}
              />
            </div>
          </section>

          <Separator />

          {/* Language */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Idioma & Overrides</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Language">
                <Input value={cfg.language} onChange={(e) => set('language', e.target.value)} placeholder="pt-BR" />
              </Field>
            </div>
            <Field label="Language Overrides (YAML/Mustache)">
              <Textarea
                rows={5}
                value={cfg.language_overrides ?? ''}
                onChange={(e) => set('language_overrides', e.target.value)}
                className="font-mono text-xs"
                placeholder={`chatwoot.to.whatsapp.message.text: |-\n  {{#chatwoot.sender.name}}*{{{chatwoot.sender.name}}}*:\n  {{/chatwoot.sender.name}}{{{ content }}}`}
              />
            </Field>
          </section>

          <Separator />

          {/* Session lifecycle on the WAHA server (multi-tenant) */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase text-muted-foreground">Sessão no servidor WAHA</h4>
            <p className="text-[11px] text-muted-foreground">
              Gerencia a sessão <code>{cfg.session || '(vazia)'}</code> diretamente no servidor WAHA desta empresa/sub-empresa.
              Cada conexão é isolada por tenant.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm" variant="secondary"
                disabled={busyAction !== null}
                onClick={() => runSessionAction('create')}
                className="gap-1"
              >
                {busyAction === 'create' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                Criar sessão no WAHA
              </Button>
              <Button
                size="sm" variant="outline"
                disabled={busyAction !== null}
                onClick={() => runSessionAction('logout', 'Encerrar a sessão do dispositivo autenticado? Será necessário escanear o QR novamente.')}
                className="gap-1"
              >
                {busyAction === 'logout' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Logout do dispositivo
              </Button>
              <Button
                size="sm" variant="outline"
                disabled={busyAction !== null}
                onClick={() => runSessionAction('list_remote')}
                className="gap-1"
              >
                {busyAction === 'list' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListRestart className="w-3.5 h-3.5" />}
                Listar sessões remotas
              </Button>
              <Button
                size="sm" variant="destructive"
                disabled={busyAction !== null}
                onClick={() => runSessionAction('delete', `Excluir a sessão "${cfg.session}" do servidor WAHA? Esta ação é irreversível.`)}
                className="gap-1"
              >
                {busyAction === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Excluir sessão remota
              </Button>
              <Button
                size="sm" variant="secondary"
                disabled={busyAction !== null}
                onClick={runBackfillFromServer}
                className="gap-1"
                title="Baixa o histórico de conversas do servidor WAHA e importa mensagens que faltam aqui, sem afetar o fluxo ao vivo."
              >
                {busyAction === 'backfill' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                Importar histórico do WAHA
              </Button>
            </div>
            {backfillResult && (
              <div className="rounded-md border border-teal-500/30 bg-teal-500/5 p-2 text-[11px] text-teal-700 dark:text-teal-400">
                Importação concluída: <b>{backfillResult.inserted}</b> mensagens novas em {backfillResult.chatsSeen} chats
                ({backfillResult.customersCreated} contatos criados · {backfillResult.skipped} ignorados por já existirem).
              </div>
            )}
            </div>
            {remoteSessions && (
              <div className="rounded-md border border-border/60 bg-secondary/30 p-2 max-h-40 overflow-auto">
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                  Sessões no servidor ({remoteSessions.length})
                </p>
                <ul className="text-[11px] font-mono space-y-1">
                  {remoteSessions.length === 0 && <li className="text-muted-foreground">— nenhuma sessão —</li>}
                  {remoteSessions.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span>{s?.name ?? s?.session ?? JSON.stringify(s)}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{s?.status ?? ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wifi className="w-4 h-4 mr-2" />}
            Testar Conexão
          </Button>
          <a
            href="https://waha.devlike.pro/docs/overview/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
          >
            Docs WAHA <ExternalLink className="w-3 h-3" />
          </a>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</Label>
      {children}
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
