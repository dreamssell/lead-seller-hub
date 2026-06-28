import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircleWarning } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Whisper {
  id: string;
  content: string;
  from_supervisor_id: string;
  to_agent_id: string;
  created_at: string;
}

export function WhisperFeed({ customerId, currentUserId }: { customerId: string; currentUserId: string | null }) {
  const [items, setItems] = useState<Whisper[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from('supervisor_whispers')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);
    setItems((data || []) as Whisper[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`whispers-${customerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'supervisor_whispers', filter: `customer_id=eq.${customerId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const visible = items.filter((w) => w.to_agent_id === currentUserId || w.from_supervisor_id === currentUserId);
  if (visible.length === 0) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-2 space-y-1.5">
      {visible.slice(0, 3).map((w) => (
        <div key={w.id} className="flex items-start gap-2 text-xs">
          <MessageCircleWarning className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-900 dark:text-amber-200">{w.content}</p>
            <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70">
              🔒 Supervisor · {formatDistanceToNow(new Date(w.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
