/**
 * AttachmentBubble — renderiza o anexo de uma mensagem interna.
 *
 * Como o bucket `internal-comms` é privado, geramos uma signed URL sob demanda
 * (cache local por URL/expiração para evitar tempestade de chamadas quando a
 * conversa tem várias mídias). Imagem abre em preview clicável, áudio usa
 * <audio> nativo com preload=metadata, e arquivos genéricos exibem cartão
 * com nome/tamanho e botão para baixar.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Loader2, ImageOff } from 'lucide-react';

// Cache simples: chave = objectKey, valor = { url, exp (epoch ms) }.
const signedCache = new Map<string, { url: string; exp: number }>();
const SIGN_TTL_S = 60 * 60; // 1h

async function getSignedUrl(objectKey: string): Promise<string | null> {
  const now = Date.now();
  const cached = signedCache.get(objectKey);
  if (cached && cached.exp - 60_000 > now) return cached.url;
  const { data, error } = await supabase.storage
    .from('internal-comms')
    .createSignedUrl(objectKey, SIGN_TTL_S);
  if (error || !data?.signedUrl) return null;
  signedCache.set(objectKey, { url: data.signedUrl, exp: now + SIGN_TTL_S * 1000 });
  return data.signedUrl;
}

function humanSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(ms?: number | null) {
  if (!ms || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface AttachmentBubbleProps {
  url: string; // objectKey no bucket
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  kind?: 'image' | 'audio' | 'file' | null;
  durationMs?: number | null;
  mine?: boolean;
}

export function AttachmentBubble({
  url, name, mime, size, kind, durationMs, mine,
}: AttachmentBubbleProps) {
  const [signed, setSigned] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const derivedKind: 'image' | 'audio' | 'file' = useMemo(() => {
    if (kind) return kind;
    if (mime?.startsWith('image/')) return 'image';
    if (mime?.startsWith('audio/')) return 'audio';
    return 'file';
  }, [kind, mime]);

  useEffect(() => {
    let cancelled = false;
    setSigned(null); setFailed(false);
    getSignedUrl(url).then((u) => { if (!cancelled) { if (u) setSigned(u); else setFailed(true); } });
    return () => { cancelled = true; };
  }, [url]);

  const download = async () => {
    if (!signed) return;
    const a = document.createElement('a');
    a.href = signed; a.download = name || 'anexo'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
  };

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-80">
        <ImageOff className="w-4 h-4" /> Anexo indisponível
      </div>
    );
  }

  if (derivedKind === 'image') {
    return (
      <a
        href={signed || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-[260px] rounded-lg overflow-hidden bg-black/5"
        aria-label={`Abrir imagem ${name || ''}`.trim()}
      >
        {signed ? (
          <img src={signed} alt={name || 'anexo'} className="w-full h-auto object-cover" loading="lazy" />
        ) : (
          <div className="w-[260px] h-[160px] flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin opacity-70" />
          </div>
        )}
      </a>
    );
  }

  if (derivedKind === 'audio') {
    return (
      <div className="flex flex-col gap-1 min-w-[220px]">
        {signed ? (
          <audio src={signed} controls preload="metadata" className="w-full h-9" />
        ) : (
          <div className="h-9 flex items-center gap-2 text-xs opacity-70">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando áudio...
          </div>
        )}
        <div className={`text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          Áudio {fmtDuration(durationMs)}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={!signed}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${
        mine ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-muted hover:bg-muted/70'
      }`}
      aria-label={`Baixar ${name || 'anexo'}`}
    >
      <FileText className="w-4 h-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{name || 'Arquivo'}</p>
        <p className={`text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {humanSize(size)} {mime ? `· ${mime.split('/')[1]?.toUpperCase() || mime}` : ''}
        </p>
      </div>
      {signed ? <Download className="w-3.5 h-3.5 opacity-70" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    </button>
  );
}
