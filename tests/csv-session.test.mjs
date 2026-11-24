import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeOfferItem } from "../lib/offer-normalizer.mjs";
import { productFromSharkly, rowsFromSharklyCsv } from "../lib/sharkly-csv.mjs";
import {
  addGroup, addItem, assignGroup, clearSession, emptySession, finishSession, itemFromOffer,
  itemFromShopProduct, itemToOffer, pauseSession, removeItem, sessionToSharklyCsv, startSession
} from "../extension/csv-session.mjs";

const offer = {
  catalog_name: "Skrobaczka teleskopowa",
  sku: "SK-1",
  ean: "5901431540170",
  producer: "ACME",
  price: "109,90",
  price_before_promo: "59,90",
  cena_2: "189",
  cena_3: "",
  category: "Skrobaczki",
  parameters: [{ name: "Długość", value: "68.5 cm" }, { name: "Stan", value: "[object Object]" }],
  images: ["https://cdn.example/a.jpg", "https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
  description: "Szczotka i skrobaczka w jednym.",
  source_link: "https://allegro.pl/oferta/skrobaczka-1?bi_s=ads",
  source_offer_id: "19138743160"
};

test("sesja przeżywa kolejne kroki: start, grupa, dopisanie, wstrzymanie, usunięcie", () => {
  let session = startSession(emptySession());
  assert.equal(session.status, "active");
  session = addGroup(session, "  Skrobaczki ").session;
  assert.equal(session.currentGroup, "Skrobaczki");
  assert.deepEqual(session.groups, ["Skrobaczki"]);
  session = addGroup(session, "skrobaczki").session;
  assert.equal(session.groups.length, 1);

  const first = addItem(session, itemFromOffer(offer, session.currentGroup));
  assert.equal(first.added, true);
  assert.equal(first.session.items.length, 1);
  assert.equal(first.session.items[0].group, "Skrobaczki");
  assert.equal(first.session.items[0].parameters.length, 1);
  assert.equal(first.session.items[0].images.length, 2);
  assert.equal(first.session.items[0].price, "109,90");

  const again = addItem(first.session, itemFromOffer({ ...offer, price: "99.00" }, ""));
  assert.equal(again.updated, true);
  assert.equal(again.session.items.length, 1);
  assert.equal(again.session.items[0].id, first.session.items[0].id);
  assert.equal(again.session.items[0].price, "99.00");
  assert.equal(again.session.items[0].group, "Skrobaczki");

  const paused = pauseSession(again.session);
  const blocked = addItem(paused, itemFromOffer({ ...offer, source_link: "https://sklep.example/p/2", catalog_name: "Inny" }, "Zima"));
  assert.equal(blocked.added, false);
  assert.equal(blocked.reason, "paused");
  assert.equal(blocked.session.items.length, 1);

  const shop = itemFromShopProduct({
    name: "Kubek", sku: "KUB-1", ean: "", brand: "ACME", price: "", old_price: "",
    parameters: [{ name: "Kolor", value: "Biały" }],
    images: ["https://cdn.example/kubek.jpg"],
    url: "https://sklep.example/product/kubek",
    description_text: "Stalowy kubek"
  }, "Zima");
  let live = startSession(paused);
  live = addGroup(live, "Zima").session;
  const second = addItem(live, shop);
  assert.equal(second.session.items.length, 2);
  assert.equal(second.session.items[1].price, "");
  assert.equal(second.session.items[1].group, "Zima");

  const both = assignGroup(second.session, second.session.items.map((item) => item.id), "Zima");
  assert.equal(both.items.every((item) => item.group === "Zima"), true);
  assert.ok(both.groups.includes("Zima"));

  const removed = removeItem(both, both.items[0].id);
  assert.equal(removed.items.length, 1);
  const cleared = clearSession(removed);
  assert.equal(cleared.status, "idle");
  assert.equal(cleared.items.length, 0);
  assert.ok(cleared.groups.includes("Skrobaczki"));
});

test("CSV sesji jest plikiem importu generatora: BOM, średnik, cena, grupa, bez zgadywania", () => {
  let session = startSession(emptySession());
  session = addGroup(session, "Skrobaczki").session;
  session = addItem(session, itemFromOffer(offer, "Skrobaczki")).session;
  session = addItem(session, itemFromOffer({
    catalog_name: "=FORMUŁA",
    price: "",
    ean: "",
    sku: "X-2",
    source_link: "https://sklep.example/p/2",
    images: ["https://cdn.example/c.jpg"],
    parameters: [{ name: "Kolor", value: "Biały" }],
    description: "Sam opis."
  }, "Zima")).session;
  const csv = sessionToSharklyCsv(finishSession(session).items);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /nr_sharkly;ean;tytul;cena;cena_zrodlowa;producent;kategoria;link_zrodlowy;opis1;/);
  assert.match(csv, /cena_2;cena_3;grupa/);
  assert.match(csv, /param: Długość/);
  assert.match(csv, /param: Kolor/);
  assert.match(csv, /zdj1;zdj2/);
  assert.match(csv, /'=FORMUŁA/);
  assert.equal(csv.includes("79"), false);

  const parsed = rowsFromSharklyCsv(csv);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  const row = parsed.rows[0];
  assert.equal(row.sku, "SK-1");
  assert.equal(row.ean, "5901431540170");
  assert.equal(row.price, 109.9);
  assert.equal(row.source_price, 59.9);
  assert.equal(row.price_2, 189);
  assert.equal(row.price_3, null);
  assert.equal(row.producer, "ACME");
  assert.equal(row.group, "Skrobaczki");
  assert.deepEqual(row.images, ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]);
  assert.deepEqual(row.params, [{ name: "Długość", value: "68.5 cm" }]);
  assert.ok(row.sections.some((section) => /Szczotka i skrobaczka/.test(section.text)));
  assert.equal(parsed.rows[1].price, null);
  assert.equal(parsed.rows[1].group, "Zima");
  const product = productFromSharkly(row);
  assert.equal(product.product_group, "Skrobaczki");
  assert.equal(product.price, 109.9);
  const plain = rowsFromSharklyCsv("nr_sharkly;tytul;cena\n;Kubek;10").rows[0];
  assert.equal(plain.group, null);
  assert.equal("product_group" in productFromSharkly(plain), false);
});

test("wysyłka sesji niesie grupę i SKU, a pusta cena zostaje pusta", () => {
  const offerItem = itemToOffer(itemFromOffer(offer, "Zima"));
  const normalized = normalizeOfferItem(offerItem);
  assert.equal(normalized.item.product_group, "Zima");
  assert.equal(normalized.item.sku, "SK-1");
  assert.equal(normalized.item.price, 109.9);
  const empty = normalizeOfferItem(itemToOffer(itemFromShopProduct({ name: "Kubek", price: "", url: "https://sklep.example/k" }, "")));
  assert.equal(empty.item.price, null);
  assert.equal(empty.item.product_group, "");
  assert.equal(empty.flagged, true);
});

test("baza i generator filtrują grupę, a SQL dokłada kolumnę bez kasowania", () => {
  const sql = fs.readFileSync(new URL("../supabase.sql", import.meta.url), "utf8");
  const offers = fs.readFileSync(new URL("../oferty.js", import.meta.url), "utf8");
  const generator = fs.readFileSync(new URL("../generator.js", import.meta.url), "utf8");
  const popup = fs.readFileSync(new URL("../extension/popup.html", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists product_group text not null default ''/);
  assert.match(sql, /v_data->>'product_group'/);
  assert.equal(/drop table\s+public\.products/i.test(sql), false);
  assert.match(offers, /data-nhp="pages-group"/);
  assert.match(offers, /product_group/);
  assert.match(offers, /Zrób strony/);
  assert.match(generator, /id="p-group-filter"/);
  assert.match(generator, /id="baza-group"/);
  assert.match(generator, /data-g="baza-pages"/);
  assert.match(generator, /Wybierz z Bazy produktów/);
  assert.match(offers, /pageFromProduct/);
  assert.match(generator, /data-group=/);
  for (const label of ["Zacznij sesję CSV", "Wstrzymaj", "Zakończ i pobierz CSV", "Wyślij sesję do NHP", "Wyczyść sesję"]) {
    assert.match(popup, new RegExp(label));
  }
  assert.match(popup, /width: 360px/);
});
