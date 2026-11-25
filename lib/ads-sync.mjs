// Pomiar reklam: pobiera wyniki z Meta Ads, Google Ads i zamówienia z Shopify (z UTM)
// i zapisuje jeden zrzut w public.records (col "adlive", id "main"). Panel liczy z niego
// wszystkie wskaźniki (moduł reklamy.js). Klucze API są tylko w sekretach Cloudflare.
import { supabaseRest } from "./supabase-rest.mjs";
import { shopifyConfig } from "./shopify-core.mjs";
import { shopifyGraphql } from "./shopify-sync.mjs";

export const META_API_VERSION = "v24.0";
export const GOOGLE_ADS_API_VERSION = "v22";
export const DEFAULT_META_ACCOUNT = "972181888863838"; // NHP reklamy
export const MAX_DAYS = 90;

/* ---------- wspólne ---------- */
export function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

export function clampDays(days) {
  const n = Math.round(Number(days) || 30);
  return Math.max(1, Math.min(MAX_DAYS, n));
}

const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n0(v) * 100) / 100;

// K1–K4 z „Planu kampanii Zeggo”: po nazwie kampanii albo utm_campaign (k1_prezent500 …).
export function campaignKey(text) {
  const s = String(text || "").toLowerCase();
  let m = s.match(/(?:^|[^a-z0-9])k\s*-?\s*([1-4])(?![0-9])/);
  if (m) return "k" + m[1];
  m = s.match(/kampania\s*([1-4])(?![0-9])/);
  if (m) return "k" + m[1];
  if (/prezent\s*-?\s*(do\s*)?500/.test(s)) return "k1";
  if (/nadgarst/.test(s)) return "k2";
  if (/automat|na lata/.test(s)) return "k3";
  if (/remarket|ostatnia szansa|retarget/.test(s)) return "k4";
  return "";
}

/* ---------- Meta ---------- */
const META_ACTIONS = {
  lpv: ["landing_page_view", "omni_landing_page_view"],
  vc: ["omni_view_content", "offsite_conversion.fb_pixel_view_content", "view_content"],
  atc: ["omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"],
  ic: ["omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout"],
  pu: ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"]
};

export function pickAction(list, names) {
  if (!Array.isArray(list)) return 0;
  for (const name of names) {
    const hit = list.find((a) => a && a.action_type === name);
    if (hit) return n0(hit.value);
  }
  return 0;
}

export function normalizeMetaRow(row) {
  if (!row || !row.date_start) return null;
  const actions = row.actions || [];
  const values = row.action_values || [];
  const thru = pickAction(row.video_thruplay_watched_actions, ["video_view"]);
  return {
    d: row.date_start,
    p: "meta",
    cid: String(row.campaign_id || ""),
    cn: String(row.campaign_name || "").slice(0, 120),
    k: campaignKey(row.campaign_name),
    sp: r2(row.spend),
    im: Math.round(n0(row.impressions)),
    re: Math.round(n0(row.reach)),
    cl: Math.round(n0(row.clicks)),
    lc: Math.round(n0(row.inline_link_clicks)),
    v3: Math.round(pickAction(actions, ["video_view"])),
    th: Math.round(thru),
    lpv: Math.round(pickAction(actions, META_ACTIONS.lpv)),
    vc: Math.round(pickAction(actions, META_ACTIONS.vc)),
    atc: Math.round(pickAction(actions, META_ACTIONS.atc)),
    ic: Math.round(pickAction(actions, META_ACTIONS.ic)),
    pu: Math.round(pickAction(actions, META_ACTIONS.pu)),
    pv: r2(pickAction(values, META_ACTIONS.pu))
  };
}

export function metaConfig(env) {
  const token = String(env?.META_ACCESS_TOKEN || "").trim();
  const account = String(env?.META_AD_ACCOUNT_ID || DEFAULT_META_ACCOUNT).replace(/^act_/, "").trim();
  return token ? { token, account } : null;
}

export async function fetchMeta(env, since, until, fetchImpl = fetch) {
  const cfg = metaConfig(env);
  if (!cfg) return { configured: false, rows: [] };
  const fields = [
    "campaign_id", "campaign_name", "spend", "impressions", "reach", "clicks", "inline_link_clicks",
    "actions", "action_values", "video_thruplay_watched_actions"
  ].join(",");
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields,
    limit: "500",
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"])
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/act_${cfg.account}/insights?${params}`;
  const rows = [];
  for (let page = 0; url && page < 20; page++) {
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${cfg.token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const err = new Error(metaErrorText(data.error));
      err.status = 502;
      throw err;
    }
    for (const r of data.data || []) { const x = normalizeMetaRow(r); if (x) rows.push(x); }
    url = data.paging?.next || "";
  }
  // Nazwy i statusy kampanii (także tych bez wyników) — do porównania K1–K4.
  const campaigns = [];
  try {
    const q = new URLSearchParams({ fields: "id,name,effective_status,daily_budget,lifetime_budget,start_time", limit: "200" });
    const res = await fetchImpl(`https://graph.facebook.com/${META_API_VERSION}/act_${cfg.account}/campaigns?${q}`, { headers: { authorization: `Bearer ${cfg.token}` } });
    const data = await res.json().catch(() => ({}));
    for (const c of data.data || []) {
      campaigns.push({
        p: "meta", cid: String(c.id), cn: String(c.name || "").slice(0, 120), k: campaignKey(c.name),
        st: String(c.effective_status || "").toLowerCase(),
        bd: c.daily_budget ? r2(n0(c.daily_budget) / 100) : 0,
        start: c.start_time ? String(c.start_time).slice(0, 10) : ""
      });
    }
  } catch (e) { /* lista kampanii jest dodatkiem */ }
  return { configured: true, rows, campaigns, account: cfg.account };
}

export function metaErrorText(error) {
  const code = Number(error?.code);
  if (code === 190) return "Token Meta wygasł albo jest nieprawidłowy — wygeneruj nowy (instrukcja w panelu).";
  if (code === 200 || code === 10) return "Token Meta nie ma uprawnienia ads_read do konta NHP reklamy.";
  if (code === 17 || code === 4 || code === 613) return "Meta chwilowo ogranicza liczbę zapytań — spróbuj za kilka minut.";
  return `Meta: ${String(error?.message || "nieznany błąd").slice(0, 160)}`;
}

/* ---------- Google Ads ---------- */
export function googleConfig(env) {
  const need = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"];
  if (need.some((k) => !String(env?.[k] || "").trim())) return null;
  return {
    dev: env.GOOGLE_ADS_DEVELOPER_TOKEN.trim(),
    clientId: env.GOOGLE_ADS_CLIENT_ID.trim(),
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET.trim(),
    refresh: env.GOOGLE_ADS_REFRESH_TOKEN.trim(),
    customer: env.GOOGLE_ADS_CUSTOMER_ID.replace(/\D/g, ""),
    login: String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "")
  };
}

export function normalizeGoogleRow(r) {
  const date = r?.segments?.date;
  if (!date) return null;
  const m = r.metrics || {};
  return {
    d: date, p: "google",
    cid: String(r.campaign?.id || ""), cn: String(r.campaign?.name || "").slice(0, 120), k: campaignKey(r.campaign?.name),
    sp: r2(n0(m.costMicros) / 1e6), im: Math.round(n0(m.impressions)), re: 0,
    cl: Math.round(n0(m.clicks)), lc: Math.round(n0(m.clicks)), v3: 0, th: 0, lpv: 0, vc: 0, atc: 0, ic: 0,
    pu: Math.round(n0(m.conversions)), pv: r2(m.conversionsValue)
  };
}

export async function fetchGoogle(env, since, until, fetchImpl = fetch) {
  const cfg = googleConfig(env);
  if (!cfg) return { configured: false, rows: [] };
  const tok = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refresh, grant_type: "refresh_token" })
  });
  const t = await tok.json().catch(() => ({}));
  if (!tok.ok || !t.access_token) { const e = new Error("Google Ads: nie udało się odświeżyć tokenu (sprawdź refresh token)."); e.status = 502; throw e; }
  const query = `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  const headers = { authorization: `Bearer ${t.access_token}`, "developer-token": cfg.dev, "content-type": "application/json" };
  if (cfg.login) headers["login-customer-id"] = cfg.login;
  const res = await fetchImpl(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cfg.customer}/googleAds:searchStream`, {
    method: "POST", headers, body: JSON.stringify({ query })
  });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) {
    const msg = (Array.isArray(data) ? data[0] : data)?.error?.message || `HTTP ${res.status}`;
    const e = new Error(`Google Ads: ${String(msg).slice(0, 160)}`); e.status = 502; throw e;
  }
  const rows = [];
  for (const chunk of Array.isArray(data) ? data : [data]) for (const r of chunk.results || []) { const x = normalizeGoogleRow(r); if (x) rows.push(x); }
  return { configured: true, rows };
}

/* ---------- Shopify (prawda o sprzedaży) ---------- */
export const ADS_ORDERS_QUERY = `query AdsOrders($q: String!, $after: String) {
  orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt cancelledAt displayFinancialStatus
      currentTotalPriceSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      customerJourneySummary {
        lastVisit { source utmParameters { source medium campaign content } }
        firstVisit { source utmParameters { source medium campaign content } }
      }
      lineItems(first: 30) { nodes { quantity variant { inventoryItem { unitCost { amount } } } } }
    }
  }
}`;

export function classifyChannel(utm, visitSource) {
  const src = String(utm?.source || "").toLowerCase();
  const med = String(utm?.medium || "").toLowerCase();
  const vs = String(visitSource || "").toLowerCase();
  const paid = /paid|cpc|ppc|cpm|ads?$/.test(med);
  if (/meta|facebook|fb|instagram|ig/.test(src)) return paid ? "meta" : "meta_free";
  if (/google/.test(src)) return paid ? "google" : "google_free";
  if (/tiktok/.test(src)) return paid ? "tiktok" : "tiktok_free";
  if (src) return "inne";
  if (/facebook|instagram/.test(vs)) return "meta_free";
  if (/google/.test(vs)) return "google_free";
  return vs ? "inne" : "bezposr";
}

export function normalizeAdsOrder(node) {
  if (!node || !node.createdAt) return null;
  const last = node.customerJourneySummary?.lastVisit || null;
  const first = node.customerJourneySummary?.firstVisit || null;
  const pick = last?.utmParameters?.campaign || last?.utmParameters?.source ? last : (first || last);
  const utm = pick?.utmParameters || {};
  let cost = 0, known = true;
  for (const li of node.lineItems?.nodes || []) {
    const c = li?.variant?.inventoryItem?.unitCost?.amount;
    if (c == null) { known = false; continue; }
    cost += n0(c) * n0(li.quantity);
  }
  const status = String(node.displayFinancialStatus || "").toLowerCase();
  return {
    d: String(node.createdAt).slice(0, 10),
    id: String(node.name || "").slice(0, 20),
    t: r2(node.currentTotalPriceSet?.shopMoney?.amount),
    sh: r2(node.totalShippingPriceSet?.shopMoney?.amount),
    c: known && cost > 0 ? r2(cost) : null,
    ch: classifyChannel(utm, pick?.source),
    camp: String(utm.campaign || "").slice(0, 60),
    k: campaignKey(utm.campaign),
    x: node.cancelledAt || /refunded|voided/.test(status) ? 1 : 0
  };
}

// Sklep mierzony w reklamach (Zeggo). Domyślnie ten sam co integracja Shopify panelu;
// osobny sklep: sekrety ADS_SHOPIFY_STORE_DOMAIN + ADS_SHOPIFY_ADMIN_TOKEN.
export function adsShopifyConfig(env) {
  if (String(env?.ADS_SHOPIFY_STORE_DOMAIN || "").trim() && String(env?.ADS_SHOPIFY_ADMIN_TOKEN || "").trim()) {
    return shopifyConfig({ SHOPIFY_STORE_DOMAIN: env.ADS_SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN: env.ADS_SHOPIFY_ADMIN_TOKEN });
  }
  return shopifyConfig(env);
}

export async function fetchShopifyOrders(env, since, fetchImpl = fetch) {
  const cfg = adsShopifyConfig(env);
  if (!cfg) return { configured: false, orders: [] };
  const orders = [];
  let after = null;
  for (let page = 0; page < 30; page++) {
    const data = await shopifyGraphql(cfg, ADS_ORDERS_QUERY, { q: `created_at:>=${since}`, after }, fetchImpl);
    const conn = data?.orders || {};
    for (const node of conn.nodes || []) { const o = normalizeAdsOrder(node); if (o) orders.push(o); }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return { configured: true, orders, domain: cfg.domain };
}

/* ---------- całość ---------- */
export async function runAdsSync(env, { days = 30, fetchImpl = fetch, now = new Date() } = {}) {
  const until = isoDay(now);
  const since = addDaysIso(until, -(clampDays(days) - 1));
  const sources = {};
  const out = { v: 1, syncedAt: now.toISOString(), since, until, rows: [], campaigns: [], orders: [], sources };
  const tasks = [
    ["meta", () => fetchMeta(env, since, until, fetchImpl)],
    ["google", () => fetchGoogle(env, since, until, fetchImpl)],
    ["shopify", () => fetchShopifyOrders(env, since, fetchImpl)]
  ];
  await Promise.all(tasks.map(async ([name, fn]) => {
    try {
      const r = await fn();
      sources[name] = { configured: r.configured, ok: r.configured, n: (r.rows || r.orders || []).length };
      if (r.rows) out.rows.push(...r.rows);
      if (r.campaigns) out.campaigns.push(...r.campaigns);
      if (r.orders) out.orders.push(...r.orders);
    } catch (err) {
      sources[name] = { configured: true, ok: false, error: String(err.message || err).slice(0, 200) };
    }
  }));
  out.rows.sort((a, b) => a.d.localeCompare(b.d));
  out.orders.sort((a, b) => a.d.localeCompare(b.d));
  return out;
}

export async function saveAdsSnapshot(env, snapshot) {
  await supabaseRest(env, "records?on_conflict=col,id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { col: "adlive", id: "main", data: snapshot }
  });
  return true;
}

export function adsStatus(env) {
  const meta = metaConfig(env);
  return {
    meta: { configured: Boolean(meta), account: meta?.account || DEFAULT_META_ACCOUNT },
    google: { configured: Boolean(googleConfig(env)) },
    shopify: { configured: Boolean(adsShopifyConfig(env)), domain: adsShopifyConfig(env)?.domain || "" }
  };
}
