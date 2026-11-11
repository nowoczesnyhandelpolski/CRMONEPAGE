import { createSupabaseStore, hasServiceKey, pageApi } from "../../../lib/supabase-store.mjs";
import { placeLead } from "../../../lib/intake.mjs";
import { clientIp, json, readJson } from "../../_util.js";

export async function onRequestPost(context) {
  try {
    const body = await readJson(context.request);
    const slug = decodeURIComponent(context.params.slug || "");
    const result = hasServiceKey(context.env)
      ? await placeLead(createSupabaseStore(context.env), context.env, slug, body, { ip: clientIp(context.request) })
      : await pageApi(context.env, "lead", { slug, body, ip: clientIp(context.request) });
    return json(result.body, result.status);
  } catch (err) {
    const status = err.status || 500;
    console.log(JSON.stringify({ msg: "lead_error", error: String(err && err.message || err).slice(0, 300) }));
    return json({ ok: false, message: status === 400 || status === 413 ? err.message : "Nie udało się zapisać." }, status);
  }
}
