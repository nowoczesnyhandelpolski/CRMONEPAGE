import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseStore, hasServiceKey, pageApi } from "../lib/supabase-store.mjs";

function mockFetch(reply) {
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(reply.body), { status: reply.status || 200 });
  };
  return { calls, restore: () => { globalThis.fetch = prev; } };
}

test("bez klucza serwisowego strona czyta się przez page-api", async () => {
  assert.equal(hasServiceKey({}), false);
  assert.equal(hasServiceKey({ SUPABASE_SERVICE_ROLE_KEY: "x" }), true);
  const m = mockFetch({ body: { page: { slug: "kubek", status: "published" } } });
  try {
    const page = await createSupabaseStore({}).getPage("kubek");
    assert.equal(page.slug, "kubek");
    assert.match(m.calls[0].url, /\/functions\/v1\/page-api$/);
    assert.deepEqual(m.calls[0].body, { action: "page", slug: "kubek" });
  } finally { m.restore(); }
});

test("zamówienie przez page-api zwraca status i treść bez rzucania", async () => {
  const m = mockFetch({ status: 429, body: { ok: false, message: "Za dużo prób." } });
  try {
    const r = await pageApi({}, "order", { slug: "kubek", body: { name: "A" }, ip: "1.2.3.4" });
    assert.equal(r.status, 429);
    assert.equal(r.body.message, "Za dużo prób.");
    assert.equal(m.calls[0].body.ip, "1.2.3.4");
  } finally { m.restore(); }
});

test("bez klucza zapisy w Pages Functions są zablokowane", async () => {
  await assert.rejects(() => createSupabaseStore({}).upsertRecord("orders", "x", {}));
});
