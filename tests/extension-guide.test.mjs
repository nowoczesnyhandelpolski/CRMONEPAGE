import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSION_VERSION } from "../lib/extension-announce.mjs";
import { EXTENSION_CHANGELOG, extensionPageHtml } from "../lib/extension-guide.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = (value) => String(value ?? "");

test("zakładka Wtyczka jest w menu Produkty, obok Bazy produktów", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const oferty = fs.readFileSync(path.join(root, "oferty.js"), "utf8");
  assert.match(html, /baza-produktow", "wtyczka", "faktury-ksef"/);
  assert.match(html, /plug:'<path d="M15\.39/);
  assert.match(oferty, /\["wtyczka", "Wtyczka", "plug"\]/);
  assert.match(oferty, /VIEW_FNS\.wtyczka = \(\) => viewWtyczka\(\)/);
  assert.match(oferty, /extensionAnnounceHtml\(CRM\.esc, \{ dismiss: true \}\)/);
  assert.match(oferty, /extensionAnnounceHtml\(CRM\.esc, \{ dismiss: false \}\)/);
  assert.match(oferty, /data-nhp="download-ext"/);
  assert.match(html, /class="app" hidden/);
});

test("strona wtyczki: wersja i pobieranie są nad instrukcją", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
  const html = extensionPageHtml(id, { keys: [] });
  assert.equal(manifest.version, EXTENSION_VERSION);
  assert.equal(EXTENSION_CHANGELOG[0][0], EXTENSION_VERSION);
  assert.match(html, new RegExp(`data-ext-version="${EXTENSION_VERSION.replace(/\./g, "\\.")}"`));
  const download = html.indexOf('data-nhp="download-ext"');
  const install = html.indexOf("Jak wgrać wtyczkę");
  const update = html.indexOf("Jak zaktualizować");
  assert.ok(download > 0 && download < install && install < update);
  assert.match(html, /Pobierz wtyczkę \(\.zip\)/);
  assert.match(html, /chrome:\/\/extensions/);
  assert.match(html, /Tryb dewelopera/);
  assert.match(html, /Załaduj rozpakowane/);
  assert.match(html, /nadpisz/);
  assert.match(html, /Odśwież/);
});

test("klucze na liście są samą nazwą, pełny klucz tylko tuż po utworzeniu", () => {
  const secret = "nhp_storedsecretshouldneverappear";
  const fresh = "nhp_onlythismoment123";
  const html = extensionPageHtml(id, {
    freshKey: fresh,
    keys: [
      { id: "key_ani", label: "komputer Ani", secret, key: secret, key_hash: secret, created_at: "2026-11-20T09:00:00.000Z", revoked_at: null },
      { id: "key_old", label: "stary laptop", secret, created_at: "2026-10-02T09:00:00.000Z", revoked_at: "2026-11-01T09:00:00.000Z" }
    ]
  });
  assert.equal(html.includes(secret), false);
  assert.equal(html.split(fresh).length - 1, 1);
  assert.match(html, /komputer Ani/);
  assert.match(html, /stary laptop/);
  assert.match(html, /data-nhp="revoke" data-id="key_ani"/);
  assert.equal(html.includes('data-id="key_old"'), false);
  assert.match(html, /data-nhp="new-key"/);
  assert.match(html, /data-nav="klucze-api"/);
  const list = html.slice(html.indexOf('class="ext-keys"'), html.indexOf("Klucz zaczyna się"));
  assert.equal(list.includes(fresh), false);
  assert.equal(list.includes("nhp_"), false);
  assert.match(list, /komputer Ani/);
  assert.match(list, /Odwołany/);
});

test("instrukcja mówi po ludzku, skąd brać oferty i jak zrobić strony", () => {
  const html = extensionPageHtml(id, { keys: [] });
  for (const bit of [
    "klawisz E",
    "Zapisz w Centrali",
    "Eksport sklepu",
    "Nazwa",
    "Opis",
    "Zdjęcia",
    "Parametry",
    "EAN",
    "Producent",
    "Cena",
    "Zacznij sesję CSV",
    "Wstrzymaj",
    "pauza",
    "Zakończ i pobierz CSV",
    "Wyślij sesję do NHP",
    "Grupy",
    "Zrób stronę",
    "Zrób strony",
    "Baza produktów"
  ]) {
    assert.match(html, new RegExp(bit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(/service_role|SUPABASE_SERVICE|BEGIN PRIVATE|sk-[A-Za-z0-9]{8}/.test(html), false);
  const source = fs.readFileSync(path.join(root, "lib/extension-guide.mjs"), "utf8");
  assert.equal(/service_role|SUPABASE_SERVICE|BEGIN PRIVATE/.test(source), false);
});
