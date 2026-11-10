import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { anonRpc } from "../lib/supabase-rest.mjs";

test("import ofert woła RPC anon, bez service role", async () => {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return new Response(JSON.stringify({ ok: true, saved: 1, batch_id: "imp_abc123" }), { status: 200 });
  };
  const data = await anonRpc({ SUPABASE_URL: "https://proj.supabase.co" }, "import_offer_export", { p_key_hash: "a".repeat(64), p_batch: { items: [] } }, impl);
  assert.equal(data.saved, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/import_offer_export$/);
  assert.equal(calls[0].opts.headers.authorization.startsWith("Bearer sb_publishable_"), true);
  assert.equal(JSON.stringify(calls).includes("service_role"), false);
});

test("brak funkcji w bazie zwraca konkretny komunikat", async () => {
  const impl = async () => new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function public.create_api_key" }), { status: 404 });
  await assert.rejects(
    () => anonRpc({ SUPABASE_URL: "https://proj.supabase.co" }, "create_api_key", {}, impl),
    /create_api_key/
  );
});

test("SQL wystawia klucze i import bez service role, menu ma jedną grupę Produkty", () => {
  const sql = fs.readFileSync(new URL("../supabase.sql", import.meta.url), "utf8");
  assert.match(sql, /function public\.create_api_key/);
  assert.match(sql, /function public\.revoke_api_key/);
  assert.match(sql, /function public\.import_offer_export/);
  assert.match(sql, /grant execute on function public\.import_offer_export\(text, jsonb\) to anon/);
  assert.match(sql, /grant execute on function public\.create_api_key\(text, text\) to authenticated/);
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('["produkty","Produkty","products"]'), false);
  assert.match(html, /baza-produktow", "aukcje", "import-wtyczki", "eksport", "generator"/);
});
