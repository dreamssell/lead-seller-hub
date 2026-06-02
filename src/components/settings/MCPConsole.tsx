import { useState } from 'react';
import { Terminal, Send, Play, Loader2, Globe, Shield, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

export default function MCPConsole() {
  const [method, setMethod] = useState('POST');
  const [endpoint, setEndpoint] = useState('/mcp/context');
  const [headers, setHeaders] = useState('{\n  "Authorization": "Bearer YOUR_TOKEN",\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState('{\n  "query": "Qual o faturamento de hoje?",\n  "metadata": {\n    "agent_id": "demo-123"\n  }\n}');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      // Simulação de chamada para demonstração visual
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockResponse = {
        status: 200,
        ok: true,
        data: {
          answer: "O faturamento registrado hoje é de R$ 12.500,00.",
          source: "MCP Server Local",
          timestamp: new Date().toISOString()
        }
      };
      
      setResponse(mockResponse);
      toast({ title: "Teste concluído", description: "O servidor respondeu com sucesso." });
    } catch (err: any) {
      setResponse({ error: err.message || "Falha na conexão" });
      toast({ variant: "destructive", title: "Erro no teste", description: "Verifique as configurações do servidor." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-0 overflow-hidden border-primary/10 shadow-xl">
      <div className="bg-slate-900 p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Console de Teste MCP</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">REAL-TIME</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Request Panel */}
        <div className="p-6 space-y-4 border-r border-border">
          <div className="flex gap-2">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-[100px] h-10 rounded-xl bg-secondary/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input 
                value={endpoint} 
                onChange={e => setEndpoint(e.target.value)}
                className="pl-10 h-10 rounded-xl bg-secondary/30"
                placeholder="/api/v1/resource"
              />
              <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">Headers (JSON)</Label>
            <Textarea 
              value={headers}
              onChange={e => setHeaders(e.target.value)}
              className="font-mono text-[11px] h-24 bg-secondary/20 resize-none rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">Body (JSON)</Label>
            <Textarea 
              value={body}
              onChange={e => setBody(e.target.value)}
              className="font-mono text-[11px] h-40 bg-secondary/20 resize-none rounded-xl"
            />
          </div>

          <Button onClick={handleTest} disabled={loading} className="w-full rounded-xl h-11 shadow-lg shadow-primary/20">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Executar Chamada
          </Button>
        </div>

        {/* Response Panel */}
        <div className="p-0 flex flex-col bg-slate-950 min-h-[400px]">
          <div className="p-3 border-b border-slate-900 flex items-center justify-between bg-slate-900/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Response Output</span>
            {response && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setResponse(null)}
                className="h-6 text-[10px] text-slate-500 hover:text-white"
              >
                Limpar
              </Button>
            )}
          </div>
          <div className="flex-1 p-6 font-mono text-[11px] text-slate-300 overflow-auto leading-relaxed">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin" />
                <p className="animate-pulse">Aguardando resposta do servidor...</p>
              </div>
            ) : response ? (
              <pre>{JSON.stringify(response, null, 2)}</pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 text-center">
                <Play className="w-10 h-10 opacity-20" />
                <p>Clique em "Executar Chamada" para<br/>iniciar o teste de integração.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
