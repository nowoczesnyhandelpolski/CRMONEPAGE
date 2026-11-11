// Kopia lib/fulfil-core.mjs — edytuj tam i skopiuj.
// Realizacja zamówień — czysta logika wspólna dla funkcji Supabase `fulfil` i testów.
// Bez sieci i bazy: parsowanie adresu, wybór SKU, limity bezpieczeństwa, treści zapytań do dostawców.

const LOCKER_RE = /^[A-Z]{3}\d{2,4}[A-Z]{0,3}$/;
const POST_RE = /(\d{2})\s*-\s*(\d{3})/;

export function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function cleanPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("48") ? d.slice(2) : d.slice(-9);
}

export function splitStreet(line) {
  const s = String(line || "").replace(/^(ul\.|ulica|al\.|aleja|os\.|pl\.)\s*/i, "").trim();
  const m = s.match(/^(.*?)[\s,]+(\d+[A-Za-z]?(?:\s*[/m]\s*\d+[A-Za-z]?)?)$/);
  if (!m) return { street: s, building: "" };
  return { street: m[1].trim(), building: m[2].replace(/\s+/g, "").replace(/m/, "/") };
}

// ship_to jest wolnym tekstem z formularza („Kod paczkomatu albo adres”) albo ze Stripe
// („Imię Nazwisko, ul. X 1, 00-001 Miasto”). Zwraca null, gdy nie da się go bezpiecznie odczytać.
export function parseShipTo(shipTo, buyer = {}) {
  const raw = String(shipTo || "").trim();
  if (!raw) return null;
  const name = splitName(buyer.name);
  const contact = { first: name.first, last: name.last, phone: cleanPhone(buyer.phone), email: String(buyer.email || "").trim() };
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  const lockerToken = raw.toUpperCase().split(/[\s,;]+/).find((t) => LOCKER_RE.test(t) && !POST_RE.test(t));
  if (LOCKER_RE.test(upper) || (lockerToken && !POST_RE.test(raw))) {
    return { kind: "locker", point: LOCKER_RE.test(upper) ? upper : lockerToken, ...contact };
  }
  const pm = raw.match(POST_RE);
  if (!pm) return null;
  const postcode = `${pm[1]}-${pm[2]}`;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const pcIdx = parts.findIndex((p) => POST_RE.test(p));
  const city = parts[pcIdx].replace(POST_RE, "").trim() || (parts[pcIdx + 1] || "");
  const before = parts.slice(0, pcIdx);
  let streetLine = before[before.length - 1] || "";
  let fullName = "";
  if (before.length >= 2) fullName = before.slice(0, -1).join(" ");
  if (!/\d/.test(streetLine)) return null;
  if (fullName && !contact.first) Object.assign(contact, (({ first, last }) => ({ first, last }))(splitName(fullName)));
  const { street, building } = splitStreet(streetLine);
  if (!street || !building || !city) return null;
  return { kind: "address", street, building, postcode, city, country: "PL", ...contact };
}

export function pickSku(rule, variant) {
  const map = rule && rule.variant_skus && typeof rule.variant_skus === "object" ? rule.variant_skus : {};
  if (variant && map[variant]) return String(map[variant]);
  return rule && rule.sku ? String(rule.sku) : "";
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// Ostatnie słowo przed wydaniem pieniędzy. Zwraca { ok, reason }.
export function safetyCheck({ price, cost, settings, spentToday }) {
  const s = settings || {};
  if (cost == null || !Number.isFinite(Number(cost)) || Number(cost) <= 0) return { ok: false, reason: "Nie znam kosztu u dostawcy — uzupełnij koszt w regule." };
  const c = round2(cost);
  if (c > Number(s.max_order_cost ?? 0)) return { ok: false, reason: `Koszt ${c} zł przekracza limit jednego zamówienia (${s.max_order_cost} zł).` };
  if (round2(Number(spentToday || 0) + c) > Number(s.daily_cap ?? 0)) return { ok: false, reason: `Dzienny limit ${s.daily_cap} zł zostałby przekroczony (wydano już ${round2(spentToday || 0)} zł).` };
  const margin = round2(Number(price || 0) - c);
  if (margin < Number(s.min_margin ?? 0)) return { ok: false, reason: `Marża ${margin} zł jest niższa niż minimum ${s.min_margin} zł.` };
  return { ok: true, reason: "", margin };
}

// Kolejna próba po błędzie: 5 min, 20 min, 1 h. Po 4 próbach — porażka.
export function backoffMinutes(attempts) {
  return [5, 20, 60][Math.max(0, Math.min(2, attempts - 1))];
}
export const MAX_ATTEMPTS = 4;

export function bigbuyAddress(a) {
  return {
    firstName: a.first, lastName: a.last, country: "PL", postcode: a.postcode, town: a.city,
    address: `${a.street} ${a.building}`.trim(), phone: a.phone, email: a.email, comment: ""
  };
}

export function bigbuyOrderBody({ reference, address, sku, qty, carrier }) {
  return {
    order: {
      internalReference: reference,
      language: "pl",
      paymentMethod: "moneybox",
      carriers: carrier ? [{ name: carrier }] : [],
      shippingAddress: bigbuyAddress(address),
      products: [{ reference: sku, quantity: qty }]
    }
  };
}

// Odpowiedzi BigBuy różnią się między wersjami — szukamy kwoty łącznej w znanych polach.
export function pickTotal(json) {
  if (!json || typeof json !== "object") return null;
  for (const k of ["totalAmount", "total", "total_amount", "totalAmountWithTaxes"]) {
    const v = Number(json[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  if (json.order) return pickTotal(json.order);
  return null;
}

export function cheapestShipping(json) {
  const opts = Array.isArray(json) ? json : (json && (json.shippingOptions || json.shipping_options)) || [];
  let best = null;
  for (const o of opts) {
    const name = o?.shippingService?.name || o?.name;
    const cost = Number(o?.cost ?? o?.price);
    if (!name || !Number.isFinite(cost)) continue;
    if (!best || cost < best.cost) best = { name, cost };
  }
  return best;
}

export function orderIdFromLocation(loc) {
  const m = String(loc || "").match(/(\d+)(?:\.json)?\/?$/);
  return m ? m[1] : "";
}

const PARCEL_DIM = {
  small: { length: "380", width: "640", height: "80", unit: "mm" },
  medium: { length: "380", width: "640", height: "190", unit: "mm" },
  large: { length: "380", width: "640", height: "410", unit: "mm" }
};

export function inpostShipmentBody({ address, size = "small", reference, sender }) {
  const receiver = { first_name: address.first, last_name: address.last, email: address.email, phone: address.phone };
  const body = { receiver, reference: String(reference || "").slice(0, 100), custom_attributes: {} };
  if (sender && sender.name) body.sender = { company_name: sender.name, email: sender.email || undefined, phone: cleanPhone(sender.phone) || undefined };
  if (address.kind === "locker") {
    body.service = "inpost_locker_standard";
    body.parcels = { template: size };
    body.custom_attributes = { target_point: address.point, sending_method: "dispatch_order" };
  } else {
    body.service = "inpost_courier_standard";
    receiver.address = { street: address.street, building_number: address.building, city: address.city, post_code: address.postcode, country_code: "PL" };
    body.parcels = [{ dimensions: PARCEL_DIM[size] || PARCEL_DIM.small, weight: { amount: size === "large" ? "20" : size === "medium" ? "10" : "5", unit: "kg" } }];
    body.custom_attributes = { sending_method: "dispatch_order" };
  }
  return body;
}

// Status InPost → stan realizacji.
export function inpostState(status) {
  const s = String(status || "");
  if (s === "delivered") return "delivered";
  if (/^(collected_from_sender|taken_by_courier|adopted_at|sent_from|out_for_delivery|ready_to_pickup|avizo|pickup_reminder)/.test(s)) return "shipped";
  return "";
}

export function supplierEmail({ number, sku, productName, qty, variant, address, sender, labelNote }) {
  const who = `${address.first} ${address.last}`.trim();
  const where = address.kind === "locker"
    ? `Paczkomat InPost: ${address.point}`
    : `${address.street} ${address.building}, ${address.postcode} ${address.city}`;
  const subject = `Zamówienie dropshipping ${number} — ${sku || productName}`;
  const text = [
    "Dzień dobry,",
    "",
    `prosimy o wysyłkę zamówienia ${number} bezpośrednio do naszego klienta.`,
    "",
    `Produkt: ${productName || "—"}`,
    `Kod (SKU): ${sku || "—"}`,
    variant ? `Wariant: ${variant}` : null,
    `Ilość: ${qty}`,
    "",
    "Adres dostawy:",
    who,
    where,
    `Telefon: ${address.phone}`,
    address.email ? `E-mail: ${address.email}` : null,
    "",
    labelNote || "Prosimy nie wkładać do paczki faktury ani cennika.",
    "Po nadaniu prosimy o odpowiedź z numerem przesyłki.",
    "",
    "Pozdrawiamy",
    sender && sender.name ? sender.name : "Nowoczesny Handel Polski"
  ].filter((l) => l !== null).join("\n");
  return { subject, text };
}
