/* Baza produktów, wtyczka, aukcje, import z wtyczki, eksport i klucze API. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    const T = () => CRM.UI.trade || (CRM.UI.trade = { tier: "s1", status: "all", category: "all", q: "", selected: {}, picked: {}, tab: "pobrane", format: "staging", videoFormat: "9:16", seconds: 18, detail: null, freshKey: "", shopify: null, ksef: null });
    CRM.S.trade = { products: [], auctions: [], batches: [], items: [], categories: [], commissions: [], keys: [], accounts: [], pages: [], events: [], metrics: [], sales: [], invoices: [], shopOrders: [], error: "" };

    CRM.VIEWS.push(
      ["baza-produktow", "Baza produktów", "products"],
      ["wtyczka", "Wtyczka", "plug"],
      ["faktury-ksef", "Faktury KSeF", "orders"],
      ["aukcje", "Aukcje", "orders"],
      ["import-wtyczki", "Import", "inbox"],
      ["eksport", "Eksport", "down"],
      ["klucze-api", "Klucze API", "key"]
    );
    CRM.VIEW_FNS["baza-produktow"] = () => viewProducts();
    CRM.VIEW_FNS.wtyczka = () => viewWtyczka();
    CRM.VIEW_FNS["faktury-ksef"] = () => viewInvoices();
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
    let Guide = null;
    let WF = null;
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
      Guide = await import("./lib/extension-guide.mjs");
      WF = await import("./lib/workflow.mjs");
      tiers = ui;
      ui.ensureTierCss();
      const annCss = document.getElementById("ext-ann-css");
      if (annCss) annCss.textContent = Ann.EXT_ANN_CSS + Guide.EXT_GUIDE_CSS;
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
      t.pages = await load("pages", sb.from("pages").select("id,slug,name,status,product_id,updated_at").order("updated_at", { ascending: false }).limit(500));
      t.events = await load("events", sb.from("product_status_events").select("id,product_id,from_status,to_status,note,created_at").order("created_at", { ascending: false }).limit(400));
      t.metrics = await load("metrics", sb.from("page_metrics").select("page_id,slug,views,last_view_at").limit(500));
      t.sales = await load("sales", sb.from("product_sales").select("product_id,orders_count,units_sold,revenue").limit(500));
      t.invoices = await load("invoices", sb.from("ksef_invoices").select("id,shopify_order_id,invoice_number,ksef_number,status,error,env,issued_at,updated_at").order("updated_at", { ascending: false }).limit(200));
      t.shopOrders = await load("shopOrders", sb.from("shopify_orders").select("id,shopify_order_id,order_number,email,financial_status,currency,total,customer_name,placed_at").order("placed_at", { ascending: false }).limit(200));
      if (!window.NHP_LOCAL) {
        try { T().shopify = await call("/api/shopify/status", "GET"); } catch { T().shopify = { configured: false }; }
        try { T().ksef = await call("/api/ksef/status", "GET"); } catch { T().ksef = { configured: false, env: "test" }; }
        try { await call("/api/shopify/flush", "POST", {}); } catch { /* brak sekretów albo pusta kolejka */ }
      }
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
        bundle_2: p.raw?.cena_2,
        bundle_3: p.raw?.cena_3,
        raw: p.raw || {},
        video_url: p.generated?.video || "",
        video_rights: false,
        origin: "import"
      };
    }
    function sourceOfAuction(a) {
      return { ...sourceOfProduct(a), origin: a.origin };
    }

    async function makePage(source, productId, options = {}) {
      const { draftFromSource } = await import("./lib/page-draft.mjs");
      const { uniqueSlug } = await import("./lib/site-model.mjs");
      const draft = options.data
        ? { name: options.name || options.data.headline || source.catalog_name || source.name || "Szkic strony", status: "draft", data: options.data }
        : draftFromSource(source, { own: source.origin === "own" });
      if (CRM.loadPages) await CRM.loadPages();
      const existing = productId ? mainPage(productId) : null;
      if (existing && !options.force) {
        if (!options.quiet) {
          openGenerator(existing.id);
          CRM.toast("Ten produkt ma już stronę. Otwieram istniejącą kartę.");
        }
        return existing.id;
      }
      const slug = uniqueSlug(draft.name, (CRM.S.pagesList || []).map((p) => p.slug));
      const id = CRM.uid("pg");
      const { error } = await CRM.SB.from("pages").insert({ id, slug, name: draft.name, status: "draft", product_id: productId || null, data: draft.data });
      if (error) { CRM.toast("Nie udało się utworzyć szkicu strony."); return null; }
      const stub = { id, slug, name: draft.name, status: "draft", product_id: productId || null };
      CRM.S.pagesList = [stub, ...(CRM.S.pagesList || [])];
      if (CRM.S.trade) CRM.S.trade.pages = [stub, ...(CRM.S.trade.pages || [])];
      if (options.savePacks && productId) {
        const product = (CRM.S.trade.products || []).find((item) => item.id === productId);
        const raw = { ...(product?.raw || {}) };
        raw.cena_2 = options.bundle2 === "" || options.bundle2 == null ? null : options.bundle2;
        raw.cena_3 = options.bundle3 === "" || options.bundle3 == null ? null : options.bundle3;
        if (product) product.raw = raw;
        await CRM.SB.from("products").update({ raw, updated_at: new Date().toISOString() }).eq("id", productId);
      }
      if (productId) await advanceWorkflow(productId, "draft");
      try { await call("/api/shopify/flush", "POST", { product_ids: productId ? [productId] : [] }); } catch { /* Shopify opcjonalny */ }
      if (options.rewrite) await startGeneration({ tier: "s1", page_id: id, product_id: productId || undefined, overwrite: true });
      if (!options.quiet) {
        if (CRM.loadPages) await CRM.loadPages();
        await reload();
        CRM.UI.productPrep = null;
        CRM.UI.bazaPicker = false;
        CRM.UI.pageEditor = null;
        CRM.UI.sampleDemo = null;
        CRM.UI.genId = id;
        if (location.hash !== "#generator") location.hash = "generator";
        else CRM.scheduleRender();
        if (!options.rewrite) CRM.toast("Szkic strony zapisany. Produkt jest w zakładce Gotowe strony. Publikacja zostaje ręczna.");
      }
      return id;
    }

    async function advanceWorkflow(productId, pageStatus, intent) {
      if (!productId || !WF) return;
      const product = CRM.S.trade.products.find((item) => item.id === productId);
      const current = product?.workflow_status;
      let next;
      if (intent === "active" || intent === "hold" || intent === "draft") next = WF.workflowForShopifyPush(current, intent);
      else if (WF.shopifyAutoDraftEnabled(CRM.S.settings) && pageStatus !== "published") next = WF.workflowForShopifyPush(current, "draft");
      else next = WF.workflowAfterPage(current, pageStatus);
      if (!next || next === (current || "pobrany")) return;
      await CRM.SB.from("products").update({ workflow_status: next, updated_at: new Date().toISOString() }).eq("id", productId);
    }

    function openGenerator(pageId) {
      CRM.UI.genId = pageId;
      if (location.hash === "#generator") CRM.scheduleRender();
      else location.hash = "generator";
    }

    CRM.afterPageSaved = async (productId, pageStatus, intent) => {
      await advanceWorkflow(productId, pageStatus, intent);
      try { await call("/api/shopify/flush", "POST", { product_ids: [productId] }); } catch { /* brak sekretów */ }
      await reload();
    };

    async function markRewritten(pageId) {
      if (!pageId || !CRM.loadPages) return;
      await CRM.loadPages();
      const page = (CRM.S.pagesList || []).find((item) => item.id === pageId);
      if (!page?.data) return;
      const data = { ...page.data, source: { ...(page.data.source || {}), keep_original: false } };
      await CRM.SB.from("pages").update({ data, updated_at: new Date().toISOString() }).eq("id", pageId);
    }

    async function startGeneration({ tier, page_id, product_id, overwrite } = {}) {
      if (window.NHP_LOCAL) {
        CRM.toast(overwrite
          ? "Na tym komputerze zostawiam oryginalny opis. Przepisanie przez AI działa po wdrożeniu."
          : "Generowanie AI działa na Cloudflare, nie w lokalnej piaskownicy.");
        return { local: true };
      }
      try {
        CRM.toast(overwrite ? "Przepisuję opis własnymi zdaniami…" : "Piszę tekst…");
        let res = await call("/api/generate", "POST", { tier, page_id, product_id, overwrite: overwrite === true });
        let guard = 0;
        while (res.job?.status === "running" && guard < 8) {
          CRM.toast(`Zdjęcie AI ${guard + 1}…`);
          res = await call(`/api/generate/${res.job.id}`, "POST", {});
          guard++;
        }
        if (overwrite && page_id && res.job && !res.job.error) await markRewritten(page_id);
        const video = res.job?.result?.video === "panel" ? " Możesz teraz złożyć wideo w panelu." : "";
        CRM.toast((res.job?.status === "ready" ? (overwrite ? "Opis przepisany. Opinie nie zostały dopisane." : "Generacja gotowa.") : (res.job?.error || "Generacja częściowa.")) + video);
        if (CRM.loadPages) await CRM.loadPages();
        await reload();
        CRM.scheduleRender();
        return res;
      } catch (err) {
        CRM.toast(err.message || "Generacja nie powiodła się.");
        return { error: true };
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

    function workflowList() {
      return WF?.WORKFLOW || [
        { id: "pobrany", label: "Pobrany", color: "var(--grey)" },
        { id: "w_przygotowaniu", label: "W przygotowaniu", color: "var(--info)" },
        { id: "strona_gotowa", label: "Strona gotowa", color: "var(--violet)" },
        { id: "opublikowany", label: "Opublikowany w Shopify", color: "var(--good)" },
        { id: "wstrzymany", label: "Wstrzymany", color: "var(--warn)" },
        { id: "archiwum", label: "Archiwum", color: "var(--grey)" }
      ];
    }
    function workflowLabel(id) {
      if (!id) return "—";
      return workflowList().find((item) => item.id === id)?.label || id;
    }
    function pagesOf(productId) {
      return (WF ? WF.pagesForProduct(CRM.S.trade.pages, productId) : (CRM.S.trade.pages || []).filter((page) => String(page.product_id || "") === String(productId)));
    }
    function mainPage(productId) {
      return WF ? WF.primaryPage(CRM.S.trade.pages, productId) : pagesOf(productId)[0] || null;
    }
    function salesOf(productId) {
      return (CRM.S.trade.sales || []).find((row) => row.product_id === productId) || { orders_count: 0, units_sold: 0, revenue: 0 };
    }
    function viewsOf(productId) {
      const ids = new Set(pagesOf(productId).map((page) => page.id));
      return (CRM.S.trade.metrics || []).filter((row) => ids.has(row.page_id)).reduce((sum, row) => sum + Number(row.views || 0), 0);
    }
    function pageCell(product) {
      const page = mainPage(product.id);
      if (!page) return '<span class="pill" style="--c:var(--grey)">Brak strony</span>';
      const live = page.status === "published";
      const pill = `<span class="pill" style="--c:${live ? "var(--good)" : "var(--warn)"}">${live ? "Opublikowana" : "Szkic"}</span>`;
      const extra = pagesOf(product.id).length > 1 ? ` <span class="muted small">+${pagesOf(product.id).length - 1}</span>` : "";
      const link = live
        ? ` <a href="/p/${encodeURIComponent(page.slug)}" target="_blank" rel="noopener">/p/${CRM.esc(page.slug)}</a>`
        : ` <span class="small muted">${CRM.esc(page.slug)}</span>`;
      return `${pill}${link} <button class="btn sm" type="button" data-nhp="open-page" data-id="${CRM.esc(page.id)}">Edytuj</button>${extra}`;
    }
    function workflowSelect(product) {
      const current = product.workflow_status || "pobrany";
      const color = workflowList().find((item) => item.id === current)?.color || "var(--grey)";
      const options = workflowList().map((item) => `<option value="${item.id}" ${item.id === current ? "selected" : ""}>${CRM.esc(item.label)}</option>`).join("");
      return `<select class="pill" style="--c:${color}" data-workflow="${product.id}" aria-label="Status produktu">${options}</select>`;
    }
    function shopifyCell(product) {
      if (product.shopify_url) return `<a href="${CRM.esc(product.shopify_url)}" target="_blank" rel="noopener">Shopify</a>`;
      if (product.shopify_product_id) return `<span class="small">#${CRM.esc(product.shopify_product_id)}</span>`;
      if (product.shopify_sync_error) return `<span class="pill" style="--c:var(--bad)" title="${CRM.esc(product.shopify_sync_error)}">Błąd sync</span>`;
      return '<span class="muted small">Nie w Shopify</span>';
    }
    function viewProducts() {
      const ui = T();
      const q = (ui.q || "").toLowerCase();
      const split = WF ? WF.partitionProducts(CRM.S.trade.products, CRM.S.trade.pages) : { pobrane: CRM.S.trade.products, gotowe: [] };
      const tab = ui.tab === "gotowe" ? "gotowe" : "pobrane";
      const group = ui.group || "";
      const groups = productGroups();
      const rows = (tab === "gotowe" ? split.gotowe : split.pobrane).filter((product) => {
        if (group && String(product.product_group || "") !== group) return false;
        return !q || `${product.catalog_name} ${product.name} ${product.ean} ${product.producer} ${product.sku} ${product.product_group || ""}`.toLowerCase().includes(q);
      });
      const pendingInGroup = group ? (CRM.S.trade.products || []).filter((product) => String(product.product_group || "") === group && !mainPage(product.id)).length : 0;
      const shop = ui.shopify?.configured
        ? `<div class="banner">Shopify podłączony: <b>${CRM.esc(ui.shopify.domain || "")}</b>.${ui.shopify.webhook_secret ? "" : " Brakuje sekretu SHOPIFY_WEBHOOK_SECRET — zmiany ze sklepu nie wrócą."}</div>`
        : `<div class="banner">Shopify nie jest podłączony. W Cloudflare ustaw sekrety SHOPIFY_STORE_DOMAIN i SHOPIFY_ADMIN_TOKEN. Instrukcja jest w docs/shopify-ksef.md.</div>`;
      const body = rows.map((product) => {
        const sales = salesOf(product.id);
        const page = mainPage(product.id);
        const stats = tab === "gotowe"
          ? `<td class="num">${sales.orders_count || 0}</td><td class="num">${sales.units_sold || 0}</td><td class="num">${money(sales.revenue)}</td><td class="num">${viewsOf(product.id)}</td>`
          : "";
        const action = page
          ? `<button class="btn sm" type="button" data-nhp="open-page" data-id="${CRM.esc(page.id)}">Otwórz stronę</button>`
          : `<button class="btn sm primary" type="button" data-nhp="page" data-kind="product" data-id="${CRM.esc(product.id)}">Zrób stronę</button>`;
        return `<tr data-nhp="open" data-kind="product" data-id="${product.id}">
          <td data-stop><input type="checkbox" data-pick-product="${product.id}" ${ui.picked[product.id] ? "checked" : ""} aria-label="Zaznacz"></td>
          <td class="strong">${CRM.esc(product.catalog_name || product.name)}</td>
          <td>${CRM.esc(product.product_group || "—")}</td>
          <td>${CRM.esc(product.ean || "—")}</td>
          <td class="num">${money(product.price)}</td>
          <td>${pageCell(product)}</td>
          <td data-stop>${workflowSelect(product)}</td>
          <td>${shopifyCell(product)}</td>
          <td>${product.status === "flagged" ? '<span class="pill" style="--c:var(--bad)">Brak ceny</span>' : ""}</td>
          <td data-stop>${action}</td>
          ${stats}
        </tr>`;
      }).join("");
      const headStats = tab === "gotowe" ? "<th>Zamówienia</th><th>Szt.</th><th>Przychód</th><th>Wyświetlenia</th>" : "";
      const groupFilter = `<select id="product-group" aria-label="Grupa"><option value="">Wszystkie grupy</option>${groups.map((name) => `<option value="${CRM.esc(name)}" ${group === name ? "selected" : ""}>${CRM.esc(name)}</option>`).join("")}</select>
          <button class="btn sm primary" type="button" data-nhp="pages-group" ${group && pendingInGroup ? "" : "disabled"} title="${group ? `Zrób strony dla grupy ${CRM.esc(group)}` : "Najpierw wybierz grupę"}">Zrób strony${group ? ` (${pendingInGroup})` : ""}</button>`;
      const picked = Object.keys(ui.picked).filter((id) => ui.picked[id]);
      const bulk = `<div class="row">
          <button class="btn sm primary" type="button" data-nhp="bulk-pages" ${picked.length ? "" : "disabled"}>Zrób strony (${picked.length})</button>
          <select id="bulk-workflow" aria-label="Status dla zaznaczonych">${workflowList().map((item) => `<option value="${item.id}">${CRM.esc(item.label)}</option>`).join("")}</select>
          <button class="btn sm" type="button" data-nhp="bulk-status" ${picked.length ? "" : "disabled"}>Ustaw status (${picked.length})</button>
          <button class="btn sm" type="button" data-nhp="bulk-shopify" ${picked.length ? "" : "disabled"}>Wyślij do Shopify</button>
        </div>`;
      const sourceCount = tab === "gotowe" ? split.gotowe.length : split.pobrane.length;
      const empty = sourceCount
        ? `<div class="card"><div class="empty"><b>Nic nie pasuje</b>Zmień szukanie.</div></div>`
        : tab === "gotowe"
          ? `<div class="card"><div class="empty"><b>Brak gotowych stron</b>Produkty bez karty są w zakładce Pobrane produkty. Przycisk „Zrób stronę” nie tworzy drugiej, gdy karta już jest.</div></div>`
          : `<div class="card"><div class="empty"><b>Wszystkie produkty mają już stronę</b>Nowe importy z wtyczki wpadną tutaj, dopóki nie zrobisz im karty.</div></div>`;
      return top("Baza produktów", "Pobrane produkty nie mają jeszcze karty. Gotowe strony już ją mają — stąd widać Shopify, sprzedaż i wyświetlenia.", `<button class="btn" type="button" data-nhp="import-csv">Importuj CSV</button><button class="btn" type="button" data-nhp="shopify-webhooks">Zarejestruj webhooki</button><button class="btn" type="button" data-nhp="shopify-pull">Pobierz zamówienia</button><button class="btn" type="button" data-nhp="reload">Odśwież</button>`) +
        banner() + shop + sharklyBar() + detailCard() +
        `<div class="chips" style="margin-bottom:14px">
          <button class="chip" type="button" data-nhp="tab" data-tab="pobrane" aria-pressed="${tab === "pobrane"}">Pobrane produkty <span class="num">${split.pobrane.length}</span></button>
          <button class="chip" type="button" data-nhp="tab" data-tab="gotowe" aria-pressed="${tab === "gotowe"}">Gotowe strony <span class="num">${split.gotowe.length}</span></button>
        </div>
        <div class="toolbar"><label class="search">${CRM.ic("search", 16)}<input id="q-trade" data-trade-q placeholder="Nazwa, EAN, producent, SKU, grupa" value="${CRM.esc(ui.q || "")}"></label>${groupFilter}${bulk}</div>` +
        (rows.length ? `<div class="card tbl-wrap"><table><thead><tr><th></th><th>Nazwa katalogowa</th><th>Grupa</th><th>EAN</th><th>Cena</th><th>Strona</th><th>Status</th><th>Shopify</th><th></th><th></th>${headStats}</tr></thead><tbody>${body}</tbody></table></div>` : empty) +
        `<p class="small muted">Zmiana statusu, ceny, opisu albo treści strony idzie do Shopify sama, gdy produkt jest już w sklepie albo ma status od „Strona gotowa” w górę. Ustawienie „Automatycznie wysyłaj do Shopify po wygenerowaniu” (domyślnie włączone) zakłada szkic już przy zapisie strony. Aktywny produkt powstaje po „Opublikuj” w generatorze. Pobrany bez tego ustawienia nie zakłada karty, dopóki nie naciśniesz „Wyślij do Shopify”. Wyświetlenia liczy nasza strona /p/ (jedno na sesję przeglądarki). Sesje z panelu analitycznego Shopify nie są w Admin API.</p>`;
    }

    function detailCard() {
      const d = T().detail;
      if (!d) return "";
      if (d.kind === "product") {
        const p = CRM.S.trade.products.find((x) => x.id === d.id);
        if (!p) return "";
        const page = mainPage(p.id);
        const sales = salesOf(p.id);
        const history = (CRM.S.trade.events || []).filter((event) => event.product_id === p.id).slice(0, 8);
        const historyHtml = history.length
          ? `<ul class="small">${history.map((event) => `<li>${event.created_at ? new Date(event.created_at).toLocaleString("pl-PL") : ""} · ${CRM.esc(workflowLabel(event.from_status))} → <b>${CRM.esc(workflowLabel(event.to_status))}</b></li>`).join("")}</ul>`
          : `<p class="small muted">Brak historii statusu.</p>`;
        return `<section class="card pad" style="margin-bottom:14px">
          <div class="sec-h"><h2>${CRM.esc(p.catalog_name || p.name)}</h2><button class="btn sm" type="button" data-nhp="close">Zamknij</button></div>
          <p class="muted small">EAN ${CRM.esc(p.ean || "—")} · SKU ${CRM.esc(p.sku || "—")} · grupa ${CRM.esc(p.product_group || "bez grupy")} · ${CRM.esc(p.category || "bez kategorii")} · dostawa ${money(p.delivery_cost)} · bazowa ${money(p.base_price)}</p>
          <p class="small">Strona: ${pageCell(p)} · Shopify: ${shopifyCell(p)}${p.shopify_synced_at ? ` · sync ${CRM.esc(new Date(p.shopify_synced_at).toLocaleString("pl-PL"))}` : ""}</p>
          ${p.shopify_sync_error ? `<p class="small" style="color:var(--bad)">${CRM.esc(p.shopify_sync_error)}</p>` : ""}
          <div class="kv"><div><span>Zamówienia Shopify</span><strong class="num">${sales.orders_count || 0}</strong></div><div><span>Sztuki</span><strong class="num">${sales.units_sold || 0}</strong></div><div><span>Przychód</span><strong class="num">${money(sales.revenue)}</strong></div><div><span>Wyświetlenia strony</span><strong class="num">${viewsOf(p.id)}</strong></div></div>
          <div class="row" style="margin:10px 0"><span class="small muted">Status</span>${workflowSelect(p)}</div>
          <div class="row" style="flex-wrap:wrap;align-items:end">
            <label class="small">2 szt. (zł)<input id="pack-2" inputmode="decimal" value="${p.raw?.cena_2 ?? ""}" style="display:block;border:1px solid var(--line);border-radius:10px;padding:8px 10px;width:120px"></label>
            <label class="small">3 szt. (zł)<input id="pack-3" inputmode="decimal" value="${p.raw?.cena_3 ?? ""}" style="display:block;border:1px solid var(--line);border-radius:10px;padding:8px 10px;width:120px"></label>
            <button class="btn sm" type="button" data-nhp="save-packs" data-id="${p.id}">Zapisz zestawy</button>
          </div>
          <p class="small muted">Cena 1 szt. to cena produktu (${money(p.price)}). Puste 2 albo 3 szt. nie tworzy zestawu. Oszczędność liczy się od ceny jednej sztuki i idzie do wariantów Shopify.</p>
          ${tierBlock()}
          <div class="row">
            <button class="btn primary" type="button" data-nhp="page" data-kind="product" data-id="${p.id}">${page ? "Otwórz stronę" : "Zrób stronę"}</button>
            <button class="btn" type="button" data-nhp="shopify-one" data-id="${p.id}">Wyślij do Shopify</button>
            <button class="btn" type="button" data-nhp="generate" data-kind="product" data-id="${p.id}">Generuj</button>
            <button class="btn" type="button" data-nhp="video" data-kind="product" data-id="${p.id}">Złóż wideo</button>
          </div>
          ${videoFields()}
          <h3 class="small">Historia statusu</h3>
          ${historyHtml}
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

    function invoiceLabel(status) {
      const map = {
        szkic: ["Szkic", "var(--grey)"],
        oczekuje_konfiguracji: ["Czeka na sekrety KSeF", "var(--warn)"],
        wyslana: ["Wysłana, czekam na numer", "var(--info)"],
        przyjeta: ["Przyjęta w KSeF", "var(--good)"],
        odrzucona: ["Odrzucona", "var(--bad)"],
        blad: ["Błąd", "var(--bad)"]
      };
      const row = map[status] || [status || "—", "var(--grey)"];
      return `<span class="pill" style="--c:${row[1]}">${CRM.esc(row[0])}</span>`;
    }
    function viewInvoices() {
      const ui = T();
      const ksef = ui.ksef?.configured
        ? `KSeF podłączony, środowisko <b>${CRM.esc(ui.ksef.env || "test")}</b>.`
        : "KSeF nie jest podłączony. Ustaw KSEF_TOKEN, KSEF_NIP, KSEF_SELLER_NAME i KSEF_SELLER_ADDRESS1. Domyślnie środowisko testowe (KSEF_ENV=test).";
      const invoices = Object.fromEntries((CRM.S.trade.invoices || []).map((row) => [row.shopify_order_id, row]));
      const orders = CRM.S.trade.shopOrders || [];
      const body = orders.map((order) => {
        const invoice = invoices[order.shopify_order_id];
        return `<tr>
          <td class="strong">${CRM.esc(order.order_number || order.shopify_order_id)}</td>
          <td>${CRM.esc(order.customer_name || order.email || "—")}</td>
          <td class="num">${money(order.total)} ${CRM.esc(order.currency || "")}</td>
          <td>${CRM.esc(order.financial_status || "")}</td>
          <td>${invoice ? invoiceLabel(invoice.status) : '<span class="muted small">brak</span>'}${invoice?.invoice_number ? `<div class="small muted">${CRM.esc(invoice.invoice_number)}</div>` : ""}${invoice?.ksef_number ? `<div class="small">${CRM.esc(invoice.ksef_number)}</div>` : ""}</td>
          <td class="small">${invoice?.error ? CRM.esc(invoice.error) : ""}</td>
          <td class="row">
            <button class="btn sm primary" type="button" data-nhp="ksef-issue" data-order="${CRM.esc(order.shopify_order_id)}">${invoice?.status === "przyjeta" ? "Jest w KSeF" : "Wystaw"}</button>
            ${invoice?.status === "wyslana" ? `<button class="btn sm" type="button" data-nhp="ksef-refresh" data-order="${CRM.esc(order.shopify_order_id)}">Sprawdź numer</button>` : ""}
          </td>
        </tr>`;
      }).join("");
      return top("Faktury KSeF", "FA(3) dla zamówień Shopify. Opłacone zamówienie dostaje fakturę samo. Resztę wystawisz ręcznie.", `<button class="btn" type="button" data-nhp="shopify-pull">Pobierz zamówienia</button><button class="btn" type="button" data-nhp="reload">Odśwież</button>`) +
        banner() + `<div class="banner">${ksef} Szczegóły sekretów: docs/shopify-ksef.md.</div>` +
        (orders.length ? `<div class="card tbl-wrap"><table><thead><tr><th>Zamówienie</th><th>Nabywca</th><th>Kwota</th><th>Płatność</th><th>Faktura</th><th>Komunikat</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="card"><div class="empty"><b>Brak zamówień Shopify</b>Zarejestruj webhooki w Bazie produktów albo pobierz zamówienia.</div></div>`) +
        `<p class="small muted">Automat dotyczy statusów paid i partially_paid. Korekty, zaliczki, waluty inne niż PLN i wysyłka PDF do klienta nie są w tej wersji. XML zostaje przy fakturze w bazie.</p>`;
    }

    function viewWtyczka() {
      const body = Guide
        ? Guide.extensionPageHtml(CRM.esc, { keys: CRM.S.trade.keys || [], freshKey: T().freshKey || "" })
        : `<section class="card pad"><p class="ext-kicker">Wtyczka</p><button class="btn primary" type="button" data-nhp="download-ext">Pobierz wtyczkę (.zip)</button></section>`;
      return top("Wtyczka", "Pobierz wtyczkę do Chrome i zbieraj oferty do Bazy produktów.", "") + banner() + body;
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
      try { await call("/api/shopify/flush", "POST", {}); } catch { /* Shopify opcjonalny */ }
      await reload();
      CRM.toast(ok ? `Ustawiono cenę na ${ok} aukcjach.` : "Nic nie zmieniono.");
      CRM.scheduleRender();
    }

    function sharklyBar() {
      const pages = T().csvPages !== false;
      const rights = T().csvRights !== false;
      return `<div class="card pad" style="margin-bottom:14px"><div class="row" style="flex-wrap:wrap;align-items:center">
        <button class="btn" type="button" data-nhp="import-csv">Importuj CSV</button>
        <label class="row"><input type="checkbox" data-csv-pages ${pages ? "checked" : ""}> Utwórz karty Konwersja</label>
        <label class="row"><input type="checkbox" data-csv-rights ${rights ? "checked" : ""}> Mam prawo do zdjęć z pliku</label>
      </div>
      <p class="small muted">Eksport wtyczki (średnik): tytul, cena, ean, opis1–10, zdj i zdj_opis, param, grupa. Opcjonalnie cena_2 i cena_3. Cena sprzedaży jest tylko w kolumnie „cena”. Pusta nie jest uzupełniana z cena_zrodlowa. Zestaw 2 i 3 powstaje tylko z własnej ceny. Kolumna grupa zapisuje się przy produkcie. Zaznaczone karty idą jako szkic do Shopify, gdy automatyczne wysyłanie jest włączone.</p></div>`;
    }
    CRM.sharklyImportBar = sharklyBar;
    CRM.openSharklyImport = () => openSharklyFile();

    function openSharklyFile() {
      let input = document.getElementById("sharkly-file");
      if (!input) {
        input = document.createElement("input");
        input.type = "file";
        input.id = "sharkly-file";
        input.accept = ".csv,text/csv";
        input.hidden = true;
        input.addEventListener("change", () => {
          const file = input.files && input.files[0];
          input.value = "";
          if (file) readSharklyFile(file);
        });
        document.body.appendChild(input);
      }
      input.click();
    }

    function readSharklyFile(file) {
      const reader = new FileReader();
      reader.onload = () => { importSharklyCsv(String(reader.result || "")); };
      reader.onerror = () => CRM.toast("Nie udało się odczytać pliku.");
      reader.readAsText(file, "utf-8");
    }

    async function importSharklyCsv(text) {
      const parsed = await import("./lib/sharkly-csv.mjs");
      const result = parsed.rowsFromSharklyCsv(text);
      if (!result.ok) { CRM.toast(result.error); return; }
      if (!result.rows.length) { CRM.toast("W pliku nie ma produktów."); return; }
      const makePages = T().csvPages !== false;
      const rights = T().csvRights !== false;
      const { uniqueSlug } = await import("./lib/site-model.mjs");
      if (CRM.loadPages) await CRM.loadPages();
      const slugs = (CRM.S.pagesList || []).map((page) => page.slug);
      let products = 0;
      let pages = 0;
      let skippedPrice = 0;
      for (const row of result.rows) {
        const product = parsed.productFromSharkly(row);
        const known = (CRM.S.trade.products || []).find((item) => (row.ean && item.ean === row.ean) || (row.sku && item.sku === row.sku));
        let productId = known?.id || null;
        const body = { ...product, updated_at: new Date().toISOString() };
        if (productId) {
          const { error } = await CRM.SB.from("products").update(body).eq("id", productId);
          if (error) { CRM.toast("Nie udało się zapisać produktu."); return; }
        } else {
          const { data, error } = await CRM.SB.from("products").insert(body).select("id").single();
          if (error || !data?.id) { CRM.toast("Nie udało się dodać produktu."); return; }
          productId = data.id;
          CRM.S.trade.products.push({ ...body, id: productId });
        }
        products += 1;
        if (row.price == null) skippedPrice += 1;
        if (!makePages || !row.title) continue;
        const data = parsed.pageFromSharkly(row, { rights });
        const existingPage = (CRM.S.pagesList || []).find((page) => String(page.product_id || "") === String(productId));
        if (existingPage && existingPage.status === "published") continue;
        const slug = existingPage?.slug || uniqueSlug(row.title, slugs);
        if (!existingPage) slugs.push(slug);
        const pageRow = {
          id: existingPage?.id || CRM.uid("pg"),
          slug,
          name: row.title.slice(0, 200),
          status: "draft",
          product_id: productId,
          data,
          updated_at: new Date().toISOString()
        };
        const { error } = await CRM.SB.from("pages").upsert(pageRow);
        if (error) { CRM.toast("Produkt jest w bazie, karty nie udało się zapisać."); return; }
        pages += 1;
        if (!existingPage) CRM.S.pagesList = (CRM.S.pagesList || []).concat(pageRow);
        if (row.price != null && CRM.afterPageSaved) {
          try { await CRM.afterPageSaved(productId, "draft"); } catch { /* szkic Shopify jest dodatkowy */ }
        }
      }
      if (CRM.loadPages) await CRM.loadPages();
      await reload();
      const priceNote = skippedPrice ? ` ${skippedPrice} bez ceny — nie wysłane do Shopify.` : "";
      CRM.toast(`Zapisano ${products} produktów${makePages ? `, kart Konwersja: ${pages}.` : "."}${priceNote}`);
      CRM.scheduleRender();
    }

    async function savePacks(productId) {
      const product = CRM.S.trade.products.find((item) => item.id === productId);
      if (!product) return;
      const { packBundles, cleanSiteData } = await import("./lib/site-model.mjs");
      const two = document.getElementById("pack-2")?.value ?? "";
      const three = document.getElementById("pack-3")?.value ?? "";
      const { parseMoney } = await import("./lib/pricing.mjs");
      const raw = { ...(product.raw || {}), cena_2: parseMoney(two), cena_3: parseMoney(three) };
      const { error } = await CRM.SB.from("products").update({ raw, updated_at: new Date().toISOString() }).eq("id", productId);
      if (error) { CRM.toast("Nie udało się zapisać zestawów."); return; }
      product.raw = raw;
      const bundles = packBundles(product.price, raw.cena_2, raw.cena_3);
      const page = (CRM.S.pagesList || []).find((item) => String(item.product_id || "") === String(productId))
        || (CRM.S.trade.pages || []).find((item) => String(item.product_id || "") === String(productId));
      if (page?.id && CRM.SB) {
        if (CRM.loadPages) await CRM.loadPages();
        const full = (CRM.S.pagesList || []).find((item) => item.id === page.id) || page;
        const data = cleanSiteData({ ...(full.data || {}), price: product.price, bundles, default_bundle: bundles.length >= 2 ? 1 : 0 });
        const { error: pageError } = await CRM.SB.from("pages").update({ data, updated_at: new Date().toISOString() }).eq("id", page.id);
        if (pageError) { CRM.toast("Ceny zestawów są przy produkcie, karty nie udało się zaktualizować."); return; }
        if (product.price != null && CRM.afterPageSaved) {
          try { await CRM.afterPageSaved(productId, full.status || "draft"); } catch { /* szkic Shopify jest dodatkowy */ }
        }
      }
      await reload();
      CRM.toast(bundles.length > 1 ? `Zestawy: ${bundles.map((item) => item.label).join(", ")}.` : "Została cena 1 szt.");
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
      if (act === "open" && e.target.closest("a, button, input, select, label")) return;
      if (act === "reload") { await reload(); CRM.scheduleRender(); return; }
      if (act === "tab") { T().tab = t.dataset.tab === "gotowe" ? "gotowe" : "pobrane"; CRM.scheduleRender(); return; }
      if (act === "open-page") { e.preventDefault(); openGenerator(t.dataset.id); return; }
      if (act === "bulk-status") return setWorkflow(pickedIds(), document.getElementById("bulk-workflow")?.value);
      if (act === "bulk-pages") return bulkPages(pickedIds());
      if (act === "bulk-shopify") return pushShopify(pickedIds());
      if (act === "shopify-one") return pushShopify([t.dataset.id]);
      if (act === "shopify-webhooks") return registerWebhooks();
      if (act === "shopify-pull") return pullOrders();
      if (act === "ksef-issue") return issueInvoice(t.dataset.order);
      if (act === "ksef-refresh") return refreshInvoice(t.dataset.order);
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
      if (act === "import-csv") return openSharklyFile();
      if (act === "pages-group") return makePagesForGroup();
      if (act === "save-packs") return savePacks(t.dataset.id);
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
        CRM.scheduleRender();
        return;
      }
      if (e.target.dataset?.workflow) {
        setWorkflow([e.target.dataset.workflow], e.target.value);
        return;
      }
      if (e.target.id === "product-group") { T().group = e.target.value; CRM.scheduleRender(); return; }
      if (e.target.id === "auc-status") { T().status = e.target.value; CRM.scheduleRender(); }
      if (e.target.id === "auc-cat") { T().category = e.target.value; CRM.scheduleRender(); }
      if (e.target.id === "vid-format") T().videoFormat = e.target.value;
      if (e.target.id === "vid-seconds") T().seconds = e.target.value;
      if (e.target.dataset?.csvPages !== undefined) { T().csvPages = e.target.checked; return; }
      if (e.target.dataset?.csvRights !== undefined) { T().csvRights = e.target.checked; return; }
    });
    document.addEventListener("input", (e) => {
      if (e.target.dataset?.tradeQ !== undefined) { T().q = e.target.value; CRM.scheduleRender(); }
    });

    function productGroups() {
      const names = new Set();
      for (const product of CRM.S.trade.products || []) {
        const name = String(product.product_group || "").trim();
        if (name) names.add(name);
      }
      return [...names].sort((a, b) => a.localeCompare(b, "pl"));
    }
    async function makePagesForGroup(groupName) {
      const group = groupName || T().group || "";
      if (!group) { CRM.toast("Wybierz grupę."); return; }
      const ids = (CRM.S.trade.products || [])
        .filter((product) => String(product.product_group || "") === group && !mainPage(product.id))
        .map((product) => product.id);
      if (!ids.length) { CRM.toast("W tej grupie każda pozycja ma już kartę."); return; }
      await bulkPages(ids);
    }
    CRM.makePagesForGroup = (groupName) => makePagesForGroup(groupName);
    function pickedIds() {
      return Object.keys(T().picked).filter((id) => T().picked[id]);
    }
    async function setWorkflow(ids, status) {
      if (!ids.length) { CRM.toast("Zaznacz produkty."); return; }
      if (WF && !WF.isWorkflow(status)) { CRM.toast("Nieznany status."); return; }
      for (const id of ids) {
        const { error } = await CRM.SB.from("products").update({ workflow_status: status, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) { CRM.toast("Nie udało się zapisać statusu. Uruchom ponownie supabase.sql."); return; }
      }
      try {
        const res = await call("/api/shopify/flush", "POST", { product_ids: ids });
        if (res.configured === false) CRM.toast("Status zapisany. Shopify jeszcze nie jest podłączony.");
        else if (res.errors?.length) CRM.toast(res.errors[0].error);
        else CRM.toast("Status zapisany.");
      } catch (err) {
        CRM.toast(/skonfigurowany|SHOPIFY_/i.test(err.message || "") ? "Status zapisany. Shopify jeszcze nie jest podłączony." : (err.message || "Status zapisany, synchronizacja nie doszła."));
      }
      await reload();
      CRM.scheduleRender();
    }
    async function pushShopify(ids) {
      if (!ids.length) { CRM.toast("Zaznacz produkty."); return; }
      try {
        const res = await call("/api/shopify/push", "POST", { product_ids: ids });
        const bad = (res.results || []).filter((item) => !item.ok && !item.skipped);
        CRM.toast(bad.length ? bad[0].error : "Wysłano do Shopify.");
      } catch (err) { CRM.toast(err.message); }
      await reload();
      CRM.scheduleRender();
    }
    async function registerWebhooks() {
      try {
        const res = await call("/api/shopify/webhooks", "POST", {});
        const failed = (res.topics || []).filter((item) => !item.ok);
        CRM.toast(failed.length ? failed[0].error : `Webhooki wskazują na ${res.callbackUrl}`);
      } catch (err) { CRM.toast(err.message); }
    }
    async function pullOrders() {
      try {
        const res = await call("/api/shopify/orders", "POST", {});
        CRM.toast(`Pobrano ${res.saved || 0} zamówień Shopify.`);
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function issueInvoice(orderId) {
      try {
        const res = await call("/api/ksef/issue", "POST", { shopify_order_id: orderId });
        const invoice = res.invoice || {};
        CRM.toast(invoice.ksef_number ? `KSeF ${invoice.ksef_number}` : (invoice.error || "Faktura zapisana."));
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function refreshInvoice(orderId) {
      try {
        const res = await call("/api/ksef/refresh", "POST", { shopify_order_id: orderId });
        CRM.toast(res.invoice?.ksef_number ? `KSeF ${res.invoice.ksef_number}` : "KSeF jeszcze nie nadał numeru.");
        await reload();
        CRM.scheduleRender();
      } catch (err) { CRM.toast(err.message); }
    }
    async function bulkPages(ids) {
      if (!ids.length) { CRM.toast("Zaznacz produkty."); return; }
      const { pageFromProduct } = await import("./lib/page-from-product.mjs");
      let made = 0;
      let skipped = 0;
      for (const id of ids) {
        if (mainPage(id)) { skipped += 1; continue; }
        const product = CRM.S.trade.products.find((item) => item.id === id);
        if (!product) continue;
        const draft = pageFromProduct(product, { keepOriginal: true, rights: false });
        const saved = await makePage(sourceOfProduct(product), product.id, { data: draft.data, name: draft.name, quiet: true });
        if (saved) made += 1;
      }
      await reload();
      if (CRM.loadPages) await CRM.loadPages();
      CRM.toast(made
        ? `Zrobiono ${made} ${made === 1 ? "stronę" : "stron"}. Opis zostaje oryginalny. Zdjęcia bez potwierdzenia prawa nie wejdą na opublikowaną stronę.${skipped ? ` Pominięto ${skipped}, bo karta już jest.` : ""}`
        : "Zaznaczone produkty mają już strony.");
      CRM.scheduleRender();
    }
    async function onPage(kind, id) {
      if (kind === "product") {
        const page = mainPage(id);
        if (page) {
          openGenerator(page.id);
          CRM.toast("Ten produkt ma już stronę. Otwieram istniejącą kartę.");
          return;
        }
        const price2 = document.getElementById("pack-2")?.value;
        const price3 = document.getElementById("pack-3")?.value;
        if (CRM.openProductPrep) {
          await CRM.openProductPrep(id, {
            price2: price2 == null ? undefined : price2,
            price3: price3 == null ? undefined : price3
          });
          return;
        }
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
