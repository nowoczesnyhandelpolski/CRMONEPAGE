import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sha256Hex } from "../lib/supabase-rest.mjs";
import {
  ENC_MISSING_MESSAGE,
  decryptApiKey,
  encryptApiKey,
  handleOpenAI,
  resolveOpenAIConfig,
  scrubSecrets,
  testOpenAI
} from "../lib/openai-secret.mjs";

const API_KEY = "sk-test-" + "a".repeat(24) + "abcd";

function encSecret() {
  const raw = new Uint8Array(32);
  for (let i = 0; i < raw.length; i++) raw[i] = i + 1;
  let s = "";
  for (const b of raw) s += String.fromCharCode(b);
  return { b64: btoa(s), hex: [...raw].map((b) => b.toString(16).padStart(2, "0")).join("") };
}

function memory(state) {
  return async (_req, _env, fn, args = {}) => {
    state.calls.push(fn);
    if (fn === "openai_connection_status") {
      if (!state.row) return { has_key: false, last4: "", text_model: "gpt-5-mini", image_model: "gpt-image-1" };
      return { has_key: true, last4: state.row.p_last4, text_model: state.row.p_text_model, image_model: state.row.p_image_model };
    }
    if (fn === "openai_connection_save") {
      state.row = { ...args };
      return null;
    }
    if (fn === "openai_connection_models") {
      if (!state.row) throw Object.assign(new Error("Najpierw zapisz klucz OpenAI."), { status: 400 });
      state.row.p_text_model = args.p_text_model;
      state.row.p_image_model = args.p_image_model;
      return null;
    }
    if (fn === "openai_connection_clear") { state.row = null; return null; }
    if (fn === "openai_connection_cipher") {
      if (!state.row || args.p_proof !== state.row.p_proof) {
        throw Object.assign(new Error("Brak dostępu do zapisanego klucza."), { status: 401 });
      }
      return { cipher: state.row.p_cipher, iv: state.row.p_iv, text_model: state.row.p_text_model, image_model: state.row.p_image_model };
    }
    throw new Error("zła funkcja " + fn);
  };
}

function req(method, body) {
  return new Request("https://panel.example/api/panel/openai", {
    method,
    body: body ? JSON.stringify(body) : undefined
  });
}

test("szyfr AES-GCM wraca do klucza, a zły sekret nie", async () => {
  const { b64, hex } = encSecret();
  const packed = await encryptApiKey(b64, API_KEY);
  assert.equal(await decryptApiKey(hex, packed.cipher, packed.iv), API_KEY);
  assert.equal(packed.cipher.includes(API_KEY), false);
  await assert.rejects(() => decryptApiKey(btoa("x".repeat(32)), packed.cipher, packed.iv), /ten sam/);
});

test("zapis nie zwraca klucza, tylko sk-… i 4 znaki", async () => {
  const { b64 } = encSecret();
  const state = { row: null, calls: [] };
  const saved = await handleOpenAI(req("POST", {
    api_key: API_KEY,
    text_model: "gpt-5-mini",
    image_model: "gpt-image-1"
  }), { NHP_ENC_KEY: b64 }, [], { userRpc: memory(state) });
  const dumped = JSON.stringify(saved);
  assert.equal(dumped.includes(API_KEY), false);
  assert.equal(dumped.includes(state.row.p_cipher), false);
  assert.equal(saved.mask, "sk-…abcd");
  assert.equal(saved.has_key, true);
  assert.match(saved.message, /sk-…abcd/);
  assert.equal(state.row.p_last4, "abcd");
  assert.equal(state.row.p_proof, await sha256Hex(b64));
  assert.equal(state.row.p_cipher.includes(API_KEY), false);

  const status = await handleOpenAI(req("GET"), { NHP_ENC_KEY: b64 }, [], { userRpc: memory(state) });
  assert.equal(JSON.stringify(status).includes(API_KEY), false);
  assert.equal(status.mask, "sk-…abcd");
  assert.equal(status.cipher, undefined);

  const resolved = await resolveOpenAIConfig({ NHP_ENC_KEY: b64 }, req("GET"), { userRpc: memory(state) });
  assert.equal(resolved.apiKey, API_KEY);
  assert.equal(resolved.source, "stored");
  assert.equal(resolved.textModel, "gpt-5-mini");
});

test("bez NHP_ENC_KEY jest polski komunikat z poleceniem openssl", async () => {
  const state = { row: null, calls: [] };
  await assert.rejects(
    () => handleOpenAI(req("POST", { api_key: API_KEY }), {}, [], { userRpc: memory(state) }),
    (err) => err.status === 503 && err.message.includes("openssl rand -base64 32") && err.message === ENC_MISSING_MESSAGE
  );
  const view = await handleOpenAI(req("GET"), {}, [], { userRpc: memory(state) });
  assert.equal(view.enc_ready, false);
  assert.match(view.message, /NHP_ENC_KEY/);
});

test("Sprawdź połączenie pokazuje OK albo dokładny błąd OpenAI po polsku", async () => {
  const ok = await testOpenAI({
    apiKey: API_KEY,
    textModel: "gpt-5-mini",
    imageModel: "gpt-image-1",
    fetchImpl: async () => new Response(JSON.stringify({ id: "m" }), { status: 200 })
  });
  assert.match(ok, /Połączenie działa/);
  await assert.rejects(
    () => testOpenAI({
      apiKey: API_KEY,
      textModel: "gpt-5-mini",
      imageModel: "gpt-image-1",
      fetchImpl: async (url) => {
        if (String(url).includes("gpt-image-1")) {
          return new Response(JSON.stringify({ error: { message: "The model 'gpt-image-1' does not exist" } }), { status: 404 });
        }
        return new Response("{}", { status: 200 });
      }
    }),
    /OpenAI odrzuciło model zdjęć \(gpt-image-1\): The model 'gpt-image-1' does not exist/
  );
  assert.equal(scrubSecrets("klucz " + API_KEY + " dalej", [API_KEY]).includes(API_KEY), false);
});

test("OPENAI_API_KEY z Cloudflare ma pierwszeństwo i nie czyta szyfrogramu", async () => {
  const state = { row: null, calls: [] };
  const ai = await resolveOpenAIConfig(
    { OPENAI_API_KEY: "sk-env-" + "b".repeat(20), OPENAI_MODEL: "gpt-5-mini", OPENAI_IMAGE_MODEL: "gpt-image-1" },
    req("GET"),
    { userRpc: memory(state) }
  );
  assert.equal(ai.source, "env");
  assert.equal(state.calls.includes("openai_connection_cipher"), false);
  assert.equal(ai.textModel, "gpt-5-mini");
});

test("SQL nie daje klientowi SELECT, a panel ma sekcję w Ustawieniach", () => {
  const sql = fs.readFileSync(new URL("../supabase.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.openai_connection/);
  assert.match(sql, /revoke all on public\.openai_connection from anon, authenticated/);
  assert.match(sql, /function public\.openai_connection_save/);
  assert.match(sql, /function public\.openai_connection_cipher/);
  assert.match(sql, /if not public\.is_team\(\)/);
  assert.equal(/create policy [^;]*openai_connection/.test(sql), false);
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Połączenie z OpenAI/);
  assert.match(html, /Sprawdź połączenie/);
  assert.match(html, /Usuń klucz/);
  const gen = fs.readFileSync(new URL("../functions/api/generate/[[path]].js", import.meta.url), "utf8");
  assert.match(gen, /resolveOpenAIConfig/);
  assert.equal(gen.includes("Bearer ${env.OPENAI_API_KEY}"), false);
});
