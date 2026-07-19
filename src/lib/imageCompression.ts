/**
 * Compressão client-side de imagens antes do upload.
 *
 * Regras:
 *  - Aplica apenas em image/* (exceto image/gif, que pode ser animado).
 *  - Reduz o maior lado para no máximo `maxDim` (default 1920px), preservando aspecto.
 *  - Reencoda em JPEG quality ~0.82 (ou WebP se a origem já for webp), com fallback
 *    para o arquivo original quando o resultado ficar maior que o original.
 *  - Falhas silenciosas devolvem o arquivo original — nunca bloqueiam o envio.
 */

const DEFAULT_MAX_DIM = 1920;
const DEFAULT_QUALITY = 0.82;

export interface CompressResult {
  file: File;
  compressed: boolean;
  originalSize: number;
  newSize: number;
}

function shouldCompress(file: File): boolean {
  if (!file.type.startsWith('image/')) return false;
  if (file.type === 'image/gif') return false; // pode ser animado
  return true;
}

async function loadBitmap(file: File): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return {
      w: bmp.width, h: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      close: () => (bmp as any).close?.(),
    };
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({
      w: img.naturalWidth, h: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_load_failed')); };
    img.src = url;
  });
}

export async function compressImageFile(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<CompressResult> {
  const originalSize = file.size;
  if (!shouldCompress(file)) return { file, compressed: false, originalSize, newSize: originalSize };

  const maxDim = opts.maxDim ?? DEFAULT_MAX_DIM;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  try {
    const bmp = await loadBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.w, bmp.h));
    const targetW = Math.max(1, Math.round(bmp.w * scale));
    const targetH = Math.max(1, Math.round(bmp.h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close(); return { file, compressed: false, originalSize, newSize: originalSize }; }
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    bmp.draw(ctx, targetW, targetH);
    bmp.close();

    const outMime = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, outMime, quality));
    if (!blob) return { file, compressed: false, originalSize, newSize: originalSize };

    // Se não reduzir, mantém o original (evita re-encode inútil / perda de qualidade sem ganho).
    if (blob.size >= originalSize * 0.95) {
      return { file, compressed: false, originalSize, newSize: originalSize };
    }

    const ext = outMime === 'image/webp' ? 'webp' : 'jpg';
    const base = file.name.replace(/\.[^.]+$/, '');
    const newName = `${base}.${ext}`;
    const newFile = new File([blob], newName, { type: outMime, lastModified: Date.now() });
    return { file: newFile, compressed: true, originalSize, newSize: newFile.size };
  } catch {
    return { file, compressed: false, originalSize, newSize: originalSize };
  }
}
