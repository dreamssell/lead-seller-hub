import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

interface Peer {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

/**
 * Detalhes de uma mensagem interna específica, com histórico da conversa
 * com o remetente e ação automática de marcar como lida ao abrir.
 */
export default function InternalMessageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState<Message | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: msg, error } = await supabase
        .from('internal_messages')
        .select('id,sender_id,recipient_id,content,created_at,read_at')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !msg) {
        toast.error('Mensagem não encontrada ou sem permissão.');
        navigate('/internal-comms');
        return;
      }
      setMessage(msg as Message);
      const peerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id,display_name,email')
        .eq('user_id', peerId)
        .maybeSingle();
      setPeer(prof as Peer);
      const { data: hist } = await supabase
        .from('internal_messages')
        .select('id,sender_id,recipient_id,content,created_at,read_at')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(100);
      setThread((hist as Message[]) || []);
      // Marcar como lida ao abrir (só se for destinatário e ainda não lida).
      if (msg.recipient_id === user.id && !msg.read_at) {
        const now = new Date().toISOString();
        await supabase.from('internal_messages').update({ read_at: now }).eq('id', msg.id);
        setMessage((prev) => (prev ? { ...prev, read_at: now } : prev));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, user, navigate]);

  return (
    <AppLayout title="Mensagem interna" subtitle="Detalhes e histórico">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/internal-comms')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Mensagem interna
          </h1>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!loading && message && (
          <>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium">{peer?.display_name || peer?.email || 'Colega'}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(message.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                {message.read_at ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="w-3 h-3" /> Lida
                  </span>
                ) : (
                  <span className="text-xs text-primary">Nova</span>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </Card>

            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">Histórico da conversa</h2>
              <div className="space-y-2">
                {thread.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'} ${m.id === message.id ? 'ring-2 ring-primary/50' : ''}`}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <p className={`text-[10px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {thread.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sem histórico anterior.</p>
                )}
              </div>
            </div>

            <div className="pt-2">
              <Button onClick={() => navigate('/internal-comms')}>Ir para Comunicação Interna</Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
