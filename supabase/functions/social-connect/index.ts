// Podłączanie kont social media sklepu (OAuth): Meta (Facebook Page + Instagram Business), TikTok, YouTube (Google) i X.
// POST {shop_id, provider} z tokenem zalogowanego członka zespołu -> {url} do autoryzacji.
// GET ?code&state -> wymiana kodu na tokeny, zapis kont, powrót do panelu.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.97.0";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SELF = `${SB_URL}/functions/v1/social-connect`;
const PANEL = Deno.env.get("PANEL_URL") ?? "https://panel.nowoczesnyhandelpolski.pl/";
const GV = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
const META_ID = Deno.env.get("META_APP_ID") ?? "";
const META_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const TT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
const TT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const X_ID = Deno.env.get("X_CLIENT_ID") ?? "";
const X_SECRET = Deno.env.get("X_CLIENT_SECRET") ?? "";
const META_SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_metadata",
  "instagram_basic", "instagram_content_publish", "instagram_manage_insights", "business_management",
].join(",");
const TT_SCOPES = "user.info.basic,user.info.stats,video.publish,video.upload";
const G_SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
const X_SCOPES = "tweet.read tweet.write users.read media.write offline.access";
const PROVIDERS = ["meta", "tiktok", "google", "x"];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };

// Parametry przed hashem — panel rozpoznaje widok po samym #social-media.
const back = (q: string) => Response.redirect(`${PANEL}?${q}#social-media`, 302);

async function log(shop: string, message: string, level = "info", meta = {}) {
  await sb.from("social_log").insert({ shop_id: shop, level, message, meta });
}

async function saveAccount(shop: string, platform: string, acc: Record<string, unknown>, token: { access_token: string; refresh_token?: string | null; expires_at?: string | null }) {
  const { data, error } = await sb.from("social_accounts").upsert({
    shop_id: shop, platform, status: "polaczone", last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...acc,
  }, { onConflict: "shop_id,platform" }).select("id").single();
  if (error) throw error;
  await sb.from("social_secrets").upsert({ account_id: data.id, ...token, updated_at: new Date().toISOString() });
}

async function metaCallback(shop: string, code: string) {
  const g = (path: string, params: Record<string, string>) =>
    fetch(`https://graph.facebook.com/${GV}/${path}?${new URLSearchParams(params)}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `Graph ${r.status}`);
      return j;
    });
  const short = await g("oauth/access_token", { client_id: META_ID, client_secret: META_SECRET, redirect_uri: SELF, code });
  const long = await g("oauth/access_token", { grant_type: "fb_exchange_token", client_id: META_ID, client_secret: META_SECRET, fb_exchange_token: short.access_token });
  const pages = await g("me/accounts", { access_token: long.access_token, fields: "id,name,link,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}", limit: "100" });
  if (!pages.data?.length) throw new Error("Brak stron Facebook na tym koncie. Najpierw załóż stronę sklepu.");

  // Jedna strona FB = jeden sklep. Wybieramy stronę o nazwie sklepu albo pierwszą, która nie jest przypisana do innego sklepu.
  const { data: shopRec } = await sb.from("records").select("data").eq("col", "shops").eq("id", shop).maybeSingle();
  const shopName = String(shopRec?.data?.name ?? "").toLowerCase();
  const { data: taken } = await sb.from("social_accounts").select("external_id, shop_id").eq("platform", "facebook").neq("shop_id", shop);
  const takenIds = new Set((taken ?? []).map((t) => t.external_id));
  const free = pages.data.filter((p: { id: string }) => !takenIds.has(p.id));
  const page = free.find((p: { name: string }) => shopName && p.name.toLowerCase().includes(shopName)) ?? free[0];
  if (!page) throw new Error("Wszystkie strony FB z tego konta są już przypisane do innych sklepów.");

  await saveAccount(shop, "facebook", { external_id: page.id, display_name: page.name, profile_url: page.link ?? `https://facebook.com/${page.id}` }, { access_token: page.access_token });
  const ig = page.instagram_business_account;
  if (ig?.id) {
    await saveAccount(shop, "instagram", {
      external_id: ig.id, handle: ig.username, display_name: ig.username, profile_url: `https://instagram.com/${ig.username}`,
      stats: { followers: ig.followers_count ?? 0 },
    }, { access_token: page.access_token });
  } else {
    await log(shop, "Strona FB połączona, ale nie ma podpiętego konta Instagram (firmowego). Podepnij IG do strony i połącz ponownie.", "warn");
  }
  return ig?.id ? "facebook,instagram" : "facebook";
}

async function tiktokCallback(shop: string, code: string, verifier: string | null) {
  const body = new URLSearchParams({ client_key: TT_KEY, client_secret: TT_SECRET, code, grant_type: "authorization_code", redirect_uri: SELF });
  if (verifier) body.set("code_verifier", verifier);
  const tok = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }).then((r) => r.json());
  if (!tok.access_token) throw new Error(tok.error_description ?? tok.error ?? "TikTok: brak tokenu");
  const info = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url,follower_count", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json());
  const u = info?.data?.user ?? {};
  await saveAccount(shop, "tiktok", {
    external_id: tok.open_id, handle: u.username ?? null, display_name: u.display_name ?? null,
    profile_url: u.username ? `https://www.tiktok.com/@${u.username}` : null, stats: { followers: u.follower_count ?? 0 },
  }, { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString() });
  return "tiktok";
}

// YouTube: kanał sklepu na koncie Google. Token odświeżany w autopilocie (refresh_token wymaga access_type=offline + prompt=consent).
async function googleCallback(shop: string, code: string) {
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, code, grant_type: "authorization_code", redirect_uri: SELF }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error(tok.error_description ?? tok.error ?? "Google: brak tokenu");
  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json());
  const c = ch?.items?.[0];
  if (!c) throw new Error("To konto Google nie ma kanału YouTube. Załóż kanał sklepu i połącz ponownie.");
  await saveAccount(shop, "youtube", {
    external_id: c.id, handle: c.snippet?.customUrl ?? null, display_name: c.snippet?.title ?? null,
    profile_url: `https://www.youtube.com/channel/${c.id}`, stats: { followers: Number(c.statistics?.subscriberCount ?? 0) },
  }, { access_token: tok.access_token, refresh_token: tok.refresh_token ?? null, expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString() });
  return "youtube";
}

async function xCallback(shop: string, code: string, verifier: string | null) {
  const tok = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${X_ID}:${X_SECRET}`) },
    body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: SELF, code_verifier: verifier ?? "" }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error(tok.error_description ?? tok.error ?? "X: brak tokenu");
  const me = await fetch("https://api.x.com/2/users/me?user.fields=public_metrics,username,name", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json());
  const u = me?.data ?? {};
  await saveAccount(shop, "x", {
    external_id: u.id ?? null, handle: u.username ?? null, display_name: u.name ?? null,
    profile_url: u.username ? `https://x.com/${u.username}` : null, stats: { followers: u.public_metrics?.followers_count ?? 0 },
  }, { access_token: tok.access_token, refresh_token: tok.refresh_token ?? null, expires_at: new Date(Date.now() + (tok.expires_in ?? 7200) * 1000).toISOString() });
  return "x";
}

const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code");
    const { data: st } = await sb.from("social_oauth_states").delete().eq("state", state).select("*").maybeSingle();
    if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return back("blad=" + encodeURIComponent("Link wygasł, spróbuj ponownie"));
    if (!code) return back("blad=" + encodeURIComponent(url.searchParams.get("error_description") ?? "Anulowano"));
    try {
      const done = st.provider === "meta" ? await metaCallback(st.shop_id, code)
        : st.provider === "google" ? await googleCallback(st.shop_id, code)
        : st.provider === "x" ? await xCallback(st.shop_id, code, st.code_verifier)
        : await tiktokCallback(st.shop_id, code, st.code_verifier);
      await log(st.shop_id, `Połączono: ${done}`);
      return back("polaczono=" + done);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await log(st.shop_id, `Błąd łączenia ${st.provider}: ${msg}`, "error");
      return back("blad=" + encodeURIComponent(msg));
    }
  }

  // POST: start autoryzacji — tylko dla zalogowanego zespołu.
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: user } = await sb.auth.getUser(jwt);
  const email = user?.user?.email?.toLowerCase();
  const { data: allowed } = email ? await sb.from("allowed_emails").select("email").eq("email", email).maybeSingle() : { data: null };
  if (!allowed) return Response.json({ error: "Brak dostępu" }, { status: 403, headers: cors });

  const { shop_id, provider } = await req.json().catch(() => ({}));
  if (typeof shop_id !== "string" || !PROVIDERS.includes(provider)) return Response.json({ error: "Złe dane" }, { status: 400, headers: cors });
  const missing = provider === "meta" && (!META_ID || !META_SECRET) ? "META_APP_ID / META_APP_SECRET"
    : provider === "tiktok" && (!TT_KEY || !TT_SECRET) ? "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET"
    : provider === "google" && (!G_ID || !G_SECRET) ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
    : provider === "x" && (!X_ID || !X_SECRET) ? "X_CLIENT_ID / X_CLIENT_SECRET" : "";
  if (missing) return Response.json({ error: `Brak ${missing} w sekretach funkcji` }, { status: 400, headers: cors });

  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  let verifier: string | null = null;
  let authUrl: string;
  if (provider === "meta") {
    authUrl = `https://www.facebook.com/${GV}/dialog/oauth?` + new URLSearchParams({ client_id: META_ID, redirect_uri: SELF, state, scope: META_SCOPES, response_type: "code" });
  } else if (provider === "google") {
    authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: G_ID, redirect_uri: SELF, response_type: "code", scope: G_SCOPES, state, access_type: "offline", prompt: "consent", include_granted_scopes: "true",
    });
  } else {
    verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    authUrl = provider === "x"
      ? "https://x.com/i/oauth2/authorize?" + new URLSearchParams({
        response_type: "code", client_id: X_ID, redirect_uri: SELF, scope: X_SCOPES, state, code_challenge: challenge, code_challenge_method: "S256",
      })
      : "https://www.tiktok.com/v2/auth/authorize/?" + new URLSearchParams({
        client_key: TT_KEY, scope: TT_SCOPES, response_type: "code", redirect_uri: SELF, state, code_challenge: challenge, code_challenge_method: "S256",
      });
  }
  await sb.from("social_oauth_states").insert({ state, shop_id, provider, user_id: user!.user!.id, code_verifier: verifier });
  await sb.from("social_shops").upsert({ shop_id }, { onConflict: "shop_id", ignoreDuplicates: true });
  return Response.json({ url: authUrl }, { headers: cors });
});
