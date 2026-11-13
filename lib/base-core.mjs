/* Base (BaseLinker) — klient API i przekształcenie produktów na wiersze public.products.
   Wywołania idą tylko z serwera (Pages Function). Token Base jest w sekrecie BASE_API_TOKEN. */

export const BASE_API_URL = "https://api.baselinker.com/connector.php";

/** Źródła produktu w kolumnie products.source. */
export const SOURCE_INVENTORY = "base";
export const SOURCE_STORAGE = "base_hurtownia";

export function baseConfig(env) {
  const token = String(env?.BASE_API_TOKEN || "").trim();
  if (!token) return null;
  return { token };
}

export function notConfigured() {
  const err = new Error("Base nie jest podłączony. Dodaj sekret BASE_API_TOKEN w Cloudflare (instrukcja: docs/base.md).");
  err.status = 409;
  return err;
}

const ERROR_HINTS = {
  ERROR_BAD_TOKEN: "Base odrzucił token. Sprawdź sekret BASE_API_TOKEN (Base → Moje konto → API).",
  ERROR_USER_ACCOUNT_BLOCKED: "Konto Base jest zablokowane albo wygasło.",
  ERROR_STORAGE_ID: "Nie ma takiego katalogu albo hurtowni w Base."
};

/** Jedno wywołanie API Base: POST form-urlencoded, nagłówek X-BLToken. */
export async function baseCall(config, method, parameters = {}, fetchImpl = fetch) {
  if (!config?.token) throw notConfigured();
  const body = new URLSearchParams({ method, parameters: JSON.stringify(parameters || {}) });
  let res;
  try {
    res = await fetchImpl(BASE_API_URL, {
      method: "POST",
      headers: { "X-BLToken": config.token, "content-type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
  } catch {
    const err = new Error("Brak połączenia z Base.");
    err.status = 502;
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const err = new Error(`Base odpowiedział błędem HTTP ${res.status}.`);
    err.status = 502;
    throw err;
  }
  if (data.status === "ERROR") {
    const code = String(data.error_code || "");
    const err = new Error(ERROR_HINTS[code] || `Base: ${String(data.error_message || code || "nieznany błąd").slice(0, 200)}`);
    err.status = code === "ERROR_BAD_TOKEN" ? 409 : 502;
    err.code = code;
    throw err;
  }
  return data;
}

/* ---------- pomocnicze ---------- */

export function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function money(value) {
  const n = toNumber(value);
  return n == null ? null : Math.round(n * 100) / 100;
}

function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/** Cena z grupy cenowej katalogu; gdy jej brak — pierwsza niezerowa. */
export function pickPrice(prices, group) {
  if (!prices || typeof prices !== "object") return null;
  const preferred = group != null ? money(prices[String(group)]) : null;
  if (preferred != null && preferred > 0) return preferred;
  for (const value of Object.values(prices)) {
    const n = money(value);
    if (n != null && n > 0) return n;
  }
  return preferred;
}

/** Stan: magazyn domyślny katalogu, a gdy go nie ma na liście — suma wszystkich magazynów. */
export function pickStock(stock, warehouse) {
  if (!stock || typeof stock !== "object") return null;
  if (warehouse && stock[warehouse] != null) {
    const n = toNumber(stock[warehouse]);
    return n == null ? null : Math.max(0, Math.trunc(n));
  }
  let sum = 0;
  let any = false;
  for (const value of Object.values(stock)) {
    const n = toNumber(value);
    if (n == null) continue;
    sum += n;
    any = true;
  }
  return any ? Math.max(0, Math.trunc(sum)) : null;
}

/** Pole tekstowe w domyślnym języku. Klucze z „|” (inne języki, nadpisania kanałów) pomijamy. */
export function textField(textFields, field, lang) {
  if (!textFields || typeof textFields !== "object") return "";
  if (textFields[field] != null && textFields[field] !== "") return textFields[field];
  if (lang && textFields[`${field}|${lang}`] != null) return textFields[`${field}|${lang}`];
  return "";
}

/** Zdjęcia w kolejności pozycji, bez nadpisań kanałów („2|amazon_0”). */
export function imageUrls(images) {
  const out = [];
  const push = (url) => {
    const value = String(url || "").trim();
    if (/^https?:\/\//i.test(value) && !out.includes(value)) out.push(value);
  };
  if (Array.isArray(images)) images.forEach(push);
  else if (images && typeof images === "object") {
    Object.keys(images)
      .filter((key) => !key.includes("|"))
      .sort((a, b) => Number(a) - Number(b))
      .forEach((key) => push(images[key]));
  }
  return out.slice(0, 20);
}

/** Parametry: obiekt {Kolor: "Biały"} (katalog) albo [[nazwa, wartość]] (hurtownia). */
export function paramList(features) {
  const out = [];
  if (Array.isArray(features)) {
    for (const row of features) {
      const name = Array.isArray(row) ? row[0] : row?.name;
      const value = Array.isArray(row) ? row[1] : row?.value;
      if (name || value) out.push({ name: clip(name, 80), value: clip(value, 200) });
    }
  } else if (features && typeof features === "object") {
    for (const [name, value] of Object.entries(features)) {
      out.push({ name: clip(name, 80), value: clip(typeof value === "object" ? JSON.stringify(value) : value, 200) });
    }
  }
  return out.slice(0, 200);
}

export function plainFromHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, 8000);
}

function sortVariants(list) {
  return list.sort((a, b) => Number(a.base_id) - Number(b.base_id) || String(a.base_id).localeCompare(String(b.base_id)));
}

/* ---------- katalogi i magazyny ---------- */

export function inventoryInfo(raw) {
  return {
    id: String(raw?.inventory_id ?? ""),
    name: clip(raw?.name || `Katalog ${raw?.inventory_id ?? ""}`, 120),
    description: clip(raw?.description, 300),
    language: clip(raw?.default_language, 5),
    price_group: raw?.default_price_group != null ? String(raw.default_price_group) : "",
    warehouse: clip(raw?.default_warehouse, 40),
    is_default: Boolean(raw?.is_default)
  };
}

export function storageInfo(raw) {
  return {
    id: clip(raw?.storage_id, 40),
    name: clip(raw?.name || raw?.storage_id, 120),
    can_read: raw?.read !== false && (!Array.isArray(raw?.methods) || raw.methods.includes("getExternalStorageProductsData"))
  };
}

/* ---------- lista do podglądu ---------- */

export function listRowFromInventory(raw, inventory) {
  return {
    id: String(raw?.id ?? ""),
    name: clip(raw?.name, 300),
    sku: clip(raw?.sku, 64),
    ean: clip(raw?.ean, 32).replace(/\s/g, ""),
    price: pickPrice(raw?.prices, inventory?.price_group),
    stock: pickStock(raw?.stock, inventory?.warehouse)
  };
}

export function listRowFromStorage(raw) {
  return {
    id: String(raw?.product_id ?? raw?.id ?? ""),
    name: clip(raw?.name, 300),
    sku: clip(raw?.sku, 64),
    ean: clip(raw?.ean, 32).replace(/\s/g, ""),
    price: money(raw?.price_brutto ?? raw?.price),
    stock: toNumber(raw?.quantity) == null ? null : Math.max(0, Math.trunc(toNumber(raw.quantity)))
  };
}

/** Odpowiedź listy Base: obiekt {id: produkt} (katalog) albo tablica (hurtownia). */
export function listFromResponse(data, kind, inventory) {
  const source = data?.products;
  const rows = Array.isArray(source) ? source : Object.entries(source || {}).map(([id, row]) => ({ id, ...row }));
  return rows
    .filter((row) => kind === "storage" || !Number(row?.parent_id))
    .map((row) => (kind === "storage" ? listRowFromStorage(row) : listRowFromInventory(row, inventory)))
    .filter((row) => row.id);
}

/* ---------- pełne dane → wiersz products ---------- */

const EMPTY_ROW = {
  source: "",
  base_inventory_id: "",
  base_product_id: "",
  catalog_id: null,
  name: "",
  sku: null,
  ean: null,
  price: null,
  stock: null,
  currency: "PLN",
  images: [],
  description: "",
  params: [],
  producer: null,
  category_id: null,
  category: null,
  variants: [],
  status: "active",
  raw: {},
  base_synced_at: null,
  updated_at: null
};

function finishRow(row, now) {
  const variants = sortVariants(row.variants || []);
  let price = row.price;
  if ((price == null || price <= 0) && variants.length) {
    const prices = variants.map((v) => v.price).filter((p) => p != null && p > 0);
    price = prices.length ? Math.min(...prices) : price;
  }
  let stock = row.stock;
  if (variants.length && variants.some((v) => v.stock != null)) {
    stock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
  }
  return {
    ...EMPTY_ROW,
    ...row,
    variants,
    price,
    stock,
    status: price != null && price > 0 ? "active" : "flagged",
    base_synced_at: now,
    updated_at: now
  };
}

/** getInventoryProductsData → wiersz products. ctx: { inventory, catalogId, categories, manufacturers, now }. */
export function productFromInventoryData(id, raw, ctx = {}) {
  const inv = ctx.inventory || {};
  const lang = inv.language || "";
  const tf = raw?.text_fields || {};
  const name = clip(textField(tf, "name", lang) || raw?.name || `Produkt ${id}`, 500);
  const html = String(textField(tf, "description", lang) || "");
  const extra = String(textField(tf, "description_extra1", lang) || "");
  const variants = Object.entries(raw?.variants || {}).map(([variantId, v]) => ({
    base_id: String(variantId),
    name: clip(v?.name || v?.sku || variantId, 120),
    sku: clip(v?.sku, 64),
    ean: clip(v?.ean, 32).replace(/\s/g, ""),
    price: pickPrice(v?.prices, inv.price_group),
    stock: pickStock(v?.stock, inv.warehouse)
  }));
  const categoryId = raw?.category_id ? String(raw.category_id) : null;
  const manufacturerId = raw?.manufacturer_id ? String(raw.manufacturer_id) : null;
  return finishRow({
    source: SOURCE_INVENTORY,
    base_inventory_id: String(inv.id || ""),
    base_product_id: String(id),
    catalog_id: ctx.catalogId || null,
    name,
    sku: clip(raw?.sku, 64) || null,
    ean: clip(raw?.ean, 32).replace(/\s/g, "") || null,
    price: pickPrice(raw?.prices, inv.price_group),
    stock: pickStock(raw?.stock, inv.warehouse),
    images: imageUrls(raw?.images),
    description: plainFromHtml(html || extra),
    params: paramList(textField(tf, "features", lang)),
    producer: (manufacturerId && ctx.manufacturers?.[manufacturerId]) || null,
    category_id: categoryId,
    category: (categoryId && ctx.categories?.[categoryId]) || null,
    variants,
    raw: {
      base: {
        kind: "inventory",
        description_html: html.slice(0, 60000),
        tax_rate: toNumber(raw?.tax_rate),
        weight: toNumber(raw?.weight),
        tags: Array.isArray(raw?.tags) ? raw.tags.slice(0, 30) : []
      }
    }
  }, ctx.now || new Date().toISOString());
}

/** getExternalStorageProductsData → wiersz products. ctx: { storageId, catalogId, now }. */
export function productFromStorageData(id, raw, ctx = {}) {
  const html = String(raw?.description || raw?.description_extra1 || "");
  const variants = (Array.isArray(raw?.variants) ? raw.variants : Object.values(raw?.variants || {})).map((v) => ({
    base_id: String(v?.variant_id ?? v?.id ?? ""),
    name: clip(v?.name || v?.sku || v?.variant_id, 120),
    sku: clip(v?.sku, 64),
    ean: clip(v?.ean, 32).replace(/\s/g, ""),
    price: money(v?.price),
    stock: toNumber(v?.quantity) == null ? null : Math.max(0, Math.trunc(toNumber(v.quantity)))
  })).filter((v) => v.base_id);
  const quantity = toNumber(raw?.quantity);
  const producer = clip(raw?.man_name, 120);
  return finishRow({
    source: SOURCE_STORAGE,
    base_inventory_id: String(ctx.storageId || ""),
    base_product_id: String(raw?.product_id ?? id),
    catalog_id: ctx.catalogId || null,
    name: clip(raw?.name || `Produkt ${id}`, 500),
    sku: clip(raw?.sku, 64) || null,
    ean: clip(raw?.ean, 32).replace(/\s/g, "") || null,
    price: money(raw?.price_brutto),
    stock: quantity == null ? null : Math.max(0, Math.trunc(quantity)),
    images: imageUrls(raw?.images),
    description: plainFromHtml(html),
    params: paramList(raw?.features),
    producer: producer && producer !== "0" ? producer : null,
    category_id: raw?.category_id ? String(raw.category_id) : null,
    category: null,
    variants,
    raw: {
      base: {
        kind: "storage",
        description_html: html.slice(0, 60000),
        tax_rate: toNumber(raw?.tax_rate),
        weight: toNumber(raw?.weight),
        wholesale_net: toNumber(raw?.price_wholesale_netto)
      }
    }
  }, ctx.now || new Date().toISOString());
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Id z przeglądarki: tylko cyfry/litery, bez powtórzeń. */
export function cleanIds(list, max) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw ?? "").trim();
    if (/^[A-Za-z0-9_-]{1,40}$/.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
