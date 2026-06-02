import { motion } from 'framer-motion';
import { Terminal, Copy, ExternalLink, Play, BookOpen, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

export default function QuickstartTab() {
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "O código foi copiado para sua área de transferência.",
    });
  };

  const sdkInstall = "npm install @app/sdk";
  const sdkInit = `import { AppSDK } from '@app/sdk';

const client = new AppSDK({
  apiKey: 'SUA_CHAVE_API',
  environment: 'production'
});`;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold">1</div>
              <h3 className="text-xl font-semibold">Instale o SDK</h3>
            </div>
            <Card className="bg-slate-950 border-slate-800">
              <CardContent className="p-4 flex items-center justify-between">
                <code className="text-sm text-slate-300 font-mono">{sdkInstall}</code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-slate-400 hover:text-white"
                  onClick={() => copyToClipboard(sdkInstall)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold">2</div>
              <h3 className="text-xl font-semibold">Configure as variáveis</h3>
            </div>
            <Card className="bg-slate-950 border-slate-800">
              <CardHeader className="pb-2 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-slate-400 hover:text-white h-8"
                    onClick={() => copyToClipboard(sdkInit)}
                  >
                    <Copy className="w-4 h-4 mr-2" /> Copiar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <pre className="text-sm text-slate-300 font-mono overflow-x-auto">
                  <code>{sdkInit}</code>
                </pre>
              </CardContent>
            </Card>
          </section>

          <div className="flex flex-wrap gap-4">
            <Button asChild size="lg" className="rounded-full px-8">
              <Link to="/documentation">
                <BookOpen className="w-4 h-4 mr-2" />
                Abrir Documentação Completa
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="rounded-full px-8" asChild>
              <Link to="/documentation#endpoints">
                <Terminal className="w-4 h-4 mr-2" />
                Ver todos os endpoints
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Play className="w-5 h-5" /> Início Rápido
              </CardTitle>
              <CardDescription>
                Tudo o que você precisa para começar a integrar em minutos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Recursos úteis:</p>
                <ul className="space-y-2">
                  <li className="text-sm flex items-center text-muted-foreground hover:text-primary cursor-pointer transition-colors">
                    <ChevronRight className="w-4 h-4 mr-1" /> Exemplos em Node.js
                  </li>
                  <li className="text-sm flex items-center text-muted-foreground hover:text-primary cursor-pointer transition-colors">
                    <ChevronRight className="w-4 h-4 mr-1" /> Guia de Autenticação
                  </li>
                  <li className="text-sm flex items-center text-muted-foreground hover:text-primary cursor-pointer transition-colors">
                    <ChevronRight className="w-4 h-4 mr-1" /> Webhooks Listeners
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Suporte Técnico</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Precisa de ajuda com a integração? Nosso time de desenvolvedores está pronto para ajudar.
              </p>
              <Button variant="secondary" className="w-full">
                Falar com Suporte
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
