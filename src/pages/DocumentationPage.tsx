import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Search, Book, Code, Terminal, Zap, Shield, Globe, MessageSquare, ChevronRight, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DOC_SECTIONS = [
  {
    title: "Primeiros Passos",
    icon: Zap,
    items: ["Introdução", "Autenticação", "Ambientes", "SDKs"]
  },
  {
    title: "Recursos da API",
    icon: Code,
    items: ["Agentes de IA", "Empresas", "Usuários", "Leads", "Tarefas"]
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
  return (
    <AppLayout title="Documentação Técnica" subtitle="Tudo o que você precisa para integrar com nossa plataforma">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar na documentação..." 
            className="pl-10 h-12 bg-card border-secondary focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="space-y-6 hidden md:block">
            {DOC_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-3">
                  {section.title}
                </h4>
                <nav className="space-y-1">
                  {section.items.map((item) => (
                    <button
                      key={item}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-secondary transition-colors flex items-center justify-between group"
                    >
                      {item}
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </nav>
              </div>
            ))}
          </aside>

          {/* Main Content Area */}
          <main className="md:col-span-3 space-y-12">
            <section id="introduction" className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <Book className="w-5 h-5" />
                  <span className="text-sm font-medium uppercase tracking-widest">Documentação</span>
                </div>
                <h1 className="text-4xl font-bold tracking-tight">Comece a construir hoje</h1>
                <p className="text-xl text-muted-foreground max-w-3xl">
                  Bem-vindo à documentação oficial. Nossa API foi projetada para ser simples, 
                  poderosa e escalável, permitindo que você conecte seus processos aos nossos agentes de IA de forma nativa.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                  <CardHeader>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                      <Terminal className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle>Referência de API</CardTitle>
                    <CardDescription>Consulte todos os endpoints REST, parâmetros e payloads de resposta.</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                  <CardHeader>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                      <Globe className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle>SDKs & Bibliotecas</CardTitle>
                    <CardDescription>Bibliotecas oficiais para Node.js, Python, PHP e outras linguagens.</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </section>

            <section id="endpoints" className="space-y-6">
              <div className="flex items-center gap-2 border-b pb-4">
                <Hash className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-bold">Endpoints Populares</h2>
              </div>
              
              <div className="space-y-4">
                {[
                  { method: 'GET', path: '/v1/agents', desc: 'Listar todos os agentes de IA ativos' },
                  { method: 'POST', path: '/v1/chat/completions', desc: 'Enviar uma mensagem para um agente' },
                  { method: 'GET', path: '/v1/leads', desc: 'Recuperar informações de leads capturados' },
                ].map((api) => (
                  <div key={api.path} className="flex items-center gap-4 p-4 rounded-xl border bg-card/50 hover:bg-card transition-colors">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      api.method === 'GET' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'
                    }`}>
                      {api.method}
                    </span>
                    <code className="text-sm font-mono flex-1">{api.path}</code>
                    <span className="text-sm text-muted-foreground hidden sm:inline">{api.desc}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="p-8 rounded-2xl bg-secondary/30 border border-secondary text-center space-y-4">
              <h3 className="text-lg font-semibold">Precisa de ajuda específica?</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Não encontrou o que procurava? Entre em contato com nosso time de engenharia 
                para suporte personalizado em sua integração.
              </p>
              <button className="text-primary font-medium hover:underline">Falar com um especialista</button>
            </div>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
