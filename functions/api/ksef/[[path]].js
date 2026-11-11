import { json, readJson } from "../../_util.js";
import { supabaseRest, teamUser } from "../../../lib/supabase-rest.mjs";
import { ksefAutoEnabled, ksefEnvironment, sellerConfigured, sellerFromEnv } from "../../../lib/ksef-fa3.mjs";
import { issueInvoiceForOrder, refreshStoredInvoice } from "../../../lib/ksef-issue.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

async function requireTeam(request, env) {
  const user = await teamUser(request, env);
  if (!user) {
    const err = new Error("Zaloguj się na konto zespołu.");
    err.status = 401;
    throw err;
  }
  return user;
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" } });
  }
  const path = parts(context);
  try {
    await requireTeam(context.request, context.env);
    const seller = sellerFromEnv(context.env);
    if (context.request.method === "GET" && (path[0] === "status" || !path[0])) {
      return json({
        ok: true,
        env: ksefEnvironment(context.env.KSEF_ENV),
        configured: sellerConfigured(seller) && Boolean(context.env.KSEF_TOKEN),
        token_set: Boolean(context.env.KSEF_TOKEN),
        nip_set: Boolean(seller.nip),
        seller_set: Boolean(seller.name && seller.address1),
        auto: ksefAutoEnabled(context.env)
      });
    }
    if (context.request.method === "POST" && path[0] === "issue") {
      const body = await readJson(context.request);
      const id = String(body.shopify_order_id || "").trim();
      if (!id) return json({ ok: false, error: "Brak zamówienia." }, 400);
      const rows = await supabaseRest(context.env, `shopify_orders?shopify_order_id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      const order = rows?.[0];
      if (!order) return json({ ok: false, error: "Nie ma tego zamówienia w Centrali. Najpierw pobierz zamówienia z Shopify." }, 404);
      const invoice = await issueInvoiceForOrder(context.env, order, { manual: true });
      return json({ ok: true, invoice });
    }
    if (context.request.method === "POST" && path[0] === "refresh") {
      const body = await readJson(context.request);
      const id = String(body.invoice_id || "").trim();
      if (!id) return json({ ok: false, error: "Brak faktury." }, 400);
      const rows = await supabaseRest(context.env, `ksef_invoices?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      const invoice = rows?.[0];
      if (!invoice) return json({ ok: false, error: "Nie ma takiej faktury." }, 404);
      if (invoice.status === "w_trakcie" && invoice.session_reference && invoice.ksef_reference) {
        const next = await refreshStoredInvoice(context.env, invoice);
        return json({ ok: true, invoice: next });
      }
      const orders = await supabaseRest(context.env, `shopify_orders?shopify_order_id=eq.${encodeURIComponent(invoice.shopify_order_id || "")}&select=*&limit=1`);
      if (!orders?.[0]) return json({ ok: false, error: "Brak zamówienia powiązanego z fakturą." }, 404);
      const next = await issueInvoiceForOrder(context.env, orders[0], { manual: true });
      return json({ ok: true, invoice: next });
    }
    if (context.request.method === "POST" && path[0] === "issue-paid") {
      const orders = (await supabaseRest(context.env, "shopify_orders?financial_status=eq.paid&cancelled_at=is.null&select=*&order=created_at.desc&limit=30")) || [];
      const invoices = (await supabaseRest(context.env, "ksef_invoices?select=shopify_order_id,status&limit=500")) || [];
      const done = new Set(invoices.filter((row) => row.status === "przyjeta" || row.status === "w_trakcie").map((row) => row.shopify_order_id));
      const pending = orders.filter((order) => !done.has(order.shopify_order_id)).slice(0, 10);
      const issued = [];
      for (const order of pending) {
        issued.push(await issueInvoiceForOrder(context.env, order, { manual: true }));
      }
      return json({ ok: true, issued });
    }
    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404);
  } catch (err) {
    const status = err.status || 500;
    console.log(JSON.stringify({ msg: "ksef_error", status, error: String(err.message || err).slice(0, 300) }));
    return json({ ok: false, error: String(err.message || "Błąd KSeF.").slice(0, 300) }, status >= 400 && status < 600 ? status : 500);
  }
}
