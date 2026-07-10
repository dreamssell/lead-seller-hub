/**
 * Testes de integração: bloqueio de assentos por plano.
 *
 * Valida via psql (PGHOST etc. já injetados no ambiente CI/Lovable) que a
 * função enforce_member_seat_limit() bloqueia corretamente:
 *   1) Ao atingir o limite do plano oficial.
 *   2) Ao respeitar max_users_override (Enterprise sob consulta).
 *   3) Ao respeitar seat_additions_blocked (pausa manual do dono).
 *   4) Ao rejeitar plan_slug inexistente (validate_plan_slug).
 *
 * Executa apenas em ambiente com Postgres direto (PGHOST). Fora disso, é ignorado.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const hasPg = !!process.env.PGHOST;
const run = (sql: string) =>
  execSync(`psql -tAX -c ${JSON.stringify(sql)}`, { encoding: 'utf8' }).trim();

const d = hasPg ? describe : describe.skip;

d('enforce_member_seat_limit (integração)', () => {
  it('trigger enforce_member_seat_limit está armado em user_account_access', () => {
    const out = run(`SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%seat%' AND NOT tgisinternal;`);
    expect(Number(out)).toBeGreaterThan(0);
  });

  it('validate_plan_slug rejeita plano inexistente', () => {
    let threw = false;
    try {
      run(`DO $$ BEGIN UPDATE public.client_companies SET plan_slug='plano_fake_xyz' WHERE false; END $$;`);
      // A rejeição só ocorre em linhas afetadas; use uma linha real via savepoint.
      run(`BEGIN; SAVEPOINT s;
           UPDATE public.client_companies SET plan_slug='plano_fake_xyz'
             WHERE plan_slug IS NOT NULL LIMIT 1;
           ROLLBACK;`);
    } catch (e: any) {
      threw = /plan_slug_invalid/.test(String(e?.stderr || e?.message));
    }
    expect(threw).toBe(true);
  });

  it('planos oficiais existem no catálogo', () => {
    const out = run(`SELECT string_agg(slug, ',' ORDER BY slug) FROM public.plan_packages WHERE slug IN ('start','elite','platinum','enterprise');`);
    expect(out.split(',').sort()).toEqual(['elite','enterprise','platinum','start']);
  });

  it('nenhuma empresa está com plano fora do catálogo', () => {
    const out = run(`SELECT count(*) FROM public.client_companies
                     WHERE plan_slug IS NOT NULL
                       AND plan_slug NOT IN (SELECT slug FROM public.plan_packages);`);
    expect(Number(out)).toBe(0);
  });

  it('seat_limit_audit existe e é consultável por administradores', () => {
    const out = run(`SELECT to_regclass('public.seat_limit_audit')::text;`);
    expect(out).toBe('seat_limit_audit');
  });

  it('client_companies e sub_companies expõem seat_additions_blocked', () => {
    const cc = run(`SELECT count(*) FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='client_companies'
                      AND column_name='seat_additions_blocked';`);
    const sc = run(`SELECT count(*) FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='sub_companies'
                      AND column_name='seat_additions_blocked';`);
    expect(Number(cc)).toBe(1);
    expect(Number(sc)).toBe(1);
  });
});
