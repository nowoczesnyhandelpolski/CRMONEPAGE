import { crawlShop } from "./shop-scan.mjs";
import { fullExportZip, imageFileName, productsToCsv, productsToJson, productsToXlsx, toOfferItems } from "./shop-export.mjs";

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

async function uploadImages() {
  const { apiBase, apiKey } = await settings();
  if (!apiKey) return { ok: false, error: "Wpisz klucz API w oknie wtyczki." };
  const jobs = [];
  for (const product of shop.products) {
    product.hosted = Array.isArray(product.hosted) ? product.hosted : [];
    (product.images || []).forEach((url, index) => {
      if (product.hosted.some((h) => h.source === url && h.url)) return;
      jobs.push({ product, url, index });
    });
  }
  shop.upload = { running: true, done: 0, total: jobs.length, errors: [] };
  progress();
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
          "content-type": /^image\//.test(mime) ? mime : "image/jpeg"
        },
        body: bytes
      });
      const data = await up.json().catch(() => ({}));
      if (!up.ok || data.ok === false) throw new Error(data.error || `HTTP ${up.status}`);
      job.product.hosted = job.product.hosted.filter((h) => h.source !== job.url);
      job.product.hosted.push({ source: job.url, url: data.public_url, path: data.path || path, error: "" });
    } catch (err) {
      const message = String(err?.message || err).slice(0, 180);
      shop.upload.errors.push({ url: job.url, error: message });
      job.product.hosted = (job.product.hosted || []).filter((h) => h.source !== job.url);
      job.product.hosted.push({ source: job.url, url: "", path, error: message });
    }
    shop.upload.done += 1;
    progress();
  }
  shop.upload.running = false;
  progress();
  return { ok: shop.upload.errors.length === 0, ...snapshot() };
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
    saveOffer(message.payload).then(sendResponse);
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
    const items = toOfferItems(shop.products, message.imageDomain || "");
    (async () => {
      let saved = 0;
      let flagged = 0;
      const errors = [];
      for (let i = 0; i < items.length; i += 20) {
        const part = await postItems(items.slice(i, i + 20));
        if (!part.ok && part.error) errors.push(part.error);
        saved += Number(part.saved || 0);
        flagged += Number(part.flagged || 0);
      }
      sendResponse({ ok: errors.length === 0, saved, flagged, total: items.length, error: errors[0] || "" });
    })();
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
