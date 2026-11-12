// Obsługa klienta: typy zgłoszeń, statusy, terminy ustawowe, szablony odpowiedzi i bot FAQ na stronie produktu.
// Czyste funkcje — używa ich panel (obsluga.js przez kopię w przeglądarce), strona produktu i testy.

export const TOPICS = [
  ["pytanie", "Pytanie o produkt"],
  ["zamowienie", "Moje zamówienie / dostawa"],
  ["zwrot", "Zwrot (odstąpienie od umowy)"],
  ["reklamacja", "Reklamacja (wada produktu)"],
  ["inne", "Inne"]
];

export const STATUSES = {
  pytanie: [["nowe", "Nowe"], ["odpisane", "Odpisane"], ["zamkniete", "Zamknięte"]],
  zamowienie: [["nowe", "Nowe"], ["odpisane", "Odpisane"], ["zamkniete", "Zamknięte"]],
  zwrot: [["nowe", "Zgłoszony"], ["czeka_na_paczke", "Czeka na paczkę"], ["paczka_otrzymana", "Paczka otrzymana"], ["pieniadze_zwrocone", "Pieniądze zwrócone"], ["zamkniete", "Zamknięty"]],
  reklamacja: [["nowe", "Przyjęta"], ["rozpatrywana", "Rozpatrywana"], ["uznana", "Uznana"], ["odrzucona", "Odrzucona"], ["zamkniete", "Zamknięta"]],
  inne: [["nowe", "Nowe"], ["odpisane", "Odpisane"], ["zamkniete", "Zamknięte"]]
};

const DAY = 86400e3;

// Typ zgłoszenia z tematu formularza albo z treści (gdy temat jest pusty lub „Inne”).
export function classify(topic, message = "") {
  const t = String(topic || "").toLowerCase();
  const known = TOPICS.find(([k, l]) => t === k || t === l.toLowerCase());
  if (known && known[0] !== "inne") return known[0];
  const m = `${t} ${String(message || "").toLowerCase()}`;
  if (/reklamac|wad[aęy]|uszkodz|zepsu|nie dział|niezgodn/.test(m)) return "reklamacja";
  if (/zwrot|odst[aą]pi|oddać|odesłać|odeslac|zwróci/.test(m)) return "zwrot";
  if (/zamówieni|zamowieni|paczk|przesyłk|przesylk|dostaw|kurier|paczkomat|śledz|sledz/.test(m)) return "zamowienie";
  return known ? known[0] : "pytanie";
}

// Termin, którego pilnujemy: reklamacja — 14 dni na odpowiedź (inaczej uznana), zwrot — 14 dni na oddanie pieniędzy,
// pytania — 2 dni robocze dobrej praktyki.
export function deadlineFor(type, createdAt) {
  const t = Number(createdAt) || Date.now();
  if (type === "reklamacja" || type === "zwrot") return t + 14 * DAY;
  return t + 2 * DAY;
}

export function deadlineState(ticket, now = Date.now()) {
  if (["zamkniete", "pieniadze_zwrocone", "uznana", "odrzucona", "odpisane"].includes(ticket.status)) return "ok";
  const left = Number(ticket.deadline || 0) - now;
  if (!ticket.deadline) return "ok";
  if (left < 0) return "po_terminie";
  if (left < 3 * DAY) return "pilne";
  return "ok";
}

export const TEMPLATES = [
  { id: "pytanie", type: "pytanie", title: "Odpowiedź na pytanie",
    subject: "Re: {temat}",
    body: "Dzień dobry {imie},\n\ndziękujemy za wiadomość.\n\n[odpowiedź]\n\nJeśli coś jeszcze będzie niejasne, prosimy po prostu odpisać na tego maila.\n\nPozdrawiamy\n{sprzedawca}" },
  { id: "zamowienie-status", type: "zamowienie", title: "Status zamówienia",
    subject: "Zamówienie {numer} — status",
    body: "Dzień dobry {imie},\n\nzamówienie {numer} jest w drodze. Numer przesyłki: {przesylka}.\nStatus sprawdzisz u przewoźnika po tym numerze.\n\nPozdrawiamy\n{sprzedawca}" },
  { id: "zwrot-przyjety", type: "zwrot", title: "Zwrot — przyjęcie zgłoszenia i adres",
    subject: "Zwrot zamówienia {numer} — instrukcja",
    body: "Dzień dobry {imie},\n\npotwierdzamy otrzymanie oświadczenia o odstąpieniu od umowy dla zamówienia {numer}.\n\nProsimy odesłać produkt w ciągu 14 dni na adres:\n{adres_zwrotu}\n\nPieniądze zwrócimy w ciągu 14 dni od otrzymania oświadczenia, tą samą metodą płatności (możemy wstrzymać zwrot do chwili otrzymania paczki albo dowodu jej nadania).\n\nPozdrawiamy\n{sprzedawca}" },
  { id: "zwrot-pieniadze", type: "zwrot", title: "Zwrot — pieniądze odesłane",
    subject: "Zwrot pieniędzy za zamówienie {numer}",
    body: "Dzień dobry {imie},\n\nzwróciliśmy {kwota} za zamówienie {numer} tą samą metodą płatności. W zależności od banku pieniądze pojawią się na koncie w ciągu kilku dni roboczych.\n\nDziękujemy i pozdrawiamy\n{sprzedawca}" },
  { id: "reklamacja-przyjeta", type: "reklamacja", title: "Reklamacja — przyjęcie",
    subject: "Reklamacja zamówienia {numer} — przyjęta",
    body: "Dzień dobry {imie},\n\nprzyjęliśmy reklamację dotyczącą zamówienia {numer}. Odpowiemy najpóźniej do {termin}.\n\nŻeby przyspieszyć sprawę, prosimy o zdjęcia wady i krótki opis, kiedy się pojawiła.\n\nPozdrawiamy\n{sprzedawca}" },
  { id: "reklamacja-uznana", type: "reklamacja", title: "Reklamacja — uznana",
    subject: "Reklamacja zamówienia {numer} — uznana",
    body: "Dzień dobry {imie},\n\nuznajemy reklamację zamówienia {numer}. Proponujemy: [wymiana / naprawa / zwrot pieniędzy]. Prosimy o potwierdzenie, które rozwiązanie wybierasz.\n\nPrzepraszamy za kłopot.\n\nPozdrawiamy\n{sprzedawca}" },
  { id: "reklamacja-odrzucona", type: "reklamacja", title: "Reklamacja — odrzucona (z uzasadnieniem)",
    subject: "Reklamacja zamówienia {numer} — odpowiedź",
    body: "Dzień dobry {imie},\n\npo sprawdzeniu nie możemy uznać reklamacji zamówienia {numer}, ponieważ [uzasadnienie].\n\nJeśli się z tym nie zgadzasz, możesz skorzystać z pomocy miejskiego lub powiatowego rzecznika konsumentów albo Inspekcji Handlowej (prawakonsumenta.uokik.gov.pl).\n\nPozdrawiamy\n{sprzedawca}" }
];

export function fillTemplate(text, vars = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== "" ? String(vars[k]) : m));
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2);

// Odpowiedzi bota na stronie produktu: FAQ z karty + stałe odpowiedzi zbudowane z danych karty (zawsze prawdziwe).
export function botKnowledge(d = {}) {
  const ship = d.shipping || {};
  const seller = d.seller || {};
  const mail = seller.email || "";
  const days = d.returns_days || 14;
  const base = [
    { q: "Ile kosztuje dostawa i jak długo trwa?", k: "dostawa wysylka koszt kurier paczkomat kiedy dojdzie ile dni czas",
      a: `${ship.free === false && ship.price ? `Dostawa kosztuje ${ship.price} zł.` : "Dostawa jest bezpłatna."} ${ship.time || "Wysyłamy zwykle w 1–2 dni robocze"}, a przewoźnik doręcza najczęściej w 1–2 dni robocze. Możesz wybrać paczkomat albo kuriera.` },
    { q: "Jak zwrócić produkt?", k: "zwrot zwrocic oddac odstapienie odeslac zwrot pieniedzy",
      a: `Masz ${days} dni od otrzymania na zwrot bez podawania przyczyny. Napisz${mail ? ` na ${mail}` : " przez formularz poniżej"}, a podamy adres. Pieniądze oddajemy w ciągu 14 dni, tą samą metodą płatności.` },
    { q: "Jak złożyć reklamację?", k: "reklamacja wada uszkodzony zepsuty nie dziala gwarancja rekojmia",
      a: `Napisz${mail ? ` na ${mail}` : " przez formularz poniżej"}: numer zamówienia, opis i zdjęcia wady. Odpowiadamy w ciągu 14 dni. Odpowiadamy za zgodność towaru z umową przez 2 lata.` },
    { q: "Jak mogę zapłacić?", k: "platnosc zaplacic blik przelewy24 karta apple google pay",
      a: "Płacisz od razu przy zamówieniu: BLIK, Przelewy24, kartą, Apple Pay albo Google Pay. Płatność obsługuje Stripe." },
    { q: "Gdzie jest moje zamówienie?", k: "gdzie zamowienie paczka sledzenie numer przesylki status",
      a: `Numer przesyłki wysyłamy mailem, gdy paczka wyjdzie z magazynu. Jeśli go nie masz, napisz${mail ? ` na ${mail}` : ""} z numerem zamówienia.` },
    { q: "Kto jest sprzedawcą?", k: "sprzedawca firma kontakt adres kim jestescie telefon",
      a: `${seller.name || "Sprzedawca"}${seller.address ? `, ${seller.address}` : ""}${mail ? `. Kontakt: ${mail}` : ""}${seller.phone ? `, tel. ${seller.phone}` : ""}.` }
  ];
  const fromFaq = (d.faq || []).filter((f) => f && f.q && f.a).map((f) => ({ q: f.q, a: f.a, k: "" }));
  return [...fromFaq, ...base];
}

export function botAnswer(question, kb) {
  const qw = words(question);
  if (!qw.length) return null;
  let best = null;
  for (const item of kb) {
    const hay = new Set(words(`${item.q} ${item.k}`));
    let score = 0;
    for (const w of qw) {
      if (hay.has(w)) score += 2;
      else if ([...hay].some((h) => h.length > 4 && (h.startsWith(w.slice(0, 5)) || w.startsWith(h.slice(0, 5))))) score += 1;
    }
    if (score > (best ? best.score : 0)) best = { ...item, score };
  }
  return best && best.score >= 2 ? best : null;
}
