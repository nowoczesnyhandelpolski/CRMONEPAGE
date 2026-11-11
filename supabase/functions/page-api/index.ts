// Publiczne API stron /p/<slug> dla Cloudflare Pages bez klucza serwisowego Supabase.
// Klucz service_role zostaje tutaj, w Supabase. Logika zamówień, leadów i wiadomości to ta sama co w Pages Functions:
// lib/intake.mjs i lib/supabase-store.mjs z przypiętego commita repozytorium (po zmianie lib/ podbij hash i wdroż ponownie).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseStore } from "https://raw.githubusercontent.com/nowoczesnyhandelpolski/CRMONEPAGE/24ffa185de7a151a8850711b1d76a71acbb61f23/lib/supabase-store.mjs";
import { placeOrder, placeLead, placeMessage } from "https://raw.githubusercontent.com/nowoczesnyhandelpolski/CRMONEPAGE/24ffa185de7a151a8850711b1d76a71acbb61f23/lib/intake.mjs";

const env = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  STRIPE_CHECKOUT: Deno.env.get("STRIPE_CHECKOUT") ?? "",
  PAY_URL_TEMPLATE: Deno.env.get("PAY_URL_TEMPLATE") ?? "",
};
const SLUG = /^[a-z0-9-]{1,70}$/;
const json = (b: unknown, status = 200) => Response.json(b, { status });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const raw = await req.text();
  if (raw.length > 20000) return json({ ok: false, message: "Za duże zapytanie." }, 413);
  let p: Record<string, any> = {};
  try { p = JSON.parse(raw || "{}"); } catch { return json({ ok: false, message: "Złe dane." }, 400); }
  const store = createSupabaseStore(env);
  const slug = String(p.slug || "");
  const ip = String(p.ip || req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim().slice(0, 80);
  try {
    if (p.action === "sitemap") return json({ pages: await store.listPublished() });
    if (!SLUG.test(slug)) return json({ ok: false, message: "Nie ma takiej strony." }, 404);
    if (p.action === "page") return json({ page: await store.getPage(slug, { publishedOnly: true }) });
    const fn = p.action === "order" ? placeOrder : p.action === "lead" ? placeLead : p.action === "contact" ? placeMessage : null;
    if (!fn) return json({ ok: false }, 400);
    const r = await fn(store, env, slug, p.body ?? {}, { ip });
    return json(r.body, r.status);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.log(JSON.stringify({ msg: "page_api_error", action: p.action, slug, error: String(err.message || e).slice(0, 300) }));
    const status = err.status && err.status < 500 ? err.status : 500;
    return json({ ok: false, message: status < 500 ? err.message : "Coś poszło nie tak. Spróbuj ponownie." }, status);
  }
});
