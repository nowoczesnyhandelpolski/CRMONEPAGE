// Poziomy generacji Centrali. Kwoty zdjęć są szacunkiem z pakietów Sharkly
// (Standard 0 zł, Plus ~0,60 zł, Max ~3 zł). Wideo powstaje w panelu, więc nie doliczamy usługi zewnętrznej.
// To nie są nazwy pakietów zdjęć Standard/Plus/Max — te trzy poziomy obejmują też tekst i, na Max, wideo.

export const TIERS = [
  {
    id: "s1",
    name: "S1",
    badge: "",
    title: "S1",
    images: 0,
    video: false,
    estimatePln: 0,
    costLabel: "0,00 zł",
    includes: ["Tekst oferty i strony", "Zdjęcia ze źródła, bez AI"],
    glow: "linear-gradient(140deg,#8ef6ff,#3b82f6 46%,#2dd4bf)",
    glowSoft: "rgba(56,189,248,.55)"
  },
  {
    id: "s1_pro",
    name: "S1",
    badge: "PRO",
    title: "S1 Pro",
    images: 1,
    video: false,
    estimatePln: 0.6,
    costLabel: "ok. 0,60 zł",
    includes: ["Tekst oferty i strony", "1 zdjęcie AI"],
    glow: "linear-gradient(140deg,#c4b5fd,#d946ef 48%,#f472b6)",
    glowSoft: "rgba(217,70,239,.5)"
  },
  {
    id: "s1_max",
    name: "S1",
    badge: "MAX",
    title: "S1 Max",
    images: 5,
    video: true,
    estimatePln: 3,
    costLabel: "ok. 3,00 zł + wideo w panelu",
    includes: ["Tekst oferty i strony", "5 zdjęć AI", "Wideo produktu w panelu"],
    glow: "linear-gradient(140deg,#ff5a00,#ff2d78 52%,#ff4dcd)",
    glowSoft: "rgba(255,90,0,.55)"
  }
];

const BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t]));

export function tierById(id) {
  return BY_ID[id] || null;
}

export function tierEstimate(id) {
  const t = tierById(id);
  return t ? t.estimatePln : null;
}
