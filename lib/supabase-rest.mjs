// Publiczny adres i klucz publishable z config.js. Pobranie wtyczki nie używa service_role.
export const PUBLIC_SUPABASE = {
  url: "https://ysijewwzpkpzxhjcshms.supabase.co",
  anonKey: "sb_publishable_F6CnRzycgX84oC18FxUoSw_aKz73GRm"
};

export function anonConfig(env = {}) {
  const url = String(env.SUPABASE_URL || PUBLIC_SUPABASE.url).replace(/\/$/, "");
  const anonKey = String(env.SUPABASE_ANON_KEY || PUBLIC_SUPABASE.anonKey);
  if (!url || !anonKey) {
    const err = new Error("Brak adresu Supabase albo klucza anon.");
    err.status = 500;
    throw err;
  }
  return { url, anonKey };
}

export function bearerToken(request) {
  const header = request?.headers?.get?.("authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : "";
}

export function supabaseProject(env) { return mustEnv(env); }

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

export async function supabaseRest(env, path, { method = "GET", body, prefer } = {}) {
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
    const err = new Error(`Supabase ${res.status}`);
    err.status = 502;
    err.detail = text.slice(0, 240);
    throw err;
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function mintApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `nhp_${hex}`;
}

export async function teamUser(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const { url, key } = mustEnv(env);
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const user = await res.json();
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const rows = await supabaseRest(env, `allowed_emails?email=eq.${encodeURIComponent(email)}&select=email&limit=1`);
  if (!rows?.length) return null;
  return { id: user.id, email };
}

// Sesja użytkownika + is_team(). allowed_emails nie ma polityk RLS, więc nie czytamy tabeli kluczem użytkownika.
export async function teamUserAnon(request, env, fetchImpl = fetch) {
  const token = bearerToken(request);
  if (!token) return null;
  const { url, anonKey } = anonConfig(env);
  const headers = { apikey: anonKey, authorization: `Bearer ${token}` };
  const res = await fetchImpl(`${url}/auth/v1/user`, { headers });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email || !user?.id) return null;
  const rpc = await fetchImpl(`${url}/rest/v1/rpc/is_team`, {
    method: "POST",
    headers: { ...headers, accept: "application/json", "content-type": "application/json" },
    body: "{}"
  });
  if (!rpc.ok) return null;
  const team = await rpc.json().catch(() => false);
  if (team !== true) return null;
  return { id: user.id, email };
}
