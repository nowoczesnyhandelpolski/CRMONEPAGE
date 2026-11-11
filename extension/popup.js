const base = document.getElementById("base");
const key = document.getElementById("key");
const msg = document.getElementById("msg");
const shopMsg = document.getElementById("shop-msg");
let latestShop = null;
const progress = document.getElementById("shop-progress");
const domainEl = document.getElementById("shop-domain");
const imageDomain = document.getElementById("image-domain");
const example = document.getElementById("image-example");

const settings = globalThis.chrome?.storage?.local;
(settings ? settings.get(["apiBase", "apiKey", "imageDomain", "shopMode"]) : Promise.resolve({})).then((stored) => {
  base.value = stored.apiBase || "https://panel.nowoczesnyhandelpolski.pl";
  key.value = stored.apiKey || "";
  imageDomain.value = stored.imageDomain || "";
  showExample();
  if (stored.shopMode === "shop") showTab("shop");
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

async function ensureHosted() {
  if (!document.getElementById("host-images").checked) return { ok: true, skipped: true };
  const origins = new Set();
  for (const product of latestShop?.products || []) {
    for (const url of product.images || []) {
      try { origins.add(`${new URL(url).origin}/*`); } catch { /* pomiń */ }
    }
  }
  if (origins.size) {
    const granted = await chrome.permissions.request({ origins: [...origins] });
    if (!granted) return { ok: false, error: "Bez zgody na serwery zdjęć nie wgram plików." };
  }
  return chrome.runtime.sendMessage({ type: "shop-upload" });
}

(async () => {
  const tab = await activeHttpTab();
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
  if (button.dataset.file !== "images") {
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
  const hosted = await ensureHosted();
  if (hosted && hosted.ok === false) { shopMsg.textContent = hosted.error; return; }
  shopMsg.textContent = "Wysyłam szkice…";
  const res = await chrome.runtime.sendMessage({ type: "shop-send", imageDomain: imageDomain.value.trim() });
  if (!res?.ok) shopMsg.textContent = res?.error || "Nie udało się wysłać.";
  else shopMsg.textContent = `Zapisano ${res.saved} z ${res.total}. Oznaczone brakiem ceny: ${res.flagged}.`;
});
