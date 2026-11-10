import { createSupabaseStore } from "../../../lib/supabase-store.mjs";
import { placeOrder } from "../../../lib/intake.mjs";
import { clientIp, json, readJson } from "../../_util.js";

export async function onRequestPost(context) {
  try {
    const body = await readJson(context.request);
    const slug = decodeURIComponent(context.params.slug || "");
    const result = await placeOrder(createSupabaseStore(context.env), context.env, slug, body, { ip: clientIp(context.request) });
    if (result.status === 200) {
      console.log(JSON.stringify({ msg: "order", slug, number: result.body.number, payment_status: result.body.payment_status }));
    }
    return json(result.body, result.status);
  } catch (err) {
    const status = err.status || 500;
    console.log(JSON.stringify({ msg: "order_error", error: String(err && err.message || err).slice(0, 300) }));
    return json({ ok: false, message: status === 413 || status === 400 ? err.message : "Nie udało się złożyć zamówienia." }, status);
  }
}
