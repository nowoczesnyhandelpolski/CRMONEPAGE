// Sesja CSV wtyczki. Czysty moduł: bez chrome, żeby dało się go testować w Node.
// Plik jest eksportem Sharkly (średnik, UTF-8 z BOM) — ten sam, który czyta Generator.

export const SESSION_LIMIT = 2000;

export function emptySession() {
  return { status: "idle", currentGroup: "", groups: [], items: [] };
}

export function cleanGroup(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function itemKey(item) {
  const link = String(item?.source_link || "").trim();
  if (link) {
    try {
      const url = new URL(link);
      url.hash = "";
      url.search = "";
      return `u:${url.origin}${url.pathname}`;
    } catch {
      return `u:${link.split("#")[0]}`;
    }
  }
  if (item?.source_offer_id) return `o:${item.source_offer_id}`;
  if (item?.ean) return `e:${item.ean}`;
  if (item?.sku) return `s:${item.sku}`;
  return `n:${String(item?.catalog_name || "").toLowerCase()}`;
}

function text(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function moneyText(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return value.toFixed(2);
  }
  return String(value).trim().slice(0, 32);
}

function httpList(value) {
  const src = Array.isArray(value) ? value : [];
  const out = [];
  for (const entry of src) {
    const url = typeof entry === "string" ? entry : entry?.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) continue;
    const clean = url.trim().slice(0, 1000);
    if (!out.includes(clean)) out.push(clean);
  }
  return out.slice(0, 24);
}

function paramList(value) {
  const src = Array.isArray(value) ? value : [];
  const out = [];
  for (const row of src) {
    const name = text(row?.name ?? row?.k, 80);
    const paramValue = text(row?.value ?? row?.v, 200);
    if (!name || !paramValue || paramValue === "[object Object]") continue;
    if (out.some((item) => item.name === name)) continue;
    out.push({ name, value: paramValue });
    if (out.length === 40) break;
  }
  return out;
}

export function normalizeItem(raw, fallbackGroup = "") {
  if (!raw || typeof raw !== "object") return null;
  const catalog_name = text(raw.catalog_name || raw.name, 300);
  const ean = text(raw.ean, 32).replace(/\s/g, "");
  const sku = text(raw.sku, 64);
  const source_link = text(raw.source_link || raw.url, 1000);
  if (!catalog_name && !ean && !sku && !source_link) return null;
  const parameters = paramList(raw.parameters);
  const images = httpList(raw.images);
  const description = String(raw.description || raw.description_text || "").replace(/\r/g, "").trim().slice(0, 8000);
  const sections = Array.isArray(raw.description_sections) ? raw.description_sections : [];
  return {
    id: text(raw.id, 40) || "",
    group: cleanGroup(raw.group == null ? fallbackGroup : raw.group),
    catalog_name,
    sku,
    ean,
    producer: text(raw.producer || raw.brand, 160),
    price: moneyText(raw.price),
    price_before_promo: moneyText(raw.price_before_promo ?? raw.old_price),
    cena_2: moneyText(raw.cena_2),
    cena_3: moneyText(raw.cena_3),
    category: text(raw.category, 300),
    category_id: text(raw.category_id, 40),
    parameters,
    images,
    description,
    description_sections: sections
      .filter((section) => section && (section.text || section.url))
      .slice(0, 20)
      .map((section) => ({
        type: section.type === "image" ? "image" : "text",
        text: section.text ? String(section.text).slice(0, 4000) : "",
        url: typeof section.url === "string" ? section.url.slice(0, 1000) : ""
      })),
    source_link,
    source_offer_id: text(raw.source_offer_id, 40),
    allegro_product_id: text(raw.allegro_product_id, 80),
    added_at: text(raw.added_at, 40)
  };
}

function newId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeSession(raw) {
  const base = emptySession();
  if (!raw || typeof raw !== "object") return base;
  const status = raw.status === "active" || raw.status === "paused" ? raw.status : "idle";
  const groups = [];
  for (const name of Array.isArray(raw.groups) ? raw.groups : []) {
    const clean = cleanGroup(name);
    if (!clean || groups.some((item) => item.toLowerCase() === clean.toLowerCase())) continue;
    groups.push(clean);
    if (groups.length === 100) break;
  }
  const items = [];
  for (const row of Array.isArray(raw.items) ? raw.items : []) {
    const item = normalizeItem(row);
    if (!item) continue;
    if (!item.id) item.id = newId();
    if (items.some((existing) => existing.id === item.id || itemKey(existing) === itemKey(item))) continue;
    items.push(item);
    if (items.length === SESSION_LIMIT) break;
  }
  let currentGroup = cleanGroup(raw.currentGroup);
  if (currentGroup && !groups.some((item) => item.toLowerCase() === currentGroup.toLowerCase())) {
    groups.push(currentGroup);
  }
  if (currentGroup) currentGroup = groups.find((item) => item.toLowerCase() === currentGroup.toLowerCase()) || "";
  return { status, currentGroup, groups, items };
}

export function startSession(session) {
  return { ...normalizeSession(session), status: "active" };
}

export function pauseSession(session) {
  const next = normalizeSession(session);
  return { ...next, status: next.status === "idle" ? "idle" : "paused" };
}

export function resumeSession(session) {
  return startSession(session);
}

export function finishSession(session) {
  return { ...normalizeSession(session), status: "idle" };
}

export function clearSession(session) {
  const next = normalizeSession(session);
  return { ...next, status: "idle", items: [] };
}

export function addGroup(session, name) {
  const next = normalizeSession(session);
  const clean = cleanGroup(name);
  if (!clean) return { session: next, error: "Podaj nazwę grupy." };
  const known = next.groups.find((item) => item.toLowerCase() === clean.toLowerCase());
  if (known) return { session: { ...next, currentGroup: known }, error: "" };
  return { session: { ...next, groups: next.groups.concat(clean), currentGroup: clean }, error: "" };
}

export function setCurrentGroup(session, name) {
  const step = addGroup(normalizeSession(session), name);
  if (!cleanGroup(name)) return { ...normalizeSession(session), currentGroup: "" };
  return step.session;
}

export function addItem(session, raw) {
  const next = normalizeSession(session);
  if (next.status !== "active") return { session: next, added: false, updated: false, reason: next.status };
  const incoming = cleanGroup(raw?.group);
  const draft = normalizeItem({ ...raw, group: incoming || next.currentGroup }, "");
  if (!draft) return { session: next, added: false, updated: false, reason: "empty" };
  const key = itemKey(draft);
  const idx = next.items.findIndex((item) => itemKey(item) === key);
  if (idx === -1 && next.items.length >= SESSION_LIMIT) {
    return { session: next, added: false, updated: false, reason: "limit" };
  }
  const items = next.items.slice();
  if (idx >= 0) {
    const prev = items[idx];
    items[idx] = { ...draft, id: prev.id, group: incoming || prev.group, added_at: prev.added_at || draft.added_at };
    return { session: { ...next, items }, added: true, updated: true, reason: "" };
  }
  items.push({ ...draft, id: draft.id || newId(), added_at: draft.added_at || new Date().toISOString() });
  return { session: { ...next, items }, added: true, updated: false, reason: "" };
}

export function removeItem(session, id) {
  const next = normalizeSession(session);
  return { ...next, items: next.items.filter((item) => item.id !== id) };
}

export function assignGroup(session, ids, group) {
  const next = normalizeSession(session);
  const clean = cleanGroup(group);
  let groups = next.groups;
  if (clean && !groups.some((item) => item.toLowerCase() === clean.toLowerCase())) groups = groups.concat(clean);
  const canonical = clean ? groups.find((item) => item.toLowerCase() === clean.toLowerCase()) || clean : "";
  const want = new Set(Array.isArray(ids) ? ids : []);
  return {
    ...next,
    groups,
    items: next.items.map((item) => (want.has(item.id) ? { ...item, group: canonical } : item))
  };
}

export function itemFromOffer(payload, group) {
  const sections = Array.isArray(payload?.description_sections) ? payload.description_sections : [];
  const textParts = sections.map((section) => section?.text).filter(Boolean);
  return {
    group,
    catalog_name: payload?.catalog_name || payload?.name || "",
    sku: payload?.sku || "",
    ean: payload?.ean || "",
    producer: payload?.producer || payload?.brand || "",
    price: payload?.price ?? "",
    price_before_promo: payload?.price_before_promo ?? payload?.old_price ?? "",
    cena_2: payload?.cena_2 ?? "",
    cena_3: payload?.cena_3 ?? "",
    category: payload?.category || "",
    category_id: payload?.category_id || "",
    parameters: payload?.parameters || [],
    images: payload?.images || [],
    description: payload?.description || payload?.description_text || textParts.join("\n\n"),
    description_sections: sections,
    source_link: payload?.source_link || payload?.url || "",
    source_offer_id: payload?.source_offer_id || "",
    allegro_product_id: payload?.allegro_product_id || ""
  };
}

export function itemFromShopProduct(product, group) {
  const hosted = (product?.hosted || []).map((entry) => entry?.url).filter(Boolean);
  return itemFromOffer({
    catalog_name: product?.name,
    sku: product?.sku,
    ean: product?.ean,
    producer: product?.brand,
    price: product?.price,
    price_before_promo: product?.old_price,
    category: product?.category,
    parameters: product?.parameters,
    images: hosted.length ? hosted : product?.images,
    description: product?.description_text,
    source_link: product?.url
  }, group);
}

export function itemToOffer(item) {
  const sections = item.description_sections?.length
    ? item.description_sections
    : (item.description ? [{ type: "text", text: item.description }] : []);
  return {
    catalog_name: item.catalog_name,
    sku: item.sku,
    ean: item.ean,
    producer: item.producer,
    price: item.price,
    price_before_promo: item.price_before_promo,
    category: item.category,
    category_id: item.category_id,
    parameters: item.parameters,
    images: item.images,
    description_sections: sections,
    source_link: item.source_link,
    source_offer_id: item.source_offer_id,
    allegro_product_id: item.allegro_product_id,
    product_group: item.group || ""
  };
}

function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes(";") || /[\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function opisCell(item) {
  const parts = [];
  for (const section of item.description_sections || []) {
    if (section?.type === "image") continue;
    const line = String(section?.text || "").replace(/\r/g, "").trim();
    if (line) parts.push(line);
  }
  if (!parts.length && item.description) parts.push(item.description);
  const body = parts.join("\n\n").trim();
  if (!body) return "";
  if (body.includes("\n")) return body;
  const title = item.catalog_name || "Opis";
  if (body === title) return `${title}\n${body}`;
  return `${title}\n${body}`;
}

export function sessionToSharklyCsv(items) {
  const rows = (Array.isArray(items) ? items : []).map((row) => normalizeItem(row)).filter(Boolean);
  let imageCount = 0;
  const params = [];
  for (const item of rows) {
    imageCount = Math.max(imageCount, item.images.length);
    for (const param of item.parameters) {
      if (!params.includes(param.name)) params.push(param.name);
    }
  }
  const headers = [
    "nr_sharkly", "ean", "tytul", "cena", "cena_zrodlowa", "producent", "kategoria", "link_zrodlowy", "opis1",
    ...Array.from({ length: imageCount }, (_, index) => `zdj${index + 1}`),
    ...params.map((name) => `param: ${name}`),
    "cena_2", "cena_3", "grupa"
  ];
  const lines = [headers.map((cell) => csvCell(cell)).join(";")];
  for (const item of rows) {
    const values = [
      item.sku,
      item.ean,
      item.catalog_name,
      item.price,
      item.price_before_promo,
      item.producer,
      item.category,
      item.source_link,
      opisCell(item),
      ...Array.from({ length: imageCount }, (_, index) => item.images[index] || ""),
      ...params.map((name) => item.parameters.find((param) => param.name === name)?.value || ""),
      item.cena_2,
      item.cena_3,
      item.group
    ];
    lines.push(values.map((cell) => csvCell(cell)).join(";"));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
