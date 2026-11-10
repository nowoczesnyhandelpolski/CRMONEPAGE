import { createSupabaseStore } from "../lib/supabase-store.mjs";
import { sitemapXml } from "../lib/render.mjs";
import { originOf } from "./_util.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    const pages = await createSupabaseStore(context.env).listPublished();
    const body = sitemapXml(originOf(context.request, context.env), pages);
    return new Response(context.request.method === "HEAD" ? null : body, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=600",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (err) {
    console.log(JSON.stringify({ msg: "sitemap_error", error: String(err && err.message || err).slice(0, 300) }));
    return new Response("Błąd mapy strony", { status: 500 });
  }
}
