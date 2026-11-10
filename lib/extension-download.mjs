import { decodeZipBase64 } from "./extension-pack.mjs";
import { EXTENSION_ZIP_BASE64 } from "./extension-zip-data.mjs";
import { teamUser } from "./supabase-rest.mjs";

function deny(error, status) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

const ZIP_HEADERS = {
  "content-type": "application/zip",
  "content-disposition": "attachment; filename=\"nhp-wtyczka.zip\"",
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff"
};

export function extensionZipBytes() {
  return decodeZipBase64(EXTENSION_ZIP_BASE64);
}

export async function extensionZipResponse(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") return deny("Metoda niedozwolona.", 405);
  const user = await teamUser(request, env);
  if (!user) return deny("Zaloguj się na konto zespołu.", 401);
  const bytes = extensionZipBytes();
  return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers: ZIP_HEADERS });
}
