import { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function UazIncidentsTab() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('uaz_incidents')
        .select('*, customers(name, phone)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIncidents(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar incidentes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const resolveIncident = async (id: string) => {
    const { error } = await supabase
      .from('uaz_incidents')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) toast.error('Erro ao resolver');
    else {
      toast.success('Incidente resolvido');
      loadIncidents();
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold uppercase text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Incidentes que Esgotaram Retentativas
        </h3>
      </div>

      <div className="glass-card overflow-hidden border-destructive/20">
        <Table>
          <TableHeader className="bg-destructive/5">
            <TableRow>
              <TableHead>Aberto em</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Causa Final</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-48 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-destructive/50" /></TableCell></TableRow>
            ) : incidents.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">Nenhum incidente crítico aberto.</TableCell></TableRow>
            ) : (
              incidents.map(incident => (
                <TableRow key={incident.id} className="text-xs">
                  <TableCell className="whitespace-nowrap font-medium">{new Date(incident.created_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{incident.customers?.name || 'Sistema'} <span className="text-muted-foreground block text-[10px]">{incident.customers?.phone}</span></TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-destructive">{incident.cause}</TableCell>
                  <TableCell>
                    <Badge variant={incident.status === 'open' ? 'destructive' : 'outline'} className={incident.status === 'resolved' ? 'text-success border-success/30' : ''}>
                      {incident.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {incident.status === 'open' && (
                      <Button variant="outline" size="sm" className="h-7 text-[10px] gap-2 border-success/30 text-success hover:bg-success/10" onClick={() => resolveIncident(incident.id)}>
                        <CheckCircle2 className="w-3 h-3" /> Resolver
                      </Button>
                    )}
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
