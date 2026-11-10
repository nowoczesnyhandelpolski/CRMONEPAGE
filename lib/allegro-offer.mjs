import { handlingTimeIso, parseMoney } from "./pricing.mjs";

const ALLEGRO_ACCEPT = "application/vnd.allegro.public.v1+json";

export function allegroHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: ALLEGRO_ACCEPT,
    "content-type": ALLEGRO_ACCEPT
  };
}

export function productMatchUrl(ean) {
  const phrase = String(ean || "").replace(/\s/g, "");
  if (!/^\d{8,14}$/.test(phrase)) {
    const err = new Error("Do dopasowania katalogu potrzebny jest EAN (8–14 cyfr).");
    err.status = 422;
    throw err;
  }
  const u = new URL("https://api.allegro.pl/sale/products");
  u.searchParams.set("phrase", phrase);
  u.searchParams.set("mode", "GTIN");
  return u.href;
}

function textSections(sections) {
  return (Array.isArray(sections) ? sections : [])
    .filter((s) => s && s.type === "text" && s.text)
    .slice(0, 8)
    .map((s) => ({ items: [{ type: "TEXT", content: `<p>${String(s.text).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</p>` }] }));
}

/**
 * Szkic POST /sale/product-offers. publication.status jest zawsze INACTIVE.
 * Brak ceny albo brak id produktu i EAN-u odrzuca żądanie.
 */
export function productOfferDraft(input = {}) {
  const price = parseMoney(input.price);
  if (price == null || price <= 0) {
    const err = new Error("Brak ceny. Szkic Allegro nie powstanie bez wpisanej ceny.");
    err.status = 422;
    throw err;
  }
  const productId = String(input.allegro_product_id || "").trim();
  if (!productId) {
    const err = new Error("Najpierw dopasuj produkt w katalogu Allegro (EAN albo id). Szkic nie powstaje bez id produktu.");
    err.status = 422;
    throw err;
  }
  const handling = handlingTimeIso(input.handling_time);
  if (!handling) {
    const err = new Error("Wybierz czas realizacji (PT24H, PT48H albo PT72H). Nie zgadujemy go ze źródła.");
    err.status = 422;
    throw err;
  }
  const product = { id: productId };
  const body = {
    productSet: [{ product }],
    sellingMode: { price: { amount: price.toFixed(2), currency: "PLN" } },
    stock: { available: Math.max(0, parseInt(input.stock, 10) || 1) },
    publication: { status: "INACTIVE" },
    delivery: { handlingTime: handling },
    name: String(input.name || input.catalog_name || "").slice(0, 75)
  };
  if (input.shipping_rate_id) body.delivery.shippingRates = { id: String(input.shipping_rate_id) };
  const sections = textSections(input.description_sections);
  if (sections.length) body.description = { sections };
  return body;
}

export function publishPatch() {
  return { publication: { status: "ACTIVE" } };
}
