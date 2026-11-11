/* Baza produktów, aukcje, import z wtyczki, eksport i klucze API. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    const T = () => CRM.UI.trade || (CRM.UI.trade = { tier: "s1", status: "all", category: "all", q: "", selected: {}, picked: {}, format: "staging", videoFormat: "9:16", seconds: 18, detail: null, freshKey: "", tab: "pobrane", history: {}, didAutoSync: false });
    CRM.S.trade = { products: [], auctions: [], batches: [], items: [], categories: [], commissions: [], keys: [], accounts: [], pages: [], stats: [], orders: [], invoices: [], events: [], error: "" };
    const WF = [
      ["pobrany", "Pobrany", "var(--grey)"],
      ["w_przygotowaniu", "W przygotowaniu", "var(--warn)"],
      ["strona_gotowa", "Strona gotowa", "var(--info)"],
      ["opublikowany", "Opublikowany w Shopify", "var(--good)"],
      ["wstrzymany", "Wstrzymany", "var(--violet)"],
      ["archiwum", "Archiwum", "var(--muted)"]
    ];
    const wfLabel = (code) => WF.find((row) => row[0] === code)?.[1] || code || "Pobrany";
    const wfColor = (code) => WF.find((row) => row[0] === code)?.[2] || "var(--grey)";

    CRM.VIEWS.push(
      ["baza-produktow", "Baza produktów", "products"],
      ["faktury", "Faktury KSeF", "doc"],
      ["aukcje", "Aukcje", "orders"],
      ["import-wtyczki", "Import", "inbox"],
      ["eksport", "Eksport", "down"],
      ["klucze-api", "Klucze API", "key"]
    );
    CRM.VIEW_FNS["baza-produktow"] = () => viewProducts();
    CRM.VIEW_FNS.faktury = () => viewInvoices();
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
      if (!document.getElementById("nhp-commerce-css")) {
        const style = document.createElement("style");
        style.id = "nhp-commerce-css";
        style.textContent = ".wf-tabs{display:flex;gap:8px;margin:0 0 14px;flex-wrap:wrap}.stat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:12px 0}.mini-stat{padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)}.mini-stat b{display:block;font-family:var(--display);font-size:18px}.hist{margin:8px 0 0;padding:0;list-style:none}.hist li{padding:6px 0;border-top:1px solid var(--line);font-size:13px}@media(max-width:800px){.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}";
        document.head.appendChild(style);
      }
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
          if (/schema cache|does not exist|42P01|relation|PGRST/i.test(msg)) CRM.S.trade.error = "Brakuje tabel handlu: " + msg + " W Supabase → SQL Editor uruchom ponownie cały plik supabase.sql.";
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
      t.pages = await load("pages", sb.from("pages").select("id,slug,name,status,product_id,updated_at").order("updated_at", { ascending: false }).limit(1000));
      t.stats = await load("stats", sb.from("product_stats").select("product_id,orders_count,units_sold,revenue,currency,views,sessions").limit(1000));
      t.orders = await load("orders", sb.from("shopify_orders").select("id,shopify_order_id,order_number,email,financial_status,currency,total,line_items,buyer,gateway,paid_at,cancelled_at,created_at").order("created_at", { ascending: false }).limit(200));
      t.invoices = await load("invoices", sb.from("ksef_invoices").select("id,shopify_order_id,invoice_number,status,ksef_reference,ksef_number,error,gross,currency,issued_at,created_at").order("created_at", { ascending: false }).limit(200));
      t.events = await load("events", sb.from("shopify_events").select("id,topic,shopify_id,created_at").order("created_at", { ascending: false }).limit(12));
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

    CRM.shopifyPush = async function (ids, { create = false, force = false } = {}) {
      const list = [...new Set((ids || []).filter(Boolean))].slice(0, 20);
      if (!list.length) return { pushed: [], errors: [] };
      if (window.NHP_LOCAL) {
        if (create || force) CRM.toast("Shopify działa na wdrożonym panelu, nie w lokalnej piaskownicy.");
        return { pushed: [], errors: [] };
      }
      const linked = create
        ? list
        : list.filter((id) => CRM.S.trade.products.some((product) => product.id === id && product.shopify_product_id));
      if (!linked.length) return { pushed: [], errors: [] };
      try {
        const res = await call("/api/shopify/push", "POST", { product_ids: linked, create, force });
        await reload();
        const view = location.hash.slice(1);
        if (view === "baza-produktow" || view === "faktury") CRM.scheduleRender();
        if (res.errors?.length) CRM.toast(res.errors[0]);
        return res;
      } catch (err) {
        CRM.toast(err.message || "Nie udało się wysłać do Shopify.");
        return { pushed: [], errors: [err.message] };
      }
    };

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
      await reload();
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

    function pagesOf(productId) {
      return (CRM.S.trade.pages || []).filter((page) => page.product_id === productId);
    }
    function pageFor(productId) {
      const pages = pagesOf(productId);
      return pages.find((page) => page.status === "published") || pages[0] || null;
    }
    function hasPage(productId) {
      return pagesOf(productId).length > 0;
    }
    function statsOf(productId) {
      return (CRM.S.trade.stats || []).find((row) => row.product_id === productId) || { orders_count: 0, units_sold: 0, revenue: 0, views: 0, sessions: 0, currency: "PLN" };
    }
    function workflowOf(product) {
      return WF.some((row) => row[0] === product?.workflow_status) ? product.workflow_status : "pobrany";
    }
    function pageCell(product) {
      const page = pageFor(product.id);
      if (!page) return '<span class="pill" style="--c:var(--grey)">Brak strony</span>';
      const label = page.status === "published" ? "Opublikowana" : "Szkic";
      const color = page.status === "published" ? "var(--good)" : "var(--info)";
      return `<span class="pill" style="--c:${color}">${label}</span> <button class="btn sm" type="button" data-stop data-nhp="open-page" data-id="${CRM.esc(page.id)}">Otwórz</button>` +
        (page.status === "published" ? ` <a data-stop href="/p/${CRM.esc(page.slug)}" target="_blank" rel="noopener">/p/${CRM.esc(page.slug)}</a>` : "");
    }
    function shopifyCell(product) {
      if (!product.shopify_product_id) return '<span class="muted">nie wysłano</span>';
      const url = product.shopify_url ? `<a data-stop href="${CRM.esc(product.shopify_url)}" target="_blank" rel="noopener">${CRM.esc(product.shopify_handle || "sklep")}</a>` : CRM.esc(product.shopify_handle || product.shopify_product_id);
      const state = product.shopify_status === "deleted" ? " · usunięty w Shopify" : "";
      return `${url}${state}`;
    }
    function statusSelect(product) {
      const current = workflowOf(product);
      return `<select data-stop data-wf="${CRM.esc(product.id)}">${WF.map((row) => `<option value="${row[0]}" ${row[0] === current ? "selected" : ""}>${row[1]}</option>`).join("")}</select>`;
    }
    function pickedIds() {
      return Object.keys(T().picked || {}).filter((id) => T().picked[id]);
    }
    function integrationBanner() {
      const shop = T().shopifyStatus;
      const ksef = T().ksefStatus;
      const shopLine = !shop ? "Sprawdzam Shopify…" : shop.configured
        ? `Shopify: ${CRM.esc(shop.shop || shop.domain || "połączony")}${shop.error ? ` — ${CRM.esc(shop.error)}` : ""}`
        : "Shopify nie jest podłączony. Sekrety: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN, SHOPIFY_WEBHOOK_SECRET.";
      const ksefLine = !ksef ? "Sprawdzam KSeF…" : `KSeF ${CRM.esc(ksef.env || "test")}: ${ksef.configured ? "gotowy" : "brak sekretów"} · faktury automatyczne ${ksef.auto ? "włączone" : "wyłączone"}`;
      const err = T().integrationError ? `<div class="banner">${CRM.esc(T().integrationError)}</div>` : "";
      return err + `<div class="card pad" style="margin-bottom:14px"><p style="margin:0 0 8px">${shopLine}</p><p class="small muted" style="margin:0 0 10px">${ksefLine} Instrukcja jest w docs/shopify-ksef.md.</p><div class="row">
        <button class="btn sm" type="button" data-nhp="shopify-webhooks" ${shop?.configured ? "" : "disabled"}>Zarejestruj webhooki</button>
        <button class="btn sm" type="button" data-nhp="shopify-pull" ${shop?.configured ? "" : "disabled"}>Pobierz zamówienia</button>
        <button class="btn sm" type="button" data-nhp="shopify-sync">Synchronizuj zmiany</button>
      </div></div>`;
    }
    function kickIntegration() {
      if (window.NHP_LOCAL || T().statusLoaded) return;
      T().statusLoaded = true;
      Promise.all([
        call("/api/shopify/status", "GET").catch((err) => ({ configured: false, error: err.message })),
        call("/api/ksef/status", "GET").catch((err) => ({ configured: false, env: "test", auto: true, error: err.message }))
      ]).then(([shop, ksef]) => {
        T().shopifyStatus = shop;
        T().ksefStatus = ksef;
        CRM.scheduleRender();
      }).catch((err) => {
        T().integrationError = err.message;
        CRM.scheduleRender();
      });
    }
    function kickAutoSync() {
      if (window.NHP_LOCAL || T().didAutoSync) return;
      const ids = CRM.S.trade.products.filter((product) => product.shopify_dirty && product.shopify_product_id).map((product) => product.id);
      if (!ids.length) return;
      T().didAutoSync = true;
      CRM.shopifyPush(ids, { create: false });
    }

    function viewProducts() {
      kickIntegration();
      kickAutoSync();
      const ui = T();
      const q = (ui.q || "").toLowerCase();
      const tab = ui.tab === "gotowe" ? "gotowe" : "pobrane";
      const all = CRM.S.trade.products.filter((product) => !q || `${product.catalog_name} ${product.name} ${product.ean} ${product.producer}`.toLowerCase().includes(q));
      const gotowe = all.filter((product) => hasPage(product.id));
      const pobrane = all.filter((product) => !hasPage(product.id));
      const rows = tab === "gotowe" ? gotowe : pobrane;
      const head = tab === "gotowe"
        ? "<th></th><th>Nazwa katalogowa</th><th>Status</th><th>Strona</th><th>Shopify</th><th>Zamówienia</th><th>Szt.</th><th>Przychód</th><th>Wyświetlenia</th>"
        : "<th></th><th>Nazwa katalogowa</th><th>EAN</th><th>Cena</th><th>Producent</th><th>Status</th><th>Strona</th>";
      const body = rows.map((product) => {
        const stats = statsOf(product.id);
        const priceGap = product.price == null ? ' <span class="pill" style="--c:var(--bad)">Brak ceny</span>' : "";
        if (tab === "gotowe") {
          return `<tr data-nhp="open" data-kind="product" data-id="${product.id}">
            <td data-stop><input type="checkbox" data-pick-product="${product.id}" ${ui.picked?.[product.id] ? "checked" : ""}></td>
            <td class="strong">${CRM.esc(product.catalog_name || product.name)}</td>
            <td data-stop>${statusSelect(product)}${priceGap}</td>
            <td>${pageCell(product)}</td>
            <td>${shopifyCell(product)}</td>
            <td class="num">${stats.orders_count || 0}</td>
            <td class="num">${stats.units_sold || 0}</td>
            <td class="num">${money(stats.revenue)}</td>
            <td class="num">${stats.views || 0}<div class="small muted">${stats.sessions || 0} sesji</div></td>
          </tr>`;
        }
        return `<tr data-nhp="open" data-kind="product" data-id="${product.id}">
          <td data-stop><input type="checkbox" data-pick-product="${product.id}" ${ui.picked?.[product.id] ? "checked" : ""}></td>
          <td class="strong">${CRM.esc(product.catalog_name || product.name)}</td>
          <td>${CRM.esc(product.ean || "—")}</td>
          <td class="num">${money(product.price)}</td>
          <td>${CRM.esc(product.producer || "—")}</td>
          <td data-stop>${statusSelect(product)}${priceGap}</td>
          <td>${pageCell(product)}</td>
        </tr>`;
      }).join("");
      const bulk = `<div class="row">
        <select id="wf-bulk">${WF.map((row) => `<option value="${row[0]}">${row[1]}</option>`).join("")}</select>
        <button class="btn sm" type="button" data-nhp="wf-bulk">Ustaw status zaznaczonym</button>
        <button class="btn sm primary" type="button" data-nhp="shopify-send">Wyślij zaznaczone do Shopify</button>
      </div>`;
      return top("Baza produktów", "Pobrane nie mają jeszcze strony. Gotowe strony to produkty z kartą one-page. Status zmienia się też hurtowo.", `<button class="btn" type="button" data-nhp="reload">Odśwież</button>`) +
        banner() + integrationBanner() + detailCard() +
        `<div class="wf-tabs" role="tablist">
          <button class="chip" type="button" data-nhp="tab" data-tab="pobrane" aria-pressed="${tab === "pobrane" ? "true" : "false"}" role="tab">Pobrane produkty <span class="num">${pobrane.length}</span></button>
          <button class="chip" type="button" data-nhp="tab" data-tab="gotowe" aria-pressed="${tab === "gotowe" ? "true" : "false"}" role="tab">Gotowe strony <span class="num">${gotowe.length}</span></button>
        </div>` +
        `<div class="toolbar"><label class="search">${CRM.ic("search", 16)}<input id="q-trade" data-trade-q placeholder="Nazwa, EAN, producent" value="${CRM.esc(ui.q || "")}"></label>${bulk}</div>` +
        (rows.length ? `<div class="card tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card"><div class="empty"><b>${tab === "gotowe" ? "Brak gotowych stron" : "Pusta lista pobranych"}</b>${tab === "gotowe" ? "Zrób stronę z produktu albo z importu." : "Zaimportuj ofertę wtyczką. Produkty ze stroną są w zakładce Gotowe strony."}</div></div>`);
    }

    function detailCard() {
      const d = T().detail;
      if (!d || d.kind !== "product") return "";
      const p = CRM.S.trade.products.find((x) => x.id === d.id);
      if (!p) return "";
      const page = pageFor(p.id);
      const stats = statsOf(p.id);
      const history = (T().history || {})[p.id] || [];
      const hist = history.length ? `<ul class="hist">${history.map((row) => `<li><b>${CRM.esc(wfLabel(row.to_status))}</b> <span class="muted">${CRM.esc(row.from_status ? wfLabel(row.from_status) + " → " : "")}${row.created_at ? new Date(row.created_at).toLocaleString("pl-PL") : ""} · ${CRM.esc(row.source || "panel")}</span>${row.note ? `<div>${CRM.esc(row.note)}</div>` : ""}</li>`).join("")}</ul>` : `<p class="small muted">Brak historii statusu.</p>`;
      const shop = p.shopify_product_id
        ? `<p>Shopify: ${shopifyCell(p)} · status sklepu ${CRM.esc(p.shopify_status || "—")}${p.shopify_synced_at ? ` · sync ${CRM.esc(new Date(p.shopify_synced_at).toLocaleString("pl-PL"))}` : ""}${p.shopify_dirty ? " · czeka na wysyłkę" : ""}</p>${p.shopify_sync_error ? `<p class="small" style="color:var(--bad)">${CRM.esc(p.shopify_sync_error)}</p>` : ""}`
        : `<p class="muted">Produkt nie jest jeszcze w Shopify. „Wyślij do Shopify” zakłada kartę produktu (zdjęcia, opis, cena, EAN, SKU).</p>`;
      return `<section class="card pad" style="margin-bottom:14px">
        <div class="sec-h"><h2>${CRM.esc(p.catalog_name || p.name)}</h2><button class="btn sm" type="button" data-nhp="close">Zamknij</button></div>
        <p class="muted small">Nazwa katalogowa zostaje ze źródła. EAN ${CRM.esc(p.ean || "—")} · SKU ${CRM.esc(p.sku || "—")} · ${CRM.esc(p.category || "bez kategorii")} · dostawa ${money(p.delivery_cost)} · bazowa ${money(p.base_price)}</p>
        <div class="row" style="margin:8px 0"><span class="pill" style="--c:${wfColor(workflowOf(p))}">${CRM.esc(wfLabel(workflowOf(p)))}</span>${pageCell(p)}</div>
        <div class="stat-grid">
          <div class="mini-stat"><span class="small muted">Zamówienia</span><b class="num">${stats.orders_count || 0}</b></div>
          <div class="mini-stat"><span class="small muted">Sztuki</span><b class="num">${stats.units_sold || 0}</b></div>
          <div class="mini-stat"><span class="small muted">Przychód</span><b class="num">${money(stats.revenue)}</b></div>
          <div class="mini-stat"><span class="small muted">Wyświetlenia</span><b class="num">${stats.views || 0}</b></div>
          <div class="mini-stat"><span class="small muted">Sesje</span><b class="num">${stats.sessions || 0}</b></div>
        </div>
        <p class="small muted">Zamówienia, sztuki i przychód biorą się z opłaconych zamówień Shopify (bez dostawy, bez pełnego odjęcia zwrotów). Wyświetlenia i sesje liczy nasza strona /p/…, nie analityka Shopify.</p>
        ${shop}
        <div class="row" style="margin-top:10px">
          <label class="f"><span class="small muted">Nazwa w Shopify</span><input id="prod-name" value="${CRM.esc(p.name || "")}" style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-width:220px"></label>
          <label class="f"><span class="small muted">Cena</span><input id="prod-price" value="${p.price == null ? "" : CRM.esc(String(p.price))}" inputmode="decimal" style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;width:120px"></label>
          <label class="f" style="flex:1;min-width:220px"><span class="small muted">Opis produktu</span><textarea id="prod-desc" rows="3" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:8px 10px">${CRM.esc(p.description || "")}</textarea></label>
        </div>
        <div class="row">
          <button class="btn" type="button" data-nhp="save-product" data-id="${p.id}">Zapisz i wyślij zmiany</button>
          <button class="btn primary" type="button" data-nhp="shopify-one" data-id="${p.id}">Wyślij do Shopify</button>
          <button class="btn" type="button" data-nhp="page" data-kind="product" data-id="${p.id}">${page ? "Otwórz stronę" : "Zrób stronę"}</button>
          <button class="btn" type="button" data-nhp="generate" data-kind="product" data-id="${p.id}">Generuj</button>
          <button class="btn" type="button" data-nhp="video" data-kind="product" data-id="${p.id}">Złóż wideo</button>
        </div>
        ${tierBlock()}
        ${videoFields()}
        <h3 style="margin:14px 0 0">Historia statusu</h3>
        ${hist}
        <p class="small muted">S1 to sam tekst. S1 Pro dokłada 1 zdjęcie AI. S1 Max dokłada 5 zdjęć i każe złożyć wideo tutaj. Cudze zdjęcia na stronie dostają brak prawa, dopóki go nie potwierdzisz. Gdy karta one-page istnieje, jej treść jest opisem w Shopify.</p>
      </section>`;
    }

    function invoiceStatusLabel(status) {
      return {
        szkic: "Szkic",
        oczekuje_konfiguracji: "Czeka na sekrety",
        w_trakcie: "W trakcie",
        przyjeta: "Przyjęta w KSeF",
        odrzucona: "Odrzucona",
        blad: "Błąd"
      }[status] || status || "brak";
    }
    function viewInvoices() {
      kickIntegration();
      const orders = CRM.S.trade.orders || [];
      const invoices = CRM.S.trade.invoices || [];
      const byOrder = new Map(invoices.map((row) => [row.shopify_order_id, row]));
      const body = orders.map((order) => {
        const invoice = byOrder.get(order.shopify_order_id);
        const when = order.created_at ? new Date(order.created_at).toLocaleString("pl-PL") : "—";
        return `<tr>
          <td class="strong">${CRM.esc(order.order_number || order.shopify_order_id)}</td>
          <td class="small muted">${CRM.esc(when)}</td>
          <td>${CRM.esc(order.buyer?.name || order.email || "—")}</td>
          <td class="num">${money(order.total)} ${CRM.esc(order.currency || "")}</td>
          <td>${CRM.esc(order.financial_status || "—")}${order.cancelled_at ? " · anulowane" : ""}</td>
          <td>${invoice ? `<b>${CRM.esc(invoice.invoice_number)}</b><div class="small">${CRM.esc(invoiceStatusLabel(invoice.status))}${invoice.ksef_number ? ` · ${CRM.esc(invoice.ksef_number)}` : ""}</div>${invoice.error ? `<div class="small" style="color:var(--bad)">${CRM.esc(invoice.error)}</div>` : ""}` : '<span class="muted">brak faktury</span>'}</td>
          <td class="row">
            <button class="btn sm" type="button" data-nhp="ksef-issue" data-order="${CRM.esc(order.shopify_order_id)}" data-paid="${order.financial_status === "paid" ? "1" : "0"}">${invoice ? "Wyślij ponownie" : "Wystaw"}</button>
            ${invoice ? `<button class="btn sm" type="button" data-nhp="ksef-refresh" data-id="${CRM.esc(invoice.id)}">Sprawdź</button><button class="btn sm" type="button" data-nhp="ksef-xml" data-id="${CRM.esc(invoice.id)}">XML</button>` : ""}
          </td>
        </tr>`;
      }).join("");
      const events = (CRM.S.trade.events || []).map((event) => `<li>${CRM.esc(event.topic)} · ${CRM.esc(event.shopify_id || "")} · ${event.created_at ? new Date(event.created_at).toLocaleString("pl-PL") : ""}</li>`).join("");
      return top("Faktury KSeF", "FA(3) dla zamówień Shopify. Opłacone zamówienie dostaje fakturę samo, gdy KSeF jest skonfigurowany. Domyślnie środowisko testowe.", `<button class="btn" type="button" data-nhp="reload">Odśwież</button><button class="btn primary" type="button" data-nhp="ksef-paid">Wystaw dla opłaconych</button>`) +
        banner() + integrationBanner() +
        (orders.length ? `<div class="card tbl-wrap"><table><thead><tr><th>Zamówienie</th><th>Data</th><th>Nabywca</th><th>Kwota</th><th>Płatność</th><th>Faktura</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card"><div class="empty"><b>Brak zamówień Shopify</b>Po podłączeniu sklepu pobierz zamówienia albo poczekaj na webhook.</div></div>`) +
        (events ? `<div class="card pad" style="margin-top:14px"><h2>Ostatnie webhooki</h2><ul class="hist">${events}</ul></div>` : "");
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
      const productIds = ids.map((id) => CRM.S.trade.auctions.find((auction) => auction.id === id)?.product_id).filter(Boolean);
      await reload();
      if (productIds.length) CRM.shopifyPush(productIds, { create: false });
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
      if (act === "reload") { T().didAutoSync = false; T().statusLoaded = false; T().history = {}; await reload(); CRM.scheduleRender(); return; }
      if (act === "close") { T().detail = null; CRM.scheduleRender(); return; }
      if (act === "open") {
        if (e.target.closest("[data-stop],button,a,select,input,textarea,label")) return;
        T().detail = { kind: t.dataset.kind, id: t.dataset.id };
        CRM.scheduleRender();
        if (t.dataset.kind === "product") loadHistory(t.dataset.id);
        return;
      }
      if (act === "tab") { T().tab = t.dataset.tab === "gotowe" ? "gotowe" : "pobrane"; CRM.scheduleRender(); return; }
      if (act === "open-page") { CRM.UI.genId = t.dataset.id; location.hash = "generator"; return; }
      if (act === "wf-bulk") return setWorkflow(pickedIds(), document.getElementById("wf-bulk")?.value);
      if (act === "shopify-send") return CRM.shopifyPush(pickedIds(), { create: true, force: true });
      if (act === "shopify-one") return CRM.shopifyPush([t.dataset.id], { create: true, force: true });
      if (act === "shopify-sync") {
        T().didAutoSync = false;
        const ids = CRM.S.trade.products.filter((product) => product.shopify_dirty && product.shopify_product_id).map((product) => product.id);
        if (!ids.length) { CRM.toast("Nic nie czeka na wysyłkę."); return; }
        return CRM.shopifyPush(ids, { create: false });
      }
      if (act === "shopify-webhooks") return registerWebhooks();
      if (act === "shopify-pull") return pullOrders();
      if (act === "save-product") return saveProduct(t.dataset.id);
      if (act === "ksef-issue") return issueInvoice(t.dataset.order, t.dataset.paid === "1");
      if (act === "ksef-refresh") return refreshInvoice(t.dataset.id);
      if (act === "ksef-xml") return downloadInvoiceXml(t.dataset.id);
      if (act === "ksef-paid") return issuePaid();
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
      if (act === "revoke") return revokeKey(t.dataset.id);
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
      if (e.target.dataset?.pickProduct) {
        T().picked[e.target.dataset.pickProduct] = e.target.checked;
        return;
      }
      if (e.target.dataset?.wf) {
        setWorkflow([e.target.dataset.wf], e.target.value);
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

    async function loadHistory(id) {
      T().history = T().history || {};
      if (T().history[id] || !CRM.SB?.from) return;
      T().history[id] = [];
      const { data } = await CRM.SB.from("product_status_history").select("from_status,to_status,note,source,created_at").eq("product_id", id).order("created_at", { ascending: false }).limit(12);
      T().history[id] = data || [];
      CRM.scheduleRender();
    }
    async function setWorkflow(ids, status) {
      if (!ids.length) { CRM.toast("Zaznacz produkty."); return; }
      if (!WF.some((row) => row[0] === status)) return;
      if (status === "opublikowany" && !confirm("Status „Opublikowany w Shopify” utworzy albo zaktualizuje produkt w sklepie i ustawi go jako aktywny. Kontynuować?")) {
        CRM.scheduleRender();
        return;
      }
      if (!CRM.SB?.rpc) { CRM.toast("Zmiana statusu wymaga bazy Supabase."); CRM.scheduleRender(); return; }
      const { error } = await CRM.SB.rpc("set_product_workflow", { p_ids: ids, p_status: status, p_note: "" });
      if (error) { CRM.toast(dbReason(error)); CRM.scheduleRender(); return; }
      ids.forEach((id) => { if (T().history) delete T().history[id]; });
      await reload();
      CRM.toast("Status zapisany.");
      CRM.scheduleRender();
      if (status === "opublikowany") await CRM.shopifyPush(ids, { create: true });
      else await CRM.shopifyPush(ids, { create: false });
    }
    async function saveProduct(id) {
      const price = P.parseMoney(document.getElementById("prod-price")?.value);
      const name = document.getElementById("prod-name")?.value.trim();
      const description = document.getElementById("prod-desc")?.value ?? "";
      if (document.getElementById("prod-price")?.value.trim() && price == null) { CRM.toast("Cena jest niepoprawna."); return; }
      const patch = { name: name || undefined, description, updated_at: new Date().toISOString() };
      if (price != null) patch.price = price;
      const { error } = await CRM.SB.from("products").update(patch).eq("id", id);
      if (error) { CRM.toast("Nie udało się zapisać produktu."); return; }
      await reload();
      CRM.toast("Zapisano.");
      await CRM.shopifyPush([id], { create: false });
      CRM.scheduleRender();
    }
    async function registerWebhooks() {
      try {
        const res = await call("/api/shopify/register-webhooks", "POST", {});
        CRM.toast(res.created?.length ? `Dodano webhooki: ${res.created.join(", ")}` : "Webhooki już są zarejestrowane.");
      } catch (err) { CRM.toast(err.message); }
    }
    async function pullOrders() {
      try {
        CRM.toast("Pobieram zamówienia…");
        const res = await call("/api/shopify/pull", "POST", {});
        await reload();
        CRM.toast(`Pobrano ${res.orders || 0} zamówień.`);
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function issueInvoice(orderId, paid) {
      if (!paid && !confirm("To zamówienie nie jest opłacone. Wystawić fakturę mimo to?")) return;
      try {
        const res = await call("/api/ksef/issue", "POST", { shopify_order_id: orderId });
        await reload();
        CRM.toast(res.invoice?.ksef_number ? `KSeF ${res.invoice.ksef_number}` : (res.invoice?.error || res.invoice?.status || "Zapisano fakturę."));
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function refreshInvoice(id) {
      try {
        const res = await call("/api/ksef/refresh", "POST", { invoice_id: id });
        await reload();
        CRM.toast(res.invoice?.ksef_number ? `KSeF ${res.invoice.ksef_number}` : (res.invoice?.error || res.invoice?.status || "Sprawdzono."));
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function downloadInvoiceXml(id) {
      const { data, error } = await CRM.SB.from("ksef_invoices").select("invoice_number,xml").eq("id", id).single();
      if (error || !data?.xml) { CRM.toast("Brak XML tej faktury."); return; }
      const blob = new Blob([data.xml], { type: "application/xml" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${String(data.invoice_number || "faktura").replaceAll("/", "-")}.xml`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    async function issuePaid() {
      try {
        CRM.toast("Wystawiam faktury…");
        const res = await call("/api/ksef/issue-paid", "POST", {});
        await reload();
        CRM.toast(`Zapisano ${res.issued?.length || 0} faktur.`);
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function onPage(kind, id) {
      if (kind === "product") {
        const p = CRM.S.trade.products.find((x) => x.id === id);
        const existing = p ? pageFor(p.id) : null;
        if (existing) { CRM.UI.genId = existing.id; location.hash = "generator"; CRM.toast("Ta pozycja ma już stronę."); return; }
        if (p) await makePage(sourceOfProduct(p), p.id);
      } else if (kind === "auction") {
        const a = CRM.S.trade.auctions.find((x) => x.id === id);
        const existing = a?.product_id ? pageFor(a.product_id) : null;
        if (existing) { CRM.UI.genId = existing.id; location.hash = "generator"; CRM.toast("Ta pozycja ma już stronę."); return; }
        if (a) await makePage(sourceOfAuction(a), a.product_id);
      } else if (kind === "import") {
        const item = CRM.S.trade.items.find((x) => x.id === id);
        const existing = item?.product_id ? pageFor(item.product_id) : null;
        if (existing) { CRM.UI.genId = existing.id; location.hash = "generator"; CRM.toast("Ta pozycja ma już stronę."); return; }
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
        const { freshAccessToken } = await import("./lib/panel-api.mjs");
        const token = await freshAccessToken(CRM.SB);
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
    function dbReason(error) {
      const msg = String(error?.message || error || "Nieznany błąd");
      if (/does not exist|schema cache|PGRST202|42883|function/i.test(msg)) return msg + " Uruchom ponownie cały plik supabase.sql w SQL Editor.";
      return msg;
    }
    async function newKey() {
      try {
        const { freshAccessToken } = await import("./lib/panel-api.mjs");
        const { mintApiKey, sha256Hex } = await import("./lib/supabase-rest.mjs");
        await freshAccessToken(CRM.SB);
        const label = document.getElementById("key-label")?.value.trim() || "Wtyczka";
        const key = mintApiKey();
        const key_hash = await sha256Hex(key);
        const { error } = await CRM.SB.rpc("create_api_key", { p_label: label, p_key_hash: key_hash });
        if (error) { CRM.toast(dbReason(error)); return; }
        T().freshKey = key;
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(dbReason(err)); }
    }
    async function revokeKey(id) {
      try {
        const { freshAccessToken } = await import("./lib/panel-api.mjs");
        await freshAccessToken(CRM.SB);
        const { error } = await CRM.SB.rpc("revoke_api_key", { p_id: id });
        if (error) { CRM.toast(dbReason(error)); return; }
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(dbReason(err)); }
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
