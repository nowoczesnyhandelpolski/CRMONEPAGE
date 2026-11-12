import test from "node:test";
import assert from "node:assert/strict";
import { cleanSiteData } from "../lib/site-model.mjs";
import { renderLightPage } from "../lib/render.mjs";
import { legalDocs } from "../lib/legal.mjs";

const base = {
  headline: "Bombki", price: 49, images: [{ url: "https://x.pl/a.jpg", rights: true }],
  seller: { name: "Sklep", email: "a@b.pl" }, gpsr: { producer: "P" }
};
const row = { id: "pg1", slug: "bombki", name: "Bombki", status: "published" };

test("ID Pixela: tylko cyfry", () => {
  assert.equal(cleanSiteData({ tracking: { meta_pixel: " 123456789012345 " } }).tracking.meta_pixel, "123456789012345");
  assert.equal(cleanSiteData({ tracking: { meta_pixel: "<script>" } }).tracking.meta_pixel, "");
  assert.equal(cleanSiteData({}).tracking.meta_pixel, "");
});

test("z Pixelem strona pyta o zgodę i przekazuje ID do skryptu", () => {
  const html = renderLightPage(row, { ...base, tracking: { meta_pixel: "123456789012345" } }, { origin: "https://panel.example" });
  assert.match(html, /id="ckb"/);
  assert.match(html, /"metaPixel":"123456789012345"/);
  assert.doesNotMatch(html, /connect\.facebook\.net\/en_US\/fbevents\.js"><\/script>/);
});

test("bez Pixela i w podglądzie nie ma banera", () => {
  assert.doesNotMatch(renderLightPage(row, base, { origin: "https://panel.example" }), /id="ckb"/);
  const pv = renderLightPage(row, { ...base, tracking: { meta_pixel: "123456789012345" } }, { origin: "https://panel.example", preview: true });
  assert.doesNotMatch(pv, /id="ckb"/);
  assert.match(pv, /"metaPixel":""/);
});

test("polityka cookies opisuje Meta Pixel i zgodę", () => {
  const { cookies } = legalDocs(row, cleanSiteData(base));
  assert.match(cookies, /Meta Pixel/);
  assert.match(cookies, /art\. 6 ust\. 1 lit\. a RODO/);
});

test("Google Ads: tylko poprawne ID, baner zgody także bez Pixela Meta", () => {
  assert.equal(cleanSiteData({ tracking: { google_ads_id: "AW-123456789", google_ads_label: "AbC-12_x" } }).tracking.google_ads_id, "AW-123456789");
  assert.equal(cleanSiteData({ tracking: { google_ads_id: "G-XYZ" } }).tracking.google_ads_id, "");
  const html = renderLightPage(row, { ...base, tracking: { google_ads_id: "AW-123456789", google_ads_label: "AbCdEf" } }, { origin: "https://panel.example" });
  assert.match(html, /id="ckb"/);
  assert.match(html, /"googleAds":\{"id":"AW-123456789","label":"AbCdEf"\}/);
  assert.match(html, /"metaPixel":""/);
});
