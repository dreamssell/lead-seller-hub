// Pure helpers backing the Sub-empresas list/edit UI.
// Extracted so we can regression-test that:
//  - listing displays the normalized admin_email (lowercase, trimmed).
//  - saving normalizes admin_email before it hits the backend.
//  - the rendered list never shows duplicates for the same normalized email.

export type SubCompanyLike = {
  id: string;
  admin_email: string | null;
  created_at?: string | null;
  // Other fields are irrelevant to these helpers but tolerated.
  [k: string]: unknown;
};

/** Normalize an admin_email exactly as the create/update flow does. */
export function normalizeAdminEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Deduplicate a sub-companies list by normalized admin_email.
 * The first occurrence wins (list is ordered by created_at desc upstream,
 * so we keep the newest record for a given email).
 * Rows with an empty email are always preserved (no key to collide on).
 */
export function dedupeSubCompaniesByEmail<T extends SubCompanyLike>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = normalizeAdminEmail(row.admin_email);
    if (!key) {
      out.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
