import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, RefreshCcw, MessagesSquare, EyeOff, Send, BookOpenCheck } from 'lucide-react';

interface AuditRow {
  id: string;
  owner_id: string;
  sub_company_id: string | null;
  actor_id: string;
  target_user_id: string | null;
  message_id: string | null;
  action: 'message_sent' | 'message_read' | 'message_deleted';
  metadata: any;
  created_at: string;
}

const actionMeta: Record<string, { label: string; icon: any; color: string }> = {
  message_sent: { label: 'Mensagem enviada', icon: Send, color: 'bg-primary/10 text-primary' },
  message_read: { label: 'Mensagem lida', icon: BookOpenCheck, color: 'bg-success/10 text-success' },
  message_deleted: { label: 'Mensagem apagada', icon: EyeOff, color: 'bg-destructive/10 text-destructive' },
};

export default function InternalCommsAuditPage() {
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'all' | 'message_sent' | 'message_read' | 'message_deleted'>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('internal_comms_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (action !== 'all') q = q.eq('action', action);
    const { data } = await q;
    const list = (data as AuditRow[]) || [];
    setRows(list);
    const ids = Array.from(new Set(list.flatMap((r) => [r.actor_id, r.target_user_id].filter(Boolean) as string[])));
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name, email').in('user_id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.user_id] = p.display_name || p.email || p.user_id; });
      setNames(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isOwner) return;
    void load();
    const channel = supabase
      .channel('internal_comms_audit_stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'internal_comms_audit' }, (payload) => {
        setRows((prev) => [payload.new as AuditRow, ...prev].slice(0, limit));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isOwner, action, limit]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) => {
      const actor = (names[r.actor_id] || r.actor_id).toLowerCase();
      const target = r.target_user_id ? (names[r.target_user_id] || r.target_user_id).toLowerCase() : '';
      return actor.includes(s) || target.includes(s) || r.owner_id.toLowerCase().includes(s);
    });
  }, [rows, names, search]);

  if (ownerLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!isOwner) return <Navigate to="/" replace />;

  const counts = {
    sent: rows.filter((r) => r.action === 'message_sent').length,
    read: rows.filter((r) => r.action === 'message_read').length,
  };

  return (
    <AppLayout
      title="Auditoria — Comunicação Interna"
      subtitle="Todas as ações do módulo de Comunicação Interna, por empresa e sub-empresa"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link to="/owner" className="gap-2"><ArrowLeft className="w-4 h-4" /> Central do Dono</Link>
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por usuário / empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-64 h-9" />
            </div>
            <Select value={action} onValueChange={(v) => setAction(v as any)}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="message_sent">Mensagens enviadas</SelectItem>
                <SelectItem value="message_read">Mensagens lidas</SelectItem>
                <SelectItem value="message_deleted">Mensagens apagadas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="100">Últimas 100</SelectItem>
                <SelectItem value="200">Últimas 200</SelectItem>
                <SelectItem value="500">Últimas 500</SelectItem>
                <SelectItem value="1000">Últimas 1000</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => load()} className="gap-2"><RefreshCcw className="w-4 h-4" /> Atualizar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total no período</p>
            <p className="text-2xl font-semibold text-foreground">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Mensagens enviadas</p>
            <p className="text-2xl font-semibold text-primary">{counts.sent}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Mensagens lidas</p>
            <p className="text-2xl font-semibold text-success">{counts.read}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Quando</th>
                  <th className="text-left px-4 py-2">Ação</th>
                  <th className="text-left px-4 py-2">Autor</th>
                  <th className="text-left px-4 py-2">Destinatário</th>
                  <th className="text-left px-4 py-2">Escopo</th>
                  <th className="text-left px-4 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                    <MessagesSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    Nenhum registro para os filtros atuais.
                  </td></tr>
                ) : filtered.map((r) => {
                  const meta = actionMeta[r.action];
                  const Icon = meta?.icon || MessagesSquare;
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2">
                        <Badge className={`gap-1 ${meta?.color || ''}`} variant="secondary">
                          <Icon className="w-3 h-3" /> {meta?.label || r.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">{names[r.actor_id] || r.actor_id.slice(0, 8)}</td>
                      <td className="px-4 py-2">{r.target_user_id ? (names[r.target_user_id] || r.target_user_id.slice(0, 8)) : '—'}</td>
                      <td className="px-4 py-2 text-xs">
                        <div>Empresa: <span className="font-mono">{r.owner_id.slice(0, 8)}…</span></div>
                        {r.sub_company_id && <div className="text-muted-foreground">Sub: <span className="font-mono">{r.sub_company_id.slice(0, 8)}…</span></div>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {r.metadata && Object.keys(r.metadata).length > 0 ? (
                          <code className="text-[11px]">{JSON.stringify(r.metadata)}</code>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
