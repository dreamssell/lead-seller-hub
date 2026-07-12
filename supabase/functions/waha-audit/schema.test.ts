// Unit tests for the waha-audit Zod schema. These validate that every invalid
// shape returns a consistent flatten() payload (usable by the 400 response),
// and that valid shapes coerce to the expected defaults.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { BodySchema } from './schema.ts';

const OWNER = '11111111-1111-1111-1111-111111111111';
const UUID2 = '22222222-2222-2222-2222-222222222222';

function issuesFor(input: unknown) {
  const r = BodySchema.safeParse(input);
  assert(!r.success, 'expected invalid');
  return r.error.flatten();
}

Deno.test('accepts minimal valid body and applies defaults', () => {
  const r = BodySchema.safeParse({ owner_id: OWNER });
  assert(r.success);
  assertEquals(r.data.limit, 100);
  assertEquals(r.data.since_hours, 24);
  assertEquals(r.data.order, 'desc');
});

Deno.test('accepts full valid body (cursor/order/call_id/gaps_only)', () => {
  const r = BodySchema.safeParse({
    owner_id: OWNER,
    call_id: UUID2,
    cursor: new Date().toISOString(),
    order: 'asc',
    limit: 50,
    since_hours: 12,
    gaps_only: true,
  });
  assert(r.success);
  assertEquals(r.data.order, 'asc');
  assertEquals(r.data.gaps_only, true);
});

Deno.test('rejects missing owner_id with fieldErrors.owner_id', () => {
  const f = issuesFor({});
  assert(f.fieldErrors.owner_id?.length);
});

Deno.test('rejects non-uuid owner_id', () => {
  const f = issuesFor({ owner_id: 'not-uuid' });
  assert(f.fieldErrors.owner_id?.some((m) => /uuid/i.test(m)));
});

Deno.test('rejects non-uuid call_id', () => {
  const f = issuesFor({ owner_id: OWNER, call_id: 'abc' });
  assert(f.fieldErrors.call_id?.length);
});

Deno.test('rejects non-uuid connection_id and sub_company_id', () => {
  const f = issuesFor({ owner_id: OWNER, connection_id: 'x', sub_company_id: '' });
  assert(f.fieldErrors.connection_id?.length);
  assert(f.fieldErrors.sub_company_id?.length);
});

Deno.test('rejects invalid order enum', () => {
  const f = issuesFor({ owner_id: OWNER, order: 'sideways' });
  assert(f.fieldErrors.order?.length);
});

Deno.test('rejects non-ISO cursor', () => {
  const f = issuesFor({ owner_id: OWNER, cursor: 'not-a-date' });
  assert(f.fieldErrors.cursor?.length);
});

Deno.test('rejects cursor without timezone offset', () => {
  // z.string().datetime({ offset: true }) requires offset — a naïve "T00:00:00" must fail.
  const f = issuesFor({ owner_id: OWNER, cursor: '2025-01-01T00:00:00' });
  assert(f.fieldErrors.cursor?.length);
});

Deno.test('rejects limit out of bounds (below and above)', () => {
  assert(issuesFor({ owner_id: OWNER, limit: 0 }).fieldErrors.limit?.length);
  assert(issuesFor({ owner_id: OWNER, limit: 10_000 }).fieldErrors.limit?.length);
  assert(issuesFor({ owner_id: OWNER, limit: 1.5 }).fieldErrors.limit?.length);
});

Deno.test('rejects since_hours out of bounds', () => {
  assert(issuesFor({ owner_id: OWNER, since_hours: 0 }).fieldErrors.since_hours?.length);
  assert(issuesFor({ owner_id: OWNER, since_hours: 999 }).fieldErrors.since_hours?.length);
});

Deno.test('rejects gaps_only when not boolean', () => {
  const f = issuesFor({ owner_id: OWNER, gaps_only: 'yes' });
  assert(f.fieldErrors.gaps_only?.length);
});

Deno.test('rejects message_id longer than 200 chars', () => {
  const f = issuesFor({ owner_id: OWNER, message_id: 'a'.repeat(201) });
  assert(f.fieldErrors.message_id?.length);
});

Deno.test('rejects extra/unknown keys (strict schema)', () => {
  const f = issuesFor({ owner_id: OWNER, hackerField: 1 });
  // strict() surfaces unrecognized keys as formErrors, not fieldErrors
  assert(f.formErrors.length > 0 || Object.keys(f.fieldErrors).length > 0);
});

Deno.test('flatten payload is stable and JSON-serializable', () => {
  const f = issuesFor({ owner_id: 'nope', order: 'x', limit: 0 });
  const round = JSON.parse(JSON.stringify(f));
  assertEquals(typeof round.fieldErrors, 'object');
  assertEquals(Array.isArray(round.formErrors), true);
});
