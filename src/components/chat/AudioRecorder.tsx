import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Pause, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  onSend: (blob: Blob, durationSec: number) => Promise<void> | void;
}

/** Press-to-record voice note with live waveform + preview before send. */
export function AudioRecorder({ onSend }: Props) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [sending, setSending] = useState(false);
  const [bars, setBars] = useState<number[]>([]);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => () => cleanup(), []);

  const cleanup = () => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    mediaRef.current = null;
  };

  const start = async () => {
    setBlob(null);
    setBars([]);
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: pickMime() });
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mr.mimeType });
        setBlob(b);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = URL.createObjectURL(b);
      };
      mr.start(100);

      // analyser
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      analyserRef.current = an;
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const level = Math.sqrt(sum / buf.length);
        setBars((prev) => {
          const next = [...prev, Math.min(1, level * 2.4)];
          return next.slice(-60);
        });
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();

      tickRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
      setRecording(true);
      setPaused(false);
    } catch (e: any) {
      toast.error(`Não foi possível acessar o microfone: ${e.message || e}`);
    }
  };

  const pickMime = () => {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const c of cands) if (MediaRecorder.isTypeSupported?.(c)) return c;
    return '';
  };

  const stop = () => {
    try { mediaRef.current?.stop(); } catch {}
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    setRecording(false);
    setPaused(false);
  };

  const pause = () => {
    if (!mediaRef.current) return;
    if (mediaRef.current.state === 'recording') { mediaRef.current.pause(); setPaused(true); }
    else if (mediaRef.current.state === 'paused') { mediaRef.current.resume(); setPaused(false); }
  };

  const discard = () => {
    setBlob(null);
    setBars([]);
    setElapsed(0);
    if (previewUrl.current) { URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; }
  };

  const send = async () => {
    if (!blob) return;
    setSending(true);
    try { await onSend(blob, elapsed); discard(); }
    finally { setSending(false); }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!recording && !blob) {
    return (
      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={start} title="Gravar áudio">
        <Mic className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary border border-border">
      {recording && (
        <>
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <button onClick={pause} className="p-1.5 rounded hover:bg-background" title={paused ? 'Retomar' : 'Pausar'}>
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </>
      )}
      <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
        {(bars.length ? bars : Array(40).fill(0.08)).map((v, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm ${recording ? 'bg-destructive' : 'bg-primary'}`}
            style={{ height: `${Math.max(4, v * 100)}%` }}
          />
        ))}
      </div>
      <span className="text-[11px] font-mono tabular-nums text-muted-foreground min-w-[42px] text-right">{fmt(elapsed)}</span>

      {recording ? (
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={stop} title="Parar">
          <Square className="w-4 h-4 fill-current" />
        </Button>
      ) : (
        <>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={discard} title="Descartar">
            <Trash2 className="w-4 h-4" />
          </Button>
          {previewUrl.current && (
            <audio src={previewUrl.current} controls className="h-7 w-32" />
          )}
          <Button type="button" size="icon" className="h-8 w-8 rounded-full" onClick={send} disabled={sending} title="Enviar">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </>
      )}
    </div>
  );
}
