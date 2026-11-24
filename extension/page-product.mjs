// Rozpoznanie karty produktu albo listingu i paczka pod zapis w NHP.

import { extractProduct, isProductPath, structuredSignals } from "./shop-extract.mjs";
import { extractListing } from "./listing.mjs";

export function formatMoney(value, currency) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const formatted = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  if (!currency) return formatted;
  if (String(currency).toUpperCase() === "PLN") return `${formatted} zł`;
  return `${formatted} ${currency}`;
}

export function variantParameters(variants) {
  const out = [];
  for (const row of variants || []) {
    const bits = [
      row.value || row.name,
      row.price ? `${row.price}${row.currency ? ` ${row.currency}` : ""}`.trim() : "",
      row.ean ? `EAN ${row.ean}` : "",
      row.sku ? `SKU ${row.sku}` : ""
    ].filter(Boolean);
    const name = row.name && row.name !== row.value ? row.name : "Wariant";
    const value = bits.join(" · ").slice(0, 200);
    if (!value) continue;
    if (out.some((item) => item.name === name && item.value === value)) continue;
    out.push({ name, value });
  }
  return out;
}

export function missingFields(product) {
  const missing = [];
  if (!product?.name) missing.push("nazwa");
  if (!product?.price) missing.push("cena");
  if (!product?.ean) missing.push("EAN");
  if (!product?.brand) missing.push("producent");
  if (!product?.sku) missing.push("SKU");
  if (!product?.images?.length) missing.push("zdjęcia");
  if (!product?.description_text && !product?.description_sections?.length) missing.push("opis");
  if (!product?.parameters?.length) missing.push("parametry");
  return missing;
}

export function productToPayload(product, group = "") {
  const sections = product?.description_sections?.length
    ? product.description_sections
    : (product?.description_text ? [{ type: "text", text: product.description_text }] : []);
  const parameters = (product?.parameters || []).slice();
  for (const row of variantParameters(product?.variants)) {
    if (!parameters.some((item) => item.name === row.name && item.value === row.value)) parameters.push(row);
  }
  return {
    catalog_name: product?.name || "",
    sku: product?.sku || "",
    ean: product?.ean || "",
    producer: product?.brand || "",
    price: product?.price || "",
    price_before_promo: product?.old_price || "",
    category: product?.category || "",
    parameters,
    images: (product?.images || []).slice(0, 40),
    description: product?.description_text || "",
    description_sections: sections,
    source_link: product?.url || "",
    product_group: group || ""
  };
}

function urlLooksListing(pageUrl) {
  try {
    const path = new URL(pageUrl).pathname;
    return /\/(kategoria|category|kolekcja|collections|c)(\/|$)/i.test(path) || /\/page\/\d+/.test(path);
  } catch {
    return false;
  }
}

export function classifyPage(html, pageUrl, product, listing) {
  const signals = structuredSignals(html);
  const listCount = Math.max(listing?.products?.length || 0, signals.itemListCount || 0);
  const strongSingle = signals.productCount === 1 && !!(product?.name && (product.price || product.sku || product.ean));
  const text = String(html || "");
  const buy = /dodaj do koszyka|add to cart|do koszyka|kup teraz/i.test(text);
  if (listCount >= 4 && !strongSingle) return "listing";
  if (strongSingle && !(listCount >= 4 && urlLooksListing(pageUrl))) return "product";
  if (listCount >= 4) return "listing";
  const platformHit = signals.platform || signals.microdata || signals.openGraph;
  if (platformHit && product?.name && (product.price || product.sku || product.ean || product.images?.length)) return "product";
  let productUrl = false;
  try { productUrl = isProductPath(new URL(pageUrl).pathname); } catch { productUrl = false; }
  if (product?.name && product.price && (product.images?.length || product.parameters?.length || buy || productUrl)) return "product";
  return "other";
}

export function analyzePage(html, pageUrl) {
  const product = extractProduct(html, pageUrl);
  const listing = extractListing(html, pageUrl);
  const kind = classifyPage(html, pageUrl, product, listing);
  return { kind, product, listing, missing: missingFields(product) };
}
