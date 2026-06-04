import { Webhook, Shield, Lock, Bell, ChevronRight, Copy, Check, Info, ArrowRightLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function WebhookDocs() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    toast({ title: "Copiado!" });
    setTimeout(() => setCopied(null), 2000);
  };

  const payloadExample = `{
  "event": "lead.created",
  "timestamp": 1622548800,
  "data": {
    "id": "ld_123456",
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "phone": "+5511999999999"
  },
  "signature": "hmac_sha256_hash_here"
}`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Webhook className="w-6 h-6 text-primary" />
          Webhooks de Saída
        </h2>
        <p className="text-muted-foreground">Receba notificações em tempo real no seu servidor quando eventos ocorrerem no CRM.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'lead.created', desc: 'Disparado quando um novo lead entra no sistema.' },
              { title: 'lead.updated', desc: 'Disparado ao alterar qualquer dado do lead.' },
              { title: 'message.sent', desc: 'Confirmado após o envio de uma mensagem.' },
              { title: 'deal.closed', desc: 'Quando um lead é marcado como ganho.' }
            ].map((ev) => (
              <div key={ev.title} className="p-4 rounded-2xl border border-border/40 bg-card hover:bg-secondary/20 transition-all flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <code className="text-xs font-bold text-foreground block mb-1">{ev.title}</code>
                  <p className="text-[11px] text-muted-foreground">{ev.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Card className="border-border/40 overflow-hidden">
            <CardHeader className="bg-secondary/10 flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" /> Exemplo de Payload
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => handleCopy(payloadExample)}>
                {copied === payloadExample ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                Copiar
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <pre className="p-6 text-xs font-mono bg-slate-950 text-slate-300 overflow-x-auto">
                <code>{payloadExample}</code>
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <Shield className="w-5 h-5" />
                <h3 className="font-bold">Segurança (HMAC)</h3>
              </div>
              <p className="text-[11px] text-emerald-700/80 leading-relaxed">
                Recomendamos validar a assinatura <code>X-Hub-Signature</code> para garantir que o webhook partiu do Leadseller.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600">
                  <Lock className="w-3 h-3" /> Algoritmo: SHA-256
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Política de Reenvio</h4>
            <div className="space-y-3">
              {[
                { label: 'Backoff Exponencial', icon: RefreshCw },
                { label: 'Máximo 5 tentativas', icon: ArrowRightLeft },
                { label: 'Janela de 24 horas', icon: Info }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card text-[11px] text-muted-foreground">
                  <item.icon className="w-3.5 h-3.5 text-primary" />
                  {item.label}
                </div>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                Endpoints que retornarem 4xx ou 5xx entrarão na fila de retentativas automaticamente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
