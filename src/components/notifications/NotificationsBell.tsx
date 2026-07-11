import { useEffect, useState, useCallback } from 'react';
import { Bell, Check, ArrowRight, Sparkles, MessageCircle } from 'lucide-react';
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
  /** Only for synthetic 'internal_message' rows — points to the sender. */
  peer_id?: string | null;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [internalItems, setInternalItems] = useState<Notification[]>([]);

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

  const loadInternal = useCallback(async () => {
    if (!user) return;
    const { data: msgs } = await supabase
      .from('internal_messages')
      .select('id,sender_id,content,created_at,read_at')
      .eq('recipient_id', user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = (msgs as any[]) || [];
    if (rows.length === 0) { setInternalItems([]); return; }
    const senderIds = Array.from(new Set(rows.map(r => r.sender_id)));
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id,display_name,email')
      .in('user_id', senderIds);
    const nameById = new Map<string, string>();
    (profs || []).forEach((p: any) => nameById.set(p.user_id, p.display_name || p.email || 'Colega'));
    setInternalItems(rows.map(m => ({
      id: `internal:${m.id}`,
      type: 'internal_message',
      title: `Nova mensagem interna de ${nameById.get(m.sender_id) || 'colega'}`,
      body: (m.content || '').slice(0, 140),
      lead_id: null,
      channel: 'Interno',
      source: null,
      read_at: m.read_at,
      created_at: m.created_at,
      peer_id: m.sender_id,
    })));
  }, [user]);

  useEffect(() => { load(); loadInternal(); }, [load, loadInternal]);

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

  // Realtime: novas mensagens internas para este usuário aparecem no sininho.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`bell_internal:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'internal_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, async (payload) => {
        const m = payload.new as any;
        // Busca nome do remetente sem bloquear o insert.
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name,email')
          .eq('user_id', m.sender_id)
          .maybeSingle();
        const senderName = (prof as any)?.display_name || (prof as any)?.email || 'Colega';
        const title = `Nova mensagem interna de ${senderName}`;
        setInternalItems(prev => [{
          id: `internal:${m.id}`,
          type: 'internal_message',
          title,
          body: (m.content || '').slice(0, 140),
          lead_id: null,
          channel: 'Interno',
          source: null,
          read_at: m.read_at,
          created_at: m.created_at,
          peer_id: m.sender_id,
        }, ...prev].slice(0, 20));
        toast(title, {
          description: m.content || undefined,
          action: { label: 'Abrir', onClick: () => navigate('/internal-comms') },
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'internal_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, () => { void loadInternal(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, navigate, loadInternal]);

  // Combina notificações padrão + mensagens internas em uma única lista ordenada.
  const merged = [...items, ...internalItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const unread = merged.filter(i => !i.read_at).length;

  const markAllRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('notifications').update({ read_at: now })
        .eq('user_id', user.id).is('read_at', null),
      supabase.from('internal_messages').update({ read_at: now })
        .eq('recipient_id', user.id).is('read_at', null),
    ]);
    setItems(prev => prev.map(i => ({ ...i, read_at: i.read_at || now })));
    setInternalItems(prev => prev.map(i => ({ ...i, read_at: i.read_at || now })));
  };

  const markOne = async (n: Notification) => {
    const now = new Date().toISOString();
    if (n.type === 'internal_message') {
      const realId = n.id.replace(/^internal:/, '');
      await supabase.from('internal_messages').update({ read_at: now }).eq('id', realId);
      setInternalItems(prev => prev.map(i => i.id === n.id ? { ...i, read_at: now } : i));
    } else {
      await supabase.from('notifications').update({ read_at: now }).eq('id', n.id);
      setItems(prev => prev.map(i => i.id === n.id ? { ...i, read_at: now } : i));
    }
  };

  const handleClick = (n: Notification) => {
    void markOne(n);
    if (n.type === 'internal_message') navigate('/internal-comms');
    else if (n.lead_id) navigate('/pipeline');
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
          {merged.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação ainda.</div>
          )}
          {merged.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-accent transition-colors ${!n.read_at ? 'bg-primary/5' : ''}`}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {n.type === 'internal_message'
                    ? <MessageCircle className="w-4 h-4 text-primary" />
                    : n.type === 'lead_created'
                      ? <Sparkles className="w-4 h-4 text-primary" />
                      : <ArrowRight className="w-4 h-4 text-primary" />}
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
