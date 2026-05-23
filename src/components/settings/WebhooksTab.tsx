import { useEffect, useState } from 'react';
import { Webhook as WebhookIcon, Plus, Trash2, Power, Loader2, X, RefreshCw, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Webhook {
  id: string;
  url: string;
  secret: string | null;
  api_key_id: string | null;
  events: string[];
  is_active: boolean;
}

const EVENT_GROUPS = [
  { name: 'Mensagens',   events: [['message.received','Mensagem recebida'],['message.sent','Mensagem enviada'],['message.delivered','Mensagem entregue'],['message.read','Mensagem lida']] },
  { name: 'Conversas',   events: [['conversation.assigned','Conversa atribuída'],['conversation.closed','Conversa encerrada'],['conversation.reopened','Conversa reaberta']] },
  { name: 'Leads',       events: [['lead.created','Lead criado'],['lead.updated','Lead atualizado'],['lead.deleted','Lead excluído'],['lead.stage_changed','Lead mudou de estágio']] },
  { name: 'Agendamentos', events: [['appointment.created','Agendamento criado'],['appointment.cancelled','Agendamento cancelado']] },
  { name: 'Automações',  events: [['automation.completed','Automação concluída'],['automation.failed','Automação falhou']] },
] as const;

function randomSecret() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function WebhooksTab() {
  const [items, setItems] = useState<Webhook[]>([]);
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState({ url: '', api_key_id: '', secret: randomSecret(), events: [] as string[] });

  const load = async () => {
    setLoading(true);
    const [wh, ak] = await Promise.all([
      supabase.from('webhooks').select('*').order('created_at', { ascending: false }),
      supabase.from('api_keys').select('id, name').eq('is_active', true).order('created_at', { ascending: false }),
    ]);
    setItems((wh.data as Webhook[]) ?? []);
    setApiKeys((ak.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ url: '', api_key_id: apiKeys[0]?.id ?? '', secret: randomSecret(), events: [] });
    setOpenModal(true);
  };

  const toggleEvent = (ev: string) => {
    setForm((f) => ({ ...f, events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev] }));
  };

  const selectGroup = (groupEvents: readonly (readonly [string, string])[]) => {
    const ids = groupEvents.map(([id]) => id);
    const allSelected = ids.every((id) => form.events.includes(id));
    setForm((f) => ({ ...f, events: allSelected ? f.events.filter((e) => !ids.includes(e)) : Array.from(new Set([...f.events, ...ids])) }));
  };

  const create = async () => {
    if (!form.url || form.events.length === 0) {
      toast({ title: 'Preencha URL e selecione ao menos 1 evento', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from('webhooks').insert({
      url: form.url,
      secret: form.secret,
      api_key_id: form.api_key_id || null,
      events: form.events,
      is_active: true,
      created_by: user.id,
    });
    setSaving(false);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Webhook criado' });
    setOpenModal(false);
    load();
  };

  const toggle = async (w: Webhook) => {
    await supabase.from('webhooks').update({ is_active: !w.is_active }).eq('id', w.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este webhook?')) return;
    await supabase.from('webhooks').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><WebhookIcon className="w-5 h-5" />Central de Webhooks</h2>
          <p className="text-xs text-muted-foreground">Receba notificações em tempo real quando eventos acontecerem</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo Webhook</Button>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><ExternalLink className="w-4 h-4" />Como funciona</h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>Webhooks permitem que seu sistema receba notificações automáticas quando eventos ocorrem na plataforma.</li>
          <li>Cada requisição inclui um header <code className="px-1.5 py-0.5 bg-secondary rounded text-foreground">X-Webhook-Signature</code> com assinatura HMAC-SHA256 para validação de autenticidade.</li>
          <li>Integre facilmente com N8N, Make (Integromat), Zapier ou seu próprio backend.</li>
        </ul>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="glass-card p-12 text-center border-dashed">
          <WebhookIcon className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">Nenhum webhook configurado</h3>
          <p className="text-xs text-muted-foreground mb-5 max-w-md mx-auto">Configure webhooks para receber notificações em tempo real quando leads são criados, mensagens chegam ou conversas são encerradas.</p>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Criar Primeiro Webhook</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <div key={w.id} className="glass-card p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${w.is_active ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                  <span className="text-sm font-semibold text-foreground truncate">{w.url}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {w.events.map((e) => (
                    <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{e}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => toggle(w)}><Power className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(w.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Webhook</DialogTitle>
            <DialogDescription>Configure o endpoint que receberá as notificações de eventos</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <Label>URL do Webhook *</Label>
              <Input placeholder="https://seu-servidor.com/webhook" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">O endpoint deve aceitar requisições POST com Content-Type: application/json</p>
            </div>

            <div>
              <Label>Chave de API *</Label>
              <select
                value={form.api_key_id}
                onChange={(e) => setForm({ ...form, api_key_id: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Nenhuma (sem autenticação)</option>
                {apiKeys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>

            <div>
              <Label>Secret (para assinatura HMAC)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showSecret ? 'text' : 'password'} value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
                  <button onClick={() => setShowSecret((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button variant="outline" onClick={() => setForm({ ...form, secret: randomSecret() })}><RefreshCw className="w-4 h-4 mr-1" />Gerar</Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Use este secret para validar a autenticidade das requisições (header X-Webhook-Signature)</p>
            </div>

            <div>
              <Label>Eventos *</Label>
              <div className="space-y-3 mt-2">
                {EVENT_GROUPS.map((g) => (
                  <div key={g.name} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-foreground">{g.name}</span>
                      <button onClick={() => selectGroup(g.events)} className="text-xs text-primary hover:underline">Selecionar todos</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {g.events.map(([id, label]) => (
                        <label key={id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={form.events.includes(id)} onChange={() => toggleEvent(id)} className="rounded border-border" />
                          <span className="text-foreground">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">{form.events.length} evento(s) selecionado(s)</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenModal(false)}>Cancelar</Button>
              <Button onClick={create} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Criar Webhook
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
