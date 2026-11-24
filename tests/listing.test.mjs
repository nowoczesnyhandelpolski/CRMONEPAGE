import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractListing, collectListingUrls, fetchProductQueue, partitionKnown, canonicalProductUrl } from "../extension/listing.mjs";
import { createListingRunner } from "../extension/listing-job.mjs";
import { analyzePage } from "../extension/page-product.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, "fixtures", name), "utf8");

const PAGES = {
  "https://zegarek.test/zegarki/luksusowe.html": read("listing-page-1.html"),
  "https://zegarek.test/zegarki/luksusowe.html?page=2": read("listing-page-2.html"),
  "https://zegarek.test/zegarki/luksusowe.html?page=3": read("listing-page-3.html")
};

const CARD = (name, ean) => `<!doctype html><html><body>
  <h1>${name}</h1>
  <p class="price">899,00 zł</p>
  <div class="product-description"><p>Opis ${name}.</p></div>
  <table class="params"><tr><td>EAN</td><td>${ean}</td></tr><tr><td>SKU</td><td>${ean.slice(-4)}</td></tr></table>
  <div class="gallery"><a href="https://cdn.zegarek.test/${ean}.jpg"><img src="https://cdn.zegarek.test/${ean}-100x100.jpg"></a></div>
</body></html>`;

test("listing: ItemList, karty i deduplikacja adresu", () => {
  const html = read("listing-page-1.html");
  const page = analyzePage(html, "https://zegarek.test/zegarki/luksusowe.html");
  assert.equal(page.kind, "listing");
  const listing = extractListing(html, "https://zegarek.test/zegarki/luksusowe.html");
  const urls = listing.products.map((item) => item.url);
  assert.deepEqual(urls, [
    "https://zegarek.test/zegarek-a.html",
    "https://zegarek.test/zegarek-b.html",
    "https://zegarek.test/zegarek-c.html",
    "https://zegarek.test/zegarek-d.html"
  ]);
  assert.equal(listing.nextUrl, "https://zegarek.test/zegarki/luksusowe.html?page=2");
  assert.equal(canonicalProductUrl("https://zegarek.test/zegarek-b.html?utm_source=lista"), "https://zegarek.test/zegarek-b.html");
});

test("paginacja idzie po kolejnych stronach i respektuje limit", async () => {
  const sleeps = [];
  const limited = await collectListingUrls({
    startUrl: "https://zegarek.test/zegarki/luksusowe.html",
    fetchText: async (url) => PAGES[url] || "",
    limit: 2,
    delayMs: 1000,
    sleep: async (ms) => { sleeps.push(ms); }
  });
  assert.equal(limited.urls.length, 2);
  assert.equal(limited.pages, 1);
  assert.equal(sleeps.length, 0);

  const all = await collectListingUrls({
    startUrl: "https://zegarek.test/zegarki/luksusowe.html",
    fetchText: async (url) => PAGES[url] || "",
    limit: 50,
    delayMs: 1000,
    sleep: async (ms) => { sleeps.push(ms); }
  });
  assert.deepEqual(all.urls.map((item) => item.url), [
    "https://zegarek.test/zegarek-a.html",
    "https://zegarek.test/zegarek-b.html",
    "https://zegarek.test/zegarek-c.html",
    "https://zegarek.test/zegarek-d.html",
    "https://zegarek.test/zegarek-e.html",
    "https://zegarek.test/zegarek-f.html"
  ]);
  assert.equal(all.pages, 3);
  assert.ok(sleeps.filter((ms) => ms >= 1000).length >= 2);
});

test("kolejka kart: pełne dane, powtórka po błędzie, pauza i deduplikacja", async () => {
  const urls = ["https://zegarek.test/zegarek-a.html", "https://zegarek.test/zegarek-b.html"];
  let tries = 0;
  const queue = await fetchProductQueue({
    urls,
    delayMs: 0,
    retries: 2,
    sleep: async () => {},
    fetchText: async (url) => {
      tries += 1;
      if (url.endsWith("zegarek-a.html") && tries < 3) throw new Error("HTTP 503");
      if (url.endsWith("zegarek-b.html")) return "<html><body><p>pusto</p></body></html>";
      return CARD("Zegarek A", "4549526294374");
    }
  });
  assert.equal(queue.results.length, 2);
  assert.equal(queue.results[0].ok, true);
  assert.equal(queue.results[0].product.ean, "4549526294374");
  assert.match(queue.results[0].product.description_text, /Opis Zegarek A/);
  assert.equal(queue.results[0].product.images[0], "https://cdn.zegarek.test/4549526294374.jpg");
  assert.equal(queue.results[1].ok, false);
  assert.ok(tries >= 3);

  let paused = true;
  const pending = fetchProductQueue({
    urls: ["https://zegarek.test/zegarek-a.html"],
    delayMs: 0,
    retries: 0,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 20))),
    shouldPause: () => paused,
    fetchText: async () => CARD("Zegarek A", "1111111111116")
  });
  setTimeout(() => { paused = false; }, 30);
  const waited = await pending;
  assert.equal(waited.results[0].ok, true);

  const stopped = await fetchProductQueue({
    urls: ["https://zegarek.test/x.html"],
    delayMs: 0,
    retries: 0,
    sleep: async () => {},
    shouldStop: () => true,
    fetchText: async () => CARD("X", "2222222222228")
  });
  assert.equal(stopped.cancelled, true);
  assert.equal(stopped.results.length, 0);

  const parts = partitionKnown([
    { name: "A", ean: "4549526294374", url: "https://zegarek.test/zegarek-a.html" },
    { name: "A2", ean: "4549526294374", url: "https://zegarek.test/inny.html" },
    { name: "B", ean: "5900000000004", url: "https://zegarek.test/zegarek-b.html" },
    { name: "C", ean: "", url: "https://zegarek.test/zegarek-c.html?utm_source=x" }
  ], {
    eans: ["5900000000004"],
    urls: ["https://zegarek.test/zegarek-c.html"]
  });
  assert.deepEqual(parts.fresh.map((item) => item.name), ["A"]);
  assert.equal(parts.dupes.length, 3);
});

test("zadanie listingu zbiera strony i karty, da się je przerwać", async () => {
  const products = {
    "https://zegarek.test/zegarek-a.html": CARD("Zegarek A", "4549526294374"),
    "https://zegarek.test/zegarek-b.html": CARD("Zegarek B", ""),
    "https://zegarek.test/zegarek-c.html": CARD("Zegarek C", "3333333333334")
  };
  const runner = createListingRunner({
    sleep: async () => {},
    fetchText: async (url) => PAGES[url] || products[url] || ""
  });
  const snap = await runner.start({
    startUrl: "https://zegarek.test/zegarki/luksusowe.html",
    mode: "all",
    limit: 3
  });
  assert.equal(snap.status, "done");
  assert.equal(snap.products.length, 3);
  assert.equal(snap.failed, 0);
  assert.equal(snap.missingEan, 1);
  assert.equal(snap.products[0].name, "Zegarek A");
  assert.match(snap.products[0].description_text, /Opis Zegarek A/);

  let calls = 0;
  const slow = createListingRunner({
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 15))),
    fetchText: async (url) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return PAGES[url] || products[url] || CARD("X", "4444444444440");
    }
  });
  const running = slow.start({ startUrl: "https://zegarek.test/zegarki/luksusowe.html", mode: "all", limit: 50 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  slow.cancel();
  const cancelled = await running;
  assert.equal(cancelled.status, "cancelled");
  assert.ok(calls >= 1);
});

test("przycisk, podgląd i sprawdzenie bazy są w źródle wtyczki", () => {
  const repo = path.resolve(root, "..");
  const view = fs.readFileSync(path.join(repo, "extension/shop-view.mjs"), "utf8");
  const ui = fs.readFileSync(path.join(repo, "extension/shop-ui.js"), "utf8");
  const sql = fs.readFileSync(path.join(repo, "supabase.sql"), "utf8");
  const api = fs.readFileSync(path.join(repo, "functions/api/nhp/[[path]].js"), "utf8");
  for (const bit of [
    "Zapisz tę ofertę w NHP",
    "Zapisz w NHP",
    "Dodaj do sesji CSV",
    "Zaznacz wszystkie na stronie",
    "Cały listing (wszystkie strony)",
    "Zapisz wszystkie w NHP",
    "Pobierz CSV",
    "Pobierz XLSX",
    "Brakuje:"
  ]) {
    assert.match(view, new RegExp(bit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(ui, /key !== "e" && event.key !== "E"/);
  assert.equal(/^import\s/m.test(ui), false);
  assert.match(sql, /function public\.lookup_catalog_keys/);
  assert.match(sql, /grant execute on function public\.lookup_catalog_keys\(text, jsonb\) to anon/);
  assert.match(api, /catalog-lookup/);
  assert.equal(/service_role|BEGIN PRIVATE|sk-[A-Za-z0-9]{8}/.test(view + ui), false);
});
