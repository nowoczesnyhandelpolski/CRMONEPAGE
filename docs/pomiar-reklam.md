# Pomiar reklam (Zeggo) — Meta Ads, Google Ads, Shopify

Zakładka **Pomiar reklam** w panelu (`reklamy.js`) pokazuje wyniki kampanii K1–K4 z „Planu kampanii Zeggo”:
wydatki, sprzedaż ze sklepu (UTM), ROAS i próg opłacalności, zysk po reklamie, lejek, wykres dzienny,
porównanie kampanii i listę „Co teraz zrobić”. Każda liczba ma objaśnienie prostym językiem.

## Jak to działa

1. `POST /api/ads/sync` (`functions/api/ads/[[path]].js`, logika w `lib/ads-sync.mjs`) pobiera:
   - **Meta Marketing API** — insights na poziomie kampanii, dzień po dniu (wydatki, wyświetlenia, zasięg,
     kliknięcia w link, wyświetlenia strony, koszyk, kasa, zakupy i ich wartość, 3-s obejrzenia),
     okno atrybucji 7 dni po kliknięciu / 1 dzień po obejrzeniu;
   - **Google Ads API** — koszt, wyświetlenia, kliknięcia, konwersje i ich wartość (gdy są klucze);
   - **Shopify Admin GraphQL** — zamówienia z `customerJourneySummary` (UTM pierwszej/ostatniej wizyty)
     i kosztem produktów (`inventoryItem.unitCost`).
2. Zrzut trafia do `public.records` jako `col = 'adlive', id = 'main'` (realtime odświeża panel).
3. Panel liczy wskaźniki i oceny w przeglądarce. Ustawienia (marża, prowizja, daty) w `adcfg/main`.
4. Kampanie są przypisywane do K1–K4 po „K1”…„K4” w nazwie albo po `utm_campaign`
   (`k1_prezent500`, `k2_nadgarstek`, `k3_automaty`, `k4_remarketing`).

Dostęp: zalogowany członek zespołu (sesja Supabase) albo nagłówek `X-NHP-Sync = NHP_SYNC_SECRET` (cron).

## Sekrety Cloudflare Pages (projekt `centrala-crm`, Production)

| Nazwa | Co to |
|---|---|
| `META_ACCESS_TOKEN` | Token użytkownika systemowego z portfolio NHP, uprawnienia `ads_read`, `read_insights` |
| `META_AD_ACCOUNT_ID` | opcjonalnie; domyślnie `972181888863838` (NHP reklamy) |
| `ADS_SHOPIFY_STORE_DOMAIN` / `ADS_SHOPIFY_ADMIN_TOKEN` | opcjonalnie, gdy Zeggo to inny sklep niż `SHOPIFY_STORE_DOMAIN`; zakresy `read_orders`, `read_products`, `read_inventory` |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | po założeniu konta Google Ads |
| `NHP_SYNC_SECRET` | już używany przez Shopify; potrzebny dla crona |

Krok po kroku (Meta, Shopify, Google) jest też w samej zakładce, sekcja „Podłączenie źródeł danych”.

## Cron co godzinę (Supabase → SQL Editor)

Panel odświeża dane co 15 minut, gdy widok jest otwarty. Żeby dane były świeże zawsze:

```sql
-- jednorazowo: ten sam sekret co NHP_SYNC_SECRET w Cloudflare
select vault.create_secret('<NHP_SYNC_SECRET>', 'nhp_sync_secret');

select cron.schedule('nhp-ads-sync', '7 * * * *', $$
  select net.http_post(
    url := 'https://panel.nowoczesnyhandelpolski.pl/api/ads/sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-nhp-sync', (select decrypted_secret from vault.decrypted_secrets where name = 'nhp_sync_secret')
    ),
    body := '{"days":60}'::jsonb
  );
$$);
```

## Progi ocen (sklep z zegarkami, PL)

| Wskaźnik | Dobrze | Średnio | Źle |
|---|---|---|---|
| CTR (link) | ≥ 1,5% | 0,9–1,5% | < 0,9% |
| CPM | ≤ 18 zł | ≤ 35 zł | > 35 zł |
| CPC (link) | ≤ 1,20 zł | ≤ 2,50 zł | > 2,50 zł |
| Częstotliwość | ≤ 2,2 (remarketing ≤ 4) | ≤ 3,5 (≤ 6) | wyżej |
| Ładowanie strony (LPV/klik) | ≥ 75% | ≥ 60% | < 60% |
| Dodanie do koszyka | ≥ 6% | ≥ 3% | < 3% |
| Kasa → zakup | ≥ 45% | ≥ 30% | < 30% |
| Konwersja (zakup/klik) | ≥ 1,5% | ≥ 0,7% | < 0,7% |
| ROAS | ≥ 1,4 × próg | ≥ próg (1 ÷ marża) | < próg |
| CPA | ≤ 60% maks. | ≤ AOV × marża | wyżej |

Do 1500 wyświetleń / 60 zł wydatków kampania jest w „fazie nauki” — panel nie wydaje wtedy ocen ROAS/CPA.
