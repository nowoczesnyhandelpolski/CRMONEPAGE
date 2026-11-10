/* Baza produktów, aukcje, import z wtyczki, eksport i klucze API. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    const T = () => CRM.UI.trade || (CRM.UI.trade = { tier: "s1", status: "all", category: "all", q: "", selected: {}, format: "staging", videoFormat: "9:16", seconds: 18, detail: null, freshKey: "" });
    CRM.S.trade = { products: [], auctions: [], batches: [], items: [], categories: [], commissions: [], keys: [], accounts: [], error: "" };

    CRM.VIEWS.push(
      ["baza-produktow", "Baza produktów", "products"],
      ["aukcje", "Aukcje", "orders"],
      ["import-wtyczki", "Import", "inbox"],
      ["eksport", "Eksport", "down"],
      ["klucze-api", "Klucze API", "key"]
    );
    CRM.VIEW_FNS["baza-produktow"] = () => viewProducts();
    CRM.VIEW_FNS.aukcje = () => viewAuctions();
    CRM.VIEW_FNS["import-wtyczki"] = () => viewImport();
    CRM.VIEW_FNS.eksport = () => viewExport();
    CRM.VIEW_FNS["klucze-api"] = () => viewKeys();
    CRM.badgeFns.push(() => ({
      "import-wtyczki": CRM.S.trade.items.filter((i) => i.status === "flagged").length
    }));

    let P = null;
    let tiers = null;
    let Ann = null;
    const dash = CRM.VIEW_FNS.pulpit;
    if (dash) {
      CRM.VIEW_FNS.pulpit = function () {
        let note = "";
        if (Ann) {
          let stored = "";
          try { stored = localStorage.getItem(Ann.BANNER_STORAGE_KEY) || ""; } catch { stored = ""; }
          if (!Ann.bannerDismissed(stored)) note = Ann.extensionAnnounceHtml(CRM.esc, { dismiss: true });
        }
        return note + dash();
      };
    }
    if (!document.getElementById("ext-ann-css")) {
      const css = document.createElement("style");
      css.id = "ext-ann-css";
      css.textContent = "";
      document.head.appendChild(css);
    }
    CRM.readyFns.push(async () => {
      P = await import("./lib/pricing.mjs");
      const ui = await import("./lib/tier-ui.mjs");
      Ann = await import("./lib/extension-announce.mjs");
      tiers = ui;
      ui.ensureTierCss();
      const annCss = document.getElementById("ext-ann-css");
      if (annCss) annCss.textContent = Ann.EXT_ANN_CSS;
      await reload();
      const flag = new URLSearchParams(location.search).get("allegro");
      if (flag === "ok") CRM.toast("Konto Allegro podłączone.");
      if (flag === "blad") CRM.toast("Nie udało się podłączyć Allegro.");
      if (flag) history.replaceState(null, "", location.pathname + location.hash);
    });

    async function reload() {
      const sb = CRM.SB;
      if (!sb?.from) return;
      const load = async (table, query) => {
        const { data, error } = await query;
        if (error) {
          const msg = String(error.message || error);
          if (/schema cache|does not exist|42P01|relation/i.test(msg)) CRM.S.trade.error = "Brakuje tabel handlu. W Supabase → SQL Editor uruchom ponownie cały plik supabase.sql.";
          else CRM.S.trade.error = "Nie udało się wczytać danych handlu: " + msg;
          return [];
        }
        return data || [];
      };
      const t = CRM.S.trade;
      t.products = await load("products", sb.from("products").select("*").order("updated_at", { ascending: false }).limit(500));
      t.auctions = await load("auctions", sb.from("auctions").select("*").order("updated_at", { ascending: false }).limit(500));
      t.batches = await load("batches", sb.from("offer_import_batches").select("*").order("created_at", { ascending: false }).limit(100));
      t.items = await load("items", sb.from("offer_import_items").select("*").order("pos").limit(500));
      t.categories = await load("categories", sb.from("work_categories").select("*").order("position"));
      t.commissions = await load("commissions", sb.from("category_commissions").select("*").order("label"));
      t.keys = await load("keys", sb.from("api_keys").select("id,label,created_at,last_used_at,revoked_at").order("created_at", { ascending: false }));
      t.accounts = await load("accounts", sb.from("allegro_accounts").select("id,shop,login,seller_id,expires_at,last_error").order("created_at", { ascending: false }));
    }

    function top(title, sub, actions) {
      return `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions || ""}</div></div>`;
    }
    function banner() {
      return CRM.S.trade.error ? `<div class="banner">${CRM.esc(CRM.S.trade.error)}</div>` : "";
    }
    function money(n) {
      if (n == null || n === "") return "—";
      return `${Number(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
    }
    function selectedIds() {
      return Object.keys(T().selected).filter((id) => T().selected[id]);
    }

    async function call(path, method, body) {
      const { panelFetch } = await import("./lib/panel-api.mjs");
      return panelFetch(CRM.SB, path, { method, body });
    }

    function sourceOfProduct(p) {
      return {
        catalog_name: p.catalog_name || p.name,
        name: p.name,
        price: p.price,
        price_before_promo: p.price_before_promo,
        delivery_cost: p.delivery_cost,
        shipping_time: p.shipping_time,
        ean: p.ean,
        producer: p.producer,
        category: p.category,
        parameters: p.params || [],
        images: p.images || [],
        description_sections: p.description_sections || [],
        source_link: p.source_link,
        video_url: p.generated?.video || "",
        video_rights: false,
        origin: "import"
      };
    }
    function sourceOfAuction(a) {
      return { ...sourceOfProduct(a), origin: a.origin };
    }

    async function makePage(source, productId) {
      const { draftFromSource } = await import("./lib/page-draft.mjs");
      const { uniqueSlug } = await import("./lib/site-model.mjs");
      const draft = draftFromSource(source, { own: source.origin === "own" });
      if (CRM.loadPages) await CRM.loadPages();
      const slug = uniqueSlug(draft.name, (CRM.S.pagesList || []).map((p) => p.slug));
      const id = CRM.uid("pg");
      const { error } = await CRM.SB.from("pages").insert({ id, slug, name: draft.name, status: "draft", product_id: productId || null, data: draft.data });
      if (error) { CRM.toast("Nie udało się utworzyć szkicu strony."); return; }
      if (CRM.loadPages) await CRM.loadPages();
      CRM.UI.genId = id;
      location.hash = "generator";
      CRM.toast("Szkic strony zapisany. Publikacja zostaje ręczna.");
    }

    async function startGeneration({ tier, page_id, product_id }) {
      if (window.NHP_LOCAL) { CRM.toast("Generowanie AI działa na Cloudflare, nie w lokalnej piaskownicy."); return; }
      try {
        CRM.toast("Piszę tekst…");
        let res = await call("/api/generate", "POST", { tier, page_id, product_id });
        let guard = 0;
        while (res.job?.status === "running" && guard < 8) {
          CRM.toast(`Zdjęcie AI ${guard + 1}…`);
          res = await call(`/api/generate/${res.job.id}`, "POST", {});
          guard++;
        }
        const video = res.job?.result?.video === "panel" ? " Możesz teraz złożyć wideo w panelu." : "";
        CRM.toast((res.job?.status === "ready" ? "Generacja gotowa." : (res.job?.error || "Generacja częściowa.")) + video);
        if (CRM.loadPages) await CRM.loadPages();
        await reload();
        CRM.scheduleRender();
      } catch (err) {
        CRM.toast(err.message || "Generacja nie powiodła się.");
      }
    }

    async function openVideo(spec) {
      try {
        const { buildStoryboard } = await import("./lib/video-storyboard.mjs");
        const { renderProductVideo, posterBlob } = await import("./video-renderer.js");
        const storyboard = buildStoryboard({
          title: spec.title,
          price: spec.price,
          omnibus: spec.omnibus,
          benefits: spec.benefits || [],
          images: spec.images || [],
          format: T().videoFormat,
          seconds: Number(T().seconds) || 18,
          accent: "#ff5a00",
          music: false
        });
        CRM.toast("Składam wideo w tej przeglądarce…");
        const file = await renderProductVideo(storyboard);
        const poster = await posterBlob(storyboard);
        const folder = spec.productId || spec.pageId || "wideo";
        const path = `${folder}/${crypto.randomUUID()}.${file.ext}`;
        const up = await CRM.SB.storage.from("media").upload(path, file.blob, { contentType: file.blob.type || "video/webm" });
        if (up.error) { CRM.toast("Nie udało się wgrać wideo. Wgraj supabase.sql (kubełek media)."); return; }
        const url = CRM.SB.storage.from("media").getPublicUrl(path).data.publicUrl;
        let posterUrl = "";
        if (poster) {
          const pp = `${folder}/${crypto.randomUUID()}.jpg`;
          const up2 = await CRM.SB.storage.from("media").upload(pp, poster, { contentType: "image/jpeg" });
          if (!up2.error) posterUrl = CRM.SB.storage.from("media").getPublicUrl(pp).data.publicUrl;
        }
        await CRM.SB.from("media").insert({ product_id: spec.productId || null, page_id: spec.pageId || null, kind: "video", bucket: "media", path, public_url: url, mime: file.blob.type, meta: { format: storyboard.format, via: file.via, music: false } });
        if (spec.productId) {
          const prod = CRM.S.trade.products.find((p) => p.id === spec.productId);
          const generated = { ...(prod?.generated || {}), video: url, poster: posterUrl };
          await CRM.SB.from("products").update({ generated, updated_at: new Date().toISOString() }).eq("id", spec.productId);
        }
        if (spec.pageId) {
          if (CRM.loadPages) await CRM.loadPages();
          const page = (CRM.S.pagesList || []).find((p) => p.id === spec.pageId);
          if (page) {
            const data = { ...(page.data || {}), video: { url, poster: posterUrl, rights: spec.rights === true } };
            await CRM.SB.from("pages").update({ data, updated_at: new Date().toISOString() }).eq("id", spec.pageId);
            if (CRM.loadPages) await CRM.loadPages();
          }
        }
        await reload();
        CRM.toast(`Wideo zapisane (${file.ext.toUpperCase()}, ${storyboard.format}).`);
        CRM.scheduleRender();
      } catch (err) {
        CRM.toast(err.message || "Nie udało się złożyć wideo.");
      }
    }

    CRM.makePageFrom = makePage;
    CRM.startGeneration = startGeneration;
    CRM.openVideo = openVideo;
    CRM.tierHtml = () => (tiers ? tiers.renderTierPicker(T().tier || "s1") : "");

    function tierBlock() {
      return tiers ? tiers.renderTierPicker(T().tier || "s1") : "";
    }
    function videoFields() {
      return `<div class="row">
        <label class="f"><span class="small muted">Kadr</span><select id="vid-format"><option value="9:16" ${T().videoFormat === "9:16" ? "selected" : ""}>9:16</option><option value="1:1" ${T().videoFormat === "1:1" ? "selected" : ""}>1:1</option></select></label>
        <label class="f"><span class="small muted">Długość</span><select id="vid-seconds">${[15, 18, 24, 30].map((n) => `<option value="${n}" ${Number(T().seconds) === n ? "selected" : ""}>${n} s</option>`).join("")}</select></label>
      </div>`;
    }

    function viewProducts() {
      const q = (T().q || "").toLowerCase();
      const rows = CRM.S.trade.products.filter((p) => !q || `${p.catalog_name} ${p.name} ${p.ean} ${p.producer}`.toLowerCase().includes(q));
      const body = rows.map((p) => `<tr data-nhp="open" data-kind="product" data-id="${p.id}">
        <td class="strong">${CRM.esc(p.catalog_name || p.name)}</td>
        <td>${CRM.esc(p.ean || "—")}</td>
        <td class="num">${money(p.price)}</td>
        <td class="num">${money(p.base_price)}</td>
        <td>${CRM.esc(p.producer || "—")}</td>
        <td>${p.status === "flagged" ? '<span class="pill" style="--c:var(--bad)">Brak ceny</span>' : CRM.esc(p.status || "")}</td>
      </tr>`).join("");
      const detail = detailCard();
      return top("Baza produktów", "Katalog wewnętrzny. Nazwa katalogowa zostaje taka, jak na źródle. Osobno od zamówień w CRM.", `<button class="btn" type="button" data-nhp="reload">Odśwież</button>`) +
        banner() + detail +
        `<div class="toolbar"><label class="search">${CRM.ic("search", 16)}<input id="q-trade" data-trade-q placeholder="Nazwa, EAN, producent" value="${CRM.esc(T().q || "")}"></label></div>` +
        (rows.length ? `<div class="card tbl-wrap"><table><thead><tr><th>Nazwa katalogowa</th><th>EAN</th><th>Cena</th><th>Bazowa</th><th>Producent</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card"><div class="empty"><b>Pusta baza</b>Zaimportuj ofertę wtyczką albo dodaj ją z aukcji.</div></div>`);
    }

    function detailCard() {
      const d = T().detail;
      if (!d) return "";
      if (d.kind === "product") {
        const p = CRM.S.trade.products.find((x) => x.id === d.id);
        if (!p) return "";
        return `<section class="card pad" style="margin-bottom:14px">
          <div class="sec-h"><h2>${CRM.esc(p.catalog_name || p.name)}</h2><button class="btn sm" type="button" data-nhp="close">Zamknij</button></div>
          <p class="muted small">EAN ${CRM.esc(p.ean || "—")} · ${CRM.esc(p.category || "bez kategorii")} · dostawa ${money(p.delivery_cost)} · bazowa ${money(p.base_price)}</p>
          ${tierBlock()}
          <div class="row">
            <button class="btn primary" type="button" data-nhp="page" data-kind="product" data-id="${p.id}">Zrób stronę</button>
            <button class="btn" type="button" data-nhp="generate" data-kind="product" data-id="${p.id}">Generuj</button>
            <button class="btn" type="button" data-nhp="video" data-kind="product" data-id="${p.id}">Złóż wideo</button>
          </div>
          ${videoFields()}
          <p class="small muted">S1 to sam tekst. S1 Pro dokłada 1 zdjęcie AI. S1 Max dokłada 5 zdjęć i każe złożyć wideo tutaj, nie w zewnętrznym serwisie. Cudze zdjęcia na stronie dostają brak prawa, dopóki go nie potwierdzisz.</p>
        </section>`;
      }
      return "";
    }

    function viewAuctions() {
      const ui = T();
      const q = (ui.q || "").toLowerCase();
      const rows = CRM.S.trade.auctions.filter((a) => {
        if (ui.status !== "all" && a.status !== ui.status) return false;
        if (ui.category !== "all" && a.work_category_id !== ui.category) return false;
        return !q || `${a.catalog_name} ${a.name} ${a.ean} ${a.category}`.toLowerCase().includes(q);
      });
      const cats = CRM.S.trade.categories.map((c) => `<option value="${c.id}" ${ui.category === c.id ? "selected" : ""}>${CRM.esc(c.name)}</option>`).join("");
      const body = rows.map((a) => `<tr>
        <td data-stop><input type="checkbox" data-pick="${a.id}" ${ui.selected[a.id] ? "checked" : ""}></td>
        <td class="strong">${CRM.esc(a.catalog_name || a.name || "—")}</td>
        <td>${CRM.esc(a.status || "")}</td>
        <td class="num">${money(a.price)}</td>
        <td class="num">${money(a.base_price)}</td>
        <td>${CRM.esc(CRM.S.trade.categories.find((c) => c.id === a.work_category_id)?.name || "—")}</td>
        <td class="row">
          <button class="btn sm" type="button" data-nhp="page" data-kind="auction" data-id="${a.id}">Zrób stronę</button>
          <button class="btn sm" type="button" data-nhp="draft" data-id="${a.id}">Szkic Allegro</button>
          <button class="btn sm" type="button" data-nhp="fee" data-id="${a.id}">Podgląd opłaty</button>
        </td>
      </tr>`).join("");
      const comm = CRM.S.trade.commissions.map((c) => `<tr>
        <td>${CRM.esc(c.label)}</td><td class="num">${CRM.esc(String(c.rate_pct))}%</td><td class="muted small">${CRM.esc(c.category_key)}</td>
        <td><button class="btn sm danger" type="button" data-nhp="del-comm" data-id="${c.id}">Usuń</button></td>
      </tr>`).join("");
      const accounts = CRM.S.trade.accounts.map((a) => `<option value="${a.id}">${CRM.esc(a.login || a.shop || a.id)}</option>`).join("");
      return top("Aukcje", "Oferty własne i zaimportowane. Publikacja na Allegro jest osobnym krokiem.", `<button class="btn" type="button" data-nhp="allegro-connect">Połącz Allegro</button><button class="btn" type="button" data-nhp="reload">Odśwież</button>`) +
        banner() +
        `<div class="card pad" style="margin-bottom:14px">
          <div class="sec-h"><h2>Prowizje kategorii</h2><span class="hint">Cena sprzedaży = cena bazowa / (1 − prowizja). Prowizja to procent ceny końcowej. Pusta tabela nie dostaje stawki z kapelusza.</span></div>
          <div class="row">
            <input id="comm-label" placeholder="Nazwa kategorii" style="border:1px solid var(--line);border-radius:10px;padding:8px 10px">
            <input id="comm-key" placeholder="Klucz (id kolejki albo id Allegro)" style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-width:220px">
            <input id="comm-rate" inputmode="decimal" placeholder="%" style="width:80px;border:1px solid var(--line);border-radius:10px;padding:8px 10px">
            <button class="btn" type="button" data-nhp="add-comm">Dodaj stawkę</button>
          </div>
          ${comm ? `<div class="tbl-wrap"><table><thead><tr><th>Kategoria</th><th>Stawka</th><th>Klucz</th><th></th></tr></thead><tbody>${comm}</tbody></table></div>` : `<p class="muted">Brak stawek.</p>`}
        </div>
        <div class="toolbar">
          <label class="search">${CRM.ic("search", 16)}<input id="q-trade" data-trade-q placeholder="Nazwa, EAN" value="${CRM.esc(ui.q || "")}"></label>
          <select id="auc-status"><option value="all">Każdy status</option>${["draft", "flagged", "inactive", "active", "ended"].map((s) => `<option value="${s}" ${ui.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          <select id="auc-cat"><option value="all">Każda kolejka</option>${cats}</select>
          <input id="new-cat" placeholder="Nowa kolejka" style="border:1px solid var(--line);border-radius:10px;padding:8px 10px">
          <button class="btn sm" type="button" data-nhp="add-cat">Dodaj kolejkę</button>
          <button class="btn sm" type="button" data-nhp="assign">Przypisz zaznaczone</button>
          <button class="btn sm" type="button" data-nhp="split">Wydziel zaznaczone do nowej kolejki</button>
          <button class="btn sm primary" type="button" data-nhp="set-price">Ustaw cenę</button>
          <select id="allegro-account"><option value="">Konto Allegro</option>${accounts}</select>
          <select id="handling"><option value="">Czas realizacji</option><option>PT24H</option><option>PT48H</option><option>PT72H</option></select>
        </div>` +
        (rows.length ? `<div class="card tbl-wrap"><table><thead><tr><th></th><th>Nazwa katalogowa</th><th>Status</th><th>Cena</th><th>Bazowa</th><th>Kolejka</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card"><div class="empty"><b>Brak aukcji</b>Wtyczka zapisze je jako szkice.</div></div>`) +
        `<p class="small muted">„Szkic Allegro” wysyła POST /sale/product-offers ze statusem INACTIVE. Aktywacja jest osobnym przyciskiem przy ofercie, która ma już nasze id oferty.</p>` +
        publishRow();
    }

    function publishRow() {
      const owned = CRM.S.trade.auctions.filter((a) => a.allegro_offer_id);
      if (!owned.length) return "";
      return `<div class="card pad" style="margin-top:14px"><h2>Szkice wysłane na Allegro</h2><div class="list">${owned.map((a) => `<div class="li"><div class="t"><b>${CRM.esc(a.catalog_name || a.name)}</b><small>${CRM.esc(a.allegro_offer_id)} · ${CRM.esc(a.status)}</small></div>${a.status !== "active" ? `<button class="btn sm danger" type="button" data-nhp="publish" data-offer="${CRM.esc(a.allegro_offer_id)}">Publikuj</button>` : ""}</div>`).join("")}</div></div>`;
    }

    function viewImport() {
      const items = CRM.S.trade.items;
      const body = items.map((item) => {
        const data = item.data || {};
        return `<tr>
          <td class="strong">${CRM.esc(data.catalog_name || "—")}</td>
          <td>${item.status === "flagged" ? '<span class="pill" style="--c:var(--bad)">Brak ceny</span>' : CRM.esc(item.status)}</td>
          <td class="num">${money(data.price)}</td>
          <td class="num">${money(data.base_price)}</td>
          <td class="muted small">${CRM.esc((item.missing || []).join(", ") || "—")}</td>
          <td><button class="btn sm" type="button" data-nhp="page" data-kind="import" data-id="${item.id}">Zrób stronę</button>
            <button class="btn sm" type="button" data-nhp="generate" data-kind="import" data-id="${item.id}">Generuj</button></td>
        </tr>`;
      }).join("");
      return top("Import z wtyczki", "Pozycje zapisane od razu jako szkice. Brak ceny jest oznaczony i nie jest uzupełniany.", `<button class="btn" type="button" data-nhp="reload">Odśwież</button>`) +
        banner() + tierBlock() + videoFields() +
        (items.length ? `<div class="card tbl-wrap"><table><thead><tr><th>Nazwa katalogowa</th><th>Status</th><th>Cena</th><th>Bazowa</th><th>Braki</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card"><div class="empty"><b>Nic jeszcze nie wpłynęło</b>Na karcie oferty Allegro naciśnij E albo przycisk wtyczki.</div></div>`);
    }

    function viewExport() {
      const priced = CRM.S.trade.products.filter((p) => p.price != null);
      return top("Eksport produktów", "CSV ze średnikiem to staging importu. CSV z przecinkiem, XML i Ceneo biorą bazę produktów. Wiersze bez ceny odpadają.", "") +
        banner() +
        `<div class="card pad"><div class="row">
          <select id="exp-format">
            <option value="staging">CSV staging (;)</option>
            <option value="catalog">CSV katalog (,)</option>
            <option value="xml">XML</option>
            <option value="ceneo">Ceneo XML</option>
          </select>
          <button class="btn primary" type="button" data-nhp="export">Pobierz</button>
        </div>
        <p class="small muted">${priced.length} produktów z ceną, ${CRM.S.trade.products.length - priced.length} bez ceny (zostaną pominięte).</p></div>`;
    }

    function viewKeys() {
      const fresh = T().freshKey ? `<div class="banner">Nowy klucz (widać tylko teraz): <b>${CRM.esc(T().freshKey)}</b></div>` : "";
      const rows = CRM.S.trade.keys.map((k) => `<tr>
        <td class="strong">${CRM.esc(k.label || "Wtyczka")}</td>
        <td class="muted small">${k.created_at ? new Date(k.created_at).toLocaleString("pl-PL") : "—"}</td>
        <td class="muted small">${k.last_used_at ? new Date(k.last_used_at).toLocaleString("pl-PL") : "—"}</td>
        <td>${k.revoked_at ? "Odwołany" : "Aktywny"}</td>
        <td>${k.revoked_at ? "" : `<button class="btn sm danger" type="button" data-nhp="revoke" data-id="${k.id}">Odwołaj</button>`}</td>
      </tr>`).join("");
      const plug = Ann ? Ann.extensionAnnounceHtml(CRM.esc, { dismiss: false }) : "";
      return top("Klucze API", "Wtyczka wysyła klucz w nagłówku X-NHP-Key. W bazie zostaje tylko skrót SHA-256.", "") +
        banner() + plug + fresh +
        `<div class="card pad" style="margin-bottom:14px"><div class="row"><input id="key-label" placeholder="Nazwa, np. komputer Ani" style="border:1px solid var(--line);border-radius:10px;padding:8px 10px"><button class="btn primary" type="button" data-nhp="new-key">Wystaw klucz</button></div></div>` +
        (rows ? `<div class="card tbl-wrap"><table><thead><tr><th>Nazwa</th><th>Utworzony</th><th>Ostatnie użycie</th><th>Stan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="card"><div class="empty"><b>Brak kluczy</b>Wystaw pierwszy i wklej go w ustawieniach wtyczki.</div></div>`);
    }

    async function setPrices() {
      const ids = selectedIds();
      if (!ids.length) { CRM.toast("Zaznacz aukcje."); return; }
      let ok = 0;
      for (const id of ids) {
        const auction = CRM.S.trade.auctions.find((a) => a.id === id);
        if (!auction) continue;
        const knownBase = auction.base_price != null
          ? P.basePrice({ price: auction.base_price, shipping: 0 })
          : P.basePrice({ price: auction.price, shipping: auction.delivery_cost });
        if (!knownBase.ok) { CRM.toast(knownBase.error === "missing_shipping" ? "Brak kosztu dostawy — nie liczę ceny bazowej." : "Brak ceny — nie zgaduję."); continue; }
        const keys = [auction.work_category_id, auction.category_id, auction.category].filter(Boolean);
        const rate = CRM.S.trade.commissions.find((c) => keys.includes(c.category_key));
        if (!rate) { CRM.toast("Brak stawki prowizji dla tej kategorii."); continue; }
        const sale = P.salePrice({ base: knownBase.base, ratePct: rate.rate_pct });
        if (!sale.ok) { CRM.toast("Nie da się policzyć ceny."); continue; }
        await CRM.SB.from("auctions").update({ price: sale.sale, base_price: knownBase.base, updated_at: new Date().toISOString() }).eq("id", id);
        if (auction.product_id) await CRM.SB.from("products").update({ price: sale.sale, base_price: knownBase.base, updated_at: new Date().toISOString() }).eq("id", auction.product_id);
        ok++;
      }
      await reload();
      CRM.toast(ok ? `Ustawiono cenę na ${ok} aukcjach.` : "Nic nie zmieniono.");
      CRM.scheduleRender();
    }

    async function downloadExport() {
      const format = document.getElementById("exp-format")?.value || "staging";
      const exp = await import("./lib/export-formats.mjs");
      let file;
      if (format === "staging") file = { ...exp.stagingCsv(CRM.S.trade.items.map((i) => i.data)), name: "staging.csv", type: "text/csv" };
      else if (format === "catalog") file = { ...exp.catalogCsv(CRM.S.trade.products), name: "katalog.csv", type: "text/csv" };
      else if (format === "ceneo") file = { ...exp.ceneoXml(CRM.S.trade.products), name: "ceneo.xml", type: "application/xml" };
      else file = { ...exp.productsXml(CRM.S.trade.products), name: "produkty.xml", type: "application/xml" };
      const blob = new Blob([file.body], { type: file.type + ";charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
      if (file.skipped) CRM.toast(`Pominięto ${file.skipped} bez ceny.`);
    }

    document.addEventListener("click", async (e) => {
      const tierBtn = e.target.closest("[data-tier]");
      if (tierBtn) {
        T().tier = tierBtn.dataset.tier;
        document.querySelectorAll("[data-tier]").forEach((el) => el.setAttribute("aria-pressed", el === tierBtn ? "true" : "false"));
        return;
      }
      const t = e.target.closest("[data-nhp]");
      if (!t) return;
      const act = t.dataset.nhp;
      if (act === "reload") { await reload(); CRM.scheduleRender(); return; }
      if (act === "close") { T().detail = null; CRM.scheduleRender(); return; }
      if (act === "open") { T().detail = { kind: t.dataset.kind, id: t.dataset.id }; CRM.scheduleRender(); return; }
      if (act === "page") return onPage(t.dataset.kind, t.dataset.id);
      if (act === "generate") return onGenerate(t.dataset.kind, t.dataset.id);
      if (act === "video") return onVideo(t.dataset.kind, t.dataset.id);
      if (act === "add-cat") return addCategory(false);
      if (act === "split") return addCategory(true);
      if (act === "assign") return assignSelected();
      if (act === "set-price") return setPrices();
      if (act === "add-comm") return addCommission();
      if (act === "del-comm") { await CRM.SB.from("category_commissions").delete().eq("id", t.dataset.id); await reload(); CRM.scheduleRender(); return; }
      if (act === "export") return downloadExport();
      if (act === "new-key") return newKey();
      if (act === "revoke") { await call(`/api/panel/keys/${t.dataset.id}`, "DELETE"); await reload(); CRM.scheduleRender(); return; }
      if (act === "allegro-connect") return connectAllegro();
      if (act === "draft") return allegroDraft(t.dataset.id);
      if (act === "fee") return allegroFee(t.dataset.id);
      if (act === "publish") return allegroPublish(t.dataset.offer);
      if (act === "dismiss-ext") return dismissExtensionBanner();
      if (act === "download-ext") return downloadExtension();
    });
    document.addEventListener("change", (e) => {
      if (e.target.dataset?.pick) {
        T().selected[e.target.dataset.pick] = e.target.checked;
        return;
      }
      if (e.target.id === "auc-status") { T().status = e.target.value; CRM.scheduleRender(); }
      if (e.target.id === "auc-cat") { T().category = e.target.value; CRM.scheduleRender(); }
      if (e.target.id === "vid-format") T().videoFormat = e.target.value;
      if (e.target.id === "vid-seconds") T().seconds = e.target.value;
    });
    document.addEventListener("input", (e) => {
      if (e.target.dataset?.tradeQ !== undefined) { T().q = e.target.value; CRM.scheduleRender(); }
    });

    async function onPage(kind, id) {
      if (kind === "product") {
        const p = CRM.S.trade.products.find((x) => x.id === id);
        if (p) await makePage(sourceOfProduct(p), p.id);
      } else if (kind === "auction") {
        const a = CRM.S.trade.auctions.find((x) => x.id === id);
        if (a) await makePage(sourceOfAuction(a), a.product_id);
      } else if (kind === "import") {
        const item = CRM.S.trade.items.find((x) => x.id === id);
        if (item) await makePage(item.data || {}, item.product_id);
      }
    }
    async function onGenerate(kind, id) {
      const tier = T().tier || "s1";
      if (kind === "product") return startGeneration({ tier, product_id: id });
      if (kind === "import") {
        const item = CRM.S.trade.items.find((x) => x.id === id);
        if (!item?.product_id) { CRM.toast("Ta pozycja nie ma jeszcze produktu."); return; }
        return startGeneration({ tier, product_id: item.product_id });
      }
    }
    async function onVideo(kind, id) {
      const p = CRM.S.trade.products.find((x) => x.id === id);
      if (!p) return;
      const images = (p.images || []).map((i) => (typeof i === "string" ? i : i.url)).filter(Boolean);
      const benefits = (p.generated?.copy?.benefits || []).map((b) => b.title).filter(Boolean);
      await openVideo({ title: p.catalog_name || p.name, price: p.price, benefits, images, productId: p.id, rights: false });
    }
    async function addCategory(fromSelection) {
      const name = (document.getElementById("new-cat")?.value || "").trim() || (fromSelection ? "Wydzielone" : "");
      if (!name) { CRM.toast("Podaj nazwę kolejki."); return; }
      const { data, error } = await CRM.SB.from("work_categories").insert({ name }).select("id").single();
      if (error) { CRM.toast("Nie udało się dodać kolejki."); return; }
      if (fromSelection) {
        for (const id of selectedIds()) await CRM.SB.from("auctions").update({ work_category_id: data.id }).eq("id", id);
      }
      await reload();
      CRM.scheduleRender();
    }
    async function assignSelected() {
      const cat = document.getElementById("auc-cat")?.value;
      if (!cat || cat === "all") { CRM.toast("Wybierz kolejkę na liście filtrów."); return; }
      const ids = selectedIds();
      if (!ids.length) { CRM.toast("Zaznacz aukcje."); return; }
      for (const id of ids) await CRM.SB.from("auctions").update({ work_category_id: cat }).eq("id", id);
      await reload();
      CRM.toast("Przypisano.");
      CRM.scheduleRender();
    }
    async function addCommission() {
      const label = document.getElementById("comm-label")?.value.trim();
      const key = document.getElementById("comm-key")?.value.trim();
      const rate = P.parseMoney(document.getElementById("comm-rate")?.value);
      if (!label || !key || rate == null) { CRM.toast("Uzupełnij nazwę, klucz i stawkę."); return; }
      const { error } = await CRM.SB.from("category_commissions").insert({ label, category_key: key, rate_pct: rate });
      if (error) { CRM.toast("Nie udało się zapisać stawki. Sprawdź, czy klucz się nie powtarza i czy procent jest poniżej 95."); return; }
      await reload();
      CRM.scheduleRender();
    }
    function dismissExtensionBanner() {
      if (!Ann) return;
      try { localStorage.setItem(Ann.BANNER_STORAGE_KEY, Ann.EXTENSION_VERSION); } catch { /* prywatny tryb */ }
      CRM.scheduleRender();
    }
    async function downloadExtension() {
      if (window.NHP_LOCAL || !CRM.SB?.auth?.getSession) {
        CRM.toast("Pobranie wtyczki działa na wdrożonym panelu, po zalogowaniu.");
        return;
      }
      try {
        const { data } = await CRM.SB.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { CRM.toast("Sesja wygasła. Zaloguj się ponownie."); return; }
        const res = await fetch("/api/extension.zip", { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok) { CRM.toast("Nie udało się pobrać wtyczki. Zaloguj się na konto zespołu."); return; }
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "nhp-wtyczka.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        CRM.toast(err.message || "Nie udało się pobrać wtyczki.");
      }
    }
    async function newKey() {
      try {
        const label = document.getElementById("key-label")?.value.trim() || "Wtyczka";
        const res = await call("/api/panel/keys", "POST", { label });
        T().freshKey = res.key;
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function connectAllegro() {
      try {
        const res = await call("/api/allegro/connect", "GET");
        location.href = res.url;
      } catch (err) { CRM.toast(err.message); }
    }
    async function allegroDraft(id) {
      const account = document.getElementById("allegro-account")?.value;
      const handling = document.getElementById("handling")?.value;
      if (!account) { CRM.toast("Wybierz konto Allegro."); return; }
      if (!handling) { CRM.toast("Wybierz czas realizacji. Nie bierzemy go w ciemno ze źródła."); return; }
      const auction = CRM.S.trade.auctions.find((a) => a.id === id);
      if (auction?.price == null) { CRM.toast("Brak ceny. Ustaw cenę albo odrzuć pozycję — nie wysyłamy zgadywanej."); return; }
      if (!confirm("Utworzyć niewidoczny szkic oferty na Allegro (status INACTIVE)?")) return;
      try {
        const res = await call("/api/allegro/draft", "POST", { confirm_draft: true, account_id: account, auction_id: id, handling_time: handling, price: auction.price });
        CRM.toast(`Szkic ${res.offer_id} jest nieaktywny.`);
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function allegroFee(id) {
      const account = document.getElementById("allegro-account")?.value;
      const auction = CRM.S.trade.auctions.find((a) => a.id === id);
      if (!account) { CRM.toast("Wybierz konto Allegro."); return; }
      if (!auction?.category_id) { CRM.toast("Brak id kategorii Allegro — podgląd opłaty nie ma z czego liczyć."); return; }
      if (auction.price == null) { CRM.toast("Brak ceny. Podgląd opłaty jej nie zgaduje."); return; }
      try {
        const res = await call("/api/allegro/fee-preview", "POST", { account_id: account, price: auction.price, category_id: auction.category_id });
        const quotes = res.preview?.quotes || res.preview?.fees || [];
        const bits = (Array.isArray(quotes) ? quotes : []).slice(0, 4).map((q) => `${q.name || q.type || "opłata"} ${q.fee?.amount || q.amount || ""}`.trim());
        CRM.toast(bits.length ? `Allegro: ${bits.join(" · ")}` : "Allegro zwróciło podgląd opłaty.");
      } catch (err) { CRM.toast(err.message); }
    }
    async function allegroPublish(offerId) {
      const account = document.getElementById("allegro-account")?.value;
      if (!account) { CRM.toast("Wybierz konto Allegro."); return; }
      const typed = prompt("Publikacja włączy ofertę dla kupujących. Wpisz PUBLIKUJ, żeby potwierdzić.");
      if (typed !== "PUBLIKUJ") return;
      try {
        await call("/api/allegro/publish", "POST", { confirm_publish: true, account_id: account, offer_id: offerId });
        CRM.toast("Oferta jest aktywna.");
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
  });
})();
