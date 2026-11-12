import { createSupabaseStore } from "../lib/supabase-store.mjs";
import { productFeedXml } from "../lib/product-feed.mjs";
import { originOf } from "./_util.js";

// Plik produktów dla Google Merchant Center, Meta Commerce Manager i katalogu TikTok: /feed.xml
export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const store = createSupabaseStore(context.env);
    const list = await store.listPublished();
    const pages = (await Promise.all(list.slice(0, 500).map((p) => store.getPage(p.slug, { publishedOnly: true })))).filter(Boolean);
    const body = productFeedXml(originOf(context.request, context.env), pages);
    return new Response(context.request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=900",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (err) {
    console.log(JSON.stringify({ msg: "feed_error", error: String(err && err.message || err).slice(0, 300) }));
    return new Response("Błąd pliku produktów", { status: 500 });
  }
}
