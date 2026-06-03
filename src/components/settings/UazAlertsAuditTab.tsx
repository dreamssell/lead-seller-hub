import { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  Loader2, 
  Filter, 
  Calendar,
  Download,
  FileSpreadsheet,
  Building,
  Hash,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function UazAlertsAuditTab() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTenant, setFilterTenant] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [tenants, setTenants] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsRes, alertsRes] = await Promise.all([
        supabase.from('sub_companies').select('id, name'),
        supabase.from('uaz_alerts_history')
          .select('*, sub_companies(name)')
          .order('created_at', { ascending: false })
      ]);

      if (tenantsRes.data) setTenants(tenantsRes.data);
      
      let filtered = alertsRes.data || [];
      if (filterTenant !== 'all') filtered = filtered.filter(a => a.tenant_id === filterTenant);
      if (filterChannel !== 'all') filtered = filtered.filter(a => a.channel_type === filterChannel);
      
      setAlerts(filtered);
    } catch (err: any) {
      toast.error('Erro ao carregar auditoria: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterTenant, filterChannel]);

  const exportCSV = () => {
    if (alerts.length === 0) return toast.error('Sem dados para exportar');
    
    const headers = ['Data', 'Tenant', 'Canal', 'Tipo', 'Severidade', 'Mensagem', 'Resultado Remediação'];
    const rows = alerts.map(a => [
      new Date(a.created_at).toLocaleString(),
      a.sub_companies?.name || 'Sistema',
      a.channel_type,
      a.alert_type,
      a.severity,
      a.message,
      a.remediation_result || 'N/A'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uaz_alerts_audit_${new Date().getTime()}.csv`;
    link.click();
    toast.success('Auditoria exportada em CSV');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
          <Activity className="w-4 h-4" /> Histórico de Alertas e Auditoria
        </h3>
        <div className="flex items-center gap-2">
          <select 
            value={filterTenant} 
            onChange={(e) => setFilterTenant(e.target.value)}
            className="bg-secondary/50 border border-border/40 rounded px-2 py-1 text-xs"
          >
            <option value="all">Todos Tenants</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select 
            value={filterChannel} 
            onChange={(e) => setFilterChannel(e.target.value)}
            className="bg-secondary/50 border border-border/40 rounded px-2 py-1 text-xs"
          >
            <option value="all">Todos Canais</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="voip">VoIP</option>
            <option value="video">Vídeo</option>
          </select>
          <Button variant="outline" size="sm" className="h-8 gap-2" onClick={exportCSV}>
            <Download className="w-3 h-3" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Horário</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-48 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto opacity-50" /></TableCell></TableRow>
            ) : alerts.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Nenhum alerta registrado.</TableCell></TableRow>
            ) : (
              alerts.map(alert => (
                <TableRow key={alert.id} className="text-[11px]">
                  <TableCell className="whitespace-nowrap font-medium">{new Date(alert.created_at).toLocaleString()}</TableCell>
                  <TableCell className="flex items-center gap-2"><Building className="w-3 h-3 opacity-50" /> {alert.sub_companies?.name || 'Sistema'}</TableCell>
                  <TableCell className="uppercase">{alert.channel_type}</TableCell>
                  <TableCell className="max-w-xs truncate" title={alert.message}>{alert.message}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'outline'} className="text-[9px]">
                        {alert.severity}
                      </Badge>
                      {alert.remediated_at && (
                        <Badge variant="secondary" className="bg-success/10 text-success border-success/20 text-[9px]">
                          Remediado
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
