/* Pomiar reklam — automatyczne liczenie wyników Meta Ads i Google Ads dla sklepu Zeggo.
   Dane: records adlive/main (zrzut z /api/ads/sync: wiersze dzienne kampanii + zamówienia Shopify z UTM),
         records adcfg/main (ustawienia: marża, prowizja, plan K1–K4).
   Panel sam odświeża dane co 15 minut, gdy ktoś ma otwarty ten widok; cron w Supabase robi to co godzinę.
   Każda liczba ma objaśnienie „jak dla 5-latka”, ocenę (dobrze / średnio / źle) i podpowiedź, co zrobić. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("pr-css")) return;
    const css = document.createElement("style");
    css.id = "pr-css";
    css.textContent = `
      .pr-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
      .pr-sel{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:7px 10px;font-weight:600}
      .pr-src{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;margin-bottom:14px}
      .pr-src .sp{flex:1}
      .pr-dot{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;background:var(--surface-2);font-size:13px;font-weight:600}
      .pr-dot i{width:9px;height:9px;border-radius:50%;background:var(--grey);display:inline-block}
      .pr-dot.ok i{background:var(--good)}.pr-dot.err i{background:var(--bad)}.pr-dot.off i{background:var(--warn)}
      .pr-demo{padding:10px 16px;margin-bottom:14px;border-radius:14px;background:color-mix(in srgb,var(--warn) 14%,var(--surface));border:2px dashed color-mix(in srgb,var(--warn) 50%,transparent);font-size:14px}
      .pr-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .pr-kpi{padding:14px 16px;border-top:5px solid var(--line);position:relative;cursor:pointer;text-align:left;border-left:0;border-right:0;border-bottom:0;font:inherit;color:inherit;width:100%}
      .pr-kpi.good{border-top-color:var(--good)}.pr-kpi.ok{border-top-color:var(--warn)}.pr-kpi.bad{border-top-color:var(--bad)}.pr-kpi.none{border-top-color:var(--grey)}
      .pr-kpi > span{display:block;font-size:13px;color:var(--muted);font-weight:600;padding-right:22px}
      .pr-kpi strong{display:block;font:700 25px var(--display);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pr-kpi small{display:block;color:var(--muted);font-size:12px;line-height:1.35}
      .pr-kpi .q{position:absolute;top:10px;right:12px;width:20px;height:20px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center;font:700 12px var(--display);color:var(--muted)}
      .pr-tag{display:inline-block;width:max-content;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;margin-top:6px}
      .pr-tag.good{background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good)}
      .pr-tag.ok{background:color-mix(in srgb,var(--warn) 18%,transparent);color:color-mix(in srgb,var(--warn) 75%,var(--ink))}
      .pr-tag.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}
      .pr-tag.none{background:var(--surface-2);color:var(--muted)}
      .pr-sec{margin-bottom:16px;overflow:hidden}
      .pr-sec > h2{font-size:18px;padding:14px 18px 2px;margin:0}
      .pr-sec > p.sub{color:var(--muted);font-size:13px;padding:0 18px 8px;margin:0}
      .pr-do{display:flex;gap:12px;align-items:flex-start;padding:11px 18px;border-top:1px solid var(--line);font-size:15px}
      .pr-do .ic{font-size:20px;width:28px;text-align:center;flex:none}
      .pr-do .tx{flex:1;min-width:0}
      .pr-do .tx small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
      .pr-do.bad{background:color-mix(in srgb,var(--bad) 5%,transparent)}
      .pr-do.good{background:color-mix(in srgb,var(--good) 5%,transparent)}
      .pr-fun{padding:6px 18px 16px}
      .pr-fs{display:grid;grid-template-columns:200px 1fr 150px;gap:12px;align-items:center;padding:6px 0}
      .pr-fs .lb{font-weight:700;font-size:14px}.pr-fs .lb small{display:block;font-weight:500;color:var(--muted);font-size:12px}
      .pr-fs .tr{height:28px;background:var(--surface-2);border-radius:8px;overflow:hidden}
      .pr-fs .fl{height:100%;background:linear-gradient(90deg,var(--navy),var(--info));border-radius:8px;display:flex;align-items:center;padding-left:10px;color:#fff;font:700 13px var(--display);min-width:max-content}
      .pr-fs .rt{font-size:13px;text-align:right}
      .pr-fs.leak .tr{box-shadow:0 0 0 2px var(--bad)}
      .pr-chart{padding:4px 12px 14px;overflow-x:auto}
      .pr-chart svg{display:block;width:100%;min-width:560px;height:auto}
      .pr-leg{display:flex;gap:16px;font-size:12px;color:var(--muted);padding:0 18px 8px}
      .pr-leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-2px}
      .pr-tbl{overflow-x:auto;padding:0 6px 10px}
      .pr-tbl table{width:100%;border-collapse:collapse;font-size:13px}
      .pr-tbl th{font-size:11px;color:var(--muted);text-align:right;padding:8px;font-weight:700;white-space:nowrap}
      .pr-tbl td{padding:9px 8px;border-top:1px solid var(--line);text-align:right;white-space:nowrap}
      .pr-tbl th:first-child,.pr-tbl td:first-child{text-align:left;white-space:normal;min-width:190px}
      .pr-tbl td b{font-family:var(--display)}
      .pr-tbl tr.pr-row{cursor:pointer}.pr-tbl tr.pr-row:hover td{background:var(--surface-2)}
      .pr-tbl td.good{color:var(--good);font-weight:700}.pr-tbl td.bad{color:var(--bad);font-weight:700}.pr-tbl td.ok{color:color-mix(in srgb,var(--warn) 80%,var(--ink));font-weight:700}
      .pr-k{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:9px;color:#fff;font:800 12px var(--display);margin-right:8px;vertical-align:middle;background:var(--navy)}
      .pr-k.k1{background:#C8102E}.pr-k.k2{background:#2F6FD6}.pr-k.k3{background:#0E8A7D}.pr-k.k4{background:#6B4FD8}
      .pr-all{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:6px 18px 18px}
      .pr-m{background:var(--surface-2);border-radius:12px;padding:10px 12px;cursor:pointer;border:0;text-align:left;font:inherit;color:inherit;border-left:4px solid var(--grey)}
      .pr-m.good{border-left-color:var(--good)}.pr-m.ok{border-left-color:var(--warn)}.pr-m.bad{border-left-color:var(--bad)}
      .pr-m span{display:block;font-size:12px;color:var(--muted);font-weight:600}
      .pr-m strong{display:block;font:700 19px var(--display)}
      .pr-m small{display:block;font-size:12px;color:var(--muted);line-height:1.35}
      .pr-gl details{border-top:1px solid var(--line)}
      .pr-gl summary{padding:12px 18px;cursor:pointer;font-weight:700;font-size:15px}
      .pr-gl summary small{font-weight:500;color:var(--muted)}
      .pr-ex{padding:0 18px 14px;font-size:14px;line-height:1.55}
      .pr-ex p{margin:6px 0}
      .pr-ex .kid{background:color-mix(in srgb,var(--info) 9%,var(--surface-2));border-radius:12px;padding:10px 12px}
      .pr-ex .rng{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .pr-ex code{background:var(--surface-2);padding:2px 6px;border-radius:6px;font-size:13px}
      .pr-steps ol{margin:0;padding:4px 18px 14px 38px;font-size:14px;line-height:1.6}
      .pr-steps details{border-top:1px solid var(--line)}
      .pr-steps summary{padding:12px 18px;cursor:pointer;font-weight:700}
      .pr-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:6px 18px 16px}
      .pr-form label{font-size:12px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px}
      .pr-form input{width:100%;border:1px solid var(--line);background:var(--surface-2);border-radius:10px;padding:8px 10px}
      .modal:has(.pr-wide){width:min(1000px,100%)}
      .pr-mb{grid-column:1/-1;min-width:0}
      .pr-mb .pr-all{padding:10px 0 0}
      .pr-mb .pr-ex{padding:0}
      .pr-spin{display:inline-block;animation:prspin 1s linear infinite}@keyframes prspin{to{transform:rotate(360deg)}}
      @media (max-width:900px){.pr-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.pr-all{grid-template-columns:repeat(2,minmax(0,1fr))}.pr-form{grid-template-columns:repeat(2,minmax(0,1fr))}.pr-fs{grid-template-columns:120px 1fr 92px}}
      @media (max-width:560px){.pr-all{grid-template-columns:1fr}}
    `;
    document.head.appendChild(css);

    ["adlive", "adcfg"].forEach((c) => { if (!CRM.COLS.includes(c)) CRM.COLS.push(c); CRM.S[c] = CRM.S[c] || {}; });
    const ki = CRM.VIEWS.findIndex((v) => v[0] === "kampanie");
    CRM.VIEWS.splice(ki >= 0 ? ki + 1 : CRM.VIEWS.length, 0, ["pomiar", "Pomiar reklam", "spark"]);
    CRM.VIEW_FNS.pomiar = vMeasure;

    const esc = (s) => CRM.esc(s ?? "");
    const zl = (v) => CRM.fmtZl(Math.round((Number(v) || 0) * 100) / 100);
    const zl2 = (v) => (isFinite(v) && v > 0 ? v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł" : "—");
    const int = (v) => (Number(v) || 0).toLocaleString("pl-PL");
    const pct = (v, d = 1) => (isFinite(v) ? (v * 100).toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%" : "—");
    const xx = (v) => (isFinite(v) && v > 0 ? v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "×" : "—");
    const div = (a, b) => (b > 0 ? a / b : NaN);
    const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
    const today = () => CRM.TODAY();
    const fmtD = (s) => new Date(s + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
    const lsGet = (k, f) => { try { const v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const U = (CRM.UI.pr = Object.assign({ period: lsGet("pr-period", "start"), pf: "all", demo: lsGet("pr-demo", "") === "1", syncing: false, err: "" }, CRM.UI.pr || {}));

    /* ---------- plan kampanii Zeggo (dokument „Plan kampanii Zeggo”) ---------- */
    const PLAN = {
      k1: { name: "Prezent do 500 zł", goal: "Zasięg i pierwsze zakupy przed świętami", ch: "Meta Reels/Stories + Google Shopping", bmin: 60, bmax: 80, aov: 420, utm: "k1_prezent500" },
      k2: { name: "Zobacz go na swoim nadgarstku", goal: "Sprzedaż droższych zegarków (przymiarka na nadgarstku)", ch: "Meta Reels/Feed", bmin: 50, bmax: 70, aov: 2000, utm: "k2_nadgarstek" },
      k3: { name: "Zegarek na lata (automaty premium)", goal: "Wysoka wartość koszyka: automaty 1700–7000 zł", ch: "Meta + Google Search", bmin: 40, bmax: 60, aov: 3500, utm: "k3_automaty" },
      k4: { name: "Ostatnia szansa przed świętami", goal: "Domknięcie: oglądali, nie kupili (remarketing)", ch: "Meta remarketing dynamiczny", bmin: 30, bmax: 50, bmaxLate: 80, lateFrom: "2026-12-08", aov: 600, utm: "k4_remarketing", retarget: true }
    };
    const CFG0 = { margin: 30, fee: 2, start: "2026-11-26", lastShip: "2026-12-17" };
    const cfg = () => Object.assign({}, CFG0, CRM.S.adcfg.main || {});
    const PERIODS = [["1", "Dziś"], ["yday", "Wczoraj"], ["7", "Ostatnie 7 dni"], ["14", "Ostatnie 14 dni"], ["30", "Ostatnie 30 dni"], ["start", "Od startu kampanii"]];
    const PLATF = [["all", "Wszystkie"], ["meta", "Meta"], ["google", "Google Ads"]];

    /* ---------- słownik wskaźników: objaśnienie „jak 5-latkowi”, progi i co robić ---------- */
    const M = {
      spend: { n: "Wydane na reklamy", f: "suma kosztów z Meta i Google", kid: "To kieszonkowe, które daliśmy Facebookowi i Google, żeby pokazywali ludziom nasze zegarki.", why: "Pilnujemy, żeby nie przekroczyć budżetu z planu i żeby każda złotówka wracała z zyskiem.", fix: "Jeśli wydajemy więcej niż w planie, a zysku nie ma — obniż budżet najsłabszej kampanii." },
      revenue: { n: "Sprzedaż z reklam (sklep)", f: "suma zamówień w Shopify z linkiem utm_medium=paid", kid: "Ile pieniędzy wpadło do kasy sklepu od ludzi, którzy przyszli z reklamy. To liczy sklep, nie Facebook — więc to najprawdziwsza liczba.", why: "Facebook i Google czasem przypisują sobie za dużo. Sklep widzi, co naprawdę kupiono.", fix: "Jeśli jest 0 mimo zakupów — sprawdź, czy każda reklama ma link z UTM z planu." },
      roas: { n: "ROAS — zwrot z reklamy", f: "sprzedaż ÷ wydane", kid: "Dajemy 1 zł na reklamę — ile złotówek wraca w sprzedaży? ROAS 4× znaczy: wrzuciłeś 1 zł, wyjąłeś 4 zł.", why: "Ale z tych 4 zł trzeba jeszcze kupić zegarek u dostawcy. Dlatego liczy się „próg opłacalności”.", fix: "Poniżej progu: popraw reklamę albo stronę, a jeśli po 5 dniach nic — wyłącz. Wysoko nad progiem: zwiększaj budżet o 20% co 2–3 dni." },
      be: { n: "Próg opłacalności ROAS", f: "1 ÷ marża", kid: "Najniższy ROAS, przy którym jesteśmy „na zero”. Przy marży 30% trzeba sprzedać za 3,33 zł z każdej 1 zł reklamy, żeby nie stracić.", why: "Wszystko powyżej progu to zysk, poniżej — dopłacamy.", fix: "Wyższa marża (lepsze ceny zakupu, droższe zegarki) obniża próg." },
      profit: { n: "Zysk po reklamie", f: "sprzedaż × marża − prowizje − wydane", kid: "Ile zostaje w skarbonce, kiedy zapłacimy za zegarek, za płatność i za reklamę. To najważniejsza liczba.", why: "Można mieć dużą sprzedaż i tracić pieniądze. Ten wynik mówi prawdę.", fix: "Ujemny przez 5+ dni → zmniejsz budżet lub wyłącz najsłabszą kampanię." },
      orders: { n: "Zamówienia z reklam", f: "zamówienia Shopify z UTM reklamy", kid: "Ile osób po kliknięciu reklamy naprawdę kupiło zegarek.", why: "Pokazuje, czy reklama sprzedaje, a nie tylko się podoba.", fix: "Za mało zamówień przy dużym ruchu → patrz lejek: gdzie ludzie odpadają." },
      cpa: { n: "CPA — koszt jednego zamówienia", f: "wydane ÷ zamówienia", kid: "Ile zapłaciliśmy reklamie, żeby jedna osoba kupiła zegarek.", why: "Musi być mniejszy niż zarobek na zegarku (cena × marża). Inaczej każda sprzedaż to strata.", fix: "Za wysoki → popraw stronę produktu i kreację albo celuj w droższe zegarki (większy zarobek z jednej sztuki)." },
      aov: { n: "AOV — średnie zamówienie", f: "sprzedaż ÷ liczba zamówień", kid: "Ile średnio wydaje jeden klient w jednym zamówieniu.", why: "Im wyższe, tym więcej możemy zapłacić za klienta i nadal zarobić.", fix: "Podnieś: darmowa dostawa od 200 zł, pasek/pudełko prezentowe w zestawie, polecaj droższe modele." },
      impr: { n: "Wyświetlenia", f: "ile razy reklama pojawiła się na ekranie", kid: "Ile razy nasza reklama mignęła komuś w telefonie. Jedna osoba może zobaczyć ją kilka razy.", why: "Bez wyświetleń nie ma kliknięć. To początek lejka.", fix: "Mało wyświetleń przy pełnym budżecie = drogie wyświetlenia (wysoki CPM)." },
      reach: { n: "Zasięg", f: "ile różnych osób zobaczyło reklamę (suma dzienna, przybliżona)", kid: "Ile różnych ludzi zobaczyło reklamę — każdego liczymy raz dziennie.", why: "Pokazuje, do ilu nowych osób docieramy.", fix: "Mały zasięg i wysoka częstotliwość → poszerz grupę odbiorców." },
      cpm: { n: "CPM — koszt 1000 wyświetleń", f: "wydane ÷ wyświetlenia × 1000", kid: "Ile kosztuje pokazanie reklamy tysiąc razy. Jak cena biletu do kina dla tysiąca ludzi.", why: "Przed świętami wszyscy się reklamują, więc bilety drożeją. Wysoki CPM zjada budżet.", fix: "Za drogo → szersza grupa odbiorców, automatyczne miejsca (Advantage+), reklama, która dobrze się ogląda (Meta ją wtedy tanieje).", good: [0, 18], ok: [18, 35], low: true },
      ctr: { n: "CTR — klikalność linku", f: "kliknięcia w link ÷ wyświetlenia", kid: "Na 100 osób, które zobaczyły reklamę, ile kliknęło, żeby zobaczyć zegarek. 1% to 1 na 100.", why: "Pokazuje, czy reklama ciekawi. Plan zakłada minimum 1%.", fix: "Poniżej 1% → wymień pierwsze 2 sekundy rolki, pokaż cenę i zegarek na ręce od razu, krótszy tekst.", good: [0.015, 1], ok: [0.009, 0.015] },
      cpc: { n: "CPC — koszt kliknięcia", f: "wydane ÷ kliknięcia w link", kid: "Ile płacimy za jedną osobę, która weszła z reklamy do sklepu.", why: "Tanie kliknięcia = więcej ludzi w sklepie za te same pieniądze.", fix: "Drogie kliknięcia → popraw CTR (lepsza kreacja) albo obniż CPM (szersza grupa).", good: [0, 1.2], ok: [1.2, 2.5], low: true },
      freq: { n: "Częstotliwość", f: "wyświetlenia ÷ zasięg", kid: "Ile razy jedna osoba widziała tę samą reklamę. Jak bajka puszczona 10 razy — w końcu się nudzi.", why: "Za często = ludzie się nudzą, CTR spada, CPM rośnie. W remarketingu może być wyżej.", fix: "Powyżej 3,5 → dodaj nowe kreacje albo poszerz grupę.", good: [0, 2.2], ok: [2.2, 3.5], low: true },
      lpvr: { n: "Doładowanie strony", f: "wyświetlenia strony ÷ kliknięcia w link", kid: "Na 100 osób, które kliknęły, ile doczekało, aż strona sklepu się załaduje.", why: "Jeśli strona ładuje się wolno, ludzie uciekają, zanim zobaczą zegarek — płacimy za nic.", fix: "Poniżej 60% → przyspiesz stronę (mniejsze zdjęcia, mniej aplikacji w Shopify), sprawdź link w reklamie.", good: [0.75, 1], ok: [0.6, 0.75] },
      atcr: { n: "Dodanie do koszyka", f: "dodania do koszyka ÷ wyświetlenia strony", kid: "Na 100 osób, które obejrzały zegarek, ile włożyło go do koszyka.", why: "Mówi, czy produkt, cena i strona przekonują.", fix: "Poniżej 3% → lepsze zdjęcia, przymiarka na nadgarstku, wyraźna cena, darmowa dostawa, „zdąży przed świętami”.", good: [0.06, 1], ok: [0.03, 0.06] },
      cpatc: { n: "Koszt dodania do koszyka", f: "wydane ÷ dodania do koszyka", kid: "Ile płacimy reklamie za jedno włożenie zegarka do koszyka.", why: "Plan każe oceniać kreacje po 5 dniach właśnie po tym (i po CTR i ROAS).", fix: "Kreacje z najwyższym kosztem koszyka wyłącz, budżet przenieś na najtańsze." },
      chkr: { n: "Kasa → zakup", f: "zakupy ÷ rozpoczęte płatności", kid: "Na 100 osób, które przeszły do kasy, ile zapłaciło.", why: "Jeśli niski — coś przeszkadza przy płaceniu: koszt dostawy, brak BLIK, długi formularz.", fix: "Poniżej 30% → pokaż koszt dostawy wcześniej, włącz szybkie płatności (BLIK, Apple Pay), uprość kasę.", good: [0.45, 1], ok: [0.3, 0.45] },
      cr: { n: "Współczynnik konwersji", f: "zakupy ÷ kliknięcia w link", kid: "Na 100 osób, które przyszły z reklamy, ile kupiło. Dla zegarków 1% to przyzwoity wynik.", why: "Łączy wszystko: reklamę, stronę i kasę. Im wyżej, tym taniej kosztuje klient.", fix: "Niski → sprawdź lejek poniżej: ten krok, na którym odpada najwięcej, popraw najpierw.", good: [0.015, 1], ok: [0.007, 0.015] },
      hook: { n: "Zatrzymanie (3 s wideo)", f: "obejrzenia 3 s ÷ wyświetlenia", kid: "Na 100 osób, które przewijały, ile zatrzymało się na rolce na 3 sekundy.", why: "Pierwsze sekundy decydują, czy ktoś w ogóle zobaczy zegarek.", fix: "Poniżej 25% → mocniejszy początek: zegarek w ruchu, pytanie „Co mu kupić?”, napis od razu.", good: [0.3, 1], ok: [0.2, 0.3] },
      match: { n: "Zgodność Meta ↔ sklep", f: "zakupy według Meta ÷ zamówienia z UTM w sklepie", kid: "Facebook mówi „sprzedałem 10”, a sklep widzi 8. Sprawdzamy, czy te liczby się zgadzają.", why: "Duża różnica znaczy, że Pixel albo linki UTM nie działają i decyzje byłyby na złych danych.", fix: "Różnica ponad 30% → sprawdź Pixel NHP w Shopify i czy każda reklama ma link z UTM." }
    };

    // ocena: zwraca "good" | "ok" | "bad" | "none"
    function grade(key, v, ctx) {
      const d = M[key];
      if (!isFinite(v)) return "none";
      if (key === "freq" && ctx && ctx.retarget) return v <= 4 ? "good" : v <= 6 ? "ok" : "bad";
      if (d && d.good) {
        if (d.low) return v <= d.good[1] ? "good" : v <= d.ok[1] ? "ok" : "bad";
        return v >= d.good[0] ? "good" : v >= d.ok[0] ? "ok" : "bad";
      }
      return "none";
    }
    const GL = { good: "Dobrze", ok: "Średnio", bad: "Źle", none: "Brak danych" };
    const tag = (g, txt) => `<span class="pr-tag ${g}">${esc(txt || GL[g])}</span>`;

    /* ---------- dane ---------- */
    function snapshot() {
      if (U.demo) return demoSnapshot();
      return CRM.S.adlive.main || null;
    }
    function range() {
      const t = today();
      if (U.period === "1") return [t, t];
      if (U.period === "yday") { const y = addDays(t, -1); return [y, y]; }
      if (U.period === "start") {
        const snap = snapshot();
        const first = snap && (snap.rows || []).find((r) => r.sp > 0);
        let st = U.demo ? (first ? first.d : t) : (cfg().start || "2000-01-01");
        if (first && first.d < st) st = first.d; // reklamy ruszyły wcześniej niż w planie
        return [st > t ? addDays(t, -29) : st, t];
      }
      return [addDays(t, -(Number(U.period) - 1)), t];
    }
    const PAID = { meta: ["meta"], google: ["google"], all: ["meta", "google", "tiktok"] };

    function aggregate(snap, { k, from, to, pf }) {
      const rows = (snap?.rows || []).filter((r) => r.d >= from && r.d <= to && (pf === "all" || r.p === pf) && (!k || (k === "-" ? !r.k : r.k === k)));
      const s = { sp: 0, im: 0, re: 0, cl: 0, lc: 0, v3: 0, th: 0, lpv: 0, vc: 0, atc: 0, ic: 0, pu: 0, pv: 0, days: new Set(), metaIm: 0 };
      for (const r of rows) { for (const f of ["sp", "im", "re", "cl", "lc", "v3", "th", "lpv", "vc", "atc", "ic", "pu", "pv"]) s[f] += Number(r[f]) || 0; if (r.p === "meta") s.metaIm += Number(r.im) || 0; if (r.sp > 0) s.days.add(r.d); }
      const chans = PAID[pf] || PAID.all;
      const ords = (snap?.orders || []).filter((o) => !o.x && o.d >= from && o.d <= to && chans.includes(o.ch) && (!k || (k === "-" ? !o.k : o.k === k)));
      const c = cfg();
      const margin = Math.max(0.01, (Number(c.margin) || 30) / 100), fee = (Number(c.fee) || 0) / 100;
      let rev = 0, gross = 0;
      for (const o of ords) {
        const net = (Number(o.t) || 0);
        rev += net;
        const goods = net - (Number(o.sh) || 0); // wysyłka przechodzi do kuriera
        const cost = o.c != null ? Number(o.c) : goods * (1 - margin);
        gross += goods - cost - net * fee;
      }
      const shop = { orders: ords.length, rev, gross };
      const x = {
        ...s, days: s.days.size, shop,
        cpm: div(s.sp, s.im) * 1000, ctr: div(s.lc, s.im), cpc: div(s.sp, s.lc), freq: div(s.im, s.re),
        lpvr: s.lpv ? div(s.lpv, s.lc) : NaN, atcr: div(s.atc, s.lpv || s.vc), cpatc: div(s.sp, s.atc), chkr: div(s.pu, s.ic),
        hook: s.v3 && s.metaIm ? div(s.v3, s.metaIm) : NaN,
        orders: shop.orders || s.pu, revenue: shop.orders ? shop.rev : s.pv, src: shop.orders ? "sklep" : (s.pu ? "Meta" : "")
      };
      x.cr = div(x.orders, s.lc);
      x.roas = div(x.revenue, s.sp);
      x.cpa = div(s.sp, x.orders);
      x.aov = div(x.revenue, x.orders);
      x.profit = (shop.orders ? shop.gross : x.revenue * margin * (1 - fee)) - s.sp;
      x.be = 1 / margin;
      x.maxCpa = isFinite(x.aov) ? x.aov * margin : NaN;
      x.match = shop.orders || s.pu ? div(s.pu, shop.orders) : NaN;
      x.learning = s.im < 1500 || s.sp < 60;
      return x;
    }
    function gradeRoas(x) { if (!isFinite(x.roas)) return x.sp > 0 ? (x.learning ? "none" : "bad") : "none"; return x.roas >= x.be * 1.4 ? "good" : x.roas >= x.be ? "ok" : "bad"; }
    function gradeProfit(x) { if (!x.sp) return "none"; if (x.learning && x.profit < 0) return "none"; return x.profit > 0 ? "good" : x.profit > -0.15 * x.sp ? "ok" : "bad"; }
    function gradeCpa(x, aovTarget) { const max = (isFinite(x.aov) ? x.aov : aovTarget) * (Number(cfg().margin) || 30) / 100; if (!isFinite(x.cpa)) return x.sp > 0 && !x.learning ? "bad" : "none"; return x.cpa <= max * 0.6 ? "good" : x.cpa <= max ? "ok" : "bad"; }
    function gradeMatch(v) { if (!isFinite(v)) return "none"; return Math.abs(1 - v) <= 0.15 ? "good" : Math.abs(1 - v) <= 0.3 ? "ok" : "bad"; }

    /* ---------- rekomendacje ---------- */
    function recsFor(x, label, plan) {
      const out = [];
      const L = label ? `${label}: ` : "";
      if (!x.sp) return out;
      if (x.learning) { out.push(["⏳", "none", `${L}faza nauki — jeszcze nie oceniaj`, `Wydano ${zl(x.sp)} i ${int(x.im)} wyświetleń. Meta potrzebuje ok. 3–5 dni i ~50 zdarzeń, żeby się nauczyć. Nie zmieniaj teraz budżetu ani grupy.`]); return out; }
      if (gradeRoas(x) === "good" && x.orders >= 3) out.push(["🚀", "good", `${L}zarabia — zwiększ budżet o 20%`, `ROAS ${xx(x.roas)} przy progu ${xx(x.be)}. Zwiększaj o 20% co 2–3 dni (większe skoki resetują naukę Meta).`]);
      if (gradeRoas(x) === "bad" && x.sp > 3 * (isFinite(x.maxCpa) ? x.maxCpa : (plan ? plan.aov * 0.3 : 150))) out.push(["🛑", "bad", `${L}traci pieniądze — wyłącz albo zmień`, `Wydano ${zl(x.sp)}, ROAS ${xx(x.roas)} (próg ${xx(x.be)}). Najpierw popraw najsłabszy krok lejka; jeśli po 2 dniach dalej źle — wyłącz i przenieś budżet.`]);
      const cpaCap = plan ? plan.aov * (Number(cfg().margin) || 30) / 100 : 150;
      if (!x.orders && x.sp > cpaCap) out.push(["🛑", "bad", `${L}wydano ${zl(x.sp)} i ani jednego zamówienia`, `Tyle mniej więcej wolno wydać na 1 zamówienie (${zl(cpaCap)}), a sprzedaży nie ma. Sprawdź lejek poniżej; jeśli koszyki są, a zakupów brak — problem w kasie. Jeśli po 2 dniach nadal 0 — zmniejsz budżet o połowę albo wyłącz.`]);
      else if (!x.orders && x.sp > cpaCap * 0.5) out.push(["⚠️", "ok", `${L}jeszcze bez sprzedaży (${zl(x.sp)} wydane)`, "Przy droższych zegarkach pierwsze zamówienie może potrwać. Pilnuj kosztu dodania do koszyka."]);
      if (grade("ctr", x.ctr) === "bad" && x.im > 2000) out.push(["🎬", "bad", `${L}reklama nie zaciekawia (CTR ${pct(x.ctr, 2)})`, M.ctr.fix]);
      if (isFinite(x.hook) && grade("hook", x.hook) === "bad" && x.im > 2000) out.push(["👀", "bad", `${L}ludzie przewijają rolkę (zatrzymanie ${pct(x.hook)})`, M.hook.fix]);
      if (grade("cpm", x.cpm) === "bad") out.push(["💸", "ok", `${L}drogie wyświetlenia (CPM ${zl2(x.cpm)})`, M.cpm.fix]);
      if (grade("lpvr", x.lpvr) === "bad" && x.lc > 30) out.push(["🐢", "bad", `${L}klikają, ale strona się nie ładuje (${pct(x.lpvr, 0)})`, M.lpvr.fix]);
      if (grade("atcr", x.atcr) === "bad" && (x.lpv || x.vc) > 80) out.push(["🛒", "bad", `${L}oglądają, ale nie dodają do koszyka (${pct(x.atcr)})`, M.atcr.fix]);
      if (grade("chkr", x.chkr) === "bad" && x.ic >= 5) out.push(["💳", "bad", `${L}gubią się w kasie (${pct(x.chkr, 0)} płaci)`, M.chkr.fix]);
      if (grade("freq", x.freq, plan) === "bad") out.push(["🔁", "ok", `${L}te same osoby widzą reklamę za często (${xx(x.freq).replace("×", "")})`, M.freq.fix]);
      if (gradeMatch(x.match) === "bad" && (x.pu + x.shop.orders) >= 5) out.push(["🔍", "ok", `${L}Meta i sklep liczą inaczej`, `Meta: ${int(x.pu)} zakupów, sklep (UTM): ${int(x.shop.orders)}. ${M.match.fix}`]);
      return out;
    }
    function allRecs(snap, from, to) {
      const out = [];
      const st = snap?.sources || {};
      if (!U.demo) {
        if (!st.meta || !st.meta.configured) out.push(["🔌", "bad", "Podłącz Meta Ads, żeby wyniki wpadały same", "Jednorazowo: token dostępu z portfolio Nowoczesny Handel Polski (instrukcja na dole strony, sekcja „Podłączenie źródeł”).", "setup"]);
        else if (st.meta.ok === false) out.push(["⚠️", "bad", "Meta nie oddała danych", st.meta.error || "Sprawdź token.", "setup"]);
        if (!st.shopify || !st.shopify.configured) out.push(["🛍️", "ok", "Podłącz zamówienia Shopify (Zeggo)", "Bez tego panel ufa liczbom z Facebooka — sklep jest dokładniejszy.", "setup"]);
        else if (st.shopify.ok === false) out.push(["⚠️", "bad", "Shopify nie oddał zamówień", st.shopify.error || "", "setup"]);
        if (!st.google || !st.google.configured) out.push(["🅖", "none", "Google Ads jeszcze niepodpięte", "Konto Google Ads nie jest połączone. Gdy powstanie — wpisz klucze (instrukcja niżej), a kampanie Google pojawią się obok Meta.", "setup"]);
      }
      const t = today();
      for (const [k, p] of Object.entries(PLAN)) {
        const x = aggregate(snap, { k, from, to, pf: U.pf });
        out.push(...recsFor(x, k.toUpperCase() + " " + p.name, p));
        const y = aggregate(snap, { k, from: addDays(t, -1), to: addDays(t, -1), pf: "all" });
        const bmax = p.lateFrom && t >= p.lateFrom ? p.bmaxLate : p.bmax;
        if (y.sp > bmax * 1.25) out.push(["📈", "ok", `${k.toUpperCase()}: wczoraj wydano ${zl(y.sp)} — więcej niż plan (${p.bmin}–${bmax} zł/dzień)`, "Sprawdź budżet dzienny w Menedżerze reklam."]);
      }
      if (t >= "2026-12-06" && t <= "2026-12-17") {
        const k4 = (snap?.campaigns || []).find((c) => c.k === "k4");
        if (t >= PLAN.k4.lateFrom && k4 && k4.bd && k4.bd < PLAN.k4.bmaxLate * 0.8) out.push(["🎄", "ok", `K4 remarketing: od 8.12 plan zakłada budżet do ${PLAN.k4.bmaxLate} zł/dzień`, `Teraz ustawione ${zl(k4.bd)}/dzień. Remarketing to zwykle najtańsza sprzedaż przed świętami.`]);
      }
      if (t > (cfg().lastShip || "2026-12-17") && t < "2026-12-25") out.push(["📦", "ok", "Po terminie wysyłki przed świętami", "Zmień teksty reklam z „zdąży przed świętami” na „bon/prezent po świętach” albo zmniejsz budżety K1 i K4."]);
      const rank = { bad: 0, ok: 1, good: 2, none: 3 };
      return out.sort((a, b) => rank[a[1]] - rank[b[1]]);
    }

    /* ---------- widok ---------- */
    const top = (title, sub, actions) => `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions || ""}</div></div>`;
    const ago = (iso) => { if (!iso) return "nigdy"; const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4); return m < 1 ? "przed chwilą" : m < 60 ? `${m} min temu` : m < 1440 ? `${Math.round(m / 60)} godz. temu` : new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };

    function vMeasure() {
      const snap = snapshot();
      const [from, to] = range();
      const st = (snap && snap.sources) || {};
      const actions = `<button class="btn" type="button" data-pr="demo">${U.demo ? "Pokaż prawdziwe dane" : "Zobacz na przykładowych danych"}</button><button class="btn primary" type="button" data-pr="sync" ${U.syncing ? "disabled" : ""}>${U.syncing ? '<span class="pr-spin">↻</span> Pobieram…' : "↻ Odśwież teraz"}</button>`;
      const head = top("Pomiar reklam · Zeggo", "Meta Ads i Google Ads liczone automatycznie. Kliknij dowolną liczbę — wyjaśnimy ją prosto i powiemy, co zrobić.", actions);
      const dot = (name, s, offTxt) => { const cls = !s || !s.configured ? "off" : s.ok === false ? "err" : "ok"; const txt = cls === "off" ? offTxt : cls === "err" ? "błąd" : "połączone"; return `<span class="pr-dot ${cls}" title="${esc(s && s.error || "")}"><i></i>${name}: ${txt}</span>`; };
      const srcBar = `<div class="card pr-src">${U.demo ? '<span class="pr-dot off"><i></i>Tryb przykładowy</span>' : dot("Meta Ads", st.meta, "niepodłączone") + dot("Google Ads", st.google, "niepodłączone") + dot("Sklep Shopify", st.shopify, "niepodłączony")}<span class="sp"></span><small style="color:var(--muted)">Ostatnie pobranie: <b>${esc(ago(snap && snap.syncedAt))}</b> · odświeża się samo co 15 min${U.err ? ` · <span style="color:var(--bad)">${esc(U.err)}</span>` : ""}</small></div>`;
      const demoBar = U.demo ? `<div class="pr-demo">🧪 <b>To przykładowe liczby</b>, żeby było widać, jak panel ocenia kampanie. Prawdziwe wyniki pojawią się po starcie reklam i podłączeniu Meta. <button class="btn" type="button" data-pr="demo" style="margin-left:8px">Wróć do prawdziwych</button></div>` : "";
      const bar = `<div class="pr-bar"><select class="pr-sel" data-prin="period" aria-label="Okres">${PERIODS.map(([k, l]) => `<option value="${k}" ${U.period === k ? "selected" : ""}>${l}</option>`).join("")}</select><div class="chips">${PLATF.map(([k, l]) => `<button type="button" class="chip" data-pr="pf" data-v="${k}" aria-pressed="${U.pf === k}">${esc(l)}</button>`).join("")}</div><small style="color:var(--muted)">${esc(fmtD(from))} – ${esc(fmtD(to))}</small></div>`;

      if (!snap || (!(snap.rows || []).length && !(snap.orders || []).length)) {
        return head + srcBar + `<div class="card pr-sec"><div class="empty"><b>Jeszcze nie ma wyników reklam</b>Reklamy Zeggo ruszą po dodaniu karty w koncie reklamowym „NHP reklamy”. Gdy tylko Meta pokaże pierwsze wyświetlenia, liczby pojawią się tu same.<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" type="button" data-pr="demo">Zobacz, jak to będzie wyglądać</button><button class="btn" type="button" data-pr="sync">↻ Sprawdź teraz</button></div></div></div>` + recsHtml(allRecs(snap, from, to)) + planHtml() + glossaryHtml() + settingsHtml() + setupHtml(st);
      }

      const x = aggregate(snap, { from, to, pf: U.pf });
      const kpi = (key, val, g, sub) => `<button type="button" class="card pr-kpi ${g}" data-pr="explain" data-m="${key}"><span class="q">?</span><span>${esc(M[key].n)}</span><strong>${val}</strong><small>${sub || ""}</small>${g !== "none" || /—/.test(val) ? tag(g) : ""}</button>`;
      const kpis = `<div class="pr-kpis">
        ${kpi("spend", zl(x.sp), "none", `${x.days} dni z wydatkami · plan ${planBudget(from, to)}`)}
        ${kpi("revenue", zl(x.revenue), x.revenue > 0 ? "good" : "none", x.src === "sklep" ? "liczone przez sklep (UTM)" : x.src === "Meta" ? "według Meta (sklep jeszcze nie widzi)" : "brak sprzedaży w okresie")}
        ${kpi("roas", xx(x.roas), gradeRoas(x), `próg opłacalności ${xx(x.be)} przy marży ${cfg().margin}%`)}
        ${kpi("profit", `<span style="color:${x.profit >= 0 ? "var(--good)" : "var(--bad)"}">${zl(x.profit)}</span>`, gradeProfit(x), "po koszcie zegarka, prowizji i reklamie")}
        ${kpi("orders", int(x.orders), x.orders ? "good" : x.learning ? "none" : "bad", `Meta widzi ${int(x.pu)} · sklep ${int(x.shop.orders)}`)}
        ${kpi("cpa", zl2(x.cpa), gradeCpa(x, 600), isFinite(x.maxCpa) ? `max opłacalny ${zl2(x.maxCpa)}` : "ile kosztuje 1 zamówienie")}
        ${kpi("aov", zl2(x.aov), isFinite(x.aov) ? "none" : "none", "średnia wartość zamówienia")}
        ${kpi("ctr", pct(x.ctr, 2), grade("ctr", x.ctr), `${int(x.lc)} kliknięć z ${int(x.im)} wyświetleń · cel ≥ 1%`)}
      </div>`;
      return head + demoBar + srcBar + bar + recsHtml(allRecs(snap, from, to)) + kpis + funnelHtml(x) + chartHtml(snap, from, to) + compareHtml(snap, from, to) + allMetricsHtml(x) + glossaryHtml() + settingsHtml() + setupHtml(st);
    }

    function planBudget(from, to) {
      const days = Math.max(1, Math.round((new Date(to + "T12:00:00") - new Date(from + "T12:00:00")) / 864e5) + 1);
      let lo = 0, hi = 0;
      for (const p of Object.values(PLAN)) { lo += p.bmin; hi += p.bmax; }
      return `${int(lo * days)}–${int(hi * days)} zł`;
    }

    function recsHtml(recs) {
      if (!recs.length) return `<div class="card pr-sec"><h2>Co teraz zrobić</h2><div class="pr-do good"><span class="ic">✅</span><div class="tx"><b>Wszystko w normie</b><small>Nic nie wymaga reakcji. Zajrzyj jutro.</small></div></div></div>`;
      return `<div class="card pr-sec"><h2>Co teraz zrobić</h2><p class="sub">Najważniejsze na górze. Panel sprawdza to sam po każdym odświeżeniu.</p>${recs.slice(0, 8).map(([ic, g, t, s, act]) => `<div class="pr-do ${g}"><span class="ic">${ic}</span><div class="tx"><b>${esc(t)}</b><small>${esc(s)}</small></div>${act ? `<button class="btn" type="button" data-pr="${act}">Pokaż jak</button>` : ""}</div>`).join("")}${recs.length > 8 ? `<p class="sub" style="padding-top:8px">…i ${recs.length - 8} mniej pilnych.</p>` : ""}</div>`;
    }

    function funnelHtml(x) {
      const steps = [
        ["Wyświetlenia", "ludzie zobaczyli reklamę", x.im, null, null],
        ["Kliknięcia w link", "weszli zobaczyć zegarek", x.lc, x.ctr, "ctr"],
        ["Strona się załadowała", "doczekali do strony", x.lpv, x.lpvr, "lpvr"],
        ["Dodali do koszyka", "chcą kupić", x.atc, x.atcr, "atcr"],
        ["Przeszli do kasy", "zaczęli płacić", x.ic, div(x.ic, x.atc), null],
        ["Kupili", "zapłacili", Math.max(x.pu, x.shop.orders), x.chkr, "chkr"]
      ];
      const maxLog = Math.log10(Math.max(10, x.im));
      let worst = -1, worstScore = 1;
      steps.forEach((s, i) => { if (s[4]) { const g = grade(s[4], s[3]); const score = g === "bad" ? 0 : g === "ok" ? 0.5 : 1; if (score < worstScore && isFinite(s[3])) { worstScore = score; worst = i; } } });
      const rows = steps.map(([lb, sm, n, r, key], i) => {
        const w = n > 0 ? Math.max(6, (Math.log10(n + 1) / maxLog) * 100) : 0;
        const g = key ? grade(key, r) : "none";
        return `<div class="pr-fs ${i === worst && worstScore < 1 ? "leak" : ""}"><div class="lb">${esc(lb)}<small>${esc(sm)}</small></div><div class="tr"><div class="fl" style="width:${w}%">${int(n)}</div></div><div class="rt">${i ? `${pct(r)} z poprzedniego` : ""}${key ? "<br>" + tag(g) : ""}</div></div>`;
      }).join("");
      const leak = worst >= 0 && worstScore < 1 ? `<div class="pr-do bad" style="border-top:0"><span class="ic">🕳️</span><div class="tx"><b>Najwięcej ucieka na kroku: ${esc(steps[worst][0])}</b><small>${esc(M[steps[worst][4]].fix)}</small></div></div>` : "";
      return `<div class="card pr-sec"><h2>Lejek — gdzie ludzie odpadają</h2><p class="sub">Jak zjeżdżalnia: na górze dużo osób, na dole ci, którzy kupili. Szukamy miejsca, gdzie spada najwięcej. Kroki strony i koszyka mierzy Pixel Meta${U.pf === "google" ? " (dla Google widać tylko kliknięcia i zakupy)" : ""}.</p><div class="pr-fun">${rows}</div>${leak}</div>`;
    }

    function chartHtml(snap, from, to) {
      const days = [];
      for (let d = from; d <= to && days.length < 120; d = addDays(d, 1)) days.push(d);
      if (days.length < 2) return "";
      const data = days.map((d) => { const x = aggregate(snap, { from: d, to: d, pf: U.pf }); return { d, sp: x.sp, rev: x.revenue, roas: x.roas }; });
      const W = 760, H = 220, P = 34, bw = (W - P * 2) / days.length;
      const max = Math.max(50, ...data.map((r) => Math.max(r.sp, r.rev)));
      const y = (v) => H - 26 - (v / max) * (H - 46);
      const bars = data.map((r, i) => `<rect x="${P + i * bw + bw * 0.18}" y="${y(r.sp)}" width="${bw * 0.64}" height="${H - 26 - y(r.sp)}" rx="3" fill="var(--sky)"><title>${fmtD(r.d)}: wydane ${zl(r.sp)}, sprzedaż ${zl(r.rev)}</title></rect>`).join("");
      const line = data.map((r, i) => `${i ? "L" : "M"}${(P + i * bw + bw / 2).toFixed(1)},${y(r.rev).toFixed(1)}`).join(" ");
      const dots = data.map((r, i) => r.rev > 0 ? `<circle cx="${P + i * bw + bw / 2}" cy="${y(r.rev)}" r="3.5" fill="var(--good)"><title>${fmtD(r.d)}: sprzedaż ${zl(r.rev)}</title></circle>` : "").join("");
      const step = Math.ceil(days.length / 10);
      const labels = data.map((r, i) => i % step === 0 ? `<text x="${P + i * bw + bw / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="var(--muted)">${fmtD(r.d)}</text>` : "").join("");
      const grid = [0, 0.5, 1].map((f) => `<line x1="${P}" x2="${W - P}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--line)"/><text x="${P - 4}" y="${y(max * f) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${Math.round(max * f)}</text>`).join("");
      return `<div class="card pr-sec"><h2>Dzień po dniu</h2><p class="sub">Słupki = ile wydaliśmy. Zielona linia = ile sprzedaliśmy. Dobrze, gdy linia jest wysoko nad słupkami.</p><div class="pr-leg"><span><i style="background:var(--sky)"></i>Wydane</span><span><i style="background:var(--good)"></i>Sprzedaż z reklam</span></div><div class="pr-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wydatki i sprzedaż dzień po dniu">${grid}${bars}<path d="${line}" fill="none" stroke="var(--good)" stroke-width="2.5"/>${dots}${labels}</svg></div></div>`;
    }

    function compareHtml(snap, from, to) {
      const t = today();
      const rows = Object.entries(PLAN).map(([k, p]) => {
        const x = aggregate(snap, { k, from, to, pf: U.pf });
        const camp = (snap.campaigns || []).filter((c) => c.k === k);
        const live = camp.some((c) => c.st === "active");
        const bmax = p.lateFrom && t >= p.lateFrom ? p.bmaxLate : p.bmax;
        const perDay = x.days ? x.sp / x.days : 0;
        const rec = recsFor(x, "", p)[0];
        const gR = gradeRoas(x);
        return `<tr class="pr-row" data-pr="camp" data-k="${k}"><td><span class="pr-k ${k}">${k.toUpperCase()}</span><b>${esc(p.name)}</b><br><small style="color:var(--muted)">${esc(p.goal)} · ${camp.length ? (live ? "🟢 aktywna" : "⏸ " + esc(camp[0].st || "wstrzymana")) : "brak w Meta (nazwa bez „K" + k[1] + "”?)"}</small></td>
          <td>${p.bmin}–${bmax} zł<br><small style="color:var(--muted)">${perDay ? "teraz " + zl(perDay) : ""}</small></td>
          <td><b>${zl(x.sp)}</b></td><td class="${grade("ctr", x.ctr)}">${pct(x.ctr, 2)}</td><td class="${grade("cpc", x.cpc)}">${zl2(x.cpc)}</td><td>${zl2(x.cpatc)}</td>
          <td>${int(x.orders)}</td><td class="${gradeCpa(x, p.aov)}">${zl2(x.cpa)}</td><td class="${gR}">${xx(x.roas)}</td><td class="${gradeProfit(x)}">${x.sp ? zl(x.profit) : "—"}</td>
          <td style="text-align:left;white-space:normal;min-width:180px">${rec ? `${rec[0]} ${esc(rec[2])}` : x.sp ? "✅ w normie" : "—"}</td></tr>`;
      });
      const other = aggregate(snap, { k: "-", from, to, pf: U.pf });
      const otherRow = other.sp ? `<tr><td><span class="pr-k">?</span><b>Inne kampanie</b><br><small style="color:var(--muted)">nazwa bez K1–K4 — dodaj „K1”…„K4” do nazwy w Meta</small></td><td>—</td><td><b>${zl(other.sp)}</b></td><td>${pct(other.ctr, 2)}</td><td>${zl2(other.cpc)}</td><td>${zl2(other.cpatc)}</td><td>${int(other.orders)}</td><td>${zl2(other.cpa)}</td><td>${xx(other.roas)}</td><td>${zl(other.profit)}</td><td></td></tr>` : "";
      return `<div class="card pr-sec"><h2>Porównanie kampanii K1–K4 z planu</h2><p class="sub">Kampanie rozpoznajemy po „K1”…„K4” w nazwie w Menedżerze reklam albo po utm_campaign (k1_prezent500, k2_nadgarstek, k3_automaty, k4_remarketing). Kliknij wiersz, żeby zobaczyć wszystkie liczby kampanii.</p><div class="pr-tbl"><table><thead><tr><th>Kampania</th><th>Budżet / dzień</th><th>Wydane</th><th>CTR</th><th>CPC</th><th>Koszt koszyka</th><th>Zamów.</th><th>CPA</th><th>ROAS</th><th>Zysk</th><th>Co zrobić</th></tr></thead><tbody>${rows.join("")}${otherRow}</tbody></table></div></div>`;
    }

    function metricCards(x, ctx) {
      const items = [
        ["spend", zl(x.sp), "none"], ["revenue", zl(x.revenue), "none"], ["roas", xx(x.roas), gradeRoas(x)], ["be", xx(x.be), "none"],
        ["profit", zl(x.profit), gradeProfit(x)], ["orders", int(x.orders), "none"], ["cpa", zl2(x.cpa), gradeCpa(x, ctx ? ctx.aov : 600)], ["aov", zl2(x.aov), "none"],
        ["impr", int(x.im), "none"], ["reach", int(x.re), "none"], ["freq", isFinite(x.freq) ? x.freq.toFixed(2).replace(".", ",") : "—", grade("freq", x.freq, ctx)], ["cpm", zl2(x.cpm), grade("cpm", x.cpm)],
        ["ctr", pct(x.ctr, 2), grade("ctr", x.ctr)], ["cpc", zl2(x.cpc), grade("cpc", x.cpc)], ["hook", pct(x.hook), grade("hook", x.hook)], ["lpvr", pct(x.lpvr), grade("lpvr", x.lpvr)],
        ["atcr", pct(x.atcr), grade("atcr", x.atcr)], ["cpatc", zl2(x.cpatc), "none"], ["chkr", pct(x.chkr), grade("chkr", x.chkr)], ["cr", pct(x.cr, 2), grade("cr", x.cr)],
        ["match", isFinite(x.match) ? pct(x.match, 0) : "—", gradeMatch(x.match)]
      ];
      return `<div class="pr-all">${items.map(([k, v, g]) => `<button type="button" class="pr-m ${g}" data-pr="explain" data-m="${k}"><span>${esc(M[k].n)}</span><strong>${v}</strong><small>${esc(M[k].f)}</small>${g !== "none" || v === "—" ? tag(g) : ""}</button>`).join("")}</div>`;
    }
    function allMetricsHtml(x) {
      return `<div class="card pr-sec"><h2>Wszystkie wskaźniki</h2><p class="sub">Kolor paska = ocena. Kliknij kafelek: co to znaczy, jak liczymy i co zrobić.</p>${metricCards(x)}</div>`;
    }

    function explainHtml(key, val) {
      const d = M[key];
      const rng = d.good ? (d.low
        ? `${tag("good", "Dobrze: do " + fmtT(key, d.good[1]))}${tag("ok", "Średnio: do " + fmtT(key, d.ok[1]))}${tag("bad", "Źle: powyżej " + fmtT(key, d.ok[1]))}`
        : `${tag("good", "Dobrze: od " + fmtT(key, d.good[0]))}${tag("ok", "Średnio: od " + fmtT(key, d.ok[0]))}${tag("bad", "Źle: poniżej " + fmtT(key, d.ok[0]))}`) : "";
      return `<div class="pr-ex"><p class="kid">🧒 <b>Jak dla 5-latka:</b> ${esc(d.kid)}</p><p><b>Jak liczymy:</b> <code>${esc(d.f)}</code></p><p><b>Po co to:</b> ${esc(d.why)}</p>${rng ? `<div class="rng">${rng}</div>` : ""}<p><b>Co zrobić, gdy źle:</b> ${esc(d.fix)}</p>${val ? `<p><b>Teraz:</b> ${val}</p>` : ""}</div>`;
    }
    function fmtT(key, v) { return ["ctr", "lpvr", "atcr", "chkr", "cr", "hook"].includes(key) ? pct(v, v < 0.01 ? 1 : 0) : key === "freq" ? String(v).replace(".", ",") : zl2(v); }

    function glossaryHtml() {
      return `<div class="card pr-sec pr-gl"><h2>Słowniczek — każda liczba po ludzku</h2><p class="sub">Rozwiń dowolny wskaźnik.</p>${Object.entries(M).map(([k, d]) => `<details><summary>${esc(d.n)} <small>· ${esc(d.f)}</small></summary>${explainHtml(k)}</details>`).join("")}
        <details><summary>Jak panel to liczy (proces) <small>· skąd są dane</small></summary><div class="pr-ex">
          <p>1. Co 15 minut (gdy panel jest otwarty) i co godzinę automatycznie serwer pyta <b>Meta Ads</b> i <b>Google Ads</b> o wyniki każdej kampanii z każdego dnia: wydatki, wyświetlenia, kliknięcia, koszyki, zakupy.</p>
          <p>2. Równocześnie pyta <b>sklep Shopify</b> o zamówienia i sprawdza, z jakiego linku przyszedł klient (UTM: utm_source=meta, utm_medium=paid, utm_campaign=k1_prezent500…). To „prawda sklepu”.</p>
          <p>3. Panel dopasowuje zamówienia do kampanii K1–K4, odejmuje koszt zegarka (z Shopify albo z marży w ustawieniach), prowizję płatności i koszt reklamy — wychodzi <b>zysk po reklamie</b>.</p>
          <p>4. Każda liczba jest porównywana z progami dla sklepów z zegarkami i z planem kampanii. Z tego powstaje lista „Co teraz zrobić”.</p>
          <p>5. Pierwsze 3–5 dni kampanii to <b>faza nauki</b> — panel wtedy nie wydaje wyroków, bo liczby skaczą.</p></div></details></div>`;
    }

    function planHtml() {
      return `<div class="card pr-sec"><h2>Plan: 4 kampanie Zeggo</h2><div class="pr-tbl"><table><thead><tr><th>Kampania</th><th>Kanał</th><th>Budżet / dzień</th><th>utm_campaign</th></tr></thead><tbody>${Object.entries(PLAN).map(([k, p]) => `<tr><td><span class="pr-k ${k}">${k.toUpperCase()}</span><b>${esc(p.name)}</b><br><small style="color:var(--muted)">${esc(p.goal)}</small></td><td>${esc(p.ch)}</td><td>${p.bmin}–${p.bmax} zł${p.bmaxLate ? `<br><small>od 8.12 do ${p.bmaxLate} zł</small>` : ""}</td><td><code>${esc(p.utm)}</code></td></tr>`).join("")}</tbody></table></div></div>`;
    }

    function settingsHtml() {
      const c = cfg();
      return `<div class="card pr-sec"><h2>Ustawienia liczenia</h2><p class="sub">Marża = ile z ceny zegarka zostaje nam po zapłaceniu dostawcy (średnio). Gdy Shopify ma wpisany koszt produktu, panel używa go zamiast marży.</p>
        <form id="prCfg" class="pr-form" novalidate>
          <div><label for="pr-mg">Średnia marża (%)</label><input id="pr-mg" name="margin" type="number" min="1" max="95" step="1" value="${esc(c.margin)}"></div>
          <div><label for="pr-fee">Prowizja płatności (%)</label><input id="pr-fee" name="fee" type="number" min="0" max="10" step="0.1" value="${esc(c.fee)}"></div>
          <div><label for="pr-st">Start kampanii</label><input id="pr-st" name="start" type="date" value="${esc(c.start)}"></div>
          <div><label for="pr-ls">Ostatni dzień wysyłki przed świętami</label><input id="pr-ls" name="lastShip" type="date" value="${esc(c.lastShip)}"></div>
          <div style="grid-column:1/-1"><button class="btn primary" type="submit">Zapisz</button></div>
        </form></div>`;
    }

    function setupHtml(st) {
      const ok = (s) => (s && s.configured ? (s.ok === false ? " ⚠️" : " ✅") : "");
      return `<div class="card pr-sec pr-steps" id="prSetup"><h2>Podłączenie źródeł danych</h2><p class="sub">Robisz to raz. Klucze wpisujesz tylko w Cloudflare — nikt ich nie zobaczy w panelu.</p>
        <details ${st && st.meta && st.meta.configured ? "" : "open"}><summary>1. Meta Ads — konto „NHP reklamy”${ok(st && st.meta)}</summary><ol>
          <li>Wejdź na <b>business.facebook.com</b> → portfolio <b>Nowoczesny Handel Polski</b> → Ustawienia firmy → <b>Użytkownicy → Użytkownicy systemowi</b> → Dodaj → nazwa „Panel NHP”, rola <b>Pracownik</b>.</li>
          <li>Kliknij <b>Przypisz zasoby</b> → Konta reklamowe → <b>NHP reklamy</b> → zaznacz tylko <b>„Wyświetlaj wyniki”</b> (odczyt) → Zapisz.</li>
          <li>Jeśli nie masz aplikacji: <b>developers.facebook.com → Moje aplikacje → Utwórz</b> → typ „Firma”, portfolio NHP. Potem w Ustawieniach firmy → Aplikacje → dodaj ją do portfolio.</li>
          <li>Wróć do użytkownika systemowego → <b>Wygeneruj nowy token</b> → wybierz aplikację → ważność <b>„Nigdy”</b> → uprawnienia: <b>ads_read</b> i <b>read_insights</b> → Wygeneruj → skopiuj.</li>
          <li><b>dash.cloudflare.com</b> → Workers i Pages → <b>centrala-crm</b> → Ustawienia → Zmienne i sekrety → Dodaj (typ <b>Secret</b>, środowisko Production): <code>META_ACCESS_TOKEN</code> = skopiowany token. Opcjonalnie <code>META_AD_ACCOUNT_ID</code> = 972181888863838 (już jest domyślnie).</li>
          <li>Wdrożenia → ostatnie → <b>Ponów wdrożenie</b>. Potem tutaj kliknij „Odśwież teraz”.</li></ol></details>
        <details ${st && st.shopify && st.shopify.configured ? "" : ""}><summary>2. Sklep Shopify Zeggo — zamówienia${ok(st && st.shopify)}${st && st.shopify && st.shopify.domain ? ` <small>(${esc(st.shopify.domain)})</small>` : ""}</summary><ol>
          <li>Jeśli powyżej widać „połączony” i domenę <b>1k9i6i-9y.myshopify.com</b> — nic nie rób.</li>
          <li>Jeśli to inny sklep: Shopify Zeggo → Ustawienia → <b>Aplikacje → Opracuj aplikacje</b> → Utwórz „Panel NHP pomiar” → uprawnienia Admin API: <b>read_orders</b>, <b>read_products</b>, <b>read_inventory</b> → Zainstaluj → skopiuj token Admin API.</li>
          <li>W Cloudflare (jak wyżej) dodaj sekrety <code>ADS_SHOPIFY_STORE_DOMAIN</code> = 1k9i6i-9y.myshopify.com i <code>ADS_SHOPIFY_ADMIN_TOKEN</code> = token. Ponów wdrożenie.</li>
          <li>W każdej reklamie link musi mieć UTM z planu, np. <code>?utm_source=meta&amp;utm_medium=paid&amp;utm_campaign=k1_prezent500</code> — wtedy sklep wie, z której kampanii przyszło zamówienie.</li></ol></details>
        <details><summary>3. Google Ads — gdy powstanie konto${ok(st && st.google)}</summary><ol>
          <li>Załóż konto Google Ads dla NHP i konto menedżera (MCC). W MCC: Narzędzia → <b>Centrum API</b> → wniosek o <b>developer token</b> (Basic access; trwa kilka dni).</li>
          <li>console.cloud.google.com → nowy projekt „NHP panel” → włącz <b>Google Ads API</b> → Dane logowania → <b>Identyfikator klienta OAuth</b> (aplikacja internetowa).</li>
          <li>Wygeneruj refresh token (np. w OAuth Playground z własnym klientem, zakres <code>https://www.googleapis.com/auth/adwords</code>).</li>
          <li>W Cloudflare dodaj sekrety: <code>GOOGLE_ADS_DEVELOPER_TOKEN</code>, <code>GOOGLE_ADS_CLIENT_ID</code>, <code>GOOGLE_ADS_CLIENT_SECRET</code>, <code>GOOGLE_ADS_REFRESH_TOKEN</code>, <code>GOOGLE_ADS_CUSTOMER_ID</code> (10 cyfr konta reklamowego) i <code>GOOGLE_ADS_LOGIN_CUSTOMER_ID</code> (ID MCC). Ponów wdrożenie.</li>
          <li>Nazwij kampanie Google z „K1”…„K4” w nazwie — trafią do porównania obok Meta.</li></ol></details>
        <details><summary>4. Odświeżanie co godzinę, nawet gdy panel jest zamknięty</summary><div class="pr-ex"><p>Panel odświeża dane sam co 15 minut, gdy ktoś ma otwarty ten widok. Żeby dane były świeże zawsze, w Supabase działa zadanie <b>nhp-ads-sync</b> (pg_cron, co godzinę) — wymaga sekretu <code>NHP_SYNC_SECRET</code> w Cloudflare (ten sam co przy Shopify). Instrukcja SQL: <code>docs/pomiar-reklam.md</code>.</p></div></details>
      </div>`;
    }

    /* ---------- szczegóły kampanii i objaśnienia (okno) ---------- */
    function openCamp(k) {
      const snap = snapshot(); if (!snap) return;
      const [from, to] = range();
      const p = PLAN[k];
      const x = aggregate(snap, { k, from, to, pf: U.pf });
      const recs = recsFor(x, "", p);
      CRM.openModal(`<div class="modal-h"><h2 id="mTitle"><span class="pr-k ${k}">${k.toUpperCase()}</span>${esc(p.name)}</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div><div class="modal-b pr-wide"><div class="pr-mb"><p style="color:var(--muted);margin:0 0 10px">${esc(p.goal)} · ${esc(p.ch)} · budżet ${p.bmin}–${p.bmax} zł/dzień · ${esc(fmtD(from))} – ${esc(fmtD(to))}</p>
        ${recs.length ? recs.map(([ic, g, t, s]) => `<div class="pr-do ${g}" style="border-radius:12px;margin-bottom:6px"><span class="ic">${ic}</span><div class="tx"><b>${esc(t)}</b><small>${esc(s)}</small></div></div>`).join("") : x.sp ? `<div class="pr-do good"><span class="ic">✅</span><div class="tx"><b>Kampania w normie</b></div></div>` : `<div class="pr-do"><span class="ic">💤</span><div class="tx"><b>Brak wydatków w tym okresie</b><small>Sprawdź, czy kampania jest włączona i ma w nazwie „${k.toUpperCase()}”.</small></div></div>`}
        ${metricCards(x, p)}</div></div><div class="modal-f"><span></span><button class="btn" type="button" data-act="close">Zamknij</button></div>`);
    }
    function openExplain(key) {
      const d = M[key]; if (!d) return;
      CRM.openModal(`<div class="modal-h"><h2 id="mTitle">${esc(d.n)}</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div><div class="modal-b"><div class="pr-mb">${explainHtml(key)}</div></div><div class="modal-f"><span></span><button class="btn primary" type="button" data-act="close">Rozumiem</button></div>`);
    }

    /* ---------- pobieranie danych ---------- */
    async function token() {
      const sb = CRM.SB;
      if (!sb || !sb.auth) return "";
      let { data } = await sb.auth.getSession();
      let s = data && data.session;
      if (!s || !s.access_token || (s.expires_at && s.expires_at * 1000 < Date.now() + 60000)) {
        const r = await sb.auth.refreshSession();
        if (r && r.data && r.data.session) s = r.data.session;
      }
      return (s && s.access_token) || "";
    }
    async function sync(manual) {
      if (U.syncing) return;
      U.syncing = true; U.err = ""; if (manual) CRM.scheduleRender();
      try {
        const t = await token();
        if (!t) throw new Error("Sesja wygasła — zaloguj się ponownie.");
        const res = await fetch("/api/ads/sync", { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ days: 60 }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) throw new Error(body.error || `Błąd ${res.status}`);
        lsSet("pr-last", String(Date.now()));
        if (manual) {
          const bad = Object.entries(body.sources || {}).filter(([, s]) => s.configured && s.ok === false).map(([n]) => n);
          CRM.toast(bad.length ? `Pobrano, ale z błędem: ${bad.join(", ")}` : `Pobrano: ${body.rows} wierszy reklam, ${body.orders} zamówień`);
        }
      } catch (e) {
        U.err = String(e.message || e).slice(0, 140);
        if (manual) CRM.toast(U.err);
      } finally {
        U.syncing = false;
        CRM.scheduleRender();
      }
    }
    const STALE = 15 * 60 * 1000;
    function maybeSync() {
      if (U.demo || document.hidden) return;
      if ((location.hash || "").replace("#", "") !== "pomiar") return;
      const snap = CRM.S.adlive.main;
      const last = Math.max(snap && snap.syncedAt ? new Date(snap.syncedAt).getTime() : 0, Number(lsGet("pr-last", "0")) || 0);
      if (Date.now() - last > STALE) sync(false);
    }
    setInterval(maybeSync, 60 * 1000);
    window.addEventListener("hashchange", () => setTimeout(maybeSync, 300));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeSync(); });
    CRM.readyFns.push(() => { setTimeout(maybeSync, 1500); });

    CRM.badgeFns.push(() => {
      const snap = CRM.S.adlive.main;
      if (!snap || !(snap.rows || []).length) return { pomiar: 0 };
      const t = today();
      return { pomiar: allRecs(snap, addDays(t, -6), t).filter((r) => r[1] === "bad").length };
    });

    /* ---------- przykładowe dane (tryb demo) ---------- */
    let DEMO = null;
    function demoSnapshot() {
      if (DEMO) return DEMO;
      let seed = 7;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      const t = today(), start = addDays(t, -13);
      const prof = {
        k1: { b: 70, cpm: 16, ctr: 0.017, lpv: 0.8, atc: 0.07, ic: 0.5, pu: 0.55, aov: 420, v3: 0.33, re: 0.75 },
        k2: { b: 60, cpm: 21, ctr: 0.011, lpv: 0.74, atc: 0.045, ic: 0.45, pu: 0.4, aov: 2100, v3: 0.27, re: 0.7 },
        k3: { b: 50, cpm: 28, ctr: 0.007, lpv: 0.55, atc: 0.025, ic: 0.4, pu: 0.3, aov: 3600, v3: 0.18, re: 0.72 },
        k4: { b: 40, cpm: 34, ctr: 0.024, lpv: 0.82, atc: 0.09, ic: 0.55, pu: 0.6, aov: 640, v3: 0.35, re: 0.3 }
      };
      const rows = [], orders = [];
      let on = 1000;
      for (let d = start; d <= t; d = addDays(d, 1)) {
        for (const [k, p] of Object.entries(prof)) {
          const sp = Math.round(p.b * (0.85 + rnd() * 0.3) * 100) / 100;
          const im = Math.round(sp / p.cpm * 1000);
          const lc = Math.round(im * p.ctr * (0.8 + rnd() * 0.4));
          const lpv = Math.round(lc * p.lpv), atc = Math.round(lpv * p.atc * (0.7 + rnd() * 0.6)), ic = Math.round(atc * p.ic);
          let pu = 0; for (let i = 0; i < ic; i++) if (rnd() < p.pu) pu++;
          const pv = Math.round(pu * p.aov * (0.8 + rnd() * 0.4));
          rows.push({ d, p: "meta", cid: k, cn: `${k.toUpperCase()} ${PLAN[k].name}`, k, sp, im, re: Math.round(im * p.re), cl: Math.round(lc * 1.6), lc, v3: Math.round(im * p.v3), th: Math.round(im * p.v3 * 0.3), lpv, vc: lpv, atc, ic, pu, pv });
          const real = Math.max(0, pu - (rnd() < 0.25 ? 1 : 0));
          for (let i = 0; i < real; i++) { const tot = Math.round(p.aov * (0.8 + rnd() * 0.4) * 100) / 100; orders.push({ d, id: "#" + (on++), t: tot, sh: 0, c: null, ch: "meta", camp: PLAN[k].utm, k, x: 0 }); }
        }
      }
      DEMO = { v: 1, demo: true, syncedAt: new Date().toISOString(), rows, orders, campaigns: Object.keys(prof).map((k) => ({ p: "meta", cid: k, cn: `${k.toUpperCase()} ${PLAN[k].name}`, k, st: "active", bd: prof[k].b })), sources: { meta: { configured: true, ok: true }, google: { configured: false }, shopify: { configured: true, ok: true } } };
      return DEMO;
    }

    /* ---------- zdarzenia ---------- */
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-pr]");
      if (!el) return;
      const a = el.dataset.pr;
      if (a === "sync") { if (U.demo) { U.demo = false; lsSet("pr-demo", ""); } sync(true); }
      else if (a === "demo") { U.demo = !U.demo; lsSet("pr-demo", U.demo ? "1" : ""); CRM.scheduleRender(); }
      else if (a === "pf") { U.pf = el.dataset.v; CRM.scheduleRender(); }
      else if (a === "explain") openExplain(el.dataset.m);
      else if (a === "camp") openCamp(el.dataset.k);
      else if (a === "setup") { const s = document.getElementById("prSetup"); if (s) { s.querySelectorAll("details")[0].open = true; s.scrollIntoView({ behavior: "smooth", block: "start" }); } }
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.prin) { U[t.dataset.prin] = t.value; if (t.dataset.prin === "period") lsSet("pr-period", t.value); CRM.scheduleRender(); }
    });
    document.addEventListener("submit", async (e) => {
      if (e.target.id !== "prCfg") return;
      e.preventDefault();
      const f = e.target;
      const data = { margin: Math.min(95, Math.max(1, Number(f.margin.value) || 30)), fee: Math.min(10, Math.max(0, Number(f.fee.value) || 0)), start: f.start.value || CFG0.start, lastShip: f.lastShip.value || CFG0.lastShip };
      DEMO = null;
      if (await CRM.put("adcfg", "main", data)) CRM.toast("Zapisano ustawienia pomiaru");
    });
  });
})();
