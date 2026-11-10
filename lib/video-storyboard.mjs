// Scenariusz wideo produktu. Ten obiekt jest kontraktem renderera w przeglądarce
// i ewentualnego renderera po stronie serwera. Muzyka jest wyłączona, dopóki ktoś jej nie włączy.

import { parseMoney } from "./pricing.mjs";

export const VIDEO_FORMATS = {
  "9:16": { id: "9:16", width: 720, height: 1280 },
  "1:1": { id: "1:1", width: 720, height: 720 }
};

export function omnibusLine({ price, omnibus } = {}) {
  const p = parseMoney(price);
  const o = parseMoney(omnibus);
  if (p == null) return "";
  if (o == null) return "";
  return `Najniższa cena z 30 dni przed obniżką: ${o.toFixed(2).replace(".", ",")} zł`;
}

export function priceLine(price) {
  const p = parseMoney(price);
  if (p == null) return "";
  const frac = Math.round(p * 100) % 100;
  const s = p.toLocaleString("pl-PL", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  return `${s} zł`;
}

/**
 * @param {object} input title, price, omnibus, benefits[], images[], cta, accent, format, seconds, music
 */
export function buildStoryboard(input = {}) {
  const format = VIDEO_FORMATS[input.format] || VIDEO_FORMATS["9:16"];
  let seconds = Number(input.seconds);
  if (!Number.isFinite(seconds)) seconds = 18;
  seconds = Math.max(15, Math.min(30, Math.round(seconds)));
  const fps = 24;
  const benefits = (Array.isArray(input.benefits) ? input.benefits : []).map((b) => String(b || "").trim()).filter(Boolean).slice(0, 3);
  const images = (Array.isArray(input.images) ? input.images : []).filter(Boolean).slice(0, 6);
  const price = priceLine(input.price);
  const omnibus = omnibusLine({ price: input.price, omnibus: input.omnibus });
  const title = String(input.title || "Produkt").replace(/\s+/g, " ").trim().slice(0, 80);
  const cta = String(input.cta || "Zobacz ofertę").slice(0, 40);
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent || "") ? input.accent : "#ff5a00";
  const intro = 3;
  const priceDur = price ? 4 : 2;
  const benefitDur = benefits.length ? Math.max(4, seconds - intro - priceDur - 4) : 0;
  const ctaDur = Math.max(3, seconds - intro - priceDur - benefitDur);
  const scenes = [
    { id: "intro", start: 0, duration: intro, kind: "title", title, imageIndex: 0 },
    { id: "price", start: intro, duration: priceDur, kind: "price", title, price, omnibus, imageIndex: Math.min(1, images.length - 1) }
  ];
  if (benefitDur > 0) {
    scenes.push({ id: "benefits", start: intro + priceDur, duration: benefitDur, kind: "benefits", benefits, imageIndex: Math.min(2, Math.max(0, images.length - 1)) });
  }
  const startCta = intro + priceDur + (benefitDur > 0 ? benefitDur : 0);
  scenes.push({ id: "cta", start: startCta, duration: Math.max(1, seconds - startCta), kind: "cta", cta, price, accent, imageIndex: 0 });
  // Dopnij długość ostatniej sceny do zadanych sekund.
  const end = scenes[scenes.length - 1];
  end.duration = Math.max(1, seconds - end.start);
  return {
    version: 1,
    format: format.id,
    width: format.width,
    height: format.height,
    fps,
    seconds,
    frames: seconds * fps,
    accent,
    music: input.music === true,
    title,
    images,
    scenes
  };
}

export function sceneAt(storyboard, timeSec) {
  const scenes = storyboard?.scenes || [];
  return scenes.find((s) => timeSec >= s.start && timeSec < s.start + s.duration) || scenes[scenes.length - 1] || null;
}
