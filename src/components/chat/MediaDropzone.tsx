import { useEffect, useRef, useState } from 'react';
import { Upload, Files } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  active: boolean;
  onDrop: (files: File[]) => void;
  /** Máximo de arquivos aceitos por drop. Default: 30 */
  maxFiles?: number;
}

/**
 * Overlay full-screen com glassmorphism + contagem em tempo real de quantos
 * arquivos serão enviados. Ativado ao arrastar arquivos sobre a janela.
 */
export function MediaDropzone({ active, onDrop, maxFiles = 30 }: Props) {
  const [over, setOver] = useState(false);
  const [count, setCount] = useState(0);
  const depthRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depthRef.current += 1;
      // items só é acessível em alguns navegadores; usar como estimativa
      const n = e.dataTransfer?.items?.length ?? 0;
      if (n > 0) setCount(n);
      setOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) {
        setOver(false);
        setCount(0);
      }
    };
    const onDropEv = (e: DragEvent) => {
      depthRef.current = 0;
      setOver(false);
      setCount(0);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const all = Array.from(e.dataTransfer.files);
      const accepted = all.slice(0, maxFiles);
      if (all.length > maxFiles) {
        toast.warning(`Limite de ${maxFiles} arquivos por vez. Enviando os primeiros ${maxFiles}.`);
      }
      onDrop(accepted);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDropEv);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDropEv);
    };
  }, [active, onDrop, maxFiles]);

  if (!over) return null;

  const displayCount = count > 0 ? Math.min(count, maxFiles) : null;

  return (
    <div className="fixed inset-0 z-[80] bg-background/40 backdrop-blur-xl flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="pointer-events-auto px-12 py-10 rounded-3xl border-2 border-dashed border-primary bg-background/80 shadow-2xl flex flex-col items-center gap-4 animate-scale-in">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-primary/15 flex items-center justify-center">
            {displayCount && displayCount > 1 ? (
              <Files className="w-10 h-10 text-primary" />
            ) : (
              <Upload className="w-10 h-10 text-primary" />
            )}
          </div>
          {displayCount && displayCount > 1 && (
            <span className="absolute -top-2 -right-2 min-w-[28px] h-7 px-2 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shadow-lg">
              {displayCount}
            </span>
          )}
        </div>
        <div className="text-center space-y-1">
          <p className="text-xl font-semibold">
            {displayCount && displayCount > 1
              ? `Solte para enviar ${displayCount} arquivos`
              : 'Solte para enviar'}
          </p>
          <p className="text-sm text-muted-foreground">
            Imagens, vídeos, áudios, documentos · até {maxFiles} por vez · máx. 20 MB cada
          </p>
        </div>
      </div>
    </div>
  );
}
