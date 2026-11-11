/* Kampanie reklamowe — Meta, Google Ads, TikTok.
   Panel liczy, czy reklama zarabia: zysk po reklamie, ROAS i próg opłacalności dla produktu,
   i mówi wprost, co zrobić (wyłącz / popraw / zwiększ budżet).
   Dane to rekordy w public.records (te same RLS i realtime co reszta CRM):
     adcamps  — kampanie (platforma, produkt, cena / koszt / wysyłka, budżet, status, link)
     adstats  — wyniki dzienne kampanii, id = <kampania>_<data> (wydane, kliknięcia, zamówienia, sprzedaż)
     adsetup  — lista kroków „Start reklam” (id main)
   Wyniki wpisujemy ręcznie albo z eksportu; po podpięciu kont API będą tu wpadać same. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("km-css")) return;
    const css = document.createElement("style");
    css.id = "km-css";
    css.textContent = `
      .km-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
      .km-sel{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:7px 10px;font-weight:600}
      .km-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .km-kpi{padding:14px 16px;border-top:5px solid var(--k,var(--line))}
      .km-kpi > span{display:block;font-size:13px;color:var(--muted);font-weight:600}
      .km-kpi strong{display:block;font:700 26px var(--display);margin-top:2px;white-space:nowrap}
      .km-kpi small{color:var(--muted);font-size:12px}
      .km-todo{padding:6px 0;margin-bottom:16px}
      .km-todo h2{font-size:18px;padding:10px 18px 4px}
      .km-do{display:flex;gap:12px;align-items:center;padding:10px 18px;border-top:1px solid var(--line);font-size:15px}
      .km-do:first-of-type{border-top:0}
      .km-do .ic{font-size:20px;width:28px;text-align:center;flex:none}
      .km-do .tx{flex:1;min-width:0}
      .km-do .tx small{display:block;color:var(--muted);font-size:13px}
      .km-c{margin-bottom:14px;overflow:hidden}
      .km-ch{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:16px 18px 10px}
      .km-ch h3{font-size:19px;margin:0}
      .km-ch .sp{flex:1}
      .km-pl{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:10px;color:#fff;font:800 13px var(--display);flex:none}
      .km-pl.meta{background:#1877F2}.km-pl.google{background:#EA4335}.km-pl.tiktok{background:#111;box-shadow:inset 0 0 0 2px #25F4EE}
      .km-ch small{display:block;color:var(--muted);font-size:13px}
      .km-v{margin:0 18px;padding:12px 14px;border-radius:14px;font-size:16px;font-weight:700;display:flex;gap:10px;align-items:center;border:2px solid transparent}
      .km-v small{display:block;font-weight:500;font-size:13px;opacity:.85}
      .km-v.good{background:color-mix(in srgb,var(--good) 14%,var(--surface));border-color:color-mix(in srgb,var(--good) 45%,transparent);color:color-mix(in srgb,var(--good) 70%,var(--ink))}
      .km-v.bad{background:color-mix(in srgb,var(--bad) 12%,var(--surface));border-color:color-mix(in srgb,var(--bad) 40%,transparent);color:color-mix(in srgb,var(--bad) 70%,var(--ink))}
      .km-v.warn{background:color-mix(in srgb,var(--warn) 12%,var(--surface));border-color:color-mix(in srgb,var(--warn) 40%,transparent);color:color-mix(in srgb,var(--warn) 65%,var(--ink))}
      .km-v.none{background:var(--surface-2);border-color:var(--line);color:var(--muted)}
      .km-m{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:12px 18px}
      .km-m div{background:var(--surface-2);border-radius:10px;padding:8px 10px;min-width:0}
      .km-m span{display:block;font-size:11px;color:var(--muted);font-weight:600}
      .km-m strong{display:block;font:700 17px var(--display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .km-m small{display:block;font-size:11px;color:var(--muted)}
      .km-acts{display:flex;gap:8px;flex-wrap:wrap;padding:0 18px 16px;align-items:center}
      .km-acts .pill{border:0}
      .km-pos{color:var(--good)}.km-neg{color:var(--bad)}
      .km-calc{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--info) 9%,var(--surface-2));font-size:13px}
      .km-calc b{display:block;font:700 18px var(--display)}
      .km-grid{grid-column:1/-1;overflow-x:auto}
      .km-grid table{font-size:13px}
      .km-grid td,.km-grid th{padding:6px 6px}
      .km-grid input{width:100%;min-width:70px;border:1px solid var(--line);background:var(--surface-2);border-radius:8px;padding:6px 8px}
      .km-steps{margin-top:6px}
      .km-steps summary{padding:14px 18px;font:700 16px var(--display);cursor:pointer}
      .km-step{display:flex;gap:10px;align-items:flex-start;padding:10px 18px;border-top:1px solid var(--line);font-size:14px;cursor:pointer}
      .km-step input{margin-top:3px;width:18px;height:18px;flex:none}
      .km-step small{display:block;color:var(--muted);font-size:12px}
      .km-step.done b{text-decoration:line-through;opacity:.6}
      @media(max-width:1100px){.km-m{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:760px){.km-kpis{grid-template-columns:1fr 1fr}.km-kpi strong{font-size:21px}.km-m{grid-template-columns:1fr 1fr}.km-calc{grid-template-columns:1fr}}
    `;
    document.head.appendChild(css);

    ["adcamps", "adstats", "adsetup"].forEach((c) => { if (!CRM.COLS.includes(c)) CRM.COLS.push(c); CRM.S[c] = CRM.S[c] || {}; });
    const si = CRM.VIEWS.findIndex((v) => v[0] === "social-media");
    CRM.VIEWS.splice(si >= 0 ? si : CRM.VIEWS.length, 0, ["kampanie", "Kampanie reklamowe", "spark"]);
    CRM.VIEW_FNS.kampanie = vCampaigns;

    const esc = (s) => CRM.esc(s ?? "");
    const me = () => CRM.me;
    const num = CRM.num;
    const zl = CRM.fmtZl;
    const today = () => CRM.TODAY();
    const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
    const fmtD = (s) => new Date(s + "T12:00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" });
    const x2 = (v) => (isFinite(v) && v > 0 ? v.toFixed(2).replace(".", ",") : "—");
    const lsGet = (k, f) => { try { const v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const U = (CRM.UI.km = Object.assign({ period: lsGet("km-period", "7"), pf: "all", showOff: false }, CRM.UI.km || {}));

    const PLAT = { meta: ["Meta", "f", "facebook", "paid_social"], google: ["Google Ads", "G", "google", "cpc"], tiktok: ["TikTok", "TT", "tiktok", "paid_social"] };
    const STATUS = [["plan", "Plan", "var(--grey)"], ["test", "Test", "var(--info)"], ["aktywna", "Aktywna", "var(--good)"], ["wstrzymana", "Wstrzymana", "var(--warn)"], ["zakonczona", "Zakończona", "var(--grey)"]];
    const RUNNING = ["test", "aktywna"];
    const PERIODS = [["1", "Wczoraj i dziś"], ["7", "Ostatnie 7 dni"], ["30", "Ostatnie 30 dni"], ["month", "Ten miesiąc"], ["all", "Od początku"]];
    const STEPS = [
      ["pixel", "Meta Pixel na stronach i w sklepie", "Bez tego Meta nie wie, kto kupił, i optymalizuje na ślepo."],
      ["capi", "Meta Conversions API (zamówienia wysyłane z serwera)", "Konwersje nie giną przez iPhone'y i blokery reklam."],
      ["gtag", "Tag Google Ads + konwersja „Zakup”", "To samo co Pixel, tylko dla Google."],
      ["merchant", "Google Merchant Center połączony ze sklepem", "Potrzebne do kampanii Shopping i Performance Max."],
      ["bm", "Meta Business Manager + konto reklamowe + System User", "Dostęp dla panelu do pobierania wyników z Meta."],
      ["mcc", "Google Ads: konto menedżera (MCC) i token API", "Wniosek o token trwa kilka dni — warto złożyć od razu."],
      ["utm", "Linki z UTM w każdej reklamie", "Wtedy wiadomo, z której reklamy przyszło zamówienie. Link skopiujesz przy kampanii."]
    ];

    const camps = () => CRM.arr("adcamps");
    const statsOf = (id) => CRM.arr("adstats").filter((r) => r.campId === id);
    const since = (p) => { if (p === "all") return "0000"; if (p === "month") return today().slice(0, 8) + "01"; return addDays(today(), -Number(p)); };
    const unitProfit = (c) => num(c.price) - num(c.cost) - num(c.shipping) - num(c.price) * num(c.feePct) / 100;
    const beRoas = (c) => { const u = unitProfit(c); return u > 0 && num(c.price) > 0 ? num(c.price) / u : Infinity; };

    function calc(c, from) {
      const rows = statsOf(c.id).filter((r) => r.date >= from);
      const t = rows.reduce((a, r) => ({ spend: a.spend + num(r.spend), clicks: a.clicks + num(r.clicks), orders: a.orders + num(r.orders), revenue: a.revenue + num(r.revenue) }), { spend: 0, clicks: 0, orders: 0, revenue: 0 });
      const u = unitProfit(c), price = num(c.price);
      const margin = price > 0 ? u / price : 0;
      t.gross = t.revenue ? t.revenue * margin : t.orders * u;
      t.profit = t.gross - t.spend;
      t.roas = t.spend ? t.revenue / t.spend : 0;
      t.cpa = t.orders ? t.spend / t.orders : 0;
      t.maxCpa = u;
      t.be = beRoas(c);
      t.days = rows.length;
      const last3 = statsOf(c.id).filter((r) => r.date >= addDays(today(), -3) && r.date < today()).sort((a, b) => a.date.localeCompare(b.date));
      t.win3 = last3.length >= 3 && last3.every((r) => num(r.revenue) * margin - num(r.spend) > 0);
      t.missingYday = RUNNING.includes(c.status) && !CRM.S.adstats[`${c.id}_${addDays(today(), -1)}`] && (!c.start || c.start < today());
      return t;
    }
    function verdict(c, t) {
      if (unitProfit(c) <= 0 && num(c.price) > 0) return ["bad", "⛔ Produkt nie zarabia nawet bez reklamy", `Cena ${zl(num(c.price))} nie pokrywa kosztu, wysyłki i prowizji. Podnieś cenę albo zmień produkt.`];
      if (!num(c.price)) return ["none", "✏️ Uzupełnij cenę i koszt produktu", "Bez tego panel nie policzy, czy reklama zarabia."];
      if (!t.spend) return ["none", "📝 Brak wyników", RUNNING.includes(c.status) ? "Wpisz wydatki i sprzedaż z Ads Managera." : "Kampania jeszcze nie wydała pieniędzy."];
      if (!t.orders && t.spend >= 1.5 * t.maxCpa) return ["bad", `🛑 Wyłącz — wydane ${zl(t.spend)} bez sprzedaży`, `To ponad 1,5 × tyle, ile może kosztować jedno zamówienie (${zl(t.maxCpa)}).`];
      if (!t.orders) return ["warn", "⏳ Za mało danych — jeszcze bez sprzedaży", `Daj jej czas do ${zl(1.5 * t.maxCpa)} wydatków, potem oceń.`];
      if (t.profit > 0 && t.win3 && t.roas >= t.be * 1.2) return ["good", `🚀 Zarabia ${zl(t.profit)} — zwiększ budżet o 20%`, `Od 3 dni na plusie. Nowy budżet: ${zl(num(c.budget) * 1.2)} / dzień.`];
      if (t.profit > 0) return ["good", `✅ Zarabia ${zl(t.profit)}`, t.roas < t.be * 1.2 ? "Na granicy opłacalności — obserwuj." : "Trzymaj tak dalej."];
      return ["bad", `📉 Traci ${zl(-t.profit)} — popraw reklamę albo wyłącz`, `ROAS ${x2(t.roas)}, a żeby zarabiać, trzeba ${x2(t.be)}. Zmień kreację lub grupę odbiorców.`];
    }

    function utmLink(c) {
      const base = String(c.url || "").trim();
      if (!/^https?:\/\//i.test(base)) return "";
      const p = PLAT[c.platform] || PLAT.meta;
      const slug = String(c.name || "kampania").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      const u = new URL(base);
      u.searchParams.set("utm_source", p[2]); u.searchParams.set("utm_medium", p[3]); u.searchParams.set("utm_campaign", slug);
      return u.toString();
    }
    const platBadge = (k) => { const p = PLAT[k] || PLAT.meta; return `<span class="km-pl ${esc(k)}" title="${esc(p[0])}">${esc(p[1])}</span>`; };
    const top = (title, sub, actions) => `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions || ""}</div></div>`;
    const log = (text) => CRM.put("activity", CRM.uid("ac"), { ts: Date.now(), who: me(), text: String(text).slice(0, 200), src: "kampanie" });

    /* ---------- widok ---------- */
    function vCampaigns() {
      const from = since(U.period);
      const all = camps().sort((a, b) => (RUNNING.includes(b.status) - RUNNING.includes(a.status)) || (+b.createdAt || 0) - (+a.createdAt || 0));
      const list = all.filter((c) => (U.pf === "all" || c.platform === U.pf) && (U.showOff || !["zakonczona"].includes(c.status)));
      const per = list.map((c) => { const t = calc(c, from); return { c, t, v: verdict(c, t) }; });
      const sum = per.reduce((a, { t }) => ({ spend: a.spend + t.spend, revenue: a.revenue + t.revenue, profit: a.profit + t.profit, orders: a.orders + t.orders }), { spend: 0, revenue: 0, profit: 0, orders: 0 });
      const roas = sum.spend ? sum.revenue / sum.spend : 0;
      const setup = (CRM.S.adsetup.main || {}).steps || {};
      const stepsDone = STEPS.filter(([k]) => setup[k]).length;

      const actions = `<button class="btn" type="button" data-km="day">📝 Wpisz wyniki dnia</button><button class="btn primary" type="button" data-km="new">${CRM.ic("plus", 16)} Nowa kampania</button>`;
      const head = top("Kampanie reklamowe", "Ile wydajemy na reklamy i ile na nich zarabiamy — Meta, Google, TikTok.", actions);
      if (!all.length) {
        return head + `<div class="card"><div class="empty"><b>Dodaj pierwszą kampanię</b>Wpisz produkt, cenę i koszt — panel policzy, ile może kosztować jedno zamówienie z reklamy, żeby było na plusie.<div style="margin-top:12px"><button class="btn primary" type="button" data-km="new">${CRM.ic("plus", 16)} Nowa kampania</button></div></div></div>` + stepsHtml(setup, stepsDone, true);
      }
      const plats = [["all", "Wszystkie"], ...Object.entries(PLAT).filter(([k]) => all.some((c) => c.platform === k)).map(([k, p]) => [k, p[0]])];
      const bar = `<div class="km-bar"><select class="km-sel" data-kmin="period" aria-label="Okres">${PERIODS.map(([k, l]) => `<option value="${k}" ${U.period === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${plats.length > 2 ? `<div class="chips">${plats.map(([k, l]) => `<button type="button" class="chip" data-km="pf" data-v="${k}" aria-pressed="${U.pf === k}">${esc(l)}</button>`).join("")}</div>` : ""}
        ${all.some((c) => c.status === "zakonczona") ? `<button type="button" class="chip" data-km="off" aria-pressed="${U.showOff}">Pokaż zakończone</button>` : ""}</div>`;
      const kpi = (k, l, v, s) => `<div class="card km-kpi" style="--k:${k}"><span>${l}</span><strong>${v}</strong>${s ? `<small>${s}</small>` : ""}</div>`;
      const kpis = `<div class="km-kpis">${kpi("var(--info)", "Wydane na reklamy", zl(sum.spend), `${sum.orders} zamówień z reklam`)}${kpi("var(--violet)", "Sprzedaż z reklam", zl(sum.revenue))}${kpi(sum.profit >= 0 ? "var(--good)" : "var(--bad)", "Zysk po reklamach", `<span class="${sum.profit >= 0 ? "km-pos" : "km-neg"}">${zl(sum.profit)}</span>`, "po koszcie towaru, wysyłki i prowizji")}${kpi("var(--warn)", "Zwrot z reklamy (ROAS)", x2(roas), "ile zł sprzedaży z 1 zł reklamy")}</div>`;

      const todo = [];
      per.filter(({ c }) => RUNNING.includes(c.status)).forEach(({ c, t, v }) => {
        if (v[0] === "bad" || (v[0] === "good" && v[1].startsWith("🚀"))) todo.push([v[1].slice(0, 2), `${esc(c.name)}: ${esc(v[1].slice(2).trim())}`, esc(v[2]), c.id]);
        if (t.missingYday) todo.push(["📝", `${esc(c.name)}: wpisz wczorajsze wyniki`, "Wydane, kliknięcia, zamówienia, sprzedaż z Ads Managera.", c.id, "stats"]);
      });
      if (stepsDone < STEPS.length) todo.push(["🧰", `Start reklam: zrobione ${stepsDone} z ${STEPS.length} kroków`, "Pixel, konwersje i dostęp API — bez tego wyniki są niepełne.", "", "steps"]);
      const todoHtml = todo.length ? `<div class="card km-todo"><h2>👉 Co zrobić teraz</h2>${todo.map(([ic, tx, sm, id, kind]) => `<div class="km-do"><span class="ic">${ic}</span><span class="tx">${tx}<small>${sm}</small></span>${kind === "stats" ? `<button class="btn sm" type="button" data-km="stats" data-id="${esc(id)}">Wpisz</button>` : kind === "steps" ? `<button class="btn sm" type="button" data-km="steps">Pokaż</button>` : `<button class="btn sm" type="button" data-km="edit" data-id="${esc(id)}">Zmień</button>`}</div>`).join("")}</div>` : "";

      const cards = per.map(({ c, t, v }) => {
        const p = PLAT[c.platform] || PLAT.meta;
        const prod = c.productId && CRM.byId("products", c.productId);
        const link = utmLink(c);
        return `<article class="card km-c">
          <div class="km-ch">${platBadge(c.platform)}<div><h3>${esc(c.name || "Kampania")}</h3><small>${esc(p[0])}${prod ? " · " + esc(prod.name) : ""}${num(c.budget) ? ` · budżet ${zl(num(c.budget))} / dzień` : ""}${c.owner ? " · prowadzi " + esc((CRM.team().find((x) => x.k === c.owner) || {}).name || "") : ""}</small></div><span class="sp"></span>
            <select class="pill" style="--c:${(STATUS.find((s) => s[0] === c.status) || STATUS[0])[2]}" data-kmst="${esc(c.id)}" aria-label="Status kampanii">${STATUS.map(([k, l]) => `<option value="${k}" ${c.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="km-v ${v[0]}"><span>${esc(v[1])}<small>${esc(v[2])}</small></span></div>
          <div class="km-m"><div><span>Wydane</span><strong>${zl(t.spend)}</strong></div><div><span>Zamówienia</span><strong>${t.orders}</strong><small>${t.clicks ? `${t.clicks} kliknięć` : ""}</small></div><div><span>Sprzedaż</span><strong>${zl(t.revenue)}</strong></div><div><span>Zysk po reklamie</span><strong class="${t.profit >= 0 ? "km-pos" : "km-neg"}">${zl(t.profit)}</strong></div><div><span>ROAS</span><strong>${x2(t.roas)}</strong><small>próg: ${x2(t.be)}</small></div><div><span>Koszt 1 zamówienia</span><strong>${t.cpa ? zl(t.cpa) : "—"}</strong><small>max: ${t.maxCpa > 0 ? zl(t.maxCpa) : "—"}</small></div></div>
          <div class="km-acts"><button class="btn primary sm" type="button" data-km="stats" data-id="${esc(c.id)}">📝 Wpisz wyniki</button>${link ? `<button class="btn sm" type="button" data-km="utm" data-id="${esc(c.id)}">🔗 Kopiuj link z UTM</button>` : ""}${/^https?:\/\//.test(c.adsUrl || "") ? `<a class="btn sm" href="${esc(c.adsUrl)}" target="_blank" rel="noopener">↗ Otwórz w ${esc(p[0])}</a>` : ""}<button class="btn ghost sm" type="button" data-km="edit" data-id="${esc(c.id)}">✏️ Edytuj</button></div>
        </article>`;
      }).join("");
      return head + bar + kpis + todoHtml + (cards || `<div class="card"><div class="empty small"><b>Brak kampanii dla tego filtra</b></div></div>`) + stepsHtml(setup, stepsDone, false);
    }
    function stepsHtml(setup, done, open) {
      return `<details class="card km-steps" id="kmSteps" ${open || U.stepsOpen ? "open" : ""}><summary>🧰 Start reklam — lista kroków (${done} z ${STEPS.length})</summary>
        ${STEPS.map(([k, t, s]) => `<label class="km-step ${setup[k] ? "done" : ""}"><input type="checkbox" data-kmstep="${k}" ${setup[k] ? "checked" : ""}><span><b>${esc(t)}</b><small>${esc(s)}${setup[k] ? ` · ✓ ${esc(setup[k].who ? (CRM.team().find((x) => x.k === setup[k].who) || {}).name || "" : "")}` : ""}</small></span></label>`).join("")}</details>`;
    }

    /* ---------- formularz kampanii ---------- */
    function openCamp(id) {
      const c = (id && CRM.S.adcamps[id]) || { platform: "meta", status: "plan", feePct: 3, owner: me(), start: today() };
      const prods = CRM.arr("products").sort((a, b) => String(a.name).localeCompare(String(b.name), "pl"));
      CRM.openModal(`<form id="kmCamp" novalidate data-id="${esc(id || "")}">
        <div class="modal-h"><h2 id="mTitle">${id ? "Edytuj kampanię" : "Nowa kampania"}</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b">
          <div class="f full"><label for="km-n">Nazwa kampanii *</label><input id="km-n" name="name" value="${esc(c.name || "")}" placeholder="np. Lampki LED — test 3 kreacji" autocomplete="off"></div>
          <div class="f"><label for="km-p">Gdzie</label><select id="km-p" name="platform">${Object.entries(PLAT).map(([k, p]) => `<option value="${k}" ${c.platform === k ? "selected" : ""}>${p[0]}</option>`).join("")}</select></div>
          <div class="f"><label for="km-s">Status</label><select id="km-s" name="status">${STATUS.map(([k, l]) => `<option value="${k}" ${c.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="f"><label for="km-pr">Produkt (opcjonalnie)</label><select id="km-pr" name="productId"><option value="">— wpiszę ceny ręcznie —</option>${prods.map((p) => `<option value="${esc(p.id)}" ${c.productId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
          <div class="f"><label for="km-o">Kto prowadzi</label><select id="km-o" name="owner"><option value="">—</option>${CRM.team().map((p) => `<option value="${p.k}" ${c.owner === p.k ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
          <div class="f"><label for="km-pc">Cena sprzedaży (zł) *</label><input id="km-pc" name="price" inputmode="decimal" value="${esc(c.price ?? "")}"></div>
          <div class="f"><label for="km-co">Koszt towaru (zł)</label><input id="km-co" name="cost" inputmode="decimal" value="${esc(c.cost ?? "")}"></div>
          <div class="f"><label for="km-sh">Wysyłka (zł)</label><input id="km-sh" name="shipping" inputmode="decimal" value="${esc(c.shipping ?? "")}"></div>
          <div class="f"><label for="km-fe">Prowizja płatności (%)</label><input id="km-fe" name="feePct" inputmode="decimal" value="${esc(c.feePct ?? 3)}"></div>
          <div class="km-calc" id="kmCalc"></div>
          <div class="f"><label for="km-b">Budżet dzienny (zł)</label><input id="km-b" name="budget" inputmode="decimal" value="${esc(c.budget ?? "")}"></div>
          <div class="f"><label for="km-st">Start</label><input id="km-st" name="start" type="date" value="${esc(c.start || "")}"></div>
          <div class="f full"><label for="km-u">Adres strony, na którą prowadzi reklama</label><input id="km-u" name="url" value="${esc(c.url || "")}" placeholder="https://…/p/lampki-led" autocomplete="off"></div>
          <div class="f full"><label for="km-a">Link do kampanii w Ads Managerze (opcjonalnie)</label><input id="km-a" name="adsUrl" value="${esc(c.adsUrl || "")}" placeholder="https://adsmanager.facebook.com/…" autocomplete="off"></div>
          <div class="f full"><label for="km-no">Notatki (grupa odbiorców, kreacje)</label><textarea id="km-no" name="notes">${esc(c.notes || "")}</textarea></div>
        </div>
        <div class="modal-f"><div>${id ? `<button type="button" class="btn danger" data-km="del" data-id="${esc(id)}">Usuń</button>` : ""}</div><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">${id ? "Zapisz" : "Dodaj kampanię"}</button></div></div>
      </form>`);
      updCalc();
    }
    function updCalc() {
      const f = document.getElementById("kmCamp"), box = document.getElementById("kmCalc");
      if (!f || !box) return;
      const c = { price: f.price.value, cost: f.cost.value, shipping: f.shipping.value, feePct: f.feePct.value };
      const u = unitProfit(c);
      box.innerHTML = num(c.price)
        ? `<div>Zarobek na 1 sztuce bez reklamy<b class="${u > 0 ? "km-pos" : "km-neg"}">${zl(u)}</b></div><div>Max koszt reklamy na 1 zamówienie<b>${u > 0 ? zl(u) : "—"}</b></div><div>ROAS, od którego zarabiamy<b>${x2(beRoas(c))}</b></div>`
        : `<div style="grid-column:1/-1">Wpisz cenę i koszt — panel policzy, ile może kosztować jedno zamówienie z reklamy.</div>`;
    }
    async function submitCamp(form) {
      const fd = new FormData(form), g = (k) => String(fd.get(k) || "").trim();
      if (!g("name")) { const el = form.querySelector("#km-n"); el.setCustomValidity("Wpisz nazwę kampanii"); el.reportValidity(); setTimeout(() => el.setCustomValidity(""), 1500); return; }
      const id = form.dataset.id || CRM.uid("ad");
      const prev = CRM.S.adcamps[id] || {};
      const data = { ...prev, name: g("name"), platform: g("platform"), status: g("status"), productId: g("productId"), owner: g("owner"), price: num(g("price")), cost: num(g("cost")), shipping: num(g("shipping")), feePct: num(g("feePct")), budget: num(g("budget")), start: g("start"), url: g("url"), adsUrl: g("adsUrl"), notes: g("notes") };
      if (!form.dataset.id) { data.createdAt = Date.now(); data.createdBy = me(); }
      if (await CRM.put("adcamps", id, data)) {
        CRM.closeModal();
        if (!form.dataset.id) log(`Nowa kampania (${(PLAT[data.platform] || PLAT.meta)[0]}): ${data.name}`);
        else if (prev.status !== data.status) log(`Kampania ${data.name} → ${(STATUS.find((s) => s[0] === data.status) || [])[1]}`);
        CRM.toast(form.dataset.id ? "Zapisano kampanię" : "Dodano kampanię. Teraz wpisuj wyniki co dzień.");
      }
    }

    /* ---------- wyniki dzienne ---------- */
    function rowInputs(campId, date) {
      const r = CRM.S.adstats[`${campId}_${date}`] || {};
      const inp = (k, ph) => `<input name="${k}|${esc(campId)}|${date}" inputmode="decimal" value="${r[k] != null && r[k] !== "" ? esc(r[k]) : ""}" placeholder="${ph}" aria-label="${ph}">`;
      return `<td>${inp("spend", "0")}</td><td>${inp("clicks", "0")}</td><td>${inp("orders", "0")}</td><td>${inp("revenue", "0")}</td>`;
    }
    function openStats(campId) {
      const c = CRM.S.adcamps[campId];
      if (!c) return;
      const days = Array.from({ length: 7 }, (_, i) => addDays(today(), -i));
      CRM.openModal(`<form id="kmStats" novalidate>
        <div class="modal-h"><h2 id="mTitle">Wyniki: ${esc(c.name)}</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b"><div class="f full"><span class="small muted">Przepisz liczby z ${esc((PLAT[c.platform] || PLAT.meta)[0])} (kolumny: wydana kwota, kliknięcia, zakupy, wartość zakupów). Puste pola pomijamy.</span></div>
        <div class="km-grid"><table><thead><tr><th>Dzień</th><th>Wydane zł</th><th>Kliknięcia</th><th>Zamówienia</th><th>Sprzedaż zł</th></tr></thead><tbody>${days.map((d) => `<tr><td class="small">${esc(fmtD(d))}</td>${rowInputs(campId, d)}</tr>`).join("")}</tbody></table></div></div>
        <div class="modal-f"><span></span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">Zapisz wyniki</button></div></div>
      </form>`);
    }
    function openDay(date) {
      const d = date || addDays(today(), -1);
      const list = camps().filter((c) => RUNNING.includes(c.status) || CRM.S.adstats[`${c.id}_${d}`]);
      if (!list.length) { CRM.toast("Najpierw dodaj kampanię i ustaw jej status na Test albo Aktywna."); return; }
      CRM.openModal(`<form id="kmStats" novalidate>
        <div class="modal-h"><h2 id="mTitle">Wyniki dnia</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b"><div class="f"><label for="km-day">Dzień</label><input id="km-day" type="date" value="${d}" max="${today()}" data-kmday></div>
        <div class="km-grid"><table><thead><tr><th>Kampania</th><th>Wydane zł</th><th>Kliknięcia</th><th>Zamówienia</th><th>Sprzedaż zł</th></tr></thead><tbody>${list.map((c) => `<tr><td class="small">${platBadge(c.platform)} ${esc(c.name)}</td>${rowInputs(c.id, d)}</tr>`).join("")}</tbody></table></div></div>
        <div class="modal-f"><span></span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">Zapisz wyniki</button></div></div>
      </form>`);
    }
    async function submitStats(form) {
      const rows = {};
      [...form.querySelectorAll("input[name*='|']")].forEach((el) => {
        const [k, campId, date] = el.name.split("|");
        const key = `${campId}_${date}`;
        (rows[key] = rows[key] || { campId, date, any: false });
        const v = el.value.trim();
        rows[key][k] = v === "" ? "" : num(v);
        if (v !== "") rows[key].any = true;
      });
      let n = 0;
      for (const [key, r] of Object.entries(rows)) {
        const prev = CRM.S.adstats[key];
        if (!r.any) { if (prev) await CRM.del("adstats", key); continue; }
        const data = { campId: r.campId, date: r.date, spend: r.spend || 0, clicks: r.clicks || 0, orders: r.orders || 0, revenue: r.revenue || 0, who: me(), ts: Date.now() };
        if (!prev || ["spend", "clicks", "orders", "revenue"].some((k) => num(prev[k]) !== num(data[k]))) { await CRM.put("adstats", key, data); n++; }
      }
      CRM.closeModal();
      if (n) { log(`Wyniki reklam: zapisane ${n} ${n === 1 ? "dzień" : "dni/kampanie"}`); CRM.toast("Zapisano wyniki — panel przeliczył zysk."); }
      else CRM.toast("Bez zmian.");
    }

    /* ---------- baner ---------- */
    const B = window.NHP_BRAND;
    if (B && B.banner && !B._km) {
      const inner = B.banner;
      let mine = false;
      B.banner = (v) => {
        if (v !== "kampanie") { mine = false; return inner(v); }
        if (mine) return;
        inner("__km"); mine = true;
        const host = document.getElementById("vart");
        if (host) host.innerHTML = `<section class="vbanner enter"><div class="vb-grid"></div><div class="vb-txt"><div class="vb-eye">Kampanie reklamowe</div><h2>Reklama ma zarabiać</h2><p>Meta, Google i TikTok w jednym miejscu. Panel mówi, co wyłączyć, a co zwiększyć.</p></div><div class="vb-art">${B.svg ? B.svg("generator") : ""}</div></section>`;
      };
      B._km = 1;
    }
    CRM.badgeFns.push(() => {
      const bad = camps().filter((c) => RUNNING.includes(c.status)).filter((c) => { const t = calc(c, since("7")); const v = verdict(c, t); return v[0] === "bad" || t.missingYday; }).length;
      return { kampanie: bad };
    });

    /* ---------- zdarzenia ---------- */
    document.addEventListener("click", async (e) => {
      const el = e.target.closest("[data-km]");
      if (!el) return;
      const a = el.dataset.km, id = el.dataset.id;
      if (a === "new") openCamp();
      else if (a === "edit") openCamp(id);
      else if (a === "stats") openStats(id);
      else if (a === "day") openDay();
      else if (a === "pf") { U.pf = el.dataset.v; CRM.scheduleRender(); }
      else if (a === "off") { U.showOff = !U.showOff; CRM.scheduleRender(); }
      else if (a === "steps") { U.stepsOpen = true; CRM.scheduleRender(); setTimeout(() => { const s = document.getElementById("kmSteps"); if (s) { s.open = true; s.scrollIntoView({ behavior: "smooth", block: "start" }); } }, 60); }
      else if (a === "utm") {
        const link = utmLink(CRM.S.adcamps[id] || {});
        try { await navigator.clipboard.writeText(link); CRM.toast("Skopiowano link z UTM — wklej go w reklamie."); } catch (err) { prompt("Skopiuj link:", link); }
      } else if (a === "del") {
        if (!el.dataset.sure) { el.dataset.sure = "1"; el.textContent = "Na pewno usunąć?"; return; }
        const c = CRM.S.adcamps[id];
        if (await CRM.del("adcamps", id)) { for (const r of statsOf(id)) await CRM.del("adstats", r.id); CRM.closeModal(); log(`Usunięto kampanię: ${c ? c.name : ""}`); CRM.toast("Usunięto kampanię"); }
      }
    });
    document.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.dataset.kmin) { U[t.dataset.kmin] = t.value; if (t.dataset.kmin === "period") lsSet("km-period", t.value); CRM.scheduleRender(); return; }
      if (t.dataset.kmst) { const c = CRM.S.adcamps[t.dataset.kmst]; if (c && c.status !== t.value && await CRM.put("adcamps", c.id, { ...c, status: t.value })) log(`Kampania ${c.name} → ${(STATUS.find((s) => s[0] === t.value) || [])[1]}`); return; }
      if (t.dataset.kmstep) {
        const cur = (CRM.S.adsetup.main || {}).steps || {};
        const steps = { ...cur };
        if (t.checked) steps[t.dataset.kmstep] = { who: me(), ts: Date.now() }; else delete steps[t.dataset.kmstep];
        U.stepsOpen = true;
        if (await CRM.put("adsetup", "main", { steps }) && t.checked) log(`Start reklam: ${(STEPS.find((s) => s[0] === t.dataset.kmstep) || [])[1]} ✓`);
        return;
      }
      if (t.dataset.kmday !== undefined) { CRM.closeModal(); openDay(t.value); return; }
      if (t.id === "km-pr") {
        const p = CRM.byId("products", t.value), f = document.getElementById("kmCamp");
        if (p && f) { if (!f.price.value) f.price.value = num(p.price) || ""; if (!f.cost.value) f.cost.value = num(p.cost) || ""; if (!f.shipping.value && num(p.shipping)) f.shipping.value = num(p.shipping); if (!f.name.value) f.name.value = p.name; updCalc(); }
      }
    });
    document.addEventListener("input", (e) => { if (e.target.closest("#kmCamp")) updCalc(); });
    document.addEventListener("toggle", (e) => { if (e.target.id === "kmSteps") U.stepsOpen = e.target.open; }, true);
    document.addEventListener("submit", (e) => {
      const id = e.target.id;
      if (id !== "kmCamp" && id !== "kmStats") return;
      e.preventDefault();
      if (id === "kmCamp") submitCamp(e.target); else submitStats(e.target);
    });
  });
})();
