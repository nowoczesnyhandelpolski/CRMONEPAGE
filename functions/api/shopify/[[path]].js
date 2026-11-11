import { json, originOf } from "../../_util.js";
import { sha256Hex, supabaseRest, teamUser } from "../../../lib/supabase-rest.mjs";
import {
  SHOPIFY_WEBHOOK_TOPICS,
  buildShopifyProduct,
  fingerprintFromRemote,
  lineMatchesProduct,
  normalizeShopDomain,
  normalizeShopifyOrder,
  planShopifyDelete,
  planShopifyInbound,
  productPublicUrl,
  shopifyApiVersion,
  shopifyConfigured,
  shopifyErrorText,
  statsFromOrders,
  verifyShopifyHmac
} from "../../../lib/shopify.mjs";
import { autoInvoicePaidOrder } from "../../../lib/ksef-issue.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

async function requireTeam(request, env) {
  const user = await teamUser(request, env);
  if (!user) {
    const err = new Error("Zaloguj się na konto zespołu.");
    err.status = 401;
    throw err;
  }
  return user;
}

async function shopifyCall(env, path, { method = "GET", body } = {}) {
  const domain = normalizeShopDomain(env.SHOPIFY_STORE_DOMAIN);
  const token = String(env.SHOPIFY_ADMIN_TOKEN || "").trim();
  if (!domain || !token) {
    const err = new Error("Brak SHOPIFY_STORE_DOMAIN albo SHOPIFY_ADMIN_TOKEN.");
    err.status = 500;
    throw err;
  }
  const version = shopifyApiVersion(env);
  const res = await fetch(`https://${domain}/admin/api/${version}/${path}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": token,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { errors: text.slice(0, 180) }; }
  if (!res.ok) {
    const err = new Error(shopifyErrorText(data, res.status));
    err.status = 502;
    throw err;
  }
  return { data, headers: res.headers };
}

async function loadShop(env) {
  const { data } = await shopifyCall(env, "shop.json");
  return data?.shop || {};
}

function shopifyIdList(ids) {
  return [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 20);
}

async function patchProduct(env, id, body) {
  await supabaseRest(env, `products?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body
  });
}

async function writeHistory(env, productId, history) {
  if (!history) return;
  await supabaseRest(env, "product_status_history", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      product_id: productId,
      from_status: history.from,
      to_status: history.to,
      note: history.note || "",
      source: history.source || "shopify"
    }
  });
}

async function logEvent(env, topic, shopifyId, webhookId) {
  try {
    await supabaseRest(env, "shopify_events", {
      method: "POST",
      prefer: "return=minimal",
      body: { topic, shopify_id: shopifyId ? String(shopifyId) : null, webhook_id: webhookId || null }
    });
  } catch (err) {
    if (!/duplicate|23505/i.test(String(err.detail || err.message || ""))) throw err;
  }
}

async function catalog(env) {
  return (await supabaseRest(env, "products?select=id,sku,ean,shopify_product_id,shopify_variant_id&limit=1000")) || [];
}

async function recomputeStats(env, productIds) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return;
  const orders = (await supabaseRest(env, "shopify_orders?select=financial_status,cancelled_at,currency,line_items&order=created_at.desc&limit=1000")) || [];
  const rows = (await supabaseRest(env, `products?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,sku,ean,shopify_product_id,shopify_variant_id`)) || [];
  for (const product of rows) {
    const stats = statsFromOrders(orders, product);
    await supabaseRest(env, "rpc/apply_order_stats", {
      method: "POST",
      body: {
        p_product: product.id,
        p_orders: stats.orders_count,
        p_units: stats.units_sold,
        p_revenue: stats.revenue,
        p_currency: stats.currency
      }
    });
  }
}

async function upsertOrder(env, remote) {
  const row = normalizeShopifyOrder(remote);
  if (!row.shopify_order_id) return null;
  const saved = await supabaseRest(env, "shopify_orders?on_conflict=shopify_order_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: { ...row, updated_at: new Date().toISOString() }
  });
  const order = saved?.[0] || row;
  const products = await catalog(env);
  const matched = products.filter((product) => (order.line_items || []).some((line) => lineMatchesProduct(line, product))).map((product) => product.id);
  await recomputeStats(env, matched);
  return order;
}

async function onProductUpdate(env, remote, publicDomain) {
  const id = remote?.id;
  if (id == null) return;
  const rows = await supabaseRest(env, `products?shopify_product_id=eq.${encodeURIComponent(String(id))}&select=*&limit=1`);
  const local = rows?.[0];
  if (!local) return;
  const remoteHash = await sha256Hex(fingerprintFromRemote(remote));
  const plan = planShopifyInbound({
    local,
    remote,
    remoteHash,
    nowIso: new Date().toISOString(),
    publicDomain
  });
  await patchProduct(env, local.id, plan.patch);
  await writeHistory(env, local.id, plan.history);
}

async function onProductDelete(env, remote) {
  const id = remote?.id;
  if (id == null) return;
  const rows = await supabaseRest(env, `products?shopify_product_id=eq.${encodeURIComponent(String(id))}&select=id,workflow_status&limit=1`);
  const local = rows?.[0];
  if (!local) return;
  const plan = planShopifyDelete(local);
  await patchProduct(env, local.id, { ...plan.patch, updated_at: new Date().toISOString() });
  await writeHistory(env, local.id, plan.history);
}

async function handleWebhook(context) {
  const secret = String(context.env.SHOPIFY_WEBHOOK_SECRET || "");
  if (!secret) return json({ ok: false, error: "Brak SHOPIFY_WEBHOOK_SECRET." }, 401);
  const raw = await context.request.text();
  if (raw.length > 1_000_000) return json({ ok: false, error: "Za duży webhook." }, 413);
  const ok = await verifyShopifyHmac(raw, context.request.headers.get("x-shopify-hmac-sha256"), secret);
  if (!ok) return json({ ok: false, error: "Zły podpis webhooka." }, 401);
  const expected = normalizeShopDomain(context.env.SHOPIFY_STORE_DOMAIN);
  const shop = String(context.request.headers.get("x-shopify-shop-domain") || "").toLowerCase();
  if (expected && shop && shop !== expected) return json({ ok: false, error: "Webhook z innego sklepu." }, 401);
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ ok: false, error: "Zły JSON." }, 400); }
  const topic = String(context.request.headers.get("x-shopify-topic") || "");
  const webhookId = context.request.headers.get("x-shopify-webhook-id") || "";
  const publicDomain = shop || expected;
  if (topic === "products/update") await onProductUpdate(context.env, body, publicDomain);
  else if (topic === "products/delete") await onProductDelete(context.env, body);
  else if (topic.startsWith("orders/")) {
    const order = await upsertOrder(context.env, body);
    if (order && (topic === "orders/paid" || order.financial_status === "paid")) {
      const task = autoInvoicePaidOrder(context.env, order).catch((err) => {
        console.log(JSON.stringify({ msg: "ksef_auto_error", error: String(err.message || err).slice(0, 300) }));
      });
      if (context.waitUntil) context.waitUntil(task);
      else await task;
    }
  }
  await logEvent(context.env, topic || "unknown", body.id, webhookId);
  console.log(JSON.stringify({ msg: "shopify_webhook", topic, id: body.id || null }));
  return json({ ok: true });
}

async function pushOne(env, product, { create, force, origin, shopDomain }) {
  const pages = (await supabaseRest(
    env,
    `pages?product_id=eq.${encodeURIComponent(product.id)}&select=id,slug,name,status,data,updated_at&order=updated_at.desc&limit=5`
  )) || [];
  const page = pages.find((row) => row.status === "published") || pages[0] || null;
  if (product.price == null || product.price === "") {
    return { id: product.id, error: `${product.catalog_name || product.name}: brak ceny — nie wysyłam do Shopify.` };
  }
  const includeImages = force || !product.shopify_product_id;
  const built = buildShopifyProduct(product, page, { origin, includeImages });
  if (!built.product.title) return { id: product.id, error: "Brak nazwy produktu." };
  const hash = await sha256Hex(built.fingerprint);
  if (!create && !product.shopify_product_id) return { id: product.id, skipped: true };
  if (product.shopify_product_id && !force && product.shopify_payload_hash === hash) {
    await patchProduct(env, product.id, { shopify_dirty: false, shopify_synced_at: new Date().toISOString(), shopify_sync_error: "" });
    return { id: product.id, shopify_product_id: product.shopify_product_id, url: product.shopify_url || "", unchanged: true };
  }
  const body = { product: built.product };
  let remote = null;
  try {
    if (product.shopify_product_id) {
      const res = await shopifyCall(env, `products/${encodeURIComponent(product.shopify_product_id)}.json`, { method: "PUT", body });
      remote = res.data?.product;
    } else {
      const res = await shopifyCall(env, "products.json", { method: "POST", body });
      remote = res.data?.product;
    }
  } catch (err) {
    if (product.shopify_product_id && /not found|404/i.test(err.message || "")) {
      const res = await shopifyCall(env, "products.json", { method: "POST", body });
      remote = res.data?.product;
    } else {
      await patchProduct(env, product.id, { shopify_sync_error: String(err.message || err).slice(0, 300), shopify_dirty: true });
      return { id: product.id, error: err.message };
    }
  }
  const variant = remote?.variants?.[0] || {};
  const handle = remote?.handle || "";
  await patchProduct(env, product.id, {
    shopify_product_id: remote?.id != null ? String(remote.id) : product.shopify_product_id,
    shopify_variant_id: variant.id != null ? String(variant.id) : product.shopify_variant_id,
    shopify_handle: handle || null,
    shopify_url: productPublicUrl(shopDomain, handle) || product.shopify_url,
    shopify_status: remote?.status || built.product.status,
    shopify_payload_hash: hash,
    shopify_synced_at: new Date().toISOString(),
    shopify_dirty: false,
    shopify_sync_error: "",
    updated_at: new Date().toISOString()
  });
  return {
    id: product.id,
    shopify_product_id: remote?.id != null ? String(remote.id) : product.shopify_product_id,
    url: productPublicUrl(shopDomain, handle)
  };
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" } });
  const path = parts(context);
  try {
    if (context.request.method === "POST" && path[0] === "webhook") return await handleWebhook(context);
    await requireTeam(context.request, context.env);
    if (context.request.method === "GET" && (path[0] === "status" || !path[0])) {
      if (!shopifyConfigured(context.env)) return json({ ok: true, configured: false, shop: null, domain: null });
      try {
        const shop = await loadShop(context.env);
        return json({
          ok: true,
          configured: true,
          shop: shop.name || null,
          domain: shop.domain || shop.myshopify_domain || normalizeShopDomain(context.env.SHOPIFY_STORE_DOMAIN),
          version: shopifyApiVersion(context.env)
        });
      } catch (err) {
        return json({ ok: true, configured: true, shop: null, domain: normalizeShopDomain(context.env.SHOPIFY_STORE_DOMAIN), error: err.message });
      }
    }
    if (context.request.method === "POST" && path[0] === "push") {
      const body = await context.request.json();
      const ids = shopifyIdList(body.product_ids);
      if (!ids.length) return json({ ok: false, error: "Wybierz produkt." }, 400);
      if (!shopifyConfigured(context.env)) return json({ ok: false, error: "Brak sekretów Shopify." }, 500);
      const shop = await loadShop(context.env);
      const shopDomain = shop.domain || shop.myshopify_domain || normalizeShopDomain(context.env.SHOPIFY_STORE_DOMAIN);
      const origin = originOf(context.request, context.env);
      const rows = (await supabaseRest(context.env, `products?id=in.(${ids.map(encodeURIComponent).join(",")})&select=*`)) || [];
      const pushed = [];
      const errors = [];
      const skipped = [];
      for (const id of ids) {
        const product = rows.find((row) => row.id === id);
        if (!product) { errors.push("Nie ma takiego produktu."); continue; }
        const result = await pushOne(context.env, product, {
          create: body.create === true,
          force: body.force === true,
          origin,
          shopDomain
        });
        if (result.error) errors.push(result.error);
        else if (result.skipped) skipped.push(id);
        else pushed.push(result);
      }
      return json({ ok: errors.length === 0, pushed, skipped, errors });
    }
    if (context.request.method === "POST" && path[0] === "pull") {
      if (!shopifyConfigured(context.env)) return json({ ok: false, error: "Brak sekretów Shopify." }, 500);
      const since = new Date(Date.now() - 90 * 864e5).toISOString();
      let next = `orders.json?status=any&limit=100&created_at_min=${encodeURIComponent(since)}`;
      let pages = 0;
      let count = 0;
      while (next && pages < 4) {
        const { data, headers } = await shopifyCall(context.env, next);
        for (const order of data?.orders || []) {
          await upsertOrder(context.env, order);
          count += 1;
        }
        const link = headers.get("link") || "";
        const match = /<([^>]+)>;\s*rel="next"/.exec(link);
        next = match ? match[1].replace(/^https:\/\/[^/]+\/admin\/api\/[^/]+\//, "") : "";
        pages += 1;
      }
      return json({ ok: true, orders: count });
    }
    if (context.request.method === "POST" && path[0] === "register-webhooks") {
      if (!shopifyConfigured(context.env)) return json({ ok: false, error: "Brak sekretów Shopify." }, 500);
      const address = `${originOf(context.request, context.env)}/api/shopify/webhook`;
      const existing = await shopifyCall(context.env, "webhooks.json?limit=250");
      const have = new Set((existing.data?.webhooks || []).filter((hook) => hook.address === address).map((hook) => hook.topic));
      const created = [];
      for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
        if (have.has(topic)) continue;
        await shopifyCall(context.env, "webhooks.json", {
          method: "POST",
          body: { webhook: { topic, address, format: "json" } }
        });
        created.push(topic);
      }
      return json({ ok: true, address, created, existing: [...have] });
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404);
  } catch (err) {
    const status = err.status || 500;
    console.log(JSON.stringify({ msg: "shopify_error", status, error: String(err.message || err).slice(0, 300) }));
    return json({ ok: false, error: String(err.message || "Błąd Shopify.").slice(0, 300) }, status >= 400 && status < 600 ? status : 500);
  }
}
