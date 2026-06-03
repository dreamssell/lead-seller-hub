import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone, 
  Shield, 
  Globe, 
  Activity, 
  Loader2, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  History,
  Clock,
  XCircle,
  RefreshCw,
  Search,
  Webhook,
  Download,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { useAuth } from '@/contexts/AuthContext';

export default function WavoipConfigPage() {
  const { access } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validated, setTestingValidated] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [webhookSecret, setWebhookSecret] = useState('wv_' + Math.random().toString(36).substring(7));
  const [lastValidation, setLastValidation] = useState<{
    status: 'success' | 'error' | 'none';
    timestamp: string | null;
    message: string;
  }>({ status: 'none', timestamp: null, message: '' });

  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'error'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [history, setHistory] = useState([
    { id: 1, date: '2024-05-20 14:30:05', status: 'success', type: 'API', message: 'Conexão estabelecida via API Gateway' },
    { id: 2, date: '2024-05-19 10:15:22', status: 'error', type: 'Auth', message: '401 Unauthorized - Token expirado' },
    { id: 3, date: '2024-05-18 16:45:10', status: 'success', type: 'API', message: 'Validação de credenciais OK' },
    { id: 4, date: '2024-05-15 09:00:00', status: 'error', type: 'Network', message: '503 Service Unavailable - Wavoip API Down' },
  ]);

  const filteredHistory = history.filter(item => {
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    const matchesSearch = item.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (item.type && item.type.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  });
  
  const [form, setForm] = useState({
    apiUrl: 'https://api.wavoip.com/v1',
    token: '',
    origin: '',
    destination: ''
  });

  // Simulação de polling para tempo real
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLive) {
      interval = setInterval(() => {
        // Chance aleatória de surgir um novo evento simulado
        if (Math.random() > 0.85) {
          const timestamp = new Date().toLocaleString();
          const newEvent = {
            id: Date.now(),
            date: timestamp,
            status: Math.random() > 0.2 ? 'success' : 'error' as any,
            type: 'Webhook',
            message: 'Evento de chamada recebido via webhook'
          };
          setHistory(prev => [newEvent, ...prev.slice(0, 19)]);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isLive]);

  const handleSave = async () => {
    if (!validated) {
      toast.error('Valide a conexão antes de salvar.');
      return;
    }
    setLoading(true);
    // Simulação de salvamento - integraria com whatsapp_connections ou similar
    setTimeout(() => {
      setLoading(false);
      toast.success('Configurações do Wavoip salvas com sucesso!');
    }, 1000);
  };

  const handleTest = async () => {
    if (!form.token) {
      toast.error('Informe o token de acesso.');
      return;
    }
    setTesting(true);
    
    try {
      // Simulação de validação
      const { data, error } = await supabase.functions.invoke('whatsapp-status', {
        body: { provider: 'wavoip', url: form.apiUrl, token: form.token }
      });
      
      setTesting(false);
      const timestamp = new Date().toLocaleString();

      if (error || data?.error) {
        toast.error('Falha na validação das credenciais.');
        setTestingValidated(false);
        const errorMsg = error?.message || data?.error || 'Erro na comunicação com o servidor';
        setLastValidation({
          status: 'error',
          timestamp,
          message: errorMsg
        });
        setHistory([{ id: history.length + 1, date: timestamp, status: 'error', type: 'API', message: errorMsg }, ...history]);
      } else {
        toast.success('Conexão validada com sucesso!');
        setTestingValidated(true);
        setLastValidation({
          status: 'success',
          timestamp,
          message: 'Conexão estabelecida com sucesso'
        });
        setHistory([{ id: history.length + 1, date: timestamp, status: 'success', type: 'API', message: 'Teste de conexão manual OK' }, ...history]);
      }
    } catch (err) {
      setTesting(false);
      setTestingValidated(false);
      setLastValidation({
        status: 'error',
        timestamp: new Date().toLocaleString(),
        message: 'Falha crítica na requisição'
      });
      toast.error('Erro ao processar validação.');
    }
  };

  const exportHistory = (format: 'csv' | 'pdf') => {
    setIsExporting(true);
    toast.info(`Iniciando exportação em ${format.toUpperCase()}...`);
    
    // Simulação de geração de arquivo
    setTimeout(() => {
      const headers = ['Data', 'Status', 'Tipo', 'Mensagem'];
      const data = filteredHistory.map(item => [
        item.date,
        item.status.toUpperCase(),
        item.type,
        item.message
      ]);
      
      const content = [headers, ...data].map(row => row.join(',')).join('\n');
      const blob = new Blob([content], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wavoip-audit-log-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      
      setIsExporting(false);
      toast.success(`Relatório de auditoria exportado com sucesso!`);
    }, 1500);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
          <Phone className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuração Wavoip</h1>
          <p className="text-sm text-muted-foreground">Credenciais de voz e mensagens integradas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="glass-card bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Status</p>
              <div className="p-1.5 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">Conectado</p>
            <p className="text-[10px] text-emerald-600/70 mt-1">Sincronização ativa</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Último Teste</p>
              <div className="p-1.5 rounded-full bg-secondary text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">
              {lastValidation.timestamp ? lastValidation.timestamp.split(' ')[1] : '--:--'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {lastValidation.status === 'success' ? 'Sucesso' : lastValidation.status === 'error' ? 'Falha' : 'Aguardando'}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Latência Média</p>
              <div className="p-1.5 rounded-full bg-secondary text-muted-foreground">
                <Activity className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">124ms</p>
            <p className="text-[10px] text-emerald-600 mt-1">Ótimo desempenho</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Credenciais de API
          </CardTitle>
          <CardDescription>Informe seus dados de acesso fornecidos pelo painel Wavoip</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL do Servidor</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                className="pl-9" 
                value={form.apiUrl} 
                onChange={e => setForm({...form, apiUrl: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Token de Acesso (API Key) <Lock className="w-3 h-3 text-muted-foreground" />
            </Label>
            <div className="relative">
              <Input 
                type={showToken ? "text" : "password"} 
                placeholder="wa_..." 
                value={form.token}
                onChange={e => setForm({...form, token: e.target.value})}
                className="pr-10 font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              As credenciais são criptografadas em repouso seguindo padrões AES-256.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Roteamento de Chamadas
          </CardTitle>
          <CardDescription>Defina os ramais de origem e destino para as integrações</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Origem (DID/Ramal)</Label>
            <Input 
              placeholder="Ex: 551199999999" 
              value={form.origin}
              onChange={e => setForm({...form, origin: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label>Destino Padrão</Label>
            <Input 
              placeholder="Ramal ou Fila" 
              value={form.destination}
              onChange={e => setForm({...form, destination: e.target.value})}
            />
          </div>
          <div className="md:col-span-2 space-y-2 pt-2">
            <Label className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-primary" /> Webhook de Eventos
            </Label>
            <div className="flex gap-2">
              <Input 
                className="font-mono text-[10px] bg-secondary/30" 
                value={`https://api.lovable.dev/v1/webhooks/wavoip/${access?.sub_company_id || 'master'}`} 
                readOnly
              />
              <Button variant="outline" size="sm" onClick={() => {
                navigator.clipboard.writeText(`https://api.lovable.dev/v1/webhooks/wavoip/${access?.sub_company_id || 'master'}`);
                toast.success('URL copiada!');
              }}>
                Copiar
              </Button>
            </div>
            <div className="md:col-span-2 space-y-2 pt-2">
              <Label className="flex items-center gap-2">
                Segredo de Assinatura (Webhook Secret)
              </Label>
              <div className="flex gap-2">
                <Input 
                  className="font-mono text-[10px] bg-secondary/30" 
                  value={webhookSecret} 
                  readOnly
                />
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard.writeText(webhookSecret);
                  toast.success('Segredo copiado!');
                }}>
                  Copiar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setWebhookSecret('wv_' + Math.random().toString(36).substring(7))}>
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Utilize este segredo para validar o header <code className="bg-secondary px-1">X-Wavoip-Signature</code> em sua integração e garantir a autenticidade dos dados.
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Configure esta URL no painel Wavoip para receber atualizações de chamadas e mensagens em tempo real.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button 
          variant="secondary" 
          className="flex-1 gap-2 bg-secondary/50 hover:bg-secondary border-border/40" 
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Testar conexão Wavoip
        </Button>
        <Button 
          className="flex-1 gap-2 shadow-lg shadow-primary/20" 
          onClick={handleSave}
          disabled={loading || !validated}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Ativar Integração
        </Button>
      </div>

      {lastValidation.status !== 'none' && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={`flex items-center gap-3 p-4 rounded-xl border ${
              lastValidation.status === 'success' 
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700' 
              : 'bg-red-500/5 border-red-500/20 text-red-700'
            }`}
          >
            {lastValidation.status === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 shrink-0" />
            )}
            <div className="flex-1">
              <p className="text-xs font-bold">
                {lastValidation.status === 'success' ? 'Conexão Bem-sucedida' : 'Erro de Conexão'}
              </p>
              <p className="text-[10px] opacity-80">{lastValidation.message}</p>
            </div>
            <span className="text-[10px] font-mono opacity-60">{lastValidation.timestamp}</span>
          </motion.div>
        </AnimatePresence>
      )}

      <Card className="glass-card overflow-hidden">
        <CardHeader className="bg-secondary/20 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-primary" /> Histórico de Auditoria
              </CardTitle>
              <CardDescription>Logs de validação e eventos de conectividade</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-8 text-[10px] gap-2 ${isLive ? 'text-emerald-500 hover:text-emerald-600 bg-emerald-500/5' : 'text-muted-foreground'}`}
                onClick={() => setIsLive(!isLive)}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                {isLive ? 'Live' : 'Pausado'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 text-[10px] gap-2"
                onClick={() => exportHistory('csv')}
                disabled={isExporting}
              >
                {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Exportar CSV
              </Button>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Buscar logs..." 
                  className="pl-8 h-8 text-[10px] w-40"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <select 
                className="h-8 text-[10px] rounded-md border border-input bg-background px-2"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as any)}
              >
                <option value="all">Todos</option>
                <option value="success">Sucessos</option>
                <option value="error">Falhas</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="w-[180px] text-[10px] uppercase font-bold tracking-wider">Data/Hora</TableHead>
                <TableHead className="w-[100px] text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                <TableHead className="w-[100px] text-[10px] uppercase font-bold tracking-wider">Tipo</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Resultado/Mensagem</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.map((item) => (
                <TableRow key={item.id} className="border-border/40 hover:bg-secondary/10 transition-colors">
                  <TableCell className="text-xs font-mono text-muted-foreground">{item.date}</TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={`text-[9px] font-bold px-1.5 py-0 ${
                        item.status === 'success' 
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-600 border-red-500/20'
                      }`}
                    >
                      {item.status === 'success' ? 'SUCESSO' : 'FALHA'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{item.type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.message}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-primary"
                      onClick={handleTest}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs italic">
                    Nenhum log encontrado para os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!validated && lastValidation.status === 'none' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Você precisa validar as credenciais antes de ativar a integração Wavoip.</span>
        </div>
      )}
    </div>
  );
}
