// Adres własnego serwera. FTP nie wchodzi w grę — przeglądarka umie tylko HTTP(S).

export function assertHttpEndpoint(value) {
  const raw = String(value || "").trim();
  let url;
  try { url = new URL(raw); }
  catch {
    const err = new Error("Wpisz pełny adres własnego serwera, na przykład https://sklep.example/nhp.");
    err.status = 400;
    throw err;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    const err = new Error("Podaj adres HTTP lub HTTPS. Przeglądarka nie wysyła plików przez FTP.");
    err.status = 400;
    throw err;
  }
  return url.toString();
}

export function endpointOriginPattern(value) {
  const url = new URL(assertHttpEndpoint(value));
  return `${url.origin}/*`;
}
