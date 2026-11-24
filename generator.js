/* Generator stron — moduł panelu Centrali. Rejestruje się przed startem CRM. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("gen-css")) return;
    const css = document.createElement("style");
    css.id = "gen-css";
    css.textContent = `
      .issues{margin:0 0 14px;padding:12px 14px 12px 32px;border-radius:12px;background:color-mix(in srgb,var(--warn) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--warn) 40%,var(--line))}
      .issues li{margin:4px 0}
      .gen-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
      .gen-sec{margin-bottom:12px}
      .gen-sec summary{cursor:pointer;font-family:var(--display);font-weight:750;font-size:18px;padding:14px 16px}
      .gen-sec .body{padding:0 16px 16px;display:grid;gap:12px}
      .mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:10px;border:1px dashed var(--line);border-radius:12px}
      .mini b{grid-column:1/-1;font-size:13px}
      .baza-list{display:grid;gap:8px}
      .baza-row{display:grid;grid-template-columns:54px 1fr auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
      .baza-row img,.baza-ph{width:54px;height:54px;object-fit:cover;border-radius:8px;background:var(--line)}
      .photo-row{display:grid;grid-template-columns:72px 1fr auto;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
      .photo-row img{width:72px;height:72px;object-fit:cover;border-radius:8px;background:var(--line)}
      .prep-copy{max-height:180px;overflow:auto;white-space:pre-wrap;margin:0}
      @media(max-width:800px){.gen-grid{grid-template-columns:1fr}.baza-row,.photo-row{grid-template-columns:54px 1fr}}
      .sample-frame{width:100%;height:min(78vh,920px);border:1px solid var(--line);border-radius:16px;background:#faf8f5}
    `;
    document.head.appendChild(css);

    CRM.SCHEMA.leads = { one: "leada", title: "Lead", fields: [
      { k: "name", l: "Imię", t: "text" }, { k: "email", l: "E-mail", t: "text" },
      { k: "page_slug", l: "Strona", t: "text" }, { k: "bundle", l: "Zestaw", t: "text" },
      { k: "status", l: "Status", t: "select", opts: [["nowy", "Nowy"], ["zamowil", "Złożył zamówienie"], ["odpisany", "Odpisany"]] },
      { k: "notes", l: "Notatki", t: "textarea", full: 1 }
    ]};
    CRM.SCHEMA.messages = { one: "wiadomość", title: "Wiadomość", fields: [
      { k: "name", l: "Imię", t: "text" }, { k: "email", l: "E-mail", t: "text" },
      { k: "topic", l: "Temat", t: "text" }, { k: "page_slug", l: "Strona", t: "text" },
      { k: "status", l: "Status", t: "select", opts: [["nowe", "Nowe"], ["odpisane", "Odpisane"]] },
      { k: "message", l: "Treść", t: "textarea", full: 1 }
    ]};
    CRM.COLS.push("leads", "messages");
    CRM.DEFAULTS.leads = { status: "nowy" };
    CRM.DEFAULTS.messages = { status: "nowe" };
    CRM.S.leads = CRM.S.leads || {};
    CRM.S.messages = CRM.S.messages || {};
    CRM.S.pagesList = [];
    CRM.S.pagesError = "";
    CRM.UI.genId = null;

    CRM.VIEWS.push(
      ["generator", "Generator stron", "spark"],
      ["leady", "Leady", "inbox"],
      ["wiadomosci", "Wiadomości", "mail"]
    );
    CRM.VIEW_FNS.generator = vGenerator;
    CRM.VIEW_FNS.leady = vLeads;
    CRM.VIEW_FNS.wiadomosci = vMessages;
    CRM.badgeFns.push(() => ({
      wiadomosci: CRM.arr("messages").filter((m) => (m.status || "nowe") === "nowe").length,
      leady: CRM.arr("leads").filter((l) => (l.status || "nowy") === "nowy").length
    }));

    let M = null;
    let WF = null;
    let FromProduct = null;
    CRM.readyFns.push(async () => {
      M = await import("./lib/site-model.mjs");
      WF = await import("./lib/workflow.mjs");
      FromProduct = await import("./lib/page-from-product.mjs");
      await loadPages();
      if (!CRM.S.pagesChannel && CRM.SB.channel) {
        CRM.S.pagesChannel = CRM.SB.channel("pages-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "pages" }, () => { loadPages().then(() => CRM.scheduleRender()); })
          .subscribe();
      }
    });

    async function loadPages() {
      const { data, error } = await CRM.SB.from("pages").select("*").order("updated_at", { ascending: false });
      if (error) {
        const msg = String(error.message || error);
        CRM.S.pagesError = /schema cache|does not exist|42P01|relation/i.test(msg)
          ? "Brakuje tabeli stron. W Supabase → SQL Editor uruchom ponownie cały plik supabase.sql."
          : "Nie udało się wczytać stron: " + msg;
        CRM.S.pagesList = [];
        return;
      }
      CRM.S.pagesError = "";
      CRM.S.pagesList = data || [];
    }
    CRM.loadPages = loadPages;

    function vLeads() {
      const list = CRM.arr("leads").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const rows = list.map((l) => `<tr data-edit="leads:${l.id}"><td class="strong">${CRM.esc(l.name || "—")}</td><td>${CRM.esc(l.email || "")}</td><td>${l.page_slug ? `/p/${CRM.esc(l.page_slug)}` : "—"}</td><td>${CRM.esc(l.bundle || "—")}</td><td>${CRM.esc(l.status || "nowy")}</td><td class="muted num">${l.createdAt ? new Date(l.createdAt).toLocaleString("pl-PL") : "—"}</td></tr>`).join("");
      return CRM.esc && top("Leady", "Adresy zostawione na stronach one-page (zgoda na przypomnienie albo zapis z koszyka).", "") +
        `<div class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Osoba</th><th>E-mail</th><th>Strona</th><th>Zestaw</th><th>Status</th><th>Kiedy</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty"><b>Brak leadów</b>Pojawią się, gdy ktoś zostawi e-mail na opublikowanej stronie.</div>`}</div>`;
    }
    function vMessages() {
      const list = CRM.arr("messages").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const rows = list.map((m) => `<tr data-edit="messages:${m.id}"><td class="strong">${CRM.esc(m.name || "—")}${m.status === "nowe" || !m.status ? ` <span class="pill" style="--c:var(--info)">Nowe</span>` : ""}</td><td>${CRM.esc(m.email || "")}</td><td>${CRM.esc(m.topic || "—")}</td><td>${m.page_slug ? `/p/${CRM.esc(m.page_slug)}` : "—"}</td><td>${CRM.esc(String(m.message || "").slice(0, 80))}</td></tr>`).join("");
      return top("Wiadomości", "Pytania z formularza kontaktowego na stronach produktów.", "") +
        `<div class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Od</th><th>E-mail</th><th>Temat</th><th>Strona</th><th>Treść</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty"><b>Skrzynka pusta</b>Wiadomości z opublikowanych stron wpadną tutaj.</div>`}</div>`;
    }

    function top(title, sub, actions) {
      return `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions || ""}</div></div>`;
    }

    function vGenerator() {
      if (!M) return top("Generator stron", "Wczytuję moduł…", "") + `<div class="card pad">Chwila…</div>`;
      if (CRM.UI.sampleDemo) return sampleDemoView();
      if (CRM.UI.pageEditor && CRM.pageEditorHtml) return CRM.pageEditorHtml();
      if (CRM.UI.productPrep) return productPrepView();
      if (CRM.UI.bazaPicker) return bazaPickerView();
      if (CRM.UI.genId) return editor();
      const list = CRM.S.pagesList || [];
      const cards = list.map((p) => {
        const d = M.cleanSiteData(p.data || {});
        const issues = M.sitePublishIssues(p, d);
        const img = (d.images.find((i) => i.rights) || {}).url;
        return `<article class="card pcard" data-g="edit" data-id="${CRM.esc(p.id)}" tabindex="0">
          <div class="row" style="justify-content:space-between"><span class="pill" style="--c:${p.status === "published" ? "var(--good)" : "var(--warn)"}">${p.status === "published" ? "Opublikowana" : "Szkic"}</span>${img ? `<img src="${CRM.esc(img)}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:8px">` : ""}</div>
          <div><h3>${CRM.esc(p.name || d.headline || "Bez nazwy")}</h3><div class="small muted">/p/${CRM.esc(p.slug)} · ${d.template === "konwersja" || (d.template === "auto" && d.generated?.tier === "s1_max") ? "Konwersja" : d.template === "auto" ? "Szablon auto" : "Klasyczny"}</div></div>
          <div class="small muted">${shopifyLine(shopifyOf(p))}</div>
          <div class="small ${issues.length ? "" : "muted"}">${p.status === "published" ? "Widoczna publicznie" : issues.length ? `${issues.length} braków do publikacji` : "Gotowa do publikacji"}</div>
          <button class="btn sm" type="button" data-g="simple" data-id="${CRM.esc(p.id)}">Edytor strony</button>
        </article>`;
      }).join("");
      return top("Generator stron", "Karty produktów one-page. Po publikacji adres to /p/nazwa, a sklep sam pojawia się na liście sklepów.",
        `<button class="btn" data-g="import-csv" type="button">Importuj CSV</button><button class="btn" data-g="baza-open" type="button">Wybierz z Bazy produktów</button><button class="btn" data-g="sample" type="button">Przykładowa strona</button><button class="btn" data-g="example" type="button">Wstaw przykład</button><button class="btn primary" data-g="new" type="button">${CRM.ic("plus", 16)} Nowa strona</button>`) +
        (CRM.sharklyImportBar ? CRM.sharklyImportBar() : "") +
        (CRM.S.pagesError ? `<div class="banner">${CRM.esc(CRM.S.pagesError)}</div>` : "") +
        (list.length ? `<section class="grid cards">${cards}</section>` : `<div class="card"><div class="empty"><b>Nie masz jeszcze stron</b>Utwórz kartę produktu albo wstaw przykład kalendarza, żeby zobaczyć szablon.</div></div>`);
    }

    function pageById(id) { return (CRM.S.pagesList || []).find((p) => p.id === id) || null; }
    function shopifyOf(page) {
      const id = page?.product_id;
      if (!id || !CRM.S.trade) return null;
      return (CRM.S.trade.products || []).find((p) => p.id === id) || null;
    }
    function shopifyLine(product) {
      if (!product) return "Bez powiązanego produktu — Shopify czeka na wybór z bazy.";
      const st = String(product.shopify_status || "");
      const label = st === "active" ? "Aktywny w Shopify" : st === "draft" ? "Szkic w Shopify" : st === "archived" ? "Archiwum w Shopify" : product.shopify_product_id ? "Wysłany do Shopify" : "Jeszcze nie wysłany";
      const link = product.shopify_url ? ` · <a href="${CRM.esc(product.shopify_url)}" target="_blank" rel="noopener">Otwórz produkt</a>` : "";
      const err = product.shopify_sync_error ? ` · ${CRM.esc(product.shopify_sync_error)}` : "";
      return label + link + err;
    }

    function sampleDemoView() {
      const tier = CRM.UI.sampleDemo.tier || "s1";
      const saveLabel = CRM.S.pagesError ? "Tylko podgląd — brak tabeli stron" : "Zapisz jako szkic";
      queueMicrotask(() => { fillSamplePreview(); });
      return top("Przykładowa strona", "Dane przykładowe w jasnym szablonie. Nie trzeba klucza OpenAI, wtyczki ani Allegro.",
        `<button class="btn" type="button" data-g="sample-close">Wróć do listy</button>`) +
        `<div class="banner">To są dane przykładowe. Publikacja jest zablokowana, dopóki nie podmienisz treści i nie odznaczysz „przykład”.</div>` +
        `<section class="card pad"><h2>Poziom podglądu</h2>${CRM.tierHtml ? CRM.tierHtml() : ""}<p class="small muted">S1 to tekst i zdjęcia z repozytorium. S1 Pro dokłada rysunek aranżacji. S1 Max składa krótkie wideo w tej przeglądarce. Żaden poziom nie woła modelu.</p>
        <div class="row"><button class="btn primary" type="button" data-g="sample-save" ${CRM.S.pagesError ? "disabled" : ""}>${saveLabel}</button></div>
        ${CRM.S.pagesError ? `<p class="small muted">${CRM.esc(CRM.S.pagesError)} Podgląd i tak działa.</p>` : ""}</section>` +
        `<iframe class="sample-frame" id="sample-frame" title="Podgląd przykładowej strony"></iframe>`;
    }

    async function fillSamplePreview() {
      const frame = document.getElementById("sample-frame");
      if (!frame || !CRM.UI.sampleDemo || !M) return;
      const tier = CRM.UI.sampleDemo.tier || "s1";
      const { samplePageData } = await import("./lib/sample-page.mjs");
      let data = samplePageData(tier);
      if (tier === "s1_max") {
        try {
          const { buildStoryboard } = await import("./lib/video-storyboard.mjs");
          const { renderProductVideo } = await import("./video-renderer.js");
          const board = buildStoryboard({
            title: data.headline,
            price: data.price,
            omnibus: data.omnibus_price,
            benefits: (data.benefits || []).map((b) => b.title),
            images: (data.images || []).map((i) => i.url),
            seconds: 15,
            format: "1:1",
            accent: "#ff5a00",
            music: false
          });
          const file = await renderProductVideo(board);
          const url = URL.createObjectURL(file.blob);
          data = M.cleanSiteData({
            ...data,
            video: { url, poster: data.images[0]?.url || "", rights: true },
            ugc: [{ video: url, poster: data.images[0]?.url || "", author: "Przykład", text: "Wideo złożone w przeglądarce ze zdjęć przykładowych. To nie jest nagranie klienta." }]
          });
        } catch (err) {
          CRM.toast("Podgląd bez wideo: " + (err.message || "nie udało się złożyć klipu."));
        }
      }
      CRM.UI.sampleDemo.prepared = data;
      const { renderPage } = await import("./lib/render.mjs");
      frame.srcdoc = renderPage(
        { name: "Przykład: " + (data.headline || "strona"), slug: "przyklad", status: "draft", id: "przyklad" },
        data,
        { preview: true, origin: location.origin }
      );
    }

    async function saveSampleDraft() {
      if (CRM.S.pagesError) {
        CRM.toast("Podgląd zostaje na ekranie. Szkicu nie zapiszę: " + CRM.S.pagesError);
        return;
      }
      const data = CRM.UI.sampleDemo?.prepared;
      if (!data) { CRM.toast("Podgląd jeszcze się składa."); return; }
      const { uniqueSlug } = M;
      const name = "Przykład: " + (data.headline || "strona");
      const slug = uniqueSlug(name, (CRM.S.pagesList || []).map((p) => p.slug));
      const id = CRM.uid("pg");
      const { error } = await CRM.SB.from("pages").insert({
        id, slug, name, status: "draft", product_id: null, data, updated_at: new Date().toISOString()
      });
      if (error) {
        CRM.toast("Nie zapisano szkicu: " + (error.message || "błąd bazy") + " Podgląd zostaje.");
        return;
      }
      await loadPages();
      CRM.UI.sampleDemo = null;
      CRM.UI.genId = id;
      CRM.toast("Zapisano szkic przykładowej strony.");
      CRM.scheduleRender();
    }

    function inp(id, label, value, attrs = "") {
      return `<div class="f"><label for="${id}">${label}</label><input id="${id}" value="${CRM.esc(value ?? "")}" ${attrs}></div>`;
    }
    function area(id, label, value) {
      return `<div class="f" style="grid-column:1/-1"><label for="${id}">${label}</label><textarea id="${id}">${CRM.esc(value ?? "")}</textarea></div>`;
    }

    function tradeProducts() {
      return (CRM.S.trade && Array.isArray(CRM.S.trade.products) ? CRM.S.trade.products : []).slice();
    }
    function pageForProduct(id) {
      const pages = [].concat(CRM.S.pagesList || [], (CRM.S.trade && CRM.S.trade.pages) || []);
      return pages.find((page) => String(page.product_id || "") === String(id)) || null;
    }
    function productThumb(product) {
      const photos = FromProduct ? FromProduct.listProductPhotos(product) : [];
      if (photos[0]) return photos[0].url;
      const img = (product.images || [])[0];
      return typeof img === "string" ? img : (img?.url || "");
    }
    function bazaPickerView() {
      const products = tradeProducts().sort((a, b) => String(a.catalog_name || a.name || "").localeCompare(String(b.catalog_name || b.name || ""), "pl"));
      const rows = products.map((product) => {
        const page = pageForProduct(product.id);
        const name = product.catalog_name || product.name || "Bez nazwy";
        const thumb = productThumb(product);
        const key = `${name} ${product.ean || ""}`.toLowerCase();
        return `<article class="baza-row" data-baza-row="${CRM.esc(key)}">
          ${thumb ? `<img src="${CRM.esc(thumb)}" alt="">` : `<span class="baza-ph"></span>`}
          <div><b>${CRM.esc(name)}</b><div class="small muted">EAN ${CRM.esc(product.ean || "—")}${product.producer ? ` · ${CRM.esc(product.producer)}` : ""}</div></div>
          ${page
            ? `<button class="btn sm" type="button" data-g="baza-open-page" data-id="${CRM.esc(page.id)}">Otwórz stronę</button>`
            : `<button class="btn sm primary" type="button" data-g="baza-choose" data-id="${CRM.esc(product.id)}">Wybierz</button>`}
        </article>`;
      }).join("");
      return top("Wybierz z Bazy produktów", "Szukaj po nazwie albo EAN. Wiersz bez strony otwiera przygotowanie karty.",
        `<button class="btn" type="button" data-g="baza-close">Wróć do listy</button>`) +
        `<div class="card pad"><label class="search">${CRM.ic("search", 16)}<input id="baza-q" placeholder="Nazwa albo EAN" autocomplete="off"></label>
        <div class="baza-list" style="margin-top:12px">${rows || `<p class="muted">Baza produktów jest pusta. Najpierw zapisz ofertę wtyczką.</p>`}</div></div>`;
    }
    function productPrepView() {
      const prep = CRM.UI.productPrep;
      const product = tradeProducts().find((item) => item.id === prep?.productId);
      if (!prep || !product || !FromProduct) {
        return top("Przygotowanie strony", "Nie udało się otworzyć produktu.", `<button class="btn" type="button" data-g="baza-close">Wróć</button>`) +
          `<div class="card pad"><p>Wróć do Bazy produktów i spróbuj ponownie.</p></div>`;
      }
      const name = product.catalog_name || product.name || "Produkt";
      const text = FromProduct.descriptionText(product);
      const specs = FromProduct.factSpecs(product);
      const packs = M.packBundles(product.price, prep.price2, prep.price3);
      const savings = packs.map((pack) => `${pack.label}: ${pack.price} zł${pack.badge ? ` (${pack.badge})` : ""}`).join(" · ");
      const auto = !WF || WF.shopifyAutoDraftEnabled(CRM.S.settings);
      const shopLine = auto
        ? "Automatyczne wysyłanie do Shopify jest włączone. Po utworzeniu strony powstanie szkic produktu, a zestawy będą wariantami."
        : "Automatyczne wysyłanie do Shopify jest wyłączone. Szkic w sklepie powstanie, gdy włączysz wysyłkę na karcie albo naciśniesz „Wyślij do Shopify”.";
      const photos = (prep.images || []).map((photo, index) => `<div class="photo-row">
          <img src="${CRM.esc(photo.url)}" alt="">
          <label class="row"><input type="checkbox" data-photo-include data-i="${index}" ${photo.include !== false ? "checked" : ""}> Pokaż na stronie${index === 0 && photo.include !== false ? " · zdjęcie główne" : ""}</label>
          <span class="row">
            <button class="btn sm" type="button" data-g="photo-up" data-i="${index}" ${index ? "" : "disabled"}>Wyżej</button>
            <button class="btn sm" type="button" data-g="photo-down" data-i="${index}" ${index < prep.images.length - 1 ? "" : "disabled"}>Niżej</button>
          </span>
        </div>`).join("");
      return top("Strona z Bazy produktów", CRM.esc(name),
        `<button class="btn" type="button" data-g="baza-close">Wróć</button>`) +
        `<div class="banner">Zdjęcia muszą być Wasze albo mieć licencję od producenta. Cudze zdjęcia z oferty innego sprzedawcy i cudze logotypy nie wchodzą na stronę. Odznacz zdjęcie, którego nie chcesz użyć.</div>` +
        `<section class="card pad"><p class="muted small">EAN ${CRM.esc(product.ean || "—")} · ${CRM.esc(product.producer || product.brand || "brak producenta")} · cena 1 szt. ${CRM.esc(String(product.price ?? "—"))} zł</p>
          <label class="row"><input type="checkbox" id="keep-original" ${prep.keepOriginal !== false ? "checked" : ""}> Zostaw oryginalny opis</label>
          <p class="small muted">Włączone: nagłówek i opis z wtyczki trafiają na stronę bez zmian. Później poprawisz je w Edytorze strony. Parametry, EAN i producent zostają jako fakty.</p>
          <div class="row">
            <button class="btn" type="button" data-g="rewrite-ai">Przepisz opis przez AI</button>
            <button class="btn primary" type="button" data-g="create-from-baza">Utwórz stronę</button>
          </div>
          <p class="small muted">„Przepisz opis przez AI” pisze własny tekst na podstawie faktów. Nie kopiuje zdań i nie dopisuje opinii ani nagrań. Na tym komputerze, bez wdrożenia, zostaje oryginał.</p>
        </section>` +
        `<section class="card pad"><h2>Zestawy</h2>
          <div class="gen-grid">
            <div class="f"><label for="price-1">Cena 1 szt. (zł)</label><input id="price-1" value="${CRM.esc(product.price ?? "")}" readonly></div>
            <div class="f"><label for="price-2">Cena 2 szt. (zł, puste = brak zestawu)</label><input id="price-2" inputmode="decimal" value="${CRM.esc(prep.price2 ?? "")}"></div>
            <div class="f"><label for="price-3">Cena 3 szt. (zł, puste = brak zestawu)</label><input id="price-3" inputmode="decimal" value="${CRM.esc(prep.price3 ?? "")}"></div>
          </div>
          <p class="small" id="bundle-preview">${CRM.esc(savings || "Brak ceny jednej sztuki.")}</p>
          <p class="small muted">Oszczędność liczy się od ceny jednej sztuki. Puste 2 albo 3 szt. nie tworzy zestawu.</p>
          <p class="small muted">${shopLine}</p>
        </section>` +
        `<section class="card pad"><h2>Zdjęcia</h2>
          <p class="small muted">Pierwsze zaznaczone zdjęcie jest główne. Kolejność zmienisz przyciskami. Logotypy są już pominięte.${(prep.images || []).length > 12 ? " Na stronę wchodzi 12 pierwszych zaznaczonych zdjęć." : ""}</p>
          ${photos || `<p class="muted">Wtyczka nie zapisała zdjęć produktu.</p>`}
          <label class="row" style="margin-top:10px"><input type="checkbox" id="photo-rights" ${prep.rights ? "checked" : ""}> Potwierdzam, że zaznaczone zdjęcia są nasze albo mamy licencję producenta</label>
          <p class="small muted">Bez tego zdjęcia widać w podglądzie, ale nie wejdą na opublikowaną stronę.</p>
        </section>` +
        `<section class="card pad"><h2>Opis z wtyczki</h2><pre class="prep-copy">${CRM.esc(text || "Brak opisu.")}</pre>
          ${specs.length ? `<h3 class="small">Parametry</h3><div class="tbl-wrap"><table><tbody>${specs.map((spec) => `<tr><th>${CRM.esc(spec.name)}</th><td>${CRM.esc(spec.value)}</td></tr>`).join("")}</tbody></table></div>` : ""}
        </section>`;
    }
    function readPrep() {
      const prep = CRM.UI.productPrep;
      if (!prep) return null;
      const keep = document.getElementById("keep-original");
      if (keep) prep.keepOriginal = keep.checked;
      const price2 = document.getElementById("price-2");
      const price3 = document.getElementById("price-3");
      const rights = document.getElementById("photo-rights");
      if (price2) prep.price2 = price2.value;
      if (price3) prep.price3 = price3.value;
      if (rights) prep.rights = rights.checked;
      document.querySelectorAll("[data-photo-include]").forEach((box) => {
        const index = Number(box.dataset.i);
        if (prep.images[index]) prep.images[index].include = box.checked;
      });
      return prep;
    }
    function movePrepPhoto(index, direction) {
      const prep = readPrep();
      if (!prep) return;
      const next = index + direction;
      if (next < 0 || next >= prep.images.length) return;
      const [item] = prep.images.splice(index, 1);
      prep.images.splice(next, 0, item);
      CRM.scheduleRender();
    }
    async function createFromPrep(rewrite) {
      const prep = readPrep();
      if (!prep || !FromProduct) return;
      const product = tradeProducts().find((item) => item.id === prep.productId);
      if (!product) { CRM.toast("Nie ma tego produktu w bazie."); return; }
      const existing = pageForProduct(product.id);
      if (existing) {
        CRM.UI.productPrep = null;
        CRM.UI.genId = existing.id;
        CRM.toast("Ten produkt ma już stronę. Otwieram istniejącą kartę.");
        CRM.scheduleRender();
        return;
      }
      const wantRewrite = rewrite === true || prep.keepOriginal === false;
      const draft = FromProduct.pageFromProduct(product, {
        keepOriginal: true,
        images: prep.images,
        bundle2: prep.price2,
        bundle3: prep.price3,
        rights: prep.rights
      });
      if (!wantRewrite) draft.data.source.keep_original = prep.keepOriginal !== false;
      CRM.UI.productPrep = null;
      CRM.UI.bazaPicker = false;
      if (!CRM.makePageFrom) { CRM.toast("Moduł bazy jeszcze się wczytuje."); return; }
      await CRM.makePageFrom(product, product.id, {
        data: draft.data,
        name: draft.name,
        rewrite: wantRewrite,
        savePacks: true,
        bundle2: prep.price2,
        bundle3: prep.price3
      });
    }

    function editor() {
      const existing = CRM.UI.genId === "new" ? null : pageById(CRM.UI.genId);
      const d = existing ? M.cleanSiteData(existing.data || {}) : (CRM.UI.genExample ? M.exampleSiteData() : M.emptySiteData());
      if (CRM.UI.genExample && !existing) {
        d.images = [1, 2, 3, 4, 5].map((n) => ({ url: `/assets/demo/slide-${n}.svg`, alt: "Zdjęcie przykładowe", rights: true }));
        d.example = true;
      }
      // Puste pola sprzedawcy bierzemy z Ustawień zespołu (wpisywane raz).
      const defSeller = (CRM.S.settings && CRM.S.settings.seller) || {};
      for (const k of ["name", "address", "nip", "email", "phone"]) if (!d.seller[k] && defSeller[k]) d.seller[k] = defSeller[k];
      if (!existing && defSeller.vat_exempt) d.seller.vat_exempt = true;
      const issues = M.sitePublishIssues({ name: existing?.name || d.headline }, d);
      const catalog = CRM.S.trade && CRM.S.trade.products && CRM.S.trade.products.length ? CRM.S.trade.products : CRM.arr("products");
      const products = catalog.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pl"));
      const b = (i) => d.bundles[i] || {};
      const img = (i) => d.images[i] || {};
      const bundleBox = (i) => `<div class="mini"><b>Zestaw ${i + 1}</b>
        ${inp(`b-label-${i}`, "Etykieta", b(i).label || "", `placeholder="${i + 1} szt."`)}
        ${inp(`b-qty-${i}`, "Sztuki", b(i).qty || "", 'inputmode="numeric"')}
        ${inp(`b-price-${i}`, "Cena zestawu (zł)", b(i).price ?? "", 'inputmode="decimal"')}
        ${inp(`b-was-${i}`, "Cena przekreślona", b(i).compare_at ?? "", 'inputmode="decimal"')}
        ${inp(`b-om-${i}`, "Najniższa z 30 dni", b(i).omnibus ?? "", 'inputmode="decimal"')}
        ${inp(`b-badge-${i}`, "Badge oszczędności", b(i).badge || "", 'placeholder="Oszczędzasz 10%"')}
        ${inp(`b-note-${i}`, "Gratis (notatka)", b(i).note || "")}
      </div>`;
      const imageSlots = Math.min(12, Math.max(6, (d.images || []).length));
      const imageBox = (i) => `<div class="mini"><b>Zdjęcie ${i + 1}${i === 0 ? " · główne" : ""}</b>
        ${inp(`img-url-${i}`, "Adres pliku (https albo /ścieżka)", img(i).url || "")}
        ${inp(`img-alt-${i}`, "Opis alternatywny", img(i).alt || "")}
        <label class="row" style="grid-column:1/-1"><input type="checkbox" id="img-rights-${i}" ${img(i).rights ? "checked" : ""}> Pokaż na stronie — mam prawo użyć tego zdjęcia</label>
      </div>`;
      const fromOffer = !!(d.source && d.source.description);
      const keepOn = fromOffer && d.source.keep_original !== false;
      const feat = (i) => d.features[i] || {};
      const ben = (i) => d.benefits[i] || {};
      const cmp = (i) => d.compare[i] || {};
      const rev = (i) => d.reviews[i] || {};
      const fq = (i) => d.faq[i] || {};
      const rel = (i) => d.related[i] || {};
      const call = (i) => d.callouts[i] || {};
      const ugc = (i) => d.ugc[i] || {};
      const ad = d.addons[0] || {};
      return top(existing ? "Edycja strony" : "Nowa strona", "Pola oznaczone w makiecie. Puste wiersze są pomijane.",
        `<button class="btn" type="button" data-g="back">Wróć do listy</button><button class="btn" type="button" data-g="simple" data-id="${CRM.esc(existing?.id || "")}">Edytor strony</button>`) +
        (issues.length ? `<ol class="issues">${issues.map((x) => `<li>${CRM.esc(x)}</li>`).join("")}</ol>` : `<div class="banner" style="border-color:color-mix(in srgb,var(--good) 40%,var(--line));background:color-mix(in srgb,var(--good) 10%,var(--surface))">Dane wystarczą do publikacji.</div>`) +
        `<section class="card pad"><h2>Generacja</h2>${CRM.tierHtml ? CRM.tierHtml() : ""}<div class="row"><button class="btn primary" type="button" data-g="ai">Generuj treść</button><button class="btn" type="button" data-g="rewrite">Przepisz opis przez AI</button><button class="btn" type="button" data-g="video">Złóż wideo w panelu</button></div><p class="small muted">S1 — tekst, szablon klasyczny. S1 Pro — tekst i 1 zdjęcie AI. S1 Max — tekst, 5 zdjęć AI, wideo w tej przeglądarce i domyślnie szablon Konwersja. Najpierw zapisz szkic. „Przepisz opis przez AI” zmienia tylko tekst i nie dopisuje opinii ani nagrań.</p></section>` +
        `<form id="pageForm">
          <details class="card gen-sec" open><summary>Adres i powiązanie</summary><div class="body gen-grid">
            ${inp("p-name", "Nazwa wewnętrzna", existing?.name || d.headline || "")}
            ${inp("p-slug", "Adres (slug)", existing?.slug || "", 'placeholder="kalendarz-adwentowy"')}
            <div class="f"><label for="p-product">Produkt w CRM (opcjonalnie)</label><select id="p-product"><option value="">— brak —</option>${products.map((p) => `<option value="${CRM.esc(p.id)}" ${existing && existing.product_id === p.id ? "selected" : ""}>${CRM.esc(p.name || p.id)}</option>`).join("")}</select></div>
            ${inp("p-accent", "Kolor akcentu", d.theme.accent || "#ff5a00", 'type="color"')}
            <label class="row" style="grid-column:1/-1"><input type="checkbox" id="p-example" ${d.example ? "checked" : ""}> To tylko przykład (blokuje publikację, dopóki nie odznaczysz)</label>
            <div class="f" style="grid-column:1/-1"><label for="p-template">Szablon</label><select id="p-template">
              <option value="auto" ${d.template === "auto" ? "selected" : ""}>Automatycznie — S1 Max dostaje Konwersję</option>
              <option value="klasyczny" ${d.template === "klasyczny" ? "selected" : ""}>Klasyczny</option>
              <option value="konwersja" ${d.template === "konwersja" ? "selected" : ""}>Konwersja</option>
            </select><p class="small muted">Konwersja: pionowy wybór zestawu, baner, pasek zaufania, opinie ze zdjęciem, porównanie, pytania na końcu, przyklejony koszyk na telefonie. Istniejące karty bez tego pola zostają klasyczne.</p></div>
          </div></details>
          <details class="card gen-sec" open><summary>Sekcje szablonu Konwersja</summary><div class="body">
            <p class="small muted">Każdą sekcję da się wyłączyć. Pusta opinia, puste nagranie i pusta nazwa zaufania nie wchodzą na opublikowaną stronę. W podglądzie widać przerywane miejsce z opisem.</p>
            <div class="gen-grid">${(M.PAGE_SECTIONS || []).map(([key, label]) => `<label class="row"><input type="checkbox" id="sec-${key}" ${d.sections?.[key] !== false ? "checked" : ""}> ${CRM.esc(label)}</label>`).join("")}</div>
            <div class="gen-grid">
              <label class="row"><input type="checkbox" id="sale-on" ${d.sale?.enabled ? "checked" : ""}> Włącz baner (sam wpisujesz tekst, bez zmyślonej wyprzedaży)</label>
              ${inp("sale-label", "Napis banera, np. wyprzedaż sezonowa", d.sale?.label || "")}
              ${inp("sale-text", "Dopisek banera", d.sale?.text || "")}
              ${inp("sale-end", "Koniec banera (data i godzina, puste = bez licznika)", d.sale?.ends_at ? d.sale.ends_at.slice(0, 16) : "", 'type="datetime-local"')}
              <label class="row"><input type="checkbox" id="urg-stock" ${d.urgency?.show_stock !== false ? "checked" : ""}> Pokaż stan, tylko gdy jest wpisany</label>
              <label class="row"><input type="checkbox" id="urg-timer" ${d.urgency?.show_timer ? "checked" : ""}> Pokaż licznik do podanej daty</label>
              ${inp("urg-end", "Koniec licznika", d.urgency?.ends_at ? d.urgency.ends_at.slice(0, 16) : "", 'type="datetime-local"')}
              ${inp("urg-label", "Podpis przy liczniku", d.urgency?.label || "")}
              ${inp("trust-title", "Tytuł paska zaufania", d.trust_title || "")}
              ${area("trust-names", "Nazwy w pasku zaufania, po jednej w wierszu", (d.trust_names || []).join("\n"))}
            </div>
            <div class="banner">${shopifyLine(shopifyOf(existing))}</div>
            <label class="row"><input type="checkbox" id="p-shopify-auto" ${(WF && WF.shopifyAutoDraftEnabled(CRM.S.settings)) ? "checked" : ""}> Automatycznie wysyłaj do Shopify po wygenerowaniu</label>
            <p class="small muted">Domyślnie włączone. Zapis i generacja tworzą szkic produktu. Aktywny produkt powstaje dopiero po „Opublikuj”. Wycofanie strony wraca w sklepie do szkicu.</p>
          </div></details>
          <details class="card gen-sec" open><summary>Nagłówek</summary><div class="body gen-grid">
            ${fromOffer ? `<label class="row" style="grid-column:1/-1"><input type="checkbox" id="p-keep-original" ${keepOn ? "checked" : ""}> Zostaw oryginalny opis</label><p class="small muted" style="grid-column:1/-1">Włączone: nagłówek i opis z wtyczki zostają. Wyłącz i naciśnij „Przepisz opis przez AI”, jeśli tekst ma być napisany od nowa. Parametry, EAN i producent zostają.</p>` : ""}
            ${inp("p-brand", "Marka w nagłówku", d.brand)}
            ${inp("p-kicker", "Nadtytuł", d.kicker)}
            ${inp("p-headline", "Nagłówek", d.headline)}
            ${area("p-lead", "Lead", d.subheadline)}
            ${inp("p-ann", "Pasek na górze", d.announcement)}
            ${inp("p-price", "Cena 1 szt. (zł), gdy nie ma zestawów", d.price ?? "")}
            ${inp("p-compare", "Cena przekreślona", d.compare_at ?? "")}
            ${inp("p-omni", "Najniższa cena z 30 dni", d.omnibus_price ?? "")}
            ${inp("p-cost", "Koszt zakupu szt. (do zysku w CRM)", d.cost ?? "")}
            ${inp("p-stock", "Stan magazynu (puste = nie pokazuj liczby)", d.stock ?? "", 'inputmode="numeric" placeholder="np. 14"')}
          </div></details>
          <details class="card gen-sec" open><summary>Zestawy 1 / 2 / 3</summary><div class="body">${[0, 1, 2].map(bundleBox).join("")}</div></details>
          <details class="card gen-sec"><summary>Zdjęcia i podpisy na zdjęciu</summary><div class="body"><p class="small muted">Zdjęcia muszą być Wasze albo mieć licencję od producenta. Odznacz zdjęcie, którego nie wolno użyć. Cudzych logotypów nie wstawiamy. Pierwsze zdjęcie jest główne.</p>${Array.from({ length: imageSlots }, (_, i) => imageBox(i)).join("")}
            <div class="gen-grid">${[0, 1, 2].map((i) => inp(`call-${i}`, `Podpis ${i + 1} na pierwszym zdjęciu`, call(i).label || "")).join("")}</div>
          </div></details>
          <details class="card gen-sec"><summary>Wariant / kolor</summary><div class="body gen-grid">
            ${inp("p-varlabel", "Nazwa wariantu", d.variant_label || "Kolor")}
            ${area("p-vars", "Warianty, po jednym w wierszu", (d.variants || []).join("\n"))}
          </div></details>
          <details class="card gen-sec"><summary>Punkty pod nagłówkiem i cechy 01–04</summary><div class="body">
            <div class="gen-grid">${[0, 1, 2].map((i) => `<div class="mini"><b>Korzyść ${i + 1}</b>${inp(`ben-${i}`, "Tytuł przy cenie", ben(i).title || "")}${inp(`ben-t-${i}`, "Dopisek", ben(i).text || "")}<div class="f"><label for="ben-i-${i}">Ikona</label><select id="ben-i-${i}">${(M.BENEFIT_ICONS || ["check"]).map((ic) => `<option value="${ic}" ${(ben(i).icon || "check") === ic ? "selected" : ""}>${ic}</option>`).join("")}</select></div></div>`).join("")}</div>
            ${inp("p-bentitle", "Tytuł sekcji cech", d.benefits_title)}
            ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<div class="mini"><b>Cecha ${String(i + 1).padStart(2, "0")}</b>${inp(`ft-${i}`, "Tytuł", feat(i).title || "")}${inp(`fx-${i}`, "Opis", feat(i).text || "")}</div>`).join("")}
            ${area("p-specs", "Parametry, jedna linia: nazwa | wartość", (d.specs || []).map((spec) => `${spec.name} | ${spec.value}`).join("\n"))}
          </div></details>
          <details class="card gen-sec"><summary>Obawa</summary><div class="body gen-grid">
            ${inp("p-pt", "Pytanie / obawa", d.problem.title)}
            ${area("p-px", "Odpowiedź", d.problem.text)}
            ${inp("p-pi", "Zdjęcie (adres z listy zdjęć albo własny https)", d.problem.image)}
          </div></details>
          <details class="card gen-sec"><summary>Porównanie</summary><div class="body">
            <div class="gen-grid">${inp("p-ours", "Nagłówek kolumny „my”", d.compare_ours)}${inp("p-others", "Nagłówek kolumny „oni”", d.compare_others)}
              ${inp("p-cimg-o", "Zdjęcie „u nas” (https)", d.compare_image_ours || "")}
              ${inp("p-cimg-t", "Zdjęcie „zwykły” (https)", d.compare_image_others || "")}
              ${inp("p-ccap-o", "Podpis zdjęcia „u nas”", d.compare_caption_ours || "")}
              ${inp("p-ccap-t", "Podpis zdjęcia „zwykły”", d.compare_caption_others || "")}
            </div>
            ${d.compare_image_ours || d.compare_image_others ? "" : `<p class="small muted">Bez zdjęć porównanie jest tabelą. Przerywane miejsce widać tylko w podglądzie.</p>`}
            ${[0, 1, 2, 3, 4].map((i) => `<div class="mini"><b>Wiersz ${i + 1}</b>${inp(`c-f-${i}`, "Cecha", cmp(i).feature || "")}${inp(`c-o-${i}`, "U nas", cmp(i).ours || "")}${inp(`c-t-${i}`, "U innych", cmp(i).others || "")}</div>`).join("")}
          </div></details>
          <details class="card gen-sec"><summary>Opinie (tylko z linkiem do źródła)</summary><div class="body"><div class="ph-slot" style="border:1px dashed var(--line);border-radius:12px;padding:12px"><b>Bez źródła opinia nie wchodzi na stronę.</b> Generator ich nie wymyśla. Puste pole zostaje puste.</div>${[0, 1, 2, 3, 4].map((i) => `<div class="mini"><b>Opinia ${i + 1}</b>${inp(`r-a-${i}`, "Autor", rev(i).author || "")}${inp(`r-s-${i}`, "Ocena 1–5", rev(i).rating || "")}${inp(`r-u-${i}`, "Link do źródła", rev(i).source_url || "")}${inp(`r-p-${i}`, "Zdjęcie opinii (https, opcjonalnie)", rev(i).photo || "")}${inp(`r-t-${i}`, "Treść", rev(i).text || "")}</div>`).join("")}</div></details>
          <details class="card gen-sec"><summary>Pytania i obiekcje</summary><div class="body">${[0, 1, 2, 3, 4, 5].map((i) => `<div class="mini"><b>Pytanie ${i + 1}</b>${inp(`q-${i}`, "Pytanie", fq(i).q || "", 'placeholder="Czym to się różni od zwykłego zestawu?"')}${inp(`a-${i}`, "Odpowiedź", fq(i).a || "")}</div>`).join("")}</div></details>
          <details class="card gen-sec"><summary>Nagrania od klientów</summary><div class="body"><div class="ph-slot" style="border:1px dashed var(--line);border-radius:12px;padding:12px"><b>Brak nagrania = sekcja ukryta na żywo.</b> Wklej tylko film, do którego masz prawa.</div>${[0, 1, 2].map((i) => `<div class="mini"><b>Nagranie ${i + 1}</b>${inp(`u-v-${i}`, "Adres wideo (https)", ugc(i).video || "")}${inp(`u-p-${i}`, "Klatka (poster)", ugc(i).poster || "")}${inp(`u-a-${i}`, "Autor", ugc(i).author || "")}${inp(`u-t-${i}`, "Podpis", ugc(i).text || "")}</div>`).join("")}</div></details>
          <details class="card gen-sec"><summary>Dodatek, pasuje do, dostawa</summary><div class="body">
            <div class="mini"><b>Dodatek do koszyka (upsell)</b>${inp("ad-name", "Nazwa", ad.name || "")}${inp("ad-price", "Cena", ad.price ?? "")}${inp("ad-text", "Dopisek", ad.text || "")}</div>
            ${[0, 1, 2, 3].map((i) => `<div class="mini"><b>Pasuje do ${i + 1}</b>${inp(`rel-n-${i}`, "Nazwa", rel(i).name || "")}${inp(`rel-p-${i}`, "Cena", rel(i).price ?? "")}${inp(`rel-u-${i}`, "Link", rel(i).url || "")}</div>`).join("")}
            <div class="gen-grid">
              ${inp("sh-cut", "Godzina graniczna wysyłki (Warszawa)", d.shipping.cutoff || "15:00", 'placeholder="15:00"')}
              ${inp("sh-time", "Hasło o czasie wysyłki", d.shipping.time || "Wysyłka 24 h")}
              ${inp("sh-from", "Skąd wysyłka", d.shipping.from || "")}
              ${inp("sh-price", "Cena dostawy, gdy płatna", d.shipping.price ?? "")}
              ${inp("sh-days", "Dni na zwrot", d.returns_days || 30)}
              <label class="row"><input type="checkbox" id="sh-free" ${d.shipping.free ? "checked" : ""}> Darmowa dostawa</label>
            </div>
            ${area("p-guar", "Gwarancja", d.guarantee)}
          </div></details>
          <details class="card gen-sec" open><summary>Sprzedawca, GPSR, płatność</summary><div class="body gen-grid">
            ${inp("s-name", "Nazwa sprzedawcy", d.seller.name)}
            ${inp("s-mail", "E-mail", d.seller.email)}
            ${inp("s-phone", "Telefon", d.seller.phone)}
            ${inp("s-nip", "NIP", d.seller.nip)}
            ${area("s-addr", "Adres", d.seller.address)}
            <label class="row"><input type="checkbox" id="s-vat" ${d.seller.vat_exempt ? "checked" : ""}> Zwolnienie z VAT</label>
            ${inp("g-name", "Producent (GPSR)", d.gpsr.producer)}
            ${inp("g-addr", "Adres producenta", d.gpsr.address)}
            ${inp("g-mail", "Kontakt producenta", d.gpsr.contact)}
            ${inp("g-resp", "Osoba odpowiedzialna w UE", d.gpsr.responsible)}
            ${area("g-warn", "Ostrzeżenia", d.gpsr.warnings)}
            ${inp("p-pay", "Szablon linku płatności (Przelewy24), opcjonalnie", d.pay_url, 'placeholder="https://…?n={number}&kwota={total}"')}
            ${inp("p-check", "Zewnętrzny link do zakupu, opcjonalnie", d.checkout_url)}
            ${inp("seo-t", "Tytuł SEO", d.seo.title)}
            ${area("seo-d", "Opis SEO", d.seo.description)}
          </div></details>
          <div class="row" style="margin:8px 0 28px">
            <button class="btn primary" type="submit">Zapisz szkic</button>
            <button class="btn" type="button" data-g="preview">Podgląd</button>
            <button class="btn" type="button" data-g="publish">Opublikuj</button>
            ${existing && existing.status === "published" ? `<button class="btn" type="button" data-g="unpublish">Wycofaj</button>` : ""}
            ${existing ? `<a class="btn" href="/p/${CRM.esc(existing.slug)}" target="_blank" rel="noopener">Otwórz /p/${CRM.esc(existing.slug)}</a>` : ""}
            ${existing ? `<button class="btn danger" type="button" data-g="delete">Usuń</button>` : ""}
          </div>
        </form>`;
    }

    function gv(id) { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
    function gc(id) { const el = document.getElementById(id); return !!(el && el.checked); }
    function lines(id) { return gv(id).split(/\n+/).map((s) => s.trim()).filter(Boolean); }

    function collect(existing) {
      const prev = existing ? M.cleanSiteData(existing.data || {}) : {};
      const bundles = [0, 1, 2].map((i) => ({
        label: gv(`b-label-${i}`) || `${i + 1} szt.`, qty: gv(`b-qty-${i}`) || (i + 1), price: gv(`b-price-${i}`),
        compare_at: gv(`b-was-${i}`), omnibus: gv(`b-om-${i}`), badge: gv(`b-badge-${i}`), note: gv(`b-note-${i}`)
      }));
      const priced = M.fillBundleSavings ? M.fillBundleSavings(bundles) : bundles;
      const images = [];
      for (let i = 0; i < 12; i++) {
        if (!document.getElementById(`img-url-${i}`)) continue;
        const url = gv(`img-url-${i}`);
        if (url) images.push({ url, alt: gv(`img-alt-${i}`), rights: gc(`img-rights-${i}`) });
      }
      const raw = {
        brand: gv("p-brand"), kicker: gv("p-kicker"), headline: gv("p-headline"), subheadline: gv("p-lead"),
        announcement: gv("p-ann"), price: gv("p-price"), compare_at: gv("p-compare"), omnibus_price: gv("p-omni"),
        cost: gv("p-cost"), stock: gv("p-stock"), bundles: priced, images,
        callouts: [0, 1, 2].map((i) => ({ label: gv(`call-${i}`) })),
        variant_label: gv("p-varlabel"), variants: lines("p-vars"),
        benefits: [0, 1, 2].map((i) => ({ title: gv(`ben-${i}`), text: gv(`ben-t-${i}`), icon: gv(`ben-i-${i}`) })),
        benefits_title: gv("p-bentitle"),
        features: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ title: gv(`ft-${i}`), text: gv(`fx-${i}`), image: (prev.features || [])[i]?.image || "" })).concat((prev.features || []).slice(8)),
        specs: lines("p-specs").map((line) => { const [name, ...rest] = line.split("|"); return { name, value: rest.join("|") }; }),
        problem: { title: gv("p-pt"), text: gv("p-px"), image: gv("p-pi") },
        compare_ours: gv("p-ours"), compare_others: gv("p-others"),
        compare_image_ours: gv("p-cimg-o"), compare_image_others: gv("p-cimg-t"),
        compare_caption_ours: gv("p-ccap-o"), compare_caption_others: gv("p-ccap-t"),
        compare: [0, 1, 2, 3, 4].map((i) => ({ feature: gv(`c-f-${i}`), ours: gv(`c-o-${i}`), others: gv(`c-t-${i}`) })),
        reviews: [0, 1, 2, 3, 4].map((i) => ({ author: gv(`r-a-${i}`), rating: gv(`r-s-${i}`), source_url: gv(`r-u-${i}`), photo: gv(`r-p-${i}`), text: gv(`r-t-${i}`) })),
        faq: [0, 1, 2, 3, 4, 5].map((i) => ({ q: gv(`q-${i}`), a: gv(`a-${i}`) })),
        ugc: [0, 1, 2].map((i) => ({ video: gv(`u-v-${i}`), poster: gv(`u-p-${i}`), author: gv(`u-a-${i}`), text: gv(`u-t-${i}`) })),
        addons: [{ name: gv("ad-name"), price: gv("ad-price"), text: gv("ad-text") }],
        related: [0, 1, 2, 3].map((i) => ({ name: gv(`rel-n-${i}`), price: gv(`rel-p-${i}`), url: gv(`rel-u-${i}`) })),
        shipping: { cutoff: gv("sh-cut"), time: gv("sh-time"), from: gv("sh-from"), price: gv("sh-price"), free: gc("sh-free") },
        returns_days: gv("sh-days") || 14,
        guarantee: gv("p-guar"),
        seller: { name: gv("s-name"), email: gv("s-mail"), phone: gv("s-phone"), nip: gv("s-nip"), address: gv("s-addr"), vat_exempt: gc("s-vat") },
        gpsr: { producer: gv("g-name"), address: gv("g-addr"), contact: gv("g-mail"), responsible: gv("g-resp"), warnings: gv("g-warn") },
        pay_url: gv("p-pay"), checkout_url: gv("p-check"),
        theme: { accent: gv("p-accent") || "#ff5a00" },
        template: gv("p-template") || "auto",
        sections: Object.fromEntries((M.PAGE_SECTIONS || []).map(([key]) => [key, gc(`sec-${key}`)])),
        sale: { enabled: gc("sale-on"), label: gv("sale-label"), text: gv("sale-text"), ends_at: gv("sale-end") },
        urgency: { show_stock: gc("urg-stock"), show_timer: gc("urg-timer"), ends_at: gv("urg-end"), label: gv("urg-label") },
        trust_title: gv("trust-title"),
        trust_names: lines("trust-names"),
        seo: { title: gv("seo-t"), description: gv("seo-d") },
        example: gc("p-example"),
        contact: { enabled: true },
        checkout: { bump: true, gift: true, reminder: true }
      };
      const data = M.mergeSiteData(prev, raw);
      if (document.getElementById("p-keep-original") && data.source) data.source.keep_original = gc("p-keep-original");
      return data;
    }

    async function persist(status, intent) {
      if (!document.getElementById("pageForm")) return;
      const existing = CRM.UI.genId && CRM.UI.genId !== "new" ? pageById(CRM.UI.genId) : null;
      const data = collect(existing);
      const name = gv("p-name") || data.headline || "Nowa strona";
      const taken = (CRM.S.pagesList || []).map((p) => p.slug);
      const slug = M.uniqueSlug(gv("p-slug") || name, taken, existing?.slug || "");
      let id = existing?.id;
      if (!id) { id = CRM.UI.genDraftId || CRM.uid("pg"); CRM.UI.genDraftId = id; }
      const row = {
        id, slug, name,
        status: status || existing?.status || "draft",
        product_id: gv("p-product") || null,
        shop_id: existing?.shop_id || null,
        data, updated_at: new Date().toISOString(),
        published_at: existing?.published_at || null
      };
      if (row.status === "published") {
        const issues = M.sitePublishIssues(row, data);
        if (issues.length) { CRM.toast(issues[0]); return; }
        const shop = M.shopFromPage({ ...row, status: "published" }, location.origin, CRM.me);
        if (!(await CRM.put("shops", shop.id, shop.data))) return;
        row.shop_id = shop.id;
        row.published_at = row.published_at || new Date().toISOString();
        CRM.logAct(`Opublikował stronę /p/${slug}`);
      }
      const { error } = await CRM.SB.from("pages").upsert(row);
      if (error) {
        const msg = String(error.message || "");
        CRM.toast(/duplicate|unique/i.test(msg) ? "Taki adres strony już istnieje." : "Nie udało się zapisać strony.");
        return;
      }
      CRM.UI.genId = id;
      CRM.UI.genExample = false;
      CRM.UI.genDraftId = null;
      await loadPages();
      if (document.getElementById("p-shopify-auto") && WF && CRM.putSettings) {
        const want = gc("p-shopify-auto");
        if (want !== WF.shopifyAutoDraftEnabled(CRM.S.settings)) {
          try { await CRM.putSettings({ shopify_auto_draft: want }); } catch { /* ustawienie jest dodatkowe */ }
        }
      }
      const shopifyIntent = intent || (row.status === "published" && existing?.status !== "published" ? "active" : undefined);
      if (row.product_id && CRM.afterPageSaved) {
        try { await CRM.afterPageSaved(row.product_id, row.status, shopifyIntent); } catch { /* sync Shopify jest dodatkowy */ }
      }
      CRM.toast(row.status === "published" ? `Opublikowano /p/${slug}` : "Zapisano szkic");
      CRM.scheduleRender();
    }

    async function unpublish() {
      const existing = pageById(CRM.UI.genId);
      if (!existing) return;
      const data = document.getElementById("pageForm") ? collect(existing) : M.cleanSiteData(existing.data || {});
      const row = { ...existing, data, status: "draft", updated_at: new Date().toISOString() };
      if (existing.shop_id) {
        const shop = M.shopFromPage(row, location.origin, CRM.me);
        await CRM.put("shops", shop.id, { ...shop.data, status: "pauza" });
      }
      const { error } = await CRM.SB.from("pages").upsert(row);
      if (error) { CRM.toast("Nie udało się wycofać strony."); return; }
      CRM.logAct(`Wycofał stronę /p/${existing.slug}`);
      await loadPages();
      if (row.product_id && CRM.afterPageSaved) {
        try { await CRM.afterPageSaved(row.product_id, "draft", "hold"); } catch { /* sync Shopify jest dodatkowy */ }
      }
      CRM.toast("Strona wróciła do szkicu");
      CRM.scheduleRender();
    }

    async function preview() {
      const existing = CRM.UI.genId && CRM.UI.genId !== "new" ? pageById(CRM.UI.genId) : { id: "podglad", slug: "podglad", name: gv("p-name") || "Podgląd", status: "draft" };
      const data = collect(existing && existing.data ? existing : null);
      const { renderPage } = await import("./lib/render.mjs");
      const html = renderPage({ ...existing, name: gv("p-name") || data.headline || existing.name, status: existing.status || "draft" }, data, { preview: true, origin: location.origin });
      const w = window.open("", "podglad");
      if (!w) { CRM.toast("Przeglądarka zablokowała okno podglądu."); return; }
      w.document.open();
      w.document.write(html);
      w.document.close();
    }

    async function removePage() {
      const existing = pageById(CRM.UI.genId);
      if (!existing) return;
      if (!confirm("Usunąć tę stronę? Zamówienia w CRM zostają.")) return;
      if (existing.shop_id) {
        const shop = M.shopFromPage({ ...existing, status: "draft" }, location.origin, CRM.me);
        await CRM.put("shops", shop.id, shop.data);
      }
      const { error } = await CRM.SB.from("pages").delete().eq("id", existing.id);
      if (error) { CRM.toast("Nie udało się usunąć."); return; }
      CRM.UI.genId = null;
      await loadPages();
      CRM.toast("Usunięto stronę");
      CRM.scheduleRender();
    }

    document.addEventListener("click", (e) => {
      const tierBtn = e.target.closest("[data-tier]");
      if (tierBtn && CRM.UI.sampleDemo) {
        CRM.UI.sampleDemo.tier = tierBtn.dataset.tier;
        fillSamplePreview();
      }
      const t = e.target.closest("[data-g]");
      if (!t) return;
      const g = t.dataset.g;
      if (g === "new") { CRM.UI.genId = "new"; CRM.UI.genExample = false; CRM.UI.genDraftId = null; CRM.UI.sampleDemo = null; CRM.UI.pageEditor = null; CRM.UI.productPrep = null; CRM.UI.bazaPicker = false; CRM.scheduleRender(); }
      else if (g === "simple") { if (CRM.openPageEditor) CRM.openPageEditor(t.dataset.id); }
      else if (g === "import-csv") { if (CRM.openSharklyImport) CRM.openSharklyImport(); else CRM.toast("Import CSV jest w bazie produktów."); }
      else if (g === "baza-open") { CRM.UI.bazaPicker = true; CRM.UI.productPrep = null; CRM.UI.genId = null; CRM.UI.pageEditor = null; CRM.UI.sampleDemo = null; CRM.scheduleRender(); }
      else if (g === "baza-close") { CRM.UI.bazaPicker = false; CRM.UI.productPrep = null; CRM.scheduleRender(); }
      else if (g === "baza-choose") { openProductPrep(t.dataset.id); }
      else if (g === "baza-open-page") { CRM.UI.bazaPicker = false; CRM.UI.productPrep = null; CRM.UI.genId = t.dataset.id; CRM.scheduleRender(); }
      else if (g === "photo-up") movePrepPhoto(Number(t.dataset.i), -1);
      else if (g === "photo-down") movePrepPhoto(Number(t.dataset.i), 1);
      else if (g === "create-from-baza") createFromPrep(false);
      else if (g === "rewrite-ai") { const prep = readPrep(); if (prep) prep.keepOriginal = false; createFromPrep(true); }
      else if (g === "example") { CRM.UI.genId = "new"; CRM.UI.genExample = true; CRM.UI.genDraftId = null; CRM.UI.sampleDemo = null; CRM.scheduleRender(); }
      else if (g === "sample") {
        CRM.UI.genId = null;
        CRM.UI.sampleDemo = { tier: (CRM.UI.trade && CRM.UI.trade.tier) || "s1" };
        CRM.scheduleRender();
      }
      else if (g === "sample-close") { CRM.UI.sampleDemo = null; CRM.scheduleRender(); }
      else if (g === "sample-save") saveSampleDraft();
      else if (g === "sample-tier") { /* poziom ustawia data-tier */ }
      else if (g === "edit") { CRM.UI.genId = t.dataset.id; CRM.scheduleRender(); }
      else if (g === "back") { CRM.UI.genId = null; CRM.UI.productPrep = null; CRM.scheduleRender(); }
      else if (g === "preview") preview();
      else if (g === "publish") persist("published", "active");
      else if (g === "unpublish") unpublish();
      else if (g === "delete") removePage();
      else if (g === "ai") generateHere();
      else if (g === "rewrite") rewriteHere();
      else if (g === "video") videoHere();
    });

    async function rewriteHere() {
      const existing = pageById(CRM.UI.genId);
      if (!existing) { CRM.toast("Najpierw zapisz szkic strony."); return; }
      if (CRM.startGeneration) await CRM.startGeneration({ tier: "s1", page_id: existing.id, product_id: existing.product_id || undefined, overwrite: true });
    }
    async function generateHere() {
      const existing = pageById(CRM.UI.genId);
      if (!existing) { CRM.toast("Najpierw zapisz szkic strony."); return; }
      const tier = (CRM.UI.trade && CRM.UI.trade.tier) || "s1";
      if (CRM.startGeneration) await CRM.startGeneration({ tier, page_id: existing.id, product_id: existing.product_id || undefined });
    }
    async function videoHere() {
      const existing = pageById(CRM.UI.genId);
      if (!existing) { CRM.toast("Najpierw zapisz szkic strony."); return; }
      const data = document.getElementById("pageForm") ? collect(existing) : M.cleanSiteData(existing.data || {});
      const images = (data.images || []).map((i) => i.url).filter(Boolean);
      const benefits = (data.benefits || []).map((b) => b.title).filter(Boolean);
      if (CRM.openVideo) await CRM.openVideo({
        title: data.headline || existing.name,
        price: data.price,
        omnibus: data.omnibus_price,
        benefits,
        images,
        pageId: existing.id,
        productId: existing.product_id || null,
        rights: data.images.every((i) => i.rights)
      });
    }
    document.addEventListener("input", (e) => {
      if (e.target.id === "baza-q") {
        const q = String(e.target.value || "").toLowerCase();
        document.querySelectorAll("[data-baza-row]").forEach((row) => {
          row.hidden = !!(q && !String(row.dataset.bazaRow || "").includes(q));
        });
      }
      if ((e.target.id === "price-2" || e.target.id === "price-3") && M && CRM.UI.productPrep) {
        const packs = M.packBundles(document.getElementById("price-1")?.value, document.getElementById("price-2")?.value, document.getElementById("price-3")?.value);
        const el = document.getElementById("bundle-preview");
        if (el) el.textContent = packs.map((pack) => `${pack.label}: ${pack.price} zł${pack.badge ? ` (${pack.badge})` : ""}`).join(" · ") || "Brak ceny jednej sztuki.";
      }
    });
    async function openProductPrep(productId, extra = {}) {
      if (!FromProduct) FromProduct = await import("./lib/page-from-product.mjs");
      const product = tradeProducts().find((item) => item.id === productId);
      if (!product) { CRM.toast("Nie ma tego produktu w bazie."); return; }
      const existing = pageForProduct(productId);
      if (existing) {
        CRM.UI.productPrep = null;
        CRM.UI.bazaPicker = false;
        CRM.UI.genId = existing.id;
        CRM.toast("Ten produkt ma już stronę. Otwieram istniejącą kartę.");
        if (location.hash !== "#generator") location.hash = "generator";
        else CRM.scheduleRender();
        return;
      }
      const price2 = extra.price2 != null && extra.price2 !== "" ? extra.price2 : (product.raw?.cena_2 ?? "");
      const price3 = extra.price3 != null && extra.price3 !== "" ? extra.price3 : (product.raw?.cena_3 ?? "");
      CRM.UI.productPrep = {
        productId,
        keepOriginal: true,
        images: FromProduct.listProductPhotos(product).map((photo) => ({ url: photo.url, alt: photo.alt || "", include: true })),
        price2,
        price3,
        rights: false
      };
      CRM.UI.bazaPicker = false;
      CRM.UI.genId = null;
      CRM.UI.genExample = false;
      CRM.UI.sampleDemo = null;
      CRM.UI.pageEditor = null;
      if (location.hash !== "#generator") location.hash = "generator";
      else CRM.scheduleRender();
    }
    CRM.openProductPrep = openProductPrep;
    document.addEventListener("submit", (e) => {
      if (e.target.id !== "pageForm") return;
      e.preventDefault();
      persist(pageById(CRM.UI.genId)?.status === "published" ? "published" : "draft");
    });
  });
})();
