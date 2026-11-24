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
  description_sections: [],
  parameters: [],
  variants: [],
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
    .replace(/&#39;|&apos;/gi, "'")
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
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (all, n) => {
      const code = Number(n);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : all;
    });
}

function availabilityText(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const last = s.split("/").pop();
  if (/schema\.org/i.test(s) && last) return last;
  return s.slice(0, 80);
}

function cleanEan(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14) return digits;
  return raw.replace(/\s+/g, " ").slice(0, 32);
}

function variantFromNode(node) {
  const offer = asArray(node?.offers).find((o) => o && (o.price != null || o.lowPrice != null)) || asArray(node?.offers)[0] || {};
  const color = typeof node?.color === "string" ? node.color : node?.color?.name;
  const size = typeof node?.size === "string" ? node.size : node?.size?.name;
  const label = first(color, size, node?.name, offer?.name);
  const kind = color ? "Kolor" : size ? "Rozmiar" : "Wariant";
  return {
    name: kind,
    value: label,
    sku: first(node?.sku, offer?.sku),
    ean: cleanEan(first(node?.gtin13, node?.gtin, node?.gtin14, node?.gtin8, offer?.gtin13, offer?.gtin)),
    price: moneyText(offer?.price ?? offer?.lowPrice),
    old_price: moneyText(offer?.highPrice),
    currency: first(offer?.priceCurrency),
    image: ""
  };
}

function variantsFromProduct(product) {
  const explicit = asArray(product?.hasVariant).map(variantFromNode).filter((v) => v.value || v.sku || v.ean);
  if (explicit.length) return explicit;
  const offers = asArray(product?.offers).filter((o) => o && typeof o === "object" && !typeOf(o).includes("aggregateoffer"));
  if (offers.length < 2) return [];
  return offers.map((offer) => variantFromNode({ ...offer, offers: offer })).filter((v) => v.value || v.sku || v.ean || v.price);
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
  const images = asArray(product.image).flatMap((i) => {
    if (typeof i === "string") return [i];
    return [i?.contentUrl, i?.url, i?.thumbnailUrl].filter(Boolean);
  });
  const params = asArray(product.additionalProperty).map((p) => ({
    name: String(p?.name || "").trim(),
    value: String(p?.value ?? p?.valueReference?.name ?? "").trim()
  })).filter((p) => p.name || p.value);
  const crumbs = nodes.find((n) => typeOf(n).includes("breadcrumblist"));
  const category = crumbs
    ? asArray(crumbs.itemListElement).map((c) => c?.name || c?.item?.name).filter(Boolean).join(" / ")
    : (typeof product.category === "string" ? product.category : "");
  return {
    name: String(product.name || "").trim(),
    sku: String(product.sku || product.mpn || "").trim(),
    ean: cleanEan(product.gtin13 || product.gtin || product.gtin14 || product.gtin8 || product.gtin12 || ""),
    brand: String(brand || "").trim(),
    price: moneyText(offer.price ?? offer.lowPrice),
    old_price: moneyText(strike?.price ?? (offer.highPrice != null && String(offer.highPrice) !== String(offer.price) ? offer.highPrice : "")),
    currency: String(offer.priceCurrency || "").trim(),
    availability: availabilityText(offer.availability),
    category,
    description_html: typeof product.description === "string" ? product.description.trim() : "",
    parameters: params,
    images,
    variants: variantsFromProduct(product)
  };
}

export function structuredSignals(html) {
  const blocks = extractJsonLdBlocks(html);
  const nodes = [];
  blocks.forEach((b) => walkNodes(b, nodes));
  const listed = new Set();
  let itemListCount = 0;
  for (const node of nodes) {
    if (!typeOf(node).includes("itemlist")) continue;
    for (const el of asArray(node.itemListElement)) {
      itemListCount += 1;
      const item = el?.item || el;
      if (item && typeof item === "object") listed.add(item);
    }
  }
  const products = nodes.filter((n) => typeOf(n).includes("product") && !listed.has(n));
  const text = String(html || "");
  return {
    productCount: products.length,
    itemListCount,
    microdata: /itemtype=["'][^"']*schema\.org\/Product["']/i.test(text),
    openGraph: /property=["']og:type["'][^>]*content=["'][^"']*product|property=["']product:price:amount["']|name=["']product:price:amount["']/i.test(text)
      || /content=["'][^"']*product["'][^>]*(?:property|name)=["']og:type["']/i.test(text),
    platform: /woocommerce-product-gallery|body[^>]*single-product|projector_price_value|projector_productname|catalog-product-view|box_productfull|data-product_variations|id=["']ProductJson["']/i.test(text)
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

function idBlock(html, id) {
  const re = new RegExp(`<([a-z0-9]+)[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  return String(html || "").match(re)?.[2] || "";
}

function wooPrices(html) {
  const block = classBlock(html, "price") || String(html || "").match(/<p[^>]*class=["'][^"']*price[^"']*["'][^>]*>[\s\S]*?<\/p>/i)?.[0] || "";
  const amount = (chunk) => moneyText(chunk?.match(/([\d][\d\s.,]*)/)?.[1]);
  const del = block.match(/<del[\s\S]*?<\/del>/i)?.[0] || "";
  const ins = block.match(/<ins[\s\S]*?<\/ins>/i)?.[0] || "";
  const current = ins || block.replace(/<del[\s\S]*?<\/del>/gi, "");
  return { price: amount(current), old_price: amount(del), sawZloty: /zł|pln/i.test(block) };
}

function shoperPrices(html) {
  const main = String(html || "").match(/<[^>]*class=["'][^"']*main-price[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || "";
  const del = String(html || "").match(/<del[^>]*>([\s\S]*?)<\/del>/i)?.[1] || "";
  return { price: moneyText(main), old_price: moneyText(del), sawZloty: /zł|pln/i.test(main + del) };
}

function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return decode(tag.match(re)?.[1] || "");
}

function urlsFromSrcset(value, pageUrl) {
  const out = [];
  for (const part of String(value || "").split(",")) {
    const bits = part.trim().split(/\s+/);
    const abs = absoluteUrl(bits[0], pageUrl);
    const width = Number(String(bits[1] || "").replace(/w$/i, "")) || 0;
    if (abs) out.push({ url: abs, score: width });
  }
  return out;
}

export function imageScore(url) {
  const s = String(url || "").toLowerCase();
  let score = 500;
  if (/sprite|logo|icon|placeholder|blank|pixel|spinner|loader|payment|banner|avatar/.test(s)) score -= 700;
  if (/thumb|small|mini|compact|pico|-\d{2,3}x\d{2,3}|_\d{2,3}x\d{2,3}|-\d{2,3}\.(jpe?g|png|webp|gif|avif)/.test(s)) score -= 180;
  const dim = s.match(/(\d{3,4})x(\d{2,4})/);
  if (dim) score += Math.min(500, Number(dim[1]) / 3);
  if (/large|zoom|full|original|master|2048|1600|1200|1024/.test(s)) score += 220;
  const width = Number(s.match(/[?&](?:w|width|imwidth)=(\d+)/)?.[1] || 0);
  if (width) score += Math.min(400, width / 4);
  return score;
}

function imageStem(url) {
  try {
    const u = new URL(url);
    let path = decodeURIComponent(u.pathname).toLowerCase();
    path = path
      .replace(/[_-](?:\d{2,4}x\d{0,4}|\d{0,4}x\d{2,4})(?=\.(?:jpe?g|png|webp|gif|avif)$)/i, "")
      .replace(/[_-](?:thumb|thumbnail|small|medium|large|grande|compact|pico|icon|mini)(?=\.(?:jpe?g|png|webp|gif|avif)$)/i, "")
      .replace(/-\d{2,3}(?=\.(?:jpe?g|png|webp|gif|avif)$)/i, "");
    return `${u.origin}${path}`;
  } catch {
    return String(url || "");
  }
}

export function preferFullImages(urls) {
  const best = new Map();
  const order = [];
  for (const entry of urls) {
    const url = typeof entry === "string" ? entry : entry?.url;
    if (!url || url.startsWith("data:")) continue;
    const bonus = typeof entry === "object" && entry?.score ? Number(entry.score) || 0 : 0;
    const score = (typeof entry === "object" && entry?.baseScore != null ? entry.baseScore : imageScore(url)) + bonus;
    const stem = imageStem(url);
    const prev = best.get(stem);
    if (!prev) {
      order.push(stem);
      best.set(stem, { url, score });
    } else if (score > prev.score) {
      best.set(stem, { url, score });
    }
  }
  return order
    .map((stem) => best.get(stem))
    .filter((row) => row && row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.url);
}

function collectImageCandidates(html, pageUrl) {
  const found = [];
  const push = (url, bonus = 0) => {
    const abs = absoluteUrl(decode(url), pageUrl);
    if (!abs) return;
    found.push({ url: abs, baseScore: imageScore(abs), score: bonus });
  };
  const re = /<(img|a|source)\b[^>]*>/gi;
  const text = String(html || "");
  let tag;
  while ((tag = re.exec(text))) {
    const el = tag[0];
    const kind = tag[1].toLowerCase();
    const before = text.slice(Math.max(0, tag.index - 350), tag.index);
    const interesting = /product|gallery|woocommerce|wp-post-image|data-large|data-zoom|data-full|data-original|itemprop=["']image["']|fotorama|slider|swiper|productimg|photos|magnifier/i.test(el)
      || /class=["'][^"']*(?:gallery|productimg|photos|product-gallery)[^"']*["']/i.test(before);
    if (!interesting) continue;
    const large = attr(el, "data-large_image") || attr(el, "data-zoom-image") || attr(el, "data-full")
      || attr(el, "data-full-image") || attr(el, "data-original") || attr(el, "data-image-large-src")
      || attr(el, "data-image") || attr(el, "data-zoom");
    if (large) push(large, 280);
    if (kind === "a") {
      const href = attr(el, "href");
      if (/\.(?:jpe?g|png|webp|gif|avif)(?:$|\?)/i.test(href)) push(href, 240);
    }
    for (const setName of ["srcset", "data-srcset"]) {
      for (const item of urlsFromSrcset(attr(el, setName), pageUrl)) {
        found.push({ url: item.url, baseScore: imageScore(item.url), score: Math.min(320, item.score / 4) });
      }
    }
    const src = attr(el, "data-src") || attr(el, "data-lazy") || attr(el, "data-lazy-src") || attr(el, "src");
    if (src) push(src, kind === "img" ? 0 : 20);
  }
  return found;
}

function galleryImages(html, pageUrl) {
  return preferFullImages(collectImageCandidates(html, pageUrl));
}

function absoluteUrl(value, pageUrl) {
  const s = String(value || "").trim();
  if (!s || s.startsWith("data:") || s.startsWith("javascript:")) return "";
  try {
    const u = new URL(s, pageUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

function tableParams(html) {
  const out = [];
  const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let match;
  const text = String(html || "");
  while ((match = re.exec(text))) {
    const attrs = match[1];
    const body = match[2];
    const interesting = /param|spec|attribute|feature|dane|cech|detail|product/i.test(attrs) || /ean|gtin|sku|producent|marka/i.test(body);
    if (!interesting) continue;
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let row;
    while ((row = rowRe.exec(body))) {
      const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => htmlToText(c[1]).split("\n")[0].trim());
      if (cells.length >= 2 && cells[0]) out.push({ name: cells[0].replace(/:$/, ""), value: cells.slice(1).join(" ").trim() });
    }
  }
  const dlRe = /<dl\b([^>]*)>([\s\S]*?)<\/dl>/gi;
  let dl;
  while ((dl = dlRe.exec(text))) {
    if (!/param|spec|attribute|feature|dane|cech|product/i.test(dl[1]) && !/ean|gtin/i.test(dl[2])) continue;
    const dts = [...dl[2].matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)];
    for (const pair of dts) {
      const name = htmlToText(pair[1]).split("\n")[0].trim().replace(/:$/, "");
      const value = htmlToText(pair[2]).split("\n")[0].trim();
      if (name && value) out.push({ name, value });
    }
  }
  return out;
}

function mergeParams(lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const row of list || []) {
      const name = String(row?.name || "").replace(/\s+/g, " ").trim();
      const value = String(row?.value || "").replace(/\s+/g, " ").trim();
      if (!name && !value) continue;
      const key = name.toLowerCase();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push({ name, value });
      if (out.length === 80) return out;
    }
  }
  return out;
}

function eanFromParams(params) {
  const row = (params || []).find((p) => /^(ean|gtin|gtin13|kod\s*kreskowy|barcode)$/i.test(String(p.name || "").trim()));
  return cleanEan(row?.value || "");
}

export function descriptionSections(html) {
  const clean = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  if (!clean.trim()) return [];
  if (!/<[a-z]/i.test(clean)) {
    const text = htmlToText(clean);
    return text ? [{ type: "text", text: text.slice(0, 4000) }] : [];
  }
  const sections = [];
  const images = [];
  const imgRe = /<img\b[^>]*>/gi;
  let img;
  while ((img = imgRe.exec(clean))) {
    const src = attr(img[0], "src") || attr(img[0], "data-src");
    if (/^https?:/i.test(src)) images.push(src);
  }
  const re = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let heading = "";
  let buf = [];
  function flush() {
    const body = buf.map((line) => line.trim()).filter(Boolean).join("\n").trim();
    const text = [heading, body].filter(Boolean).join("\n").trim();
    if (text) sections.push({ type: "text", text: text.slice(0, 4000) });
    buf = [];
  }
  while ((match = re.exec(clean))) {
    const tag = match[1].toLowerCase();
    const line = htmlToText(match[2]).trim();
    if (!line) continue;
    if (tag.startsWith("h")) {
      flush();
      heading = line;
    } else {
      buf.push(line);
      if (buf.join("\n").length > 1800) {
        flush();
        heading = "";
      }
    }
  }
  flush();
  if (!sections.length) {
    const text = htmlToText(clean);
    if (text) sections.push({ type: "text", text: text.slice(0, 4000) });
  }
  for (const url of images) {
    if (sections.length >= 20) break;
    sections.push({ type: "image", url });
  }
  return sections.slice(0, 20);
}

function longestHtml(candidates) {
  let best = "";
  let bestLen = 0;
  for (const html of candidates) {
    const text = htmlToText(html);
    if (text.length > bestLen) {
      best = String(html || "").trim();
      bestLen = text.length;
    }
  }
  return best;
}

function wooVariants(html) {
  const match = String(html || "").match(/data-product_variations=(["'])([\s\S]*?)\1/i);
  if (!match) return [];
  let data;
  try { data = JSON.parse(decode(match[2])); } catch { return []; }
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const attrs = row?.attributes && typeof row.attributes === "object" ? row.attributes : {};
    const value = Object.values(attrs).map((item) => String(item || "").replace(/-/g, " ").trim()).filter(Boolean).join(" / ");
    const name = Object.keys(attrs).map((key) => key.replace(/^attribute_pa_/, "").replace(/^attribute_/, "").replace(/_/g, " ")).filter(Boolean).join(" / ") || "Wariant";
    return {
      name,
      value: value || String(row?.sku || "").trim(),
      sku: String(row?.sku || "").trim(),
      ean: "",
      price: moneyText(row?.display_price),
      old_price: moneyText(row?.display_regular_price != null && String(row.display_regular_price) !== String(row.display_price) ? row.display_regular_price : ""),
      currency: "",
      image: row?.image?.full_src || row?.image?.url || row?.image?.src || ""
    };
  }).filter((row) => row.value || row.sku);
}

function shopifyMoney(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return (value / 100).toFixed(2);
  const s = String(value).trim();
  if (/^\d+$/.test(s) && s.length >= 3) return (Number(s) / 100).toFixed(2);
  return moneyText(s);
}

function shopifyVariants(html) {
  const match = String(html || "").match(/<script[^>]*id=["']ProductJson(?:-[^"']*)?["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];
  let data;
  try { data = JSON.parse(match[1]); } catch { return []; }
  const variants = data?.variants || data?.product?.variants;
  if (!Array.isArray(variants)) return [];
  return variants.map((row) => ({
    name: "Wariant",
    value: String(row?.title || row?.public_title || "").trim(),
    sku: String(row?.sku || "").trim(),
    ean: cleanEan(row?.barcode || ""),
    price: shopifyMoney(row?.price),
    old_price: shopifyMoney(row?.compare_at_price),
    currency: "",
    image: ""
  })).filter((row) => row.value && row.value.toLowerCase() !== "default title");
}

function selectVariants(html) {
  const out = [];
  const re = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    if (!/kolor|color|rozmiar|size|wariant|variant|attribute/i.test(match[1])) continue;
    const name = /kolor|color/i.test(match[1]) ? "Kolor" : /rozmiar|size/i.test(match[1]) ? "Rozmiar" : "Wariant";
    const options = [...match[2].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)]
      .map((opt) => htmlToText(opt[1]).trim())
      .filter((label) => label && !/wybierz|choose|—|-/i.test(label) || label.length > 2);
    for (const value of options) {
      if (/^wybierz|^choose/i.test(value)) continue;
      out.push({ name, value, sku: "", ean: "", price: "", old_price: "", currency: "", image: "" });
    }
  }
  return out.slice(0, 40);
}

function breadcrumbFromHtml(html) {
  const nav = String(html || "").match(/<(?:nav|ol|ul)\b[^>]*(?:breadcrumb|okruszk)[^>]*>([\s\S]*?)<\/(?:nav|ol|ul)>/i)?.[1] || "";
  if (!nav) return "";
  const links = [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((a) => htmlToText(a[1]).split("\n")[0].trim()).filter(Boolean);
  return links.join(" / ");
}

function platformFields(html, pageUrl) {
  const text = String(html || "");
  const woo = wooPrices(text);
  const shoper = shoperPrices(text);
  const sku = first(
    itemprop(text, "sku"),
    classBlock(text, "sku").replace(/^sku:?\s*/i, ""),
    (classBlock(text, "productcode") || classBlock(text, "product-code")).match(/[A-Za-z0-9][A-Za-z0-9._-]{2,}/g)?.find((token) => /\d/.test(token)),
    text.match(/id=["']product_reference["'][^>]*>[\s\S]*?<span[^>]*>([^<]+)/i)?.[1],
    text.match(/id=["']projector_code_value["'][^>]*>([^<]+)/i)?.[1],
    meta(text, "product:retailer_item_id")
  );
  const name = first(
    itemprop(text, "name"),
    text.match(/<h1[^>]*class=["'][^"']*(?:product_title|product-name|productname|name)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    text.match(/<h1[^>]*id=["']projector_productname["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  );
  const brand = first(
    itemprop(text, "brand"),
    text.match(/class=["'][^"']*(?:product-brand|brand|manufacturer|producent)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1],
    meta(text, "product:brand")
  );
  const idosellPrice = moneyText(text.match(/id=["']projector_price_value["'][^>]*>([^<]+)/i)?.[1]);
  const shopifyPrice = moneyText(meta(text, "product:price:amount") || meta(text, "og:price:amount"));
  const descriptions = [
    classBlock(text, "woocommerce-Tabs-panel--description"),
    idBlock(text, "tab-description"),
    classBlock(text, "product-description"),
    classBlock(text, "product__description"),
    classBlock(text, "product-desc"),
    idBlock(text, "description"),
    classBlock(text, "woocommerce-product-details__short-description")
  ];
  const price = woo.price || shoper.price || idosellPrice || shopifyPrice;
  const old = woo.old_price || (shoper.old_price && shoper.old_price !== price ? shoper.old_price : "");
  return {
    name: htmlToText(name).split("\n")[0].trim(),
    sku: htmlToText(sku).split("\n")[0].trim(),
    ean: cleanEan(itemprop(text, "gtin13") || itemprop(text, "gtin") || itemprop(text, "gtin14")),
    brand: htmlToText(brand).replace(/^producent:?\s*/i, "").split("\n")[0].trim(),
    price,
    old_price: old,
    currency: meta(text, "product:price:currency") || meta(text, "og:price:currency") || ((woo.sawZloty || shoper.sawZloty) && price ? "PLN" : ""),
    category: breadcrumbFromHtml(text),
    images: galleryImages(text, pageUrl),
    description_html: longestHtml(descriptions),
    parameters: tableParams(text),
    variants: wooVariants(text).concat(shopifyVariants(text))
  };
}

function fill(target, source) {
  if (!source) return;
  for (const key of ["name", "sku", "ean", "brand", "price", "old_price", "currency", "availability", "category", "description_html"]) {
    if (!target[key] && source[key]) target[key] = String(source[key]).trim();
  }
  if (!target.parameters.length && source.parameters?.length) target.parameters = source.parameters;
  if (!target.variants.length && source.variants?.length) target.variants = source.variants;
}

export function extractProduct(html, pageUrl) {
  const out = EMPTY();
  out.url = String(pageUrl || "");
  const ld = productFromJsonLd(extractJsonLdBlocks(html));
  const platform = platformFields(html, pageUrl);
  fill(out, ld);
  const ogImages = [meta(html, "og:image"), meta(html, "og:image:secure_url")].filter(Boolean);
  fill(out, {
    name: meta(html, "og:title"),
    price: moneyText(meta(html, "product:price:amount") || meta(html, "og:price:amount")),
    currency: meta(html, "product:price:currency") || meta(html, "og:price:currency"),
    brand: meta(html, "product:brand"),
    description_html: meta(html, "og:description")
  });
  fill(out, platform);
  out.parameters = mergeParams([ld?.parameters, platform.parameters, out.parameters]);
  if (!out.variants.length) out.variants = platform.variants?.length ? platform.variants : selectVariants(html);
  if (!out.ean) out.ean = eanFromParams(out.parameters);
  if (!out.sku) {
    const skuRow = out.parameters.find((p) => /^(sku|kod|kod produktu|indeks|symbol)$/i.test(String(p.name || "").trim()));
    if (skuRow?.value) out.sku = skuRow.value;
  }
  if (!out.brand) {
    const brandRow = out.parameters.find((p) => /^(producent|marka|brand)$/i.test(String(p.name || "").trim()));
    if (brandRow?.value) out.brand = brandRow.value;
  }
  out.description_html = longestHtml([ld?.description_html, platform.description_html, out.description_html]);
  out.description_text = htmlToText(out.description_html);
  out.description_sections = descriptionSections(out.description_html);
  const variantImages = (out.variants || []).map((row) => row.image).filter(Boolean);
  out.images = preferFullImages([
    ...(ld?.images || []).map((url) => absoluteUrl(url, pageUrl)).filter(Boolean),
    ...ogImages.map((url) => absoluteUrl(url, pageUrl)).filter(Boolean),
    ...(platform.images || []),
    ...variantImages.map((url) => absoluteUrl(url, pageUrl)).filter(Boolean)
  ]).slice(0, 40);
  out.parameters = (out.parameters || []).filter((p) => p && (p.name || p.value)).slice(0, 80);
  out.variants = (out.variants || []).filter((row) => row && (row.value || row.sku || row.ean || row.price)).slice(0, 40);
  if (out.price && out.old_price && out.price === out.old_price) out.old_price = "";
  if (out.name.length > 300) out.name = out.name.slice(0, 300).trim();
  return out;
}

const PRODUCT_PATH = /\/(product|products|produkt|produkty|p|towar|towary)\/|\/product-pol-|-\d+\.html$|\/p\/[a-z0-9-]+/i;
const LISTING_PATH = /\/(category|kategoria|kolekcja|collections|c)\/|page\/\d+|paged?=\d+|\/page\/\d+/i;

export function isProductPath(pathname) {
  return PRODUCT_PATH.test(String(pathname || ""));
}

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
