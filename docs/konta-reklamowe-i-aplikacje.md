# Konta reklamowe i aplikacje social — Nowoczesny Handel Polski

Wszystko zakładamy **wyłącznie w zasobach NHP** (portfolio Meta `1636166165217015`). Nigdy w Tilo ani Avasatare.
Zakładanie kont i akceptację regulaminów robi właściciel; resztę konfiguracji robi Claude.

## Gotowe adresy (wklejaj tam, gdzie formularz o nie pyta)

| Pole | Wartość |
|---|---|
| Strona firmy | https://www.nowoczesnyhandelpolski.pl/ |
| Polityka prywatności | https://www.nowoczesnyhandelpolski.pl/polityka-prywatnosci.html |
| Regulamin / Terms of Service | https://www.nowoczesnyhandelpolski.pl/regulamin.html |
| Usuwanie danych / Data deletion instructions | https://www.nowoczesnyhandelpolski.pl/usuwanie-danych.html |
| Redirect URI (OAuth, Meta i TikTok) | https://ysijewwzpkpzxhjcshms.supabase.co/functions/v1/social-connect |
| Domena aplikacji | nowoczesnyhandelpolski.pl |
| Ikona aplikacji 1024×1024 | https://www.nowoczesnyhandelpolski.pl/assets/app-icon-1024.png |
| Plik produktów (Merchant Center, katalog Meta i TikTok) | https://panel.nowoczesnyhandelpolski.pl/feed.xml |
| E-mail kontaktowy | kontakt@nowoczesnyhandelpolski.pl |

---

## 1. Aplikacja Meta dla autopilota postów (Facebook + Instagram)

**Najważniejsze:** autopilot publikuje tylko na **własnych** stronach NHP. Dla takich stron wystarczy **Standard Access** —
uprawnienia działają dla osób z rolą w aplikacji (Ty jako administrator). **Weryfikacja aplikacji (App Review) nie jest potrzebna**,
dopóki z aplikacji nie korzystają osoby spoza zespołu. Poniżej są gotowe teksty na wypadek, gdyby Meta jednak o nie poprosiła.

### Kroki (właściciel, ok. 10 min)
1. https://developers.facebook.com/apps → **Utwórz aplikację** → typ **Firma (Business)** → nazwa `NHP Autopilot` → portfolio **Nowoczesny Handel Polski**.
2. **Ustawienia → Podstawowe**: domena `nowoczesnyhandelpolski.pl`, adresy polityki, regulaminu i usuwania danych z tabeli, ikona, kategoria *Business and pages*. Zapisz.
3. **Dodaj produkt → Logowanie do Facebooka dla firm** → *Prawidłowe identyfikatory URI przekierowania OAuth*: Redirect URI z tabeli.
4. **Dodaj produkt → Instagram → API z logowaniem przez Facebooka**.
5. Przełącz aplikację w tryb **Na żywo (Live)**.
6. Skopiuj **App ID** i **App Secret** → Supabase → *Edge Functions → Secrets*: `META_APP_ID`, `META_APP_SECRET`
   (https://supabase.com/dashboard/project/ysijewwzpkpzxhjcshms/functions/secrets).
7. Panel → **Social media → Połącz Facebook + Instagram**.

### Uprawnienia i uzasadnienia (EN — gdyby Meta poprosiła o review)
- **pages_show_list** — *We list the Facebook Pages the business owner manages so they can choose which Page our tool posts to for each of their own online shops.*
- **pages_read_engagement** — *We read engagement on our own Pages' posts (reactions, comments count) to report which product posts perform best in our internal dashboard.*
- **pages_manage_posts** — *Our team schedules and publishes product posts (photo + caption with a link to our own product page) to the business's own Facebook Pages.*
- **pages_manage_metadata** — *Required to keep the connection to our own Pages and receive updates when a scheduled post is published or fails.*
- **instagram_basic** — *We read the profile name and follower count of the Instagram Business account linked to our Page, shown in our dashboard.*
- **instagram_content_publish** — *We publish product photos and Reels with captions to our own Instagram Business account.*
- **instagram_manage_insights** — *We read reach and engagement of our own Instagram posts to choose which products to promote.*
- **business_management** — *Needed to access the Pages and Instagram accounts owned by our business portfolio "Nowoczesny Handel Polski".*

### Nagranie ekranu do review (2–3 min, bez dźwięku wystarczą napisy)
1. Logowanie do panelu https://panel.nowoczesnyhandelpolski.pl → zakładka **Social media**.
2. Klik **Połącz Facebook + Instagram** → okno logowania Meta → wybór strony sklepu → zgoda.
3. Powrót do panelu: konto „Połączone”, liczba obserwujących.
4. Kolejka postów → podgląd posta → **Opublikuj** → ten sam post widoczny na stronie FB i na Instagramie.
5. Odłączenie konta i strona **Usuwanie danych**.

---

## 2. Aplikacja TikTok (Content Posting API)

Bez **audytu** TikTok publikuje tylko **prywatnie** (widoczne dla właściciela). Do postów publicznych audyt jest konieczny.

### Kroki (właściciel)
1. https://developers.tiktok.com → **Manage apps → Connect an app** → nazwa `NHP Autopilot`, kategoria *Business / Marketing*, ikona, opis.
2. URL-e: Terms i Privacy z tabeli. **Redirect URI** z tabeli (Login Kit, platforma Web).
3. Produkty: **Login Kit** + **Content Posting API** (włącz *Direct Post*). Zakresy: `user.info.basic`, `user.info.stats`, `video.upload`, `video.publish`.
4. Jeśli TikTok poprosi o weryfikację domeny (*URL properties*): wybierz **DNS**, wyślij Claude wartość `tiktok-developers-site-verification=…` — doda rekord w Cloudflare.
5. **Client Key** i **Client Secret** → Supabase Secrets: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
6. **Submit for review**, potem po akceptacji: **Content Posting API → Apply for audit**.

### Opis aplikacji do review / audytu (EN)
*NHP Autopilot is an internal tool of Nowoczesny Handel Polski, a Polish online store. Our team uses it to publish short product videos to the store's own TikTok account. A team member logs in with TikTok, the tool shows the account name and follower count, and the team member reviews each video and caption in our dashboard before it is posted. We only post to our own account, do not access other users' data, and store the access token encrypted in an EU database until the account is disconnected. Users can request deletion at https://www.nowoczesnyhandelpolski.pl/usuwanie-danych.html.*

### Nagranie do audytu
Logowanie do panelu → **Połącz TikTok** → zgoda → podgląd filmu z podpisem i ustawieniem prywatności (wybór przez użytkownika) → publikacja → film na profilu TikTok.

---

## 3. Google Ads + Merchant Center

### Kroki (właściciel, ok. 15 min)
1. https://ads.google.com → **Utwórz konto** → *Tryb eksperta* → **Utwórz konto bez kampanii** → kraj Polska, strefa *(GMT+01:00) Warszawa*, waluta **PLN**.
2. https://merchants.google.com → nowe konto: nazwa firmy `Nowoczesny Handel Polski`, strona `https://www.nowoczesnyhandelpolski.pl`, kraj Polska.
3. W Merchant Center **potwierdź i zgłoś prawa do witryny** metodą **rekord DNS** (TXT) — wyślij Claude wartość `google-site-verification=…`; Claude doda ją w Cloudflare.
4. **Produkty → Źródła danych → Dodaj → Pobieraj plik z adresu URL**: `https://panel.nowoczesnyhandelpolski.pl/feed.xml`, codziennie, kraj Polska, język polski.
5. **Dostawa i zwroty**: dostawa 0 zł (lub cena z karty), czas 1–2 dni + 1–2 dni doręczenia; zwroty 14 dni, adres jak w regulaminie.
6. **Połącz Merchant Center z Google Ads** (Ustawienia → Połączone konta).
7. W Google Ads: **Cele → Konwersje → Nowa → Witryna** → nazwa *Zakup*, kategoria *Zakup*, wartość z transakcji → wybierz **instalację ręczną** → wyślij Claude **ID konwersji (AW-…)** i **etykietę**. Claude wepnie tag na karty (po zgodzie na cookies, tak jak Pixel Meta).

---

## 4. TikTok for Business (reklamy + katalog)

1. https://business.tiktok.com → **Business Center** `Nowoczesny Handel Polski` (strefa Warszawa).
2. W Business Center → **Konta reklamowe → Utwórz** → `NHP reklamy TikTok`, waluta **PLN**, strefa Warszawa.
3. **Assets → Events → Web Events → Set up web events** → *Manually install pixel code* → nazwa `NHP TikTok Pixel` → wyślij Claude **ID Pixela**.
4. **Assets → Catalogs → Create** → *E-commerce* → źródło **Data feed** z adresu `https://panel.nowoczesnyhandelpolski.pl/feed.xml`, codziennie.
5. Karta płatnicza — dopiero po założeniu konta bankowego.

## Co Claude robi po otrzymaniu identyfikatorów
- Weryfikacja domen (Meta — zrobione; TikTok, Google — rekordy TXT w Cloudflare).
- Tagi konwersji Google i TikTok na kartach, tylko po zgodzie na cookies.
- Podłączenie katalogów do pliku produktów i sprawdzenie, że produkty przeszły walidację.
