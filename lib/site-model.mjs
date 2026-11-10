// Model karty produktu one-page (port logiki Kreatora, bez integracji Sharkly).
// Czyste funkcje: czyszczenie danych, walidacja publikacji, termin wysyłki, sklep.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { str: 400, text: 4000, list: 24 };

export const kStr = (v, n = LIMITS.str) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export const kText = (v, n = LIMITS.text) => String(v ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
export const kNum = (v) => {
  if (v == null) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const n = Number(raw.replace(/\s/g, "").replace(",", ".").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
export const kInt = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n);
};
export const kUrl = (v) => {
  const s = String(v || "").trim();
  if (/^\/(?!\/)/.test(s) && !s.includes("\\") && !s.includes("..")) return s.slice(0, 1000);
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.href.slice(0, 1000) : "";
  } catch {
    return "";
  }
};
export const kPayUrl = (v) => {
  const s = String(v || "").trim().slice(0, 500);
  if (!s) return "";
  const probe = s.replace(/\{(number|total|email|slug)\}/g, "x");
  return kUrl(probe) ? s : "";
};
export const kArr = (v, n = LIMITS.list) => (Array.isArray(v) ? v.slice(0, n) : []);
export const kHex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : "");
export const kEsc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function kSlug(text) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "produkt";
}

export function uniqueSlug(base, taken = [], except = "") {
  const root = kSlug(base);
  const set = new Set((taken || []).filter((s) => s && s !== except));
  if (!set.has(root)) return root;
  for (let n = 2; n < 5000; n++) {
    const cand = `${root}-${n}`.slice(0, 70).replace(/-+$/g, "");
    if (!set.has(cand)) return cand;
  }
  return `${root}-${Date.now().toString(36)}`.slice(0, 70);
}

export function kMoney(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const frac = Math.round(Math.abs(v) * 100) % 100;
  const s = v.toLocaleString("pl-PL", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  return `${s} zł`;
}

const pair = (a, b, x, n1 = 120, n2 = 600) =>
  kArr(x)
    .map((r) =>
      Array.isArray(r)
        ? { [a]: kStr(r[0], n1), [b]: kText(r[1], n2) }
        : { [a]: kStr(r?.[a], n1), [b]: kText(r?.[b], n2) }
    )
    .filter((r) => r[a] || r[b]);

export function cleanSiteData(input = {}) {
  const d = input && typeof input === "object" ? input : {};
  const bundles = kArr(d.bundles, 3)
    .map((b) => ({
      label: kStr(b?.label, 40),
      qty: Math.max(1, Math.min(99, parseInt(b?.qty, 10) || 1)),
      price: kNum(b?.price),
      badge: kStr(b?.badge, 40),
      note: kStr(b?.note, 80),
      compare_at: kNum(b?.compare_at),
      omnibus: kNum(b?.omnibus)
    }))
    .filter((b) => b.label && b.price != null);
  return {
    brand: kStr(d.brand, 60),
    kicker: kStr(d.kicker, 120),
    headline: kStr(d.headline, 160),
    subheadline: kText(d.subheadline, 400),
    announcement: kStr(d.announcement, 160),
    price: kNum(d.price),
    cost: kNum(d.cost),
    compare_at: kNum(d.compare_at),
    omnibus_price: kNum(d.omnibus_price),
    bundles,
    default_bundle: Number.isInteger(d.default_bundle) && d.default_bundle >= 0 && d.default_bundle < 3 ? d.default_bundle : null,
    variant_label: kStr(d.variant_label, 40),
    variants: kArr(d.variants, 12).map((v) => (typeof v === "string" ? kStr(v, 40) : kStr(v?.label, 40))).filter(Boolean),
    images: kArr(d.images, 12)
      .map((i) => (typeof i === "string" ? { url: kUrl(i), alt: "", rights: false } : { url: kUrl(i?.url), alt: kStr(i?.alt, 160), rights: i?.rights === true }))
      .filter((i) => i.url),
    callouts: kArr(d.callouts, 3).map((c) => ({ label: kStr(c?.label, 80) })).filter((c) => c.label),
    video: { url: kUrl(d.video?.url), poster: kUrl(d.video?.poster), rights: d.video?.rights === true },
    problem: { title: kStr(d.problem?.title, 180), text: kText(d.problem?.text, 900), image: kUrl(d.problem?.image) },
    benefits: kArr(d.benefits, 6).map((b) => ({ title: kStr(b?.title, 140), text: kText(b?.text, 400) })).filter((b) => b.title),
    benefits_title: kStr(d.benefits_title, 120),
    features: kArr(d.features, 4).map((b) => ({ title: kStr(b?.title, 120), text: kText(b?.text, 500), image: kUrl(b?.image) })).filter((b) => b.title),
    features_image: kUrl(d.features_image),
    compare: kArr(d.compare, 8).map((r) => ({ feature: kStr(r?.feature, 100), ours: kStr(r?.ours, 120), others: kStr(r?.others, 120) })).filter((r) => r.feature),
    compare_ours: kStr(d.compare_ours, 40),
    compare_others: kStr(d.compare_others, 40),
    reviews: kArr(d.reviews, 12)
      .map((r) => ({
        author: kStr(r?.author, 60),
        text: kText(r?.text, 600),
        rating: Math.max(0, Math.min(5, parseInt(r?.rating, 10) || 0)),
        source_url: kUrl(r?.source_url)
      }))
      .filter((r) => r.text && r.source_url),
    faq: pair("q", "a", d.faq, 200, 900).slice(0, 12),
    ugc: kArr(d.ugc, 6).map((u) => ({ video: kUrl(u?.video), poster: kUrl(u?.poster), author: kStr(u?.author, 60), text: kStr(u?.text, 180) })).filter((u) => u.video),
    addons: kArr(d.addons, 4).map((a) => ({ name: kStr(a?.name, 80), text: kStr(a?.text, 200), price: kNum(a?.price), image: kUrl(a?.image), url: kUrl(a?.url) })).filter((a) => a.name && a.price != null),
    related: kArr(d.related, 8).map((r) => ({ name: kStr(r?.name, 80), price: kNum(r?.price), url: kUrl(r?.url), image: kUrl(r?.image) })).filter((r) => r.name && r.price != null),
    stock: kInt(d.stock),
    guarantee: kText(d.guarantee, 500),
    shipping: {
      cutoff: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.shipping?.cutoff || "")) ? d.shipping.cutoff : "",
      time: kStr(d.shipping?.time, 80),
      from: kStr(d.shipping?.from, 60),
      free: d.shipping?.free !== false,
      price: kNum(d.shipping?.price)
    },
    returns_days: Math.max(14, Math.min(365, parseInt(d.returns_days ?? 14, 10) || 14)),
    checkout: {
      bump: d.checkout?.bump !== false,
      gift: d.checkout?.gift !== false,
      reminder: d.checkout?.reminder !== false
    },
    checkout_url: kUrl(d.checkout_url),
    pay_url: kPayUrl(d.pay_url),
    seller: {
      name: kStr(d.seller?.name, 160),
      address: kStr(d.seller?.address, 200),
      nip: kStr(d.seller?.nip, 20),
      email: kStr(d.seller?.email, 120),
      phone: kStr(d.seller?.phone, 40),
      vat_exempt: d.seller?.vat_exempt === true
    },
    legal: {
      terms_url: kUrl(d.legal?.terms_url),
      privacy_url: kUrl(d.legal?.privacy_url),
      returns_url: kUrl(d.legal?.returns_url)
    },
    gpsr: {
      producer: kStr(d.gpsr?.producer, 160),
      address: kStr(d.gpsr?.address, 200),
      contact: kStr(d.gpsr?.contact, 160),
      responsible: kStr(d.gpsr?.responsible, 200),
      warnings: kText(d.gpsr?.warnings, 600)
    },
    theme: { accent: kHex(d.theme?.accent) || "#ff5a00" },
    seo: { title: kStr(d.seo?.title, 70), description: kStr(d.seo?.description, 170) },
    example: d.example === true,
    contact: { enabled: d.contact?.enabled !== false, title: kStr(d.contact?.title, 120), text: kStr(d.contact?.text, 240) },
    source: {
      link: kUrl(d.source?.link),
      title: kStr(d.source?.title, 300),
      price: kNum(d.source?.price),
      description: kText(d.source?.description, 8000),
      images: kArr(d.source?.images, 30).map(kUrl).filter(Boolean),
      params: pair("k", "v", d.source?.params, 80, 200),
      producer: kText(d.source?.producer, 800)
    }
  };
}

/** Formularz nie nadpisuje materiału źródłowego. */
export function mergeSiteData(prev, incoming) {
  const base = prev && typeof prev === "object" ? prev : {};
  const inc = incoming && typeof incoming === "object" ? incoming : {};
  const source = base.source && typeof base.source === "object" ? base.source : undefined;
  return cleanSiteData({ ...base, ...inc, source: source || inc.source });
}

export function siteBundles(d) {
  if (d.bundles?.length) return d.bundles;
  if (d.price != null) {
    return [{ label: "1 szt.", qty: 1, price: d.price, badge: "", note: "", compare_at: d.compare_at, omnibus: d.omnibus_price }];
  }
  return [];
}

export function hasPurchaseOption(d) {
  return !!(d.checkout_url || d.pay_url || siteBundles(d).length);
}

export function sitePublishIssues(row, d) {
  const out = [];
  if (!d.headline && !(row && row.name)) out.push("Brak nagłówka strony.");
  if (!siteBundles(d).length) out.push("Brak ceny (cena albo co najmniej jeden zestaw).");
  if (!d.images.some((i) => i.rights)) out.push("Brak zdjęcia z potwierdzonym prawem do użycia (własne, od hurtowni albo producenta).");
  if (d.video?.url && !d.video.rights) out.push("Wideo nie ma potwierdzonego prawa do użycia — potwierdź albo usuń.");
  if (!d.seller?.name || !d.seller?.email || !EMAIL_RE.test(d.seller.email)) out.push("Uzupełnij dane sprzedawcy (nazwa firmy i poprawny e-mail).");
  if (!d.gpsr?.producer) out.push("Uzupełnij producenta (GPSR).");
  if (!hasPurchaseOption(d)) out.push("Brak opcji zakupu (zestaw z ceną na stronie albo link do płatności).");
  if (d.example === true) out.push("To jest strona przykładowa. Odznacz „przykład” dopiero po podmianie zdjęć, opinii i danych firmy.");
  if (d.source?.description && d.subheadline && d.subheadline.length > 80 && d.source.description.includes(d.subheadline)) {
    out.push("Opis wygląda na skopiowany ze źródła — napisz własny.");
  }
  return out;
}

export function shopFromPage(page, origin, owner = "") {
  const rawId = String(page.shop_id || page.id || "strona").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
  const id = page.shop_id || `sh_${rawId || "strona"}`;
  const d = cleanSiteData(page.data || {});
  const base = String(origin || "").replace(/\/$/, "");
  return {
    id,
    data: {
      name: page.name || d.headline || "Strona one-page",
      domain: `${base}/p/${page.slug}`,
      platform: "generator",
      status: page.status === "published" ? "live" : "pauza",
      niche: d.kicker || "",
      owner: owner || "",
      notes: `Generator stron · /p/${page.slug}`,
      pageId: page.id || ""
    }
  };
}

export function ratingOf(d) {
  const rs = (d.reviews || []).filter((r) => r.rating > 0);
  if (!rs.length) return null;
  const avg = rs.reduce((s, r) => s + r.rating, 0) / rs.length;
  return { avg, count: rs.length };
}

export function featureItems(d) {
  if (d.features?.length) return d.features.slice(0, 4);
  const withText = (d.benefits || []).filter((b) => b.text);
  return withText.slice(0, 4);
}

export function tickItems(d) {
  return (d.benefits || []).filter((b) => b.title).slice(0, 3);
}

const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function warsawParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  let h = +p.hour;
  if (h === 24) h = 0;
  return {
    y: +p.year,
    mo: +p.month,
    d: +p.day,
    h,
    mi: +p.minute,
    wd: WD[p.weekday] || 1,
    date: new Date(Date.UTC(+p.year, +p.month - 1, +p.day))
  };
}

function addBusiness(date, days) {
  const x = new Date(date);
  let left = days;
  while (left > 0) {
    x.setUTCDate(x.getUTCDate() + 1);
    const wd = x.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return x;
}

function fmtPL(d) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", day: "numeric", month: "long" }).format(d);
}

function fmtDay(d) {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", day: "numeric" }).format(d);
}

function rangeLabel(a, b) {
  if (fmtPL(a) === fmtPL(b)) return fmtPL(a);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) return `${fmtDay(a)}–${fmtPL(b)}`;
  return `${fmtPL(a)}–${fmtPL(b)}`;
}

/** Uczciwy termin wysyłki z godziny granicznej (Europe/Warsaw). Bez wiecznego odliczania promocji. */
export function shippingPlan(now = new Date(), cutoff = "15:00") {
  const cut = /^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff) ? cutoff : "15:00";
  const [ch, cm] = cut.split(":").map(Number);
  const w = warsawParts(now);
  const weekend = w.wd === 6 || w.wd === 7;
  const before = !weekend && (w.h < ch || (w.h === ch && w.mi < cm));
  let shipDate;
  let message;
  if (before) {
    shipDate = w.date;
    const mins = ch * 60 + cm - (w.h * 60 + w.mi);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const parts = [];
    if (hh) parts.push(`${hh} godz.`);
    if (mm) parts.push(`${mm} min`);
    message = `Zamów w ciągu ${parts.join(" ") || "kilku minut"}, wyślemy dziś`;
  } else {
    shipDate = addBusiness(w.date, 1);
    const when = weekend ? "Weekend — wyślemy w następnym dniu roboczym" : `Po godzinie granicznej ${cut}`;
    message = `${when}. Wyślemy ${fmtPL(shipDate)}`;
  }
  const delivFrom = addBusiness(shipDate, 1);
  const delivTo = addBusiness(shipDate, 2);
  return {
    beforeCutoff: before,
    cutoff: cut,
    message,
    orderLabel: fmtPL(w.date),
    shipLabel: fmtPL(shipDate),
    delivLabel: rangeLabel(delivFrom, delivTo),
    isoDate: `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`
  };
}

export function accentInk(hex) {
  const h = String(hex || "#ff5a00").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#1c1917" : "#ffffff";
}

export function buildPayUrl(env, pagePayUrl, { number, total, email, slug }) {
  const tpl = (env && (env.PAY_URL_TEMPLATE || env.P24_PAY_URL)) || pagePayUrl || "";
  if (!tpl) return null;
  const map = { number: String(number ?? ""), total: String(total ?? ""), email: String(email ?? ""), slug: String(slug ?? "") };
  const url = tpl.replace(/\{(number|total|email|slug)\}/g, (_, k) => encodeURIComponent(map[k] ?? ""));
  return kUrl(url.replace(/\{(number|total|email|slug)\}/g, "x")) ? url : null;
}

export function orderNumber(date = new Date()) {
  const w = warsawParts(date);
  const ymd = `${String(w.y).slice(2)}${String(w.mo).padStart(2, "0")}${String(w.d).padStart(2, "0")}`;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = 1000 + (buf[0] % 9000);
  return `${ymd}-${n}`;
}

export function emptySiteData() {
  return cleanSiteData({
    theme: { accent: "#ff5a00" },
    returns_days: 30,
    shipping: { cutoff: "15:00", time: "Wysyłka 24 h", free: true },
    checkout: { bump: true, gift: true, reminder: true },
    contact: { enabled: true }
  });
}

/** Przykład z makiety — nie da się go opublikować, dopóki example === true i nie ma zdjęcia z prawami. */
export function exampleSiteData() {
  return cleanSiteData({
    example: true,
    brand: "SKLEP",
    kicker: "Kalendarz adwentowy 2026",
    headline: "Kalendarz adwentowy z autkami 2026",
    subheadline: "24 dni, 24 różne autka i pudełko, które wygląda jak prezent. Gotowe do wręczenia — bez zgadywania rozmiaru i bez strojenia choinki w pośpiechu.",
    announcement: "Darmowa dostawa",
    price: 189,
    compare_at: 249,
    omnibus_price: 199,
    default_bundle: 1,
    bundles: [
      { label: "1 szt.", qty: 1, price: 189, compare_at: 249, omnibus: 199 },
      { label: "2 szt.", qty: 2, price: 339, badge: "Oszczędzasz 10%", note: "Gratis: karty kolekcjonerskie", compare_at: 378, omnibus: 349 },
      { label: "3 szt.", qty: 3, price: 479, badge: "Oszczędzasz 15%", note: "Gratis: karty + ozdobne pudełko", compare_at: 567, omnibus: 499 }
    ],
    variant_label: "Kolor wstążki",
    variants: ["Czerwony", "Granatowy", "Zielony", "Naturalny"],
    benefits: [
      { title: "Gotowy prezent — wręczasz pudełko, nie listę życzeń" },
      { title: "Codziennie nowe auto, po adwencie zostaje kolekcja" },
      { title: "Pasuje na kilka lat: autka nie są jednorazową ozdobą" }
    ],
    benefits_title: "Małe detale, które robią różnicę",
    features: [
      { title: "Okienka, które chce się otwierać", text: "Numerowane drzwiczki, pewne zamykanie i miejsce na małe autko — bez wyrywania papieru zębami." },
      { title: "Autka, nie jednorazowe breloki", text: "Różne kolory i nadwozia. Po adwencie ustawiasz je w rządku, zamiast wrzucać do pudełka po cukierkach." },
      { title: "Pudełko gotowe na prezent", text: "Wstążka, sztywne ścianki i format, który dobrze wygląda pod choinką. Bez osobnego pakowania." },
      { title: "Plan kolekcji na tyłach", text: "Na odwrocie jest miejsce, żeby odhaczać modele. Dziecko widzi, czego jeszcze brakuje." }
    ],
    problem: {
      title: "Czy to tylko ładne pudełko, a w środku typowy supermarketowy kalendarz?",
      text: "Nie. Każde okienko skrywa inne autko, a pudełko jest zaprojektowane tak, żeby wręczyć je od razu. Po 24 grudnia kolekcja zostaje — to jest ta różnica, której szukasz, gdy nie chcesz kolejnej ozdoby „do szuflady”."
    },
    compare_ours: "Nasz kalendarz",
    compare_others: "Zwykły kalendarz z autkami",
    compare: [
      { feature: "Autka po adwencie", ours: "Zostają jako kolekcja", others: "Często do szuflady" },
      { feature: "Pudełko prezentowe", ours: "Wstążka i sztywne ścianki", others: "Cienki karton, osobne pakowanie" },
      { feature: "Różnorodność modeli", ours: "24 różne autka", others: "Powtarzające się wzory" },
      { feature: "Plan kolekcjonera", ours: "Odhaczanie na tyłach", others: "Brak" },
      { feature: "Gotowość do wręczenia", ours: "Od razu spod choinki", others: "Trzeba jeszcze opakować" }
    ],
    reviews: [
      { author: "Karolina M.", text: "Bałam się, że to będzie kolejny kalendarz „na trzy dni”. Autka zostały na półce.", rating: 5, source_url: "https://przyklad.invalid/opinia/1" },
      { author: "Tomasz W.", text: "Kupiłem dwa zestawy. Pudełko wygląda serio jak prezent.", rating: 5, source_url: "https://przyklad.invalid/opinia/2" },
      { author: "Anna K.", text: "Syn odlicza dni i ustawia autka w rzędzie.", rating: 5, source_url: "https://przyklad.invalid/opinia/3" }
    ],
    faq: [
      { q: "Co jest w środku kalendarza?", a: "24 różne autka, po jednym na każde okienko, plus karty kolekcjonerskie w zestawach 2 i 3 szt." },
      { q: "Kiedy wyślecie paczkę?", a: "Zamówienia złożone w dni robocze do 15:00 wysyłamy tego samego dnia. Po tej godzinie oraz w weekendy — następnego dnia roboczego." },
      { q: "Ile kosztuje dostawa i czy mogę zwrócić towar?", a: "Dostawa jest darmowa. Masz 30 dni na zwrot bez podawania przyczyny." }
    ],
    callouts: [
      { label: "24 okienka z autkami" },
      { label: "Solidne pudełko prezentowe" },
      { label: "Wstążka do wręczenia" }
    ],
    guarantee: "Gwarancja satysfakcji — 30 dni na zwrot bez podawania przyczyny.",
    shipping: { cutoff: "15:00", time: "Wysyłka 24 h", from: "Polska", free: true, price: 0 },
    returns_days: 30,
    stock: 14,
    addons: [{ name: "Zestaw naklejek kolekcjonerskich", text: "Dołożymy go do tej samej paczki.", price: 39 }],
    related: [
      { name: "Gablotka na 24 autka", price: 89 },
      { name: "Mata drogowa do zabawy", price: 59 },
      { name: "Zestaw naklejek kolekcjonerskich", price: 39 },
      { name: "Kartka świąteczna z życzeniami", price: 12 }
    ],
    seller: { name: "", email: "" },
    gpsr: { producer: "" },
    theme: { accent: "#ff5a00" },
    seo: { title: "Kalendarz adwentowy z autkami 2026", description: "24 autka, pudełko prezentowe i darmowa dostawa." }
  });
}
