import { CORS, json, readJson } from "../../_util.js";
import { mintApiKey, sha256Hex, supabaseRest, teamUser } from "../../../lib/supabase-rest.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const user = await teamUser(context.request, context.env);
    if (!user) return json({ ok: false, error: "Zaloguj się na konto zespołu." }, 401, CORS);
    const path = parts(context);
    if (context.request.method === "POST" && path[0] === "keys" && !path[1]) {
      const body = await readJson(context.request, 4000);
      const label = String(body.label || "Wtyczka").trim().slice(0, 80);
      const key = mintApiKey();
      const key_hash = await sha256Hex(key);
      const rows = await supabaseRest(context.env, "api_keys?select=id,label,created_at", {
        method: "POST",
        prefer: "return=representation",
        body: { key_hash, label, created_by: user.id }
      });
      return json({ ok: true, id: rows?.[0]?.id, label, key }, 200, CORS);
    }
    if (context.request.method === "DELETE" && path[0] === "keys" && path[1]) {
      await supabaseRest(context.env, `api_keys?id=eq.${encodeURIComponent(path[1])}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { revoked_at: new Date().toISOString() }
      });
      return json({ ok: true }, 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    const status = err.status || 500;
    console.log(JSON.stringify({ msg: "panel_error", status, error: String(err.message || err).slice(0, 240) }));
    return json({ ok: false, error: status >= 500 ? "Nie udało się zapisać klucza." : err.message }, status >= 500 ? 500 : status, CORS);
  }
}
