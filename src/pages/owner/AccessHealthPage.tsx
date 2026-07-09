import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformOwner } from '@/hooks/usePlatformOwner';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

interface HealthRow {
  category: string;
  ref_id: string;
  user_id: string | null;
  owner_id: string | null;
  sub_company_id: string | null;
  message: string;
}

const CATEGORY_LABEL: Record<string, { label: string; tone: 'default' | 'destructive' | 'secondary' }> = {
  orphan_user_access: { label: 'Vínculo órfão', tone: 'destructive' },
  company_without_admin: { label: 'Empresa sem admin', tone: 'destructive' },
  sub_company_without_admin: { label: 'Sub-empresa sem admin', tone: 'default' },
  titular_without_ceo_label: { label: 'Titular sem CEO', tone: 'secondary' },
};

/**
 * Página exclusiva do dono da plataforma que consolida problemas de
 * consistência em user_account_access / client_companies / sub_companies.
 * Objetivo: detectar contas em risco (empresas sem admin, vínculos órfãos)
 * antes que virem ticket de suporte.
 */
export default function AccessHealthPage() {
  const { isOwner, loading: ownerLoading } = usePlatformOwner();
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_access_health');
      if (error) throw error;
      setRows((data ?? []) as HealthRow[]);
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao carregar diagnóstico de acesso');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOwner) void load(); }, [isOwner]);

  if (ownerLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (!isOwner) return <Navigate to="/" replace />;

  const grouped = rows.reduce<Record<string, HealthRow[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="text-primary" /> Saúde de acessos
          </h1>
          <p className="text-sm text-muted-foreground">Diagnóstico de vínculos órfãos, empresas sem admin e titulares sem cargo CEO.</p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw className={loading ? 'animate-spin h-4 w-4' : 'h-4 w-4'} /> Recarregar
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="animate-spin h-4 w-4" /> Analisando base…
        </div>
      ) : rows.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum problema de acesso detectado.
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([cat, items]) => {
          const meta = CATEGORY_LABEL[cat] ?? { label: cat, tone: 'default' as const };
          return (
            <Card key={cat} className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {meta.label}
                  <Badge variant={meta.tone}>{items.length}</Badge>
                </CardTitle>
                <CardDescription>{items[0]?.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-xs font-mono space-y-1 max-h-64 overflow-auto">
                  {items.map((r) => (
                    <li key={r.ref_id} className="truncate">
                      {r.owner_id ? `owner=${r.owner_id.slice(0, 8)}… ` : ''}
                      {r.sub_company_id ? `sub=${r.sub_company_id.slice(0, 8)}… ` : ''}
                      {r.user_id ? `user=${r.user_id.slice(0, 8)}…` : ''}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
