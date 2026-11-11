import { decodeMimeWords, extractPlain, parseAddress, parseHeaders } from "./mail-text.mjs";

function imapQuote(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function command(io, tag, text) {
  await io.write(`${tag} ${text}\r\n`);
  const parts = [];
  while (true) {
    const line = await io.readLine();
    parts.push({ line });
    const literal = /\{(\d+)\}\s*$/.exec(line);
    if (literal) {
      const bytes = await io.readBytes(Number(literal[1]));
      parts.push({ bytes });
      continue;
    }
    if (line.startsWith(`${tag} `)) {
      return { ok: /\sOK\b/i.test(line), parts, line };
    }
  }
}

export function parseFetches(parts) {
  const messages = [];
  let current = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.line && /\* \d+ FETCH/i.test(part.line)) {
      current = { uid: "", header: "", text: "" };
      const uid = part.line.match(/\bUID (\d+)/i);
      if (uid) current.uid = uid[1];
      messages.push(current);
    }
    if (!current) continue;
    if (part.line) {
      const uid = part.line.match(/\bUID (\d+)/i);
      if (uid) current.uid = uid[1];
    }
    if (part.bytes) {
      const prev = parts[i - 1]?.line || "";
      const decoded = new TextDecoder().decode(part.bytes instanceof Uint8Array ? part.bytes : new TextEncoder().encode(String(part.bytes)));
      if (/BODY\[HEADER/i.test(prev)) current.header += decoded;
      else current.text += decoded;
    }
  }
  return messages.filter((item) => item.uid || item.header || item.text);
}

function searchUids(parts) {
  const line = parts.map((part) => part.line || "").find((item) => /\* SEARCH/i.test(item)) || "";
  return [...line.matchAll(/\d+/g)].map((match) => Number(match[0])).filter((n) => n > 0);
}

export async function imapListNew(io, { user, pass, lastUid = 0, limit = 15, startTls = false } = {}) {
  await io.readLine();
  let n = 1;
  const tag = () => `a${n++}`;
  if (startTls) {
    const tls = await command(io, tag(), "STARTTLS");
    if (!tls.ok) throw new Error("IMAP nie przeszedł na szyfrowane połączenie.");
    await io.startTls();
  }
  const login = await command(io, tag(), `LOGIN ${imapQuote(user)} ${imapQuote(pass)}`);
  if (!login.ok) throw new Error("IMAP odrzucił logowanie. Sprawdź MAIL_IMAP_USER i MAIL_IMAP_PASS.");
  const selected = await command(io, tag(), "SELECT INBOX");
  if (!selected.ok) throw new Error("IMAP nie otworzył skrzynki INBOX.");
  const banner = selected.parts.map((part) => part.line || "").join("\n");
  const uidvalidity = (banner.match(/UIDVALIDITY (\d+)/i) || [])[1] || "";
  const floor = Number(lastUid) > 0 ? Number(lastUid) + 1 : 1;
  const searched = await command(io, tag(), `UID SEARCH UID ${floor}:*`);
  if (!searched.ok) throw new Error("IMAP nie oddał listy wiadomości.");
  let uids = searchUids(searched.parts).filter((uid) => uid >= floor).sort((a, b) => a - b);
  const cap = Math.min(Math.max(Number(limit) || 15, 1), 30);
  uids = Number(lastUid) > 0 ? uids.slice(0, cap) : uids.slice(-cap);
  let fetched = [];
  if (uids.length) {
    const got = await command(io, tag(), `UID FETCH ${uids.join(",")} (UID BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.24000>)`);
    if (!got.ok) throw new Error("IMAP nie oddał treści wiadomości.");
    fetched = parseFetches(got.parts);
  }
  await command(io, tag(), "LOGOUT").catch(() => {});
  return { uidvalidity, uids, messages: fetched.map(normalizeFetched), maxUid: uids.at(-1) || Number(lastUid) || 0 };
}

export function normalizeFetched(item) {
  const headers = parseHeaders(item.header);
  const raw = `${item.header || ""}\n\n${item.text || ""}`;
  const address = parseAddress(headers.from || "");
  return {
    uid: Number(item.uid) || 0,
    messageId: (headers["message-id"] || "").trim(),
    inReplyTo: (headers["in-reply-to"] || "").trim(),
    subject: decodeMimeWords(headers.subject || ""),
    from: address,
    date: headers.date || "",
    headers,
    text: extractPlain(raw) || String(item.text || "").slice(0, 20000)
  };
}

async function readCode(io, expected) {
  while (true) {
    const line = await io.readLine();
    const match = line.match(/^(\d{3})([\s-])/);
    if (!match) continue;
    if (match[2] === "-") continue;
    if (Number(match[1]) !== expected) throw new Error(`Serwer poczty odpowiedział ${match[1]} zamiast ${expected}.`);
    return line;
  }
}

export async function smtpSend(io, { user, pass, from, to, data, startTls = false } = {}) {
  await readCode(io, 220);
  await io.write("EHLO nhp.local\r\n");
  await readCode(io, 250);
  if (startTls) {
    await io.write("STARTTLS\r\n");
    await readCode(io, 220);
    await io.startTls();
    await io.write("EHLO nhp.local\r\n");
    await readCode(io, 250);
  }
  const token = btoa(`\u0000${user}\u0000${pass}`);
  await io.write(`AUTH PLAIN ${token}\r\n`);
  await readCode(io, 235);
  await io.write(`MAIL FROM:<${from}>\r\n`);
  await readCode(io, 250);
  await io.write(`RCPT TO:<${to}>\r\n`);
  await readCode(io, 250);
  await io.write("DATA\r\n");
  await readCode(io, 354);
  await io.write(`${data}\r\n.\r\n`);
  await readCode(io, 250);
  await io.write("QUIT\r\n");
}

export function mailConfig(env = {}) {
  const imapHost = String(env.MAIL_IMAP_HOST || "").trim();
  const smtpHost = String(env.MAIL_SMTP_HOST || "").trim();
  const user = String(env.MAIL_IMAP_USER || env.MAIL_SMTP_USER || "").trim();
  const imapPass = String(env.MAIL_IMAP_PASS || "").trim();
  const smtpUser = String(env.MAIL_SMTP_USER || user).trim();
  const smtpPass = String(env.MAIL_SMTP_PASS || "").trim();
  const from = String(env.MAIL_FROM || user).trim();
  if (!imapHost || !smtpHost || !user || !imapPass || !smtpUser || !smtpPass || !from) return null;
  const imapPort = Number(env.MAIL_IMAP_PORT || 993);
  const smtpPort = Number(env.MAIL_SMTP_PORT || 587);
  return {
    from,
    imap: {
      host: imapHost,
      port: imapPort,
      user,
      pass: imapPass,
      secure: String(env.MAIL_IMAP_SECURE || (imapPort === 993 ? "on" : "starttls"))
    },
    smtp: {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      secure: String(env.MAIL_SMTP_SECURE || (smtpPort === 465 ? "on" : "starttls"))
    }
  };
}
