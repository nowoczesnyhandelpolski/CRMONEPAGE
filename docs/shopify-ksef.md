# Shopify i KSeF

Panel sprzedaje przez Shopify i wystawia e-faktury FA(3) do Krajowego Systemu e-Faktur. Wszystkie sekrety są w Cloudflare Pages (Settings → Environment variables). W repozytorium są tylko **nazwy**.

Po zmianach w bazie wklej cały `supabase.sql` w Supabase → SQL Editor i uruchom go ponownie. Skrypt można powtarzać: dopisuje kolumny i tabele, nie kasuje produktów.

## Sekrety i zmienne

| Nazwa | Typ | Po co |
| --- | --- | --- |
| `SHOPIFY_STORE_DOMAIN` | tekst | Domena sklepu, np. `twoj-sklep.myshopify.com` (bez `https://`) |
| `SHOPIFY_ADMIN_TOKEN` | **Secret** | Token Admin API aplikacji niestandardowej |
| `SHOPIFY_WEBHOOK_SECRET` | **Secret** | Klucz API (client secret) tej samej aplikacji. Służy do podpisu `X-Shopify-Hmac-Sha256` |
| `NHP_SYNC_SECRET` | **Secret**, opcjonalnie | Nagłówek `X-NHP-Sync` dla webhooka bazy, który opróżnia kolejkę synchronizacji |
| `KSEF_TOKEN` | **Secret** | Token KSeF z uprawnieniem do wystawiania faktur |
| `KSEF_NIP` | tekst | NIP sprzedawcy, 10 cyfr |
| `KSEF_ENV` | tekst | `test` (domyślnie), `demo` albo `prod` |
| `KSEF_SELLER_NAME` | tekst | Nazwa na fakturze |
| `KSEF_SELLER_ADDRESS1` | tekst | Ulica i numer |
| `KSEF_SELLER_ADDRESS2` | tekst, opcjonalnie | Kod pocztowy i miejscowość |
| `KSEF_VAT_RATE` | tekst, opcjonalnie | `23` (domyślnie), `8`, `5` albo `zw` |

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` są potrzebne tak jak dotychczas: webhook Shopify i KSeF zapisują dane kluczem service role.

## Shopify — aplikacja

1. W adminie sklepu: Ustawienia → Aplikacje i kanały sprzedaży → Twórz aplikacje.
2. Utwórz aplikację, np. „Centrala NHP”.
3. Konfiguracja Admin API. Zakresy:
   - `read_products`
   - `write_products`
   - `read_orders`
4. Zainstaluj aplikację w sklepie. Token Admin API widać raz — wklej go jako `SHOPIFY_ADMIN_TOKEN`.
5. Klucz API (API secret key / client secret) tej aplikacji wklej jako `SHOPIFY_WEBHOOK_SECRET`. To nie jest token Admin API.
6. Domena `*.myshopify.com` to `SHOPIFY_STORE_DOMAIN`.
7. Wdróż panel. W Bazie produktów naciśnij **Zarejestruj webhooki**.

Adres webhooka (produkcja):

```text
https://panel.nowoczesnyhandelpolski.pl/api/shopify/webhook
```

Na podglądzie Pages podmień host. Przycisk w panelu bierze `PUBLIC_ORIGIN`, a gdy go nie ma — adres żądania.

Rejestrowane tematy:

- `PRODUCTS_UPDATE`
- `PRODUCTS_DELETE`
- `ORDERS_CREATE`
- `ORDERS_UPDATED`
- `ORDERS_CANCELLED`

Podpis jest sprawdzany przed jakimkolwiek zapisem. Zły HMAC dostaje HTTP 401. Powtórzony nagłówek `X-Shopify-Webhook-Id` jest ignorowany.

### Co synchronizujemy

Do Shopify idzie: nazwa, opis (z opublikowanej karty, a gdy jej nie ma — z opisu produktu), cena (pierwszy zestaw na stronie albo cena z bazy), SKU, EAN jako kod kreskowy, zdjęcia `https://`, status.

Status lejka → status Shopify:

| W Centrali | W Shopify |
| --- | --- |
| pobrany, w przygotowaniu, strona gotowa, wstrzymany | szkic (`DRAFT`) |
| opublikowany w Shopify | aktywny (`ACTIVE`) |
| archiwum | zarchiwizowany (`ARCHIVED`) |

Ze Shopify wraca: zmiana produktu (nazwa, opis, cena wariantu, SKU, kod, status), usunięcie (u nas archiwum, id zostaje) oraz zamówienia.

Kolejka `shopify_sync_queue` powstaje w bazie przy zmianie produktu albo strony. Panel opróżnia ją po zapisie statusu, ceny, strony i przy każdym odświeżeniu Bazy produktów. Żeby szło też przy zamkniętym panelu, dodaj w Supabase Database Webhook:

- tabela `shopify_sync_queue`, zdarzenie `INSERT`
- adres `https://panel.nowoczesnyhandelpolski.pl/api/shopify/flush`
- nagłówek `X-NHP-Sync` równy wartości `NHP_SYNC_SECRET`

Produkt w statusie „pobrany” albo „w przygotowaniu” **nie** zakłada sam karty w Shopify. Od „strona gotowa” w górę, albo gdy sklep już ma nasze id, zmiana idzie sama. Przycisk **Wyślij do Shopify** wymusza wysyłkę od razu.

Zamówienia Shopify są w tabeli `shopify_orders`. Nie dublujemy ich w widoku logistycznym „Zamówienia”.

## Statystyki

W zakładce **Gotowe strony** i na karcie produktu:

- zamówienia, sztuki i przychód z opłaconych zamówień Shopify (`paid`, `partially_paid`, `partially_refunded`),
- wyświetlenia naszych stron `/p/<slug>`.

Admin API nie oddaje sesji sklepu (to ShopifyQL / analityka, poza tym tokenem). Licznik jest nasz: opublikowana strona woła `POST /p/<slug>/view` raz na sesję przeglądarki. Podgląd z panelu się nie liczy.

## KSeF

Środowiska API 2.0:

| `KSEF_ENV` | Adres |
| --- | --- |
| `test` (domyślnie) | `https://api-test.ksef.mf.gov.pl/v2` |
| `demo` | `https://api-demo.ksef.mf.gov.pl/v2` |
| `prod` | `https://api.ksef.mf.gov.pl/v2` |

Token generuje się w portalu KSeF danego środowiska, w kontekście NIP, z uprawnieniem do wystawiania faktur (`InvoiceWrite`). Na środowisku testowym nie wysyłaj prawdziwych faktur ani prawdziwych danych klientów. Test nie izoluje firm — używaj go do sprawdzenia integracji.

Przepływ, który woła panel:

1. `POST /auth/challenge`
2. token KSeF zaszyfrowany RSA-OAEP (SHA-256) jako `token|timestamp`
3. `POST /auth/ksef-token`, odpytanie statusu, `POST /auth/token/redeem`
4. sesja online FA(3) (`systemCode` `FA (3)`, schemat `1-0E`)
5. faktura zaszyfrowana AES-256-CBC, klucz RSA-OAEP
6. odczyt numeru KSeF i zamknięcie sesji

Opłacone zamówienie (`paid`, `partially_paid`) dostaje fakturę samo. W **Faktury KSeF** jest też przycisk ręczny i „Sprawdź numer”, gdy KSeF jeszcze nie nadał numeru.

NIP nabywcy bierzemy z firmy, notatki albo atrybutu `nip` / `vat`, po sumie kontrolnej. Bez poprawnego NIP-u faktura jest na osobę (`BrakID`). Ceny Shopify traktujemy jako brutto. Dostawa jest osobną pozycją. Numer własny ma postać `FV/RRRR/MM/0001`.

## Czego ta wersja nie robi

- logowanie certyfikatem (XAdES) — tylko token KSeF,
- korekty, zaliczki, faktury wielowalutowe (tylko PLN),
- kilka stawek VAT na jednej fakturze,
- trwałego archiwum UPO (zostaje numer KSeF, numer referencyjny i XML),
- wysyłki faktury mailem do klienta,
- sesji i widoków z analityki Shopify,
- przenoszenia zamówień Shopify do widoku paczek w Centrali,
- osobnego statusu „wstrzymany” w Shopify — to szkic, archiwum to `archived`.

Zdjęcia przy każdej wysyłce są ustawiane przez `productSet`. Shopify może dociągnąć plik ponownie, jeśli nie mamy id istniejącego media.
