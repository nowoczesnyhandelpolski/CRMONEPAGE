// Wzory dokumentów strony. Do weryfikacji przez prawnika przed prawdziwą sprzedażą.
import { kEsc } from "./site-model.mjs";

export function legalDocs(row, d) {
  const e = kEsc;
  const S = d.seller;
  const ph = (v) => (v ? e(v) : "<mark>[uzupełnij]</mark>");
  const name = ph(S.name);
  const addr = ph(S.address);
  const nip = ph(S.nip);
  const mail = ph(S.email);
  const tel = S.phone ? ph(S.phone) : "";
  const shop = e(d.brand || row.name || "Sklep");
  const days = d.returns_days;
  const contact = `e-mail: ${mail}${tel ? `, telefon: ${tel}` : ""}`;
  const seller = `${name}, ${addr}, NIP ${nip}`;
  const regulamin = `<h2>Regulamin sklepu internetowego ${shop}</h2>
<p class="lg-note">Wzór do weryfikacji przez prawnika. Wersja z dnia publikacji strony.</p>
<h3>§1. Postanowienia ogólne</h3>
<ol><li>Sklep internetowy ${shop} prowadzi ${seller} (dalej: Sprzedawca). Kontakt: ${contact}.</li>
<li>Regulamin określa zasady składania zamówień, płatności, dostawy, odstąpienia od umowy i reklamacji.</li></ol>
<h3>§2. Ceny</h3>
<ol><li>Ceny są cenami końcowymi w złotych.${S.vat_exempt ? " Sprzedawca korzysta ze zwolnienia z VAT (art. 113 ust. 1 ustawy o VAT)." : " Ceny zawierają podatek VAT, o ile sprzedawca jest podatnikiem VAT."}</li>
<li>${d.shipping.free ? "Dostawa jest bezpłatna." : "Koszt dostawy jest podany przed złożeniem zamówienia."}</li>
<li>Przy obniżce ceny podajemy najniższą cenę z 30 dni przed obniżką.</li></ol>
<h3>§3. Zamówienie</h3>
<ol><li>Klient wybiera zestaw i wariant, podaje dane do wysyłki, wybiera płatność, akceptuje regulamin i klika przycisk zamówienia z obowiązkiem zapłaty.</li>
<li>Umowa zostaje zawarta z chwilą potwierdzenia przyjęcia zamówienia.</li>
<li>Status płatności (oczekuje / opłacone) jest niezależny od statusu wysyłki.</li></ol>
<h3>§4. Płatność</h3>
<p>Płatność obsługuje operator płatności (planowany: Przelewy24 — BLIK, przelew, karta). Do czasu podłączenia operatora zamówienie zapisuje się ze statusem płatności „oczekuje”, a sprzedawca przekazuje dane do zapłaty.</p>
<h3>§5. Dostawa</h3>
<p>Wysyłka na terenie Polski. ${d.shipping.cutoff ? `Zamówienia złożone w dni robocze do ${e(d.shipping.cutoff)} (czas Europe/Warsaw) wysyłamy tego samego dnia.` : ""} ${e(d.shipping.time || "Czas wysyłki podany jest na stronie produktu.")} Doręczenie przez przewoźnika zajmuje zwykle 1–2 dni robocze i nie jest gwarantowane co do godziny.</p>
<h3>§6. Odstąpienie od umowy</h3>
<p>Konsument może odstąpić od umowy w ciągu ${days} dni od otrzymania produktu, bez podawania przyczyny.${days > 14 ? " Termin jest dłuższy niż ustawowe 14 dni." : ""} Wystarczy wiadomość na ${mail}. Zwrot płatności następuje w ciągu 14 dni tą samą metodą. Koszt odesłania ponosi konsument, chyba że sprzedawca ustali inaczej.</p>
<h3>§7. Reklamacja</h3>
<p>Sprzedawca odpowiada za zgodność towaru z umową. Reklamację można zgłosić na ${mail}. Odpowiedź w ciągu 14 dni.</p>`;
  const prywatnosc = `<h2>Polityka prywatności</h2>
<p>Administratorem danych jest ${seller}. Kontakt: ${contact}.</p>
<ul>
<li><b>Zamówienie</b> (imię, adres lub paczkomat, e-mail, telefon) — art. 6 ust. 1 lit. b RODO.</li>
<li><b>Księgowość</b> — art. 6 ust. 1 lit. c RODO.</li>
<li><b>Wiadomość z formularza</b> — art. 6 ust. 1 lit. f RODO, przez czas potrzebny do odpowiedzi.</li>
<li><b>E-mail z ofertą</b> — tylko za zgodą, art. 6 ust. 1 lit. a RODO.</li>
</ul>
<p>Dane przekazujemy operatorowi płatności, przewoźnikowi, hostingowi (Cloudflare) i dostawcy bazy (Supabase) w zakresie potrzebnym do realizacji zamówienia. Przysługuje prawo dostępu, sprostowania, usunięcia, ograniczenia, przeniesienia, sprzeciwu i skargi do Prezesa UODO.</p>`;
  const zwroty = `<h2>Zwroty i reklamacje</h2>
<ol><li>Napisz na ${mail}, że odstępujesz od umowy.</li><li>Odeślij produkt w ciągu 14 dni od oświadczenia.</li><li>Pieniądze wracają w ciągu 14 dni, tą samą metodą płatności.</li></ol>
<p>Masz ${days} dni na zwrot bez podawania przyczyny.</p>
<h3>Wzór odstąpienia</h3>
<div class="lg-form">Adresat: ${seller}, ${mail}<br><br>Odstępuję od umowy sprzedaży: ………<br>Data odbioru: ………<br>Imię i nazwisko: ………<br>Adres: ………</div>`;
  const cookies = `<h2>Polityka cookies</h2>
<p>Strona zapisuje w przeglądarce wyłącznie dane niezbędne do działania formularza (np. znacznik czasu otwarcia koszyka). Nie uruchamiamy analityki ani reklam bez osobnej zgody.</p>`;
  return { regulamin, prywatnosc, zwroty, cookies };
}
