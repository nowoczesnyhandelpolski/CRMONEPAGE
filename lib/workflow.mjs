/** Status handlowy produktu. Osobno od products.status (np. „flagged” = brak ceny). */

export const WORKFLOW_STATUSES = [
  "pobrany",
  "w_przygotowaniu",
  "strona_gotowa",
  "opublikowany",
  "wstrzymany",
  "archiwum"
];

export const WORKFLOW_LABELS = {
  pobrany: "Pobrany",
  w_przygotowaniu: "W przygotowaniu",
  strona_gotowa: "Strona gotowa",
  opublikowany: "Opublikowany w Shopify",
  wstrzymany: "Wstrzymany",
  archiwum: "Archiwum"
};

export function isWorkflowStatus(value) {
  return WORKFLOW_STATUSES.includes(value);
}

/** Status produktu w Shopify Admin API. */
export function shopifyStatusFor(workflow) {
  if (workflow === "opublikowany") return "active";
  if (workflow === "archiwum") return "archived";
  return "draft";
}

/**
 * Status ze Shopify wraca na naszą oś.
 * Szkic w Shopify nie cofa „pobrany” / „strona gotowa” — te statusy i tak idą do Shopify jako draft.
 * Aktywny produkt, który w Shopify wrócił do szkicu, u nas staje się wstrzymany.
 */
export function workflowAfterShopify(shopifyStatus, current) {
  const now = isWorkflowStatus(current) ? current : "pobrany";
  if (shopifyStatus === "active") return "opublikowany";
  if (shopifyStatus === "archived") return "archiwum";
  if (shopifyStatus === "draft" || shopifyStatus === "unlisted") {
    if (now === "opublikowany" || now === "wstrzymany") return "wstrzymany";
    return now;
  }
  return now;
}
