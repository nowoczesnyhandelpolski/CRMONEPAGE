/* Base → public.products. Serwer: token Base z sekretu, zapis kluczem service role. */
import { supabaseRest } from "./supabase-rest.mjs";
import {
  SOURCE_INVENTORY,
  SOURCE_STORAGE,
  baseCall,
  chunk,
  inventoryInfo,
  listFromResponse,
  productFromInventoryData,
  productFromStorageData,
  storageInfo
} from "./base-core.mjs";

function quoted(values) {
  return `(${values.map((value) => `"${String(value).replace(/["\\]/g, "")}"`).join(",")})`;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function sourceOf(kind) {
  return kind === "storage" ? SOURCE_STORAGE : SOURCE_INVENTORY;
}

/** Katalogi Base i magazyny zewnętrzne (hurtownie, sklepy podpięte w Base). */
export async function loadSources(config, fetchImpl = fetch) {
  const inv = await baseCall(config, "getInventories", {}, fetchImpl);
  let storages = [];
  try {
    const st = await baseCall(config, "getExternalStoragesList", {}, fetchImpl);
    storages = (st.storages || []).map(storageInfo).filter((item) => item.id && item.can_read);
  } catch {
    storages = [];
  }
  return { inventories: (inv.inventories || []).map(inventoryInfo), storages };
}

export async function findInventory(config, inventoryId, fetchImpl = fetch) {
  const data = await baseCall(config, "getInventories", {}, fetchImpl);
  const raw = (data.inventories || []).find((item) => String(item.inventory_id) === String(inventoryId));
  if (!raw) {
    const err = new Error("Nie ma takiego katalogu w Base.");
    err.status = 404;
    throw err;
  }
  return inventoryInfo(raw);
}

/** Które produkty z tej listy są już w Centrali (i w Shopify). */
export async function importedMap(env, kind, sourceId, baseIds) {
  const map = {};
  for (const part of chunk(baseIds, 150)) {
    if (!part.length) continue;
    const rows = await supabaseRest(
      env,
      `products?source=eq.${sourceOf(kind)}&base_inventory_id=eq.${encodeURIComponent(sourceId)}&base_product_id=in.${encodeURIComponent(quoted(part))}` +
        "&select=id,base_product_id,workflow_status,shopify_product_id,shopify_url,shopify_sync_error,base_synced_at&limit=1000"
    ) || [];
    for (const row of rows) map[String(row.base_product_id)] = row;
  }
  return map;
}

/** Podgląd listy z Base (1000 pozycji na stronę po stronie Base). */
export async function listProducts(env, config, { kind, id, page = 1, q = "" }, fetchImpl = fetch) {
  const sourceId = String(id || "").trim();
  if (!sourceId) throw badRequest("Wybierz katalog Base.");
  const pageNo = Math.min(Math.max(Number(page) || 1, 1), 500);
  const name = String(q || "").trim().slice(0, 200);
  let inventory = null;
  let data;
  if (kind === "storage") {
    data = await baseCall(config, "getExternalStorageProductsList", {
      storage_id: sourceId,
      page: pageNo,
      ...(name ? { filter_name: name } : {})
    }, fetchImpl);
  } else {
    inventory = await findInventory(config, sourceId, fetchImpl);
    data = await baseCall(config, "getInventoryProductsList", {
      inventory_id: Number(sourceId),
      page: pageNo,
      filter_sort: "id DESC",
      ...(name ? { filter_name: name } : {})
    }, fetchImpl);
  }
  const products = listFromResponse(data, kind === "storage" ? "storage" : "inventory", inventory);
  const known = await importedMap(env, kind, sourceId, products.map((item) => item.id));
  return {
    ok: true,
    kind: kind === "storage" ? "storage" : "inventory",
    id: sourceId,
    page: pageNo,
    per_page: 1000,
    has_more: products.length >= 1000,
    inventory,
    products: products.map((item) => {
      const row = known[item.id];
      return {
        ...item,
        product_id: row?.id || "",
        workflow_status: row?.workflow_status || "",
        shopify_product_id: row?.shopify_product_id || "",
        shopify_url: row?.shopify_url || "",
        shopify_error: row?.shopify_sync_error || "",
        imported_at: row?.base_synced_at || ""
      };
    })
  };
}

async function nameMaps(config, inventoryId, fetchImpl) {
  const categories = {};
  const manufacturers = {};
  try {
    const cat = await baseCall(config, "getInventoryCategories", { inventory_id: Number(inventoryId) }, fetchImpl);
    for (const item of cat.categories || []) categories[String(item.category_id)] = String(item.name || "").slice(0, 200);
  } catch { /* kategorie są dodatkiem */ }
  try {
    const man = await baseCall(config, "getInventoryManufacturers", {}, fetchImpl);
    for (const item of man.manufacturers || []) manufacturers[String(item.manufacturer_id)] = String(item.name || "").slice(0, 120);
  } catch { /* producenci są dodatkiem */ }
  return { categories, manufacturers };
}

/** Katalog Base ↔ product_catalogs (jeden wiersz na katalog / hurtownię). */
export async function ensureCatalog(env, kind, sourceId, name) {
  const rows = await supabaseRest(env, "product_catalogs?on_conflict=source,external_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      source: "base",
      external_id: `${kind === "storage" ? "storage" : "inventory"}:${sourceId}`,
      name: `Base · ${String(name || sourceId).slice(0, 100)}`,
      note: kind === "storage" ? "Hurtownia / magazyn zewnętrzny w Base" : "Katalog Base",
      updated_at: new Date().toISOString()
    }
  });
  return rows?.[0]?.id || null;
}

/**
 * Pobiera pełne dane wybranych produktów z Base i zapisuje je w public.products.
 * Ponowny import aktualizuje wiersz (klucz: source + base_inventory_id + base_product_id).
 * Status lejka, nazwa katalogowa, karta strony i id Shopify zostają nietknięte.
 */
export async function importProducts(env, config, { kind, id, ids, sourceName = "" }, fetchImpl = fetch) {
  const sourceId = String(id || "").trim();
  if (!sourceId) throw badRequest("Wybierz katalog Base.");
  if (!ids?.length) throw badRequest("Zaznacz produkty.");
  const storage = kind === "storage";
  const now = new Date().toISOString();
  let rows;
  let catalogName = sourceName;
  if (storage) {
    const data = await baseCall(config, "getExternalStorageProductsData", {
      storage_id: sourceId,
      products: ids.map((item) => (/^\d+$/.test(item) ? Number(item) : item))
    }, fetchImpl);
    const catalogId = await ensureCatalog(env, "storage", sourceId, catalogName);
    const products = data.products || {};
    rows = Object.entries(Array.isArray(products) ? Object.fromEntries(products.map((p) => [p.product_id, p])) : products)
      .map(([productId, raw]) => productFromStorageData(productId, raw, { storageId: sourceId, catalogId, now }));
  } else {
    const inventory = await findInventory(config, sourceId, fetchImpl);
    catalogName = inventory.name;
    const data = await baseCall(config, "getInventoryProductsData", {
      inventory_id: Number(sourceId),
      products: ids.map(Number).filter(Number.isFinite)
    }, fetchImpl);
    const maps = await nameMaps(config, sourceId, fetchImpl);
    const catalogId = await ensureCatalog(env, "inventory", sourceId, catalogName);
    rows = Object.entries(data.products || {})
      .filter(([, raw]) => !Number(raw?.parent_id))
      .map(([productId, raw]) => productFromInventoryData(productId, raw, { inventory, catalogId, ...maps, now }));
  }
  if (!rows.length) return { ok: true, saved: 0, products: [], missing: ids };

  const known = await importedMap(env, kind, sourceId, rows.map((row) => row.base_product_id));

  const saved = [];
  for (const part of chunk(rows, 100)) {
    const result = await supabaseRest(
      env,
      "products?on_conflict=source,base_inventory_id,base_product_id&select=id,base_product_id,shopify_product_id,workflow_status",
      { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: part }
    ) || [];
    saved.push(...result);
  }
  const found = new Set(saved.map((row) => String(row.base_product_id)));
  return {
    ok: true,
    saved: saved.length,
    created: saved.filter((row) => !known[String(row.base_product_id)]).length,
    updated: saved.filter((row) => known[String(row.base_product_id)]).length,
    products: saved.map((row) => ({
      base_product_id: String(row.base_product_id),
      product_id: row.id,
      shopify_product_id: row.shopify_product_id || "",
      workflow_status: row.workflow_status || "pobrany"
    })),
    missing: ids.filter((item) => !found.has(String(item)))
  };
}
