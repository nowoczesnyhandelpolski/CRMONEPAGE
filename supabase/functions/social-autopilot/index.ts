// Autopilot social mediów: dla każdego sklepu (records col='shops') buduje markę i strategię,
// planuje i pisze posty (Claude, trendy z Groka lub wyszukiwarki Claude), dobiera grafiki i publikuje
// na Facebooku, Instagramie, TikToku, YouTube (Shorts) i X. Uruchamiany co 15 minut przez pg_cron. Panel tylko podgląda.
// YouTube i X dostają posty dopiero, gdy konto sklepu jest połączone (nie zużywamy Claude na pustą kolejkę).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.97.0";
import Anthropic from "npm:@anthropic-ai/sdk";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MODEL = Deno.env.get("SOCIAL_MODEL") ?? "claude-opus-5-5";
const XAI_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const XAI_MODEL = Deno.env.get("XAI_MODEL") ?? "grok-4";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1";
const GV = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
const PAGE_BASE = (Deno.env.get("PAGE_BASE_URL") ?? "https://panel.nowoczesnyhandelpolski.pl/p/").replace(/\/?$/, "/");
const TT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
const TT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const X_ID = Deno.env.get("X_CLIENT_ID") ?? "";
const X_SECRET = Deno.env.get("X_CLIENT_SECRET") ?? "";
// TikTok pobiera zdjęcia tylko z zweryfikowanej domeny — np. https://media.nowoczesnyhandelpolski.pl/ jako proxy do Storage.
const TT_MEDIA_BASE = Deno.env.get("TIKTOK_MEDIA_BASE") ?? "";
const STORAGE_PUBLIC = `${SB_URL}/storage/v1/object/public/`;
const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube", "x"] as const;
type Platform = typeof PLATFORMS[number];
// Te trzy zakładamy każdemu sklepowi (kolejka czeka na połączenie); YouTube i X planujemy tylko po połączeniu.
const BASE_PLATFORMS: Platform[] = ["facebook", "instagram", "tiktok"];
const STRATEGY_TTL_DAYS = 7;
const HORIZON_DAYS = 2;
const MAX_PUBLISH_PER_TICK = 6;

const claude = Deno.env.get("ANTHROPIC_API_KEY") ? new Anthropic() : null;

async function log(shop: string | null, message: string, level = "info", meta: Record<string, unknown> = {}) {
  await sb.from("social_log").insert({ shop_id: shop, level, message, meta });
}

// ---------- Claude ----------

// deno-lint-ignore no-explicit-any
async function ask(system: string, user: string, opts: { schema?: Record<string, unknown>; webSearch?: boolean } = {}): Promise<any> {
  if (!claude) throw new Error("Brak ANTHROPIC_API_KEY w sekretach funkcji");
  // deno-lint-ignore no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "medium", ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}) },
  };
  if (opts.webSearch) params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];
  let res;
  try {
    res = await claude.beta.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new Error("Claude: limit zapytań, spróbuję w następnym cyklu");
    if (e instanceof Anthropic.APIError) throw new Error(`Claude ${e.status}: ${e.message}`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new Error("Claude odmówił wygenerowania treści");
  // deno-lint-ignore no-explicit-any
  const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  return opts.schema ? JSON.parse(text) : text;
}

async function grokTrends(niche: string): Promise<string> {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${XAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: XAI_MODEL,
      messages: [{
        role: "user",
        content: `Jakie są w tym tygodniu najmocniejsze trendy na TikToku, Instagram Reels i Facebooku w Polsce dla niszy: "${niche}"? ` +
          "Podaj formaty, haczyki (hooki), dźwięki/motywy, hashtagi i tematy, które teraz rosną. Konkretnie, w punktach, po polsku.",
      }],
    }),
  });
  if (!r.ok) throw new Error(`Grok ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

const STRATEGY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["brand", "strategy"],
  properties: {
    brand: {
      type: "object", additionalProperties: false,
      required: ["profile_name", "handle_ideas", "bio_facebook", "bio_instagram", "bio_tiktok", "tone", "persona", "avatar_prompt", "colors"],
      properties: {
        profile_name: { type: "string" }, handle_ideas: { type: "array", items: { type: "string" } },
        bio_facebook: { type: "string" }, bio_instagram: { type: "string" }, bio_tiktok: { type: "string" },
        tone: { type: "string" }, persona: { type: "string" }, avatar_prompt: { type: "string" },
        colors: { type: "array", items: { type: "string" } },
      },
    },
    strategy: {
      type: "object", additionalProperties: false,
      required: ["pillars", "formats", "best_hours", "hashtags_core", "cta_style", "do", "dont"],
      properties: {
        pillars: {
          type: "array",
          items: { type: "object", additionalProperties: false, required: ["name", "share_pct", "idea"], properties: { name: { type: "string" }, share_pct: { type: "integer" }, idea: { type: "string" } } },
        },
        formats: { type: "array", items: { type: "string" } },
        best_hours: { type: "array", items: { type: "integer" } },
        hashtags_core: { type: "array", items: { type: "string" } },
        cta_style: { type: "string" },
        do: { type: "array", items: { type: "string" } },
        dont: { type: "array", items: { type: "string" } },
      },
    },
  },
};

const POSTS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["platform", "kind", "pillar", "hook", "caption", "hashtags", "page_slug", "image_prompt", "reel_script"],
        properties: {
          platform: { type: "string", enum: [...PLATFORMS] },
          kind: { type: "string", enum: ["post", "carousel", "reel"] },
          pillar: { type: "string" }, hook: { type: "string" }, caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          page_slug: { type: "string" }, image_prompt: { type: "string" },
          reel_script: {
            type: "object", additionalProperties: false, required: ["scenes", "sound_idea"],
            properties: {
              scenes: {
                type: "array",
                items: { type: "object", additionalProperties: false, required: ["seconds", "visual", "text_overlay", "voiceover"], properties: { seconds: { type: "integer" }, visual: { type: "string" }, text_overlay: { type: "string" }, voiceover: { type: "string" } } },
              },
              sound_idea: { type: "string" },
            },
          },
        },
      },
    },
  },
};

// ---------- dane sklepu ----------

type Prod = { slug: string; name: string; price: number | null; photos: string[]; video: string | null; product_id: string | null };

async function shopProducts(shopId: string): Promise<Prod[]> {
  const { data: pages } = await sb.from("pages").select("id, slug, name, status, product_id, data").eq("shop_id", shopId).eq("status", "published").limit(40);
  const { data: media } = await sb.from("media").select("page_id, kind, public_url").in("page_id", (pages ?? []).map((p) => p.id));
  return (pages ?? []).map((p) => {
    const own = (media ?? []).filter((m) => m.page_id === p.id && m.public_url);
    // Publikujemy tylko materiały, do których mamy prawa (rights=true albo własne pliki z biblioteki mediów).
    const licensed = (p.data?.images ?? []).filter((i: { rights?: boolean; url?: string }) => i?.rights && i.url).map((i: { url: string }) => i.url);
    const video = own.find((m) => m.kind === "video")?.public_url ?? (p.data?.video?.rights && p.data?.video?.url ? p.data.video.url : null);
    return {
      slug: p.slug, name: p.name, price: Number(p.data?.price) || null, product_id: p.product_id,
      photos: [...own.filter((m) => m.kind === "image").map((m) => m.public_url as string), ...licensed].slice(0, 10), video,
    };
  });
}

async function ensureShops() {
  const { data: shops } = await sb.from("records").select("id, data").eq("col", "shops");
  for (const s of shops ?? []) {
    await sb.from("social_shops").upsert({ shop_id: s.id }, { onConflict: "shop_id", ignoreDuplicates: true });
    for (const platform of BASE_PLATFORMS) {
      await sb.from("social_accounts").upsert({ shop_id: s.id, platform }, { onConflict: "shop_id,platform", ignoreDuplicates: true });
    }
  }
  return new Map((shops ?? []).map((s) => [s.id as string, s.data as Record<string, string>]));
}

// ---------- strategia ----------

async function refreshStrategy(shopId: string, shop: Record<string, string>, products: Prod[]) {
  const niche = shop.niche || products.slice(0, 5).map((p) => p.name).join(", ");
  if (!niche) return null;
  let trends = "";
  try {
    trends = XAI_KEY ? await grokTrends(niche) : await ask(
      "Jesteś analitykiem trendów social media na rynku polskim. Odpowiadasz zwięźle, w punktach, po polsku.",
      `Sprawdź w sieci, co w tym tygodniu działa na TikToku, Instagram Reels i Facebooku w Polsce w niszy: "${niche}". Formaty, hooki, motywy, hashtagi, tematy.`,
      { webSearch: true },
    );
  } catch (e) {
    await log(shopId, `Research trendów nieudany: ${e instanceof Error ? e.message : e}`, "warn");
  }
  const out = await ask(
    "Jesteś strategiem social media dla polskich sklepów internetowych (dropshipping). Budujesz profile, które rosną organicznie: " +
      "jasna persona, rozpoznawalny styl, treści głównie wartościowe i rozrywkowe, sprzedaż w maks. 1 na 4 posty. " +
      "Piszesz naturalnym polskim językiem, bez obietnic bez pokrycia, bez fałszywych opinii i bez udawania klientów. " +
      "Treści są tworzone z pomocą AI — nie ukrywaj tego, gdy platforma o to pyta.",
    `Sklep: ${shop.name ?? shopId}\nNisza: ${niche}\nDomena: ${shop.domain ?? "-"}\n` +
      `Produkty: ${products.slice(0, 20).map((p) => `${p.name}${p.price ? ` (${p.price} zł)` : ""}`).join("; ") || "brak opublikowanych"}\n\n` +
      `Trendy z tego tygodnia:\n${trends || "brak danych"}\n\n` +
      "Zaprojektuj markę profilu (nazwa, propozycje nazw użytkownika, bio dla FB/IG/TikTok, ton, persona, prompt na avatar, kolory) " +
      "i strategię: 3–5 filarów treści z udziałem %, formaty, najlepsze godziny publikacji (czas polski, pełne godziny), stałe hashtagi, styl CTA, zasady rób/nie rób.",
    { schema: STRATEGY_SCHEMA },
  );
  await sb.from("social_shops").update({
    brand: out.brand, strategy: out.strategy, trends: { text: trends, source: XAI_KEY ? "grok" : "claude_web_search" },
    strategy_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("shop_id", shopId);
  await log(shopId, "Zaktualizowano markę i strategię");
  return out;
}

// ---------- plan i generowanie ----------

function warsawHourToUtc(day: Date, hour: number) {
  // Europe/Warsaw = UTC+1 zimą, UTC+2 latem.
  const probe = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12));
  const offset = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(probe)) - 12;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - offset, Math.floor(Math.random() * 20)));
}

function freeSlots(hours: number[], taken: Date[], count: number) {
  const hrs = (hours.length ? hours : [12, 19]).filter((h) => h >= 6 && h <= 23).sort((a, b) => a - b);
  const slots: Date[] = [];
  const now = Date.now();
  for (let d = 0; d <= HORIZON_DAYS + 1 && slots.length < count; d++) {
    const day = new Date(now + d * 86400_000);
    for (const h of hrs) {
      const t = warsawHourToUtc(day, h);
      if (t.getTime() < now + 20 * 60_000) continue;
      if (taken.some((x) => Math.abs(x.getTime() - t.getTime()) < 90 * 60_000)) continue;
      slots.push(t);
      if (slots.length >= count) break;
    }
  }
  return slots;
}

async function generateImage(shopId: string, prompt: string): Promise<string | null> {
  if (!OPENAI_KEY || !prompt) return null;
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size: "1024x1024", n: 1 }),
  });
  if (!r.ok) {
    await log(shopId, `Grafika AI nieudana: ${r.status}`, "warn");
    return null;
  }
  const b64 = (await r.json()).data?.[0]?.b64_json;
  if (!b64) return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `social/${shopId}/${crypto.randomUUID()}.png`;
  const up = await sb.storage.from("media").upload(path, bytes, { contentType: "image/png" });
  if (up.error) return null;
  return `${STORAGE_PUBLIC}media/${path}`;
}

async function planShop(shopId: string, cfg: Record<string, unknown>, shop: Record<string, string>, products: Prod[]) {
  const perDay = Number(cfg.posts_per_day ?? 1);
  if (perDay <= 0) return;
  const target = Math.ceil(perDay * HORIZON_DAYS);
  const { data: future } = await sb.from("social_posts").select("platform, scheduled_at")
    .eq("shop_id", shopId).in("status", ["zaplanowany", "do_akceptacji", "czeka_na_wideo"]).gt("scheduled_at", new Date().toISOString());
  const { data: accounts } = await sb.from("social_accounts").select("id, platform, status").eq("shop_id", shopId);
  const connected = new Set((accounts ?? []).filter((a) => a.status === "polaczone").map((a) => a.platform));
  const active = PLATFORMS.filter((p) => BASE_PLATFORMS.includes(p) || connected.has(p));
  const need = Object.fromEntries(PLATFORMS.map((p) => [p, 0])) as Record<Platform, number>;
  for (const p of active) need[p] = Math.max(0, target - (future ?? []).filter((f) => f.platform === p).length);
  const total = PLATFORMS.reduce((s, p) => s + need[p], 0);
  if (!total) return;

  const strategy = cfg.strategy as Record<string, unknown>;
  const brand = cfg.brand as Record<string, unknown>;
  const { data: recent } = await sb.from("social_posts").select("hook, platform").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(30);
  const out = await ask(
    "Jesteś twórcą treści social media dla polskiego sklepu. Piszesz posty, które zatrzymują scroll: mocny hook w pierwszej linii, " +
      "krótkie akapity, emoji z umiarem, jedno CTA. Dopasowujesz styl do platformy (TikTok: luźno i szybko; IG: estetycznie; FB: konkretnie; " +
      "YouTube: wyłącznie Shorts, kind=reel, hook to tytuł do 90 znaków, caption to opis; X: krótko i dowcipnie, caption do 220 znaków, maks. 2 hashtagi). " +
      "Nie wymyślasz opinii klientów, liczby sprzedanych sztuk ani certyfikatów. Ceny podajesz tylko z listy produktów. " +
      "Pole image_prompt wypełniasz tylko dla postów bez licencjonowanych zdjęć: opisz grafikę (porada, infografika, klimat, cytat) — " +
      "nigdy nie udawaj zdjęcia konkretnego produktu. reel_script wypełniasz dla kind=reel, dla innych zostaw pustą listę scen.",
    `Marka: ${JSON.stringify(brand)}\nStrategia: ${JSON.stringify(strategy)}\nTrendy: ${JSON.stringify((cfg.trends as Record<string, unknown>)?.text ?? "")}\n` +
      `Sklep: ${shop.name ?? shopId}\n` +
      `Produkty (slug | nazwa | cena | czy są licencjonowane zdjęcia | czy jest wideo):\n` +
      (products.map((p) => `${p.slug} | ${p.name} | ${p.price ?? "-"} zł | ${p.photos.length ? "tak" : "nie"} | ${p.video ? "tak" : "nie"}`).join("\n") || "brak") +
      `\n\nOstatnie hooki (nie powtarzaj): ${(recent ?? []).map((r) => r.hook).filter(Boolean).join(" / ") || "-"}\n\n` +
      `Napisz: ${PLATFORMS.filter((p) => need[p]).map((p) => `${need[p]} postów na ${p}`).join(", ")}. ` +
      "Mieszaj filary według udziałów. Na TikTok i Instagram co najmniej co trzeci post to kind=reel ze scenariuszem. " +
      "page_slug ustaw na slug produktu, gdy post go dotyczy, inaczej pusty string.",
    { schema: POSTS_SCHEMA },
  );

  const taken = (future ?? []).map((f) => new Date(f.scheduled_at));
  const hours = ((strategy?.best_hours as number[]) ?? []).map(Number);
  const requireApproval = Boolean(cfg.require_approval);
  const core = ((strategy?.hashtags_core as string[]) ?? []).slice(0, 5);

  for (const platform of PLATFORMS) {
    if (!need[platform]) continue;
    // deno-lint-ignore no-explicit-any
    const posts = (out.posts as Array<Record<string, any>>).filter((p) => p.platform === platform).slice(0, need[platform]);
    const slots = freeSlots(hours, taken, posts.length);
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      const prod = products.find((x) => x.slug === p.page_slug);
      let kind = platform === "youtube" ? "reel" : p.kind as string;
      let media: Array<{ type: string; url: string }> = [];
      let status = requireApproval ? "do_akceptacji" : "zaplanowany";
      let error: string | null = null;
      if (kind === "reel") {
        if (prod?.video) media = [{ type: "video", url: prod.video }];
        else status = "czeka_na_wideo";
      } else {
        const photos = prod?.photos ?? [];
        media = photos.slice(0, kind === "carousel" ? (platform === "x" ? 4 : 10) : 1).map((url) => ({ type: "image", url }));
        if (!media.length) {
          const img = await generateImage(shopId, p.image_prompt);
          if (img) media = [{ type: "image", url: img }];
        }
        if (media.length < 2) kind = "post";
        if (!media.length && platform !== "facebook" && platform !== "x") {
          status = "szkic";
          error = "Brak grafiki z prawami do publikacji (dodaj zdjęcia w bibliotece mediów albo OPENAI_API_KEY)";
        }
      }
      const maxTags = platform === "instagram" ? 12 : platform === "x" ? 2 : 6;
      const hashtags = [...new Set([...(p.hashtags ?? []), ...core].map((h: string) => h.replace(/^#?/, "#").replace(/\s+/g, "")))].slice(0, maxTags);
      const slot = slots[i] ?? new Date(Date.now() + (i + 1) * 6 * 3600_000);
      taken.push(slot);
      await sb.from("social_posts").insert({
        shop_id: shopId, platform, account_id: accounts?.find((a) => a.platform === platform)?.id ?? null,
        kind, status, scheduled_at: slot.toISOString(), pillar: p.pillar, hook: p.hook, caption: p.caption, hashtags,
        media, script: kind === "reel" || p.kind === "reel" ? p.reel_script : {}, product_id: prod?.product_id ?? null,
        page_slug: prod?.slug ?? null, model: MODEL, error,
      });
    }
  }
  await log(shopId, `Zaplanowano ${total} postów na ${HORIZON_DAYS} dni`);
}

// ---------- publikacja ----------

async function graph(path: string, params: Record<string, string>, token: string, method = "POST") {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const r = method === "GET"
    ? await fetch(`https://graph.facebook.com/${GV}/${path}?${qs}`)
    : await fetch(`https://graph.facebook.com/${GV}/${path}`, { method, body: qs });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j?.error?.message ?? `Graph ${r.status}`);
  return j;
}

async function waitContainer(id: string, token: string, maxMs: number) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const s = await graph(id, { fields: "status_code" }, token, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram: kontener ${s.status_code}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Instagram: przetwarzanie trwa za długo, ponowię");
}

// deno-lint-ignore no-explicit-any
const fullCaption = (post: Record<string, any>, withLink: boolean) =>
  [post.caption, withLink && post.page_slug ? `👉 ${PAGE_BASE}${post.page_slug}` : "", (post.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n");

// deno-lint-ignore no-explicit-any
async function publishInstagram(post: any, igId: string, token: string) {
  const media = post.media as Array<{ type: string; url: string }>;
  if (!media.length) throw new Error("Instagram wymaga grafiki lub wideo");
  const caption = fullCaption(post, false);
  let creation: string;
  if (media[0].type === "video") {
    creation = (await graph(`${igId}/media`, { media_type: "REELS", video_url: media[0].url, caption, share_to_feed: "true" }, token)).id;
    await waitContainer(creation, token, 50_000);
  } else if (media.length > 1) {
    const children: string[] = [];
    for (const m of media) children.push((await graph(`${igId}/media`, { image_url: m.url, is_carousel_item: "true" }, token)).id);
    creation = (await graph(`${igId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption }, token)).id;
    await waitContainer(creation, token, 30_000);
  } else {
    creation = (await graph(`${igId}/media`, { image_url: media[0].url, caption }, token)).id;
    await waitContainer(creation, token, 20_000);
  }
  const pub = await graph(`${igId}/media_publish`, { creation_id: creation }, token);
  const info = await graph(pub.id, { fields: "permalink" }, token, "GET").catch(() => ({}));
  return { external_id: pub.id, permalink: (info as { permalink?: string }).permalink ?? null };
}

// deno-lint-ignore no-explicit-any
async function publishFacebook(post: any, pageId: string, token: string) {
  const media = post.media as Array<{ type: string; url: string }>;
  const message = fullCaption(post, true);
  let id: string;
  if (!media.length) {
    id = (await graph(`${pageId}/feed`, { message }, token)).id;
  } else if (media[0].type === "video") {
    id = (await graph(`${pageId}/videos`, { file_url: media[0].url, description: message }, token)).id;
  } else if (media.length === 1) {
    const r = await graph(`${pageId}/photos`, { url: media[0].url, message }, token);
    id = r.post_id ?? r.id;
  } else {
    const params: Record<string, string> = { message };
    for (let i = 0; i < media.length; i++) {
      const ph = await graph(`${pageId}/photos`, { url: media[i].url, published: "false" }, token);
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: ph.id });
    }
    id = (await graph(`${pageId}/feed`, params, token)).id;
  }
  return { external_id: id, permalink: `https://www.facebook.com/${id}` };
}

// Odświeżanie tokenu OAuth 2 (TikTok, Google, X) — zapis nowego tokenu w social_secrets.
async function oauthToken(accountId: string, platform: "tiktok" | "youtube" | "x") {
  const { data: sec } = await sb.from("social_secrets").select("*").eq("account_id", accountId).single();
  if (sec.expires_at && new Date(sec.expires_at).getTime() > Date.now() + 5 * 60_000) return sec.access_token as string;
  if (!sec.refresh_token) throw new Error(`${platform}: brak refresh tokenu — połącz konto ponownie`);
  // deno-lint-ignore no-explicit-any
  let tok: any;
  if (platform === "tiktok") {
    tok = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: TT_KEY, client_secret: TT_SECRET, grant_type: "refresh_token", refresh_token: sec.refresh_token }),
    }).then((r) => r.json());
  } else if (platform === "youtube") {
    tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, grant_type: "refresh_token", refresh_token: sec.refresh_token }),
    }).then((r) => r.json());
  } else {
    tok = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${X_ID}:${X_SECRET}`) },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: sec.refresh_token, client_id: X_ID }),
    }).then((r) => r.json());
  }
  if (!tok.access_token) throw new Error(`${platform}: odświeżenie tokenu nieudane — połącz konto ponownie`);
  await sb.from("social_secrets").update({
    access_token: tok.access_token, refresh_token: tok.refresh_token ?? sec.refresh_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("account_id", accountId);
  return tok.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function publishTiktok(post: any, accountId: string) {
  const media = post.media as Array<{ type: string; url: string }>;
  if (!media.length) throw new Error("TikTok wymaga zdjęć lub wideo");
  const token = await oauthToken(accountId, "tiktok");
  const tt = async (path: string, body: unknown) => {
    const r = await fetch(`https://open.tiktokapis.com/v2/${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.error?.code && j.error.code !== "ok") throw new Error(`TikTok: ${j.error.message || j.error.code}`);
    return j.data;
  };
  const creator = await tt("post/publish/creator_info/query/", {});
  const options: string[] = creator?.privacy_level_options ?? [];
  // Aplikacja przed audytem TikToka może publikować tylko prywatnie (SELF_ONLY).
  const privacy = options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0] ?? "SELF_ONLY";
  const url = (u: string) => (TT_MEDIA_BASE && u.startsWith(STORAGE_PUBLIC) ? TT_MEDIA_BASE.replace(/\/?$/, "/") + u.slice(STORAGE_PUBLIC.length) : u);
  const caption = fullCaption(post, false);
  const postInfo = { privacy_level: privacy, disable_comment: false, brand_organic_toggle: true, brand_content_toggle: false, is_aigc: true };
  const data = media[0].type === "video"
    ? await tt("post/publish/video/init/", {
      post_info: { ...postInfo, title: caption.slice(0, 2200), disable_duet: false, disable_stitch: false },
      source_info: { source: "PULL_FROM_URL", video_url: url(media[0].url) },
    })
    : await tt("post/publish/content/init/", {
      post_info: { ...postInfo, title: String(post.hook ?? "").slice(0, 90), description: caption.slice(0, 4000), auto_add_music: true },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: media.slice(0, 35).map((m) => url(m.url)) },
      post_mode: "DIRECT_POST", media_type: "PHOTO",
    });
  return { external_id: data?.publish_id ?? null, permalink: null, privacy };
}

// YouTube Shorts: pionowe wideo do 60 s, wysyłka wznawialna (resumable upload).
// deno-lint-ignore no-explicit-any
async function publishYoutube(post: any, accountId: string) {
  const media = post.media as Array<{ type: string; url: string }>;
  if (!media.length || media[0].type !== "video") throw new Error("YouTube wymaga wideo (Shorts)");
  const token = await oauthToken(accountId, "youtube");
  const video = await fetch(media[0].url);
  if (!video.ok) throw new Error(`YouTube: nie mogę pobrać wideo (${video.status})`);
  const bytes = new Uint8Array(await video.arrayBuffer());
  const title = String(post.hook || post.caption || "").replace(/\s+/g, " ").slice(0, 90) + " #Shorts";
  const description = fullCaption(post, true).slice(0, 4900);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(bytes.length), "X-Upload-Content-Type": video.headers.get("content-type") ?? "video/mp4",
    },
    body: JSON.stringify({
      snippet: { title, description, tags: (post.hashtags ?? []).map((h: string) => h.replace(/^#/, "")).slice(0, 15), categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    }),
  });
  if (!init.ok) throw new Error(`YouTube init ${init.status}: ${(await init.text()).slice(0, 200)}`);
  const loc = init.headers.get("location");
  if (!loc) throw new Error("YouTube: brak adresu wysyłki");
  const up = await fetch(loc, { method: "PUT", headers: { "Content-Type": video.headers.get("content-type") ?? "video/mp4" }, body: bytes });
  const j = await up.json();
  if (!up.ok || !j.id) throw new Error(`YouTube upload ${up.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return { external_id: j.id as string, permalink: `https://www.youtube.com/shorts/${j.id}` };
}

// X: tekst do 280 znaków (link do karty liczy się jako 23), do 4 zdjęć.
// deno-lint-ignore no-explicit-any
async function publishX(post: any, accountId: string) {
  const token = await oauthToken(accountId, "x");
  const link = post.page_slug ? `${PAGE_BASE}${post.page_slug}` : "";
  const tags = (post.hashtags ?? []).slice(0, 2).join(" ");
  const room = 280 - (link ? 24 : 0) - (tags ? tags.length + 1 : 0);
  const body = String(post.caption || post.hook || "").replace(/\s+\n/g, "\n").trim();
  const text = [body.length > room ? body.slice(0, room - 1).trimEnd() + "…" : body, tags, link].filter(Boolean).join(" ");
  const mediaIds: string[] = [];
  for (const m of (post.media as Array<{ type: string; url: string }>).filter((m) => m.type === "image").slice(0, 4)) {
    const img = await fetch(m.url);
    if (!img.ok) continue;
    const fd = new FormData();
    fd.append("media", new Blob([await img.arrayBuffer()], { type: img.headers.get("content-type") ?? "image/png" }));
    fd.append("media_category", "tweet_image");
    const r = await fetch("https://api.x.com/2/media/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const j = await r.json();
    if (r.ok && j.data?.id) mediaIds.push(j.data.id);
  }
  const r = await fetch("https://api.x.com/2/tweets", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(mediaIds.length ? { text, media: { media_ids: mediaIds } } : { text }),
  });
  const j = await r.json();
  if (!r.ok || !j.data?.id) throw new Error(`X ${r.status}: ${j.detail ?? j.title ?? JSON.stringify(j).slice(0, 200)}`);
  return { external_id: j.data.id as string, permalink: `https://x.com/i/web/status/${j.data.id}` };
}

async function publishDue() {
  const { data: due } = await sb.from("social_posts").select("*, social_accounts!inner(id, platform, status, external_id)")
    .eq("status", "zaplanowany").lte("scheduled_at", new Date().toISOString()).eq("social_accounts.status", "polaczone")
    .lt("attempts", 3).order("scheduled_at").limit(MAX_PUBLISH_PER_TICK);
  const { data: paused } = await sb.from("social_shops").select("shop_id").eq("autopilot", false);
  const pausedSet = new Set((paused ?? []).map((p) => p.shop_id));
  for (const post of due ?? []) {
    if (pausedSet.has(post.shop_id)) continue;
    const acc = post.social_accounts;
    await sb.from("social_posts").update({ status: "publikacja", attempts: post.attempts + 1, updated_at: new Date().toISOString() }).eq("id", post.id);
    try {
      let res: { external_id: string | null; permalink: string | null; privacy?: string };
      if (acc.platform === "tiktok") {
        res = await publishTiktok(post, acc.id);
      } else if (acc.platform === "youtube") {
        res = await publishYoutube(post, acc.id);
      } else if (acc.platform === "x") {
        res = await publishX(post, acc.id);
      } else {
        const { data: sec } = await sb.from("social_secrets").select("access_token").eq("account_id", acc.id).single();
        res = acc.platform === "instagram"
          ? await publishInstagram(post, acc.external_id, sec!.access_token)
          : await publishFacebook(post, acc.external_id, sec!.access_token);
      }
      await sb.from("social_posts").update({
        status: "opublikowany", external_id: res.external_id, permalink: res.permalink, error: res.privacy === "SELF_ONLY" ? "TikTok: aplikacja przed audytem — post widoczny tylko prywatnie" : null,
        published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", post.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("social_posts").update({
        status: post.attempts + 1 >= 3 ? "blad" : "zaplanowany", error: msg,
        scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", post.id);
      if (/token|session|permission|OAuth/i.test(msg)) await sb.from("social_accounts").update({ status: "blad", last_error: msg }).eq("id", acc.id);
      await log(post.shop_id, `Publikacja ${acc.platform} nieudana: ${msg}`, "error", { post_id: post.id });
    }
  }
}

// ---------- statystyki (raz na tick, lekko) ----------

async function refreshStats() {
  const { data: accs } = await sb.from("social_accounts").select("id, platform, external_id, stats, updated_at").eq("status", "polaczone").in("platform", ["instagram", "facebook"]);
  for (const a of accs ?? []) {
    if (Date.now() - new Date(a.updated_at).getTime() < 6 * 3600_000 && a.stats?.followers !== undefined) continue;
    const { data: sec } = await sb.from("social_secrets").select("access_token").eq("account_id", a.id).single();
    try {
      const fields = a.platform === "instagram" ? "followers_count,media_count" : "followers_count,fan_count";
      const s = await graph(a.external_id, { fields }, sec!.access_token, "GET");
      await sb.from("social_accounts").update({ stats: { followers: s.followers_count ?? s.fan_count ?? 0, posts: s.media_count ?? null }, updated_at: new Date().toISOString() }).eq("id", a.id);
    } catch { /* statystyki są dodatkiem */ }
  }
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const report: Record<string, unknown> = {};
  const shops = await ensureShops();
  const { data: cfgs } = await sb.from("social_shops").select("*").eq("autopilot", true);
  for (const cfg of cfgs ?? []) {
    if (body?.shop_id && body.shop_id !== cfg.shop_id) continue;
    const shop = shops.get(cfg.shop_id) ?? {};
    try {
      const products = await shopProducts(cfg.shop_id);
      const stale = !cfg.strategy_updated_at || Date.now() - new Date(cfg.strategy_updated_at).getTime() > STRATEGY_TTL_DAYS * 86400_000;
      if (stale || body?.refresh_strategy) {
        const s = await refreshStrategy(cfg.shop_id, shop, products);
        if (s) Object.assign(cfg, s);
      }
      if (cfg.strategy?.pillars) await planShop(cfg.shop_id, cfg, shop, products);
      report[cfg.shop_id] = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await log(cfg.shop_id, `Autopilot: ${msg}`, "error");
      report[cfg.shop_id] = msg;
    }
  }
  await publishDue();
  await refreshStats();
  return Response.json({ shops: report });
});
