// Wyciąganie produktu ze sklepu. Puste pole zostaje puste — nic nie zgadujemy.

const EMPTY = () => ({
  name: "",
  sku: "",
  ean: "",
  brand: "",
  price: "",
  old_price: "",
  currency: "",
  availability: "",
  category: "",
  description_html: "",
  description_text: "",
  parameters: [],
  images: [],
  url: ""
});

export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function moneyText(value) {
  if (value == null) return "";
  const s = String(value).replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return "";
  return s;
}

function first() {
  for (const value of arguments) {
    const s = String(value ?? "").replace(/\s+/g, " ").trim();
    if (s) return s;
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

export function extractJsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const raw = match[1].trim();
    try { out.push(JSON.parse(raw)); } catch { /* uszkodzony blok pomijamy */ }
  }
  return out;
}

function walkNodes(node, acc) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => walkNodes(n, acc)); return; }
  acc.push(node);
  if (node["@graph"]) walkNodes(node["@graph"], acc);
}

function meta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, "i")
  ];
  for (const re of patterns) {
    const found = String(html || "").match(re);
    if (found?.[1]) return decode(found[1]).trim();
  }
  return "";
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function availabilityText(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const last = s.split("/").pop();
  if (/schema\.org/i.test(s) && last) return last;
  return s.slice(0, 80);
}

function productFromJsonLd(blocks) {
  const nodes = [];
  blocks.forEach((b) => walkNodes(b, nodes));
  const product = nodes.find((n) => typeOf(n).includes("product"));
  if (!product) return null;
  const offer = asArray(product.offers).find((o) => o && (o.price != null || o.lowPrice != null)) || asArray(product.offers)[0] || {};
  const specs = asArray(offer.priceSpecification);
  const strike = specs.find((s) => /strikethrough|list|before|regular/i.test(String(s?.priceType || s?.["@type"] || "")));
  const brand = typeof product.brand === "string" ? product.brand : product.brand?.name;
  const images = asArray(product.image).map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean);
  const params = asArray(product.additionalProperty).map((p) => ({
    name: String(p?.name || "").trim(),
    value: String(p?.value ?? "").trim()
  })).filter((p) => p.name || p.value);
  const crumbs = nodes.find((n) => typeOf(n).includes("breadcrumblist"));
  const category = crumbs
    ? asArray(crumbs.itemListElement).map((c) => c?.name || c?.item?.name).filter(Boolean).join(" / ")
    : (typeof product.category === "string" ? product.category : "");
  return {
    name: String(product.name || "").trim(),
    sku: String(product.sku || product.mpn || "").trim(),
    ean: String(product.gtin13 || product.gtin || product.gtin14 || product.gtin8 || "").trim(),
    brand: String(brand || "").trim(),
    price: moneyText(offer.price ?? offer.lowPrice),
    old_price: moneyText(strike?.price ?? (offer.highPrice != null && String(offer.highPrice) !== String(offer.price) ? offer.highPrice : "")),
    currency: String(offer.priceCurrency || "").trim(),
    availability: availabilityText(offer.availability),
    category,
    description_html: typeof product.description === "string" ? product.description.trim() : "",
    parameters: params,
    images
  };
}

function itemprop(html, name) {
  const re = new RegExp(`<[^>]*itemprop=["']${name}["'][^>]*>`, "i");
  const tag = String(html || "").match(re)?.[0] || "";
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  if (content) return decode(content).trim();
  const block = String(html || "").match(new RegExp(`<[^>]*itemprop=["']${name}["'][^>]*>([\\s\\S]*?)</`, "i"));
  return htmlToText(block?.[1] || "").split("\n")[0].trim();
}

function classBlock(html, className) {
  const re = new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  return String(html || "").match(re)?.[2] || "";
}

function wooPrices(html) {
  const block = classBlock(html, "price") || String(html || "").match(/<p[^>]*class=["'][^"']*price[^"']*["'][^>]*>[\s\S]*?<\/p>/i)?.[0] || "";
  const amount = (chunk) => moneyText(chunk?.match(/([\d][\d\s.,]*)/)?.[1]);
  const del = block.match(/<del[\s\S]*?<\/del>/i)?.[0];
  const ins = block.match(/<ins[\s\S]*?<\/ins>/i)?.[0];
  const current = ins || block;
  return { price: amount(current), old_price: amount(del) };
}

function galleryImages(html, pageUrl) {
  const urls = [];
  const re = /<(?:img|source)[^>]+>/gi;
  let tag;
  while ((tag = re.exec(String(html || "")))) {
    const el = tag[0];
    const interesting = /product|gallery|woocommerce-product-gallery|wp-post-image|data-large_image|itemprop=["']image["']/i.test(el);
    if (!interesting) continue;
    const src = el.match(/data-large_image=["']([^"']+)["']/i)?.[1]
      || el.match(/data-src=["']([^"']+)["']/i)?.[1]
      || el.match(/\bsrc=["']([^"']+)["']/i)?.[1]
      || "";
    const abs = absoluteUrl(src, pageUrl);
    if (abs && !urls.includes(abs)) urls.push(abs);
  }
  return urls;
}

function absoluteUrl(value, pageUrl) {
  const s = String(value || "").trim();
  if (!s || s.startsWith("data:")) return "";
  try {
    const u = new URL(s, pageUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

function platformFields(html, pageUrl) {
  const text = String(html || "");
  const woo = wooPrices(text);
  const sku = first(
    itemprop(text, "sku"),
    classBlock(text, "sku").replace(/^sku:?\s*/i, ""),
    text.match(/id=["']product_reference["'][^>]*>[\s\S]*?<span[^>]*>([^<]+)/i)?.[1],
    text.match(/id=["']projector_code_value["'][^>]*>([^<]+)/i)?.[1]
  );
  const name = first(
    itemprop(text, "name"),
    text.match(/<h1[^>]*class=["'][^"']*(?:product_title|product-name|productname)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    text.match(/<h1[^>]*id=["']projector_productname["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  );
  const brand = first(
    itemprop(text, "brand"),
    text.match(/class=["'][^"']*(?:product-brand|brand)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]
  );
  const idosellPrice = moneyText(text.match(/id=["']projector_price_value["'][^>]*>([^<]+)/i)?.[1]);
  const shopifyPrice = moneyText(meta(text, "product:price:amount") || meta(text, "og:price:amount"));
  return {
    name: htmlToText(name).split("\n")[0].trim(),
    sku: htmlToText(sku).split("\n")[0].trim(),
    ean: itemprop(text, "gtin13") || itemprop(text, "gtin"),
    brand: htmlToText(brand).split("\n")[0].trim(),
    price: woo.price || idosellPrice || shopifyPrice,
    old_price: woo.old_price,
    currency: meta(text, "product:price:currency") || meta(text, "og:price:currency"),
    images: galleryImages(text, pageUrl),
    description_html: classBlock(text, "woocommerce-product-details__short-description")
      || classBlock(text, "product-description")
      || ""
  };
}

function fill(target, source) {
  if (!source) return;
  for (const key of ["name", "sku", "ean", "brand", "price", "old_price", "currency", "availability", "category", "description_html"]) {
    if (!target[key] && source[key]) target[key] = String(source[key]).trim();
  }
  if (!target.parameters.length && source.parameters?.length) target.parameters = source.parameters;
  if (!target.images.length && source.images?.length) target.images = source.images.filter(Boolean);
}

export function extractProduct(html, pageUrl) {
  const out = EMPTY();
  out.url = String(pageUrl || "");
  fill(out, productFromJsonLd(extractJsonLdBlocks(html)));
  const ogImages = [meta(html, "og:image")].filter(Boolean).map((u) => absoluteUrl(u, pageUrl)).filter(Boolean);
  fill(out, {
    name: meta(html, "og:title"),
    price: moneyText(meta(html, "product:price:amount") || meta(html, "og:price:amount")),
    currency: meta(html, "product:price:currency") || meta(html, "og:price:currency"),
    description_html: meta(html, "og:description"),
    images: ogImages
  });
  fill(out, platformFields(html, pageUrl));
  out.description_html = out.description_html.trim();
  out.description_text = htmlToText(out.description_html);
  out.images = [...new Set(out.images.map((u) => absoluteUrl(u, pageUrl)).filter(Boolean))];
  out.parameters = (out.parameters || []).filter((p) => p && (p.name || p.value));
  if (out.price && out.old_price && out.price === out.old_price) out.old_price = "";
  return out;
}

const PRODUCT_PATH = /\/(product|products|produkt|produkty|p|towar|towary)\/|\/product-pol-|-\d+\.html$|\/p\/[a-z0-9-]+/i;
const LISTING_PATH = /\/(category|kategoria|kolekcja|collections|c)\/|page\/\d+|paged?=\d+|\/page\/\d+/i;

export function discoverLinks(html, pageUrl) {
  let base;
  try { base = new URL(pageUrl); } catch { return { products: [], listings: [] }; }
  const products = [];
  const listings = [];
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    let abs;
    try { abs = new URL(match[1], base); } catch { continue; }
    if (abs.origin !== base.origin) continue;
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    abs.hash = "";
    const path = `${abs.pathname}${abs.search}`;
    const href = abs.href;
    if (PRODUCT_PATH.test(path)) products.push(href);
    else if (LISTING_PATH.test(path)) listings.push(href);
  }
  const next = String(html || "").match(/<link[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i)?.[1]
    || String(html || "").match(/<a[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i)?.[1]
    || String(html || "").match(/<a[^>]*class=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (next) {
    try {
      const abs = new URL(next, base);
      if (abs.origin === base.origin) listings.push(abs.href);
    } catch { /* pomiń */ }
  }
  return { products: [...new Set(products)], listings: [...new Set(listings)] };
}

export function fileSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function imageExtension(url) {
  const clean = String(url || "").split("?")[0].split("#")[0];
  const ext = clean.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext) ? ext : "";
}

export function rewriteImageUrl(url, { domain, brand, sku, index = 1 } = {}) {
  const host = String(domain || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/\/$/, "");
  if (!host) return url;
  const brandSlug = fileSlug(brand);
  const skuSlug = fileSlug(sku);
  if (!brandSlug || !skuSlug) return url;
  const ext = imageExtension(url);
  if (!ext) return url;
  const name = index > 1 ? `${skuSlug}-${index}` : skuSlug;
  return `https://${host}/produkty/${brandSlug}/${name}.${ext}`;
}

export function exportImages(product, domain) {
  return (product.images || []).map((url, i) => rewriteImageUrl(url, {
    domain,
    brand: product.brand,
    sku: product.sku,
    index: i + 1
  }));
}

export function imageFileName(product, index, url) {
  const brand = fileSlug(product.brand) || "_";
  const fromUrl = fileSlug(String(product.url || "").split("/").filter(Boolean).pop() || "");
  const sku = fileSlug(product.sku) || fromUrl || "produkt";
  const ext = imageExtension(url) || "jpg";
  return `${brand}/${sku}-${index + 1}.${ext}`;
}
