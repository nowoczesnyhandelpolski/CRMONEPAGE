/** FA(3), schemat 1-0E. Namespace z CRD, 25.06.2025. */

export const FA3_NS = "http://crd.gov.pl/wzor/2025/06/25/13775/";

const VAT_FIELDS = {
  23: ["P_13_1", "P_14_1"],
  8: ["P_13_2", "P_14_2"],
  5: ["P_13_3", "P_14_3"],
  0: ["P_13_6_1", null],
  zw: ["P_13_7", null]
};

export function ksefEnvironment(value) {
  const name = String(value || "test").trim().toLowerCase();
  if (name === "prod" || name === "production") return "prod";
  if (name === "demo") return "demo";
  return "test";
}

export function ksefBaseUrl(value) {
  const env = ksefEnvironment(value);
  if (env === "prod") return "https://api.ksef.mf.gov.pl/v2";
  if (env === "demo") return "https://api-demo.ksef.mf.gov.pl/v2";
  return "https://api-test.ksef.mf.gov.pl/v2";
}

export function warsawDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function utcStamp(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function validNip(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(d)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
  return sum % 11 === Number(d[9]);
}

export function normalizeVatRate(value) {
  const raw = String(value ?? "23").trim().toLowerCase().replace("%", "");
  if (raw === "zw" || raw === "zwolniony" || raw === "np") return "zw";
  if (raw === "23" || raw === "8" || raw === "5" || raw === "0") return Number(raw);
  return 23;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function splitGross(gross, rate) {
  const g = round2(gross);
  if (rate === "zw" || rate === 0) return { net: g, vat: 0, gross: g };
  const net = round2(g / (1 + Number(rate) / 100));
  const vat = round2(g - net);
  return { net, vat, gross: round2(net + vat) };
}

function xml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" }[c]));
}

function amount(n) {
  return round2(n).toFixed(2);
}

function qty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "1";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(round2(v));
}

export function paymentFormCode(gateway) {
  const g = String(gateway || "").toLowerCase();
  if (/blik|card|karta|visa|mastercard/.test(g)) return "2";
  if (/przelew|transfer|bank/.test(g)) return "6";
  if (/pobrani|cod|cash/.test(g)) return "1";
  return "6";
}

function lineXml(line, index, rate) {
  const parts = splitGross(Number(line.gross) || 0, rate);
  const unitNet = (Number(line.quantity) || 1) === 0 ? parts.net : round2(parts.net / (Number(line.quantity) || 1));
  const rateTag = rate === "zw" ? "zw" : String(rate);
  return `<FaWiersz><NrWierszaFa>${index}</NrWierszaFa><P_7>${xml(String(line.name || "Pozycja").slice(0, 240))}</P_7><P_8A>szt.</P_8A><P_8B>${qty(line.quantity || 1)}</P_8B><P_9A>${amount(unitNet)}</P_9A><P_11>${amount(parts.net)}</P_11><P_12>${rateTag}</P_12></FaWiersz>`;
}

/**
 * Buduje XML FA(3) dla faktury VAT (albo zwolnionej).
 * lines: [{ name, quantity, gross }] — gross to wartość brutto pozycji.
 */
export function buildFa3Xml({
  number,
  seller,
  buyer,
  lines,
  currency = "PLN",
  vatRate = 23,
  issuedOn,
  soldOn,
  paid = true,
  paidOn,
  gateway = "",
  now = new Date()
} = {}) {
  const rate = normalizeVatRate(vatRate);
  const issue = issuedOn || warsawDate(now);
  const rows = (lines || []).filter((line) => Number(line.gross) > 0);
  if (!rows.length) {
    const err = new Error("Faktura nie ma pozycji z kwotą.");
    err.status = 400;
    throw err;
  }
  let net = 0;
  let vat = 0;
  let gross = 0;
  rows.forEach((line) => {
    const parts = splitGross(line.gross, rate);
    net = round2(net + parts.net);
    vat = round2(vat + parts.vat);
    gross = round2(gross + parts.gross);
  });
  const drift = round2(gross - net - vat);
  if (drift !== 0) vat = round2(vat + drift);

  const [netField, vatField] = VAT_FIELDS[rate] || VAT_FIELDS[23];
  const sellerNip = String(seller?.nip || "").replace(/\D/g, "");
  const buyerNip = validNip(buyer?.nip) ? String(buyer.nip).replace(/\D/g, "") : "";
  const country = /^[A-Z]{2}$/.test(String(buyer?.country || "")) ? buyer.country : "PL";
  const buyerAddress = [buyer?.address1, buyer?.zip, buyer?.city].filter(Boolean).join(", ") || "nie podano";
  const sale = soldOn && soldOn !== issue ? `<P_6>${xml(soldOn)}</P_6>` : "";
  const zwolnienie = rate === "zw"
    ? "<Zwolnienie><P_19>1</P_19><P_19A>art. 113 ust. 1 lub ust. 9 ustawy o podatku od towarów i usług</P_19A></Zwolnienie>"
    : "<Zwolnienie><P_19N>1</P_19N></Zwolnienie>";
  const sums = `<${netField}>${amount(net)}</${netField}>${vatField ? `<${vatField}>${amount(vat)}</${vatField}>` : ""}<P_15>${amount(gross)}</P_15>`;
  const payDate = paidOn || issue;
  const payment = paid
    ? `<Platnosc><Zaplacono>1</Zaplacono><DataZaplaty>${xml(payDate)}</DataZaplaty><FormaPlatnosci>${paymentFormCode(gateway)}</FormaPlatnosci></Platnosc>`
    : `<Platnosc><TerminPlatnosci><Termin>${xml(issue)}</Termin></TerminPlatnosci><FormaPlatnosci>${paymentFormCode(gateway)}</FormaPlatnosci></Platnosc>`;
  const sellerMail = seller?.email ? `<DaneKontaktowe><Email>${xml(seller.email)}</Email></DaneKontaktowe>` : "";
  const buyerMail = buyer?.email ? `<DaneKontaktowe><Email>${xml(buyer.email)}</Email></DaneKontaktowe>` : "";
  const address2 = seller?.address2 ? `<AdresL2>${xml(seller.address2)}</AdresL2>` : "";
  const buyerId = buyerNip ? `<NIP>${buyerNip}</NIP>` : "<BrakID>1</BrakID>";
  const currencyCode = /^[A-Z]{3}$/.test(String(currency || "")) ? currency : "PLN";

  const body = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Faktura xmlns="${FA3_NS}">` +
    `<Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza><DataWytworzeniaFa>${xml(utcStamp(now))}</DataWytworzeniaFa><SystemInfo>Centrala NHP</SystemInfo></Naglowek>` +
    `<Podmiot1><DaneIdentyfikacyjne><NIP>${xml(sellerNip)}</NIP><Nazwa>${xml(seller?.name || "")}</Nazwa></DaneIdentyfikacyjne><Adres><KodKraju>PL</KodKraju><AdresL1>${xml(seller?.address1 || "")}</AdresL1>${address2}</Adres>${sellerMail}</Podmiot1>` +
    `<Podmiot2><DaneIdentyfikacyjne>${buyerId}<Nazwa>${xml(buyer?.name || "Nabywca")}</Nazwa></DaneIdentyfikacyjne><Adres><KodKraju>${xml(country)}</KodKraju><AdresL1>${xml(buyerAddress)}</AdresL1></Adres>${buyerMail}<JST>2</JST><GV>2</GV></Podmiot2>` +
    `<Fa><KodWaluty>${currencyCode}</KodWaluty><P_1>${xml(issue)}</P_1><P_2>${xml(number)}</P_2>${sale}${sums}` +
    `<Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A>${zwolnienie}<NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje>` +
    `<RodzajFaktury>VAT</RodzajFaktury>` +
    rows.map((line, i) => lineXml(line, i + 1, rate)).join("") +
    payment +
    `</Fa></Faktura>`;

  return { xml: body, net, vat, gross, currency: currencyCode, vatRate: rate };
}

export function linesFromShopifyOrder(order, vatRate) {
  const rate = normalizeVatRate(vatRate);
  const items = order?.line_items || [];
  const lines = items
    .map((line) => ({
      name: line.title || "Pozycja",
      quantity: Number(line.quantity) || 1,
      gross: round2((Number(line.quantity) || 0) * (Number(line.price) || 0))
    }))
    .filter((line) => line.gross > 0);
  if (lines.length) return { lines, rate };
  const total = round2(order?.total || 0);
  if (total > 0) return { lines: [{ name: `Zamówienie ${order.order_number || ""}`.trim(), quantity: 1, gross: total }], rate };
  return { lines: [], rate };
}

export function sellerFromEnv(env) {
  return {
    nip: String(env?.KSEF_NIP || "").replace(/\D/g, ""),
    name: String(env?.KSEF_SELLER_NAME || "").trim(),
    address1: String(env?.KSEF_SELLER_ADDRESS || "").trim(),
    address2: String(env?.KSEF_SELLER_ADDRESS_L2 || "").trim(),
    email: String(env?.KSEF_SELLER_EMAIL || "").trim(),
    vatRate: normalizeVatRate(env?.KSEF_VAT_RATE || "23")
  };
}

export function sellerConfigured(seller) {
  return Boolean(seller?.nip && /^\d{10}$/.test(seller.nip) && seller.name && seller.address1);
}

export function ksefAutoEnabled(env) {
  return String(env?.KSEF_AUTO ?? "1").trim() !== "0";
}
