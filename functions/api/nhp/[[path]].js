import { CORS, json, readJson } from "../../_util.js";
import { normalizeBatch } from "../../../lib/offer-normalizer.mjs";
import { anonRpc, sha256Hex } from "../../../lib/supabase-rest.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

function keyHashOrNull(request) {
  const raw = request.headers.get("x-nhp-key") || "";
  if (!raw.startsWith("nhp_") || raw.length < 20) return "";
  return raw;
}

function fail(err) {
  const status = err.status || 500;
  const message = String(err.message || "Nie udało się zapisać szkicu.").slice(0, 300);
  console.log(JSON.stringify({ msg: "nhp_error", status, error: message }));
  return json({ ok: false, error: message }, status >= 500 ? status : status, CORS);
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const path = parts(context);
    const rawKey = keyHashOrNull(context.request);
    if (context.request.method === "GET" && path[0] === "ping") {
      if (!rawKey) return json({ ok: false, error: "Nieprawidłowy klucz API." }, 401, CORS);
      const hash = await sha256Hex(rawKey);
      const data = await anonRpc(context.env, "touch_api_key", { p_key_hash: hash });
      return json({ ok: true, label: data?.label || "" }, 200, CORS);
    }
    if (context.request.method === "POST" && path[0] === "offer-export") {
      if (!rawKey) return json({ ok: false, error: "Nieprawidłowy klucz API." }, 401, CORS);
      const body = await readJson(context.request, 1_500_000);
      const batch = normalizeBatch(body);
      const hash = await sha256Hex(rawKey);
      const data = await anonRpc(context.env, "import_offer_export", {
        p_key_hash: hash,
        p_batch: {
          batch_id: batch.batch_id,
          name: batch.name,
          account_login: batch.account_login,
          items: batch.items
        }
      });
      return json(data || { ok: true }, 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    return fail(err);
  }
}
