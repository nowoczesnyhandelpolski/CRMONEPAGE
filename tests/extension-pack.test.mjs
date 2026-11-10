import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSION_FILES, readZipStore, zipStore } from "../lib/extension-pack.mjs";
import { EXTENSION_ZIP_BASE64 } from "../lib/extension-zip-data.mjs";
import { decodeZipBase64 } from "../lib/extension-pack.mjs";
import { BANNER_STORAGE_KEY, bannerDismissed, EXTENSION_HEADLINE, EXTENSION_VERSION, extensionAnnounceHtml } from "../lib/extension-announce.mjs";
import { routeConflicts } from "../lib/routes.mjs";
import { extensionZipResponse } from "../lib/extension-download.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extDir = path.join(root, "extension");

function sources() {
  return EXTENSION_FILES.map((name) => ({
    name,
    data: new Uint8Array(fs.readFileSync(path.join(extDir, name)))
  }));
}

test("ZIP wtyczki zgadza się z katalogiem extension/", () => {
  const built = zipStore(sources());
  const committed = new Uint8Array(fs.readFileSync(path.join(root, "downloads", "nhp-wtyczka.zip")));
  const embedded = decodeZipBase64(EXTENSION_ZIP_BASE64);
  assert.deepEqual(committed, built);
  assert.deepEqual(embedded, built);
  const entries = readZipStore(committed);
  assert.equal(entries.size, EXTENSION_FILES.length);
  for (const file of sources()) {
    assert.ok(entries.has(file.name), file.name);
    assert.deepEqual(entries.get(file.name), file.data);
  }
});

test("skrypt treści nie jest modułem z manifestu, selektory zostają osobnym plikiem", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));
  const content = fs.readFileSync(path.join(extDir, "content.js"), "utf8");
  const selectors = fs.readFileSync(path.join(extDir, "selectors.mjs"), "utf8");
  assert.equal(manifest.version, EXTENSION_VERSION);
  assert.equal(manifest.content_scripts[0].type, undefined);
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js"]);
  assert.ok(manifest.web_accessible_resources[0].resources.includes("selectors.mjs"));
  assert.ok(manifest.web_accessible_resources[0].resources.includes("extract.mjs"));
  assert.match(content, /chrome\.runtime\.getURL\("selectors\.mjs"\)/);
  assert.equal(/^import\s/m.test(content), false);
  assert.match(selectors, /export function extractOffer/);
  assert.match(selectors, /SELECTORS/);
});

test("ogłoszenie wtyczki: wersja, kroki i zamknięcie per wersja", () => {
  const html = extensionAnnounceHtml((v) => v, { dismiss: true });
  assert.match(html, new RegExp(EXTENSION_HEADLINE));
  assert.match(html, /1\.0\.1/);
  assert.match(html, /Pobierz wtyczkę \(\.zip\)/);
  assert.match(html, /Tryb dewelopera/);
  assert.match(html, /bez zgadywania|Brak ceny/);
  assert.match(html, /Publikacja zawsze ręczna/);
  assert.equal(bannerDismissed("1.0.1"), true);
  assert.equal(bannerDismissed("1.0.0"), false);
  assert.equal(bannerDismissed(""), false);
  assert.equal(BANNER_STORAGE_KEY, "nhp-ext-banner");
});

test("ZIP bez sesji zespołu nie schodzi", async () => {
  const res = await extensionZipResponse(new Request("https://panel.example/api/extension.zip"), {});
  assert.equal(res.status, 401);
  const body = await res.text();
  assert.equal(body.includes("PK"), false);
  assert.match(res.headers.get("x-robots-tag"), /noindex/);
});

test("trasa ZIP nie nachodzi na resztę Pages", () => {
  const routes = JSON.parse(fs.readFileSync(path.join(root, "_routes.json"), "utf8"));
  assert.ok(routes.include.includes("/downloads/nhp-wtyczka.zip"));
  assert.ok(routes.include.includes("/api/*"));
  assert.deepEqual(routeConflicts(routes.include, routes.exclude), []);
});
