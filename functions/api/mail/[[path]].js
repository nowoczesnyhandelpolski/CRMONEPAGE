import { connect } from "cloudflare:sockets";
import { CORS, json, readJson } from "../../_util.js";
import { teamUser } from "../../../lib/supabase-rest.mjs";
import { timingSafeEqual } from "../../../lib/shopify-core.mjs";
import { wrapSocket } from "../../../lib/mail-socket.mjs";
import { imapListNew, mailConfig, smtpSend } from "../../../lib/mail-session.mjs";
import { extractPlain, parseAddress, parseHeaders } from "../../../lib/mail-text.mjs";
import { ingestMessage, pollMailbox, replyToThread, sendDraft } from "../../../lib/mail-flow.mjs";

function parts(context) {
  const path = context.params?.path;
  if (Array.isArray(path)) return path.filter(Boolean);
  return String(path || "").split("/").filter(Boolean);
}

function allowed(request, env) {
  const header = request.headers.get("x-nhp-mail-poll") || request.headers.get("x-nhp-sync") || "";
  const secrets = [env?.MAIL_POLL_SECRET, env?.NHP_SYNC_SECRET].map((item) => String(item || "")).filter(Boolean);
  return secrets.some((secret) => header && timingSafeEqual(header, secret));
}

function openSocket(spec) {
  const socket = connect({ hostname: spec.host, port: Number(spec.port) }, {
    secureTransport: spec.secure === "on" ? "on" : spec.secure === "off" ? "off" : "starttls"
  });
  return wrapSocket(socket);
}

function transports(env) {
  const config = mailConfig(env);
  return {
    listNew: async (opts) => {
      const io = openSocket(config.imap);
      try {
        return await imapListNew(io, { ...opts, startTls: config.imap.secure === "starttls" });
      } finally {
        await io.close();
      }
    },
    sendMessage: async ({ to, data }) => {
      const io = openSocket(config.smtp);
      try {
        await smtpSend(io, {
          user: config.smtp.user,
          pass: config.smtp.pass,
          from: config.from,
          to,
          data,
          startTls: config.smtp.secure === "starttls"
        });
      } finally {
        await io.close();
      }
    }
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const path = parts(context);
  try {
    if (request.method === "POST" && path[0] === "inbound") {
      const secret = String(env.MAIL_INBOUND_SECRET || "");
      const header = request.headers.get("x-nhp-mail-inbound") || "";
      if (!secret || !timingSafeEqual(header, secret)) return json({ ok: false, error: "Zły podpis wiadomości przychodzącej." }, 401);
      const body = await readJson(request, 200000);
      const raw = String(body.raw || "");
      const headers = raw ? parseHeaders(raw) : {};
      const from = parseAddress(body.from || headers.from || "");
      const message = {
        messageId: body.message_id || headers["message-id"] || "",
        inReplyTo: body.in_reply_to || headers["in-reply-to"] || "",
        subject: body.subject || headers.subject || "",
        from,
        date: headers.date || new Date().toISOString(),
        headers,
        text: body.text || (raw ? extractPlain(raw) : "")
      };
      const config = mailConfig(env);
      const transport = config ? transports(env) : {};
      const result = await ingestMessage(env, message, { config, sendMessage: transport.sendMessage });
      return json({ ok: true, ...result });
    }

    const cron = allowed(request, env);
    if (!cron) {
      const user = await teamUser(request, env);
      if (!user) return json({ ok: false, error: "Zaloguj się na konto zespołu." }, 401, CORS);
    }
    const config = mailConfig(env);
    if (request.method === "GET" && (!path[0] || path[0] === "status")) {
      return json({
        ok: true,
        configured: Boolean(config),
        from: config?.from || "",
        imap_host: config?.imap.host || "",
        smtp_host: config?.smtp.host || ""
      }, 200, CORS);
    }
    if (request.method === "POST" && path[0] === "poll") {
      const transport = config ? transports(env) : {};
      const result = await pollMailbox(env, { request: cron ? null : request, ...transport });
      return json(result, 200, CORS);
    }
    const body = request.method === "POST" ? await readJson(request, 30000) : {};
    if (request.method === "POST" && path[0] === "reply") {
      const transport = transports(env);
      await replyToThread(env, body.thread_id, body.text, transport);
      return json({ ok: true }, 200, CORS);
    }
    if (request.method === "POST" && path[0] === "draft") {
      const transport = transports(env);
      await sendDraft(env, body.draft_id, transport);
      return json({ ok: true }, 200, CORS);
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404, CORS);
  } catch (err) {
    const status = err.status || 500;
    const message = String(err.message || "Błąd skrzynki.").replace(/AUTH PLAIN \S+/g, "AUTH PLAIN").slice(0, 300);
    console.log(JSON.stringify({ msg: "mail_error", status, error: message }));
    return json({ ok: false, error: message }, status >= 400 && status < 600 ? status : 500, CORS);
  }
}
