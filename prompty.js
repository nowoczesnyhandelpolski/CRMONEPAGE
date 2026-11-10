/* Generator promptów — moduł panelu Centrali. Składa prompt dla AI, która buduje strony sklepu. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("pr-css")) return;
    const css = document.createElement("style");
    css.id = "pr-css";
    css.textContent = `
      .pr-wrap{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:14px;align-items:start}
      .pr-sec{padding:16px;margin-bottom:12px;display:grid;gap:12px}
      .pr-sec h3{margin:0;font-family:var(--display);font-size:17px}
      .pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
      .pr-grid .full{grid-column:1/-1}
      .pr-schemas{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
      .pr-schema{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface-2);cursor:pointer;text-align:left}
      .pr-schema b{display:block;font-size:14px}
      .pr-schema span{font-size:12px;color:var(--muted)}
      .pr-schema[aria-pressed="true"]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface));outline:1px solid var(--accent)}
      .pr-extras{display:grid;gap:6px}
      .pr-extras label{display:flex;gap:8px;align-items:flex-start;font-size:14px;cursor:pointer}
      .pr-out{position:sticky;top:12px;padding:16px;display:grid;gap:10px}
      .pr-out textarea{width:100%;min-height:62vh;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface-2);resize:vertical}
      .pr-saved{display:flex;flex-wrap:wrap;gap:6px}
      .pr-saved .chip .x{opacity:.6;margin-left:2px}
      @media(max-width:980px){.pr-wrap{grid-template-columns:1fr}.pr-out{position:static}}
      @media(max-width:600px){.pr-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(css);

    const LS_DRAFT = "nhp-prompt-draft", LS_SAVED = "nhp-prompt-saved";
    const load = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } };
    const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

    let P = null;
    CRM.VIEWS.push(["prompty", "Generator promptów", "spark"]);
    CRM.VIEW_FNS.prompty = vPrompts;
    CRM.readyFns.push(async () => {
      P = await import("./lib/prompt-builder.mjs");
      CRM.UI.pr = { ...P.emptyPrompt(), ...load(LS_DRAFT, {}) };
      CRM.scheduleRender();
    });

    const esc = (s) => CRM.esc(s ?? "");
    const st = () => CRM.UI.pr;

    function inp(k, label, ph = "", cls = "") {
      return `<div class="f ${cls}"><label for="pr-${k}">${label}</label><input id="pr-${k}" data-pr="${k}" value="${esc(st()[k])}" placeholder="${esc(ph)}" autocomplete="off"></div>`;
    }
    function area(k, label, ph = "") {
      return `<div class="f full"><label for="pr-${k}">${label}</label><textarea id="pr-${k}" data-pr="${k}" placeholder="${esc(ph)}">${esc(st()[k])}</textarea></div>`;
    }
    function sel(k, label, opts, cls = "") {
      return `<div class="f ${cls}"><label for="pr-${k}">${label}</label><select id="pr-${k}" data-pr="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${st()[k] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
    }

    function vPrompts() {
      const top = (sub, actions) => `<div class="top"><div><h1>Generator promptów</h1><p>${sub}</p></div><div class="row">${actions || ""}</div></div>`;
      if (!P || !st()) return top("Wczytuję moduł…") + `<div class="card pad">Chwila…</div>`;
      const d = st();
      const prompt = P.buildPrompt(d);
      const missing = P.missingCount(prompt);
      const products = CRM.arr("products").sort((a, b) => String(a.name).localeCompare(String(b.name), "pl"));
      const saved = load(LS_SAVED, []);

      return top("Uzupełnij pola, wybierz schemat i skopiuj gotowy prompt do generatora stron albo czatu z AI.",
        `<button class="btn" data-prb="reset" type="button">Wyczyść</button><button class="btn" data-prb="save" type="button">Zapisz szablon</button><button class="btn primary" data-prb="copy" type="button">Kopiuj prompt</button>`) +
      (saved.length ? `<div class="pr-saved" style="margin-bottom:12px">${saved.map((s, i) => `<button class="chip" data-prb="loadsaved" data-i="${i}" type="button">${esc(s.name)}<span class="x" data-prb="delsaved" data-i="${i}" title="Usuń">✕</span></button>`).join("")}</div>` : "") +
      `<div class="pr-wrap"><div>
        <section class="card pr-sec"><h3>1. Typ strony (schemat)</h3>
          <div class="pr-schemas">${P.SCHEMAS.map((s) => `<button type="button" class="pr-schema" data-prb="schema" data-id="${s.id}" aria-pressed="${d.schema === s.id}"><b>${s.id}. ${esc(s.name)}</b><span>${esc(s.hint)}</span></button>`).join("")}</div>
          ${d.schema === "E" ? `<div class="pr-grid">${inp("season", "Nazwa akcji", "np. Black Week 2026", "full")}</div>` : ""}
        </section>
        <section class="card pr-sec"><h3>2. Firma</h3><div class="pr-grid">
          ${inp("brand", "Nazwa sklepu / marki")}${inp("domain", "Domena")}
          ${inp("company", "Dane do stopki", "nazwa, adres, NIP, e-mail, telefon", "full")}
          ${inp("colors", "Logo i kolory", "", "full")}
          ${sel("tone", "Ton komunikacji", P.TONES)}${sel("format", "Format wyniku", P.FORMATS)}
        </div></section>
        <section class="card pr-sec"><h3>3. Produkt i oferta</h3><div class="pr-grid">
          ${products.length ? `<div class="f full"><label for="pr-addprod">Dodaj produkt z CRM</label><select id="pr-addprod"><option value="">— wybierz, żeby dopisać —</option>${products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.price ? ` · ${esc(p.price)} zł` : ""}</option>`).join("")}</select></div>` : ""}
          ${inp("category", "Kategoria", "np. akcesoria do domu", "full")}
          ${area("products", "Produkty — jeden w linii (nazwa – cena – cena przekreślona – korzyści)", "Lampka LED do czytania – 79 zł – 119 zł – nie oślepia, 3 tryby, USB-C")}
          ${inp("audience", "Grupa docelowa", "kto kupuje i jaki ma problem", "full")}
          ${inp("usp", "Główna obietnica (USP)", "dlaczego u nas, a nie na Allegro/Temu", "full")}
          ${inp("deliveryTime", "Czas dostawy")}${inp("deliveryCost", "Koszt dostawy", "np. darmowa od 149 zł")}
          ${inp("payments", "Płatności")}${inp("returns", "Zwroty")}
        </div></section>
        <section class="card pr-sec"><h3>4. Cel i dodatki</h3><div class="pr-grid">
          ${inp("cta", "Główny przycisk (CTA)")}${inp("goal2", "Cel dodatkowy", "np. zbieranie e-maili")}
        </div>
          <div class="pr-extras">${P.EXTRAS.map(([k, l]) => `<label><input type="checkbox" data-prx="${k}" ${d.extras.includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>
        </section>
      </div>
      <section class="card pr-out">
        <div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0;font-family:var(--display)">Gotowy prompt</h3>
          <span class="small ${missing ? "" : "muted"}" id="pr-missing">${missing ? `${missing} pól w [nawiasach] do uzupełnienia` : "Wszystko uzupełnione"}</span></div>
        <textarea id="pr-output" readonly>${esc(prompt)}</textarea>
        <div class="row"><button class="btn primary" data-prb="copy" type="button">Kopiuj prompt</button><button class="btn" data-prb="download" type="button">Pobierz .txt</button></div>
      </section></div>`;
    }

    function refreshOutput() {
      store(LS_DRAFT, st());
      const out = document.getElementById("pr-output");
      if (!out || !P) return;
      const prompt = P.buildPrompt(st());
      out.value = prompt;
      const m = P.missingCount(prompt);
      const el = document.getElementById("pr-missing");
      if (el) el.textContent = m ? `${m} pól w [nawiasach] do uzupełnienia` : "Wszystko uzupełnione";
    }

    async function copyPrompt() {
      const text = P.buildPrompt(st());
      try { await navigator.clipboard.writeText(text); CRM.toast("Prompt skopiowany — wklej go w generatorze."); }
      catch (e) { const out = document.getElementById("pr-output"); if (out) { out.select(); document.execCommand("copy"); CRM.toast("Prompt skopiowany."); } }
    }

    document.addEventListener("input", (e) => {
      const k = e.target.dataset && e.target.dataset.pr;
      if (!k || !st()) return;
      st()[k] = e.target.value;
      refreshOutput();
    });
    document.addEventListener("change", (e) => {
      if (!st()) return;
      const t = e.target;
      if (t.dataset && t.dataset.pr && t.tagName === "SELECT") { st()[t.dataset.pr] = t.value; refreshOutput(); return; }
      if (t.dataset && t.dataset.prx) {
        const set = new Set(st().extras); t.checked ? set.add(t.dataset.prx) : set.delete(t.dataset.prx);
        st().extras = P.EXTRAS.map((x) => x[0]).filter((k) => set.has(k));
        refreshOutput(); return;
      }
      if (t.id === "pr-addprod" && t.value) {
        const p = CRM.byId("products", t.value);
        if (p) {
          const line = [p.name, p.price ? `${p.price} zł` : "", "", ""].join(" – ").replace(/( – )+$/, "");
          st().products = (String(st().products || "").trim() ? st().products.trim() + "\n" : "") + line;
          if (!String(st().category || "").trim() && p.category) st().category = p.category;
          store(LS_DRAFT, st());
          CRM.toast(`Dopisano: ${p.name}`);
          CRM.scheduleRender();
        }
      }
    });
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-prb]");
      if (!t || !P) return;
      const a = t.dataset.prb;
      if (a === "schema") { st().schema = t.dataset.id; store(LS_DRAFT, st()); CRM.scheduleRender(); }
      else if (a === "copy") copyPrompt();
      else if (a === "download") {
        const blob = new Blob([P.buildPrompt(st())], { type: "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `prompt-${(st().brand || "strona").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${st().schema}.txt`;
        link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      else if (a === "reset") { CRM.UI.pr = P.emptyPrompt(); store(LS_DRAFT, CRM.UI.pr); CRM.scheduleRender(); }
      else if (a === "save") {
        const name = window.prompt("Nazwa szablonu:", `${st().brand || "Szablon"} – schemat ${st().schema}`);
        if (!name) return;
        const saved = load(LS_SAVED, []); saved.unshift({ name: name.slice(0, 60), data: { ...st() } });
        store(LS_SAVED, saved.slice(0, 20)); CRM.toast("Szablon zapisany"); CRM.scheduleRender();
      }
      else if (a === "delsaved") {
        e.stopPropagation();
        const saved = load(LS_SAVED, []); saved.splice(Number(t.dataset.i), 1); store(LS_SAVED, saved); CRM.scheduleRender();
      }
      else if (a === "loadsaved") {
        const s = load(LS_SAVED, [])[Number(t.dataset.i)];
        if (s) { CRM.UI.pr = { ...P.emptyPrompt(), ...s.data }; store(LS_DRAFT, CRM.UI.pr); CRM.toast(`Wczytano: ${s.name}`); CRM.scheduleRender(); }
      }
    });
  });
})();
