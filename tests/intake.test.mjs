import test from "node:test";
import assert from "node:assert/strict";
import { cleanSiteData } from "../lib/site-model.mjs";
import { createMemoryStore } from "../lib/memory-store.mjs";
import { placeLead, placeMessage, placeOrder } from "../lib/intake.mjs";

function readyPage(extra = {}) {
  return {
    id: "pg1",
    slug: "kalendarz",
    name: "Kalendarz adwentowy",
    status: "published",
    product_id: "pr1",
    shop_id: "sh_pg1",
    data: cleanSiteData({
      headline: "Kalendarz",
      price: 189,
      cost: 40,
      bundles: [
        { label: "1 szt.", qty: 1, price: 189 },
        { label: "2 szt.", qty: 2, price: 339, note: "Gratis: karty" }
      ],
      variants: ["Czerwony", "Granatowy"],
      images: [{ url: "https://cdn.x.pl/k.jpg", rights: true }],
      addons: [{ name: "Naklejki", price: 39 }],
      stock: 5,
      shipping: { cutoff: "15:00", free: true },
      seller: { name: "A", email: "a@a.pl" },
      gpsr: { producer: "P" },
      checkout: { bump: true, gift: true, reminder: true },
      ...extra
    })
  };
}

function orderBody(over = {}) {
  return {
    bundle: 1,
    variant: "Czerwony",
    bump: true,
    name: "Jan Kowalski",
    phone: "500600700",
    email: "jan@x.pl",
    address: "WRO01M",
    ship: "paczkomat",
    pay: "blik",
    marketing: true,
    opened_at: Date.now() - 5000,
    client_req: "req-1",
    company_website: "",
    ...over
  };
}

test("zamówienie ze strony tworzy zamówienie nowe i klienta", async () => {
  const store = createMemoryStore();
  await store.savePage(readyPage());
  const env = { PAY_URL_TEMPLATE: "https://platnosc.example/pay?n={number}&kwota={total}&email={email}" };
  let res = await placeOrder(store, env, "kalendarz", orderBody(), { ip: "1.1.1.1" });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 378);
  assert.equal(res.body.payment_status, "oczekuje");
  assert.match(res.body.number, /^\d{6}-\d{4}$/);
  assert.match(res.body.pay_url, /^https:\/\/platnosc\.example\/pay\?n=/);

  const orders = store.records("orders");
  assert.equal(orders.length, 1);
  assert.equal(orders[0].data.status, "nowe");
  assert.equal(orders[0].data.payment_status, "oczekuje");
  assert.equal(orders[0].data.source, "One-page");
  assert.equal(orders[0].data.page_slug, "kalendarz");
  assert.equal(orders[0].data.productId, "pr1");
  assert.equal(orders[0].data.shopId, "sh_pg1");
  assert.equal(orders[0].data.qty, 2);
  assert.equal(orders[0].data.price, 378);
  assert.equal(orders[0].data.cost, 80);

  const customers = store.records("customers");
  assert.equal(customers.length, 1);
  assert.equal(customers[0].data.email, "jan@x.pl");
  assert.equal(customers[0].data.source, "One-page");
  assert.equal(orders[0].data.customerId, customers[0].id);

  const leads = store.records("leads");
  assert.equal(leads.length, 1);

  const page = await store.getPage("kalendarz");
  assert.equal(page.data.stock, 3);

  const again = await placeOrder(store, env, "kalendarz", orderBody(), { ip: "1.1.1.2" });
  assert.equal(again.body.number, res.body.number);
  assert.equal(store.records("orders").length, 1);
  assert.equal((await store.getPage("kalendarz")).data.stock, 3);
});

test("walidacja zamówienia, spam i brak strony", async () => {
  const store = createMemoryStore();
  await store.savePage(readyPage());
  const bad = await placeOrder(store, {}, "kalendarz", orderBody({ name: "", email: "zly" }), { ip: "2.2.2.2" });
  assert.equal(bad.status, 400);
  const missing = await placeOrder(store, {}, "nie-ma-takiej", orderBody(), { ip: "2.2.2.3" });
  assert.equal(missing.status, 404);
  const draft = readyPage();
  draft.status = "draft";
  draft.slug = "szkic";
  draft.id = "pg2";
  await store.savePage(draft);
  const hidden = await placeOrder(store, {}, "szkic", orderBody(), { ip: "2.2.2.4" });
  assert.equal(hidden.status, 404);
  const bot = await placeOrder(store, {}, "kalendarz", orderBody({ company_website: "http://spam.test", client_req: "inny" }), { ip: "2.2.2.5" });
  assert.equal(bot.status, 400);
  assert.equal(store.records("orders").length, 0);
  const fast = await placeOrder(store, {}, "kalendarz", orderBody({ opened_at: Date.now(), client_req: "szybko" }), { ip: "2.2.2.6" });
  assert.equal(fast.status, 400);
});

test("stan zero blokuje zamówienie, a brak liczby nie udaje niskiego stanu", async () => {
  const store = createMemoryStore();
  const page = readyPage({ stock: 0 });
  await store.savePage(page);
  const res = await placeOrder(store, {}, "kalendarz", orderBody({ client_req: "z" }), { ip: "3.3.3.3" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /magazyn/);
});

test("lead i wiadomość kontaktowa", async () => {
  const store = createMemoryStore();
  await store.savePage(readyPage());
  let lead = await placeLead(store, {}, "kalendarz", { email: "Ola@X.pl", name: "Ola", opened_at: Date.now() - 4000 }, { ip: "4.4.4.4" });
  assert.equal(lead.status, 200);
  lead = await placeLead(store, {}, "kalendarz", { email: "ola@x.pl", name: "Ola K", opened_at: Date.now() - 4000 }, { ip: "4.4.4.5" });
  assert.equal(lead.status, 200);
  assert.equal(store.records("leads").length, 1, "ten sam e-mail nie dubluje leada");
  let msg = await placeMessage(store, {}, "kalendarz", { name: "Ewa", email: "ewa@x.pl", topic: "Dostawa", message: "Kiedy dojdzie?", opened_at: Date.now() - 4000 }, { ip: "4.4.4.6" });
  assert.equal(msg.status, 200);
  assert.equal(store.records("messages")[0].data.status, "nowe");
  assert.equal(store.records("messages")[0].data.page_slug, "kalendarz");
  msg = await placeMessage(store, {}, "kalendarz", { name: "", email: "x", message: "", opened_at: Date.now() - 4000 }, { ip: "4.4.4.7" });
  assert.equal(msg.status, 400);
});

test("bez szablonu płatności pay_url jest puste, status i tak oczekuje", async () => {
  const store = createMemoryStore();
  await store.savePage(readyPage({ stock: null }));
  const res = await placeOrder(store, {}, "kalendarz", orderBody({ bundle: 0, bump: false, marketing: false, client_req: "bez" }), { ip: "5.5.5.5" });
  assert.equal(res.status, 200);
  assert.equal(res.body.pay_url, null);
  assert.equal(res.body.payment_status, "oczekuje");
  assert.equal(res.body.total, 189);
  assert.equal((await store.getPage("kalendarz")).data.stock, null);
});

test("bez szablonu płatności zamówienie dostaje sesję Stripe na swoją kwotę", async () => {
  const store = createMemoryStore();
  await store.savePage(readyPage({ stock: null }));
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 });
  };
  try {
    const env = { SUPABASE_URL: "https://proj.supabase.co/" };
    const res = await placeOrder(store, env, "kalendarz", orderBody({ bundle: 0, bump: false, marketing: false, client_req: "stripe" }), { ip: "6.6.6.6" });
    assert.equal(res.status, 200);
    assert.equal(res.body.pay_url, "https://checkout.stripe.com/c/pay/cs_test_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://proj.supabase.co/functions/v1/pay-session");
    assert.match(calls[0].body.order_id, /^or[0-9a-f]{12}$/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("błąd Stripe nie psuje zamówienia", async () => {
  const store = createMemoryStore();
  await store.savePage(readyPage({ stock: null }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  try {
    const res = await placeOrder(store, { SUPABASE_URL: "https://proj.supabase.co" }, "kalendarz", orderBody({ bundle: 0, bump: false, marketing: false, client_req: "stripe-blad" }), { ip: "7.7.7.7" });
    assert.equal(res.status, 200);
    assert.equal(res.body.pay_url, null);
    assert.equal(res.body.payment_status, "oczekuje");
  } finally {
    globalThis.fetch = realFetch;
  }
});
