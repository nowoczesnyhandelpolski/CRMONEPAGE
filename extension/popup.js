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

let csvSession = { status: "idle", currentGroup: "", groups: [], items: [] };
const sessionPicked = new Set();

function setCollapsed(on) {
  document.body.classList.toggle("is-collapsed", !!on);
  const button = document.getElementById("collapse");
  const n = csvSession.items?.length || 0;
  button.textContent = on ? (n ? String(n) : "NHP") : "Zwiń";
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
  const addShop = document.getElementById("session-add-shop");
  if (addShop) addShop.hidden = !(state.count > 0 || (state.products || []).length);
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

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function sessionMsg(text) {
  document.getElementById("session-msg").textContent = text || "";
}

function groupOptions(selected, includeEmpty) {
  const names = (csvSession.groups || []).slice();
  if (selected && !names.includes(selected)) names.push(selected);
  const empty = includeEmpty ? `<option value="">Bez grupy</option>` : "";
  return empty + names.map((name) => `<option value="${esc(name)}"${name === selected ? " selected" : ""}>${esc(name)}</option>`).join("");
}

function paintSession(session) {
  if (!session) return;
  csvSession = session;
  const n = session.items?.length || 0;
  const count = document.getElementById("session-count");
  count.textContent = String(n);
  count.dataset.live = session.status === "active" ? "1" : "0";
  const state = document.getElementById("session-state");
  if (session.status === "active") state.textContent = `Sesja trwa. W pliku będzie ${n} produktów.`;
  else if (session.status === "paused") state.textContent = `Sesja wstrzymana. Nowe oferty nie dochodzą. Na liście jest ${n}.`;
  else state.textContent = n ? `Sesja zakończona. Na liście zostało ${n} produktów.` : "Sesja wyłączona. Nowe oferty nie trafiają do pliku.";
  const group = document.getElementById("session-group");
  if (document.activeElement !== group) group.innerHTML = `<option value="">Bez grupy</option>${groupOptions(session.currentGroup, false)}`;
  document.getElementById("session-start").hidden = session.status !== "idle";
  document.getElementById("session-start").textContent = n ? "Wznów sesję" : "Zacznij sesję CSV";
  document.getElementById("session-live").hidden = session.status === "idle" && !n;
  document.getElementById("session-pause").hidden = session.status === "idle";
  document.getElementById("session-pause").textContent = session.status === "paused" ? "Wznów" : "Wstrzymaj";
  document.getElementById("session-finish").textContent = session.status === "active" || session.status === "paused" ? "Zakończ i pobierz CSV" : "Pobierz CSV";
  document.getElementById("session-send").disabled = !n;
  document.getElementById("session-clear").disabled = !n && !session.groups?.length;
  document.getElementById("session-bulk").hidden = !n;
  const bulk = document.getElementById("session-bulk-group");
  if (document.activeElement !== bulk) bulk.innerHTML = groupOptions("", true);
  const list = document.getElementById("session-list");
  list.innerHTML = (session.items || []).map((item) => `<li>
    <label class="check"><input type="checkbox" data-session-pick="${esc(item.id)}" ${sessionPicked.has(item.id) ? "checked" : ""} aria-label="Zaznacz"></label>
    <span class="session-name">${esc(item.catalog_name || item.ean || "Bez nazwy")}</span>
    <select data-session-group="${esc(item.id)}" aria-label="Grupa produktu">${groupOptions(item.group, true)}</select>
    <button type="button" data-session-remove="${esc(item.id)}">Usuń</button>
  </li>`).join("");
  if (document.body.classList.contains("is-collapsed")) setCollapsed(true);
}

async function sessionCall(type, extra) {
  const res = await chrome.runtime.sendMessage({ type, ...extra });
  if (res?.session) paintSession(res.session);
  return res;
}

document.getElementById("session-start").addEventListener("click", async () => {
  const res = await sessionCall("csv-session-start");
  sessionMsg(res?.session?.status === "active" ? "Sesja trwa. Kolejne oferty dochodzą do listy." : "");
});
document.getElementById("session-pause").addEventListener("click", async () => {
  const type = csvSession.status === "paused" ? "csv-session-resume" : "csv-session-pause";
  const res = await sessionCall(type);
  sessionMsg(res?.session?.status === "paused" ? "Sesja wstrzymana." : "Sesja znów zbiera oferty.");
});
document.getElementById("session-finish").addEventListener("click", async () => {
  const res = await sessionCall("csv-session-finish");
  if (!res?.csv) { sessionMsg("Nie udało się zbudować pliku."); return; }
  downloadBlob(new Blob([res.csv], { type: "text/csv;charset=utf-8" }), "NHP-sesja.csv");
  sessionMsg(`Plik CSV ma ${res.count || 0} produktów. Sesja już nie zbiera nowych.`);
});
document.getElementById("session-send").addEventListener("click", async () => {
  sessionMsg("Wysyłam sesję do NHP…");
  const res = await chrome.runtime.sendMessage({ type: "csv-session-send" });
  sessionMsg(res?.message || res?.error || "Nie udało się wysłać.");
});
document.getElementById("session-clear").addEventListener("click", async () => {
  sessionPicked.clear();
  const res = await sessionCall("csv-session-clear");
  sessionMsg(res?.ok ? "Sesja wyczyszczona. Nazwy grup zostały." : "Nie udało się wyczyścić sesji.");
});
document.getElementById("session-add-group").addEventListener("click", async () => {
  const name = document.getElementById("session-new-group").value;
  const res = await sessionCall("csv-session-group", { mode: "add", name });
  if (res?.error) sessionMsg(res.error);
  else {
    document.getElementById("session-new-group").value = "";
    sessionMsg(res?.session?.currentGroup ? `Nowe oferty dostaną grupę „${res.session.currentGroup}”.` : "");
  }
});
document.getElementById("session-group").addEventListener("change", async (event) => {
  const res = await sessionCall("csv-session-group", { mode: "current", name: event.target.value });
  sessionMsg(res?.session?.currentGroup ? `Grupa przy zapisie: ${res.session.currentGroup}.` : "Nowe oferty będą bez grupy.");
});
document.getElementById("session-assign").addEventListener("click", async () => {
  const ids = [...sessionPicked];
  if (!ids.length) { sessionMsg("Zaznacz produkty na liście."); return; }
  const name = document.getElementById("session-bulk-group").value;
  await sessionCall("csv-session-group", { mode: "assign", ids, name });
  sessionMsg(name ? `Przypisano grupę „${name}”.` : "Zaznaczone produkty są bez grupy.");
});
document.getElementById("session-all").addEventListener("change", (event) => {
  sessionPicked.clear();
  if (event.target.checked) for (const item of csvSession.items || []) sessionPicked.add(item.id);
  paintSession(csvSession);
});
document.getElementById("session-list").addEventListener("change", async (event) => {
  const pick = event.target.dataset?.sessionPick;
  if (pick) {
    if (event.target.checked) sessionPicked.add(pick);
    else sessionPicked.delete(pick);
    return;
  }
  const id = event.target.dataset?.sessionGroup;
  if (!id) return;
  await sessionCall("csv-session-group", { mode: "assign", ids: [id], name: event.target.value });
});
document.getElementById("session-list").addEventListener("click", async (event) => {
  const id = event.target.dataset?.sessionRemove;
  if (!id) return;
  sessionPicked.delete(id);
  await sessionCall("csv-session-group", { mode: "remove", id });
});
document.getElementById("session-add-page").addEventListener("click", async () => {
  if (csvSession.status !== "active") { sessionMsg("Najpierw zacznij sesję CSV."); return; }
  const tab = await activeHttpTab();
  if (!tab?.id || !tab.url) { sessionMsg("Otwórz kartę produktu."); return; }
  let origin = "";
  try { origin = `${new URL(tab.url).origin}/*`; }
  catch { sessionMsg("Ten adres nie jest stroną produktu."); return; }
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) { sessionMsg("Bez zgody na tę stronę nie odczytam produktu."); return; }
  const [got] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ href: location.href, html: String(document.documentElement?.outerHTML || "").slice(0, 1500000) })
  });
  const page = got?.result;
  if (!page?.href) { sessionMsg("Nie udało się odczytać strony."); return; }
  sessionMsg("Dodaję otwartą stronę…");
  const res = await chrome.runtime.sendMessage({
    type: "session-add-page",
    payload: { source_link: page.href },
    html: page.html,
    pageUrl: page.href
  });
  if (res?.session) paintSession(res.session);
  sessionMsg(res?.message || res?.error || "");
});
document.getElementById("session-add-shop").addEventListener("click", async () => {
  sessionMsg("Dodaję zeskanowane produkty…");
  const res = await sessionCall("csv-session-add-shop");
  sessionMsg(res?.message || res?.error || "");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "csv-session" && message.session) paintSession(message.session);
});
chrome.storage?.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.nhpCsvSession?.newValue) paintSession(changes.nhpCsvSession.newValue);
});
sessionCall("csv-session-get").catch(() => {});

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
