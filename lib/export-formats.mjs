// Dwa różne CSV, tak jak w Sharkly: średnik = staging z importu, przecinek = katalog.
// Pozycje bez ceny są pomijane. Ceny nie są uzupełniane.

function xmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function csvCell(value, sep) {
  let s = value == null ? "" : String(value);
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes(sep) || /[\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csv(rows, sep) {
  const lines = rows.map((row) => row.map((cell) => csvCell(cell, sep)).join(sep));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function money(n) {
  if (n == null || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return v.toFixed(2);
}

function hasPrice(row) {
  return row?.price != null && row.price !== "" && Number.isFinite(Number(row.price));
}

export function stagingCsv(items = []) {
  const usable = [];
  let skipped = 0;
  for (const raw of items) {
    const row = raw?.item || raw;
    if (!hasPrice(row)) { skipped++; continue; }
    usable.push(row);
  }
  const maxSections = Math.min(12, usable.reduce((m, r) => Math.max(m, (r.description_sections || []).filter((s) => s.type === "text").length), 0));
  const maxImg = Math.min(8, usable.reduce((m, r) => Math.max(m, (r.images || []).length), 0));
  const head = ["ean", "tytul", "nazwa_katalogowa", "cena", "cena_przed_promocja", "dostawa", "cena_bazowa", "czas_wysylki", "producent", "kategoria_id", "kategoria", "allegro_product_id", "oferta_id", "status", "link_zrodlowy", "braki"];
  for (let i = 1; i <= maxSections; i++) head.push(`opis${i}`);
  for (let i = 1; i <= maxImg; i++) head.push(`zdj${i}`);
  const lines = [head];
  for (const row of usable) {
    const texts = (row.description_sections || []).filter((s) => s.type === "text").map((s) => s.text);
    const line = [
      row.ean || "",
      row.sales_title || row.catalog_name || "",
      row.catalog_name || "",
      money(row.price),
      money(row.price_before_promo),
      row.delivery_cost == null ? "" : money(row.delivery_cost),
      row.base_price == null ? "" : money(row.base_price),
      row.shipping_time || "",
      row.producer || "",
      row.category_id || "",
      row.category || "",
      row.allegro_product_id || "",
      row.source_offer_id || "",
      row.status || "",
      row.source_link || "",
      (row.missing || []).join("|")
    ];
    for (let i = 0; i < maxSections; i++) line.push(texts[i] || "");
    for (let i = 0; i < maxImg; i++) line.push((row.images || [])[i] || "");
    lines.push(line);
  }
  return { body: csv(lines, ";"), skipped, count: usable.length, delimiter: ";" };
}

export function catalogCsv(products = []) {
  let skipped = 0;
  const lines = [["sku", "ean", "name", "catalog_name", "brand", "producer", "category_id", "category", "price", "currency", "stock", "allegro_product_id", "image", "description", "link"]];
  for (const row of products) {
    if (!hasPrice(row)) { skipped++; continue; }
    const images = Array.isArray(row.images) ? row.images : [];
    const first = typeof images[0] === "string" ? images[0] : images[0]?.url || "";
    lines.push([
      row.sku || "",
      row.ean || "",
      row.name || "",
      row.catalog_name || "",
      row.brand || "",
      row.producer || "",
      row.category_id || "",
      row.category || "",
      money(row.price),
      row.currency || "PLN",
      row.stock == null ? "" : String(row.stock),
      row.allegro_product_id || "",
      first,
      row.description || "",
      row.source_link || ""
    ]);
  }
  return { body: csv(lines, ","), skipped, count: lines.length - 1, delimiter: "," };
}

export function productsXml(products = []) {
  let skipped = 0;
  const parts = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>", "<offers>"];
  for (const row of products) {
    if (!hasPrice(row)) { skipped++; continue; }
    const images = (Array.isArray(row.images) ? row.images : []).map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean);
    parts.push("  <offer>");
    parts.push(`    <sku>${xmlEscape(row.sku || row.ean || row.id || "")}</sku>`);
    parts.push(`    <name>${xmlEscape(row.name || row.catalog_name || "")}</name>`);
    parts.push(`    <ean>${xmlEscape(row.ean || "")}</ean>`);
    parts.push(`    <price>${money(row.price)}</price>`);
    parts.push(`    <currency>${xmlEscape(row.currency || "PLN")}</currency>`);
    parts.push(`    <category>${xmlEscape(row.category || "")}</category>`);
    parts.push(`    <producer>${xmlEscape(row.producer || "")}</producer>`);
    parts.push(`    <description>${xmlEscape(row.description || "")}</description>`);
    parts.push(`    <url>${xmlEscape(row.source_link || "")}</url>`);
    if (images.length) {
      parts.push("    <images>");
      for (const url of images.slice(0, 16)) parts.push(`      <image>${xmlEscape(url)}</image>`);
      parts.push("    </images>");
    }
    parts.push("  </offer>");
  }
  parts.push("</offers>");
  return { body: parts.join("\n"), skipped, count: products.length - skipped };
}

export function ceneoXml(products = []) {
  let skipped = 0;
  const parts = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>", "<offers xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" version=\"1\">"];
  for (const row of products) {
    if (!hasPrice(row)) { skipped++; continue; }
    const images = (Array.isArray(row.images) ? row.images : []).map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean);
    const id = xmlEscape(row.sku || row.ean || row.id || "");
    const url = xmlEscape(row.source_link || "");
    const stock = Number(row.stock);
    const avail = Number.isFinite(stock) && stock <= 0 ? "0" : "1";
    parts.push(`  <o id="${id}" url="${url}" price="${money(row.price)}" avail="${avail}">`);
    parts.push(`    <name>${xmlEscape(row.name || row.catalog_name || "")}</name>`);
    parts.push(`    <cat>${xmlEscape(row.category || "")}</cat>`);
    parts.push(`    <desc><![CDATA[${String(row.description || "").replace(/]]>/g, "]]]]><![CDATA[>")}]]></desc>`);
    if (images.length) {
      parts.push("    <imgs>");
      parts.push(`      <main url="${xmlEscape(images[0])}"/>`);
      for (const img of images.slice(1, 16)) parts.push(`      <i url="${xmlEscape(img)}"/>`);
      parts.push("    </imgs>");
    }
    if (row.ean) parts.push(`    <attrs><a name="EAN"><![CDATA[${String(row.ean).replace(/]]>/g, "")}]]></a></attrs>`);
    parts.push("  </o>");
  }
  parts.push("</offers>");
  return { body: parts.join("\n"), skipped, count: products.length - skipped };
}
