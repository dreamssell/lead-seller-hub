import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Smile, Meh, Frown, Tag, Clock, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  customerId: string;
}

interface Analysis {
  id: string;
  message_id: string;
  sentiment: string | null;
  sentiment_score: number | null;
  intent: string | null;
  suggested_tags: string[] | null;
  summary: string | null;
  created_at: string;
  edited_by?: string | null;
  edited_at?: string | null;
}

const SENTIMENT_ICON: Record<string, any> = {
  positivo: { icon: Smile, color: 'text-emerald-500 bg-emerald-500/10' },
  neutro: { icon: Meh, color: 'text-amber-500 bg-amber-500/10' },
  negativo: { icon: Frown, color: 'text-red-500 bg-red-500/10' },
};

export function AIInsightsPanel({ customerId }: Props) {
  const [latest, setLatest] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftTags, setDraftTags] = useState('');
  const [draftSentiment, setDraftSentiment] = useState<string>('');
  const [followupHours, setFollowupHours] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('message_ai_analysis')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest(data || null);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    if (!latest) return;
    setDraftTags((latest.suggested_tags || []).join(', '));
    setDraftSentiment(latest.sentiment || 'neutro');
    setFollowupHours((latest as any).raw?.followup_hours?.toString() || '');
    setEditing(true);
  };

  const save = async () => {
    if (!latest) return;
    const tags = draftTags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 8);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from('message_ai_analysis')
      .update({
        suggested_tags: tags,
        sentiment: draftSentiment || latest.sentiment,
        edited_by: user?.id,
        edited_at: new Date().toISOString(),
        raw: { ...((latest as any).raw || {}), followup_hours: followupHours ? Number(followupHours) : null },
      })
      .eq('id', latest.id);

    if (error) { toast.error('Falha ao salvar: ' + error.message); return; }

    // schedule follow-up if requested
    if (followupHours && Number(followupHours) > 0) {
      await (supabase as any).from('auto_followups').insert({
        customer_id: customerId,
        scheduled_at: new Date(Date.now() + Number(followupHours) * 3600_000).toISOString(),
        reason: 'ai_suggested',
        source_analysis_id: latest.id,
      }).then((r: any) => r, () => null);
    }

    toast.success('Insights atualizados');
    setEditing(false);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  if (!latest) {
    return (
      <div className="text-center py-6 px-3">
        <Sparkles className="w-7 h-7 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground italic">Nenhuma análise de IA ainda. Mensagens novas serão classificadas automaticamente.</p>
      </div>
    );
  }

  const sentKey = (latest.sentiment || 'neutro').toLowerCase();
  const sentMeta = SENTIMENT_ICON[sentKey] || SENTIMENT_ICON.neutro;
  const SentIcon = sentMeta.icon;
  const followup = (latest as any).raw?.followup_hours;

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border bg-secondary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Insights IA</span>
        </div>
        {!editing ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEdit} title="Editar">
            <Pencil className="w-3 h-3" />
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
            <Button variant="default" size="icon" className="h-6 w-6" onClick={save}><Check className="w-3 h-3" /></Button>
          </div>
        )}
      </div>

      {/* Sentiment */}
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${sentMeta.color}`}>
          <SentIcon className="w-3.5 h-3.5" />
        </div>
        {!editing ? (
          <div className="min-w-0">
            <p className="text-xs font-semibold capitalize">{latest.sentiment || '—'}</p>
            {latest.intent && <p className="text-[10px] text-muted-foreground truncate">Intenção: {latest.intent}</p>}
          </div>
        ) : (
          <select
            value={draftSentiment}
            onChange={(e) => setDraftSentiment(e.target.value)}
            className="text-xs bg-background border border-border rounded px-2 py-1"
          >
            <option value="positivo">Positivo</option>
            <option value="neutro">Neutro</option>
            <option value="negativo">Negativo</option>
          </select>
        )}
      </div>

      {/* Summary */}
      {latest.summary && !editing && (
        <p className="text-[11px] text-foreground/80 italic border-l-2 border-border pl-2">"{latest.summary}"</p>
      )}

      {/* Tags */}
      <div>
        <div className="flex items-center gap-1 mb-1.5">
          <Tag className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tags sugeridas</span>
        </div>
        {!editing ? (
          <div className="flex flex-wrap gap-1">
            {(latest.suggested_tags || []).length === 0 && <span className="text-[11px] text-muted-foreground italic">nenhuma</span>}
            {(latest.suggested_tags || []).map(t => (
              <Badge key={t} variant="secondary" className="text-[10px] h-5 px-1.5">{t}</Badge>
            ))}
          </div>
        ) : (
          <Input
            value={draftTags}
            onChange={(e) => setDraftTags(e.target.value)}
            placeholder="tag1, tag2, tag3"
            className="h-7 text-xs"
          />
        )}
      </div>

      {/* Follow-up */}
      <div>
        <div className="flex items-center gap-1 mb-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Follow-up sugerido</span>
        </div>
        {!editing ? (
          <p className="text-[11px]">
            {followup ? `Retomar em ${followup}h` : <span className="text-muted-foreground italic">nenhum</span>}
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={followupHours}
              onChange={(e) => setFollowupHours(e.target.value)}
              placeholder="horas"
              className="h-7 text-xs w-24"
            />
            <span className="text-[10px] text-muted-foreground">cria tarefa em auto_followups</span>
          </div>
        )}
      </div>

      {latest.edited_at && (
        <p className="text-[9px] text-muted-foreground text-right">Editado {new Date(latest.edited_at).toLocaleString('pt-BR')}</p>
      )}
    </div>
  );
}
