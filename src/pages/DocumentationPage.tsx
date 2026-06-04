import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Book, Code, Terminal, Zap, Shield, Globe, 
  MessageSquare, ChevronRight, Hash, Server, Play, 
  Copy, Check, Info, AlertTriangle, Cpu, Activity,
  Webhook, Key, FileJson, CheckCircle2, Brackets, Download,
  RefreshCw, Lock
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MCPConsole from '@/components/settings/MCPConsole';
import { ErrorBoundary } from 'react-error-boundary';
import { useAuth } from '@/contexts/AuthContext';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const { signOut } = useAuth();
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const MAX_RETRIES = 5;
  const is403 = error.message.includes('403') || error.message.includes('permission');
  
  // Registrar erro para depuração
  useEffect(() => {
    const correlationId = crypto.randomUUID();
    console.error(`[DocumentationError] ID: ${correlationId}`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      type: is403 ? '403_FORBIDDEN' : 'NETWORK_OR_STATE_FAILURE',
      retryCount
    });
  }, [error, is403, retryCount]);

  const handleReauth = async () => {
    toast({
      title: "Reautenticando...",
      description: "Redirecionando para o portal de login."
    });
    // Limpar sessão e disparar fluxo SSO
    await signOut();
  };

  const handleRetry = () => {
    if (retryCount >= MAX_RETRIES) {
      toast({
        title: "Limite de tentativas atingido",
        description: "Por favor, recarregue a página manualmente ou verifique sua conexão.",
        variant: "destructive"
      });
      return;
    }

    setIsRetrying(true);
    const nextRetry = retryCount + 1;
    setRetryCount(nextRetry);
    
    // Backoff exponencial: 1s, 2s, 4s, 8s, 16s
    const delay = Math.pow(2, retryCount) * 1000;
    
    console.log(`[DocumentationRetry] Attempt ${nextRetry}/${MAX_RETRIES} in ${delay}ms`);
    
    setTimeout(() => {
      setIsRetrying(false);
      resetErrorBoundary();
    }, delay);
  };

  return (
    <div className="min-h-[600px] flex items-center justify-center p-6 bg-background/50">
      <Card className="max-w-md w-full border-border/40 shadow-2xl rounded-3xl overflow-hidden backdrop-blur-sm bg-card/80">
        <div className={`h-2 ${is403 ? 'bg-amber-500' : 'bg-destructive'}`} />
        <CardHeader className="text-center pt-10 pb-6">
          <div className={`mx-auto w-20 h-20 ${is403 ? 'bg-amber-500/10' : 'bg-destructive/10'} rounded-2xl flex items-center justify-center mb-6 shadow-inner`}>
            {is403 ? (
              <Lock className="w-10 h-10 text-amber-500" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-destructive" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {is403 ? 'Acesso Restrito' : 'Algo deu errado'}
          </CardTitle>
          <CardDescription className="text-sm px-6 mt-2 leading-relaxed">
            {is403 
              ? 'Sua conta não possui permissão para visualizar a documentação técnica avançada ou sua sessão expirou.' 
              : 'Não foi possível carregar a documentação. Isso pode ser um problema temporário de rede ou estado.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pb-10 text-center px-8">
          {!is403 && (
            <div className="p-4 bg-secondary/30 rounded-xl text-[10px] font-mono text-left overflow-auto max-h-32 border border-border/20 text-muted-foreground leading-tight">
              {error.message}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {is403 ? (
              <Button onClick={handleReauth} className="w-full rounded-2xl gap-2 h-12 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <RefreshCw className="w-4 h-4" /> Entrar novamente (SSO)
              </Button>
            ) : (
              <Button 
                onClick={handleRetry} 
                disabled={isRetrying || retryCount >= MAX_RETRIES}
                className="w-full rounded-2xl gap-2 h-12 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {isRetrying ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {isRetrying ? `Tentando... (${retryCount}/${MAX_RETRIES})` : 'Tentar novamente'}
              </Button>
            )}
            
            {is403 ? (
              <Button variant="outline" onClick={() => window.open('mailto:suporte@leadseller.com.br', '_blank')} className="w-full rounded-2xl h-12 font-bold border-border/60 hover:bg-secondary">
                Solicitar Acesso
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => window.location.href = '/'} className="w-full rounded-2xl h-12 font-medium text-muted-foreground">
                Voltar ao Início
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const DOC_SECTIONS = [
  {
    title: "Primeiros Passos",
    icon: Zap,
    items: ["Introdução", "Autenticação", "Ambientes", "SDKs"]
  },
  {
    title: "Recursos da API",
    icon: Code,
    items: ["Agentes de IA", "MCP Server", "Empresas", "Usuários", "Leads", "Tarefas"]
  },
  {
    title: "Canais & Mensageria",
    icon: MessageSquare,
    items: ["WhatsApp API", "Web Chat", "Integrações CRM"]
  },
  {
    title: "Segurança",
    icon: Shield,
    items: ["Permissões", "Rate Limiting", "IP Whitelisting"]
  }
];

export default function DocumentationPage() {
  const { canAccessPage } = useAuth();
  const [isSyncing, setIsSyncing] = useState(true);

  // Validação explícita de role/permissão ao montar o componente
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSyncing(false);
    }, 600); // Pequeno delay para garantir que o AuthContext sincronizou
    return () => clearTimeout(timer);
  }, []);

  if (isSyncing) {
    return (
      <AppLayout title="Documentação Técnica" subtitle="Carregando manuais...">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-4">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full shadow-lg"
          />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Validando credenciais de acesso...</p>
        </div>
      </AppLayout>
    );
  }

  // Se o guard do ProtectedRoute falhar ou quisermos uma camada extra de proteção
  if (!canAccessPage('documentation')) {
    throw new Error('403: Permission denied for documentation');
  }

  return (
    <ErrorBoundary 
      FallbackComponent={ErrorFallback} 
      onReset={() => {
        // Lógica de retry granular agora tratada no ErrorFallback
        console.log('[DocumentationBoundary] Resetting state');
      }}
    >
      <DocumentationContent />
    </ErrorBoundary>
  );
}

function DocumentationContent() {
  const [activeSection, setActiveSection] = useState("MCP Server");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast({ title: "Copiado!", description: "Código copiado para a área de transferência." });
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Download iniciado", description: `O arquivo ${filename} foi gerado com sucesso.` });
  };

  return (
    <AppLayout title="Documentação Técnica" subtitle="Tudo o que você precisa para integrar com nossa plataforma">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar na documentação..." 
            className="pl-10 h-12 bg-card border-secondary focus:ring-primary rounded-xl shadow-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="space-y-6 hidden md:block">
            {DOC_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] px-3">
                  {section.title}
                </h4>
                <nav className="space-y-1">
                  {section.items.map((item) => (
                    <button
                      key={item}
                      onClick={() => setActiveSection(item)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-xl transition-all flex items-center justify-between group ${
                        activeSection === item 
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                        : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {item}
                      <ChevronRight className={`w-4 h-4 transition-transform ${activeSection === item ? 'rotate-90' : 'group-hover:translate-x-1'}`} />
                    </button>
                  ))}
                </nav>
              </div>
            ))}
          </aside>

          {/* Main Content Area */}
          <main className="md:col-span-3 space-y-12 pb-20">
            <AnimatePresence mode="wait">
              {activeSection === "MCP Server" ? (
                <motion.div
                  key="mcp-doc"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-10"
                >
                  {/* Header Section */}
                  <header className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                        <Server className="w-6 h-6" />
                      </div>
                      <div>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-widest bg-primary/5 text-primary border-primary/20 mb-1">Ecosystem</Badge>
                        <h1 className="text-4xl font-extrabold tracking-tight">Model Context Protocol (MCP)</h1>
                      </div>
                    </div>
                    <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
                      O MCP Server permite que você conecte fontes de dados externas, APIs personalizadas e lógica de negócio diretamente ao contexto dos seus agentes de IA.
                    </p>
                  </header>

                  {/* Quick Concept */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-secondary/20 border-none shadow-none">
                      <CardHeader className="p-5">
                        <Cpu className="w-5 h-5 text-primary mb-2" />
                        <CardTitle className="text-sm">Contexto</CardTitle>
                        <CardDescription className="text-xs">Fontes de dados em tempo real.</CardDescription>
                      </CardHeader>
                    </Card>
                    <Card className="bg-secondary/20 border-none shadow-none">
                      <CardHeader className="p-5">
                        <Shield className="w-5 h-5 text-emerald-500 mb-2" />
                        <CardTitle className="text-sm">Segurança</CardTitle>
                        <CardDescription className="text-xs">Criptografia TLS e Bearer Auth.</CardDescription>
                      </CardHeader>
                    </Card>
                    <Card className="bg-secondary/20 border-none shadow-none">
                      <CardHeader className="p-5">
                        <Activity className="w-5 h-5 text-amber-500 mb-2" />
                        <CardTitle className="text-sm">Uptime</CardTitle>
                        <CardDescription className="text-xs">Monitoramento e logs nativos.</CardDescription>
                      </CardHeader>
                    </Card>
                    <Card className="bg-secondary/20 border-none shadow-none">
                      <CardHeader className="p-5">
                        <Webhook className="w-5 h-5 text-blue-500 mb-2" />
                        <CardTitle className="text-sm">Eventos</CardTitle>
                        <CardDescription className="text-xs">Webhooks para atualizações.</CardDescription>
                      </CardHeader>
                    </Card>
                  </div>

                  {/* Documentation Tabs */}
                  <Tabs defaultValue="concepts" className="w-full">
                    <TabsList className="w-full justify-start bg-secondary/30 p-1 rounded-xl h-12 mb-8">
                      <TabsTrigger value="concepts" className="rounded-lg data-[state=active]:bg-background">Conceitos</TabsTrigger>
                      <TabsTrigger value="auth" className="rounded-lg data-[state=active]:bg-background">Autenticação</TabsTrigger>
                      <TabsTrigger value="endpoints" className="rounded-lg data-[state=active]:bg-background">Endpoints & Schema</TabsTrigger>
                      <TabsTrigger value="webhooks" className="rounded-lg data-[state=active]:bg-background">Webhooks</TabsTrigger>
                      <TabsTrigger value="test" className="rounded-lg data-[state=active]:bg-background flex items-center gap-2">
                        <Play className="w-3 h-3" /> Console de Teste
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="concepts" className="space-y-10">
                      {/* Configuration Guide */}
                      <section className="space-y-6">
                        <div className="flex items-center gap-2 border-b pb-4 border-border/50">
                          <Hash className="w-5 h-5 text-primary" />
                          <h2 className="text-2xl font-bold">Configuração do Servidor</h2>
                        </div>
                        <div className="prose prose-slate dark:prose-invert max-w-none">
                          <p className="text-muted-foreground">
                            Para registrar um novo MCP Server, você precisa de um host acessível (HTTP/HTTPS) que responda aos protocolos padrão.
                          </p>
                          <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><strong>Host:</strong> Domínio ou IP do seu servidor (ex: <code>mcp.minhaempresa.com</code>)</li>
                            <li><strong>Porta:</strong> Porta de escuta (padrão <code>3000</code> ou <code>443</code> para SSL)</li>
                            <li><strong>API Key:</strong> Chave de segurança para autenticar as requisições da nossa plataforma.</li>
                          </ul>
                        </div>
                      </section>

                      {/* Multi-language Implementation */}
                      <section className="space-y-6">
                        <div className="flex items-center gap-2 border-b pb-4 border-border/50">
                          <Terminal className="w-5 h-5 text-primary" />
                          <h2 className="text-2xl font-bold">Exemplos Multi-Linguagem</h2>
                        </div>
                        
                        <Tabs defaultValue="node" className="w-full">
                          <TabsList className="bg-slate-950 p-1 border border-slate-800">
                            <TabsTrigger value="node" className="text-xs">Node.js</TabsTrigger>
                            <TabsTrigger value="python" className="text-xs">Python</TabsTrigger>
                            <TabsTrigger value="curl" className="text-xs">cURL</TabsTrigger>
                          </TabsList>
                          
                          <TabsContent value="node">
                            <div className="relative group">
                              <Button 
                                variant="ghost" size="sm" 
                                onClick={() => copyToClipboard(nodeExample, 'node')}
                                className="absolute right-4 top-4 text-white hover:bg-white/10"
                              >
                                {copied === 'node' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </Button>
                              <pre className="bg-slate-950 p-6 rounded-2xl text-[11px] font-mono overflow-x-auto text-slate-300 border border-slate-800">
                                {nodeExample}
                              </pre>
                            </div>
                          </TabsContent>
                          
                          <TabsContent value="python">
                            <div className="relative group">
                              <Button 
                                variant="ghost" size="sm" 
                                onClick={() => copyToClipboard(pythonExample, 'python')}
                                className="absolute right-4 top-4 text-white hover:bg-white/10"
                              >
                                {copied === 'python' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </Button>
                              <pre className="bg-slate-950 p-6 rounded-2xl text-[11px] font-mono overflow-x-auto text-slate-300 border border-slate-800">
                                {pythonExample}
                              </pre>
                            </div>
                          </TabsContent>

                          <TabsContent value="curl">
                            <div className="relative group">
                              <Button 
                                variant="ghost" size="sm" 
                                onClick={() => copyToClipboard(curlExample, 'curl')}
                                className="absolute right-4 top-4 text-white hover:bg-white/10"
                              >
                                {copied === 'curl' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </Button>
                              <pre className="bg-slate-950 p-6 rounded-2xl text-[11px] font-mono overflow-x-auto text-slate-300 border border-slate-800">
                                {curlExample}
                              </pre>
                            </div>
                          </TabsContent>
                        </Tabs>
                      </section>
                    </TabsContent>

                    <TabsContent value="auth" className="space-y-6">
                      <div className="flex items-center gap-2 border-b pb-4 border-border/50">
                        <Key className="w-5 h-5 text-primary" />
                        <h2 className="text-2xl font-bold">Autenticação & Segurança</h2>
                      </div>
                      <div className="space-y-4">
                        <p className="text-muted-foreground">Todas as chamadas feitas pela plataforma para o seu MCP Server incluem um header de autorização para garantir que apenas nós possamos acessar seus dados.</p>
                        <Card className="border-primary/20 bg-primary/5">
                          <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                              <Shield className="w-8 h-8 text-primary shrink-0" />
                              <div className="space-y-2">
                                <h4 className="font-bold">Header de Autorização</h4>
                                <code className="bg-slate-900 text-primary-foreground px-3 py-1 rounded-lg text-sm block">Authorization: Bearer YOUR_MCP_API_KEY</code>
                                <p className="text-xs text-muted-foreground">Substitua <code>YOUR_MCP_API_KEY</code> pela chave que você definiu no momento do cadastro do servidor no painel.</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="endpoints" className="space-y-10">
                      <section className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-border/50">
                          <div className="flex items-center gap-2">
                            <Brackets className="w-5 h-5 text-primary" />
                            <h2 className="text-2xl font-bold">Estrutura de Payload (Schema)</h2>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" size="sm" 
                              onClick={() => downloadFile(JSON.stringify(JSON_SCHEMA, null, 2), 'mcp-schema.json')}
                              className="rounded-xl h-9 text-[10px] font-bold uppercase tracking-wider"
                            >
                              <Download className="w-3.5 h-3.5 mr-2" /> JSON Schema
                            </Button>
                            <Button 
                              variant="outline" size="sm" 
                              onClick={() => downloadFile(JSON.stringify(OPENAPI_SCHEMA, null, 2), 'mcp-openapi.json')}
                              className="rounded-xl h-9 text-[10px] font-bold uppercase tracking-wider"
                            >
                              <Download className="w-3.5 h-3.5 mr-2" /> OpenAPI / Swagger
                            </Button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="text-sm font-bold flex items-center gap-2"><FileJson className="w-4 h-4 text-primary" /> Request Body (Esperado)</h4>
                            <div className="p-4 rounded-xl border border-border bg-secondary/10 space-y-3">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-mono text-primary">query</span>
                                <Badge variant="outline" className="text-[9px]">String</Badge>
                                <span className="text-muted-foreground italic">Obrigatório</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-mono text-primary">metadata</span>
                                <Badge variant="outline" className="text-[9px]">Object</Badge>
                                <span className="text-muted-foreground italic">Opcional</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="text-sm font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Response Body (Esperado)</h4>
                            <div className="p-4 rounded-xl border border-border bg-secondary/10 space-y-3">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-mono text-emerald-600">data</span>
                                <Badge variant="outline" className="text-[9px]">Object | Array</Badge>
                                <span className="text-muted-foreground italic">Obrigatório</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-mono text-emerald-600">source</span>
                                <Badge variant="outline" className="text-[9px]">String</Badge>
                                <span className="text-muted-foreground italic">Obrigatório</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    </TabsContent>

                    <TabsContent value="webhooks" className="space-y-6">
                      <div className="flex items-center gap-2 border-b pb-4 border-border/50">
                        <Webhook className="w-5 h-5 text-primary" />
                        <h2 className="text-2xl font-bold">Webhooks de Eventos</h2>
                      </div>
                      <p className="text-muted-foreground">O MCP Server pode enviar eventos assíncronos para notificar a plataforma sobre mudanças de estado ou novos dados disponíveis.</p>
                      <pre className="bg-slate-950 p-6 rounded-2xl text-[11px] font-mono text-blue-400 border border-slate-800">
{webhookExample}
                      </pre>
                    </TabsContent>

                    <TabsContent value="test" className="pt-4">
                      <MCPConsole />
                    </TabsContent>
                  </Tabs>
                </motion.div>
              ) : (
                <motion.div
                  key="other-doc"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-2 text-primary mb-2">
                    <Book className="w-5 h-5" />
                    <span className="text-sm font-medium uppercase tracking-widest">Documentação / {activeSection}</span>
                  </div>
                  <h1 className="text-4xl font-bold tracking-tight">{activeSection}</h1>
                  <p className="text-xl text-muted-foreground">Conteúdo em desenvolvimento para esta seção.</p>
                  
                  <div className="p-12 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center">
                      <Terminal className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Estamos escrevendo os detalhes...</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">Esta seção da documentação está sendo atualizada com os novos endpoints e exemplos reais.</p>
                    </div>
                    <Button variant="outline" onClick={() => setActiveSection("MCP Server")} className="rounded-xl">Voltar para MCP Server</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Support Footer */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-primary/5 via-secondary/30 to-transparent border border-secondary/50 text-center space-y-6">
              <div className="flex -space-x-2 justify-center">
                {[1,2,3].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-background bg-secondary flex items-center justify-center overflow-hidden">
                    <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="avatar" />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold">Precisa de ajuda técnica?</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Nosso time de engenharia está disponível para ajudar na configuração do seu servidor MCP ou integrações personalizadas.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button className="rounded-xl px-8 h-11 shadow-lg shadow-primary/20">Falar com Suporte</Button>
                <Button variant="outline" className="rounded-xl h-11 px-8">Comunidade Discord</Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}

const nodeExample = `const express = require('express');
const app = express();
app.use(express.json());

app.post('/mcp/context', (req, res) => {
  const { query } = req.body;
  const apiKey = req.headers['authorization'];

  if (apiKey !== 'Bearer SUA_CHAVE') {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  res.json({
    source: "Database Local",
    data: { result: "Dados para: " + query }
  });
});

app.listen(3000);`;

const pythonExample = `from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/mcp/context', methods=['POST'])
def mcp_context():
    api_key = request.headers.get('Authorization')
    if api_key != 'Bearer SUA_CHAVE':
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    return jsonify({
        "source": "Python API",
        "data": {"message": f"Processado: {data['query']}"}
    })

if __name__ == '__main__':
    app.run(port=3000)`;

const curlExample = `curl -X POST https://seu-servidor.com/mcp/context \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "buscar dados", "metadata": {}}'`;

const webhookExample = `{
  "event": "mcp.data_updated",
  "timestamp": "2024-05-27T10:00:00Z",
  "payload": {
    "server_id": "mcp_01",
    "changes": ["inventory_count", "price_list"]
  }
}`;

const JSON_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MCP Server Request",
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "A pergunta ou instrução do usuário"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "agent_id": { "type": "string" },
        "user_id": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" }
      }
    }
  },
  "required": ["query"]
};

const OPENAPI_SCHEMA = {
  "openapi": "3.0.0",
  "info": {
    "title": "MCP Server API",
    "version": "1.0.0"
  },
  "paths": {
    "/mcp/context": {
      "post": {
        "summary": "Processa contexto para o agente",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/McpRequest" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Sucesso",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/McpResponse" }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "McpRequest": {
        "type": "object",
        "required": ["query"],
        "properties": {
          "query": { "type": "string" },
          "metadata": { "type": "object" }
        }
      },
      "McpResponse": {
        "type": "object",
        "required": ["data", "source"],
        "properties": {
          "data": { "type": "object" },
          "source": { "type": "string" }
        }
      }
    }
  }
};
