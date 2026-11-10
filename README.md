# Centrala CRM · Nowoczesny Handel Polski

Wspólny panel firmy (dropshipping) i generator jednostronicowych kart produktów. Docelowy adres: **https://panel.nowoczesnyhandelpolski.pl**

Cały interfejs jest po polsku.

## Co jest w środku

Panel (`index.html`, logowanie e-mail + hasło):

- **Pulpit** — cel miesięczny, przychód, zysk, marża, wykres 14 dni, lejek, „Wymaga uwagi”
- **Zamówienia** — statusy logistyczne: nowe → zamówione u dostawcy → wysłane → dostarczone, oraz problem / zwrot. Płatność (oczekuje / opłacone / anulowane / zwrot) jest osobnym polem
- **Produkty**, **Dostawcy**, **Klienci**, **Zadania** (kanban), **Sklepy i boty**
- **Generator stron** — karty one-page, podgląd, publikacja pod `/p/<slug>`
- **Leady** i **Wiadomości** — zapisy z publicznych stron
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

## Sekrety

Repozytorium jest publiczne. W gicie może być tylko klucz publishable. `service_role`, hasła i klucze Przelewy24 zostają w sekretach Cloudflare albo w Supabase. Pliki `.env` i `.dev.vars` są w `.gitignore`.
