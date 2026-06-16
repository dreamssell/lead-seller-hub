import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Bell, Plus, Trash2, Loader2 } from 'lucide-react';

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

const PREF_COLS = 'id,sub_company_id,channel,notify_new_lead,notify_stage_change,notify_funnel_change,notify_pipeline_create,notify_pipeline_update,notify_pipeline_delete,notify_pipeline_reorder,notify_stage_create,notify_stage_update,notify_stage_delete,notify_stage_reorder';

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4" /> Notificações de leads</DialogTitle>
          <DialogDescription>
            Defina por sub-empresa e canal quando você quer ser avisado. A regra mais específica vence; sem regra, você recebe tudo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : (
          <>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {prefs.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhuma regra. Você está recebendo todas as notificações.</p>
              )}
              {prefs.map(p => (
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
