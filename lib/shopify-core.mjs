import { shopifyStatusFor, workflowFromShopify } from "./workflow.mjs";

export const SHOPIFY_API_VERSION = "2026-10";

export const WEBHOOK_TOPICS = [
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED"
];

export function shopDomain(raw) {
  return String(raw || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
}

export function shopifyConfig(env) {
  const domain = shopDomain(env?.SHOPIFY_STORE_DOMAIN);
  const token = String(env?.SHOPIFY_ADMIN_TOKEN || "").trim();
  if (!domain || !token) return null;
  const location = numericId(env?.SHOPIFY_LOCATION_ID);
  return {
    domain,
    token,
    locationId: location ? `gid://shopify/Location/${location}` : "",
    webhookSecret: String(env?.SHOPIFY_WEBHOOK_SECRET || "").trim(),
    version: SHOPIFY_API_VERSION
  };
}

export function numericId(value) {
  const match = String(value ?? "").match(/(\d+)\s*$/);
  return match ? match[1] : "";
}

export function productGid(id) {
  const raw = String(id || "");
  if (!raw) return "";
  if (raw.startsWith("gid://")) return raw;
  const idNum = numericId(raw);
  return idNum ? `gid://shopify/Product/${idNum}` : "";
}

export function variantGid(id) {
  const raw = String(id || "");
  if (!raw) return "";
  if (raw.startsWith("gid://")) return raw;
  const idNum = numericId(raw);
  return idNum ? `gid://shopify/ProductVariant/${idNum}` : "";
}

export function productUrl(domain, handle) {
  if (!domain || !handle) return "";
  return `https://${shopDomain(domain)}/products/${encodeURIComponent(handle)}`;
}

export function bytesToBase64(bytes) {
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}

export function timingSafeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function shopifyHmac(rawBody, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = typeof rawBody === "string" ? new TextEncoder().encode(rawBody) : rawBody;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return bytesToBase64(sig);
}

export async function verifyShopifyHmac(rawBody, header, secret) {
  if (!secret || !header) return false;
  const expected = await shopifyHmac(rawBody, secret);
  return timingSafeEqual(expected, String(header).trim());
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

export function imageList(product, page) {
  const fromPage = page?.data?.images;
  const source = Array.isArray(fromPage) && fromPage.length ? fromPage : product?.images;
  const urls = [];
  for (const item of source || []) {
    const url = typeof item === "string" ? item : item?.url;
    if (/^https:\/\//i.test(String(url || "")) && !urls.includes(url)) urls.push(url);
    if (urls.length >= 8) break;
  }
  return urls;
}

export function shopifyDescriptionHtml(product, page) {
  const data = page?.data;
  if (data && (data.subheadline || (data.benefits || []).length || data.headline)) {
    const parts = [];
    if (data.subheadline) parts.push(`<p>${htmlEscape(data.subheadline)}</p>`);
    const benefits = Array.isArray(data.benefits) ? data.benefits.filter((item) => item?.title || item?.text) : [];
    if (benefits.length) {
      parts.push(`<ul>${benefits.map((item) => `<li><strong>${htmlEscape(item.title || "")}</strong> ${htmlEscape(item.text || "")}</li>`).join("")}</ul>`);
    }
    if (parts.length) return parts.join("");
  }
  const baseHtml = product?.raw?.base?.description_html;
  if (baseHtml && String(baseHtml).trim()) {
    const safe = safeHtml(baseHtml);
    if (safe) return safe;
  }
  const text = product?.description || product?.catalog_name || product?.name || "";
  return `<p>${htmlEscape(text).replace(/\n/g, "<br>")}</p>`;
}

/** Opis HTML z Base: bez skryptów, ramek, formularzy, atrybutów on* i linków javascript:. */
export function safeHtml(html) {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base|svg|math|template|noscript)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|xlink:href|action|formaction)\s*=\s*("\s*(javascript|vbscript|data):[^"]*"|'\s*(javascript|vbscript|data):[^']*'|(javascript|vbscript|data):[^\s>]*)/gi, "")
    .trim()
    .slice(0, 60000);
}

export function round2(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function sellPrice(product, page) {
  const bundles = page?.data?.bundles;
  const bundle = Array.isArray(bundles) ? bundles.find((item) => item && item.price != null && item.price !== "") : null;
  const raw = bundle ? bundle.price : product?.price;
  if (raw == null || raw === "") return null;
  const number = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(number)) return null;
  return (Math.round(number * 100) / 100).toFixed(2);
}

function barcodeOf(raw) {
  const ean = String(raw || "").replace(/\s/g, "");
  return /^\d{8,14}$/.test(ean) ? ean : "";
}

function stockQuantity(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

/** Produkt z Base ma warianty? Zwraca listę z unikalnymi nazwami opcji (Shopify wymaga różnych wartości). */
export function variantRows(product) {
  const list = Array.isArray(product?.variants) ? product.variants.filter((v) => v && (v.base_id || v.sku || v.name)) : [];
  const used = new Set();
  return list.slice(0, 100).map((v, index) => {
    let name = String(v.name || v.sku || `Wariant ${index + 1}`).trim().slice(0, 240) || `Wariant ${index + 1}`;
    if (used.has(name.toLowerCase())) name = `${name} (${v.sku || index + 1})`.slice(0, 255);
    used.add(name.toLowerCase());
    return { ...v, optionName: name };
  });
}

/** Stan magazynowy idzie do Shopify tylko gdy znamy lokalizację (opts.locationId). */
function withInventory(variant, quantity, locationId) {
  if (!locationId || quantity == null) return variant;
  variant.inventoryItem = { tracked: true };
  // Bez sprzedaży „na minusie”: przy stanie 0 Shopify nie przyjmie zamówienia.
  variant.inventoryPolicy = "DENY";
  variant.inventoryQuantities = [{ locationId, name: "available", quantity }];
  return variant;
}

export function buildProductSetInput(product, page, opts = {}) {
  const title = String(product?.catalog_name || product?.name || "Produkt").slice(0, 255);
  const price = sellPrice(product, page);
  const sku = String(product?.sku || product?.ean || "").slice(0, 64);
  const barcode = barcodeOf(product?.ean);
  const locationId = String(opts.locationId || "");
  const many = variantRows(product);
  let productOptions;
  let variants;
  if (many.length) {
    const map = product?.shopify_variant_map && typeof product.shopify_variant_map === "object" ? product.shopify_variant_map : {};
    productOptions = [{ name: "Wariant", values: many.map((v) => ({ name: v.optionName })) }];
    variants = many.map((v) => {
      const variant = { optionValues: [{ optionName: "Wariant", name: v.optionName }] };
      const id = variantGid(map[String(v.base_id)]);
      if (id) variant.id = id;
      const vSku = String(v.sku || "").slice(0, 64);
      if (vSku) variant.sku = vSku;
      const vPrice = v.price != null && v.price !== "" && Number(v.price) > 0 ? (Math.round(Number(v.price) * 100) / 100).toFixed(2) : price;
      if (vPrice != null) variant.price = vPrice;
      const vBarcode = barcodeOf(v.ean);
      if (vBarcode) variant.barcodes = [{ barcode: vBarcode }];
      return withInventory(variant, stockQuantity(v.stock), locationId);
    });
  } else {
    const variant = {
      optionValues: [{ optionName: "Tytuł", name: "Domyślny" }]
    };
    const variantId = variantGid(product?.shopify_variant_id);
    if (variantId) variant.id = variantId;
    if (sku) variant.sku = sku;
    if (price != null) variant.price = price;
    if (barcode) variant.barcodes = [{ barcode }];
    withInventory(variant, stockQuantity(product?.stock), locationId);
    productOptions = [{ name: "Tytuł", values: [{ name: "Domyślny" }] }];
    variants = [variant];
  }
  const input = {
    title,
    descriptionHtml: shopifyDescriptionHtml(product, page),
    status: shopifyStatusFor(product?.workflow_status),
    productOptions,
    variants
  };
  const vendor = String(product?.producer || product?.brand || "").slice(0, 120);
  const productType = String(product?.category || "").slice(0, 120);
  if (vendor) input.vendor = vendor;
  if (productType) input.productType = productType;
  const gid = productGid(product?.shopify_product_id);
  if (gid) input.id = gid;
  const files = imageList(product, page).map((url, index) => ({
    originalSource: url,
    alt: title,
    filename: `nhp-${index + 1}.jpg`,
    contentType: "IMAGE"
  }));
  if (files.length) input.files = files;
  return input;
}

/** Po wysyłce: id wariantu w Base → id wariantu w Shopify (po SKU, a gdy go brak — po nazwie opcji). */
export function variantMapFromShopify(product, nodes) {
  const map = {};
  const rows = variantRows(product);
  for (const v of rows) {
    const bySku = v.sku ? (nodes || []).find((n) => n?.sku && n.sku === v.sku) : null;
    const byName = (nodes || []).find((n) => (n?.selectedOptions || []).some((o) => o?.value === v.optionName));
    const node = bySku || byName;
    if (node?.id && v.base_id) map[String(v.base_id)] = numericId(node.id);
  }
  return map;
}

export const PRODUCT_SET_MUTATION = `mutation NhpProductSet($input: ProductSetInput!, $synchronous: Boolean!) {
  productSet(synchronous: $synchronous, input: $input) {
    product {
      id
      handle
      status
      onlineStoreUrl
      variants(first: 100) { nodes { id sku selectedOptions { name value } } }
    }
    userErrors { field message }
  }
}`;

export function inboundProductPatch(payload, currentWorkflow, domain) {
  const variant = (payload?.variants || [])[0] || {};
  const status = String(payload?.status || "").toLowerCase();
  const handle = String(payload?.handle || "");
  const price = variant.price == null || variant.price === "" ? "" : String(round2(variant.price));
  return {
    name: String(payload?.title || "").slice(0, 500),
    catalog_name: String(payload?.title || "").slice(0, 500),
    description: plainText(payload?.body_html || ""),
    price,
    sku: String(variant.sku || "").slice(0, 64),
    ean: String(variant.barcode || "").replace(/\s/g, "").slice(0, 32),
    workflow_status: workflowFromShopify(status, currentWorkflow),
    shopify_product_id: numericId(payload?.id),
    shopify_variant_id: numericId(variant.id),
    shopify_handle: handle,
    shopify_url: productUrl(domain, handle),
    shopify_status: status
  };
}

export function deletedProductPatch() {
  return { workflow_status: "archiwum", shopify_status: "archived" };
}

export function polishNip(raw) {
  const labeled = String(raw || "").match(/(?:nip|vat)\s*[:#]?\s*(\d[\d\s-]{8,14}\d)/i);
  const source = labeled ? labeled[1] : raw;
  const digits = String(source || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  if (sum % 11 !== Number(digits[9])) return "";
  return digits;
}

export function findOrderNip(payload) {
  const billing = payload?.billing_address || payload?.billingAddress || {};
  const chunks = [billing.company, billing.address2, payload?.note];
  for (const attr of payload?.note_attributes || payload?.customAttributes || []) {
    chunks.push(attr?.name, attr?.value, attr?.key);
  }
  for (const chunk of chunks) {
    const nip = polishNip(chunk);
    if (nip) return nip;
  }
  return "";
}

export function lineGross(item, taxesIncluded = true) {
  if (item?.discounted_total != null && item.discounted_total !== "") return round2(item.discounted_total);
  const qty = Number(item?.quantity) || 0;
  const unit = Number(item?.price) || 0;
  const discount = (item?.discount_allocations || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  let gross = unit * qty - discount;
  if (taxesIncluded === false) {
    gross += (item?.tax_lines || []).reduce((sum, row) => sum + (Number(row.price) || 0), 0);
  }
  return round2(Math.max(0, gross));
}

export function normalizeShopifyOrder(payload) {
  const id = numericId(payload?.id || payload?.admin_graphql_api_id);
  if (!id) return null;
  const taxesIncluded = payload?.taxes_included !== false && payload?.taxesIncluded !== false;
  const billing = payload?.billing_address || {};
  const customer = payload?.customer || {};
  const name = billing.name
    || [customer.first_name || billing.firstName, customer.last_name || billing.lastName].filter(Boolean).join(" ")
    || payload?.email
    || customer.email
    || "Nabywca";
  const shipping = round2(
    payload?.total_shipping_price_set?.shop_money?.amount
    ?? payload?.total_shipping_price_set?.shopMoney?.amount
    ?? (payload?.shipping_lines || []).reduce((sum, row) => sum + (Number(row.price) || 0), 0)
  );
  const lines = (payload?.line_items || []).map((item, index) => ({
    shopify_line_id: numericId(item.id) || String(index + 1),
    shopify_product_id: numericId(item.product_id || item.product?.id),
    sku: String(item.sku || "").slice(0, 64),
    title: String(item.title || item.name || "Pozycja").slice(0, 500),
    quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
    unit_price: round2(item.price),
    line_total: lineGross(item, taxesIncluded)
  }));
  if (shipping > 0) {
    lines.push({
      shopify_line_id: "shipping",
      shopify_product_id: "",
      sku: "",
      title: "Dostawa",
      quantity: 1,
      unit_price: shipping,
      line_total: shipping
    });
  }
  const currency = String(
    payload?.currency
    || payload?.total_price_set?.shop_money?.currency_code
    || payload?.totalPriceSet?.shopMoney?.currencyCode
    || "PLN"
  ).toUpperCase();
  return {
    shopify_order_id: id,
    order_number: String(payload?.name || payload?.order_number || `#${id}`).slice(0, 40),
    email: String(payload?.email || customer.email || "").slice(0, 200),
    financial_status: String(payload?.financial_status || payload?.displayFinancialStatus || "pending").toLowerCase(),
    currency,
    total: round2(payload?.current_total_price ?? payload?.total_price ?? lines.reduce((sum, line) => sum + line.line_total, 0)),
    taxes_included: taxesIncluded,
    customer_name: String(name).slice(0, 250),
    billing: {
      name: String(name).slice(0, 250),
      address1: String(billing.address1 || "").slice(0, 250),
      address2: String(billing.address2 || "").slice(0, 250),
      zip: String(billing.zip || "").slice(0, 16),
      city: String(billing.city || "").slice(0, 120),
      country: String(billing.country_code || billing.countryCodeV2 || "PL").slice(0, 2),
      company: String(billing.company || "").slice(0, 250),
      nip: findOrderNip(payload)
    },
    placed_at: payload?.created_at || payload?.createdAt || null,
    lines
  };
}

export function paidEnough(status) {
  return status === "paid" || status === "partially_paid";
}

export function matchProductId(line, products) {
  const shopifyId = String(line?.shopify_product_id || "");
  const sku = String(line?.sku || "");
  const byShopify = (products || []).find((product) => shopifyId && String(product.shopify_product_id || "") === shopifyId);
  if (byShopify) return byShopify.id;
  const bySku = (products || []).find((product) => sku && (product.sku === sku || product.ean === sku));
  return bySku?.id || null;
}

export function fromGraphqlOrder(node) {
  const shipping = node?.totalShippingPriceSet?.shopMoney?.amount;
  return normalizeShopifyOrder({
    id: node?.id,
    name: node?.name,
    email: node?.email,
    displayFinancialStatus: node?.displayFinancialStatus,
    currency: node?.totalPriceSet?.shopMoney?.currencyCode,
    total_price: node?.totalPriceSet?.shopMoney?.amount,
    taxes_included: node?.taxesIncluded !== false,
    created_at: node?.createdAt,
    billing_address: node?.billingAddress ? {
      name: node.billingAddress.name,
      firstName: node.billingAddress.firstName,
      lastName: node.billingAddress.lastName,
      address1: node.billingAddress.address1,
      city: node.billingAddress.city,
      zip: node.billingAddress.zip,
      country_code: node.billingAddress.countryCodeV2,
      company: node.billingAddress.company
    } : null,
    customAttributes: node?.customAttributes,
    total_shipping_price_set: shipping == null ? null : { shop_money: { amount: shipping } },
    line_items: (node?.lineItems?.nodes || []).map((item) => ({
      id: item.id,
      product_id: item.product?.id,
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      price: item.originalUnitPriceSet?.shopMoney?.amount,
      discounted_total: item.discountedTotalSet?.shopMoney?.amount
    }))
  });
}
