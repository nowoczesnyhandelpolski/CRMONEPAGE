import { CORS, json, originOf, readJson } from "../../_util.js";
import { teamUser, supabaseRest } from "../../../lib/supabase-rest.mjs";
import { shopifyConfig, timingSafeEqual, verifyShopifyHmac } from "../../../lib/shopify-core.mjs";
import {
  flushShopifyQueue,
  processShopifyWebhook,
  pullShopifyOrders,
  pushProductToShopify,
  registerShopifyWebhooks
} from "../../../lib/shopify-sync.mjs";

function parts(context) {
  const path = context.params?.path;
  if (Array.isArray(path)) return path.filter(Boolean);
  return String(path || "").split("/").filter(Boolean);
}

async function allow(request, env) {
  const secret = String(env?.NHP_SYNC_SECRET || "");
  const header = request.headers.get("x-nhp-sync") || "";
  if (secret && header && timingSafeEqual(header, secret)) return { sync: true };
  const user = await teamUser(request, env);
  if (!user) {
    const err = new Error("Zaloguj się na konto zespołu.");
    err.status = 401;
    throw err;
  }
  return user;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const path = parts(context);
  try {
    if (request.method === "POST" && path[0] === "webhook") {
      const raw = await request.text();
      if (raw.length > 1_000_000) return json({ ok: false, error: "Za duży webhook." }, 413);
      const secret = String(env.SHOPIFY_WEBHOOK_SECRET || "");
      const signature = request.headers.get("x-shopify-hmac-sha256") || "";
      if (!secret || !(await verifyShopifyHmac(raw, signature, secret))) {
        return json({ ok: false, error: "Zły podpis webhooka." }, 401);
      }
      const topic = request.headers.get("x-shopify-topic") || "";
      const webhookId = request.headers.get("x-shopify-webhook-id") || "";
      let payload = {};
      try { payload = JSON.parse(raw || "{}"); }
      catch { return json({ ok: false, error: "Niepoprawny JSON." }, 400); }
      if (webhookId) {
        try {
          await supabaseRest(env, "shopify_webhook_events", {
            method: "POST",
            prefer: "return=minimal",
            body: { id: webhookId.slice(0, 80), topic: topic.slice(0, 80) }
          });
        } catch (err) {
          if (/23505|duplicate|409/i.test(String(err.detail || err.message || ""))) return json({ ok: true, duplicate: true });
          throw err;
        }
      }
      const result = await processShopifyWebhook(env, { topic, payload });
      console.log(JSON.stringify({ msg: "shopify_webhook", topic, ok: result.ok !== false }));
      return json({ ok: true, ...result });
    }

    await allow(request, env);
    if (request.method === "GET" && (!path.length || path[0] === "status")) {
      const config = shopifyConfig(env);
      return json({
        ok: true,
        configured: Boolean(config),
        domain: config?.domain || "",
        webhook_secret: Boolean(config?.webhookSecret),
        version: config?.version || ""
      }, 200, CORS);
    }
    if (request.method === "POST" && path[0] === "flush") {
      const body = await readJson(request, 20000);
      const ids = Array.isArray(body.product_ids) ? body.product_ids.map(String).slice(0, 40) : [];
      return json(await flushShopifyQueue(env, { productIds: ids }), 200, CORS);
    }
    if (request.method === "POST" && path[0] === "push") {
      const body = await readJson(request, 20000);
      const ids = Array.isArray(body.product_ids) ? body.product_ids.map(String).filter(Boolean).slice(0, 30) : [];
      if (!ids.length) return json({ ok: false, error: "Zaznacz produkty." }, 400, CORS);
      const results = [];
      for (const id of ids) {
        try { results.push(await pushProductToShopify(env, id, { force: true })); }
        catch (err) { results.push({ ok: false, product_id: id, error: err.message }); }
      }
      return json({ ok: results.some((item) => item.ok), results }, 200, CORS);
    }
    if (request.method === "POST" && path[0] === "webhooks") {
      return json(await registerShopifyWebhooks(env, originOf(request, env)), 200, CORS);
    }
    if (request.method === "POST" && path[0] === "orders") {
      return json(await pullShopifyOrders(env), 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    const status = err.status || 500;
    const message = String(err.message || "Błąd Shopify.").slice(0, 300);
    console.log(JSON.stringify({ msg: "shopify_error", status, error: message }));
    return json({ ok: false, error: message }, status >= 400 && status < 600 ? status : 500, CORS);
  }
}
