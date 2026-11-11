# Shopify i KSeF

Panel zostaje przy Cloudflare Pages i Supabase. Sekrety są tylko w zmiennych Cloudflare (Production → Settings → Environment variables, typ **Secret** tam, gdzie niżej jest „Secret”). W repozytorium nie ma wartości. Po zmianie zmiennych trzeba powtórzyć wdrożenie Pages.

Najpierw w Supabase → SQL Editor wklej cały `supabase.sql` i uruchom go ponownie. Skrypt nie kasuje produktów ani zamówień. Dopisuje status handlowy, historię, statystyki, zamówienia Shopify i faktury KSeF.

## Sekrety

| Nazwa | Typ | Po co |
| --- | --- | --- |
| `SUPABASE_URL` | tekst | już wymagany przez strony i zamówienia |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | zapis z webhooków, wysyłka do Shopify, KSeF, licznik odwiedzin |
| `PUBLIC_ORIGIN` | tekst | kanoniczny adres panelu, np. `https://panel.nowoczesnyhandelpolski.pl`. Webhooki i link do karty w opisie Shopify biorą ten adres |
| `SHOPIFY_STORE_DOMAIN` | tekst | host `nazwa.myshopify.com`. Nie wpisuj domeny sklepu widocznej dla klientów |
| `SHOPIFY_ADMIN_TOKEN` | **Secret** | Admin API access token z custom app |
| `SHOPIFY_WEBHOOK_SECRET` | **Secret** | API secret key tej samej aplikacji. To nie jest access token. Służy do sprawdzenia nagłówka `X-Shopify-Hmac-Sha256` |
| `SHOPIFY_API_VERSION` | tekst, opcjonalnie | domyślnie `2026-10`. Gdy Shopify odpowie, że wersja jest wycofana, wpisz aktualną stabilną (`RRRR-MM`) |
| `KSEF_TOKEN` | **Secret** | token KSeF wygenerowany w danym środowisku |
| `KSEF_NIP` | **Secret** | NIP kontekstu, 10 cyfr, bez kresek |
| `KSEF_ENV` | tekst | `test` (domyślnie), `demo` albo `prod` |
| `KSEF_SELLER_NAME` | tekst | nazwa sprzedawcy na fakturze |
| `KSEF_SELLER_ADDRESS` | tekst | adres, linia 1 |
| `KSEF_SELLER_ADDRESS_L2` | tekst, opcjonalnie | kod pocztowy i miasto |
| `KSEF_SELLER_EMAIL` | tekst, opcjonalnie | e-mail na fakturze |
| `KSEF_VAT_RATE` | tekst | `23` (domyślnie), `8`, `5`, `0` albo `zw` |
| `KSEF_AUTO` | tekst | `1` (domyślnie) wystawia fakturę po opłaceniu zamówienia. `0` zostawia tylko przycisk w panelu |

## Shopify — custom app

1. W adminie sklepu: Settings → Apps → Develop apps → utwórz aplikację (albo użyj istniejącej custom app).
2. Admin API scopes:
   - `read_products`
   - `write_products`
   - `read_orders`
3. Zainstaluj aplikację i skopiuj **Admin API access token** do `SHOPIFY_ADMIN_TOKEN`. Token widać raz.
4. **API secret key** z tej samej aplikacji wklej do `SHOPIFY_WEBHOOK_SECRET`.
5. W Shopify, przy danych klienta (protected customer data), poproś o dostęp do imienia, e-maila i adresu. Bez tego webhook zamówienia przychodzi obcięty i faktura dostaje nabywcę „Nabywca” oraz `BrakID` zamiast NIP.
6. Domena w `SHOPIFY_STORE_DOMAIN` to `twoj-sklep.myshopify.com`.

### Webhooki

Adres (JSON):

```text
https://panel.nowoczesnyhandelpolski.pl/api/shopify/webhook
```

Na podglądzie Pages podmień host. Tematy:

- `products/update`
- `products/delete`
- `orders/create`
- `orders/updated`
- `orders/paid`
- `orders/cancelled`

W Bazie produktów jest przycisk **Zarejestruj webhooki**. Woła Admin API i dopisuje brakujące tematy na ten adres. Można je też dodać ręcznie w custom app. Podpis sprawdzamy HMAC-SHA256 (Base64) na surowym ciele żądania. Zły podpis albo inna domena sklepu dostają 401.

### Co panel wysyła do Shopify

Przycisk **Wyślij do Shopify** (albo status **Opublikowany w Shopify**) tworzy produkt albo go aktualizuje:

- tytuł to pole „Nazwa w Shopify” (`name`), nie nazwa katalogowa ze źródła
- opis: treść karty one-page, a gdy karty nie ma — opis produktu
- cena, SKU, EAN jako barcode
- status: opublikowany → `active`, wstrzymany i wcześniejsze etapy → `draft`, archiwum → `archived`
- zdjęcia tylko przy pierwszym wysłaniu i przy ręcznym „Wyślij” (kolejne zapisy ceny nie dokładają duplikatów zdjęć)

Id, wariant, handle i adres produktu zapisują się na naszym produkcie.

Dopóki produkt nie ma id Shopify, zwykły zapis w panelu **nie zakłada** go w sklepie. Po powiązaniu zmiana statusu, ceny, nazwy, opisu albo karty strony ustawia „do wysłania”. Panel wypycha to po wejściu w Bazę produktów i po zapisie w generatorze.

Zmiana w Shopify wraca webhookiem: cena, nazwa sprzedaży, EAN, SKU, opis produktu i status. Nazwa katalogowa zostaje. Karta one-page nie jest nadpisywana opisem ze Shopify. Echo naszej własnej wysyłki (ta sama treść) nie cofa pól. Usunięcie produktu w Shopify zdejmuje powiązanie i ustawia u nas **Archiwum**.

Nieznany produkt ze Shopify (nigdy u nas nie wysłany) nie jest sam dopisywany do bazy.

### Zamówienia i statystyki

**Pobierz zamówienia** bierze do czterech stron REST (około 400 zamówień z ostatnich 90 dni). Dalsze zmiany przychodzą webhookiem.

W Gotowych stronach i na karcie produktu:

- zamówienia, sztuki i przychód — z opłaconych linii (`paid`, `partially_paid`, `partially_refunded`), po id produktu Shopify, wariancie, SKU albo EAN
- dostawa nie wchodzi do przychodu
- anulowane i nieopłacone nie wchodzą
- zwrot nie odejmuje przychodu (zostaje kwota linii)
- wyświetlenia i sesje — z naszej strony `/p/<slug>`, nie z analityki Shopify

Opublikowana karta woła `POST /p/<slug>/view`. W przeglądarce zostaje losowy identyfikator `nhp-sid`. W bazie jest tylko jego skrót SHA-256, raz na dobę na sesję. Podgląd z generatora tego nie woła.

## Statusy produktu

Oś jest osobno od starego `status` (np. brak ceny):

1. **Pobrany** — import bez strony
2. **W przygotowaniu**
3. **Strona gotowa** — sama się ustawia, gdy powstaje karta (albo już była przy wdrożeniu)
4. **Opublikowany w Shopify** — w sklepie `active`; to jedyny status, który sam tworzy produkt w Shopify
5. **Wstrzymany** — w sklepie `draft`
6. **Archiwum** — w sklepie `archived`

Status zmienia się przy produkcie i hurtowo. Historia jest na karcie produktu (kto: panel, Shopify albo system).

**Pobrane produkty** to pozycje bez karty. **Gotowe strony** to pozycje, które kartę już mają (szkic albo publikacja). Przy każdej widać, czy strona jest, i link, żeby nie zakładać drugiej.

## KSeF

Domyślnie środowisko testowe API 2.0:

```text
https://api-test.ksef.mf.gov.pl/v2
```

`demo` → `https://api-demo.ksef.mf.gov.pl/v2`  
`prod` → `https://api.ksef.mf.gov.pl/v2`

### Token w środowisku testowym

1. Wejdź na środowisko testowe KSeF (portal MF dla integratorów, nie na produkcję).
2. Uwierzytelnij się w kontekście NIP, na którym testujesz. Na teście nie używaj prawdziwych danych klientów.
3. Wygeneruj token KSeF z uprawnieniem do wystawiania faktur (`InvoiceWrite`).
4. Wpisz token do `KSEF_TOKEN`, NIP do `KSEF_NIP`, nazwę i adres sprzedawcy jak wyżej. `KSEF_ENV` zostaw `test`.
5. W panelu: Produkty → Faktury KSeF. Przycisk **Wystaw** albo **Wystaw dla opłaconych**.

Przepływ, który jest w kodzie: `POST /auth/challenge` → szyfrowanie `token|timestampMs` kluczem RSA-OAEP SHA-256 → `POST /auth/ksef-token` → odbiór tokenu dostępu → sesja interaktywna `POST /sessions/online` ze schematem FA (3) `1-0E` → faktura zaszyfrowana AES-256-CBC → odczyt statusu → zamknięcie sesji.

NIP nabywcy bierzemy z atrybutu zamówienia o nazwie zawierającej `nip` / `vat` / `tax` albo z 10 cyfr w nazwie firmy na adresie rozliczeniowym. Zły checksum nie idzie jako NIP, tylko jako `BrakID`. Stawka VAT jest z `KSEF_VAT_RATE` liczona od ceny brutto linii, nie z `tax_lines` Shopify.

Przy `KSEF_AUTO=1` webhook `orders/paid` (i aktualizacja ze statusem `paid`) uruchamia wystawienie w tle. Brak sekretów zapisuje fakturę jako „Czeka na sekrety” razem z XML, jeśli da się go złożyć. XML można pobrać z listy. Numer to `FV/RRRR/0001` w strefie Europe/Warsaw.

### Czego KSeF jeszcze nie robi

- faktury korygujące i zaliczkowe
- pobranie i archiwizacja UPO jako pliku (link UPO, gdy KSeF go odda, jest na rekordzie i wygasa)
- lokalna walidacja XSD — schemat sprawdza KSeF po wysłaniu
- podpis kwalifikowany / pieczęć (jest token KSeF, nie XAdES)
- tryb offline i faktury PEF
- wiele stawek VAT na jednej fakturze
- odjęcie zwrotu Shopify od faktury
- wysyłka na produkcję sama z siebie — `KSEF_ENV` musi być świadomie ustawione na `prod`

Test MF nie izoluje danych między firmami korzystającymi z tego samego NIP. Nie wysyłaj tam prawdziwych faktur.
