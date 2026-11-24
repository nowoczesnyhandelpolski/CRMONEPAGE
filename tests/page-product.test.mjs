import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractProduct } from "../extension/shop-extract.mjs";
import { analyzePage, missingFields, productToPayload } from "../extension/page-product.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, "fixtures", name), "utf8");

test("JSON-LD: nazwa, opis w sekcjach, pełne zdjęcia, warianty, EAN i cena", () => {
  const html = read("product-jsonld.html");
  const page = analyzePage(html, "https://sklep.test/zegarek-gw-9500-1er");
  assert.equal(page.kind, "product");
  const product = page.product;
  assert.equal(product.name, "Casio G-Shock GW-9500-1ER");
  assert.equal(product.sku, "GW-9500-1ER");
  assert.equal(product.ean, "4549526294374");
  assert.equal(product.brand, "Casio");
  assert.equal(product.price, "1299.00");
  assert.equal(product.old_price, "1499.00");
  assert.equal(product.currency, "PLN");
  assert.equal(product.category, "Zegarki / Casio / G-Shock");
  assert.match(product.description_text, /Wytrzymały zegarek taktyczny/);
  assert.ok(product.description_sections.some((s) => s.type === "text" && /Opis/.test(s.text) && /falami radiowymi/.test(s.text)));
  assert.ok(product.description_sections.some((s) => /W zestawie/.test(s.text)));
  assert.deepEqual(product.images, [
    "https://cdn.sklep.test/zegarki/gw-9500-1.jpg",
    "https://cdn.sklep.test/zegarki/gw-9500-2.jpg"
  ]);
  assert.equal(product.parameters.find((p) => p.name === "Mechanizm")?.value, "Solar");
  assert.equal(product.variants.length, 2);
  assert.equal(product.variants[1].value, "Czerwony");
  assert.equal(product.variants[1].price, "1349.00");
  assert.equal(product.variants[1].ean, "4549526294381");
  const payload = productToPayload(product, "Zegarki");
  assert.equal(payload.product_group, "Zegarki");
  assert.equal(payload.producer, "Casio");
  assert.ok(payload.parameters.some((p) => p.name === "Kolor" && /Czerwony/.test(p.value) && /4549526294381/.test(p.value)));
  assert.equal(payload.source_link, "https://sklep.test/zegarek-gw-9500-1er");
});

test("WooCommerce: cena, stara cena, galeria w pełnej rozdzielczości, warianty", () => {
  const product = extractProduct(read("product-woo.html"), "https://sklep.test/product/koszulka");
  const page = analyzePage(read("product-woo.html"), "https://sklep.test/product/koszulka");
  assert.equal(page.kind, "product");
  assert.equal(product.name, "Koszulka bawełniana");
  assert.equal(product.sku, "KOS-2");
  assert.equal(product.ean, "5901234123457");
  assert.equal(product.price, "99.00");
  assert.equal(product.old_price, "129.00");
  assert.equal(product.currency, "PLN");
  assert.match(product.category, /Koszulki/);
  assert.ok(product.images.includes("https://sklep.test/wp-content/koszulka.png"));
  assert.ok(product.images.includes("https://sklep.test/wp-content/koszulka-tyl.png"));
  assert.equal(product.images.some((url) => /100|300x300/.test(url)), false);
  assert.match(product.description_text, /Miękka koszulka/);
  assert.equal(product.parameters.find((p) => p.name === "Kolor")?.value, "Granat");
  assert.equal(product.variants.length, 2);
  assert.equal(product.variants[0].sku, "KOS-2-G");
  assert.equal(product.variants[0].price, "99");
  assert.equal(product.variants[1].value, "biel");
});

test("Shoper: opis, EAN, zdjęcia z linku powiększenia, producent i cena", () => {
  const html = read("product-shoper.html");
  const page = analyzePage(html, "https://sklep.test/pl/p/casio-g-shock/1");
  assert.equal(page.kind, "product");
  const product = page.product;
  assert.equal(product.name, "Casio G-Shock GW-9500-1ER");
  assert.equal(product.sku, "GW-9500-1ER");
  assert.equal(product.ean, "4549526294374");
  assert.equal(product.brand, "Casio");
  assert.equal(product.price, "1299.00");
  assert.equal(product.old_price, "1499.00");
  assert.equal(product.currency, "PLN");
  assert.ok(product.images.includes("https://sklep.test/userdata/gfx/gw-full-1.jpg"));
  assert.ok(product.images.includes("https://sklep.test/userdata/gfx/gw-full-2.jpg"));
  assert.equal(product.images.some((url) => /100|thumb/.test(url)), false);
  assert.match(product.description_text, /podświetleniem/);
  assert.ok(product.description_sections.some((s) => /Dane/.test(s.text) && /200 m/.test(s.text)));
  assert.equal(product.parameters.find((p) => p.name === "Szkło")?.value, "Mineralne");
});

test("brak danych strukturalnych: heurystyka i puste pola bez zgadywania", () => {
  const html = read("product-plain.html");
  const page = analyzePage(html, "https://sklep.test/zegarek-gw-9500-1er");
  assert.equal(page.kind, "product");
  const product = page.product;
  assert.equal(product.name, "Casio G-Shock GW-9500-1ER");
  assert.equal(product.sku, "GW-9500-1ER");
  assert.equal(product.ean, "4549526294374");
  assert.equal(product.brand, "");
  assert.equal(product.price, "1299.00");
  assert.equal(product.old_price, "1499.00");
  assert.ok(product.images.includes("https://sklep.test/img/gw-full-1.jpg"));
  assert.ok(product.images.includes("https://sklep.test/img/gw-full-2.jpg"));
  assert.match(product.description_text, /każdą pogodę/);
  assert.equal(product.parameters.find((p) => p.name === "Mechanizm")?.value, "Solar");
  assert.ok(page.missing.includes("producent"));
  assert.equal(page.missing.includes("cena"), false);
  const empty = analyzePage("<html><body><p>Regulamin sklepu 12 zł</p></body></html>", "https://sklep.test/regulamin");
  assert.equal(empty.kind, "other");
  assert.equal(empty.product.name, "");
  assert.equal(empty.product.price, "");
  assert.deepEqual(missingFields(empty.product).includes("nazwa"), true);
});
