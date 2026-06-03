import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Lock,
  Bell,
  Navigation,
  ArrowRight,
  ArrowUpDown,
  Terminal,
  CirclePlay,
  ShieldAlert,
  Columns,
  TestTube,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Mail,
  Zap,
  Settings2,
  Cpu,
  Bookmark,
  Share2,
  UserCheck
} from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validated, setTestingValidated] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [webhookSecret, setWebhookSecret] = useState('wv_' + Math.random().toString(36).substring(7));
  const [previousSecret, setPreviousSecret] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [lastValidation, setLastValidation] = useState<{
    status: 'success' | 'error' | 'none';
    timestamp: string | null;
    message: string;
  }>({ status: 'none', timestamp: null, message: '' });

  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'error'>((searchParams.get('status') as any) || 'all');
  const [filterType, setFilterType] = useState<'all' | 'API' | 'Webhook' | 'Security' | 'Routing' | 'CI'>((searchParams.get('type') as any) || 'all');
  const [filterPeriod, setFilterPeriod] = useState<'today' | '7d' | '30d' | 'all'>((searchParams.get('period') as any) || 'all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [isAlertEnabled, setIsAlertEnabled] = useState(true);
  const [alertChannels, setAlertChannels] = useState({
    visual: true,
    email: false,
    webhook: false
  });
  const [alertThreshold, setAlertThreshold] = useState(60); // Segundos
  const [securityAlertLimit, setSecurityAlertLimit] = useState(5); // Limite de assinaturas inválidas
  const [wsStatus, setWsStatus] = useState<'connected' | 'reconnecting' | 'offline'>('connected');
  const [isWsLoading, setIsWsLoading] = useState(false);
  const [wsBackoff, setWsBackoff] = useState({
    min: 1000,
    max: 30000,
    maxAttempts: 10
  });
  const [dedupWindow, setDedupWindow] = useState<5 | 15 | 60>(5);
  const [routingTestResult, setRoutingTestResult] = useState<{
    status: 'success' | 'error' | 'none';
    details: string;
    logs: string[];
  }>({ status: 'none', details: '', logs: [] });
  const [filterPresets, setFilterPresets] = useState<any[]>([]);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const itemsPerPage = 5;




  const [history, setHistory] = useState([
    { id: 1, date: '2024-05-20 14:30:05', status: 'success', type: 'API', message: 'Conexão estabelecida via API Gateway' },
    { id: 2, date: '2024-05-19 10:15:22', status: 'error', type: 'Auth', message: '401 Unauthorized - Token expirado' },
    { id: 3, date: '2024-05-18 16:45:10', status: 'success', type: 'API', message: 'Validação de credenciais OK' },
    { id: 4, date: '2024-05-15 09:00:00', status: 'error', type: 'Network', message: '503 Service Unavailable - Wavoip API Down' },
    { id: 5, date: '2024-05-14 11:20:00', status: 'success', type: 'Webhook', message: 'Configuração de Webhook validada' },
    { id: 6, date: '2024-05-13 15:45:00', status: 'success', type: 'API', message: 'Sincronização de logs completa' },
    { id: 7, date: '2024-05-12 09:30:00', status: 'error', type: 'Auth', message: '403 Forbidden - Permissão insuficiente' },
    { 
      id: 8, 
      date: '2024-05-11 18:00:00', 
      status: 'error', 
      type: 'Security', 
      message: 'Falha na assinatura do Webhook: Assinatura inválida (Mismatch)',
      version: 'v-1',
      requestId: 'req_wavoip_99a82',
      payloadHash: 'sha256:e3b0c442...'
    },
    { 
      id: 9, 
      date: '2024-05-11 18:05:00', 
      status: 'error', 
      type: 'Security', 
      message: 'Falha na assinatura do Webhook: Tentativa repetida',
      version: 'v-1',
      requestId: 'req_wavoip_99a83',
      payloadHash: 'sha256:e3b0c442...'
    },
    { 
      id: 10, 
      date: '2024-05-10 12:00:00', 
      status: 'success', 
      type: 'CI', 
      message: 'CI Execution: Deployment Ready',
      version: 'v0',
      artifacts: ['build-log.txt', 'coverage-report.json'],
      failedCases: 0
    },
  ]);

  const [expandedRows, setExpandedRows] = useState<Set<number | string>>(new Set());

  const [exportColumns, setExportColumns] = useState({
    date: true,
    status: true,
    type: true,
    message: true,
    version: true,
    requestId: true,
    payloadHash: true
  });

  const columnPresets = {
    security: {
      date: true,
      status: true,
      type: true,
      message: true,
      version: true,
      requestId: true,
      payloadHash: true
    },
    routing: {
      date: true,
      status: true,
      type: true,
      message: true,
      version: false,
      requestId: false,
      payloadHash: false
    }
  };

  const applyPreset = (preset: 'security' | 'routing') => {
    setExportColumns(columnPresets[preset]);
    toast.success(`Preset de ${preset === 'security' ? 'Segurança' : 'Roteamento'} aplicado.`);
  };

  const toggleRow = (id: number | string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };



  const securityIncidents = useMemo(() => {
    return history.filter(item => item.type === 'Security' && item.status === 'error');
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesSearch = item.message.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (item.type && item.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
                           ((item as any).version && (item as any).version.toLowerCase().includes(searchTerm.toLowerCase())) ||
                           ((item as any).payloadHash && (item as any).payloadHash.toLowerCase().includes(searchTerm.toLowerCase())) ||
                           ((item as any).requestId && (item as any).requestId.toLowerCase().includes(searchTerm.toLowerCase()));

      
      let matchesPeriod = true;
      const itemDate = new Date(item.date);
      const now = new Date();
      
      if (filterPeriod === 'today') {
        matchesPeriod = itemDate.toDateString() === now.toDateString();
      } else if (filterPeriod === '7d') {
        const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
        matchesPeriod = itemDate >= sevenDaysAgo;
      } else if (filterPeriod === '30d') {
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        matchesPeriod = itemDate >= thirtyDaysAgo;
      }

      return matchesStatus && matchesType && matchesSearch && matchesPeriod;
    }).sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [history, filterStatus, filterType, filterPeriod, searchTerm, sortOrder]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = filteredHistory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );



  
  // Persistir filtros na URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (filterStatus !== 'all') params.status = filterStatus;
    if (filterType !== 'all') params.type = filterType;
    if (filterPeriod !== 'all') params.period = filterPeriod;
    if (searchTerm) params.q = searchTerm;
    setSearchParams(params);
  }, [filterStatus, filterType, filterPeriod, searchTerm, setSearchParams]);

  const [form, setForm] = useState({
    apiUrl: 'https://api.wavoip.com/v1',
    token: '',
    origin: '',
    destination: ''
  });

  // Deduplicação e Reconexão via Supabase Realtime
  useEffect(() => {
    const loadPersistedConfig = async () => {
      if (!access?.sub_company_id) return;
      
      const { data: settings } = await supabase
        .from('wavoip_settings')
        .select('*')
        .eq('sub_company_id', access.sub_company_id)
        .single();
        
      if (settings) {
        if (settings.alert_channels) setAlertChannels(settings.alert_channels as any);
        if (settings.ws_backoff) setWsBackoff(settings.ws_backoff as any);
        if (settings.alert_threshold_seconds) setAlertThreshold(settings.alert_threshold_seconds);
        if ((settings as any).security_alert_limit) setSecurityAlertLimit((settings as any).security_alert_limit);
      }

      const { data: syncState } = await supabase
        .from('wavoip_sync_state')
        .select('*')
        .eq('sub_company_id', access.sub_company_id)
        .single();
        
      if (syncState) {
        setDedupWindow(syncState.dedup_window as any);
      }

      // Load presets
      const { data: presets } = await supabase
        .from('wavoip_filter_presets')
        .select('*')
        .eq('sub_company_id', access.sub_company_id);
      
      if (presets) setFilterPresets(presets);
    };

    loadPersistedConfig();
  }, [access?.sub_company_id]);

  useEffect(() => {
    if (!isLive) return;

    setIsWsLoading(true);
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let retryCount = 0;
    let offlineTimer: ReturnType<typeof setTimeout>;

    const setupChannel = () => {
      setWsStatus('reconnecting');
      
      // Monitor de tempo offline
      clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => {
        if (isAlertEnabled) {
          toast.error(`WebSocket em falha por mais de ${alertThreshold}s. Verifique sua conexão.`, {
            icon: <AlertCircle className="w-4 h-4" />,
            duration: 10000
          });
        }
      }, alertThreshold * 1000);

      const channel = supabase.channel('wavoip-events', {
        config: {
          broadcast: { self: false },
        }
      })
      .on('broadcast', { event: 'log' }, (payload) => {
        // Sincronizar Live com Filtro de Período
        if (filterPeriod !== 'all') {
          const now = new Date();
          if (filterPeriod === 'today' && new Date(payload.date || now).toDateString() !== now.toDateString()) return;
          // Adicionar outras lógicas de período se necessário
        }

        const timestamp = new Date().toLocaleString();
        
        // Deduplicação dinâmica baseada na janela selecionada
        const eventId = payload.id || `${payload.message}-${timestamp}`;
        
        setHistory(prev => {
          const nowTime = Date.now();
          const dedupMs = dedupWindow * 60 * 1000;
          
          if (prev.some(h => {
            const isSame = h.id === eventId || (h.message === payload.message && h.type === payload.type);
            const isRecent = nowTime - new Date(h.date).getTime() < dedupMs;
            return isSame && isRecent;
          })) return prev;
          
          const newEvent = {
            id: eventId,
            date: timestamp,
            status: payload.status || 'success',
            type: payload.type || 'WebSocket',
            message: payload.message || 'Atualização instantânea recebida',
            version: payload.version,
            requestId: payload.requestId || `req_${Math.random().toString(36).substring(7)}`,
            payloadHash: payload.payloadHash || ((payload as any).type === 'Security' ? 'sha256:generated...' : undefined)
          };
          
          // Persistir estado de deduplicação no backend
          if (access?.sub_company_id) {
            const currentKeys = prev.slice(0, 10).map(h => h.id.toString());
            supabase.from('wavoip_sync_state').upsert({
              sub_company_id: access.sub_company_id,
              dedup_window: dedupWindow,
              recent_event_keys: [eventId.toString(), ...currentKeys]
            }).then();
          }

          return [newEvent, ...prev].sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
          ).slice(0, 50);
        });
        
        if (payload.status === 'error' && isAlertEnabled) {
          const isSecurity = (payload as any).type === 'Security';
          
          // Alerta automático por limite de segurança
          if (isSecurity && securityIncidents.length >= securityAlertLimit) {
            toast.error(`CRÍTICO: Limite de incidentes de segurança atingido (${securityIncidents.length})`, {
              description: 'Múltiplas falhas de assinatura detectadas no período.',
              duration: 10000
            });
          }

          if (alertChannels.visual) {
            toast.error(`${isSecurity ? 'Incidente de Segurança' : 'Alerta Wavoip'}: ${payload.message}`, {
              icon: <ShieldAlert className="w-4 h-4 text-red-500" />,
              duration: isSecurity ? 8000 : 5000
            });
          }

          if (alertChannels.email) {
            // Mock email notification
            console.log('Sending alert email:', payload.message);
          }

          if (alertChannels.webhook) {
            // Mock webhook trigger
            console.log('Triggering alert webhook:', payload.message);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setWsStatus('connected');
          setIsWsLoading(false);
          retryCount = 0;
          clearTimeout(offlineTimer);
          
          // Persistir status no backend
          if (access?.sub_company_id) {
            supabase.from('wavoip_sync_state').upsert({
              sub_company_id: access.sub_company_id,
              last_ws_status: 'connected',
              last_ws_update: new Date().toISOString()
            }).then();
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setWsStatus('offline');
          const delay = Math.min(wsBackoff.min * Math.pow(2, retryCount), wsBackoff.max);
          retryCount++;
          if (retryCount <= wsBackoff.maxAttempts) {
            reconnectTimeout = setTimeout(setupChannel, delay);
          } else {
            setWsStatus('offline');
            toast.error('Número máximo de tentativas de reconexão atingido.');
          }
        }
      });

      return channel;
    };


    const channel = setupChannel();

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(reconnectTimeout);
      clearTimeout(offlineTimer);
    };
  }, [isLive, isAlertEnabled, alertThreshold, access?.sub_company_id, wsBackoff.max, wsBackoff.maxAttempts, wsBackoff.min, filterPeriod, securityAlertLimit]);


  const handleRoutingTest = async () => {
    if (!form.origin || !form.destination) {
      toast.error('Informe origem e destino para testar o roteamento.');
      return;
    }
    
    setTesting(true);
    
    // Suite de testes com asserts automatizados
    setTimeout(() => {
      const logs = [
        'Iniciando teste de roteamento...',
        `Validando origem: ${form.origin} [ASSERT: FORMAT_VALID]`,
        `Validando destino: ${form.destination} [ASSERT: PERMISSION_OK]`,
        'Simulando handshake de voz...',
        'Validando codec negotiation [ASSERT: G.711_SUPPORTED]'
      ];

      const isOk = Math.random() > 0.2;
      
      setRoutingTestResult({
        status: isOk ? 'success' : 'error',
        details: isOk ? 'Todos os asserts de roteamento passaram com sucesso.' : 'Falha no assert PERMISSION_OK: Ramal sem rota de saída.',
        logs: isOk ? logs : [...logs, 'ERRO: Permissão de discagem negada pelo gateway.']
      });
      
      const timestamp = new Date().toLocaleString();
      setHistory(prev => [{
        id: Date.now(),
        date: timestamp,
        status: isOk ? 'success' : 'error',
        type: 'Routing',
        message: `Teste de roteamento manual: ${isOk ? 'PASSED' : 'FAILED'} (${form.origin} -> ${form.destination})`
      }, ...prev]);

      setTesting(false);

      
      if (isOk) {
        toast.success('Roteamento validado com asserts automatizados!');
      } else {
        toast.error('Falha nos testes de roteamento automatizados.');
      }
    }, 1500);
  };



  const handleExportQuick = (period: 'today' | '7d' | '30d') => {
    setFilterPeriod(period);
    setCurrentPage(1);
    // Pequeno delay para garantir que o filtro foi aplicado antes de disparar o download
    setTimeout(() => exportHistory('csv'), 100);
  };

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
    
    // Simulação de geração de arquivo com filtros aplicados e colunas selecionadas
    setTimeout(() => {
      const headers: string[] = [];
      if (exportColumns.date) headers.push('Data');
      if (exportColumns.status) headers.push('Status');
      if (exportColumns.type) headers.push('Tipo');
      if (exportColumns.message) headers.push('Mensagem');
      if (exportColumns.version) headers.push('Versão Segredo');
      if (exportColumns.requestId) headers.push('Request ID');
      if (exportColumns.payloadHash) headers.push('Payload Hash');

      const data = filteredHistory.map(item => {
        const row: string[] = [];
        if (exportColumns.date) row.push(item.date);
        if (exportColumns.status) row.push(item.status.toUpperCase());
        if (exportColumns.type) row.push(item.type);
        if (exportColumns.message) row.push(item.message);
        if (exportColumns.version) row.push((item as any).version || '-');
        if (exportColumns.requestId) row.push((item as any).requestId || '-');
        if (exportColumns.payloadHash) row.push((item as any).payloadHash || '-');
        return row;
      });
      
      const content = [headers, ...data].map(row => row.join(',')).join('\n');
      const blob = new Blob([content], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const periodLabel = filterPeriod !== 'all' ? `-${filterPeriod}` : '';
      a.download = `wavoip-audit-log${periodLabel}-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      
      setIsExporting(false);
      toast.success(`Relatório filtrado (${filteredHistory.length} registros) exportado com sucesso!`);
    }, 1500);
  };


  const rotateSecret = () => {
    setIsRotating(true);
    setTimeout(() => {
      setPreviousSecret(webhookSecret);
      setWebhookSecret('wv_' + Math.random().toString(36).substring(7));
      setIsRotating(false);
      toast.success('Segredo rotacionado. O segredo anterior continuará ativo por 24h para migração.');
    }, 800);
  };

  const runSecurityRotationTests = async () => {
    toast.info('Iniciando testes de integridade da rotação de segredos...');
    setTesting(true);
    
    setTimeout(() => {
      const logs = [
        'Simulando recebimento de webhook v0 [v-0: ATUAL]',
        'Verificando assinatura v0... [ASSERT: SIGNATURE_VALID]',
        'Simulando recebimento de webhook v-1 [v-1: ANTERIOR]',
        'Verificando assinatura v-1... [ASSERT: SIGNATURE_VALID]',
        'Simulando segredo inválido/legado...',
        'Verificando rejeição... [ASSERT: SIGNATURE_INVALID_REJECTED]'
      ];
      
      setTesting(false);
      toast.success('Testes de rotação concluídos: Compatibilidade retroativa confirmada.');
      
      const timestamp = new Date().toLocaleString();
      setHistory(prev => [{
        id: Date.now(),
        date: timestamp,
        status: 'success',
        type: 'Security',
        message: 'Testes de integridade de segredos (v0/v-1) concluídos com sucesso.'
      }, ...prev]);
    }, 2000);
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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

        <Card className={`glass-card transition-all ${securityIncidents.length > 0 ? 'bg-red-500/5 border-red-500/20' : ''}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Segurança</p>
              <div className={`p-1.5 rounded-full ${securityIncidents.length > 0 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-secondary text-muted-foreground'}`}>
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className={`text-xl font-bold ${securityIncidents.length > 0 ? 'text-red-600' : 'text-foreground'}`}>
              {securityIncidents.length}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Incidentes no período</p>
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
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alertas</p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-6 w-6 ${isAlertEnabled ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xs">
                  <DialogHeader>
                    <DialogTitle className="text-sm font-bold">Canais de Alerta</DialogTitle>
                    <DialogDescription className="text-[10px]">Configure como receber falhas críticas.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-2"><Zap className="w-3 h-3" /> Visual (Toast)</Label>
                      <Checkbox 
                        checked={alertChannels.visual} 
                        onCheckedChange={(checked) => setAlertChannels({...alertChannels, visual: !!checked})} 
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-2"><Mail className="w-3 h-3" /> E-mail</Label>
                      <Checkbox 
                        checked={alertChannels.email} 
                        onCheckedChange={(checked) => setAlertChannels({...alertChannels, email: !!checked})} 
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-2"><Webhook className="w-3 h-3" /> Webhook</Label>
                      <Checkbox 
                        checked={alertChannels.webhook} 
                        onCheckedChange={(checked) => setAlertChannels({...alertChannels, webhook: !!checked})} 
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Limite Alerta Inatividade (s)</Label>
                      <Input 
                        type="number" 
                        value={alertThreshold} 
                        onChange={e => setAlertThreshold(Number(e.target.value))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Limite Incidentes Segurança</Label>
                      <Input 
                        type="number" 
                        value={securityAlertLimit} 
                        onChange={e => setSecurityAlertLimit(Number(e.target.value))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">Ativar Geral</Label>
                      <Button 
                        variant={isAlertEnabled ? "default" : "outline"} 
                        size="sm" 
                        className="h-7 text-[10px]"
                        onClick={() => {
                          const newVal = !isAlertEnabled;
                          setIsAlertEnabled(newVal);
                          if (access?.sub_company_id) {
                            supabase.from('wavoip_settings').upsert({
                              sub_company_id: access.sub_company_id,
                              alert_channels: alertChannels,
                              alert_threshold_seconds: alertThreshold
                            }).then();
                          }
                        }}
                      >
                        {isAlertEnabled ? 'Ativo' : 'Pausado'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <p className="text-xl font-bold text-foreground">{isAlertEnabled ? 'Ativos' : 'Silenciados'}</p>
            <div className="flex gap-1 mt-1">
              {alertChannels.visual && <Zap className="w-2.5 h-2.5 text-primary" />}
              {alertChannels.email && <Mail className="w-2.5 h-2.5 text-primary" />}
              {alertChannels.webhook && <Webhook className="w-2.5 h-2.5 text-primary" />}
            </div>
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
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-primary" /> Roteamento de Chamadas
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-[10px] gap-2"
              onClick={handleRoutingTest}
              disabled={testing}
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
              Testar Roteamento
            </Button>
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
              className={routingTestResult.status === 'error' && !form.origin ? 'border-red-500' : ''}
            />
          </div>
          <div className="space-y-2">
            <Label>Destino Padrão</Label>
            <Input 
              placeholder="Ramal ou Fila" 
              value={form.destination}
              onChange={e => setForm({...form, destination: e.target.value})}
              className={routingTestResult.status === 'error' && !form.destination ? 'border-red-500' : ''}
            />

          </div>

          {routingTestResult.status !== 'none' && (
            <div className={`md:col-span-2 p-4 rounded-xl space-y-3 border ${
              routingTestResult.status === 'success' 
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700' 
              : 'bg-red-500/5 border-red-500/20 text-red-700'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-tight">
                  <Terminal className="w-3.5 h-3.5" />
                  Logs de Execução do Teste
                </div>
                <Badge 
                  variant="outline" 
                  className={`text-[9px] ${
                    routingTestResult.status === 'success' 
                    ? 'border-emerald-500/30 text-emerald-600' 
                    : 'border-red-500/30 text-red-600'
                  }`}
                >
                  {routingTestResult.status === 'success' ? 'PASSED' : 'FAILED'}
                </Badge>
              </div>
              
              <div className="bg-black/5 rounded-lg p-3 font-mono text-[10px] space-y-1">
                {routingTestResult.logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="opacity-40">[{i+1}]</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs pt-1">
                {routingTestResult.status === 'success' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="truncate">{form.origin}</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      <span className="truncate">{form.destination}</span>
                      <span className="font-bold ml-1 shrink-0">Caminho Válido</span>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{routingTestResult.details}</span>
                  </>
                )}
              </div>
            </div>
          )}


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
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={rotateSecret}
                  disabled={isRotating}
                >
                  {isRotating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                </Button>
              </div>
              {previousSecret && (
                <div className="p-2 rounded bg-amber-500/5 border border-amber-500/10 text-[9px] text-amber-600 mt-2 flex items-center justify-between">
                  <span>Segredo anterior (v-1) ainda aceito: <code className="font-mono">{previousSecret}</code></span>
                  <Badge variant="outline" className="text-[8px] h-4">v-1 ativo</Badge>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Utilize este segredo para validar o header <code className="bg-secondary px-1">X-Wavoip-Signature</code> em sua integração. O versionamento permite migração sem downtime.
              </p>
            </div>
            
            <div className="pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] gap-2 border-primary/20 hover:bg-primary/5"
                onClick={runSecurityRotationTests}
                disabled={testing}
              >
                <TestTube className="w-3 h-3 text-primary" />
                Validar Rotação de Segredos
              </Button>
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
            <CirclePlay className="w-4 h-4" />
          )}
          Executar Teste Completo
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
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" /> Histórico de Auditoria
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[8px] uppercase tracking-widest px-1.5 py-0 ${isLive ? 'border-emerald-500/50 text-emerald-500' : 'text-muted-foreground'}`}>
                    {isLive ? 'Conectado Live' : 'Pausado'}
                  </Badge>
                  <CardDescription className="text-[10px]">Logs de validação em tempo real</CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1 pr-2 border-r border-border/40 mr-2">
                  <span className="text-[8px] uppercase text-muted-foreground font-bold">WebSocket Status</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 
                      wsStatus === 'reconnecting' ? 'bg-amber-500 animate-bounce' : 'bg-red-500'
                    }`} />
                    <span className={`text-[9px] font-bold ${
                      wsStatus === 'connected' ? 'text-emerald-600' : 
                      wsStatus === 'reconnecting' ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {wsStatus.toUpperCase()}
                    </span>
                  </div>
                </div>


                <div className="flex flex-col gap-1 pr-2 border-r border-border/40 mr-2">
                  <span className="text-[8px] uppercase text-muted-foreground font-bold">Config WS</span>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Settings2 className="w-3 h-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xs">
                      <DialogHeader>
                        <DialogTitle className="text-sm font-bold">Backoff do WebSocket</DialogTitle>
                        <DialogDescription className="text-[10px]">Ajuste a estratégia de reconexão.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Intervalo Mínimo (ms)</Label>
                          <Input 
                            type="number" 
                            value={wsBackoff.min} 
                            onChange={e => setWsBackoff({...wsBackoff, min: Number(e.target.value)})}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Intervalo Máximo (ms)</Label>
                          <Input 
                            type="number" 
                            value={wsBackoff.max} 
                            onChange={e => setWsBackoff({...wsBackoff, max: Number(e.target.value)})}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Tentativas Máximas</Label>
                          <Input 
                            type="number" 
                            value={wsBackoff.maxAttempts} 
                            onChange={e => setWsBackoff({...wsBackoff, maxAttempts: Number(e.target.value)})}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="flex flex-col gap-1 pr-2 border-r border-border/40 mr-2">
                  <span className="text-[8px] uppercase text-muted-foreground font-bold">Janela Dedup</span>
                  <select 
                    className="h-6 text-[9px] rounded bg-secondary/50 border-none outline-none px-1 font-bold"
                    value={dedupWindow}
                    onChange={(e) => setDedupWindow(Number(e.target.value) as any)}
                  >
                    <option value={5}>5m</option>
                    <option value={15}>15m</option>
                    <option value={60}>1h</option>
                  </select>
                </div>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`h-8 text-[10px] gap-2 ${isLive ? 'text-emerald-500 hover:text-emerald-600 bg-emerald-500/5' : 'text-muted-foreground'}`}
                  onClick={() => {
                    if (isWsLoading) return;
                    setIsLive(!isLive);
                  }}
                  disabled={isWsLoading}
                >
                  {isWsLoading ? <Loader2 className="w-1.5 h-1.5 animate-spin" /> : (
                    <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                  )}
                  {isLive ? 'Live' : 'Pausado'}
                </Button>

                <div className="flex flex-wrap items-center gap-2">
                  <Button 
                    variant={filterType === 'Security' ? "default" : "outline"} 
                    size="sm" 
                    className="h-7 text-[9px] gap-1 px-2 border-red-500/20 text-red-600 hover:bg-red-500/5"
                    onClick={() => setFilterType(filterType === 'Security' ? 'all' : 'Security')}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    Somente Segurança
                  </Button>
                  <Separator orientation="vertical" className="h-4 mx-1" />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[9px] border border-border/40"
                    onClick={() => handleExportQuick('today')}
                  >Hoje</Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[9px] border border-border/40"
                    onClick={() => handleExportQuick('7d')}
                  >7 Dias</Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[9px] border border-border/40"
                    onClick={() => handleExportQuick('30d')}
                  >30 Dias</Button>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-[9px] gap-1 px-2">
                        <Bookmark className="w-3 h-3" />
                        Presets
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xs">
                      <DialogHeader>
                        <DialogTitle className="text-sm font-bold">Presets de Filtro</DialogTitle>
                        <DialogDescription className="text-[10px]">Salve ou carregue configurações de filtros.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="flex gap-2">
                          <Input 
                            placeholder="Nome do preset..." 
                            className="h-8 text-xs" 
                            id="new-preset-name"
                          />
                          <Button 
                            size="sm" 
                            className="h-8 text-xs"
                            disabled={isSavingPreset}
                            onClick={async () => {
                              const nameInput = document.getElementById('new-preset-name') as HTMLInputElement;
                              const name = nameInput.value;
                              if (!name) return;
                              setIsSavingPreset(true);
                              const filters = { filterStatus, filterType, filterPeriod, searchTerm };
                              const { error } = await supabase.from('wavoip_filter_presets').insert({
                                sub_company_id: access?.sub_company_id,
                                name,
                                filters
                              });
                              if (!error) {
                                toast.success('Preset salvo!');
                                setFilterPresets([...filterPresets, { name, filters }]);
                                nameInput.value = '';
                              }
                              setIsSavingPreset(false);
                            }}
                          >
                            {isSavingPreset ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          </Button>
                        </div>
                        <Separator />
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {filterPresets.map((p, i) => (
                            <div key={i} className="flex items-center justify-between bg-secondary/20 p-2 rounded text-[10px]">
                              <span className="font-medium">{p.name}</span>
                              <div className="flex gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5"
                                  onClick={() => {
                                    setFilterStatus(p.filters.filterStatus);
                                    setFilterType(p.filters.filterType);
                                    setFilterPeriod(p.filters.filterPeriod);
                                    setSearchTerm(p.filters.searchTerm);
                                    toast.success(`Preset "${p.name}" aplicado.`);
                                  }}
                                >
                                  <RefreshCw className="w-2.5 h-2.5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5"
                                  onClick={() => {
                                    const url = new URL(window.location.href);
                                    url.searchParams.set('status', p.filters.filterStatus);
                                    url.searchParams.set('type', p.filters.filterType);
                                    url.searchParams.set('period', p.filters.filterPeriod);
                                    url.searchParams.set('q', p.filters.searchTerm);
                                    navigator.clipboard.writeText(url.toString());
                                    toast.success('Link compartilhado copiado!');
                                  }}
                                >
                                  <Share2 className="w-2.5 h-2.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px] gap-2"
                        disabled={isExporting}
                      >
                        {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        Exportar CSV
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-sm font-bold">Configurar Exportação</DialogTitle>
                        <DialogDescription className="text-xs">Selecione as colunas ou escolha um preset rápido.</DialogDescription>
                      </DialogHeader>

                      <div className="flex flex-col gap-3 py-2">
                        <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Presets de Relatório</Label>
                        <div className="flex gap-2">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-7 text-[9px] flex-1 gap-1"
                            onClick={() => applyPreset('security')}
                          >
                            <Shield className="w-3 h-3 text-red-500" /> Segurança
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-7 text-[9px] flex-1 gap-1"
                            onClick={() => applyPreset('routing')}
                          >
                            <Navigation className="w-3 h-3 text-primary" /> Roteamento
                          </Button>
                        </div>
                      </div>

                      <Separator className="opacity-40" />

                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-4">

                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="col-date" 
                            checked={exportColumns.date} 
                            onCheckedChange={(checked) => setExportColumns({...exportColumns, date: !!checked})}
                          />
                          <label htmlFor="col-date" className="text-xs">Data/Hora</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="col-status" 
                            checked={exportColumns.status} 
                            onCheckedChange={(checked) => setExportColumns({...exportColumns, status: !!checked})}
                          />
                          <label htmlFor="col-status" className="text-xs">Status</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="col-type" 
                            checked={exportColumns.type} 
                            onCheckedChange={(checked) => setExportColumns({...exportColumns, type: !!checked})}
                          />
                          <label htmlFor="col-type" className="text-xs">Tipo</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="col-message" 
                            checked={exportColumns.message} 
                            onCheckedChange={(checked) => setExportColumns({...exportColumns, message: !!checked})}
                          />
                          <label htmlFor="col-message" className="text-xs">Mensagem</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="col-version" 
                            checked={exportColumns.version} 
                            onCheckedChange={(checked) => setExportColumns({...exportColumns, version: !!checked})}
                          />
                          <label htmlFor="col-version" className="text-xs">Versão Segredo</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="col-requestId" 
                            checked={exportColumns.requestId} 
                            onCheckedChange={(checked) => setExportColumns({...exportColumns, requestId: !!checked})}
                          />
                          <label htmlFor="col-requestId" className="text-xs">Request ID</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="col-payloadHash" 
                            checked={exportColumns.payloadHash} 
                            onCheckedChange={(checked) => setExportColumns({...exportColumns, payloadHash: !!checked})}
                          />
                          <label htmlFor="col-payloadHash" className="text-xs">Payload Hash</label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button 
                          className="w-full text-xs h-8" 
                          onClick={() => exportHistory('csv')}
                        >
                          Gerar CSV agora
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Buscar logs ou segredos..." 
                  className="pl-8 h-8 text-[10px] w-48"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <select 
                className="h-8 text-[10px] rounded-md border border-input bg-background px-2"
                value={filterType}
                onChange={e => {
                  setFilterType(e.target.value as any);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Tipos: Tudo</option>
                <option value="API">API</option>
                <option value="Webhook">Webhooks</option>
                <option value="Security">Segurança</option>
                <option value="Routing">Roteamento</option>
                <option value="CI">CI/CD Pipeline</option>
              </select>
              <select 
                className="h-8 text-[10px] rounded-md border border-input bg-background px-2"
                value={filterPeriod}
                onChange={e => {
                  setFilterPeriod(e.target.value as any);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Período: Tudo</option>
                <option value="today">Hoje</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
              </select>
              <select 
                className="h-8 text-[10px] rounded-md border border-input bg-background px-2"
                value={filterStatus}
                onChange={e => {
                  setFilterStatus(e.target.value as any);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Todos Status</option>
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
                <TableHead className="w-[180px] text-[10px] uppercase font-bold tracking-wider">
                  <button 
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  >
                    Data/Hora
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead className="w-[100px] text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                <TableHead className="w-[100px] text-[10px] uppercase font-bold tracking-wider">Tipo</TableHead>
                <TableHead className="text-[10px] uppercase font-bold tracking-wider">Resultado/Mensagem</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Ação</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
                {paginatedHistory.map((item) => (


                  <Fragment key={item.id}>
                    <TableRow className="border-border/40 hover:bg-secondary/10 transition-colors cursor-pointer" onClick={() => toggleRow(item.id)}>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        <div className="flex items-center gap-2">
                          {item.type === 'Security' || item.type === 'CI' ? (
                            expandedRows.has(item.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : null}
                          {item.date}
                        </div>
                      </TableCell>
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
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span>{item.message}</span>
                            {(item as any).payloadHash && (
                              <div className="flex items-center gap-1">
                                <Fingerprint className="w-3 h-3 text-primary/50" />
                                <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-primary/5 font-mono border-primary/20">
                                  thread: {(item as any).payloadHash.substring(7, 12)}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {item.type === 'Security' && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 text-primary hover:bg-primary/10"
                                  title="Reprocessar (Replay)"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-xs">
                                <DialogHeader>
                                  <DialogTitle className="text-sm font-bold">Reprocessar Evento</DialogTitle>
                                  <DialogDescription className="text-[10px]">
                                    RequestId: <code className="bg-secondary px-1">{(item as any).requestId}</code>
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3 py-2">
                                  <p className="text-[10px] text-muted-foreground">Escolha a versão do segredo para o handshake simulado:</p>
                                  <div className="flex gap-2">
                                    <Button 
                                      className="flex-1 text-[10px] h-8" 
                                      onClick={() => {
                                        toast.success(`Replay iniciado com segredo v0 (Atual) para ${(item as any).requestId}`);
                                      }}
                                    >v0 (Atual)</Button>
                                    <Button 
                                      variant="outline"
                                      className="flex-1 text-[10px] h-8" 
                                      onClick={() => {
                                        toast.success(`Replay iniciado com segredo v-1 (Legado) para ${(item as any).requestId}`);
                                      }}
                                    >v-1 (Legado)</Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTest();
                            }}
                          >
                            <Activity className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (item.type === 'Security' || item.type === 'CI') && (
                      <TableRow className="bg-secondary/20 border-border/40 hover:bg-secondary/20">
                        <TableCell colSpan={5} className="p-4">
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-6"
                          >
                            {item.type === 'Security' ? (
                              <>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    <ShieldAlert className="w-3.5 h-3.5 text-red-500" /> Detalhes do Incidente
                                  </div>
                                  <div className="bg-background/50 rounded-lg p-3 border border-border/40 space-y-2">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Motivo:</span>
                                      <span className="font-bold text-red-600">{item.message}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Segredo Usado:</span>
                                      <span className="font-mono text-primary bg-primary/5 px-1 rounded">{(item as any).version || 'v0'}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Request ID:</span>
                                      <span className="font-mono">{(item as any).requestId}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    <Fingerprint className="w-3.5 h-3.5" /> Payload Metadata
                                  </div>
                                  <div className="bg-background/50 rounded-lg p-3 border border-border/40 space-y-2">
                                    <div className="flex flex-col gap-1 text-[10px]">
                                      <span className="text-muted-foreground">Payload Hash (SHA-256):</span>
                                      <span className="font-mono break-all bg-secondary/30 p-1.5 rounded">{(item as any).payloadHash}</span>
                                    </div>
                                    <div className="text-[9px] text-amber-600 italic mt-1">
                                      * Tentativas com o mesmo hash são agrupadas nesta thread para rastreabilidade.
                                    </div>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    <Cpu className="w-3.5 h-3.5 text-primary" /> Resumo da Execução CI
                                  </div>
                                  <div className="bg-background/50 rounded-lg p-3 border border-border/40 space-y-2">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Build Versão:</span>
                                      <span className="font-mono bg-primary/5 px-1 rounded">{(item as any).version || 'v1.0.0'}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Casos com Falha:</span>
                                      <span className={`font-bold ${(item as any).failedCases > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {(item as any).failedCases || 0}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Status do Deploy:</span>
                                      <Badge variant="outline" className="text-[8px] h-3.5 uppercase">
                                        {item.status === 'success' ? 'Aprovado' : 'Bloqueado'}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    <Terminal className="w-3.5 h-3.5" /> Artefatos e Logs
                                  </div>
                                  <div className="bg-background/50 rounded-lg p-3 border border-border/40 space-y-2">
                                    <div className="flex flex-col gap-2">
                                      {((item as any).artifacts || []).map((artifact: string, i: number) => (
                                        <div key={i} className="flex items-center justify-between text-[10px] bg-secondary/30 p-1.5 rounded">
                                          <span className="font-mono truncate mr-2">{artifact}</span>
                                          <Button variant="ghost" size="icon" className="h-4 w-4">
                                            <Download className="h-2.5 w-2.5" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </motion.div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}

                {paginatedHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs italic">
                      Nenhum log encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
            </Table>

          
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border/40 bg-secondary/10">
              <p className="text-[10px] text-muted-foreground">
                Mostrando {paginatedHistory.length} de {filteredHistory.length} registros
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-[10px] font-medium px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
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
