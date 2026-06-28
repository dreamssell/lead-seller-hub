// Painel de auditoria de alterações de senha — visível apenas para o dono da
// plataforma (gated em SecurityTab via usePlatformOwner). Lê de
// public.password_change_audit, cuja policy de SELECT exige role admin.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, RefreshCcw, ShieldAlert } from 'lucide-react';

type Row = {
  id: string;
  user_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: 'success' | 'failure';
  failure_reason: string | null;
  signed_out_others: boolean;
  created_at: string;
};

function shortAgent(ua: string | null): string {
  if (!ua) return '—';
  const m =
    ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\/[\d.]+/i)?.[0] ??
    ua.slice(0, 32);
  const os =
    ua.match(/Windows NT [\d.]+|Mac OS X [\d_.]+|Android [\d.]+|iPhone OS [\d_]+|Linux/)?.[0] ?? '';
  return [m, os].filter(Boolean).join(' · ');
}

export default function PasswordAuditLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('password_change_audit')
      .select('id,user_email,ip_address,user_agent,status,failure_reason,signed_out_others,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4 text-primary" /> Auditoria de alterações de senha
          </CardTitle>
          <CardDescription>
            Visível apenas para o dono da plataforma. Mostra autor, momento, IP e dispositivo de cada tentativa.
          </CardDescription>
        </div>
        <Button size="icon" variant="ghost" onClick={load} aria-label="Recarregar">
          <RefreshCcw className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead>Sessões</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Carregando…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                <History className="w-4 h-4 inline mr-1 opacity-60" />
                Nenhum registro ainda.
              </TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-xs">{r.user_email ?? '—'}</TableCell>
                <TableCell>
                  {r.status === 'success' ? (
                    <Badge variant="outline" className="text-[10px] uppercase bg-emerald-500/10 text-emerald-600 border-emerald-500/20">sucesso</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] uppercase bg-destructive/10 text-destructive border-destructive/20" title={r.failure_reason ?? ''}>
                      falha
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono">{r.ip_address ?? '—'}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate" title={r.user_agent ?? ''}>{shortAgent(r.user_agent)}</TableCell>
                <TableCell className="text-xs">
                  {r.signed_out_others ? (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">outras encerradas</Badge>
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
