import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight, Loader2, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Row {
  id: string;
  reason: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  to_queue_id: string | null;
  created_at: string;
}

export function AssignmentTimeline({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('conversation_assignments')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(30);
      setRows((data || []) as Row[]);
      const ids = Array.from(
        new Set((data || []).flatMap((r: any) => [r.from_user_id, r.to_user_id]).filter(Boolean)),
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, email')
          .in('user_id', ids);
        const map: Record<string, string> = {};
        profs?.forEach((p) => (map[p.user_id] = p.display_name || p.email || p.user_id));
        setNames(map);
      }
      setLoading(false);
    })();
  }, [customerId]);

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground italic text-center py-6">Sem transferências registradas.</p>;

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-secondary/40 p-2.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-medium">{names[r.from_user_id || ''] || '—'}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              {r.to_user_id ? (
                <span className="font-medium">{names[r.to_user_id] || 'colega'}</span>
              ) : (
                <span className="flex items-center gap-1 text-violet-500 font-medium">
                  <Users className="w-3 h-3" /> Fila
                </span>
              )}
            </div>
            {r.reason && <p className="text-[11px] text-muted-foreground mt-1">{r.reason}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
