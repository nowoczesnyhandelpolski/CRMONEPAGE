// Realizacja zamówień: opłacone zamówienie (public.fulfilments) -> dostawca -> numer przesyłki -> status w CRM.
// Adaptery: bigbuy (API, płatność z salda), inpost (etykieta ShipX + opcjonalnie e-mail z etykietą do dostawcy),
// email (zamówienie e-mailem do dowolnej hurtowni), manual (zostaje dla zespołu).
// Tryby z fulfil_settings: off / dry_run (niczego nie kupuje, zapisuje plan) / live.
// Wywołanie: cron z nagłówkiem x-nhp-cron albo zalogowany wspólnik (przycisk „Uruchom teraz” w panelu).
// Logika bez sieci jest w ./fulfil-core.mjs (kopia lib/fulfil-core.mjs, testy: tests/fulfil.test.mjs).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.97.0";
import nodemailer from "npm:nodemailer@6.9.16";
import {
  parseShipTo, pickSku, safetyCheck, backoffMinutes, MAX_ATTEMPTS, bigbuyOrderBody,
  pickTotal, cheapestShipping, orderIdFromLocation, inpostShipmentBody, inpostState, supplierEmail,
} from "./fulfil-core.mjs";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "Access-Control-Allow-Origin": "*" } });

type Settings = { mode: string; max_order_cost: number; daily_cap: number; min_margin: number; bigbuy_sandbox: boolean; inpost_sandbox: boolean; sender: Record<string, string> };
type Secrets = Record<string, string>;
class Retry extends Error {}

async function log(fid: string | null, level: string, message: string, data?: unknown) {
  await sb.from("fulfil_log").insert({ fulfilment_id: fid, level, message: message.slice(0, 500), data: data ?? null });
}

async function authorized(req: Request, secrets: Secrets) {
  const cron = req.headers.get("x-nhp-cron");
  if (cron && secrets.cron_token && cron === secrets.cron_token) return true;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const user = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await user.rpc("is_team");
  return data === true;
}

async function patchOrder(orderId: string, patch: Record<string, unknown>, note?: string) {
  const { data: row } = await sb.from("records").select("data").eq("col", "orders").eq("id", orderId).maybeSingle();
  if (!row) return;
  const d = row.data || {};
  // Ręczny „problem” albo „zwrot” ustawiony przez zespół wygrywa ze śledzeniem.
  if (patch.status && ["problem", "zwrot"].includes(d.status) && ["wyslane", "dostarczone"].includes(String(patch.status))) delete patch.status;
  const next = { ...d, ...patch };
  if (note) next.notes = [d.notes, `[Realizacja ${new Date().toISOString().slice(0, 16).replace("T", " ")}] ${note}`].filter(Boolean).join("\n");
  await sb.from("records").update({ data: next, updated_at: new Date().toISOString() }).eq("col", "orders").eq("id", orderId);
}

// ---------- BigBuy ----------
const bbBase = (s: Settings) => (s.bigbuy_sandbox ? "https://api.sandbox.bigbuy.eu" : "https://api.bigbuy.eu");
async function bb(s: Settings, k: Secrets, path: string, body?: unknown) {
  if (!k.bigbuy_api_key) throw new Error("Brak klucza API BigBuy (Panel → Realizacja → Klucze).");
  const r = await fetch(bbBase(s) + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${k.bigbuy_api_key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch { j = { raw: text.slice(0, 300) }; }
  if (r.status === 429 || r.status >= 500) throw new Retry(`BigBuy ${r.status}`);
  if (!r.ok) throw new Error(`BigBuy ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return { j, location: r.headers.get("location") };
}
let eurRate = 0;
async function eur() {
  if (eurRate) return eurRate;
  const r = await fetch("https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json");
  if (!r.ok) throw new Retry("Kurs EUR z NBP niedostępny");
  eurRate = Number((await r.json()).rates?.[0]?.mid) || 0;
  if (!eurRate) throw new Retry("Kurs EUR z NBP niedostępny");
  return eurRate;
}

// ---------- InPost ShipX ----------
const ipBase = (s: Settings) => (s.inpost_sandbox ? "https://sandbox-api-shipx-pl.easypack24.net" : "https://api-shipx-pl.easypack24.net");
async function ip(s: Settings, k: Secrets, path: string, init: RequestInit = {}) {
  if (!k.inpost_token || !k.inpost_org_id) throw new Error("Brak tokenu lub ID organizacji InPost (Panel → Realizacja → Klucze).");
  const r = await fetch(ipBase(s) + path.replace("{org}", k.inpost_org_id), {
    ...init, headers: { Authorization: `Bearer ${k.inpost_token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (r.status === 429 || r.status >= 500) throw new Retry(`InPost ${r.status}`);
  if (!r.ok) throw new Error(`InPost ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

// ---------- E-mail (SMTP 465 — porty 25/587 są w Edge zablokowane) ----------
async function sendMail(k: Secrets, to: string, subject: string, text: string, attachments: any[] = []) {
  if (!k.smtp_host || !k.smtp_user || !k.smtp_pass) throw new Error("Brak danych skrzynki SMTP (Panel → Realizacja → Klucze).");
  const t = nodemailer.createTransport({ host: k.smtp_host, port: 465, secure: true, auth: { user: k.smtp_user, pass: k.smtp_pass } });
  try {
    await t.sendMail({ from: k.smtp_from || k.smtp_user, to, subject, text, attachments });
  } catch (e) {
    throw new Retry(`SMTP: ${String((e as Error).message || e).slice(0, 200)}`);
  }
}

// ---------- Jedno zamówienie ----------
async function handle(f: any, s: Settings, k: Secrets, spent: { today: number }) {
  const { data: rec } = await sb.from("records").select("data").eq("col", "orders").eq("id", f.order_id).maybeSingle();
  const o = rec?.data;
  if (!o) return review(f, "Nie ma już tego zamówienia w CRM.");
  if (o.payment_status !== "oplacone") return update(f, { state: "cancelled", last_error: `Płatność: ${o.payment_status || "brak"}` });

  const pageId = f.page_id || o.page_id;
  const { data: rule } = pageId ? await sb.from("fulfil_rules").select("*").eq("page_id", pageId).maybeSingle() : { data: null };
  if (!rule || !rule.active || rule.adapter === "manual") return review(f, "Brak automatycznej reguły dla tej strony — zamów ręcznie albo dodaj regułę w Realizacji.", { status: "nowe" });
  const { data: page } = await sb.from("pages").select("name").eq("id", pageId).maybeSingle();

  let buyerName = o.buyer_name || "";
  if (!buyerName && o.customerId) buyerName = (await sb.from("records").select("data").eq("col", "customers").eq("id", o.customerId).maybeSingle()).data?.data?.name || "";
  const address: any = parseShipTo(o.ship_to, { name: buyerName, phone: o.buyer_phone, email: o.buyer_email || o.email });
  if (!address) return review(f, `Nie umiem odczytać adresu: „${o.ship_to || ""}”.`);
  if (address.phone.length !== 9) return review(f, "Brak poprawnego telefonu kupującego (9 cyfr).");
  const qty = Math.max(1, Number(o.qty) || 1);
  const sku = pickSku(rule, o.variant);
  if (rule.adapter !== "inpost" && !sku) return review(f, "Reguła nie ma kodu SKU produktu u dostawcy.");
  if (rule.adapter === "bigbuy" && address.kind === "locker") return review(f, "BigBuy nie dowozi do paczkomatów — potrzebny adres kuriera.");

  // Koszt: BigBuy liczy sam, pozostali — koszt z reguły.
  let cost: number | null = rule.unit_cost != null ? Math.round(Number(rule.unit_cost) * qty * 100) / 100 : null;
  let carrier = "";
  if (rule.adapter === "bigbuy") {
    const ship = await bb(s, k, "/rest/shipping/orders.json", { order: { delivery: { isoCountry: "PL", postcode: address.postcode }, products: [{ reference: sku, quantity: qty }] } });
    const best = cheapestShipping(ship.j);
    if (!best) return review(f, "BigBuy nie podał żadnej opcji wysyłki dla tego produktu.");
    carrier = best.name;
    const check = await bb(s, k, "/rest/order/check.json", bigbuyOrderBody({ reference: o.number || f.order_id, address, sku, qty, carrier }));
    const totalEur = pickTotal(check.j);
    if (totalEur) cost = Math.round(totalEur * (await eur()) * 1.23 * 100) / 100; // netto EUR -> brutto PLN
  }

  const plan = { adapter: rule.adapter, sku, qty, variant: o.variant || "", address, cost, carrier, price: Number(o.price) || 0 };
  const safe = safetyCheck({ price: o.price, cost, settings: s, spentToday: spent.today });
  if (!safe.ok) return review(f, safe.reason, undefined, plan);

  if (s.mode !== "live") {
    await update(f, { state: "dry_run", plan, cost, last_error: null });
    await log(f.id, "info", `Tryb próbny: zamówiłbym ${qty} × ${sku || page?.name} przez ${rule.adapter} za ${cost} zł (marża ${safe.margin} zł).`, plan);
    return;
  }

  let supplierOrderId = "", tracking = "", label: Uint8Array | null = null;
  if (rule.adapter === "bigbuy") {
    const res = await bb(s, k, "/rest/order/create.json", bigbuyOrderBody({ reference: o.number || f.order_id, address, sku, qty, carrier }));
    supplierOrderId = orderIdFromLocation(res.location) || String(res.j?.id || "");
  } else if (rule.adapter === "inpost") {
    const r = await ip(s, k, "/v1/organizations/{org}/shipments", { method: "POST", body: JSON.stringify(inpostShipmentBody({ address, size: rule.parcel_size, reference: o.number, sender: s.sender })) });
    const sh = await r.json();
    supplierOrderId = String(sh.id);
    for (let i = 0; i < 6 && !tracking; i++) {
      await new Promise((ok) => setTimeout(ok, 2500));
      const g = await (await ip(s, k, `/v1/shipments/${sh.id}`)).json();
      tracking = g.tracking_number || "";
    }
    carrier = "InPost";
    if (tracking) label = new Uint8Array(await (await ip(s, k, `/v1/shipments/${sh.id}/label?format=pdf&type=normal`)).arrayBuffer());
  }
  if (rule.adapter === "email" || (rule.adapter === "inpost" && rule.email_to)) {
    if (!rule.email_to) return review(f, "Reguła e-mail nie ma adresu hurtowni.", undefined, plan);
    const mail = supplierEmail({
      number: o.number || f.order_id, sku, productName: page?.name || "", qty, variant: o.variant || "", address, sender: s.sender,
      labelNote: label ? `W załączniku etykieta InPost (${tracking}). Prosimy nakleić ją na paczkę i nadać.` : undefined,
    });
    await sendMail(k, rule.email_to, mail.subject, mail.text, label ? [{ filename: `etykieta-${tracking}.pdf`, content: label, contentType: "application/pdf" }] : []);
    if (!supplierOrderId) supplierOrderId = `email:${rule.email_to}`;
  }

  const now = new Date().toISOString();
  spent.today += cost || 0;
  await update(f, { state: "ordered", ordered_at: now, supplier_order_id: supplierOrderId, cost, tracking: tracking || null, carrier: carrier || null, plan, last_error: null });
  await patchOrder(f.order_id, { status: "zamowione", cost: o.cost || cost, tracking: tracking || o.tracking || "", carrier: carrier || o.carrier || "" },
    `Zamówione automatycznie (${rule.adapter}${supplierOrderId ? ", " + supplierOrderId : ""}) za ${cost} zł.`);
  await log(f.id, "info", `Zamówione: ${qty} × ${sku || page?.name} przez ${rule.adapter} za ${cost} zł.`, { supplierOrderId, tracking });
}

async function update(f: any, patch: Record<string, unknown>) {
  await sb.from("fulfilments").update({ ...patch, adapter: (patch.plan as any)?.adapter ?? f.adapter, updated_at: new Date().toISOString() }).eq("id", f.id);
}
async function review(f: any, reason: string, orderPatch?: Record<string, unknown>, plan?: unknown) {
  await update(f, { state: "needs_review", last_error: reason, ...(plan ? { plan } : {}) });
  await patchOrder(f.order_id, orderPatch ?? { status: "problem" }, `Do sprawdzenia: ${reason}`);
  await log(f.id, "warn", reason);
}

// ---------- Śledzenie ----------
async function track(f: any, s: Settings, k: Secrets) {
  let tracking = f.tracking || "", carrier = f.carrier || "", state = "";
  if (f.adapter === "bigbuy" && /^\d+$/.test(f.supplier_order_id || "")) {
    const r = await bb(s, k, "/rest/tracking/orders.json", { tracking: { orders: [{ id: Number(f.supplier_order_id) }] } });
    const t = (Array.isArray(r.j) ? r.j[0] : r.j)?.trackings?.[0];
    if (t?.trackingNumber) { tracking = t.trackingNumber; carrier = t.carrier?.name || carrier; state = "shipped"; }
    if (/deliver|entreg/i.test(String(t?.statusDescription || t?.status || ""))) state = "delivered";
  }
  if (!tracking) {
    const { data: rec } = await sb.from("records").select("data").eq("col", "orders").eq("id", f.order_id).maybeSingle();
    tracking = rec?.data?.tracking || ""; carrier = rec?.data?.carrier || carrier;
  }
  if (tracking && /^\d{24}$/.test(tracking)) {
    const r = await fetch(`https://api-shipx-pl.easypack24.net/v1/tracking/${tracking}`);
    if (r.ok) { state = inpostState((await r.json()).status) || state; carrier = carrier || "InPost"; }
  }
  if (!state && tracking && f.state === "ordered") state = "shipped";
  const patch: Record<string, unknown> = { tracked_at: new Date().toISOString() };
  if (tracking && tracking !== f.tracking) Object.assign(patch, { tracking, carrier });
  if (state && state !== f.state && !(f.state === "delivered")) patch.state = state;
  await sb.from("fulfilments").update(patch).eq("id", f.id);
  if (patch.state || patch.tracking) {
    const st = (patch.state as string) || f.state;
    await patchOrder(f.order_id, { tracking, carrier, ...(st === "shipped" ? { status: "wyslane" } : st === "delivered" ? { status: "dostarczone" } : {}) });
    await log(f.id, "info", st === "delivered" ? `Dostarczone (${tracking}).` : `Przesyłka w drodze: ${carrier} ${tracking}.`);
  }
}

async function run(only?: string) {
  const { data: s } = await sb.from("fulfil_settings").select("*").eq("id", 1).single();
  const { data: k } = await sb.rpc("nhp_fulfil_secrets");
  const out = { processed: 0, tracked: 0, mode: s.mode };
  if (s.mode === "off") return out;
  const { data: spentToday } = await sb.rpc("nhp_fulfil_spent_today");
  const spent = { today: Number(spentToday) || 0 };

  let q = sb.from("fulfilments").select("*").eq("state", "queued").lte("next_try_at", new Date().toISOString()).order("created_at").limit(10);
  if (only) q = sb.from("fulfilments").select("*").eq("id", only).in("state", ["queued", "needs_review", "failed", "dry_run"]);
  const { data: rows } = await q;
  for (const f of rows || []) {
    // Rezerwacja wiersza: drugi równoległy przebieg go nie weźmie.
    const attempts = (only ? 0 : f.attempts) + 1;
    const { data: claimed } = await sb.from("fulfilments")
      .update({ state: "queued", attempts, next_try_at: new Date(Date.now() + backoffMinutes(attempts) * 60e3).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", f.id).eq("updated_at", f.updated_at).select("*").maybeSingle();
    if (!claimed) continue;
    out.processed++;
    try {
      await handle(claimed, s, k || {}, spent);
    } catch (e) {
      const msg = String((e as Error).message || e).slice(0, 400);
      if (e instanceof Retry && attempts < MAX_ATTEMPTS) {
        await sb.from("fulfilments").update({ last_error: `${msg} — ponowię za ${backoffMinutes(attempts)} min` }).eq("id", f.id);
        await log(f.id, "warn", msg);
      } else {
        await sb.from("fulfilments").update({ state: "failed", last_error: msg, updated_at: new Date().toISOString() }).eq("id", f.id);
        await patchOrder(f.order_id, { status: "problem" }, `Automatyczne zamówienie nie wyszło: ${msg}`);
        await log(f.id, "error", msg);
      }
    }
  }

  const stale = new Date(Date.now() - 2 * 3600e3).toISOString();
  const { data: open } = await sb.from("fulfilments").select("*").in("state", ["ordered", "shipped"])
    .or(`tracked_at.is.null,tracked_at.lt.${stale}`).order("tracked_at", { nullsFirst: true }).limit(20);
  for (const f of open || []) {
    try { await track(f, s, k || {}); out.tracked++; }
    catch (e) { await sb.from("fulfilments").update({ tracked_at: new Date().toISOString() }).eq("id", f.id); await log(f.id, "warn", `Śledzenie: ${String((e as Error).message || e).slice(0, 300)}`); }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  const { data: k } = await sb.rpc("nhp_fulfil_secrets");
  if (!(await authorized(req, k || {}))) return json({ error: "Brak dostępu" }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    return json({ ok: true, ...(await run(typeof body.retry === "string" ? body.retry : undefined)) });
  } catch (e) {
    await log(null, "error", `Przebieg: ${String((e as Error).message || e)}`);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
