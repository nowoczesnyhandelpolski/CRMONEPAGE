// Plik produktów (RSS 2.0 z przestrzenią g:) dla Google Merchant Center, Meta Commerce i katalogu TikTok.
// Jeden wiersz na opublikowaną kartę: cena pierwszego zestawu, zdjęcia z potwierdzonym prawem, marka, GTIN gdy znany.
import { kEsc, cleanSiteData, siteBundles } from "./site-model.mjs";

const GTIN_RE = /\b(\d{8}|\d{12,14})\b/;

// EAN często siedzi w nazwie zdjęcia albo w parametrach źródła (np. „EAN-GTIN-5905602536603”).
export function findGtin(d) {
  const params = (d.source && d.source.params) || [];
  for (const p of params) if (/ean|gtin/i.test(p.k || "") && GTIN_RE.test(p.v || "")) return String(p.v).match(GTIN_RE)[1];
  for (const i of d.images || []) {
    const m = String(i.url || "").match(/(?:EAN|GTIN)[-_ ]?(?:GTIN[-_ ]?)?(\d{8,14})/i);
    if (m) return m[1];
  }
  return "";
}

export function feedItem(origin, page) {
  const d = cleanSiteData(page.data || {});
  const bundles = siteBundles(d);
  const first = bundles[0];
  const imgs = d.images.filter((i) => i.rights);
  if (!first || !imgs.length) return null;
  const link = `${String(origin).replace(/\/$/, "")}/p/${page.slug}`;
  const desc = d.subheadline || (d.features || []).map((f) => `${f.title}: ${f.text}`).join(". ") || d.headline || page.name;
  const outOfStock = d.stock === 0;
  const gtin = findGtin(d);
  return {
    id: page.id,
    title: (d.headline || page.name || "").slice(0, 150),
    description: String(desc).slice(0, 5000),
    link,
    image: imgs[0].url,
    extra: imgs.slice(1, 10).map((i) => i.url),
    price: `${Number(first.price).toFixed(2)} PLN`,
    availability: outOfStock ? "out_of_stock" : "in_stock",
    brand: d.brand || (d.gpsr && d.gpsr.producer) || "",
    gtin,
    shipping: d.shipping.free === false && d.shipping.price ? `${Number(d.shipping.price).toFixed(2)} PLN` : "0.00 PLN"
  };
}

export function productFeedXml(origin, pages) {
  const e = kEsc;
  const items = (pages || []).map((p) => feedItem(origin, p)).filter(Boolean).map((it) => `<item>
<g:id>${e(it.id)}</g:id>
<title>${e(it.title)}</title>
<description>${e(it.description)}</description>
<link>${e(it.link)}</link>
<g:image_link>${e(it.image)}</g:image_link>
${it.extra.map((u) => `<g:additional_image_link>${e(u)}</g:additional_image_link>`).join("\n")}
<g:price>${e(it.price)}</g:price>
<g:availability>${it.availability}</g:availability>
<g:condition>new</g:condition>
${it.brand ? `<g:brand>${e(it.brand)}</g:brand>` : ""}
${it.gtin ? `<g:gtin>${e(it.gtin)}</g:gtin>` : "<g:identifier_exists>no</g:identifier_exists>"}
<g:shipping><g:country>PL</g:country><g:price>${e(it.shipping)}</g:price></g:shipping>
</item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<title>Nowoczesny Handel Polski</title>
<link>${e(String(origin).replace(/\/$/, ""))}</link>
<description>Produkty Nowoczesny Handel Polski</description>
${items}
</channel></rss>`;
}
