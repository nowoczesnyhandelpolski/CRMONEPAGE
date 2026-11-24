// Pobieranie listingu w tle: strony kategorii, potem pełna karta każdego produktu.

import { collectListingUrls, fetchProductQueue } from "./listing.mjs";
import { extractProduct } from "./shop-extract.mjs";

export function emptyListingState() {
  return {
    status: "idle",
    mode: "",
    limit: 50,
    startUrl: "",
    origin: "",
    queued: 0,
    pages: 0,
    done: 0,
    failed: 0,
    missingEan: 0,
    duplicates: 0,
    fetched: 0,
    currentUrl: "",
    message: "",
    error: "",
    lookupNote: "",
    products: [],
    held: [],
    failures: []
  };
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return ""; }
}

export function createListingRunner({
  fetchText,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  extract = extractProduct
} = {}) {
  let state = emptyListingState();
  const control = { pause: false, cancel: false, token: 0 };
  const listeners = new Set();

  function snapshot() {
    return {
      ...state,
      products: state.products.slice(),
      held: state.held.slice(),
      failures: state.failures.slice()
    };
  }

  function emit() {
    const snap = snapshot();
    for (const fn of listeners) {
      try { fn(snap); } catch { /* słuchacz nie zatrzymuje kolejki */ }
    }
  }

  function patch(next) {
    state = { ...state, ...next };
    emit();
  }

  async function start({ startUrl, urls, mode, limit } = {}) {
    control.token += 1;
    const token = control.token;
    control.pause = false;
    control.cancel = false;
    const cap = Number(limit) === 0 ? 0 : Math.max(1, Math.min(2000, Number(limit) || 50));
    if (!startUrl) {
      patch({ ...emptyListingState(), status: "done", error: "Brak adresu listingu.", message: "Brak adresu listingu." });
      return snapshot();
    }
    state = {
      ...emptyListingState(),
      status: "running",
      mode: mode === "selected" ? "selected" : "all",
      limit: cap,
      startUrl,
      origin: originOf(startUrl),
      message: "Szukam produktów…"
    };
    emit();
    const alive = () => control.token === token && !control.cancel;
    let targets = Array.isArray(urls) ? urls.map((item) => (typeof item === "string" ? { url: item } : item)).filter((item) => item?.url) : [];
    if (state.mode === "all" || !targets.length) {
      const collected = await collectListingUrls({
        startUrl,
        fetchText,
        limit: cap,
        delayMs: 1000,
        sleep,
        shouldStop: () => !alive(),
        shouldPause: () => control.pause && alive(),
        onPage: (info) => {
          if (!alive()) return;
          patch({
            pages: info.pages,
            queued: info.count,
            currentUrl: info.url,
            message: `Strona ${info.pages}. Znalezione produkty: ${info.count}.`
          });
        }
      });
      if (!alive()) {
        patch({ status: "cancelled", message: "Przerwano." });
        return snapshot();
      }
      targets = collected.urls.slice(0, cap === 0 ? 2000 : cap);
      patch({ pages: collected.pages, queued: targets.length });
    } else {
      targets = targets.slice(0, cap === 0 ? 2000 : cap);
      patch({ queued: targets.length, message: `Do pobrania: ${targets.length}.` });
    }
    const sameOrigin = targets.filter((item) => originOf(item.url) === state.origin);
    const queue = await fetchProductQueue({
      urls: sameOrigin.map((item) => item.url),
      fetchText,
      delayMs: 1000,
      retries: 2,
      sleep,
      extract,
      shouldPause: () => control.pause && alive(),
      shouldStop: () => !alive(),
      onItem: (row, results) => {
        if (control.token !== token) return;
        const products = results.filter((item) => item.ok).map((item) => item.product);
        patch({
          fetched: results.length,
          done: products.length,
          failed: results.filter((item) => !item.ok).length,
          missingEan: products.filter((item) => !item.ean).length,
          currentUrl: row.url,
          products,
          failures: results.filter((item) => !item.ok).map((item) => ({ url: item.url, error: item.error })),
          message: row.ok ? "Pobrano kartę produktu." : "Ta karta się nie udała. Idę dalej."
        });
      }
    });
    if (control.token !== token) return snapshot();
    const cancelled = queue.cancelled || control.cancel;
    patch({
      status: cancelled ? "cancelled" : "done",
      message: cancelled ? "Przerwano." : "Koniec pobierania."
    });
    return snapshot();
  }

  return {
    start,
    pause() {
      if (state.status !== "running") return snapshot();
      control.pause = true;
      patch({ status: "paused", message: "Wstrzymane. Wznów, żeby iść dalej." });
      return snapshot();
    },
    resume() {
      if (!control.pause) return snapshot();
      control.pause = false;
      patch({ status: "running", message: "Wznawiam." });
      return snapshot();
    },
    cancel() {
      control.cancel = true;
      control.pause = false;
      if (state.status === "running" || state.status === "paused") patch({ message: "Przerywam…" });
      return snapshot();
    },
    state: snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    applyLookup({ products, held, duplicates, lookupNote }) {
      patch({
        products: products || state.products,
        held: held || [],
        duplicates: duplicates || 0,
        lookupNote: lookupNote || ""
      });
      return snapshot();
    },
    hydrate(saved) {
      if (!saved || typeof saved !== "object") return snapshot();
      const status = saved.status === "running" ? "paused" : saved.status;
      state = {
        ...emptyListingState(),
        ...saved,
        status: status || "idle",
        products: Array.isArray(saved.products) ? saved.products : [],
        held: Array.isArray(saved.held) ? saved.held : [],
        failures: Array.isArray(saved.failures) ? saved.failures : [],
        message: saved.status === "running"
          ? "Pobieranie stanęło. Możesz zapisać zebrane karty albo zacząć od nowa."
          : (saved.message || "")
      };
      emit();
      return snapshot();
    }
  };
}
