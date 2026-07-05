// Integração backend: valida o mapeamento Holmes/DealerSpace na tabela
// public.leads (trigger normalize_lead_integration_fields) e a flag
// included_in_leads_gerados da RPC get_leads_capture_report.
//
// Rodar via: supabase--test_edge_functions com a função "handle-inbound-webhook".
// Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente Deno.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TEST_TAG = `test-holmes-ds-${crypto.randomUUID()}`;

const client = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 0 } },
});

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

async function pickOwner(): Promise<string> {
  const { data, error } = await client
    .from("profiles")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error("No profile available to run integration test");
  return data.user_id as string;
}

async function cleanup() {
  await client.from("leads").delete().eq("notes", TEST_TAG);
}


Deno.test("normalize_lead_integration_fields: variantes de Holmes viram 'holmes'", async () => {
  const owner = await pickOwner();
  try {
    const variants = ["Holmes", "holmes CRM", "HOLMES-API", "integração holmes"];
    for (const v of variants) {
      const { data, error } = await admin().from("leads").insert({
        owner_id: owner,
        created_by: owner,
        name: `Lead ${v}`,
        source: v,
        status: "new",
        notes: TEST_TAG,
      }).select("id, source, status").single();
      if (error) throw error;
      assertEquals(data.source, "holmes", `source '${v}' deveria virar 'holmes'`);
      assertEquals(data.status, "novo", `status 'new' deveria virar 'novo'`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("normalize_lead_integration_fields: variantes de DealerSpace viram 'dealerspace'", async () => {
  const owner = await pickOwner();
  try {
    const variants = ["DealerSpace", "dealer space", "dealer-space", "dealer_space", "DEALERSPACE-webhook"];
    for (const v of variants) {
      const { data, error } = await admin().from("leads").insert({
        owner_id: owner,
        created_by: owner,
        name: `Lead ${v}`,
        source: v,
        status: "in_progress",
        notes: TEST_TAG,
      }).select("id, source, status").single();
      if (error) throw error;
      assertEquals(data.source, "dealerspace", `source '${v}' deveria virar 'dealerspace'`);
      assertEquals(data.status, "em_atendimento", `status 'in_progress' deveria virar 'em_atendimento'`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("normalize_lead_integration_fields: mapeamento de status (won/lost/closed_won/closed_lost)", async () => {
  const owner = await pickOwner();
  try {
    const cases: [string, string][] = [
      ["won", "ganho"],
      ["closed_won", "ganho"],
      ["sold", "ganho"],
      ["lost", "perdido"],
      ["closed_lost", "perdido"],
      ["declined", "perdido"],
      ["contacted", "em_atendimento"],
    ];
    for (const [input, expected] of cases) {
      const { data, error } = await admin().from("leads").insert({
        owner_id: owner,
        created_by: owner,
        name: `Lead status ${input}`,
        source: "holmes",
        status: input,
        notes: TEST_TAG,
      }).select("status").single();
      if (error) throw error;
      assertEquals(data.status, expected, `status '${input}' deveria virar '${expected}'`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("normalize_lead_integration_fields: fontes desconhecidas são preservadas", async () => {
  const owner = await pickOwner();
  try {
    const { data, error } = await admin().from("leads").insert({
      owner_id: owner,
      created_by: owner,
      name: "Lead custom",
      source: "custom-partner-x",
      status: "novo",
      notes: TEST_TAG,
    }).select("source").single();
    if (error) throw error;
    assertEquals(data.source, "custom-partner-x");
  } finally {
    await cleanup();
  }
});

Deno.test("get_leads_capture_report: Holmes e DealerSpace são contabilizados em LEADS GERADOS", async () => {
  const owner = await pickOwner();
  try {
    // Inserimos amostras controladas
    const seed = [
      { source: "holmes", status: "novo" },
      { source: "holmes", status: "ganho", estimated_value: 1000 },
      { source: "holmes", status: "perdido" },
      { source: "dealerspace", status: "ganho", estimated_value: 500 },
      { source: "dealerspace", status: "em_atendimento" },
      { source: "custom-partner", status: "novo" },
    ];
    for (const s of seed) {
      const { error } = await admin().from("leads").insert({
        owner_id: owner,
        created_by: owner,
        name: `Seed ${s.source}-${s.status}`,
        notes: TEST_TAG,
        ...s,
      });
      if (error) throw error;
    }

    const from = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await admin().rpc("get_leads_capture_report", {
      p_owner: owner,
      p_from: from,
      p_to: null,
    });
    if (error) throw error;

    const rows = (data as any[]) ?? [];
    const byCat: Record<string, any> = {};
    for (const r of rows) byCat[r.source_category] = r;

    assert(byCat["Holmes"], "categoria 'Holmes' deve aparecer no relatório");
    assert(byCat["DealerSpace"], "categoria 'DealerSpace' deve aparecer no relatório");
    assertEquals(byCat["Holmes"].included_in_leads_gerados, true);
    assertEquals(byCat["DealerSpace"].included_in_leads_gerados, true);

    // Cada categoria deve conter pelo menos as contagens que semeamos
    assert(Number(byCat["Holmes"].total_leads) >= 3, "Holmes deve ter ≥3 leads");
    assert(Number(byCat["Holmes"].ganhos) >= 1, "Holmes deve ter ≥1 ganho");
    assert(Number(byCat["DealerSpace"].total_leads) >= 2, "DealerSpace deve ter ≥2 leads");
    assert(Number(byCat["DealerSpace"].ganhos) >= 1, "DealerSpace deve ter ≥1 ganho");

    // Somatório do relatório deve refletir todos os leads do período
    const total = rows.reduce((s, r) => s + Number(r.total_leads || 0), 0);
    assert(total >= seed.length, `total (${total}) deve incluir os ${seed.length} leads semeados`);

    // Receita: soma dos estimated_value de status 'ganho'
    assertEquals(Number(byCat["Holmes"].receita), 1000);
    assertEquals(Number(byCat["DealerSpace"].receita), 500);
  } finally {
    await cleanup();
  }
});
