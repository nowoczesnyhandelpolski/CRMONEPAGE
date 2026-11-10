// Prompt tekstu. Model ma zostać przy faktach ze źródła i oddać JSON.

export function copyPrompt(source = {}) {
  const params = (source.parameters || []).slice(0, 40).map((p) => `${p.name || p.k}: ${p.value || p.v}`).join("\n");
  const sections = (source.description_sections || []).filter((s) => s.type === "text").map((s) => s.text).join("\n\n");
  const facts = [
    `Nazwa katalogowa: ${source.catalog_name || source.name || ""}`,
    `Producent: ${source.producer || ""}`,
    `EAN: ${source.ean || ""}`,
    `Kategoria: ${source.category || ""}`,
    source.price != null ? `Cena bieżąca (nie wymyślaj innej): ${source.price} zł` : "Cena: brak — nie podawaj żadnej kwoty.",
    source.shipping_time ? `Czas wysyłki ze źródła: ${source.shipping_time}` : "",
    params ? `Parametry:\n${params}` : "",
    sections ? `Opis źródłowy (tylko fakty, nie kopiuj zdań 1:1):\n${sections.slice(0, 6000)}` : ""
  ].filter(Boolean).join("\n");
  return `Jesteś copywriterem sklepu w Polsce. Pisz po polsku, krótko i rzeczowo.
Zasady: używaj wyłącznie faktów z danych poniżej. Nie wymyślaj parametrów, liczb, certyfikatów, opinii, nagród ani obietnic zdrowotnych. Nie podawaj ceny, jeśli w danych jej nie ma. Nie obiecuj darmowej dostawy, jeśli jej nie podano. Zostaw puste pole, gdy faktu brakuje.
Odpowiedź to JSON o polach: kicker, headline, subheadline, problem_title, problem_text, benefits (3 obiekty title/text), features (3 obiekty title/text), faq (2 obiekty q/a), offer_sections (3–4 krótkie akapity z nagłówkiem w pierwszej linii), seo_title, seo_description.

Dane:
${facts}`.slice(0, 12000);
}

export const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kicker", "headline", "subheadline", "problem_title", "problem_text", "benefits", "features", "faq", "offer_sections", "seo_title", "seo_description"],
  properties: {
    kicker: { type: "string" },
    headline: { type: "string" },
    subheadline: { type: "string" },
    problem_title: { type: "string" },
    problem_text: { type: "string" },
    benefits: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "text"], properties: { title: { type: "string" }, text: { type: "string" } } } },
    features: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "text"], properties: { title: { type: "string" }, text: { type: "string" } } } },
    faq: { type: "array", items: { type: "object", additionalProperties: false, required: ["q", "a"], properties: { q: { type: "string" }, a: { type: "string" } } } },
    offer_sections: { type: "array", items: { type: "string" } },
    seo_title: { type: "string" },
    seo_description: { type: "string" }
  }
};

export function applyCopyToPage(prev, copy, { overwrite = false } = {}) {
  const base = prev && typeof prev === "object" ? structuredClone(prev) : {};
  const fill = (current, next) => (overwrite || current == null || current === "" ? next : current);
  base.kicker = fill(base.kicker, copy.kicker || "");
  base.headline = fill(base.headline, copy.headline || "");
  base.subheadline = fill(base.subheadline, copy.subheadline || "");
  base.problem = base.problem || {};
  base.problem.title = fill(base.problem.title, copy.problem_title || "");
  base.problem.text = fill(base.problem.text, copy.problem_text || "");
  if (overwrite || !(base.benefits || []).length) base.benefits = copy.benefits || [];
  if (overwrite || !(base.features || []).length) base.features = copy.features || [];
  if (overwrite || !(base.faq || []).length) base.faq = copy.faq || [];
  base.seo = base.seo || {};
  base.seo.title = fill(base.seo.title, copy.seo_title || "");
  base.seo.description = fill(base.seo.description, copy.seo_description || "");
  base.generated = { ...(base.generated || {}), offer_sections: copy.offer_sections || [], at: new Date().toISOString() };
  return base;
}

export const PHOTO_SCENES = [
  { id: "cieple", prompt: "Scene: the product on a warm wooden table, soft afternoon light, linen, a blurred home interior. No people." },
  { id: "swieze", prompt: "Scene: the product on pale stone in cool daylight, a hint of greenery far behind, airy and fresh. No people." },
  { id: "wieczor", prompt: "Scene: evening, the product on a dark table, warm lamp light, distant bokeh. No people. No readable signs." },
  { id: "randka", prompt: "Scene: two adults at a dinner table, the product standing on the table in the foreground, same object as the reference. No signs." },
  { id: "poranek", prompt: "Scene: one adult by a bright morning window, the product on a desk in the foreground, same object as the reference. No readable screens." }
];

const PHOTO_RULES = "Photorealistic commercial photograph. Keep the product identical to the reference: same shape, proportions, colors, materials and the original logo already printed on the product. Do not add text, captions, watermarks, badges, stickers or collage.";

export function scenesForTier(tier) {
  if (!tier || !tier.images) return [];
  if (tier.images === 1) return [PHOTO_SCENES[3]];
  return PHOTO_SCENES.slice(0, tier.images);
}

export function photoPrompt(scene, title) {
  const name = String(title || "produkt").replace(/\s+/g, " ").trim().slice(0, 180);
  return `${PHOTO_RULES} ${scene.prompt} Product context, never written onto the image: ${name}.`;
}
