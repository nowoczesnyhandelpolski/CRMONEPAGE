import { bytesToBase64 } from "./shopify-core.mjs";

export function ksefBase(envName) {
  const name = String(envName || "test").trim().toLowerCase();
  if (name === "prod" || name === "production") return "https://api.ksef.mf.gov.pl/v2";
  if (name === "demo") return "https://api-demo.ksef.mf.gov.pl/v2";
  return "https://api-test.ksef.mf.gov.pl/v2";
}

export function ksefConfig(env = {}) {
  const token = String(env.KSEF_TOKEN || "").trim();
  const nip = String(env.KSEF_NIP || "").replace(/\D/g, "");
  const name = String(env.KSEF_SELLER_NAME || "").trim();
  const address1 = String(env.KSEF_SELLER_ADDRESS1 || env.KSEF_SELLER_ADDRESS || "").trim();
  const address2 = String(env.KSEF_SELLER_ADDRESS2 || "").trim();
  const which = String(env.KSEF_ENV || "test").trim().toLowerCase() || "test";
  const vatRaw = String(env.KSEF_VAT_RATE || "23").trim().toLowerCase();
  if (!token || nip.length !== 10 || !name || !address1) return null;
  const vatRate = vatRaw === "zw" || vatRaw === "0" ? (vatRaw === "zw" ? "zw" : 0) : Number(vatRaw);
  return {
    token,
    nip,
    name,
    address1,
    address2,
    env: which === "production" ? "prod" : which,
    vatRate: vatRate === "zw" || [0, 5, 8, 23].includes(vatRate) ? vatRate : 23,
    base: ksefBase(which)
  };
}

function readDer(buf, offset = 0) {
  if (offset + 2 > buf.length) throw new Error("Ucięty certyfikat KSeF.");
  const tag = buf[offset];
  let len = buf[offset + 1];
  let header = 2;
  if (len & 0x80) {
    const bytes = len & 0x7f;
    if (!bytes || bytes > 3 || offset + 2 + bytes > buf.length) throw new Error("Zła długość DER.");
    len = 0;
    for (let i = 0; i < bytes; i++) len = (len << 8) | buf[offset + 2 + i];
    header = 2 + bytes;
  }
  const start = offset + header;
  const end = start + len;
  if (end > buf.length) throw new Error("Certyfikat KSeF jest ucięty.");
  return { tag, offset, start, end };
}

function children(buf, node) {
  const out = [];
  let cursor = node.start;
  while (cursor < node.end) {
    const child = readDer(buf, cursor);
    out.push(child);
    cursor = child.end;
  }
  return out;
}

export function certificateDer(b64) {
  const clean = String(b64 || "").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Wyjmuje SubjectPublicKeyInfo z certyfikatu X.509 (DER). */
export function spkiFromCertificate(der) {
  const cert = readDer(der, 0);
  if (cert.tag !== 0x30) throw new Error("Certyfikat KSeF nie jest sekwencją ASN.1.");
  const tbs = children(der, cert)[0];
  const parts = children(der, tbs);
  const index = parts[0]?.tag === 0xa0 ? 6 : 5;
  const spki = parts[index];
  if (!spki || spki.tag !== 0x30) throw new Error("Brak klucza publicznego w certyfikacie KSeF.");
  return der.slice(spki.offset, spki.end);
}

async function rsaEncrypt(spki, bytes) {
  const key = await crypto.subtle.importKey("spki", spki, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  return new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, bytes));
}

export async function encryptKsefToken(certificateB64, token, timestampMs) {
  const spki = spkiFromCertificate(certificateDer(certificateB64));
  const payload = new TextEncoder().encode(`${token}|${timestampMs}`);
  return bytesToBase64(await rsaEncrypt(spki, payload));
}

export async function encryptSymmetricKey(certificateB64, rawKey) {
  const spki = spkiFromCertificate(certificateDer(certificateB64));
  return bytesToBase64(await rsaEncrypt(spki, rawKey));
}

export async function encryptInvoice(xml) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CBC" }, false, ["encrypt"]);
  const plain = new TextEncoder().encode(xml);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, plain));
  return { rawKey, iv, plain, encrypted };
}

export async function sha256B64(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return bytesToBase64(digest);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ksefError(data, status) {
  const detail = data?.exception?.exceptionDetailList?.[0];
  const message = detail?.exceptionDescription
    || data?.exceptionDescription
    || data?.status?.details?.[0]
    || data?.status?.description
    || data?.message
    || `KSeF HTTP ${status}`;
  const err = new Error(String(message).slice(0, 300));
  err.status = status >= 400 && status < 500 ? status : 502;
  return err;
}

async function ksefFetch(fetchImpl, url, { method = "GET", token, body } = {}) {
  const res = await fetchImpl(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: text.slice(0, 300) }; }
  }
  if (!res.ok) throw ksefError(data, res.status);
  return data;
}

function pickCert(list, usage) {
  const now = Date.now();
  const found = (list || []).find((item) => (item.usage || []).includes(usage) && Date.parse(item.validTo || 0) > now);
  if (!found?.certificate) throw new Error(`KSeF nie oddał certyfikatu ${usage}.`);
  return found;
}

export async function loginKsef({ config, fetchImpl = fetch, wait = sleep, attempts = 6 }) {
  const base = config.base.replace(/\/$/, "");
  const certs = await ksefFetch(fetchImpl, `${base}/security/public-key-certificates`);
  const tokenCert = pickCert(certs, "KsefTokenEncryption");
  const symCert = pickCert(certs, "SymmetricKeyEncryption");
  const challenge = await ksefFetch(fetchImpl, `${base}/auth/challenge`, { method: "POST", body: {} });
  const encryptedToken = await encryptKsefToken(tokenCert.certificate, config.token, challenge.timestampMs);
  const started = await ksefFetch(fetchImpl, `${base}/auth/ksef-token`, {
    method: "POST",
    body: {
      challenge: challenge.challenge,
      contextIdentifier: { type: "Nip", value: config.nip },
      encryptedToken,
      publicKeyId: tokenCert.publicKeyId
    }
  });
  const authToken = started?.authenticationToken?.token;
  if (!authToken || !started?.referenceNumber) throw new Error("KSeF nie rozpoczął uwierzytelnienia.");
  let authStatus = null;
  for (let i = 0; i < attempts; i++) {
    authStatus = await ksefFetch(fetchImpl, `${base}/auth/${encodeURIComponent(started.referenceNumber)}`, { token: authToken });
    const code = authStatus?.status?.code;
    if (code === 200) break;
    if (code >= 400) throw new Error(authStatus.status.details?.[0] || authStatus.status.description || "KSeF odrzucił token.");
    if (i < attempts - 1) await wait(300);
  }
  if (authStatus?.status?.code !== 200) {
    const err = new Error("KSeF jeszcze uwierzytelnia token. Spróbuj ponownie za chwilę.");
    err.status = 202;
    throw err;
  }
  const redeemed = await ksefFetch(fetchImpl, `${base}/auth/token/redeem`, { method: "POST", token: authToken, body: {} });
  const access = redeemed?.accessToken?.token;
  if (!access) throw new Error("KSeF nie oddał tokenu dostępu.");
  return { access, symCert, base };
}

/**
 * Pełna ścieżka środowiska testowego (albo demo/prod): token KSeF → sesja online → FA(3).
 * fetchImpl pozwala podstawić atrapę w teście.
 */
export async function submitFa3({ config, xml, fetchImpl = fetch, wait = sleep, attempts = 6 }) {
  const { access, symCert, base } = await loginKsef({ config, fetchImpl, wait, attempts });
  const packed = await encryptInvoice(xml);
  const encryptedSymmetricKey = await encryptSymmetricKey(symCert.certificate, packed.rawKey);
  const session = await ksefFetch(fetchImpl, `${base}/sessions/online`, {
    method: "POST",
    token: access,
    body: {
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: {
        encryptedSymmetricKey,
        initializationVector: bytesToBase64(packed.iv),
        publicKeyId: symCert.publicKeyId
      }
    }
  });
  if (!session?.referenceNumber) throw new Error("KSeF nie otworzył sesji.");
  const sent = await ksefFetch(fetchImpl, `${base}/sessions/online/${encodeURIComponent(session.referenceNumber)}/invoices`, {
    method: "POST",
    token: access,
    body: {
      invoiceHash: await sha256B64(packed.plain),
      invoiceSize: packed.plain.byteLength,
      encryptedInvoiceHash: await sha256B64(packed.encrypted),
      encryptedInvoiceSize: packed.encrypted.byteLength,
      encryptedInvoiceContent: bytesToBase64(packed.encrypted),
      offlineMode: false
    }
  });
  let invoice = null;
  for (let i = 0; i < attempts; i++) {
    invoice = await ksefFetch(
      fetchImpl,
      `${base}/sessions/${encodeURIComponent(session.referenceNumber)}/invoices/${encodeURIComponent(sent.referenceNumber)}`,
      { token: access }
    );
    const code = invoice?.status?.code;
    if (code === 200 || code >= 400) break;
    if (i < attempts - 1) await wait(300);
  }
  try {
    await ksefFetch(fetchImpl, `${base}/sessions/online/${encodeURIComponent(session.referenceNumber)}/close`, { method: "POST", token: access });
  } catch { /* zamknięcie sesji nie cofa faktury */ }
  const code = invoice?.status?.code;
  if (code >= 400) {
    const err = new Error(invoice.status.details?.[0] || invoice.status.description || "KSeF odrzucił fakturę.");
    err.referenceNumber = sent.referenceNumber;
    err.sessionReference = session.referenceNumber;
    throw err;
  }
  return {
    ksefNumber: invoice?.ksefNumber || "",
    referenceNumber: sent.referenceNumber,
    sessionReference: session.referenceNumber,
    pending: code !== 200,
    statusCode: code || 0
  };
}

export async function readInvoiceStatus({ config, sessionReference, referenceNumber, fetchImpl = fetch, wait = sleep, attempts = 4 }) {
  const { access, base } = await loginKsef({ config, fetchImpl, wait, attempts });
  return ksefFetch(
    fetchImpl,
    `${base}/sessions/${encodeURIComponent(sessionReference)}/invoices/${encodeURIComponent(referenceNumber)}`,
    { token: access }
  );
}
