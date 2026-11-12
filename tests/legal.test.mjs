import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cleanSiteData } from "../lib/site-model.mjs";
import { legalDocs, sellerLine } from "../lib/legal.mjs";

const page = (seller) => cleanSiteData({ headline: "Koc", price: 109, seller, gpsr: { producer: "X" } });

test("sprzedawca z NIP: NIP w regulaminie, faktura na żądanie", () => {
  const d = page({ name: "Jan Kowalski Handel", address: "ul. Polna 1, 00-001 Warszawa", nip: "5260001246", email: "sklep@test.pl" });
  const docs = legalDocs({ name: "Koc" }, d);
  assert.match(docs.regulamin, /Jan Kowalski Handel, ul\. Polna 1, 00-001 Warszawa, NIP 5260001246/);
  assert.match(docs.regulamin, /paragon albo fakturę/);
  assert.doesNotMatch(docs.regulamin, /nierejestrowan/);
  assert.match(docs.prywatnosc, /Administratorem danych jest Jan Kowalski Handel/);
  assert.match(docs.zwroty, /Adresat: Jan Kowalski Handel/);
});

test("spółka z o.o.: dane z art. 206 KSH, NIP w trakcie nadawania", () => {
  const d = page({ name: "Nowoczesny Handel Polski sp. z o.o.", address: "ul. Polna 1, 00-001 Warszawa", krs: "0001234567", court: "Sąd Rejonowy dla Wrocławia-Fabrycznej", capital: "5 000 zł", email: "sklep@test.pl" });
  const line = sellerLine(d.seller);
  for (const re of [/z siedzibą pod adresem: ul\. Polna 1/, /KRS 0001234567/, /Sąd Rejonowy dla Wrocławia-Fabrycznej/, /NIP w trakcie nadawania/, /kapitał zakładowy 5 000 zł/]) assert.match(line, re);
  assert.doesNotMatch(line, /nierejestrowan/);
  const docs = legalDocs({ name: "Koc" }, d);
  assert.match(docs.regulamin, /paragon albo fakturę/);
  assert.doesNotMatch(docs.regulamin, /nierejestrowan|rachunek potwierdzający/);
});

test("brakujące dane są oznaczone do uzupełnienia, a nazwa jest escapowana", () => {
  const d = page({ name: "<b>Zły</b>", email: "sklep@test.pl" });
  const line = sellerLine(d.seller);
  assert.match(line, /&lt;b&gt;Zły&lt;\/b&gt;/);
  assert.match(line, /\[uzupełnij\]/);
});

test("regulamin zawiera wymagane prawa konsumenta i płatność Stripe", () => {
  const docs = legalDocs({ name: "Koc" }, page({ name: "A", address: "B", email: "a@a.pl" }));
  for (const re of [/odstąpić od umowy w ciągu \d+ dni/, /art\. 38 ustawy o prawach konsumenta/, /przez 2 lata/, /Stripe/, /rzecznika konsumentów/, /art\. 38a/]) {
    assert.match(docs.regulamin, re);
  }
  assert.match(docs.zwroty, /niniejszym informuję\/informujemy\(\*\) o moim\/naszym odstąpieniu/);
});

test("dokumenty wizytówki nie mają zaszytych placeholderów i czytają dane sprzedawcy", () => {
  for (const f of ["regulamin.html", "polityka-prywatnosci.html"]) {
    const html = fs.readFileSync(new URL(`../www/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /\[NIP\]|\[REGON\]|\[adres siedziby\]/, f);
    assert.match(html, /data-seller/, f);
    assert.match(html, /assets\/seller\.js/, f);
  }
});
