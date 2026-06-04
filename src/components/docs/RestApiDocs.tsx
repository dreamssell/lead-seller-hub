import { Terminal, Copy, Globe, Lock, Shield, ArrowRightLeft, Webhook, Zap, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

const ENDPOINTS = [
  {
    method: 'POST',
    path: '/v1/verify-email',
    description: 'Verifica a disponibilidade de um e-mail para cadastro.',
    type: 'auth'
  },
  {
    method: 'POST',
    path: '/v1/authenticate',
    description: 'Realiza o login e retorna o token de acesso.',
    type: 'auth'
  },
  {
    method: 'GET',
    path: '/v1/me',
    description: 'Retorna os dados do usuário autenticado.',
    type: 'auth'
  },
  {
    method: 'POST',
    path: '/v1/webhooks/inbound',
    description: 'Recebe eventos externos e inicia fluxos automatizados.',
    type: 'webhook'
  }
];

export default function RestApiDocs() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    toast({ title: "Copiado para o clipboard" });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-primary" />
              Endpoints REST
            </h2>
            <p className="text-muted-foreground">Documentação técnica para integração direta via HTTP.</p>
          </div>

          <div className="space-y-4">
            {ENDPOINTS.map((api, idx) => (
              <Card key={idx} className="group border-border/40 hover:border-primary/30 transition-all overflow-hidden bg-card/50 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center">
                    <div className={`w-full md:w-24 px-4 py-3 text-center font-bold text-xs tracking-widest ${
                      api.method === 'POST' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                    }`}>
                      {api.method}
                    </div>
                    <div className="flex-1 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-bold font-mono">{api.path}</code>
                          <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 h-4 border-primary/20 text-primary">
                            {api.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{api.description}</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleCopy(`https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1${api.path}`)}
                      >
                        {copied === `https://gcjaeoxjhcfeispehmga.supabase.co/functions/v1${api.path}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5 shadow-inner">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Shield className="w-5 h-5" />
                <h3 className="font-bold">Autenticação</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Todas as requisições devem incluir o header <code>Authorization: Bearer YOUR_TOKEN</code>. 
                Use o endpoint <code>/authenticate</code> para obter um token válido.
              </p>
              <div className="p-3 bg-background rounded-xl border border-primary/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Exemplo de Header</span>
                  <Copy className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-primary" />
                </div>
                <code className="text-[10px] font-mono block break-all text-foreground/80">
                  Authorization: Bearer eyJhbGciOiJIUzI1...
                </code>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold">Dicas de Integração</h3>
              </div>
              <ul className="space-y-3">
                {[
                  { icon: Terminal, label: 'Use SDK para Node.js' },
                  { icon: ArrowRightLeft, label: 'Ative retries em webhooks' },
                  { icon: Lock, label: 'Valide HMAC em produção' }
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-xs text-muted-foreground">
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
