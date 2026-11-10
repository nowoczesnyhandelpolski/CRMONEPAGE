export function clientIp(request) {
  return request.headers.get("cf-connecting-ip")
    || String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "";
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-nhp-key, x-nhp-version",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });
}

export async function readJson(request, max = 20000) {
  const text = await request.text();
  if (text.length > max) {
    const err = new Error("Za duża wiadomość.");
    err.status = 413;
    throw err;
  }
  try { return JSON.parse(text || "{}"); }
  catch {
    const err = new Error("Niepoprawne dane.");
    err.status = 400;
    throw err;
  }
}

export function html(body, status, headers) {
  return new Response(body, { status, headers });
}

export const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-robots-tag": "index, follow",
  "cache-control": "public, max-age=60"
};

export function originOf(request, env) {
  const fromEnv = String(env?.PUBLIC_ORIGIN || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const url = new URL(request.url);
  return url.origin;
}
