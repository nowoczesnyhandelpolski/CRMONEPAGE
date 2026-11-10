# Centrala CRM · Nowoczesny Handel Polski

Wspólny CRM firmy (dropshipping) z logowaniem dla wspólników. Docelowy adres: **https://panel.nowoczesnyhandelpolski.pl**

## Co jest w środku
- **Pulpit** – cel miesięczny, przychód, zysk, marża, wykres 14 dni, lejek zamówień, „Wymaga uwagi”, zespół, historia zmian
- **Zamówienia** – statusy od „Nowe” do „Dostarczone” + Problem / Zwrot, zysk liczony automatycznie
- **Produkty**, **Dostawcy**, **Klienci**, **Zadania** (kanban), **Sklepy i boty**

## Technologia
- `index.html` – cała aplikacja (HTML + vanilla JS, bez budowania)
- `config.js` – adres projektu Supabase + klucz **publishable** (jawny z założenia)
- `supabase.sql` – baza, reguły bezpieczeństwa (RLS) i realtime; uruchamiany raz w Supabase → SQL Editor
- Dostęp do danych mają tylko zalogowane osoby z e-mailem z tabeli `allowed_emails`

## Wdrożenie (Cloudflare Pages)
1. Supabase: nowy projekt → SQL Editor → `supabase.sql` (z prawdziwymi e-mailami wspólników) → Run
2. Supabase → Authentication: wyłącz rejestrację, Site URL = `https://panel.nowoczesnyhandelpolski.pl`, dodaj konta (właściciel: Create user, wspólnicy: Send invitation)
3. Wpisz Project URL i klucz publishable do `config.js`, commit
4. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → to repo, bez komendy budowania, katalog wyjściowy `/`
5. Custom domain: `panel.nowoczesnyhandelpolski.pl`

⚠️ Nigdy nie commituj klucza `secret` ani `service_role`.
