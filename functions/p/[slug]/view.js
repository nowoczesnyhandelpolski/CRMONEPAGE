import { supabaseRest, sha256Hex } from "../../../lib/supabase-rest.mjs";

export async function onRequestPost(context) {
  const slug = decodeURIComponent(context.params.slug || "");
  if (!/^[a-z0-9-]{1,70}$/.test(slug)) return new Response(null, { status: 404 });
  try {
    const raw = await context.request.text();
    if (raw.length > 2000) return new Response(null, { status: 204 });
    let sid = "";
    try { sid = String(JSON.parse(raw || "{}").sid || ""); } catch { sid = ""; }
    const safe = /^[A-Za-z0-9-]{8,80}$/.test(sid) ? sid : "";
    const hash = safe ? await sha256Hex(safe) : "";
    await supabaseRest(context.env, "rpc/track_page_view", {
      method: "POST",
      body: { p_slug: slug, p_sid_hash: hash }
    });
  } catch (err) {
    console.log(JSON.stringify({ msg: "view_error", slug, error: String(err.message || err).slice(0, 200) }));
  }
  return new Response(null, { status: 204 });
}
