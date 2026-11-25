import test from "node:test";
import assert from "node:assert/strict";
import { campaignKey, normalizeMetaRow, normalizeAdsOrder, classifyChannel, runAdsSync, clampDays, metaErrorText } from "../lib/ads-sync.mjs";

test("campaignKey rozpoznaje K1–K4 z nazw i UTM", () => {
  assert.equal(campaignKey("K1 Prezent do 500 zł"), "k1");
  assert.equal(campaignKey("Zeggo | K2 | nadgarstek"), "k2");
  assert.equal(campaignKey("k3_automaty"), "k3");
  assert.equal(campaignKey("k4_remarketing"), "k4");
  assert.equal(campaignKey("Kampania 2 – Zobacz go"), "k2");
  assert.equal(campaignKey("Remarketing przed świętami"), "k4");
  assert.equal(campaignKey("K12 test"), "");
  assert.equal(campaignKey("Black Friday"), "");
});

test("normalizeMetaRow wyciąga lejek i wartość zakupów", () => {
  const r = normalizeMetaRow({
    date_start: "2026-11-27", campaign_id: "1", campaign_name: "K1 Prezent", spend: "70.5", impressions: "4000", reach: "3000",
    clicks: "120", inline_link_clicks: "80",
    actions: [{ action_type: "landing_page_view", value: "60" }, { action_type: "omni_add_to_cart", value: "5" }, { action_type: "omni_initiated_checkout", value: "3" }, { action_type: "omni_purchase", value: "2" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "9" }, { action_type: "video_view", value: "1200" }],
    action_values: [{ action_type: "omni_purchase", value: "861.8" }]
  });
  assert.equal(r.k, "k1"); assert.equal(r.sp, 70.5); assert.equal(r.lc, 80); assert.equal(r.lpv, 60);
  assert.equal(r.atc, 5); assert.equal(r.ic, 3); assert.equal(r.pu, 2); assert.equal(r.pv, 861.8); assert.equal(r.v3, 1200);
});

test("normalizeAdsOrder przypisuje kanał i kampanię z UTM", () => {
  const o = normalizeAdsOrder({
    name: "#1001", createdAt: "2026-11-28T10:00:00Z", displayFinancialStatus: "PAID",
    currentTotalPriceSet: { shopMoney: { amount: "430.90" } }, totalShippingPriceSet: { shopMoney: { amount: "0" } },
    customerJourneySummary: { lastVisit: { source: "facebook", utmParameters: { source: "meta", medium: "paid", campaign: "k1_prezent500" } } },
    lineItems: { nodes: [{ quantity: 1, variant: { inventoryItem: { unitCost: { amount: "300" } } } }] }
  });
  assert.deepEqual([o.ch, o.k, o.t, o.c, o.x], ["meta", "k1", 430.9, 300, 0]);
  assert.equal(classifyChannel({ source: "google", medium: "cpc" }), "google");
  assert.equal(classifyChannel({ source: "facebook", medium: "social" }), "meta_free");
  assert.equal(classifyChannel({}, ""), "bezposr");
});

test("runAdsSync bez kluczy zwraca źródła niepodłączone", async () => {
  const snap = await runAdsSync({}, { days: 7, now: new Date("2026-11-30T12:00:00Z"), fetchImpl: async () => { throw new Error("nie powinno pytać"); } });
  assert.equal(snap.since, "2026-11-24"); assert.equal(snap.until, "2026-11-30");
  assert.equal(snap.sources.meta.configured, false); assert.equal(snap.sources.google.configured, false); assert.equal(snap.sources.shopify.configured, false);
});

test("runAdsSync łączy Meta (stronicowanie) i zgłasza błąd tokenu", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/insights") && !String(url).includes("after=")) return new Response(JSON.stringify({ data: [{ date_start: "2026-11-29", campaign_name: "K2 Nadgarstek", spend: "50" }], paging: { next: "https://graph.facebook.com/x/insights?after=abc" } }));
    if (String(url).includes("after=abc")) return new Response(JSON.stringify({ data: [{ date_start: "2026-11-30", campaign_name: "K2 Nadgarstek", spend: "55" }] }));
    return new Response(JSON.stringify({ data: [{ id: "9", name: "K2 Nadgarstek", effective_status: "ACTIVE", daily_budget: "6000" }] }));
  };
  const snap = await runAdsSync({ META_ACCESS_TOKEN: "t" }, { days: 2, now: new Date("2026-11-30T12:00:00Z"), fetchImpl });
  assert.equal(snap.rows.length, 2); assert.equal(snap.sources.meta.ok, true);
  assert.equal(snap.campaigns[0].bd, 60); assert.equal(snap.campaigns[0].k, "k2");
  const bad = await runAdsSync({ META_ACCESS_TOKEN: "t" }, { fetchImpl: async () => new Response(JSON.stringify({ error: { code: 190, message: "expired" } }), { status: 400 }) });
  assert.equal(bad.sources.meta.ok, false); assert.match(bad.sources.meta.error, /wygasł/);
  assert.equal(clampDays(500), 90); assert.match(metaErrorText({ code: 17 }), /ogranicza/);
});
