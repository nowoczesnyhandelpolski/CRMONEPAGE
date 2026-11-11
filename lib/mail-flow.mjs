import { supabaseRest } from "./supabase-rest.mjs";
import { resolveOpenAIConfig } from "./openai-secret.mjs";
import { mailConfig } from "./mail-session.mjs";
import {
  buildRfc822,
  isMailLoop,
  matchRule,
  orderHints,
  paymentLabel,
  renderTemplate,
  subjectKey
} from "./mail-text.mjs";

function q(value) {
  return encodeURIComponent(String(value ?? ""));
}

async function rows(env, path, options) {
  const data = await supabaseRest(env, path, options);
  return data || [];
}

function sentAt(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function allowRate(env, sender, kind, max) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const found = await rows(env, `mail_auto_log?sender=eq.${q(sender)}&kind=eq.${q(kind)}&created_at=gte.${q(since)}&select=id&limit=10`);
  return found.length < max;
}

async function logAuto(env, sender, kind) {
  await supabaseRest(env, "mail_auto_log", { method: "POST", prefer: "return=minimal", body: { sender, kind } });
}

async function linkContext(env, email, subject, text) {
  let order = null;
  if (email) {
    const found = await rows(env, `shopify_orders?email=eq.${q(email)}&select=id,shopify_order_id,order_number,financial_status&order=placed_at.desc&limit=1`);
    order = found[0] || null;
  }
  if (!order) {
    for (const hint of orderHints(subject, text)) {
      for (const value of [`#${hint}`, hint]) {
        const found = await rows(env, `shopify_orders?order_number=eq.${q(value)}&select=id,shopify_order_id,order_number,financial_status&limit=1`);
        if (found[0]) { order = found[0]; break; }
      }
      if (order) break;
    }
  }
  let product = null;
  if (order?.id) {
    const lines = await rows(env, `shopify_order_lines?order_id=eq.${q(order.id)}&select=product_id,title&limit=1`);
    product = lines[0] || null;
  }
  let invoice = null;
  if (order?.shopify_order_id) {
    const found = await rows(env, `ksef_invoices?shopify_order_id=eq.${q(order.shopify_order_id)}&select=invoice_number,ksef_number,status&limit=1`);
    invoice = found[0] || null;
  }
  return {
    shopify_order_id: order?.shopify_order_id || null,
    order_label: order?.order_number || "",
    product_id: product?.product_id || null,
    product_label: product?.title || "",
    platnosc: paymentLabel(order?.financial_status),
    faktura: invoice?.ksef_number || invoice?.invoice_number || "",
    tracking: ""
  };
}

function templateCtx(message, link) {
  return {
    imie: message.from?.name || "",
    zamowienie: link.order_label || "",
    platnosc: link.platnosc || "",
    tracking: link.tracking || "",
    faktura: link.faktura || "",
    temat: message.subject || ""
  };
}

async function aiDraft(env, request, { message, link, rule, fallback }) {
  const envKey = String(env?.OPENAI_API_KEY || "").trim();
  if (!envKey && !request) return "";
  let config;
  try {
    config = envKey
      ? { apiKey: envKey, textModel: String(env.OPENAI_MODEL || "gpt-5-mini") }
      : await resolveOpenAIConfig(env, request);
  } catch {
    return "";
  }
  const prompt = [
    `Temat reguły: ${rule.name}`,
    `Wiadomość klienta:\n${String(message.text || "").slice(0, 4000)}`,
    `Zamówienie: ${link.order_label || "brak dopasowania"}`,
    `Płatność: ${link.platnosc || "brak"}`,
    `Faktura KSeF: ${link.faktura || "brak"}`,
    `Produkt: ${link.product_label || "brak"}`,
    "Szkic wyjściowy, który możesz poprawić, ale nie dopisuj faktów spoza kontekstu:",
    fallback
  ].join("\n\n");
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.textModel,
        temperature: 0.3,
        messages: [
          { role: "system", content: "Jesteś pracownikiem sklepu Nowoczesny Handel Polski. Napisz krótką odpowiedź po polsku. Nie wymyślaj numerów zamówień, przesyłek ani faktur. Gdy danych nie ma, napisz że sprawdzimy to ręcznie." },
          { role: "user", content: prompt }
        ]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return "";
    return String(data.choices?.[0]?.message?.content || "").trim().slice(0, 6000);
  } catch {
    return "";
  }
}

async function storeOutbound(env, { threadId, from, to, subject, text, messageId, inReplyTo, auto }) {
  await supabaseRest(env, "mail_messages", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      thread_id: threadId,
      direction: "out",
      message_id: messageId,
      in_reply_to: inReplyTo || null,
      from_email: from,
      to_email: to,
      subject,
      body_text: text,
      sent_at: new Date().toISOString()
    }
  });
  if (!auto) {
    await supabaseRest(env, `mail_threads?id=eq.${q(threadId)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "odpowiedziana", unread: false, updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() }
    });
  }
}

async function deliver(env, { config, sendMessage, thread, subject, text, inReplyTo, auto }) {
  const to = thread.customer_email;
  if (!to) throw new Error("Wątek nie ma adresu klienta.");
  const messageId = `<${crypto.randomUUID()}@nhp.local>`;
  const data = buildRfc822({
    from: config.from,
    to,
    subject,
    text,
    inReplyTo,
    messageId,
    auto
  });
  await sendMessage({ from: config.from, to, data, config });
  await storeOutbound(env, { threadId: thread.id, from: config.from, to, subject, text, messageId, inReplyTo, auto });
  return messageId;
}

async function maybeAuto(env, { request, config, sendMessage, thread, inbound, message, link }) {
  if (isMailLoop({ headers: message.headers || {}, from: message.from?.email || "", ourFrom: config.from })) return;
  const settingsRows = await rows(env, "mail_settings?id=eq.1&select=*&limit=1");
  const settings = settingsRows[0] || { auto_send: false, ack_enabled: false };
  const from = message.from?.email || "";
  const replySubject = `Re: ${message.subject || "wiadomość"}`;
  const inReplyTo = inbound?.message_id || message.messageId || "";
  if (settings.ack_enabled && from && await allowRate(env, from, "ack", 1)) {
    const text = "Dzień dobry,\n\ndostaliśmy wiadomość i odpiszemy najszybciej, jak się da. To jest automatyczne potwierdzenie — nie trzeba na nie odpowiadać.\n\nPozdrawiamy,\nNowoczesny Handel Polski";
    await deliver(env, { config, sendMessage, thread, subject: replySubject, text, inReplyTo, auto: true });
    await logAuto(env, from, "ack");
  }
  const rules = await rows(env, "mail_rules?enabled=eq.true&select=*&order=position.asc");
  const rule = matchRule(rules, message.subject, message.text);
  if (!rule) return;
  const ctx = templateCtx(message, link);
  let body = renderTemplate(rule.template, ctx);
  if (rule.use_ai) {
    const drafted = await aiDraft(env, request, { message, link, rule, fallback: body });
    if (drafted) body = drafted;
  }
  const saved = await supabaseRest(env, "mail_drafts", {
    method: "POST",
    prefer: "return=representation",
    body: { thread_id: thread.id, inbound_id: inbound?.id || null, rule_slug: rule.slug, body, status: "szkic" }
  });
  const draft = saved?.[0];
  if (settings.auto_send && rule.auto_send && from && await allowRate(env, from, "auto", 3)) {
    await deliver(env, { config, sendMessage, thread, subject: replySubject, text: body, inReplyTo, auto: true });
    if (draft?.id) {
      await supabaseRest(env, `mail_drafts?id=eq.${q(draft.id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { status: "wyslana" }
      });
    }
    await supabaseRest(env, `mail_threads?id=eq.${q(thread.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "odpowiedziana", unread: false, updated_at: new Date().toISOString() }
    });
    await logAuto(env, from, "auto");
  }
}

export async function ingestMessage(env, message, { request, config, sendMessage } = {}) {
  const from = String(message.from?.email || "").toLowerCase();
  const messageId = String(message.messageId || (message.uid ? `<imap-${message.uid}@nhp.local>` : "")).trim();
  if (messageId) {
    const dup = await rows(env, `mail_messages?message_id=eq.${q(messageId)}&select=id&limit=1`);
    if (dup.length) return { imported: false, duplicate: true };
  }
  if (from && config?.from && from === String(config.from).toLowerCase()) return { imported: false, own: true };
  const key = subjectKey(message.subject);
  let thread = null;
  if (message.inReplyTo) {
    const prev = await rows(env, `mail_messages?message_id=eq.${q(message.inReplyTo)}&select=thread_id&limit=1`);
    if (prev[0]?.thread_id) {
      const found = await rows(env, `mail_threads?id=eq.${q(prev[0].thread_id)}&select=*&limit=1`);
      thread = found[0] || null;
    }
  }
  if (!thread && from) {
    const found = await rows(env, `mail_threads?customer_email=eq.${q(from)}&subject_key=eq.${q(key)}&select=*&limit=1`);
    thread = found[0] || null;
  }
  const link = await linkContext(env, from, message.subject, message.text);
  const now = new Date().toISOString();
  if (!thread) {
    const inserted = await supabaseRest(env, "mail_threads", {
      method: "POST",
      prefer: "return=representation",
      body: {
        subject: (message.subject || "(bez tematu)").slice(0, 300),
        subject_key: key,
        customer_email: from,
        customer_name: (message.from?.name || "").slice(0, 120),
        status: "nowa",
        unread: true,
        shopify_order_id: link.shopify_order_id,
        order_label: link.order_label,
        product_id: link.product_id,
        product_label: link.product_label,
        last_message_at: now
      }
    });
    thread = inserted?.[0];
  } else {
    const status = thread.status === "odpowiedziana" || thread.status === "zamknieta" ? "nowa" : thread.status;
    await supabaseRest(env, `mail_threads?id=eq.${q(thread.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: {
        status,
        unread: true,
        last_message_at: now,
        updated_at: now,
        shopify_order_id: thread.shopify_order_id || link.shopify_order_id,
        order_label: thread.order_label || link.order_label,
        product_id: thread.product_id || link.product_id,
        product_label: thread.product_label || link.product_label
      }
    });
    thread = { ...thread, status };
  }
  if (!thread?.id) throw new Error("Nie udało się zapisać wątku.");
  let inbound = null;
  try {
    const saved = await supabaseRest(env, "mail_messages", {
      method: "POST",
      prefer: "return=representation",
      body: {
        thread_id: thread.id,
        direction: "in",
        message_id: messageId || null,
        in_reply_to: message.inReplyTo || null,
        from_email: from,
        from_name: message.from?.name || "",
        to_email: config?.from || "",
        subject: message.subject || "",
        body_text: message.text || "",
        imap_uid: message.uid || null,
        sent_at: sentAt(message.date)
      }
    });
    inbound = saved?.[0] || null;
  } catch (err) {
    if (/23505|duplicate/i.test(String(err.detail || err.message || ""))) return { imported: false, duplicate: true };
    throw err;
  }
  if (sendMessage && config) await maybeAuto(env, { request, config, sendMessage, thread, inbound, message, link });
  return { imported: true, thread_id: thread.id };
}

export async function pollMailbox(env, { request, listNew, sendMessage } = {}) {
  const config = mailConfig(env);
  if (!config) return { ok: true, configured: false, imported: 0 };
  const stateRows = await rows(env, "mail_sync_state?id=eq.1&select=*&limit=1");
  const state = stateRows[0] || { last_uid: 0, uidvalidity: "" };
  try {
    let listed = await listNew({
      user: config.imap.user,
      pass: config.imap.pass,
      lastUid: Number(state.last_uid) || 0,
      limit: 15
    });
    const reset = Boolean(state.uidvalidity && listed.uidvalidity && state.uidvalidity !== listed.uidvalidity);
    if (reset) {
      listed = await listNew({ user: config.imap.user, pass: config.imap.pass, lastUid: 0, limit: 15 });
    }
    const messages = listed.messages;
    let imported = 0;
    for (const message of messages) {
      const result = await ingestMessage(env, message, { request, config, sendMessage });
      if (result.imported) imported += 1;
    }
    await supabaseRest(env, "mail_sync_state?id=eq.1", {
      method: "PATCH",
      prefer: "return=minimal",
      body: {
        uidvalidity: listed.uidvalidity || state.uidvalidity || "",
        last_uid: reset ? listed.maxUid : Math.max(Number(state.last_uid) || 0, listed.maxUid || 0),
        last_poll_at: new Date().toISOString(),
        last_error: null
      }
    });
    return { ok: true, configured: true, imported, uidvalidity: listed.uidvalidity || "" };
  } catch (err) {
    await supabaseRest(env, "mail_sync_state?id=eq.1", {
      method: "PATCH",
      prefer: "return=minimal",
      body: { last_poll_at: new Date().toISOString(), last_error: String(err.message || "Błąd skrzynki").slice(0, 300) }
    }).catch(() => {});
    throw err;
  }
}

export async function replyToThread(env, threadId, text, { sendMessage } = {}) {
  const config = mailConfig(env);
  if (!config) {
    const err = new Error("Skrzynka nie jest skonfigurowana. Ustaw sekrety MAIL_IMAP_* , MAIL_SMTP_* i MAIL_FROM.");
    err.status = 409;
    throw err;
  }
  const body = String(text || "").trim();
  if (!body) {
    const err = new Error("Wpisz treść odpowiedzi.");
    err.status = 400;
    throw err;
  }
  const threads = await rows(env, `mail_threads?id=eq.${q(threadId)}&select=*&limit=1`);
  const thread = threads[0];
  if (!thread) {
    const err = new Error("Nie ma takiego wątku.");
    err.status = 404;
    throw err;
  }
  const previous = await rows(env, `mail_messages?thread_id=eq.${q(threadId)}&direction=eq.in&select=message_id,subject&order=sent_at.desc&limit=1`);
  const subject = `Re: ${thread.subject || previous[0]?.subject || "wiadomość"}`;
  await deliver(env, {
    config,
    sendMessage,
    thread,
    subject,
    text: body.slice(0, 20000),
    inReplyTo: previous[0]?.message_id || "",
    auto: false
  });
  return { ok: true };
}

export async function sendDraft(env, draftId, { sendMessage } = {}) {
  const config = mailConfig(env);
  if (!config) {
    const err = new Error("Skrzynka nie jest skonfigurowana. Ustaw sekrety MAIL_IMAP_* , MAIL_SMTP_* i MAIL_FROM.");
    err.status = 409;
    throw err;
  }
  const drafts = await rows(env, `mail_drafts?id=eq.${q(draftId)}&select=*&limit=1`);
  const draft = drafts[0];
  if (!draft || draft.status !== "szkic") {
    const err = new Error("Nie ma szkicu do wysłania.");
    err.status = 404;
    throw err;
  }
  const threads = await rows(env, `mail_threads?id=eq.${q(draft.thread_id)}&select=*&limit=1`);
  const thread = threads[0];
  if (!thread) {
    const err = new Error("Wątek szkicu zniknął.");
    err.status = 404;
    throw err;
  }
  const previous = await rows(env, `mail_messages?thread_id=eq.${q(thread.id)}&direction=eq.in&select=message_id&order=sent_at.desc&limit=1`);
  await deliver(env, {
    config,
    sendMessage,
    thread,
    subject: `Re: ${thread.subject || "wiadomość"}`,
    text: draft.body,
    inReplyTo: previous[0]?.message_id || "",
    auto: false
  });
  await supabaseRest(env, `mail_drafts?id=eq.${q(draft.id)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { status: "wyslana" }
  });
  return { ok: true };
}

export { mailConfig };
