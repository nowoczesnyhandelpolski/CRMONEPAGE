// Klasyczny skrypt treści (bez type:module w manifeście — Chrome MV3 go nie uruchamia).
// Selektory ładują się w locie, więc podmiana selectors.mjs nie wymaga przebudowy wtyczki.
(async function () {
  if (window.__NHP_BOOTED) return;
  window.__NHP_BOOTED = true;

  const frame = document.createElement("iframe");
  frame.id = "nhp-frame";
  frame.title = "NHP";
  frame.src = chrome.runtime.getURL("popup.html?dock=1");
  document.documentElement.appendChild(frame);

  function applyCollapsed(on) {
    frame.classList.toggle("nhp-collapsed", !!on);
  }
  chrome.storage.local.get(["nhpPanelCollapsed"]).then((s) => applyCollapsed(s.nhpPanelCollapsed === "1"));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.nhpPanelCollapsed) applyCollapsed(changes.nhpPanelCollapsed.newValue === "1");
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

  frame.addEventListener("load", () => offerOrigins());

  async function capture(opts = {}) {
    if (!extractOffer) {
      tell("Ta strona nie jest kartą oferty Allegro.", true);
      return;
    }
    const payload = extractOffer(document, location.href);
    if (!payload.catalog_name && !payload.price && !payload.ean) {
      tell("Nie widzę karty produktu. Odśwież stronę albo zaktualizuj selektory.", true);
      return;
    }
    const stored = await chrome.storage.local.get(["saveToNhp", "sendToOwn", "ownFiles"]);
    const toNhp = "toNhp" in opts ? opts.toNhp !== false : stored.saveToNhp !== "0";
    const toOwn = "toOwn" in opts ? !!opts.toOwn : stored.sendToOwn === "1";
    const ownFiles = "ownFiles" in opts ? !!opts.ownFiles : stored.ownFiles === "1";
    tell("Zapisuję…");
    const res = await chrome.runtime.sendMessage({
      type: "capture",
      payload,
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
    if (event.data.type === "collapsed") {
      chrome.storage.local.set({ nhpPanelCollapsed: event.data.on ? "1" : "0" });
      applyCollapsed(!!event.data.on);
    }
    if (event.data.type === "capture") capture(event.data);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "e" && event.key !== "E") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && target.closest && target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    capture();
  });
})();
