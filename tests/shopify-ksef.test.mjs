import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  partitionProducts,
  shopifyStatusFor,
  shouldAutoPush,
  workflowAfterPage,
  workflowFromShopify
} from "../lib/workflow.mjs";
import {
  buildProductSetInput,
  inboundProductPatch,
  normalizeShopifyOrder,
  paidEnough,
  polishNip,
  sellPrice,
  shopifyHmac,
  verifyShopifyHmac
} from "../lib/shopify-core.mjs";
import { buildFa3, splitGross } from "../lib/ksef-fa3.mjs";
import { certificateDer, ksefBase, ksefConfig, spkiFromCertificate, submitFa3 } from "../lib/ksef-client.mjs";
import { bytesToBase64 } from "../lib/shopify-core.mjs";

test("zakładki rozdzielają produkty ze stroną i bez", () => {
  const products = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const pages = [{ product_id: "b", status: "draft" }, { product_id: "c", status: "published" }];
  const split = partitionProducts(products, pages);
  assert.deepEqual(split.pobrane.map((item) => item.id), ["a"]);
  assert.deepEqual(split.gotowe.map((item) => item.id), ["b", "c"]);
});

test("status lejka mapuje się na Shopify i nie cofa szkicu", () => {
  assert.equal(shopifyStatusFor("opublikowany"), "ACTIVE");
  assert.equal(shopifyStatusFor("wstrzymany"), "DRAFT");
  assert.equal(shopifyStatusFor("archiwum"), "ARCHIVED");
  assert.equal(shopifyStatusFor("pobrany"), "DRAFT");
  assert.equal(workflowFromShopify("active", "strona_gotowa"), "opublikowany");
  assert.equal(workflowFromShopify("draft", "strona_gotowa"), "strona_gotowa");
  assert.equal(workflowFromShopify("draft", "opublikowany"), "wstrzymany");
  assert.equal(workflowFromShopify("archived", "opublikowany"), "archiwum");
  assert.equal(workflowAfterPage("pobrany", "draft"), "w_przygotowaniu");
  assert.equal(workflowAfterPage("w_przygotowaniu", "published"), "strona_gotowa");
  assert.equal(workflowAfterPage("opublikowany", "draft"), "opublikowany");
  assert.equal(shouldAutoPush({ workflow_status: "pobrany" }), false);
  assert.equal(shouldAutoPush({ workflow_status: "strona_gotowa" }), true);
  assert.equal(shouldAutoPush({ workflow_status: "pobrany", shopify_product_id: "9" }), true);
});

test("produkt do Shopify niesie cenę, EAN, SKU i opis strony", () => {
  const input = buildProductSetInput({
    name: "Kubek",
    catalog_name: "Kubek <em>",
    sku: "K-1",
    ean: "5901234123457",
    price: "10",
    workflow_status: "opublikowany",
    producer: "Huta",
    images: ["https://cdn.example/a.jpg", "javascript:alert(1)"]
  }, {
    data: {
      subheadline: "Ciepły napój",
      benefits: [{ title: "Ucho", text: "Nie parzy" }],
      bundles: [{ label: "2 szt.", price: "40,50" }]
    }
  });
  assert.equal(input.status, "ACTIVE");
  assert.equal(input.variants[0].sku, "K-1");
  assert.equal(input.variants[0].price, "40.50");
  assert.equal(input.variants[0].barcodes[0].barcode, "5901234123457");
  assert.equal(input.files.length, 1);
  assert.equal(input.title, "Kubek <em>");
  assert.match(input.descriptionHtml, /Ciepły napój/);
  assert.doesNotMatch(input.descriptionHtml, /<script/);
  const plain = buildProductSetInput({ name: "A <b>", description: "Linia <i>", price: 8, workflow_status: "pobrany" }, null);
  assert.match(plain.descriptionHtml, /Linia &lt;i&gt;/);
  assert.equal(sellPrice({ price: null }, null), null);
});

test("HMAC webhooka Shopify zgadza się tylko z surowym ciałem", async () => {
  const body = "{\"id\":1}";
  const secret = "sekret-testowy";
  const header = await shopifyHmac(body, secret);
  assert.equal(await verifyShopifyHmac(body, header, secret), true);
  assert.equal(await verifyShopifyHmac(body + " ", header, secret), false);
  assert.equal(await verifyShopifyHmac(body, header, ""), false);
});

test("zamówienie Shopify liczy brutto, NIP i dostawę", () => {
  const order = normalizeShopifyOrder({
    id: 1001,
    name: "#1001",
    email: "anna@example.com",
    financial_status: "paid",
    currency: "PLN",
    taxes_included: true,
    total_price: "113.00",
    billing_address: { name: "Anna Nowak", company: "NIP 8567346215", address1: "Długa 1", zip: "00-001", city: "Warszawa" },
    shipping_lines: [{ price: "13.00" }],
    line_items: [{
      id: 7,
      product_id: 55,
      sku: "K-1",
      title: "Kubek",
      quantity: 2,
      price: "50.00",
      discount_allocations: [{ amount: "0.00" }]
    }]
  });
  assert.equal(order.shopify_order_id, "1001");
  assert.equal(order.billing.nip, "8567346215");
  assert.equal(order.lines[0].line_total, 100);
  assert.equal(order.lines[1].title, "Dostawa");
  assert.equal(paidEnough(order.financial_status), true);
  assert.equal(polishNip("8567346214"), "");
});

test("zmiana ze Shopify nie cofa strony gotowej przy szkicu", () => {
  const patch = inboundProductPatch({
    id: 55,
    title: "Kubek nowy",
    body_html: "<p>Opis</p>",
    handle: "kubek",
    status: "draft",
    variants: [{ id: 9, price: "12.50", sku: "K-1", barcode: "5901234123457" }]
  }, "strona_gotowa", "sklep.myshopify.com");
  assert.equal(patch.workflow_status, "strona_gotowa");
  assert.equal(patch.price, "12.5");
  assert.equal(patch.shopify_url, "https://sklep.myshopify.com/products/kubek");
  assert.equal(patch.description, "Opis");
});

test("FA(3) ma schemat, sumy i nabywcę bez NIP", () => {
  const { xml, net, vat, gross } = buildFa3({
    number: "FV/2026/11/0001",
    currency: "PLN",
    issuedOn: "2026-11-11T10:00:00Z",
    createdAt: "2026-11-11T10:00:01Z",
    vatRate: 23,
    seller: { nip: "8567346215", name: "NHP <sp. z o.o.>", address1: "Długa 1", address2: "00-001 Warszawa" },
    buyer: { name: "Anna Nowak", address1: "Krótka 2", address2: "00-002 Kraków" },
    lines: [{ name: "Kubek", qty: 2, gross: 123, sku: "K-1" }]
  });
  assert.match(xml, /http:\/\/crd\.gov\.pl\/wzor\/2025\/06\/25\/13775\//);
  assert.match(xml, /kodSystemowy="FA \(3\)"/);
  assert.match(xml, /wersjaSchemy="1-0E"/);
  assert.match(xml, /<BrakID>1<\/BrakID>/);
  assert.match(xml, /NHP &lt;sp\. z o\.o\.&gt;/);
  assert.match(xml, /<P_19N>1<\/P_19N>/);
  assert.match(xml, /<P_22N>1<\/P_22N>/);
  assert.match(xml, /<P_PMarzyN>1<\/P_PMarzyN>/);
  assert.equal(splitGross(123, 23).gross, 123);
  assert.ok(Math.abs(net + vat - gross) < 0.001);
  assert.match(xml, new RegExp(`<P_15>${gross.toFixed(2)}</P_15>`));
  assert.match(xml, new RegExp(`<P_13_1>${net.toFixed(2)}</P_13_1>`));
  assert.throws(() => buildFa3({
    number: "FV/1",
    currency: "EUR",
    seller: { nip: "8567346215", name: "A", address1: "B" },
    buyer: { name: "C" },
    lines: [{ name: "X", qty: 1, gross: 10 }]
  }), /PLN/);
});

test("KSeF domyślnie celuje w środowisko testowe i nie startuje bez kompletu danych", () => {
  assert.equal(ksefBase(""), "https://api-test.ksef.mf.gov.pl/v2");
  assert.equal(ksefBase("prod"), "https://api.ksef.mf.gov.pl/v2");
  assert.equal(ksefConfig({ KSEF_TOKEN: "t" }), null);
  const config = ksefConfig({
    KSEF_TOKEN: "t",
    KSEF_NIP: "8567346215",
    KSEF_SELLER_NAME: "NHP",
    KSEF_SELLER_ADDRESS1: "Długa 1"
  });
  assert.equal(config.env, "test");
  assert.equal(config.base, "https://api-test.ksef.mf.gov.pl/v2");
});

function derLen(length) {
  if (length < 128) return Uint8Array.of(length);
  if (length < 256) return Uint8Array.of(0x81, length);
  return Uint8Array.of(0x82, (length >> 8) & 0xff, length & 0xff);
}

function der(tag, content) {
  const len = derLen(content.length);
  const out = new Uint8Array(1 + len.length + content.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(content, 1 + len.length);
  return out;
}

function seq(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return der(0x30, body);
}

function oid(bytes) {
  return der(0x06, bytes);
}

test("wysyłka FA(3) przechodzi atrapę API testowego KSeF", async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const rsaOid = oid(Uint8Array.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]));
  const shaOid = oid(Uint8Array.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]));
  const alg = seq(shaOid, Uint8Array.of(0x05, 0x00));
  const empty = seq();
  const time = (value) => der(0x17, new TextEncoder().encode(value));
  const validity = seq(time("250101000000Z"), time("350101000000Z"));
  const tbs = seq(der(0xa0, der(0x02, Uint8Array.of(0x02))), der(0x02, Uint8Array.of(0x01)), alg, empty, validity, empty, spki);
  const cert = seq(tbs, alg, der(0x03, Uint8Array.of(0x00, 0x01)));
  const extracted = spkiFromCertificate(certificateDer(bytesToBase64(cert)));
  assert.deepEqual(extracted, spki);
  const certB64 = bytesToBase64(cert);
  const seen = [];
  const fake = async (url, options = {}) => {
    seen.push(url);
    const path = new URL(url).pathname;
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (path.endsWith("/security/public-key-certificates")) {
      return json([
        { certificate: certB64, publicKeyId: "tok", validTo: "2035-01-01T00:00:00Z", usage: ["KsefTokenEncryption"] },
        { certificate: certB64, publicKeyId: "sym", validTo: "2035-01-01T00:00:00Z", usage: ["SymmetricKeyEncryption"] }
      ]);
    }
    if (path.endsWith("/auth/challenge")) return json({ challenge: "CH", timestampMs: 1700000000000 });
    if (path.endsWith("/auth/ksef-token")) {
      const body = JSON.parse(options.body);
      assert.equal(body.contextIdentifier.value, "8567346215");
      assert.ok(body.encryptedToken);
      return json({ referenceNumber: "AUTH", authenticationToken: { token: "auth-token" } }, 202);
    }
    if (path.endsWith("/auth/AUTH")) return json({ status: { code: 200, description: "ok" } });
    if (path.endsWith("/auth/token/redeem")) return json({ accessToken: { token: "access" } });
    if (path.endsWith("/sessions/online")) return json({ referenceNumber: "SES" }, 201);
    if (path.endsWith("/sessions/online/SES/invoices")) {
      const body = JSON.parse(options.body);
      assert.equal(body.invoiceSize > 0, true);
      assert.equal(typeof body.encryptedInvoiceContent, "string");
      return json({ referenceNumber: "INV" }, 202);
    }
    if (path.endsWith("/sessions/SES/invoices/INV")) return json({ status: { code: 200, description: "ok" }, ksefNumber: "8567346215-20261111-ABCDEF-123456-7A" });
    if (path.endsWith("/close")) return new Response(null, { status: 204 });
    throw new Error(`Nieznane wywołanie ${url}`);
  };
  const result = await submitFa3({
    config: { base: "https://api-test.ksef.mf.gov.pl/v2", token: "token-test", nip: "8567346215" },
    xml: "<Faktura/>",
    fetchImpl: fake,
    wait: async () => {},
    attempts: 2
  });
  assert.equal(result.ksefNumber, "8567346215-20261111-ABCDEF-123456-7A");
  assert.equal(result.pending, false);
  assert.ok(seen.some((url) => url.includes("api-test.ksef.mf.gov.pl")));
});

test("schemat i dokumentacja wymieniają sekrety tylko z nazwy", () => {
  const sql = fs.readFileSync(new URL("../supabase.sql", import.meta.url), "utf8");
  assert.match(sql, /workflow_status/);
  assert.match(sql, /apply_shopify_inbound/);
  assert.match(sql, /record_page_view/);
  assert.match(sql, /product_sales/);
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /using \(public\.is_team\(\)\)/);
  const doc = fs.readFileSync(new URL("../docs/shopify-ksef.md", import.meta.url), "utf8");
  for (const name of ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_TOKEN", "SHOPIFY_WEBHOOK_SECRET", "KSEF_TOKEN", "KSEF_NIP", "KSEF_ENV"]) {
    assert.match(doc, new RegExp(name));
  }
  assert.doesNotMatch(doc, /shpat_|shpss_/);
});
