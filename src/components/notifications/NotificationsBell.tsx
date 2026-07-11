import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Bell, Check, ArrowRight, Sparkles, MessageCircle, BellOff, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
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
  peer_id?: string | null;
  /** Chave real (uuid) da linha em internal_messages, quando `type === 'internal_message'`. */
  raw_id?: string;
};

type FilterMode = 'all' | 'platform' | 'internal';

const PAGE_SIZE = 20;
const MUTE_KEY = 'ls.bell.mute'; // { platform: boolean, internal: boolean }

function loadMute(): { platform: boolean; internal: boolean } {
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    if (raw) return { platform: false, internal: false, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { platform: false, internal: false };
}

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [internalItems, setInternalItems] = useState<Notification[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [mute, setMute] = useState(loadMute);
  const scrollRef = useRef<HTMLDivElement>(null);
  // De-duplica toasts entre abas usando um Set em memória por id.
  const toastedRef = useRef<Set<string>>(new Set());

  const persistMute = (next: { platform: boolean; internal: boolean }) => {
    setMute(next);
    try { localStorage.setItem(MUTE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id,type,title,body,lead_id,channel,source,read_at,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data as Notification[]) || []);
  }, [user]);

  const loadInternal = useCallback(async () => {
    if (!user) return;
    const { data: msgs } = await supabase
      .from('internal_messages')
      .select('id,sender_id,content,created_at,read_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
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
      raw_id: m.id,
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

  // Realtime: notificações da plataforma.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications:' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as Notification;
        setItems(prev => prev.some(i => i.id === n.id) ? prev : [n, ...prev].slice(0, 100));
        if (mute.platform) return;
        if (toastedRef.current.has(`p:${n.id}`)) return;
        toastedRef.current.add(`p:${n.id}`);
        toast(n.title, {
          id: `platform-${n.id}`,
          description: n.body || undefined,
          action: n.lead_id ? { label: 'Ver', onClick: () => navigate(`/pipeline`) } : undefined,
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        // Sync cross-tab quando marcada como lida em outra aba/dispositivo.
        const n = payload.new as Notification;
        setItems(prev => prev.map(i => i.id === n.id ? { ...i, read_at: n.read_at } : i));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, navigate, mute.platform]);

  // Realtime: mensagens internas — INSERT + UPDATE (cross-tab sync das lidas).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`bell_internal:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'internal_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, async (payload) => {
        const m = payload.new as any;
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name,email')
          .eq('user_id', m.sender_id)
          .maybeSingle();
        const senderName = (prof as any)?.display_name || (prof as any)?.email || 'Colega';
        const title = `Nova mensagem interna de ${senderName}`;
        setInternalItems(prev => {
          if (prev.some(i => i.raw_id === m.id)) return prev;
          return [{
            id: `internal:${m.id}`,
            raw_id: m.id,
            type: 'internal_message',
            title,
            body: (m.content || '').slice(0, 140),
            lead_id: null,
            channel: 'Interno',
            source: null,
            read_at: m.read_at,
            created_at: m.created_at,
            peer_id: m.sender_id,
          }, ...prev].slice(0, 100);
        });
        if (mute.internal) return;
        if (toastedRef.current.has(`i:${m.id}`)) return;
        toastedRef.current.add(`i:${m.id}`);
        toast(title, {
          id: `internal-${m.id}`,
          description: m.content || undefined,
          action: { label: 'Abrir', onClick: () => navigate(`/internal-comms/message/${m.id}`) },
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'internal_messages',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        // Cross-tab sync: quando outra aba/dispositivo marca como lida.
        const m = payload.new as any;
        setInternalItems(prev => prev.map(i => i.raw_id === m.id ? { ...i, read_at: m.read_at } : i));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, navigate, mute.internal]);

  const filtered = useMemo(() => {
    let list: Notification[];
    if (filterMode === 'platform') list = items;
    else if (filterMode === 'internal') list = internalItems;
    else list = [...items, ...internalItems];
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filterMode, items, internalItems]);

  const visible = filtered.slice(0, visibleCount);
  const unread = useMemo(
    () => [...items, ...internalItems].filter(i => !i.read_at).length,
    [items, internalItems]
  );

  // Reset paginação ao mudar filtro.
  useEffect(() => { setVisibleCount(PAGE_SIZE); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [filterMode]);

  // Virtualização leve por scroll infinito: incrementa quando chega perto do fim.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && visibleCount < filtered.length) {
      setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length));
    }
  };

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
      const realId = n.raw_id!;
      await supabase.from('internal_messages').update({ read_at: now }).eq('id', realId);
      setInternalItems(prev => prev.map(i => i.id === n.id ? { ...i, read_at: now } : i));
    } else {
      await supabase.from('notifications').update({ read_at: now }).eq('id', n.id);
      setItems(prev => prev.map(i => i.id === n.id ? { ...i, read_at: now } : i));
    }
  };

  const handleClick = (n: Notification) => {
    void markOne(n);
    if (n.type === 'internal_message' && n.raw_id) navigate(`/internal-comms/message/${n.raw_id}`);
    else if (n.lead_id) navigate('/pipeline');
  };

  const FilterChip = ({ mode, label }: { mode: FilterMode; label: string }) => (
    <button
      onClick={() => setFilterMode(mode)}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        filterMode === mode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
      }`}
    >
      {label}
    </button>
  );

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
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2" title="Preferências">
                  {(mute.platform || mute.internal) ? <BellOff className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Silenciar toasts</p>
                <div className="flex items-center justify-between">
                  <label htmlFor="mute-platform" className="text-sm">Notificações da plataforma</label>
                  <Switch id="mute-platform" checked={mute.platform} onCheckedChange={(v) => persistMute({ ...mute, platform: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <label htmlFor="mute-internal" className="text-sm">Mensagens internas</label>
                  <Switch id="mute-internal" checked={mute.internal} onCheckedChange={(v) => persistMute({ ...mute, internal: v })} />
                </div>
                <p className="text-[11px] text-muted-foreground">Silenciar oculta apenas o pop-up; itens continuam no sino.</p>
              </PopoverContent>
            </Popover>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
                <Check className="w-3 h-3 mr-1" /> Marcar todas
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-2 border-b">
          <FilterChip mode="all" label={`Todas (${items.length + internalItems.length})`} />
          <FilterChip mode="platform" label={`Plataforma (${items.length})`} />
          <FilterChip mode="internal" label={`Internas (${internalItems.length})`} />
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="max-h-[420px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação ainda.</div>
          )}
          {visible.map(n => (
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
          {visibleCount < filtered.length && (
            <div className="p-2 text-center text-[11px] text-muted-foreground">
              Mostrando {visible.length} de {filtered.length} — role para carregar mais
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
