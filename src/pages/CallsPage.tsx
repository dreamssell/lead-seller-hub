import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Mic, Video, Clock } from 'lucide-react';

const callHistory = [
  { id: 1, name: 'Maria Santos', type: 'incoming', duration: '12:34', time: '14:30', recorded: true },
  { id: 2, name: 'Carlos Oliveira', type: 'outgoing', duration: '5:21', time: '13:15', recorded: true },
  { id: 3, name: 'Ana Costa', type: 'missed', duration: '-', time: '12:00', recorded: false },
  { id: 4, name: 'Pedro Lima', type: 'incoming', duration: '23:45', time: '11:30', recorded: true },
  { id: 5, name: 'Julia Ferreira', type: 'outgoing', duration: '8:12', time: '10:00', recorded: true },
];

const typeIcon = {
  incoming: PhoneIncoming,
  outgoing: PhoneOutgoing,
  missed: PhoneMissed,
};

const typeColor = {
  incoming: 'text-success',
  outgoing: 'text-primary',
  missed: 'text-destructive',
};

export default function CallsPage() {
  return (
    <AppLayout title="VoIP & Chamadas" subtitle="Central de chamadas com gravação automática">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Dial */}
        <div className="lg:col-span-1">
          <motion.div
            className="glass-card p-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Discagem Rápida</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="+55 (00) 00000-0000"
                className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
              />
              <div className="grid grid-cols-2 gap-2">
                <button className="flex items-center justify-center gap-2 bg-success text-success-foreground py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
                  <Phone className="w-4 h-4" />
                  Ligar
                </button>
                <button className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
                  <Video className="w-4 h-4" />
                  Vídeo
                </button>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Estatísticas Hoje</h4>
              <div className="space-y-2">
                {[
                  { label: 'Chamadas realizadas', value: '23' },
                  { label: 'Chamadas recebidas', value: '18' },
                  { label: 'Tempo médio', value: '8:45' },
                  { label: 'Gravações salvas', value: '34' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="text-sm font-semibold text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Call History */}
        <div className="lg:col-span-2">
          <motion.div
            className="glass-card"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Histórico de Chamadas</h3>
            </div>
            <div className="divide-y divide-border">
              {callHistory.map((call) => {
                const Icon = typeIcon[call.type as keyof typeof typeIcon];
                const color = typeColor[call.type as keyof typeof typeColor];
                return (
                  <div key={call.id} className="flex items-center gap-4 px-6 py-4 hover:bg-secondary/30 transition-colors">
                    <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{call.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{call.time}</span>
                        <span>•</span>
                        <span>{call.duration}</span>
                      </div>
                    </div>
                    {call.recorded && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-success/10">
                        <Mic className="w-3 h-3 text-success" />
                        <span className="text-[10px] font-medium text-success">Gravado</span>
                      </div>
                    )}
                    <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
