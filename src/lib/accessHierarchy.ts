import type { SidebarPageKey } from './navigation';

/**
 * Frontend defensiva: une (deduplicando) as páginas bloqueadas de uma
 * empresa-mãe (client_company) com as de uma sub-empresa. Espelha a lógica
 * do RPC `get_my_account_access` no backend, garantindo que a hierarquia
 * seja respeitada mesmo se o backend não estiver atualizado.
 *
 * Regra: qualquer chave bloqueada na empresa-mãe permanece bloqueada
 * na sub-empresa (não é possível uma sub "desbloquear" o que a empresa
 * bloqueou).
 */
export function mergeBlockedPages(
  parent: string[] | null | undefined,
  sub: string[] | null | undefined,
): SidebarPageKey[] {
  const merged = new Set<string>();
  (parent ?? []).forEach((k) => k && merged.add(k));
  (sub ?? []).forEach((k) => k && merged.add(k));
  return Array.from(merged) as SidebarPageKey[];
}

/** Verifica se uma página está bloqueada considerando a hierarquia. */
export function isPageBlocked(
  page: SidebarPageKey,
  parent: string[] | null | undefined,
  sub: string[] | null | undefined,
): boolean {
  return mergeBlockedPages(parent, sub).includes(page);
}
