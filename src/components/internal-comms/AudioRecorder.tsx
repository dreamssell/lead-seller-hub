/**
 * AudioRecorder — botão de microfone para Comunicação Interna.
 *
 * Fluxo: clicar inicia a captura via MediaRecorder (audio/webm; codecs=opus,
 * com fallback ao mimeType default do browser). Enquanto grava, mostra o
 * tempo decorrido, ondas visuais simples derivadas de AnalyserNode e dois
 * botões: cancelar (X) e enviar (✓). Ao enviar, entrega o Blob + duração
 * em ms para o pai. Não uploads sozinho — deixa o hook cuidar disso.
 *
 * Acessibilidade: rótulos aria-label distintos por estado (Gravar/Enviar/
 * Cancelar), foco visível e teclas Enter/Space nativas do <button>.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MAX_ATTACHMENT_BYTES } from '@/lib/internalCommsAttachments';

/** Limite de duração da gravação (5 minutos). Acima disso paramos e alertamos. */
export const MAX_AUDIO_DURATION_MS = 5 * 60 * 1000;
/** Limite de tamanho por gravação em bytes (usa o mesmo teto de anexos). */
export const MAX_AUDIO_BYTES = MAX_ATTACHMENT_BYTES;

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Escolhe o melhor container/codec suportado pelo browser atual.
function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const c of candidates) {
    // @ts-ignore - isTypeSupported existe no browser
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export function AudioRecorder({
  disabled,
  onRecorded,
}: {
  disabled?: boolean;
  onRecorded: (payload: { blob: Blob; mime: string; durationMs: number }) => void | Promise<void>;
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'finalizing'>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTsRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const shouldEmitRef = useRef<boolean>(false);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    analyserRef.current = null;
    mediaRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startRecording = useCallback(async () => {
    if (state !== 'idle' || disabled) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Seu navegador não suporta gravação de áudio.');
      return;
    }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          // Auto-stop se ultrapassar o teto de tamanho (defesa antes do teto de tempo).
          const total = chunksRef.current.reduce((n, c: any) => n + (c.size || 0), 0);
          if (total > MAX_AUDIO_BYTES && mediaRef.current && mediaRef.current.state !== 'inactive') {
            toast.error(`Gravação atingiu o limite de ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB. Enviando o que foi gravado.`);
            shouldEmitRef.current = true;
            try { mediaRef.current.stop(); } catch {}
          }
        }
      };
      rec.onstop = async () => {
        const durationMs = Date.now() - startTsRef.current;
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setState('finalizing');
        try {
          if (shouldEmitRef.current) {
            if (blob.size <= 500) {
              toast.error('Gravação muito curta.');
            } else if (blob.size > MAX_AUDIO_BYTES) {
              toast.error(`Áudio excede ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB e não será enviado.`);
            } else {
              await onRecorded({ blob, mime: type, durationMs });
            }
          }
        } finally {
          shouldEmitRef.current = false;
          cleanup();
          setState('idle');
          setElapsedMs(0);
          setLevel(0);
        }
      };

      // Analyser p/ nível visual.
      const AudioCtx: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2));
        const el = Date.now() - startTsRef.current;
        setElapsedMs(el);
        // Auto-stop ao atingir o limite de duração.
        if (el >= MAX_AUDIO_DURATION_MS && mediaRef.current && mediaRef.current.state !== 'inactive') {
          toast.error(`Gravação atingiu o limite de ${Math.round(MAX_AUDIO_DURATION_MS / 60000)} min. Enviando…`);
          shouldEmitRef.current = true;
          try { mediaRef.current.stop(); } catch {}
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };


      rec.start(250);
      startTsRef.current = Date.now();
      setState('recording');
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      cleanup();
      setState('idle');
      const msg = err?.name === 'NotAllowedError'
        ? 'Permissão de microfone negada. Autorize no navegador para gravar.'
        : `Não foi possível iniciar a gravação: ${err?.message || 'erro desconhecido'}`;
      toast.error(msg);
    }
  }, [cleanup, disabled, onRecorded, state]);

  const stop = useCallback((emit: boolean) => {
    if (!mediaRef.current) return;
    shouldEmitRef.current = emit;
    try { mediaRef.current.stop(); } catch {}
  }, []);

  if (state === 'idle') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Gravar mensagem de áudio"
        title="Gravar áudio"
        onClick={startRecording}
        disabled={disabled}
      >
        <Mic className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded-lg bg-destructive/10 border border-destructive/30"
      role="status"
      aria-live="polite"
    >
      <span className="relative inline-flex w-2 h-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
      </span>
      <span className="text-xs font-medium tabular-nums text-destructive">{fmt(elapsedMs)}</span>
      <div className="w-16 h-2 bg-destructive/20 rounded-full overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-destructive transition-[width] duration-75"
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cancelar gravação"
        onClick={() => stop(false)}
        disabled={state !== 'recording'}
      >
        <X className="w-4 h-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        aria-label="Enviar áudio"
        onClick={() => stop(true)}
        disabled={state !== 'recording'}
      >
        {state === 'finalizing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </Button>
    </div>
  );
}
