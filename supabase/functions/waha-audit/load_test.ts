// Lightweight load test for waha-audit. Runs N concurrent requests paginating
// through the owner's audit stream and reports p50/p95/p99 latency + error
// counts. Requires an admin JWT + owner_id via env (same as index.test.ts).
//
// Usage:
//   WAHA_AUDIT_OWNER_JWT=... WAHA_AUDIT_OWNER_ID=... \
//   WAHA_AUDIT_LOAD_CONCURRENCY=20 WAHA_AUDIT_LOAD_TOTAL=200 \
//   deno test --allow-net --allow-env supabase/functions/waha-audit/load_test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const JWT = Deno.env.get("WAHA_AUDIT_OWNER_JWT");
const OWNER_ID = Deno.env.get("WAHA_AUDIT_OWNER_ID");
const CONCURRENCY = Number(Deno.env.get("WAHA_AUDIT_LOAD_CONCURRENCY") ?? "10");
const TOTAL = Number(Deno.env.get("WAHA_AUDIT_LOAD_TOTAL") ?? "50");
const LIMIT = Number(Deno.env.get("WAHA_AUDIT_LOAD_LIMIT") ?? "200");
const P95_BUDGET_MS = Number(Deno.env.get("WAHA_AUDIT_LOAD_P95_MS") ?? "2500");

const FN_URL = `${SUPABASE_URL}/functions/v1/waha-audit`;

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[i];
}

Deno.test({
  name: `carga: ${TOTAL} req @ ${CONCURRENCY} conc, limit=${LIMIT}`,
  ignore: !JWT || !OWNER_ID,
  fn: async () => {
    const latencies: number[] = [];
    const errors: number[] = [];
    let cursor: string | null = null;

    // Warm-up
    await fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${JWT}` },
      body: JSON.stringify({ owner_id: OWNER_ID, limit: 1 }),
    }).then((r) => r.text());

    let issued = 0;
    async function worker() {
      while (issued < TOTAL) {
        const my = ++issued;
        const started = performance.now();
        try {
          const res = await fetch(FN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${JWT}` },
            body: JSON.stringify({ owner_id: OWNER_ID, limit: LIMIT, order: "desc", cursor }),
          });
          const body = await res.json();
          const dur = performance.now() - started;
          latencies.push(dur);
          if (!res.ok) errors.push(res.status);
          // Rotate cursor every 5 requests so we exercise pagination paths.
          if (my % 5 === 0 && body?.pagination?.next_cursor) cursor = body.pagination.next_cursor;
        } catch (_e) {
          errors.push(0);
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    latencies.sort((a, b) => a - b);
    const p50 = percentile(latencies, 0.5);
    const p95 = percentile(latencies, 0.95);
    const p99 = percentile(latencies, 0.99);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(JSON.stringify({
      event: "waha_audit_load_report",
      total: latencies.length, errors: errors.length,
      p50_ms: +p50.toFixed(1), p95_ms: +p95.toFixed(1), p99_ms: +p99.toFixed(1), avg_ms: +avg.toFixed(1),
    }));

    assert(errors.length / Math.max(1, latencies.length) < 0.02, `error rate too high: ${errors.length}/${latencies.length}`);
    assert(p95 < P95_BUDGET_MS, `p95 ${p95.toFixed(0)}ms exceeded budget ${P95_BUDGET_MS}ms`);
  },
});
