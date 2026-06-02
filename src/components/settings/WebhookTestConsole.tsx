import { useState } from 'react';
import { 
  Send, 
  Terminal, 
  Play, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Eye, 
  EyeOff,
  Code2,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { leadPayload } from './InboundWebhooksTab';
import { supabase } from '@/integrations/supabase/client';

interface Webhook {
  id: string;
  name: string;
  secret: string | null;
}

export default function WebhookTestConsole({ webhook }: { webhook: Webhook }) {
  const [payload, setPayload] = useState(JSON.stringify(leadPayload, null, 2));
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    body: any;
    headers: any;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateSignature = async (body: string, secret: string) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${timestamp}.${body}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    const signatureHash = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return `t=${timestamp},v1=${signatureHash}`;
  };

  const sendTest = async () => {
    setSending(true);
    setError(null);
    setResponse(null);

    try {
      // Parse payload to ensure it's valid JSON
      const body = JSON.parse(payload);
      const bodyString = JSON.stringify(body);
      
      const signature = webhook.secret 
        ? await generateSignature(bodyString, webhook.secret)
        : 'no-secret';

      // We use a dedicated edge function for handling inbound webhooks
      // For the test console, we call the same handler
      const { data, error: funcError } = await supabase.functions.invoke('handle-inbound-webhook', {
        body: body,
        headers: {
          'X-Webhook-Signature': signature,
          'X-Webhook-ID': webhook.id
        }
      });

      if (funcError) throw funcError;

      setResponse({
        status: 200,
        body: data,
        headers: { 'content-type': 'application/json' },
        timestamp: new Date().toISOString()
      });
      
      toast({ title: 'Evento enviado com sucesso' });
    } catch (err: any) {
      console.error('Test error:', err);
      setError(err.message || 'Falha ao enviar evento');
      
      // Even if there's an error, we might have a response from the function
      if (err.context?.status) {
        setResponse({
          status: err.context.status,
          body: err.message,
          headers: {},
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Corpo da Requisição (JSON)</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPayload(JSON.stringify(leadPayload, null, 2))}>
            Resetar
          </Button>
        </div>
        
        <div className="relative group">
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="w-full h-[400px] p-4 bg-slate-950 text-slate-50 font-mono text-xs rounded-xl border border-white/5 focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-none"
            spellCheck={false}
          />
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <Badge variant="outline" className="bg-slate-900/80 backdrop-blur-sm border-white/10 text-[10px]">JSON</Badge>
          </div>
        </div>

        <Button 
          onClick={sendTest} 
          disabled={sending} 
          className="w-full gap-2 shadow-lg shadow-primary/20"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Disparar Evento de Teste
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Resposta em Tempo Real</h3>
          </div>
          {response && (
            <Badge variant={response.status < 300 ? 'default' : 'destructive'} className="animate-in fade-in zoom-in">
              HTTP {response.status}
            </Badge>
          )}
        </div>

        <div className="glass-card h-[400px] flex flex-col overflow-hidden">
          {!response && !error && !sending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4">
                <Send className="w-6 h-6 opacity-20" />
              </div>
              <p className="text-sm">Envie um evento de teste para visualizar a resposta do servidor aqui.</p>
            </div>
          )}

          {sending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary/40 mb-4" />
              <p className="text-sm text-muted-foreground animate-pulse">Aguardando resposta...</p>
            </div>
          )}

          {error && !response && (
            <div className="flex-1 p-6 bg-destructive/5 overflow-auto">
              <div className="flex items-center gap-2 text-destructive mb-4">
                <AlertCircle className="w-5 h-5" />
                <span className="font-bold">Erro na Requisição</span>
              </div>
              <pre className="text-xs font-mono text-destructive/80 whitespace-pre-wrap">{error}</pre>
            </div>
          )}

          {response && (
            <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Headers</p>
                  <pre className="p-3 bg-secondary/30 rounded-lg text-[10px] font-mono whitespace-pre overflow-x-auto border border-border/40">
                    {JSON.stringify(response.headers, null, 2)}
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Corpo da Resposta</p>
                  <pre className="p-3 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono whitespace-pre overflow-x-auto border border-white/5">
                    {typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="p-3 bg-secondary/50 border-t border-border/40 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">{response.timestamp}</span>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setResponse(null)}>
                  <Trash2 className="w-3 h-3" /> Limpar Console
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-bold">Dica de Depuração</p>
              <p className="text-[10px] text-muted-foreground">
                O console simula uma chamada real, incluindo a geração da assinatura HMAC 
                baseada na sua chave secreta configurada.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
