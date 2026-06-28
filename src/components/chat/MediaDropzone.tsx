import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  active: boolean;
  onDrop: (files: File[]) => void;
}

/** Full-area drag-and-drop overlay; attach to a relatively positioned chat region. */
export function MediaDropzone({ active, onDrop }: Props) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!active) return;
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if ((e as any).fromElement) return;
      setOver(false);
    };
    const onDropEv = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      setOver(false);
      onDrop(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDropEv);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDropEv);
    };
  }, [active, onDrop]);

  if (!over) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto px-10 py-8 rounded-2xl border-2 border-dashed border-primary bg-background/95 shadow-2xl flex flex-col items-center gap-3">
        <Upload className="w-10 h-10 text-primary" />
        <p className="text-lg font-semibold">Solte para anexar</p>
        <p className="text-xs text-muted-foreground">Imagens, vídeos, áudios, documentos — até 20 MB</p>
      </div>
    </div>
  );
}
