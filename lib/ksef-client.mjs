import { ksefBaseUrl } from "./ksef-fa3.mjs";

function b64ToBytes(b64) {
  const clean = String(b64 || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function readDerLength(buf, offset) {
  const first = buf[offset];
  if (first < 0x80) return { length: first, bytes: 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 4) throw new Error("Zła długość ASN.1 w certyfikacie KSeF.");
  let length = 0;
  for (let i = 0; i < count; i++) length = (length << 8) | buf[offset + 1 + i];
  return { length, bytes: 1 + count };
}

function readTlv(buf, offset) {
  const tag = buf[offset];
  const { length, bytes } = readDerLength(buf, offset + 1);
  const start = offset + 1 + bytes;
  return { tag, start, end: start + length };
}

/** Wyjmuje SubjectPublicKeyInfo z certyfikatu X.509 (DER). */
export function extractSpkiFromCert(der) {
  const buf = der instanceof Uint8Array ? der : new Uint8Array(der);
  const cert = readTlv(buf, 0);
  if (cert.tag !== 0x30) throw new Error("Certyfikat KSeF nie jest sekwencją ASN.1.");
  const tbs = readTlv(buf, cert.start);
  if (tbs.tag !== 0x30) throw new Error("Brak TBSCertificate w certyfikacie KSeF.");
  let p = tbs.start;
  if (buf[p] === 0xa0) p = readTlv(buf, p).end;
  for (let i = 0; i < 5; i++) p = readTlv(buf, p).end;
  const spki = readTlv(buf, p);
  if (spki.tag !== 0x30) throw new Error("Brak klucza publicznego w certyfikacie KSeF.");
  return buf.slice(p, spki.end);
}

async function sha256B64(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return bytesToB64(digest);
}

function pickCert(list, usage, nowMs) {
  const rows = (Array.isArray(list) ? list : []).filter((row) => {
    const uses = row?.usage || [];
    if (!uses.includes(usage)) return false;
    const from = Date.parse(row.validFrom || "");
    const to = Date.parse(row.validTo || "");
    if (Number.isFinite(from) && from > nowMs) return false;
    if (Number.isFinite(to) && to < nowMs) return false;
    return Boolean(row.certificate);
  });
  rows.sort((a, b) => Date.parse(b.validFrom || 0) - Date.parse(a.validFrom || 0));
  return rows[0] || null;
}

async function importRsa(spki) {
  return crypto.subtle.importKey("spki", spki, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
}

async function rsaEncrypt(spki, data) {
  const key = await importRsa(spki);
  return new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, data));
}

function ksefMessage(data, status) {
  const detail = data?.exception?.exceptionDetailList?.[0];
  const text = detail?.exceptionDescription || data?.status?.description || data?.message || data?.title || "";
  const extra = Array.isArray(detail?.details) ? detail.details.join(" ") : "";
  const msg = [text, extra].filter(Boolean).join(" — ") || `KSeF HTTP ${status}`;
  return String(msg).slice(0, 400);
}

async function ksef(fetchImpl, url, { method = "GET", token, body } = {}) {
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
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 240) }; }
  }
  if (!res.ok) {
    const err = new Error(ksefMessage(data, res.status));
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw err;
  }
  return data || {};
}

async function loginKsef({ envName, ksefToken, nip, fetchImpl, sleep, attempts, now }) {
  const base = ksefBaseUrl(envName);
  const challenge = await ksef(fetchImpl, `${base}/auth/challenge`, { method: "POST", body: {} });
  const certs = await ksef(fetchImpl, `${base}/security/public-key-certificates`);
  const tokenCert = pickCert(certs, "KsefTokenEncryption", now.getTime());
  const symCert = pickCert(certs, "SymmetricKeyEncryption", now.getTime());
  if (!tokenCert || !symCert) {
    const err = new Error("KSeF nie zwrócił aktualnego klucza do tokenu albo do szyfrowania faktury.");
    err.status = 502;
    throw err;
  }
  const timestampMs = Number(challenge.timestampMs) || Date.parse(challenge.timestamp);
  if (!Number.isFinite(timestampMs)) {
    const err = new Error("KSeF nie zwrócił znacznika czasu wyzwania.");
    err.status = 502;
    throw err;
  }
  const tokenSpki = extractSpkiFromCert(b64ToBytes(tokenCert.certificate));
  const encryptedToken = bytesToB64(await rsaEncrypt(tokenSpki, new TextEncoder().encode(`${ksefToken}|${timestampMs}`)));
  const started = await ksef(fetchImpl, `${base}/auth/ksef-token`, {
    method: "POST",
    body: {
      challenge: challenge.challenge,
      contextIdentifier: { type: "Nip", value: nip },
      encryptedToken,
      ...(tokenCert.publicKeyId ? { publicKeyId: tokenCert.publicKeyId } : {})
    }
  });
  const opToken = started?.authenticationToken?.token;
  if (!opToken || !started.referenceNumber) {
    const err = new Error("KSeF nie przyjął tokenu.");
    err.status = 502;
    throw err;
  }
  let authCode = 0;
  for (let i = 0; i < attempts; i++) {
    const status = await ksef(fetchImpl, `${base}/auth/${encodeURIComponent(started.referenceNumber)}`, { token: opToken });
    authCode = Number(status?.status?.code || 0);
    if (authCode === 200) break;
    if (authCode >= 400) {
      const err = new Error(status?.status?.description || "KSeF odrzucił uwierzytelnienie.");
      err.status = 400;
      throw err;
    }
    await sleep(700);
  }
  if (authCode !== 200) {
    const err = new Error("Uwierzytelnienie KSeF nadal trwa. Spróbuj ponownie za chwilę.");
    err.status = 502;
    throw err;
  }
  const redeemed = await ksef(fetchImpl, `${base}/auth/token/redeem`, { method: "POST", token: opToken, body: {} });
  const access = redeemed?.accessToken?.token;
  if (!access) {
    const err = new Error("KSeF nie wydał tokenu dostępu.");
    err.status = 502;
    throw err;
  }
  return { access, base, symCert };
}

export async function readInvoiceStatus({
  envName = "test",
  ksefToken,
  nip,
  sessionReference,
  referenceNumber,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 4,
  now = new Date()
} = {}) {
  const { access, base } = await loginKsef({ envName, ksefToken, nip, fetchImpl, sleep, attempts, now });
  const invoiceStatus = await ksef(
    fetchImpl,
    `${base}/sessions/${encodeURIComponent(sessionReference)}/invoices/${encodeURIComponent(referenceNumber)}`,
    { token: access }
  );
  const code = Number(invoiceStatus?.status?.code || 0);
  return {
    statusCode: code,
    description: String(invoiceStatus?.status?.description || ""),
    ksefNumber: invoiceStatus?.ksefNumber || invoiceStatus?.status?.extensions?.originalKsefNumber || "",
    upoUrl: invoiceStatus?.upoDownloadUrl || "",
    pending: code !== 200 && code < 400
  };
}

/**
 * Uwierzytelnienie tokenem KSeF i wysyłka jednego XML FA(3) sesją interaktywną.
 * fetchImpl i sleep są wstrzykiwane w testach.
 */
export async function sendFa3Invoice({
  envName = "test",
  ksefToken,
  nip,
  xml,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 6,
  now = new Date()
} = {}) {
  if (!ksefToken || !nip || !xml) {
    const err = new Error("Brak tokenu KSeF, NIP albo XML.");
    err.status = 400;
    throw err;
  }
  const { access, base, symCert } = await loginKsef({ envName, ksefToken, nip, fetchImpl, sleep, attempts, now });

  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const symSpki = extractSpkiFromCert(b64ToBytes(symCert.certificate));
  const wrapped = await rsaEncrypt(symSpki, rawKey);
  const session = await ksef(fetchImpl, `${base}/sessions/online`, {
    method: "POST",
    token: access,
    body: {
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: {
        encryptedSymmetricKey: bytesToB64(wrapped),
        initializationVector: bytesToB64(iv),
        ...(symCert.publicKeyId ? { publicKeyId: symCert.publicKeyId } : {})
      }
    }
  });
  const sessionRef = session.referenceNumber;
  if (!sessionRef) {
    const err = new Error("KSeF nie otworzył sesji faktury.");
    err.status = 502;
    throw err;
  }

  const xmlBytes = new TextEncoder().encode(xml);
  const aes = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CBC" }, false, ["encrypt"]);
  const encryptedInvoice = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aes, xmlBytes));
  const sent = await ksef(fetchImpl, `${base}/sessions/online/${encodeURIComponent(sessionRef)}/invoices`, {
    method: "POST",
    token: access,
    body: {
      invoiceHash: await sha256B64(xmlBytes),
      invoiceSize: xmlBytes.byteLength,
      encryptedInvoiceHash: await sha256B64(encryptedInvoice),
      encryptedInvoiceSize: encryptedInvoice.byteLength,
      encryptedInvoiceContent: bytesToB64(encryptedInvoice),
      offlineMode: false
    }
  });
  const invoiceRef = sent.referenceNumber;
  let invoiceStatus = null;
  for (let i = 0; i < attempts; i++) {
    invoiceStatus = await ksef(
      fetchImpl,
      `${base}/sessions/${encodeURIComponent(sessionRef)}/invoices/${encodeURIComponent(invoiceRef)}`,
      { token: access }
    );
    const code = Number(invoiceStatus?.status?.code || 0);
    if (code === 200 || code >= 400) break;
    await sleep(800);
  }
  await ksef(fetchImpl, `${base}/sessions/online/${encodeURIComponent(sessionRef)}/close`, {
    method: "POST",
    token: access,
    body: {}
  }).catch(() => null);

  const code = Number(invoiceStatus?.status?.code || 0);
  const duplicateNumber = invoiceStatus?.status?.extensions?.originalKsefNumber || "";
  return {
    sessionReference: sessionRef,
    referenceNumber: invoiceRef,
    statusCode: code,
    description: String(invoiceStatus?.status?.description || ""),
    ksefNumber: invoiceStatus?.ksefNumber || duplicateNumber || "",
    upoUrl: invoiceStatus?.upoDownloadUrl || "",
    pending: code !== 200 && code < 400
  };
}
