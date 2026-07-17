import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff } from 'lucide-react';
import { formatDuration } from '@/lib/callHistory';

type Meta = {
  kind?: string;
  call_status?: string;
  direction?: string;
  duration_seconds?: number | null;
  wavoip_call_id?: string | null;
  phone?: string | null;
};

export function isCallEventMessage(metadata: any): boolean {
  return !!(metadata && typeof metadata === 'object' && metadata.kind === 'call_event');
}

export function CallEventBubble({
  metadata,
  createdAt,
  onCallBack,
}: {
  metadata: Meta;
  createdAt?: string | null;
  onCallBack?: () => void;
}) {
  const status = String(metadata.call_status || '').toLowerCase();
  const isInbound = metadata.direction === 'inbound';
  const missed = status === 'missed' || status === 'rejected' || status === 'failed';
  const answered = !missed && (metadata.duration_seconds ?? 0) > 0;

  let title = 'Ligação de voz';
  let Icon = isInbound ? PhoneIncoming : PhoneOutgoing;
  let tone = 'text-muted-foreground';

  if (missed) {
    if (status === 'failed' || status === 'rejected') {
      title = isInbound ? 'Ligação de voz recusada' : 'Ligação de voz não completada';
      Icon = PhoneOff;
      tone = 'text-destructive';
    } else {
      title = isInbound ? 'Ligação de voz perdida' : 'Ligação de voz não atendida';
      Icon = PhoneMissed;
      tone = 'text-destructive';
    }
  } else if (answered) {
    title = isInbound ? 'Ligação de voz recebida' : 'Ligação de voz efetuada';
    Icon = isInbound ? PhoneIncoming : PhoneOutgoing;
  } else {
    Icon = Phone;
  }

  const durationLabel = answered && metadata.duration_seconds
    ? formatDuration(metadata.duration_seconds)
    : null;

  const timeLabel = createdAt
    ? new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex justify-center my-1">
      <button
        type="button"
        onClick={onCallBack}
        disabled={!onCallBack}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/70 backdrop-blur-sm text-xs shadow-sm ${
          onCallBack ? 'hover:bg-secondary cursor-pointer' : 'cursor-default'
        }`}
        title={onCallBack ? 'Toque para retornar' : title}
      >
        <Icon className={`w-3.5 h-3.5 ${tone}`} />
        <span className="font-medium text-foreground">{title}</span>
        {durationLabel && (
          <span className="text-muted-foreground">· {durationLabel}</span>
        )}
        {missed && onCallBack && (
          <span className="text-primary font-medium">· Toque para retornar</span>
        )}
        {timeLabel && (
          <span className="text-muted-foreground/70 ml-1">{timeLabel}</span>
        )}
      </button>
    </div>
  );
}
