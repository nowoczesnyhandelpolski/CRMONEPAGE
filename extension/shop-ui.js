// Przycisk na karcie produktu i panel listingu. Klasyczny skrypt, bez importu w manifeście.
(async function () {
  if (window.__NHP_SHOP_UI || window.top !== window) return;
  const hostName = location.hostname;
  if (/(^|\.)allegro\.pl$/i.test(hostName)) return;
  if (hostName === "panel.nowoczesnyhandelpolski.pl" || hostName.endsWith(".pages.dev")) return;
  window.__NHP_SHOP_UI = true;

  let analyzePage;
  let formatMoney;
  let createShopChrome;
  let mountTicks;
  try {
    ({ analyzePage, formatMoney } = await import(chrome.runtime.getURL("page-product.mjs")));
    ({ createShopChrome, mountTicks } = await import(chrome.runtime.getURL("shop-view.mjs")));
  } catch (err) {
    console.error("NHP: nie udało się wczytać odczytu produktu.", err);
    return;
  }

  const ui = createShopChrome(document);
  document.documentElement.appendChild(ui.host);

  let progressView = () => ({ percent: 0, done: 0, total: 0, etaSec: 0 });
  let etaLabel = () => "";
  try {
    ({ progressView, etaLabel } = await import(chrome.runtime.getURL("listing-job.mjs")));
  } catch { /* pasek bez szacunku czasu */ }
  let dockMode = ({ sessionActive }) => (sessionActive ? "open" : "collapsed");
  let nextDockMode = (_current, action) => (action === "close" || action === "closed" ? "closed" : action === "open" ? "open" : "collapsed");
  try {
    ({ dockMode, nextDockMode } = await import(chrome.runtime.getURL("panel-mode.mjs")));
  } catch { /* zostaje zapas */ }
  const siteKey = hostName.replace(/^www\./i, "");
  const stored = await chrome.storage.local.get(["nhpHiddenHosts", "nhpFabPos", "nhpDockByHost", "nhpCsvSession"]);
  const hiddenHosts = stored.nhpHiddenHosts || {};
  let mode = dockMode({
    saved: stored.nhpDockByHost?.[siteKey] || (hiddenHosts[hostName] === "1" ? "closed" : ""),
    sessionActive: stored.nhpCsvSession?.status === "active"
  });
  let hidden = mode === "closed";
  if (stored.nhpFabPos && Number.isFinite(stored.nhpFabPos.left)) ui.setPosition(stored.nhpFabPos.left, stored.nhpFabPos.top);
  ui.setCollapsed(mode !== "open");

  let report = null;
  let ticks = emptyTicks();
  let job = null;

  function emptyTicks() {
    return { count: () => 0, selected: () => [], checkedCount: () => 0, setAll() {}, clear() {} };
  }

  function pageHtml() {
    return String(document.documentElement?.outerHTML || "").slice(0, 1500000);
  }

  function previewModel(extra = {}) {
    const product = report?.product || {};
    return {
      name: product.name,
      image: product.images?.[0] || "",
      priceText: formatMoney(product.price, product.currency),
      oldPriceText: formatMoney(product.old_price, product.currency),
      photos: product.images?.length || 0,
      params: product.parameters?.length || 0,
      variants: product.variants?.length || 0,
      missing: report?.missing || [],
      group: extra.group ?? ui.groupValue(),
      note: extra.note || "",
      status: extra.status || ""
    };
  }

  function paintListing() {
    if (report?.kind !== "listing" || hidden) return;
    const same = !job?.origin || job.origin === location.origin;
    const live = same ? (job || {}) : {};
    const view = progressView(live);
    ui.paintListing({
      onPage: ticks.count(),
      selected: ticks.checkedCount(),
      status: live.status || "idle",
      queued: live.queued || 0,
      fetched: live.fetched || 0,
      done: live.done || 0,
      doneCount: view.done,
      total: view.total,
      percent: view.percent,
      eta: etaLabel(view.etaSec),
      pages: live.pages || 0,
      phase: live.phase || "",
      failed: live.failed || 0,
      missingEan: live.missingEan || 0,
      duplicates: live.duplicates || 0,
      productsReady: live.done || 0,
      lookupNote: live.lookupNote || "",
      message: live.message || "",
      forceOpen: mode === "open"
    });
  }

  function rememberMode(next) {
    mode = next;
    hidden = next === "closed";
    chrome.storage.local.get("nhpDockByHost").then((current) => {
      const map = current.nhpDockByHost && typeof current.nhpDockByHost === "object" ? current.nhpDockByHost : {};
      map[siteKey] = next;
      chrome.storage.local.set({ nhpDockByHost: map });
    });
  }

  function scan() {
    const keep = new Set(ticks.selected?.() || []);
    report = analyzePage(pageHtml(), location.href);
    ticks.clear();
    if (!hidden && report.kind === "listing") {
      ticks = mountTicks(document, report.listing.products);
      if (keep.size) ticks.setAll(false);
      for (const node of ticks.nodes || []) {
        if (keep.has(node.dataset.nhpUrl)) {
          const input = node.querySelector("input");
          if (input) input.checked = true;
        }
      }
    }
    showForMode();
    if (report.kind === "listing") paintListing();
  }

  function showForMode() {
    if (hidden || !report || report.kind === "other") {
      ui.setFabVisible(false);
      ui.showListing(false);
      return;
    }
    if (report.kind === "listing") {
      ui.hidePreview();
      if (mode === "open") {
        ui.setFabVisible(false);
        ui.showListing(true);
      } else {
        ui.showListing(false);
        ui.setFabVisible(true);
        ui.setCollapsed(true);
      }
      return;
    }
    ui.showListing(false);
    ui.setFabVisible(true);
    ui.setCollapsed(mode !== "open");
  }

  async function openPreview() {
    if (!report || report.kind !== "product" || hidden) return;
    ui.showPreview(previewModel());
    const product = report.product;
    const res = await chrome.runtime.sendMessage({
      type: "catalog-check",
      eans: product.ean ? [product.ean] : [],
      urls: [location.href]
    }).catch(() => null);
    if (res?.matches?.length && ui.previewOpen()) {
      ui.showPreview(previewModel({ note: "Jest już w bazie. Zapis odświeży tę kartę, nie zrobi drugiej." }));
    }
  }

  async function savePreview(toSession) {
    if (!report || report.kind !== "product") return;
    ui.setStatus(toSession ? "Dodaję do sesji…" : "Zapisuję…");
    const res = await chrome.runtime.sendMessage({
      type: toSession ? "session-add-product" : "save-product",
      product: report.product,
      group: ui.groupValue(),
      pageUrl: location.href,
      toNhp: !toSession,
      autostart: !!toSession
    });
    ui.setStatus(res?.message || res?.error || "Nie udało się zapisać.", !res?.ok);
  }

  function download(filename, bytes, type) {
    const blob = new Blob([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 15000);
  }

  ui.bind({
    open: () => {
      if (mode !== "open") {
        rememberMode("open");
        showForMode();
      }
      if (report?.kind !== "listing") openPreview();
    },
    collapse: () => {
      rememberMode(nextDockMode(mode, mode === "open" ? "collapsed" : "open"));
      ui.hidePreview();
      showForMode();
    },
    hide: () => {
      rememberMode("closed");
      ui.hidePreview();
      ui.setFabVisible(false);
      ui.showListing(false);
      ticks.clear();
    },
    dragend: (pos) => chrome.storage.local.set({ nhpFabPos: pos }),
    "close-preview": () => ui.hidePreview(),
    save: () => savePreview(false),
    csv: () => savePreview(true),
    "close-listing": () => {
      rememberMode("collapsed");
      showForMode();
    },
    "select-all": () => {
      const allOn = ticks.checkedCount() === ticks.count() && ticks.count() > 0;
      ticks.setAll(!allOn);
      paintListing();
    },
    crawl: () => {
      rememberMode("open");
      showForMode();
      job = { status: "running", phase: "list", origin: location.origin, startedAt: Date.now(), queued: 0, fetched: 0, message: "Szukam produktów na kolejnych stronach…" };
      paintListing();
      chrome.runtime.sendMessage({
        type: "listing-start",
        startUrl: location.href,
        mode: "all",
        limit: ui.listingLimit()
      }).catch((err) => {
        job = { ...job, status: "done", message: String(err?.message || err) };
        paintListing();
      });
    },
    selected: () => {
      const urls = ticks.selected();
      if (!urls.length) {
        job = { ...(job || {}), origin: location.origin, message: "Zaznacz produkty na tej stronie. Jeśli pól nie widać, przewiń w dół." };
        paintListing();
        return;
      }
      rememberMode("open");
      showForMode();
      job = { status: "running", phase: "list", origin: location.origin, startedAt: Date.now(), queued: urls.length, fetched: 0, message: `Pobieram zaznaczone: 0 / ${urls.length}.` };
      paintListing();
      chrome.runtime.sendMessage({
        type: "listing-start",
        startUrl: location.href,
        mode: "selected",
        urls,
        limit: urls.length
      }).catch((err) => {
        job = { ...job, status: "done", message: String(err?.message || err) };
        paintListing();
      });
    },
    pause: () => chrome.runtime.sendMessage({ type: job?.status === "paused" ? "listing-resume" : "listing-pause" }),
    cancel: () => chrome.runtime.sendMessage({ type: "listing-cancel" }),
    "save-all": () => chrome.runtime.sendMessage({
      type: "listing-save",
      toNhp: true,
      group: ui.listingGroup(),
      includeDuplicates: ui.includeDuplicates()
    }),
    "csv-all": () => chrome.runtime.sendMessage({
      type: "listing-save",
      toSession: true,
      group: ui.listingGroup(),
      includeDuplicates: ui.includeDuplicates()
    }),
    "csv-file": async () => {
      const pack = await chrome.runtime.sendMessage({ type: "listing-files", includeDuplicates: ui.includeDuplicates() });
      if (!pack?.csv) return;
      download(`NHP-${hostName}-listing.csv`, new TextEncoder().encode(pack.csv), "text/csv;charset=utf-8");
    },
    "xlsx-file": async () => {
      const pack = await chrome.runtime.sendMessage({ type: "listing-files", includeDuplicates: ui.includeDuplicates() });
      if (!pack?.xlsx) return;
      download(`NHP-${hostName}-listing.xlsx`, pack.xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target?.closest?.(".nhp-tick")) paintListing();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (ui.previewOpen()) ui.hidePreview();
      if (mode === "open") {
        rememberMode("collapsed");
        showForMode();
      }
      return;
    }
    if (mode === "closed" && (event.key === "e" || event.key === "E") && !event.metaKey && !event.ctrlKey && !event.altKey) {
      rememberMode("open");
      hidden = false;
      scan();
    }
    if (event.key !== "e" && event.key !== "E") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && target.closest && target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (!report || report.kind !== "product" || hidden) return;
    event.preventDefault();
    if (ui.previewOpen()) savePreview(false);
    else openPreview();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "listing-progress") {
      job = message.job;
      paintListing();
    }
    if (message?.type === "nhp-show-panel" || message?.type === "nhp-unhide") {
      rememberMode("open");
      hidden = false;
      scan();
      sendResponse({ ok: true });
    }
    if (message?.type === "nhp-open-preview") {
      openPreview();
      sendResponse({ ok: true, kind: report?.kind || "other" });
    }
    if (message?.type === "nhp-page-ask") {
      sendResponse({
        ok: true,
        kind: report?.kind || "other",
        name: report?.product?.name || "",
        hidden
      });
    }
    if (message?.type === "nhp-unhide") {
      delete hiddenHosts[hostName];
      hidden = false;
      chrome.storage.local.set({ nhpHiddenHosts: hiddenHosts });
      scan();
      sendResponse({ ok: true });
    }
  });

  scan();
  let scans = 0;
  let scanTimer = 0;
  function scheduleScan() {
    if (hidden || scans > 12) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scans += 1; scan(); }, 700);
  }
  document.addEventListener("scroll", scheduleScan, { passive: true });
  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) => [...record.addedNodes].some((node) => {
      if (!node || node.nodeType !== 1) return false;
      if (node.classList?.contains("nhp-tick") || node.id === "nhp-shop-root") return false;
      return true;
    }));
    if (relevant) scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 20000);
  chrome.runtime.sendMessage({ type: "listing-state" }).then((res) => {
    if (res?.job) { job = res.job; paintListing(); }
  }).catch(() => {});
})();
