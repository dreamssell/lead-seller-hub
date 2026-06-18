/**
 * Centralized filename sanitizer for Supabase Storage keys.
 *
 * Storage keys MUST NOT contain spaces, accents, slashes, or special characters.
 * This util normalizes any input filename into a safe key segment:
 *   - removes diacritics (acentuação)
 *   - collapses whitespace and unsupported chars into "_"
 *   - keeps only [A-Za-z0-9._-]
 *   - trims leading/trailing underscores
 *   - guarantees a non-empty result
 *   - preserves extension when possible
 *   - clamps max length (default 120)
 *
 * Use this for EVERY storage upload and signed-link generation flow.
 */
export function sanitizeFilename(input: string | null | undefined, maxLen = 120): string {
  const raw = (input ?? "").toString().trim();
  if (!raw) return "arquivo";

  // Split extension to keep it readable
  const lastDot = raw.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < raw.length - 1 && lastDot >= raw.length - 10;
  const base = hasExt ? raw.slice(0, lastDot) : raw;
  const ext = hasExt ? raw.slice(lastDot + 1) : "";

  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "");

  let safeBase = clean(base) || "arquivo";
  const safeExt = clean(ext).toLowerCase();

  const reserved = maxLen - (safeExt ? safeExt.length + 1 : 0);
  if (safeBase.length > reserved) safeBase = safeBase.slice(0, Math.max(1, reserved));

  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/**
 * Build a unique storage path under a user folder, using a sanitized filename.
 * Example: buildStoragePath(userId, "Contrato Mult Seguros & Consórcios.pdf")
 *   -> "<uid>/1718...-Contrato_Mult_Seguros_Consorcios.pdf"
 */
export function buildStoragePath(userId: string, filename: string, prefix?: string): string {
  const safe = sanitizeFilename(filename);
  const stamp = Date.now();
  const folder = prefix ? `${prefix.replace(/[^a-zA-Z0-9_-]+/g, "_")}/` : "";
  return `${folder}${userId}/${stamp}_${safe}`;
}
