import { assertHttpEndpoint } from "./dest.mjs";
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

async function postItems(items) {
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
        name: shop.domain ? `Sklep ${shop.domain}` : "Eksport sklepu",
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

async function sendItems(items) {
  let saved = 0;
  let flagged = 0;
  const errors = [];
  for (let i = 0; i < items.length; i += 20) {
    const part = await postItems(items.slice(i, i + 20));
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
    progress();
  }
  return { ok: !shop.error, ...snapshot() };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return;
  if (message.type === "capture") {
    (async () => {
      const payload = { ...(message.payload || {}) };
      const product = asProduct(payload);
      const toNhp = message.toNhp !== false;
      const toOwn = message.toOwn === true;
      if (!toNhp && !toOwn) {
        sendResponse({ ok: false, error: "Zaznacz „Zapisz w NHP” albo „Wyślij na własny serwer”." });
        return;
      }
      const lines = [];
      let ok = true;
      if (toNhp) {
        const up = await uploadList([product]);
        if (up.error) { sendResponse({ ok: false, error: up.error, message: up.error }); return; }
        const hosted = (product.hosted || []).map((h) => h.url).filter(Boolean);
        if (hosted.length) payload.images = hosted;
        const part = await postItems([payload]);
        if (!part.ok) ok = false;
        lines.push(part.ok
          ? `NHP: zapisano ofertę, wgrane zdjęcia: ${up.images}${up.failed ? `, błędy zdjęć: ${up.failed}` : ""}.`
          : (part.error || "NHP nie zapisało oferty."));
      }
      if (toOwn) {
        const own = await postOwn([product], { files: message.ownFiles === true });
        if (!own.ok) ok = false;
        lines.push(own.message || own.error);
      }
      sendResponse({ ok, message: lines.join(" "), error: ok ? "" : lines.join(" "), flagged: 0 });
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
  }
});
