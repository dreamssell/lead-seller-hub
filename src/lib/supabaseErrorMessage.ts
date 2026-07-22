// Formats a Supabase PostgrestError into a human-readable, complete description.
// Includes code, hint, and details so failures no longer surface as a bare "Erro".
export function describeSupabaseError(err: any, fallback = 'Falha desconhecida'): string {
  if (!err) return fallback;
  const parts: string[] = [];
  if (err.message) parts.push(String(err.message));
  if (err.details && err.details !== err.message) parts.push(`Detalhes: ${err.details}`);
  if (err.hint) parts.push(`Dica: ${err.hint}`);
  if (err.code) parts.push(`Código: ${err.code}`);
  return parts.length ? parts.join(' · ') : fallback;
}
