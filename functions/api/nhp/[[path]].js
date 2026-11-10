import { CORS, json, readJson } from "../../_util.js";
import { normalizeBatch } from "../../../lib/offer-normalizer.mjs";
import { sha256Hex, supabaseRest } from "../../../lib/supabase-rest.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

async function keyRow(env, request) {
  const raw = request.headers.get("x-nhp-key") || "";
  if (!raw.startsWith("nhp_") || raw.length < 20) return null;
  const hash = await sha256Hex(raw);
  const rows = await supabaseRest(env, `api_keys?key_hash=eq.${hash}&revoked_at=is.null&select=id,label,created_by&limit=1`);
  return rows?.[0] || null;
}

async function catalogId(env) {
  const name = encodeURIComponent("Import z wtyczki");
  const rows = await supabaseRest(env, `product_catalogs?name=eq.${name}&select=id&limit=1`);
  if (rows?.[0]) return rows[0].id;
  const created = await supabaseRest(env, "product_catalogs?select=id", {
    method: "POST",
    prefer: "return=representation",
    body: { name: "Import z wtyczki", source: "extension" }
  });
  return created?.[0]?.id || null;
}

function enc(v) { return encodeURIComponent(v); }

async function findProduct(env, item) {
  if (item.ean) {
    const rows = await supabaseRest(env, `products?ean=eq.${enc(item.ean)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (item.source_link) {
    const rows = await supabaseRest(env, `products?source_link=eq.${enc(item.source_link)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function findAuction(env, item) {
  if (item.source_offer_id) {
    const rows = await supabaseRest(env, `auctions?source_offer_id=eq.${enc(item.source_offer_id)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (item.source_link) {
    const rows = await supabaseRest(env, `auctions?source_link=eq.${enc(item.source_link)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

function productPatch(existing, item, catalog) {
  const now = new Date().toISOString();
  const row = {
    catalog_id: existing?.catalog_id || catalog,
    sku: existing?.sku || item.ean || null,
    ean: existing?.ean || item.ean || null,
    name: existing?.name || item.catalog_name || "Bez nazwy",
    catalog_name: existing?.catalog_name || item.catalog_name || null,
    producer: item.producer || existing?.producer || null,
    brand: item.producer || existing?.brand || null,
    category_id: item.category_id || existing?.category_id || null,
    category: item.category || existing?.category || null,
    currency: "PLN",
    shipping_time: item.shipping_time || existing?.shipping_time || null,
    images: item.images?.length ? item.images : existing?.images || [],
    description_sections: item.description_sections?.length ? item.description_sections : existing?.description_sections || [],
    description: (item.description_sections || []).filter((s) => s.type === "text").map((s) => s.text).join("\n\n") || existing?.description || null,
    params: item.parameters?.length ? item.parameters : existing?.params || [],
    source_link: item.source_link || existing?.source_link || null,
    allegro_product_id: item.allegro_product_id || existing?.allegro_product_id || null,
    status: item.price == null && existing?.price == null ? "flagged" : (existing?.status || "active"),
    updated_at: now
  };
  if (item.price != null) row.price = item.price;
  else if (existing?.price != null) row.price = existing.price;
  if (item.price_before_promo != null) row.price_before_promo = item.price_before_promo;
  if (item.delivery_cost != null) row.delivery_cost = item.delivery_cost;
  if (item.base_price != null) row.base_price = item.base_price;
  return row;
}

async function saveExport(request, env) {
  const key = await keyRow(env, request);
  if (!key) return json({ ok: false, error: "Nieprawidłowy klucz API." }, 401, CORS);
  const body = await readJson(request, 1_500_000);
  const batch = normalizeBatch(body);
  const now = new Date().toISOString();
  const batchId = batch.batch_id || `imp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await supabaseRest(env, "offer_import_batches?on_conflict=id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { id: batchId, name: batch.name || "Import z wtyczki", account_login: batch.account_login || null, created_by: key.created_by, updated_at: now }
  });
  await supabaseRest(env, `api_keys?id=eq.${key.id}`, { method: "PATCH", prefer: "return=minimal", body: { last_used_at: now } });
  const catalog = await catalogId(env);
  let flagged = 0;
  let saved = 0;
  for (const row of batch.items) {
    const item = row.item;
    if (row.flagged) flagged++;
    const existingProduct = await findProduct(env, item);
    const productBody = productPatch(existingProduct, item, catalog);
    let productId = existingProduct?.id;
    if (productId) {
      await supabaseRest(env, `products?id=eq.${productId}`, { method: "PATCH", prefer: "return=minimal", body: productBody });
    } else {
      const created = await supabaseRest(env, "products?select=id", { method: "POST", prefer: "return=representation", body: productBody });
      productId = created?.[0]?.id;
    }
    const existingAuction = await findAuction(env, item);
    const auctionBody = {
      ...productBody,
      source_offer_id: item.source_offer_id || existingAuction?.source_offer_id || null,
      origin: "import",
      product_id: productId,
      missing: item.missing,
      status: row.status,
      catalog_id: undefined
    };
    delete auctionBody.catalog_id;
    delete auctionBody.sku;
    let auctionId = existingAuction?.id;
    if (auctionId) {
      await supabaseRest(env, `auctions?id=eq.${auctionId}`, { method: "PATCH", prefer: "return=minimal", body: auctionBody });
    } else {
      const created = await supabaseRest(env, "auctions?select=id", { method: "POST", prefer: "return=representation", body: auctionBody });
      auctionId = created?.[0]?.id;
    }
    if (productId && auctionId) {
      await supabaseRest(env, "product_offer_links?on_conflict=auction_id,product_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { auction_id: auctionId, product_id: productId }
      });
    }
    await supabaseRest(env, "offer_import_items", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        batch_id: batchId,
        pos: row.pos,
        source_offer_id: item.source_offer_id || null,
        ean: item.ean || null,
        status: row.status,
        missing: item.missing,
        data: item,
        product_id: productId,
        auction_id: auctionId,
        updated_at: now
      }
    });
    saved++;
  }
  return json({ ok: true, batch_id: batchId, saved, flagged, total_items: batch.items.length, url: "/#import-wtyczki" }, 200, CORS);
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const path = parts(context);
    if (context.request.method === "GET" && path[0] === "ping") {
      const key = await keyRow(context.env, context.request);
      if (!key) return json({ ok: false, error: "Nieprawidłowy klucz API." }, 401, CORS);
      await supabaseRest(context.env, `api_keys?id=eq.${key.id}`, { method: "PATCH", prefer: "return=minimal", body: { last_used_at: new Date().toISOString() } });
      return json({ ok: true, label: key.label }, 200, CORS);
    }
    if (context.request.method === "POST" && path[0] === "offer-export") return await saveExport(context.request, context.env);
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    const status = err.status || 500;
    console.log(JSON.stringify({ msg: "nhp_error", status, error: String(err.message || err).slice(0, 240) }));
    return json({ ok: false, error: status >= 500 ? "Nie udało się zapisać szkicu." : err.message }, status >= 500 ? 500 : status, CORS);
  }
}
