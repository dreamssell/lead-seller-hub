import { useState, useMemo } from 'react';
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
  Minimize2,
  Volume2,
  Pause,
  Save,
  Download,
  Play,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  BarChart3,
  TrendingUp,
  Users,
  ListOrdered,
  ShieldOff,
  Plus,
  Trash2,
  UserPlus,
  Calendar as CalendarIcon,
  Star,
  Cloud,
  Brain,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Bot,
  Target,
  Zap,
  Award,
  Lightbulb,
  RefreshCw,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const callHistory = [
  { id: 1, name: 'Maria Santos', number: '+55 11 98765-4321', type: 'incoming', duration: '12:34', time: 'Hoje 14:30', recorded: true, agent: 'João Silva' },
  { id: 2, name: 'Carlos Oliveira', number: '+55 21 99876-5432', type: 'outgoing', duration: '5:21', time: 'Hoje 13:15', recorded: true, agent: 'Maria Costa' },
  { id: 3, name: 'Ana Costa', number: '+55 31 91234-5678', type: 'missed', duration: '-', time: 'Hoje 12:00', recorded: false, agent: 'João Silva' },
  { id: 4, name: 'Pedro Lima', number: '+55 41 98888-7777', type: 'incoming', duration: '23:45', time: 'Hoje 11:30', recorded: true, agent: 'Pedro Alves' },
  { id: 5, name: 'Julia Ferreira', number: '+55 51 97777-6666', type: 'outgoing', duration: '8:12', time: 'Hoje 10:00', recorded: true, agent: 'Maria Costa' },
];

const recordings = [
  { id: 1, contact: 'Maria Santos', number: '+55 11 98765-4321', agent: 'João Silva', date: '2026-04-29 14:30', duration: '12:34', size: '2.4 MB', rating: 5 },
  { id: 2, contact: 'Carlos Oliveira', number: '+55 21 99876-5432', agent: 'Maria Costa', date: '2026-04-29 13:15', duration: '5:21', size: '1.1 MB', rating: 4 },
  { id: 3, contact: 'Pedro Lima', number: '+55 41 98888-7777', agent: 'Pedro Alves', date: '2026-04-29 11:30', duration: '23:45', size: '4.8 MB', rating: 5 },
  { id: 4, contact: 'Julia Ferreira', number: '+55 51 97777-6666', agent: 'Maria Costa', date: '2026-04-29 10:00', duration: '8:12', size: '1.7 MB', rating: 3 },
  { id: 5, contact: 'Roberto Mendes', number: '+55 11 95555-1111', agent: 'João Silva', date: '2026-04-28 16:45', duration: '15:20', size: '3.1 MB', rating: 4 },
];

const agents = ['Todos', 'João Silva', 'Maria Costa', 'Pedro Alves'];

const dailyVolume = [
  { day: 'Seg', recebidas: 18, realizadas: 24, perdidas: 3 },
  { day: 'Ter', recebidas: 22, realizadas: 19, perdidas: 5 },
  { day: 'Qua', recebidas: 15, realizadas: 28, perdidas: 2 },
  { day: 'Qui', recebidas: 27, realizadas: 22, perdidas: 4 },
  { day: 'Sex', recebidas: 31, realizadas: 35, perdidas: 6 },
  { day: 'Sáb', recebidas: 12, realizadas: 8, perdidas: 1 },
  { day: 'Dom', recebidas: 5, realizadas: 3, perdidas: 0 },
];

const avgDurationTrend = [
  { week: 'S1', minutos: 6.2 },
  { week: 'S2', minutos: 7.8 },
  { week: 'S3', minutos: 8.4 },
  { week: 'S4', minutos: 8.9 },
];

const callDistribution = [
  { name: 'Atendidas', value: 142, color: 'hsl(var(--success))' },
  { name: 'Perdidas', value: 21, color: 'hsl(var(--destructive))' },
  { name: 'Caixa postal', value: 12, color: 'hsl(var(--primary))' },
];

const queues = [
  { id: 1, name: 'Suporte Técnico', extension: '4001', agents: 5, waiting: 2, avgWait: '0:45', strategy: 'Round Robin' },
  { id: 2, name: 'Vendas', extension: '4002', agents: 8, waiting: 0, avgWait: '0:12', strategy: 'Menos chamadas' },
  { id: 3, name: 'Financeiro', extension: '4003', agents: 3, waiting: 1, avgWait: '1:20', strategy: 'Fixo' },
];

const blockedNumbers = [
  { id: 1, number: '+55 11 90000-0000', reason: 'Spam', date: '2026-04-25' },
  { id: 2, number: '+55 21 91111-1111', reason: 'Telemarketing', date: '2026-04-20' },
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

  // Filtros gravações
  const [recAgent, setRecAgent] = useState('Todos');
  const [recFrom, setRecFrom] = useState('');
  const [recTo, setRecTo] = useState('');
  const [recSearch, setRecSearch] = useState('');

  // Filtros relatórios
  const [reportPeriod, setReportPeriod] = useState('7d');
  const [reportAgent, setReportAgent] = useState('Todos');

  // Bloqueio
  const [newBlock, setNewBlock] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const [sipConfig, setSipConfig] = useState({
    server: 'sip.leadseller.app',
    port: '5060',
    username: '',
    password: '',
    displayName: '',
    transport: 'TLS',
    autoRecord: true,
  });

  const filteredRecordings = useMemo(() => {
    return recordings.filter((r) => {
      if (recAgent !== 'Todos' && r.agent !== recAgent) return false;
      if (recSearch && !r.contact.toLowerCase().includes(recSearch.toLowerCase()) && !r.number.includes(recSearch)) return false;
      if (recFrom && r.date < recFrom) return false;
      if (recTo && r.date > recTo + ' 23:59') return false;
      return true;
    });
  }, [recAgent, recSearch, recFrom, recTo]);

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

  const handleDownloadRecording = (r: typeof recordings[0]) => {
    toast({ title: 'Download iniciado', description: `${r.contact} • ${r.duration}` });
  };

  const handleBulkDownload = () => {
    toast({ title: 'Pacote ZIP em preparação', description: `${filteredRecordings.length} gravações serão compactadas.` });
  };

  const handleExportReport = (format: 'csv' | 'xlsx' | 'pdf') => {
    toast({ title: `Relatório ${format.toUpperCase()} gerado`, description: 'O download começará em instantes.' });
  };

  const handleAddBlock = () => {
    if (!newBlock) {
      toast({ title: 'Digite um número para bloquear', variant: 'destructive' });
      return;
    }
    toast({ title: 'Número bloqueado', description: newBlock });
    setNewBlock('');
    setBlockReason('');
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
        <div className="flex items-center gap-3 flex-wrap">
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
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="recordings">Gravações</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
          <TabsTrigger value="queues">Filas & IVR</TabsTrigger>
          <TabsTrigger value="blocked">Bloqueados</TabsTrigger>
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
                        <span>•</span>
                        <span>{call.agent}</span>
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

        {/* Gravações */}
        <TabsContent value="recordings" className="space-y-4">
          <motion.div className="glass-card p-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Filtros</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Atendente</Label>
                <Select value={recAgent} onValueChange={setRecAgent}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data inicial</Label>
                <Input type="date" value={recFrom} onChange={(e) => setRecFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data final</Label>
                <Input type="date" value={recTo} onChange={(e) => setRecTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Buscar</Label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Nome ou número" value={recSearch} onChange={(e) => setRecSearch(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setRecAgent('Todos'); setRecFrom(''); setRecTo(''); setRecSearch(''); }}>
                Limpar filtros
              </Button>
              <Button onClick={handleBulkDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Baixar selecionadas (ZIP)
              </Button>
            </div>
          </motion.div>

          <motion.div className="glass-card overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold">Gravações ({filteredRecordings.length})</h3>
              <Badge variant="secondary">
                {filteredRecordings.reduce((acc, r) => acc + parseFloat(r.size), 0).toFixed(1)} MB total
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Avaliação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecordings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      Nenhuma gravação encontrada com os filtros atuais
                    </TableCell>
                  </TableRow>
                ) : filteredRecordings.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.contact}</div>
                      <div className="text-xs text-muted-foreground">{r.number}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.agent}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="text-sm">{r.duration}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.size}</TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < r.rating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDownloadRecording(r)}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>
        </TabsContent>

        {/* Relatórios */}
        <TabsContent value="reports" className="space-y-4">
          <motion.div className="glass-card p-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                <div className="space-y-1.5">
                  <Label className="text-xs">Período</Label>
                  <Select value={reportPeriod} onValueChange={setReportPeriod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="7d">Últimos 7 dias</SelectItem>
                      <SelectItem value="30d">Últimos 30 dias</SelectItem>
                      <SelectItem value="90d">Últimos 90 dias</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Atendente</Label>
                  <Select value={reportAgent} onValueChange={setReportAgent}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleExportReport('csv')} className="gap-2">
                  <FileText className="w-4 h-4" /> CSV
                </Button>
                <Button variant="outline" onClick={() => handleExportReport('xlsx')} className="gap-2">
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </Button>
                <Button onClick={() => handleExportReport('pdf')} className="gap-2">
                  <Download className="w-4 h-4" /> PDF
                </Button>
              </div>
            </div>
          </motion.div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Taxa de atendimento', value: '87%', sub: '+4% vs período anterior', icon: TrendingUp, color: 'text-success' },
              { label: 'TMA (Tempo médio)', value: '8:45', sub: '-12s vs anterior', icon: Clock, color: 'text-primary' },
              { label: 'SLA (≤ 20s)', value: '92%', sub: 'Meta: 90%', icon: BarChart3, color: 'text-success' },
              { label: 'Custo total', value: 'R$ 1.247', sub: '175 chamadas', icon: TrendingUp, color: 'text-amber-500' },
            ].map((k, i) => (
              <motion.div
                key={k.label}
                className="glass-card p-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <k.icon className={`w-5 h-5 mb-3 ${k.color}`} />
                <p className="text-2xl font-bold text-foreground">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{k.sub}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <motion.div className="glass-card p-5 lg:col-span-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-sm font-semibold mb-4">Volume diário de chamadas</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="recebidas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="realizadas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="perdidas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div className="glass-card p-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-sm font-semibold mb-4">Distribuição</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={callDistribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {callDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div className="glass-card p-5 lg:col-span-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-sm font-semibold mb-4">Tendência de duração média (minutos)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={avgDurationTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="minutos" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Ranking de atendentes */}
          <motion.div className="glass-card overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold">Performance por atendente</h3>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Atendidas</TableHead>
                  <TableHead>Duração média</TableHead>
                  <TableHead>Avaliação</TableHead>
                  <TableHead className="w-[200px]">SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: 'João Silva', calls: 58, avg: '7:32', rating: 4.8, sla: 94 },
                  { name: 'Maria Costa', calls: 47, avg: '9:14', rating: 4.6, sla: 89 },
                  { name: 'Pedro Alves', calls: 37, avg: '10:21', rating: 4.4, sla: 85 },
                ].map((a) => (
                  <TableRow key={a.name}>
                    <TableCell className="font-medium text-sm">{a.name}</TableCell>
                    <TableCell className="text-sm">{a.calls}</TableCell>
                    <TableCell className="text-sm">{a.avg}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="text-sm">{a.rating}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={a.sla} className="h-1.5" />
                        <span className="text-xs text-muted-foreground w-9">{a.sla}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

        {/* Filas & IVR */}
        <TabsContent value="queues" className="space-y-4">
          <motion.div className="glass-card overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Filas de atendimento</h3>
              </div>
              <Button size="sm" className="gap-2">
                <Plus className="w-3.5 h-3.5" /> Nova fila
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>Ramal</TableHead>
                  <TableHead>Atendentes</TableHead>
                  <TableHead>Em espera</TableHead>
                  <TableHead>Tempo médio</TableHead>
                  <TableHead>Estratégia</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium text-sm">{q.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.extension}</TableCell>
                    <TableCell className="text-sm">{q.agents}</TableCell>
                    <TableCell>
                      <Badge variant={q.waiting > 0 ? 'destructive' : 'secondary'}>{q.waiting}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{q.avgWait}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.strategy}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Editar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>

          <motion.div className="glass-card p-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="text-sm font-semibold mb-3">URA / IVR</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Configure a árvore de menu de voz que recebe os clientes antes de direcioná-los para a fila correta.
            </p>
            <div className="space-y-2">
              {[
                { key: '1', label: 'Suporte Técnico → Fila 4001' },
                { key: '2', label: 'Vendas → Fila 4002' },
                { key: '3', label: 'Financeiro → Fila 4003' },
                { key: '0', label: 'Falar com atendente' },
              ].map((opt) => (
                <div key={opt.key} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                    {opt.key}
                  </div>
                  <span className="text-sm flex-1">{opt.label}</span>
                  <Button variant="ghost" size="sm">Editar</Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-3 gap-2">
              <Plus className="w-3.5 h-3.5" /> Adicionar opção
            </Button>
          </motion.div>
        </TabsContent>

        {/* Bloqueados */}
        <TabsContent value="blocked" className="space-y-4">
          <motion.div className="glass-card p-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 mb-4">
              <ShieldOff className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Bloquear novo número</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input placeholder="+55 11 90000-0000" value={newBlock} onChange={(e) => setNewBlock(e.target.value)} />
              <Input placeholder="Motivo (opcional)" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              <Button onClick={handleAddBlock} className="gap-2">
                <UserPlus className="w-4 h-4" /> Adicionar
              </Button>
            </div>
          </motion.div>

          <motion.div className="glass-card overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Lista de bloqueio ({blockedNumbers.length})</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockedNumbers.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm">{b.number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.reason}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.date}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-destructive">Desbloquear</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>
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
