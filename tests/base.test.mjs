import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_API_URL,
  baseCall,
  cleanIds,
  imageUrls,
  inventoryInfo,
  listFromResponse,
  pickPrice,
  pickStock,
  productFromInventoryData,
  productFromStorageData
} from "../lib/base-core.mjs";
import { buildProductSetInput, safeHtml, variantMapFromShopify } from "../lib/shopify-core.mjs";
import { handleBase } from "../functions/api/base/[[path]].js";

const INVENTORY = {
  inventory_id: 307,
  name: "Dekoracje",
  default_language: "pl",
  default_price_group: 105,
  default_warehouse: "bl_206",
  is_default: true
};

const DATA = {
  sku: "CHOI-1",
  ean: "5901234123457",
  tax_rate: 23,
  category_id: 3,
  manufacturer_id: 7,
  prices: { 105: 49.9, 106: 59.9 },
  stock: { bl_206: 5, bl_207: 7 },
  text_fields: {
    name: "Choinka LED 60 cm",
    "name|de": "Weihnachtsbaum",
    description: "<p>Ciepłe <b>światło</b></p><script>alert(1)</script>",
    features: { Wysokość: "60 cm", Kolor: "Zielony" }
  },
  images: { 2: "https://cdn.example/b.jpg", 1: "https://cdn.example/a.jpg", "2|amazon_0": "https://cdn.example/amz.jpg" },
  variants: {}
};

test("Base: cena z grupy katalogu, stan z magazynu domyślnego, a bez niego suma", () => {
  assert.equal(pickPrice({ 105: 10, 106: 12 }, "106"), 12);
  assert.equal(pickPrice({ 105: 0, 106: 12 }, "105"), 12);
  assert.equal(pickPrice({}, "105"), null);
  assert.equal(pickStock({ bl_1: 3, bl_2: 4 }, "bl_2"), 4);
  assert.equal(pickStock({ bl_1: 3, bl_2: 4 }, "bl_9"), 7);
  assert.equal(pickStock(null, "bl_1"), null);
});

test("Base: zdjęcia w kolejności pozycji, bez nadpisań kanałów", () => {
  assert.deepEqual(imageUrls(DATA.images), ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]);
  assert.deepEqual(imageUrls(["https://x/1.jpg", "javascript:alert(1)", "https://x/1.jpg"]), ["https://x/1.jpg"]);
});

test("Base: lista katalogu pomija warianty, liczy cenę i stan", () => {
  const inv = inventoryInfo(INVENTORY);
  const rows = listFromResponse({
    products: {
      11: { id: 11, parent_id: 0, name: "Bombka", sku: "B1", ean: "123", prices: { 105: 9.99 }, stock: { bl_206: 2 } },
      12: { id: 12, parent_id: 11, name: "Bombka — czerwona", prices: { 105: 9.99 }, stock: { bl_206: 1 } }
    }
  }, "inventory", inv);
  assert.deepEqual(rows, [{ id: "11", name: "Bombka", sku: "B1", ean: "123", price: 9.99, stock: 2 }]);
  const storage = listFromResponse({ products: [{ product_id: "524", name: "Lampion", quantity: "3", price_brutto: "19.90", sku: "", ean: "" }] }, "storage");
  assert.deepEqual(storage, [{ id: "524", name: "Lampion", sku: "", ean: "", price: 19.9, stock: 3 }]);
});

test("Base: pełne dane katalogu → wiersz products", () => {
  const row = productFromInventoryData("2685", DATA, {
    inventory: inventoryInfo(INVENTORY),
    catalogId: "cat-1",
    categories: { 3: "Boże Narodzenie" },
    manufacturers: { 7: "Ikonka" },
    now: "2026-11-12T10:00:00.000Z"
  });
  assert.equal(row.source, "base");
  assert.equal(row.base_inventory_id, "307");
  assert.equal(row.base_product_id, "2685");
  assert.equal(row.catalog_id, "cat-1");
  assert.equal(row.name, "Choinka LED 60 cm");
  assert.equal(row.price, 49.9);
  assert.equal(row.stock, 5);
  assert.equal(row.producer, "Ikonka");
  assert.equal(row.category, "Boże Narodzenie");
  assert.equal(row.status, "active");
  assert.deepEqual(row.params, [{ name: "Wysokość", value: "60 cm" }, { name: "Kolor", value: "Zielony" }]);
  assert.equal(row.description, "Ciepłe światło");
  assert.match(row.raw.base.description_html, /<b>światło<\/b>/);
  assert.equal(row.base_synced_at, "2026-11-12T10:00:00.000Z");
});

test("Base: warianty — cena i stan produktu z wariantów, brak ceny oznacza flagged", () => {
  const row = productFromInventoryData("1", {
    ...DATA,
    prices: {},
    stock: {},
    variants: {
      21: { name: "Biała", sku: "C-W", ean: "5901234123464", prices: { 105: 55 }, stock: { bl_206: 2 } },
      20: { name: "Złota", sku: "C-G", prices: { 105: 52 }, stock: { bl_206: 4 } }
    }
  }, { inventory: inventoryInfo(INVENTORY) });
  assert.deepEqual(row.variants.map((v) => v.base_id), ["20", "21"]);
  assert.equal(row.price, 52);
  assert.equal(row.stock, 6);
  const noPrice = productFromInventoryData("2", { ...DATA, prices: {} }, { inventory: inventoryInfo(INVENTORY) });
  assert.equal(noPrice.status, "flagged");
});

test("Base: hurtownia (magazyn zewnętrzny) → wiersz products", () => {
  const row = productFromStorageData("524", {
    product_id: "524",
    name: "Lampion",
    price_brutto: "1110.05",
    quantity: "0",
    ean: "6115181635",
    man_name: "VidaXL",
    description: "opis",
    images: ["https://cdn.example/l.jpg"],
    features: [["Materiał", "Metal"]],
    variants: [{ variant_id: 9, name: "Duży", price: 120, quantity: 2, sku: "L-D" }]
  }, { storageId: "warehouse_12" });
  assert.equal(row.source, "base_hurtownia");
  assert.equal(row.base_inventory_id, "warehouse_12");
  assert.equal(row.price, 1110.05);
  assert.equal(row.stock, 2);
  assert.equal(row.producer, "VidaXL");
  assert.deepEqual(row.params, [{ name: "Materiał", value: "Metal" }]);
  assert.equal(row.variants[0].base_id, "9");
});

test("Base: wywołanie API idzie POST-em z nagłówkiem X-BLToken, błąd tokenu jest po polsku", async () => {
  const calls = [];
  const ok = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: "SUCCESS", inventories: [] }), { status: 200 });
  };
  await baseCall({ token: "t-123" }, "getInventories", {}, ok);
  assert.equal(calls[0].url, BASE_API_URL);
  assert.equal(calls[0].init.headers["X-BLToken"], "t-123");
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("method"), "getInventories");
  assert.equal(body.get("parameters"), "{}");
  const bad = async () => new Response(JSON.stringify({ status: "ERROR", error_code: "ERROR_BAD_TOKEN", error_message: "Invalid token" }), { status: 200 });
  await assert.rejects(baseCall({ token: "x" }, "getInventories", {}, bad), /Base odrzucił token/);
  await assert.rejects(baseCall(null, "getInventories", {}, ok), /BASE_API_TOKEN/);
});

test("Base: id z przeglądarki są czyszczone i przycinane", () => {
  assert.deepEqual(cleanIds(["1", "1", "2", "../x", "shop_2", 3], 3), ["1", "2", "shop_2"]);
});

test("Shopify: warianty z Base, stan w lokalizacji i bezpieczny opis", () => {
  const product = {
    name: "Choinka",
    source: "base",
    price: 52,
    stock: 6,
    workflow_status: "pobrany",
    variants: [
      { base_id: "20", name: "Złota", sku: "C-G", price: 52, stock: 4 },
      { base_id: "21", name: "Złota", sku: "C-W", ean: "5901234123464", price: 55, stock: 2 }
    ],
    shopify_variant_map: { 20: "777" },
    raw: { base: { description_html: "<p onclick=\"x()\">Opis</p><script>alert(1)</script><a href=\"javascript:alert(1)\">x</a>" } }
  };
  const input = buildProductSetInput(product, null, { locationId: "gid://shopify/Location/1" });
  assert.equal(input.status, "DRAFT");
  assert.deepEqual(input.productOptions, [{ name: "Wariant", values: [{ name: "Złota" }, { name: "Złota (C-W)" }] }]);
  assert.equal(input.variants[0].id, "gid://shopify/ProductVariant/777");
  assert.equal(input.variants[0].price, "52.00");
  assert.deepEqual(input.variants[0].inventoryQuantities, [{ locationId: "gid://shopify/Location/1", name: "available", quantity: 4 }]);
  assert.deepEqual(input.variants[0].inventoryItem, { tracked: true });
  assert.equal(input.variants[1].id, undefined);
  assert.deepEqual(input.variants[1].barcodes, [{ barcode: "5901234123464" }]);
  assert.equal(input.descriptionHtml, "<p>Opis</p><a>x</a>");
  const noLocation = buildProductSetInput(product, null, {});
  assert.equal(noLocation.variants[0].inventoryQuantities, undefined);
  assert.equal(safeHtml("<iframe src=x></iframe><img src=\"data:x\" onerror=alert(1)>"), "<img>");
});

test("Shopify: produkt bez wariantów zostaje przy jednym wariancie „Domyślny”", () => {
  const input = buildProductSetInput({ name: "Kubek", price: "10", sku: "K", stock: 3, source: "base" }, null, { locationId: "gid://shopify/Location/1" });
  assert.deepEqual(input.productOptions, [{ name: "Tytuł", values: [{ name: "Domyślny" }] }]);
  assert.equal(input.variants.length, 1);
  assert.equal(input.variants[0].inventoryQuantities[0].quantity, 3);
});

test("Shopify: id wariantów wracają do mapy po SKU albo nazwie opcji", () => {
  const map = variantMapFromShopify({
    variants: [{ base_id: "20", name: "Złota", sku: "C-G" }, { base_id: "21", name: "Biała", sku: "" }]
  }, [
    { id: "gid://shopify/ProductVariant/1", sku: "C-G", selectedOptions: [{ name: "Wariant", value: "Złota" }] },
    { id: "gid://shopify/ProductVariant/2", sku: "", selectedOptions: [{ name: "Wariant", value: "Biała" }] }
  ]);
  assert.deepEqual(map, { 20: "1", 21: "2" });
});

/* ---------- /api/base/* z atrapami Base, Supabase i Shopify ---------- */

const PID = "11111111-2222-3333-4444-555555555555";

function fakeWorld({ inventoryScope = true } = {}) {
  const db = { products: [], catalogs: [], queue: [{ product_id: PID, done_at: null }] };
  const log = [];
  const respond = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status });
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || "GET";
    log.push(`${method} ${u}`);
    if (u === BASE_API_URL) {
      const body = new URLSearchParams(init.body);
      const m = body.get("method");
      const params = JSON.parse(body.get("parameters"));
      if (init.headers["X-BLToken"] !== "base-token") return respond({ status: "ERROR", error_code: "ERROR_BAD_TOKEN" });
      if (m === "getInventories") return respond({ status: "SUCCESS", inventories: [INVENTORY] });
      if (m === "getExternalStoragesList") return respond({ status: "SUCCESS", storages: [{ storage_id: "warehouse_12", name: "Ikonka", read: true, methods: ["getExternalStorageProductsData"] }] });
      if (m === "getInventoryProductsList") return respond({ status: "SUCCESS", products: { 2685: { id: 2685, parent_id: 0, name: "Choinka", prices: { 105: 49.9 }, stock: { bl_206: 5 } } } });
      if (m === "getInventoryProductsData") {
        assert.deepEqual(params.products, [2685]);
        return respond({ status: "SUCCESS", products: { 2685: DATA } });
      }
      if (m === "getInventoryCategories") return respond({ status: "SUCCESS", categories: [{ category_id: 3, name: "Boże Narodzenie" }] });
      if (m === "getInventoryManufacturers") return respond({ status: "SUCCESS", manufacturers: [{ manufacturer_id: 7, name: "Ikonka" }] });
      return respond({ status: "ERROR", error_code: "ERROR_UNKNOWN_METHOD" });
    }
    if (u.startsWith("https://sb.test/rest/v1/")) {
      const path = u.slice("https://sb.test/rest/v1/".length);
      const body = init.body ? JSON.parse(init.body) : null;
      if (path.startsWith("product_catalogs?on_conflict=source,external_id") && method === "POST") {
        db.catalogs.push(body);
        return respond([{ id: "cat-1" }]);
      }
      if (path.startsWith("products?source=eq.base") && method === "GET") {
        return respond(db.products.map((p) => ({ id: p.id, base_product_id: p.base_product_id, workflow_status: p.workflow_status, shopify_product_id: p.shopify_product_id || null })));
      }
      if (path.startsWith("products?on_conflict=source,base_inventory_id,base_product_id") && method === "POST") {
        const out = [];
        for (const row of body) {
          let found = db.products.find((p) => p.source === row.source && p.base_inventory_id === row.base_inventory_id && p.base_product_id === row.base_product_id);
          if (!found) { found = { id: PID, workflow_status: "pobrany" }; db.products.push(found); }
          Object.assign(found, row);
          out.push({ id: found.id, base_product_id: found.base_product_id, shopify_product_id: found.shopify_product_id || null, workflow_status: found.workflow_status });
        }
        return respond(out);
      }
      if (path.startsWith(`products?id=eq.${PID}&select=*`)) return respond(db.products);
      if (path.startsWith("products?id=in.") && method === "GET") return respond(db.products.filter((p) => path.includes(p.id)).map((p) => ({ id: p.id, base_product_id: p.base_product_id, workflow_status: p.workflow_status })));
      if (path.startsWith(`products?id=eq.${PID}`) && method === "PATCH") { Object.assign(db.products[0], body); return respond(null, 204); }
      if (path.startsWith(`pages?product_id=eq.${PID}`)) return respond([]);
      if (path.startsWith("shopify_sync_queue?product_id=in.") && method === "PATCH") { db.queue.forEach((q) => { q.done_at = body.done_at; }); return respond(null, 204); }
      return respond({ message: `nieznana ścieżka ${path}` }, 404);
    }
    if (u === "https://sklep.myshopify.com/admin/api/2026-10/graphql.json") {
      const { query, variables } = JSON.parse(init.body);
      if (/NhpLocation/.test(query)) return respond({ data: { location: { id: "gid://shopify/Location/9" } } });
      if (/NhpProductSet/.test(query)) {
        const hasInventory = variables.input.variants.some((v) => v.inventoryQuantities);
        if (hasInventory && !inventoryScope) return respond({ errors: [{ message: "Access denied for inventoryQuantities. Required access: write_inventory" }] });
        db.lastInput = variables.input;
        return respond({ data: { productSet: { userErrors: [], product: { id: "gid://shopify/Product/555", handle: "choinka-led", status: variables.input.status, onlineStoreUrl: null, variants: { nodes: [{ id: "gid://shopify/ProductVariant/556", sku: "CHOI-1", selectedOptions: [] }] } } } } });
      }
    }
    return respond({ error: `nieoczekiwane ${u}` }, 500);
  };
  return { db, log, fetchImpl };
}

const ENV = {
  BASE_API_TOKEN: "base-token",
  SUPABASE_URL: "https://sb.test",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SHOPIFY_STORE_DOMAIN: "sklep.myshopify.com",
  SHOPIFY_ADMIN_TOKEN: "shpat_test"
};
const team = async () => ({ id: "u1", email: "zespol@example.test" });
const post = (body) => new Request("https://panel.test/api/base/x", { method: "POST", body: JSON.stringify(body) });

async function withFetch(fetchImpl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test("/api/base: bez logowania 401, bez tokenu Base czytelny komunikat", async () => {
  await assert.rejects(handleBase(new Request("https://panel.test/api/base/status"), ENV, ["status"], { authorize: async () => null }), (err) => err.status === 401);
  const status = await handleBase(new Request("https://panel.test/api/base/status"), {}, ["status"], { authorize: team });
  assert.deepEqual(status, { ok: true, configured: false, shopify_configured: false, shopify_domain: "" });
  await assert.rejects(handleBase(new Request("https://panel.test/api/base/sources"), {}, ["sources"], { authorize: team }), /BASE_API_TOKEN/);
});

test("/api/base: katalogi, lista i ponowny import bez dubli", async () => {
  const world = fakeWorld();
  await withFetch(world.fetchImpl, async () => {
    const sources = await handleBase(new Request("https://panel.test/api/base/sources"), ENV, ["sources"], { authorize: team });
    assert.equal(sources.inventories[0].id, "307");
    assert.equal(sources.storages[0].id, "warehouse_12");
    const list = await handleBase(post({ kind: "inventory", id: "307" }), ENV, ["list"], { authorize: team });
    assert.equal(list.products[0].id, "2685");
    assert.equal(list.products[0].product_id, "");
    const first = await handleBase(post({ kind: "inventory", id: "307", ids: ["2685"] }), ENV, ["import"], { authorize: team });
    assert.equal(first.created, 1);
    const again = await handleBase(post({ kind: "inventory", id: "307", ids: ["2685"] }), ENV, ["import"], { authorize: team });
    assert.equal(again.created, 0);
    assert.equal(again.updated, 1);
    assert.equal(world.db.products.length, 1);
    assert.equal(world.db.products[0].producer, "Ikonka");
    assert.equal(world.db.catalogs[0].external_id, "inventory:307");
    assert.ok(!world.log.some((line) => line.includes("base-token")), "token nie trafia do adresów");
  });
});

async function importThenPush(world, status, extraData) {
  return withFetch(world.fetchImpl, async () => {
    const imported = await handleBase(post({ kind: "inventory", id: "307", ids: ["2685"] }), ENV, ["import"], { authorize: team });
    assert.equal(imported.products[0].product_id, PID);
    if (extraData) Object.assign(world.db.products[0], extraData);
    const calls = world.log.length;
    const res = await handleBase(post({ product_ids: [PID, "nie-uuid"], status }), ENV, ["push"], { authorize: team });
    assert.ok(!world.log.slice(calls).some((line) => line.includes("baselinker")), "wysyłka nie pyta Base");
    return res;
  });
}

test("/api/base/push: status aktywny, Shopify z lokalizacją, id zapisane, kolejka zamknięta", async () => {
  const world = fakeWorld();
  const res = await importThenPush(world, "aktywny");
  assert.equal(res.ok, true);
  assert.equal(res.results.length, 1);
  assert.equal(res.results[0].shopify_product_id, "555");
  const p = world.db.products[0];
  assert.equal(p.workflow_status, "opublikowany");
  assert.equal(p.shopify_product_id, "555");
  assert.equal(p.shopify_variant_id, "556");
  assert.equal(p.shopify_sync_error, null);
  assert.equal(world.db.lastInput.status, "ACTIVE");
  assert.deepEqual(world.db.lastInput.variants[0].inventoryQuantities, [{ locationId: "gid://shopify/Location/9", name: "available", quantity: 5 }]);
  assert.equal(world.db.queue[0].done_at != null, true);
});

test("/api/base/push: bez zakresu write_inventory produkt idzie bez stanu z ostrzeżeniem", async () => {
  const world = fakeWorld({ inventoryScope: false });
  const res = await importThenPush(world, "szkic");
  assert.equal(res.results[0].ok, true);
  assert.match(res.results[0].warning, /bez stanu magazynowego/);
  assert.equal(world.db.lastInput.variants[0].inventoryQuantities, undefined);
  assert.equal(world.db.lastInput.status, "DRAFT");
});

test("/api/base/push: produkt bez ceny nie idzie, a status wraca do poprzedniego", async () => {
  const world = fakeWorld();
  const res = await importThenPush(world, "aktywny", { price: null });
  assert.equal(res.ok, false);
  assert.match(res.results[0].error, /Brak ceny/);
  assert.equal(world.db.products[0].workflow_status, "pobrany");
  assert.match(world.db.products[0].shopify_sync_error, /Brak ceny/);
  assert.equal(world.db.lastInput, undefined);
});

/* ---------- automatyczna synchronizacja cen i stanów ---------- */

import { diffProduct, runSyncTick, SLICE } from "../lib/base-autosync.mjs";

test("sync: zmiana ceny i stanu, brak towaru wstrzymuje aktywny, powrót towaru przywraca", () => {
  const base = { id: "a", price: 49.9, stock: 5, variants: [], workflow_status: "opublikowany", base_auto_paused: false };
  assert.equal(diffProduct(base, { price: 49.9, stock: 5, variants: [] }), null);
  assert.deepEqual(diffProduct(base, { price: 44.9, stock: 5, variants: [] }).change, { id: "a", price: 44.9 });
  const zero = diffProduct(base, { price: 49.9, stock: 0, variants: [] });
  assert.deepEqual(zero.change, { id: "a", stock: 0 });
  // stan już był 0, a ktoś opublikował produkt — synchronizacja i tak go wstrzyma
  assert.deepEqual(diffProduct({ ...base, stock: 0 }, { price: 49.9, stock: 0, variants: [] }).change, { id: "a", stock: 0 });
  // szkic ze stanem 0 nie jest ruszany
  assert.equal(diffProduct({ ...base, stock: 0, workflow_status: "pobrany" }, { price: 49.9, stock: 0, variants: [] }), null);
  // towar wrócił po automatycznym wstrzymaniu
  assert.deepEqual(diffProduct({ ...base, stock: 3, workflow_status: "wstrzymany", base_auto_paused: true }, { price: 49.9, stock: 3, variants: [] }).change, { id: "a", stock: 3 });
  // Base bez ceny nie zeruje ceny w sklepie
  assert.equal(diffProduct(base, { price: null, stock: 5, variants: [] }), null);
  // warianty: zmiana stanu jednego wariantu
  const withVariants = { ...base, stock: 6, variants: [{ base_id: "20", price: 52, stock: 4 }, { base_id: "21", price: 55, stock: 2 }] };
  const v = diffProduct(withVariants, { price: 52, stock: 4, variants: [{ base_id: "20", price: 52, stock: 4 }, { base_id: "21", price: 55, stock: 0 }] });
  assert.deepEqual(v.reasons, ["cena", "stan", "warianty"]);
});

function syncWorld({ products, baseData, shopifyConfigured = true, slice = SLICE }) {
  const db = {
    state: { id: 1, enabled: true, interval_hours: 4, next_run_at: "2026-11-13T08:00:00.000Z", running: false, cursor: "", run_checked: 0, run_changed: 0, run_errors: [], last_errors: [], last_checked: 0, last_changed: 0, lock_until: null },
    products: products.map((p) => ({ ...p })),
    queue: [],
    applied: [],
    pushed: [],
    baseCalls: []
  };
  const respond = (data, status = 200) => new Response(data == null ? null : JSON.stringify(data), { status });
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || "GET";
    if (u === BASE_API_URL) {
      const body = new URLSearchParams(init.body);
      const m = body.get("method");
      const params = JSON.parse(body.get("parameters"));
      db.baseCalls.push({ m, params });
      if (m === "getInventories") return respond({ status: "SUCCESS", inventories: [INVENTORY] });
      if (m === "getInventoryProductsData") {
        const out = {};
        for (const id of params.products) if (baseData[id]) out[id] = baseData[id];
        return respond({ status: "SUCCESS", products: out });
      }
      return respond({ status: "ERROR", error_code: "ERROR_UNKNOWN_METHOD" });
    }
    if (u.startsWith("https://sb.test/rest/v1/")) {
      const path = decodeURIComponent(u.slice("https://sb.test/rest/v1/".length));
      const body = init.body ? JSON.parse(init.body) : null;
      if (path === "rpc/base_sync_claim") {
        if (db.state.lock_until) return respond([]);
        db.state.lock_until = "locked";
        return respond([{ ...db.state }]);
      }
      if (path === "rpc/base_sync_token_ok") return respond(body.p_token === "t".repeat(40));
      if (path.startsWith("base_sync_state?id=eq.1") && method === "PATCH") {
        Object.assign(db.state, body);
        return respond([{ ...db.state }]);
      }
      if (path.startsWith("base_sync_state?id=eq.1")) return respond([{ ...db.state }]);
      if (path.startsWith("products?source=in.(base,base_hurtownia)")) {
        const cursor = path.match(/id=gt\.([0-9a-f-]+)/)[1];
        return respond(db.products.filter((p) => p.shopify_product_id && p.id > cursor).sort((a, b) => a.id.localeCompare(b.id)).slice(0, slice));
      }
      if (path === "rpc/base_sync_apply") {
        // jak funkcja SQL: zmiana pól, wstrzymanie / przywrócenie i wyzwalacz kolejki
        for (const c of body.p_changes) {
          const p = db.products.find((x) => x.id === c.id);
          const stock = "stock" in c ? c.stock : null;
          if ("price" in c) p.price = c.price;
          if ("stock" in c) p.stock = c.stock;
          if (Array.isArray(c.variants)) p.variants = c.variants;
          if (stock === 0 && p.workflow_status === "opublikowany") { p.workflow_status = "wstrzymany"; p.base_auto_paused = true; }
          else if (stock > 0 && p.base_auto_paused) { if (p.workflow_status === "wstrzymany") p.workflow_status = "opublikowany"; p.base_auto_paused = false; }
          db.queue.push({ product_id: p.id, done_at: null });
          db.applied.push(c);
        }
        return respond(body.p_changes.length);
      }
      if (path.startsWith("shopify_sync_queue?done_at=is.null")) {
        const limit = Number(path.match(/limit=(\d+)/)[1]);
        return respond(db.queue.filter((q) => !q.done_at).slice(0, limit).map((q) => ({ product_id: q.product_id })));
      }
      if (path.startsWith("shopify_sync_queue?product_id=eq.") && method === "PATCH") {
        const id = path.match(/product_id=eq\.([^&]+)/)[1];
        db.queue.filter((q) => q.product_id === id && !q.done_at).forEach((q) => { q.done_at = body.done_at; });
        return respond(null, 204);
      }
      const one = path.match(/^products\?id=eq\.([^&]+)/);
      if (one && method === "GET") return respond(db.products.filter((p) => p.id === one[1]));
      if (one && method === "PATCH") { Object.assign(db.products.find((p) => p.id === one[1]), body); return respond(null, 204); }
      if (path.startsWith("pages?product_id=eq.")) return respond([]);
      return respond({ message: `nieznana ścieżka ${path}` }, 404);
    }
    if (u === "https://sklep.myshopify.com/admin/api/2026-10/graphql.json") {
      const { query, variables } = JSON.parse(init.body);
      if (/NhpLocation/.test(query)) return respond({ data: { location: { id: "gid://shopify/Location/9" } } });
      if (/NhpProductSet/.test(query)) {
        db.pushed.push(variables.input);
        const id = variables.input.id || "gid://shopify/Product/1";
        return respond({ data: { productSet: { userErrors: [], product: { id, handle: "x", status: variables.input.status, onlineStoreUrl: null, variants: { nodes: [{ id: "gid://shopify/ProductVariant/2", sku: "", selectedOptions: [] }] } } } } });
      }
    }
    return respond({ error: `nieoczekiwane ${u}` }, 500);
  };
  const env = { ...ENV };
  if (!shopifyConfigured) { delete env.SHOPIFY_STORE_DOMAIN; delete env.SHOPIFY_ADMIN_TOKEN; }
  return { db, fetchImpl, env };
}

const linked = (n, extra = {}) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  name: `Produkt ${n}`,
  source: "base",
  base_inventory_id: "307",
  base_product_id: String(n),
  shopify_product_id: String(900 + n),
  price: 10,
  stock: 5,
  variants: [],
  workflow_status: "opublikowany",
  base_auto_paused: false,
  ...extra
});
const baseRow = (price, stock) => ({ ...DATA, variants: {}, prices: { 105: price }, stock: { bl_206: stock } });

test("sync: przebieg w porcjach — jedno zapytanie do Base na porcję, zmiany do Shopify, stan 0 wstrzymuje", async () => {
  const products = [linked(1), linked(2), linked(3, { stock: 0, workflow_status: "wstrzymany", base_auto_paused: true }), linked(4)];
  const world = syncWorld({
    products,
    baseData: { 1: baseRow(10, 5), 2: baseRow(12.5, 5), 3: baseRow(10, 7) },
    slice: 2
  });
  const now = new Date("2026-11-13T09:00:00.000Z");
  await withFetch(world.fetchImpl, async () => {
    const first = await runSyncTick(world.env, { now, slice: 2 });
    assert.equal(first.checked, 2);
    assert.equal(first.changed, 1); // tylko cena produktu 2
    assert.equal(world.db.state.running, true);
    assert.equal(world.db.state.lock_until, null, "blokada zwolniona");
    assert.deepEqual(world.db.baseCalls.map((c) => c.m), ["getInventories", "getInventoryProductsData"]);
    assert.deepEqual(world.db.baseCalls[1].params.products, [1, 2]);
    const second = await runSyncTick(world.env, { now, slice: 2 });
    assert.equal(second.checked, 2);
    assert.equal(second.finished, false); // pełna porcja — koniec poznamy w następnym kroku
    const third = await runSyncTick(world.env, { now, slice: 2 });
    assert.equal(third.checked, 0);
    assert.equal(third.finished, true);
    assert.equal(world.db.state.running, false);
    assert.equal(world.db.state.last_checked, 4);
    assert.equal(world.db.state.last_changed, 3);
    assert.equal(world.db.state.next_run_at, "2026-11-13T13:00:00.000Z");
    // 3: towar wrócił → znowu opublikowany; 4: zniknął z Base → stan 0, wstrzymany, błąd na liście
    const p3 = world.db.products.find((p) => p.base_product_id === "3");
    const p4 = world.db.products.find((p) => p.base_product_id === "4");
    assert.equal(p3.workflow_status, "opublikowany");
    assert.equal(p3.base_auto_paused, false);
    assert.equal(p4.stock, 0);
    assert.equal(p4.workflow_status, "wstrzymany");
    assert.match(world.db.state.last_errors.map((e) => e.text).join(" "), /Produktu 4 nie ma w Base/);
    // do Shopify poszły zmienione produkty, wstrzymany jako szkic ze stanem 0 i zakazem sprzedaży na minusie
    const p4input = world.db.pushed.find((input) => input.id === "gid://shopify/Product/904");
    assert.equal(p4input.status, "DRAFT");
    assert.deepEqual(p4input.variants[0].inventoryQuantities, [{ locationId: "gid://shopify/Location/9", name: "available", quantity: 0 }]);
    assert.equal(p4input.variants[0].inventoryPolicy, "DENY");
    assert.equal(world.db.queue.filter((q) => !q.done_at).length, 0);
  });
});

test("sync: nie pora → nic nie robi; „Synchronizuj teraz” startuje od razu; blokada odsyła busy", async () => {
  const world = syncWorld({ products: [linked(1)], baseData: { 1: baseRow(10, 5) } });
  world.db.state.next_run_at = "2026-11-13T12:00:00.000Z";
  const now = new Date("2026-11-13T09:00:00.000Z");
  await withFetch(world.fetchImpl, async () => {
    const idle = await runSyncTick(world.env, { now });
    assert.equal(idle.checked, 0);
    assert.equal(world.db.baseCalls.length, 0);
    const forced = await runSyncTick(world.env, { now, force: true });
    assert.equal(forced.checked, 1);
    assert.equal(forced.finished, true);
    world.db.state.lock_until = "locked";
    const busy = await runSyncTick(world.env, { now, force: true });
    assert.equal(busy.busy, true);
  });
});

test("sync: brak tokenu Base kończy przebieg z błędem po polsku i ustawia następną próbę", async () => {
  const world = syncWorld({ products: [linked(1)], baseData: {} });
  const env = { ...world.env };
  delete env.BASE_API_TOKEN;
  const now = new Date("2026-11-13T09:00:00.000Z");
  await withFetch(world.fetchImpl, async () => {
    const tick = await runSyncTick(env, { now });
    assert.equal(tick.finished, true);
    assert.equal(world.db.state.running, false);
    assert.match(world.db.state.last_errors[0].text, /BASE_API_TOKEN/);
    assert.equal(world.db.state.next_run_at, "2026-11-13T13:00:00.000Z");
  });
});

test("/api/base/sync: cron z tokenem z Vault, zły token 401, panel wymaga logowania", async () => {
  const world = syncWorld({ products: [linked(1)], baseData: { 1: baseRow(10, 5) } });
  const cron = (token) => new Request("https://panel.test/api/base/sync", { method: "POST", headers: { "x-nhp-cron": token }, body: "{}" });
  await withFetch(world.fetchImpl, async () => {
    const ok = await handleBase(cron("t".repeat(40)), world.env, ["sync"], { authorize: async () => null });
    assert.equal(ok.ok, true);
    assert.equal(ok.state.lock_until, undefined, "panel nie widzi pól technicznych");
    await assert.rejects(handleBase(cron("z".repeat(40)), world.env, ["sync"], { authorize: async () => null }), (err) => err.status === 401);
    await assert.rejects(handleBase(post({ now: true }), world.env, ["sync"], { authorize: async () => null }), (err) => err.status === 401);
    const manual = await handleBase(post({ now: true }), world.env, ["sync"], { authorize: team });
    assert.equal(manual.checked, 1);
  });
});
