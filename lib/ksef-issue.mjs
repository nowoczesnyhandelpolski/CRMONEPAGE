import { buildFa3 } from "./ksef-fa3.mjs";
import { ksefConfig, readInvoiceStatus, submitFa3 } from "./ksef-client.mjs";
import { supabaseRest } from "./supabase-rest.mjs";

function invoiceRow(shopifyOrderId, fields) {
  return {
    shopify_order_id: shopifyOrderId,
    updated_at: new Date().toISOString(),
    ...fields
  };
}

async function saveInvoice(env, row) {
  const saved = await supabaseRest(env, "ksef_invoices?on_conflict=shopify_order_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: row
  });
  return saved?.[0] || row;
}

export async function issueKsefForOrder(env, shopifyOrderId, { fetchImpl = fetch, force = false } = {}) {
  const id = String(shopifyOrderId || "").replace(/\D/g, "");
  if (!id) {
    const err = new Error("Brak numeru zamówienia Shopify.");
    err.status = 400;
    throw err;
  }
  const orders = await supabaseRest(env, `shopify_orders?shopify_order_id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const order = orders?.[0];
  if (!order) {
    const err = new Error("Nie ma tego zamówienia Shopify w Centrali. Najpierw pobierz zamówienia albo poczekaj na webhook.");
    err.status = 404;
    throw err;
  }
  const existingRows = await supabaseRest(env, `ksef_invoices?shopify_order_id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const existing = existingRows?.[0];
  if (existing?.status === "przyjeta") return existing;
  if (!force && (existing?.status === "wyslana" || existing?.status === "odrzucona")) return existing;
  const lines = await supabaseRest(env, `shopify_order_lines?order_id=eq.${encodeURIComponent(order.id)}&select=*&order=shopify_line_id.asc`) || [];
  const config = ksefConfig(env);
  let number = existing?.invoice_number || "";
  if (!number) {
    number = await supabaseRest(env, "rpc/next_ksef_invoice_number", { method: "POST", body: {} });
    if (typeof number !== "string" || !number.startsWith("FV/")) {
      const err = new Error("Nie udało się nadać numeru faktury.");
      err.status = 502;
      throw err;
    }
  }
  const billing = order.billing || {};
  let built;
  try {
    built = buildFa3({
      number,
      currency: order.currency,
      issuedOn: order.placed_at || new Date(),
      createdAt: new Date(),
      vatRate: config?.vatRate ?? 23,
      seller: config ? { nip: config.nip, name: config.name, address1: config.address1, address2: config.address2 } : {
        nip: String(env?.KSEF_NIP || "0000000000"),
        name: String(env?.KSEF_SELLER_NAME || "Sprzedawca"),
        address1: String(env?.KSEF_SELLER_ADDRESS1 || env?.KSEF_SELLER_ADDRESS || "adres do uzupełnienia"),
        address2: String(env?.KSEF_SELLER_ADDRESS2 || "")
      },
      buyer: {
        nip: billing.nip || "",
        name: billing.name || order.customer_name || "Nabywca",
        address1: billing.address1 || "",
        address2: [billing.zip, billing.city].filter(Boolean).join(" ")
      },
      lines: lines.map((line) => ({
        name: line.title,
        qty: line.quantity,
        gross: Number(line.line_total) || 0,
        sku: line.sku || "",
        gtin: ""
      }))
    });
  } catch (err) {
    return saveInvoice(env, invoiceRow(id, {
      invoice_number: number,
      status: "blad",
      xml: "",
      error: String(err.message || err).slice(0, 300),
      env: config?.env || String(env?.KSEF_ENV || "test")
    }));
  }
  if (!config) {
    return saveInvoice(env, invoiceRow(id, {
      invoice_number: number,
      status: "oczekuje_konfiguracji",
      xml: built.xml,
      error: "Ustaw KSEF_TOKEN, KSEF_NIP, KSEF_SELLER_NAME i KSEF_SELLER_ADDRESS1. Środowisko domyślne to test.",
      env: "test"
    }));
  }
  try {
    const sent = await submitFa3({ config, xml: built.xml, fetchImpl });
    return saveInvoice(env, invoiceRow(id, {
      invoice_number: number,
      ksef_number: sent.ksefNumber || null,
      ksef_reference: sent.referenceNumber,
      session_reference: sent.sessionReference,
      status: sent.pending ? "wyslana" : "przyjeta",
      xml: built.xml,
      error: sent.pending ? "KSeF przyjął plik i jeszcze nadaje numer." : "",
      env: config.env,
      issued_at: sent.pending ? null : new Date().toISOString()
    }));
  } catch (err) {
    return saveInvoice(env, invoiceRow(id, {
      invoice_number: number,
      ksef_reference: err.referenceNumber || existing?.ksef_reference || null,
      session_reference: err.sessionReference || existing?.session_reference || null,
      status: err.referenceNumber ? "odrzucona" : "blad",
      xml: built.xml,
      error: String(err.message || err).slice(0, 300),
      env: config.env
    }));
  }
}

export async function refreshKsefInvoice(env, shopifyOrderId, { fetchImpl = fetch } = {}) {
  const id = String(shopifyOrderId || "").replace(/\D/g, "");
  const rows = await supabaseRest(env, `ksef_invoices?shopify_order_id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const invoice = rows?.[0];
  if (!invoice) {
    const err = new Error("Najpierw wystaw fakturę.");
    err.status = 404;
    throw err;
  }
  if (invoice.status === "przyjeta" || !invoice.session_reference || !invoice.ksef_reference) return invoice;
  const config = ksefConfig(env);
  if (!config) return invoice;
  const status = await readInvoiceStatus({
    config,
    sessionReference: invoice.session_reference,
    referenceNumber: invoice.ksef_reference,
    fetchImpl
  });
  const code = status?.status?.code;
  if (code === 200) {
    return saveInvoice(env, invoiceRow(id, {
      invoice_number: invoice.invoice_number,
      ksef_number: status.ksefNumber || invoice.ksef_number,
      ksef_reference: invoice.ksef_reference,
      session_reference: invoice.session_reference,
      status: "przyjeta",
      xml: invoice.xml,
      error: "",
      env: config.env,
      issued_at: new Date().toISOString()
    }));
  }
  if (code >= 400) {
    return saveInvoice(env, invoiceRow(id, {
      invoice_number: invoice.invoice_number,
      ksef_reference: invoice.ksef_reference,
      session_reference: invoice.session_reference,
      status: "odrzucona",
      xml: invoice.xml,
      error: String(status.status.details?.[0] || status.status.description || "KSeF odrzucił fakturę").slice(0, 300),
      env: config.env
    }));
  }
  return invoice;
}
