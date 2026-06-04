import { Server, Terminal, Copy, Info, Check, Play, Book, Code, ExternalLink, Activity, Shield, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function McpDocs() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    toast({ title: "Copiado!" });
    setTimeout(() => setCopied(null), 2000);
  };

  const configExample = `{
  "mcpServers": {
    "leasdseller": {
      "command": "npx",
      "args": ["-y", "@leadseller/mcp-server"],
      "env": {
        "LEADSELLER_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            Model Context Protocol (MCP)
          </h2>
          <p className="text-muted-foreground">Conecte sua conta do Leadseller diretamente ao ChatGPT, Claude ou Cursor.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5 py-1">
            <Activity className="w-3 h-3" /> Status: Operacional
          </Badge>
          <Badge variant="outline" className="bg-emerald-500/5 text-emerald-600 border-emerald-500/20 gap-1.5 py-1">
            <Shield className="w-3 h-3" /> v1.2.0
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/40 bg-card/50 overflow-hidden">
            <CardHeader className="border-b border-border/10 bg-secondary/10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> Configuração do Servidor
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => handleCopy(configExample)}>
                  {copied === configExample ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  Copiar JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <pre className="p-6 text-xs font-mono bg-slate-950 text-slate-300 overflow-x-auto leading-relaxed">
                <code>{configExample}</code>
              </pre>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Ferramentas Disponíveis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'get_leads', desc: 'Lista leads filtrados por status ou data.' },
                { name: 'create_note', desc: 'Adiciona uma nota interna a um contato.' },
                { name: 'send_message', desc: 'Dispara uma mensagem via WhatsApp.' },
                { name: 'update_status', desc: 'Altera o estágio do lead no funil.' }
              ].map((tool) => (
                <div key={tool.name} className="p-4 rounded-2xl border border-border/40 bg-card hover:border-primary/20 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-lg">{tool.name}</code>
                    <Play className="w-3 h-3 text-muted-foreground opacity-50" />
                  </div>
                  <p className="text-xs text-muted-foreground">{tool.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-background border border-primary/20 shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Book className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-bold">Como funciona?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O MCP permite que IAs "entendam" e manipulem dados do Leadseller em tempo real. 
              Ao configurar o servidor, sua IA ganha habilidades para consultar o CRM diretamente.
            </p>
            <Button variant="outline" className="w-full rounded-xl text-xs gap-2 group">
              Tutorial Completo <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </div>

          <Card className="border-border/40 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-bold text-sm">Frameworks</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Python SDK</span>
                  <Badge variant="secondary" className="text-[9px]">Oficial</Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">TypeScript SDK</span>
                  <Badge variant="secondary" className="text-[9px]">Oficial</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
