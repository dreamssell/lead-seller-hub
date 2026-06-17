import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type AuditRow = {
  id: string;
  action: string;
  old_role: string | null;
  new_role: string | null;
  changed_by_email: string | null;
  target_email: string | null;
  sub_company_name: string | null;
  created_at: string;
};

const ACTION_TONE: Record<string, string> = {
  create: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  update: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  delete: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function SignatureRoleAuditLog() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('signature_role_audit')
      .select('id,action,old_role,new_role,changed_by_email,target_email,sub_company_name,created_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Auditoria de cargos</h3>
        </div>
        <Button size="icon" variant="ghost" onClick={load}><RefreshCcw className="w-3.5 h-3.5" /></Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Alvo</TableHead>
            <TableHead>Sub-empresa</TableHead>
            <TableHead>Mudança</TableHead>
            <TableHead>Por</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Carregando…</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sem registros de auditoria.</TableCell></TableRow>
          ) : rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{new Date(r.created_at).toLocaleString('pt-BR')}</TableCell>
              <TableCell><Badge variant="outline" className={`text-[10px] uppercase ${ACTION_TONE[r.action] ?? ''}`}>{r.action}</Badge></TableCell>
              <TableCell className="text-xs">{r.target_email ?? '—'}</TableCell>
              <TableCell className="text-xs">{r.sub_company_name ?? 'Todas'}</TableCell>
              <TableCell className="text-xs">
                {r.old_role && r.new_role ? `${r.old_role} → ${r.new_role}` : (r.new_role ?? r.old_role ?? '—')}
              </TableCell>
              <TableCell className="text-xs">{r.changed_by_email ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
