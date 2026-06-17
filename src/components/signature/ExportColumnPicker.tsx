import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Columns3 } from 'lucide-react';
import { ALL_EXPORT_COLUMNS, type ExportColumnKey } from '@/lib/signatureExport';

interface Props {
  value: ExportColumnKey[];
  onChange: (cols: ExportColumnKey[]) => void;
}

export function ExportColumnPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const toggle = (k: ExportColumnKey) =>
    onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Columns3 className="w-3.5 h-3.5 mr-1.5" /> Colunas ({value.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Colunas do export</p>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {ALL_EXPORT_COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/40 rounded px-1.5 py-1">
              <Checkbox checked={value.includes(c.key)} onCheckedChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        <div className="flex gap-1 mt-3 pt-2 border-t border-border">
          <Button size="sm" variant="ghost" className="text-xs h-7 flex-1" onClick={() => onChange(ALL_EXPORT_COLUMNS.map((c) => c.key))}>
            Todas
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7 flex-1" onClick={() => onChange([])}>
            Nenhuma
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
