import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Bell, Plus, Trash2, Loader2, Users, AlertTriangle, Save } from 'lucide-react';

const CHANNELS: { v: string; l: string }[] = [
  { v: '__all__', l: 'Todos os canais' },
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'instagram', l: 'Instagram' },
  { v: 'facebook', l: 'Facebook' },
  { v: 'telegram', l: 'Telegram' },
  { v: 'widget', l: 'Widget' },
  { v: 'linkedin', l: 'LinkedIn' },
  { v: 'tiktok', l: 'TikTok' },
  { v: 'youtube', l: 'YouTube' },
];

type Pref = {
  id: string;
  user_id: string;
  sub_company_id: string | null;
  channel: string | null;
  notify_new_lead: boolean;
  notify_stage_change: boolean;
  notify_funnel_change: boolean;
  notify_pipeline_create: boolean;
  notify_pipeline_update: boolean;
  notify_pipeline_delete: boolean;
  notify_pipeline_reorder: boolean;
  notify_stage_create: boolean;
  notify_stage_update: boolean;
  notify_stage_delete: boolean;
  notify_stage_reorder: boolean;
};

type SubCompany = { id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
}

const PREF_COLS = 'id,user_id,sub_company_id,channel,notify_new_lead,notify_stage_change,notify_funnel_change,notify_pipeline_create,notify_pipeline_update,notify_pipeline_delete,notify_pipeline_reorder,notify_stage_create,notify_stage_update,notify_stage_delete,notify_stage_reorder';

export function NotificationPreferencesDialog({ open, onOpenChange, ownerId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [subs, setSubs] = useState<SubCompany[]>([]);

  // new row form
  const [newSub, setNewSub] = useState<string>('__all__');
  const [newChannel, setNewChannel] = useState<string>('__all__');
  const [newLead, setNewLead] = useState(true);
  const [newStage, setNewStage] = useState(true);
  const [newFunnel, setNewFunnel] = useState(true);
  // structure events (default true)
  const [newPC, setNewPC] = useState(true);
  const [newPU, setNewPU] = useState(true);
  const [newPD, setNewPD] = useState(true);
  const [newPR, setNewPR] = useState(true);
  const [newSC, setNewSC] = useState(true);
  const [newSU, setNewSU] = useState(true);
  const [newSD, setNewSD] = useState(true);
  const [newSR, setNewSR] = useState(true);

  const load = async () => {
    if (!user || !ownerId) return;
    setLoading(true);
    const [p, s] = await Promise.all([
      (supabase as any).from('notification_preferences')
        .select(PREF_COLS)
        .eq('user_id', user.id).eq('owner_id', ownerId),
      supabase.from('sub_companies').select('id,name').eq('owner_id', ownerId).order('name'),
    ]);
    setPrefs((p.data as Pref[]) || []);
    setSubs((s.data as SubCompany[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, user?.id, ownerId]);

  const updatePref = async (id: string, patch: Partial<Pref>) => {
    const { error } = await (supabase as any).from('notification_preferences').update(patch).eq('id', id);
    if (error) return toast.error(error.message);
    setPrefs(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const removePref = async (id: string) => {
    const { error } = await (supabase as any).from('notification_preferences').delete().eq('id', id);
    if (error) return toast.error(error.message);
    setPrefs(prev => prev.filter(p => p.id !== id));
    toast.success('Regra removida');
  };

  const addPref = async () => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      owner_id: ownerId,
      sub_company_id: newSub === '__all__' ? null : newSub,
      channel: newChannel === '__all__' ? null : newChannel,
      notify_new_lead: newLead,
      notify_stage_change: newStage,
      notify_funnel_change: newFunnel,
      notify_pipeline_create: newPC,
      notify_pipeline_update: newPU,
      notify_pipeline_delete: newPD,
      notify_pipeline_reorder: newPR,
      notify_stage_create: newSC,
      notify_stage_update: newSU,
      notify_stage_delete: newSD,
      notify_stage_reorder: newSR,
    };
    const { data, error } = await (supabase as any).from('notification_preferences')
      .insert(payload).select(PREF_COLS).single();
    if (error) return toast.error(error.message);
    setPrefs(prev => [...prev, data as Pref]);
    toast.success('Regra adicionada');
  };


  const subName = (id: string | null) =>
    id ? (subs.find(s => s.id === id)?.name || '—') : 'Todas as sub-empresas';
  const channelName = (c: string | null) => c ? (CHANNELS.find(x => x.v === c)?.l || c) : 'Todos os canais';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4" /> Notificações de leads</DialogTitle>
          <DialogDescription>
            Configure suas próprias regras ou, como administrador da conta, defina quem recebe notificações em cada sub-empresa e canal.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : (
          <Tabs defaultValue="mine">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="mine"><Bell className="w-3.5 h-3.5 mr-1" /> Minhas regras</TabsTrigger>
              <TabsTrigger value="recipients"><Users className="w-3.5 h-3.5 mr-1" /> Destinatários</TabsTrigger>
            </TabsList>

            <TabsContent value="mine" className="mt-3">
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {prefs.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhuma regra. Você está recebendo todas as notificações.</p>
              )}
              {prefs.filter(p => p.user_id === user?.id).map(p => (
                <div key={p.id} className="p-2 border rounded-md text-sm space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{subName(p.sub_company_id)}</div>
                      <div className="text-xs text-muted-foreground">{channelName(p.channel)}</div>
                    </div>
                    <label className="flex items-center gap-1 text-xs">
                      <Switch checked={p.notify_new_lead} onCheckedChange={(v) => updatePref(p.id, { notify_new_lead: v })} />
                      Novo
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <Switch checked={p.notify_stage_change} onCheckedChange={(v) => updatePref(p.id, { notify_stage_change: v })} />
                      Etapa
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <Switch checked={p.notify_funnel_change} onCheckedChange={(v) => updatePref(p.id, { notify_funnel_change: v })} />
                      Funil
                    </label>
                    <Button size="icon" variant="ghost" onClick={() => removePref(p.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t text-[11px] text-muted-foreground">
                    <div className="font-medium text-foreground/80 mt-1">Funis em tempo real</div>
                    <div className="font-medium text-foreground/80 mt-1">Etapas em tempo real</div>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_pipeline_create} onCheckedChange={(v) => updatePref(p.id, { notify_pipeline_create: v })} /> Criar</label>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_stage_create} onCheckedChange={(v) => updatePref(p.id, { notify_stage_create: v })} /> Criar</label>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_pipeline_update} onCheckedChange={(v) => updatePref(p.id, { notify_pipeline_update: v })} /> Editar</label>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_stage_update} onCheckedChange={(v) => updatePref(p.id, { notify_stage_update: v })} /> Editar</label>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_pipeline_delete} onCheckedChange={(v) => updatePref(p.id, { notify_pipeline_delete: v })} /> Excluir</label>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_stage_delete} onCheckedChange={(v) => updatePref(p.id, { notify_stage_delete: v })} /> Excluir</label>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_pipeline_reorder} onCheckedChange={(v) => updatePref(p.id, { notify_pipeline_reorder: v })} /> Reordenar</label>
                    <label className="flex items-center gap-2"><Switch checked={p.notify_stage_reorder} onCheckedChange={(v) => updatePref(p.id, { notify_stage_reorder: v })} /> Reordenar</label>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 mt-2">
              <Label className="text-xs uppercase text-muted-foreground">Nova regra</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Select value={newSub} onValueChange={setNewSub}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas as sub-empresas</SelectItem>
                    {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={newChannel} onValueChange={setNewChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={newLead} onCheckedChange={setNewLead} /> Novo lead
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={newStage} onCheckedChange={setNewStage} /> Mudança de etapa
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={newFunnel} onCheckedChange={setNewFunnel} /> Troca de funil
                </label>
                <Button size="sm" className="ml-auto" onClick={addPref}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 pt-3 border-t text-[11px] text-muted-foreground">
                <div className="font-medium text-foreground/80">Funis em tempo real</div>
                <div className="font-medium text-foreground/80">Etapas em tempo real</div>
                <label className="flex items-center gap-2"><Switch checked={newPC} onCheckedChange={setNewPC} /> Criar</label>
                <label className="flex items-center gap-2"><Switch checked={newSC} onCheckedChange={setNewSC} /> Criar</label>
                <label className="flex items-center gap-2"><Switch checked={newPU} onCheckedChange={setNewPU} /> Editar</label>
                <label className="flex items-center gap-2"><Switch checked={newSU} onCheckedChange={setNewSU} /> Editar</label>
                <label className="flex items-center gap-2"><Switch checked={newPD} onCheckedChange={setNewPD} /> Excluir</label>
                <label className="flex items-center gap-2"><Switch checked={newSD} onCheckedChange={setNewSD} /> Excluir</label>
                <label className="flex items-center gap-2"><Switch checked={newPR} onCheckedChange={setNewPR} /> Reordenar</label>
                <label className="flex items-center gap-2"><Switch checked={newSR} onCheckedChange={setNewSR} /> Reordenar</label>
              </div>
            </div>
            </TabsContent>

            <TabsContent value="recipients" className="mt-3">
              <RecipientsTab ownerId={ownerId} subs={subs} currentUserId={user?.id || ''} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Recipients tab: admin (owner or account admin) UI to manage who receives
// notifications for a given (sub_company, channel) combination.
// ============================================================================
type AccessRow = {
  user_id: string;
  sub_company_id: string | null;
  is_account_admin: boolean;
};
type Profile = { user_id: string; display_name: string | null; email: string | null };
type RowState = {
  user_id: string;
  display_name: string;
  email: string;
  is_admin: boolean;
  pref_id: string | null;
  new_lead: boolean;
  stage_change: boolean;
  funnel_change: boolean;
  dirty: boolean;
};

function RecipientsTab({ ownerId, subs, currentUserId }: { ownerId: string; subs: SubCompany[]; currentUserId: string }) {
  const [scopeSub, setScopeSub] = useState<string>('__all__');
  const [scopeChannel, setScopeChannel] = useState<string>('__all__');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<RowState[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const subId = scopeSub === '__all__' ? null : scopeSub;
  const ch = scopeChannel === '__all__' ? null : scopeChannel;

  const load = async () => {
    setLoading(true);
    setErrors([]);
    // Owner is always a candidate. Plus everyone in user_account_access scoped to (owner, sub or null)
    const accessQ = (supabase as any)
      .from('user_account_access')
      .select('user_id, sub_company_id, is_account_admin')
      .eq('owner_id', ownerId);
    const [{ data: access }, { data: prefsData }] = await Promise.all([
      accessQ,
      (supabase as any).from('notification_preferences')
        .select(PREF_COLS)
        .eq('owner_id', ownerId),
    ]);
    const accessRows = (access as AccessRow[]) || [];
    // Filter: include access rows where sub_company_id is null (covers all) OR matches scopeSub
    const candidates = new Set<string>([ownerId]);
    accessRows.forEach(a => {
      if (subId === null || a.sub_company_id === null || a.sub_company_id === subId) {
        candidates.add(a.user_id);
      }
    });

    const userIds = Array.from(candidates);
    const { data: profs } = await (supabase as any)
      .from('profiles').select('user_id, display_name, email').in('user_id', userIds);
    const byProf = new Map<string, Profile>();
    ((profs as Profile[]) || []).forEach(p => byProf.set(p.user_id, p));

    const allPrefs = (prefsData as Pref[]) || [];
    const built: RowState[] = userIds.map(uid => {
      // Find exact match (sub_company_id and channel both equal scope)
      const exact = allPrefs.find(p =>
        p.user_id === uid &&
        (p.sub_company_id ?? null) === subId &&
        (p.channel ?? null) === ch
      );
      const prof = byProf.get(uid);
      const isAdmin = uid === ownerId || accessRows.some(a => a.user_id === uid && a.is_account_admin);
      return {
        user_id: uid,
        display_name: prof?.display_name || prof?.email || (uid === ownerId ? 'Proprietário' : 'Usuário'),
        email: prof?.email || '',
        is_admin: isAdmin,
        pref_id: exact?.id || null,
        new_lead: exact ? exact.notify_new_lead : true,
        stage_change: exact ? exact.notify_stage_change : true,
        funnel_change: exact ? exact.notify_funnel_change : true,
        dirty: false,
      };
    }).sort((a, b) => (b.is_admin ? 1 : 0) - (a.is_admin ? 1 : 0) || a.display_name.localeCompare(b.display_name));
    setRows(built);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ownerId, scopeSub, scopeChannel]);

  const toggle = (uid: string, key: 'new_lead' | 'stage_change' | 'funnel_change', v: boolean) => {
    setRows(prev => prev.map(r => r.user_id === uid ? { ...r, [key]: v, dirty: true } : r));
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    const enabled = rows.filter(r => r.new_lead || r.stage_change || r.funnel_change);
    if (enabled.length === 0) {
      errs.push('Nenhum destinatário ativo: ninguém receberá notificações nesse escopo. Marque ao menos um usuário.');
    }
    // Owner with everything off is a common mistake
    const owner = rows.find(r => r.user_id === ownerId);
    if (owner && !owner.new_lead && !owner.stage_change && !owner.funnel_change) {
      errs.push('O proprietário da conta está sem nenhuma notificação ativa nesse escopo.');
    }
    return errs;
  };

  const dirtyCount = useMemo(() => rows.filter(r => r.dirty).length, [rows]);

  const save = async () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) {
      toast.warning('Revise os avisos antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      for (const r of rows.filter(x => x.dirty)) {
        if (r.pref_id) {
          const { error } = await (supabase as any).from('notification_preferences').update({
            notify_new_lead: r.new_lead,
            notify_stage_change: r.stage_change,
            notify_funnel_change: r.funnel_change,
          }).eq('id', r.pref_id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any).from('notification_preferences').insert({
            user_id: r.user_id,
            owner_id: ownerId,
            sub_company_id: subId,
            channel: ch,
            notify_new_lead: r.new_lead,
            notify_stage_change: r.stage_change,
            notify_funnel_change: r.funnel_change,
          });
          if (error) throw error;
        }
      }
      toast.success(`${dirtyCount} regra(s) atualizada(s)`);
      load();
    } catch (e: any) {
      toast.error('Falha ao salvar: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Sub-empresa</Label>
          <Select value={scopeSub} onValueChange={setScopeSub}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as sub-empresas</SelectItem>
              {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Canal</Label>
          <Select value={scopeChannel} onValueChange={setScopeChannel}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CHANNELS.map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Mostrando usuários com acesso a esse escopo. Sem regra explícita, o padrão é receber tudo.
      </p>

      {errors.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">Nenhum usuário com acesso nesse escopo.</p>
      ) : (
        <div className="border rounded-md max-h-[280px] overflow-y-auto divide-y">
          {rows.map(r => (
            <div key={r.user_id} className="p-2 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {r.display_name}
                  {r.is_admin && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Admin</Badge>}
                  {r.user_id === currentUserId && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Você</Badge>}
                  {r.dirty && <span className="text-[10px] text-amber-600 dark:text-amber-400">• modificado</span>}
                </div>
                {r.email && <div className="text-[11px] text-muted-foreground truncate">{r.email}</div>}
              </div>
              <label className="flex items-center gap-1 text-[11px]">
                <Switch checked={r.new_lead} onCheckedChange={(v) => toggle(r.user_id, 'new_lead', v)} />
                Novo
              </label>
              <label className="flex items-center gap-1 text-[11px]">
                <Switch checked={r.stage_change} onCheckedChange={(v) => toggle(r.user_id, 'stage_change', v)} />
                Etapa
              </label>
              <label className="flex items-center gap-1 text-[11px]">
                <Switch checked={r.funnel_change} onCheckedChange={(v) => toggle(r.user_id, 'funnel_change', v)} />
                Funil
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-[11px] text-muted-foreground">
          {dirtyCount > 0 ? `${dirtyCount} alteração(ões) pendente(s)` : 'Nenhuma alteração'}
        </span>
        <Button size="sm" onClick={save} disabled={saving || dirtyCount === 0}>
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          Revisar e salvar
        </Button>
      </div>
    </div>
  );
}
