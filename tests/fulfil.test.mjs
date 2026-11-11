import test from "node:test";
import assert from "node:assert/strict";
import {
  parseShipTo, splitStreet, cleanPhone, pickSku, safetyCheck, backoffMinutes,
  bigbuyOrderBody, pickTotal, cheapestShipping, orderIdFromLocation,
  inpostShipmentBody, inpostState, supplierEmail
} from "../lib/fulfil-core.mjs";

const buyer = { name: "Jan Kowalski", phone: "+48 500 600 700", email: "jan@example.com" };

test("adres ze Stripe: imię, ulica, kod i miasto", () => {
  const a = parseShipTo("Test Testowy, ul. Testowa 1, 00-001 Warszawa", { phone: "+48500000000" });
  assert.equal(a.kind, "address");
  assert.equal(a.street, "Testowa");
  assert.equal(a.building, "1");
  assert.equal(a.postcode, "00-001");
  assert.equal(a.city, "Warszawa");
  assert.equal(a.first, "Test");
  assert.equal(a.last, "Testowy");
  assert.equal(a.phone, "500000000");
});

test("adres z formularza bez imienia bierze dane kupującego", () => {
  const a = parseShipTo("Długa 12/4, 31-147 Kraków", buyer);
  assert.equal(a.street, "Długa");
  assert.equal(a.building, "12/4");
  assert.equal(a.first, "Jan");
  assert.equal(a.last, "Kowalski");
});

test("kod paczkomatu sam albo z dopiskiem", () => {
  assert.deepEqual(parseShipTo("waw01m", buyer).point, "WAW01M");
  const b = parseShipTo("Paczkomat KRA010", buyer);
  assert.equal(b.kind, "locker");
  assert.equal(b.point, "KRA010");
});

test("niepełny adres trafia do sprawdzenia, nie do dostawcy", () => {
  assert.equal(parseShipTo("Warszawa", buyer), null);
  assert.equal(parseShipTo("", buyer), null);
  assert.equal(parseShipTo("Kowalski, 00-001 Warszawa", buyer), null);
});

test("ulica i numer z prefiksem oraz mieszkaniem", () => {
  assert.deepEqual(splitStreet("al. Jana Pawła II 15 m 3"), { street: "Jana Pawła II", building: "15/3" });
  assert.deepEqual(splitStreet("Polna 7A"), { street: "Polna", building: "7A" });
  assert.equal(cleanPhone("0048 600-700-800"), "600700800");
});

test("SKU wariantu ma pierwszeństwo", () => {
  const rule = { sku: "BASE", variant_skus: { Czarny: "BLK-1" } };
  assert.equal(pickSku(rule, "Czarny"), "BLK-1");
  assert.equal(pickSku(rule, "Biały"), "BASE");
  assert.equal(pickSku({}, ""), "");
});

test("limity bezpieczeństwa blokują wydatek", () => {
  const settings = { max_order_cost: 300, daily_cap: 1000, min_margin: 5 };
  assert.equal(safetyCheck({ price: 100, cost: 60, settings, spentToday: 0 }).ok, true);
  assert.match(safetyCheck({ price: 500, cost: 350, settings, spentToday: 0 }).reason, /limit jednego/);
  assert.match(safetyCheck({ price: 100, cost: 60, settings, spentToday: 980 }).reason, /Dzienny limit/);
  assert.match(safetyCheck({ price: 62, cost: 60, settings, spentToday: 0 }).reason, /Marża/);
  assert.match(safetyCheck({ price: 62, cost: null, settings, spentToday: 0 }).reason, /Nie znam kosztu/);
});

test("ponowienia rosną i mają koniec", () => {
  assert.deepEqual([1, 2, 3, 4].map(backoffMinutes), [5, 20, 60, 60]);
});

test("zamówienie BigBuy z saldem (moneybox)", () => {
  const address = parseShipTo("Jan Kowalski, ul. Polna 7A, 00-950 Warszawa", buyer);
  const body = bigbuyOrderBody({ reference: "S-1", address, sku: "V123", qty: 2, carrier: "GLS" });
  assert.equal(body.order.paymentMethod, "moneybox");
  assert.equal(body.order.shippingAddress.address, "Polna 7A");
  assert.deepEqual(body.order.products, [{ reference: "V123", quantity: 2 }]);
  assert.deepEqual(body.order.carriers, [{ name: "GLS" }]);
});

test("odczyt kwoty, najtańszej wysyłki i numeru zamówienia BigBuy", () => {
  assert.equal(pickTotal({ order: { totalAmount: "12.5" } }), 12.5);
  assert.equal(pickTotal({}), null);
  assert.deepEqual(cheapestShipping({ shippingOptions: [{ shippingService: { name: "DHL" }, cost: 9 }, { shippingService: { name: "GLS" }, cost: 6.4 }] }), { name: "GLS", cost: 6.4 });
  assert.equal(orderIdFromLocation("https://api.bigbuy.eu/rest/order/987654"), "987654");
});

test("przesyłka InPost: paczkomat i kurier", () => {
  const locker = inpostShipmentBody({ address: parseShipTo("WAW01M", buyer), reference: "S-1" });
  assert.equal(locker.service, "inpost_locker_standard");
  assert.equal(locker.custom_attributes.target_point, "WAW01M");
  assert.deepEqual(locker.parcels, { template: "small" });
  const courier = inpostShipmentBody({ address: parseShipTo("Długa 12/4, 31-147 Kraków", buyer), size: "medium", reference: "S-2" });
  assert.equal(courier.service, "inpost_courier_standard");
  assert.equal(courier.receiver.address.post_code, "31-147");
  assert.equal(courier.parcels[0].dimensions.height, "190");
});

test("statusy InPost", () => {
  assert.equal(inpostState("delivered"), "delivered");
  assert.equal(inpostState("taken_by_courier"), "shipped");
  assert.equal(inpostState("confirmed"), "");
});

test("e-mail do hurtowni ma wszystko, czego potrzebuje magazyn", () => {
  const address = parseShipTo("WAW01M", buyer);
  const { subject, text } = supplierEmail({ number: "S-9", sku: "AB-1", productName: "Kubek", qty: 2, variant: "Czerwony", address, sender: { name: "NHP" } });
  assert.match(subject, /S-9/);
  for (const s of ["AB-1", "Ilość: 2", "Wariant: Czerwony", "Paczkomat InPost: WAW01M", "Telefon: 500600700", "NHP"]) assert.ok(text.includes(s), s);
});
