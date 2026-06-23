import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LANDING_TEMPLATES, type LandingTemplate } from '@/lib/landingTemplates';
import { Sparkles } from 'lucide-react';

const SHAPE_CLASS: Record<string, string> = { rounded: 'rounded-md', square: 'rounded-none', pill: 'rounded-full' };

export function TemplatePickerDialog({
  open, onOpenChange, onApply,
}: { open: boolean; onOpenChange: (o: boolean) => void; onApply: (t: LandingTemplate) => void }) {
  const [selected, setSelected] = useState<LandingTemplate | null>(null);

  const apply = () => { if (selected) { onApply(selected); onOpenChange(false); setSelected(null); } };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Escolha um template</DialogTitle>
          <DialogDescription>Comece com um layout pronto e personalize depois. Os botões, cores e textos podem ser editados livremente.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {LANDING_TEMPLATES.map(t => {
            const active = selected?.id === t.id;
            const align = t.page.align === 'left' ? 'items-start text-left' : t.page.align === 'right' ? 'items-end text-right' : 'items-center text-center';
            return (
              <Card key={t.id} className={`cursor-pointer transition-all ${active ? 'ring-2 ring-primary' : 'hover:shadow-lg'}`} onClick={() => setSelected(t)}>
                <div
                  className={`flex flex-col justify-center px-3 py-5 rounded-t-lg h-44 overflow-hidden ${align}`}
                  style={{ background: t.page.page_bg_color, color: t.page.text_color }}
                >
                  <p className="text-sm font-bold leading-tight line-clamp-2">{t.page.headline}</p>
                  <p className="text-[10px] opacity-80 mt-1 line-clamp-2">{t.page.subheadline}</p>
                  <div className="space-y-1 mt-2 w-full">
                    {t.buttons.slice(0, 2).map((b, i) => (
                      <div key={i} className={`text-[10px] py-1.5 px-2 font-semibold ${SHAPE_CLASS[b.shape]}`} style={{ background: b.bg_color, color: b.text_color }}>
                        {b.label}
                      </div>
                    ))}
                  </div>
                </div>
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{t.name}</p>
                    <Badge variant="outline" className="text-[10px]">{t.buttons.length} CTA{t.buttons.length > 1 ? 's' : ''}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!selected} onClick={apply}>Aplicar template{selected ? `: ${selected.name}` : ''}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
