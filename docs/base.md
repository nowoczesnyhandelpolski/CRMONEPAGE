# Import z Base (BaseLinker) → Shopify

Zakładka **Produkty → Import z Base** w panelu:

1. wybierasz katalog Base albo hurtownię podpiętą w Base (magazyn zewnętrzny, np. Ikonka czy VidaXL),
2. **Pokaż produkty**: lista przychodzi prosto z Base (nazwa, SKU, EAN, cena, stan) i pokazuje, co już jest w bazie albo w Shopify,
3. zaznaczasz produkty,
4. **Zapisz w bazie**: pełne dane (opis, zdjęcia, parametry, warianty, producent, kategoria) trafiają do Bazy produktów,
5. **Wyślij do Shopify**: zapis w bazie i od razu `productSet` w Shopify. Do wyboru szkic (niewidoczny) albo aktywny.

Token Base zostaje na serwerze (Cloudflare Pages Function `/api/base/*`). Przeglądarka go nie widzi.

## Co musisz zrobić sam

### 1. Token API Base

1. Zaloguj się w Base (panel.baselinker.com).
2. **Moje konto → API**.
3. **Wygeneruj nowy token**. Nazwij go np. „Centrala NHP”. Token daje dostęp do całego konta, więc nie wysyłaj go nikomu i nie wklejaj w czat ani do gita.

### 2. Sekret w Cloudflare

Cloudflare → **Workers & Pages** → projekt panelu (`centrala-crm`) → **Settings → Variables and Secrets → Add**:

| Nazwa | Typ | Wartość |
| --- | --- | --- |
| `BASE_API_TOKEN` | **Secret** | token z Base |

Potem **Deployments → Retry deployment** (sekret działa od następnego wdrożenia).

### 3. Shopify (jeśli jeszcze nie jest podłączony)

Sekrety `SHOPIFY_STORE_DOMAIN` i `SHOPIFY_ADMIN_TOKEN` są opisane w [shopify-ksef.md](shopify-ksef.md). Żeby szedł też **stan magazynowy**, aplikacja Shopify potrzebuje dodatkowo zakresów `read_locations` i `write_inventory`. Po dodaniu zakresów trzeba ją zainstalować ponownie, a nowy token Admin API wkleić w `SHOPIFY_ADMIN_TOKEN`. Bez tych zakresów produkt i tak trafi do sklepu, tylko bez stanu, a panel pokaże ostrzeżenie.

Opcjonalnie `SHOPIFY_LOCATION_ID` (liczba z adresu Ustawienia → Lokalizacje w Shopify) wskazuje magazyn. Bez niego panel bierze główną lokalizację sklepu.

### 4. Baza danych

Migracje `supabase/migrations/20261112120000_base_import.sql` i `20261113090000_base_autosync.sql` (te same bloki są na końcu `supabase.sql`). Dopisują kolumny, tabelę stanu synchronizacji, funkcje i cron. Niczego nie kasują.

## Co się zapisuje

| Base | Centrala (`public.products`) | Shopify |
| --- | --- | --- |
| id katalogu / hurtowni | `base_inventory_id` | — |
| id produktu | `base_product_id` | — |
| katalog / hurtownia | `source` = `base` / `base_hurtownia`, `catalog_id` (katalog „Base · …”) | — |
| nazwa (`text_fields.name`) | `name` | tytuł (o ile nie ustawisz nazwy katalogowej) |
| opis HTML | `description` (tekst), `raw.base.description_html` | opis HTML (oczyszczony ze skryptów) |
| SKU, EAN | `sku`, `ean` | SKU, kod kreskowy |
| cena z domyślnej grupy cenowej (brutto) | `price` | cena |
| stan (domyślny magazyn katalogu albo suma) | `stock` | stan w lokalizacji |
| zdjęcia | `images` | media |
| parametry (`features`) | `params` | — |
| producent, kategoria | `producer`, `category` | dostawca, typ produktu |
| warianty | `variants` | warianty (opcja „Wariant”), id w `shopify_variant_map` |

Ponowny import tego samego produktu **aktualizuje** wiersz (klucz: `source` + `base_inventory_id` + `base_product_id`), więc kopie nie powstają. Nie rusza statusu lejka, nazwy katalogowej, karty strony ani id Shopify. Produkt, który jest już w Shopify, po imporcie sam wyśle zmiany (kolejka `shopify_sync_queue`).

Kolejne **Wyślij do Shopify** aktualizuje ten sam produkt w sklepie (`shopify_product_id`).

## Automatyczna synchronizacja cen i stanów

Na ekranie **Import z Base** jest karta **Automatyczna synchronizacja cen i stanów**:

- **Włączona / wyłączona** i **co ile godzin** (1, 2, 4, 6, 12 albo 24 h, domyślnie 4 h),
- **Synchronizuj teraz**: przebieg od razu, z postępem,
- czas ostatniej synchronizacji, liczba sprawdzonych i zmienionych produktów, lista błędów (np. „Produktu 2687 nie ma w Base — stan ustawiony na 0”).

Synchronizacja obejmuje tylko produkty, które mają ID z Base **i** ID z Shopify. Pobiera z Base cenę (domyślna grupa cenowa), stan i warianty. Gdy coś się zmieniło, aktualizuje produkt w bazie, a kolejka `shopify_sync_queue` wysyła go do Shopify.

### Gdy w hurtowni zabraknie towaru

Wybraliśmy wariant bezpieczniejszy: **stan 0 i do tego wersja robocza**.

- W Shopify stan wariantu idzie na **0**, ze śledzeniem stanu i zakazem sprzedaży na minusie (`inventoryPolicy: DENY`).
- Produkt, który był aktywny („Opublikowany w Shopify”), przechodzi na **„Wstrzymany”**, a w Shopify na **szkic** (`DRAFT`). Znika ze sklepu, więc nie da się go kupić nawet wtedy, gdy ktoś w Shopify włączy „sprzedawaj bez stanu” albo aplikacja nie ma zakresu `write_inventory`.
- Produkt dostaje znacznik `base_auto_paused`. Gdy towar wróci do hurtowni, następna synchronizacja **sama** przywraca go do sprzedaży. Produktu wstrzymanego ręcznie nie rusza.
- Produkt, który zniknął z Base, traktujemy jak brak towaru (stan 0) i pokazujemy go na liście błędów.

Sam stan 0 zostawia stronę produktu z napisem „Wyprzedane”, ale zależy od ustawień stanu w Shopify. Szkic działa zawsze, dlatego robimy oba.

### Jak to jest uruchamiane

- **Supabase pg_cron** (`nhp-base-sync`, co minutę) woła `POST https://panel.nowoczesnyhandelpolski.pl/api/base/sync` z nagłówkiem `x-nhp-cron`, ale tylko wtedy, gdy przebieg trwa, przyszła pora następnego albo w kolejce Shopify czekają produkty z Base. Inaczej nic nie wysyła.
- Token crona powstaje sam w **Supabase Vault** (`nhp_base_sync_token`). Panel sprawdza go w bazie, więc nikt go nie wpisuje ani nie kopiuje.
- Jeden krok sprawdza do 50 produktów: jedno `getInventoryProductsData` (albo `getExternalStorageProductsData`) na katalog z wieloma ID naraz, plus `getInventories`. To 2–3 zapytania do Base na minutę, daleko od limitu 100. Do Shopify idzie do 5 produktów na krok, resztę wysyłają kolejne kroki.
- Stan przebiegu jest w tabeli `base_sync_state` (jeden wiersz). Blokada `lock_until` pilnuje, żeby cron i przycisk nie liczyły tego samego naraz.
- Adres panelu dla crona jest w `base_sync_state.endpoint`. Zmień go tylko, jeśli panel będzie pod innym adresem.

## Limity

- Base: 100 zapytań na minutę na token. Podgląd to 1–2 zapytania na stronę listy (1000 produktów), zapis 3–5 zapytań na paczkę do 100 produktów.
- „Wyślij do Shopify” najpierw zapisuje produkty w bazie (paczki po 100, kilka zapytań do Base), a potem wysyła je z bazy po 4 na zapytanie (limit podzapytań Cloudflare), już bez pytania Base. Panel sam dzieli większe zaznaczenie i pokazuje postęp.
- Gdy przy statusie „Aktywny” Shopify odrzuci produkt, status w Centrali wraca do poprzedniego.
- Produkt bez ceny nie pójdzie do Shopify (w bazie dostaje znacznik „Brak ceny”).

## Endpointy (dla porządku)

Wszystkie wymagają zalogowanego zespołu (`Authorization: Bearer <sesja Supabase>`).

| Metoda | Ścieżka | Co robi | Metody Base |
| --- | --- | --- | --- |
| POST | `/api/base/sync` | jeden krok synchronizacji; `{now: true}` zaczyna przebieg od razu. Cron: nagłówek `x-nhp-cron` zamiast logowania | `getInventories`, `getInventoryProductsData` / `getExternalStorageProductsData` + Shopify `productSet` |
| GET | `/api/base/sync-status` | stan synchronizacji dla panelu | — |
| GET | `/api/base/status` | czy są sekrety Base i Shopify | — |
| GET | `/api/base/sources` | katalogi i hurtownie | `getInventories`, `getExternalStoragesList` |
| POST | `/api/base/list` | `{kind, id, page, q}` → lista | `getInventoryProductsList` / `getExternalStorageProductsList` |
| POST | `/api/base/import` | `{kind, id, ids[≤100]}` → zapis w bazie | `getInventoryProductsData` (+ kategorie, producenci) / `getExternalStorageProductsData` |
| POST | `/api/base/push` | `{product_ids[≤4], status: szkic\|aktywny}` → Shopify (produkty już zapisane przez `/import`) | — (tylko Shopify `productSet`) |

`kind` to `inventory` (katalog Base) albo `storage` (magazyn zewnętrzny, `id` w formacie `shop_123` / `warehouse_123`).
