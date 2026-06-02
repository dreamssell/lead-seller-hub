import { useState } from 'react';
import { 
  Send, 
  Terminal, 
  Play, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Code2, 
  Trash2,
  Globe,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
}

const defaultTestPayload = {
  event: "webhook.test",
  timestamp: new Date().toISOString(),
  data: {
    message: "Esta é uma carga útil de teste enviada do console do desenvolvedor.",
    user_id: "user_test_123",
    meta: {
      env: "production",
      version: "1.0.0"
    }
  }
};

export default function OutboundWebhookTestConsole({ webhook }: { webhook: Webhook }) {
  const [payload, setPayload] = useState(JSON.stringify(defaultTestPayload, null, 2));
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<{
    success: boolean;
    status: number;
    body: string;
    latency: number;
    signature_preview?: string;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendTest = async () => {
    setSending(true);
    setError(null);
    setResponse(null);

    try {
      // Validate JSON
      const parsedPayload = JSON.parse(payload);
      
      const { data, error: funcError } = await supabase.functions.invoke('send-outbound-webhook', {
        body: {
          webhook_id: webhook.id,
          payload: parsedPayload,
          is_test: true
        }
      });

      if (funcError) throw funcError;

      setResponse({
        ...data,
        timestamp: new Date().toISOString()
      });
      
      if (data.success) {
        toast({ title: 'Evento de teste disparado!', description: `Status: ${data.status}` });
      } else {
        toast({ title: 'Falha no teste', description: `O servidor retornou status ${data.status}`, variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Test error:', err);
      setError(err.message || 'Falha ao processar teste');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Payload de Teste (JSON)</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPayload(JSON.stringify(defaultTestPayload, null, 2))} className="h-7 text-[10px]">
            Resetar
          </Button>
        </div>
        
        <div className="relative group">
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="w-full h-[400px] p-4 bg-slate-950 text-slate-50 font-mono text-xs rounded-xl border border-white/5 focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-none shadow-inner"
            spellCheck={false}
          />
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <Badge variant="outline" className="bg-slate-900/80 backdrop-blur-sm border-white/10 text-[10px]">JSON EDITOR</Badge>
          </div>
        </div>

        <Button 
          onClick={sendTest} 
          disabled={sending || !webhook.url} 
          className="w-full gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Disparar Teste Real
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Resposta do Endpoint</h3>
          </div>
          {response && (
            <div className="flex gap-2">
              <Badge variant="outline" className="text-[10px] font-mono">{response.latency}ms</Badge>
              <Badge variant={response.success ? 'default' : 'destructive'} className="animate-in zoom-in">
                HTTP {response.status}
              </Badge>
            </div>
          )}
        </div>

        <div className="glass-card h-[400px] flex flex-col overflow-hidden border-border/40 shadow-xl bg-secondary/5">
          {!response && !error && !sending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center mb-4 border border-border/50">
                <Globe className="w-8 h-8 opacity-20" />
              </div>
              <p className="text-sm font-medium">Pronto para testar?</p>
              <p className="text-xs max-w-[200px] mt-2 leading-relaxed">
                Configure um endpoint e clique em disparar para ver o resultado da integração.
              </p>
            </div>
          )}

          {sending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-secondary/10">
              <div className="relative">
                <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Send className="w-4 h-4 text-primary animate-pulse" />
                </div>
              </div>
              <p className="text-sm font-bold animate-pulse">Enviando Requisição...</p>
              <p className="text-xs text-muted-foreground mt-1">Aguardando resposta de: {webhook.url}</p>
            </div>
          )}

          {error && !response && (
            <div className="flex-1 p-6 bg-destructive/5 overflow-auto animate-in fade-in duration-300">
              <div className="flex items-center gap-2 text-destructive mb-4">
                <AlertCircle className="w-5 h-5" />
                <span className="font-bold">Erro de Processamento</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-900 border border-destructive/20 font-mono text-xs text-destructive/80">
                {error}
              </div>
            </div>
          )}

          {response && (
            <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex-1 overflow-auto p-4 space-y-5">
                {response.signature_preview && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-emerald-500" />
                      <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">Header de Segurança Enviado</p>
                    </div>
                    <code className="block p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-mono break-all text-emerald-700">
                      X-Webhook-Signature: {response.signature_preview}
                    </code>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Corpo da Resposta (Raw)</p>
                  <pre className="p-4 bg-slate-950 text-slate-100 rounded-xl text-xs font-mono whitespace-pre-wrap overflow-x-auto border border-white/5 shadow-inner min-h-[150px]">
                    {response.body || '(Vazio)'}
                  </pre>
                </div>
              </div>
              <div className="p-3 bg-secondary/50 border-t border-border/40 flex items-center justify-between backdrop-blur-sm">
                <span className="text-[10px] text-muted-foreground font-mono">{new Date(response.timestamp).toLocaleTimeString()}</span>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 hover:text-destructive" onClick={() => setResponse(null)}>
                  <Trash2 className="w-3 h-3" /> Limpar
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
          <div className="flex gap-3">
            <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-700">Fluxo do Teste</p>
              <p className="text-[10px] text-blue-600/70 leading-relaxed">
                A requisição é processada via Edge Function segura, onde a assinatura HMAC é calculada 
                antes de ser disparada para sua URL. Isso garante que o teste seja 100% fiel ao disparo real.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}