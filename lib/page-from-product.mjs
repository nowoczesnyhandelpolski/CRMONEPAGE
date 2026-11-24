// Karta z produktu wtyczki. Fakty (nazwa, parametry, EAN, producent, cena) zostają.
// Opis i nagłówki idą bez zmian, gdy keepOriginal (domyślnie). Opinie i nagrania nie powstają.

import { cleanSiteData, packBundles } from "./site-model.mjs";
import { parseMoney } from "./pricing.mjs";
import { paramValue } from "./offer-normalizer.mjs";

function plain(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plik albo podpis wygląda na cudzy znak, nie na zdjęcie produktu. */
export function isForeignLogo(url, alt = "") {
  const file = String(url || "").split("?")[0].split("#")[0].split("/").pop() || "";
  const blob = `${file} ${alt}`.toLowerCase();
  return /(^|[^a-z0-9])logo(typ|type)?s?([^a-z0-9]|$)|favicon|brandmark/.test(blob);
}

function pushPhoto(out, value) {
  const url = typeof value === "string" ? value : value?.url;
  const alt = typeof value === "object" && value ? String(value.alt || "") : "";
  if (!url || isForeignLogo(url, alt)) return;
  if (out.some((item) => item.url === url)) return;
  out.push({ url, alt, include: !(value && value.include === false) });
}

/** Wszystkie zdjęcia produktu, bez logotypów i bez duplikatów. Kolejność zostaje. */
export function listProductPhotos(product = {}) {
  const out = [];
  for (const img of product.images || []) pushPhoto(out, img);
  for (const img of product.description_images || []) pushPhoto(out, img);
  for (const section of product.description_sections || []) {
    const type = String(section?.type || section?.kind || "").toLowerCase();
    if (type === "image" || type === "img") pushPhoto(out, section.url || section.src || section);
  }
  return out;
}

export function descriptionBlocks(product = {}) {
  const blocks = [];
  const sections = Array.isArray(product.description_sections) ? product.description_sections : [];
  for (const section of sections) {
    if (!section || typeof section === "string") {
      const text = plain(section);
      if (text) blocks.push({ title: "", text });
      continue;
    }
    const type = String(section.type || section.kind || "").toLowerCase();
    if (type === "image" || type === "img") continue;
    const title = plain(section.title || section.name || "");
    const text = plain(section.text || section.content || "");
    if (title || text) blocks.push({ title, text });
  }
  if (!blocks.length && product.description) {
    const text = plain(product.description);
    if (text) blocks.push({ title: "", text });
  }
  return blocks;
}

export function descriptionText(product = {}) {
  return descriptionBlocks(product).map((block) => [block.title, block.text].filter(Boolean).join("\n")).join("\n\n").slice(0, 8000);
}

function pushFeature(features, title, text) {
  const body = plain(text);
  const head = plain(title).slice(0, 120) || "Opis";
  if (!body) {
    if (plain(title)) features.push({ title: head, text: "" });
    return;
  }
  const size = 3900;
  for (let i = 0; i < body.length && features.length < 12; i += size) {
    const chunk = body.slice(i, i + size).trim();
    if (!chunk) continue;
    const label = i === 0 ? head : `${head} — ciąg dalszy`;
    features.push({ title: label.slice(0, 120), text: chunk });
  }
}

export function originalFeatures(product = {}) {
  const features = [];
  const blocks = descriptionBlocks(product);
  if (!blocks.length) return features;
  const titled = blocks.some((block) => block.title);
  if (!titled && blocks.length === 1) {
    pushFeature(features, "Opis", blocks[0].text);
    return features;
  }
  for (const block of blocks) pushFeature(features, block.title || "Opis", block.text);
  return features;
}

export function factSpecs(product = {}) {
  const raw = Array.isArray(product.parameters) ? product.parameters : Array.isArray(product.params) ? product.params : [];
  const specs = [];
  for (const row of raw) {
    const name = plain(row?.name || row?.k || "").slice(0, 80);
    const value = plain(row?.value == null && row?.v != null ? paramValue({ value: row.v }) : paramValue(row)).slice(0, 200);
    if (name && value && value !== "[object Object]") specs.push({ name, value });
  }
  const ean = String(product.ean || "").replace(/\s/g, "").slice(0, 32);
  if (ean && !specs.some((spec) => /ean|gtin/i.test(spec.name))) specs.unshift({ name: "EAN", value: ean });
  const producer = plain(product.producer || product.brand || "").slice(0, 160);
  if (producer && !specs.some((spec) => /producent|marka/i.test(spec.name))) specs.push({ name: "Producent", value: producer });
  return specs.slice(0, 24);
}

/**
 * Szkic Konwersja z produktu bazy.
 * keepOriginal (domyślnie) wstawia nazwę i opis tak, jak przyszły z wtyczki.
 * Zdjęcia: podana kolejność, pierwsze jest główne, include:false odpada, logotypy odpadają.
 * rights włącza publikację zdjęć. Bez potwierdzenia prawa zdjęcie zostaje w szkicu, ale nie na żywej stronie.
 */
export function pageFromProduct(product = {}, options = {}) {
  const keepOriginal = options.keepOriginal !== false;
  const name = plain(product.catalog_name || product.name || product.title || "").slice(0, 300);
  const price = parseMoney(product.sale_price ?? product.price);
  const chosen = Array.isArray(options.images) ? options.images : listProductPhotos(product);
  const photos = [];
  for (const item of chosen) {
    const url = typeof item === "string" ? item : item?.url;
    const alt = typeof item === "object" && item ? String(item.alt || "") : "";
    if (!url || isForeignLogo(url, alt)) continue;
    if (item && item.include === false) continue;
    if (photos.some((photo) => photo.url === url)) continue;
    photos.push({ url, alt: name || alt });
  }
  const rights = options.rights === true;
  const specs = factSpecs(product);
  const features = keepOriginal ? originalFeatures(product) : [];
  const description = descriptionText(product);
  const producer = plain(product.producer || "").slice(0, 160);
  const brand = plain(product.brand || product.producer || "").slice(0, 60);
  const delivery = parseMoney(product.delivery_cost);
  const bundle2 = Object.prototype.hasOwnProperty.call(options, "bundle2") ? options.bundle2 : product.raw?.cena_2;
  const bundle3 = Object.prototype.hasOwnProperty.call(options, "bundle3") ? options.bundle3 : product.raw?.cena_3;
  const bundles = packBundles(price, bundle2, bundle3);
  const data = cleanSiteData({
    template: "konwersja",
    brand,
    kicker: brand,
    headline: name,
    subheadline: "",
    price,
    bundles,
    default_bundle: bundles.length >= 2 ? 1 : 0,
    images: photos.slice(0, 12).map((photo) => ({ url: photo.url, alt: photo.alt, rights })),
    features,
    benefits: [],
    benefits_title: features.length ? "Opis" : "",
    specs,
    reviews: [],
    ugc: [],
    faq: [],
    compare: [],
    sections: {
      sale: false,
      gallery: true,
      bundles: true,
      benefits: false,
      urgency: false,
      trust: false,
      ugc: false,
      reviews: false,
      compare: false,
      features: true,
      faq: false,
      sticky: true
    },
    sale: { enabled: false, label: "", text: "" },
    urgency: { show_stock: false, show_timer: false },
    shipping: {
      time: plain(product.shipping_time || "").slice(0, 80),
      free: delivery === 0,
      price: delivery > 0 ? delivery : null
    },
    gpsr: { producer: producer || brand },
    seo: { title: name.slice(0, 70), description: "" },
    theme: { accent: "#ff5a00" },
    source: {
      link: product.source_link || "",
      title: name,
      price,
      description,
      images: photos.map((photo) => photo.url).slice(0, 30),
      params: specs.map((spec) => ({ k: spec.name, v: spec.value })),
      producer,
      keep_original: keepOriginal
    },
    generated: keepOriginal ? { tier: "", model: "baza" } : { tier: "", model: "" }
  });
  return {
    name: name || "Szkic strony",
    status: "draft",
    data
  };
}
