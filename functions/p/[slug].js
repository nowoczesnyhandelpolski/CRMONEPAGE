import { createSupabaseStore } from "../../lib/supabase-store.mjs";
import { cleanSiteData } from "../../lib/site-model.mjs";
import { notFoundHtml, renderLightPage, sitemapXml } from "../../lib/render.mjs";
import { html, originOf, PAGE_HEADERS } from "../_util.js";

async function sitemap(context) {
  const store = createSupabaseStore(context.env);
  const pages = await store.listPublished();
  const body = sitemapXml(originOf(context.request, context.env), pages);
  return new Response(context.request.method === "HEAD" ? null : body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=600",
      "x-content-type-options": "nosniff"
    }
  });
}

export async function onRequest(context) {
  const slug = decodeURIComponent(context.params.slug || "");
  if (slug === "sitemap.xml") {
    try { return await sitemap(context); }
    catch (err) {
      console.log(JSON.stringify({ msg: "sitemap_error", error: String(err && err.message || err).slice(0, 300) }));
      return new Response("Błąd mapy strony", { status: 500 });
    }
  }
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    if (!/^[a-z0-9-]{1,70}$/.test(slug)) {
      return html(notFoundHtml(), 404, { ...PAGE_HEADERS, "x-robots-tag": "noindex", "cache-control": "no-store" });
    }
    const store = createSupabaseStore(context.env);
    const page = await store.getPage(slug, { publishedOnly: true });
    if (!page) {
      return html(notFoundHtml(), 404, { ...PAGE_HEADERS, "x-robots-tag": "noindex", "cache-control": "no-store" });
    }
    const body = renderLightPage(page, cleanSiteData(page.data || {}), { origin: originOf(context.request, context.env) });
    return html(context.request.method === "HEAD" ? null : body, 200, PAGE_HEADERS);
  } catch (err) {
    console.log(JSON.stringify({ msg: "page_error", slug, error: String(err && err.message || err).slice(0, 300) }));
    return new Response("Błąd strony", { status: 500, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
}
