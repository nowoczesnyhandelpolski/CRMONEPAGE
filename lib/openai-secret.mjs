// Klucz OpenAI jest szyfrowany w Pages Function (AES-GCM) i nigdy nie wraca do przeglądarki.
// Nie loguj klucza, szyfrogramu ani NHP_ENC_KEY.
import { sha256Hex, userRpc } from "./supabase-rest.mjs";

export const DEFAULT_TEXT_MODEL = "gpt-5-mini";
export const DEFAULT_IMAGE_MODEL = "gpt-image-1";
export const ENC_MISSING_MESSAGE = "Brak NHP_ENC_KEY w Cloudflare. Dodaj go jako Secret (Pages → Settings → Environment variables) i wdróż ponownie. Wygeneruj 32 bajty: openssl rand -base64 32";

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

export function scrubSecrets(text, secrets = []) {
  let out = String(text || "");
  for (const secret of secrets) {
    const value = String(secret || "");
    if (value.length > 6) out = out.split(value).join("sk-…");
  }
  return out.replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-…");
}

export function encKeyBytes(secret) {
  const raw = String(secret || "").trim();
  if (!raw) fail(ENC_MISSING_MESSAGE, 503);
  let bytes = new Uint8Array();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    bytes = new Uint8Array(raw.match(/../g).map((h) => parseInt(h, 16)));
  } else {
    try {
      const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
      const bin = atob(padded);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      bytes = new Uint8Array();
    }
  }
  if (bytes.length !== 32) {
    fail("NHP_ENC_KEY musi mieć dokładnie 32 bajty. Wygeneruj go poleceniem: openssl rand -base64 32", 503);
  }
  return bytes;
}

export function encReady(env) {
  try {
    encKeyBytes(env?.NHP_ENC_KEY);
    return true;
  } catch {
    return false;
  }
}

function bytesToB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(value) {
  const bin = atob(String(value || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function aesKey(secret) {
  return crypto.subtle.importKey("raw", encKeyBytes(secret), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptApiKey(secret, apiKey) {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(apiKey)));
  return { cipher: bytesToB64(cipher), iv: bytesToB64(iv) };
}

export async function decryptApiKey(secret, cipherB64, ivB64) {
  try {
    const key = await aesKey(secret);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(ivB64) }, key, b64ToBytes(cipherB64));
    return new TextDecoder().decode(plain);
  } catch (err) {
    if (err?.status) throw err;
    fail("Nie udało się odczytać zapisanego klucza. NHP_ENC_KEY musi być ten sam, którym klucz został zapisany. Wklej klucz ponownie.", 500);
  }
}

export function assertApiKey(value) {
  const key = String(value || "").trim();
  if (!/^sk-[A-Za-z0-9_-]{16,220}$/.test(key)) {
    fail("Klucz OpenAI powinien zaczynać się od sk- i nie mieć spacji.", 400);
  }
  return key;
}

export function assertModel(value, fallback) {
  const model = String(value || "").trim() || fallback;
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(model)) {
    fail("Nazwa modelu może mieć tylko litery, cyfry, kropkę, myślnik i dwukropek.", 400);
  }
  return model;
}

export function maskKey(apiKey) {
  const last4 = String(apiKey || "").slice(-4);
  return { last4, mask: `sk-…${last4}` };
}

export function publicConnection(row, env) {
  const has = row?.has_key === true;
  const last4 = has ? String(row.last4 || "") : "";
  let message = "";
  if (!encReady(env)) {
    try { encKeyBytes(env?.NHP_ENC_KEY); }
    catch (err) { message = err.message; }
  }
  return {
    ok: true,
    enc_ready: encReady(env),
    has_key: has,
    mask: has && last4 ? `sk-…${last4}` : "",
    text_model: row?.text_model || DEFAULT_TEXT_MODEL,
    image_model: row?.image_model || DEFAULT_IMAGE_MODEL,
    message
  };
}

function sqlHint(err) {
  const msg = scrubSecrets(err?.message || "Nie udało się zapisać klucza.");
  if (/openai_connection|PGRST202|schema cache|Could not find the function/i.test(msg)) {
    return `${msg} Uruchom ponownie cały plik supabase.sql w SQL Editorze.`;
  }
  if (/Brak dostępu do zapisanego klucza/i.test(msg)) {
    return "Zapisany klucz zaszyfrowano innym NHP_ENC_KEY. Wklej klucz OpenAI ponownie albo przywróć ten sam sekret w Cloudflare.";
  }
  return msg;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 8000) fail("Za duża wiadomość.", 413);
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { fail("Niepoprawne dane.", 400); }
}

export async function testOpenAI({ apiKey, textModel, imageModel, fetchImpl = fetch }) {
  const checks = [["tekstu", textModel], ["zdjęć", imageModel]];
  for (const [kind, model] of checks) {
    let res;
    try {
      res = await fetchImpl(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
        headers: { authorization: `Bearer ${apiKey}` }
      });
    } catch (err) {
      fail(`Nie udało się połączyć z OpenAI (model ${kind}): ${scrubSecrets(err.message, [apiKey])}`, 502);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const exact = data?.error?.message || data?.message || `HTTP ${res.status}`;
      const status = res.status === 401 || res.status === 403 ? 401 : 502;
      fail(`OpenAI odrzuciło model ${kind} (${model}): ${scrubSecrets(exact, [apiKey])}`, status);
    }
  }
  return `Połączenie działa. Model tekstu: ${textModel}. Model zdjęć: ${imageModel}.`;
}

async function storedKey(request, env, rpc) {
  if (!encReady(env)) fail(publicConnection(null, env).message || ENC_MISSING_MESSAGE, 503);
  const proof = await sha256Hex(String(env.NHP_ENC_KEY).trim());
  let material;
  try {
    material = await rpc(request, env, "openai_connection_cipher", { p_proof: proof });
  } catch (err) {
    const wrapped = new Error(sqlHint(err));
    wrapped.status = err.status || 502;
    throw wrapped;
  }
  if (!material?.cipher || !material?.iv) {
    fail("Brak zapisanego klucza. Wklej go w Ustawieniach albo ustaw OPENAI_API_KEY w Cloudflare.", 400);
  }
  return {
    apiKey: await decryptApiKey(env.NHP_ENC_KEY, material.cipher, material.iv),
    textModel: material.text_model || DEFAULT_TEXT_MODEL,
    imageModel: material.image_model || DEFAULT_IMAGE_MODEL
  };
}

export async function resolveOpenAIConfig(env, request, deps = {}) {
  const rpc = deps.userRpc || userRpc;
  const envKey = String(env?.OPENAI_API_KEY || "").trim();
  const textEnv = String(env?.OPENAI_MODEL || "").trim();
  const imageEnv = String(env?.OPENAI_IMAGE_MODEL || "").trim();
  if (envKey) {
    let row = null;
    if (!textEnv || !imageEnv) {
      try { row = await rpc(request, env, "openai_connection_status", {}); }
      catch { row = null; }
    }
    return {
      apiKey: envKey,
      textModel: assertModel(textEnv || row?.text_model, DEFAULT_TEXT_MODEL),
      imageModel: assertModel(imageEnv || row?.image_model, DEFAULT_IMAGE_MODEL),
      source: "env"
    };
  }
  const stored = await storedKey(request, env, rpc);
  return {
    apiKey: stored.apiKey,
    textModel: assertModel(textEnv || stored.textModel, DEFAULT_TEXT_MODEL),
    imageModel: assertModel(imageEnv || stored.imageModel, DEFAULT_IMAGE_MODEL),
    source: "stored"
  };
}

export async function handleOpenAI(request, env, path = [], deps = {}) {
  const rpc = deps.userRpc || userRpc;
  const fetchImpl = deps.fetchImpl || fetch;
  const method = request.method;
  let row;
  try {
    row = await rpc(request, env, "openai_connection_status", {});
  } catch (err) {
    const wrapped = new Error(sqlHint(err));
    wrapped.status = err.status || 502;
    throw wrapped;
  }

  if (method === "GET" && path.length === 0) return publicConnection(row, env);

  if (method === "DELETE" && path.length === 0) {
    try { await rpc(request, env, "openai_connection_clear", {}); }
    catch (err) {
      const wrapped = new Error(sqlHint(err));
      wrapped.status = err.status || 502;
      throw wrapped;
    }
    return {
      ...publicConnection({ has_key: false }, env),
      message: "Klucz usunięty. Generacja użyje OPENAI_API_KEY, jeśli jest ustawiony w Cloudflare."
    };
  }

  if (method === "POST" && path.length === 0) {
    const body = await readBody(request);
    const textModel = assertModel(body.text_model, DEFAULT_TEXT_MODEL);
    const imageModel = assertModel(body.image_model, DEFAULT_IMAGE_MODEL);
    const pasted = String(body.api_key || "").trim();
    if (!pasted) {
      if (!row?.has_key) fail("Najpierw wklej klucz OpenAI.", 400);
      try { await rpc(request, env, "openai_connection_models", { p_text_model: textModel, p_image_model: imageModel }); }
      catch (err) {
        const wrapped = new Error(sqlHint(err));
        wrapped.status = err.status || 502;
        throw wrapped;
      }
      return {
        ...publicConnection({ ...row, text_model: textModel, image_model: imageModel }, env),
        message: "Zapisano wybór modeli. Klucz się nie zmienił."
      };
    }
    const apiKey = assertApiKey(pasted);
    if (!encReady(env)) fail(publicConnection(null, env).message || ENC_MISSING_MESSAGE, 503);
    const packed = await encryptApiKey(env.NHP_ENC_KEY, apiKey);
    const { last4 } = maskKey(apiKey);
    const proof = await sha256Hex(String(env.NHP_ENC_KEY).trim());
    try {
      await rpc(request, env, "openai_connection_save", {
        p_cipher: packed.cipher,
        p_iv: packed.iv,
        p_last4: last4,
        p_text_model: textModel,
        p_image_model: imageModel,
        p_proof: proof
      });
    } catch (err) {
      const wrapped = new Error(sqlHint(err));
      wrapped.status = err.status || 502;
      throw wrapped;
    }
    return {
      ...publicConnection({ has_key: true, last4, text_model: textModel, image_model: imageModel }, env),
      message: `Zapisano klucz. W panelu widać tylko sk-…${last4}.`
    };
  }

  if (method === "POST" && path.length === 1 && path[0] === "test") {
    const body = await readBody(request);
    const textModel = assertModel(body.text_model, row?.text_model || DEFAULT_TEXT_MODEL);
    const imageModel = assertModel(body.image_model, row?.image_model || DEFAULT_IMAGE_MODEL);
    const pasted = String(body.api_key || "").trim();
    const apiKey = pasted ? assertApiKey(pasted) : (await storedKey(request, env, rpc)).apiKey;
    const message = await testOpenAI({ apiKey, textModel, imageModel, fetchImpl });
    return { ok: true, message };
  }

  fail("Nie ma takiej ścieżki.", 404);
}
