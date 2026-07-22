import { ArrowLeftRight, Workflow, User as UserIcon, Lock } from 'lucide-react';

type Meta = {
  kind?: string;
  notice_type?: 'transfer_user' | 'transfer_flow';
  actor_name?: string | null;
  target_name?: string | null;
  target_stage_label?: string | null;
  reason?: string | null;
};

export function isInternalNoticeMessage(metadata: any): boolean {
  return !!(metadata && typeof metadata === 'object' && metadata.kind === 'internal_notice');
}

export function InternalNoticeBubble({
  metadata,
  createdAt,
}: {
  metadata: Meta;
  createdAt?: string | null;
}) {
  const isFlow = metadata.notice_type === 'transfer_flow';
  const Icon = isFlow ? Workflow : UserIcon;
  const dateObj = createdAt ? new Date(createdAt) : null;
  const timeLabel = dateObj
    ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const fullLabel = dateObj
    ? dateObj.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : null;

  const title = isFlow
    ? `Movida para o fluxo: ${metadata.target_stage_label || '—'}`
    : `Transferida para ${metadata.target_name || 'colega'}`;

  return (
    <div className="flex justify-center my-1">
      <div
        className="inline-flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-xs max-w-[85%]"
        title={fullLabel ? `Nota interna — ${fullLabel}` : 'Nota interna — o cliente não vê esta mensagem'}
      >
        <div className="flex items-center gap-1.5 text-foreground/90">
          <ArrowLeftRight className="w-3 h-3 text-primary" />
          <Icon className="w-3 h-3 text-primary" />
          <span className="font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap justify-center">
          <Lock className="w-2.5 h-2.5" />
          <span>Nota interna</span>
          {metadata.actor_name && <span>· por {metadata.actor_name}</span>}
          {fullLabel && <span title={fullLabel}>· {fullLabel}</span>}
          {!fullLabel && timeLabel && <span>· {timeLabel}</span>}
        </div>
        {metadata.reason && (
          <div className="text-[11px] text-muted-foreground italic mt-0.5 text-center">
            "{metadata.reason}"
          </div>
        )}
      </div>
    </div>
  );
}

