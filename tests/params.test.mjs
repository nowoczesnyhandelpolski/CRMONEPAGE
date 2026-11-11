import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOfferItem, paramValue } from "../lib/offer-normalizer.mjs";
import { draftFromSource } from "../lib/page-draft.mjs";

test("wartość parametru Allegro: tekst, lista obiektów, zakres i jednostka", () => {
  assert.equal(paramValue({ name: "Kolor", value: "Biały" }), "Biały");
  assert.equal(paramValue({ name: "Stan", values: [{ valueLabel: "Nowy" }] }), "Nowy");
  assert.equal(paramValue({ name: "Materiał", values: [{ name: "metal" }, { name: "tworzywo" }] }), "metal, tworzywo");
  assert.equal(paramValue({ name: "Moc", values: ["1450"], unit: "W" }), "1450 W");
  assert.equal(paramValue({ name: "Waga", rangeValue: { from: "1", to: "2" } }), "1–2");
  assert.equal(paramValue({ name: "Zły", value: "[object Object]" }), "");
});

test("import oferty nie zapisuje „[object Object]”", () => {
  const item = normalizeOfferItem({ catalog_name: "Ekspres", price: "1499", parameters: [{ name: "Ciśnienie", values: [{ valueLabel: "15 bar" }] }] });
  assert.deepEqual(item.item.parameters, [{ name: "Ciśnienie", value: "15 bar" }]);
});

test("szkic strony pomija parametry bez czytelnej wartości", () => {
  const draft = draftFromSource({
    catalog_name: "Kolczyk",
    price: 20,
    parameters: [{ name: "Stan", value: "[object Object]" }, { k: "Materiał", v: "stal 316L" }, { name: "Kolor", values: [{ name: "srebrny" }] }]
  });
  assert.deepEqual(draft.data.features.map((f) => [f.title, f.text]), [["Materiał", "stal 316L"], ["Kolor", "srebrny"]]);
  assert.ok(!JSON.stringify(draft.data).includes("[object Object]"));
});
