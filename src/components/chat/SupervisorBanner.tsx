import { Eye, MessageCircleWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  agentName: string;
  onWhisper: () => void;
}

export function SupervisorBanner({ agentName, onWhisper }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-medium">
        <Eye className="w-4 h-4" />
        Modo Supervisor — observando atendimento de <span className="font-semibold">{agentName}</span>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={onWhisper}>
        <MessageCircleWarning className="w-3.5 h-3.5" />
        Sussurrar
      </Button>
    </div>
  );
}
