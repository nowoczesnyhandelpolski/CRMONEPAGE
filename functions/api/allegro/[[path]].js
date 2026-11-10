import { json, readJson } from "../../_util.js";
import { allegroHeaders, productMatchUrl, productOfferDraft, publishPatch } from "../../../lib/allegro-offer.mjs";
import { parseMoney } from "../../../lib/pricing.mjs";
import { supabaseRest, teamUser } from "../../../lib/supabase-rest.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

function originOf(request, env) {
  return String(env.PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
}

function redirectUri(request, env) {
  return env.ALLEGRO_REDIRECT_URL || `${originOf(request, env)}/api/allegro/callback`;
}

function basic(env) {
  return btoa(`${env.ALLEGRO_CLIENT_ID}:${env.ALLEGRO_CLIENT_SECRET}`);
}

async function tokenRequest(env, form) {
  const res = await fetch("https://allegro.pl/auth/oauth/token", {
    method: "POST",
    headers: { authorization: `Basic ${basic(env)}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || "Allegro odrzuciło logowanie.");
    err.status = 502;
    throw err;
  }
  return data;
}

async function saveTokens(env, accountId, token) {
  const expires = new Date(Date.now() + (Number(token.expires_in) || 3600) * 1000).toISOString();
  await supabaseRest(env, "allegro_secrets?on_conflict=account_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { account_id: accountId, access_token: token.access_token, refresh_token: token.refresh_token, updated_at: new Date().toISOString() }
  });
  await supabaseRest(env, `allegro_accounts?id=eq.${accountId}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { expires_at: expires, last_error: null }
  });
  return token.access_token;
}

async function accessToken(env, accountId) {
  const accounts = await supabaseRest(env, `allegro_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,expires_at&limit=1`);
  const secrets = await supabaseRest(env, `allegro_secrets?account_id=eq.${encodeURIComponent(accountId)}&select=access_token,refresh_token&limit=1`);
  const account = accounts?.[0];
  const secret = secrets?.[0];
  if (!account || !secret) {
    const err = new Error("Najpierw połącz konto Allegro.");
    err.status = 409;
    throw err;
  }
  const exp = Date.parse(account.expires_at || 0);
  if (exp - Date.now() > 60_000) return secret.access_token;
  const token = await tokenRequest(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: secret.refresh_token }));
  return saveTokens(env, accountId, token);
}

async function allegroFetch(env, accountId, url, { method = "GET", body } = {}) {
  const run = async (token) => fetch(url, {
    method,
    headers: allegroHeaders(token),
    body: body == null ? undefined : JSON.stringify(body)
  });
  let token = await accessToken(env, accountId);
  let res = await run(token);
  if (res.status === 401) {
    const secrets = await supabaseRest(env, `allegro_secrets?account_id=eq.${encodeURIComponent(accountId)}&select=refresh_token&limit=1`);
    const refreshed = await tokenRequest(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: secrets?.[0]?.refresh_token || "" }));
    token = await saveTokens(env, accountId, refreshed);
    res = await run(token);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.errors?.[0]?.userMessage || data.errors?.[0]?.message || "Allegro odrzuciło żądanie.");
    err.status = res.status >= 500 ? 502 : 422;
    throw err;
  }
  return data;
}

export async function onRequest(context) {
  const { request, env } = context;
  const path = parts(context);
  try {
    if (!env.ALLEGRO_CLIENT_ID || !env.ALLEGRO_CLIENT_SECRET) {
      return json({ ok: false, error: "Brak ALLEGRO_CLIENT_ID albo ALLEGRO_CLIENT_SECRET w sekretach Cloudflare." }, 500);
    }
    if (request.method === "GET" && path[0] === "callback") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const back = `${originOf(request, env)}/?allegro=`;
      const rows = await supabaseRest(env, `allegro_oauth_states?state=eq.${encodeURIComponent(state)}&select=state,user_id&limit=1`);
      if (!code || !rows?.[0]) return Response.redirect(`${back}blad#aukcje`, 302);
      await supabaseRest(env, `allegro_oauth_states?state=eq.${encodeURIComponent(state)}`, { method: "DELETE", prefer: "return=minimal" });
      const token = await tokenRequest(env, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(request, env) }));
      const meRes = await fetch("https://api.allegro.pl/me", { headers: allegroHeaders(token.access_token) });
      const me = await meRes.json().catch(() => ({}));
      const created = await supabaseRest(env, "allegro_accounts?select=id", {
        method: "POST",
        prefer: "return=representation",
        body: {
          shop: me.login || "Allegro",
          login: me.login || null,
          seller_id: me.id || null,
          connected_by: rows[0].user_id,
          expires_at: new Date(Date.now() + (Number(token.expires_in) || 3600) * 1000).toISOString()
        }
      });
      await saveTokens(env, created[0].id, token);
      return Response.redirect(`${back}ok#aukcje`, 302);
    }

    const user = await teamUser(request, env);
    if (!user) return json({ ok: false, error: "Zaloguj się na konto zespołu." }, 401);

    if (request.method === "GET" && path[0] === "connect") {
      const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await supabaseRest(env, "allegro_oauth_states", { method: "POST", prefer: "return=minimal", body: { state, user_id: user.id } });
      const u = new URL("https://allegro.pl/auth/oauth/authorize");
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", env.ALLEGRO_CLIENT_ID);
      u.searchParams.set("redirect_uri", redirectUri(request, env));
      u.searchParams.set("state", state);
      if ((request.headers.get("accept") || "").includes("application/json")) return json({ ok: true, url: u.href });
      return Response.redirect(u.href, 302);
    }

    if (request.method === "GET" && path[0] === "accounts") {
      const rows = await supabaseRest(env, "allegro_accounts?select=id,shop,login,seller_id,expires_at,last_error,created_at&order=created_at.desc");
      return json({ ok: true, accounts: rows || [] });
    }

    const body = request.method === "GET" ? {} : await readJson(request, 80_000);
    const accountId = String(body.account_id || "");

    if (request.method === "POST" && path[0] === "match") {
      let productId = String(body.allegro_product_id || "").trim();
      if (!productId) {
        const data = await allegroFetch(env, accountId, productMatchUrl(body.ean));
        productId = data.products?.[0]?.id || "";
        if (!productId) return json({ ok: false, error: "Katalog Allegro nie ma produktu o tym EAN." }, 422);
      }
      if (body.auction_id) {
        await supabaseRest(env, `auctions?id=eq.${encodeURIComponent(body.auction_id)}`, {
          method: "PATCH", prefer: "return=minimal", body: { allegro_product_id: productId, updated_at: new Date().toISOString() }
        });
      }
      if (body.product_id) {
        await supabaseRest(env, `products?id=eq.${encodeURIComponent(body.product_id)}`, {
          method: "PATCH", prefer: "return=minimal", body: { allegro_product_id: productId, updated_at: new Date().toISOString() }
        });
      }
      return json({ ok: true, allegro_product_id: productId });
    }

    if (request.method === "POST" && path[0] === "draft") {
      if (body.confirm_draft !== true) return json({ ok: false, error: "Szkic wymaga potwierdzenia (confirm_draft)." }, 400);
      const auctions = await supabaseRest(env, `auctions?id=eq.${encodeURIComponent(body.auction_id || "")}&select=*&limit=1`);
      const auction = auctions?.[0];
      if (!auction) return json({ ok: false, error: "Nie ma takiej aukcji." }, 404);
      let productId = String(body.allegro_product_id || auction.allegro_product_id || "").trim();
      if (!productId && auction.ean) {
        const data = await allegroFetch(env, accountId, productMatchUrl(auction.ean));
        productId = data.products?.[0]?.id || "";
      }
      const price = parseMoney(body.price ?? auction.price);
      let sections = auction.description_sections;
      if (auction.product_id) {
        const products = await supabaseRest(env, `products?id=eq.${encodeURIComponent(auction.product_id)}&select=generated&limit=1`);
        const offer = products?.[0]?.generated?.copy?.offer_sections;
        if (Array.isArray(offer) && offer.length) sections = offer.map((text) => ({ type: "text", text }));
      }
      const draft = productOfferDraft({
        price,
        allegro_product_id: productId,
        handling_time: body.handling_time,
        shipping_rate_id: body.shipping_rate_id,
        name: auction.name || auction.catalog_name,
        catalog_name: auction.catalog_name,
        description_sections: sections,
        stock: auction.stock
      });
      const created = await allegroFetch(env, accountId, "https://api.allegro.pl/sale/product-offers", { method: "POST", body: draft });
      const offerId = created.id;
      await supabaseRest(env, `auctions?id=eq.${auction.id}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { allegro_offer_id: offerId, allegro_product_id: productId, account_id: accountId, status: "inactive", updated_at: new Date().toISOString() }
      });
      const drafts = await supabaseRest(env, "listing_drafts?select=id", {
        method: "POST",
        prefer: "return=representation",
        body: { auction_id: auction.id, product_id: auction.product_id, account_id: accountId, name: draft.name, price, status: "inactive", offer_id: offerId, payload: { publication: "INACTIVE" } }
      });
      await supabaseRest(env, "listing_items", {
        method: "POST",
        prefer: "return=minimal",
        body: { draft_id: drafts?.[0]?.id, account_id: accountId, product_id: auction.product_id, name: draft.name, status: "inactive", offer_id: offerId }
      });
      return json({ ok: true, offer_id: offerId, publication: "INACTIVE" });
    }

    if (request.method === "POST" && path[0] === "publish") {
      if (body.confirm_publish !== true) return json({ ok: false, error: "Publikacja wymaga osobnego potwierdzenia." }, 400);
      const offerId = String(body.offer_id || "");
      const owned = await supabaseRest(env, `auctions?allegro_offer_id=eq.${encodeURIComponent(offerId)}&select=id&limit=1`);
      if (!owned?.[0]) return json({ ok: false, error: "To nie jest szkic utworzony w Centrali." }, 404);
      await allegroFetch(env, accountId, `https://api.allegro.pl/sale/product-offers/${encodeURIComponent(offerId)}`, { method: "PATCH", body: publishPatch() });
      await supabaseRest(env, `auctions?id=eq.${owned[0].id}`, { method: "PATCH", prefer: "return=minimal", body: { status: "active", updated_at: new Date().toISOString() } });
      return json({ ok: true, offer_id: offerId, publication: "ACTIVE" });
    }

    if (request.method === "POST" && path[0] === "fee-preview") {
      const price = parseMoney(body.price);
      if (price == null) return json({ ok: false, error: "Podgląd prowizji wymaga ceny. Nie zgadujemy jej." }, 422);
      if (!body.category_id) return json({ ok: false, error: "Podaj id kategorii Allegro." }, 422);
      const data = await allegroFetch(env, accountId, "https://api.allegro.pl/pricing/offer-fee-preview", {
        method: "POST",
        body: {
          offer: {
            category: { id: String(body.category_id) },
            sellingMode: { format: "BUY_NOW", price: { amount: price.toFixed(2), currency: "PLN" } }
          }
        }
      });
      return json({ ok: true, preview: data });
    }

    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404);
  } catch (err) {
    const status = err.status || 500;
    console.log(JSON.stringify({ msg: "allegro_error", status, error: String(err.message || err).slice(0, 240) }));
    if (path[0] === "callback") return Response.redirect(`${originOf(request, env)}/?allegro=blad#aukcje`, 302);
    return json({ ok: false, error: status >= 500 && status !== 500 ? "Błąd połączenia z Allegro." : (err.message || "Błąd Allegro.") }, status >= 500 ? 500 : status);
  }
}
