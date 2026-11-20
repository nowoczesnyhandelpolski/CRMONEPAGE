// Statyczny przykład strony. Bez OpenAI, wtyczki i Allegro.
import { cleanSiteData, exampleSiteData } from "./site-model.mjs";

const SLIDES = [1, 2, 3, 4, 5].map((n) => ({
  url: `/assets/demo/slide-${n}.svg`,
  alt: "Zdjęcie przykładowe kalendarza",
  rights: true
}));

const AI_SLIDE = {
  url: "/assets/demo/slide-ai.svg",
  alt: "Przykładowa aranżacja S1 Pro, bez wywołania modelu",
  rights: true
};

const TIER_NOTE = {
  s1: "S1: tekst i zdjęcia przykładowe, bez AI.",
  s1_pro: "S1 Pro: tekst, zdjęcia przykładowe i jedna aranżacja (rysunek w repozytorium, model nie był wołany).",
  s1_max: "S1 Max: to samo co Pro oraz wideo złożone w tej przeglądarce ze zdjęć przykładowych."
};

export function samplePageData(tier = "s1") {
  const id = TIER_NOTE[tier] ? tier : "s1";
  const base = exampleSiteData();
  const images = id === "s1" ? SLIDES : SLIDES.concat(AI_SLIDE);
  return cleanSiteData({
    ...base,
    example: true,
    announcement: "DANE PRZYKŁADOWE — to nie jest prawdziwa oferta",
    kicker: `Przykład · ${id === "s1" ? "S1" : id === "s1_pro" ? "S1 Pro" : "S1 Max"}`,
    subheadline: `${base.subheadline} ${TIER_NOTE[id]}`,
    images,
    reviews: id === "s1_max" ? (base.reviews || []).map((r, i) => ({ ...r, photo: SLIDES[i]?.url || "" })) : base.reviews,
    ugc: [{
      video: "/assets/demo/slide-1.svg",
      poster: "/assets/demo/slide-2.svg",
      author: "Przykład",
      text: "To nie jest nagranie klienta. W S1 Max wideo składa przeglądarka."
    }],
    template: id === "s1_max" ? "konwersja" : "klasyczny",
    sale: id === "s1_max" ? { enabled: true, label: "Promocja sezonowa", text: "Przykładowy baner. Tekst i datę końca wpisujesz sam.", ends_at: "" } : undefined,
    trust_title: id === "s1_max" ? "Zaufanie" : "",
    trust_names: id === "s1_max" ? ["Przykładowy katalog", "Przykładowa hurtownia"] : [],
    compare_image_ours: id === "s1_max" ? SLIDES[0].url : "",
    compare_image_others: id === "s1_max" ? SLIDES[3].url : "",
    compare_caption_ours: id === "s1_max" ? "Nasz zestaw" : "",
    compare_caption_others: id === "s1_max" ? "Zwykłe pudełko" : "",
    contact: { enabled: true, title: "Masz pytanie? Napisz do nas", text: "To formularz przykładowy. Wiadomość z podglądu nie jest zapisywana." },
    generated: {
      tier: id,
      offer_sections: [TIER_NOTE[id]],
      model: ""
    }
  });
}
