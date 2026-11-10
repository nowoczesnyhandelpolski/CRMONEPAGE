// Teksty wtyczki w panelu. Wersja musi być zgodna z extension/manifest.json.

export const EXTENSION_VERSION = "1.0.1";
export const BANNER_STORAGE_KEY = "nhp-ext-banner";
export const EXTENSION_HEADLINE = "Nowa wtyczka NHP do pobrania";

export function bannerDismissed(stored, version = EXTENSION_VERSION) {
  return stored === version;
}

const DESCRIPTION = "Na stronie oferty Allegro klawisz E (albo przycisk) zbiera nazwę katalogową, cenę i cenę przed promocją, dostawę i czas wysyłki, EAN, kategorię, producenta, parametry, galerię i opis w sekcjach. Zapisuje to od razu jako szkic w Import z wtyczki. Brak ceny to oznaczenie, bez zgadywania. Z importu można zrobić szkic aukcji Allegro (nieaktywny) albo stronę (Zrób stronę). Publikacja zawsze ręczna.";

const STEPS = [
  "Pobierz i rozpakuj ZIP.",
  "Wejdź na chrome://extensions, włącz Tryb dewelopera i kliknij Załaduj rozpakowane.",
  "Wygeneruj klucz w Klucze API i wklej go w okienku wtyczki.",
  "Otwórz ofertę Allegro i naciśnij E."
];

export function extensionAnnounceHtml(esc, { dismiss = false } = {}) {
  const e = esc || ((v) => String(v ?? ""));
  const close = dismiss
    ? `<button class="btn sm ghost" type="button" data-nhp="dismiss-ext" aria-label="Zamknij ogłoszenie">Zamknij</button>`
    : "";
  return `<section class="card ext-ann"${dismiss ? ' role="status"' : ""}>
    <div class="ext-ann-h">
      <div>
        <p class="ext-kicker">Wersja ${e(EXTENSION_VERSION)}</p>
        <h2>${e(EXTENSION_HEADLINE)}</h2>
      </div>
      ${close}
    </div>
    <p>${e(DESCRIPTION)}</p>
    <ol>${STEPS.map((step) => `<li>${e(step)}</li>`).join("")}</ol>
    <button class="btn primary" type="button" data-nhp="download-ext">Pobierz wtyczkę (.zip)</button>
  </section>`;
}

export const EXT_ANN_CSS = `
.ext-ann{margin-bottom:16px;padding:16px 18px 16px 22px;background:linear-gradient(90deg,var(--red,#C8102E) 0 5px,transparent 5px),var(--surface);border:1px solid var(--line)}
.ext-ann-h{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.ext-kicker{margin:0 0 4px;color:var(--red,#C8102E);font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.ext-ann h2{font-size:22px;color:var(--navy,var(--ink))}
.ext-ann p{margin:8px 0;color:var(--ink)}
.ext-ann ol{margin:8px 0 14px;padding-left:18px}
.ext-ann li{margin:4px 0}
`;
