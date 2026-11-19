// Eksport CSV z wtyczki / Sharkly: średnik, cudzysłowy, opisy wieloliniowe.
// Kolumny: nr_sharkly, ean, tytul, cena, cena_zrodlowa, opis1..opis10, zdj*, zdj_opis*, param: *.
// Cena sprzedaży bierze się wyłącznie z „cena”. Puste pole zostaje puste.
// cena_zrodlowa nie jest ceną sprzedaży, ceną przekreśloną ani zestawem.

import { parseMoney } from "./pricing.mjs";
import { cleanSiteData, packBundles } from "./site-model.mjs";

export function parseSemicolonCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => String(value).trim())) rows.push(row);
  }
  return rows;
}

export function isSharklyExport(headers) {
  const names = (headers || []).map((h) => String(h || "").trim().toLowerCase());
  return names.includes("tytul") && names.includes("cena") && (names.includes("opis1") || names.includes("nr_sharkly"));
}

function cleanLine(value) {
  return String(value || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, " ")
    .replace(/^[\s•*\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitOpis(raw) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text) return null;
  const lines = text.split("\n").map((line) => cleanLine(line)).filter(Boolean);
  if (!lines.length) return null;
  const title = lines[0].slice(0, 140);
  const body = lines.slice(1).join(" ").replace(/\s+/g, " ").trim();
  if (!body) return null;
  return { title, text: body.slice(0, 1200) };
}

function iconFor(title) {
  const s = title.toLowerCase();
  if (/włos|wlos|rys|lakier|bezpiecz/.test(s)) return "shield";
  if (/chwyt|mróz|mroz|piank/.test(s)) return "check";
  if (/montaż|montaz|klik/.test(s)) return "box";
  if (/uniwers|taras|namiot/.test(s)) return "truck";
  if (/lód|lod|śnieg|snieg|szron/.test(s)) return "leaf";
  return "check";
}

function httpUrl(value) {
  const s = String(value || "").trim();
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function uniqueImages(record) {
  const urls = [];
  const keys = Object.keys(record).filter((key) => /^zdj\d+$/.test(key) || /^zdj_opis\d+$/.test(key));
  keys.sort((a, b) => {
    const ao = a.startsWith("zdj_opis") ? 1 : 0;
    const bo = b.startsWith("zdj_opis") ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0);
  });
  for (const key of keys) {
    const url = httpUrl(record[key]);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function recordFrom(headers, cells) {
  const record = {};
  headers.forEach((header, index) => {
    const key = String(header || "").trim();
    if (key) record[key] = cells[index] == null ? "" : String(cells[index]);
  });
  return record;
}

export function rowsFromSharklyCsv(text) {
  const table = parseSemicolonCsv(text);
  if (!table.length) return { ok: false, error: "Pusty plik.", rows: [] };
  const headers = table[0].map((cell) => String(cell || "").trim());
  if (!isSharklyExport(headers)) return { ok: false, error: "To nie jest CSV eksportu Sharkly (brak kolumn tytul i cena).", rows: [] };
  const rows = [];
  for (const cells of table.slice(1)) {
    const record = recordFrom(headers, cells);
    const title = String(record.tytul || "").replace(/\s+/g, " ").trim();
    if (!title && !String(record.ean || "").trim()) continue;
    const price = parseMoney(record.cena);
    const sections = [];
    for (let i = 1; i <= 20; i++) {
      if (!(`opis${i}` in record)) continue;
      const part = splitOpis(record[`opis${i}`]);
      if (part) sections.push(part);
    }
    const params = [];
    for (const [key, value] of Object.entries(record)) {
      if (!key.toLowerCase().startsWith("param:")) continue;
      const name = key.slice(key.indexOf(":") + 1).trim();
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (name && text) params.push({ name: name.slice(0, 80), value: text.slice(0, 200) });
    }
    rows.push({
      sku: String(record.nr_sharkly || "").trim().slice(0, 64),
      ean: String(record.ean || "").replace(/\s/g, "").slice(0, 32),
      title: title.slice(0, 300),
      price,
      source_price: parseMoney(record.cena_zrodlowa),
      producer: String(record.producent || "").trim().slice(0, 160),
      producer_draft: String(record.producent_szkicu || "").trim().slice(0, 200),
      category_id: String(record.kategoria_id || "").trim().slice(0, 40),
      category: String(record.kategoria || "").trim().slice(0, 300),
      allegro_product_id: String(record.allegro_product_id || "").trim().slice(0, 80),
      offer_id: String(record.oferta_id || "").trim().slice(0, 40),
      source_link: httpUrl(record.link_zrodlowy),
      status_label: String(record.status || "").trim().slice(0, 80),
      gaps: String(record.braki || "").trim().slice(0, 200),
      sections,
      params,
      images: uniqueImages(record),
      price_2: firstMoney(record, ["cena_2", "cena2", "zestaw_2", "cena_2szt"]),
      price_3: firstMoney(record, ["cena_3", "cena3", "zestaw_3", "cena_3szt"])
    });
  }
  return { ok: true, rows };
}

function firstMoney(record, keys) {
  const lowered = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    if (key in lowered) return parseMoney(lowered[key]);
  }
  return null;
}

function leafCategory(category) {
  const parts = String(category || "").split(">").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || "";
}

export function productFromSharkly(row) {
  const brand = row.params.find((p) => p.name.toLowerCase() === "marka")?.value || row.producer;
  const producer = row.params.find((p) => p.name.toLowerCase() === "producent")?.value || row.producer;
  const description = row.sections.map((section) => [section.title, section.text].filter(Boolean).join("\n")).join("\n\n");
  return {
    sku: row.sku,
    ean: row.ean,
    name: row.title || row.sku || "Produkt",
    catalog_name: row.title || row.sku || "Produkt",
    brand: brand.slice(0, 120),
    producer: producer.slice(0, 160),
    category_id: row.category_id,
    category: row.category,
    price: row.price,
    currency: "PLN",
    images: row.images.map((url) => ({ url, alt: row.title })),
    description: description.slice(0, 8000),
    description_sections: row.sections.map((section) => ({ type: "text", text: [section.title, section.text].filter(Boolean).join("\n") })),
    params: row.params,
    source_link: row.source_link,
    allegro_product_id: row.allegro_product_id,
    status: row.price == null ? "flagged" : "active",
    raw: {
      sharkly: true,
      cena_zrodlowa: row.source_price,
      cena_2: row.price_2,
      cena_3: row.price_3,
      oferta_id: row.offer_id,
      producent_szkicu: row.producer_draft,
      status: row.status_label,
      braki: row.gaps
    }
  };
}

/** Karta Konwersja z faktów wiersza. Zestaw 2 i 3 tylko, gdy w pliku jest ich cena. */
export function pageFromSharkly(row, { rights = false } = {}) {
  const brand = row.params.find((p) => p.name.toLowerCase() === "marka")?.value || row.producer;
  const length = row.params.find((p) => /długo|dlugo/i.test(p.name))?.value || "";
  const leadBits = ["Szczotka i skrobaczka 2 w 1"];
  if (length) leadBits.push(`długość ${length.replace(/\s+/g, " ")}`);
  const subheadline = leadBits.join(", ").slice(0, 80);
  const benefits = row.sections.slice(0, 3).map((section) => ({
    title: section.title,
    text: section.text,
    icon: iconFor(section.title)
  }));
  const features = row.sections.slice(3).map((section) => ({ title: section.title, text: section.text }));
  const bundles = packBundles(row.price, row.price_2, row.price_3);
  return cleanSiteData({
    template: "konwersja",
    brand,
    kicker: leafCategory(row.category),
    headline: row.title,
    subheadline,
    price: row.price,
    bundles,
    default_bundle: bundles.length >= 2 ? 1 : 0,
    images: row.images.map((url) => ({ url, alt: row.title, rights: rights === true })),
    benefits,
    benefits_title: "Z opisu i parametrów",
    features,
    specs: row.params,
    sections: {
      sale: false,
      gallery: true,
      bundles: true,
      benefits: true,
      urgency: false,
      trust: false,
      ugc: false,
      reviews: false,
      compare: false,
      features: true,
      faq: false,
      sticky: true
    },
    sale: { enabled: false },
    urgency: { show_stock: false, show_timer: false },
    stock: null,
    reviews: [],
    ugc: [],
    compare: [],
    gpsr: { producer: brand },
    source: {
      link: row.source_link,
      title: row.title,
      price: row.price,
      description: row.sections.map((section) => section.text).join("\n\n").slice(0, 8000),
      images: row.images,
      params: row.params.map((param) => ({ k: param.name, v: param.value })),
      producer: row.producer
    },
    generated: { tier: "s1_max", model: "csv" }
  });
}
