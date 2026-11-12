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

Migracja `supabase/migrations/20261112120000_base_import.sql` (ten sam blok jest na końcu `supabase.sql`). Dopisuje kolumny, niczego nie kasuje.

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

## Limity

- Base: 100 zapytań na minutę na token. Podgląd to 1–2 zapytania na stronę listy (1000 produktów), zapis 3–5 zapytań na paczkę do 100 produktów.
- Wysyłka do Shopify idzie po 4 produkty na zapytanie (limit podzapytań Cloudflare). Panel sam dzieli większe zaznaczenie i pokazuje postęp.
- Produkt bez ceny nie pójdzie do Shopify (w bazie dostaje znacznik „Brak ceny”).

## Endpointy (dla porządku)

Wszystkie wymagają zalogowanego zespołu (`Authorization: Bearer <sesja Supabase>`).

| Metoda | Ścieżka | Co robi | Metody Base |
| --- | --- | --- | --- |
| GET | `/api/base/status` | czy są sekrety Base i Shopify | — |
| GET | `/api/base/sources` | katalogi i hurtownie | `getInventories`, `getExternalStoragesList` |
| POST | `/api/base/list` | `{kind, id, page, q}` → lista | `getInventoryProductsList` / `getExternalStorageProductsList` |
| POST | `/api/base/import` | `{kind, id, ids[≤100]}` → zapis w bazie | `getInventoryProductsData` (+ kategorie, producenci) / `getExternalStorageProductsData` |
| POST | `/api/base/push` | `{kind, id, ids[≤4], status: szkic\|aktywny}` → zapis + Shopify | jak wyżej + Shopify `productSet` |

`kind` to `inventory` (katalog Base) albo `storage` (magazyn zewnętrzny, `id` w formacie `shop_123` / `warehouse_123`).
