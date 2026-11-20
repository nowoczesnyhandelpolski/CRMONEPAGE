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
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\uFE0F\u200D]/gu, " ")
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

function numberedUrls(record, pattern) {
  return Object.keys(record)
    .filter((key) => pattern.test(key))
    .sort((a, b) => (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0))
    .map((key) => ({ n: parseInt(key.replace(/\D/g, ""), 10) || 0, url: httpUrl(record[key]) }))
    .filter((item) => item.url);
}

function uniqueImages(record) {
  const urls = [];
  for (const item of numberedUrls(record, /^zdj\d+$/).concat(numberedUrls(record, /^zdj_opis\d+$/))) {
    if (!urls.includes(item.url)) urls.push(item.url);
  }
  return urls;
}

function oneLine(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max + 1);
  const dot = slice.lastIndexOf(". ");
  if (dot >= 24) return slice.slice(0, dot + 1).trim();
  const space = slice.lastIndexOf(" ");
  return (space >= 24 ? slice.slice(0, space) : clean.slice(0, max)).trim();
}

function shortBenefit(section) {
  const parts = section.title.split(/\s+[–—-]\s+/).map((part) => part.trim()).filter(Boolean);
  const title = oneLine(parts[0] || section.title, 46);
  const tail = parts.slice(1).join(" ").trim();
  const text = oneLine(tail || section.text, 78);
  return {
    title,
    text: text ? text.charAt(0).toUpperCase() + text.slice(1) : "",
    icon: iconFor(section.title)
  };
}

function factBlob(row) {
  return `${row.title} ${row.category} ${row.sections.map((section) => `${section.title} ${section.text}`).join(" ")}`;
}

function seasonalBanner(row) {
  const blob = factBlob(row).toLowerCase();
  if (!/skrobaczk|szczotk/.test(blob) || !/zim|śnieg|snieg|lód|lod |szron/.test(blob)) return { enabled: false, label: "", text: "" };
  return { enabled: true, label: "Sezon zimowy", text: "Na śnieg, lód i szron." };
}

function comparisonFromFacts(row) {
  const blob = factBlob(row);
  const rows = [];
  if (/szczotk/i.test(row.title) && /skrobaczk/i.test(row.title)) {
    rows.push({ feature: "W zestawie", ours: "Szczotka i skrobaczka", others: "Sama skrobaczka" });
  }
  const length = row.params.find((param) => /długo|dlugo/i.test(param.name));
  if (length) rows.push({ feature: "Długość", ours: length.value.replace(".", ","), others: "—" });
  if (/klik-lock/i.test(blob)) rows.push({ feature: "Montaż", ours: "Klik-lock, dwa elementy", others: "—" });
  if (/nie rysuj/i.test(blob)) rows.push({ feature: "Lakier i szyby", ours: "Miękkie włosie, nie rysuje", others: "—" });
  if (/tanich szczotek/i.test(blob)) rows.push({ feature: "Włosie na mrozie", ours: "Zostaje elastyczne", others: "Tania szczotka sztywnieje" });
  return rows;
}

function faqFromFacts(row) {
  const blob = factBlob(row);
  const items = [];
  const length = row.params.find((param) => /długo|dlugo/i.test(param.name));
  if (length) {
    const width = blob.match(/Szerokość szczotki:\s*ok\.\s*[\d,.]+\s*cm/i);
    const scraper = blob.match(/Skrobaczka szerokość:\s*ok\.\s*[\d,.]+\s*cm/i);
    const extra = [width && width[0].replace(/\s+/g, " "), scraper && scraper[0].replace(/\s+/g, " ")].filter(Boolean);
    items.push({ q: "Jaka jest długość?", a: `Całkowita długość to ${length.value.replace(".", ",")}.${extra.length ? ` ${extra.join(". ")}.` : ""}` });
  }
  if (/nie rysuj/i.test(blob)) items.push({ q: "Czy rysuje lakier albo szybę?", a: "Nie. Miękkie włosie PC usuwa śnieg i nie rysuje lakieru ani szyb." });
  if (/klik-lock/i.test(blob)) items.push({ q: "Czy szczotkę i skrobaczkę da się rozdzielić?", a: "Tak. Klik-lock łączy je i rozdziela w kilka sekund, bez użycia siły." });
  if (/osobowych/i.test(blob) && /SUV/i.test(blob)) items.push({ q: "Do jakich aut pasuje?", a: "Do samochodów osobowych i SUV-ów. Opis podaje też namiot, taras, schody i altanę." });
  if (/-40/.test(blob)) items.push({ q: "Jak trzyma się na mrozie?", a: "Uchwyt z pianki EVA nie ślizga się i nie sztywnieje. Opis podaje pracę nawet przy -40°C." });
  return items.slice(0, 6);
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
    const opisImages = new Map(numberedUrls(record, /^zdj_opis\d+$/).map((item) => [item.n, item.url]));
    const gallery = [];
    for (const item of numberedUrls(record, /^zdj\d+$/)) {
      if (!gallery.includes(item.url)) gallery.push(item.url);
    }
    const sections = [];
    for (let i = 1; i <= 20; i++) {
      if (!(`opis${i}` in record)) continue;
      const part = splitOpis(record[`opis${i}`]);
      if (!part) continue;
      sections.push({ ...part, image: opisImages.get(i) || "" });
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
      gallery,
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
  const benefits = row.sections.slice(0, 3).map(shortBenefit);
  const gallery = (row.gallery && row.gallery.length ? row.gallery : row.images).slice(0, 6);
  const features = row.sections.map((section) => ({ title: section.title, text: section.text, image: section.image || "" }));
  const bundles = packBundles(row.price, row.price_2, row.price_3);
  const sale = seasonalBanner(row);
  const compare = comparisonFromFacts(row);
  return cleanSiteData({
    template: "konwersja",
    brand,
    kicker: leafCategory(row.category),
    headline: row.title,
    subheadline,
    price: row.price,
    bundles,
    default_bundle: bundles.length >= 2 ? 1 : 0,
    images: gallery.map((url) => ({ url, alt: row.title, rights: rights === true })),
    benefits,
    benefits_title: "Jak to działa",
    features,
    specs: row.params,
    section_order: ["sale", "gallery", "benefits", "bundles", "urgency", "trust", "features", "compare", "faq", "ugc", "reviews", "sticky"],
    sections: {
      sale: sale.enabled,
      gallery: true,
      bundles: true,
      benefits: true,
      urgency: false,
      trust: true,
      ugc: false,
      reviews: false,
      compare: compare.length > 0,
      features: true,
      faq: true,
      sticky: true
    },
    sale,
    trust_title: "Zakupy",
    trust_names: ["Wysyłka", "14 dni na zwrot", "BLIK", "Karta"],
    compare_ours: brand || "Ten zestaw",
    compare_others: "Zwykła skrobaczka",
    compare,
    faq: faqFromFacts(row),
    problem: { title: "Pytania przed zakupem", text: "Odpowiedzi są z opisu i parametrów tego produktu." },
    urgency: { show_stock: false, show_timer: false },
    stock: null,
    reviews: [],
    ugc: [],
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
