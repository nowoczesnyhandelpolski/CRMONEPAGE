import { shopifyStatusFor, workflowAfterShopify } from "./workflow.mjs";

export const SHOPIFY_API_VERSION = "2026-10";

export const SHOPIFY_WEBHOOK_TOPICS = [
  "products/update",
  "products/delete",
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled"
];

const PAID = new Set(["paid", "partially_paid", "partially_refunded"]);

export function normalizeShopDomain(value) {
  const host = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) return "";
  return host;
}

export function shopifyApiVersion(env) {
  const v = String(env?.SHOPIFY_API_VERSION || SHOPIFY_API_VERSION).trim();
  return /^\d{4}-\d{2}$/.test(v) ? v : SHOPIFY_API_VERSION;
}

export function shopifyConfigured(env) {
  return Boolean(normalizeShopDomain(env?.SHOPIFY_STORE_DOMAIN) && String(env?.SHOPIFY_ADMIN_TOKEN || "").trim());
}

export function plainText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

export function imageUrls(product, page) {
  const out = [];
  const push = (url) => {
    const u = String(url || "").trim();
    if (!/^https:\/\//i.test(u)) return;
    if (!out.includes(u)) out.push(u);
  };
  for (const img of page?.data?.images || []) {
    if (img && typeof img === "object") {
      if (img.rights === true) push(img.url);
    } else push(img);
  }
  for (const img of product?.images || []) {
    if (typeof img === "string") push(img);
    else push(img?.url || img?.src);
  }
  return out.slice(0, 10);
}

export function pageToHtml(page, origin) {
  const d = page?.data || {};
  const parts = [];
  if (d.headline) parts.push(`<h1>${esc(d.headline)}</h1>`);
  if (d.subheadline) parts.push(`<p>${esc(d.subheadline)}</p>`);
  if (d.seo?.description && d.seo.description !== d.subheadline) parts.push(`<p>${esc(d.seo.description)}</p>`);
  const benefits = Array.isArray(d.benefits) ? d.benefits : [];
  if (benefits.length) {
    parts.push("<ul>" + benefits.map((b) => `<li><b>${esc(b.title || "")}</b> ${esc(b.text || "")}</li>`).join("") + "</ul>");
  }
  const features = Array.isArray(d.features) ? d.features : [];
  if (features.length) {
    parts.push(features.map((f) => `<h2>${esc(f.title || "")}</h2><p>${esc(f.text || "")}</p>`).join(""));
  }
  const sections = Array.isArray(d.generated?.offer_sections) ? d.generated.offer_sections : [];
  for (const section of sections) {
    const text = plainText(section);
    if (text) parts.push(`<p>${esc(text)}</p>`);
  }
  if (page?.status === "published" && origin && page.slug) {
    parts.push(`<p><a href="${esc(String(origin).replace(/\/$/, ""))}/p/${esc(page.slug)}">Karta produktu</a></p>`);
  }
  return parts.join("\n").slice(0, 100000);
}

export function money2(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

/** Treść, po której poznajemy, że webhook jest echem naszej wysyłki. Zdjęcia pomijamy — Shopify podmienia adresy CDN. */
export function shopifyFingerprint(parts) {
  return JSON.stringify({
    title: String(parts.title || "").trim(),
    body: plainText(parts.body).slice(0, 20000),
    status: String(parts.status || ""),
    price: money2(parts.price),
    sku: String(parts.sku || ""),
    barcode: String(parts.barcode || "")
  });
}

export function buildShopifyProduct(product, page, { origin = "", includeImages = true } = {}) {
  const title = String(product?.name || product?.catalog_name || "").trim().slice(0, 255);
  const fromPage = page ? pageToHtml(page, origin) : "";
  const description = String(product?.description || "").trim();
  const body = fromPage || (description.includes("<") ? description.slice(0, 100000) : (description ? `<p>${esc(description)}</p>` : ""));
  const variant = {
    price: money2(product?.price) || "0.00",
    sku: String(product?.sku || ""),
    barcode: String(product?.ean || "")
  };
  if (product?.shopify_variant_id && /^\d+$/.test(String(product.shopify_variant_id))) {
    variant.id = Number(product.shopify_variant_id);
  }
  const payload = {
    title,
    body_html: body,
    vendor: String(product?.brand || product?.producer || "NHP").slice(0, 255),
    status: shopifyStatusFor(product?.workflow_status),
    variants: [variant]
  };
  if (includeImages) {
    const images = imageUrls(product, page);
    if (images.length) payload.images = images.map((src) => ({ src }));
  }
  return {
    product: payload,
    fingerprint: shopifyFingerprint({
      title: payload.title,
      body: payload.body_html,
      status: payload.status,
      price: variant.price,
      sku: variant.sku,
      barcode: variant.barcode
    })
  };
}

export function fingerprintFromRemote(remote) {
  const variant = (remote?.variants || [])[0] || {};
  return shopifyFingerprint({
    title: remote?.title,
    body: remote?.body_html,
    status: remote?.status,
    price: variant.price,
    sku: variant.sku,
    barcode: variant.barcode
  });
}

export function productPublicUrl(domain, handle) {
  const host = String(domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const slug = String(handle || "").trim();
  if (!host || !slug) return "";
  return `https://${host}/products/${slug}`;
}

export function planShopifyInbound({ local, remote, remoteHash, nowIso, publicDomain = "" }) {
  const variant = (remote?.variants || [])[0] || {};
  const handle = String(remote?.handle || "");
  const patch = {
    shopify_product_id: remote?.id != null ? String(remote.id) : local.shopify_product_id,
    shopify_variant_id: variant.id != null ? String(variant.id) : local.shopify_variant_id,
    shopify_handle: handle || local.shopify_handle || null,
    shopify_status: String(remote?.status || ""),
    shopify_payload_hash: remoteHash,
    shopify_synced_at: nowIso,
    shopify_dirty: false,
    shopify_sync_error: ""
  };
  if (handle && publicDomain) patch.shopify_url = productPublicUrl(publicDomain, handle);
  else if (handle && local.shopify_url) patch.shopify_url = String(local.shopify_url).replace(/\/products\/[^/]+$/, `/products/${handle}`);

  if (local.shopify_payload_hash && local.shopify_payload_hash === remoteHash) {
    return { echo: true, patch, history: null };
  }

  const title = String(remote?.title || "").trim();
  if (title && title !== String(local.name || "")) patch.name = title.slice(0, 300);
  if (variant.price != null && variant.price !== "") {
    const price = Math.round(Number(variant.price) * 100) / 100;
    if (Number.isFinite(price) && price !== Number(local.price)) patch.price = price;
  }
  if (variant.sku && variant.sku !== local.sku) patch.sku = String(variant.sku).slice(0, 80);
  if (variant.barcode && variant.barcode !== local.ean) patch.ean = String(variant.barcode).slice(0, 32);
  const body = plainText(remote?.body_html).slice(0, 8000);
  if (body && body !== plainText(local.description)) patch.description = body;

  const next = workflowAfterShopify(remote?.status, local.workflow_status);
  let history = null;
  if (next !== (local.workflow_status || "pobrany")) {
    patch.workflow_status = next;
    history = { from: local.workflow_status || "pobrany", to: next, note: "Status z Shopify", source: "shopify" };
  }
  return { echo: false, patch, history };
}

export function planShopifyDelete(local) {
  const from = local?.workflow_status || "pobrany";
  return {
    patch: {
      shopify_product_id: null,
      shopify_variant_id: null,
      shopify_handle: null,
      shopify_url: null,
      shopify_status: "deleted",
      shopify_dirty: false,
      shopify_sync_error: "",
      shopify_payload_hash: null,
      workflow_status: "archiwum"
    },
    history: from === "archiwum" ? null : { from, to: "archiwum", note: "Produkt usunięty w Shopify", source: "shopify" }
  };
}

export function lineMatchesProduct(line, product) {
  if (!line || !product) return false;
  if (product.shopify_product_id && String(line.product_id || "") === String(product.shopify_product_id)) return true;
  if (product.shopify_variant_id && String(line.variant_id || "") === String(product.shopify_variant_id)) return true;
  if (product.sku && line.sku && String(line.sku) === String(product.sku)) return true;
  if (product.ean && line.sku && String(line.sku) === String(product.ean)) return true;
  return false;
}

export function statsFromOrders(orders, product) {
  let ordersCount = 0;
  let units = 0;
  let revenue = 0;
  let currency = "PLN";
  for (const order of orders || []) {
    if (order?.cancelled_at) continue;
    if (!PAID.has(String(order?.financial_status || ""))) continue;
    const lines = (order.line_items || []).filter((line) => lineMatchesProduct(line, product));
    if (!lines.length) continue;
    ordersCount += 1;
    if (order.currency) currency = String(order.currency);
    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      units += qty;
      revenue += qty * price;
    }
  }
  return {
    orders_count: ordersCount,
    units_sold: units,
    revenue: Math.round(revenue * 100) / 100,
    currency
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function findOrderNip(order) {
  const attrs = order?.note_attributes || order?.noteAttributes || [];
  for (const attr of attrs) {
    if (/nip|vat|tax/i.test(String(attr?.name || ""))) {
      const digits = onlyDigits(attr?.value);
      if (digits.length === 10) return digits;
    }
  }
  const company = String(order?.billing_address?.company || "");
  const match = company.match(/\b(\d{10})\b/);
  return match ? match[1] : "";
}

export function normalizeShopifyOrder(order) {
  const billing = order?.billing_address || {};
  const customer = order?.customer || {};
  const name = billing.name
    || [customer.first_name, customer.last_name].filter(Boolean).join(" ")
    || billing.company
    || "Nabywca";
  const financial = String(order?.financial_status || "");
  return {
    shopify_order_id: String(order?.id || ""),
    order_number: String(order?.name || order?.order_number || order?.id || ""),
    email: String(order?.email || customer.email || ""),
    financial_status: financial,
    fulfillment_status: order?.fulfillment_status ? String(order.fulfillment_status) : "",
    currency: String(order?.currency || "PLN").slice(0, 8),
    total: Math.round(Number(order?.total_price || 0) * 100) / 100,
    line_items: (order?.line_items || []).map((line) => ({
      id: line.id,
      product_id: line.product_id != null ? String(line.product_id) : "",
      variant_id: line.variant_id != null ? String(line.variant_id) : "",
      sku: line.sku || "",
      title: line.title || line.name || "",
      quantity: Number(line.quantity) || 0,
      price: String(line.price ?? "0")
    })),
    buyer: {
      name: String(name).slice(0, 200),
      nip: findOrderNip(order),
      email: String(order?.email || customer.email || "").slice(0, 160),
      address1: String(billing.address1 || "").slice(0, 200),
      address2: String(billing.address2 || "").slice(0, 200),
      zip: String(billing.zip || "").slice(0, 20),
      city: String(billing.city || "").slice(0, 80),
      country: /^[A-Za-z]{2}$/.test(String(billing.country_code || "")) ? String(billing.country_code).toUpperCase() : "PL",
      company: String(billing.company || "").slice(0, 200)
    },
    gateway: (Array.isArray(order?.payment_gateway_names) ? order.payment_gateway_names.join(", ") : String(order?.gateway || "")).slice(0, 120),
    paid_at: PAID.has(financial) ? (order?.processed_at || order?.updated_at || order?.created_at || null) : null,
    cancelled_at: order?.cancelled_at || null
  };
}

export function shopifyErrorText(data, status) {
  if (!data) return `Shopify HTTP ${status}`;
  if (typeof data.errors === "string") return data.errors.slice(0, 300);
  if (data.errors && typeof data.errors === "object") {
    const bits = [];
    for (const [key, val] of Object.entries(data.errors)) {
      bits.push(`${key}: ${Array.isArray(val) ? val.join(", ") : String(val)}`);
    }
    if (bits.length) return bits.join("; ").slice(0, 300);
  }
  return `Shopify HTTP ${status}`;
}

export async function verifyShopifyHmac(rawBody, header, secret) {
  const got = String(header || "").trim();
  const keyMaterial = String(secret || "");
  if (!got || !keyMaterial) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = typeof rawBody === "string" ? new TextEncoder().encode(rawBody) : rawBody;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes));
  let binary = "";
  for (const b of sig) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
