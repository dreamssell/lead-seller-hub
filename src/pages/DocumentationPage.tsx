import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Book, Code, Terminal, Zap, Shield, Globe, 
  MessageSquare, ChevronRight, Hash, Server, Play, 
  Copy, Check, Info, AlertTriangle, Cpu, Activity
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

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
  const [activeSection, setActiveSection] = useState("MCP Server");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast({ title: "Copiado!", description: "Código copiado para a área de transferência." });
    setTimeout(() => setCopied(null), 2000);
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-secondary/20 border-none shadow-none">
                      <CardHeader className="p-5">
                        <Cpu className="w-5 h-5 text-primary mb-2" />
                        <CardTitle className="text-sm">Contexto Expandido</CardTitle>
                        <CardDescription className="text-xs">Dê à IA acesso a bancos de dados, arquivos e ferramentas em tempo real.</CardDescription>
                      </CardHeader>
                    </Card>
                    <Card className="bg-secondary/20 border-none shadow-none">
                      <CardHeader className="p-5">
                        <Shield className="w-5 h-5 text-emerald-500 mb-2" />
                        <CardTitle className="text-sm">Segurança Nativa</CardTitle>
                        <CardDescription className="text-xs">Comunicação criptografada via TLS e autenticação por Bearer Token.</CardDescription>
                      </CardHeader>
                    </Card>
                    <Card className="bg-secondary/20 border-none shadow-none">
                      <CardHeader className="p-5">
                        <Activity className="w-5 h-5 text-amber-500 mb-2" />
                        <CardTitle className="text-sm">Monitoramento</CardTitle>
                        <CardDescription className="text-xs">Logs de execução, latência e uptime integrados ao painel.</CardDescription>
                      </CardHeader>
                    </Card>
                  </div>

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

                  {/* Code Examples */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 border-b pb-4 border-border/50">
                      <Terminal className="w-5 h-5 text-primary" />
                      <h2 className="text-2xl font-bold">Exemplos de Implementação</h2>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold flex items-center gap-2">
                          <Badge variant="outline" className="bg-blue-500/5 text-blue-500 border-blue-500/20">Node.js</Badge>
                          Servidor Express MCP Básico
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => copyToClipboard(nodeExample, 'node')}
                          className="h-8 rounded-lg"
                        >
                          {copied === 'node' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="ml-2 text-[10px] uppercase font-bold">Copiar</span>
                        </Button>
                      </div>
                      <pre className="bg-slate-950 p-6 rounded-2xl text-[11px] font-mono overflow-x-auto text-slate-300 border border-slate-800 leading-relaxed shadow-xl">
{nodeExample}
                      </pre>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-700/80 leading-relaxed">
                        <strong>Importante:</strong> Certifique-se de que o firewall do seu host permite conexões vindas dos nossos IPs oficiais. 
                        Consulte a seção de <button className="text-amber-700 underline font-bold">Segurança</button> para a lista de IPs.
                      </p>
                    </div>
                  </section>

                  {/* Test Calls */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 border-b pb-4 border-border/50">
                      <Play className="w-5 h-5 text-primary" />
                      <h2 className="text-2xl font-bold">Chamadas de Teste</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Use o cURL abaixo para validar se o seu servidor está respondendo corretamente antes de registrá-lo no painel.
                    </p>
                    <div className="relative group">
                      <div className="absolute right-4 top-4">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => copyToClipboard(curlExample, 'curl')}
                          className="h-8 bg-slate-800 text-white hover:bg-slate-700 border-none rounded-lg"
                        >
                          {copied === 'curl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <pre className="bg-slate-900 p-6 rounded-2xl text-[11px] font-mono overflow-x-auto text-emerald-400 border border-slate-800 leading-relaxed">
{curlExample}
                      </pre>
                    </div>
                  </section>
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

// Endpoint de Verificação de Saúde
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'active', uptime: process.uptime() });
});

// Implementação do Contexto MCP
app.post('/mcp/context', (req, res) => {
  const { query, metadata } = req.body;
  const apiKey = req.headers['authorization'];

  if (apiKey !== 'SUA_CHAVE_DEFINIDA') {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  // Sua lógica para buscar dados externos
  const contextData = {
    source: "Database Local",
    data: "Informações recuperadas para a query: " + query
  };

  res.json(contextData);
});

app.listen(3000, () => console.log('MCP Server rodando na porta 3000'));`;

const curlExample = `curl -X POST https://seu-mcp-server.com/mcp/context \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "buscar faturamento do mês",
    "metadata": { "agent_id": "123" }
  }'`;
