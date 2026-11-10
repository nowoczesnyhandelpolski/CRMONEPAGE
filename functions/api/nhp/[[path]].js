import { CORS, json, readJson } from "../../_util.js";
import { normalizeBatch } from "../../../lib/offer-normalizer.mjs";
import { anonConfig, anonRpc, sha256Bytes, sha256Hex } from "../../../lib/supabase-rest.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

function keyHashOrNull(request) {
  const raw = request.headers.get("x-nhp-key") || "";
  if (!raw.startsWith("nhp_") || raw.length < 20) return "";
  return raw;
}

const MEDIA_PATH = /^products\/[a-z0-9_-]{1,60}\/[a-z0-9_-]{1,60}-[0-9]{1,4}\.(jpg|jpeg|png|webp|gif|avif)$/;

async function uploadMedia(request, env) {
  const rawKey = keyHashOrNull(request);
  if (!rawKey) return json({ ok: false, error: "Nieprawidłowy klucz API." }, 401, CORS);
  const path = String(request.headers.get("x-nhp-path") || "");
  if (!MEDIA_PATH.test(path)) return json({ ok: false, error: "Zła ścieżka zdjęcia." }, 400, CORS);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 8 * 1024 * 1024) return json({ ok: false, error: "Zdjęcie większe niż 8 MB." }, 413, CORS);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) return json({ ok: false, error: "Puste zdjęcie." }, 400, CORS);
  if (bytes.byteLength > 8 * 1024 * 1024) return json({ ok: false, error: "Zdjęcie większe niż 8 MB." }, 413, CORS);
  const sha = await sha256Bytes(bytes);
  const mime = String(request.headers.get("content-type") || "image/jpeg").split(";")[0].trim().slice(0, 80);
  const hash = await sha256Hex(rawKey);
  const claim = await anonRpc(env, "claim_media_upload", { p_key_hash: hash, p_sha256: sha, p_path: path, p_mime: mime });
  if (claim?.skip) return json({ ok: true, skip: true, path: claim.path, public_url: claim.public_url }, 200, CORS);
  const { url, anonKey } = anonConfig(env);
  const stored = await fetch(`${url}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": mime },
    body: bytes
  });
  if (!stored.ok) {
    const detail = (await stored.text()).slice(0, 180);
    return json({ ok: false, error: `Nie udało się zapisać zdjęcia (${stored.status}). ${detail}` }, 502, CORS);
  }
  const publicUrl = `${url}/storage/v1/object/public/media/${path}`;
  await anonRpc(env, "complete_media_upload", {
    p_key_hash: hash,
    p_sha256: sha,
    p_path: path,
    p_public_url: publicUrl,
    p_mime: mime
  });
  return json({ ok: true, skip: false, path, public_url: publicUrl }, 200, CORS);
}

function fail(err) {
  const status = err.status || 500;
  const message = String(err.message || "Nie udało się zapisać szkicu.").slice(0, 300);
  console.log(JSON.stringify({ msg: "nhp_error", status, error: message }));
  return json({ ok: false, error: message }, status >= 500 ? status : status, CORS);
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const path = parts(context);
    const rawKey = keyHashOrNull(context.request);
    if (context.request.method === "GET" && path[0] === "ping") {
      if (!rawKey) return json({ ok: false, error: "Nieprawidłowy klucz API." }, 401, CORS);
      const hash = await sha256Hex(rawKey);
      const data = await anonRpc(context.env, "touch_api_key", { p_key_hash: hash });
      return json({ ok: true, label: data?.label || "" }, 200, CORS);
    }
    if (context.request.method === "POST" && path[0] === "media") return await uploadMedia(context.request, context.env);
    if (context.request.method === "POST" && path[0] === "offer-export") {
      if (!rawKey) return json({ ok: false, error: "Nieprawidłowy klucz API." }, 401, CORS);
      const body = await readJson(context.request, 1_500_000);
      const batch = normalizeBatch(body);
      const hash = await sha256Hex(rawKey);
      const data = await anonRpc(context.env, "import_offer_export", {
        p_key_hash: hash,
        p_batch: {
          batch_id: batch.batch_id,
          name: batch.name,
          account_login: batch.account_login,
          items: batch.items
        }
      });
      return json(data || { ok: true }, 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    return fail(err);
  }
}
