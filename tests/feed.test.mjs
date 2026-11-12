import test from "node:test";
import assert from "node:assert/strict";
import { productFeedXml, findGtin, feedItem } from "../lib/product-feed.mjs";

const page = {
  id: "pg1", slug: "kolczyk", name: "Kolczyk", status: "published",
  data: {
    headline: "Kolczyk clicker 316L", price: 29.9, brand: "BIZU",
    images: [
      { url: "https://x.pl/a-EAN-GTIN-5905602536603.jpg", rights: true },
      { url: "https://x.pl/b.jpg", rights: true },
      { url: "https://x.pl/c.jpg", rights: false }
    ],
    seller: { name: "NHP", email: "a@b.pl" }, gpsr: { producer: "BIZU" }
  }
};

test("GTIN z nazwy zdjęcia", () => {
  assert.equal(findGtin(page.data), "5905602536603");
  assert.equal(findGtin({ images: [{ url: "https://x.pl/a.jpg" }] }), "");
});

test("pozycja pliku: cena, link, tylko zdjęcia z prawami", () => {
  const it = feedItem("https://panel.example", page);
  assert.equal(it.price, "29.90 PLN");
  assert.equal(it.link, "https://panel.example/p/kolczyk");
  assert.deepEqual(it.extra, ["https://x.pl/b.jpg"]);
  assert.equal(feedItem("https://panel.example", { ...page, data: { headline: "X" } }), null);
});

test("XML ma wymagane pola Merchant Center", () => {
  const xml = productFeedXml("https://panel.example", [page]);
  for (const s of ["<g:id>pg1</g:id>", "<g:price>29.90 PLN</g:price>", "<g:availability>in_stock</g:availability>", "<g:condition>new</g:condition>", "<g:brand>BIZU</g:brand>", "<g:gtin>5905602536603</g:gtin>", "<g:country>PL</g:country>"]) {
    assert.ok(xml.includes(s), s);
  }
});
