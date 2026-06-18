import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export type FieldMap = { source: string; target: string; required?: boolean };

const LEAD_TARGETS = [
  'name', 'email', 'phone', 'document', 'source', 'channel', 'pipeline_id',
  'stage_id', 'owner_id', 'tags', 'notes', 'vehicle', 'budget', 'custom.utm_source',
  'custom.utm_medium', 'custom.utm_campaign',
];

const PRESETS: Record<string, FieldMap[]> = {
  holmes: [
    { source: 'lead.full_name', target: 'name', required: true },
    { source: 'lead.email', target: 'email' },
    { source: 'lead.phone', target: 'phone', required: true },
    { source: 'lead.source', target: 'source' },
    { source: 'campaign.utm_source', target: 'custom.utm_source' },
  ],
  dealerspace: [
    { source: 'customer.name', target: 'name', required: true },
    { source: 'customer.email', target: 'email' },
    { source: 'customer.phone', target: 'phone', required: true },
    { source: 'vehicle.model', target: 'vehicle' },
    { source: 'lead.origin', target: 'source' },
  ],
};

const STORAGE_KEY = 'automations.fieldmaps.v1';

function load(): Record<string, FieldMap[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function save(data: Record<string, FieldMap[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function FieldMappingDialog({
  open, onOpenChange, integrationId, integrationName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  integrationId: string;
  integrationName: string;
}) {
  const [maps, setMaps] = useState<FieldMap[]>([]);

  useEffect(() => {
    if (!open) return;
    const all = load();
    setMaps(all[integrationId] ?? PRESETS[integrationId] ?? []);
  }, [open, integrationId]);

  const add = () => setMaps((p) => [...p, { source: '', target: '' }]);
  const update = (i: number, patch: Partial<FieldMap>) =>
    setMaps((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) => setMaps((p) => p.filter((_, idx) => idx !== i));

  const persist = () => {
    const cleaned = maps.filter((m) => m.source.trim() && m.target.trim());
    const all = load();
    all[integrationId] = cleaned;
    save(all);
    toast({ title: 'Mapeamento salvo', description: `${cleaned.length} campo(s) para ${integrationName}.` });
    onOpenChange(false);
  };

  const restorePreset = () => {
    setMaps(PRESETS[integrationId] ?? []);
    toast({ title: 'Preset restaurado' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mapeamento de campos — {integrationName}</DialogTitle>
          <DialogDescription>
            Defina como cada campo do payload recebido deve ser gravado no Lead. Use notação de ponto (ex.: <code>lead.email</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">Origem ({integrationName})</Badge>
          <ArrowRight className="w-3 h-3" />
          <Badge>Destino (Lead)</Badge>
          <Button variant="ghost" size="sm" onClick={restorePreset} className="ml-auto">Restaurar preset</Button>
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 text-[11px] text-muted-foreground px-1">
            <span>Campo origem</span><span /><span>Campo destino</span><span />
          </div>
          {maps.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
              <Input
                placeholder="ex.: lead.email"
                value={m.source}
                onChange={(e) => update(i, { source: e.target.value })}
              />
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ex.: email"
                list={`targets-${i}`}
                value={m.target}
                onChange={(e) => update(i, { target: e.target.value })}
              />
              <datalist id={`targets-${i}`}>
                {LEAD_TARGETS.map((t) => <option key={t} value={t} />)}
              </datalist>
              <Button variant="ghost" size="icon" onClick={() => remove(i)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
          {!maps.length && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum mapeamento. Clique em "Adicionar campo".</p>
          )}
        </div>

        <div>
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="w-4 h-4 mr-2" /> Adicionar campo
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <Label className="text-xs">Pré-visualização do mapeamento</Label>
          <pre className="text-[11px] mt-2 overflow-x-auto">
{JSON.stringify(
  maps.reduce((acc, m) => {
    if (m.source && m.target) acc[m.target] = `<< ${m.source} >>`;
    return acc;
  }, {} as Record<string, string>),
  null, 2,
)}
          </pre>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={persist}>Salvar mapeamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
