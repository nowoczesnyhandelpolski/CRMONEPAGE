import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateDecrypt, constants } from "node:crypto";
import { readFileSync } from "node:fs";

import { shopifyStatusFor, workflowAfterShopify } from "../lib/workflow.mjs";
import {
  buildShopifyProduct,
  fingerprintFromRemote,
  normalizeShopDomain,
  normalizeShopifyOrder,
  planShopifyDelete,
  planShopifyInbound,
  statsFromOrders,
  verifyShopifyHmac
} from "../lib/shopify.mjs";
import { buildFa3Xml, ksefBaseUrl, ksefEnvironment, splitGross, validNip } from "../lib/ksef-fa3.mjs";
import { extractSpkiFromCert, sendFa3Invoice } from "../lib/ksef-client.mjs";
import { sha256Hex } from "../lib/supabase-rest.mjs";
import { renderLightPage } from "../lib/render.mjs";

test("status Shopify wynika ze statusu w panelu", () => {
  assert.equal(shopifyStatusFor("opublikowany"), "active");
  assert.equal(shopifyStatusFor("archiwum"), "archived");
  assert.equal(shopifyStatusFor("pobrany"), "draft");
  assert.equal(shopifyStatusFor("strona_gotowa"), "draft");
  assert.equal(shopifyStatusFor("wstrzymany"), "draft");
  assert.equal(workflowAfterShopify("active", "strona_gotowa"), "opublikowany");
  assert.equal(workflowAfterShopify("archived", "opublikowany"), "archiwum");
  assert.equal(workflowAfterShopify("draft", "opublikowany"), "wstrzymany");
  assert.equal(workflowAfterShopify("draft", "pobrany"), "pobrany");
  assert.equal(workflowAfterShopify("draft", "strona_gotowa"), "strona_gotowa");
});

test("domena Shopify to tylko host myshopify", () => {
  assert.equal(normalizeShopDomain("https://NHP-test.myshopify.com/admin"), "nhp-test.myshopify.com");
  assert.equal(normalizeShopDomain("sklep.pl"), "");
});

test("produkt do Shopify ma cenę, EAN, SKU, opis strony i status", () => {
  const built = buildShopifyProduct({
    name: "Kubek",
    catalog_name: "KUBEK ŹRÓDŁO",
    price: 49.5,
    ean: "5901234123457",
    sku: "KUB-1",
    brand: "ACME",
    workflow_status: "opublikowany",
    description: "Opis z bazy",
    images: ["https://cdn.example/a.jpg"]
  }, {
    status: "published",
    slug: "kubek",
    data: { headline: "Kubek na biurko", subheadline: "Emalia", images: [{ url: "https://cdn.example/prawa.jpg", rights: true }] }
  }, { origin: "https://panel.example", includeImages: true });
  assert.equal(built.product.title, "Kubek");
  assert.equal(built.product.status, "active");
  assert.equal(built.product.variants[0].price, "49.50");
  assert.equal(built.product.variants[0].barcode, "5901234123457");
  assert.equal(built.product.variants[0].sku, "KUB-1");
  assert.match(built.product.body_html, /Kubek na biurko/);
  assert.match(built.product.body_html, /\/p\/kubek/);
  assert.deepEqual(built.product.images.map((img) => img.src), ["https://cdn.example/prawa.jpg", "https://cdn.example/a.jpg"]);
});

test("echo webhooka nie nadpisuje nazwy, a inna cena tak", async () => {
  const local = {
    name: "Kubek",
    price: 10,
    sku: "K",
    ean: "1",
    description: "Opis",
    workflow_status: "opublikowany",
    shopify_product_id: "9",
    shopify_url: "https://sklep.example/products/kubek"
  };
  const remote = {
    id: 9,
    title: "Kubek",
    handle: "kubek",
    status: "active",
    body_html: "<p>Opis</p>",
    variants: [{ id: 3, price: "10.00", sku: "K", barcode: "1" }]
  };
  const hash = await sha256Hex(fingerprintFromRemote(remote));
  local.shopify_payload_hash = hash;
  const echo = planShopifyInbound({ local, remote, remoteHash: hash, nowIso: "2026-11-11T12:00:00Z" });
  assert.equal(echo.echo, true);
  assert.equal(echo.patch.name, undefined);
  assert.equal(echo.history, null);

  const changed = { ...remote, variants: [{ id: 3, price: "12.00", sku: "K", barcode: "1" }], status: "draft" };
  const changedHash = await sha256Hex(fingerprintFromRemote(changed));
  const plan = planShopifyInbound({ local, remote: changed, remoteHash: changedHash, nowIso: "2026-11-11T12:00:00Z" });
  assert.equal(plan.echo, false);
  assert.equal(plan.patch.price, 12);
  assert.equal(plan.patch.workflow_status, "wstrzymany");
  assert.equal(plan.history.to, "wstrzymany");
});

test("usunięcie w Shopify archiwizuje produkt i zdejmuje powiązanie", () => {
  const plan = planShopifyDelete({ workflow_status: "opublikowany" });
  assert.equal(plan.patch.workflow_status, "archiwum");
  assert.equal(plan.patch.shopify_product_id, null);
  assert.equal(plan.history.from, "opublikowany");
});

test("statystyki liczą opłacone sztuki, pomijają anulowane", () => {
  const product = { shopify_product_id: "15", sku: "KUB" };
  const stats = statsFromOrders([
    { financial_status: "paid", currency: "PLN", line_items: [{ product_id: "15", sku: "KUB", quantity: 2, price: "10.00" }] },
    { financial_status: "paid", cancelled_at: "2026-01-01", line_items: [{ product_id: "15", quantity: 5, price: "10" }] },
    { financial_status: "pending", line_items: [{ product_id: "15", quantity: 1, price: "10" }] },
    { financial_status: "paid", line_items: [{ product_id: "99", sku: "INNY", quantity: 1, price: "10" }] }
  ], product);
  assert.equal(stats.orders_count, 1);
  assert.equal(stats.units_sold, 2);
  assert.equal(stats.revenue, 20);
});

test("zamówienie Shopify zostawia nabywcę bez całego surowego JSON", () => {
  const row = normalizeShopifyOrder({
    id: 77,
    name: "#1001",
    email: "a@b.co",
    financial_status: "paid",
    currency: "PLN",
    total_price: "40.00",
    processed_at: "2026-11-11T10:00:00Z",
    billing_address: { name: "Anna Nowak", address1: "Długa 1", zip: "00-001", city: "Warszawa", country_code: "PL", company: "NIP 1111111111" },
    note_attributes: [{ name: "NIP", value: "1111111111" }],
    line_items: [{ id: 1, product_id: 15, variant_id: 4, sku: "K", title: "Kubek", quantity: 1, price: "40.00" }],
    customer: { email: "a@b.co", phone: "500600700" }
  });
  assert.equal(row.shopify_order_id, "77");
  assert.equal(row.buyer.nip, "1111111111");
  assert.equal(row.buyer.name, "Anna Nowak");
  assert.equal(row.buyer.phone, undefined);
  assert.equal(row.line_items[0].sku, "K");
});

test("HMAC Shopify odrzuca podmienione body", async () => {
  const secret = "shpss_test";
  const body = "{\"id\":1}";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  let binary = "";
  for (const b of sig) binary += String.fromCharCode(b);
  const header = btoa(binary);
  assert.equal(await verifyShopifyHmac(body, header, secret), true);
  assert.equal(await verifyShopifyHmac(body + " ", header, secret), false);
  assert.equal(await verifyShopifyHmac(body, header, "inny"), false);
});

test("FA(3) ma namespace, NIP albo BrakID i sumy VAT", () => {
  assert.equal(validNip("1111111111"), true);
  assert.equal(validNip("1234567890"), false);
  assert.equal(ksefEnvironment(""), "test");
  assert.equal(ksefEnvironment("PROD"), "prod");
  assert.equal(ksefBaseUrl("test"), "https://api-test.ksef.mf.gov.pl/v2");
  const parts = splitGross(123, 23);
  assert.equal(parts.net, 100);
  assert.equal(parts.vat, 23);
  const draft = buildFa3Xml({
    number: "FV/2026/0001",
    seller: { nip: "1111111111", name: "A & B <sp>", address1: "Długa 1", email: "sklep@example.com" },
    buyer: { name: "Anna", address1: "Krótka 2", zip: "00-002", city: "Kraków", country: "PL", email: "a@b.co" },
    lines: [{ name: "Kubek", quantity: 1, gross: 123 }],
    vatRate: 23,
    issuedOn: "2026-11-11",
    soldOn: "2026-11-11",
    paid: true,
    now: new Date("2026-11-11T12:00:00Z")
  });
  assert.match(draft.xml, /http:\/\/crd\.gov\.pl\/wzor\/2025\/06\/25\/13775\//);
  assert.match(draft.xml, /kodSystemowy="FA \(3\)"/);
  assert.match(draft.xml, /<NIP>1111111111<\/NIP>/);
  assert.match(draft.xml, /A &amp; B &lt;sp&gt;/);
  assert.match(draft.xml, /<BrakID>1<\/BrakID>/);
  assert.match(draft.xml, /<P_13_1>100\.00<\/P_13_1>/);
  assert.match(draft.xml, /<P_14_1>23\.00<\/P_14_1>/);
  assert.match(draft.xml, /<P_15>123\.00<\/P_15>/);
  assert.match(draft.xml, /<P_2>FV\/2026\/0001<\/P_2>/);
  assert.match(draft.xml, /<Zaplacono>1<\/Zaplacono>/);
  assert.doesNotMatch(draft.xml, /<P_6>/);
  const exempt = buildFa3Xml({
    number: "FV/2026/0002",
    seller: { nip: "1111111111", name: "Sklep", address1: "Długa 1" },
    buyer: { name: "Firma", nip: "1111111111", address1: "Rynek 1" },
    lines: [{ name: "Usługa", quantity: 1, gross: 50 }],
    vatRate: "zw",
    issuedOn: "2026-11-11",
    paid: false,
    now: new Date("2026-11-11T12:00:00Z")
  });
  assert.match(exempt.xml, /<P_13_7>50\.00<\/P_13_7>/);
  assert.match(exempt.xml, /<P_19>1<\/P_19>/);
  assert.match(exempt.xml, /<NIP>1111111111<\/NIP>[\s\S]*<NIP>1111111111<\/NIP>/);
  assert.doesNotMatch(exempt.xml, /<P_13_1>/);
});

test("piksel odwiedzin jest tylko na opublikowanej stronie", () => {
  const live = renderLightPage({ id: "1", slug: "kubek", name: "Kubek", status: "published" }, {
    headline: "Kubek", price: 10, images: [{ url: "https://cdn.example/a.jpg", rights: true }]
  }, { origin: "https://panel.example" });
  assert.match(live, /var slug="kubek"/);
  assert.match(live, /sendBeacon/);
  const preview = renderLightPage({ id: "1", slug: "kubek", name: "Kubek", status: "draft" }, {
    headline: "Kubek", price: 10
  }, { preview: true, origin: "https://panel.example" });
  assert.doesNotMatch(preview, /sendBeacon/);
});

test("klucz z certyfikatu KSeF szyfruje RSA-OAEP, a klient wysyła FA(3)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ksef-"));
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath, "-out", certPath, "-days", "2", "-nodes", "-subj", "/CN=ksef-test"], { stdio: "ignore" });
  const der = execFileSync("openssl", ["x509", "-in", certPath, "-outform", "DER"]);
  const spki = extractSpkiFromCert(der);
  const key = await crypto.subtle.importKey("spki", spki, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const secret = new TextEncoder().encode("token|1700000000000");
  const encrypted = Buffer.from(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, secret));
  const opened = privateDecrypt({ key: readFileSync(keyPath), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, encrypted);
  assert.equal(opened.toString(), "token|1700000000000");

  const certificate = Buffer.from(der).toString("base64");
  const publicKeyId = `${"A".repeat(43)}=`;
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(`${opts.method || "GET"} ${url}`);
    const path = String(url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (path.endsWith("/auth/challenge")) return json({ challenge: "20261111-CR-TEST", timestampMs: 1700000000000, timestamp: "2026-11-11T12:00:00Z" });
    if (path.endsWith("/security/public-key-certificates")) {
      return json([
        { certificate, publicKeyId, validFrom: "2020-01-01T00:00:00Z", validTo: "2030-01-01T00:00:00Z", usage: ["KsefTokenEncryption", "SymmetricKeyEncryption"] }
      ]);
    }
    if (path.endsWith("/auth/ksef-token")) return json({ referenceNumber: "20261111-AU-1", authenticationToken: { token: "op" } }, 202);
    if (path.includes("/auth/20261111-AU-1")) return json({ status: { code: 200, description: "ok" } });
    if (path.endsWith("/auth/token/redeem")) return json({ accessToken: { token: "access" } });
    if (path.endsWith("/sessions/online")) return json({ referenceNumber: "20261111-SO-1" }, 201);
    if (path.endsWith("/invoices")) return json({ referenceNumber: "20261111-EE-1" }, 202);
    if (path.endsWith("/close")) return json({});
    if (path.includes("/invoices/")) return json({ status: { code: 200, description: "ok" }, ksefNumber: "1111111111-20261111-0100-01", upoDownloadUrl: "https://upo.example/1" });
    return json({ message: "nieznane" }, 500);
  };
  const result = await sendFa3Invoice({
    envName: "test",
    ksefToken: "token-testowy",
    nip: "1111111111",
    xml: "<Faktura/>",
    fetchImpl,
    sleep: async () => {},
    attempts: 2,
    now: new Date("2026-11-11T12:00:00Z")
  });
  assert.equal(result.ksefNumber, "1111111111-20261111-0100-01");
  assert.equal(result.sessionReference, "20261111-SO-1");
  assert.ok(calls.some((line) => line.startsWith("POST ") && line.includes("/sessions/online")));
  assert.ok(calls.some((line) => line.includes("api-test.ksef.mf.gov.pl")));
});
