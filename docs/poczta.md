# Skrzynka i tablica zespołu

Wiadomości w panelu mają cztery widoki: czat zespołu, tablica, skrzynka e-mail sklepu i formularze ze stron `/p`. Hasła poczty są tylko w sekretach Cloudflare. W repozytorium są nazwy.

Po wdrożeniu uruchom ponownie cały `supabase.sql` w Supabase → SQL Editor. Skrypt dopisuje tabele i nic nie kasuje.

## Sekrety

| Nazwa | Typ | Po co |
| --- | --- | --- |
| `MAIL_IMAP_HOST` | tekst | Host IMAP, np. `imap.twojadomena.pl` |
| `MAIL_IMAP_PORT` | tekst | Domyślnie `993` (TLS). `143` włącza STARTTLS |
| `MAIL_IMAP_SECURE` | tekst, opcjonalnie | `on`, `starttls` albo `off`. Bez tego: 993 = `on`, inny port = `starttls` |
| `MAIL_IMAP_USER` | tekst | Login skrzynki, zwykle pełny adres |
| `MAIL_IMAP_PASS` | **Secret** | Hasło albo hasło aplikacji |
| `MAIL_SMTP_HOST` | tekst | Host SMTP |
| `MAIL_SMTP_PORT` | tekst | Domyślnie `587` (STARTTLS). `465` = TLS od razu |
| `MAIL_SMTP_SECURE` | tekst, opcjonalnie | Jak `MAIL_IMAP_SECURE` |
| `MAIL_SMTP_USER` | tekst | Login SMTP. Gdy pusty, użyty jest login IMAP |
| `MAIL_SMTP_PASS` | **Secret** | Hasło SMTP |
| `MAIL_FROM` | tekst | Adres w polu From odpowiedzi, np. `sklep@twojadomena.pl` |
| `MAIL_POLL_SECRET` | **Secret**, opcjonalnie | Nagłówek `X-NHP-Mail-Poll` dla zewnętrznego odświeżania |
| `MAIL_INBOUND_SECRET` | **Secret**, opcjonalnie | Nagłówek `X-NHP-Mail-Inbound` dla webhooka z surowym listem |
| `NHP_SYNC_SECRET` | **Secret**, opcjonalnie | Ten sam nagłówek `X-NHP-Sync` co kolejka Shopify też może odpalić pobranie skrzynki |

Skrzynka Shopify to zwykła skrzynka tego adresu, którego sklep używa do poczty. Panel nie loguje się do panelu Shopify — łączy się z serwerem pocztowym.

## Jak to działa na Cloudflare

Pages Functions nie trzymają otwartego gniazda IMAP między żądaniami. Przy każdym pobraniu funkcja otwiera TCP przez `connect()` (`cloudflare:sockets`), loguje się, bierze nowe UID z INBOX (`BODY.PEEK`, więc serwer nie oznacza listu jako przeczytanego), zapisuje je w Supabase i zamyka połączenie.

Pobranie startuje:

- gdy ktoś otworzy zakładkę Skrzynka (nie częściej niż raz na około 45 sekund w tej karcie),
- po przycisku **Odśwież**,
- albo z zewnątrz: `POST /api/mail/poll` z nagłówkiem `X-NHP-Mail-Poll` równym `MAIL_POLL_SECRET` (albo `X-NHP-Sync` równym `NHP_SYNC_SECRET`).

Cron Pages tego nie robi. Można wołać ten adres co kilka minut z harmonogramu Cloudflare Worker albo innego pinga. Jedno pobranie bierze najwyżej 15 nowych listów.

Odpowiedź z panelu idzie tym samym sposobem: krótkie połączenie SMTP, potem zapis w wątku.

Opcjonalny webhook, gdy wolicie przekazywanie zamiast IMAP:

```text
POST https://panel.nowoczesnyhandelpolski.pl/api/mail/inbound
X-NHP-Mail-Inbound: <wartość MAIL_INBOUND_SECRET>
Content-Type: application/json

{"raw":"<pełny list RFC822>"}
```

Albo pola `from`, `subject`, `text`, `message_id`. To jest miejsce na Cloudflare Email Routing: osobny Worker odbiera list i POSTuje go tutaj. Sam Pages nie jest odbiorcą poczty przychodzącej.

## Autoresponder

Reguły startowe: status zamówienia, zwrot, faktura, dostawa. Słowa można zmienić w panelu.

Domyślnie reguła robi **szkic** do zatwierdzenia. Wysyłka sama wymaga dwóch zgód: przełącznika globalnego „Wysyłaj automatycznie” i przełącznika „Auto” przy regule.

Szkic może poprawić model z istniejącego połączenia OpenAI (sekret `OPENAI_API_KEY` albo klucz zaszyfrowany w Ustawieniach). Do promptu idzie dopasowane zamówienie Shopify (numer, płatność) i numer faktury KSeF, jeśli jest. Model nie dostaje hasła poczty. Gdy klucza nie ma, zostaje sam szablon.

Potwierdzenie otrzymania jest osobnym przełącznikiem i startuje wyłączone. Ma nagłówek `Auto-Submitted: auto-replied`.

Ochrona przed pętlą: pomijamy `Auto-Submitted` inne niż `no`, `Precedence: bulk/list/junk`, listy mailingowe, adresy `no-reply`, `noreply`, `mailer-daemon`, `postmaster` oraz nasz własny `MAIL_FROM`. Potwierdzenie: najwyżej raz na nadawcę na 24 godziny. Automatyczna odpowiedź z reguły: najwyżej trzy na nadawcę na 24 godziny.

## Wątek

Statusy: nowa, w toku, odpowiedziana, zamknięta. Otwarcie nowej wiadomości ustawia „w toku”. Wysłanie odpowiedzi ustawia „odpowiedziana”.

Opiekun to jedna z trzech osób zespołu. Wątek sam łączy się z zamówieniem Shopify po adresie nadawcy albo numerze `#1001` / `zamówienie 1001` w treści, a z produktem po pozycji tego zamówienia.

Formularz kontaktowy na stronach `/p` zostaje w zakładce „Od klientów”. Shopify nie ma tu osobnego API formularza kontaktowego. Jeśli sklep przekazuje taki formularz na skrzynkę, IMAP go zbierze.

## Tablica

W komunikatorze, obok czatu, jest **Tablica**. Każdy z zespołu dodaje wpis. Przypięte są na górze u wszystkich. Autor (ten sam e-mail, którym jest zalogowany) może edytować, odpinać i usuwać. Administrator tablicy też — ustawiasz go w SQL, bo lista `allowed_emails` nie jest czytana z przeglądarki:

```sql
update public.allowed_emails set is_admin = true where email = lower('wlasciciel@twojadomena.pl');
```

Odświeżanie na żywo idzie przez Realtime tabeli `team_board`. Zapis chroni RLS `is_team()`, a zmiana cudzego wpisu jest odrzucana, jeśli to nie autor i nie administrator.

## Ograniczenia

- Brak stałego nasłuchu IMAP i brak crona w samym Pages. Bez zewnętrznego pingu nowe listy widać po otwarciu Skrzynki albo po „Odśwież”.
- Jedno pobranie: do 15 listów, treść obcięta do około 24 KB. Załączniki nie są pokazywane.
- Wysyłka to zwykły tekst, bez HTML i bez załączników.
- Dopasowanie zamówienia jest po e-mailu i numerze w treści, nie po wszystkich aliasach klienta.
- W zamówieniach Shopify w Centrali nie ma numeru przesyłki, więc szablon mówi, że tej informacji nie ma, dopóki ktoś jej nie dopisze ręcznie w odpowiedzi.
- Szkic AI przy odświeżaniu cronem (bez sesji człowieka) powstaje tylko wtedy, gdy ustawiony jest `OPENAI_API_KEY`. Klucz z Ustawień wymaga zalogowanego zespołu.
- Potwierdzenie otrzymania i automat nie idą do nadawców z listy wyłączeń, nawet gdy reguła pasuje.
