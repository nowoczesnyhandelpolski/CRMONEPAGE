# Plan budżetu reklam i formalności spółki — Nowoczesny Handel Polski sp. z o.o.

Stan na 12 listopada 2026. NHP to **zarejestrowana spółka z o.o.**, na razie zwolniona z VAT, czeka na NIP. Kwoty z portali branżowych (źródła na dole) — przed decyzją potwierdź z księgową.

## 1. Spółka: co obowiązuje i co trzeba pilnować

| Temat | Co to znaczy dla NHP |
|---|---|
| **Zwolnienie z VAT (art. 113)** | Limit 2026: **240 000 zł netto rocznie**, ale w roku rozpoczęcia **proporcjonalnie do dni działalności**: 240 000 × dni do 31.12 / 365. Przykład — start sprzedaży 15.11.2026: 47 dni → **ok. 30 900 zł** w tym roku. Po przekroczeniu VAT od nadwyżki; powrót do zwolnienia najwcześniej od 1.01 kolejnego roku. |
| **Plan „VAT od nowego roku”** | Rozsądny: rejestracja VAT-R przed pierwszą sprzedażą w 2027 r. albo w dniu przekroczenia limitu. Wtedy ceny brutto zostają, a marża spada o VAT (23% w cenie) — **już teraz licz ceny tak, jakby VAT był**, żeby w styczniu nie przepisywać wszystkiego. |
| **Dane na stronach (art. 206 KSH)** | Firma, siedziba i adres, **sąd rejestrowy, numer KRS, NIP, kapitał zakładowy** — muszą być na kartach i na www. Panel → Ustawienia → Dane sprzedawcy (pola KRS, sąd, kapitał, REGON są już dodane; NIP wpisz po nadaniu). |
| **Faktury / KSeF** | Podatnik zwolniony wystawia fakturę na żądanie nabywcy. Do 31.12.2026 można fakturować poza KSeF przy sumie do 10 000 zł brutto miesięcznie. Panel ma moduł KSeF — podłączymy go po NIP. |
| **Kasa fiskalna** | Sprzedaż internetowa opłacona w całości przez bank / operatora płatności (Stripe) zwykle jest zwolniona z kasy, jeśli z ewidencji wynika, czego dotyczy wpłata — **potwierdź z księgową** przed pierwszą sprzedażą. |
| **Podatek dochodowy** | CIT 9% (mały podatnik) albo estoński CIT — wybór z księgową. |
| **Konta** | Po NIP: konto firmowe spółki → Stripe live (dane spółki), profil płatności Google Ads na spółkę, weryfikacja firmy w Meta (KRS/NIP), konto w hurtowni (NIP). |

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
- Zwolnienie z VAT 2026 (240 000 zł, proporcja w roku rozpoczęcia, KSeF do końca 2026): ifirma.pl, poradnikprzedsiebiorcy.pl, fakturowo.pl, akademialtca.pl
- Popularne kategorie ozdób: empik.com (Przygotuj dom na Święta, Ozdoby świąteczne)
