import test from "node:test";
import assert from "node:assert/strict";
import { applyCopyToPage } from "../lib/copy-prompt.mjs";
import { renderPage } from "../lib/render.mjs";
import { buildProductSetInput } from "../lib/shopify-core.mjs";
import { cleanSiteData, resolveTemplate } from "../lib/site-model.mjs";
import { shopifyAutoDraftEnabled, workflowForShopifyPush } from "../lib/workflow.mjs";

const row = { id: "pg", slug: "zestaw", name: "Zestaw", status: "published" };

function page(extra = {}) {
  return cleanSiteData({
    template: "konwersja",
    headline: "Zestaw rzeźbiący",
    subheadline: "Ściska tam, gdzie trzeba.",
    price: 98,
    bundles: [
      { label: "Jeden", qty: 1, price: 98, compare_at: 120 },
      { label: "Dwa", qty: 2, price: 176, compare_at: 240, badge: "Oszczędzasz 10%" },
      { label: "Trzy", qty: 3, price: 249, badge: "Najlepsza cena" }
    ],
    benefits: [
      { title: "Nie prześwituje", text: "Gęsty splot.", icon: "shield" },
      { title: "Zostaje na miejscu", text: "Szwy nie zjeżdżają.", icon: "check" },
      { title: "Oddycha", text: "Siatka od środka.", icon: "leaf" }
    ],
    seller: { name: "Sklep", email: "a@b.co" },
    gpsr: { producer: "Producent" },
    images: [{ url: "https://cdn.example/a.jpg", rights: true }],
    ...extra
  });
}

test("stara karta bez szablonu zostaje klasyczna, auto na S1 Max idzie w konwersję", () => {
  assert.equal(resolveTemplate(cleanSiteData({ headline: "Stara" })), "klasyczny");
  assert.equal(resolveTemplate(cleanSiteData({ template: "auto", generated: { tier: "s1_max" } })), "konwersja");
  assert.equal(resolveTemplate(cleanSiteData({ template: "klasyczny", generated: { tier: "s1_max" } })), "klasyczny");
});

test("konwersja nie wymyśla opinii, stanu ani licznika", () => {
  const bare = renderPage(row, page(), { origin: "https://panel.example", now: new Date("2026-11-19T12:00:00Z") });
  assert.match(bare, /tpl-konwersja/);
  assert.match(bare, /Nie prześwituje/);
  assert.match(bare, /Oszczędzasz 10%/);
  assert.match(bare, /id="stab"/);
  assert.doesNotMatch(bare, /Zostało/);
  assert.doesNotMatch(bare, /data-ends=/);
  assert.doesNotMatch(bare, /id="opinie"/);
  assert.doesNotMatch(bare, /id="nagrania"/);

  const preview = renderPage(row, page(), { preview: true, origin: "https://panel.example" });
  assert.match(preview, /Bez źródła|nie wchodzą|Nie generujemy|Wpisz autora/);
  assert.match(preview, /noindex/);

  const honest = renderPage(row, page({
    stock: 4,
    urgency: { show_stock: true, show_timer: true, ends_at: "2020-01-01T00:00:00Z", label: "Do końca" },
    reviews: [{ author: "Ewa", text: "Leży dobrze.", rating: 5, source_url: "https://opinie.example/1", photo: "https://cdn.example/r.jpg" }],
    ugc: [{ video: "https://cdn.example/v.mp4", author: "Ewa", text: "W ruchu" }]
  }), { origin: "https://panel.example", now: new Date("2026-11-19T12:00:00Z") });
  assert.match(honest, /Zostało 4 szt\./);
  assert.doesNotMatch(honest, /data-ends=/);
  assert.match(honest, /cdn\.example\/r\.jpg/);
  assert.match(honest, /opinie\.example/);
  assert.match(honest, /cdn\.example\/v\.mp4/);

  const later = renderPage(row, page({
    urgency: { show_timer: true, ends_at: "2026-11-20T12:00:00Z" },
    sale: { enabled: true, label: "Sezon", text: "Krótka obniżka.", ends_at: "2026-11-20T18:00:00Z" }
  }), { origin: "https://panel.example", now: new Date("2026-11-19T12:00:00Z") });
  assert.match(later, /data-ends="2026-11-20T12:00:00.000Z"/);
  assert.match(later, /Sezon/);
});

test("wyłączona sekcja opinii znika nawet przy wpisanej opinii", () => {
  const html = renderPage(row, page({
    sections: { reviews: false, sticky: false },
    reviews: [{ author: "Ewa", text: "Jest.", rating: 5, source_url: "https://opinie.example/1" }]
  }), { origin: "https://panel.example" });
  assert.doesNotMatch(html, /id="opinie"/);
  assert.doesNotMatch(html, /id="stab"/);
});

test("model nie dostaje prawa dopisać opinii, a S1 Max ustawia szablon tylko przy auto", () => {
  const kept = applyCopyToPage({
    template: "klasyczny",
    reviews: [{ author: "Ewa", text: "Prawdziwa", source_url: "https://opinie.example/1" }],
    generated: { tier: "s1" }
  }, { headline: "Nowy", reviews: [{ author: "Bot", text: "Zmyślona" }] }, { tier: "s1_max", overwrite: true });
  assert.equal(kept.template, "klasyczny");
  assert.equal(kept.reviews[0].author, "Ewa");
  const fresh = applyCopyToPage({ template: "auto", headline: "" }, { headline: "Nowy", compare: [] }, { tier: "s1_max" });
  assert.equal(fresh.template, "konwersja");
  assert.equal(fresh.reviews, undefined);
});

test("dwa zestawy idą jako warianty, opis konwersji jest bez skryptu", () => {
  const input = buildProductSetInput({
    name: "Zestaw",
    sku: "MOV-1",
    ean: "5901234123457",
    price: "98",
    workflow_status: "strona_gotowa"
  }, { data: page() });
  assert.equal(input.status, "DRAFT");
  assert.equal(input.productOptions[0].name, "Zestaw");
  assert.equal(input.variants.length, 3);
  assert.equal(input.variants[0].sku, "MOV-1");
  assert.equal(input.variants[1].sku, "MOV-1-2");
  assert.equal(input.variants[0].price, "98.00");
  assert.equal(input.variants[0].compareAtPrice, "120.00");
  assert.equal(input.variants[1].compareAtPrice, "240.00");
  assert.equal(input.variants[0].barcodes[0].barcode, "5901234123457");
  assert.equal(input.variants[1].barcodes, undefined);
  assert.match(input.descriptionHtml, /Nie prześwituje/);
  assert.match(input.descriptionHtml, /Oszczędzasz 10%/);
  assert.doesNotMatch(input.descriptionHtml, /<script/i);
  assert.equal(input.metafields[1].value, "konwersja");
  const parsed = JSON.parse(input.metafields[0].value);
  assert.equal(parsed.benefits.length, 3);
});

test("szkic Shopify jest domyślnie włączony i nie aktywuje produktu", () => {
  assert.equal(shopifyAutoDraftEnabled(null), true);
  assert.equal(shopifyAutoDraftEnabled({}), true);
  assert.equal(shopifyAutoDraftEnabled({ shopify_auto_draft: false }), false);
  assert.equal(workflowForShopifyPush("pobrany", "draft"), "strona_gotowa");
  assert.equal(workflowForShopifyPush("opublikowany", "draft"), "opublikowany");
  assert.equal(workflowForShopifyPush("w_przygotowaniu", "active"), "opublikowany");
  assert.equal(workflowForShopifyPush("opublikowany", "hold"), "wstrzymany");
  assert.equal(workflowForShopifyPush("archiwum", "active"), "archiwum");
});
