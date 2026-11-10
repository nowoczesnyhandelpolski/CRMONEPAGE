import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PAGE_CLIENT } from "../lib/page-client.mjs";
import {
  cleanSiteData, exampleSiteData, hasPurchaseOption, kSlug, mergeSiteData, shippingPlan,
  shopFromPage, sitePublishIssues, uniqueSlug
} from "../lib/site-model.mjs";
import { renderLightPage, sitemapXml } from "../lib/render.mjs";

test("skrypt strony jest zsynchronizowany ze źródłem", () => {
  const src = fs.readFileSync(new URL("../lib/page-client.js", import.meta.url), "utf8");
  assert.equal(PAGE_CLIENT, src);
});

test("czyszczenie danych: złe adresy odpadają, źródło nie wchodzi na stronę", () => {
  const d = cleanSiteData({
    headline: "Ciepło jak pod kołdrą",
    subheadline: "Miękki polar <b>na zimę</b>.",
    price: "109,00",
    images: [{ url: "https://cdn.hurtownia.pl/koc.jpg", alt: "Koc", rights: true }, { url: "javascript:alert(1)", rights: true }, "https://a.allegroimg.com/1.jpg"],
    bundles: [{ label: "1 koc", qty: 1, price: 109 }, { label: "2 koce", qty: 2, price: 189, badge: "Dla dwojga", note: "Gratis: etui" }, { label: "", price: 10 }],
    benefits: [{ title: "Ręce wolne", text: "Trzymasz kubek." }],
    seller: { name: "Test sp. z o.o.", email: "sklep@test.pl" },
    gpsr: { producer: "Firma X sp. z o.o." },
    theme: { accent: "#FF5A00" },
    source: { description: "Cudzy opis oferty", images: ["https://a.allegroimg.com/1.jpg"] }
  });
  assert.equal(d.images.length, 2);
  assert.equal(d.images[1].rights, false);
  assert.equal(d.images[0].rights, true);
  assert.equal(d.bundles.length, 2);
  assert.equal(d.bundles[1].note, "Gratis: etui");
  assert.equal(d.theme.accent, "#ff5a00");
  assert.equal(d.source.description, "Cudzy opis oferty");
  assert.equal(d.source.images.length, 1);
  assert.equal(d.price, 109);
});

test("formularz nie nadpisuje źródła", () => {
  const prev = cleanSiteData({ source: { description: "Cudzy opis oferty, którego nie publikujemy." }, headline: "Stary" });
  const merged = mergeSiteData(prev, { headline: "Nowy", source: { description: "próba nadpisania źródła" } });
  assert.equal(merged.headline, "Nowy");
  assert.equal(merged.source.description, "Cudzy opis oferty, którego nie publikujemy.");
});

test("publikacja wymaga nagłówka, ceny, zdjęcia z prawami, sprzedawcy, GPSR i opcji zakupu", () => {
  const row = { name: "Koc" };
  let d = cleanSiteData({ headline: "Koc" });
  const issues = sitePublishIssues(row, d);
  assert.ok(issues.some((i) => /ceny|zestaw/i.test(i)));
  assert.ok(issues.some((i) => /zdjęcia/i.test(i)));
  assert.ok(issues.some((i) => /sprzedawcy/i.test(i)));
  assert.ok(issues.some((i) => /GPSR|producenta/i.test(i)));
  assert.equal(hasPurchaseOption(d), false);

  d = cleanSiteData({
    headline: "Ciepło",
    price: 109,
    images: [{ url: "https://cdn.hurtownia.pl/koc.jpg", rights: true }],
    seller: { name: "Test sp. z o.o.", email: "sklep@test.pl" },
    gpsr: { producer: "Firma X" }
  });
  assert.deepEqual(sitePublishIssues(row, d), []);
  assert.equal(hasPurchaseOption(d), true);

  const example = exampleSiteData();
  assert.ok(sitePublishIssues({ name: "X" }, example).some((i) => /przykład/i.test(i)));
});

test("slug i unikalność", () => {
  assert.equal(kSlug("Otulka Koc!"), "otulka-koc");
  assert.equal(uniqueSlug("Otulka koc", ["otulka-koc"]), "otulka-koc-2");
  assert.equal(uniqueSlug("Łóżko różowe", []), "lozko-rozowe");
});

test("sklep z generatora: live po publikacji, pauza po wycofaniu", () => {
  const live = shopFromPage({ id: "pg1", slug: "koc", name: "Koc", status: "published", data: { kicker: "Zima" } }, "https://panel.example", "p1");
  assert.equal(live.data.platform, "generator");
  assert.equal(live.data.status, "live");
  assert.equal(live.data.domain, "https://panel.example/p/koc");
  const paused = shopFromPage({ ...{ id: "pg1", slug: "koc", name: "Koc", shop_id: live.id }, status: "draft", data: {} }, "https://panel.example");
  assert.equal(paused.id, live.id);
  assert.equal(paused.data.status, "pauza");
});

test("termin wysyłki liczony w Europe/Warsaw, bez wiecznego licznika", () => {
  const wedMorning = new Date("2026-11-11T09:30:00+01:00");
  const before = shippingPlan(wedMorning, "15:00");
  assert.equal(before.beforeCutoff, true);
  assert.match(before.message, /wyślemy dziś/);
  assert.equal(before.orderLabel.includes("11"), true);

  const wedLate = new Date("2026-11-11T16:10:00+01:00");
  const after = shippingPlan(wedLate, "15:00");
  assert.equal(after.beforeCutoff, false);
  assert.match(after.message, /Po godzinie granicznej 15:00/);
  assert.match(after.shipLabel, /12/);

  const saturday = new Date("2026-11-14T11:00:00+01:00");
  const weekend = shippingPlan(saturday, "15:00");
  assert.match(weekend.message, /Weekend/);
  assert.match(weekend.shipLabel, /16/);
});

test("strona publiczna: jasny szablon, SEO, bez noindex, bez fałszywego licznika i bez źródła", () => {
  const data = cleanSiteData({
    brand: "SKLEP",
    kicker: "Kalendarz adwentowy 2026",
    headline: "Kalendarz adwentowy z autkami 2026",
    subheadline: "Miękki polar <b>na zimę</b>.",
    price: 189,
    compare_at: 249,
    omnibus_price: 199,
    default_bundle: 1,
    bundles: [
      { label: "1 szt.", qty: 1, price: 189, compare_at: 249, omnibus: 199 },
      { label: "2 szt.", qty: 2, price: 339, badge: "Oszczędzasz 10%", note: "Gratis: karty kolekcjonerskie", compare_at: 378, omnibus: 349 }
    ],
    images: [
      { url: "https://cdn.hurtownia.pl/kalendarz.jpg", alt: "Kalendarz", rights: true },
      { url: "https://a.allegroimg.com/secret.jpg", rights: false }
    ],
    callouts: [{ label: "24 okienka z autkami" }, { label: "Solidne pudełko prezentowe" }],
    benefits: [{ title: "Gotowy prezent" }],
    features: [{ title: "Okienka", text: "Numerowane drzwiczki." }, { title: "Autka", text: "Zostają." }, { title: "Pudełko", text: "Wstążka." }, { title: "Plan", text: "Odhaczanie." }],
    stock: 14,
    reviews: [{ author: "Karolina M.", text: "Autka zostały na półce.", rating: 5, source_url: "https://opinie.example/1" }],
    faq: [{ q: "Kiedy wysyłka?", a: "W dni robocze do 15:00." }],
    shipping: { cutoff: "15:00", time: "Wysyłka 24 h", free: true },
    returns_days: 30,
    seller: { name: "Test sp. z o.o.", email: "sklep@test.pl", vat_exempt: true },
    gpsr: { producer: "Firma X sp. z o.o." },
    theme: { accent: "#ff5a00" },
    source: { description: "Cudzy opis oferty, którego nie publikujemy." },
    addons: [{ name: "Naklejki", price: 39, text: "Do tej samej paczki" }, { name: "bez ceny" }]
  });
  const html = renderLightPage({ id: "pg1", slug: "kalendarz-adwentowy", name: "Kalendarz", status: "published" }, data, {
    origin: "https://panel.example",
    now: new Date("2026-11-11T09:30:00+01:00")
  });
  assert.match(html, /Kalendarz adwentowy z autkami 2026/);
  assert.match(html, /rel="canonical" href="https:\/\/panel\.example\/p\/kalendarz-adwentowy"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /cdn\.hurtownia\.pl\/kalendarz\.jpg/);
  assert.doesNotMatch(html, /allegroimg\.com/);
  assert.doesNotMatch(html, /Cudzy opis/);
  assert.match(html, /&lt;b&gt;na zimę&lt;\/b&gt;/);
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /content="index, follow"/);
  assert.match(html, /Zostało 14 szt\./);
  assert.match(html, /data-cutoff="15:00"/);
  assert.match(html, /wyślemy dziś/);
  assert.doesNotMatch(html, /data-until=/);
  assert.doesNotMatch(html, /ostatnie sztuki|mało sztuk|spieszy/i);
  assert.match(html, /Oszczędzasz 10%/);
  assert.match(html, /Gratis: karty kolekcjonerskie/);
  assert.match(html, /Najniższa cena z 30 dni/);
  assert.match(html, /zwolnienia z VAT/);
  assert.match(html, /Firma X sp\. z o\. o\.|Firma X sp\. z o\.o\./);
  assert.match(html, /id="coF"/);
  assert.match(html, /Naklejki/);
  assert.doesNotMatch(html, /bez ceny/);
  assert.match(html, /--accent:#ff5a00/);
  const map = sitemapXml("https://panel.example", [{ slug: "kalendarz-adwentowy", updated_at: "2026-11-11T10:00:00Z" }]);
  assert.match(map, /<loc>https:\/\/panel\.example\/p\/kalendarz-adwentowy<\/loc>/);
});

test("podgląd jest noindex i nie jest stroną na żywo", () => {
  const html = renderLightPage({ id: "1", slug: "x", name: "X", status: "draft" }, cleanSiteData({
    headline: "X", price: 10, images: [{ url: "https://cdn.x.pl/a.jpg", rights: false }]
  }), { preview: true, origin: "https://panel.example" });
  assert.match(html, /noindex/);
  assert.match(html, /data-live="0"/);
  assert.match(html, /cdn\.x\.pl\/a\.jpg/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test("brak stanu magazynowego nie wymyśla licznika sztuk", () => {
  const html = renderLightPage({ id: "1", slug: "x", name: "X", status: "published" }, cleanSiteData({
    headline: "X", price: 10, images: [{ url: "https://cdn.x.pl/a.jpg", rights: true }],
    seller: { name: "A", email: "a@a.pl" }, gpsr: { producer: "P" }
  }), { origin: "https://panel.example" });
  assert.doesNotMatch(html, /Zostało/);
  assert.doesNotMatch(html, /class="stock"/);
});
