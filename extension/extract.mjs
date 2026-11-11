// Czyste wyciąganie danych z JSON-LD i stanu osadzonego na stronie Allegro.
// Selektory DOM są w selectors.mjs — ten plik można podmienić razem z nimi.

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Wartość parametru Allegro bywa tekstem, listą albo obiektem ({name}, {valueLabel}, {from, to}).
function paramValue(p) {
  const one = (v) => {
    if (v == null) return "";
    if (typeof v !== "object") return text(v);
    if (Array.isArray(v)) return v.map(one).filter(Boolean).join(", ");
    if (v.from != null || v.to != null) return [one(v.from), one(v.to)].filter(Boolean).join("–");
    return one(v.valueLabel ?? v.label ?? v.name ?? v.value ?? v.text ?? "");
  };
  const unit = typeof p?.unit === "string" ? ` ${text(p.unit)}` : "";
  for (const v of [p?.valuesLabels, p?.values, p?.value, p?.rangeValue]) {
    const out = one(v);
    if (out && out !== "[object Object]") return out + unit;
  }
  return "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function typeOf(node) {
  return asArray(node?.["@type"]).map((t) => String(t).toLowerCase());
}

function isProduct(node) {
  const t = typeOf(node);
  return t.includes("product");
}

function priceOf(offer) {
  if (!offer || typeof offer !== "object") return "";
  if (offer.price != null && typeof offer.price !== "object") return text(offer.price);
  if (offer.price?.value != null) return text(offer.price.value);
  return "";
}

function strikePrice(offer) {
  const specs = asArray(offer?.priceSpecification);
  for (const spec of specs) {
    const kind = text(spec?.priceType || spec?.["@type"]).toLowerCase();
    if (/strikethrough|listprice|before|regular/.test(kind) && spec.price != null) return text(spec.price);
  }
  if (offer?.highPrice != null && priceOf(offer) && String(offer.highPrice) !== priceOf(offer)) return text(offer.highPrice);
  return "";
}

function deliveryOf(offer) {
  const details = asArray(offer?.shippingDetails);
  for (const row of details) {
    const rate = row?.shippingRate?.value ?? row?.shippingRate?.price ?? row?.price;
    if (rate != null && typeof rate !== "object") return text(rate);
    if (rate?.value != null) return text(rate.value);
  }
  return "";
}

function shippingTimeOf(offer) {
  const details = asArray(offer?.shippingDetails);
  for (const row of details) {
    const t = row?.deliveryTime ?? row?.handlingTime ?? row?.transitTime;
    if (t?.name) return text(t.name);
    if (typeof t === "string") return text(t);
    if (t?.maxValue != null && t?.unitCode) return `${t.maxValue} ${t.unitCode}`;
  }
  return "";
}

export function extractFromJsonLd(nodes) {
  const list = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (isProduct(node)) list.push(node);
    if (node["@graph"]) walk(node["@graph"]);
  };
  walk(nodes);
  const product = list[0];
  if (!product) return null;
  const offer = asArray(product.offers).find((o) => priceOf(o)) || asArray(product.offers)[0] || {};
  const brand = typeof product.brand === "string" ? product.brand : product.brand?.name;
  const images = asArray(product.image).map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean);
  const params = asArray(product.additionalProperty).map((p) => ({ name: text(p?.name), value: paramValue(p) })).filter((p) => p.name || p.value);
  return {
    catalog_name: text(product.name),
    price: priceOf(offer),
    price_before_promo: strikePrice(offer),
    delivery_cost: deliveryOf(offer),
    shipping_time: shippingTimeOf(offer),
    ean: text(product.gtin13 || product.gtin || product.gtin14 || product.sku || ""),
    producer: text(brand || product.manufacturer?.name || ""),
    category: text(product.category),
    parameters: params,
    images,
    description: typeof product.description === "string" ? product.description : ""
  };
}

const PRICE_KEYS = ["price", "amount", "sellingMode"];
const NAME_KEYS = ["name", "productName", "title"];

function looksLikeOffer(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const keys = Object.keys(node);
  const hasName = keys.some((k) => NAME_KEYS.includes(k) && typeof node[k] === "string" && node[k].length > 2);
  const hasPrice = keys.some((k) => PRICE_KEYS.includes(k));
  const hasEan = keys.some((k) => /ean|gtin/i.test(k));
  return hasName && (hasPrice || hasEan);
}

function digPrice(node) {
  if (node == null) return "";
  if (typeof node === "number" || typeof node === "string") return text(node);
  if (typeof node === "object") {
    if (node.amount != null && (node.currency || node.price)) return text(node.amount);
    if (node.amount != null && node.sale == null) return text(node.amount);
    if (node.sale?.amount != null) return text(node.sale.amount);
    if (node.price?.amount != null) return text(node.price.amount);
  }
  return "";
}

function digStrike(node) {
  if (!node || typeof node !== "object") return "";
  const before = node.price?.promotion?.priceBefore ?? node.promotion?.originalPrice ?? node.originalPrice ?? node.was;
  return before != null ? text(typeof before === "object" ? before.amount : before) : "";
}

/** Ograniczone przejście po JSON. Szuka obiektu z nazwą i ceną albo EAN. */
export function extractFromUnknownJson(root) {
  let found = null;
  let seen = 0;
  const walk = (node, depth) => {
    if (found || depth > 8 || seen > 4000 || !node || typeof node !== "object") return;
    seen++;
    if (!Array.isArray(node) && looksLikeOffer(node)) {
      found = node;
      return;
    }
    const kids = Array.isArray(node) ? node : Object.values(node);
    for (const kid of kids) {
      if (kid && typeof kid === "object") walk(kid, depth + 1);
      if (found) return;
    }
  };
  walk(root, 0);
  if (!found) return null;
  const params = [];
  const rawParams = found.parameters || found.product?.parameters || [];
  if (Array.isArray(rawParams)) {
    for (const p of rawParams) {
      const name = text(p?.name);
      const value = paramValue(p);
      if (name || value) params.push({ name, value });
    }
  }
  const images = [];
  const gallery = found.images || found.product?.images || [];
  if (Array.isArray(gallery)) {
    for (const img of gallery) {
      const url = typeof img === "string" ? img : img?.url;
      if (url) images.push(url);
    }
  }
  const sections = [];
  const desc = found.description?.sections || found.product?.description?.sections;
  if (Array.isArray(desc)) {
    for (const section of desc) {
      for (const item of section.items || []) {
        if (item?.type === "TEXT" || item?.type === "text") sections.push({ type: "text", text: item.content || item.text || "" });
        if (item?.type === "IMAGE" || item?.type === "image") sections.push({ type: "image", url: item.url || "" });
      }
    }
  }
  const ean = text(found.ean || found.gtin || found.product?.ean || found.product?.gtin || "");
  return {
    catalog_name: text(found.name || found.productName || found.product?.name || found.title),
    price: digPrice(found.sellingMode?.price || found.price),
    price_before_promo: digStrike(found) || digPrice(found.sellingMode?.price?.promotion?.priceBefore),
    delivery_cost: text(found.delivery?.lowestPrice?.amount ?? found.deliveryCost ?? ""),
    shipping_time: text(found.delivery?.handlingTime || found.handlingTime || found.shipmentTime || ""),
    ean,
    producer: text(found.producer || found.brand || found.product?.brand || ""),
    category: text(found.category?.path?.map?.((c) => c.name).join(" / ") || found.category?.name || found.categoryPath || ""),
    category_id: text(found.category?.id || ""),
    parameters: params,
    images,
    description_sections: sections,
    allegro_product_id: text(found.product?.id || found.allegroProductId || "")
  };
}

export function mergeExtract(...parts) {
  const out = {
    catalog_name: "",
    price: "",
    price_before_promo: "",
    delivery_cost: "",
    shipping_time: "",
    ean: "",
    producer: "",
    category: "",
    category_id: "",
    parameters: [],
    images: [],
    description_images: [],
    description_sections: [],
    description: "",
    allegro_product_id: "",
    source_offer_id: ""
  };
  for (const part of parts) {
    if (!part) continue;
    for (const key of ["catalog_name", "price", "price_before_promo", "delivery_cost", "shipping_time", "ean", "producer", "category", "category_id", "description", "allegro_product_id", "source_offer_id"]) {
      if (!out[key] && part[key]) out[key] = part[key];
    }
    if (!out.parameters.length && part.parameters?.length) out.parameters = part.parameters;
    if (!out.images.length && part.images?.length) out.images = part.images;
    if (!out.description_sections.length && part.description_sections?.length) out.description_sections = part.description_sections;
    if (part.description_images?.length) out.description_images = part.description_images;
  }
  if (!out.description_sections.length && out.description) out.description_sections = [{ type: "text", text: out.description }];
  for (const section of out.description_sections) {
    if (section.type === "image" && section.url && !out.description_images.includes(section.url)) out.description_images.push(section.url);
  }
  return out;
}

export function offerIdFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/oferta\/([^/?#]+)/);
    if (!m) return "";
    const id = m[1].match(/(\d{6,})$/);
    return id ? id[1] : "";
  } catch {
    return "";
  }
}
