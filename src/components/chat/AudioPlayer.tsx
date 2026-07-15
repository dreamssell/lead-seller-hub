import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  url: string;
  mine?: boolean;
  filename?: string | null;
  duration?: number | null;
}

const SPEEDS = [1, 1.5, 2, 0.75] as const;

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const BARS = 32;

/** Deterministic pseudo-random bar heights so the "waveform" is stable per url. */
function useBars(url: string): number[] {
  const [bars] = useState(() => {
    let seed = 0;
    for (let i = 0; i < url.length; i++) seed = (seed * 31 + url.charCodeAt(i)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < BARS; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const v = (seed % 100) / 100;
      // shape: never too small, slight center emphasis
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
  const [speedIdx, setSpeedIdx] = useState(0);
  const [error, setError] = useState(false);
  const bars = useBars(url);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => {
      if (isFinite(a.duration)) setTotal(a.duration);
      setLoading(false);
    };
    const onTime = () => setCurrent(a.currentTime);
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onErr = () => { setError(true); setLoading(false); setPlaying(false); };
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('durationchange', onLoaded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('playing', onPlaying);
    a.addEventListener('error', onErr);
    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('durationchange', onLoaded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('error', onErr);
    };
  }, [url]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); return; }
    try {
      setLoading(true);
      await a.play();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const seekFromClientX = (clientX: number) => {
    const a = audioRef.current;
    const track = trackRef.current;
    if (!a || !track || !total) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * total;
    setCurrent(a.currentTime);
  };

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };
  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    seekFromClientX(e.clientX);
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  const progress = total > 0 ? current / total : 0;
  const activeBar = Math.floor(progress * BARS);

  return (
    <div
      className={cn(
        'my-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 w-[300px] max-w-full select-none',
        mine
          ? 'bg-primary-foreground/10'
          : 'bg-background/60 border border-border/60',
      )}
    >
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition active:scale-95',
          mine
            ? 'bg-primary-foreground text-primary hover:bg-primary-foreground/90'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {loading ? (
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
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(current)}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          className="h-8 flex items-center gap-[2px] cursor-pointer touch-none"
        >
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
          <span>{fmt(total || duration || 0)}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label="Velocidade de reprodução"
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition',
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
            'p-1 rounded-md transition opacity-70 hover:opacity-100',
            mine ? 'hover:bg-primary-foreground/20' : 'hover:bg-primary/10',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-3.5 h-3.5" />
        </a>
      </div>

      {error && (
        <span className="sr-only">Erro ao carregar áudio</span>
      )}
    </div>
  );
}
