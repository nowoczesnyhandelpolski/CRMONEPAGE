import { basePrice, parseDelivery, parseMoney } from "./pricing.mjs";

const LIMITS = { title: 300, category: 500, sections: 60, images: 100, params: 200, text: 8000 };

export function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function httpUrl(value) {
  const s = String(value || "").trim();
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href.slice(0, 1000) : "";
  } catch {
    return "";
  }
}

function clip(value, n) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

function sectionsFrom(raw) {
  const src = Array.isArray(raw?.description_sections) ? raw.description_sections : [];
  const out = [];
  for (const section of src) {
    if (out.length >= LIMITS.sections) break;
    if (typeof section === "string") {
      const text = stripHtml(section).slice(0, LIMITS.text);
      if (text) out.push({ type: "text", text });
      continue;
    }
    const type = String(section?.type || section?.kind || "").toLowerCase();
    if (type === "image" || type === "img") {
      const url = httpUrl(section.url || section.src);
      if (url) out.push({ type: "image", url });
      continue;
    }
    const text = stripHtml(section?.text || section?.content || "").slice(0, LIMITS.text);
    if (text) out.push({ type: "text", text });
  }
  if (!out.length && raw?.description) {
    const text = stripHtml(raw.description).slice(0, LIMITS.text);
    if (text) out.push({ type: "text", text });
  }
  return out;
}

function imageList(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of list) {
    if (out.length >= LIMITS.images) break;
    const url = httpUrl(typeof item === "string" ? item : item?.url);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

function paramsFrom(raw) {
  const list = Array.isArray(raw?.parameters) ? raw.parameters : Array.isArray(raw?.params) ? raw.params : [];
  const out = [];
  for (const row of list) {
    if (out.length >= LIMITS.params) break;
    const name = clip(row?.name ?? row?.k ?? "", 80);
    const value = clip(row?.value ?? row?.v ?? "", 200);
    if (name || value) out.push({ name, value });
  }
  return out;
}

/** Jedna pozycja z wtyczki. Cena bazowa liczona jest tutaj, nie bierzemy jej z klienta. */
export function normalizeOfferItem(raw = {}) {
  const catalogName = clip(raw.catalog_name ?? raw.catalogName ?? raw.name ?? raw.title, LIMITS.title);
  const price = parseMoney(raw.price ?? raw.current_price ?? raw.currentPrice);
  const priceBefore = parseMoney(raw.price_before_promo ?? raw.priceBeforePromo ?? raw.compare_at);
  const delivery = parseDelivery(raw.delivery_cost ?? raw.deliveryCost ?? raw.shipping_cost);
  const priced = basePrice({ price, shipping: delivery });
  const sections = sectionsFrom(raw);
  const images = imageList(raw.images);
  const descriptionImages = imageList(raw.description_images);
  for (const section of sections) {
    if (section.type === "image" && !descriptionImages.includes(section.url)) descriptionImages.push(section.url);
  }
  const missing = [];
  if (price == null) missing.push("price");
  if (delivery == null) missing.push("delivery");
  if (!catalogName) missing.push("catalog_name");
  const item = {
    catalog_name: catalogName,
    price,
    price_before_promo: priceBefore,
    delivery_cost: delivery,
    base_price: priced.ok ? priced.base : null,
    shipping_time: clip(raw.shipping_time ?? raw.shippingTime ?? raw.handling_time, 120),
    ean: clip(raw.ean ?? raw.gtin, 32).replace(/\s/g, ""),
    category: clip(raw.category, LIMITS.category),
    category_id: clip(raw.category_id ?? raw.categoryId, 40),
    producer: clip(raw.producer ?? raw.brand, 160),
    parameters: paramsFrom(raw),
    images,
    description_images: descriptionImages.slice(0, LIMITS.images),
    description_sections: sections,
    source_link: httpUrl(raw.source_link ?? raw.sourceLink ?? raw.url),
    source_offer_id: clip(raw.source_offer_id ?? raw.offer_id ?? raw.offerId, 40),
    allegro_product_id: clip(raw.allegro_product_id ?? raw.allegroProductId ?? raw.product_id, 40),
    missing
  };
  return {
    item,
    missing,
    flagged: missing.includes("price"),
    status: missing.includes("price") ? "flagged" : "draft"
  };
}

export function normalizeBatch(body = {}) {
  const rows = Array.isArray(body.items) ? body.items : body.item ? [body.item] : [];
  if (!rows.length) {
    const err = new Error("Brak pozycji do zapisu.");
    err.status = 400;
    throw err;
  }
  if (rows.length > 20) {
    const err = new Error("Maksymalnie 20 pozycji w jednym żądaniu.");
    err.status = 413;
    throw err;
  }
  const batchId = String(body.batch_id || "").trim();
  if (batchId && !/^[A-Za-z0-9_-]{6,64}$/.test(batchId)) {
    const err = new Error("batch_id ma mieć 6–64 znaków: litery, cyfry, _ lub -.");
    err.status = 400;
    throw err;
  }
  return {
    batch_id: batchId,
    name: clip(body.name, 160),
    account_login: clip(body.account_login ?? body.accountLogin, 120),
    items: rows.map((row, pos) => ({ pos, ...normalizeOfferItem(row) }))
  };
}
