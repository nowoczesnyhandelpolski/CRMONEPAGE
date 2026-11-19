import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pageFromSharkly, productFromSharkly, rowsFromSharklyCsv } from "../lib/sharkly-csv.mjs";
import { renderPage } from "../lib/render.mjs";

const csv = fs.readFileSync(new URL("../fixtures/produkt-skrobaczka.csv", import.meta.url), "utf8");

test("eksport Sharkly: cena 109,90, bez zestawów i bez zgadywania z ceny źródłowej", () => {
  const parsed = rowsFromSharklyCsv(csv);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 1);
  const row = parsed.rows[0];
  assert.equal(row.sku, "SH-003473");
  assert.equal(row.ean, "5901431540170");
  assert.equal(row.price, 109.9);
  assert.equal(row.source_price, 59.9);
  assert.equal(row.images.length, 10);
  assert.equal(new Set(row.images).size, 10);
  assert.ok(row.sections.length >= 3);
  assert.ok(row.params.some((param) => param.name === "Długość" && param.value === "68.5 cm"));

  const product = productFromSharkly(row);
  assert.equal(product.price, 109.9);
  assert.equal(product.raw.cena_zrodlowa, 59.9);
  assert.equal(product.status, "active");
  assert.equal(product.brand, "SILVER SHARKY");

  const page = pageFromSharkly(row, { rights: true });
  assert.equal(page.template, "konwersja");
  assert.equal(page.bundles.length, 1);
  assert.equal(page.bundles[0].label, "1 szt.");
  assert.equal(page.bundles[0].price, 109.9);
  assert.equal(page.bundles[0].compare_at, null);
  assert.equal(page.reviews.length, 0);
  assert.equal(page.ugc.length, 0);
  assert.equal(page.sale.enabled, false);
  assert.equal(page.images.length, 10);
  assert.equal(page.images.every((image) => image.rights), true);
  assert.match(page.subheadline, /68,5 cm|68\.5 cm/);
  assert.ok(page.benefits.length <= 3);
  assert.ok(page.specs.some((spec) => spec.name === "Długość" && spec.value === "68.5 cm"));

  const html = renderPage({ id: "sk", slug: "skrobaczka", name: page.headline, status: "draft" }, page, {
    origin: "https://panel.example",
    now: new Date("2026-11-19T12:00:00Z")
  });
  assert.match(html, /tpl-konwersja/);
  assert.match(html, /109,90/);
  assert.match(html, /1 szt\./);
  assert.doesNotMatch(html, /id="opinie"/);
  assert.doesNotMatch(html, /id="nagrania"/);
  assert.doesNotMatch(html, /59,90/);
  assert.doesNotMatch(html, /data-ends=/);
  assert.equal((html.match(/allegroimg\.com/g) || []).length >= 10, true);
});

test("pusta cena nie jest brana z ceny źródłowej i nie tworzy zestawu", () => {
  const text = "nr_sharkly;tytul;cena;cena_zrodlowa;opis1\nSH-1;Kubek;;12,50;Opis\nTreść faktu o kubku.";
  const parsed = rowsFromSharklyCsv(text);
  assert.equal(parsed.rows[0].price, null);
  assert.equal(parsed.rows[0].source_price, 12.5);
  const page = pageFromSharkly(parsed.rows[0]);
  assert.equal(page.price, null);
  assert.equal(page.bundles.length, 0);
  assert.equal(productFromSharkly(parsed.rows[0]).status, "flagged");
});
