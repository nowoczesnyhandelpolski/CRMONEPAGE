/* Automatyczna synchronizacja cen i stanów: Base → public.products → Shopify.
   Jedno wywołanie = jeden krok (porcja produktów), bo funkcja Cloudflare ma limit podzapytań.
   Cron w Supabase woła /api/base/sync co minutę, dopóki przebieg trwa albo w kolejce Shopify coś czeka. */
import { supabaseRest } from "./supabase-rest.mjs";
import {
  SOURCE_STORAGE,
  baseCall,
  baseConfig,
  inventoryInfo,
  productFromInventoryData,
  productFromStorageData,
  toNumber
} from "./base-core.mjs";
import { shopifyConfig } from "./shopify-core.mjs";
import { flushShopifyQueue } from "./shopify-sync.mjs";

/** Produkty sprawdzane w jednym kroku (jedno zapytanie do Base na katalog). */
export const SLICE = 50;
/** Produkty wysyłane do Shopify w jednym kroku (ok. 4 podzapytania na produkt). */
export const PUSH_PER_TICK = 5;
export const MAX_ERRORS = 50;
export const INTERVALS = [1, 2, 4, 6, 12, 24];

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export async function loadSyncState(env) {
  const rows = await supabaseRest(env, "base_sync_state?id=eq.1&select=*&limit=1");
  return rows?.[0] || null;
}

async function claim(env) {
  const rows = await supabaseRest(env, "rpc/base_sync_claim", { method: "POST", body: { p_seconds: 90 } });
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

async function saveState(env, patch) {
  const rows = await supabaseRest(env, "base_sync_state?id=eq.1", {
    method: "PATCH",
    prefer: "return=representation",
    body: { ...patch, lock_until: null, updated_at: new Date().toISOString() }
  });
  return rows?.[0] || null;
}

export async function cronTokenOk(env, token) {
  if (!token || String(token).length < 32) return false;
  const ok = await supabaseRest(env, "rpc/base_sync_token_ok", { method: "POST", body: { p_token: String(token) } });
  return ok === true;
}

function same(a, b) {
  const x = toNumber(a);
  const y = toNumber(b);
  if (x == null || y == null) return x == null && y == null;
  return Math.abs(x - y) < 0.005;
}

function variantKey(list) {
  return JSON.stringify((Array.isArray(list) ? list : [])
    .map((v) => [String(v?.base_id ?? ""), toNumber(v?.price), toNumber(v?.stock)])
    .sort((a, b) => a[0].localeCompare(b[0])));
}

/**
 * Porównuje produkt z bazy z danymi z Base. Zwraca zmianę do base_sync_apply albo null.
 * Stan 0 przy aktywnym produkcie i powrót towaru po automatycznym wstrzymaniu zawsze dają wpis.
 */
export function diffProduct(product, fresh) {
  const change = { id: product.id };
  const reasons = [];
  if (fresh.price != null && fresh.price > 0 && !same(fresh.price, product.price)) {
    change.price = fresh.price;
    reasons.push("cena");
  }
  if (fresh.stock != null && !same(fresh.stock, product.stock)) {
    change.stock = fresh.stock;
    reasons.push("stan");
  }
  const freshVariants = Array.isArray(fresh.variants) ? fresh.variants : [];
  if (freshVariants.length && variantKey(freshVariants) !== variantKey(product.variants)) {
    change.variants = freshVariants;
    reasons.push("warianty");
  }
  const stock = fresh.stock != null ? toNumber(fresh.stock) : toNumber(product.stock);
  if (stock === 0 && product.workflow_status === "opublikowany") {
    change.stock = 0;
    if (!reasons.includes("stan")) reasons.push("brak towaru");
  }
  if (stock != null && stock > 0 && product.base_auto_paused) {
    change.stock = stock;
    if (!reasons.includes("stan")) reasons.push("towar wrócił");
  }
  return reasons.length ? { change, reasons } : null;
}

function errorItem(text, product) {
  return {
    at: new Date().toISOString(),
    text: String(text || "Błąd").slice(0, 300),
    ...(product ? { product_id: product.id, name: String(product.name || "").slice(0, 120) } : {})
  };
}

/** Świeże dane z Base dla porcji produktów: jedno zapytanie na katalog / hurtownię. */
export async function fetchFresh(config, products, fetchImpl = fetch) {
  const groups = new Map();
  for (const product of products) {
    const key = `${product.source}|${product.base_inventory_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  const fresh = new Map();
  const errors = [];
  let inventories = null;
  for (const [key, list] of groups) {
    const [source, sourceId] = key.split("|");
    try {
      if (source === SOURCE_STORAGE) {
        const data = await baseCall(config, "getExternalStorageProductsData", {
          storage_id: sourceId,
          products: list.map((p) => (/^\d+$/.test(p.base_product_id) ? Number(p.base_product_id) : p.base_product_id))
        }, fetchImpl);
        const raw = data.products || {};
        const byId = Array.isArray(raw) ? Object.fromEntries(raw.map((item) => [String(item.product_id), item])) : raw;
        for (const p of list) {
          const item = byId[String(p.base_product_id)];
          if (item) fresh.set(p.id, productFromStorageData(p.base_product_id, item, { storageId: sourceId }));
        }
      } else {
        if (!inventories) {
          const inv = await baseCall(config, "getInventories", {}, fetchImpl);
          inventories = new Map((inv.inventories || []).map((item) => [String(item.inventory_id), inventoryInfo(item)]));
        }
        const inventory = inventories.get(String(sourceId));
        if (!inventory) {
          for (const p of list) errors.push(errorItem(`Katalogu ${sourceId} nie ma już w Base.`, p));
          continue;
        }
        const data = await baseCall(config, "getInventoryProductsData", {
          inventory_id: Number(sourceId),
          products: list.map((p) => Number(p.base_product_id)).filter(Number.isFinite)
        }, fetchImpl);
        for (const p of list) {
          const item = data.products?.[String(p.base_product_id)];
          if (item) fresh.set(p.id, productFromInventoryData(p.base_product_id, item, { inventory }));
        }
      }
      for (const p of list) {
        if (!fresh.has(p.id) && !errors.some((e) => e.product_id === p.id)) {
          // Produkt zniknął z Base — bezpieczniej uznać, że go nie ma.
          fresh.set(p.id, { price: null, stock: 0, variants: [], missing: true });
          errors.push(errorItem(`Produktu ${p.base_product_id} nie ma w Base — stan ustawiony na 0.`, p));
        }
      }
    } catch (err) {
      // Błąd Base (np. limit zapytań) — ta grupa zostaje bez zmian, reszta idzie dalej.
      for (const p of list) errors.push(errorItem(err.message, p));
      if (err.code === "ERROR_BAD_TOKEN") throw err;
    }
  }
  return { fresh, errors };
}

function finishPatch(state, errors, now) {
  const interval = Math.min(Math.max(Number(state.interval_hours) || 4, 1), 48);
  const all = [...(state.run_errors || []), ...errors].slice(-MAX_ERRORS);
  return {
    running: false,
    cursor: "",
    last_finished_at: now.toISOString(),
    last_checked: state.run_checked || 0,
    last_changed: state.run_changed || 0,
    last_errors: all,
    run_errors: [],
    next_run_at: new Date(now.getTime() + interval * 3600_000).toISOString()
  };
}

/**
 * Jeden krok synchronizacji.
 * force: przycisk „Synchronizuj teraz” — zaczyna przebieg od razu (gdy żaden nie trwa).
 */
export async function runSyncTick(env, { force = false, fetchImpl = fetch, now = new Date(), slice = SLICE } = {}) {
  const claimed = await claim(env);
  if (!claimed) return { ok: true, busy: true, state: await loadSyncState(env) };
  const state = { ...claimed };
  const patch = {};
  const errors = [];
  let checked = 0;
  let changed = 0;
  let pushed = 0;
  let finished = false;
  try {
    if (!state.running) {
      const due = force || (state.enabled && Date.parse(state.next_run_at) <= now.getTime());
      if (due) {
        Object.assign(patch, {
          running: true,
          cursor: "",
          run_started_at: now.toISOString(),
          last_started_at: now.toISOString(),
          run_checked: 0,
          run_changed: 0,
          run_errors: []
        });
        Object.assign(state, patch);
      }
    }

    if (state.running) {
      const config = baseConfig(env);
      if (!config) {
        errors.push(errorItem("Brak sekretu BASE_API_TOKEN w Cloudflare — synchronizacja nie ruszy."));
        Object.assign(patch, finishPatch(state, errors, now));
        finished = true;
      } else {
        const cursor = /^[0-9a-f-]{36}$/i.test(state.cursor || "") ? state.cursor : ZERO_UUID;
        const products = await supabaseRest(
          env,
          `products?source=in.(base,base_hurtownia)&base_product_id=not.is.null&shopify_product_id=not.is.null&id=gt.${cursor}` +
            `&select=id,name,source,base_inventory_id,base_product_id,price,stock,variants,workflow_status,base_auto_paused&order=id.asc&limit=${slice}`
        ) || [];
        if (products.length) {
          const { fresh, errors: baseErrors } = await fetchFresh(config, products, fetchImpl);
          errors.push(...baseErrors);
          const changes = [];
          for (const product of products) {
            const row = fresh.get(product.id);
            if (!row) continue;
            const diff = diffProduct(product, row);
            if (diff) changes.push(diff.change);
          }
          if (changes.length) {
            await supabaseRest(env, "rpc/base_sync_apply", { method: "POST", body: { p_changes: changes } });
          }
          checked = products.length;
          changed = changes.length;
          state.run_checked = (state.run_checked || 0) + checked;
          state.run_changed = (state.run_changed || 0) + changed;
          patch.cursor = products[products.length - 1].id;
          patch.run_checked = state.run_checked;
          patch.run_changed = state.run_changed;
        }
        if (products.length < slice) {
          Object.assign(patch, finishPatch(state, errors, now));
          finished = true;
        } else {
          patch.run_errors = [...(state.run_errors || []), ...errors].slice(-MAX_ERRORS);
        }
      }
    }

    // Wysyłka do Shopify tego, co zmieniło się w bazie (kolejka shopify_sync_queue), po kilka na krok.
    if (shopifyConfig(env)) {
      const flush = await flushShopifyQueue(env, { limit: PUSH_PER_TICK, fetchImpl });
      pushed = flush.pushed || 0;
      const shopErrors = (flush.errors || []).map((item) => ({ at: now.toISOString(), product_id: item.product_id, text: `Shopify: ${item.error}`.slice(0, 300) }));
      if (shopErrors.length) {
        if (state.running && !finished) patch.run_errors = [...(patch.run_errors || state.run_errors || []), ...shopErrors].slice(-MAX_ERRORS);
        else patch.last_errors = [...(patch.last_errors || state.last_errors || []), ...shopErrors].slice(-MAX_ERRORS);
      }
    }
  } catch (err) {
    // Błąd całego kroku (np. zły token Base) kończy przebieg — następna próba za ustawiony czas.
    errors.push(errorItem(err.message));
    if (state.running) Object.assign(patch, finishPatch(state, errors, now));
    else patch.last_errors = [...(state.last_errors || []), ...errors].slice(-MAX_ERRORS);
    finished = true;
  }
  const saved = await saveState(env, patch);
  return { ok: true, checked, changed, pushed, finished, state: saved || { ...state, ...patch } };
}

/** Pola stanu, które widzi panel. */
export function publicState(state) {
  if (!state) return null;
  const keys = ["enabled", "interval_hours", "next_run_at", "running", "run_started_at", "run_checked", "run_changed", "run_errors",
    "last_started_at", "last_finished_at", "last_checked", "last_changed", "last_errors", "updated_at"];
  return Object.fromEntries(keys.map((key) => [key, state[key] ?? null]));
}
