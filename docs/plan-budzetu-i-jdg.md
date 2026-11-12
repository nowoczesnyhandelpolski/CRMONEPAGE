# Plan budżetu reklam i przejścia na JDG — Nowoczesny Handel Polski

Stan na 12 listopada 2026. Kwoty ZUS i limitów z portali branżowych (źródła na dole) — przed decyzją sprawdź na biznes.gov.pl albo z księgową.

## 1. Działalność nierejestrowana vs JDG

| | Nierejestrowana (teraz) | JDG z „ulgą na start” |
|---|---|---|
| Limit przychodu | **10 813,50 zł na kwartał** (225% płacy minimalnej 4806 zł) — liczy się cała cena sprzedaży, nie zysk | brak |
| ZUS miesięcznie | 0 zł | **432,54 zł** (tylko zdrowotna) przez 6 miesięcy, potem preferencyjny **888,72 zł** przez 24 miesiące, potem pełny ok. 1 927 zł + zdrowotna |
| NIP / hurtownie B2B | brak NIP — większość hurtowni nie założy konta | NIP — konto w hurtowni, ceny hurtowe |
| Google Ads / Meta | na osobę prywatną | na firmę, możliwa weryfikacja firmy w Meta |
| VAT | zwolnienie | zwolnienie podmiotowe do 240 000 zł przychodu rocznie |
| Po przekroczeniu limitu | działalność staje się firmą od dnia przekroczenia, **7 dni na wpis do CEIDG** | — |

**Kiedy przejść na JDG:** w dniu, w którym zakładasz konto w hurtowni dropshipping (zwykle wymaga NIP) albo gdy sprzedaż w kwartale zbliża się do ok. 8 000 zł. Przy koszyku 120 zł limit kwartału to ok. 90 zamówień.

**Jak (ok. 30 min, online, za darmo):** biznes.gov.pl → *Załóż firmę* (CEIDG-1). PKD: **47.91.Z** (sprzedaż przez internet). Forma opodatkowania: przy marży ok. 30–40% zwykle **ryczałt 3% (handel)** albo **skala** — wybierz z księgową. Zaznacz **ulgę na start**. Po wpisie: konto firmowe w banku (to samo co do Stripe), zmiana danych w Panel → Ustawienia → Dane sprzedawcy (NIP), KSeF.

## 2. Budżet reklam — pierwszy miesiąc testów

Założenia: koszyk 100–150 zł, marża brutto na produkcie min. 40% (towar z hurtowni), prowizja Stripe ok. 1,5% + 1 zł.

| Etap | Ile | Budżet | Reguła |
|---|---|---|---|
| Test produktu | 10 produktów | 150 zł na produkt, 5–7 dni (20–30 zł/dzień) | **Wyłącz**, gdy wydasz 1,5× maksymalny koszt pozyskania zamówienia (CPA) bez sprzedaży |
| Zwycięzcy | 1–3 produkty | +20% budżetu co 3 dni | **Skaluj**, gdy przez 3 dni ROAS > próg opłacalności (zakładka Kampanie liczy go sama) |
| Rezerwa | — | 300 zł | na powtórki testów i retargeting osób, które dodały do koszyka |
| **Razem miesiąc 1** | | **ok. 1 800–2 000 zł** | |

**Maksymalny CPA na produkt** = cena − koszt towaru − wysyłka − prowizja − zysk minimalny. Przykład: cena 129 zł, towar 45 zł, wysyłka 12 zł, prowizja 3 zł, zysk min. 15 zł → **CPA max 54 zł**, więc test wyłączasz po ok. 80 zł wydatku bez sprzedaży.

**Kanały na start:** Meta (Facebook + Instagram, Pixel już podpięty) — 70% budżetu; Google Zakupy / Performance Max z pliku `/feed.xml` — 30%. TikTok dopiero po pierwszych zwycięzcach (potrzebne krótkie wideo).

**Co musi być gotowe przed pierwszą złotówką na reklamy:** konto bankowe + Stripe live, produkty z hurtowni z marżą ≥ 40%, opublikowane karty, Pixel (gotowy), karta płatnicza na koncie reklamowym.

## 3. Jakie produkty testować na sezon (do sprawdzenia w hurtowni)

Kryteria (każdy produkt musi spełnić wszystkie):
1. **Cena sprzedaży 79–149 zł** — wystarczy na reklamę i zysk; tańsze produkty nie pokryją kosztu pozyskania klienta.
2. **Koszt w hurtowni ≤ 55% ceny** (marża brutto ≥ 45%).
3. **Nie do kupienia taniej na Allegro** w tej samej postaci — najlepiej zestawy (np. 3 w 1) albo produkt z personalizacją.
4. **Lekki, nietłukący się, mieści się w paczkomacie A/B** — tanie wysyłki i mało reklamacji.
5. **Efekt „wow” na wideo w 3 sekundy** (światło, ruch, przemiana) — dobre pod Reels, TikTok i Shorts.

Kategorie do przeglądu w hurtowni (popularne w sezonie wg list sklepów: choinki, lampki, bombki, girlandy, aniołki, skrzaty, gwiazdy, świece, dzwonki, wieńce, szopki, kule śnieżne z pozytywką):
- **Zestawy prezentowe** gotowe do wręczenia (np. kalendarz adwentowy z drobiazgami, zestaw świec zapachowych w pudełku).
- **Dekoracje świetlne LED** na baterie / USB (girlandy, lampiony, gwiazdy okienne, projektory płatków śniegu).
- **Kule śnieżne / pozytywki / szopki LED** — dobrze wyglądają na wideo.
- **Skrzaty i figurki** w zestawach 2–3 szt. (nie pojedynczo — taniej na Allegro).
- **Personalizowane bombki / zawieszki** z imieniem — trudne do porównania cenowo.

Po założeniu konta w hurtowni Claude: pobierze cennik (XML), policzy dla każdego produktu cenę, CPA max i porówna z Allegro, a 5–10 najlepszych wrzuci do generatora stron.

## Źródła
- Limit działalności nierejestrowanej 2026: money.pl, poradnikprzedsiebiorcy.pl, pit.pl
- Składki ZUS 2026: money.pl, fakturowo.pl, firmove.pl, ifirma.pl
- Popularne kategorie ozdób: empik.com (Przygotuj dom na Święta, Ozdoby świąteczne)
