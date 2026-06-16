import { useEffect, useState, useCallback } from 'react';
import { Bell, Check, MessageSquare, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  lead_id: string | null;
  channel: string | null;
  source: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id,type,title,body,lead_id,channel,source,read_at,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setItems((data as Notification[]) || []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications:' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as Notification;
        setItems(prev => [n, ...prev].slice(0, 30));
        toast(n.title, {
          description: n.body || undefined,
          action: n.lead_id ? { label: 'Ver', onClick: () => navigate(`/pipeline`) } : undefined,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, navigate]);

  const unread = items.filter(i => !i.read_at).length;

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id).is('read_at', null);
    setItems(prev => prev.map(i => ({ ...i, read_at: i.read_at || new Date().toISOString() })));
  };

  const markOne = async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, read_at: new Date().toISOString() } : i));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hidden md:inline-flex p-2.5 rounded-xl hover:bg-secondary transition-colors relative">
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="text-sm font-semibold">Notificações</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
              <Check className="w-3 h-3 mr-1" /> Marcar todas
            </Button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação ainda.</div>
          )}
          {items.map(n => (
            <button
              key={n.id}
              onClick={() => { markOne(n.id); if (n.lead_id) navigate('/pipeline'); }}
              className={`w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-accent transition-colors ${!n.read_at ? 'bg-primary/5' : ''}`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {n.type === 'lead_created' ? <Sparkles className="w-4 h-4 text-primary" /> : <ArrowRight className="w-4 h-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground truncate">{n.body}</p>}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {n.channel && <Badge variant="secondary" className="text-[10px] py-0">{n.channel}</Badge>}
                    {n.source && <Badge variant="outline" className="text-[10px] py-0">{n.source}</Badge>}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary mt-1.5" />}
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
