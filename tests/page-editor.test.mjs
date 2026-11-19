import test from "node:test";
import assert from "node:assert/strict";
import { applyPageEdit, describePageDiff, editPrompt, moveSection, pushPageHistory } from "../lib/page-editor.mjs";
import { cleanSiteData } from "../lib/site-model.mjs";

test("kolejność sekcji i historia dziesięciu wersji", () => {
  const order = cleanSiteData({}).section_order;
  const moved = moveSection(order, "faq", -1);
  assert.equal(moved[moved.indexOf("faq") + 1], "features");
  let history = [];
  for (let i = 0; i < 12; i++) history = pushPageHistory(history, { headline: String(i) }, "zapis");
  assert.equal(history.length, 10);
  assert.equal(history[0].data.headline, "11");
});

test("propozycja nie dopisuje opinii i umie zmienić kolor", () => {
  const prev = cleanSiteData({
    headline: "Długi nagłówek produktu na zimę do auta",
    theme: { accent: "#111111" },
    reviews: [{ author: "Ewa", text: "Prawdziwa", rating: 5, source_url: "https://opinie.example/1" }],
    price: 109.9,
    bundles: [{ label: "1 szt.", qty: 1, price: 109.9 }]
  });
  const next = applyPageEdit(prev, {
    headline: "Skrobaczka 2 w 1",
    accent: "zielony",
    reviews: [{ author: "Bot", text: "Zmyślona", rating: 5, source_url: "https://zle.example" }],
    bundles: [{ label: "1 szt.", qty: 1, price: 1 }]
  }, "zmień kolor przycisku na zielony, skróć opis");
  assert.equal(next.headline, "Skrobaczka 2 w 1");
  assert.equal(next.theme.accent, "#1f7a45");
  assert.equal(next.reviews.length, 1);
  assert.equal(next.reviews[0].author, "Ewa");
  assert.equal(next.bundles[0].price, 109.9);
  const diff = describePageDiff(prev, next);
  assert.ok(diff.some((line) => /Nagłówek/.test(line)));
  assert.ok(diff.some((line) => /Kolor przycisku/.test(line)));
  assert.equal(diff.some((line) => /Bot/.test(line)), false);
  assert.match(editPrompt(prev, "skróć opis"), /Nie wymyślaj opinii/);
});
