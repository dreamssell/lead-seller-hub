/**
 * Ficha completa do Lead — exibe dados cadastrais, comerciais, origem
 * e TODAS as informações recebidas via webhook (dados de compra etc.).
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { leadSourceLabel } from '@/lib/leadSource';
import { Copy, Loader2, FileJson } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId?: string | null;
  /** Lead já carregado (evita nova consulta). */
  lead?: any;
}

const money = (v: any) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  new: 'Novo',
  em_atendimento: 'Em atendimento',
  ganho: 'Ganho',
  perdido: 'Perdido',
};

/** Achata objetos aninhados em pares rótulo → valor legíveis. */
function flatten(value: any, prefix = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (value === null || value === undefined || value === '') return out;
  if (Array.isArray(value)) {
    if (!value.length) return out;
    value.forEach((v, i) => flatten(v, `${prefix}[${i + 1}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => flatten(v, prefix ? `${prefix} › ${k}` : k, out));
    return out;
  }
  out.push([prefix || 'valor', String(value)]);
  return out;
}

export function LeadDossierDialog({ open, onOpenChange, leadId, lead: leadProp }: Props) {
  const [lead, setLead] = useState<any>(leadProp ?? null);
  const [loading, setLoading] = useState(false);
  const [pipelineName, setPipelineName] = useState<string>('');
  const [stageName, setStageName] = useState<string>('');

  useEffect(() => { if (leadProp) setLead(leadProp); }, [leadProp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !leadId || (leadProp && leadProp.id === leadId)) return;
      setLoading(true);
      const { data } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
      if (!cancelled) { setLead(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, leadId, leadProp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !lead) return;
      const [p, s] = await Promise.all([
        lead.pipeline_id ? supabase.from('pipelines').select('name').eq('id', lead.pipeline_id).maybeSingle() : Promise.resolve({ data: null } as any),
        lead.stage_id ? supabase.from('pipeline_stages').select('name').eq('id', lead.stage_id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;
      setPipelineName((p.data as any)?.name || '');
      setStageName((s.data as any)?.name || '');
    })();
    return () => { cancelled = true; };
  }, [open, lead]);

  const raw = lead?.raw_payload ?? null;
  const rawRows = raw ? flatten(raw) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border text-left">
          <DialogTitle className="flex items-center gap-2">
            Ficha do Lead — {lead?.name || '—'}
          </DialogTitle>
          <DialogDescription>
            Todas as informações capturadas pelo webhook, incluindo dados de compra.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando ficha…
            </div>
          ) : !lead ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Lead não encontrado.</p>
          ) : (
            <div className="px-6 py-5 space-y-6">
              <Section title="Identificação">
                <Field label="Nome" value={lead.name} />
                <Field label="E-mail" value={lead.email} />
                <Field label="Telefone" value={lead.phone} />
                <Field label="Canal" value={lead.channel} />
              </Section>

              <Section title="Origem">
                <Field label="Plataforma" value={leadSourceLabel(lead.source)} />
                <Field label="Origem bruta" value={lead.source} />
                <Field label="Recebido em" value={lead.created_at ? new Date(lead.created_at).toLocaleString('pt-BR') : ''} />
                <Field label="Consolidado" value={lead.duplicate_of ? 'Duplicado (vinculado ao original)' : 'Registro principal'} />
              </Section>

              <Section title="Comercial">
                <Field label="Status" value={STATUS_LABEL[lead.status] || lead.status} />
                <Field label="Valor estimado" value={money(lead.estimated_value)} />
                <Field label="Funil" value={pipelineName} />
                <Field label="Etapa" value={stageName} />
              </Section>

              {lead.notes && (
                <Section title="Observações" single>
                  <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                </Section>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Dados de compra e payload do webhook
                  </h4>
                  {raw && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
                        toast.success('Payload copiado');
                      }}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar JSON
                    </Button>
                  )}
                </div>
                {!raw ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4">
                    Nenhum payload bruto armazenado para este Lead (capturado antes desta integração).
                  </p>
                ) : (
                  <>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {rawRows.map(([k, v]) => (
                        <div key={k} className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-1 px-3 py-2">
                          <span className="text-xs text-muted-foreground break-words">{k}</span>
                          <span className="text-sm break-words">{v}</span>
                        </div>
                      ))}
                    </div>
                    <details className="mt-3">
                      <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5">
                        <FileJson className="w-3.5 h-3.5" /> Ver JSON completo
                      </summary>
                      <pre className="mt-2 text-[11px] bg-muted rounded-lg p-3 overflow-x-auto">
                        {JSON.stringify(raw, null, 2)}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children, single }: { title: string; children: React.ReactNode; single?: boolean }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      <div className={single ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm break-words">{value || '—'}</p>
    </div>
  );
}
