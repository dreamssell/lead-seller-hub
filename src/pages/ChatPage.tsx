import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Send, Paperclip, Phone, Video, MoreVertical, Search, Circle } from 'lucide-react';
import { useState } from 'react';

const mockContacts = [
  { id: 1, name: 'Maria Santos', msg: 'Olá, preciso de ajuda com...', time: '2min', online: true, channel: 'WhatsApp' },
  { id: 2, name: 'Carlos Oliveira', msg: 'Qual o status do meu pedido?', time: '5min', online: true, channel: 'Chat' },
  { id: 3, name: 'Ana Costa', msg: 'Obrigada pelo atendimento!', time: '12min', online: false, channel: 'WhatsApp' },
  { id: 4, name: 'Pedro Lima', msg: 'Gostaria de saber sobre planos...', time: '30min', online: false, channel: 'Email' },
  { id: 5, name: 'Julia Ferreira', msg: 'Agendamento confirmado', time: '1h', online: true, channel: 'Chat' },
];

const mockMessages = [
  { id: 1, from: 'client', text: 'Olá! Preciso de ajuda com a integração da API.', time: '14:32' },
  { id: 2, from: 'agent', text: 'Claro! Posso te ajudar com isso. Qual endpoint você está tentando acessar?', time: '14:33' },
  { id: 3, from: 'client', text: 'Estou tentando usar o webhook de notificações, mas retorna 401.', time: '14:35' },
  { id: 4, from: 'agent', text: 'Entendi. Isso geralmente acontece quando a chave API não está configurada corretamente. Vá em Configurações > Chaves API e verifique se o token está ativo.', time: '14:36' },
];

export default function ChatPage() {
  const [selectedContact, setSelectedContact] = useState(mockContacts[0]);
  const [message, setMessage] = useState('');

  return (
    <AppLayout title="Chat Omnichannel" subtitle="Atendimento em tempo real">
      <div className="flex h-[calc(100vh-11rem)] glass-card overflow-hidden">
        {/* Contact List */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar conversas..."
                className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {mockContacts.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedContact(c)}
                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                  selectedContact.id === c.id ? 'bg-secondary' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{c.name.split(' ').map(n => n[0]).join('')}</span>
                  </div>
                  {c.online && (
                    <Circle className="w-3 h-3 text-success fill-success absolute -bottom-0.5 -right-0.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <span className="text-[10px] text-muted-foreground">{c.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.msg}</p>
                  <span className="text-[10px] font-medium text-primary">{c.channel}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="h-14 border-b border-border flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">
                  {selectedContact.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedContact.name}</p>
                <p className="text-[10px] text-success">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <Phone className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <Video className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {mockMessages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.from === 'agent' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${
                    m.from === 'agent'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-secondary text-foreground rounded-bl-md'
                  }`}
                >
                  <p>{m.text}</p>
                  <p className={`text-[10px] mt-1 ${m.from === 'agent' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {m.time}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
              </button>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
              />
              <button className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
