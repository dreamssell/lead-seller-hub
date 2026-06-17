import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Download, FileText, Filter, KanbanSquare, RefreshCcw, Search, ShieldCheck, BarChart3, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SignaturePipeline, type PipelineDoc } from '@/components/signature/SignaturePipeline';
import { SignatureRolesManager } from '@/components/signature/SignatureRolesManager';
import { SignatureDashboard } from '@/components/signature/SignatureDashboard';
import { exportSignaturesCSV, exportSignaturesPDF } from '@/lib/signatureExport';

type Doc = PipelineDoc & {
  owner_id: string;
  sub_company_id: string | null;
  created_by: string;
};

const STATUS_OPTS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Aguardando Assinatura' },
  { value: 'authenticating', label: 'Processando' },
  { value: 'signed', label: 'Assinados' },
  { value: 'expired', label: 'Expirados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const METHOD_OPTS = [
  { value: 'all', label: 'Todos os métodos' },
  { value: 'canvas', label: 'Tela (canvas)' },
  { value: 'email', label: 'E-mail' },
  { value: 'sms', label: 'SMS' },
];

export default function SignaturesPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLeader, setIsLeader] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('signature_documents')
      .select('id,title,signer_name,signer_email,status,method,created_at,signed_at,expires_at,owner_id,sub_company_id,created_by')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      toast.error('Falha ao carregar documentos');
      setLoading(false);
      return;
    }
    const list = (data as Doc[]) || [];
    setDocs(list);

    const { data: roles } = await supabase
      .from('user_signature_roles')
      .select('role')
      .eq('user_id', user.id);
    setIsLeader((roles || []).some((r: any) => ['supervisor', 'coordenador', 'diretor'].includes(r.role)));

    const ids = Array.from(new Set(list.map((d) => d.created_by)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id,display_name,email')
        .in('user_id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => (map[p.user_id] = p.display_name || p.email || p.user_id.slice(0, 8)));
      setUserNames(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (status !== 'all' && d.status !== status) return false;
      if (method !== 'all' && d.method !== method) return false;
      if (from && new Date(d.created_at) < new Date(from)) return false;
      if (to && new Date(d.created_at) > new Date(to + 'T23:59:59')) return false;
      if (q) {
        const t = q.toLowerCase();
        const hit = [d.title, d.signer_name, d.signer_email].filter(Boolean).some((v) => v!.toLowerCase().includes(t));
        if (!hit) return false;
      }
      return true;
    });
  }, [docs, status, method, from, to, q]);

  const filterSummary = {
    Status: STATUS_OPTS.find((s) => s.value === status)?.label || '',
    Método: METHOD_OPTS.find((m) => m.value === method)?.label || '',
    De: from,
    Até: to,
    Busca: q,
  };

  return (
    <AppLayout title="Assinaturas" subtitle="Central de acompanhamento, equipe e relatórios">
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline"><KanbanSquare className="w-3.5 h-3.5 mr-1.5" /> Acompanhamento</TabsTrigger>
          {isLeader && (
            <TabsTrigger value="dashboard"><BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Dashboard Gerencial</TabsTrigger>
          )}
          <TabsTrigger value="roles"><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Equipe & Cargos</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Filtros</h3>
            <Badge variant="secondary" className="ml-auto">{filtered.length} resultado(s)</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <div className="md:col-span-3 relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar título, signatário…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>{METHOD_OPTS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="md:col-span-2 relative">
              <CalendarIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pl-8" />
            </div>
            <div className="md:col-span-2 relative">
              <CalendarIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pl-8" />
            </div>
            <Button variant="outline" onClick={load} className="md:col-span-1"><RefreshCcw className="w-3.5 h-3.5" /></Button>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground mr-auto">Exportar filtrados:</span>
            <Button size="sm" variant="outline" onClick={() => exportSignaturesCSV(filtered)} disabled={!filtered.length}>
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
            <Button size="sm" onClick={() => exportSignaturesPDF(filtered, filterSummary)} disabled={!filtered.length}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
            </Button>
          </div>
        </div>

        <TabsContent value="pipeline" className="space-y-4">
          {loading ? (
            <div className="glass-card p-12 text-center text-sm text-muted-foreground">Carregando documentos…</div>
          ) : (
            <SignaturePipeline docs={filtered} />
          )}
        </TabsContent>

        {isLeader && (
          <TabsContent value="dashboard">
            <SignatureDashboard docs={filtered} userNames={userNames} />
          </TabsContent>
        )}

        <TabsContent value="roles">
          <SignatureRolesManager />
        </TabsContent>
      </Tabs>

      {!loading && docs.length === 0 && (
        <div className="glass-card p-8 text-center mt-4">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum documento de assinatura criado ainda. Use o botão de assinatura no chat para enviar o primeiro.
          </p>
        </div>
      )}
    </AppLayout>
  );
}
