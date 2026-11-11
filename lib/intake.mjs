// Zamówienia, leady i wiadomości ze stron publicznych → rekordy CRM.
// Sklep nie luzuje RLS: woła to wyłącznie endpoint z kluczem serwerowym.

import {
  buildPayUrl, cleanSiteData, EMAIL_RE, kStr, kText, orderNumber, shippingPlan, siteBundles
} from "./site-model.mjs";

const MIN_MS = 1200;
const MAX_MS = 48 * 3600 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const ORDER_IP_LIMIT = 8;
const ORDER_EMAIL_LIMIT = 4;

function rid(prefix) {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return prefix + [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function freshEnough(opened) {
  const n = Number(opened);
  if (!Number.isFinite(n)) return false;
  const age = Date.now() - n;
  return age >= MIN_MS && age <= MAX_MS;
}

// Supabase Edge Function pay-session czyta kwotę z zapisanego zamówienia i zwraca adres płatności Stripe.
// Błąd płatności nie psuje zamówienia — zostaje ze statusem „oczekuje”.
async function stripeCheckoutUrl(env, orderId) {
  const base = String(env?.SUPABASE_URL || "").replace(/\/$/, "");
  if (!base || env?.STRIPE_CHECKOUT === "0") return null;
  try {
    const res = await fetch(`${base}/functions/v1/pay-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: orderId })
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && typeof body.url === "string" && body.url.startsWith("https://checkout.stripe.com/") ? body.url : null;
  } catch {
    return null;
  }
}

function honeypot(body) {
  return String(body?.company_website || body?.website || "").trim() !== "";
}

export async function placeOrder(store, env, slug, body, { ip = "", now = new Date() } = {}) {
  if (!/^[a-z0-9-]{1,70}$/.test(slug || "")) return fail(404, "Ta oferta nie jest już dostępna.");
  const page = await store.getPage(slug, { publishedOnly: true });
  if (!page) return fail(404, "Ta oferta nie jest już dostępna.");
  if (honeypot(body)) return fail(400, "Nie udało się zapisać zamówienia.");
  if (!freshEnough(body?.opened_at)) return fail(400, "Odśwież stronę i wyślij formularz jeszcze raz.");

  const since = Date.now() - WINDOW_MS;
  if (await store.countHits("order", ip || "unknown", since) >= ORDER_IP_LIMIT) {
    return fail(429, "Za dużo prób. Spróbuj za kilka minut.");
  }
  await store.logHit("order", slug, ip || "unknown");

  const d = cleanSiteData(page.data || {});
  const bundles = siteBundles(d);
  const idx = parseInt(body?.bundle, 10);
  const b = bundles[Number.isInteger(idx) ? idx : -1] || null;
  if (!b) return fail(400, "Wybierz zestaw.");
  if (d.stock === 0) return fail(400, "Tego produktu nie ma teraz w magazynie.");
  if (d.stock != null && b.qty > d.stock) return fail(400, "Za mało sztuk w magazynie.");

  const email = kStr(body?.email, 160).toLowerCase();
  const name = kStr(body?.name, 120);
  const phone = kStr(body?.phone, 30);
  const address = kStr(body?.address, 300);
  const digits = phone.replace(/\D/g, "");
  if (!name || digits.length < 9 || !EMAIL_RE.test(email) || address.length < 3) {
    return fail(400, "Uzupełnij imię, telefon, e-mail i adres.");
  }
  if (await store.countOrdersByEmail(email, since) >= ORDER_EMAIL_LIMIT) {
    return fail(429, "Za dużo zamówień z tego adresu. Napisz do nas, jeśli to pomyłka.");
  }

  const clientReq = kStr(body?.client_req, 80);
  if (clientReq) {
    const prev = await store.findOrderByClientReq(page.id, clientReq);
    if (prev) {
      return ok({
        ok: true,
        number: prev.data.number,
        total: prev.data.price,
        pay_url: prev.data.pay_url || null,
        payment_status: prev.data.payment_status || "oczekuje"
      });
    }
  }

  const variant = d.variants.includes(body?.variant) ? body.variant : "";
  const bump = body?.bump === true && d.checkout.bump && d.addons[0] ? { name: d.addons[0].name, price: d.addons[0].price } : null;
  const shipCost = d.shipping.free ? 0 : (d.shipping.price || 0);
  const total = Math.round((b.price + (bump ? bump.price : 0) + shipCost) * 100) / 100;
  const pay = ["blik", "przelew", "karta", "wallet"].includes(body?.pay) ? body.pay : "blik";
  const ship = body?.ship === "kurier" ? "kurier" : "paczkomat";
  const number = orderNumber(now);
  const payUrl = buildPayUrl(env, d.pay_url, { number, total, email, slug });
  const plan = shippingPlan(now, d.shipping.cutoff || "15:00");

  let customer = await store.findCustomerByEmail(email);
  if (!customer) {
    const cid = rid("cu");
    const data = {
      name, email, phone, city: "", source: "One-page", tag: "zwykly",
      notes: `Ze strony /p/${slug}`, createdAt: Date.now()
    };
    await store.upsertRecord("customers", cid, data);
    customer = { id: cid, data };
  }

  const unitCost = d.cost != null ? Math.round(d.cost * b.qty * 100) / 100 : "";
  const note = [
    `One-page /p/${slug}`,
    `Zestaw: ${b.label}`,
    variant && `Wariant: ${variant}`,
    bump && `Dodatek: ${bump.name}`,
    `Płatność: ${pay} (oczekuje)`,
    `Dostawa: ${ship} — ${address}`,
    body?.gift === true && d.checkout.gift ? `Prezent${body?.note ? ": " + kStr(body.note, 200) : ""}` : ""
  ].filter(Boolean).join("\n");

  const oid = rid("or");
  const order = {
    number,
    date: plan.isoDate,
    customerId: customer.id,
    productId: page.product_id || "",
    shopId: page.shop_id || "",
    qty: b.qty,
    price: total,
    cost: unitCost,
    shipping: shipCost,
    ads: 0,
    status: "nowe",
    payment_status: "oczekuje",
    pay_url: payUrl || "",
    pay_method: pay,
    source: "One-page",
    page_slug: slug,
    page_id: page.id,
    email,
    buyer_email: email,
    buyer_phone: phone,
    ship_to: address,
    variant,
    bundle_label: b.label,
    client_req: clientReq,
    notes: note,
    createdAt: Date.now()
  };
  await store.upsertRecord("orders", oid, order);

  if (body?.marketing === true && d.checkout.reminder) {
    const lid = await leadKey(page.id, email);
    await store.upsertRecord("leads", lid, {
      name, email, page_slug: slug, page_id: page.id, page_name: page.name || "",
      bundle: b.label, status: "zamowil", createdAt: Date.now()
    });
  }

  if (d.stock != null) {
    const next = cleanSiteData({ ...d, stock: Math.max(0, d.stock - b.qty) });
    await store.updatePageData(page.id, next);
  }

  // Bez własnego szablonu płatności kupujący idzie do Stripe (BLIK, Przelewy24, karta) na dokładną kwotę zamówienia.
  const finalPayUrl = payUrl || await stripeCheckoutUrl(env, oid);

  return ok({ ok: true, number, total, pay_url: finalPayUrl, payment_status: "oczekuje" });
}

export async function placeLead(store, env, slug, body, { ip = "" } = {}) {
  if (!/^[a-z0-9-]{1,70}$/.test(slug || "")) return fail(404, "Nie ma takiej strony.");
  const page = await store.getPage(slug, { publishedOnly: true });
  if (!page) return fail(404, "Nie ma takiej strony.");
  if (honeypot(body)) return fail(400, "Nie udało się zapisać.");
  if (!freshEnough(body?.opened_at)) return fail(400, "Odśwież stronę i spróbuj jeszcze raz.");
  const since = Date.now() - WINDOW_MS;
  if (await store.countHits("lead", ip || "unknown", since) >= 10) return fail(429, "Za dużo prób.");
  await store.logHit("lead", slug, ip || "unknown");
  const email = kStr(body?.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) return fail(400, "Podaj poprawny e-mail.");
  const lid = await leadKey(page.id, email);
  await store.upsertRecord("leads", lid, {
    name: kStr(body?.name, 120),
    email,
    page_slug: slug,
    page_id: page.id,
    page_name: page.name || "",
    bundle: kStr(body?.bundle_label || body?.bundle, 40),
    status: "nowy",
    createdAt: Date.now()
  });
  return ok({ ok: true });
}

export async function placeMessage(store, env, slug, body, { ip = "" } = {}) {
  if (!/^[a-z0-9-]{1,70}$/.test(slug || "")) return fail(404, "Nie ma takiej strony.");
  const page = await store.getPage(slug, { publishedOnly: true });
  if (!page) return fail(404, "Nie ma takiej strony.");
  if (honeypot(body)) return fail(400, "Nie udało się wysłać wiadomości.");
  if (!freshEnough(body?.opened_at)) return fail(400, "Odśwież stronę i spróbuj jeszcze raz.");
  const since = Date.now() - WINDOW_MS;
  if (await store.countHits("contact", ip || "unknown", since) >= 8) return fail(429, "Za dużo wiadomości. Spróbuj później.");
  await store.logHit("contact", slug, ip || "unknown");
  const name = kStr(body?.name, 120);
  const email = kStr(body?.email, 160).toLowerCase();
  const message = kText(body?.message, 2000);
  if (!name || !EMAIL_RE.test(email) || message.length < 3) return fail(400, "Uzupełnij imię, e-mail i wiadomość.");
  if ((message.match(/https?:\/\//g) || []).length > 3) return fail(400, "Wiadomość wygląda na spam.");
  await store.upsertRecord("messages", rid("ms"), {
    name, email, topic: kStr(body?.topic, 40), message,
    page_slug: slug, page_id: page.id, page_name: page.name || "",
    status: "nowe", createdAt: Date.now()
  });
  return ok({ ok: true });
}

async function leadKey(pageId, email) {
  const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${pageId}|${email}`));
  const hex = [...new Uint8Array(dig)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ld${hex}`;
}

function ok(body) { return { status: 200, body }; }
function fail(status, message) { return { status, body: { ok: false, message } }; }
