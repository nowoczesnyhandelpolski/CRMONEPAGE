// Cena bazowa i cena sprzedaży. Brak liczby = brak wyniku. Nigdy nie podstawiamy stawki ani ceny.

export function parseMoney(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0 || v >= 1e7) return null;
    return Math.round(v * 100) / 100;
  }
  const s = String(v).trim().toLowerCase().replace(/\s/g, "").replace(/zł|pln/g, "");
  if (!s || /[a-z]/i.test(s)) return null;
  const norm = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  if (!Number.isFinite(n) || n >= 1e7) return null;
  return Math.round(n * 100) / 100;
}

/** „darmowa” / 0 to fakt, nie zgadywanie. Inny tekst bez liczby → null. */
export function parseDelivery(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (/^(0+|0[.,]0+|darmowa|gratis|free|bezpłatna|bezplatna)$/.test(s.replace(/\s/g, ""))) return 0;
  return parseMoney(v);
}

/**
 * Cena bazowa = cena produktu + płatna dostawa.
 * Oba składniki muszą być znane (0 jest znane, null nie jest).
 */
export function basePrice({ price, shipping } = {}) {
  const p = parseMoney(price);
  const ship = shipping === 0 || shipping === "0" ? 0 : parseDelivery(shipping);
  if (p == null) return { ok: false, error: "missing_price", price: null, shipping: ship, base: null };
  if (ship == null) return { ok: false, error: "missing_shipping", price: p, shipping: null, base: null };
  const base = Math.round((p + ship) * 100) / 100;
  return { ok: true, error: null, price: p, shipping: ship, base };
}

/**
 * Prowizja jest procentem ceny sprzedaży (model Allegro: opłata od ceny).
 * sale = base / (1 - rate). rate 0 jest dozwolone. Brak stawki nie dostaje domyślnej.
 */
export function salePrice({ base, ratePct } = {}) {
  const b = parseMoney(base);
  if (b == null) return { ok: false, error: "missing_price", sale: null, ratePct: null };
  if (ratePct == null || ratePct === "") return { ok: false, error: "missing_commission", sale: null, ratePct: null };
  const rate = typeof ratePct === "number" ? ratePct : Number(String(ratePct).replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate >= 95) {
    return { ok: false, error: "bad_commission", sale: null, ratePct: Number.isFinite(rate) ? rate : null };
  }
  const sale = Math.round((b / (1 - rate / 100)) * 100) / 100;
  return { ok: true, error: null, sale, ratePct: rate, base: b };
}

/** Mapuje znany czas wysyłki na ISO Allegro. Niejednoznaczny tekst → null. */
export function handlingTimeIso(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const iso = s.match(/^PT(\d+)H$/i);
  if (iso) return `PT${iso[1]}H`;
  if (/24\s*h/i.test(s) || /1\s*dzie[nń]/i.test(s)) return "PT24H";
  if (/48\s*h/i.test(s) || /2\s*dni/i.test(s)) return "PT48H";
  if (/72\s*h/i.test(s) || /3\s*dni/i.test(s)) return "PT72H";
  return null;
}
