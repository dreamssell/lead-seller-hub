// Validates avatar upload metadata (size, mime, filename) on the server.
// Called by the client BEFORE the storage PUT so we can return clear,
// consistent error messages regardless of what the browser sent.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);
// Extensions we tolerate when the browser sends an empty/odd mime type.
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const BodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(120).optional().default(''),
  size: z.number().int().min(1).max(50 * 1024 * 1024), // hard cap 50 MB
});

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i + 1).toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'invalid_payload',
          message: 'Dados do arquivo inválidos.',
          details: parsed.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { filename, mimeType, size } = parsed.data;
    const mime = (mimeType || '').toLowerCase();
    const ext = extOf(filename);

    if (size > MAX_BYTES) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'too_large',
          message: `A foto tem ${(size / 1024 / 1024).toFixed(1)} MB. O limite é 5 MB.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (ext === 'heic' || ext === 'heif' || mime === 'image/heic' || mime === 'image/heif') {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'heic_not_supported',
          message:
            'Fotos HEIC do iPhone não são compatíveis com navegadores. Converta para JPG antes de enviar.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const mimeOk = mime ? ALLOWED_MIME.has(mime) : ALLOWED_EXT.has(ext);
    if (!mimeOk) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'invalid_type',
          message: 'Formato não suportado. Envie uma imagem JPG, PNG, WEBP ou GIF.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, max_bytes: MAX_BYTES }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[validate-avatar] error', err);
    return new Response(
      JSON.stringify({ ok: false, code: 'server_error', message: 'Erro interno ao validar arquivo.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
