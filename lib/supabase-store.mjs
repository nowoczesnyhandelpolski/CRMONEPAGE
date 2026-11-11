// Klient REST Supabase tylko dla Pages Functions. Klucz service_role jest w zmiennych środowiskowych, nigdy w repo.

function mustEnv(env) {
  const url = String(env?.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    const err = new Error("Brak SUPABASE_URL albo SUPABASE_SERVICE_ROLE_KEY na serwerze.");
    err.status = 500;
    throw err;
  }
  return { url, key };
}

async function rest(env, path, { method = "GET", body, prefer } = {}) {
  const { url, key } = mustEnv(env);
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(prefer ? { prefer } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const enc = encodeURIComponent;

const PUBLIC_URL = "https://ysijewwzpkpzxhjcshms.supabase.co";

// Bez SUPABASE_SERVICE_ROLE_KEY w Cloudflare strony nadal działają: czytanie i zapisy z formularzy
// idą przez funkcję Supabase `page-api`, która ma klucz serwisowy u siebie i używa tej samej logiki (lib/intake.mjs).
export function hasServiceKey(env) {
  return !!(env?.SUPABASE_SERVICE_ROLE_KEY);
}

export async function pageApi(env, action, payload = {}) {
  const base = String(env?.SUPABASE_URL || PUBLIC_URL).replace(/\/$/, "");
  const res = await fetch(`${base}/functions/v1/page-api`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const body = await res.json().catch(() => ({}));
  if (action === "order" || action === "lead" || action === "contact") return { status: res.status, body };
  if (!res.ok) {
    const err = new Error(`page-api ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  return body;
}

function remoteStore(env) {
  const readOnly = async () => {
    const err = new Error("Zapis wymaga funkcji page-api.");
    err.status = 500;
    throw err;
  };
  return {
    async getPage(slug) { return (await pageApi(env, "page", { slug })).page || null; },
    async listPublished() { return (await pageApi(env, "sitemap")).pages || []; },
    savePage: readOnly, updatePageData: readOnly, upsertRecord: readOnly, findCustomerByEmail: readOnly,
    findOrderByClientReq: readOnly, countOrdersByEmail: readOnly, logHit: readOnly, countHits: readOnly
  };
}

export function createSupabaseStore(env) {
  if (!hasServiceKey(env)) return remoteStore(env);
  return {
    async getPage(slug, { publishedOnly = true } = {}) {
      const filter = publishedOnly ? `&status=eq.published` : "";
      const rows = await rest(env, `pages?slug=eq.${enc(slug)}${filter}&select=*&limit=1`);
      return rows?.[0] || null;
    },
    async listPublished() {
      const rows = await rest(env, "pages?status=eq.published&select=slug,updated_at&order=updated_at.desc&limit=5000");
      return rows || [];
    },
    async savePage(page) {
      await rest(env, "pages?on_conflict=id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: page
      });
    },
    async updatePageData(id, data) {
      await rest(env, `pages?id=eq.${enc(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { data, updated_at: new Date().toISOString() }
      });
    },
    async upsertRecord(col, id, data) {
      await rest(env, "records?on_conflict=col,id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { col, id, data, updated_at: new Date().toISOString() }
      });
    },
    async findCustomerByEmail(email) {
      const rows = await rest(env, `records?col=eq.customers&email_key=eq.${enc(String(email || "").toLowerCase())}&select=id,col,data&limit=1`);
      return rows?.[0] || null;
    },
    async findOrderByClientReq(pageId, req) {
      if (!req) return null;
      const rows = await rest(env, `records?col=eq.orders&select=id,col,data&data->>page_id=eq.${enc(pageId)}&data->>client_req=eq.${enc(req)}&limit=1`);
      return rows?.[0] || null;
    },
    async countOrdersByEmail(email, sinceMs) {
      const rows = await rest(env, `records?col=eq.orders&select=id,data&email_key=eq.${enc(String(email || "").toLowerCase())}&limit=50`);
      return (rows || []).filter((r) => Number(r.data?.createdAt || 0) >= sinceMs).length;
    },
    async logHit(kind, slug, ip) {
      await rest(env, "public_hits", { method: "POST", prefer: "return=minimal", body: { kind, slug, ip: String(ip || "").slice(0, 80) } });
    },
    async countHits(kind, ip, sinceMs) {
      const iso = new Date(sinceMs).toISOString();
      const rows = await rest(env, `public_hits?kind=eq.${enc(kind)}&ip=eq.${enc(String(ip || ""))}&created_at=gte.${enc(iso)}&select=id&limit=50`);
      return (rows || []).length;
    }
  };
}
