import { CORS, json, readJson } from "../../_util.js";
import { handleOpenAI, scrubSecrets } from "../../../lib/openai-secret.mjs";
import { mintApiKey, sha256Hex, userRpc } from "../../../lib/supabase-rest.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const path = parts(context);
    if (context.request.method === "POST" && path[0] === "keys" && !path[1]) {
      const body = await readJson(context.request, 4000);
      const label = String(body.label || "Wtyczka").trim().slice(0, 80);
      const key = mintApiKey();
      const key_hash = await sha256Hex(key);
      const id = await userRpc(context.request, context.env, "create_api_key", { p_label: label, p_key_hash: key_hash });
      return json({ ok: true, id, label, key }, 200, CORS);
    }
    if (context.request.method === "DELETE" && path[0] === "keys" && path[1]) {
      await userRpc(context.request, context.env, "revoke_api_key", { p_id: path[1] });
      return json({ ok: true }, 200, CORS);
    }
    if (path[0] === "openai") {
      const body = await handleOpenAI(context.request, context.env, path.slice(1));
      return json(body, 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    const status = err.status || 500;
    const message = scrubSecrets(err.message || "Nie udało się zapisać klucza.", [context.env?.OPENAI_API_KEY, context.env?.NHP_ENC_KEY]).slice(0, 300);
    console.log(JSON.stringify({ msg: "panel_error", status, error: message }));
    return json({ ok: false, error: message }, status >= 400 && status < 600 ? status : 500, CORS);
  }
}
