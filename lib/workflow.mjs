/** Lejek produktu. Kolumna products.status (active/flagged) zostaje oznaczeniem braków. */

export const WORKFLOW = [
  { id: "pobrany", label: "Pobrany", shopify: "DRAFT", color: "var(--grey)" },
  { id: "w_przygotowaniu", label: "W przygotowaniu", shopify: "DRAFT", color: "var(--info)" },
  { id: "strona_gotowa", label: "Strona gotowa", shopify: "DRAFT", color: "var(--violet)" },
  { id: "opublikowany", label: "Opublikowany w Shopify", shopify: "ACTIVE", color: "var(--good)" },
  { id: "wstrzymany", label: "Wstrzymany", shopify: "DRAFT", color: "var(--warn)" },
  { id: "archiwum", label: "Archiwum", shopify: "ARCHIVED", color: "var(--grey)" }
];

const IDS = new Set(WORKFLOW.map((item) => item.id));
const AUTO = new Set(["strona_gotowa", "opublikowany", "wstrzymany", "archiwum"]);

export function isWorkflow(id) {
  return IDS.has(id);
}

export function workflowById(id) {
  return WORKFLOW.find((item) => item.id === id) || WORKFLOW[0];
}

export function shopifyStatusFor(workflow) {
  return workflowById(workflow).shopify;
}

/** Status Shopify wraca do lejka. Szkic nie cofa produktu, który jeszcze nie był w sklepie. */
export function workflowFromShopify(shopifyStatus, current = "pobrany") {
  const known = IDS.has(current) ? current : "pobrany";
  const status = String(shopifyStatus || "").toLowerCase();
  if (status === "active") return "opublikowany";
  if (status === "archived") return "archiwum";
  if (status === "draft" || status === "unlisted") {
    if (known === "opublikowany" || known === "archiwum") return "wstrzymany";
    return known;
  }
  return known;
}

export function shouldAutoPush(product) {
  if (!product) return false;
  if (product.shopify_product_id) return true;
  return AUTO.has(product.workflow_status);
}

/** Brak klucza w ustawieniach = włączone. Wyłącza dopiero jawne false. */
export function shopifyAutoDraftEnabled(settings) {
  if (!settings || typeof settings !== "object") return true;
  if (settings.shopify_auto_draft == null || settings.shopify_auto_draft === "") return true;
  return settings.shopify_auto_draft === true || settings.shopify_auto_draft === 1 || settings.shopify_auto_draft === "1";
}

/**
 * active — jawna publikacja, produkt w Shopify staje się ACTIVE.
 * draft — szkic, nie cofa już opublikowanego ani archiwum.
 * hold — wycofanie strony: aktywny wraca do szkicu (wstrzymany).
 */
export function workflowForShopifyPush(current, intent) {
  const known = IDS.has(current) ? current : "pobrany";
  if (intent === "active") return known === "archiwum" ? "archiwum" : "opublikowany";
  if (intent === "hold") return known === "opublikowany" ? "wstrzymany" : known;
  if (intent === "draft") {
    if (known === "opublikowany" || known === "archiwum" || known === "wstrzymany" || known === "strona_gotowa") return known;
    return "strona_gotowa";
  }
  return known;
}

/** Zakładki Bazy produktów: strona istnieje albo jeszcze nie. */
export function partitionProducts(products, pages) {
  const withPage = new Set((pages || []).map((page) => String(page.product_id || "")).filter(Boolean));
  const pobrane = [];
  const gotowe = [];
  for (const product of products || []) {
    if (withPage.has(String(product.id))) gotowe.push(product);
    else pobrane.push(product);
  }
  return { pobrane, gotowe };
}

export function pagesForProduct(pages, productId) {
  return (pages || []).filter((page) => String(page.product_id || "") === String(productId));
}

export function primaryPage(pages, productId) {
  const list = pagesForProduct(pages, productId);
  return list.find((page) => page.status === "published") || list[0] || null;
}

/** Status idzie tylko do przodu przy zapisie strony. Nie cofa opublikowanego ani wstrzymanego. */
export function workflowAfterPage(current, pageStatus) {
  const known = IDS.has(current) ? current : "pobrany";
  if (pageStatus === "published" && (known === "pobrany" || known === "w_przygotowaniu")) return "strona_gotowa";
  if (pageStatus === "draft" && known === "pobrany") return "w_przygotowaniu";
  return known;
}
