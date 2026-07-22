// Integration tests for the `landing-capture` Edge Function short-link flow.
//
// Covers:
//  1. Metrification (view_count / click_count / lead_count increment + landing_events rows)
//  2. IP-based deduplication (same IP within 24h → single lead)
//  3. Auto-creation on the CRM 360 timeline (`lead_events` row with `created_from_landing_link`)
//  4. Automatic Kanban placement on the first pipeline stage
//
// Run via the `supabase--test_edge_functions` tool. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY env vars (already injected by the test runner).
//
// The test provisions its own fixture landing_page (page_type='link') pointing
// at the first available pipeline+stage, then tears it down (including generated
// leads and events) in a `finally` block so it is safe to re-run.
import { assert, assertEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/landing-capture`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Public IPs (non-private) so the edge function's pickIp() accepts them.
const IP_A = "203.0.113.10";
const IP_B = "198.51.100.42";

async function pickPipelineWithStage() {
  const { data: stage } = await admin
    .from("pipeline_stages")
    .select("id,name,position,pipeline_id")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  assert(stage, "No pipeline_stages available for the integration test");
  return stage!;
}

async function pickOwner(pipelineId: string) {
  // Prefer an owner that already owns the target pipeline so tenant scoping matches.
  const { data: pipe } = await admin
    .from("pipelines")
    .select("owner_id,sub_company_id")
    .eq("id", pipelineId)
    .maybeSingle();
  if (pipe?.owner_id) return { id: pipe.owner_id, sub_company_id: pipe.sub_company_id ?? null };
  const { data } = await admin.from("profiles").select("user_id").limit(1).maybeSingle();
  assert(data?.user_id, "No profile available to own the fixture landing page");
  return { id: data!.user_id, sub_company_id: null };
}

async function callLink(slug: string, ip: string) {
  return await fetch(`${ENDPOINT}?slug=${encodeURIComponent(slug)}`, {
    method: "GET",
    redirect: "manual",
    headers: {
      "x-forwarded-for": ip,
      "user-agent": "landing-capture-integration-test/1.0",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
  });
}

Deno.test("landing-capture: metrics, IP dedupe, CRM 360 & Kanban", async (t) => {
  const stage = await pickPipelineWithStage();
  const owner = await pickOwner(stage.pipeline_id);
  const slug = `it-${crypto.randomUUID().slice(0, 8)}`;
  const label = "Integração Automática";

  const { data: page, error: pageErr } = await admin
    .from("landing_pages")
    .insert({
      slug,
      title: "Integration Test Link",
      page_type: "link",
      status: "published",
      redirect_url: "https://wa.me/5500000000000",
      tracking_label: label,
      pipeline_id: stage.pipeline_id,
      owner_id: owner.id,
      created_by: owner.id,
      sub_company_id: owner.sub_company_id ?? null,
    })
    .select("id")
    .single();
  if (pageErr) throw pageErr;
  const pageId = page!.id;

  try {
    await t.step("1st click on IP A → 302 to WhatsApp + lead + CRM event + Kanban stage", async () => {
      const res = await callLink(slug, IP_A);
      await res.body?.cancel();
      assertEquals(res.status, 302, "should redirect to the destination URL");
      assertEquals(res.headers.get("location"), "https://wa.me/5500000000000");

      // Lead was created and placed on the first stage of the pipeline
      const { data: leads } = await admin
        .from("leads")
        .select("id,stage_id,pipeline_id,source,channel,status")
        .eq("pipeline_id", stage.pipeline_id)
        .eq("source", `landing-link:${label}`);
      assertEquals(leads?.length, 1, "exactly one lead should be created on the first click");
      const lead = leads![0];
      assertEquals(lead.stage_id, stage.id, "lead must be placed on the first Kanban stage");
      assertEquals(lead.channel, "landing");
      assertEquals(lead.status, "novo");

      // CRM 360 timeline event
      const { data: events } = await admin
        .from("lead_events")
        .select("type,to_stage_id,channel,metadata")
        .eq("lead_id", lead.id);
      const created = events?.find((e) => e.type === "created_from_landing_link");
      assert(created, "CRM 360 must have a `created_from_landing_link` event");
      assertEquals(created!.to_stage_id, stage.id);
      assertEquals(created!.channel, "landing");
      assertEquals((created!.metadata as any)?.slug, slug);
      assert((created!.metadata as any)?.ip, "CRM event must include the visitor IP");

      // Metrics — view/click/lead events + counters
      const { data: landingEvents } = await admin
        .from("landing_events")
        .select("type,ip_address,lead_id")
        .eq("page_id", pageId);
      const views = landingEvents!.filter((e) => e.type === "view").length;
      const clicks = landingEvents!.filter((e) => e.type === "click").length;
      assertEquals(views, 1, "one view event");
      assertEquals(clicks, 1, "one click event");
      const clickWithLead = landingEvents!.find((e) => e.type === "click" && e.lead_id);
      assert(clickWithLead, "click event must be linked to the created lead");

      const { data: pageAfter } = await admin
        .from("landing_pages")
        .select("view_count,click_count,lead_count")
        .eq("id", pageId)
        .single();
      assertEquals(pageAfter!.view_count, 1);
      assertEquals(pageAfter!.click_count, 1);
      assertEquals(pageAfter!.lead_count, 1);
    });

    await t.step("2nd & 3rd clicks on same IP A → counters grow but lead is NOT duplicated", async () => {
      for (let i = 0; i < 2; i++) {
        const res = await callLink(slug, IP_A);
        await res.body?.cancel();
        assertEquals(res.status, 302);
      }

      const { data: leads } = await admin
        .from("leads")
        .select("id")
        .eq("pipeline_id", stage.pipeline_id)
        .eq("source", `landing-link:${label}`);
      assertEquals(leads?.length, 1, "IP dedupe must prevent additional leads within 24h");

      const { data: pageAfter } = await admin
        .from("landing_pages")
        .select("view_count,click_count,lead_count")
        .eq("id", pageId)
        .single();
      assertEquals(pageAfter!.view_count, 3, "view_count keeps incrementing for every click");
      assertEquals(pageAfter!.click_count, 3, "click_count keeps incrementing for every click");
      assertEquals(pageAfter!.lead_count, 1, "lead_count stays at 1 because of IP dedupe");
    });

    await t.step("distinct visitor IP → creates a 2nd lead and a 2nd CRM event", async () => {
      // The Supabase Functions proxy overrides x-forwarded-for with the edge
      // network IP, so we can't spoof a different visitor via headers. Instead,
      // rewrite the ip_address of the previous click rows to something else
      // — the 24h dedupe window then finds no prior click for the current IP,
      // simulating a fresh visitor.
      await admin
        .from("landing_events")
        .update({ ip_address: "10.0.0.1" })
        .eq("page_id", pageId)
        .eq("type", "click");

      const res = await callLink(slug, IP_B);
      await res.body?.cancel();
      assertEquals(res.status, 302);

      const { data: leads } = await admin
        .from("leads")
        .select("id,stage_id")
        .eq("pipeline_id", stage.pipeline_id)
        .eq("source", `landing-link:${label}`);
      assertEquals(leads?.length, 2, "a fresh (non-deduped) visitor must produce a new lead");
      for (const l of leads!) assertEquals(l.stage_id, stage.id, "all leads land on the first stage");

      const { data: crmEvents } = await admin
        .from("lead_events")
        .select("id")
        .in("lead_id", leads!.map((l) => l.id))
        .eq("type", "created_from_landing_link");
      assertEquals(crmEvents?.length, 2, "each lead must own a CRM 360 timeline row");

      const { data: pageAfter } = await admin
        .from("landing_pages")
        .select("lead_count,click_count")
        .eq("id", pageId)
        .single();
      assertEquals(pageAfter!.click_count, 4);
      assertEquals(pageAfter!.lead_count, 2);
    });

    await t.step("missing slug returns 400", async () => {
      const res = await fetch(ENDPOINT, {
        method: "GET",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      await res.text();
      assertEquals(res.status, 400);
    });

    await t.step("unknown slug returns 404", async () => {
      const res = await fetch(`${ENDPOINT}?slug=does-not-exist-${crypto.randomUUID()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      await res.text();
      assertEquals(res.status, 404);
    });
  } finally {
    // Cleanup — cascade-delete generated leads/events/landing_events first.
    const { data: leads } = await admin
      .from("leads")
      .select("id")
      .eq("source", `landing-link:${label}`);
    const leadIds = (leads || []).map((l) => l.id);
    if (leadIds.length) {
      await admin.from("lead_events").delete().in("lead_id", leadIds);
      await admin.from("leads").delete().in("id", leadIds);
    }
    await admin.from("landing_events").delete().eq("page_id", pageId);
    await admin.from("landing_pages").delete().eq("id", pageId);
  }
});
