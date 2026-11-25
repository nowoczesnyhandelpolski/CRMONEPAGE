// Wygląd przycisku, podglądu i listingu. Bez chrome, żeby dało się go złożyć w teście i na zrzucie.

export const WIDGET_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, select { font-family: Poppins, ui-sans-serif, sans-serif; }
.layer { pointer-events: none; }
.fab, .panel { pointer-events: auto; }
.fab {
  position: fixed;
  left: 16px;
  bottom: 16px;
  top: auto;
  z-index: 2147483645;
  display: flex;
  align-items: stretch;
  max-width: min(340px, calc(100vw - 16px));
  overflow: hidden;
  background: #13294B;
  color: #fff;
  border-radius: 16px;
  box-shadow: inset 0 -4px 0 #C8102E, 0 12px 28px rgba(19, 41, 75, .35);
  overflow: hidden;
}
.fab.collapsed { width: 48px; border-radius: 14px; }
.fab.collapsed .main, .fab.collapsed .hide, .fab.collapsed .grip { display: none; }
.fab .mini { display: none; }
.fab-meter { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,.25); }
.fab-meter span { display: block; height: 100%; background: #fff; width: 0; }
.meter { height: 12px; border-radius: 999px; background: #E6EBF2; overflow: hidden; }
.meter span { display: block; height: 100%; width: 0; background: #13294B; box-shadow: inset 0 -3px 0 #C8102E; }
.fab.collapsed .mini {
  display: grid;
  place-items: center;
  width: 48px;
  min-height: 112px;
  border: 0;
  background: transparent;
  color: #fff;
  font: 800 13px/1 Poppins, sans-serif;
  letter-spacing: .08em;
  writing-mode: vertical-rl;
  cursor: pointer;
}
.grip, .hide, .fold {
  border: 0;
  background: transparent;
  color: #fff;
  cursor: pointer;
  padding: 0 8px;
  font: 700 14px/1 Poppins, sans-serif;
}
.grip { cursor: grab; letter-spacing: -2px; }
.main {
  border: 0;
  background: transparent;
  color: #fff;
  text-align: left;
  padding: 12px 4px 14px 2px;
  font: 700 14px/1.25 Poppins, sans-serif;
  cursor: pointer;
}
.main small { display: block; margin-top: 3px; font-weight: 500; font-size: 11px; color: rgba(255,255,255,.75); }
.panel {
  position: fixed;
  z-index: 2147483645;
  width: min(340px, calc(100vw - 16px));
  max-width: min(340px, calc(100vw - 16px));
  max-height: min(70vh, 640px);
  overflow: auto;
  overflow-x: hidden;
  background: #fff;
  color: #13294B;
  border: 1px solid #DEE3EC;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(19, 41, 75, .28);
  font: 500 13px/1.4 Poppins, sans-serif;
}
.panel header, .bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: #13294B;
  color: #fff;
  position: sticky;
  top: 0;
}
.panel header strong, .bar strong { font-size: 14px; }
.panel header button, .bar button {
  border: 0;
  background: transparent;
  color: #fff;
  font: 700 12px/1 Poppins, sans-serif;
  cursor: pointer;
}
.body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.photo {
  width: 100%;
  height: 150px;
  object-fit: contain;
  background: #F5F7FB;
  border-radius: 12px;
  border: 1px solid #DEE3EC;
}
h2.name { margin: 0; font-size: 16px; line-height: 1.25; }
.price { margin: 0; font-size: 20px; font-weight: 800; }
.old { margin: 0; color: #5B6782; text-decoration: line-through; }
.counts { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.counts li, .chip {
  background: #F5F7FB;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
}
.missing {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #FDECEE;
  color: #8E1024;
  font-weight: 700;
}
.note, .status { margin: 0; color: #5B6782; font-size: 12px; }
.status.bad { color: #8E1024; font-weight: 700; }
label.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #5B6782; }
input, select {
  border: 1px solid #DEE3EC;
  border-radius: 10px;
  padding: 8px 10px;
  font: 500 13px/1.3 Poppins, sans-serif;
  color: #13294B;
  background: #F5F7FB;
  width: 100%;
}
.row { display: flex; gap: 8px; flex-wrap: wrap; max-width: 100%; }
.row > * { min-width: 0; max-width: 100%; }
.row > * { flex: 1; }
button.act {
  border: 1px solid #DEE3EC;
  border-radius: 12px;
  padding: 10px 12px 12px;
  background: #fff;
  color: #13294B;
  font: 700 13px/1.2 Poppins, sans-serif;
  cursor: pointer;
}
button.act.primary {
  background: #13294B;
  border-color: #13294B;
  color: #fff;
  box-shadow: inset 0 -4px 0 #C8102E;
}
button.act:disabled { opacity: .45; cursor: not-allowed; }
.flag {
  width: 18px;
  height: 8px;
  border-radius: 2px;
  background: linear-gradient(#fff 0 50%, #C8102E 50%);
  flex: none;
}
.check { display: flex; gap: 8px; align-items: center; font-weight: 600; color: #13294B; }
.check input { width: auto; }
`;

function el(root, sel) {
  return root.querySelector(sel);
}

export function createShopChrome(doc) {
  const host = doc.createElement("div");
  host.id = "nhp-shop-root";
  host.setAttribute("data-nhp", "shop");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${WIDGET_CSS}</style>
  <div class="layer">
    <div class="fab" id="fab" hidden>
      <button type="button" class="grip" data-act="grip" aria-label="Przeciągnij">⋮⋮</button>
      <button type="button" class="main" data-act="open">Zapisz tę ofertę w NHP<small>Klawisz E · podgląd przed zapisem</small></button>
      <button type="button" class="mini" data-act="open">NHP</button>
      <div class="fab-meter" id="fab-meter" hidden><span id="fab-meter-bar"></span></div>
      <button type="button" class="fold" data-act="collapse" aria-label="Zwiń">–</button>
      <button type="button" class="hide" data-act="hide">Zamknij</button>
    </div>
    <section class="panel" id="preview" hidden style="left:16px;bottom:88px;top:auto">
      <header><span class="flag" aria-hidden="true"></span><strong>Podgląd oferty</strong><button type="button" data-act="close-preview">Zamknij</button></header>
      <div class="body">
        <img class="photo" id="pv-img" alt="">
        <h2 class="name" id="pv-name"></h2>
        <p class="price" id="pv-price"></p>
        <p class="old" id="pv-old"></p>
        <ul class="counts">
          <li id="pv-photos"></li>
          <li id="pv-params"></li>
          <li id="pv-vars"></li>
        </ul>
        <p class="missing" id="pv-missing" hidden></p>
        <p class="note" id="pv-note"></p>
        <label class="field">Grupa przy zapisie<input id="pv-group" maxlength="80" placeholder="np. Zegarki" autocomplete="off"></label>
        <button type="button" class="act primary" data-act="save">Zapisz w NHP</button>
        <button type="button" class="act" data-act="csv">Dodaj do sesji CSV</button>
        <p class="status" id="pv-status"></p>
      </div>
    </section>
    <section class="panel" id="listing" hidden style="left:16px;bottom:88px;top:auto;right:auto">
      <div class="bar"><span class="flag" aria-hidden="true"></span><strong>Listing</strong><button type="button" data-act="close-listing">Zwiń</button><button type="button" data-act="hide">Zamknij</button></div>
      <div class="body">
        <p class="note" id="ls-onpage"></p>
        <button type="button" class="act" data-act="select-all">Zaznacz wszystkie na stronie</button>
        <label class="field">Ile produktów
          <select id="ls-limit" aria-label="Limit produktów">
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="0">Wszystkie</option>
          </select>
        </label>
        <button type="button" class="act primary" data-act="crawl">Cały listing (wszystkie strony)</button>
        <button type="button" class="act" data-act="selected">Pobierz zaznaczone</button>
        <p class="status" id="ls-counter"></p>
        <div class="meter" id="ls-meter" hidden><span id="ls-meter-bar"></span></div>
        <p class="status" id="ls-stats"></p>
        <p class="note" id="ls-eta"></p>
        <p class="note" id="ls-note"></p>
        <div class="row" id="ls-run">
          <button type="button" class="act" data-act="pause">Wstrzymaj</button>
          <button type="button" class="act" data-act="cancel">Anuluj</button>
        </div>
        <label class="field">Grupa<input id="ls-group" maxlength="80" placeholder="np. Zegarki" autocomplete="off"></label>
        <label class="check"><input id="ls-overwrite" type="checkbox"> Zapisz też te, które już są w bazie</label>
        <button type="button" class="act primary" data-act="save-all" title="Najpierw pobierz karty: zaznaczone albo cały listing.">Zapisz wszystkie w NHP</button>
        <p class="note" id="ls-save-hint">Najpierw pobierz karty: zaznaczone albo cały listing.</p>
        <button type="button" class="act" data-act="csv-all">Dodaj do sesji CSV</button>
        <div class="row">
          <button type="button" class="act" data-act="csv-file">Pobierz CSV</button>
          <button type="button" class="act" data-act="xlsx-file">Pobierz XLSX</button>
        </div>
        <p class="status" id="ls-msg"></p>
      </div>
    </section>
  </div>`;

  const fab = el(shadow, "#fab");
  const preview = el(shadow, "#preview");
  const listing = el(shadow, "#listing");
  let collapsed = false;
  let placed = false;

  function placePanels() {
    const top = parseFloat(fab.style.top) || 0;
    const left = parseFloat(fab.style.left) || 16;
    const view = doc.defaultView || { innerWidth: 1200, innerHeight: 800 };
    const height = fab.offsetHeight || 56;
    preview.style.left = `${Math.max(8, Math.min(left, view.innerWidth - 348))}px`;
    preview.style.right = "auto";
    if (top + height + 280 > view.innerHeight) {
      preview.style.top = "auto";
      preview.style.bottom = `${Math.max(16, view.innerHeight - top + 8)}px`;
    } else {
      preview.style.bottom = "auto";
      preview.style.top = `${top + height + 8}px`;
    }
  }

  const api = {
    host,
    shadow,
    setFabVisible(on) { fab.hidden = !on; },
    setCollapsed(on) {
      collapsed = !!on;
      fab.classList.toggle("collapsed", collapsed);
      el(shadow, ".fold").textContent = collapsed ? "+" : "Zwiń";
      el(shadow, ".fold").setAttribute("aria-label", collapsed ? "Rozwiń" : "Zwiń");
    },
    isCollapsed() { return collapsed; },
    setPosition(left, top) {
      const view = doc.defaultView || { innerWidth: 1200, innerHeight: 800 };
      const x = Math.max(8, Math.min(left, view.innerWidth - 56));
      const y = Math.max(8, Math.min(top, view.innerHeight - 56));
      fab.style.left = `${x}px`;
      fab.style.top = `${y}px`;
      fab.style.bottom = "auto";
      placed = true;
      placePanels();
    },
    getPosition() {
      return { left: parseFloat(fab.style.left) || 16, top: parseFloat(fab.style.top) || 0 };
    },
    showPreview(model) {
      preview.hidden = false;
      const img = el(shadow, "#pv-img");
      img.src = model.image || "";
      img.alt = model.name || "";
      img.hidden = !model.image;
      el(shadow, "#pv-name").textContent = model.name || "Bez nazwy";
      el(shadow, "#pv-price").textContent = model.priceText || "Brak ceny";
      const old = el(shadow, "#pv-old");
      old.textContent = model.oldPriceText || "";
      old.hidden = !model.oldPriceText;
      el(shadow, "#pv-photos").textContent = `Zdjęcia: ${model.photos || 0}`;
      el(shadow, "#pv-params").textContent = `Parametry: ${model.params || 0}`;
      el(shadow, "#pv-vars").textContent = `Warianty: ${model.variants || 0}`;
      const missing = el(shadow, "#pv-missing");
      if (model.missing?.length) {
        missing.hidden = false;
        missing.textContent = `Brakuje: ${model.missing.join(", ")}. Tego nie dopisujemy.`;
      } else {
        missing.hidden = true;
        missing.textContent = "";
      }
      el(shadow, "#pv-note").textContent = model.note || "";
      if (model.group != null && doc.activeElement !== el(shadow, "#pv-group")) el(shadow, "#pv-group").value = model.group;
      api.setStatus(model.status || "");
      placePanels();
    },
    hidePreview() { preview.hidden = true; },
    previewOpen() { return !preview.hidden; },
    setStatus(text, bad) {
      const node = el(shadow, "#pv-status");
      node.textContent = text || "";
      node.classList.toggle("bad", !!bad);
    },
    groupValue() { return el(shadow, "#pv-group").value; },
    showListing(on) { listing.hidden = !on; },
    listingOpen() { return !listing.hidden; },
    paintListing(model) {
      if (model.forceOpen) listing.hidden = false;
      const found = Number(model.onPage || 0);
      el(shadow, "#ls-onpage").textContent = found
        ? `Wykryto ${found} produktów na tej stronie. Zaznaczone: ${model.selected || 0}.`
        : "Wykryto 0 produktów. Przewiń stronę w dół albo kliknij „Cały listing (wszystkie strony)”.";
      const total = Number(model.total || model.queued || 0);
      const done = Number(model.doneCount ?? model.fetched ?? 0);
      const running = model.status === "running" || model.status === "paused" || model.status === "saving";
      const fetching = model.status === "running" || model.status === "paused";
      el(shadow, "#ls-counter").textContent = running || total
        ? `${model.phase === "save" ? "Zapis" : "Pobrano"} ${done} / ${total || "?"}.`
        : "Wybierz karty albo weź cały listing.";
      const meter = el(shadow, "#ls-meter");
      const bar = el(shadow, "#ls-meter-bar");
      meter.hidden = !(running || (model.percent > 0 && model.status !== "idle"));
      bar.style.width = `${model.percent || 0}%`;
      const bits = [];
      if (model.pages) bits.push(`Strona listingu ${model.pages}`);
      bits.push(`${model.percent || 0}%`);
      if (model.failed) bits.push(`błędy ${model.failed}`);
      if (model.missingEan) bits.push(`bez EAN ${model.missingEan}`);
      if (model.duplicates) bits.push(`już w bazie ${model.duplicates}`);
      el(shadow, "#ls-stats").textContent = bits.filter(Boolean).join(" · ");
      el(shadow, "#ls-eta").textContent = model.eta ? `Zostało ${model.eta}.` : "";
      el(shadow, "#ls-note").textContent = model.lookupNote || "";
      el(shadow, "#ls-msg").textContent = model.message || "";
      el(shadow, "[data-act=pause]").textContent = model.status === "paused" ? "Wznów" : "Wstrzymaj";
      el(shadow, "[data-act=pause]").disabled = !fetching;
      el(shadow, "[data-act=cancel]").disabled = !fetching;
      el(shadow, "[data-act=crawl]").disabled = !!running;
      el(shadow, "[data-act=selected]").disabled = !!running;
      const saveOn = model.status === "done" || model.status === "cancelled" || (model.productsReady || 0) > 0;
      const saveBtn = el(shadow, "[data-act=save-all]");
      const hint = running
        ? "Zapis włączy się, gdy pobieranie się skończy."
        : (saveOn ? "" : "Najpierw pobierz karty: zaznaczone albo cały listing.");
      saveBtn.disabled = !saveOn || !!running;
      saveBtn.title = hint;
      el(shadow, "#ls-save-hint").textContent = hint;
      el(shadow, "[data-act=csv-all]").disabled = !saveOn || !!running;
      el(shadow, "[data-act=csv-file]").disabled = !saveOn || !!running;
      el(shadow, "[data-act=xlsx-file]").disabled = !saveOn || !!running;
      const fabMeter = el(shadow, "#fab-meter");
      const fabBar = el(shadow, "#fab-meter-bar");
      fabMeter.hidden = !running;
      fabBar.style.width = `${model.percent || 0}%`;
      const mini = el(shadow, ".mini");
      if (running) mini.textContent = total ? `${done}/${total}` : `${model.percent || 0}%`;
      else if (!mini.dataset.user) mini.textContent = "NHP";
    },
    listingGroup() { return el(shadow, "#ls-group").value; },
    listingLimit() { return Number(el(shadow, "#ls-limit").value); },
    includeDuplicates() { return !!el(shadow, "#ls-overwrite").checked; },
    toggleListingBody() {
      const body = el(shadow, "#listing .body");
      body.hidden = !body.hidden;
    },
    bind(handlers) {
      shadow.addEventListener("click", (event) => {
        const act = event.target?.closest?.("[data-act]")?.dataset?.act;
        if (!act || act === "grip") return;
        handlers[act]?.(event);
      });
      const grip = el(shadow, ".grip");
      let drag = null;
      grip.addEventListener("pointerdown", (event) => {
        drag = { x: event.clientX, y: event.clientY, left: parseFloat(fab.style.left) || 16, top: parseFloat(fab.style.top) || 80 };
        grip.setPointerCapture(event.pointerId);
      });
      grip.addEventListener("pointermove", (event) => {
        if (!drag) return;
        api.setPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
      });
      grip.addEventListener("pointerup", () => {
        if (!drag) return;
        drag = null;
        handlers.dragend?.(api.getPosition());
      });
    }
  };
  if (!placed) {
    const height = doc.defaultView?.innerHeight || 800;
    api.setPosition(16, Math.max(16, height - 88));
  }
  return api;
}

export function mountTicks(doc, products) {
  const byPath = new Map();
  for (const product of products || []) {
    try {
      const url = new URL(product.url, doc.baseURI);
      byPath.set(url.pathname.replace(/\/$/, "") || "/", product.url);
    } catch { /* pomiń */ }
  }
  const used = new Set();
  const nodes = [];
  for (const anchor of doc.querySelectorAll("a[href]")) {
    let abs;
    try { abs = new URL(anchor.getAttribute("href"), doc.baseURI); } catch { continue; }
    const key = abs.pathname.replace(/\/$/, "") || "/";
    const canonical = [...byPath.entries()].find(([path, full]) => path === key || full === abs.href)?.[1];
    if (!canonical || used.has(canonical)) continue;
    const card = anchor.closest("article, li.product-item, li.item, .product-item, .product, .item") || anchor.parentElement;
    if (!card || card.querySelector(":scope > .nhp-tick")) continue;
    used.add(canonical);
    const view = doc.defaultView;
    if (view && view.getComputedStyle(card).position === "static") card.style.position = "relative";
    const label = doc.createElement("label");
    label.className = "nhp-tick";
    label.dataset.nhpUrl = canonical;
    const input = doc.createElement("input");
    input.type = "checkbox";
    input.setAttribute("aria-label", "Zaznacz produkt");
    label.appendChild(input);
    card.appendChild(label);
    nodes.push(label);
  }
  return {
    nodes,
    count: () => nodes.length,
    selected() { return nodes.filter((node) => node.querySelector("input")?.checked).map((node) => node.dataset.nhpUrl); },
    checkedCount() { return this.selected().length; },
    setAll(on) { for (const node of nodes) { const input = node.querySelector("input"); if (input) input.checked = !!on; } },
    clear() { for (const node of nodes) node.remove(); nodes.length = 0; }
  };
}
