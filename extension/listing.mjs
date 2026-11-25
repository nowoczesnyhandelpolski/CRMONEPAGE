// Listing sklepu: linki kart produktów, paginacja i kolejka pełnych kart.
// Czysty moduł, bez chrome — testy wołają go w Node.

import { extractJsonLdBlocks, extractProduct, isProductPath } from "./shop-extract.mjs";

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function typeOf(node) {
  return asArray(node?.["@type"]).map((t) => String(t).toLowerCase());
}

function walk(node, acc) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, acc)); return; }
  acc.push(node);
  if (node["@graph"]) walk(node["@graph"], acc);
}

export function canonicalProductUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|srsltid|gbraid|wbraid)/i.test(key)) u.searchParams.delete(key);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.href;
  } catch {
    return String(url || "").trim();
  }
}

function safeUrl(value, base) {
  try {
    const u = new URL(String(value || "").trim(), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (u.origin !== base.origin) return "";
    u.hash = "";
    return u.href;
  } catch {
    return "";
  }
}

function textOf(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function skipHref(url) {
  try {
    const u = new URL(url);
    if (/\/(cart|koszyk|checkout|kasa|konto|account|login|wishlist|porownywarka|search|szukaj)(\/|$)/i.test(u.pathname)) return true;
    if (/[?&](add-to-cart|add_to_cart)=/i.test(u.search)) return true;
  } catch {
    return true;
  }
  return false;
}

function cleanName(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

function priceOnly(value) {
  const text = cleanName(value).replace(/zł/gi, "").trim();
  return !!text && !/[a-ząćęłńóśźż]{3,}/i.test(text);
}

function pushProduct(list, seen, item) {
  const url = canonicalProductUrl(item.url);
  if (!url || skipHref(url)) return;
  const name = cleanName(item.name);
  const price = String(item.price || "").trim();
  if (seen.has(url)) {
    const prev = list.find((row) => row.url === url);
    if (prev && name && !priceOnly(name) && (!prev.name || priceOnly(prev.name))) prev.name = name;
    return;
  }
  seen.add(url);
  list.push({ url, name: priceOnly(name) ? "" : name, price });
}

function fromJsonLd(html, pageUrl) {
  const out = [];
  const seen = new Set();
  let base;
  try { base = new URL(pageUrl); } catch { return out; }
  const nodes = [];
  for (const block of extractJsonLdBlocks(html)) walk(block, nodes);
  for (const node of nodes) {
    if (!typeOf(node).includes("itemlist")) continue;
    for (const el of asArray(node.itemListElement)) {
      const item = el?.item || el;
      const raw = typeof item === "string" ? item : (item?.url || item?.["@id"] || el?.url || "");
      const url = safeUrl(raw, base);
      const name = typeof item === "object" ? (item?.name || el?.name || "") : (el?.name || "");
      const offer = item?.offers;
      const price = offer?.price || offer?.lowPrice || "";
      if (url) pushProduct(out, seen, { url, name, price });
    }
  }
  return out;
}

function anchorTags(html) {
  return String(html || "").match(/<a\b(?:[^<>]|[\r\n]){0,1200}?>/gi) || [];
}

function fromAnchors(html, pageUrl) {
  const out = [];
  const seen = new Set();
  let base;
  try { base = new URL(pageUrl); } catch { return out; }
  const text = String(html || "");
  const re = /<a\b(?:[^<>]|[\r\n]){0,1200}?>([\s\S]{0,500}?)<\/a>/gi;
  let match;
  while ((match = re.exec(text))) {
    const own = match[0].slice(0, match[0].indexOf(">") + 1);
    const href = own.match(/\bhref=["']([^"'#]+)["']/i)?.[1] || "";
    const abs = safeUrl(href, base);
    if (!abs) continue;
    let path = "";
    try { path = new URL(abs).pathname; } catch { continue; }
    if (path === base.pathname && !new URL(abs).search) continue;
    if (/[?&]p=\d+|page=\d+|\/page\/\d+/i.test(abs) && !isProductPath(path)) continue;
    const cls = own.match(/\bclass=["']([^"']+)["']/i)?.[1] || "";
    const before = text.slice(Math.max(0, match.index - 500), match.index);
    const magento = /product-item(?:-link|-photo|-name)?|product-name|product_title/i.test(cls);
    const inCard = magento
      || /<(?:article|li|div)\b[^>]*class=["'][^"']*(?:product-item|\bproduct\b|produkt)[^"']*["']/i.test(before.slice(-500))
      || /class=["'][^"']*products[^"']*["'][^>]*>[\s\S]{0,200}$/i.test(before);
    if (!inCard && !isProductPath(path)) continue;
    const title = own.match(/\btitle=["']([^"']+)["']/i)?.[1] || "";
    const name = cleanName(title || textOf(match[1]));
    if (/^(następna|nastepna|next|poprzednia|prev|»|›|\.\.\.)$/i.test(name)) continue;
    pushProduct(out, seen, { url: abs, name, price: "" });
  }
  return out;
}

export function extractListing(html, pageUrl) {
  const seen = new Set();
  const products = [];
  for (const item of fromJsonLd(html, pageUrl).concat(fromAnchors(html, pageUrl))) {
    const url = canonicalProductUrl(item.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    products.push(item);
  }
  return { products, nextUrl: nextListingUrl(html, pageUrl) };
}

export function nextListingUrl(html, pageUrl) {
  let base;
  try { base = new URL(pageUrl); } catch { return ""; }
  const text = String(html || "");
  const relTag = text.match(/<link\b[^>]*rel=["'][^"']*\bnext\b[^"']*["'][^>]*>/i)?.[0]
    || text.match(/<a\b[^>]*rel=["'][^"']*\bnext\b[^"']*["'][^>]*>/i)?.[0]
    || "";
  const relHref = relTag.match(/href=["']([^"']+)["']/i)?.[1] || "";
  const rel = relHref ? safeUrl(relHref, base) : "";
  if (rel && canonicalProductUrl(rel) !== canonicalProductUrl(base.href)) return rel;

  const magentoNext = text.match(/pages-item-next[\s\S]{0,600}?href=["']([^"']+)["']/i)?.[1] || "";
  const magentoUrl = magentoNext ? safeUrl(magentoNext, base) : "";
  if (magentoUrl && canonicalProductUrl(magentoUrl) !== canonicalProductUrl(base.href)) return magentoUrl;

  const classTag = anchorTags(text).find((tag) => {
    const cls = tag.match(/\bclass=["']([^"']+)["']/i)?.[1] || "";
    return /\bnext\b/i.test(cls) && !/\bjump\b/i.test(cls);
  }) || "";
  const classHref = classTag.match(/href=["']([^"']+)["']/i)?.[1] || "";
  const classUrl = classHref ? safeUrl(classHref, base) : "";
  if (classUrl && canonicalProductUrl(classUrl) !== canonicalProductUrl(base.href)) return classUrl;

  const moreTag = text.match(/<(?:a|button)\b[^>]*class=["'][^"']*(?:load-more|show-more|pagination-more)[^"']*["'][^>]*>/i)?.[0] || "";
  const moreHref = moreTag.match(/\b(?:href|data-next-url|data-url|data-next)=["']([^"']+)["']/i)?.[1] || "";
  const more = moreHref ? safeUrl(moreHref, base) : "";
  if (more && canonicalProductUrl(more) !== canonicalProductUrl(base.href)) return more;

  const current = Number(base.searchParams.get("page") || base.searchParams.get("p") || base.searchParams.get("pg") || "1") || 1;
  const want = String(current + 1);
  const hrefRe = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRe.exec(text))) {
    const abs = safeUrl(match[1], base);
    if (!abs) continue;
    let u;
    try { u = new URL(abs); } catch { continue; }
    const page = u.searchParams.get("page") || u.searchParams.get("p") || u.searchParams.get("pg");
    if (page === want) return u.href;
    if (new RegExp(`/page/${want}(?:/|$)`).test(u.pathname)) return u.href;
  }
  return "";
}

export async function collectListingUrls({
  startUrl,
  fetchText,
  limit = 50,
  delayMs = 1000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  shouldStop = () => false,
  shouldPause = () => false,
  onPage = () => {}
}) {
  const cap = limit === 0 ? 2000 : Math.max(1, Math.min(2000, Number(limit) || 50));
  const urls = [];
  const seenPages = new Set();
  const seenProducts = new Set();
  let pageUrl = startUrl;
  let pages = 0;
  while (pageUrl && pages < 80 && urls.length < cap) {
    while (shouldPause() && !shouldStop()) await sleep(120);
    if (shouldStop()) return { urls, pages, stopped: true };
    const key = canonicalProductUrl(pageUrl);
    if (seenPages.has(key)) break;
    seenPages.add(key);
    let html = "";
    try { html = await fetchText(pageUrl); } catch { html = ""; }
    pages += 1;
    const before = urls.length;
    const listing = extractListing(html || "", pageUrl);
    for (const product of listing.products) {
      if (seenProducts.has(product.url)) continue;
      seenProducts.add(product.url);
      urls.push(product);
      if (urls.length >= cap) break;
    }
    onPage({ pages, count: urls.length, url: pageUrl });
    if (urls.length >= cap) break;
    if (pages > 1 && urls.length === before) break;
    const next = listing.nextUrl;
    if (!next || canonicalProductUrl(next) === key) break;
    pageUrl = next;
    if (delayMs > 0) await sleep(delayMs);
  }
  return { urls, pages, stopped: shouldStop() };
}

export async function fetchProductQueue({
  urls,
  fetchText,
  delayMs = 1000,
  retries = 2,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  extract = extractProduct,
  shouldPause = () => false,
  shouldStop = () => false,
  onItem = () => {}
}) {
  const results = [];
  const list = Array.isArray(urls) ? urls : [];
  for (let i = 0; i < list.length; i++) {
    while (shouldPause() && !shouldStop()) await sleep(120);
    if (shouldStop()) return { results, cancelled: true };
    const url = typeof list[i] === "string" ? list[i] : list[i]?.url;
    let html = "";
    let error = "";
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (shouldStop()) return { results, cancelled: true };
      try {
        html = await fetchText(url);
        if (html) { error = ""; break; }
        error = "Pusta strona";
      } catch (err) {
        html = "";
        error = String(err?.message || err).slice(0, 180);
      }
      if (attempt < retries) await sleep(Math.min(1500, 400 * (attempt + 1)));
    }
    const product = html ? extract(html, url) : null;
    const ok = !!(product && (product.name || product.sku || product.ean));
    const row = {
      url,
      ok,
      error: ok ? "" : (error || "Nie widzę produktu na tej karcie."),
      product: ok ? product : null,
      missingEan: !!(ok && !product.ean)
    };
    results.push(row);
    onItem(row, results);
    if (delayMs > 0 && i < list.length - 1) await sleep(delayMs);
  }
  return { results, cancelled: !!shouldStop() };
}

export function partitionKnown(products, known = {}) {
  const eans = new Set((known.eans || []).map((e) => String(e || "").replace(/\s/g, "")).filter(Boolean));
  const urls = new Set((known.urls || []).map((u) => canonicalProductUrl(u)).filter(Boolean));
  const fresh = [];
  const dupes = [];
  const seenEan = new Set();
  const seenUrl = new Set();
  for (const product of products || []) {
    const ean = String(product?.ean || "").replace(/\s/g, "");
    const url = canonicalProductUrl(product?.url || product?.source_link || "");
    const dupe = (ean && (eans.has(ean) || seenEan.has(ean))) || (url && (urls.has(url) || seenUrl.has(url)));
    if (dupe) dupes.push(product);
    else fresh.push(product);
    if (ean) seenEan.add(ean);
    if (url) seenUrl.add(url);
  }
  return { fresh, dupes };
}
