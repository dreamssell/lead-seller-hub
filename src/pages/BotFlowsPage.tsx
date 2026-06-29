import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Save, Trash2, Loader2, MessageSquare, GitBranch, Bot, Tag, Clock,
  ArrowRight, Play, Pause,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type NodeKind = 'trigger' | 'message' | 'question' | 'condition' | 'tag' | 'handoff' | 'wait';

interface FlowNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  data: any;
}
interface FlowEdge { id: string; from: string; to: string; label?: string; }

interface Flow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_keywords: string[];
  trigger_channel: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const KIND_META: Record<NodeKind, { label: string; icon: any; color: string }> = {
  trigger: { label: 'Gatilho', icon: Play, color: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300' },
  message: { label: 'Mensagem', icon: MessageSquare, color: 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300' },
  question: { label: 'Pergunta', icon: GitBranch, color: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300' },
  condition: { label: 'Condição', icon: GitBranch, color: 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300' },
  tag: { label: 'Aplicar tag', icon: Tag, color: 'bg-pink-500/15 border-pink-500/40 text-pink-700 dark:text-pink-300' },
  handoff: { label: 'Transferir para atendente', icon: Bot, color: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300' },
  wait: { label: 'Aguardar', icon: Clock, color: 'bg-zinc-500/15 border-zinc-500/40 text-zinc-700 dark:text-zinc-300' },
};

const PALETTE: NodeKind[] = ['message', 'question', 'condition', 'tag', 'wait', 'handoff'];

export default function BotFlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Flow | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('bot_flows').select('*').order('created_at', { ascending: false });
    setFlows(((data as any) || []) as Flow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createFlow = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const initialNodes: FlowNode[] = [{ id: 'n1', kind: 'trigger', x: 80, y: 80, data: { name: 'Mensagem recebida' } }];
    const { data, error } = await supabase.from('bot_flows').insert({
      owner_id: u.user.id, name: 'Novo fluxo', nodes: initialNodes as any, edges: [] as any,
    }).select('*').single();
    if (error) return toast.error(error.message);
    await load();
    setActive(data as any);
  };

  const persist = async () => {
    if (!active) return;
    setSaving(true);
    const { error } = await supabase.from('bot_flows').update({
      name: active.name,
      description: active.description,
      is_active: active.is_active,
      trigger_keywords: active.trigger_keywords,
      trigger_channel: active.trigger_channel,
      nodes: active.nodes as any,
      edges: active.edges as any,
    }).eq('id', active.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Fluxo salvo'); load(); }
  };

  const addNode = (kind: NodeKind) => {
    if (!active) return;
    const id = `n${Date.now().toString(36)}`;
    const x = 200 + Math.random() * 220;
    const y = 200 + Math.random() * 160;
    const data: any =
      kind === 'message' ? { text: 'Olá! Como posso ajudar?' } :
      kind === 'question' ? { text: 'Qual o seu interesse?', options: ['Comprar', 'Suporte'] } :
      kind === 'condition' ? { field: 'message', op: 'contains', value: '' } :
      kind === 'tag' ? { tag: 'novo-lead' } :
      kind === 'wait' ? { seconds: 60 } :
      kind === 'handoff' ? { queue: '' } : {};
    setActive({ ...active, nodes: [...active.nodes, { id, kind, x, y, data }] });
  };

  const deleteNode = (id: string) => {
    if (!active) return;
    setActive({
      ...active,
      nodes: active.nodes.filter(n => n.id !== id),
      edges: active.edges.filter(e => e.from !== id && e.to !== id),
    });
  };

  const startLink = (fromId: string) => {
    if (linkFrom === fromId) { setLinkFrom(null); return; }
    setLinkFrom(fromId);
  };

  const completeLink = (toId: string) => {
    if (!active || !linkFrom || linkFrom === toId) { setLinkFrom(null); return; }
    if (active.edges.find(e => e.from === linkFrom && e.to === toId)) { setLinkFrom(null); return; }
    setActive({
      ...active,
      edges: [...active.edges, { id: `e${Date.now().toString(36)}`, from: linkFrom, to: toId }],
    });
    setLinkFrom(null);
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !active) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left - dragging.dx;
    const y = e.clientY - rect.top - dragging.dy;
    setActive({
      ...active,
      nodes: active.nodes.map(n => n.id === dragging.id ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n),
    });
  };

  const removeFlow = async (id: string) => {
    if (!confirm('Excluir este fluxo?')) return;
    await supabase.from('bot_flows').delete().eq('id', id);
    if (active?.id === id) setActive(null);
    load();
  };

  return (
    <AppLayout title="Bot de Triagem" subtitle="Construa fluxos visuais para atendimento automatizado">
      <div className="grid grid-cols-12 gap-3 h-[calc(100vh-160px)]">
        {/* Sidebar — flows list */}
        <Card className="col-span-3 p-3 flex flex-col gap-2 overflow-hidden">
          <Button onClick={createFlow} size="sm" className="w-full gap-1"><Plus className="w-4 h-4" /> Novo fluxo</Button>
          <div className="flex-1 overflow-y-auto space-y-1 mt-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-4 text-muted-foreground" />}
            {flows.map(f => (
              <button key={f.id} onClick={() => setActive(f)}
                className={cn('w-full text-left p-2 rounded border text-xs flex items-start gap-2 transition',
                  active?.id === f.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary')}>
                <Bot className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{(f.nodes || []).length} nós</p>
                </div>
                <Badge variant={f.is_active ? 'default' : 'outline'} className="text-[9px] h-4 px-1">
                  {f.is_active ? 'Ativo' : 'Off'}
                </Badge>
              </button>
            ))}
            {!loading && flows.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-6">Nenhum fluxo. Crie o primeiro.</p>
            )}
          </div>
        </Card>

        {/* Canvas */}
        <Card className="col-span-7 relative overflow-hidden bg-secondary/20 bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] bg-[length:20px_20px]"
          onMouseMove={onCanvasMouseMove}
          onMouseUp={() => setDragging(null)}
        >
          {!active ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Selecione ou crie um fluxo para começar.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 p-2 bg-background/95 backdrop-blur border-b border-border">
                <Input value={active.name} onChange={(e) => setActive({ ...active, name: e.target.value })} className="h-7 text-xs max-w-xs" />
                <Button size="sm" variant={active.is_active ? 'default' : 'outline'} onClick={() => setActive({ ...active, is_active: !active.is_active })} className="h-7 text-[10px] gap-1">
                  {active.is_active ? <><Pause className="w-3 h-3" /> Pausar</> : <><Play className="w-3 h-3" /> Ativar</>}
                </Button>
                <Button size="sm" onClick={persist} disabled={saving} className="h-7 text-[10px] gap-1 ml-auto">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeFlow(active.id)} className="h-7 text-[10px] text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>

              {/* SVG edges */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ marginTop: 0 }}>
                {active.edges.map(e => {
                  const a = active.nodes.find(n => n.id === e.from);
                  const b = active.nodes.find(n => n.id === e.to);
                  if (!a || !b) return null;
                  const x1 = a.x + 160, y1 = a.y + 32;
                  const x2 = b.x, y2 = b.y + 32;
                  const mid = (x1 + x2) / 2;
                  return (
                    <path key={e.id} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                      stroke="hsl(var(--primary))" strokeWidth="2" fill="none" markerEnd="url(#arr)" />
                  );
                })}
                <defs>
                  <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--primary))" />
                  </marker>
                </defs>
              </svg>

              {/* Nodes */}
              <div className="relative w-full h-full pt-10">
                {active.nodes.map(n => {
                  const meta = KIND_META[n.kind];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={n.id}
                      className={cn('absolute w-40 rounded-lg border-2 shadow-sm select-none', meta.color,
                        linkFrom === n.id && 'ring-2 ring-primary ring-offset-1')}
                      style={{ left: n.x, top: n.y }}
                    >
                      <div
                        className="px-2 py-1 cursor-move flex items-center justify-between gap-1 border-b border-current/20"
                        onMouseDown={(e) => setDragging({ id: n.id, dx: e.nativeEvent.offsetX, dy: e.nativeEvent.offsetY })}
                      >
                        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                          <Icon className="w-3 h-3" /> {meta.label}
                        </span>
                        {n.kind !== 'trigger' && (
                          <button onClick={() => deleteNode(n.id)} className="opacity-60 hover:opacity-100">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                      <div className="p-2 space-y-1 text-[10px]">
                        {n.kind === 'message' && (
                          <Textarea rows={2} value={n.data.text || ''} onChange={(e) => setActive({ ...active, nodes: active.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, text: e.target.value } } : x) })} className="text-[10px] resize-none" />
                        )}
                        {n.kind === 'question' && (
                          <>
                            <Input value={n.data.text || ''} onChange={(e) => setActive({ ...active, nodes: active.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, text: e.target.value } } : x) })} className="h-6 text-[10px]" placeholder="Pergunta" />
                            <Input value={(n.data.options || []).join(', ')} onChange={(e) => setActive({ ...active, nodes: active.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } } : x) })} className="h-6 text-[10px]" placeholder="op1, op2" />
                          </>
                        )}
                        {n.kind === 'tag' && (
                          <Input value={n.data.tag || ''} onChange={(e) => setActive({ ...active, nodes: active.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, tag: e.target.value } } : x) })} className="h-6 text-[10px]" placeholder="nome-da-tag" />
                        )}
                        {n.kind === 'wait' && (
                          <Input type="number" value={n.data.seconds || 0} onChange={(e) => setActive({ ...active, nodes: active.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, seconds: +e.target.value } } : x) })} className="h-6 text-[10px]" placeholder="segundos" />
                        )}
                        {n.kind === 'condition' && (
                          <Input value={n.data.value || ''} onChange={(e) => setActive({ ...active, nodes: active.nodes.map(x => x.id === n.id ? { ...x, data: { ...x.data, value: e.target.value } } : x) })} className="h-6 text-[10px]" placeholder="palavra-chave" />
                        )}
                        {n.kind === 'handoff' && (
                          <p className="text-[10px] opacity-80">Transfere para fila humana.</p>
                        )}
                        {n.kind === 'trigger' && (
                          <p className="text-[10px] opacity-80">Inicia ao receber mensagem.</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-2 pb-1.5">
                        <button onClick={() => completeLink(n.id)} className="text-[9px] opacity-70 hover:opacity-100">
                          {linkFrom && linkFrom !== n.id ? '← conectar aqui' : ''}
                        </button>
                        <button onClick={() => startLink(n.id)}
                          className={cn('text-[9px] flex items-center gap-0.5 px-1 py-0.5 rounded',
                            linkFrom === n.id ? 'bg-primary text-primary-foreground' : 'bg-background/60 hover:bg-background')}>
                          {linkFrom === n.id ? 'cancelar' : 'ligar'} <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Palette */}
        <Card className="col-span-2 p-3 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Componentes</p>
          {!active ? (
            <p className="text-xs text-muted-foreground italic">Selecione um fluxo.</p>
          ) : (
            <div className="space-y-1.5">
              {PALETTE.map(k => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                return (
                  <button key={k} onClick={() => addNode(k)}
                    className={cn('w-full px-2 py-2 rounded-lg border-2 flex items-center gap-2 text-xs hover:scale-[1.02] transition', meta.color)}>
                    <Icon className="w-3.5 h-3.5" /> {meta.label}
                  </button>
                );
              })}
              <div className="pt-3 mt-3 border-t border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Gatilhos</p>
                <Input value={active.trigger_keywords.join(', ')} onChange={(e) => setActive({ ...active, trigger_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="h-7 text-[10px]" placeholder="oi, olá, ajuda" />
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
