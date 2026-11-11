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
      @media(max-width:800px){.gen-grid{grid-template-columns:1fr}}
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
    CRM.readyFns.push(async () => {
      M = await import("./lib/site-model.mjs");
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
      if (CRM.UI.genId) return editor();
      const list = CRM.S.pagesList || [];
      const cards = list.map((p) => {
        const d = M.cleanSiteData(p.data || {});
        const issues = M.sitePublishIssues(p, d);
        const img = (d.images.find((i) => i.rights) || {}).url;
        return `<article class="card pcard" data-g="edit" data-id="${CRM.esc(p.id)}" tabindex="0">
          <div class="row" style="justify-content:space-between"><span class="pill" style="--c:${p.status === "published" ? "var(--good)" : "var(--warn)"}">${p.status === "published" ? "Opublikowana" : "Szkic"}</span>${img ? `<img src="${CRM.esc(img)}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:8px">` : ""}</div>
          <div><h3>${CRM.esc(p.name || d.headline || "Bez nazwy")}</h3><div class="small muted">/p/${CRM.esc(p.slug)}</div></div>
          <div class="small ${issues.length ? "" : "muted"}">${p.status === "published" ? "Widoczna publicznie" : issues.length ? `${issues.length} braków do publikacji` : "Gotowa do publikacji"}</div>
        </article>`;
      }).join("");
      return top("Generator stron", "Karty produktów one-page. Po publikacji adres to /p/nazwa, a sklep sam pojawia się na liście sklepów.",
        `<button class="btn" data-g="sample" type="button">Przykładowa strona</button><button class="btn" data-g="example" type="button">Wstaw przykład</button><button class="btn primary" data-g="new" type="button">${CRM.ic("plus", 16)} Nowa strona</button>`) +
        (CRM.S.pagesError ? `<div class="banner">${CRM.esc(CRM.S.pagesError)}</div>` : "") +
        (list.length ? `<section class="grid cards">${cards}</section>` : `<div class="card"><div class="empty"><b>Nie masz jeszcze stron</b>Utwórz kartę produktu albo wstaw przykład kalendarza, żeby zobaczyć szablon.</div></div>`);
    }

    function pageById(id) { return (CRM.S.pagesList || []).find((p) => p.id === id) || null; }

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
      const { renderLightPage } = await import("./lib/render.mjs");
      frame.srcdoc = renderLightPage(
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

    function editor() {
      const existing = CRM.UI.genId === "new" ? null : pageById(CRM.UI.genId);
      const d = existing ? M.cleanSiteData(existing.data || {}) : (CRM.UI.genExample ? M.exampleSiteData() : M.emptySiteData());
      if (CRM.UI.genExample && !existing) {
        d.images = [1, 2, 3, 4, 5].map((n) => ({ url: `/assets/demo/slide-${n}.svg`, alt: "Zdjęcie przykładowe", rights: true }));
        d.example = true;
      }
      const issues = M.sitePublishIssues({ name: existing?.name || d.headline }, d);
      const products = CRM.arr("products").sort((a, b) => String(a.name).localeCompare(String(b.name), "pl"));
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
      const imageBox = (i) => `<div class="mini"><b>Zdjęcie ${i + 1}</b>
        ${inp(`img-url-${i}`, "Adres pliku (https albo /ścieżka)", img(i).url || "")}
        ${inp(`img-alt-${i}`, "Opis alternatywny", img(i).alt || "")}
        <label class="row" style="grid-column:1/-1"><input type="checkbox" id="img-rights-${i}" ${img(i).rights ? "checked" : ""}> Mam prawo użyć tego zdjęcia</label>
      </div>`;
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
        `<button class="btn" type="button" data-g="back">Wróć do listy</button>`) +
        (issues.length ? `<ol class="issues">${issues.map((x) => `<li>${CRM.esc(x)}</li>`).join("")}</ol>` : `<div class="banner" style="border-color:color-mix(in srgb,var(--good) 40%,var(--line));background:color-mix(in srgb,var(--good) 10%,var(--surface))">Dane wystarczą do publikacji.</div>`) +
        `<section class="card pad"><h2>Generacja</h2>${CRM.tierHtml ? CRM.tierHtml() : ""}<div class="row"><button class="btn primary" type="button" data-g="ai">Generuj treść</button><button class="btn" type="button" data-g="video">Złóż wideo w panelu</button></div><p class="small muted">S1 — tekst. S1 Pro — tekst i 1 zdjęcie AI. S1 Max — tekst, 5 zdjęć AI i wideo złożone tutaj. Najpierw zapisz szkic. Wideo nie idzie do zewnętrznej usługi.</p></section>` +
        `<form id="pageForm">
          <details class="card gen-sec" open><summary>Adres i powiązanie</summary><div class="body gen-grid">
            ${inp("p-name", "Nazwa wewnętrzna", existing?.name || d.headline || "")}
            ${inp("p-slug", "Adres (slug)", existing?.slug || "", 'placeholder="kalendarz-adwentowy"')}
            <div class="f"><label for="p-product">Produkt w CRM (opcjonalnie)</label><select id="p-product"><option value="">— brak —</option>${products.map((p) => `<option value="${CRM.esc(p.id)}" ${existing && existing.product_id === p.id ? "selected" : ""}>${CRM.esc(p.name || p.id)}</option>`).join("")}</select></div>
            ${inp("p-accent", "Kolor akcentu", d.theme.accent || "#ff5a00", 'type="color"')}
            <label class="row" style="grid-column:1/-1"><input type="checkbox" id="p-example" ${d.example ? "checked" : ""}> To tylko przykład (blokuje publikację, dopóki nie odznaczysz)</label>
          </div></details>
          <details class="card gen-sec" open><summary>Nagłówek</summary><div class="body gen-grid">
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
          <details class="card gen-sec"><summary>Zdjęcia i podpisy na zdjęciu</summary><div class="body">${[0, 1, 2, 3, 4, 5].map(imageBox).join("")}
            <div class="gen-grid">${[0, 1, 2].map((i) => inp(`call-${i}`, `Podpis ${i + 1} na pierwszym zdjęciu`, call(i).label || "")).join("")}</div>
          </div></details>
          <details class="card gen-sec"><summary>Wariant / kolor</summary><div class="body gen-grid">
            ${inp("p-varlabel", "Nazwa wariantu", d.variant_label || "Kolor")}
            ${area("p-vars", "Warianty, po jednym w wierszu", (d.variants || []).join("\n"))}
          </div></details>
          <details class="card gen-sec"><summary>Punkty pod nagłówkiem i cechy 01–04</summary><div class="body">
            <div class="gen-grid">${[0, 1, 2].map((i) => inp(`ben-${i}`, `Punkt ${i + 1}`, ben(i).title || "")).join("")}</div>
            ${inp("p-bentitle", "Tytuł sekcji cech", d.benefits_title)}
            ${[0, 1, 2, 3].map((i) => `<div class="mini"><b>Cecha ${String(i + 1).padStart(2, "0")}</b>${inp(`ft-${i}`, "Tytuł", feat(i).title || "")}${inp(`fx-${i}`, "Opis", feat(i).text || "")}</div>`).join("")}
          </div></details>
          <details class="card gen-sec"><summary>Obawa</summary><div class="body gen-grid">
            ${inp("p-pt", "Pytanie / obawa", d.problem.title)}
            ${area("p-px", "Odpowiedź", d.problem.text)}
            ${inp("p-pi", "Zdjęcie (adres z listy zdjęć albo własny https)", d.problem.image)}
          </div></details>
          <details class="card gen-sec"><summary>Porównanie</summary><div class="body">
            <div class="gen-grid">${inp("p-ours", "Nagłówek kolumny „my”", d.compare_ours)}${inp("p-others", "Nagłówek kolumny „oni”", d.compare_others)}</div>
            ${[0, 1, 2, 3, 4].map((i) => `<div class="mini"><b>Wiersz ${i + 1}</b>${inp(`c-f-${i}`, "Cecha", cmp(i).feature || "")}${inp(`c-o-${i}`, "U nas", cmp(i).ours || "")}${inp(`c-t-${i}`, "U innych", cmp(i).others || "")}</div>`).join("")}
          </div></details>
          <details class="card gen-sec"><summary>Opinie (tylko z linkiem do źródła)</summary><div class="body">${[0, 1, 2, 3, 4].map((i) => `<div class="mini"><b>Opinia ${i + 1}</b>${inp(`r-a-${i}`, "Autor", rev(i).author || "")}${inp(`r-s-${i}`, "Ocena 1–5", rev(i).rating || "")}${inp(`r-u-${i}`, "Link do źródła", rev(i).source_url || "")}${inp(`r-t-${i}`, "Treść", rev(i).text || "")}</div>`).join("")}</div></details>
          <details class="card gen-sec"><summary>Pytania i odpowiedzi</summary><div class="body">${[0, 1, 2, 3, 4, 5].map((i) => `<div class="mini"><b>Pytanie ${i + 1}</b>${inp(`q-${i}`, "Pytanie", fq(i).q || "")}${inp(`a-${i}`, "Odpowiedź", fq(i).a || "")}</div>`).join("")}</div></details>
          <details class="card gen-sec"><summary>Nagrania od klientów</summary><div class="body">${[0, 1, 2].map((i) => `<div class="mini"><b>Nagranie ${i + 1}</b>${inp(`u-v-${i}`, "Adres wideo (https)", ugc(i).video || "")}${inp(`u-p-${i}`, "Klatka (poster)", ugc(i).poster || "")}${inp(`u-a-${i}`, "Autor", ugc(i).author || "")}${inp(`u-t-${i}`, "Podpis", ugc(i).text || "")}</div>`).join("")}</div></details>
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
        label: gv(`b-label-${i}`), qty: gv(`b-qty-${i}`) || 1, price: gv(`b-price-${i}`),
        compare_at: gv(`b-was-${i}`), omnibus: gv(`b-om-${i}`), badge: gv(`b-badge-${i}`), note: gv(`b-note-${i}`)
      }));
      const images = [0, 1, 2, 3, 4, 5].map((i) => ({ url: gv(`img-url-${i}`), alt: gv(`img-alt-${i}`), rights: gc(`img-rights-${i}`) })).filter((i) => i.url);
      const raw = {
        brand: gv("p-brand"), kicker: gv("p-kicker"), headline: gv("p-headline"), subheadline: gv("p-lead"),
        announcement: gv("p-ann"), price: gv("p-price"), compare_at: gv("p-compare"), omnibus_price: gv("p-omni"),
        cost: gv("p-cost"), stock: gv("p-stock"), bundles, images,
        callouts: [0, 1, 2].map((i) => ({ label: gv(`call-${i}`) })),
        variant_label: gv("p-varlabel"), variants: lines("p-vars"),
        benefits: [0, 1, 2].map((i) => ({ title: gv(`ben-${i}`) })),
        benefits_title: gv("p-bentitle"),
        features: [0, 1, 2, 3].map((i) => ({ title: gv(`ft-${i}`), text: gv(`fx-${i}`) })),
        problem: { title: gv("p-pt"), text: gv("p-px"), image: gv("p-pi") },
        compare_ours: gv("p-ours"), compare_others: gv("p-others"),
        compare: [0, 1, 2, 3, 4].map((i) => ({ feature: gv(`c-f-${i}`), ours: gv(`c-o-${i}`), others: gv(`c-t-${i}`) })),
        reviews: [0, 1, 2, 3, 4].map((i) => ({ author: gv(`r-a-${i}`), rating: gv(`r-s-${i}`), source_url: gv(`r-u-${i}`), text: gv(`r-t-${i}`) })),
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
        seo: { title: gv("seo-t"), description: gv("seo-d") },
        example: gc("p-example"),
        contact: { enabled: true },
        checkout: { bump: true, gift: true, reminder: true }
      };
      return M.mergeSiteData(prev, raw);
    }

    async function persist(status) {
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
      if (row.product_id && typeof CRM.shopifyPush === "function") await CRM.shopifyPush([row.product_id], { create: false });
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
      if (row.product_id && typeof CRM.shopifyPush === "function") await CRM.shopifyPush([row.product_id], { create: false });
      CRM.toast("Strona wróciła do szkicu");
      CRM.scheduleRender();
    }

    async function preview() {
      const existing = CRM.UI.genId && CRM.UI.genId !== "new" ? pageById(CRM.UI.genId) : { id: "podglad", slug: "podglad", name: gv("p-name") || "Podgląd", status: "draft" };
      const data = collect(existing && existing.data ? existing : null);
      const { renderLightPage } = await import("./lib/render.mjs");
      const html = renderLightPage({ ...existing, name: gv("p-name") || data.headline || existing.name, status: existing.status || "draft" }, data, { preview: true, origin: location.origin });
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
      if (existing.product_id && typeof CRM.shopifyPush === "function") await CRM.shopifyPush([existing.product_id], { create: false });
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
      if (g === "new") { CRM.UI.genId = "new"; CRM.UI.genExample = false; CRM.UI.genDraftId = null; CRM.UI.sampleDemo = null; CRM.scheduleRender(); }
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
      else if (g === "back") { CRM.UI.genId = null; CRM.scheduleRender(); }
      else if (g === "preview") preview();
      else if (g === "publish") persist("published");
      else if (g === "unpublish") unpublish();
      else if (g === "delete") removePage();
      else if (g === "ai") generateHere();
      else if (g === "video") videoHere();
    });

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
    document.addEventListener("submit", (e) => {
      if (e.target.id !== "pageForm") return;
      e.preventDefault();
      persist(pageById(CRM.UI.genId)?.status === "published" ? "published" : "draft");
    });
  });
})();
