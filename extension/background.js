import {
  addGroup, addItem, assignGroup, clearSession, finishSession, itemFromOffer,
  itemFromShopProduct, itemToOffer, normalizeSession, pauseSession, removeItem, resumeSession,
  sessionToSharklyCsv, setCurrentGroup, startSession
} from "./csv-session.mjs";
import { assertHttpEndpoint } from "./dest.mjs";
import { createListingRunner } from "./listing-job.mjs";
import { partitionKnown } from "./listing.mjs";
import { analyzePage, productToPayload } from "./page-product.mjs";
import { extractProduct } from "./shop-extract.mjs";
import { crawlShop } from "./shop-scan.mjs";
import { exportRow, fullExportZip, imageFileName, productsToCsv, productsToJson, productsToXlsx, toOfferItems } from "./shop-export.mjs";

const DEFAULT_BASE = "https://panel.nowoczesnyhandelpolski.pl";

const shop = {
  running: false,
  stop: false,
  pages: 0,
  liveCount: 0,
  products: [],
  maxPages: 50,
  maxProducts: 500,
  domain: "",
  error: "",
  done: false,
  upload: { running: false, done: 0, total: 0, errors: [] }
};

function snapshot() {
  return {
    running: shop.running,
    pages: shop.pages,
    count: shop.running ? shop.liveCount : shop.products.length,
    maxPages: shop.maxPages,
    maxProducts: shop.maxProducts,
    domain: shop.domain,
    error: shop.error,
    done: shop.done,
    products: shop.products,
    upload: shop.upload
  };
}

async function sha256Bytes(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function progress() {
  chrome.runtime.sendMessage({ type: "shop-progress", ...snapshot() }).catch(() => {});
}

const SESSION_KEY = "nhpCsvSession";
let sessionChain = Promise.resolve();

async function loadSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return normalizeSession(stored[SESSION_KEY]);
}

async function paintBadge(session) {
  const n = session.items.length;
  const text = n ? String(Math.min(n, 999)) : "";
  const title = session.status === "active"
    ? `NHP: sesja CSV, ${n} produktów`
    : session.status === "paused"
      ? `NHP: sesja wstrzymana, ${n} produktów`
      : (n ? `NHP: sesja CSV zakończona, ${n} produktów` : "NHP import");
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: session.status === "paused" ? "#5B6782" : "#C8102E" });
    await chrome.action.setTitle({ title });
  } catch { /* okno bez chrome.action */ }
}

async function commitSession(session) {
  const next = normalizeSession(session);
  await chrome.storage.local.set({ [SESSION_KEY]: next });
  await paintBadge(next);
  chrome.runtime.sendMessage({ type: "csv-session", session: next }).catch(() => {});
  return next;
}

function withSession(mutator) {
  const run = sessionChain.then(async () => {
    const current = await loadSession();
    const result = await mutator(current);
    if (result?.session) await commitSession(result.session);
    return result || { session: current };
  });
  sessionChain = run.then(() => {}, () => {});
  return run;
}

function payloadFromPage(payload, html, pageUrl) {
  const base = { ...(payload || {}) };
  if (!base.source_link && pageUrl) base.source_link = pageUrl;
  if (!html) return base;
  let shop = null;
  try { shop = extractProduct(String(html), pageUrl || base.source_link || "https://sklep.local/"); }
  catch { shop = null; }
  if (!shop) return base;
  const shopImages = Array.isArray(shop.images) ? shop.images : [];
  const haveImages = Array.isArray(base.images) && base.images.length > 0;
  return {
    ...base,
    catalog_name: base.catalog_name || shop.name || "",
    sku: base.sku || shop.sku || "",
    ean: base.ean || shop.ean || "",
    producer: base.producer || shop.brand || "",
    price: base.price || shop.price || "",
    price_before_promo: base.price_before_promo || shop.old_price || "",
    category: base.category || shop.category || "",
    parameters: base.parameters?.length ? base.parameters : (shop.parameters || []),
    images: haveImages ? base.images : shopImages,
        description: base.description || shop.description_text || "",
        description_sections: base.description_sections?.length ? base.description_sections : (shop.description_sections || []),
        source_link: base.source_link || shop.url || pageUrl || ""
      };
}

function sessionLine(result) {
  if (!result) return "";
  if (result.reason === "paused") return " Sesja CSV jest wstrzymana — produkt nie doszedł do listy.";
  if (result.reason === "limit") return " Sesja CSV jest pełna (2000 produktów).";
  if (result.reason === "empty") return " Na tej stronie nie widać produktu, więc sesja go nie dostała.";
  if (!result.added) return "";
  const group = result.group ? ` Grupa: ${result.group}.` : "";
  const verb = result.updated ? "zaktualizowano w sesji" : "dodano do sesji";
  return ` CSV: ${verb} (${result.count}).${group}`;
}

async function rememberInSession(payload) {
  return withSession(async (session) => {
    if (session.status !== "active") return { session, added: false, reason: session.status, count: session.items.length, group: "" };
    const step = addItem(session, itemFromOffer(payload, session.currentGroup));
    return {
      session: step.session,
      added: step.added,
      updated: step.updated,
      reason: step.reason,
      count: step.session.items.length,
      group: session.currentGroup || ""
    };
  });
}

async function absorbShop(session) {
  let next = session;
  let added = 0;
  for (const product of shop.products) {
    const step = addItem(next, itemFromShopProduct(product, session.currentGroup));
    if (step.added && !step.updated) added += 1;
    next = step.session;
  }
  return { session: next, added, count: next.items.length };
}

async function settings() {
  const stored = await chrome.storage.local.get(["apiBase", "apiKey"]);
  return {
    apiBase: String(stored.apiBase || DEFAULT_BASE).replace(/\/$/, ""),
    apiKey: String(stored.apiKey || "")
  };
}

async function ownConfig() {
  const stored = await chrome.storage.local.get(["ownEndpoint", "ownToken"]);
  try {
    return { url: assertHttpEndpoint(stored.ownEndpoint), token: String(stored.ownToken || "").trim() };
  } catch (err) {
    return { error: err.message };
  }
}

async function postItems(items, batchName) {
  const { apiBase, apiKey } = await settings();
  if (!apiKey) return { ok: false, error: "Wpisz klucz API w oknie wtyczki." };
  let res;
  try {
    res = await fetch(`${apiBase}/api/nhp/offer-export`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nhp-key": apiKey,
        "x-nhp-version": chrome.runtime.getManifest().version
      },
      body: JSON.stringify({
        name: batchName || (shop.domain ? `Sklep ${shop.domain}` : "Eksport sklepu"),
        account_login: shop.domain || "",
        items
      })
    });
  } catch {
    return { ok: false, error: "Brak połączenia z Centralą. Sprawdź adres panelu w ustawieniach wtyczki." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `Centrala zwróciła HTTP ${res.status}.` };
  return data;
}

async function saveOffer(payload) {
  return postItems([payload]);
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: "omit", redirect: "follow" });
  const type = String(res.headers.get("content-type") || "");
  if (!res.ok || !/html|xml|text/i.test(type)) return "";
  return res.text();
}

async function fetchPage(url) {
  const res = await fetch(url, { credentials: "omit", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get("content-type") || "");
  if (type && !/html|xml|text|json/i.test(type)) throw new Error("To nie jest strona produktu.");
  return res.text();
}

async function uploadList(products, onStep) {
  const { apiBase, apiKey } = await settings();
  if (!apiKey) return { ok: false, error: "Wpisz klucz API w oknie wtyczki.", images: 0, failed: 0, total: 0 };
  const jobs = [];
  for (const product of products) {
    product.hosted = Array.isArray(product.hosted) ? product.hosted : [];
    (product.images || []).forEach((url, index) => {
      if (typeof url !== "string" || !/^https?:/i.test(url)) return;
      if (product.hosted.some((h) => h.source === url && h.url)) return;
      jobs.push({ product, url, index });
    });
  }
  let images = 0;
  let failed = 0;
  const errors = [];
  for (const job of jobs) {
    const path = `products/${imageFileName(job.product, job.index, job.url)}`;
    try {
      const res = await fetch(job.url, { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("Zdjęcie większe niż 8 MB.");
      const sha = await sha256Bytes(bytes);
      const mime = String(res.headers.get("content-type") || "image/jpeg").split(";")[0];
      const up = await fetch(`${apiBase}/api/nhp/media`, {
        method: "POST",
        headers: {
          "x-nhp-key": apiKey,
          "x-nhp-path": path,
          "x-nhp-sha256": sha,
          "content-type": /^image\//.test(mime) ? mime : "image/jpeg"
        },
        body: bytes
      });
      const data = await up.json().catch(() => ({}));
      if (!up.ok || data.ok === false) throw new Error(data.error || `HTTP ${up.status}`);
      job.product.hosted = job.product.hosted.filter((h) => h.source !== job.url);
      job.product.hosted.push({ source: job.url, url: data.public_url, path: data.path || path, error: "" });
      images += 1;
    } catch (err) {
      const message = String(err?.message || err).slice(0, 180);
      errors.push({ url: job.url, error: message });
      failed += 1;
      job.product.hosted = (job.product.hosted || []).filter((h) => h.source !== job.url);
      job.product.hosted.push({ source: job.url, url: "", path, error: message });
    }
    if (onStep) onStep({ done: images + failed, total: jobs.length, errors });
  }
  return { ok: failed === 0, images, failed, total: jobs.length, errors };
}

async function uploadImages() {
  shop.upload = { running: true, done: 0, total: 0, errors: [] };
  progress();
  const result = await uploadList(shop.products, (step) => {
    shop.upload = { running: true, done: step.done, total: step.total, errors: step.errors };
    progress();
  });
  shop.upload.running = false;
  shop.upload.errors = result.errors || [];
  progress();
  if (result.error) return { ok: false, error: result.error, ...snapshot() };
  return { ok: result.ok, ...snapshot() };
}

async function sendItems(items, batchName) {
  let saved = 0;
  let flagged = 0;
  const errors = [];
  for (let i = 0; i < items.length; i += 20) {
    const part = await postItems(items.slice(i, i + 20), batchName);
    if (!part.ok && part.error) errors.push(part.error);
    saved += Number(part.saved || 0);
    flagged += Number(part.flagged || 0);
  }
  return { ok: errors.length === 0, saved, flagged, total: items.length, error: errors[0] || "" };
}

async function postOwn(products, { files }) {
  const cfg = await ownConfig();
  if (cfg.error) return { ok: false, error: cfg.error, message: cfg.error };
  const rows = products.map((p) => exportRow(p, ""));
  const headers = { accept: "application/json" };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  let body;
  let imageCount = 0;
  if (files) {
    const fd = new FormData();
    fd.append("export", new Blob([JSON.stringify({ source: "nhp-extension", products: rows })], { type: "application/json" }), "export.json");
    for (const product of products) {
      for (let i = 0; i < (product.images || []).length; i++) {
        const url = product.images[i];
        if (typeof url !== "string" || !/^https?:/i.test(url)) continue;
        try {
          const res = await fetch(url, { credentials: "omit" });
          if (!res.ok) continue;
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) continue;
          const mime = String(res.headers.get("content-type") || "image/jpeg").split(";")[0];
          fd.append("images", new Blob([bytes], { type: /^image\//.test(mime) ? mime : "image/jpeg" }), imageFileName(product, i, url));
          imageCount += 1;
        } catch { /* adres zostaje w JSON */ }
      }
    }
    body = fd;
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ source: "nhp-extension", products: rows });
    imageCount = rows.reduce((sum, row) => sum + (row.images?.length || 0), 0);
  }
  try {
    const res = await fetch(cfg.url, { method: "POST", headers, body });
    const text = await res.text();
    if (!res.ok) {
      const message = `Własny serwer odrzucił wysyłkę (HTTP ${res.status}): ${text.slice(0, 160)}`;
      return { ok: false, error: message, message };
    }
    const message = files
      ? `Własny serwer: wysłano ${products.length} produktów i ${imageCount} plików zdjęć.`
      : `Własny serwer: wysłano ${products.length} produktów, adresy zdjęć w JSON: ${imageCount}.`;
    return { ok: true, message, products: products.length, images: imageCount };
  } catch (err) {
    const message = `Nie udało się połączyć z własnym serwerem: ${String(err?.message || err).slice(0, 160)}`;
    return { ok: false, error: message, message };
  }
}

async function testOwn() {
  const cfg = await ownConfig();
  if (cfg.error) return { ok: false, error: cfg.error };
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ping: true, source: "nhp-extension" })
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Serwer zwrócił HTTP ${res.status}: ${text.slice(0, 180)}` };
    return { ok: true, message: `Połączenie działa. Serwer odpowiedział HTTP ${res.status}.` };
  } catch (err) {
    return { ok: false, error: `Brak połączenia: ${String(err?.message || err).slice(0, 160)}. Adres musi być HTTP lub HTTPS — FTP nie działa w przeglądarce.` };
  }
}

function asProduct(payload) {
  return {
    name: payload.catalog_name || payload.name || "",
    sku: payload.sku || "",
    ean: payload.ean || "",
    brand: payload.producer || payload.brand || "",
    price: payload.price || "",
    old_price: payload.price_before_promo || payload.old_price || "",
    category: payload.category || "",
    parameters: payload.parameters || [],
    images: Array.isArray(payload.images) ? payload.images.filter((u) => typeof u === "string") : [],
    url: payload.source_link || payload.url || "",
    description_text: payload.description || payload.description_text || "",
    hosted: []
  };
}

async function deliverProducts(products, { toNhp, toOwn, ownFiles, imageDomain, track }) {
  if (!toNhp && !toOwn) return { ok: false, error: "Zaznacz „Zapisz w NHP” albo „Wyślij na własny serwer”." };
  const lines = [];
  let ok = true;
  let images = 0;
  let saved = 0;
  let flagged = 0;
  if (toNhp) {
    const up = await uploadList(products, track);
    if (up.error) return { ok: false, error: up.error, message: up.error };
    images = up.images;
    const sent = await sendItems(toOfferItems(products, imageDomain || ""));
    saved = sent.saved;
    flagged = sent.flagged;
    if (!sent.ok) ok = false;
    lines.push(`NHP: ${sent.saved} z ${sent.total} produktów, wgrane zdjęcia: ${up.images}${up.failed ? `, błędy zdjęć: ${up.failed}` : ""}${sent.flagged ? `, bez ceny: ${sent.flagged}` : ""}.${sent.error ? " " + sent.error : ""}`);
  }
  if (toOwn) {
    const own = await postOwn(products, { files: !!ownFiles });
    if (!own.ok) ok = false;
    lines.push(own.message || own.error);
  }
  return { ok, message: lines.join(" "), images, saved, flagged, products: products.length };
}

async function runScan({ startUrl, maxPages, maxProducts }) {
  if (shop.running) return { ok: false, error: "Skan już trwa." };
  shop.running = true;
  shop.stop = false;
  shop.pages = 0;
  shop.products = [];
  shop.error = "";
  shop.done = false;
  shop.upload = { running: false, done: 0, total: 0, errors: [] };
  shop.maxPages = Math.max(1, Math.min(500, Number(maxPages) || 50));
  shop.maxProducts = Math.max(1, Math.min(5000, Number(maxProducts) || 500));
  shop.domain = new URL(startUrl).hostname;
  progress();
  try {
    const result = await crawlShop({
      startUrl,
      fetchText,
      maxPages: shop.maxPages,
      maxProducts: shop.maxProducts,
      delayMs: 700,
      shouldStop: () => shop.stop,
      onProgress: (state) => {
        shop.pages = state.pages;
        shop.liveCount = state.products;
        progress();
      }
    });
    shop.products = result.products;
    shop.pages = result.pages;
    shop.done = true;
  } catch (err) {
    shop.error = String(err?.message || err).slice(0, 200);
    shop.done = true;
  } finally {
    shop.running = false;
    if (!shop.error && shop.products.length) {
      await withSession(async (session) => {
        if (session.status !== "active") return { session };
        return absorbShop(session);
      });
    }
    progress();
  }
  return { ok: !shop.error, ...snapshot() };
}

function publicJob(snap) {
  const trim = (product) => ({ ...product, description_html: "" });
  return {
    ...snap,
    products: (snap.products || []).map(trim),
    held: (snap.held || []).map(trim),
    failures: (snap.failures || []).slice(-20)
  };
}

const listingRunner = createListingRunner({ fetchText: fetchPage });
let listingLookup = 0;

function broadcastJob(snap) {
  const job = publicJob(snap);
  chrome.storage.local.set({ nhpListingJob: job }).catch(() => {});
  chrome.runtime.sendMessage({ type: "listing-progress", job }).catch(() => {});
}

listingRunner.subscribe((snap) => broadcastJob(snap));

async function lookupCatalog(eans, urls) {
  const { apiBase, apiKey } = await settings();
  if (!apiKey) return { ok: false, error: "Wpisz klucz API w oknie wtyczki.", matches: [] };
  try {
    const res = await fetch(`${apiBase}/api/nhp/catalog-lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nhp-key": apiKey,
        "x-nhp-version": chrome.runtime.getManifest().version
      },
      body: JSON.stringify({ eans: (eans || []).slice(0, 500), urls: (urls || []).slice(0, 500) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, error: data.error || `HTTP ${res.status}`, matches: [] };
    return { ok: true, matches: Array.isArray(data.matches) ? data.matches : [] };
  } catch {
    return { ok: false, error: "Brak połączenia z Centralą.", matches: [] };
  }
}

async function markListingDuplicates(snap) {
  const products = snap.products || [];
  if (!products.length) return;
  const found = await lookupCatalog(products.map((p) => p.ean), products.map((p) => p.url));
  const known = found.ok
    ? { eans: found.matches.map((m) => m.ean), urls: found.matches.map((m) => m.source_link) }
    : { eans: [], urls: [] };
  const parts = partitionKnown(products, known);
  listingRunner.applyLookup({
    products: parts.fresh,
    held: parts.dupes,
    duplicates: parts.dupes.length,
    lookupNote: found.ok
      ? (parts.dupes.length ? `Już w bazie: ${parts.dupes.length}. Zapis ich pominie, chyba że zaznaczysz nadpisanie.` : "W bazie nie ma tych produktów.")
      : "Nie sprawdziłem bazy. Zapis i tak podmieni kartę o tym samym EAN albo adresie."
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;
  if (message.type === "save-product") {
    message.payload = productToPayload(message.product, message.group || "");
    message.pageUrl = message.pageUrl || message.product?.url || "";
    message.type = "capture";
  }
  if (message.type === "session-add-product") {
    message.payload = productToPayload(message.product, message.group || "");
    message.pageUrl = message.pageUrl || message.product?.url || "";
    message.autostart = true;
    message.type = "session-add-page";
  }
  if (message.type === "capture" || message.type === "session-add-page") {
    (async () => {
      const payload = payloadFromPage(message.payload, message.html, message.pageUrl);
      if (message.group) payload.product_group = message.group;
      if (message.group || message.autostart) {
        await withSession(async (session) => {
          let next = session;
          if (message.autostart && next.status !== "active") next = startSession(next);
          if (message.group) next = setCurrentGroup(next, message.group);
          return { session: next };
        });
      }
      if (!payload.catalog_name && !payload.price && !payload.ean && !payload.sku) {
        sendResponse({ ok: false, error: "Nie widzę produktu na tej stronie. Otwórz kartę oferty albo produktu." });
        return;
      }
      const sessionOnly = message.type === "session-add-page";
      const kept = sessionOnly ? { added: false } : await rememberInSession(payload);
      if (sessionOnly) {
        const only = await rememberInSession(payload);
        if (!only.added && only.reason === "idle") {
          sendResponse({ ok: false, error: "Najpierw zacznij sesję CSV." });
          return;
        }
        if (!only.added && only.reason === "paused") {
          sendResponse({ ok: false, error: "Sesja jest wstrzymana. Wznów ją, żeby dodać produkt." });
          return;
        }
        if (!only.added) {
          sendResponse({ ok: false, error: only.reason === "limit" ? "Sesja ma już 2000 produktów." : "Nie udało się dodać produktu do sesji." });
          return;
        }
        const group = only.group ? ` Grupa: ${only.group}.` : "";
        sendResponse({ ok: true, message: `W sesji jest ${only.count} produktów.${group}`, count: only.count });
        return;
      }
      const toNhp = message.toNhp !== false;
      const toOwn = message.toOwn === true;
      if (!toNhp && !toOwn && !kept.added) {
        const reason = kept.reason === "paused"
          ? "Sesja CSV jest wstrzymana. Wznów ją albo zaznacz „Zapisz w NHP”."
          : "Zaznacz „Zapisz w NHP” albo „Wyślij na własny serwer”, albo zacznij sesję CSV.";
        sendResponse({ ok: false, error: reason });
        return;
      }
      const lines = [];
      let ok = true;
      if (toNhp) {
        const product = asProduct(payload);
        const up = await uploadList([product]);
        if (up.error) {
          const note = sessionLine(kept);
          sendResponse({ ok: false, error: `${up.error}${note}`, message: up.error });
          return;
        }
        const hosted = (product.hosted || []).map((h) => h.url).filter(Boolean);
        if (hosted.length) payload.images = hosted;
        const part = await postItems([{ ...payload, product_group: kept.group || payload.product_group || "" }]);
        if (!part.ok) ok = false;
        lines.push(part.ok
          ? `NHP: zapisano ofertę, wgrane zdjęcia: ${up.images}${up.failed ? `, błędy zdjęć: ${up.failed}` : ""}.`
          : (part.error || "NHP nie zapisało oferty."));
      }
      if (toOwn) {
        const own = await postOwn([asProduct(payload)], { files: message.ownFiles === true });
        if (!own.ok) ok = false;
        lines.push(own.message || own.error);
      }
      if (!toNhp && !toOwn && kept.added) lines.push("Zapis do NHP jest wyłączony.");
      const note = sessionLine(kept);
      sendResponse({ ok, message: `${lines.join(" ")}${note}`.trim(), error: ok ? "" : lines.join(" "), flagged: 0, count: kept.count || 0 });
    })();
    return true;
  }
  if (message.type === "own-test") {
    testOwn().then(sendResponse);
    return true;
  }
  if (message.type === "shop-deliver") {
    if (!shop.products.length) {
      sendResponse({ ok: false, error: "Najpierw zeskanuj sklep." });
      return;
    }
    deliverProducts(shop.products, {
      toNhp: message.toNhp === true,
      toOwn: message.toOwn === true,
      ownFiles: message.ownFiles === true,
      imageDomain: message.imageDomain || "",
      track: (step) => {
        shop.upload = { running: true, done: step.done, total: step.total, errors: step.errors || [] };
        progress();
      }
    }).then((result) => {
      shop.upload.running = false;
      progress();
      sendResponse(result);
    });
    return true;
  }
  if (message.type === "shop-start") {
    runScan(message).then(sendResponse);
    return true;
  }
  if (message.type === "shop-stop") {
    shop.stop = true;
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "shop-state") {
    sendResponse(snapshot());
    return;
  }
  if (message.type === "shop-upload") {
    uploadImages().then(sendResponse);
    return true;
  }
  if (message.type === "shop-send") {
    deliverProducts(shop.products, {
      toNhp: true,
      toOwn: false,
      imageDomain: message.imageDomain || "",
      track: (step) => {
        shop.upload = { running: true, done: step.done, total: step.total, errors: step.errors || [] };
        progress();
      }
    }).then((result) => {
      shop.upload.running = false;
      progress();
      sendResponse({ ...result, saved: result.saved || 0, total: shop.products.length, flagged: result.flagged || 0 });
    });
    return true;
  }
  if (message.type === "shop-files") {
    const domain = message.imageDomain || "";
    const products = shop.products;
    sendResponse({
      ok: true,
      csv: productsToCsv(products, domain),
      json: productsToJson(products, domain),
      xlsx: Array.from(productsToXlsx(products, domain)),
      images: products.flatMap((p) => (p.images || []).map((url, n) => ({ url, name: imageFileName(p, n, url) }))),
      zip: Array.from(fullExportZip(products, domain))
    });
    return;
  }
  if (message.type === "csv-session-get") {
    withSession(async (session) => ({ session })).then((result) => sendResponse({ ok: true, session: result.session }));
    return true;
  }
  if (message.type === "csv-session-start") {
    withSession(async (session) => ({ session: startSession(session) })).then((result) => sendResponse({ ok: true, session: result.session }));
    return true;
  }
  if (message.type === "csv-session-pause") {
    withSession(async (session) => ({ session: pauseSession(session) })).then((result) => sendResponse({ ok: true, session: result.session }));
    return true;
  }
  if (message.type === "csv-session-resume") {
    withSession(async (session) => ({ session: resumeSession(session) })).then((result) => sendResponse({ ok: true, session: result.session }));
    return true;
  }
  if (message.type === "csv-session-finish") {
    withSession(async (session) => {
      const next = finishSession(session);
      return { session: next, csv: sessionToSharklyCsv(next.items), count: next.items.length };
    }).then((result) => sendResponse({ ok: true, session: result.session, csv: result.csv, count: result.count }));
    return true;
  }
  if (message.type === "csv-session-clear") {
    withSession(async (session) => ({ session: clearSession(session) })).then((result) => sendResponse({ ok: true, session: result.session }));
    return true;
  }
  if (message.type === "csv-session-group") {
    withSession(async (session) => {
      if (message.mode === "add") {
        const step = addGroup(session, message.name);
        return { session: step.session, error: step.error };
      }
      if (message.mode === "current") return { session: setCurrentGroup(session, message.name) };
      if (message.mode === "remove") return { session: removeItem(session, message.id) };
      if (message.mode === "assign") return { session: assignGroup(session, message.ids || (message.id ? [message.id] : []), message.name) };
      return { session };
    }).then((result) => sendResponse({ ok: !result.error, error: result.error || "", session: result.session }));
    return true;
  }
  if (message.type === "csv-session-add-shop") {
    withSession(async (session) => {
      if (session.status !== "active") {
        const error = session.status === "paused"
          ? "Sesja jest wstrzymana. Wznów ją, żeby dodać produkty."
          : "Najpierw zacznij sesję CSV.";
        return { session, ok: false, error };
      }
      if (!shop.products.length) return { session, ok: false, error: "Najpierw zeskanuj sklep." };
      const step = await absorbShop(session);
      return { session: step.session, ok: true, message: `W sesji jest ${step.count} produktów. Nowych: ${step.added}.` };
    }).then((result) => sendResponse({ ok: result.ok !== false, error: result.error || "", message: result.message || "", session: result.session }));
    return true;
  }
  if (message.type === "csv-session-send") {
    (async () => {
      const session = await loadSession();
      if (!session.items.length) {
        sendResponse({ ok: false, error: "W sesji nie ma produktów." });
        return;
      }
      const products = session.items.map((item) => asProduct(itemToOffer(item)));
      const up = await uploadList(products);
      if (up.error) { sendResponse({ ok: false, error: up.error }); return; }
      const items = session.items.map((item, index) => {
        const hosted = (products[index].hosted || []).map((entry) => entry.url).filter(Boolean);
        const offer = itemToOffer(item);
        if (hosted.length) offer.images = hosted;
        return offer;
      });
      const sent = await sendItems(items, "Sesja CSV");
      sendResponse({
        ok: sent.ok,
        error: sent.error || "",
        message: sent.ok
          ? `NHP: zapisano ${sent.saved} z ${sent.total}.${sent.flagged ? ` Bez ceny: ${sent.flagged}.` : ""} Zdjęcia: ${up.images}.`
          : (sent.error || "Nie udało się wysłać sesji.")
      });
    })();
    return true;
  }
  if (message.type === "preview-page") {
    const report = analyzePage(message.html || "", message.pageUrl || "");
    sendResponse({
      ok: true,
      kind: report.kind,
      missing: report.missing,
      product: report.product,
      listingCount: report.listing.products.length
    });
    return;
  }
  if (message.type === "catalog-check") {
    lookupCatalog(message.eans || [], message.urls || []).then(sendResponse);
    return true;
  }
  if (message.type === "listing-start") {
    const token = ++listingLookup;
    listingRunner.start({
      startUrl: message.startUrl,
      urls: message.urls,
      mode: message.mode,
      limit: message.limit
    }).then(async (snap) => {
      if (token !== listingLookup) return;
      if (snap.status === "done" || snap.status === "cancelled") await markListingDuplicates(snap);
    }).catch((err) => {
      broadcastJob({ ...listingRunner.state(), status: "done", error: String(err?.message || err), message: "Pobieranie nie doszło do końca." });
    });
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "listing-pause") {
    sendResponse({ ok: true, job: publicJob(listingRunner.pause()) });
    return;
  }
  if (message.type === "listing-resume") {
    sendResponse({ ok: true, job: publicJob(listingRunner.resume()) });
    return;
  }
  if (message.type === "listing-cancel") {
    listingLookup += 1;
    sendResponse({ ok: true, job: publicJob(listingRunner.cancel()) });
    return;
  }
  if (message.type === "listing-state") {
    sendResponse({ ok: true, job: publicJob(listingRunner.state()) });
    return;
  }
  if (message.type === "listing-files") {
    const snap = listingRunner.state();
    const products = message.includeDuplicates ? snap.products.concat(snap.held || []) : snap.products;
    sendResponse({
      ok: products.length > 0,
      error: products.length ? "" : "Nie ma jeszcze pobranych kart.",
      csv: productsToCsv(products, ""),
      xlsx: Array.from(productsToXlsx(products, ""))
    });
    return;
  }
  if (message.type === "listing-save") {
    (async () => {
      const snap = listingRunner.state();
      const products = message.includeDuplicates ? snap.products.concat(snap.held || []) : snap.products;
      if (!products.length) {
        sendResponse({ ok: false, error: "Nie ma produktów do zapisu." });
        return;
      }
      const lines = [];
      let ok = true;
      if (message.toSession) {
        const added = await withSession(async (session) => {
          let next = session.status === "active" ? session : startSession(session);
          if (message.group) next = setCurrentGroup(next, message.group);
          let fresh = 0;
          for (const product of products) {
            const step = addItem(next, itemFromOffer(productToPayload(product, next.currentGroup), next.currentGroup));
            if (step.added && !step.updated) fresh += 1;
            next = step.session;
          }
          return { session: next, fresh, count: next.items.length };
        });
        lines.push(`W sesji jest ${added.count} produktów. Nowych: ${added.fresh}.`);
      }
      if (message.toNhp) {
        broadcastJob({ ...listingRunner.state(), message: "Wgrywam zdjęcia i zapisuję w NHP…" });
        const shaped = products.map((product) => asProduct(productToPayload(product, message.group || "")));
        const up = await uploadList(shaped);
        if (up.error) {
          broadcastJob({ ...listingRunner.state(), message: up.error });
          sendResponse({ ok: false, error: up.error });
          return;
        }
        const items = products.map((product, index) => {
          const payload = productToPayload(product, message.group || "");
          const hosted = (shaped[index].hosted || []).map((entry) => entry.url).filter(Boolean);
          if (hosted.length) payload.images = hosted;
          return payload;
        });
        const sent = await sendItems(items, snap.origin ? `Listing ${snap.origin}` : "Listing");
        if (!sent.ok) ok = false;
        lines.push(sent.ok
          ? `NHP: zapisano ${sent.saved} z ${sent.total}. Zdjęcia: ${up.images}${up.failed ? `, błędy zdjęć: ${up.failed}` : ""}.`
          : (sent.error || "NHP nie zapisało produktów."));
      }
      const messageText = lines.join(" ") || "Gotowe.";
      broadcastJob({ ...listingRunner.state(), message: messageText });
      sendResponse({ ok, message: messageText, error: ok ? "" : messageText });
    })();
    return true;
  }
});

async function restoreListing() {
  const stored = await chrome.storage.local.get("nhpListingJob");
  const job = stored.nhpListingJob;
  if (!job || job.status === "idle") return;
  if (typeof listingRunner.hydrate === "function") listingRunner.hydrate(job);
}

loadSession().then(paintBadge).catch(() => {});
restoreListing().catch(() => {});
chrome.runtime.onInstalled.addListener(() => { loadSession().then(paintBadge).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { loadSession().then(paintBadge).catch(() => {}); restoreListing().catch(() => {}); });
