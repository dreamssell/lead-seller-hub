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


Deno.test({ name: "normalize_lead_integration_fields: variantes de Holmes viram 'holmes'", ...testOpts, fn: async () => {
  const owner = await pickOwner();
  try {
    const variants = ["Holmes", "holmes CRM", "HOLMES-API", "integração holmes"];
    for (const v of variants) {
      const { data, error } = await client.from("leads").insert({
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
} });

Deno.test({ name: "normalize_lead_integration_fields: variantes de DealerSpace viram 'dealerspace'", ...testOpts, fn: async () => {
  const owner = await pickOwner();
  try {
    const variants = ["DealerSpace", "dealer space", "dealer-space", "dealer_space", "DEALERSPACE-webhook"];
    for (const v of variants) {
      const { data, error } = await client.from("leads").insert({
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
} });

Deno.test({ name: "normalize_lead_integration_fields: mapeamento de status (won/lost/closed_won/closed_lost)", ...testOpts, fn: async () => {
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
      const { data, error } = await client.from("leads").insert({
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
} });

Deno.test({ name: "normalize_lead_integration_fields: fontes desconhecidas são preservadas", ...testOpts, fn: async () => {
  const owner = await pickOwner();
  try {
    const { data, error } = await client.from("leads").insert({
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
} });

Deno.test({ name: "get_leads_capture_report: Holmes e DealerSpace são contabilizados em LEADS GERADOS", ...testOpts, fn: async () => {
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
      const { error } = await client.from("leads").insert({
        owner_id: owner,
        created_by: owner,
        name: `Seed ${s.source}-${s.status}`,
        notes: TEST_TAG,
        ...s,
      });
      if (error) throw error;
    }

    const from = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await client.rpc("get_leads_capture_report", {
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
} });

Deno.test({ name: "get_leads_capture_report: múltiplas origens agregam Holmes/DealerSpace e mantêm desconhecidas separadas", ...testOpts, fn: async () => {
  const owner = await pickOwner();
  try {
    // Semeia variantes de Holmes/DealerSpace + duas origens desconhecidas distintas
    const seed = [
      // Holmes: 3 variantes → devem colapsar em 1 categoria "Holmes"
      { source: "Holmes", status: "novo" },
      { source: "holmes CRM", status: "ganho", estimated_value: 200 },
      { source: "HOLMES-API", status: "em_atendimento" },
      // DealerSpace: 2 variantes → devem colapsar em 1 categoria "DealerSpace"
      { source: "DealerSpace", status: "ganho", estimated_value: 300 },
      { source: "dealer_space", status: "perdido" },
      // Origens desconhecidas: devem permanecer separadas, cada uma como categoria própria
      { source: "custom-partner-x", status: "novo" },
      { source: "custom-partner-x", status: "ganho", estimated_value: 150 },
      { source: "site-organico", status: "em_atendimento" },
    ];
    for (const s of seed) {
      const { error } = await client.from("leads").insert({
        owner_id: owner,
        created_by: owner,
        name: `Multi ${s.source}-${s.status}`,
        notes: TEST_TAG,
        ...s,
      });
      if (error) throw error;
    }

    const from = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await client.rpc("get_leads_capture_report", {
      p_owner: owner,
      p_from: from,
      p_to: null,
    });
    if (error) throw error;

    const rows = (data as any[]) ?? [];
    const byCat: Record<string, any> = {};
    for (const r of rows) byCat[r.source_category] = r;

    // Holmes: 3 variantes agregadas → 1 categoria com 3 leads
    assert(byCat["Holmes"], "categoria 'Holmes' deve existir");
    assert(Number(byCat["Holmes"].total_leads) >= 3, "Holmes deve agregar as 3 variantes");
    assertEquals(Number(byCat["Holmes"].ganhos), 1);
    assertEquals(Number(byCat["Holmes"].receita), 200);
    assertEquals(byCat["Holmes"].included_in_leads_gerados, true);

    // DealerSpace: 2 variantes agregadas → 1 categoria com 2 leads
    assert(byCat["DealerSpace"], "categoria 'DealerSpace' deve existir");
    assert(Number(byCat["DealerSpace"].total_leads) >= 2, "DealerSpace deve agregar as 2 variantes");
    assertEquals(Number(byCat["DealerSpace"].ganhos), 1);
    assertEquals(Number(byCat["DealerSpace"].receita), 300);
    assertEquals(byCat["DealerSpace"].included_in_leads_gerados, true);

    // Origens desconhecidas: cada slug permanece como sua própria categoria (NÃO caem em Holmes/DealerSpace)
    assert(byCat["custom-partner-x"], "categoria desconhecida 'custom-partner-x' deve permanecer separada");
    assertEquals(Number(byCat["custom-partner-x"].total_leads), 2);
    assertEquals(Number(byCat["custom-partner-x"].ganhos), 1);
    assertEquals(Number(byCat["custom-partner-x"].receita), 150);
    assertEquals(byCat["custom-partner-x"].included_in_leads_gerados, true);

    assert(byCat["site-organico"], "categoria desconhecida 'site-organico' deve permanecer separada");
    assertEquals(Number(byCat["site-organico"].total_leads), 1);
    assertEquals(Number(byCat["site-organico"].em_atendimento), 1);

    // Garantia crítica: as duas desconhecidas NÃO foram fundidas entre si nem com Holmes/DealerSpace
    assert(
      byCat["custom-partner-x"] !== byCat["site-organico"],
      "origens desconhecidas devem ser categorias distintas"
    );
    assert(
      !("custom-partner-x".includes("holmes") || "custom-partner-x".includes("dealer")),
      "sanity: slug desconhecido não deve casar padrões incluídos"
    );

    // Sanity global: soma das categorias cobre todos os leads semeados
    const totalSeeded = rows.reduce((s, r) => s + Number(r.total_leads || 0), 0);
    assert(totalSeeded >= seed.length, `total agregado (${totalSeeded}) deve incluir ${seed.length} leads semeados`);
  } finally {
    await cleanup();
  }
} });
