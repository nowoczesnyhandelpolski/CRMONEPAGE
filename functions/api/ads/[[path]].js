// /api/ads/* — Pomiar reklam (Meta Ads, Google Ads, Shopify).
//   GET  /api/ads/status   które źródła są podłączone (bez ujawniania kluczy)
//   POST /api/ads/sync     pobiera dane i zapisuje zrzut w records (adlive/main)
// Dostęp: zalogowany członek zespołu albo cron z nagłówkiem x-nhp-sync = NHP_SYNC_SECRET.
import { CORS, json, readJson } from "../../_util.js";
import { teamUser } from "../../../lib/supabase-rest.mjs";
import { timingSafeEqual } from "../../../lib/shopify-core.mjs";
import { adsStatus, clampDays, runAdsSync, saveAdsSnapshot } from "../../../lib/ads-sync.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

async function allow(request, env) {
  const secret = String(env?.NHP_SYNC_SECRET || "");
  const header = request.headers.get("x-nhp-sync") || "";
  if (secret && header && timingSafeEqual(header, secret)) return { cron: true };
  const user = await teamUser(request, env);
  if (!user) { const err = new Error("Zaloguj się na konto zespołu."); err.status = 401; throw err; }
  return user;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    await allow(request, env);
    const path = parts(context);
    if (request.method === "GET" && (!path.length || path[0] === "status")) {
      return json({ ok: true, ...adsStatus(env) }, 200, CORS);
    }
    if (request.method === "POST" && path[0] === "sync") {
      const body = await readJson(request, 2000).catch(() => ({}));
      const snap = await runAdsSync(env, { days: clampDays(body.days || 60) });
      await saveAdsSnapshot(env, snap);
      return json({ ok: true, syncedAt: snap.syncedAt, sources: snap.sources, rows: snap.rows.length, orders: snap.orders.length }, 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    const status = err.status || 500;
    const secrets = [env?.META_ACCESS_TOKEN, env?.GOOGLE_ADS_REFRESH_TOKEN, env?.GOOGLE_ADS_CLIENT_SECRET, env?.SHOPIFY_ADMIN_TOKEN, env?.ADS_SHOPIFY_ADMIN_TOKEN].filter(Boolean);
    let message = String(err.message || "Błąd pomiaru reklam.");
    for (const s of secrets) message = message.split(s).join("***");
    console.log(JSON.stringify({ msg: "ads_error", status, error: message.slice(0, 200) }));
    return json({ ok: false, error: message.slice(0, 300) }, status >= 400 && status < 600 ? status : 500, CORS);
  }
}
