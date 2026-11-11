// Wzory dokumentów strony. Do weryfikacji przez prawnika przed prawdziwą sprzedażą.
// Dane sprzedawcy przychodzą z karty (d.seller). Puste pola karta dziedziczy z Ustawień zespołu
// (records config/main → seller), więc wpisuje się je raz.
import { kEsc } from "./site-model.mjs";

// Opis sprzedawcy jednym zdaniem. Bez NIP zakładamy działalność nierejestrowaną (osoba fizyczna).
export function sellerLine(S, e = kEsc) {
  const ph = (v) => (v ? e(v) : "<mark>[uzupełnij]</mark>");
  const base = `${ph(S.name)}, ${ph(S.address)}`;
  return S.nip
    ? `${base}, NIP ${e(S.nip)}`
    : `${base}, osoba fizyczna prowadząca działalność nierejestrowaną (art. 5 ust. 1 ustawy Prawo przedsiębiorców)`;
}

export function legalDocs(row, d) {
  const e = kEsc;
  const S = d.seller;
  const ph = (v) => (v ? e(v) : "<mark>[uzupełnij]</mark>");
  const mail = ph(S.email);
  const tel = S.phone ? e(S.phone) : "";
  const shop = e(d.brand || row.name || "Sklep");
  const days = d.returns_days;
  const contact = `e-mail: ${mail}${tel ? `, telefon: ${tel}` : ""}`;
  const seller = sellerLine(S, e);
  const vat = S.vat_exempt
    ? "Sprzedawca korzysta ze zwolnienia z VAT (art. 113 ust. 1 ustawy o VAT), więc ceny nie zawierają VAT."
    : "Ceny zawierają podatek VAT, jeżeli Sprzedawca jest jego podatnikiem.";
  const receipt = S.nip
    ? "Do zamówienia Sprzedawca wystawia paragon albo fakturę, na żądanie Klienta."
    : "Na żądanie Klienta Sprzedawca wystawia rachunek potwierdzający sprzedaż.";

  const regulamin = `<h2>Regulamin sklepu internetowego ${shop}</h2>
<p class="lg-note">Wzór do weryfikacji przez prawnika. Wersja z dnia publikacji strony.</p>
<h3>§1. Sprzedawca i definicje</h3>
<ol><li>Sklep internetowy ${shop} (dalej: Sklep) prowadzi ${seller} (dalej: Sprzedawca). Kontakt: ${contact}.</li>
<li>Klient to osoba, która składa zamówienie. Konsument to Klient będący osobą fizyczną, który kupuje w celu niezwiązanym bezpośrednio z działalnością gospodarczą lub zawodową.</li>
<li>Przepisy o Konsumencie dotyczące odstąpienia od umowy i niezgodności towaru z umową stosuje się także do osoby fizycznej prowadzącej działalność gospodarczą, która kupuje produkt niemający dla niej charakteru zawodowego (art. 38a ustawy o prawach konsumenta).</li>
<li>Regulamin określa zasady składania zamówień, płatności, dostawy, odstąpienia od umowy i reklamacji. Regulamin jest dostępny na stronie produktu przed złożeniem zamówienia i można go zapisać lub wydrukować.</li></ol>
<h3>§2. Wymagania techniczne</h3>
<p>Do złożenia zamówienia potrzebne są: urządzenie z dostępem do internetu, aktualna przeglądarka z włączonym JavaScript i aktywny adres e-mail. Zabronione jest dostarczanie treści o charakterze bezprawnym.</p>
<h3>§3. Ceny</h3>
<ol><li>Ceny są cenami końcowymi w złotych polskich. ${vat}</li>
<li>${d.shipping.free ? "Dostawa jest bezpłatna." : "Koszt dostawy jest podany przed złożeniem zamówienia i doliczany do ceny."}</li>
<li>Przy obniżce ceny podajemy najniższą cenę z 30 dni przed obniżką.</li></ol>
<h3>§4. Zamówienie i zawarcie umowy</h3>
<ol><li>Klient wybiera zestaw i wariant, podaje dane do wysyłki, akceptuje Regulamin i klika przycisk zamówienia z obowiązkiem zapłaty.</li>
<li>Po złożeniu zamówienia Klient dostaje na e-mail potwierdzenie jego przyjęcia. Z tą chwilą zostaje zawarta umowa sprzedaży.</li>
<li>Treść umowy jest utrwalana przez przesłanie Klientowi potwierdzenia zamówienia wraz z Regulaminem.</li>
<li>${receipt}</li></ol>
<h3>§5. Płatność</h3>
<ol><li>Płatność odbywa się z góry przez operatora płatności Stripe (Stripe Payments Europe Ltd.): BLIK, Przelewy24, karta płatnicza, Apple Pay lub Google Pay. Po złożeniu zamówienia Klient jest przekierowany na stronę płatności.</li>
<li>Jeżeli płatność nie zostanie zakończona w ciągu 3 dni od złożenia zamówienia, Sprzedawca może anulować zamówienie po wcześniejszej wiadomości do Klienta.</li>
<li>Status płatności (oczekuje / opłacone) jest niezależny od statusu wysyłki.</li></ol>
<h3>§6. Dostawa</h3>
<ol><li>Wysyłka odbywa się na terenie Polski przez firmę kurierską albo do paczkomatu. Produkt może zostać wysłany bezpośrednio z magazynu dostawcy Sprzedawcy.</li>
<li>${d.shipping.cutoff ? `Zamówienia opłacone w dni robocze do ${e(d.shipping.cutoff)} (czas Europe/Warsaw) przekazujemy do wysyłki tego samego dnia. ` : ""}${e(d.shipping.time || "Czas wysyłki podany jest na stronie produktu.")}</li>
<li>Termin dostawy wynosi nie więcej niż 14 dni roboczych od zaksięgowania płatności, chyba że strona produktu podaje krótszy termin.</li></ol>
<h3>§7. Prawo odstąpienia od umowy</h3>
<ol><li>Konsument może odstąpić od umowy w ciągu ${days} dni od otrzymania produktu, bez podawania przyczyny.${days > 14 ? " Termin jest dłuższy niż ustawowe 14 dni." : ""}</li>
<li>Wystarczy wysłać oświadczenie na ${mail}, np. na wzorze formularza z zakładki „Zwroty”. Do zachowania terminu wystarczy wysłanie oświadczenia przed jego upływem.</li>
<li>Sprzedawca zwraca wszystkie płatności, w tym najtańszy zwykły koszt dostawy, w ciągu 14 dni od otrzymania oświadczenia, tą samą metodą płatności. Sprzedawca może wstrzymać zwrot do chwili otrzymania produktu albo dowodu jego odesłania.</li>
<li>Konsument odsyła produkt w ciągu 14 dni od złożenia oświadczenia na adres podany przez Sprzedawcę i ponosi bezpośredni koszt odesłania, chyba że Sprzedawca zgodzi się go pokryć.</li>
<li>Konsument odpowiada za zmniejszenie wartości produktu wynikające z korzystania z niego w sposób wykraczający poza konieczny do stwierdzenia jego charakteru, cech i funkcjonowania.</li>
<li>Prawo odstąpienia nie przysługuje m.in. dla produktów wyprodukowanych według specyfikacji Konsumenta, szybko psujących się oraz dostarczanych w zapieczętowanym opakowaniu, którego po otwarciu nie można zwrócić ze względów higienicznych, jeżeli opakowanie zostało otwarte (art. 38 ustawy o prawach konsumenta).</li></ol>
<h3>§8. Reklamacje — niezgodność towaru z umową</h3>
<ol><li>Sprzedawca odpowiada za zgodność produktu z umową przez 2 lata od jego dostarczenia.</li>
<li>Jeżeli produkt jest niezgodny z umową, Konsument może żądać naprawy albo wymiany, a gdy nie jest to możliwe albo Sprzedawca odmówi — obniżenia ceny albo odstąpienia od umowy (art. 43a–43g ustawy o prawach konsumenta).</li>
<li>Reklamację można złożyć na ${mail}. Warto podać numer zamówienia, opis problemu, zdjęcia i oczekiwane rozwiązanie.</li>
<li>Sprzedawca odpowiada na reklamację w ciągu 14 dni. Brak odpowiedzi w tym terminie oznacza uznanie reklamacji.</li></ol>
<h3>§9. Pozasądowe rozwiązywanie sporów</h3>
<p>Konsument może skorzystać z pomocy miejskiego lub powiatowego rzecznika konsumentów oraz wojewódzkiego inspektoratu Inspekcji Handlowej. Informacje: prawakonsumenta.uokik.gov.pl.</p>
<h3>§10. Postanowienia końcowe</h3>
<ol><li>Dane osobowe przetwarzamy zgodnie z Polityką prywatności.</li>
<li>Zmiana Regulaminu nie dotyczy zamówień złożonych przed jej wejściem w życie.</li>
<li>W sprawach nieuregulowanych stosuje się prawo polskie, w szczególności Kodeks cywilny i ustawę o prawach konsumenta. Postanowienia Regulaminu nie ograniczają praw Konsumenta wynikających z przepisów.</li></ol>`;

  const prywatnosc = `<h2>Polityka prywatności</h2>
<p>Administratorem danych jest ${seller}. Kontakt: ${contact}.</p>
<h3>Po co przetwarzamy dane</h3>
<ul>
<li><b>Zamówienie i dostawa</b> (imię i nazwisko, adres lub paczkomat, e-mail, telefon) — art. 6 ust. 1 lit. b RODO, przez czas realizacji umowy.</li>
<li><b>Księgowość i podatki</b> — art. 6 ust. 1 lit. c RODO, przez 5 lat od końca roku podatkowego.</li>
<li><b>Reklamacje i roszczenia</b> — art. 6 ust. 1 lit. f RODO, do upływu terminu przedawnienia.</li>
<li><b>Wiadomość z formularza</b> — art. 6 ust. 1 lit. f RODO, przez czas potrzebny do odpowiedzi.</li>
<li><b>E-mail z ofertą</b> — tylko za zgodą, art. 6 ust. 1 lit. a RODO, do jej cofnięcia.</li>
</ul>
<h3>Komu przekazujemy dane</h3>
<ul>
<li>dostawcy towaru i firmie kurierskiej — imię i nazwisko, adres, telefon, żeby wysłać paczkę,</li>
<li>operatorowi płatności Stripe — dane potrzebne do płatności (Stripe jest osobnym administratorem danych płatniczych),</li>
<li>dostawcom usług IT: Cloudflare (hosting strony), Supabase (baza danych), home.pl (poczta e-mail),</li>
<li>biuru rachunkowemu, jeżeli z niego korzystamy.</li>
</ul>
<p>Część dostawców (Stripe, Cloudflare) może przetwarzać dane poza Europejskim Obszarem Gospodarczym na podstawie standardowych klauzul umownych Komisji Europejskiej lub programu EU-US Data Privacy Framework.</p>
<h3>Twoje prawa</h3>
<p>Przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przeniesienia, sprzeciwu, cofnięcia zgody oraz skargi do Prezesa UODO (ul. Stawki 2, 00-193 Warszawa). Podanie danych jest dobrowolne, ale bez danych do wysyłki nie zrealizujemy zamówienia. Nie podejmujemy decyzji w sposób zautomatyzowany ani nie profilujemy.</p>`;

  const zwroty = `<h2>Zwroty i reklamacje</h2>
<ol><li>Napisz na ${mail}, że odstępujesz od umowy. Możesz użyć wzoru poniżej.</li><li>Odeślij produkt w ciągu 14 dni od wysłania oświadczenia. Adres do zwrotu podamy w odpowiedzi.</li><li>Pieniądze wracają w ciągu 14 dni, tą samą metodą płatności.</li></ol>
<p>Masz ${days} dni na zwrot bez podawania przyczyny. Reklamację z powodu wady też zgłosisz na ${mail} — odpowiemy w ciągu 14 dni.</p>
<h3>Wzór formularza odstąpienia od umowy</h3>
<p class="lg-note">Formularz należy wypełnić i odesłać tylko w przypadku chęci odstąpienia od umowy.</p>
<div class="lg-form">Adresat: ${seller}, ${mail}<br><br>
Ja/My(*) niniejszym informuję/informujemy(*) o moim/naszym odstąpieniu od umowy sprzedaży następujących rzeczy: ………<br>
Data zawarcia umowy / odbioru(*): ………<br>
Imię i nazwisko konsumenta(-ów): ………<br>
Adres konsumenta(-ów): ………<br>
Podpis konsumenta(-ów) (tylko jeżeli formularz jest przesyłany w wersji papierowej): ………<br>
Data: ………<br><br>
(*) Niepotrzebne skreślić.</div>`;

  const cookies = `<h2>Polityka cookies</h2>
<p>Strona zapisuje w przeglądarce wyłącznie dane niezbędne do działania formularza (np. znacznik czasu otwarcia koszyka). Nie uruchamiamy analityki ani reklam bez osobnej zgody. Strona płatności Stripe używa własnych plików cookies niezbędnych do bezpiecznej płatności.</p>`;
  return { regulamin, prywatnosc, zwroty, cookies };
}
