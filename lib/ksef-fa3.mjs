import { round2 } from "./shopify-core.mjs";

export const FA3_NS = "http://crd.gov.pl/wzor/2025/06/25/13775/";

export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function money(value) {
  return round2(value).toFixed(2);
}

/** Cena w Shopify jest brutto. FA(3) chce netto i VAT osobno. */
export function splitGross(gross, rate) {
  const total = round2(gross);
  const numeric = Number(rate);
  if (!numeric) return { net: total, vat: 0, gross: total };
  const net = round2(total / (1 + numeric / 100));
  const vat = round2(total - net);
  return { net, vat, gross: round2(net + vat) };
}

function utcStamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("Zła data faktury.");
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function dayStamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("Zła data faktury.");
  return date.toISOString().slice(0, 10);
}

function addressXml(address1, address2) {
  if (!address1) return "";
  return `<Adres><KodKraju>PL</KodKraju><AdresL1>${xmlEscape(address1)}</AdresL1>${address2 ? `<AdresL2>${xmlEscape(address2)}</AdresL2>` : ""}</Adres>`;
}

/**
 * Faktura VAT FA(3) dla zamówienia Shopify.
 * Jedna stawka na cały dokument (domyślnie 23). Waluta tylko PLN.
 */
export function buildFa3(input) {
  const currency = String(input.currency || "PLN").toUpperCase();
  if (currency !== "PLN") {
    const err = new Error("Ta wersja wystawia faktury KSeF tylko w PLN.");
    err.status = 422;
    throw err;
  }
  const seller = input.seller || {};
  const buyer = input.buyer || {};
  if (!seller.nip || !seller.name || !seller.address1) {
    const err = new Error("Brak danych sprzedawcy (NIP, nazwa, adres).");
    err.status = 422;
    throw err;
  }
  const lines = (input.lines || []).filter((line) => line && Number(line.gross) > 0);
  if (!lines.length) {
    const err = new Error("Faktura nie ma pozycji.");
    err.status = 422;
    throw err;
  }
  const exempt = input.vatRate === "zw" || input.vatRate === 0 || input.vatRate === "0";
  const rate = exempt ? 0 : Number(input.vatRate || 23);
  if (![0, 5, 8, 23].includes(rate)) {
    const err = new Error("Obsługiwane stawki VAT: 23, 8, 5 albo zw.");
    err.status = 422;
    throw err;
  }
  const priced = lines.map((line, index) => {
    const parts = splitGross(line.gross, rate);
    return { ...line, index: index + 1, ...parts, qty: Number(line.qty) || 1 };
  });
  const net = round2(priced.reduce((sum, line) => sum + line.net, 0));
  const vat = round2(priced.reduce((sum, line) => sum + line.vat, 0));
  const gross = round2(net + vat);
  const issued = dayStamp(input.issuedOn || input.createdAt || new Date());
  const created = utcStamp(input.createdAt || new Date());
  const rateTag = exempt ? "zw" : String(rate);
  const sums = exempt
    ? `<P_13_7>${money(net)}</P_13_7>`
    : rate === 8
      ? `<P_13_2>${money(net)}</P_13_2><P_14_2>${money(vat)}</P_14_2>`
      : rate === 5
        ? `<P_13_3>${money(net)}</P_13_3><P_14_3>${money(vat)}</P_14_3>`
        : `<P_13_1>${money(net)}</P_13_1><P_14_1>${money(vat)}</P_14_1>`;
  const rows = priced.map((line) => {
    const qty = line.qty || 1;
    const unit = round2(line.net / qty);
    const exact = round2(unit * qty) === round2(line.net);
    const shownQty = exact ? qty : 1;
    const shownUnit = exact ? unit : line.net;
    const name = exact || qty === 1 ? (line.name || "Towar") : `${line.name || "Towar"} (${qty} szt.)`;
    return `<FaWiersz><NrWierszaFa>${line.index}</NrWierszaFa><P_7>${xmlEscape(name)}</P_7>${line.sku ? `<Indeks>${xmlEscape(line.sku)}</Indeks>` : ""}${line.gtin ? `<GTIN>${xmlEscape(line.gtin)}</GTIN>` : ""}<P_8A>szt.</P_8A><P_8B>${shownQty}</P_8B><P_9A>${money(shownUnit)}</P_9A><P_11>${money(line.net)}</P_11><P_12>${rateTag}</P_12></FaWiersz>`;
  }).join("");
  const buyerId = buyer.nip
    ? `<NIP>${xmlEscape(buyer.nip)}</NIP><Nazwa>${xmlEscape(buyer.name || "Nabywca")}</Nazwa>`
    : `<BrakID>1</BrakID><Nazwa>${xmlEscape(buyer.name || "Nabywca")}</Nazwa>`;
  const zwolnienie = exempt
    ? `<Zwolnienie><P_19>1</P_19><P_19A>${xmlEscape(input.exemptBasis || "art. 113 ust. 1 ustawy o VAT")}</P_19A></Zwolnienie>`
    : "<Zwolnienie><P_19N>1</P_19N></Zwolnienie>";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Faktura xmlns="${FA3_NS}">` +
    `<Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza><DataWytworzeniaFa>${created}</DataWytworzeniaFa><SystemInfo>Centrala NHP</SystemInfo></Naglowek>` +
    `<Podmiot1><DaneIdentyfikacyjne><NIP>${xmlEscape(seller.nip)}</NIP><Nazwa>${xmlEscape(seller.name)}</Nazwa></DaneIdentyfikacyjne>${addressXml(seller.address1, seller.address2)}</Podmiot1>` +
    `<Podmiot2><DaneIdentyfikacyjne>${buyerId}</DaneIdentyfikacyjne>${addressXml(buyer.address1, buyer.address2)}<JST>2</JST><GV>2</GV></Podmiot2>` +
    `<Fa><KodWaluty>PLN</KodWaluty><P_1>${issued}</P_1><P_2>${xmlEscape(input.number)}</P_2><P_6>${issued}</P_6>${sums}<P_15>${money(gross)}</P_15>` +
    `<Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A>${zwolnienie}<NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje>` +
    `<RodzajFaktury>VAT</RodzajFaktury>${rows}</Fa></Faktura>`;
  return { xml, net, vat, gross, rate: rateTag };
}
