/* /api/base/* — import z Base (BaseLinker) i wysyłka do Shopify. Tylko dla zalogowanego zespołu.
   Token Base: sekret BASE_API_TOKEN (Cloudflare Pages). Przeglądarka go nie widzi. */
import { CORS, json, readJson } from "../../_util.js";
import { supabaseRest, teamUser } from "../../../lib/supabase-rest.mjs";
import { baseConfig, cleanIds, notConfigured } from "../../../lib/base-core.mjs";
import { importProducts, listProducts, loadSources } from "../../../lib/base-sync.mjs";
import { shopifyConfig } from "../../../lib/shopify-core.mjs";
import { pushProductToShopify } from "../../../lib/shopify-sync.mjs";

/** Ile produktów naraz: import (1 zapytanie do Base na paczkę) i wysyłka (kilka zapytań na produkt). */
export const IMPORT_LIMIT = 100;
export const PUSH_LIMIT = 4;

function parts(context) {
  const path = context.params?.path;
  if (Array.isArray(path)) return path.filter(Boolean);
  return String(path || "").split("/").filter(Boolean);
}

function kindOf(value) {
  return value === "storage" ? "storage" : "inventory";
}

function sourceId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    const err = new Error("Wybierz katalog Base.");
    err.status = 400;
    throw err;
  }
  return id;
}

function requireBase(env) {
  const config = baseConfig(env);
  if (!config) throw notConfigured();
  return config;
}

async function markQueueDone(env, ids) {
  if (!ids.length) return;
  const list = ids.map((id) => `"${String(id).replace(/"/g, "")}"`).join(",");
  await supabaseRest(env, `shopify_sync_queue?product_id=in.(${encodeURIComponent(list)})&done_at=is.null`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { done_at: new Date().toISOString(), error: null }
  }).catch(() => {});
}

export async function handleBase(request, env, path, { authorize = teamUser } = {}) {
  const user = await authorize(request, env);
  if (!user) {
    const err = new Error("Zaloguj się na konto zespołu.");
    err.status = 401;
    throw err;
  }
  const action = path[0] || "status";

  if (request.method === "GET" && action === "status") {
    const shop = shopifyConfig(env);
    return {
      ok: true,
      configured: Boolean(baseConfig(env)),
      shopify_configured: Boolean(shop),
      shopify_domain: shop?.domain || ""
    };
  }

  if (request.method === "GET" && action === "sources") {
    return { ok: true, ...(await loadSources(requireBase(env))) };
  }

  if (request.method === "POST" && action === "list") {
    const body = await readJson(request, 4000);
    return listProducts(env, requireBase(env), {
      kind: kindOf(body.kind),
      id: sourceId(body.id),
      page: body.page,
      q: body.q
    });
  }

  if (request.method === "POST" && action === "import") {
    const body = await readJson(request, 20000);
    const ids = cleanIds(body.ids, IMPORT_LIMIT);
    return importProducts(env, requireBase(env), {
      kind: kindOf(body.kind),
      id: sourceId(body.id),
      ids,
      sourceName: String(body.name || "").slice(0, 100)
    });
  }

  if (request.method === "POST" && action === "push") {
    const body = await readJson(request, 4000);
    const ids = cleanIds(body.ids, PUSH_LIMIT);
    if (!shopifyConfig(env)) {
      const err = new Error("Shopify nie jest podłączony. Dodaj sekrety SHOPIFY_STORE_DOMAIN i SHOPIFY_ADMIN_TOKEN (docs/shopify-ksef.md).");
      err.status = 409;
      throw err;
    }
    const imported = await importProducts(env, requireBase(env), {
      kind: kindOf(body.kind),
      id: sourceId(body.id),
      ids,
      sourceName: String(body.name || "").slice(0, 100)
    });
    const active = body.status === "aktywny";
    const results = [];
    for (const item of imported.products) {
      try {
        if (active && item.workflow_status !== "opublikowany") {
          await supabaseRest(env, `products?id=eq.${encodeURIComponent(item.product_id)}`, {
            method: "PATCH",
            prefer: "return=minimal",
            body: { workflow_status: "opublikowany", updated_at: new Date().toISOString() }
          });
        }
        const pushed = await pushProductToShopify(env, item.product_id, { force: true });
        results.push({ ok: true, base_product_id: item.base_product_id, ...pushed });
      } catch (err) {
        const message = String(err.message || "Błąd Shopify").slice(0, 300);
        await supabaseRest(env, `products?id=eq.${encodeURIComponent(item.product_id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: { shopify_sync_error: message }
        }).catch(() => {});
        results.push({ ok: false, base_product_id: item.base_product_id, product_id: item.product_id, error: message });
      }
    }
    // Import i zmiana statusu wrzuciły produkty do kolejki — właśnie je wysłaliśmy, więc kolejka jest zrobiona.
    await markQueueDone(env, results.filter((item) => item.ok).map((item) => item.product_id));
    for (const missing of imported.missing || []) {
      results.push({ ok: false, base_product_id: missing, error: "Base nie oddał tego produktu." });
    }
    return { ok: results.some((item) => item.ok), results };
  }

  const err = new Error("Nie ma takiej ścieżki.");
  err.status = 404;
  throw err;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    return json(await handleBase(request, env, parts(context)), 200, CORS);
  } catch (err) {
    const status = err.status || 500;
    const message = String(err.message || "Błąd importu z Base.").slice(0, 300);
    console.log(JSON.stringify({ msg: "base_error", status, error: message }));
    return json({ ok: false, error: message }, status >= 400 && status < 600 ? status : 500, CORS);
  }
}
