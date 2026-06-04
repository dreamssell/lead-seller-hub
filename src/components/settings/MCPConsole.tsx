import { useState, useEffect } from 'react';
import { Terminal, Send, Play, Loader2, Globe, Shield, RefreshCw, History, Clock, Trash2, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CallHistory {
  id: string;
  method: string;
  endpoint: string;
  headers: string;
  body: string;
  timestamp: number;
}

export default function MCPConsole({ correlationId }: { correlationId?: string }) {
  const [method, setMethod] = useState('POST');
  const [endpoint, setEndpoint] = useState('/mcp/context');
  const [headers, setHeaders] = useState(() => {
    const defaultHeaders = {
      "Authorization": "Bearer YOUR_TOKEN",
      "Content-Type": "application/json"
    };
    if (correlationId) {
      (defaultHeaders as any)["X-Correlation-ID"] = correlationId;
    }
    return JSON.stringify(defaultHeaders, null, 2);
  });
  const [body, setBody] = useState('{\n  "query": "Qual o faturamento de hoje?",\n  "metadata": {\n    "agent_id": "demo-123"\n  }\n}');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CallHistory[]>([]);

  // Carregar histórico do localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('mcp_console_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Erro ao carregar histórico', e);
      }
    }
  }, []);

  // Salvar histórico no localStorage
  const saveHistory = (newHistory: CallHistory[]) => {
    setHistory(newHistory);
    localStorage.setItem('mcp_console_history', JSON.stringify(newHistory));
  };

  const handleTest = async () => {
    setLoading(true);
    
    // Adicionar ao histórico
    const newCall: CallHistory = {
      id: crypto.randomUUID(),
      method,
      endpoint,
      headers,
      body,
      timestamp: Date.now()
    };
    
    saveHistory([newCall, ...history.slice(0, 19)]); // Limitar a 20 itens

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

  const loadFromHistory = (call: CallHistory) => {
    setMethod(call.method);
    setEndpoint(call.endpoint);
    setHeaders(call.headers);
    setBody(call.body);
    toast({ title: "Teste carregado", description: "As configurações foram restauradas do histórico." });
  };

  const clearHistory = () => {
    saveHistory([]);
    toast({ title: "Histórico limpo", description: "Todo o histórico de chamadas foi removido." });
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

      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Request Panel */}
        <div className="p-6 space-y-4 border-r border-border lg:col-span-1">
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
              className="font-mono text-[11px] h-24 bg-secondary/20 resize-none rounded-xl focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase">Body (JSON)</Label>
            <Textarea 
              value={body}
              onChange={e => setBody(e.target.value)}
              className="font-mono text-[11px] h-40 bg-secondary/20 resize-none rounded-xl focus:ring-primary"
            />
          </div>

          <Button onClick={handleTest} disabled={loading} className="w-full rounded-xl h-11 shadow-lg shadow-primary/20">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Executar Chamada
          </Button>
        </div>

        {/* History Panel */}
        <div className="p-0 border-r border-border bg-secondary/10 flex flex-col h-[400px] lg:h-auto">
          <div className="p-3 border-b border-border flex items-center justify-between bg-secondary/20">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Histórico Recente</span>
            </div>
            {history.length > 0 && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={clearHistory}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {history.length > 0 ? (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadFromHistory(item)}
                    className="w-full p-4 text-left hover:bg-secondary/30 transition-colors group space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${
                          item.method === 'POST' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          item.method === 'GET' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        }`}>
                          {item.method}
                        </Badge>
                        <span className="text-[11px] font-mono font-medium truncate max-w-[120px]">
                          {item.endpoint}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(item.timestamp, 'HH:mm', { locale: ptBR })}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1 font-mono italic">
                      {item.body.substring(0, 50)}...
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center space-y-2">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-[11px] text-muted-foreground">Nenhum teste realizado ainda.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Response Panel */}
        <div className="p-0 flex flex-col bg-slate-950 min-h-[400px]">
          <div className="p-3 border-b border-slate-900 flex items-center justify-between bg-slate-900/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Response Output</span>
            {response && (
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
                    toast({ title: "Copiado", description: "Resposta copiada para a área de transferência." });
                  }}
                  className="h-6 text-[10px] text-slate-500 hover:text-white flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copiar
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setResponse(null)}
                  className="h-6 text-[10px] text-slate-500 hover:text-white"
                >
                  Limpar
                </Button>
              </div>
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
