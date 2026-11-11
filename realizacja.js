/* Realizacja — moduł panelu Centrali.
   Opłacone zamówienie trafia do kolejki (public.fulfilments), a funkcja Supabase `fulfil` co 5 minut
   zamawia towar u dostawcy (BigBuy API, e-mail do hurtowni albo etykieta InPost) i śledzi przesyłkę.
   Panel: tryb (wyłączone / próbny / na żywo), limity wydatków, klucze dostawców (Supabase Vault),
   reguły „strona → dostawca + SKU”, kolejka i dziennik. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("rz-css")) return;
    const css = document.createElement("style");
    css.id = "rz-css";
    css.textContent = `
      .rz-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}
      .rz-card{padding:18px}
      .rz-card h2{margin:0 0 4px;font-family:var(--display);font-size:18px}
      .rz-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .rz-form label{display:grid;gap:4px;font-size:13px;color:var(--muted)}
      .rz-keys{display:grid;gap:8px;margin-top:12px}
      .rz-key{display:grid;grid-template-columns:170px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px}
      .rz-mode{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .rz-log{font-size:12px;color:var(--muted);display:grid;gap:3px;padding:14px 18px}
      .rz-log .warn{color:var(--warn)} .rz-log .error{color:var(--bad)}
      .rz-tbl input,.rz-tbl select{min-width:0;width:100%}
      .rz-err{color:var(--bad);font-size:12px;max-width:340px}
      @media(max-width:900px){.rz-grid,.rz-form{grid-template-columns:1fr}.rz-key{grid-template-columns:1fr}}
    `;
    document.head.appendChild(css);

    const esc = CRM.esc;
    const zl = (n) => n == null || n === "" ? "—" : CRM.fmtZl ? CRM.fmtZl(Number(n)) : `${n} zł`;
    const when = (t) => t ? new Date(t).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
    const STATE = {
      queued: ["W kolejce", "var(--info)"], dry_run: ["Próba — nic nie kupione", "var(--violet)"], ordered: ["Zamówione u dostawcy", "var(--violet)"],
      shipped: ["W drodze", "var(--warn)"], delivered: ["Dostarczone", "var(--good)"], needs_review: ["Do sprawdzenia", "var(--bad)"],
      failed: ["Błąd", "var(--bad)"], cancelled: ["Anulowane", "var(--grey)"]
    };
    const MODES = [["off", "Wyłączone", "Nic się nie dzieje, zamówienia czekają w kolejce."], ["dry_run", "Tryb próbny", "Liczy koszt i marżę, zapisuje plan. Niczego nie kupuje."], ["live", "Na żywo", "Zamawia u dostawcy i płaci z salda / konta InPost."]];
    const ADAPTERS = [["manual", "Ręcznie"], ["email", "E-mail do hurtowni"], ["bigbuy", "BigBuy (API)"], ["inpost", "Etykieta InPost"]];
    const KEYS = [
      ["bigbuy_api_key", "BigBuy — klucz API", "BigBuy → Konto → API"],
      ["inpost_token", "InPost — token API", "Manager Paczek → Moje konto → API"],
      ["inpost_org_id", "InPost — ID organizacji", "Liczba z tej samej strony"],
      ["smtp_host", "Poczta — serwer SMTP", "np. serwer2647444.home.pl"],
      ["smtp_user", "Poczta — login", "np. zamowienia@nowoczesnyhandelpolski.pl"],
      ["smtp_pass", "Poczta — hasło", "hasło tej skrzynki"],
      ["smtp_from", "Poczta — nadawca", "np. Nowoczesny Handel Polski <zamowienia@…>"]
    ];
    const pill = (k) => { const [l, c] = STATE[k] || [k || "—", "var(--grey)"]; return `<span class="pill" style="--c:${c}">${esc(l)}</span>`; };

    const ST = { loaded: false, loading: false, settings: null, rules: [], rows: [], log: [], pages: [], keys: {} };
    CRM.S.realizacja = ST;

    async function load() {
      if (!CRM.SB || ST.loading) return;
      ST.loading = true;
      try {
        const [settings, rules, rows, log, pages, keys] = await Promise.all([
          CRM.SB.from("fulfil_settings").select("*").eq("id", 1).maybeSingle(),
          CRM.SB.from("fulfil_rules").select("*"),
          CRM.SB.from("fulfilments").select("*").order("created_at", { ascending: false }).limit(100),
          CRM.SB.from("fulfil_log").select("*").order("created_at", { ascending: false }).limit(40),
          CRM.SB.from("pages").select("id,name,slug,status,data").order("updated_at", { ascending: false }).limit(200),
          CRM.SB.rpc("nhp_fulfil_secret_status")
        ]);
        ST.settings = settings.data || { mode: "dry_run", max_order_cost: 300, daily_cap: 1000, min_margin: 5, bigbuy_sandbox: true, inpost_sandbox: true, sender: {} };
        ST.rules = rules.data || [];
        ST.rows = rows.data || [];
        ST.log = log.data || [];
        ST.pages = pages.data || [];
        ST.keys = keys.data || {};
        ST.loaded = true;
      } finally {
        ST.loading = false;
        CRM.scheduleRender();
      }
    }

    let channel = null;
    function ensureLoaded() {
      if (!ST.loaded && !ST.loading) load();
      if (!channel && CRM.SB) {
        channel = CRM.SB.channel("nhp-realizacja")
          .on("postgres_changes", { event: "*", schema: "public", table: "fulfilments" }, () => load())
          .subscribe();
      }
    }

    function top(title, sub, actions) {
      return `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions || ""}</div></div>`;
    }

    const orderNo = (id) => { const o = CRM.S.orders && CRM.S.orders[id]; return o ? `#${o.number || id}` : id; };

    function vRealizacja() {
      ensureLoaded();
      const head = top("Realizacja zamówień", "Opłacone zamówienie samo idzie do dostawcy, a numer przesyłki wraca do CRM. Sprawdzane co 5 minut.",
        `<button class="btn sm" data-rz-reload>Odśwież</button><button class="btn sm primary" data-rz-run>Uruchom teraz</button>`);
      if (!ST.loaded) return head + `<div class="card pad">Wczytuję…</div>`;
      const s = ST.settings;
      const count = (k) => ST.rows.filter((r) => r.state === k).length;
      const today = new Date().toISOString().slice(0, 10);
      const spent = ST.rows.filter((r) => r.ordered_at && r.ordered_at.slice(0, 10) === today).reduce((a, r) => a + Number(r.cost || 0), 0);
      const kpis = `<div class="grid kpis" style="margin-bottom:16px">
        <div class="card kpi" style="--k:var(--info)"><div class="lbl">W kolejce</div><div class="val num">${count("queued")}</div></div>
        <div class="card kpi" style="--k:var(--bad)"><div class="lbl">Do sprawdzenia</div><div class="val num">${count("needs_review") + count("failed")}</div></div>
        <div class="card kpi" style="--k:var(--violet)"><div class="lbl">Zamówione / w drodze</div><div class="val num">${count("ordered") + count("shipped")}</div></div>
        <div class="card kpi" style="--k:var(--good)"><div class="lbl">Wydane dziś u dostawców</div><div class="val num">${zl(spent)}</div><div class="sub">limit ${zl(s.daily_cap)}</div></div></div>`;

      const modeBox = `<div class="card rz-card"><h2>Tryb</h2><p class="small muted">${esc((MODES.find((m) => m[0] === s.mode) || MODES[1])[2])}</p>
        <div class="rz-mode">${MODES.map(([k, l]) => `<button class="btn sm ${s.mode === k ? "primary" : ""}" data-rz-mode="${k}">${l}</button>`).join("")}</div>
        <form class="rz-form" id="rzLimits">
          <label>Maks. koszt jednego zamówienia (zł)<input name="max_order_cost" inputmode="decimal" value="${esc(s.max_order_cost)}"></label>
          <label>Dzienny limit wydatków (zł)<input name="daily_cap" inputmode="decimal" value="${esc(s.daily_cap)}"></label>
          <label>Minimalna marża na zamówieniu (zł)<input name="min_margin" inputmode="decimal" value="${esc(s.min_margin)}"></label>
          <label>Nadawca na paczkach i w e-mailach<input name="sender_name" value="${esc((s.sender || {}).name || "")}" placeholder="Nowoczesny Handel Polski"></label>
          <label>E-mail nadawcy<input name="sender_email" type="email" value="${esc((s.sender || {}).email || "")}"></label>
          <label>Telefon nadawcy<input name="sender_phone" value="${esc((s.sender || {}).phone || "")}"></label>
          <label class="row small"><input type="checkbox" name="bigbuy_sandbox" ${s.bigbuy_sandbox ? "checked" : ""}> BigBuy: konto testowe (sandbox)</label>
          <label class="row small"><input type="checkbox" name="inpost_sandbox" ${s.inpost_sandbox ? "checked" : ""}> InPost: konto testowe (sandbox)</label>
          <div><button class="btn sm primary" type="submit">Zapisz limity</button></div>
        </form></div>`;

      const keysBox = `<div class="card rz-card"><h2>Klucze dostawców</h2><p class="small muted">Wpisujecie je raz. Trafiają zaszyfrowane do Supabase Vault — panel pokazuje tylko, czy są ustawione.</p>
        <div class="rz-keys">${KEYS.map(([k, l, hint]) => `<div class="rz-key"><span>${esc(l)} ${ST.keys[k] ? `<span class="pill" style="--c:var(--good)">ustawiony</span>` : `<span class="pill">brak</span>`}</span>
          <input type="${/pass|key|token/.test(k) ? "password" : "text"}" data-rz-key-input="${k}" placeholder="${esc(hint)}" autocomplete="off">
          <button class="btn sm" data-rz-key="${k}">Zapisz</button></div>`).join("")}</div></div>`;

      const ruleOf = (pid) => ST.rules.find((r) => r.page_id === pid) || { page_id: pid, adapter: "manual", sku: "", unit_cost: "", email_to: "", parcel_size: "small", active: true, variant_skus: {} };
      const priced = ST.pages.filter((p) => Number(p.data && p.data.price) > 0);
      const rules = priced.map((p) => {
        const r = ruleOf(p.id);
        const vs = Object.entries(r.variant_skus || {}).map(([k, v]) => `${k}=${v}`).join("; ");
        return `<tr data-rz-rule="${esc(p.id)}"><td class="strong">${esc(p.name)}<div class="small muted">/p/${esc(p.slug)} · ${zl(p.data.price)}</div></td>
          <td><select name="adapter">${ADAPTERS.map(([k, l]) => `<option value="${k}" ${r.adapter === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
          <td><input name="sku" value="${esc(r.sku || "")}" placeholder="kod u dostawcy"><input name="variant_skus" value="${esc(vs)}" placeholder="Czarny=KOD1; Biały=KOD2" style="margin-top:4px"></td>
          <td><input name="unit_cost" inputmode="decimal" value="${esc(r.unit_cost ?? "")}" placeholder="zł za szt."></td>
          <td><input name="email_to" type="email" value="${esc(r.email_to || "")}" placeholder="zamowienia@hurtownia.pl"></td>
          <td><select name="parcel_size">${[["small", "A (mała)"], ["medium", "B (średnia)"], ["large", "C (duża)"]].map(([k, l]) => `<option value="${k}" ${r.parcel_size === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
          <td><label class="row small"><input type="checkbox" name="active" ${r.active ? "checked" : ""}> aktywna</label></td>
          <td><button class="btn sm" data-rz-save-rule="${esc(p.id)}">Zapisz</button></td></tr>`;
      }).join("");
      const rulesBox = `<div class="card" style="margin-bottom:16px"><div class="rz-card"><h2>Reguły: strona → dostawca</h2><p class="small muted">Dla każdej strony: skąd bierzemy towar, jego kod u dostawcy i ile kosztuje. Bez reguły zamówienie czeka na Was.</p></div>
        ${priced.length ? `<div class="tbl-wrap rz-tbl"><table><thead><tr><th>Strona</th><th>Dostawca</th><th>SKU (i warianty)</th><th>Koszt / szt.</th><th>E-mail hurtowni</th><th>Gabaryt</th><th></th><th></th></tr></thead><tbody>${rules}</tbody></table></div>` : `<div class="rz-log">Brak stron z ceną.</div>`}</div>`;

      const queue = ST.rows.map((r) => `<tr><td class="muted num">${when(r.created_at)}</td><td class="strong">${esc(orderNo(r.order_id))}</td><td>${pill(r.state)}${r.last_error ? `<div class="rz-err">${esc(r.last_error)}</div>` : ""}</td>
        <td>${esc(r.adapter || "—")}${r.supplier_order_id ? `<div class="small muted">${esc(r.supplier_order_id)}</div>` : ""}</td><td class="r num">${zl(r.cost)}</td>
        <td>${r.tracking ? `${esc(r.carrier || "")} ${esc(r.tracking)}` : "—"}</td>
        <td>${["needs_review", "failed", "dry_run"].includes(r.state) ? `<button class="btn sm" data-rz-retry="${esc(r.id)}">${r.state === "dry_run" ? "Zamów teraz" : "Ponów"}</button>` : ""}</td></tr>`).join("");
      const queueBox = `<div class="card" style="margin-bottom:16px">${ST.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Kiedy</th><th>Zamówienie</th><th>Stan</th><th>Dostawca</th><th class="r">Koszt</th><th>Przesyłka</th><th></th></tr></thead><tbody>${queue}</tbody></table></div>` : `<div class="rz-log">Kolejka jest pusta. Pierwsze opłacone zamówienie pojawi się tu samo.</div>`}</div>`;
      const logBox = ST.log.length ? `<div class="card"><div class="rz-log">${ST.log.map((l) => `<div class="${esc(l.level)}">${when(l.created_at)} · ${esc(l.message)}</div>`).join("")}</div></div>` : "";

      return head + kpis + `<div class="rz-grid">${modeBox}${keysBox}</div>` + rulesBox + queueBox + logBox;
    }

    CRM.VIEWS.push(["realizacja", "Realizacja", "orders"]);
    CRM.VIEW_FNS.realizacja = vRealizacja;
    CRM.badgeFns.push(() => ({ realizacja: ST.rows.filter((r) => r.state === "needs_review" || r.state === "failed").length }));

    const num = (v) => { const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };

    async function saveSettings(patch) {
      const { error } = await CRM.SB.from("fulfil_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) { CRM.toast("Nie udało się zapisać: " + error.message); return false; }
      Object.assign(ST.settings, patch);
      CRM.scheduleRender();
      return true;
    }

    async function invoke(body) {
      const { data, error } = await CRM.SB.functions.invoke("fulfil", { body });
      if (error || (data && data.error)) { CRM.toast((data && data.error) || error.message || "Nie udało się"); return null; }
      return data;
    }

    document.addEventListener("submit", async (e) => {
      if (e.target.id !== "rzLimits") return;
      e.preventDefault();
      const fd = new FormData(e.target);
      const ok = await saveSettings({
        max_order_cost: num(fd.get("max_order_cost")), daily_cap: num(fd.get("daily_cap")), min_margin: num(fd.get("min_margin")),
        bigbuy_sandbox: fd.get("bigbuy_sandbox") === "on", inpost_sandbox: fd.get("inpost_sandbox") === "on",
        sender: { name: String(fd.get("sender_name") || "").trim(), email: String(fd.get("sender_email") || "").trim(), phone: String(fd.get("sender_phone") || "").trim() }
      });
      if (ok) CRM.toast("Limity zapisane");
    });

    document.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-rz-reload],[data-rz-run],[data-rz-mode],[data-rz-key],[data-rz-save-rule],[data-rz-retry]");
      if (!t) return;
      if (t.hasAttribute("data-rz-reload")) { ST.loaded = false; load(); return; }
      if (t.hasAttribute("data-rz-run")) {
        t.disabled = true;
        const r = await invoke({});
        t.disabled = false;
        if (r) CRM.toast(r.mode === "off" ? "Realizacja jest wyłączona" : `Gotowe: ${r.processed} zamówień, ${r.tracked} przesyłek sprawdzonych`);
        load();
        return;
      }
      if (t.dataset.rzMode) {
        const m = t.dataset.rzMode;
        if (m === "live" && !confirm(`Na żywo system sam zamawia i płaci u dostawcy (limit ${ST.settings.max_order_cost} zł na zamówienie, ${ST.settings.daily_cap} zł dziennie). Włączyć?`)) return;
        if (await saveSettings({ mode: m })) CRM.toast(`Tryb: ${MODES.find((x) => x[0] === m)[1]}`);
        return;
      }
      if (t.dataset.rzKey) {
        const k = t.dataset.rzKey;
        const input = document.querySelector(`[data-rz-key-input="${k}"]`);
        const v = input ? input.value.trim() : "";
        if (!v && !confirm("Pole jest puste — usunąć zapisany klucz?")) return;
        const { error } = await CRM.SB.rpc("nhp_fulfil_set_secret", { p_key: k, p_value: v });
        if (error) { CRM.toast("Nie udało się zapisać: " + error.message); return; }
        if (input) input.value = "";
        ST.keys[k] = !!v;
        CRM.toast(v ? "Klucz zapisany" : "Klucz usunięty");
        CRM.scheduleRender();
        return;
      }
      if (t.dataset.rzSaveRule) {
        const row = document.querySelector(`[data-rz-rule="${CSS.escape(t.dataset.rzSaveRule)}"]`);
        const val = (n) => row.querySelector(`[name="${n}"]`);
        const variant_skus = Object.fromEntries(String(val("variant_skus").value || "").split(";").map((p) => p.split("=").map((x) => x.trim())).filter((p) => p[0] && p[1]));
        const cost = val("unit_cost").value.trim();
        const rule = {
          page_id: t.dataset.rzSaveRule, adapter: val("adapter").value, sku: val("sku").value.trim() || null, variant_skus,
          unit_cost: cost ? num(cost) : null, email_to: val("email_to").value.trim() || null, parcel_size: val("parcel_size").value,
          active: val("active").checked, updated_at: new Date().toISOString()
        };
        if (rule.adapter === "email" && !rule.email_to) { CRM.toast("Podaj e-mail hurtowni"); return; }
        if (rule.adapter !== "manual" && rule.adapter !== "bigbuy" && rule.unit_cost == null) { CRM.toast("Podaj koszt za sztukę — bez niego system nie policzy marży"); return; }
        const { error } = await CRM.SB.from("fulfil_rules").upsert(rule);
        if (error) { CRM.toast("Nie udało się zapisać: " + error.message); return; }
        const i = ST.rules.findIndex((r) => r.page_id === rule.page_id);
        if (i >= 0) ST.rules[i] = rule; else ST.rules.push(rule);
        CRM.toast("Reguła zapisana");
        return;
      }
      if (t.dataset.rzRetry) {
        const row = ST.rows.find((r) => r.id === t.dataset.rzRetry);
        if (row && row.state === "dry_run" && ST.settings.mode !== "live") { CRM.toast("Najpierw włącz tryb „Na żywo”"); return; }
        t.disabled = true;
        const r = await invoke({ retry: t.dataset.rzRetry });
        t.disabled = false;
        if (r) CRM.toast("Przetworzone — zobacz stan w kolejce");
        load();
      }
    });
  });
})();
