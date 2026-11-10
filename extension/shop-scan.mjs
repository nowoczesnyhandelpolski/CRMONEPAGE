import { discoverLinks, extractProduct } from "./shop-extract.mjs";

function sameOrigin(url, origin) {
  try { return new URL(url).origin === origin; } catch { return false; }
}

export async function crawlShop({
  startUrl,
  fetchText,
  maxPages = 50,
  maxProducts = 500,
  delayMs = 0,
  shouldStop = () => false,
  onProgress = () => {}
}) {
  const origin = new URL(startUrl).origin;
  const seen = new Set();
  const queue = [startUrl];
  const products = [];
  const known = new Set();
  let pages = 0;
  let stopped = false;
  while (queue.length && pages < maxPages && products.length < maxProducts) {
    if (shouldStop()) { stopped = true; break; }
    const url = queue.shift();
    if (!url || seen.has(url) || !sameOrigin(url, origin)) continue;
    seen.add(url);
    let html = "";
    try { html = await fetchText(url); } catch { html = ""; }
    if (html == null) continue;
    pages += 1;
    const product = extractProduct(html, url);
    if (product.name || product.sku || product.ean) {
      const key = product.url || url;
      if (!known.has(key)) {
        known.add(key);
        products.push(product);
      }
    }
    const found = discoverLinks(html, url);
    for (const link of found.products.concat(found.listings)) {
      if (!seen.has(link) && sameOrigin(link, origin) && queue.length < maxPages * 20) queue.push(link);
    }
    onProgress({ pages, products: products.length, url, running: true });
    if (delayMs > 0 && queue.length && pages < maxPages && products.length < maxProducts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  if (shouldStop()) stopped = true;
  return { products: products.slice(0, maxProducts), pages, stopped };
}
