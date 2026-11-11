import { anonRpc } from "../../../lib/supabase-rest.mjs";
import { json } from "../../_util.js";

export async function onRequestPost(context) {
  const slug = decodeURIComponent(context.params.slug || "");
  if (!/^[a-z0-9-]{1,70}$/.test(slug)) return json({ ok: false }, 400);
  try {
    await anonRpc(context.env, "record_page_view", { p_slug: slug });
    return json({ ok: true });
  } catch (err) {
    console.log(JSON.stringify({ msg: "view_error", slug, error: String(err.message || err).slice(0, 180) }));
    return json({ ok: false }, 202);
  }
}
