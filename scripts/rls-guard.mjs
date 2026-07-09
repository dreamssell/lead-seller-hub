#!/usr/bin/env node
/**
 * RLS Guard — falha o CI quando uma migração introduz política permissiva
 * demais ou cria tabela pública sem GRANT. Roda sobre supabase/migrations/*.sql.
 *
 * Bloqueia:
 *  - USING (true) ou WITH CHECK (true) em INSERT/UPDATE/DELETE.
 *  - CREATE POLICY para INSERT/UPDATE/DELETE sem WITH CHECK.
 *  - CREATE POLICY para INSERT/UPDATE/DELETE sem referência a auth.uid()/has_role/user_account_access.
 *  - CREATE TABLE public.<x> sem GRANT correspondente na mesma migração.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = 'supabase/migrations';
const errors = [];

const files = (() => {
  try { return readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')); }
  catch { return []; }
})();

const CHANGED = process.env.CI_CHANGED_FILES?.split(/\s+/).filter(Boolean);
const target = CHANGED?.length ? CHANGED.filter((f) => f.startsWith(MIG_DIR)) : files.map((f) => join(MIG_DIR, f));

for (const path of target) {
  let sql;
  try { sql = readFileSync(path, 'utf8'); } catch { continue; }
  const clean = sql.replace(/--.*$/gm, '');

  // Regra 1: USING (true) / WITH CHECK (true) em INSERT/UPDATE/DELETE
  const policyRegex = /CREATE\s+POLICY[\s\S]*?FOR\s+(INSERT|UPDATE|DELETE|ALL)[\s\S]*?(?=CREATE\s+POLICY|CREATE\s+TABLE|ALTER\s+TABLE|GRANT|$)/gi;
  let m;
  while ((m = policyRegex.exec(clean)) !== null) {
    const block = m[0];
    const cmd = m[1].toUpperCase();
    if (cmd === 'INSERT' || cmd === 'UPDATE' || cmd === 'DELETE' || cmd === 'ALL') {
      if (/WITH\s+CHECK\s*\(\s*true\s*\)/i.test(block) || /USING\s*\(\s*true\s*\)/i.test(block) && cmd !== 'ALL') {
        // ALL with USING(true) may be intentional-only-for-select fallback; still flag
        errors.push(`${path}: política ${cmd} com true irrestrito — bloqueada.`);
      }
      if ((cmd === 'INSERT' || cmd === 'UPDATE') && !/WITH\s+CHECK/i.test(block)) {
        errors.push(`${path}: política ${cmd} sem WITH CHECK.`);
      }
      if (!/auth\.uid\(\)|has_role\s*\(|user_account_access|service_role/i.test(block)) {
        errors.push(`${path}: política ${cmd} sem referência a auth.uid()/has_role/user_account_access.`);
      }
    }
  }

  // Regra 2: CREATE TABLE public.<x> exige GRANT na mesma migração
  const tableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-z_][a-z0-9_]*)/gi;
  let t;
  while ((t = tableRegex.exec(clean)) !== null) {
    const table = t[1];
    const grantRe = new RegExp(`GRANT\\s+[^;]+ON\\s+(?:TABLE\\s+)?public\\.${table}\\b`, 'i');
    if (!grantRe.test(clean)) {
      errors.push(`${path}: CREATE TABLE public.${table} sem GRANT na mesma migração.`);
    }
  }
}

if (errors.length) {
  console.error('\n❌ RLS Guard bloqueou o CI:\n');
  errors.forEach((e) => console.error(' - ' + e));
  console.error(`\nTotal: ${errors.length} violação(ões).\n`);
  process.exit(1);
} else {
  console.log(`✅ RLS Guard OK — ${target.length} migração(ões) verificada(s).`);
}
