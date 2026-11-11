# Centrala CRM · Nowoczesny Handel Polski

Wspólny panel firmy (dropshipping) i generator jednostronicowych kart produktów. Docelowy adres: **https://panel.nowoczesnyhandelpolski.pl**

Cały interfejs jest po polsku.

Motyw panelu wynika z logo: granat `#13294B`, biel i czerwień `#C8102E`, krój Poppins. Biało-czerwona wstęga wraca w nawigacji, przyciskach, paskach postępu i banerach. Każdy widok ma animowaną scenę (mapa dostaw, taśma paczek, statek z kontenerami, półki, klienci, sklep z botem i inne), logowanie ma ekran z mapą i jadącą furgonetką, a po zalogowaniu wyświetla się krótkie intro z logo. Dźwięki panelu (zamówienie, zadanie, powiadomienie) są syntezowane w przeglądarce i można je wyłączyć przyciskiem „Dźwięki”. Przy ustawieniu systemowym „ogranicz ruch” animacje się wyłączają.

## Co jest w środku

Panel (`index.html`, logowanie e-mail + hasło):

- **Pulpit** — cel miesięczny, przychód, zysk, marża, wykres 14 dni, lejek, „Wymaga uwagi”
- **Zamówienia** — statusy logistyczne: nowe → w realizacji → wysłane, oraz problem / zwrot. Kliknięcie „Zamówienia” w menu otwiera od razu listę wszystkich zamówień w stylu Base: zaznaczanie wielu (na stronie i na wszystkich stronach, także tylko z gwiazdką), gwiazdki, zbiorcza zmiana statusu i opiekuna, druk, CSV, usuwanie, sortowanie i stronicowanie 20/50/100. Kliknięcie wiersza otwiera stronę zamówienia jak w Base (`#zamowienia/<id>`): produkty (wiele pozycji, dodawanie z katalogu lub własna pozycja), „Zapłacono X z Y”, dane klienta, wysyłka, pobranie, płatność, pola dodatkowe, status z „Przenieś”, daty, adres dostawy, dane do faktury, odbiór w punkcie, przesyłka, koszty i zysk; każda sekcja ma ołówek do edycji, strzałki prowadzą do poprzedniego/następnego zamówienia. Zamówienia bez znanego statusu (np. dawne „dostarczone”) trafiają do „Nowe”. Płatność (oczekuje / opłacone / anulowane / zwrot) jest osobnym polem
- **Produkty**, **Dostawcy**, **Klienci**, **Zadania** (kanban), **Sklepy i boty**
- **Generator stron** — karty one-page, podgląd, publikacja pod `/p/<slug>`
- **Leady** i **Wiadomości** — zapisy z publicznych stron
- **Komunikator zespołu** (Wiadomości → Czat zespołu) — czat wspólników na żywo: zdjęcia (wybór lub Ctrl+V, kompresja w przeglądarce), emoji i reakcje, @oznaczanie, linki #numer do zamówień, kto jest online i kto pisze, licznik nieprzeczytanych w menu i w tytule karty, dźwięk i powiadomienie przy nowej wiadomości. Wiadomości to rekordy `col = chat` w `public.records`, więc nie trzeba nic zmieniać w bazie
- **Generator promptów** — formularz (firma, produkty z CRM, 6 schematów stron: landing, sklep, centrum obsługi klienta, B2B, kampania sezonowa, wizytówka, dodatki typu e-maile i bot FAQ) składa gotowy prompt dla AI. Kopiowanie jednym kliknięciem, pobieranie .txt, zapisane szablony i szkic trzymane w przeglądarce

Strona publiczna (`/p/<slug>`) to jasny szablon z makiety: pasek informacyjny, galeria z podpisami, zestawy 1/2/3, omnibus, wariant koloru, dodatek do koszyka, prawdziwy stan magazynu, oś dostawy liczona od godziny granicznej w strefie Europe/Warsaw, obawa, cechy 01–04, porównanie, opinie ze źródłem, FAQ, „pasuje do”, formularz kontaktu, dane sprzedawcy i GPSR. Domyślny akcent to `#ff5a00`, każda strona może mieć własny.

## Architektura

Zostajemy przy **Supabase + Cloudflare Pages**. Panel jest statycznym HTML-em i rozmawia z Supabase kluczem publishable (dane chroni logowanie i RLS `is_team()`). Gość ze strony produktu nie pisze do bazy tym kluczem.

| Ruch | Jak |
| --- | --- |
| Zespół edytuje CRM i strony | Przeglądarka → Supabase, klucz publishable, RLS |
| Gość otwiera `/p/<slug>` | Pages Function czyta opublikowaną stronę kluczem **service_role** i składa HTML |
| Zamówienie, lead, kontakt | `POST /p/<slug>/order` (oraz `/lead`, `/contact`) — ta sama funkcja, walidacja, honeypot, limit prób |
| Mapa strony | `/sitemap.xml` i `/p/sitemap.xml` |

Zamówienie ląduje w istniejącej tabeli `public.records` (`col = orders`, status logistyczny `nowe`, `source = One-page`, `page_slug`, `payment_status = oczekuje`) i tworzy albo uzupełnia klienta. Lead i wiadomość to rekordy `leads` i `messages`, widoczne w panelu na żywo.

Opublikowana strona dopisuje albo aktualizuje sklep: platforma `generator`, status `live`. Wycofanie ustawia sklep na `pauza`.

Płatność nie jest jeszcze podłączona. Pole `pay_url` w odpowiedzi zamówienia jest puste, dopóki nie ustawisz `PAY_URL_TEMPLATE`. Status płatności nie zmienia statusu paczki. Gdy dojdzie Przelewy24, szablon może wyglądać tak:

```text
https://twoj-operator.example/start?n={number}&kwota={total}&email={email}&slug={slug}
```

Podstawiane są `{number}`, `{total}`, `{email}`, `{slug}`. Ten sam szablon można wpisać na karcie strony (pole „Szablon linku płatności”).

Publikacja wymaga: nagłówka, ceny albo zestawu, zdjęcia z potwierdzonym prawem, nazwy i e-maila sprzedawcy, producenta GPSR oraz opcji zakupu. Opcją zakupu jest formularz na stronie (zapis do CRM) albo link płatności. Zdjęcia bez zaznaczonego prawa nie wchodzą na stronę publiczną. Opis źródłowy (notatka wewnętrzna) nie jest publikowany.

Nie ma wiecznego licznika promocji. Zdanie o wysyłce mówi, ile zostało do godziny granicznej w Warszawie albo kiedy paczka wyjdzie w kolejnym dniu roboczym. Liczba „zostało sztuk” pojawia się tylko wtedy, gdy w karcie jest wpisany stan. Puste pole stanu nie udaje końcówki towaru. Stan 0 wyłącza zamówienie i jest zmniejszany po złożeniu zamówienia.

## Pliki

- `index.html` — panel
- `generator.js` — widok Generator stron, Leady, Wiadomości
- `prompty.js` + `lib/prompt-builder.mjs` — Generator promptów
- `chat.js` — komunikator zespołu
- `oferty.js` — baza produktów, aukcje, import z wtyczki, eksport, klucze API
- `extension/` — wtyczka Chrome do zapisu oferty Allegro
- `brand.js` — sceny SVG, ekran logowania, intro, dźwięki
- `assets/brand/` — logo (kolorowe i białe) oraz ikona/favicon
- `config.js` — adres Supabase i klucz **publishable** (publiczny z założenia)
- `lib/` — czyszczenie danych, szablon, walidacja zamówień (wspólne dla testów i Functions)
- `functions/` — Pages Functions
- `supabase.sql` — tabele, RLS, realtime. Uruchamiany w SQL Editor
- `assets/demo/` — rysunki przykładowej karty (podgląd szablonu)
- `tests/` — `npm test`

## Co musi zrobić właściciel

1. **Supabase → SQL Editor → wklej cały `supabase.sql` → Run.** Skrypt jest do powtórzenia. Na końcu w logu będzie ostrzeżenie o placeholderach.
2. **Zamień placeholdery e-maili.** W pliku są celowo fałszywe adresy:
   - `TWOJ_EMAIL@przyklad.pl`
   - `EMAIL_MICHALA@przyklad.pl`
   - `EMAIL_AGATY@przyklad.pl`

   To nie są skrzynki zespołu. Wpisz prawdziwe adresy (albo `insert` z komentarza na dole pliku), a potem:

   ```sql
   delete from public.allowed_emails where email like '%@przyklad.pl';
   ```

3. **Authentication:** wyłącz rejestrację publiczną. Site URL = `https://panel.nowoczesnyhandelpolski.pl`. Konta: właściciel przez Create user, wspólnicy przez zaproszenie.
4. **Klucz service_role** (Supabase → Project Settings → API) wstaw tylko jako sekret Cloudflare. Nie commituj go. Klucz publishable zostaje w `config.js`.
5. **Cloudflare Pages:** Workers & Pages → Create → Pages → Connect to Git → to repo. Build command: puste. Output directory: `/`.
6. **Zmienne środowiskowe** (Production), patrz też `.env.example`:

   | Zmienna | Typ | Po co |
   | --- | --- | --- |
   | `SUPABASE_URL` | tekst | `https://….supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | odczyt stron i zapis zamówień z funkcji |
   | `PUBLIC_ORIGIN` | tekst, opcjonalnie | kanoniczny adres, np. `https://panel.nowoczesnyhandelpolski.pl` |
   | `PAY_URL_TEMPLATE` | tekst, opcjonalnie | szablon `pay_url` (Przelewy24) |

7. Domena: `panel.nowoczesnyhandelpolski.pl`.
8. W panelu: Generator stron → uzupełnij kartę → Opublikuj. Adres to `https://panel.nowoczesnyhandelpolski.pl/p/<slug>`. Sklep pojawi się w „Sklepy i boty” jako „Nasz generator stron”.

`_headers` ustawia `noindex` tylko na plikach panelu. Strony z funkcji wysyłają `index, follow`, canonical, Product + FAQ (JSON-LD) i są w mapie `/sitemap.xml`. `robots.txt` puszcza `/p/` i mapę, a resztę panelu zamyka.

## Test lokalny bez bazy

```bash
node scripts/dev-server.mjs
```

Otwórz `http://127.0.0.1:4173/`. To piaskownica w pamięci procesu (bez Supabase): panel, publikacja i zamówienie ze strony dzielą jeden magazyn. Na prawdziwym Cloudflare ten tryb się nie włącza.

Testy jednostkowe:

```bash
npm test
```

## Handel: wtyczka, baza, aukcje, Allegro

Osobne tabele w `supabase.sql` (nie EAV `records`): produkty, katalogi, aukcje, powiązania ofert, szkice wystawienia, partie importu, kolejki robocze, prowizje, zadania generacji, media, klucze API. Tokeny Allegro są w `allegro_secrets` i nie mają polityk dla zalogowanych. Klucz wtyczki jest w bazie tylko jako SHA-256.

Po wgraniu SQL w Supabase powstaje też kubełek Storage `media` (zdjęcia AI i wideo). Klucze API i import z wtyczki działają bez `SUPABASE_SERVICE_ROLE_KEY`, ale tylko po ponownym uruchomieniu całego `supabase.sql` (funkcje `create_api_key`, `revoke_api_key`, `import_offer_export`). Allegro OAuth i generacja AI nadal potrzebują klucza service role.

### Wtyczka Chrome

Na pulpicie (do zamknięcia, wraca przy nowej wersji) i na stałe w **Kluczach API** jest „Pobierz wtyczkę (.zip)”. Plik oddaje `/api/extension.zip` tylko zalogowanemu zespołowi. Ten sam plik leży w `downloads/nhp-wtyczka.zip`, ale adres `/downloads/nhp-wtyczka.zip` też wymaga logowania.

1. Pobierz i rozpakuj ZIP (albo użyj katalogu `extension` z repozytorium).
2. Chrome → rozszerzenia → tryb dewelopera → **Załaduj rozpakowane**.
3. W panelu: **Klucze API** → wystaw klucz (`nhp_…`) i wklej go w okienku wtyczki.
4. Na karcie `allegro.pl/oferta/…` naciśnij **E** (poza polem tekstowym) albo **Zapisz w Centrali**. Szkic ląduje od razu w Imporcie. Brak ceny oznacza pozycję, nie jest uzupełniany.

Skrypt treści jest klasyczny: Chrome nie uruchamia `type: module` w `content_scripts`. Selektory (`extension/selectors.mjs` i `extract.mjs`) doczytuje w locie, więc da się je podmienić bez przebudowy. Po zmianie plików w `extension/` uruchom `npm run pack:extension`, żeby ZIP był zgodny ze źródłem.

Selektory DOM są tylko w `extension/selectors.mjs`. Rdzeń starego SharkHelpera nie jest w tym repozytorium — ten plik można podmienić, gdy dojdzie paczka ZIP.

### Allegro

W [Allegro dla deweloperów](https://developer.allegro.pl/) zarejestruj aplikację (authorization code). Adres zwrotny, co do znaku:

```text
https://panel.nowoczesnyhandelpolski.pl/api/allegro/callback
```

Na podglądzie Pages podmień host. Tę samą wartość daj w `ALLEGRO_REDIRECT_URL`. W panelu: Aukcje → Połącz Allegro. Dopasowanie katalogu idzie po EAN (`GET /sale/products?mode=GTIN`). **Szkic Allegro** woła `POST /sale/product-offers` ze statusem `INACTIVE`. **Publikuj** jest osobno i wymaga wpisania `PUBLIKUJ`.

**Ustaw cenę** liczy `cena bazowa = cena produktu + dostawa`, potem `cena sprzedaży = baza / (1 − prowizja)`. Prowizja jest procentem ceny końcowej i bierze się z tabeli w Aukcjach (klucz to id kolejki roboczej albo id kategorii Allegro). Brak ceny, dostawy albo stawki zatrzymuje liczenie.

### Generacja i wideo

Na stronie i przy produkcie są trzy kafle: **S1** (tekst, 0 zł za zdjęcia), **S1 Pro** (tekst + 1 zdjęcie AI, ok. 0,60 zł), **S1 Max** (tekst + 5 zdjęć AI, ok. 3 zł, oraz wideo złożone w panelu). Tekst: OpenAI Responses. Zdjęcia: `POST /v1/images/edits`. Model bierze się z `OPENAI_MODEL` / `OPENAI_IMAGE_MODEL`, a gdy ich nie ma — z Ustawień (domyślnie `gpt-5-mini` i `gpt-image-1`). Klucz: `OPENAI_API_KEY`, a gdy go nie ma — klucz zapisany w Ustawieniach. Wideo (9:16 albo 1:1, 15–30 s) rysuje przeglądarka (MediaRecorder, a gdy umie — WebCodecs). Muzyka jest wyłączona. Plik wraca do Storage i do karty strony (bohater i nagrania).

W Ustawieniach jest **Połączenie z OpenAI**. Klucz szyfruje Pages Function (AES-GCM, sekret `NHP_ENC_KEY`) i zapisuje szyfrogram funkcją `is_team()`. Do przeglądarki wraca tylko `sk-…` i 4 ostatnie znaki. Bez `NHP_ENC_KEY` panel pokazuje, jak go dodać (`openssl rand -base64 32`).

**Zrób stronę** tworzy szkic w Generatorze stron. Cudze zdjęcia nie dostają prawa do publikacji. Cena przed promocją nie jest wstawiana jako omnibus.

## Sekrety

Repozytorium jest publiczne. W gicie może być tylko klucz publishable. `service_role`, hasła, klucze Przelewy24, `ALLEGRO_CLIENT_SECRET` i `OPENAI_API_KEY` zostają w sekretach Cloudflare albo w Supabase. Pliki `.env` i `.dev.vars` są w `.gitignore`.

Dodatkowe zmienne (Production), obok tabeli wyżej:

| Zmienna | Typ | Po co |
| --- | --- | --- |
| `ALLEGRO_CLIENT_ID` | tekst | aplikacja Allegro |
| `ALLEGRO_CLIENT_SECRET` | **Secret** | wymiana kodu OAuth |
| `ALLEGRO_REDIRECT_URL` | tekst | zwrotka OAuth, musi być zgodna z aplikacją |
| `OPENAI_API_KEY` | **Secret**, opcjonalnie | gdy ustawiony, ma pierwszeństwo przed kluczem z Ustawień |
| `OPENAI_MODEL` | tekst, opcjonalnie | domyślnie `gpt-5-mini` albo model z Ustawień |
| `OPENAI_IMAGE_MODEL` | tekst, opcjonalnie | domyślnie `gpt-image-1` albo model z Ustawień |
| `NHP_ENC_KEY` | **Secret** | 32 bajty, `openssl rand -base64 32`. Szyfruje klucz OpenAI z Ustawień |

`_routes.json` obejmuje `/p/*`, `/sitemap.xml` i `/api/*`. Te wzorce nie mogą na siebie nachodzić — deploy Pages kończy się błędem 8000057.
