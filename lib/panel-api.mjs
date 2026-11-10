export function sessionNeedsRefresh(expiresAtSec, nowMs = Date.now()) {
  const exp = Number(expiresAtSec) * 1000;
  if (!Number.isFinite(exp) || exp <= 0) return true;
  return exp < nowMs + 60_000;
}

export async function freshAccessToken(sb, nowMs = Date.now()) {
  if (!sb?.auth?.getSession) return "";
  const { data } = await sb.auth.getSession();
  let session = data?.session || null;
  if (!session?.access_token || sessionNeedsRefresh(session.expires_at, nowMs)) {
    if (typeof sb.auth.refreshSession === "function") {
      const refreshed = await sb.auth.refreshSession();
      if (refreshed?.data?.session?.access_token) session = refreshed.data.session;
    }
  }
  return session?.access_token || "";
}

export async function panelFetch(sb, path, { method = "GET", body } = {}) {
  if (!sb?.auth?.getSession) throw new Error("Brak sesji.");
  const token = await freshAccessToken(sb);
  if (!token) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  const res = await fetch(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.ok === false) throw new Error(payload.error || "Żądanie nie powiodło się.");
  return payload;
}
