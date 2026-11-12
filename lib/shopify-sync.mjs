import { supabaseRest } from "./supabase-rest.mjs";
import { shouldAutoPush } from "./workflow.mjs";
import {
  PRODUCT_SET_MUTATION,
  WEBHOOK_TOPICS,
  buildProductSetInput,
  deletedProductPatch,
  fromGraphqlOrder,
  inboundProductPatch,
  matchProductId,
  normalizeShopifyOrder,
  numericId,
  paidEnough,
  productUrl,
  shopifyConfig,
  variantMapFromShopify
} from "./shopify-core.mjs";
import { issueKsefForOrder } from "./ksef-issue.mjs";

const ORDERS_QUERY = `query NhpOrders {
  orders(first: 40, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      name
      email
      displayFinancialStatus
      taxesIncluded
      createdAt
      totalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount } }
      billingAddress { name firstName lastName address1 city zip countryCodeV2 company }
      customAttributes { key value }
      lineItems(first: 40) {
        nodes {
          id
          sku
          title
          quantity
          originalUnitPriceSet { shopMoney { amount } }
          discountedTotalSet { shopMoney { amount } }
          product { id }
        }
      }
    }
  }
}`;

const WEBHOOK_MUTATION = `mutation NhpWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

function quoted(values) {
  return `(${values.map((value) => `"${String(value).replace(/"/g, "")}"`).join(",")})`;
}

export async function shopifyGraphql(config, query, variables, fetchImpl = fetch) {
  const res = await fetchImpl(`https://${config.domain}/admin/api/${config.version}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-shopify-access-token": config.token
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors?.length) {
    const err = new Error(data.errors?.[0]?.message || `Shopify HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }
  return data.data;
}

const LOCATION_QUERY = `query NhpLocation { location { id } }`;

/** Stan do Shopify wysyłamy dla produktów z Base, które mają liczbę sztuk. */
export function wantsInventory(product) {
  if (!String(product?.source || "").startsWith("base")) return false;
  if (product?.stock != null && product.stock !== "") return true;
  return Array.isArray(product?.variants) && product.variants.some((v) => v?.stock != null && v.stock !== "");
}

/** Główna lokalizacja sklepu (albo SHOPIFY_LOCATION_ID). Wynik zostaje w configu na czas jednego żądania. */
export async function shopifyLocationId(config, fetchImpl = fetch) {
  if (config.locationId) return config.locationId;
  const data = await shopifyGraphql(config, LOCATION_QUERY, {}, fetchImpl);
  const id = data?.location?.id || "";
  if (!id) throw new Error("Brak lokalizacji w Shopify.");
  config.locationId = id;
  return id;
}

async function loadPage(env, productId) {
  const pages = await supabaseRest(
    env,
    `pages?product_id=eq.${encodeURIComponent(productId)}&select=id,slug,name,status,product_id,data,updated_at&order=updated_at.desc&limit=5`
  );
  return (pages || []).find((page) => page.status === "published") || pages?.[0] || null;
}

export async function pushProductToShopify(env, productId, { force = false, fetchImpl = fetch } = {}) {
  const config = shopifyConfig(env);
  if (!config) {
    const err = new Error("Shopify nie jest skonfigurowany. Ustaw sekrety SHOPIFY_STORE_DOMAIN i SHOPIFY_ADMIN_TOKEN.");
    err.status = 409;
    throw err;
  }
  const rows = await supabaseRest(env, `products?id=eq.${encodeURIComponent(productId)}&select=*&limit=1`);
  const product = rows?.[0];
  if (!product) {
    const err = new Error("Nie ma takiego produktu.");
    err.status = 404;
    throw err;
  }
  if (!force && !shouldAutoPush(product)) return { ok: true, skipped: true, product_id: productId };
  const page = await loadPage(env, productId);
  let inventoryNote = "";
  let locationId = "";
  if (wantsInventory(product)) {
    try { locationId = await shopifyLocationId(config, fetchImpl); }
    catch { inventoryNote = "Stan magazynowy nie poszedł do Shopify: aplikacja nie ma zakresu read_locations (albo ustaw SHOPIFY_LOCATION_ID)."; }
  }
  const input = buildProductSetInput(product, page, { locationId });
  if (!input.variants?.[0]?.price) {
    const err = new Error("Brak ceny — nie wysyłam produktu do Shopify.");
    err.status = 422;
    throw err;
  }
  // Brak zakresu write_inventory to błąd całego zapytania (nie userErrors) — wtedy też próbujemy bez stanu.
  const send = async (payload) => {
    try {
      const result = await shopifyGraphql(config, PRODUCT_SET_MUTATION, { input: payload, synchronous: true }, fetchImpl);
      return [result, result?.productSet?.userErrors || []];
    } catch (err) {
      if (payload.variants.some((variant) => variant.inventoryQuantities)) return [null, [{ message: err.message }]];
      throw err;
    }
  };
  let attempt = input;
  let [data, errors] = await send(attempt);
  if (errors.length && attempt.variants.some((variant) => variant.id)) {
    // Wariant mógł zostać usunięty w Shopify — wysyłamy bez id wariantów.
    attempt = structuredClone(attempt);
    attempt.variants.forEach((variant) => { delete variant.id; });
    [data, errors] = await send(attempt);
  }
  if (errors.length && attempt.variants.some((variant) => variant.inventoryQuantities)) {
    // Brak zakresu write_inventory albo wariant nie jest w tej lokalizacji — produkt idzie bez stanu.
    const reason = errors.map((item) => item.message).filter(Boolean).join(" ").slice(0, 160);
    attempt = structuredClone(attempt);
    attempt.variants.forEach((variant) => { delete variant.inventoryQuantities; delete variant.inventoryItem; });
    [data, errors] = await send(attempt);
    if (!errors.length) inventoryNote = `Produkt wysłany bez stanu magazynowego (${reason || "Shopify odrzucił stan"}).`;
  }
  if (errors.length) {
    const err = new Error(errors.map((item) => item.message).filter(Boolean).join(" ") || "Shopify odrzucił produkt.");
    err.status = 422;
    throw err;
  }
  const node = data?.productSet?.product;
  if (!node?.id) {
    const err = new Error("Shopify nie oddał produktu.");
    err.status = 502;
    throw err;
  }
  const variant = node.variants?.nodes?.[0];
  const patch = {
    shopify_product_id: numericId(node.id),
    shopify_variant_id: numericId(variant?.id),
    shopify_handle: node.handle || "",
    shopify_url: node.onlineStoreUrl || productUrl(config.domain, node.handle),
    shopify_status: String(node.status || "").toLowerCase(),
    shopify_synced_at: new Date().toISOString(),
    shopify_sync_error: inventoryNote || null,
    updated_at: new Date().toISOString()
  };
  if (Array.isArray(product.variants) && product.variants.length) {
    patch.shopify_variant_map = variantMapFromShopify(product, node.variants?.nodes || []);
  }
  await supabaseRest(env, `products?id=eq.${encodeURIComponent(productId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: patch
  });
  return { ok: true, skipped: false, product_id: productId, warning: inventoryNote, ...patch };
}

async function markQueue(env, productId, { done, error }) {
  await supabaseRest(env, `shopify_sync_queue?product_id=eq.${encodeURIComponent(productId)}&done_at=is.null`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { done_at: done ? new Date().toISOString() : null, error: error ? String(error).slice(0, 300) : null }
  });
}

export async function flushShopifyQueue(env, { productIds, limit = 20, fetchImpl = fetch } = {}) {
  if (!shopifyConfig(env)) return { ok: true, configured: false, pushed: 0, skipped: 0, errors: [] };
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 40);
  let path = `shopify_sync_queue?done_at=is.null&select=product_id&order=created_at.asc&limit=${cap}`;
  if (productIds?.length) path += `&product_id=in.${quoted(productIds)}`;
  const rows = await supabaseRest(env, path) || [];
  const ids = [...new Set(rows.map((row) => row.product_id).filter(Boolean))];
  let pushed = 0;
  let skipped = 0;
  const errors = [];
  for (const id of ids) {
    try {
      const result = await pushProductToShopify(env, id, { fetchImpl });
      if (result.skipped) skipped += 1;
      else pushed += 1;
      await markQueue(env, id, { done: true, error: result.skipped ? "pominięto — produkt nie jest jeszcze do sklepu" : "" });
    } catch (err) {
      const message = String(err.message || "Błąd Shopify").slice(0, 300);
      errors.push({ product_id: id, error: message });
      await supabaseRest(env, `products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { shopify_sync_error: message, updated_at: new Date().toISOString() }
      }).catch(() => {});
      const permanent = err.status === 422 || err.status === 404 || err.status === 409;
      await markQueue(env, id, { done: permanent, error: message }).catch(() => {});
    }
  }
  return { ok: true, configured: true, pushed, skipped, errors };
}

export async function registerShopifyWebhooks(env, origin, fetchImpl = fetch) {
  const config = shopifyConfig(env);
  if (!config) {
    const err = new Error("Shopify nie jest skonfigurowany. Ustaw sekrety SHOPIFY_STORE_DOMAIN i SHOPIFY_ADMIN_TOKEN.");
    err.status = 409;
    throw err;
  }
  if (!config.webhookSecret) {
    const err = new Error("Ustaw sekret SHOPIFY_WEBHOOK_SECRET. Bez niego webhooki nie zostaną przyjęte.");
    err.status = 409;
    throw err;
  }
  const callbackUrl = `${String(origin || "").replace(/\/$/, "")}/api/shopify/webhook`;
  const topics = [];
  for (const topic of WEBHOOK_TOPICS) {
    const data = await shopifyGraphql(config, WEBHOOK_MUTATION, {
      topic,
      webhookSubscription: { callbackUrl, format: "JSON" }
    }, fetchImpl);
    const errors = data?.webhookSubscriptionCreate?.userErrors || [];
    const duplicate = errors.some((item) => /already been taken|address.*taken/i.test(item.message || ""));
    if (errors.length && !duplicate) {
      topics.push({ topic, ok: false, error: errors.map((item) => item.message).join(" ") });
    } else {
      topics.push({ topic, ok: true, duplicate });
    }
  }
  return { ok: topics.every((item) => item.ok), callbackUrl, topics };
}

async function productsForLines(env, lines) {
  const shopifyIds = [...new Set(lines.map((line) => line.shopify_product_id).filter(Boolean))];
  const skus = [...new Set(lines.map((line) => line.sku).filter(Boolean))];
  const found = [];
  if (shopifyIds.length) found.push(...(await supabaseRest(env, `products?shopify_product_id=in.${quoted(shopifyIds)}&select=id,sku,ean,shopify_product_id&limit=200`) || []));
  if (skus.length) {
    found.push(...(await supabaseRest(env, `products?sku=in.${quoted(skus)}&select=id,sku,ean,shopify_product_id&limit=200`) || []));
    found.push(...(await supabaseRest(env, `products?ean=in.${quoted(skus)}&select=id,sku,ean,shopify_product_id&limit=200`) || []));
  }
  return [...new Map(found.map((product) => [product.id, product])).values()];
}

export async function saveShopifyOrder(env, payload, { topic = "", fetchImpl = fetch } = {}) {
  const normalized = normalizeShopifyOrder(payload);
  if (!normalized) return { ok: false, skipped: true };
  if (topic === "orders/cancelled" && !["refunded", "partially_refunded"].includes(normalized.financial_status)) {
    normalized.financial_status = "cancelled";
  }
  const saved = await supabaseRest(env, "shopify_orders?on_conflict=shopify_order_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      shopify_order_id: normalized.shopify_order_id,
      order_number: normalized.order_number,
      email: normalized.email,
      financial_status: normalized.financial_status,
      currency: normalized.currency,
      total: normalized.total,
      taxes_included: normalized.taxes_included,
      customer_name: normalized.customer_name,
      billing: normalized.billing,
      raw: { topic, line_count: normalized.lines.length },
      placed_at: normalized.placed_at,
      updated_at: new Date().toISOString()
    }
  });
  const order = saved?.[0];
  if (!order?.id) return { ok: false, skipped: true };
  const products = await productsForLines(env, normalized.lines);
  await supabaseRest(env, `shopify_order_lines?order_id=eq.${encodeURIComponent(order.id)}`, {
    method: "DELETE",
    prefer: "return=minimal"
  });
  if (normalized.lines.length) {
    await supabaseRest(env, "shopify_order_lines", {
      method: "POST",
      prefer: "return=minimal",
      body: normalized.lines.map((line) => ({
        order_id: order.id,
        shopify_line_id: line.shopify_line_id,
        product_id: matchProductId(line, products),
        shopify_product_id: line.shopify_product_id || null,
        sku: line.sku,
        title: line.title,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: line.line_total
      }))
    });
  }
  let invoice = null;
  if (paidEnough(normalized.financial_status)) {
    try { invoice = await issueKsefForOrder(env, normalized.shopify_order_id, { fetchImpl }); }
    catch (err) {
      console.log(JSON.stringify({ msg: "ksef_auto_error", order: normalized.shopify_order_id, error: String(err.message || err).slice(0, 200) }));
    }
  }
  return { ok: true, shopify_order_id: normalized.shopify_order_id, financial_status: normalized.financial_status, invoice_status: invoice?.status || "" };
}

export async function pullShopifyOrders(env, fetchImpl = fetch) {
  const config = shopifyConfig(env);
  if (!config) {
    const err = new Error("Shopify nie jest skonfigurowany. Ustaw sekrety SHOPIFY_STORE_DOMAIN i SHOPIFY_ADMIN_TOKEN.");
    err.status = 409;
    throw err;
  }
  const data = await shopifyGraphql(config, ORDERS_QUERY, {}, fetchImpl);
  const nodes = data?.orders?.nodes || [];
  let saved = 0;
  for (const node of nodes) {
    const order = fromGraphqlOrder(node);
    if (!order) continue;
    await saveShopifyOrder(env, {
      id: order.shopify_order_id,
      name: order.order_number,
      email: order.email,
      financial_status: order.financial_status,
      currency: order.currency,
      total_price: order.total,
      taxes_included: order.taxes_included,
      created_at: order.placed_at,
      billing_address: order.billing,
      note_attributes: order.billing.nip ? [{ name: "nip", value: order.billing.nip }] : [],
      line_items: order.lines.filter((line) => line.shopify_line_id !== "shipping").map((line) => ({
        id: line.shopify_line_id,
        product_id: line.shopify_product_id,
        sku: line.sku,
        title: line.title,
        quantity: line.quantity,
        price: line.unit_price,
        discounted_total: line.line_total
      })),
      total_shipping_price_set: { shop_money: { amount: order.lines.find((line) => line.shopify_line_id === "shipping")?.line_total || 0 } }
    }, { topic: "pull", fetchImpl });
    saved += 1;
  }
  await supabaseRest(env, "shopify_state?id=eq.1", {
    method: "PATCH",
    prefer: "return=minimal",
    body: { last_orders_pull: new Date().toISOString(), last_error: null }
  }).catch(() => {});
  return { ok: true, saved };
}

export async function processShopifyWebhook(env, { topic, payload, fetchImpl = fetch }) {
  const config = shopifyConfig(env);
  const domain = config?.domain || "";
  if (topic === "products/update" || topic === "products/delete") {
    const shopifyId = numericId(payload?.id);
    if (!shopifyId) return { ok: true, ignored: true };
    const rows = await supabaseRest(env, `products?shopify_product_id=eq.${encodeURIComponent(shopifyId)}&select=id,workflow_status&limit=1`);
    const product = rows?.[0];
    if (!product) return { ok: true, ignored: true };
    const patch = topic === "products/delete"
      ? deletedProductPatch()
      : inboundProductPatch(payload, product.workflow_status, domain);
    await supabaseRest(env, "rpc/apply_shopify_inbound", {
      method: "POST",
      prefer: "return=minimal",
      body: { p_product_id: product.id, p_patch: patch }
    });
    return { ok: true, product_id: product.id };
  }
  if (String(topic || "").startsWith("orders/")) {
    return saveShopifyOrder(env, payload, { topic, fetchImpl });
  }
  return { ok: true, ignored: true };
}
