import test from "node:test";
import assert from "node:assert/strict";
import { crawlShop } from "../extension/shop-scan.mjs";
import {
  discoverLinks, extractProduct, exportImages, imageFileName, moneyText, rewriteImageUrl
} from "../extension/shop-extract.mjs";
import { hostedLink, productsToCsv, productsToJson, toOfferItems } from "../extension/shop-export.mjs";

const JSON_LD = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Kubek termiczny","sku":"KUB-1","gtin13":"5901234567890","brand":{"@type":"Brand","name":"ACME"},
"image":["https://cdn.aurasnu.pl/kubek.jpg"],
"description":"<p>Stalowy kubek</p>",
"offers":{"@type":"Offer","price":"79.00","priceCurrency":"PLN","availability":"https://schema.org/InStock","highPrice":"99.00"}}
</script>
</head><body><h1>Inny tytuł</h1></body></html>`;

test("JSON-LD ma pierwszeństwo i nie zgaduje braku", () => {
  const product = extractProduct(JSON_LD, "https://aurasnu.pl/produkt/kubek");
  assert.equal(product.name, "Kubek termiczny");
  assert.equal(product.sku, "KUB-1");
  assert.equal(product.ean, "5901234567890");
  assert.equal(product.brand, "ACME");
  assert.equal(product.price, "79.00");
  assert.equal(product.old_price, "99.00");
  assert.equal(product.currency, "PLN");
  assert.equal(product.availability, "InStock");
  assert.deepEqual(product.images, ["https://cdn.aurasnu.pl/kubek.jpg"]);
  assert.match(product.description_text, /Stalowy kubek/);
  const empty = extractProduct("<html><body><p>Regulamin sklepu 12 zł</p></body></html>", "https://aurasnu.pl/regulamin");
  assert.equal(empty.name, "");
  assert.equal(empty.price, "");
  assert.equal(empty.sku, "");
  assert.equal(moneyText("gratis"), "");
});

test("WooCommerce: cena, stara cena, SKU, galeria", () => {
  const html = `<div class="product"><h1 class="product_title">Koszulka</h1><span class="sku">KOS-2</span>
  <p class="price"><del><span class="woocommerce-Price-amount">129,00</span></del><ins><span class="woocommerce-Price-amount">99,00</span></ins></p>
  <img class="wp-post-image" data-large_image="https://aurasnu.pl/wp-content/koszulka.png" src="https://aurasnu.pl/wp-content/koszulka-100.png">
  </div>`;
  const product = extractProduct(html, "https://aurasnu.pl/product/koszulka");
  assert.equal(product.name, "Koszulka");
  assert.equal(product.sku, "KOS-2");
  assert.equal(product.price, "99.00");
  assert.equal(product.old_price, "129.00");
  assert.equal(product.images[0], "https://aurasnu.pl/wp-content/koszulka.png");
});

test("linki produktów zostają na tej samej domenie", () => {
  const html = `<a href="/product/kubek">Kubek</a><a href="https://inny.pl/product/obcy">Obcy</a><a href="/kategoria/kuchnia?page=2">2</a><link rel="next" href="/page/2">`;
  const found = discoverLinks(html, "https://aurasnu.pl/kategoria/kuchnia");
  assert.deepEqual(found.products, ["https://aurasnu.pl/product/kubek"]);
  assert.ok(found.listings.includes("https://aurasnu.pl/kategoria/kuchnia?page=2"));
  assert.ok(found.listings.includes("https://aurasnu.pl/page/2"));
});

test("adres zdjęcia przepisuje się tylko gdy jest domena, marka i SKU", () => {
  const src = "https://cdn.aurasnu.pl/a/kubek.webp";
  assert.equal(rewriteImageUrl(src, { domain: "mojadomena.pl", brand: "ACME", sku: "KUB-1" }), "https://mojadomena.pl/produkty/acme/kub-1.webp");
  assert.equal(rewriteImageUrl(src, { domain: "mojadomena.pl", brand: "", sku: "KUB-1" }), src);
  assert.equal(rewriteImageUrl(src, { domain: "", brand: "ACME", sku: "KUB-1" }), src);
  const product = extractProduct(JSON_LD, "https://aurasnu.pl/produkt/kubek");
  assert.equal(exportImages(product, "mojadomena.pl")[0], "https://mojadomena.pl/produkty/acme/kub-1.jpg");
  assert.equal(imageFileName(product, 0, product.images[0]), "acme/kub-1-1.jpg");
});

test("CSV i wysyłka do NHP nie wstawiają ceny, której nie było", () => {
  const product = { name: "Kubek", sku: "KUB-1", ean: "", brand: "ACME", price: "", old_price: "", currency: "", availability: "", category: "", description_text: "Opis", description_html: "", parameters: [{ name: "Kolor", value: "Biały" }], images: ["https://cdn.example/a.jpg"], url: "https://aurasnu.pl/product/kubek" };
  const csv = productsToCsv([product], "");
  assert.match(csv, /Kubek/);
  assert.equal(csv.includes("79"), false);
  const item = toOfferItems([product], "mojadomena.pl")[0];
  assert.equal(item.price, "");
  assert.equal(item.catalog_name, "Kubek");
  assert.equal(item.images[0], "https://mojadomena.pl/produkty/acme/kub-1.jpg");
  const json = JSON.parse(productsToJson([product], ""));
  assert.equal(json[0].price, "");
});

test("wgrane zdjęcie idzie do Storage albo na /img/ naszej domeny", () => {
  const product = {
    name: "Kubek", sku: "KUB-1", brand: "ACME", price: "10", images: ["https://cdn.example/a.jpg"],
    hosted: [{ source: "https://cdn.example/a.jpg", url: "https://proj.supabase.co/storage/v1/object/public/media/products/acme/kub-1-1.jpg", path: "products/acme/kub-1-1.jpg" }],
    parameters: [], url: "https://aurasnu.pl/product/kubek"
  };
  assert.equal(hostedLink(product.hosted[0], ""), product.hosted[0].url);
  assert.equal(hostedLink(product.hosted[0], "panel.nowoczesnyhandelpolski.pl"), "https://panel.nowoczesnyhandelpolski.pl/img/products/acme/kub-1-1.jpg");
  const item = toOfferItems([product], "panel.nowoczesnyhandelpolski.pl")[0];
  assert.equal(item.images[0], "https://panel.nowoczesnyhandelpolski.pl/img/products/acme/kub-1-1.jpg");
  const plain = toOfferItems([product], "")[0];
  assert.match(plain.images[0], /\/storage\/v1\/object\/public\/media\/products\/acme\/kub-1-1\.jpg$/);
});

test("skan idzie po stronach tej samej domeny i respektuje limit", async () => {
  const pages = {
    "https://aurasnu.pl/": `<a href="/product/kubek">Kubek</a><a href="https://inny.pl/product/x">X</a>`,
    "https://aurasnu.pl/product/kubek": `<script type="application/ld+json">{"@type":"Product","name":"Kubek","sku":"K1","offers":{"price":"10","priceCurrency":"PLN"}}</script>`
  };
  const result = await crawlShop({
    startUrl: "https://aurasnu.pl/",
    maxPages: 50,
    maxProducts: 1,
    fetchText: async (url) => pages[url] || ""
  });
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].name, "Kubek");
  assert.equal(result.products[0].price, "10");
  assert.equal(result.pages <= 2, true);
});
