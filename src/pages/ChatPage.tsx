import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, Phone, Video, MoreVertical, Search, Circle,
  Camera, ThumbsUp, Briefcase, MessageCircle, Globe, Bot, UserCog, ArrowLeft,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

type ChannelKey = 'instagram' | 'facebook' | 'linkedin' | 'whatsapp' | 'widget';

const channels: Array<{
  key: ChannelKey; name: string; icon: any; color: string; bg: string; leads: number; open: number;
}> = [
  { key: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', leads: 142, open: 18 },
  { key: 'instagram', name: 'Instagram', icon: Camera, color: 'text-pink-500', bg: 'bg-pink-500/10', leads: 87, open: 12 },
  { key: 'facebook', name: 'Facebook', icon: ThumbsUp, color: 'text-blue-500', bg: 'bg-blue-500/10', leads: 64, open: 9 },
  { key: 'linkedin', name: 'LinkedIn', icon: Briefcase, color: 'text-sky-600', bg: 'bg-sky-500/10', leads: 31, open: 4 },
  { key: 'widget', name: 'Widget de Site', icon: Globe, color: 'text-violet-500', bg: 'bg-violet-500/10', leads: 53, open: 7 },
];

const conversationsByChannel: Record<ChannelKey, Array<{ id: number; name: string; msg: string; time: string; online: boolean; botEnabled: boolean; assignedTo: string; }>> = {
  whatsapp: [
    { id: 1, name: 'Maria Santos', msg: 'Olá, gostaria de saber sobre o plano Pro', time: '2min', online: true, botEnabled: true, assignedTo: 'bot:vendas' },
    { id: 2, name: 'Carlos Oliveira', msg: 'Preciso de suporte com o webhook', time: '12min', online: true, botEnabled: false, assignedTo: 'human:joao' },
    { id: 3, name: 'Ana Paula', msg: 'Posso receber a proposta por aqui?', time: '34min', online: false, botEnabled: true, assignedTo: 'bot:vendas' },
  ],
  instagram: [
    { id: 10, name: '@lucas.dev', msg: 'Vi o anúncio, quero falar com vendedor', time: '5min', online: true, botEnabled: true, assignedTo: 'bot:qualificador' },
    { id: 11, name: '@marina.costa', msg: 'Tem desconto no plano anual?', time: '20min', online: false, botEnabled: false, assignedTo: 'human:maria' },
  ],
  facebook: [
    { id: 20, name: 'Roberto Lima', msg: 'Quais formas de pagamento aceitam?', time: '8min', online: true, botEnabled: true, assignedTo: 'bot:atendimento' },
    { id: 21, name: 'Patricia Gomes', msg: 'Obrigada pelo atendimento!', time: '1h', online: false, botEnabled: false, assignedTo: 'human:pedro' },
  ],
  linkedin: [
    { id: 30, name: 'Eduardo Mendes', msg: 'Gostaria de agendar uma demo', time: '15min', online: true, botEnabled: false, assignedTo: 'human:joao' },
  ],
  widget: [
    { id: 40, name: 'Visitante #4821', msg: 'O plano grátis tem limite de mensagens?', time: '1min', online: true, botEnabled: true, assignedTo: 'bot:atendimento' },
    { id: 41, name: 'Visitante #4815', msg: 'Como faço integração com meu CRM?', time: '40min', online: false, botEnabled: true, assignedTo: 'bot:tecnico' },
  ],
};

const aiAgents = [
  { id: 'bot:vendas', name: 'Agente de Vendas IA' },
  { id: 'bot:atendimento', name: 'Agente de Atendimento IA' },
  { id: 'bot:qualificador', name: 'Qualificador de Leads IA' },
  { id: 'bot:tecnico', name: 'Suporte Técnico IA' },
];

const humanAgents = [
  { id: 'human:joao', name: 'João Silva', status: 'online' },
  { id: 'human:maria', name: 'Maria Costa', status: 'online' },
  { id: 'human:pedro', name: 'Pedro Alves', status: 'busy' },
  { id: 'human:ana', name: 'Ana Ribeiro', status: 'offline' },
];

const mockMessages = [
  { id: 1, from: 'client', text: 'Olá! Preciso de ajuda com a integração da API.', time: '14:32' },
  { id: 2, from: 'agent', text: 'Claro! Posso te ajudar com isso. Qual endpoint você está tentando acessar?', time: '14:33' },
  { id: 3, from: 'client', text: 'Estou tentando usar o webhook de notificações, mas retorna 401.', time: '14:35' },
  { id: 4, from: 'agent', text: 'Verifique se a chave API está ativa em Configurações > Chaves API.', time: '14:36' },
];

export default function ChatPage() {
  const [activeChannel, setActiveChannel] = useState<ChannelKey | null>(null);
  const [convs, setConvs] = useState(conversationsByChannel);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [message, setMessage] = useState('');

  const list = activeChannel ? convs[activeChannel] : [];
  const selectedConv = list.find((c) => c.id === selectedConvId) || list[0];

  const toggleBot = (id: number) => {
    if (!activeChannel) return;
    setConvs((prev) => ({
      ...prev,
      [activeChannel]: prev[activeChannel].map((c) =>
        c.id === id ? { ...c, botEnabled: !c.botEnabled } : c,
      ),
    }));
    toast({ title: 'Bot atualizado', description: 'Estado do agente alterado para essa conversa.' });
  };

  const setBotAgent = (id: number, botId: string) => {
    if (!activeChannel) return;
    setConvs((prev) => ({
      ...prev,
      [activeChannel]: prev[activeChannel].map((c) =>
        c.id === id ? { ...c, assignedTo: botId, botEnabled: true } : c,
      ),
    }));
    toast({ title: 'Agente IA atribuído', description: aiAgents.find((a) => a.id === botId)?.name });
  };

  const handleTransfer = () => {
    if (!transferTarget || !selectedConv || !activeChannel) return;
    setConvs((prev) => ({
      ...prev,
      [activeChannel]: prev[activeChannel].map((c) =>
        c.id === selectedConv.id ? { ...c, assignedTo: transferTarget, botEnabled: false } : c,
      ),
    }));
    toast({ title: 'Conversa transferida', description: humanAgents.find((h) => h.id === transferTarget)?.name });
    setTransferOpen(false);
    setTransferTarget('');
  };

  // Painel principal: mini-cards de canais
  if (!activeChannel) {
    return (
      <AppLayout title="Chat Omnichannel" subtitle="Selecione um canal para ver leads e conversas">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {channels.map((ch, i) => {
            const Icon = ch.icon;
            return (
              <motion.button
                key={ch.key}
                onClick={() => setActiveChannel(ch.key)}
                className="glass-card p-5 text-left hover:border-primary/40 transition-all group"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
              >
                <div className={`w-12 h-12 rounded-2xl ${ch.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${ch.color}`} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{ch.name}</h3>
                <div className="flex items-center gap-3 mt-3">
                  <div>
                    <p className="text-xl font-bold text-foreground">{ch.leads}</p>
                    <p className="text-[10px] text-muted-foreground">Leads</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div>
                    <p className="text-xl font-bold text-primary">{ch.open}</p>
                    <p className="text-[10px] text-muted-foreground">Abertas</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-6 glass-card p-5">
          <h3 className="text-sm font-semibold mb-2">Resumo geral</h3>
          <p className="text-xs text-muted-foreground">
            Total de {channels.reduce((a, c) => a + c.leads, 0)} leads e {channels.reduce((a, c) => a + c.open, 0)} conversas em aberto distribuídos pelos canais conectados.
          </p>
        </div>
      </AppLayout>
    );
  }

  const channelInfo = channels.find((c) => c.key === activeChannel)!;
  const ChannelIcon = channelInfo.icon;

  return (
    <AppLayout title="Chat Omnichannel" subtitle={`Canal ${channelInfo.name}`}>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => { setActiveChannel(null); setSelectedConvId(null); }} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Canais
        </Button>
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full ${channelInfo.bg}`}>
          <ChannelIcon className={`w-3.5 h-3.5 ${channelInfo.color}`} />
          <span className={`text-xs font-medium ${channelInfo.color}`}>{channelInfo.name}</span>
        </div>
      </div>

      <div className="flex h-[calc(100vh-13rem)] glass-card overflow-hidden">
        {/* Lista */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input placeholder="Buscar leads..." className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedConvId(c.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                  selectedConv?.id === c.id ? 'bg-secondary' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{c.name.split(/[\s.@]/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')}</span>
                  </div>
                  {c.online && <Circle className="w-3 h-3 text-success fill-success absolute -bottom-0.5 -right-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <span className="text-[10px] text-muted-foreground">{c.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.msg}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {c.botEnabled ? (
                      <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4 gap-0.5">
                        <Bot className="w-2.5 h-2.5" />
                        IA
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 gap-0.5">
                        <UserCog className="w-2.5 h-2.5" />
                        {humanAgents.find((h) => h.id === c.assignedTo)?.name.split(' ')[0] || 'Humano'}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 flex flex-col">
          {selectedConv && (
            <>
              <div className="border-b border-border px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{selectedConv.name.split(/[\s.@]/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{selectedConv.name}</p>
                    <p className="text-[10px] text-success">{selectedConv.online ? 'Online agora' : 'Offline'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/60">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium">Agente Bot</span>
                    <Switch checked={selectedConv.botEnabled} onCheckedChange={() => toggleBot(selectedConv.id)} />
                  </div>

                  <Select
                    value={selectedConv.botEnabled ? selectedConv.assignedTo : ''}
                    onValueChange={(v) => setBotAgent(selectedConv.id, v)}
                    disabled={!selectedConv.botEnabled}
                  >
                    <SelectTrigger className="h-8 text-xs w-[180px]">
                      <SelectValue placeholder="Selecionar IA" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiAgents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setTransferOpen(true)}>
                    <UserCog className="w-3.5 h-3.5" />
                    Transferir
                  </Button>

                  <button className="p-2 rounded-lg hover:bg-secondary"><Phone className="w-4 h-4 text-muted-foreground" /></button>
                  <button className="p-2 rounded-lg hover:bg-secondary"><Video className="w-4 h-4 text-muted-foreground" /></button>
                  <button className="p-2 rounded-lg hover:bg-secondary"><MoreVertical className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {mockMessages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.from === 'agent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                      m.from === 'agent' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary text-foreground rounded-bl-md'
                    }`}>
                      <p>{m.text}</p>
                      <p className={`text-[10px] mt-1 ${m.from === 'agent' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{m.time}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <button className="p-2 rounded-lg hover:bg-secondary"><Paperclip className="w-4 h-4 text-muted-foreground" /></button>
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                  />
                  <button className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90"><Send className="w-4 h-4" /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
            <DialogDescription>Escolha um atendente humano disponível para assumir essa conversa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {humanAgents.map((h) => (
              <button
                key={h.id}
                onClick={() => setTransferTarget(h.id)}
                disabled={h.status === 'offline'}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                  transferTarget === h.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'
                } ${h.status === 'offline' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                    <UserCog className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{h.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{h.status}</p>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${
                  h.status === 'online' ? 'bg-success' : h.status === 'busy' ? 'bg-amber-500' : 'bg-muted-foreground'
                }`} />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={!transferTarget}>Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
