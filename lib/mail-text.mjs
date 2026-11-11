export function fold(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function parseHeaders(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
  const headers = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!headers[key]) headers[key] = value;
  }
  return headers;
}

export function decodeQuotedPrintable(value) {
  const text = String(value || "").replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(text.charCodeAt(i) & 0xff);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function decodeBase64Text(value) {
  const clean = String(value || "").replace(/\s/g, "");
  if (!clean) return "";
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function decodeMimeWords(value) {
  return String(value || "").replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_, charset, enc, data) => {
    try {
      const text = enc.toLowerCase() === "b" ? decodeBase64Text(data) : decodeQuotedPrintable(data.replace(/_/g, " "));
      if (/utf-8/i.test(charset)) return text;
      return text;
    } catch {
      return data;
    }
  });
}

function decodeTransfer(text, encoding) {
  if (/quoted-printable/i.test(encoding || "")) return decodeQuotedPrintable(text);
  if (/base64/i.test(encoding || "")) {
    try { return decodeBase64Text(text); } catch { return text; }
  }
  return text;
}

export function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPlain(raw) {
  const source = String(raw || "").replace(/\r\n/g, "\n");
  const breakAt = source.search(/\n\n/);
  const headerText = breakAt >= 0 ? source.slice(0, breakAt) : source;
  const body = breakAt >= 0 ? source.slice(breakAt + 2) : "";
  const headers = parseHeaders(headerText);
  const type = headers["content-type"] || "";
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (boundary) {
    const chunks = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    let html = "";
    for (const chunk of chunks) {
      const piece = chunk.replace(/^\n/, "");
      if (!piece.trim() || piece.startsWith("--")) continue;
      const splitAt = piece.search(/\n\n/);
      const partHeader = splitAt >= 0 ? piece.slice(0, splitAt) : piece;
      const partBody = splitAt >= 0 ? piece.slice(splitAt + 2) : "";
      const partHeaders = parseHeaders(partHeader);
      const partType = partHeaders["content-type"] || "";
      const decoded = decodeTransfer(partBody, partHeaders["content-transfer-encoding"]).trim();
      if (/text\/plain/i.test(partType)) return decoded.slice(0, 20000);
      if (/text\/html/i.test(partType)) html = stripHtml(decoded);
    }
    if (html) return html.slice(0, 20000);
  }
  let text = decodeTransfer(body, headers["content-transfer-encoding"]).trim();
  if (/text\/html/i.test(type)) text = stripHtml(text);
  return text.slice(0, 20000);
}

export function parseAddress(value) {
  const decoded = decodeMimeWords(value).trim();
  const angled = decoded.match(/^(.*)<([^>]+)>\s*$/);
  if (angled) return { name: angled[1].replace(/^"|"$/g, "").trim(), email: angled[2].trim().toLowerCase() };
  const email = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return { name: "", email: email ? email[0].toLowerCase() : "" };
}

export function normalizeSubject(value) {
  let subject = decodeMimeWords(value).trim();
  let prev = "";
  while (subject !== prev) {
    prev = subject;
    subject = subject.replace(/^(re|fw|fwd|odp|pd)\s*:\s*/i, "").trim();
  }
  return subject.slice(0, 300);
}

export function subjectKey(value) {
  return fold(normalizeSubject(value)).slice(0, 180);
}

export function isMailLoop({ headers = {}, from = "", ourFrom = "" } = {}) {
  const auto = String(headers["auto-submitted"] || "").trim();
  if (auto && !/^no$/i.test(auto)) return true;
  const precedence = String(headers["precedence"] || "").toLowerCase();
  if (["bulk", "list", "junk"].includes(precedence)) return true;
  if (headers["list-unsubscribe"] || headers["list-id"]) return true;
  const email = String(from || "").toLowerCase();
  const local = email.split("@")[0] || "";
  if (/^(no-?reply|noreply|mailer-daemon|postmaster|bounce|notifications?)$/i.test(local)) return true;
  if (ourFrom && email === String(ourFrom).toLowerCase()) return true;
  return false;
}

export function orderHints(subject, text) {
  const blob = `${subject || ""}\n${text || ""}`;
  const found = new Set();
  for (const match of blob.matchAll(/(?:zamówienie|zamowienie|order)\s*#?\s*(\d{3,10})/gi)) found.add(match[1]);
  for (const match of blob.matchAll(/#(\d{3,10})\b/g)) found.add(match[1]);
  return [...found];
}

export function matchRule(rules, subject, text) {
  const hay = fold(`${subject || ""}\n${text || ""}`);
  const list = (rules || []).filter((rule) => rule.enabled !== false).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  for (const rule of list) {
    const keys = String(rule.keywords || "").split(",").map((item) => fold(item.trim())).filter((item) => item.length >= 3);
    if (keys.some((key) => hay.includes(key) || (key.length >= 5 && hay.includes(key.slice(0, -1))))) return rule;
  }
  return null;
}

export function renderTemplate(template, ctx) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => {
    const value = ctx?.[key];
    return value ? String(value) : "nie mamy jeszcze tej informacji";
  });
}

export function paymentLabel(status) {
  const map = {
    paid: "opłacone",
    partially_paid: "częściowo opłacone",
    pending: "oczekuje na płatność",
    refunded: "zwrot płatności",
    partially_refunded: "częściowy zwrot",
    cancelled: "anulowane",
    voided: "anulowane"
  };
  return map[String(status || "").toLowerCase()] || (status ? String(status) : "");
}

export function sortBoard(rows) {
  return [...(rows || [])].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) return String(b.pinned_at || "").localeCompare(String(a.pinned_at || ""));
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

export function encodeSubject(value) {
  const text = String(value || "").slice(0, 180);
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

export function buildRfc822({ from, to, subject, text, inReplyTo = "", messageId, auto = false, date = new Date() }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ];
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  }
  if (auto) headers.push("Auto-Submitted: auto-replied");
  const body = String(text || "").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}
