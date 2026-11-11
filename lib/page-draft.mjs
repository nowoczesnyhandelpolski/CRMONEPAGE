import { cleanSiteData } from "./site-model.mjs";
import { parseMoney } from "./pricing.mjs";
import { paramValue } from "./offer-normalizer.mjs";

function urls(list) {
  return (Array.isArray(list) ? list : []).map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean);
}

/**
 * Szkic strony z produktu, aukcji albo pozycji importu.
 * Nazwa katalogowa zostaje w tytule i w źródle. Cena przed promocją nie wchodzi w omnibus.
 * Cudze zdjęcia dostają rights:false. Własna aukcja (own:true) dostaje rights:true.
 */
export function draftFromSource(input = {}, { own = false } = {}) {
  const catalog = String(input.catalog_name || input.name || input.title || "").trim();
  const price = parseMoney(input.sale_price ?? input.price);
  const gallery = urls(input.images).slice(0, 12);
  const descImages = urls(input.description_images);
  const sections = Array.isArray(input.description_sections) ? input.description_sections : [];
  const text = sections.filter((s) => s.type === "text").map((s) => s.text).join("\n\n").slice(0, 8000);
  // Parametry bez czytelnej wartości (np. stare importy z „[object Object]”) odpadają.
  const params = (Array.isArray(input.parameters) ? input.parameters : [])
    .map((p) => ({ name: String(p?.name || p?.k || "").trim(), value: paramValue(p?.value == null && p?.v != null ? { value: p.v } : p) }))
    .filter((p) => p.name && p.value)
    .slice(0, 24);
  const delivery = parseMoney(input.delivery_cost);
  const data = cleanSiteData({
    brand: input.producer || input.brand || "",
    headline: catalog,
    price,
    images: gallery.map((url) => ({ url, alt: catalog, rights: own === true })),
    features: params.slice(0, 4).map((p) => ({ title: p.name, text: p.value })),
    shipping: {
      time: input.shipping_time || "",
      free: delivery === 0,
      price: delivery > 0 ? delivery : null
    },
    gpsr: { producer: input.producer || "" },
    theme: { accent: "#ff5a00" },
    video: input.video_url ? { url: input.video_url, poster: input.video_poster || "", rights: input.video_rights === true } : undefined,
    source: {
      link: input.source_link || "",
      title: catalog,
      price: parseMoney(input.price),
      description: text,
      images: gallery.concat(descImages).slice(0, 30),
      params: params.map((p) => ({ k: p.name, v: p.value })),
      producer: input.producer || ""
    }
  });
  return {
    name: catalog || "Szkic strony",
    status: "draft",
    data
  };
}
