// Generator promptów — składa prompt dla AI budującej strony sklepu.
// Czysta funkcja: ten sam kod w panelu i w testach.

export const TONES = [
  ["profesjonalny", "Profesjonalny i ciepły"],
  ["mlodziezowy", "Luźny, młodzieżowy"],
  ["premium", "Premium, elegancki"],
  ["ekspercki", "Ekspercki, rzeczowy"],
  ["rodzinny", "Rodzinny, przyjazny"]
];

export const FORMATS = [
  ["html", "Jeden plik HTML + CSS"],
  ["react", "Komponenty React + Tailwind"],
  ["karta", "Pola karty „Generator stron” w panelu"],
  ["tekst", "Same teksty (bez kodu)"]
];

export const SCHEMAS = [
  { id: "A", name: "Landing jednego produktu", hint: "Reklamy FB/TikTok, najwyższa konwersja",
    text: "SCHEMAT A – LANDING PRODUKTOWY:\nHero (problem → rozwiązanie, zdjęcie/wideo, cena, CTA) → pasek zaufania (dostawa, zwroty, płatności) → 3 korzyści z ikonami → produkt w użyciu (galeria/GIF) → „Jak to działa” w 3 krokach → porównanie „my vs. tanie zamienniki” → opinie (pola do uzupełnienia) → zestawy/pakiety (1 szt., 2 szt. -10%, 3 szt. -20%) → gwarancja i zwroty → FAQ (8–10 pytań) → końcowe CTA z ograniczeniem (tylko PRAWDZIWE, np. termin promocji) → stopka prawna." },
  { id: "B", name: "Sklep wielokategoriowy", hint: "Pełny sklep z kategoriami i koszykiem",
    text: "SCHEMAT B – SKLEP OGÓLNY:\nStrona główna (banner promocji, kategorie, bestsellery, nowości, korzyści sklepu, newsletter z rabatem na 1. zakup) → listing kategorii z filtrami (cena, cecha, dostępność) → karta produktu (galeria, cena + najniższa z 30 dni, warianty, czas dostawy, zwroty, dane producenta GPSR, opis korzyściowy + specyfikacja, „często kupowane razem”, opinie) → koszyk z progiem darmowej dostawy („brakuje Ci X zł”) → checkout max 2 kroki, zakup bez rejestracji → strona podziękowania z upsellem." },
  { id: "C", name: "Centrum obsługi klienta", hint: "Zwroty, reklamacje, śledzenie, FAQ",
    text: "SCHEMAT C – CENTRUM POMOCY:\nWyszukiwarka pomocy → kafelki: Śledź zamówienie / Zwroty i reklamacje / Dostawa / Płatności / Faktury / Kontakt → formularz zwrotu krok po kroku (numer zamówienia, powód, zdjęcia) → formularz reklamacji (rękojmia 2 lata) → FAQ pogrupowane tematycznie → gotowe szablony odpowiedzi dla bota/czatu (opóźniona paczka, uszkodzony towar, zła wielkość, brak potwierdzenia płatności) → godziny pracy i czas odpowiedzi (np. do 24h w dni robocze)." },
  { id: "D", name: "B2B / hurt / partnerzy", hint: "Oferta dla firm i program partnerski",
    text: "SCHEMAT D – B2B I WSPÓŁPRACA:\nHero dla firm („Zaopatrzenie dla sklepów i firm”) → korzyści (ceny hurtowe, faktura VAT, odroczona płatność, dedykowany opiekun) → katalog z cenami po zalogowaniu → progi rabatowe od ilości → formularz zapytania ofertowego (firma, NIP, ilość, termin) → program partnerski/afiliacyjny (prowizja, link, panel) → kontakt z handlowcem." },
  { id: "E", name: "Kampania sezonowa", hint: "Black Week, Święta, Dzień Matki…",
    text: "SCHEMAT E – AKCJA SEZONOWA: {season}\nHero z tematem i realną datą końca → licznik do końca promocji (tylko jeśli data jest prawdziwa) → wybór prezentów wg budżetu (do 50/100/200 zł) i odbiorcy → zestawy prezentowe → ostatni termin zamówienia z dostawą przed świętem → pakowanie na prezent → newsletter → FAQ dostawy sezonowej." },
  { id: "F", name: "Wizytówka „O nas”", hint: "Strona firmowa, zaufanie, kontakt",
    text: "SCHEMAT F – WIZYTÓWKA:\nKim jesteśmy (historia, zespół, zdjęcia) → misja i wartości → jak pracujemy (wybór dostawców, kontrola jakości, obsługa po polsku) → liczby (tylko prawdziwe) → dwie ścieżki: dla klientów / dla partnerów → kontakt z mapą i danymi rejestrowymi." }
];

export const EXTRAS = [
  ["ab", "3 warianty nagłówka hero do testów A/B"],
  ["emails", "Sekwencja 3 e-maili: powitalny z rabatem, porzucony koszyk, prośba o opinię"],
  ["bot", "15 pytań i odpowiedzi dla bota obsługi klienta"],
  ["upsell", "Propozycje upsell i cross-sell dla każdego produktu"],
  ["desc", "Opisy produktów: krótki (kafelek) i długi (karta produktu)"],
  ["ads", "5 tekstów reklam (Facebook/Instagram/TikTok) z hookiem w 1. zdaniu"],
  ["seo", "10 fraz SEO z intencją zakupową + propozycja 3 artykułów blogowych"]
];

export function emptyPrompt() {
  return {
    brand: "Nowoczesny Handel Polski",
    company: "",
    domain: "nowoczesnyhandelpolski.pl",
    colors: "granat #1B2A4A, biel, akcent czerwony #D62828",
    tone: "profesjonalny",
    category: "",
    products: "",
    audience: "",
    usp: "",
    deliveryTime: "3–7 dni roboczych",
    deliveryCost: "",
    payments: "BLIK, Przelewy24, karta",
    returns: "14 dni na odstąpienie od umowy",
    schema: "A",
    season: "",
    cta: "Kup teraz",
    goal2: "",
    format: "html",
    extras: ["ab", "bot"]
  };
}

const label = (list, k) => (list.find((x) => x[0] === k) || [k, k])[1];
const val = (v, ph) => (String(v ?? "").trim() || `[${ph}]`);

export function buildPrompt(input) {
  const d = { ...emptyPrompt(), ...(input || {}) };
  const schema = SCHEMAS.find((s) => s.id === d.schema) || SCHEMAS[0];
  const products = String(d.products || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const extras = (Array.isArray(d.extras) ? d.extras : []).filter((k) => EXTRAS.some((e) => e[0] === k));
  const formatText = {
    html: "gotowy kod: jeden plik HTML z osadzonym CSS i minimalnym JS",
    react: "gotowy kod: komponenty React + Tailwind, jeden komponent na sekcję",
    karta: "wartości do wklejenia w pola karty „Generator stron” w panelu Centrala: nagłówek, podtytuł, zestawy 1/2/3 z cenami, cechy 01–04, obawa klienta i odpowiedź, porównanie, FAQ, dane producenta GPSR",
    tekst: "same teksty sekcji, bez kodu, z nagłówkami H1–H3"
  }[d.format] || "gotowy kod";

  const out = [];
  out.push("Jesteś doświadczonym projektantem stron e-commerce i copywriterem sprzedażowym, specjalizującym się w dropshippingu na rynku polskim. Zbuduj kompletną, gotową do publikacji stronę internetową według poniższych danych.");
  out.push("");
  out.push("=== DANE FIRMY ===");
  out.push(`Nazwa sklepu/marki: ${val(d.brand, "nazwa marki")}`);
  out.push(`Dane firmy do stopki: ${val(d.company, "nazwa, adres, NIP, e-mail, telefon")}`);
  out.push(`Domena: ${val(d.domain, "domena")}`);
  out.push(`Logo i kolory: ${val(d.colors, "kolory marki")}`);
  out.push(`Ton komunikacji: ${label(TONES, d.tone)}`);
  out.push("");
  out.push("=== PRODUKT / OFERTA ===");
  out.push(`Kategoria: ${val(d.category, "kategoria produktów")}`);
  out.push("Produkty (nazwa – cena – cena przekreślona – kluczowe korzyści):");
  if (products.length) products.forEach((p) => out.push(`- ${p}`));
  else out.push("- [produkt 1]", "- [produkt 2]");
  out.push(`Grupa docelowa: ${val(d.audience, "kto kupuje, jaki ma problem")}`);
  out.push(`Główna obietnica (USP): ${val(d.usp, "dlaczego u nas, a nie na Allegro/Temu")}`);
  out.push(`Czas dostawy: ${val(d.deliveryTime, "czas dostawy")} | Koszt dostawy: ${val(d.deliveryCost, "koszt dostawy")}`);
  out.push(`Płatności: ${val(d.payments, "metody płatności")}`);
  out.push(`Zwroty: ${val(d.returns, "zasady zwrotów")}`);
  out.push("");
  out.push("=== CEL STRONY ===");
  out.push(`Typ strony: ${schema.text.replace("{season}", String(d.season || "").trim() || "[nazwa akcji]")}`);
  out.push(`Główna akcja (CTA): ${val(d.cta, "np. Kup teraz")}`);
  if (String(d.goal2 || "").trim()) out.push(`Cel dodatkowy: ${String(d.goal2).trim()}`);
  out.push("");
  out.push("=== WYMAGANIA OBOWIĄZKOWE ===");
  [
    "Język: polski, bez błędów, naturalny (nie „tłumaczony”).",
    "Mobile-first – większość ruchu to telefony. Przycisk CTA zawsze widoczny (sticky na mobile).",
    "Szybkość: lekkie obrazy (WebP, lazy-loading), brak zbędnych skryptów.",
    "SEO: unikalny title (do 60 znaków), meta description (do 155 znaków), nagłówki H1–H3, przyjazne adresy URL, dane strukturalne Product/FAQ/Organization.",
    "Zaufanie: dane firmy w stopce, ikony płatności, polityka zwrotów widoczna przy produkcie, realny czas dostawy, opinie TYLKO prawdziwe – zostaw pola do uzupełnienia, nie wymyślaj opinii, ocen ani liczby klientów.",
    "Wymogi prawne PL/UE: Regulamin, Polityka prywatności (RODO), baner cookies z wyborem zgód, informacja o prawie odstąpienia od umowy w 14 dni + wzór formularza odstąpienia, przy promocjach najniższa cena z 30 dni przed obniżką (Omnibus), przy produkcie dane producenta/importera i ostrzeżenia bezpieczeństwa (GPSR).",
    "Obsługa klienta: widoczny kontakt (e-mail, telefon, godziny), FAQ, strona „Śledź zamówienie”, miejsce na czat/bota.",
    "Nie obiecuj niczego, czego dropshipping nie dowiezie (np. „wysyłka w 24h”, jeśli towar idzie od dostawcy). Żadnych fałszywych liczników i „ostatnich sztuk”."
  ].forEach((r, i) => out.push(`${i + 1}. ${r}`));
  out.push("");
  out.push("=== FORMAT WYNIKU ===");
  out.push(`Zwróć: (a) mapę strony, (b) pełne teksty każdej sekcji, (c) ${formatText}, (d) listę miejsc do ręcznego uzupełnienia (zdjęcia, opinie, dane prawne).`);
  if (extras.length) {
    out.push("");
    out.push("=== DODATKOWO ===");
    extras.forEach((k) => out.push(`- ${label(EXTRAS, k)}.`));
  }
  return out.join("\n");
}

// Ile pól w nawiasach [..] zostało do uzupełnienia.
export function missingCount(prompt) {
  return (String(prompt).match(/\[[^\]\n]{2,80}\]/g) || []).length;
}
