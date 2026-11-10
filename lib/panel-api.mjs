export async function panelFetch(sb, path, { method = "GET", body } = {}) {
  if (!sb?.auth?.getSession) throw new Error("Brak sesji.");
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
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
