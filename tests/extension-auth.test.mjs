import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PUBLIC_SUPABASE, anonConfig, teamUserAnon } from "../lib/supabase-rest.mjs";
import { extensionZipResponse } from "../lib/extension-download.mjs";
import { freshAccessToken, sessionNeedsRefresh } from "../lib/panel-api.mjs";

const req = (token) => new Request("https://panel.example/api/extension.zip", {
  headers: token ? { authorization: `Bearer ${token}` } : {}
});

function mockFetch({ team = true, userOk = true } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(userOk ? JSON.stringify({ id: "user-1", email: "zesp@firma.pl" }) : "{}", { status: userOk ? 200 : 401 });
    }
    if (String(url).endsWith("/rest/v1/rpc/is_team")) {
      return new Response(team ? "true" : "false", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("nie", { status: 500 });
  };
  return { calls, impl };
}

test("klucz anon bierze się ze zmiennej albo z config.js", () => {
  const cfg = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
  assert.match(cfg, new RegExp(PUBLIC_SUPABASE.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(cfg, new RegExp(PUBLIC_SUPABASE.anonKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const fallback = anonConfig({ SUPABASE_URL: "https://proj.supabase.co" });
  assert.equal(fallback.anonKey, PUBLIC_SUPABASE.anonKey);
  assert.equal(anonConfig({ SUPABASE_ANON_KEY: "sb_publishable_inny", SUPABASE_URL: "https://proj.supabase.co/" }).anonKey, "sb_publishable_inny");
});

test("pobranie ZIP sprawdza JWT i is_team bez service role", async () => {
  const { calls, impl } = mockFetch();
  const env = { SUPABASE_URL: "https://proj.supabase.co" };
  const user = await teamUserAnon(req("swiezy-token"), env, impl);
  assert.equal(user.email, "zesp@firma.pl");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].opts.headers.apikey, PUBLIC_SUPABASE.anonKey);
  assert.equal(calls[0].opts.headers.authorization, "Bearer swiezy-token");
  assert.match(calls[1].url, /\/rest\/v1\/rpc\/is_team$/);
  assert.equal(JSON.stringify(calls).includes("SERVICE_ROLE"), false);
  assert.equal(JSON.stringify(calls).includes("service_role"), false);

  const orig = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    const res = await extensionZipResponse(req("swiezy-token"), env);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/zip");
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  } finally {
    globalThis.fetch = orig;
  }
});

test("osoba spoza zespołu i brak tokenu nie dostają ZIP", async () => {
  const outsider = mockFetch({ team: false });
  assert.equal(await teamUserAnon(req("token"), { SUPABASE_URL: "https://proj.supabase.co" }, outsider.impl), null);
  const anon = mockFetch();
  assert.equal(await teamUserAnon(req(""), {}, anon.impl), null);
  assert.equal(anon.calls.length, 0);
  const res = await extensionZipResponse(req(""), { SUPABASE_URL: "https://proj.supabase.co" });
  assert.equal(res.status, 401);
});

test("panel odświeża token, gdy wygaśnie w ciągu minuty", async () => {
  const now = Date.parse("2026-11-10T22:00:00Z");
  assert.equal(sessionNeedsRefresh(Math.floor(now / 1000) + 30, now), true);
  assert.equal(sessionNeedsRefresh(Math.floor(now / 1000) + 120, now), false);
  assert.equal(sessionNeedsRefresh(0, now), true);
  let refreshed = 0;
  const sb = {
    auth: {
      async getSession() {
        return { data: { session: { access_token: "stary", expires_at: Math.floor(now / 1000) + 10 } } };
      },
      async refreshSession() {
        refreshed++;
        return { data: { session: { access_token: "nowy", expires_at: Math.floor(now / 1000) + 3600 } } };
      }
    }
  };
  assert.equal(await freshAccessToken(sb, now), "nowy");
  assert.equal(refreshed, 1);
  const fresh = {
    auth: {
      async getSession() {
        return { data: { session: { access_token: "aktualny", expires_at: Math.floor(now / 1000) + 3600 } } };
      },
      async refreshSession() { refreshed++; return { data: { session: null } }; }
    }
  };
  assert.equal(await freshAccessToken(fresh, now), "aktualny");
  assert.equal(refreshed, 1);
});
