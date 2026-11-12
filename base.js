/* Import z Base (BaseLinker): katalogi i hurtownie z Base → baza produktów → Shopify.
   Przeglądarka rozmawia tylko z /api/base/* (Pages Function). Token Base zostaje w sekretach Cloudflare. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    const IMPORT_BATCH = 100;
    const PUSH_BATCH = 4;
    const U = () => CRM.UI.base || (CRM.UI.base = {
      status: null, sources: null, loading: "", error: "",
      sync: null, syncBusy: false, syncProgress: "",
      source: "", q: "", page: 1, list: null, picked: {}, shopStatus: "szkic", busy: "", progress: "", log: []
    });

    CRM.VIEWS.push(["import-base", "Import z Base", "inbox"]);
    CRM.VIEW_FNS["import-base"] = () => view();

    if (!document.getElementById("base-css")) {
      const css = document.createElement("style");
      css.id = "base-css";
      css.textContent = `
        .bs-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
        .bs-bar select,.bs-bar input[type=search]{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:8px 10px;font:inherit;min-width:0}
        .bs-bar select{max-width:340px}
        .bs-bar input[type=search]{flex:1 1 220px}
        .bs-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
        .bs-act .sp{flex:1}
        .bs-prog{font-weight:600}
        .bs-tbl td.num,.bs-tbl th.num{text-align:right;white-space:nowrap}
        .bs-tbl tr[data-on="true"]{background:color-mix(in srgb,var(--info) 8%,transparent)}
        .bs-tbl td{vertical-align:middle}
        .bs-name{font-weight:600;max-width:420px}
        .bs-sub{display:block;color:var(--muted);font-size:12px;font-weight:500}
        .bs-steps{margin:8px 0 0 18px;padding:0}
        .bs-steps li{margin:4px 0}
        .bs-log{margin-top:12px;font-size:13px}
        .bs-log li{margin:2px 0}
        .bs-bad{color:var(--bad)}
        .bs-pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px}
        .bs-sync{padding:16px 20px;margin-bottom:14px}
        .bs-sync h2{margin:0 0 4px;font-size:18px}
        .bs-sync p{margin:0}
        .bs-sync-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0 8px}
        .bs-sync-row .sp{flex:1}
        .bs-sync-row select{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:6px 8px;font:inherit}
        .bs-check{display:inline-flex;gap:8px;align-items:center;font-weight:600}
        .bs-check input{width:18px;height:18px}
        .bs-sync-stat{font-size:14px}
        .bs-errs{margin-top:8px;font-size:13px}
        .bs-errs summary{cursor:pointer;font-weight:600;color:var(--bad)}
        .bs-errs ul{margin:6px 0 0 18px;padding:0;max-height:220px;overflow:auto}
        .bs-errs li{margin:3px 0}
        @media (max-width:700px){.bs-hide-sm{display:none}}
      `;
      document.head.appendChild(css);
    }

    const esc = (v) => CRM.esc(v);
    function money(n) {
      if (n == null || n === "") return "—";
      return `${Number(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
    }
    async function call(path, method, body) {
      const { panelFetch } = await import("./lib/panel-api.mjs");
      return panelFetch(CRM.SB, path, { method, body });
    }
    function rerender() { CRM.scheduleRender(); }

    function parseSource(value) {
      const [kind, ...rest] = String(value || "").split(":");
      return { kind: kind === "storage" ? "storage" : "inventory", id: rest.join(":") };
    }
    function sourceName(value) {
      const ui = U();
      const { kind, id } = parseSource(value);
      const list = kind === "storage" ? ui.sources?.storages : ui.sources?.inventories;
      return (list || []).find((item) => String(item.id) === id)?.name || id;
    }
    function picked() {
      const ui = U();
      return Object.keys(ui.picked).filter((id) => ui.picked[id]);
    }

    /* ---------- dane ---------- */

    async function boot() {
      const ui = U();
      if (ui.status || ui.loading) return;
      if (window.NHP_LOCAL) {
        ui.status = { configured: false, local: true };
        rerender();
        return;
      }
      ui.loading = "status";
      rerender();
      try {
        ui.status = await call("/api/base/status", "GET");
        if (ui.status.configured) {
          await loadSyncState();
          await loadSources();
        }
      } catch (err) {
        ui.status = { configured: false };
        ui.error = err.message;
      }
      ui.loading = "";
      rerender();
    }

    async function loadSources() {
      const ui = U();
      ui.loading = "sources";
      ui.error = "";
      rerender();
      try {
        ui.sources = await call("/api/base/sources", "GET");
        if (!ui.source) {
          const first = ui.sources.inventories.find((item) => item.is_default) || ui.sources.inventories[0];
          if (first) ui.source = `inventory:${first.id}`;
          else if (ui.sources.storages[0]) ui.source = `storage:${ui.sources.storages[0].id}`;
        }
      } catch (err) {
        ui.error = err.message;
      }
      ui.loading = "";
      rerender();
    }

    async function loadList(page) {
      const ui = U();
      if (!ui.source) { CRM.toast("Wybierz katalog Base."); return; }
      const { kind, id } = parseSource(ui.source);
      ui.loading = "list";
      ui.error = "";
      ui.page = Math.max(1, page || 1);
      rerender();
      try {
        ui.list = await call("/api/base/list", "POST", { kind, id, page: ui.page, q: ui.q });
        ui.picked = {};
      } catch (err) {
        ui.error = err.message;
        ui.list = null;
      }
      ui.loading = "";
      rerender();
    }

    async function runBatches(ids, size, label, fn) {
      const ui = U();
      const parts = [];
      for (let i = 0; i < ids.length; i += size) parts.push(ids.slice(i, i + size));
      let done = 0;
      ui.busy = label;
      ui.log = [];
      for (const part of parts) {
        ui.progress = `${label}: ${done} z ${ids.length}…`;
        rerender();
        try {
          await fn(part);
        } catch (err) {
          ui.log.push({ bad: true, text: err.message });
          if (/Zaloguj|Sesja|nie jest podłączony|BASE_API_TOKEN|SHOPIFY_/i.test(err.message || "")) break;
        }
        done += part.length;
      }
      ui.busy = "";
      ui.progress = "";
    }

    async function importPicked() {
      const ui = U();
      const ids = picked();
      if (!ids.length) { CRM.toast("Zaznacz produkty."); return; }
      const { kind, id } = parseSource(ui.source);
      let created = 0;
      let updated = 0;
      await runBatches(ids, IMPORT_BATCH, "Zapisuję w bazie", async (part) => {
        const res = await call("/api/base/import", "POST", { kind, id, ids: part, name: sourceName(ui.source) });
        created += res.created || 0;
        updated += res.updated || 0;
        for (const missing of res.missing || []) ui.log.push({ bad: true, text: `Base nie oddał produktu ${missing}.` });
      });
      ui.log.unshift({ text: `Zapisano w bazie produktów: ${created} nowych, ${updated} zaktualizowanych.` });
      CRM.toast(`Zapisano: ${created} nowych, ${updated} zaktualizowanych.`);
      await refreshAfter();
    }

    async function pushPicked() {
      const ui = U();
      const ids = picked();
      if (!ids.length) { CRM.toast("Zaznacz produkty."); return; }
      if (!ui.status?.shopify_configured) {
        CRM.toast("Shopify nie jest podłączony. Instrukcja: docs/shopify-ksef.md.");
        return;
      }
      const { kind, id } = parseSource(ui.source);
      // 1) zapis w bazie paczkami po 100 (kilka zapytań do Base), 2) wysyłka z bazy po kilka produktów.
      const productIds = [];
      const names = {};
      await runBatches(ids, IMPORT_BATCH, "Zapisuję w bazie", async (part) => {
        const res = await call("/api/base/import", "POST", { kind, id, ids: part, name: sourceName(ui.source) });
        for (const item of res.products || []) {
          productIds.push(item.product_id);
          names[item.product_id] = (ui.list?.products || []).find((p) => p.id === String(item.base_product_id))?.name || item.base_product_id;
        }
        for (const missing of res.missing || []) ui.log.push({ bad: true, text: `Base nie oddał produktu ${missing}.` });
      });
      const importLog = ui.log;
      let ok = 0;
      let bad = 0;
      await runBatches(productIds, PUSH_BATCH, "Wysyłam do Shopify", async (part) => {
        const res = await call("/api/base/push", "POST", { product_ids: part, status: ui.shopStatus });
        for (const item of res.results || []) {
          const label = names[item.product_id] || item.base_product_id || item.product_id;
          if (item.ok) {
            ok += 1;
            if (item.warning) ui.log.push({ text: `${label}: ${item.warning}` });
          } else {
            bad += 1;
            ui.log.push({ bad: true, text: `${label}: ${item.error}` });
          }
        }
      });
      ui.log = importLog.concat(ui.log);
      ui.log.unshift({ text: `Wysłano do Shopify: ${ok}${bad ? `, błędy: ${bad}` : ""}.`, bad: bad > 0 && !ok });
      CRM.toast(bad ? `Wysłano ${ok}, błędy: ${bad}.` : `Wysłano do Shopify: ${ok}.`);
      await refreshAfter();
    }

    async function refreshAfter() {
      const ui = U();
      if (ui.list) {
        const keep = ui.log;
        await loadList(ui.page);
        ui.log = keep;
      }
      try { await CRM.reload(); } catch { /* baza produktów odświeży się przy wejściu */ }
      rerender();
    }

    /* ---------- automatyczna synchronizacja ---------- */

    const INTERVALS = [1, 2, 4, 6, 12, 24];
    const fmtDate = (iso) => {
      if (!iso) return "—";
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function loadSyncState() {
      const ui = U();
      try {
        const res = await call("/api/base/sync-status", "GET");
        ui.sync = res.state;
      } catch (err) {
        ui.sync = null;
        ui.syncError = /base_sync_state|PGRST|42P01|Supabase 4/i.test(err.message || "") ? "Brakuje tabeli synchronizacji — trzeba zastosować migrację base_autosync." : err.message;
      }
    }

    async function saveSyncSettings(change) {
      const ui = U();
      if (!ui.sync) return;
      const patch = { updated_at: new Date().toISOString() };
      if ("enabled" in change) patch.enabled = Boolean(change.enabled);
      if ("interval_hours" in change && INTERVALS.includes(change.interval_hours)) {
        patch.interval_hours = change.interval_hours;
        // Następna synchronizacja liczona od ostatniej, żeby skrócenie odstępu działało od razu.
        const from = Date.parse(ui.sync.last_finished_at || "") || Date.now();
        patch.next_run_at = new Date(Math.max(from + change.interval_hours * 3600_000, Date.now())).toISOString();
      }
      const { data, error } = await CRM.SB.from("base_sync_state").update(patch).eq("id", 1).select();
      if (error) { CRM.toast("Nie udało się zapisać ustawień synchronizacji."); return; }
      ui.sync = { ...ui.sync, ...(Array.isArray(data) && data[0] ? data[0] : patch) };
      CRM.toast(patch.enabled === false ? "Automatyczna synchronizacja wyłączona." : "Ustawienia synchronizacji zapisane.");
      rerender();
    }

    async function syncNow() {
      const ui = U();
      if (ui.syncBusy) return;
      ui.syncBusy = true;
      ui.syncProgress = "Zaczynam synchronizację…";
      rerender();
      let first = true;
      let busyWaits = 0;
      try {
        for (let step = 0; step < 400; step++) {
          const res = await call("/api/base/sync", "POST", first ? { now: true } : {});
          if (res.busy) {
            // Krok trwa w innym miejscu (cron) — chwila przerwy.
            if (++busyWaits > 40) break;
            ui.syncProgress = "Synchronizacja trwa w tle, czekam…";
            rerender();
            await sleep(3000);
            if (first) continue;
          } else {
            first = false;
            busyWaits = 0;
          }
          ui.sync = res.state || ui.sync;
          const st = ui.sync || {};
          if (!st.running) break;
          ui.syncProgress = `Sprawdzono ${st.run_checked || 0} produktów, zmienionych ${st.run_changed || 0}…`;
          rerender();
        }
        const st = ui.sync || {};
        const errs = (st.last_errors || []).length;
        CRM.toast(`Synchronizacja zakończona: sprawdzono ${st.last_checked || 0}, zmieniono ${st.last_changed || 0}${errs ? `, błędy: ${errs}` : ""}.`);
      } catch (err) {
        CRM.toast(err.message);
      }
      ui.syncBusy = false;
      ui.syncProgress = "";
      try { await CRM.reload(); } catch { /* odświeży się przy wejściu */ }
      rerender();
    }

    function syncCard() {
      const ui = U();
      if (ui.syncError && !ui.sync) return `<div class="banner">${esc(ui.syncError)}</div>`;
      const st = ui.sync;
      if (!st) return "";
      const errors = (st.running ? st.run_errors : st.last_errors) || [];
      const status = ui.syncBusy
        ? esc(ui.syncProgress)
        : st.running
          ? `Trwa: sprawdzono ${st.run_checked || 0}, zmieniono ${st.run_changed || 0}.`
          : st.last_finished_at
            ? `Ostatnio: <b>${fmtDate(st.last_finished_at)}</b> · sprawdzono <b>${st.last_checked || 0}</b> · zmieniono <b>${st.last_changed || 0}</b>`
            : "Jeszcze nie było synchronizacji.";
      const next = st.enabled ? `Następna: ${fmtDate(st.next_run_at)}` : "Wyłączona — ceny i stany nie aktualizują się same.";
      const errList = errors.length
        ? `<details class="bs-errs"><summary>Błędy z ostatniej synchronizacji (${errors.length})</summary><ul>${errors.slice().reverse().map((e) =>
            `<li><span class="muted">${fmtDate(e.at)}</span> ${e.name ? `<b>${esc(e.name)}</b>: ` : ""}${esc(e.text)}</li>`).join("")}</ul></details>`
        : "";
      return `<div class="card bs-sync">
        <div class="bs-sync-head">
          <div><h2>Automatyczna synchronizacja cen i stanów</h2>
            <p class="small muted">Panel sam pobiera z Base aktualne ceny i stany produktów, które są już w Shopify, i aktualizuje sklep. Gdy w hurtowni zabraknie towaru: stan 0 w Shopify, a aktywny produkt przechodzi w szkic. Gdy towar wróci, produkt wraca do sprzedaży sam.</p></div>
        </div>
        <div class="bs-sync-row">
          <label class="bs-check"><input type="checkbox" data-base-sync-enabled ${st.enabled ? "checked" : ""} ${ui.syncBusy ? "disabled" : ""}> Włączona</label>
          <label class="small">Co
            <select data-base-sync-interval ${ui.syncBusy ? "disabled" : ""} aria-label="Co ile godzin">
              ${INTERVALS.map((h) => `<option value="${h}" ${Number(st.interval_hours) === h ? "selected" : ""}>${h} h</option>`).join("")}
            </select>
          </label>
          <span class="sp"></span>
          <button class="btn primary" type="button" data-base="sync-now" ${ui.syncBusy || st.running ? "disabled" : ""}>Synchronizuj teraz</button>
        </div>
        <p class="bs-sync-stat">${status}<span class="bs-sub">${esc(next)}</span></p>
        ${errList}
      </div>`;
    }

    /* ---------- widok ---------- */

    function setupCard(local) {
      return `<div class="card" style="padding:18px 20px;margin-bottom:14px">
        <h2 style="margin:0 0 6px">Podłącz Base</h2>
        <p style="margin:0">${local
          ? "To jest lokalna piaskownica bez serwera — import z Base działa dopiero na panelu w Cloudflare."
          : "Brakuje tokenu API Base. Panel nie trzyma go w przeglądarce — wkleja się go raz jako sekret serwera."}</p>
        <ol class="bs-steps">
          <li>W Base wejdź w <b>Moje konto → API</b> i kliknij <b>Wygeneruj nowy token</b>. Nazwij go np. „Centrala NHP”.</li>
          <li>Cloudflare → Workers &amp; Pages → projekt <b>centrala-crm</b> → Settings → Variables and Secrets → <b>Add</b>. Typ <b>Secret</b>, nazwa <code>BASE_API_TOKEN</code>, wartość: token z Base.</li>
          <li>Zrób ponowne wdrożenie (Deployments → Retry deployment) i odśwież tę stronę.</li>
        </ol>
        <p class="small muted" style="margin:8px 0 0">Szczegóły i sekrety Shopify: plik docs/base.md w repozytorium.</p>
      </div>`;
    }

    function sourceSelect() {
      const ui = U();
      const inv = ui.sources?.inventories || [];
      const st = ui.sources?.storages || [];
      const opt = (value, label) => `<option value="${esc(value)}" ${ui.source === value ? "selected" : ""}>${esc(label)}</option>`;
      return `<select data-base-source aria-label="Katalog Base">
        ${inv.length ? `<optgroup label="Katalogi Base">${inv.map((item) => opt(`inventory:${item.id}`, `${item.name}${item.is_default ? " (domyślny)" : ""}`)).join("")}</optgroup>` : ""}
        ${st.length ? `<optgroup label="Hurtownie i sklepy podpięte w Base">${st.map((item) => opt(`storage:${item.id}`, item.name)).join("")}</optgroup>` : ""}
        ${!inv.length && !st.length ? `<option value="">Brak katalogów w Base</option>` : ""}
      </select>`;
    }

    function statusCell(p) {
      if (p.shopify_product_id) {
        const link = p.shopify_url ? `<a href="${esc(p.shopify_url)}" target="_blank" rel="noopener">w Shopify</a>` : "w Shopify";
        return `<span class="pill" style="--c:var(--good)">${link}</span>${p.shopify_error ? `<span class="bs-sub bs-bad">${esc(p.shopify_error)}</span>` : ""}`;
      }
      if (p.product_id) {
        return `<span class="pill" style="--c:var(--info)">w bazie</span>${p.shopify_error ? `<span class="bs-sub bs-bad">${esc(p.shopify_error)}</span>` : ""}`;
      }
      return `<span class="pill" style="--c:var(--grey)">nowy</span>`;
    }

    function listHtml() {
      const ui = U();
      if (ui.loading === "list") return `<div class="card"><div class="empty"><b>Wczytuję produkty z Base…</b>Duży katalog może potrwać kilka sekund.</div></div>`;
      if (!ui.list) return `<div class="card"><div class="empty"><b>Wybierz katalog i naciśnij „Pokaż produkty”</b>Lista przychodzi prosto z Base. Nic się nie zapisze, dopóki nie zaznaczysz produktów.</div></div>`;
      const rows = ui.list.products || [];
      if (!rows.length) return `<div class="card"><div class="empty"><b>Brak produktów</b>${ui.q ? "Nic nie pasuje do szukanej nazwy." : "Ten katalog w Base jest pusty."}</div></div>`;
      const all = rows.every((p) => ui.picked[p.id]);
      const body = rows.map((p) => `<tr data-on="${ui.picked[p.id] ? "true" : "false"}">
          <td><input type="checkbox" data-base-pick="${esc(p.id)}" ${ui.picked[p.id] ? "checked" : ""} aria-label="Zaznacz ${esc(p.name)}"></td>
          <td class="bs-name">${esc(p.name || "—")}<span class="bs-sub">ID w Base: ${esc(p.id)}</span></td>
          <td class="bs-hide-sm">${esc(p.sku || "—")}</td>
          <td class="bs-hide-sm">${esc(p.ean || "—")}</td>
          <td class="num">${money(p.price)}</td>
          <td class="num">${p.stock == null ? "—" : `${p.stock} szt.`}</td>
          <td>${statusCell(p)}</td>
        </tr>`).join("");
      const pager = (ui.page > 1 || ui.list.has_more)
        ? `<div class="bs-pager">
            <button class="btn sm" type="button" data-base="page" data-page="${ui.page - 1}" ${ui.page > 1 ? "" : "disabled"}>← Poprzednie</button>
            <span class="small muted">Strona ${ui.page} (po 1000 z Base)</span>
            <button class="btn sm" type="button" data-base="page" data-page="${ui.page + 1}" ${ui.list.has_more ? "" : "disabled"}>Następne →</button>
          </div>`
        : "";
      return `<div class="card tbl-wrap"><table class="bs-tbl"><thead><tr>
          <th><input type="checkbox" data-base-all ${all ? "checked" : ""} aria-label="Zaznacz wszystkie"></th>
          <th>Produkt</th><th class="bs-hide-sm">SKU</th><th class="bs-hide-sm">EAN</th><th class="num">Cena</th><th class="num">Stan</th><th>Status</th>
        </tr></thead><tbody>${body}</tbody></table></div>${pager}`;
    }

    function view() {
      const ui = U();
      if (!ui.status && !ui.loading) setTimeout(boot, 0);
      const head = `<div class="top"><div><h1>Import z Base</h1><p>Produkty z katalogów i hurtowni podpiętych w Base: podgląd, zapis w bazie produktów i wysyłka do Shopify.</p></div>
        <div class="row">${ui.status?.configured ? `<button class="btn" type="button" data-base="sources" ${ui.loading ? "disabled" : ""}>Odśwież katalogi</button>` : ""}<button class="btn" type="button" data-nav="baza-produktow">Baza produktów</button></div></div>`;
      const err = ui.error ? `<div class="banner">${esc(ui.error)}</div>` : "";
      if (!ui.status || ui.loading === "status") return head + `<div class="card"><div class="empty"><b>Sprawdzam połączenie z Base…</b></div></div>`;
      if (!ui.status.configured) return head + err + setupCard(ui.status.local);
      const shop = ui.status.shopify_configured
        ? ""
        : `<div class="banner">Shopify nie jest podłączony — produkty możesz zapisać w bazie, ale „Wyślij do Shopify” zadziała po dodaniu sekretów SHOPIFY_STORE_DOMAIN i SHOPIFY_ADMIN_TOKEN (docs/shopify-ksef.md).</div>`;
      const n = picked().length;
      const busy = Boolean(ui.busy) || ui.loading === "list";
      const bar = `<div class="bs-bar">
          ${ui.loading === "sources" ? `<span class="muted">Wczytuję katalogi…</span>` : sourceSelect()}
          <input type="search" data-base-q placeholder="Szukaj po nazwie w Base" value="${esc(ui.q)}" aria-label="Szukaj po nazwie">
          <button class="btn primary" type="button" data-base="list" ${busy || !ui.source ? "disabled" : ""}>Pokaż produkty</button>
        </div>`;
      const actions = ui.list?.products?.length
        ? `<div class="bs-act">
            <span class="bs-prog">${ui.progress ? esc(ui.progress) : `Zaznaczone: ${n}`}</span>
            <span class="sp"></span>
            <label class="small">Status w Shopify
              <select data-base-shopstatus>
                <option value="szkic" ${ui.shopStatus === "szkic" ? "selected" : ""}>Szkic (niewidoczny w sklepie)</option>
                <option value="aktywny" ${ui.shopStatus === "aktywny" ? "selected" : ""}>Aktywny (od razu w sprzedaży)</option>
              </select>
            </label>
            <button class="btn" type="button" data-base="import" ${n && !busy ? "" : "disabled"}>Zapisz w bazie (${n})</button>
            <button class="btn primary" type="button" data-base="push" ${n && !busy && ui.status.shopify_configured ? "" : "disabled"}>Wyślij do Shopify (${n})</button>
          </div>`
        : "";
      const log = ui.log.length
        ? `<ul class="bs-log card" style="padding:12px 16px 12px 32px">${ui.log.slice(0, 30).map((item) => `<li class="${item.bad ? "bs-bad" : ""}">${esc(item.text)}</li>`).join("")}</ul>`
        : "";
      return head + err + shop + syncCard() + bar + actions + log + listHtml() +
        `<p class="small muted">Ponowny import tego samego produktu aktualizuje go w bazie (nazwę, cenę, stan, zdjęcia, opis, parametry, warianty) — nie tworzy kopii. Status lejka, nazwa katalogowa i karta strony zostają. Produkt, który jest już w Shopify, po imporcie sam wyśle tam zmiany. Cena to cena brutto z domyślnej grupy cenowej katalogu w Base.</p>`;
    }

    /* ---------- zdarzenia ---------- */

    document.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-base]");
      if (!t || t.disabled) return;
      const act = t.dataset.base;
      if (act === "sources") return loadSources();
      if (act === "list") return loadList(1);
      if (act === "page") return loadList(Number(t.dataset.page) || 1);
      if (act === "import") return importPicked();
      if (act === "push") return pushPicked();
      if (act === "sync-now") return syncNow();
    });
    document.addEventListener("change", (e) => {
      const ui = U();
      const t = e.target;
      if (t.matches?.("[data-base-source]")) { ui.source = t.value; ui.list = null; ui.picked = {}; ui.log = []; rerender(); return; }
      if (t.matches?.("[data-base-sync-enabled]")) { saveSyncSettings({ enabled: t.checked }); return; }
      if (t.matches?.("[data-base-sync-interval]")) { saveSyncSettings({ interval_hours: Number(t.value) }); return; }
      if (t.matches?.("[data-base-shopstatus]")) { ui.shopStatus = t.value === "aktywny" ? "aktywny" : "szkic"; return; }
      if (t.matches?.("[data-base-pick]")) { ui.picked[t.dataset.basePick] = t.checked; rerender(); return; }
      if (t.matches?.("[data-base-all]")) {
        for (const p of ui.list?.products || []) ui.picked[p.id] = t.checked;
        rerender();
      }
    });
    document.addEventListener("input", (e) => {
      if (e.target.matches?.("[data-base-q]")) U().q = e.target.value;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches?.("[data-base-q]")) { e.preventDefault(); loadList(1); }
    });
  });
})();
