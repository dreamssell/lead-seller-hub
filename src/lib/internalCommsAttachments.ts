/**
 * Validação client-side de anexos da Comunicação Interna.
 * Serve como primeira linha de defesa antes de qualquer upload/insert.
 * A regra também é replicada no backend (RLS + trigger de auditoria) para
 * garantir que nada é gravado em `internal_comms_audit` quando inválido.
 */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_ATTACHMENT_MIMES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  // Áudio (gravação por microfone e uploads comuns)
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/aac',
] as const;

export function attachmentKindFor(mime: string): 'image' | 'audio' | 'file' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

// Nome: 1..180 chars, sem separadores de path, sem null byte, sem control chars.
const FILENAME_RE = /^[^\/\\\x00-\x1f]{1,180}$/;

export type AttachmentInput = {
  filename: string;
  mime: string;
  size: number;
};

export type AttachmentValidation =
  | { ok: true }
  | { ok: false; code: 'invalid_filename' | 'invalid_mime' | 'too_large' | 'empty'; message: string };

export function validateInternalAttachment(a: AttachmentInput): AttachmentValidation {
  if (!a || typeof a.filename !== 'string' || !FILENAME_RE.test(a.filename.trim())) {
    return { ok: false, code: 'invalid_filename', message: 'Nome de arquivo inválido.' };
  }
  if (!ALLOWED_ATTACHMENT_MIMES.includes(a.mime as any)) {
    return { ok: false, code: 'invalid_mime', message: 'Tipo de arquivo não permitido.' };
  }
  if (typeof a.size !== 'number' || a.size <= 0) {
    return { ok: false, code: 'empty', message: 'Arquivo vazio.' };
  }
  if (a.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: 'too_large', message: 'Arquivo excede 25 MB.' };
  }
  return { ok: true };
}
