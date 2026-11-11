import { CORS, json, readJson } from "../../_util.js";
import { teamUser } from "../../../lib/supabase-rest.mjs";
import { ksefConfig } from "../../../lib/ksef-client.mjs";
import { issueKsefForOrder, refreshKsefInvoice } from "../../../lib/ksef-issue.mjs";

function parts(context) {
  const path = context.params?.path;
  if (Array.isArray(path)) return path.filter(Boolean);
  return String(path || "").split("/").filter(Boolean);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const user = await teamUser(request, env);
    if (!user) return json({ ok: false, error: "Zaloguj się na konto zespołu." }, 401, CORS);
    const path = parts(context);
    const config = ksefConfig(env);
    if (request.method === "GET" && (!path.length || path[0] === "status")) {
      return json({
        ok: true,
        configured: Boolean(config),
        env: config?.env || String(env.KSEF_ENV || "test").toLowerCase() || "test",
        nip_set: Boolean(String(env.KSEF_NIP || "").replace(/\D/g, "").length === 10),
        seller_set: Boolean(String(env.KSEF_SELLER_NAME || "").trim() && String(env.KSEF_SELLER_ADDRESS1 || env.KSEF_SELLER_ADDRESS || "").trim())
      }, 200, CORS);
    }
    const body = request.method === "POST" ? await readJson(request, 8000) : {};
    const orderId = String(body.shopify_order_id || "").replace(/\D/g, "");
    if (!orderId) return json({ ok: false, error: "Podaj zamówienie Shopify." }, 400, CORS);
    if (request.method === "POST" && path[0] === "refresh") {
      const invoice = await refreshKsefInvoice(env, orderId);
      return json({ ok: true, invoice }, 200, CORS);
    }
    if (request.method === "POST" && (path[0] === "issue" || !path.length)) {
      const invoice = await issueKsefForOrder(env, orderId, { force: true });
      return json({ ok: invoice.status === "przyjeta" || invoice.status === "wyslana" || invoice.status === "oczekuje_konfiguracji", invoice }, 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    const status = err.status || 500;
    const message = String(err.message || "Błąd KSeF.").slice(0, 300);
    console.log(JSON.stringify({ msg: "ksef_error", status, error: message }));
    return json({ ok: false, error: message }, status >= 400 && status < 600 ? status : 500, CORS);
  }
}
