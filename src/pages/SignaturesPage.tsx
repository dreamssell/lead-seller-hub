import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Download, FileText, Filter, KanbanSquare, RefreshCcw, Search, ShieldCheck, BarChart3, FileSpreadsheet, Table as TableIcon, Radio } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SignaturePipeline, type PipelineDoc } from '@/components/signature/SignaturePipeline';
import { SignatureRolesManager } from '@/components/signature/SignatureRolesManager';
import { SignatureDashboard } from '@/components/signature/SignatureDashboard';
import { SignatureDocumentsTable } from '@/components/signature/SignatureDocumentsTable';
import { SignatureRoleAuditLog } from '@/components/signature/SignatureRoleAuditLog';
import { ExportColumnPicker } from '@/components/signature/ExportColumnPicker';
import { exportSignaturesCSV, exportSignaturesPDF, DEFAULT_EXPORT_COLUMNS, type ExportColumnKey } from '@/lib/signatureExport';

type Doc = PipelineDoc & {
  owner_id: string;
  sub_company_id: string | null;
  created_by: string;
};

type EnrichedDoc = Doc & {
  creator_name?: string | null;
  creator_role?: string | null;
  sub_company_name?: string | null;
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

const ROLE_OPTS = [
  { value: 'all', label: 'Todos os cargos' },
  { value: 'agente', label: 'Agente' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'coordenador', label: 'Coordenador' },
  { value: 'diretor', label: 'Diretor' },
  { value: 'none', label: 'Sem cargo' },
];

export default function SignaturesPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLeader, setIsLeader] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [subNames, setSubNames] = useState<Record<string, string>>({});
  const [exportCols, setExportCols] = useState<ExportColumnKey[]>(DEFAULT_EXPORT_COLUMNS);
  const [realtime, setRealtime] = useState(true);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [subFilter, setSubFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('signature_documents')
      .select('id,title,signer_name,signer_email,status,method,created_at,signed_at,expires_at,owner_id,sub_company_id,created_by')
      .order('created_at', { ascending: false })
      .limit(1000);
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

    const userIds = Array.from(new Set(list.map((d) => d.created_by)));
    const subIds = Array.from(new Set(list.map((d) => d.sub_company_id).filter(Boolean) as string[]));

    const [profsRes, allRolesRes, subsRes] = await Promise.all([
      userIds.length ? supabase.from('profiles').select('user_id,display_name,email').in('user_id', userIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? supabase.from('user_signature_roles').select('user_id,role').in('user_id', userIds) : Promise.resolve({ data: [] as any[] }),
      subIds.length ? supabase.from('sub_companies').select('id,name').in('id', subIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const nameMap: Record<string, string> = {};
    (profsRes.data || []).forEach((p: any) => (nameMap[p.user_id] = p.display_name || p.email || p.user_id.slice(0, 8)));
    setUserNames(nameMap);

    // Pick highest role per user (diretor > coordenador > supervisor > agente)
    const order: Record<string, number> = { diretor: 4, coordenador: 3, supervisor: 2, agente: 1 };
    const roleMap: Record<string, string> = {};
    (allRolesRes.data || []).forEach((r: any) => {
      if (!roleMap[r.user_id] || (order[r.role] || 0) > (order[roleMap[r.user_id]] || 0)) {
        roleMap[r.user_id] = r.role;
      }
    });
    setUserRoles(roleMap);

    const subMap: Record<string, string> = {};
    (subsRes.data || []).forEach((s: any) => (subMap[s.id] = s.name));
    setSubNames(subMap);

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !realtime) return;
    const channel = supabase
      .channel('signature_docs_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signature_documents' }, (payload: any) => {
        setDocs((prev) => {
          if (payload.eventType === 'INSERT') {
            if (prev.some((d) => d.id === payload.new.id)) return prev;
            return [payload.new as Doc, ...prev];
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map((d) => (d.id === payload.new.id ? { ...d, ...payload.new } : d));
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter((d) => d.id !== payload.old.id);
          }
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, realtime]);

  const enriched: EnrichedDoc[] = useMemo(
    () => docs.map((d) => ({
      ...d,
      creator_name: userNames[d.created_by] ?? null,
      creator_role: userRoles[d.created_by] ?? null,
      sub_company_name: d.sub_company_id ? subNames[d.sub_company_id] ?? null : null,
    })),
    [docs, userNames, userRoles, subNames],
  );

  const filtered = useMemo(() => {
    return enriched.filter((d) => {
      if (status !== 'all' && d.status !== status) return false;
      if (method !== 'all' && d.method !== method) return false;
      if (subFilter !== 'all') {
        if (subFilter === 'none' && d.sub_company_id) return false;
        if (subFilter !== 'none' && d.sub_company_id !== subFilter) return false;
      }
      if (roleFilter !== 'all') {
        const r = d.creator_role;
        if (roleFilter === 'none' && r) return false;
        if (roleFilter !== 'none' && r !== roleFilter) return false;
      }
      if (from && new Date(d.created_at) < new Date(from)) return false;
      if (to && new Date(d.created_at) > new Date(to + 'T23:59:59')) return false;
      if (q) {
        const t = q.toLowerCase();
        const hit = [d.title, d.signer_name, d.signer_email, d.creator_name].filter(Boolean).some((v) => v!.toLowerCase().includes(t));
        if (!hit) return false;
      }
      return true;
    });
  }, [enriched, status, method, subFilter, roleFilter, from, to, q]);

  const subOptions = useMemo(() => Object.entries(subNames).map(([id, name]) => ({ id, name })), [subNames]);

  const filterSummary = {
    Status: STATUS_OPTS.find((s) => s.value === status)?.label || '',
    Método: METHOD_OPTS.find((m) => m.value === method)?.label || '',
    'Sub-empresa': subFilter === 'all' ? '' : subFilter === 'none' ? 'Sem sub-empresa' : subNames[subFilter] || subFilter,
    'Cargo do criador': roleFilter === 'all' ? '' : ROLE_OPTS.find((r) => r.value === roleFilter)?.label || '',
    De: from,
    Até: to,
    Busca: q,
  };

  return (
    <AppLayout title="Assinaturas" subtitle="Central de acompanhamento, equipe e relatórios">
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline"><KanbanSquare className="w-3.5 h-3.5 mr-1.5" /> Pipeline</TabsTrigger>
          <TabsTrigger value="list"><TableIcon className="w-3.5 h-3.5 mr-1.5" /> Lista</TabsTrigger>
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
            <button
              onClick={() => setRealtime((v) => !v)}
              className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${realtime ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10' : 'border-border text-muted-foreground'}`}
              title="Atualizações em tempo real"
            >
              <Radio className={`w-3 h-3 ${realtime ? 'animate-pulse' : ''}`} /> {realtime ? 'Ao vivo' : 'Pausado'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <div className="md:col-span-3 relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar título, signatário, criador…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>{METHOD_OPTS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={subFilter} onValueChange={setSubFilter}>
              <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Sub-empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as sub-empresas</SelectItem>
                <SelectItem value="none">Sem sub-empresa</SelectItem>
                {subOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Cargo do criador" /></SelectTrigger>
              <SelectContent>{ROLE_OPTS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={load} className="md:col-span-1"><RefreshCcw className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mt-2">
            <div className="md:col-span-3 relative">
              <CalendarIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pl-8" placeholder="De" />
            </div>
            <div className="md:col-span-3 relative">
              <CalendarIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pl-8" placeholder="Até" />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
            <span className="text-xs text-muted-foreground mr-auto">Exportar filtrados:</span>
            <ExportColumnPicker value={exportCols} onChange={setExportCols} />
            <Button size="sm" variant="outline" onClick={() => exportSignaturesCSV(filtered, exportCols)} disabled={!filtered.length || !exportCols.length}>
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
            <Button size="sm" onClick={() => exportSignaturesPDF(filtered, filterSummary, exportCols)} disabled={!filtered.length || !exportCols.length}>
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

        <TabsContent value="list">
          {loading ? (
            <div className="glass-card p-12 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <SignatureDocumentsTable docs={filtered} />
          )}
        </TabsContent>

        {isLeader && (
          <TabsContent value="dashboard">
            <SignatureDashboard docs={filtered} userNames={userNames} subNames={subNames} />
          </TabsContent>
        )}

        <TabsContent value="roles" className="space-y-4">
          <SignatureRolesManager />
          <SignatureRoleAuditLog />
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
