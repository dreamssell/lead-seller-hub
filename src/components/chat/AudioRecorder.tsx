import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Pause, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
// opus-recorder produz OGG/Opus REAL (libopus WASM), o único container/codec
// que o WhatsApp aceita para voice notes. Antes usávamos MediaRecorder do
// browser que gera audio/webm;codecs=opus — mesmo re-rotulando o MIME para
// audio/ogg antes de enviar, o container continuava sendo WebM (EBML) e o
// destinatário via a mensagem como "áudio que não pode ser ouvido".
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — sem tipagens oficiais
import Recorder from 'opus-recorder';
import encoderPath from 'opus-recorder/dist/encoderWorker.min.js?url';

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
  const recorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => () => cleanup(), []);

  const cleanup = () => {
    try { recorderRef.current?.close?.(); } catch { /* noop */ }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  };

  const start = async () => {
    setBlob(null);
    setBars([]);
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Configuração alinhada ao WhatsApp: mono, 48kHz, VoIP application, ~32kbps.
      const rec = new Recorder({
        encoderPath,
        encoderSampleRate: 48000,
        numberOfChannels: 1,
        streamPages: false,
        encoderApplication: 2048, // VoIP
        encoderBitRate: 32000,
        resampleQuality: 3,
        sourceNode: undefined,
      });
      recorderRef.current = rec;

      rec.ondataavailable = (typedArray: Uint8Array) => {
        const oggBlob = new Blob([typedArray.slice().buffer], { type: 'audio/ogg; codecs=opus' });
        setBlob(oggBlob);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = URL.createObjectURL(oggBlob);
      };

      await rec.start();

      // Analyser para waveform ao vivo (independente do encoder).
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

  const stop = async () => {
    try { await recorderRef.current?.stop?.(); } catch { /* noop */ }
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    setRecording(false);
    setPaused(false);
  };

  const pause = () => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state === 'recording') { r.pause?.(); setPaused(true); }
    else if (r.state === 'paused') { r.resume?.(); setPaused(false); }
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
