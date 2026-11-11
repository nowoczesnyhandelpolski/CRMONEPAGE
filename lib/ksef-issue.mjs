import { supabaseRest } from "./supabase-rest.mjs";
import {
  buildFa3Xml,
  ksefAutoEnabled,
  ksefEnvironment,
  linesFromShopifyOrder,
  sellerConfigured,
  sellerFromEnv,
  warsawDate
} from "./ksef-fa3.mjs";
import { readInvoiceStatus, sendFa3Invoice } from "./ksef-client.mjs";

function publicInvoice(row) {
  if (!row) return null;
  return {
    id: row.id,
    shopify_order_id: row.shopify_order_id,
    invoice_number: row.invoice_number,
    status: row.status,
    ksef_reference: row.ksef_reference || "",
    ksef_number: row.ksef_number || "",
    error: row.error || "",
    gross: row.gross,
    net: row.net,
    vat: row.vat,
    currency: row.currency,
    upo_url: row.upo_url || "",
    issued_at: row.issued_at
  };
}

async function existingInvoice(env, shopifyOrderId) {
  const rows = await supabaseRest(
    env,
    `ksef_invoices?shopify_order_id=eq.${encodeURIComponent(shopifyOrderId)}&select=*&limit=1`
  );
  return rows?.[0] || null;
}

function mapSendResult(result) {
  if (result.ksefNumber && (result.statusCode === 200 || result.statusCode === 440)) {
    return { status: "przyjeta", error: result.statusCode === 440 ? "Faktura była już w KSeF." : "" };
  }
  if (result.pending) return { status: "w_trakcie", error: "" };
  if (result.statusCode >= 400) return { status: "odrzucona", error: result.description || "KSeF odrzucił fakturę." };
  return { status: "w_trakcie", error: "" };
}

async function saveInvoice(env, id, patch) {
  const rows = await supabaseRest(env, `ksef_invoices?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { ...patch, updated_at: new Date().toISOString() }
  });
  return rows?.[0] || null;
}

export async function issueInvoiceForOrder(env, order, { manual = false, fetchImpl, sleep, attempts } = {}) {
  if (!order?.shopify_order_id) {
    const err = new Error("Brak zamówienia Shopify.");
    err.status = 400;
    throw err;
  }
  if (order.cancelled_at) {
    const err = new Error("Zamówienie jest anulowane. Nie wystawiam faktury.");
    err.status = 400;
    throw err;
  }
  const current = await existingInvoice(env, order.shopify_order_id);
  if (current && (current.status === "przyjeta" || current.status === "w_trakcie") && !manual) return publicInvoice(current);
  if (current?.status === "przyjeta") return publicInvoice(current);
  if (current?.status === "w_trakcie" && current.session_reference && current.ksef_reference) {
    return publicInvoice(await refreshStoredInvoice(env, current, { fetchImpl, sleep, attempts }));
  }

  const seller = sellerFromEnv(env);
  const soldOn = warsawDate(order.paid_at ? new Date(order.paid_at) : new Date(order.created_at || Date.now()));
  const issuedOn = warsawDate(new Date());
  const { lines, rate } = linesFromShopifyOrder(order, seller.vatRate);
  const number = current?.invoice_number || await supabaseRest(env, "rpc/next_invoice_number", { method: "POST", body: {} });
  let draft = null;
  let configError = "";
  if (!sellerConfigured(seller)) configError = "Uzupełnij KSEF_NIP, KSEF_SELLER_NAME i KSEF_SELLER_ADDRESS.";
  else if (!lines.length) configError = "Zamówienie nie ma kwoty do zafakturowania.";
  else {
    try {
      draft = buildFa3Xml({
        number,
        seller,
        buyer: order.buyer || {},
        lines,
        currency: order.currency || "PLN",
        vatRate: rate,
        issuedOn,
        soldOn,
        paid: ["paid", "partially_paid", "partially_refunded"].includes(order.financial_status),
        paidOn: soldOn,
        gateway: order.gateway || "",
        now: new Date()
      });
    } catch (err) {
      configError = err.message || "Nie udało się złożyć XML.";
    }
  }

  const baseRow = {
    shopify_order_id: order.shopify_order_id,
    invoice_number: number,
    xml: draft?.xml || current?.xml || null,
    gross: draft?.gross ?? null,
    net: draft?.net ?? null,
    vat: draft?.vat ?? null,
    currency: draft?.currency || order.currency || "PLN",
    updated_at: new Date().toISOString()
  };

  if (configError || !draft) {
    const patch = { ...baseRow, status: "oczekuje_konfiguracji", error: configError };
    const saved = current
      ? await saveInvoice(env, current.id, patch)
      : (await supabaseRest(env, "ksef_invoices", { method: "POST", prefer: "return=representation", body: patch }))?.[0];
    return publicInvoice(saved);
  }

  if (!env.KSEF_TOKEN) {
    const patch = { ...baseRow, status: "oczekuje_konfiguracji", error: "Brak sekretu KSEF_TOKEN." };
    const saved = current
      ? await saveInvoice(env, current.id, patch)
      : (await supabaseRest(env, "ksef_invoices", { method: "POST", prefer: "return=representation", body: patch }))?.[0];
    return publicInvoice(saved);
  }

  const pending = { ...baseRow, status: "w_trakcie", error: "" };
  let row = current
    ? await saveInvoice(env, current.id, pending)
    : (await supabaseRest(env, "ksef_invoices", { method: "POST", prefer: "return=representation", body: pending }))?.[0];

  try {
    const sent = await sendFa3Invoice({
      envName: ksefEnvironment(env.KSEF_ENV),
      ksefToken: env.KSEF_TOKEN,
      nip: seller.nip,
      xml: draft.xml,
      fetchImpl,
      sleep,
      attempts
    });
    const mapped = mapSendResult(sent);
    row = await saveInvoice(env, row.id, {
      status: mapped.status,
      error: mapped.error,
      ksef_number: sent.ksefNumber || null,
      ksef_reference: sent.referenceNumber || null,
      session_reference: sent.sessionReference || null,
      upo_url: sent.upoUrl || null,
      issued_at: mapped.status === "przyjeta" ? new Date().toISOString() : null
    });
    return publicInvoice(row);
  } catch (err) {
    row = await saveInvoice(env, row.id, { status: "blad", error: String(err.message || err).slice(0, 400) });
    return publicInvoice(row);
  }
}

export async function refreshStoredInvoice(env, invoice, { fetchImpl, sleep, attempts } = {}) {
  if (!invoice?.session_reference || !invoice?.ksef_reference) return publicInvoice(invoice);
  if (!env.KSEF_TOKEN || !sellerConfigured(sellerFromEnv(env))) return publicInvoice(invoice);
  try {
    const status = await readInvoiceStatus({
      envName: ksefEnvironment(env.KSEF_ENV),
      ksefToken: env.KSEF_TOKEN,
      nip: sellerFromEnv(env).nip,
      sessionReference: invoice.session_reference,
      referenceNumber: invoice.ksef_reference,
      fetchImpl,
      sleep,
      attempts
    });
    const mapped = mapSendResult(status);
    const row = await saveInvoice(env, invoice.id, {
      status: mapped.status,
      error: mapped.error,
      ksef_number: status.ksefNumber || invoice.ksef_number || null,
      upo_url: status.upoUrl || invoice.upo_url || null,
      issued_at: mapped.status === "przyjeta" ? (invoice.issued_at || new Date().toISOString()) : invoice.issued_at
    });
    return publicInvoice(row);
  } catch (err) {
    const row = await saveInvoice(env, invoice.id, { error: String(err.message || err).slice(0, 400) });
    return publicInvoice(row);
  }
}

export async function autoInvoicePaidOrder(env, order, opts) {
  if (!ksefAutoEnabled(env)) return null;
  if (!["paid", "partially_paid"].includes(order?.financial_status)) return null;
  if (order.cancelled_at) return null;
  return issueInvoiceForOrder(env, order, { ...opts, manual: false });
}
