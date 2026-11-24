// Instrukcja wtyczki w panelu. Wersja jest ta sama co w extension/manifest.json.
import { EXTENSION_VERSION } from "./extension-announce.mjs";

export { EXTENSION_VERSION };

export const EXTENSION_CHANGELOG = [
  ["1.3.0", "Przycisk „Zapisz tę ofertę w NHP” na karcie produktu w dowolnym sklepie, z podglądem przed zapisem. Na listingu: zaznaczanie kart, pobranie wszystkich stron i zapis do NHP albo do sesji CSV. Panel na stronie da się zwinąć do zakładki albo zamknąć. Gdy sesja CSV nie trwa, startuje zwinięty."],
  ["1.2.0", "Sesja CSV: start, pauza, pobranie pliku i wysyłka do panelu. Grupy produktów — w Bazie produktów da się po nich filtrować i zrobić strony hurtowo."],
  ["1.1.4", "Parametry oferty (kolor, rozmiar i podobne) zapisują się jako zwykły tekst."],
  ["1.1.3", "Panel wtyczki na stronie oferty, da się go zwinąć. Zapis do Centrali albo na własny adres."],
  ["1.1.2", "Wygląd wtyczki jak w panelu: granat, czerwień i logo firmy."],
  ["1.1.1", "Zdjęcia ze skanu sklepu mogą iść na serwer panelu."],
  ["1.1.0", "Eksport sklepu: skan innych sklepów oraz pliki CSV, Excel, JSON i zdjęcia."],
  ["1.0.2", "Klucz z panelu wkleja się w okienku wtyczki."],
  ["1.0.1", "Pobieranie z panelu i zapis oferty Allegro klawiszem E."]
];

const FACTS = ["Nazwa", "Opis", "Zdjęcia", "Parametry", "EAN", "Producent", "Cena"];

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pl-PL");
}

function keyCards(e, keys) {
  return keys.map((key) => {
    const label = e(key?.label || "Wtyczka");
    const created = e(when(key?.created_at));
    const used = e(when(key?.last_used_at));
    const off = !!key?.revoked_at;
    const action = off || !key?.id
      ? ""
      : `<button class="btn sm danger" type="button" data-nhp="revoke" data-id="${e(key.id)}">Odwołaj</button>`;
    return `<article class="ext-key">
      <div class="ext-key-h"><b>${label}</b><span class="pill" style="--c:${off ? "var(--grey)" : "var(--good)"}">${off ? "Odwołany" : "Aktywny"}</span></div>
      <p class="small muted">Utworzony ${created}. Ostatnie użycie: ${used}.</p>
      ${action}
    </article>`;
  }).join("");
}

export function extensionPageHtml(esc, { keys = [], freshKey = "" } = {}) {
  const e = esc || ((value) => String(value ?? ""));
  const list = Array.isArray(keys) ? keys : [];
  const fresh = freshKey ? `<div class="banner" role="status">Nowy klucz widać tylko teraz. Skopiuj go i wklej w okienku wtyczki: <b>${e(freshKey)}</b> Na liście zostaje sama nazwa. Po odświeżeniu panelu pełny klucz znika.</div>` : "";
  const cards = keyCards(e, list);
  const table = cards
    ? `<div class="ext-keys">${cards}</div>`
    : `<div class="empty"><b>Nie masz jeszcze klucza</b>Wpisz nazwę i kliknij „Wystaw klucz”. Potem wklej go w okienku wtyczki.</div>`;
  const log = EXTENSION_CHANGELOG.map(([version, text], index) => `<li class="${index === 0 && version === EXTENSION_VERSION ? "now" : ""}"><b>${e(version)}</b><span>${e(text)}</span></li>`).join("");

  return `<div class="ext-guide" data-ext-page>
    <section class="card ext-hero">
      <div>
        <p class="ext-kicker">Aktualna wersja wtyczki</p>
        <p class="ext-ver" data-ext-version="${e(EXTENSION_VERSION)}">${e(EXTENSION_VERSION)}</p>
        <p>Pobierz plik ZIP, rozpakuj go i wgraj do Chrome. Przycisk działa po zalogowaniu do panelu.</p>
      </div>
      <button class="btn primary ext-dl" type="button" data-nhp="download-ext"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg> Pobierz wtyczkę (.zip)</button>
    </section>
    <div class="grid two">
      <section class="card pad">
        <h2>Jak wgrać wtyczkę</h2>
        <ol class="ext-steps">
          <li><span>Kliknij „Pobierz wtyczkę (.zip)” u góry i rozpakuj plik. W Windows: prawy przycisk myszy → Wyodrębnij wszystkie.</span></li>
          <li><span>Otwórz Chrome. W pasku adresu wklej <code>chrome://extensions</code> i naciśnij Enter. Możesz też wejść przez trzy kropki → Rozszerzenia → Zarządzaj rozszerzeniami.</span></li>
          <li><span>Włącz <b>Tryb dewelopera</b>. To przełącznik w prawym górnym rogu.</span></li>
          <li><span>Kliknij <b>Załaduj rozpakowane</b> i wskaż folder rozpakowanej wtyczki. W tym folderze ma być plik <code>manifest.json</code>. Nie wskazuj samego pliku ZIP.</span></li>
        </ol>
      </section>
      <section class="card pad">
        <h2>Jak zaktualizować</h2>
        <ol class="ext-steps">
          <li><span>Pobierz nową wersję tym samym przyciskiem u góry.</span></li>
          <li><span>Rozpakuj ją do tego samego folderu co poprzednio i <b>nadpisz</b> stare pliki. Nie kasuj folderu i nie wgrywaj drugi raz „Załaduj rozpakowane”, bo Chrome zrobi drugą kopię.</span></li>
          <li><span>Wróć na <code>chrome://extensions</code> i przy wtyczce NHP kliknij <b>Odśwież</b> (ikonka strzałki na karcie wtyczki).</span></li>
        </ol>
        <p class="small muted">Aktualna wersja to ${e(EXTENSION_VERSION)}. Po odświeżeniu ten sam numer widać na karcie wtyczki w Chrome.</p>
      </section>
    </div>
    <section class="card pad" id="klucz-wtyczki">
      <div class="sec-h"><h2>Klucz do wtyczki</h2></div>
      <p>Bez klucza wtyczka nie zapisze oferty w panelu. Wpisz nazwę, żeby było wiadomo, czyj to komputer. Pełny klucz pokażemy raz, zaraz po utworzeniu. Później na liście jest tylko nazwa — klucza nie da się odczytać ponownie.</p>
      ${fresh}
      <div class="row ext-key-row">
        <input id="key-label" placeholder="Nazwa, np. komputer Ani" autocomplete="off" aria-label="Nazwa klucza">
        <button class="btn primary" type="button" data-nhp="new-key">Wystaw klucz</button>
      </div>
      ${table}
      <p class="small">Klucz zaczyna się od <code>nhp_</code>. W okienku wtyczki wklej go w pole „Klucz API” i kliknij „Zapisz ustawienia”.</p>
      <p class="small">Adres panelu: <code>https://panel.nowoczesnyhandelpolski.pl</code></p>
      <p class="small muted">„Odwołaj” wyłącza klucz. Wtyczka z tym kluczem przestanie zapisywać oferty. Wtedy wystaw nowy i wklej go ponownie. To samo da się zrobić w <button class="linkbtn" type="button" data-nav="klucze-api">Kluczach API</button>.</p>
    </section>
    <section class="card pad">
      <h2>Jak z tego korzystać</h2>
      <h3>Oferta Allegro</h3>
      <p>Otwórz ofertę na Allegro. Po prawej jest panel wtyczki. Naciśnij klawisz E (gdy nie piszesz w polu tekstowym) albo przycisk „Zapisz w Centrali”. Na stronie oferty ten przycisk nazywa się „Zapisz tę ofertę”. Oferta od razu trafia do Bazy produktów. Gdy na stronie nie ma ceny, pozycja jest oznaczona — wtyczka jej nie zgaduje.</p>
      <p>„Zwiń” zostawia wąską zakładkę przy krawędzi ekranu. Kliknięcie zakładki rozwija panel. „Zamknij” chowa go, aż klikniesz ikonkę wtyczki, klawisz E albo przycisk na stronie. Esc zwija otwarty panel. Gdy sesja CSV nie trwa, panel startuje zwinięty i nie zasłania karty. Kliknięcia obok panelu trafiają w stronę sklepu.</p>
      <h3>Eksport sklepu</h3>
      <p>Na innych sklepach niż Allegro kliknij ikonkę wtyczki przy pasku Chrome, wybierz „Eksport sklepu” i kliknij „Skanuj sklep”. Wtyczka zbiera produkty z tej strony sklepu. Potem zapisz je w panelu albo pobierz plik (CSV, Excel, JSON albo zdjęcia).</p>
      <h3>Jedna karta produktu</h3>
      <p>Na stronie jednego produktu, w dowolnym sklepie, wtyczka pokazuje przycisk „Zapisz tę ofertę w NHP”. Klawisz E otwiera podgląd: nazwa, zdjęcie, cena oraz liczba zdjęć i parametrów. Brakujące pola są zaznaczone na czerwono. Potem kliknij „Zapisz w NHP” albo „Dodaj do sesji CSV”. Przycisk da się przesunąć, zwinąć albo ukryć na tej stronie, żeby nie zasłaniał koszyka.</p>
      <h3>Cały listing</h3>
      <p>Na stronie kategorii przy każdej karcie produktu jest pole do zaznaczenia. „Zaznacz wszystkie na stronie” bierze widoczne karty. „Cały listing (wszystkie strony)” idzie po kolejnych stronach. Limit to 50, 200 albo wszystkie. Wtyczka otwiera każdą kartę i zbiera pełny opis, EAN, zdjęcia w pełnym rozmiarze, parametry, SKU, producenta, ceny i warianty. Widać licznik: gotowe, błędy i brak EAN. Da się wstrzymać albo przerwać. Na końcu „Zapisz wszystkie w NHP”, „Dodaj do sesji CSV” (z grupą) albo pobierz CSV i Excel. Produkty, które już są w bazie (ten sam EAN albo adres), są pomijane.</p>
      <h3>Jakie dane zbieramy</h3>
      <p>Z oferty bierzemy to, co jest na stronie:</p>
      <p class="ext-facts">${FACTS.map((name) => `<span class="tag">${e(name)}</span>`).join("")}</p>
      <p class="small muted">Jeśli na stronie jest też koszt dostawy albo czas wysyłki, one też wchodzą. Brakującej ceny nie dopisujemy.</p>
      <h3>Sesja CSV</h3>
      <p>Gdy zbierasz wiele ofert naraz, w okienku wtyczki jest sesja CSV. Lista zostaje po odświeżeniu strony.</p>
      <ul>
        <li><b>Zacznij sesję CSV</b> — start. Kolejne oferty z Allegro i ze sklepu dopisują się do jednej listy.</li>
        <li><b>Wstrzymaj</b> — pauza. Lista zostaje, nowe oferty nie dochodzą. „Wznów” włącza zbieranie z powrotem.</li>
        <li><b>Zakończ i pobierz CSV</b> — plik na komputer.</li>
        <li><b>Wyślij sesję do NHP</b> — zapis tej listy do Bazy produktów, razem z grupą.</li>
      </ul>
      <h3>Grupy</h3>
      <p>Przy sesji wpisz nazwę grupy (na przykład „Skrobaczki”) i kliknij „Dodaj”. Nowe oferty dostają tę grupę. Ta sama nazwa jest potem w Bazie produktów i da się po niej filtrować.</p>
      <h3>Baza produktów</h3>
      <p>Gdy oferty są już zapisane, wejdź w zakładkę „Baza produktów”. Przy jednym produkcie kliknij „Zrób stronę”. Przy wielu zaznaczonych albo przy całej grupie kliknij „Zrób strony”. Powstają karty z oryginalnym opisem. Publikacja strony zostaje ręczna.</p>
      <p><button class="btn" type="button" data-nav="baza-produktow">Otwórz Bazę produktów</button></p>
    </section>
    <section class="card pad">
      <h2>Co się zmieniało</h2>
      <ul class="ext-log">${log}</ul>
    </section>
  </div>`;
}

export const EXT_GUIDE_CSS = `
.ext-guide{display:flex;flex-direction:column;gap:16px}
.ext-guide > .card{margin:0}
.ext-hero{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px;padding:22px 24px 28px;position:relative;overflow:hidden;background:
  radial-gradient(120% 140% at 100% 0%,color-mix(in srgb,var(--red) 12%,transparent) 0,transparent 55%),
  radial-gradient(90% 120% at 0% 100%,color-mix(in srgb,var(--navy) 8%,transparent) 0,transparent 60%),var(--surface)}
.ext-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:6px;background:linear-gradient(var(--navy) 0 50%,var(--red) 50%)}
.ext-ver{margin:0;font-family:var(--display);font-size:clamp(40px,5vw,56px);font-weight:800;letter-spacing:-.03em;line-height:.95;color:var(--ink)}
.ext-hero p{margin:8px 0 0;max-width:52ch}
.ext-dl{font-size:18px;padding:16px 26px 18px;min-height:56px}
.ext-guide h2{font-size:20px;margin-bottom:8px}
.ext-guide h3{font-size:16px;margin:16px 0 6px}
.ext-guide h3:first-of-type{margin-top:4px}
.ext-guide p{margin:0 0 8px}
.ext-guide .sec-h{margin-bottom:8px}
.ext-steps{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:12px;counter-reset:step}
.ext-steps li{display:grid;grid-template-columns:32px 1fr;gap:10px;align-items:start;counter-increment:step}
.ext-steps li::before{content:counter(step);width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--navy);color:#fff;font:800 14px var(--display);box-shadow:inset 0 -3px 0 var(--red)}
.ext-facts{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px}
.ext-log{list-style:none;padding:0;margin:0}
.ext-log li{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:10px 0;border-top:1px solid var(--line);align-items:baseline}
.ext-log li:first-child{border-top:0}
.ext-log b{font-family:var(--display)}
.ext-log .now b{color:var(--red)}
.ext-key-row{margin:4px 0 14px}
.ext-key-row input{border:1px solid var(--line);border-radius:10px;padding:9px 11px;min-width:min(100%,240px);background:var(--surface-2)}
.ext-keys{display:flex;flex-direction:column;gap:10px;margin:0 0 12px}
.ext-key{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface-2)}
.ext-key-h{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ext-key p{margin:6px 0 8px}
.ext-guide code{overflow-wrap:anywhere}
.ext-guide .empty{padding:18px 12px}
.ext-guide .linkbtn{font-size:inherit;align-self:auto;color:var(--accent);font-weight:700}
@media (max-width:640px){
  .ext-hero{padding:18px 16px 24px}
  .ext-dl,.ext-key-row .btn{width:100%;justify-content:center}
  .ext-key-row{align-items:stretch}
  .ext-key-row input{width:100%}
  .ext-log li{grid-template-columns:1fr;gap:2px}
}
`;
