import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { basePrice, handlingTimeIso, parseDelivery, salePrice } from "../lib/pricing.mjs";
import { normalizeOfferItem } from "../lib/offer-normalizer.mjs";
import { catalogCsv, ceneoXml, productsXml, stagingCsv } from "../lib/export-formats.mjs";
import { routeConflicts } from "../lib/routes.mjs";
import { tierById, TIERS } from "../lib/tiers.mjs";
import { renderTierPicker } from "../lib/tier-ui.mjs";
import { draftFromSource } from "../lib/page-draft.mjs";
import { productOfferDraft, publishPatch } from "../lib/allegro-offer.mjs";
import { copyPrompt } from "../lib/copy-prompt.mjs";
import { buildStoryboard, omnibusLine } from "../lib/video-storyboard.mjs";
import { muxAvcMp4 } from "../lib/mp4-mux.mjs";
import { sha256Hex } from "../lib/supabase-rest.mjs";
import { extractFromJsonLd, mergeExtract, offerIdFromUrl } from "../extension/extract.mjs";
import { renderLightPage } from "../lib/render.mjs";

test("cena bazowa to produkt plus dostawa, a brak ceny nie jest zgadywany", () => {
  assert.deepEqual(basePrice({ price: "109,90", shipping: "12,50" }), { ok: true, error: null, price: 109.9, shipping: 12.5, base: 122.4 });
  assert.equal(basePrice({ price: 100, shipping: "darmowa" }).base, 100);
  assert.equal(parseDelivery("gratis"), 0);
  assert.equal(basePrice({ price: "", shipping: 0 }).ok, false);
  assert.equal(basePrice({ price: "", shipping: 0 }).error, "missing_price");
  assert.equal(basePrice({ price: 80, shipping: null }).error, "missing_shipping");
  assert.equal(basePrice({ price: 80, shipping: null }).base, null);
});

test("prowizja liczy cenę sprzedaży od ceny końcowej i nie ma stawki domyślnej", () => {
  const sale = salePrice({ base: 100, ratePct: 10 });
  assert.equal(sale.ok, true);
  assert.equal(sale.sale, 111.11);
  assert.equal(salePrice({ base: 100, ratePct: 0 }).sale, 100);
  assert.equal(salePrice({ base: 100 }).error, "missing_commission");
  assert.equal(salePrice({ base: null, ratePct: 10 }).error, "missing_price");
  assert.equal(salePrice({ base: 100, ratePct: 95 }).ok, false);
  assert.equal(handlingTimeIso("24 h"), "PT24H");
  assert.equal(handlingTimeIso("wysyłka szybko"), null);
});

test("normalizer zachowuje nazwę, rozdziela sekcje i oznacza brak ceny", () => {
  const row = normalizeOfferItem({
    catalog_name: "  Kubek  ",
    price: "",
    delivery_cost: "9,99",
    description_sections: [
      { type: "text", text: "<b>Ciepły</b>" },
      { type: "image", url: "https://cdn.example/a.jpg" }
    ],
    images: ["https://cdn.example/g.jpg", "javascript:alert(1)"],
    parameters: [{ name: "Kolor", value: "Biały" }]
  });
  assert.equal(row.flagged, true);
  assert.equal(row.item.catalog_name, "Kubek");
  assert.equal(row.item.price, null);
  assert.equal(row.item.base_price, null);
  assert.equal(row.item.description_sections[0].text, "Ciepły");
  assert.equal(row.item.description_sections[1].url, "https://cdn.example/a.jpg");
  assert.deepEqual(row.item.images, ["https://cdn.example/g.jpg"]);
  assert.ok(row.missing.includes("price"));
});

test("CSV i XML: średnik, przecinek, ochrona formuł, pominięcie braku ceny", () => {
  const staging = stagingCsv([
    { catalog_name: "Kubek", price: 10, ean: "5901234567890", description_sections: [{ type: "text", text: "=cmd" }] },
    { catalog_name: "Bez", price: null }
  ]);
  assert.equal(staging.delimiter, ";");
  assert.ok(staging.body.charCodeAt(0) === 0xfeff);
  assert.ok(staging.body.includes(";"));
  assert.ok(staging.body.includes("'=cmd"));
  assert.equal(staging.skipped, 1);
  const catalog = catalogCsv([{ sku: "K1", name: "Kubek", price: 10 }, { name: "Pusty" }]);
  assert.equal(catalog.delimiter, ",");
  assert.ok(catalog.body.split("\r\n")[0].includes(","));
  assert.equal(catalog.skipped, 1);
  const xml = productsXml([{ name: "Kubek <a>", price: 10, ean: "1" }, { name: "x" }]);
  assert.ok(xml.body.includes("<name>Kubek &lt;a&gt;</name>"));
  assert.equal(xml.skipped, 1);
  const ceneo = ceneoXml([{ sku: "K1", name: "Kubek", price: 10.5, source_link: "https://sklep.example/k", images: ["https://cdn.example/a.jpg"] }]);
  assert.ok(ceneo.body.includes('price="10.50"'));
  assert.ok(ceneo.body.includes("<main url="));
});

test("lista tras Pages nie nachodzi na siebie", () => {
  const routes = JSON.parse(fs.readFileSync(new URL("../_routes.json", import.meta.url), "utf8"));
  assert.deepEqual(routeConflicts(routes.include, routes.exclude), []);
  assert.ok(routeConflicts(["/p/*", "/p/sitemap.xml"], []).length);
  assert.ok(routeConflicts(["/api/*"], ["/api/nhp"]).length);
});

test("poziomy S1 i kafelki bez znaku Apple", () => {
  assert.equal(tierById("s1").images, 0);
  assert.equal(tierById("s1_pro").estimatePln, 0.6);
  assert.equal(tierById("s1_max").video, true);
  assert.equal(tierById("s1_max").estimatePln, 3);
  assert.equal(TIERS.length, 3);
  const html = renderTierPicker("s1_max");
  assert.match(html, /S1/);
  assert.match(html, /PRO/);
  assert.match(html, /MAX/);
  assert.match(html, /#ff5a00/);
  assert.equal(/apple/i.test(html), false);
});

test("szkic strony nie publikuje cudzych zdjęć i nie zgaduje omnibusa", () => {
  const draft = draftFromSource({
    catalog_name: "Kubek termiczny",
    price: null,
    price_before_promo: 149,
    images: ["https://a.allegroimg.com/k.jpg"],
    description_sections: [{ type: "text", text: "Opis źródłowy, którego nie wklejamy w lead." }],
    producer: "Firma X"
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.data.headline, "Kubek termiczny");
  assert.equal(draft.data.price, null);
  assert.equal(draft.data.omnibus_price, null);
  assert.equal(draft.data.compare_at, null);
  assert.equal(draft.data.images[0].rights, false);
  assert.equal(draft.data.source.title, "Kubek termiczny");
  assert.match(draft.data.source.description, /Opis źródłowy/);
  const own = draftFromSource({ catalog_name: "Kubek", price: 40, images: ["https://cdn.example/w.jpg"], delivery_cost: 0 }, { own: true });
  assert.equal(own.data.images[0].rights, true);
  assert.equal(own.data.shipping.free, true);
});

test("szkic Allegro jest nieaktywny i wymaga ceny, id produktu i czasu", () => {
  const body = productOfferDraft({ price: "119,00", allegro_product_id: "abc", handling_time: "PT48H", name: "Kubek", description_sections: [{ type: "text", text: "Fakt" }] });
  assert.equal(body.publication.status, "INACTIVE");
  assert.equal(body.sellingMode.price.amount, "119.00");
  assert.equal(body.productSet[0].product.id, "abc");
  assert.equal(body.delivery.handlingTime, "PT48H");
  assert.equal(publishPatch().publication.status, "ACTIVE");
  assert.throws(() => productOfferDraft({ price: null, allegro_product_id: "abc", handling_time: "PT24H" }), /ceny/);
  assert.throws(() => productOfferDraft({ price: 10, handling_time: "PT24H" }), /id produktu/);
  assert.throws(() => productOfferDraft({ price: 10, allegro_product_id: "abc", handling_time: "jutro" }), /czas/);
});

test("prompt nie każe wymyślać ceny", () => {
  const prompt = copyPrompt({ catalog_name: "Kubek", description_sections: [{ type: "text", text: "Stal." }] });
  assert.match(prompt, /Nie wymyślaj/);
  assert.match(prompt, /nie podawaj żadnej kwoty/);
});

test("scenariusz wideo: 15–30 s, bez muzyki, omnibus tylko gdy jest", () => {
  const board = buildStoryboard({ title: "Kubek", price: 100, seconds: 3, format: "1:1", music: false });
  assert.equal(board.seconds, 15);
  assert.equal(board.width, 720);
  assert.equal(board.height, 720);
  assert.equal(board.music, false);
  assert.equal(omnibusLine({ price: 100, omnibus: null }), "");
  assert.match(omnibusLine({ price: 100, omnibus: 90 }), /90,00 zł/);
  const tall = buildStoryboard({ title: "Kubek", price: 10, seconds: 99, format: "9:16" });
  assert.equal(tall.seconds, 30);
  assert.equal(tall.height, 1280);
});

test("MP4 ma spójne pudełka", () => {
  const sample = new Uint8Array([0, 0, 0, 1, 9]);
  const bytes = muxAvcMp4({
    width: 16,
    height: 16,
    fps: 24,
    description: new Uint8Array([1, 66, 0, 30, 255, 225, 0]),
    samples: [{ data: sample, key: true }, { data: sample, key: false }]
  });
  assert.equal(String.fromCharCode(...bytes.slice(4, 8)), "ftyp");
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const types = [];
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset);
    types.push(String.fromCharCode(...bytes.slice(offset + 4, offset + 8)));
    assert.ok(size >= 8);
    offset += size;
  }
  assert.equal(offset, bytes.length);
  assert.deepEqual(types.slice(0, 3), ["ftyp", "moov", "mdat"]);
});

test("skrót klucza SHA-256", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("wideo z prawem wchodzi w bohatera i nagrania", () => {
  const html = renderLightPage(
    { name: "Kubek", slug: "kubek", status: "published", id: "p1" },
    { headline: "Kubek", price: 40, video: { url: "https://cdn.example/v.mp4", poster: "https://cdn.example/p.jpg", rights: true }, seller: { name: "A", email: "a@b.co" }, gpsr: { producer: "X" } },
    { origin: "https://panel.example" }
  );
  assert.match(html, /<video src="https:\/\/cdn\.example\/v\.mp4"/);
  assert.match(html, /Wideo produktu/);
  const hidden = renderLightPage(
    { name: "Kubek", slug: "kubek", status: "published", id: "p1" },
    { headline: "Kubek", price: 40, video: { url: "https://cdn.example/v.mp4", rights: false } },
    { origin: "https://panel.example" }
  );
  assert.equal(hidden.includes("cdn.example/v.mp4"), false);
});

test("JSON-LD i adres oferty", () => {
  const data = extractFromJsonLd({
    "@type": "Product",
    name: "Kubek",
    gtin13: "5901234567890",
    brand: { name: "ACME" },
    image: ["https://cdn.example/k.jpg"],
    offers: { price: "40.00", priceCurrency: "PLN", shippingDetails: { shippingRate: { value: "0" } } }
  });
  const merged = mergeExtract(data);
  assert.equal(merged.catalog_name, "Kubek");
  assert.equal(merged.price, "40.00");
  assert.equal(merged.ean, "5901234567890");
  assert.equal(merged.producer, "ACME");
  assert.equal(offerIdFromUrl("https://allegro.pl/oferta/kubek-termiczny-12345678901"), "12345678901");
});
