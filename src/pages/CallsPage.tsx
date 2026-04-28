import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  Clock,
  Settings,
  Server,
  Wifi,
  WifiOff,
  Delete,
  X,
  Minimize2,
  Volume2,
  Pause,
  Save,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

const callHistory = [
  { id: 1, name: 'Maria Santos', number: '+55 11 98765-4321', type: 'incoming', duration: '12:34', time: 'Hoje 14:30', recorded: true },
  { id: 2, name: 'Carlos Oliveira', number: '+55 21 99876-5432', type: 'outgoing', duration: '5:21', time: 'Hoje 13:15', recorded: true },
  { id: 3, name: 'Ana Costa', number: '+55 31 91234-5678', type: 'missed', duration: '-', time: 'Hoje 12:00', recorded: false },
  { id: 4, name: 'Pedro Lima', number: '+55 41 98888-7777', type: 'incoming', duration: '23:45', time: 'Hoje 11:30', recorded: true },
  { id: 5, name: 'Julia Ferreira', number: '+55 51 97777-6666', type: 'outgoing', duration: '8:12', time: 'Hoje 10:00', recorded: true },
];

const typeIcon = { incoming: PhoneIncoming, outgoing: PhoneOutgoing, missed: PhoneMissed };
const typeColor = { incoming: 'text-success', outgoing: 'text-primary', missed: 'text-destructive' };

const dialPad = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

export default function CallsPage() {
  const [dialerOpen, setDialerOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [sipStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connected');

  const [sipConfig, setSipConfig] = useState({
    server: 'sip.leadseller.app',
    port: '5060',
    username: '',
    password: '',
    displayName: '',
    transport: 'TLS',
    autoRecord: true,
  });

  const handleKey = (k: string) => setNumber((n) => n + k);
  const handleBackspace = () => setNumber((n) => n.slice(0, -1));

  const handleCall = () => {
    if (!number) {
      toast({ title: 'Digite um número', variant: 'destructive' });
      return;
    }
    setInCall(true);
    toast({ title: 'Chamando...', description: number });
  };

  const handleHangup = () => {
    setInCall(false);
    setMuted(false);
    setOnHold(false);
    toast({ title: 'Chamada encerrada' });
  };

  const handleSaveSip = () => {
    toast({ title: 'Configuração SIP salva', description: 'As credenciais foram atualizadas.' });
  };

  const statusBadge = {
    connected: { label: 'Conectado', icon: Wifi, color: 'bg-success/10 text-success border-success/20' },
    connecting: { label: 'Conectando...', icon: Wifi, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    disconnected: { label: 'Desconectado', icon: WifiOff, color: 'bg-destructive/10 text-destructive border-destructive/20' },
  }[sipStatus];

  const StatusIcon = statusBadge.icon;

  return (
    <AppLayout title="VoIP & Chamadas" subtitle="Central de chamadas com gravação automática">
      {/* Status SIP + Quick Action */}
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusBadge.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">SIP {statusBadge.label}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Server className="w-3.5 h-3.5" />
            <span>{sipConfig.server}:{sipConfig.port}</span>
          </div>
        </div>
        <Button onClick={() => setDialerOpen(true)} className="gap-2">
          <Phone className="w-4 h-4" />
          Abrir Discador
        </Button>
      </motion.div>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
          <TabsTrigger value="settings">Configurações SIP</TabsTrigger>
        </TabsList>

        {/* Histórico */}
        <TabsContent value="history">
          <motion.div className="glass-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Histórico de Chamadas</h3>
              <Badge variant="secondary">{callHistory.length} registros</Badge>
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{call.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{call.number}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
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
                    <button
                      onClick={() => { setNumber(call.number); setDialerOpen(true); }}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <Phone className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </TabsContent>

        {/* Estatísticas */}
        <TabsContent value="stats">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Chamadas realizadas', value: '23', icon: PhoneOutgoing, color: 'text-primary' },
              { label: 'Chamadas recebidas', value: '18', icon: PhoneIncoming, color: 'text-success' },
              { label: 'Tempo médio', value: '8:45', icon: Clock, color: 'text-foreground' },
              { label: 'Gravações salvas', value: '34', icon: Mic, color: 'text-amber-500' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className="glass-card p-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <s.icon className={`w-5 h-5 mb-3 ${s.color}`} />
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Configurações SIP */}
        <TabsContent value="settings">
          <motion.div className="glass-card p-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 mb-5">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Configuração SIP / VoIP</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="server">Servidor SIP</Label>
                <Input id="server" value={sipConfig.server} onChange={(e) => setSipConfig({ ...sipConfig, server: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Porta</Label>
                <Input id="port" value={sipConfig.port} onChange={(e) => setSipConfig({ ...sipConfig, port: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Usuário / Ramal</Label>
                <Input id="username" placeholder="1001" value={sipConfig.username} onChange={(e) => setSipConfig({ ...sipConfig, username: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" placeholder="••••••••" value={sipConfig.password} onChange={(e) => setSipConfig({ ...sipConfig, password: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Nome de Exibição</Label>
                <Input id="displayName" placeholder="Lead Seller" value={sipConfig.displayName} onChange={(e) => setSipConfig({ ...sipConfig, displayName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transport">Transporte</Label>
                <Input id="transport" value={sipConfig.transport} onChange={(e) => setSipConfig({ ...sipConfig, transport: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium">Gravação automática</p>
                  <p className="text-xs text-muted-foreground">Gravar todas as chamadas automaticamente</p>
                </div>
                <Switch checked={sipConfig.autoRecord} onCheckedChange={(v) => setSipConfig({ ...sipConfig, autoRecord: v })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline">Testar conexão</Button>
              <Button onClick={handleSaveSip} className="gap-2">
                <Save className="w-4 h-4" />
                Salvar configuração
              </Button>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Discador Flutuante */}
      <Dialog open={dialerOpen} onOpenChange={setDialerOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden bg-background border-border">
          <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/50 border-b border-border">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${sipStatus === 'connected' ? 'bg-success' : 'bg-destructive'} animate-pulse`} />
              <span className="text-xs font-medium text-foreground">Discador VoIP</span>
            </div>
            <button onClick={() => setDialerOpen(false)} className="p-1 rounded hover:bg-secondary">
              <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="p-5">
            <AnimatePresence mode="wait">
              {!inCall ? (
                <motion.div key="dial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="+55 (00) 00000-0000"
                      className="w-full bg-secondary rounded-xl px-4 py-4 text-center text-xl font-light tracking-wide outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30"
                    />
                    {number && (
                      <button onClick={handleBackspace} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-background">
                        <Delete className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-5">
                    {dialPad.map(([k, sub]) => (
                      <motion.button
                        key={k}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleKey(k)}
                        className="aspect-square rounded-2xl bg-secondary hover:bg-secondary/70 flex flex-col items-center justify-center transition-colors"
                      >
                        <span className="text-2xl font-light text-foreground">{k}</span>
                        {sub && <span className="text-[9px] text-muted-foreground tracking-widest mt-0.5">{sub}</span>}
                      </motion.button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={handleCall} className="bg-success text-success-foreground hover:bg-success/90 h-12 gap-2">
                      <Phone className="w-4 h-4" />
                      Ligar
                    </Button>
                    <Button variant="secondary" className="h-12 gap-2">
                      <Video className="w-4 h-4" />
                      Vídeo
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="incall" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-2">
                  <motion.div
                    className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-4"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Phone className="w-8 h-8 text-primary-foreground" />
                  </motion.div>
                  <p className="text-lg font-medium text-foreground">{number}</p>
                  <p className="text-xs text-muted-foreground mt-1">{onHold ? 'Em espera' : 'Em chamada • 00:23'}</p>

                  <div className="flex justify-center gap-3 mt-6">
                    <button
                      onClick={() => setMuted(!muted)}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-destructive text-destructive-foreground' : 'bg-secondary hover:bg-secondary/70'}`}
                    >
                      {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setOnHold(!onHold)}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${onHold ? 'bg-amber-500 text-white' : 'bg-secondary hover:bg-secondary/70'}`}
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                    <button className="w-12 h-12 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center">
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleHangup}
                      className="w-12 h-12 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center"
                    >
                      <PhoneOff className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
