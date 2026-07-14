import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StickyNote, Zap, Loader2, Trash2, Plus, X, Send, History as HistoryIcon, Layers, Images, Phone, Mail, MapPin, IdCard, Copy, Video, MessageSquare, Paperclip, Mic, Ban, ShieldCheck, CheckCircle2, RefreshCw, Info, Archive, BellOff, Bell, Tag, Check, Clock, Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getProviderAdapter } from '@/components/whatsapp/adapters';
import { toast as sonnerToast } from 'sonner';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MentionTextarea } from './MentionTextarea';
import { AssignmentTimeline } from './AssignmentTimeline';
import { CustomerServiceHistory } from './CustomerServiceHistory';
import { Customer360Timeline } from './Customer360Timeline';
import { AIInsightsPanel } from './AIInsightsPanel';
import { Sparkles } from 'lucide-react';
import { MediaGallery } from './MediaGallery';


interface Note {
  id: string;
  customer_id: string;
  author_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
}

interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
  category: string | null;
}

interface Props {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onUseReply: (text: string) => void;
}

export function ChatRightPanel({ customerId, customerName, onClose, onUseReply }: Props) {
  const [tab, setTab] = useState<'notes' | 'replies' | 'history' | 'crm' | 'media'>('crm');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ phone?: string; email?: string; company?: string; channel?: string; created_at?: string; avatar_url?: string | null; address?: string; document?: string; profile_about?: string | null; is_blocked?: boolean; has_whatsapp?: boolean | null; profile_synced_at?: string | null; origin_connection_id?: string | null; is_archived?: boolean; is_muted?: boolean; muted_until?: string | null; label_ids?: string[] } | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [wahaBusy, setWahaBusy] = useState<'block' | 'sync' | 'check' | 'archive' | 'mute' | 'labels' | null>(null);
  const [availableLabels, setAvailableLabels] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newReply, setNewReply] = useState({ shortcut: '', content: '' });
  const [savingReply, setSavingReply] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Nome: 2-120 chars, permite letras (acentos), números, espaços e . - ' _ & ( ) /
  const NAME_REGEX = /^[\p{L}\p{N}\s.\-'_&()\/]+$/u;
  type NameCheck = { ok: true; value: string } | { ok: false; message: string };
  const validateContactName = (raw: string): NameCheck => {
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value) return { ok: false, message: 'O nome não pode ficar vazio.' };
    if (value.length < 2) return { ok: false, message: 'O nome deve ter pelo menos 2 caracteres.' };
    if (value.length > 120) return { ok: false, message: 'O nome deve ter no máximo 120 caracteres.' };
    if (/[<>{}\\`]/.test(value)) return { ok: false, message: 'O nome contém caracteres inválidos.' };
    if (!NAME_REGEX.test(value)) return { ok: false, message: 'Use apenas letras, números e pontuação simples.' };
    return { ok: true, value };
  };

  const saveName = async () => {
    const check = validateContactName(nameDraft);
    if (check.ok === false) { toast.error(check.message); return; }
    const next = check.value;
    if (next === customerName) { setEditingName(false); return; }
    setSavingName(true);
    const { error } = await supabase.from('customers').update({ name: next } as any).eq('id', customerId);
    setSavingName(false);
    if (error) { toast.error('Não foi possível renomear o contato.'); return; }
    toast.success('Contato renomeado.');
    setEditingName(false);
    window.dispatchEvent(new CustomEvent('customer:renamed', { detail: { id: customerId, name: next } }));
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({
          id: data.user.id,
          name:
            (data.user.user_metadata as any)?.display_name ||
            data.user.email ||
            'Atendente',
        });
      }
    });
  }, []);

  const loadProfile = () => {
    setAvatarBroken(false);
    supabase
      .from('customers')
      .select('owner_id, phone, email, company, channel, created_at, avatar_url, address, document, profile_about, is_blocked, has_whatsapp, profile_synced_at, origin_connection_id, is_archived, is_muted, muted_until, label_ids' as any)
      .eq('id', customerId)
      .maybeSingle()
      .then(({ data }) => {
        setOwnerId((data as any)?.owner_id || null);
        if (data) {
          const d = data as any;
          setProfile({
            phone: d.phone,
            email: d.email,
            company: d.company,
            channel: d.channel,
            created_at: d.created_at,
            avatar_url: d.avatar_url || null,
            address: d.address || null,
            document: d.document || null,
            profile_about: d.profile_about ?? null,
            is_blocked: !!d.is_blocked,
            has_whatsapp: d.has_whatsapp ?? null,
            profile_synced_at: d.profile_synced_at ?? null,
            origin_connection_id: d.origin_connection_id ?? null,
            is_archived: !!d.is_archived,
            is_muted: !!d.is_muted,
            muted_until: d.muted_until ?? null,
            label_ids: Array.isArray(d.label_ids) ? d.label_ids : [],
          });
        }
      });
  };
  useEffect(() => { loadProfile(); }, [customerId]);

  // Etapa 6 — helpers para chamar o WahaAdapter a partir do painel de perfil.
  const getWahaConn = async () => {
    if (!profile?.origin_connection_id) return null;
    const { data } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('id', profile.origin_connection_id)
      .maybeSingle();
    if (!data || (data as any).provider !== 'waha') return null;
    return data as any;
  };
  const wahaSync = async () => {
    setWahaBusy('sync');
    try {
      const conn = await getWahaConn();
      if (!conn) { toast.info('Perfil WAHA disponível apenas para contatos vinculados a uma conexão WAHA.'); return; }
      const res: any = await getProviderAdapter('waha').syncContactProfile?.(conn, customerId);
      if (res?.ok) { toast.success('Perfil sincronizado com o WhatsApp'); loadProfile(); }
      else toast.error(`Falha ao sincronizar: ${res?.error || res?.skipped || 'desconhecido'}`);
    } finally { setWahaBusy(null); }
  };
  const wahaCheckExists = async () => {
    setWahaBusy('check');
    try {
      const conn = await getWahaConn();
      if (!conn) { toast.info('Verificação disponível apenas para conexões WAHA.'); return; }
      const res: any = await getProviderAdapter('waha').checkNumberExists?.(conn, customerId);
      if (res?.exists) toast.success('Número possui WhatsApp ativo.');
      else toast.warning(res?.error ? `Falha: ${res.error}` : 'Este número não possui WhatsApp.');
      loadProfile();
    } finally { setWahaBusy(null); }
  };
  const wahaToggleBlock = async () => {
    setWahaBusy('block');
    try {
      const conn = await getWahaConn();
      if (!conn) { toast.info('Bloqueio disponível apenas para conexões WAHA.'); return; }
      const adapter = getProviderAdapter('waha');
      const res: any = profile?.is_blocked
        ? await adapter.unblockContact?.(conn, customerId)
        : await adapter.blockContact?.(conn, customerId);
      if (res?.ok) {
        toast.success(profile?.is_blocked ? 'Contato desbloqueado' : 'Contato bloqueado');
        loadProfile();
      } else toast.error(`Falha: ${res?.error || res?.skipped || 'desconhecido'}`);
    } finally { setWahaBusy(null); }
  };

  // Etapa 7 — etiquetas, arquivar e silenciar
  const loadAvailableLabels = async () => {
    if (!ownerId) return;
    const { data } = await supabase
      .from('chat_tags').select('id, name, color')
      .eq('owner_id', ownerId).order('name');
    setAvailableLabels((data || []) as any);
  };
  useEffect(() => { loadAvailableLabels(); }, [ownerId]);
  const wahaSyncLabels = async () => {
    setWahaBusy('labels');
    try {
      const conn = await getWahaConn();
      if (!conn) { toast.info('Etiquetas disponíveis apenas para conexões WAHA.'); return; }
      const res: any = await getProviderAdapter('waha').syncLabels?.(conn);
      if (res?.ok) { toast.success(`${res.count ?? 0} etiquetas sincronizadas`); loadAvailableLabels(); }
      else toast.error(`Falha: ${res?.error || 'desconhecido'}`);
    } finally { setWahaBusy(null); }
  };
  const wahaToggleLabel = async (labelId: string) => {
    if (!profile) return;
    const current = profile.label_ids || [];
    const next = current.includes(labelId) ? current.filter((x) => x !== labelId) : [...current, labelId];
    setProfile({ ...profile, label_ids: next }); // optimistic
    const conn = await getWahaConn();
    if (!conn) {
      // sem WAHA → grava apenas localmente
      await supabase.from('customers').update({ label_ids: next } as any).eq('id', customerId);
      return;
    }
    const res: any = await getProviderAdapter('waha').setChatLabels?.(conn, customerId, next);
    if (!res?.ok) { toast.error(`Falha ao aplicar etiqueta: ${res?.error || 'desconhecido'}`); loadProfile(); }
  };
  const wahaToggleArchive = async () => {
    setWahaBusy('archive');
    try {
      const conn = await getWahaConn();
      if (!conn) { toast.info('Arquivar disponível apenas para conexões WAHA.'); return; }
      const target = !profile?.is_archived;
      const res: any = await getProviderAdapter('waha').archiveChat?.(conn, customerId, target);
      if (res?.ok) { toast.success(target ? 'Conversa arquivada' : 'Conversa restaurada'); loadProfile(); }
      else toast.error(`Falha: ${res?.error || res?.skipped || 'desconhecido'}`);
    } finally { setWahaBusy(null); }
  };
  const wahaSetMute = async (hours: number | null) => {
    setWahaBusy('mute');
    try {
      const conn = await getWahaConn();
      if (!conn) { toast.info('Silenciar disponível apenas para conexões WAHA.'); return; }
      const target = hours !== null;
      const until = target ? new Date(Date.now() + hours! * 60 * 60 * 1000).toISOString() : null;
      const res: any = await getProviderAdapter('waha').muteChat?.(conn, customerId, target, until);
      if (res?.ok) {
        toast.success(target ? `Conversa silenciada por ${hours}h` : 'Notificações reativadas');
        loadProfile();
      } else toast.error(`Falha: ${res?.error || res?.skipped || 'desconhecido'}`);
    } finally { setWahaBusy(null); }
  };

  // Auto-unmute quando muted_until expira + tick a cada 30s p/ atualizar o countdown na UI
  const [muteTick, setMuteTick] = useState(0);
  useEffect(() => {
    if (!profile?.is_muted || !profile.muted_until) return;
    const check = () => {
      setMuteTick((t) => t + 1);
      if (profile.muted_until && new Date(profile.muted_until).getTime() <= Date.now()) {
        wahaSetMute(null);
      }
    };
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.is_muted, profile?.muted_until]);

  const muteRemaining = (() => {
    if (!profile?.is_muted || !profile.muted_until) return null;
    const ms = new Date(profile.muted_until).getTime() - Date.now();
    if (ms <= 0) return 'expirando…';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();





  const loadNotes = async () => {
    setLoadingNotes(true);
    const { data, error } = await supabase
      .from('customer_notes')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar notas');
    else setNotes((data || []) as Note[]);
    setLoadingNotes(false);
  };

  const loadReplies = async () => {
    setLoadingReplies(true);
    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .order('shortcut', { ascending: true });
    if (error) toast.error('Erro ao carregar respostas rápidas');
    else setReplies((data || []) as QuickReply[]);
    setLoadingReplies(false);
  };

  useEffect(() => {
    if (tab === 'notes') loadNotes();
    if (tab === 'replies') loadReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, customerId]);

  // Realtime subscription for notes
  useEffect(() => {
    const ch = supabase
      .channel(`notes-${customerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_notes', filter: `customer_id=eq.${customerId}` },
        () => loadNotes()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const handleAddNote = async () => {
    if (!newNote.trim() || !user) return;
    setSavingNote(true);
    const { error } = await supabase.from('customer_notes').insert({
      customer_id: customerId,
      author_id: user.id,
      author_name: user.name,
      content: newNote.trim(),
    });
    setSavingNote(false);
    if (error) {
      toast.error('Não foi possível salvar a nota');
    } else {
      setNewNote('');
      toast.success('Nota interna registrada');
      loadNotes();
    }
  };

  const handleDeleteNote = async (id: string) => {
    const { error } = await supabase.from('customer_notes').delete().eq('id', id);
    if (error) toast.error('Não foi possível remover');
    else loadNotes();
  };

  const handleAddReply = async () => {
    if (!newReply.shortcut.trim() || !newReply.content.trim()) return;
    setSavingReply(true);
    const { error } = await supabase.from('quick_replies').insert({
      shortcut: newReply.shortcut.trim(),
      content: newReply.content.trim(),
      created_by: user?.id || null,
    });
    setSavingReply(false);
    if (error) toast.error('Erro ao criar resposta rápida');
    else {
      setNewReply({ shortcut: '', content: '' });
      toast.success('Resposta rápida criada');
      loadReplies();
    }
  };

  const handleDeleteReply = async (id: string) => {
    const { error } = await supabase.from('quick_replies').delete().eq('id', id);
    if (error) toast.error('Erro ao remover');
    else loadReplies();
  };

  return (
    <div className="w-[340px] border-l border-border bg-background/95 backdrop-blur-md flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Perfil do contato</p>
          <p className="text-sm font-semibold truncate">{customerName}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="px-3 py-3 border-b border-border bg-gradient-to-b from-secondary/40 to-transparent">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-16 h-16 rounded-full bg-primary/20 ring-2 ring-primary/30 overflow-hidden flex items-center justify-center shrink-0">
            {profile?.avatar_url && !avatarBroken ? (
              <img
                src={profile.avatar_url}
                alt={customerName}
                className="w-full h-full object-cover"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <span className="text-lg font-bold text-primary">
                {customerName.split(/[\s.@]/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || '?'}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={nameDraft}
                  autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                    if (e.key === 'Escape') { setEditingName(false); }
                  }}
                  disabled={savingName}
                  className="h-7 text-sm"
                  maxLength={120}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={saveName} disabled={savingName} aria-label="Salvar nome">
                  {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingName(false)} disabled={savingName} aria-label="Cancelar">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group">
                <p className="text-sm font-semibold truncate">{customerName}</p>
                <button
                  type="button"
                  onClick={() => { setNameDraft(customerName); setEditingName(true); }}
                  className="p-1 rounded hover:bg-secondary opacity-60 hover:opacity-100 transition"
                  title="Renomear contato"
                  aria-label="Renomear contato"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
            {profile?.company && <p className="text-[11px] text-muted-foreground truncate">{profile.company}</p>}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {profile?.channel && (
                <span className="text-[9px] uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {profile.channel}
                </span>
              )}
              {profile?.created_at && (
                <span className="text-[9px] text-muted-foreground">
                  Desde {new Date(profile.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions à la WhatsApp */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          <a
            href={profile?.phone ? `tel:${profile.phone}` : undefined}
            aria-disabled={!profile?.phone}
            className={`flex flex-col items-center gap-1 py-2 rounded-lg border border-border text-[10px] transition ${profile?.phone ? 'hover:bg-primary/10 hover:text-primary cursor-pointer' : 'opacity-40 pointer-events-none'}`}
            title="Ligar"
          >
            <Phone className="w-4 h-4" />
            Ligar
          </a>
          <a
            href={profile?.phone ? `https://wa.me/${profile.phone.replace(/\D/g, '')}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!profile?.phone}
            className={`flex flex-col items-center gap-1 py-2 rounded-lg border border-border text-[10px] transition ${profile?.phone ? 'hover:bg-emerald-500/10 hover:text-emerald-500 cursor-pointer' : 'opacity-40 pointer-events-none'}`}
            title="Abrir no WhatsApp Web"
          >
            <MessageSquare className="w-4 h-4" />
            WhatsApp
          </a>
          <a
            href={profile?.email ? `mailto:${profile.email}` : undefined}
            aria-disabled={!profile?.email}
            className={`flex flex-col items-center gap-1 py-2 rounded-lg border border-border text-[10px] transition ${profile?.email ? 'hover:bg-primary/10 hover:text-primary cursor-pointer' : 'opacity-40 pointer-events-none'}`}
            title="Enviar e-mail"
          >
            <Mail className="w-4 h-4" />
            E-mail
          </a>
          <button
            type="button"
            onClick={() => {
              const text = [customerName, profile?.phone, profile?.email].filter(Boolean).join(' · ');
              navigator.clipboard.writeText(text);
              sonnerToast.success('Contato copiado');
            }}
            className="flex flex-col items-center gap-1 py-2 rounded-lg border border-border text-[10px] hover:bg-secondary transition"
            title="Copiar dados do contato"
          >
            <Copy className="w-4 h-4" />
            Copiar
          </button>
        </div>

        {/* Detalhes */}
        <div className="space-y-1.5 text-[11px]">
          {profile?.phone ? (
            <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-foreground hover:text-primary transition">
              <Phone className="w-3 h-3 text-muted-foreground" />
              <span className="font-mono">{profile.phone}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground italic">
              <Phone className="w-3 h-3" />
              <span>Sem telefone</span>
            </div>
          )}
          {profile?.email && (
            <a href={`mailto:${profile.email}`} className="flex items-center gap-2 text-foreground hover:text-primary transition truncate">
              <Mail className="w-3 h-3 text-muted-foreground" />
              <span className="truncate">{profile.email}</span>
            </a>
          )}
          {profile?.document && (
            <div className="flex items-center gap-2 text-foreground">
              <IdCard className="w-3 h-3 text-muted-foreground" />
              <span className="font-mono">{profile.document}</span>
            </div>
          )}
          {profile?.address && (
            <div className="flex items-start gap-2 text-foreground">
              <MapPin className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
              <span className="truncate">{profile.address}</span>
            </div>
          )}
        </div>

        {/* Etapa 6 — WhatsApp: sobre, verificação e bloqueio */}
        {profile?.origin_connection_id && (
          <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3 h-3" /> Perfil WhatsApp
              </span>
              <div className="flex items-center gap-1">
                {profile.has_whatsapp === true && (
                  <span title="Número tem WhatsApp" className="text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /></span>
                )}
                {profile.has_whatsapp === false && (
                  <span title="Sem WhatsApp" className="text-muted-foreground"><Ban className="w-3.5 h-3.5" /></span>
                )}
                {profile.is_blocked && (
                  <span title="Contato bloqueado" className="text-destructive"><Ban className="w-3.5 h-3.5" /></span>
                )}
              </div>
            </div>
            {profile.profile_about && (
              <p className="text-[11px] italic text-foreground/80 leading-snug">"{profile.profile_about}"</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button" onClick={wahaSync} disabled={!!wahaBusy}
                className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] border border-border hover:bg-secondary transition disabled:opacity-50"
              >
                {wahaBusy === 'sync' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sincronizar
              </button>
              <button
                type="button" onClick={wahaCheckExists} disabled={!!wahaBusy}
                className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] border border-border hover:bg-secondary transition disabled:opacity-50"
              >
                {wahaBusy === 'check' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />} Verificar nº
              </button>
              <button
                type="button" onClick={wahaToggleBlock} disabled={!!wahaBusy}
                className={`inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] border transition disabled:opacity-50 ${profile.is_blocked ? 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10' : 'border-destructive/40 text-destructive hover:bg-destructive/10'}`}
              >
                {wahaBusy === 'block' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                {profile.is_blocked ? 'Desbloquear' : 'Bloquear'}
              </button>
            </div>
            {profile.profile_synced_at && (
              <p className="text-[9px] text-muted-foreground">
                Sincronizado {formatDistanceToNow(new Date(profile.profile_synced_at), { addSuffix: true, locale: ptBR })}
              </p>
            )}
          </div>
        )}

        {/* Etapa 7 — Etiquetas, arquivar e silenciar */}
        {profile?.origin_connection_id && (
          <div className="mt-2 rounded-lg border border-border bg-secondary/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> Organização
              </span>
              <button
                type="button" onClick={wahaSyncLabels} disabled={!!wahaBusy}
                className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[9px] border border-border hover:bg-secondary transition disabled:opacity-50"
                title="Sincronizar etiquetas do WhatsApp"
              >
                {wahaBusy === 'labels' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              </button>
            </div>

            {/* Etiquetas aplicadas */}
            <div className="flex flex-wrap gap-1">
              {(profile.label_ids || []).map((lid) => {
                const l = availableLabels.find((x) => x.id === lid);
                if (!l) return null;
                return (
                  <span
                    key={lid}
                    className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] border"
                    style={{ borderColor: l.color || undefined, color: l.color || undefined }}
                  >
                    {l.name}
                    <button type="button" onClick={() => wahaToggleLabel(lid)} className="opacity-70 hover:opacity-100">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                );
              })}
              <button
                type="button" onClick={() => setLabelPickerOpen((v) => !v)}
                className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] border border-dashed border-border hover:bg-secondary transition"
              >
                <Plus className="w-2.5 h-2.5" /> Etiqueta
              </button>
            </div>

            {labelPickerOpen && (
              <div className="max-h-32 overflow-auto rounded border border-border bg-background/60 p-1 space-y-0.5">
                {availableLabels.length === 0 && (
                  <p className="text-[10px] text-muted-foreground px-1.5 py-1">Nenhuma etiqueta. Sincronize com o WhatsApp acima.</p>
                )}
                {availableLabels.map((l) => {
                  const on = (profile.label_ids || []).includes(l.id);
                  return (
                    <button
                      key={l.id} type="button" onClick={() => wahaToggleLabel(l.id)}
                      className="w-full flex items-center gap-2 text-left px-1.5 py-1 rounded hover:bg-secondary text-[11px]"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color || 'hsl(var(--muted-foreground))' }} />
                      <span className="flex-1 truncate">{l.name}</span>
                      {on && <Check className="w-3 h-3 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button" onClick={wahaToggleArchive} disabled={!!wahaBusy}
                className={`inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] border transition disabled:opacity-50 ${profile.is_archived ? 'border-primary/40 text-primary hover:bg-primary/10' : 'border-border hover:bg-secondary'}`}
              >
                {wahaBusy === 'archive' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                {profile.is_archived ? 'Restaurar' : 'Arquivar'}
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button" disabled={!!wahaBusy}
                    className={`inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] border transition disabled:opacity-50 ${profile.is_muted ? 'border-amber-500/40 text-amber-600 hover:bg-amber-500/10' : 'border-border hover:bg-secondary'}`}
                  >
                    {wahaBusy === 'mute' ? <Loader2 className="w-3 h-3 animate-spin" /> : profile.is_muted ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                    {profile.is_muted ? `Silenciado · ${muteRemaining}` : 'Silenciar'}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-1.5 space-y-0.5">
                  {profile.is_muted ? (
                    <button onClick={() => wahaSetMute(null)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-[11px]">
                      <Bell className="w-3 h-3" /> Reativar agora
                    </button>
                  ) : (
                    [1, 4, 8, 24].map((h) => (
                      <button key={h} onClick={() => wahaSetMute(h)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary text-[11px]">
                        <Clock className="w-3 h-3" /> Silenciar por {h}h
                      </button>
                    ))
                  )}
                </PopoverContent>
              </Popover>
            </div>
            {profile.is_muted && profile.muted_until && (
              <p className="text-[9px] text-muted-foreground" title={`Ativo até ${new Date(profile.muted_until).toLocaleString('pt-BR')}`}>
                <span className="sr-only">{muteTick}</span>
                Silenciado até {new Date(profile.muted_until).toLocaleString('pt-BR')} ({muteRemaining} restante)
              </p>
            )}
          </div>
        )}

      </div>


      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-6 mx-3 mt-3">

          <TabsTrigger value="notes" className="gap-1 text-[10px] px-1" title="Notas">
            <StickyNote className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="replies" className="gap-1 text-[10px] px-1" title="Respostas rápidas">
            <Zap className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1 text-[10px] px-1" title="Insights de IA">
            <Sparkles className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="crm" className="gap-1 text-[10px] px-1" title="CRM 360°">
            <Layers className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="media" className="gap-1 text-[10px] px-1" title="Galeria de mídias">
            <Images className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1 text-[10px] px-1" title="Histórico de atendimento">
            <HistoryIcon className="w-3.5 h-3.5" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
            <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
              🔒 Visível apenas para a equipe. Use <b>@usuário</b> para mencionar e notificar colegas.
            </p>
          </div>
          <MentionTextarea
            ownerId={ownerId}
            value={newNote}
            onChange={setNewNote}
            placeholder="Escrever nota interna... use @ para mencionar"
            rows={3}
            className="text-sm resize-none mb-2"
          />

          <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim() || savingNote} className="mb-3">
            {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Plus className="w-3.5 h-3.5 mr-2" />}
            Adicionar nota
          </Button>

          <ScrollArea className="flex-1 -mx-3 px-3">
            {loadingNotes ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 italic">
                Nenhuma nota ainda. Use este espaço para registrar contexto sobre o lead.
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border bg-secondary/40 p-2.5 group">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-foreground">{n.author_name || 'Atendente'}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                      {user?.id === n.author_id && (
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="replies" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <div className="space-y-2 mb-3 border-b border-border pb-3">
            <Input
              value={newReply.shortcut}
              onChange={(e) => setNewReply((r) => ({ ...r, shortcut: e.target.value }))}
              placeholder="Atalho ex: /boasvindas"
              className="h-8 text-xs"
            />
            <Textarea
              value={newReply.content}
              onChange={(e) => setNewReply((r) => ({ ...r, content: e.target.value }))}
              placeholder="Conteúdo da resposta..."
              rows={2}
              className="text-xs resize-none"
            />
            <Button size="sm" onClick={handleAddReply} disabled={savingReply} className="w-full">
              {savingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Plus className="w-3.5 h-3.5 mr-2" />}
              Criar resposta rápida
            </Button>
          </div>

          <ScrollArea className="flex-1 -mx-3 px-3">
            {loadingReplies ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : replies.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 italic">
                Nenhuma resposta rápida cadastrada.
              </p>
            ) : (
              <div className="space-y-2">
                {replies.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-secondary/40 p-2.5 group">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-[10px] font-mono font-bold text-primary">{r.shortcut}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => handleDeleteReply(r.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remover"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap mb-2">{r.content}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 w-full"
                      onClick={() => onUseReply(r.content)}
                    >
                      <Send className="w-2.5 h-2.5" /> Inserir no campo
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="ai" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <AIInsightsPanel customerId={customerId} />
        </TabsContent>

        <TabsContent value="crm" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <Customer360Timeline customerId={customerId} />
        </TabsContent>

        <TabsContent value="media" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <MediaGallery customerId={customerId} />
        </TabsContent>

        <TabsContent value="history" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <CustomerServiceHistory customerId={customerId} />
        </TabsContent>
      </Tabs>

    </div>
  );
}
