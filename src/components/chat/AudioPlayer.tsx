import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Download, Loader2, AlertCircle, RotateCcw, Scissors, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  url: string;
  mine?: boolean;
  filename?: string | null;
  duration?: number | null;
}

const SPEEDS = [1, 1.5, 2, 0.75] as const;
const GAINS = [1, 1.5, 2, 3] as const;
const SPEED_STORAGE_KEY = 'chat_audio_player_speed_idx';
const GAIN_STORAGE_KEY = 'chat_audio_player_gain_idx';
const POSITION_STORAGE_PREFIX = 'chat_audio_pos::';
const RANGE_STORAGE_PREFIX = 'chat_audio_range::';
const BARS = 32;

function loadGainIdx(): number {
  try {
    const raw = localStorage.getItem(GAIN_STORAGE_KEY);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n < GAINS.length) return n;
  } catch {}
  return 0;
}

function loadSpeedIdx(): number {
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n < SPEEDS.length) return n;
  } catch {}
  return 0;
}

function loadPosition(url: string): number {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_PREFIX + url);
    if (!raw) return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}

function savePosition(url: string, t: number) {
  try {
    if (t <= 0.5) localStorage.removeItem(POSITION_STORAGE_PREFIX + url);
    else localStorage.setItem(POSITION_STORAGE_PREFIX + url, String(t));
  } catch {}
}

function loadRange(url: string): [number, number] | null {
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n) => Number.isFinite(n))) {
      return [parsed[0], parsed[1]] as [number, number];
    }
  } catch {}
  return null;
}

function saveRange(url: string, r: [number, number] | null) {
  try {
    if (!r) localStorage.removeItem(RANGE_STORAGE_PREFIX + url);
    else localStorage.setItem(RANGE_STORAGE_PREFIX + url, JSON.stringify(r));
  } catch {}
}

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function useBars(url: string): number[] {
  const [bars] = useState(() => {
    let seed = 0;
    for (let i = 0; i < url.length; i++) seed = (seed * 31 + url.charCodeAt(i)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < BARS; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const v = (seed % 100) / 100;
      const center = 1 - Math.abs(i - BARS / 2) / (BARS / 2);
      out.push(0.25 + v * 0.6 + center * 0.15);
    }
    return out;
  });
  return bars;
}

export function AudioPlayer({ url, mine, filename, duration }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const [speedIdx, setSpeedIdx] = useState<number>(() => loadSpeedIdx());
  const [gainIdx, setGainIdx] = useState<number>(() => loadGainIdx());
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [range, setRange] = useState<[number, number] | null>(() => loadRange(url));
  const [dragMode, setDragMode] = useState<'seek' | 'range' | null>(null);
  const dragStartRef = useRef<number>(0);
  const restoredRef = useRef(false);
  const rangeRef = useRef<[number, number] | null>(range);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bars = useBars(url);

  useEffect(() => { rangeRef.current = range; }, [range]);

  // Load persisted range when url changes
  useEffect(() => {
    setRange(loadRange(url));
    restoredRef.current = false;
  }, [url]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => {
      if (isFinite(a.duration)) setTotal(a.duration);
      setLoading(false);
      // Restore last position on first metadata load
      if (!restoredRef.current) {
        restoredRef.current = true;
        const saved = loadPosition(url);
        const r = rangeRef.current;
        let target = saved;
        if (r) {
          // Resume inside persisted range; clamp saved position or start at range[0]
          if (target < r[0] || target >= r[1] - 0.2) target = r[0];
        }
        if (target > 0 && isFinite(a.duration) && target < a.duration - 0.5) {
          try { a.currentTime = target; setCurrent(target); } catch {}
        } else if (r && r[0] > 0) {
          try { a.currentTime = r[0]; setCurrent(r[0]); } catch {}
        }
      }
    };
    const onTime = () => {
      setCurrent(a.currentTime);
      // Enforce range end
      if (range && a.currentTime >= range[1]) {
        a.pause();
        try { a.currentTime = range[0]; } catch {}
        setCurrent(range[0]);
      }
    };
    const onEnd = () => { setPlaying(false); setCurrent(0); savePosition(url, 0); };
    const onPlay = () => { setPlaying(true); setError(null); };
    const onPause = () => { setPlaying(false); savePosition(url, a.currentTime); };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => { setLoading(false); setError(null); };
    const onErr = () => {
      setError('Falha ao carregar áudio');
      setLoading(false);
      setPlaying(false);
    };
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('durationchange', onLoaded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('playing', onPlaying);
    a.addEventListener('error', onErr);
    a.addEventListener('stalled', onWaiting);
    return () => {
      // Persist position on unmount
      try { savePosition(url, a.currentTime); } catch {}
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('durationchange', onLoaded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('error', onErr);
      a.removeEventListener('stalled', onWaiting);
    };
  }, [url, range, retryTick]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[speedIdx];
  }, [url, speedIdx, retryTick]);

  // WebAudio: normalization (compressor) + gain boost. Built lazily on first play.
  const ensureAudioGraph = useCallback(() => {
    const a = audioRef.current;
    if (!a || sourceNodeRef.current) return;
    try {
      const Ctx: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      a.crossOrigin = a.crossOrigin || 'anonymous';
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(a);
      // Soft compressor to normalize loudness across recordings
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -28;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      comp.attack.value = 0.005;
      comp.release.value = 0.15;
      const gain = ctx.createGain();
      gain.gain.value = GAINS[gainIdx];
      src.connect(comp).connect(gain).connect(ctx.destination);
      audioCtxRef.current = ctx;
      sourceNodeRef.current = src;
      gainNodeRef.current = gain;
    } catch {
      // Silent — playback still works via native path
    }
  }, [gainIdx]);

  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = GAINS[gainIdx];
  }, [gainIdx]);

  useEffect(() => () => {
    try { audioCtxRef.current?.close(); } catch {}
  }, []);


  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) setCurrent(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggle = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); return; }
    try {
      setLoading(true);
      ensureAudioGraph();
      if (audioCtxRef.current?.state === 'suspended') {
        try { await audioCtxRef.current.resume(); } catch {}
      }
      if (range && (a.currentTime < range[0] || a.currentTime >= range[1])) {
        a.currentTime = range[0];
      }
      await a.play();
    } catch {
      setError('Não foi possível reproduzir');
    } finally {
      setLoading(false);
    }
  }, [playing, range, ensureAudioGraph]);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryTick((n) => n + 1);
    // Force reload
    const a = audioRef.current;
    if (a) { try { a.load(); } catch {} }
  }, []);

  const clientXToTime = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || !total) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * total;
  };

  const seekTo = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setCurrent(t);
    savePosition(url, t);
  };

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const t = clientXToTime(e.clientX);
    if (e.shiftKey || e.altKey) {
      setDragMode('range');
      dragStartRef.current = t;
      setRange([t, t]);
    } else {
      setDragMode('seek');
      seekTo(t);
    }
  };
  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode) return;
    const t = clientXToTime(e.clientX);
    if (dragMode === 'seek') {
      seekTo(t);
    } else {
      const start = Math.min(dragStartRef.current, t);
      const end = Math.max(dragStartRef.current, t);
      setRange([start, end]);
    }
  };
  const onTrackPointerUp = () => {
    if (dragMode === 'range') {
      if (range && range[1] - range[0] < 0.3) {
        setRange(null);
        saveRange(url, null);
      } else if (range) {
        saveRange(url, range);
        seekTo(range[0]);
      }
    }
    setDragMode(null);
  };

  const clearRange = () => {
    setRange(null);
    saveRange(url, null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!total) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(Math.max(0, current - 5)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(Math.min(total, current + 5)); }
    else if (e.key === 'Home') { e.preventDefault(); seekTo(range?.[0] ?? 0); }
    else if (e.key === 'End') { e.preventDefault(); seekTo(range?.[1] ?? total); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
    try { localStorage.setItem(SPEED_STORAGE_KEY, String(next)); } catch {}
  };

  const onSpeedKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      cycleSpeed();
    }
  };

  const cycleGain = () => {
    ensureAudioGraph();
    const next = (gainIdx + 1) % GAINS.length;
    setGainIdx(next);
    try { localStorage.setItem(GAIN_STORAGE_KEY, String(next)); } catch {}
  };
  const onGainKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      cycleGain();
    }
  };

  const progress = total > 0 ? current / total : 0;
  const activeBar = Math.floor(progress * BARS);
  const rangeStartPct = range && total ? (range[0] / total) * 100 : 0;
  const rangeWidthPct = range && total ? ((range[1] - range[0]) / total) * 100 : 0;

  return (
    <div
      className={cn(
        'my-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 w-[300px] max-w-full select-none',
        mine
          ? 'bg-primary-foreground/10'
          : 'bg-background/60 border border-border/60',
      )}
      role="group"
      aria-label={`Mensagem de áudio${filename ? `: ${filename}` : ''}`}
    >
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={error ? retry : toggle}
        aria-label={error ? 'Tentar novamente' : playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        aria-pressed={playing}
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          error
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : mine
              ? 'bg-primary-foreground text-primary hover:bg-primary-foreground/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {error ? (
          <RotateCcw className="w-5 h-5" />
        ) : loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : playing ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio. Setas para navegar, Shift+arrastar para selecionar trecho"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${fmt(current)} de ${fmt(total)}${range ? `, trecho selecionado de ${fmt(range[0])} a ${fmt(range[1])}` : ''}`}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          onKeyDown={onKeyDown}
          className="relative h-8 flex items-center gap-[2px] cursor-pointer touch-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
        >
          {range && (
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-0 rounded pointer-events-none',
                mine ? 'bg-primary-foreground/20 ring-1 ring-primary-foreground/40' : 'bg-primary/15 ring-1 ring-primary/40',
              )}
              style={{ left: `${rangeStartPct}%`, width: `${rangeWidthPct}%` }}
            />
          )}
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn(
                'flex-1 rounded-full transition-colors',
                i <= activeBar
                  ? mine ? 'bg-primary-foreground' : 'bg-primary'
                  : mine ? 'bg-primary-foreground/30' : 'bg-primary/25',
              )}
              style={{ height: `${Math.round(h * 100)}%`, minWidth: 2 }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono opacity-70">
          <span>{fmt(current)}</span>
          {error ? (
            <span className="flex items-center gap-1 text-destructive font-sans font-medium normal-case">
              <AlertCircle className="w-3 h-3" /> {error} · toque em ↻
            </span>
          ) : range ? (
            <button
              type="button"
              onClick={clearRange}
              className="flex items-center gap-1 font-sans hover:opacity-100 opacity-80"
              aria-label="Limpar trecho selecionado"
            >
              <Scissors className="w-3 h-3" /> {fmt(range[0])}–{fmt(range[1])}
            </button>
          ) : (
            <span>{fmt(total || duration || 0)}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={cycleSpeed}
          onKeyDown={onSpeedKey}
          aria-label={`Velocidade de reprodução ${SPEEDS[speedIdx]}x. Pressione para alternar.`}
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            mine
              ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          {SPEEDS[speedIdx]}x
        </button>
        <a
          href={url}
          download={filename || 'audio'}
          target="_blank"
          rel="noreferrer"
          aria-label="Baixar áudio"
          className={cn(
            'p-1 rounded-md transition opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            mine ? 'hover:bg-primary-foreground/20' : 'hover:bg-primary/10',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
