const base = document.getElementById("base");
const key = document.getElementById("key");
const msg = document.getElementById("msg");
const shopMsg = document.getElementById("shop-msg");
const ownMsg = document.getElementById("own-msg");
const ownUrl = document.getElementById("own-url");
const ownToken = document.getElementById("own-token");
const destNhp = document.getElementById("dest-nhp");
const destOwn = document.getElementById("dest-own");
const ownFiles = document.getElementById("own-files");
let latestShop = null;
let latestTab = null;
let pageOrigins = [];
const docked = new URLSearchParams(location.search).get("dock") === "1";
const progress = document.getElementById("shop-progress");
const domainEl = document.getElementById("shop-domain");
const imageDomain = document.getElementById("image-domain");
const example = document.getElementById("image-example");

if (docked) {
  document.body.classList.add("dock");
  document.getElementById("collapse").hidden = false;
  document.getElementById("capture-offer").hidden = false;
  document.getElementById("show-panel").hidden = true;
}

const settings = globalThis.chrome?.storage?.local;
(settings ? settings.get(["apiBase", "apiKey", "imageDomain", "shopMode", "ownEndpoint", "ownToken", "saveToNhp", "sendToOwn", "ownFiles", "nhpPanelCollapsed"]) : Promise.resolve({})).then((stored) => {
  base.value = stored.apiBase || "https://panel.nowoczesnyhandelpolski.pl";
  key.value = stored.apiKey || "";
  imageDomain.value = stored.imageDomain || "";
  ownUrl.value = stored.ownEndpoint || "";
  ownToken.value = stored.ownToken || "";
  destNhp.checked = stored.saveToNhp !== "0";
  destOwn.checked = stored.sendToOwn === "1";
  ownFiles.checked = stored.ownFiles === "1";
  showExample();
  if (stored.shopMode === "shop") showTab("shop");
  if (docked && stored.nhpPanelCollapsed === "1") setCollapsed(true);
});

function setCollapsed(on) {
  document.body.classList.toggle("is-collapsed", !!on);
  const button = document.getElementById("collapse");
  button.textContent = on ? "NHP" : "Zwiń";
  button.setAttribute("aria-label", on ? "Rozwiń panel" : "Zwiń panel");
}

document.getElementById("collapse").addEventListener("click", () => {
  const on = !document.body.classList.contains("is-collapsed");
  setCollapsed(on);
  settings?.set({ nhpPanelCollapsed: on ? "1" : "0" });
  parent.postMessage({ source: "nhp-panel", type: "collapsed", on }, "*");
});

function rememberDest() {
  settings?.set({
    saveToNhp: destNhp.checked ? "1" : "0",
    sendToOwn: destOwn.checked ? "1" : "0",
    ownFiles: ownFiles.checked ? "1" : "0",
    ownEndpoint: ownUrl.value.trim(),
    ownToken: ownToken.value.trim()
  });
}
destNhp.addEventListener("change", rememberDest);
destOwn.addEventListener("change", rememberDest);
ownFiles.addEventListener("change", rememberDest);
ownUrl.addEventListener("change", rememberDest);
ownToken.addEventListener("change", rememberDest);

window.addEventListener("message", (event) => {
  if (event.data?.source !== "nhp-host") return;
  if (event.data.type === "status") {
    msg.textContent = event.data.text || "";
    if (event.data.bad) msg.classList.add("bad");
  }
  if (event.data.type === "origins") pageOrigins = event.data.origins || [];
});

const HERO = {
  allegro: ["Import z Allegro", "Na karcie oferty naciśnij E albo przycisk „Zapisz w Centrali”."],
  shop: ["Eksport sklepu", "Skan tej samej domeny. Brakująca cena zostaje pusta."]
};

function showTab(name) {
  document.getElementById("allegro").hidden = name !== "allegro";
  document.getElementById("shop").hidden = name !== "shop";
  document.getElementById("tab-allegro").setAttribute("aria-pressed", name === "allegro" ? "true" : "false");
  document.getElementById("tab-shop").setAttribute("aria-pressed", name === "shop" ? "true" : "false");
  const copy = HERO[name] || HERO.allegro;
  document.getElementById("hero-title").textContent = copy[0];
  document.getElementById("hero-lead").textContent = copy[1];
  settings?.set({ shopMode: name });
}
document.getElementById("tab-allegro").addEventListener("click", () => showTab("allegro"));
document.getElementById("tab-shop").addEventListener("click", () => showTab("shop"));

document.getElementById("save").addEventListener("click", async () => {
  const apiBase = base.value.trim().replace(/\/$/, "");
  const apiKey = key.value.trim();
  if (!/^https?:\/\//.test(apiBase)) {
    msg.textContent = "Adres musi zaczynać się od https://";
    return;
  }
  if (apiKey && !apiKey.startsWith("nhp_")) {
    msg.textContent = "Klucz z panelu zaczyna się od nhp_.";
    return;
  }
  if (settings) await settings.set({ apiBase, apiKey });
  msg.textContent = "Zapisane w tej przeglądarce.";
});

function showExample() {
  const host = imageDomain.value.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || "panel.nowoczesnyhandelpolski.pl";
  example.textContent = `Po wgraniu na serwer: https://${host}/img/products/[marka]/[sku]-1.[rozszerzenie]. Bez domeny zostaje publiczny adres Storage.`;
}
imageDomain.addEventListener("input", () => {
  showExample();
  settings?.set({ imageDomain: imageDomain.value.trim() });
});

async function activeHttpTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) return null;
  return tab;
}

function paint(state) {
  if (!state) return;
  latestShop = state;
  if (state.domain) domainEl.textContent = state.domain;
  const upload = state.upload || {};
  const running = upload.running ? `Wgrywam zdjęcia ${upload.done || 0}/${upload.total || 0}. ` : state.running ? "Skanuję… " : state.done ? "Koniec. " : "";
  progress.textContent = `${running}Strony ${state.pages || 0}/${state.maxPages || 50} · Produkty ${state.count || 0}/${state.maxProducts || 500}`;
  document.getElementById("scan").disabled = !!state.running || !!upload.running;
  document.getElementById("stop").hidden = !state.running;
  if (state.error) shopMsg.textContent = state.error;
  const errors = upload.errors || [];
  document.getElementById("shop-errors").textContent = errors.slice(-5).map((e) => e.error).join("\n");
}

function imageOrigins() {
  const origins = new Set(pageOrigins);
  for (const product of latestShop?.products || []) {
    for (const url of product.images || []) {
      try { origins.add(`${new URL(url).origin}/*`); } catch { /* pomiń */ }
    }
  }
  return [...origins];
}

function ownOrigin() {
  const raw = ownUrl.value.trim();
  if (!raw) return "";
  try { return `${new URL(raw).origin}/*`; }
  catch { return ""; }
}

async function grantExportOrigins() {
  const origins = new Set(imageOrigins());
  const own = destOwn.checked ? ownOrigin() : "";
  if (own) origins.add(own);
  if (!origins.size) return true;
  return chrome.permissions.request({ origins: [...origins] });
}

async function ensureHosted() {
  if (!document.getElementById("host-images").checked) return { ok: true, skipped: true };
  const origins = imageOrigins();
  if (origins.length) {
    const granted = await chrome.permissions.request({ origins });
    if (!granted) return { ok: false, error: "Bez zgody na serwery zdjęć nie wgram plików." };
  }
  return chrome.runtime.sendMessage({ type: "shop-upload" });
}

async function deliverChosen() {
  rememberDest();
  if (!destNhp.checked && !destOwn.checked) {
    return { ok: false, error: "Zaznacz „Zapisz w NHP” albo „Wyślij na własny serwer”." };
  }
  if (destOwn.checked && !ownOrigin()) {
    return { ok: false, error: "Wpisz adres HTTP lub HTTPS. Przeglądarka nie obsługuje FTP." };
  }
  const granted = await grantExportOrigins();
  if (!granted) return { ok: false, error: "Bez zgody Chrome nie wyślę danych na ten adres." };
  return chrome.runtime.sendMessage({
    type: "shop-deliver",
    toNhp: destNhp.checked,
    toOwn: destOwn.checked,
    ownFiles: ownFiles.checked,
    imageDomain: imageDomain.value.trim()
  });
}

(async () => {
  const tab = await activeHttpTab();
  latestTab = tab;
  if (tab) domainEl.textContent = new URL(tab.url).hostname;
  const state = await chrome.runtime.sendMessage({ type: "shop-state" });
  paint(state);
})();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "shop-progress") paint(message);
});

document.getElementById("scan").addEventListener("click", async () => {
  const tab = await activeHttpTab();
  if (!tab) {
    shopMsg.textContent = "Otwórz kartę sklepu (adres http lub https).";
    return;
  }
  const origin = new URL(tab.url).origin;
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    shopMsg.textContent = "Bez zgody na tę domenę skan się nie uruchomi.";
    return;
  }
  shopMsg.textContent = "";
  const res = await chrome.runtime.sendMessage({
    type: "shop-start",
    startUrl: tab.url,
    maxPages: document.getElementById("max-pages").value,
    maxProducts: document.getElementById("max-products").value
  });
  if (res && !res.ok && res.error) shopMsg.textContent = res.error;
});

document.getElementById("stop").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "shop-stop" });
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  });
}

async function files() {
  return chrome.runtime.sendMessage({ type: "shop-files", imageDomain: imageDomain.value.trim() });
}

document.getElementById("upload-images").addEventListener("click", async () => {
  shopMsg.textContent = "Wgrywam zdjęcia…";
  const res = await ensureHosted();
  shopMsg.textContent = res?.error || (res?.skipped ? "Zapis na serwerze jest wyłączony." : "Zdjęcia są na serwerze NHP.");
});

document.querySelector(".exports").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-file]");
  if (!button) return;
  if (destNhp.checked || destOwn.checked) {
    const sent = await deliverChosen();
    shopMsg.textContent = sent?.message || sent?.error || "";
    if (sent && sent.ok === false) return;
  } else if (button.dataset.file !== "images" && document.getElementById("host-images").checked) {
    const hosted = await ensureHosted();
    if (hosted && hosted.ok === false) { shopMsg.textContent = hosted.error; return; }
  }
  const pack = await files();
  if (!pack?.ok) { shopMsg.textContent = "Najpierw zeskanuj sklep."; return; }
  const host = (domainEl.textContent || "sklep").replace(/[^a-z0-9.-]+/gi, "");
  if (button.dataset.file === "csv") downloadBlob(new Blob([pack.csv], { type: "text/csv" }), `NHP-${host}-produkty.csv`);
  if (button.dataset.file === "json") downloadBlob(new Blob([pack.json], { type: "application/json" }), `NHP-${host}-produkty.json`);
  if (button.dataset.file === "xlsx") downloadBlob(new Blob([new Uint8Array(pack.xlsx)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `NHP-${host}-produkty.xlsx`);
  if (button.dataset.file === "full") downloadBlob(new Blob([new Uint8Array(pack.zip)], { type: "application/zip" }), `NHP-${host}-full.zip`);
  if (button.dataset.file === "images") {
    if (!pack.images.length) { shopMsg.textContent = "Brak adresów zdjęć."; return; }
    pack.images.forEach((image, index) => {
      chrome.downloads.download({
        url: image.url,
        filename: `NHP-sklep/${host}/${image.name}`,
        saveAs: index === 0
      });
    });
    shopMsg.textContent = "Pierwsze zdjęcie pyta o miejsce. Reszta idzie do Pobrane/NHP-sklep.";
  }
});

document.getElementById("send-nhp").addEventListener("click", async () => {
  shopMsg.textContent = "Zapisuję…";
  const res = await deliverChosen();
  shopMsg.textContent = res?.message || res?.error || "Nie udało się zapisać.";
});

document.getElementById("own-test").addEventListener("click", async () => {
  rememberDest();
  let origin = "";
  try { origin = `${new URL(ownUrl.value.trim()).origin}/*`; }
  catch {
    ownMsg.textContent = "Wpisz pełny adres HTTP lub HTTPS. Przeglądarka nie obsługuje FTP.";
    return;
  }
  if (!/^https?:\/\//i.test(ownUrl.value.trim())) {
    ownMsg.textContent = "Podaj adres HTTP lub HTTPS. Przeglądarka nie wysyła plików przez FTP.";
    return;
  }
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) { ownMsg.textContent = "Chrome nie dostał zgody na ten adres."; return; }
  const res = await chrome.runtime.sendMessage({ type: "own-test" });
  ownMsg.textContent = res?.message || res?.error || "Brak odpowiedzi.";
});

document.getElementById("capture-offer").addEventListener("click", async () => {
  rememberDest();
  const origins = new Set(pageOrigins);
  if (destOwn.checked && ownOrigin()) origins.add(ownOrigin());
  if (origins.size) {
    const granted = await chrome.permissions.request({ origins: [...origins] });
    if (!granted) { msg.textContent = "Bez zgody nie wyślę zdjęć ani danych na własny serwer."; return; }
  }
  parent.postMessage({
    source: "nhp-panel",
    type: "capture",
    toNhp: destNhp.checked,
    toOwn: destOwn.checked,
    ownFiles: ownFiles.checked
  }, "*");
});

document.getElementById("show-panel").addEventListener("click", async () => {
  if (!latestTab?.id || !latestTab.url || !/^https?:/i.test(latestTab.url)) {
    msg.textContent = "Otwórz kartę sklepu albo oferty (adres http lub https).";
    return;
  }
  const origin = `${new URL(latestTab.url).origin}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) { msg.textContent = "Bez zgody na tę stronę panel się nie przypnie."; return; }
  await chrome.scripting.executeScript({ target: { tabId: latestTab.id }, files: ["content.js"] });
  msg.textContent = "Panel jest przy prawej krawędzi. Możesz go zwinąć do zakładki.";
});
