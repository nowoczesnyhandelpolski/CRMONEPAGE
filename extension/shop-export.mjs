import { exportImages, imageFileName } from "./shop-extract.mjs";
import { zipStore } from "./zip-store.mjs";

export const EXPORT_COLUMNS = [
  "name", "sku", "ean", "brand", "price", "old_price", "currency", "availability",
  "category", "description_text", "parameters", "images", "url"
];

function cell(value) {
  if (Array.isArray(value)) return value.map((v) => (v && v.name ? `${v.name}: ${v.value}` : String(v ?? ""))).join(" | ");
  return value == null ? "" : String(value);
}

export function exportRow(product, imageDomain) {
  const images = exportImages(product, imageDomain);
  return {
    name: product.name || "",
    sku: product.sku || "",
    ean: product.ean || "",
    brand: product.brand || "",
    price: product.price || "",
    old_price: product.old_price || "",
    currency: product.currency || "",
    availability: product.availability || "",
    category: product.category || "",
    description_text: product.description_text || "",
    parameters: product.parameters || [],
    images,
    url: product.url || ""
  };
}

function csvCell(value, sep) {
  let s = cell(value);
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes(sep) || /[\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function productsToCsv(products, imageDomain) {
  const sep = ";";
  const rows = [EXPORT_COLUMNS.map((c) => csvCell(c, sep)).join(sep)];
  for (const product of products) {
    const row = exportRow(product, imageDomain);
    rows.push(EXPORT_COLUMNS.map((c) => csvCell(c === "images" ? row.images.join(" | ") : row[c], sep)).join(sep));
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function productsToJson(products, imageDomain) {
  return JSON.stringify(products.map((p) => exportRow(p, imageDomain)), null, 2);
}

function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function colName(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function productsToXlsx(products, imageDomain) {
  const header = EXPORT_COLUMNS;
  const data = products.map((p) => {
    const row = exportRow(p, imageDomain);
    return header.map((c) => (c === "images" ? row.images.join(" | ") : cell(row[c])));
  });
  const rows = [header, ...data];
  const sheetRows = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${colName(c)}${r + 1}`;
      if (value === "") return `<c r="${ref}"/>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Produkty" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>` },
    { name: "xl/worksheets/sheet1.xml", data: sheet }
  ];
  return zipStore(files);
}

export function fullExportZip(products, imageDomain, imageFiles = []) {
  const files = [
    { name: "produkty.csv", data: productsToCsv(products, imageDomain) },
    { name: "produkty.json", data: productsToJson(products, imageDomain) },
    { name: "produkty.xlsx", data: productsToXlsx(products, imageDomain) }
  ];
  for (const file of imageFiles) {
    if (file?.name && file.data) files.push({ name: `images/${file.name}`, data: file.data });
  }
  return zipStore(files);
}

export function toOfferItems(products, imageDomain) {
  return products.map((p) => {
    const images = exportImages(p, imageDomain);
    return {
      catalog_name: p.name || "",
      sku: p.sku || "",
      ean: p.ean || "",
      producer: p.brand || "",
      price: p.price || "",
      price_before_promo: p.old_price || "",
      category: p.category || "",
      parameters: p.parameters || [],
      images,
      description: p.description_text || "",
      description_sections: p.description_text ? [{ type: "text", text: p.description_text }] : [],
      source_link: p.url || ""
    };
  });
}

export { imageFileName };
