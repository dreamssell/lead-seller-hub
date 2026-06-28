import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const ROWS: Array<[string, string]> = [
  ['Enter', 'Enviar mensagem'],
  ['Shift + Enter', 'Nova linha'],
  ['Ctrl/⌘ + Enter', 'Enviar (sempre)'],
  ['Ctrl/⌘ + B', 'Negrito'],
  ['Ctrl/⌘ + I', 'Itálico'],
  ['/', 'Abrir respostas rápidas'],
  ['Ctrl/⌘ + K', 'Buscar conversa'],
  ['Ctrl/⌘ + /', 'Mostrar atalhos'],
  ['Esc', 'Fechar / cancelar'],
  ['↑ (composer vazio)', 'Editar última mensagem enviada'],
];

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function KeyboardShortcutsHelp({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos do atendente</DialogTitle>
          <DialogDescription>Acelere o atendimento com o teclado.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {ROWS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted-foreground">{v}</span>
              <kbd className="px-2 py-0.5 rounded bg-secondary border border-border font-mono text-[11px]">{k}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
