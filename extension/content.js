// Klasyczny skrypt treści (bez type:module w manifeście — Chrome MV3 go nie uruchamia).
// Selektory ładują się w locie, więc podmiana selectors.mjs nie wymaga przebudowy wtyczki.
(async function () {
  if (window.__NHP_BOOTED) return;
  window.__NHP_BOOTED = true;

  const frame = document.createElement("iframe");
  frame.id = "nhp-frame";
  frame.title = "NHP";
  frame.className = "nhp-collapsed";
  frame.src = chrome.runtime.getURL("popup.html?dock=1");
  document.documentElement.appendChild(frame);

  let dockMode = ({ sessionActive }) => (sessionActive ? "open" : "collapsed");
  let nextDockMode = (_current, action) => (action === "open" ? "open" : action === "close" ? "closed" : "collapsed");
  try {
    ({ dockMode, nextDockMode } = await import(chrome.runtime.getURL("panel-mode.mjs")));
  } catch (err) {
    console.error("NHP: nie udało się wczytać stanu panelu.", err);
  }

  const siteKey = location.hostname.replace(/^www\./i, "");
  let mode = "collapsed";

  function applyMode(next) {
    mode = next === "open" || next === "closed" ? next : "collapsed";
    frame.classList.toggle("nhp-collapsed", mode === "collapsed");
    frame.classList.toggle("nhp-closed", mode === "closed");
    frame.contentWindow?.postMessage({ source: "nhp-host", type: "mode", mode }, "*");
  }

  async function rememberMode(next) {
    const stored = await chrome.storage.local.get("nhpDockByHost");
    const map = stored.nhpDockByHost && typeof stored.nhpDockByHost === "object" ? stored.nhpDockByHost : {};
    map[siteKey] = next;
    await chrome.storage.local.set({ nhpDockByHost: map });
  }

  async function bootMode() {
    const stored = await chrome.storage.local.get(["nhpDockByHost", "nhpCsvSession", "nhpPanelCollapsed"]);
    const saved = stored.nhpDockByHost?.[siteKey] || (stored.nhpPanelCollapsed === "1" ? "collapsed" : "");
    applyMode(dockMode({ saved, sessionActive: stored.nhpCsvSession?.status === "active" }));
  }
  bootMode();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.nhpDockByHost) return;
    const saved = changes.nhpDockByHost.newValue?.[siteKey];
    if (saved) applyMode(saved);
  });

  let extractOffer = null;
  try {
    ({ extractOffer } = await import(chrome.runtime.getURL("selectors.mjs")));
    offerOrigins();
  } catch (err) {
    console.error("NHP: nie udało się wczytać selektorów.", err);
  }

  function tell(text, bad) {
    frame.contentWindow?.postMessage({ source: "nhp-host", type: "status", text, bad: !!bad }, "*");
  }

  function offerOrigins() {
    if (!extractOffer) return [];
    const payload = extractOffer(document, location.href);
    const origins = [];
    for (const url of payload.images || []) {
      try { origins.push(`${new URL(url).origin}/*`); } catch { /* pomiń */ }
    }
    frame.contentWindow?.postMessage({ source: "nhp-host", type: "origins", origins }, "*");
    return payload;
  }

  frame.addEventListener("load", () => { offerOrigins(); applyMode(mode); });

  async function capture(opts = {}) {
    const href = location.href;
    let payload = { source_link: href, images: [] };
    if (extractOffer) {
      try { payload = extractOffer(document, href); }
      catch (err) { console.error("NHP: odczyt oferty nie powiódł się.", err); }
    }
    const allegroHost = /(^|\.)allegro\.pl$/i.test(location.hostname);
    const html = allegroHost ? "" : String(document.documentElement?.outerHTML || "").slice(0, 1500000);
    const stored = await chrome.storage.local.get(["saveToNhp", "sendToOwn", "ownFiles"]);
    const toNhp = "toNhp" in opts ? opts.toNhp !== false : stored.saveToNhp !== "0";
    const toOwn = "toOwn" in opts ? !!opts.toOwn : stored.sendToOwn === "1";
    const ownFiles = "ownFiles" in opts ? !!opts.ownFiles : stored.ownFiles === "1";
    tell("Zapisuję…");
    const res = await chrome.runtime.sendMessage({
      type: "capture",
      payload,
      html,
      pageUrl: href,
      toNhp,
      toOwn,
      ownFiles
    });
    const flagged = res?.flagged || 0;
    const text = res?.message || (res?.ok
      ? (flagged ? "Zapisano, ale brakuje ceny — pozycja jest oznaczona, cena nie została zgadnięta." : "Zapisano szkic w Centrali.")
      : (res?.error || "Nie udało się zapisać."));
    tell(text, !res?.ok);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.source !== "nhp-panel") return;
    if (event.data.type === "mode") {
      const next = nextDockMode(mode, event.data.mode === "toggle" ? "toggle" : event.data.mode);
      applyMode(next);
      rememberMode(next);
    }
    if (event.data.type === "capture") {
      if (mode === "closed") { applyMode("open"); rememberMode("open"); }
      capture(event.data);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "nhp-show-panel") {
      applyMode("open");
      rememberMode("open");
      sendResponse({ ok: true, mode: "open" });
    }
    if (message?.type === "nhp-capture") {
      if (mode === "closed") { applyMode("open"); rememberMode("open"); }
      capture(message);
      sendResponse({ ok: true });
    }
    if (message?.type === "nhp-page-ask") sendResponse({ ok: true, kind: "product", host: "allegro" });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mode === "open") {
      const target = event.target;
      if (target && target.closest && target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      applyMode("collapsed");
      rememberMode("collapsed");
      return;
    }
    if (event.key !== "e" && event.key !== "E") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && target.closest && target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    if (mode === "closed") { applyMode("open"); rememberMode("open"); }
    capture();
  });
})();
