import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StickyNote, Zap, Loader2, Trash2, Plus, X, Send, History as HistoryIcon, Layers, Images } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MentionTextarea } from './MentionTextarea';
import { AssignmentTimeline } from './AssignmentTimeline';
import { Customer360Timeline } from './Customer360Timeline';
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
  const [tab, setTab] = useState<'notes' | 'replies' | 'history' | 'crm' | 'media'>('notes');
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newReply, setNewReply] = useState({ shortcut: '', content: '' });
  const [savingReply, setSavingReply] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);

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

  useEffect(() => {
    supabase
      .from('customers')
      .select('owner_id')
      .eq('id', customerId)
      .maybeSingle()
      .then(({ data }) => setOwnerId((data as any)?.owner_id || null));
  }, [customerId]);


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
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Painel do atendente</p>
          <p className="text-sm font-semibold truncate">{customerName}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-5 mx-3 mt-3">
          <TabsTrigger value="notes" className="gap-1 text-[10px] px-1" title="Notas">
            <StickyNote className="w-3.5 h-3.5" />
          </TabsTrigger>
          <TabsTrigger value="replies" className="gap-1 text-[10px] px-1" title="Respostas rápidas">
            <Zap className="w-3.5 h-3.5" />
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

        <TabsContent value="crm" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <Customer360Timeline customerId={customerId} />
        </TabsContent>

        <TabsContent value="media" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <MediaGallery customerId={customerId} />
        </TabsContent>

        <TabsContent value="history" className="flex-1 flex flex-col mt-3 px-3 pb-3 data-[state=inactive]:hidden">
          <AssignmentTimeline customerId={customerId} />
        </TabsContent>
      </Tabs>

    </div>
  );
}
