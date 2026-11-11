import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildRfc822,
  extractPlain,
  fold,
  isMailLoop,
  matchRule,
  orderHints,
  renderTemplate,
  sortBoard,
  subjectKey
} from "../lib/mail-text.mjs";
import { imapListNew, smtpSend } from "../lib/mail-session.mjs";

test("pętla poczty pomija autorespondery, listy i no-reply", () => {
  assert.equal(isMailLoop({ headers: { "auto-submitted": "auto-replied" }, from: "a@b.pl" }), true);
  assert.equal(isMailLoop({ headers: { "auto-submitted": "no" }, from: "anna@sklep.pl" }), false);
  assert.equal(isMailLoop({ headers: { precedence: "bulk" }, from: "a@b.pl" }), true);
  assert.equal(isMailLoop({ headers: { "list-unsubscribe": "<mailto:x>" }, from: "a@b.pl" }), true);
  assert.equal(isMailLoop({ from: "no-reply@sklep.pl" }), true);
  assert.equal(isMailLoop({ from: "sklep@nhp.pl", ourFrom: "sklep@nhp.pl" }), true);
  assert.equal(isMailLoop({ from: "anna@sklep.pl", headers: {} }), false);
});

test("reguła łapie temat bez polskich znaków, a szablon nie zmyśla braków", () => {
  const rule = matchRule([
    { slug: "dostawa", keywords: "dostawa,kurier", position: 20, enabled: true },
    { slug: "faktura", keywords: "faktura,ksef", position: 10, enabled: true }
  ], "Proszę o fakturę", "do zamówienia");
  assert.equal(rule.slug, "faktura");
  assert.equal(matchRule([{ slug: "x", keywords: "zwrot", enabled: false, position: 1 }], "zwrot", ""), null);
  const text = renderTemplate("Zamówienie {zamowienie}. Faktura: {faktura}.", { zamowienie: "#1001", faktura: "" });
  assert.match(text, /#1001/);
  assert.match(text, /nie mamy jeszcze tej informacji/);
  assert.equal(subjectKey("Re: Odp: Gdzie paczka"), fold("gdzie paczka"));
  assert.deepEqual(orderHints("Gdzie jest zamówienie 1008", "nr #1008"), ["1008"]);
});

test("treść listu wyciąga text/plain i kropkuje SMTP", () => {
  const raw = [
    "Content-Type: multipart/alternative; boundary=abc",
    "",
    "--abc",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Dzień dobry",
    "--abc",
    "Content-Type: text/html",
    "",
    "<p>HTML</p>",
    "--abc--"
  ].join("\n");
  assert.equal(extractPlain(raw), "Dzień dobry");
  const rfc = buildRfc822({
    from: "sklep@nhp.pl",
    to: "anna@sklep.pl",
    subject: "Odpowiedź",
    text: "Linia\n.kropka",
    messageId: "<a@nhp.local>",
    auto: true
  });
  assert.match(rfc, /Auto-Submitted: auto-replied/);
  assert.match(rfc, /\r\n\.\.kropka\r\n/);
});

test("przypięte wpisy tablicy są nad resztą", () => {
  const rows = sortBoard([
    { id: "a", pinned: false, created_at: "2026-11-11T12:00:00Z" },
    { id: "b", pinned: true, pinned_at: "2026-11-11T09:00:00Z", created_at: "2026-11-10T09:00:00Z" },
    { id: "c", pinned: true, pinned_at: "2026-11-11T10:00:00Z", created_at: "2026-11-09T09:00:00Z" }
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["c", "b", "a"]);
});

function scripted(queue) {
  let index = 0;
  return {
    async write() {},
    async readLine() {
      const item = queue[index++];
      if (!item || item.bytes != null) throw new Error(`oczekiwano linii, jest ${JSON.stringify(item)}`);
      return item.line;
    },
    async readBytes(count) {
      const item = queue[index++];
      if (!item || item.bytes == null) throw new Error("oczekiwano literału");
      const bytes = new TextEncoder().encode(item.bytes);
      assert.equal(bytes.length, count);
      return bytes;
    },
    async startTls() {},
    async close() {}
  };
}

test("IMAP bierze tylko nowe UID i nie oznacza listu jako przeczytanego", async () => {
  const header = "From: Anna <anna@sklep.pl>\r\nSubject: Status\r\nMessage-ID: <m1@x>\r\n\r\n";
  const text = "Gdzie paczka?";
  const io = scripted([
    { line: "* OK ready" },
    { line: "a1 OK LOGIN" },
    { line: "* OK [UIDVALIDITY 9] UIDs valid" },
    { line: "a2 OK [READ-WRITE] SELECT" },
    { line: "* SEARCH 4 15" },
    { line: "a3 OK SEARCH" },
    { line: `* 1 FETCH (UID 15 BODY[HEADER] {${new TextEncoder().encode(header).length}}` },
    { bytes: header },
    { line: ` BODY[TEXT] {${new TextEncoder().encode(text).length}}` },
    { bytes: text },
    { line: ")" },
    { line: "a4 OK FETCH" },
    { line: "a5 OK LOGOUT" }
  ]);
  const listed = await imapListNew(io, { user: "sklep", pass: "tajne", lastUid: 10, limit: 15 });
  assert.equal(listed.uidvalidity, "9");
  assert.deepEqual(listed.uids, [15]);
  assert.equal(listed.messages[0].from.email, "anna@sklep.pl");
  assert.equal(listed.messages[0].messageId, "<m1@x>");
  assert.match(listed.messages[0].text, /paczka/);
});

test("SMTP czeka na kody i przechodzi STARTTLS", async () => {
  const seen = [];
  const lines = ["220 hi", "250-nhp", "250 AUTH PLAIN", "220 ready", "250-nhp", "250 AUTH", "235 ok", "250 ok", "250 ok", "354 go", "250 queued", "221 bye"];
  const io = {
    async write(line) { seen.push(line); },
    async readLine() { return lines.shift(); },
    async startTls() { seen.push("TLS"); },
    async close() {}
  };
  await smtpSend(io, { user: "u", pass: "p", from: "a@b.pl", to: "c@d.pl", data: "Hello", startTls: true });
  assert.ok(seen.includes("TLS"));
  assert.ok(seen.some((line) => line.startsWith("AUTH PLAIN ")));
  assert.ok(seen.some((line) => line.includes("RCPT TO:<c@d.pl>")));
});

test("schemat skrzynki i tablicy jest idempotentny i chroniony is_team", () => {
  const sql = fs.readFileSync(new URL("../supabase.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.team_board/);
  assert.match(sql, /create table if not exists public\.mail_threads/);
  assert.match(sql, /create table if not exists public\.mail_rules/);
  assert.match(sql, /is_board_admin/);
  assert.match(sql, /tablica_zmienia/);
  assert.match(sql, /using \(public\.is_team\(\)\)/);
  assert.match(sql, /on conflict \(slug\) do nothing/);
  const doc = fs.readFileSync(new URL("../docs/poczta.md", import.meta.url), "utf8");
  for (const name of ["MAIL_IMAP_HOST", "MAIL_IMAP_PASS", "MAIL_SMTP_HOST", "MAIL_SMTP_PASS", "MAIL_FROM", "MAIL_POLL_SECRET"]) {
    assert.match(doc, new RegExp(name));
  }
  assert.doesNotMatch(doc, /hasło:\s*\S{6,}/i);
});
