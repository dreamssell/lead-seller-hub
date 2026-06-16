import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, History } from 'lucide-react';
import { format } from 'date-fns';

type Event = {
  id: string;
  created_at: string;
  lead_id: string;
  from_stage_name: string | null;
  to_stage_name: string | null;
  channel: string | null;
  source: string | null;
  sub_company_id: string | null;
  actor_id: string | null;
  metadata: any;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  subScope: string | null | undefined;
  channel: string;
}

export function StageAuditDialog({ open, onOpenChange, ownerId, subScope, channel }: Props) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, string>>({});
  const [actorMap, setActorMap] = useState<Record<string, string>>({});
  const [subMap, setSubMap] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from('lead_events')
      .select('id,created_at,lead_id,from_stage_name,to_stage_name,channel,source,sub_company_id,actor_id,metadata')
      .eq('owner_id', ownerId)
      .eq('type', 'stage_changed')
      .order('created_at', { ascending: false })
      .limit(200);
    if (subScope !== undefined) {
      if (subScope === null) q = q.is('sub_company_id', null);
      else q = q.eq('sub_company_id', subScope);
    }
    if (channel && channel !== 'all') q = q.eq('channel', channel);
    if (dateFrom) q = q.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) q = q.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());

    const { data } = await q;
    const evs = (data as Event[]) || [];
    setEvents(evs);

    const leadIds = [...new Set(evs.map(e => e.lead_id))];
    const actorIds = [...new Set(evs.map(e => e.actor_id).filter(Boolean) as string[])];
    const subIds = [...new Set(evs.map(e => e.sub_company_id).filter(Boolean) as string[])];

    if (leadIds.length) {
      const { data: ls } = await supabase.from('leads').select('id,name').in('id', leadIds);
      const map: Record<string, string> = {};
      (ls || []).forEach((l: any) => { map[l.id] = l.name; });
      setLeadMap(map);
    } else setLeadMap({});

    if (actorIds.length) {
      const { data: ps } = await supabase.from('profiles').select('user_id,display_name,email').in('user_id', actorIds);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.user_id] = p.display_name || p.email || p.user_id.slice(0, 8); });
      setActorMap(map);
    } else setActorMap({});

    if (subIds.length) {
      const { data: ss } = await supabase.from('sub_companies').select('id,name').in('id', subIds);
      const map: Record<string, string> = {};
      (ss || []).forEach((s: any) => { map[s.id] = s.name; });
      setSubMap(map);
    } else setSubMap({});

    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, ownerId, subScope, channel, dateFrom, dateTo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Auditoria de mudanças de etapa</DialogTitle>
          <DialogDescription>Todos os movimentos de leads entre etapas no escopo atual.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">De</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-40" /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-40" /></div>
          <span className="text-xs text-muted-foreground ml-auto">{events.length} evento(s)</span>
        </div>
        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">Nenhum evento encontrado.</p>
          ) : (
            <div className="space-y-1.5">
              {events.map(e => (
                <div key={e.id} className="border rounded-md p-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-sm text-foreground">{leadMap[e.lead_id] || e.lead_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      {e.from_stage_name || '—'} <ArrowRight className="w-3 h-3" /> {e.to_stage_name || '—'}
                    </span>
                    <span className="ml-auto text-muted-foreground">{format(new Date(e.created_at), 'dd/MM/yyyy HH:mm:ss')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    {e.channel && <Badge variant="secondary" className="py-0 px-1.5">{e.channel}</Badge>}
                    {e.sub_company_id && <Badge variant="outline" className="py-0 px-1.5">{subMap[e.sub_company_id] || 'sub'}</Badge>}
                    {!e.sub_company_id && <Badge variant="outline" className="py-0 px-1.5">Conta principal</Badge>}
                    {e.actor_id && <span className="text-muted-foreground">por {actorMap[e.actor_id] || e.actor_id.slice(0, 8)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
