import { anonConfig } from "../../lib/supabase-rest.mjs";

const SAFE = /^products\/[a-z0-9_-]{1,60}\/[a-z0-9_-]{1,60}-[0-9]{1,4}\.(jpg|jpeg|png|webp|gif|avif)$/;

export async function onRequest(context) {
  const parts = context.params?.path;
  const rel = (Array.isArray(parts) ? parts : String(parts || "").split("/")).filter(Boolean).join("/");
  if (!SAFE.test(rel)) {
    return new Response("Nie ma takiego zdjęcia.", { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  try {
    const { url } = anonConfig(context.env);
    const upstream = await fetch(`${url}/storage/v1/object/public/media/${rel}`);
    if (!upstream.ok) {
      return new Response("Nie ma takiego zdjęcia.", { status: 404, headers: { "cache-control": "no-store" } });
    }
    const type = upstream.headers.get("content-type") || "image/jpeg";
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (err) {
    return new Response(String(err?.message || "Błąd zdjęcia.").slice(0, 200), { status: 502, headers: { "cache-control": "no-store" } });
  }
}
