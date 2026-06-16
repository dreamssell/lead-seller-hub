import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, LayoutTemplate, Save, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Template = {
  id: string;
  owner_id: string | null;
  sub_company_id: string | null;
  name: string;
  description: string | null;
  channel: string | null;
  stages: { name: string; color?: string }[];
  is_system: boolean;
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  telegram: 'Telegram', widget: 'Widget', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube',
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  /** undefined = all, null = global, string = sub id */
  subScope: string | null | undefined;
  /** current channel filter (or 'all') */
  channel: string;
  canManage: boolean;
  /** currently focused pipeline (for "save as template") */
  currentPipeline?: { id: string; name: string } | null;
  currentStages?: { name: string; color: string | null }[];
  onApplied: (newPipelineId: string) => void;
}

export function PipelineTemplatesDialog({
  open, onOpenChange, ownerId, subScope, channel, canManage,
  currentPipeline, currentStages, onApplied,
}: Props) {
  const scope = subScope === undefined ? null : subScope;

  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('pipeline_templates')
      .select('id,owner_id,sub_company_id,name,description,channel,stages,is_system')
      .order('is_system', { ascending: false })
      .order('name');
    setTemplates((data as Template[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  // Suggest templates matching the active channel first
  const sorted = [...templates].sort((a, b) => {
    if (channel !== 'all') {
      const am = a.channel === channel ? 0 : 1;
      const bm = b.channel === channel ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return 0;
  });

  const applyTemplate = async (t: Template) => {
    if (!canManage) return toast.error('Sem permissão para criar funis neste escopo.');
    const name = `${t.name}${channel !== 'all' ? ' · ' + (CHANNEL_LABEL[channel] || channel) : ''}`;
    const { data: pip, error } = await supabase.from('pipelines').insert({
      owner_id: ownerId, sub_company_id: scope, name, is_default: false,
    }).select().single();
    if (error) return toast.error(error.message);
    const rows = t.stages.map((s, i) => ({
      pipeline_id: pip.id, name: s.name, position: i, color: s.color || 'bg-primary',
    }));
    const { error: e2 } = await supabase.from('pipeline_stages').insert(rows);
    if (e2) return toast.error(e2.message);

    // Optional: link to channel routing
    if (channel !== 'all') {
      const { data: existing } = await supabase.from('channel_routing')
        .select('id').eq('owner_id', ownerId).eq('channel', channel)
        .is('sub_company_id', scope === null ? null : undefined)
        .eq('sub_company_id', scope as any).maybeSingle();
      if (existing?.id) {
        await supabase.from('channel_routing').update({ pipeline_id: pip.id, enabled: true }).eq('id', existing.id);
      } else {
        await supabase.from('channel_routing').insert({
          owner_id: ownerId, sub_company_id: scope, channel,
          chat_provider: 'uaz', voice_provider: channel === 'whatsapp' ? 'wavoip' : null,
          pipeline_id: pip.id, enabled: true,
        });
      }
    }

    // Audit
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase as any).from('pipeline_audit_logs').insert({
      owner_id: ownerId, sub_company_id: scope, pipeline_id: pip.id,
      entity: 'pipeline', action: 'create', label: name,
      after: { template: t.name, stages: rows.map(r => r.name) },
      actor_id: user?.id ?? null, actor_email: user?.email ?? null,
    });

    toast.success(`Funil "${name}" criado a partir do template.`);
    onApplied(pip.id);
    onOpenChange(false);
  };

  const saveCurrentAsTemplate = async () => {
    if (!canManage) return toast.error('Sem permissão.');
    if (!currentPipeline || !currentStages?.length) return toast.error('Selecione um funil com etapas.');
    const name = newName.trim() || currentPipeline.name;
    setSaving(true);
    const { error } = await supabase.from('pipeline_templates').insert({
      owner_id: ownerId, sub_company_id: scope, name,
      channel: channel === 'all' ? null : channel,
      stages: currentStages.map(s => ({ name: s.name, color: s.color || 'bg-primary' })),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setNewName('');
    toast.success('Template salvo');
    load();
  };

  const deleteTemplate = async (t: Template) => {
    if (t.is_system) return;
    if (!confirm(`Excluir template "${t.name}"?`)) return;
    const { error } = await supabase.from('pipeline_templates').delete().eq('id', t.id);
    if (error) return toast.error(error.message);
    toast.success('Template excluído');
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" /> Templates de funis
          </DialogTitle>
          <DialogDescription>
            Aplique um modelo pronto ao escopo atual
            {channel !== 'all' && <> (canal <b>{CHANNEL_LABEL[channel] || channel}</b>)</>}.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[50vh] pr-3">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum template ainda.</p>
          ) : (
            <ul className="space-y-2">
              {sorted.map(t => (
                <li key={t.id} className="rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-sm">{t.name}</h4>
                        {t.is_system && <Badge variant="secondary" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />Sistema</Badge>}
                        {t.channel && <Badge variant="outline" className="text-[10px]">{CHANNEL_LABEL[t.channel] || t.channel}</Badge>}
                        {channel !== 'all' && t.channel === channel && <Badge className="text-[10px]">Recomendado</Badge>}
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.stages.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted">
                            <span className={`w-1.5 h-1.5 rounded-full ${s.color || 'bg-primary'}`} />
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" disabled={!canManage} onClick={() => applyTemplate(t)}>Aplicar</Button>
                      {!t.is_system && canManage && (
                        <Button size="icon" variant="ghost" onClick={() => deleteTemplate(t)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {currentPipeline && canManage && (
          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-xs">Salvar funil atual como template</Label>
            <div className="flex gap-2">
              <Input
                placeholder={`Nome do template (padrão: ${currentPipeline.name})`}
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <Button onClick={saveCurrentAsTemplate} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Salvar</>}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              O template ficará visível apenas neste escopo{channel !== 'all' && <> e marcado para o canal {CHANNEL_LABEL[channel] || channel}</>}.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
