// Jedyne miejsce selektorów DOM. Podmień ten plik, gdy dojdzie rdzeń SharkHelper.
// Najpierw JSON-LD i stan osadzony (extract.mjs), potem te selektory.

import { extractFromJsonLd, extractFromUnknownJson, mergeExtract, offerIdFromUrl } from "./extract.mjs";

export const SELECTORS = {
  jsonLd: 'script[type="application/ld+json"]',
  embeddedState: "script#__NEXT_DATA__, script[data-serialize], script[type='application/json']",
  title: "h1",
  price: '[data-role="price"], [itemprop="price"], [aria-label*="cena" i]',
  priceBefore: "s, del, [data-role='strike-price']",
  delivery: "[data-role='delivery-price'], [data-analytics-category='delivery']",
  shippingTime: "[data-role='delivery-time']",
  parameters: "[data-role='parameter'], [data-box-name='Parameters'] tr",
  gallery: "[data-box-name='gallery'] img, [data-role='gallery'] img",
  description: "[data-box-name='Description'], [data-role='description'], #description",
  breadcrumbs: "nav[aria-label*='okruszk'] a, [data-role='breadcrumb'] a, ol[itemtype*='BreadcrumbList'] a"
};

function txt(el) {
  return String(el?.textContent || "").replace(/\s+/g, " ").trim();
}

function parseJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

export function readStructured(document) {
  const ld = [];
  for (const node of document.querySelectorAll(SELECTORS.jsonLd)) {
    const parsed = parseJson(node.textContent || "");
    if (parsed) ld.push(extractFromJsonLd(parsed));
  }
  const embedded = [];
  for (const node of document.querySelectorAll(SELECTORS.embeddedState)) {
    const parsed = parseJson(node.textContent || "");
    if (parsed) embedded.push(extractFromUnknownJson(parsed));
  }
  return mergeExtract(...ld, ...embedded);
}

export function readDom(document) {
  const title = txt(document.querySelector(SELECTORS.title));
  const price = txt(document.querySelector(SELECTORS.price));
  const priceBefore = txt(document.querySelector(SELECTORS.priceBefore));
  const delivery = txt(document.querySelector(SELECTORS.delivery));
  const shippingTime = txt(document.querySelector(SELECTORS.shippingTime));
  const crumbs = [...document.querySelectorAll(SELECTORS.breadcrumbs)].map(txt).filter(Boolean);
  const parameters = [...document.querySelectorAll(SELECTORS.parameters)].map((row) => {
    const cells = row.querySelectorAll("td, th, dt, dd, span");
    if (cells.length >= 2) return { name: txt(cells[0]), value: txt(cells[1]) };
    const line = txt(row);
    const split = line.split(":");
    return split.length >= 2 ? { name: split[0].trim(), value: split.slice(1).join(":").trim() } : null;
  }).filter((p) => p && (p.name || p.value));
  const images = [...document.querySelectorAll(SELECTORS.gallery)].map((img) => img.currentSrc || img.src || img.getAttribute("data-src") || "").filter((u) => /^https?:/.test(u));
  const box = document.querySelector(SELECTORS.description);
  const description_sections = [];
  if (box) {
    for (const child of box.querySelectorAll("p, h2, h3, li, img")) {
      if (child.tagName === "IMG") {
        const url = child.currentSrc || child.src || "";
        if (/^https?:/.test(url)) description_sections.push({ type: "image", url });
      } else if (!child.querySelector("p, li, h2, h3")) {
        const text = txt(child);
        if (text) description_sections.push({ type: "text", text });
      }
    }
  }
  let ean = "";
  const eanParam = parameters.find((p) => /ean|gtin/i.test(p.name));
  if (eanParam) ean = eanParam.value;
  return {
    catalog_name: title,
    price,
    price_before_promo: priceBefore,
    delivery_cost: delivery,
    shipping_time: shippingTime,
    ean,
    category: crumbs.join(" / "),
    parameters,
    images,
    description_sections
  };
}

export function extractOffer(document, href) {
  const data = mergeExtract(readStructured(document), readDom(document));
  data.source_link = href || "";
  data.source_offer_id = offerIdFromUrl(href || "");
  return data;
}
