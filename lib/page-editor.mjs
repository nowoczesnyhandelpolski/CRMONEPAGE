// Prosty edytor karty. Nie wymyśla opinii ani nagrań.
import { cleanSiteData, EDITOR_SECTIONS, fillBundleSavings, kNum } from "./site-model.mjs";

export { EDITOR_SECTIONS };

const BUY = new Set(["benefits", "bundles", "urgency"]);

export function moveSection(order, id, direction) {
  const list = [...order];
  const index = list.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= list.length) return list;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
  return list;
}

export function splitSectionOrder(order) {
  const list = Array.isArray(order) ? order : [];
  const heroAt = list.indexOf("gallery");
  const before = [];
  const buy = [];
  const after = [];
  let phase = heroAt === -1 ? "after" : "before";
  list.forEach((id, index) => {
    if (id === "gallery" || id === "sticky") {
      if (id === "gallery") phase = "buy";
      return;
    }
    if (index < heroAt) before.push(id);
    else if (phase === "buy" && BUY.has(id)) buy.push(id);
    else {
      phase = "after";
      after.push(id);
    }
  });
  return { before, buy, after };
}

export function pushPageHistory(history, data, note = "zapis") {
  const snap = {
    at: new Date().toISOString(),
    note: String(note || "zapis").slice(0, 160),
    data
  };
  return [snap, ...(Array.isArray(history) ? history : [])].slice(0, 10);
}

export function describePageDiff(before, after) {
  const a = cleanSiteData(before || {});
  const b = cleanSiteData(after || {});
  const lines = [];
  const text = (label, left, right) => {
    if (String(left || "") !== String(right || "")) lines.push(`${label}: „${left || "—"}” → „${right || "—"}”`);
  };
  text("Nagłówek", a.headline, b.headline);
  text("Lead", a.subheadline, b.subheadline);
  text("Nadtytuł", a.kicker, b.kicker);
  if ((a.theme?.accent || "") !== (b.theme?.accent || "")) lines.push(`Kolor przycisku: ${a.theme?.accent || "—"} → ${b.theme?.accent || "—"}`);
  (b.benefits || []).forEach((item, index) => {
    const prev = (a.benefits || [])[index] || {};
    if (prev.title !== item.title || prev.text !== item.text) lines.push(`Zaleta ${index + 1}: „${item.title || "—"}”`);
  });
  (b.bundles || []).forEach((item, index) => {
    const prev = (a.bundles || [])[index];
    if (!prev || prev.price !== item.price || prev.label !== item.label) lines.push(`Zestaw ${item.label || index + 1}: ${item.price} zł`);
  });
  if ((a.faq || []).length !== (b.faq || []).length) lines.push(`Pytania: ${a.faq.length} → ${b.faq.length}`);
  if (JSON.stringify(a.sections) !== JSON.stringify(b.sections)) lines.push("Zmienione włączone sekcje.");
  if (JSON.stringify(a.reviews) !== JSON.stringify(b.reviews) || JSON.stringify(a.ugc) !== JSON.stringify(b.ugc)) {
    lines.push("Opinie i nagrania bez zmian — edytor ich nie dopisuje.");
  }
  return lines;
}

function hexColor(value) {
  const named = { zielony: "#1f7a45", green: "#1f7a45", czerwony: "#c8102e", red: "#c8102e", czarny: "#111111", niebieski: "#1c3f94" };
  const raw = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  return named[raw] || "";
}

/** Nakłada propozycję modelu. Opinie, nagrania i nazwy zaufania zostają nietknięte. */
export function applyPageEdit(prev, edit = {}, instruction = "") {
  const base = prev && typeof prev === "object" ? structuredClone(prev) : {};
  const reviews = base.reviews;
  const ugc = base.ugc;
  const trustNames = base.trust_names;
  const put = (key, value) => {
    if (typeof value === "string" && value.trim()) base[key] = value.trim();
  };
  put("headline", edit.headline);
  put("subheadline", edit.subheadline);
  put("kicker", edit.kicker);
  const accent = hexColor(edit.accent);
  if (accent) base.theme = { ...(base.theme || {}), accent };
  if (Array.isArray(edit.benefits) && edit.benefits.length) {
    base.benefits = edit.benefits.map((item) => ({
      title: String(item?.title || "").trim(),
      text: String(item?.text || "").trim(),
      icon: item?.icon || "check"
    })).filter((item) => item.title);
  }
  if (Array.isArray(edit.features) && edit.features.length) {
    base.features = edit.features.map((item) => ({
      title: String(item?.title || "").trim(),
      text: String(item?.text || "").trim()
    })).filter((item) => item.title);
  }
  if (Array.isArray(edit.faq)) {
    base.faq = edit.faq.map((item) => ({ q: String(item?.q || "").trim(), a: String(item?.a || "").trim() })).filter((item) => item.q && item.a);
  }
  if (Array.isArray(edit.compare)) {
    base.compare = edit.compare.map((item) => ({
      feature: String(item?.feature || "").trim(),
      ours: String(item?.ours || "").trim(),
      others: String(item?.others || "").trim()
    })).filter((item) => item.feature);
  }
  put("compare_ours", edit.compare_ours);
  put("compare_others", edit.compare_others);
  if (edit.problem_title || edit.problem_text) {
    base.problem = { ...(base.problem || {}), title: edit.problem_title || base.problem?.title || "", text: edit.problem_text || base.problem?.text || "" };
  }
  if (/\d/.test(String(instruction || "")) && Array.isArray(edit.bundles) && edit.bundles.length) {
    base.bundles = fillBundleSavings(edit.bundles.map((item) => ({
      label: String(item?.label || "").trim(),
      qty: kNum(item?.qty) || 1,
      price: item?.price,
      badge: "",
      compare_at: null
    })).filter((item) => item.label && kNum(item.price) != null));
  }
  if (edit.sections && typeof edit.sections === "object") {
    base.sections = { ...(base.sections || {}) };
    for (const section of EDITOR_SECTIONS) {
      if (typeof edit.sections[section.id] === "boolean") base.sections[section.id] = edit.sections[section.id];
    }
  }
  if (edit.sale && typeof edit.sale === "object") {
    base.sale = { ...(base.sale || {}), ...edit.sale };
  }
  const cleaned = cleanSiteData(base);
  cleaned.reviews = cleanSiteData({ reviews: reviews || [] }).reviews;
  cleaned.ugc = cleanSiteData({ ugc: ugc || [] }).ugc;
  cleaned.trust_names = cleanSiteData({ trust_names: trustNames || [] }).trust_names;
  return cleaned;
}

export function editPrompt(data, instruction) {
  const page = cleanSiteData(data || {});
  const facts = {
    headline: page.headline,
    subheadline: page.subheadline,
    kicker: page.kicker,
    accent: page.theme?.accent,
    benefits: page.benefits,
    features: page.features.slice(0, 6),
    faq: page.faq,
    compare: page.compare,
    bundles: page.bundles.map((item) => ({ label: item.label, qty: item.qty, price: item.price }))
  };
  return `Jesteś edytorem karty produktu w polskim sklepie. Zastosuj wyłącznie prośbę człowieka.
Nie wymyślaj opinii, nazwisk, gwiazdek, nagrań, nazw mediów ani nowych cen. Cenę zmień tylko wtedy, gdy człowiek podał liczbę.
Kolor przycisku oddaj jako accent (hex, np. zielony to #1f7a45).
Zostaw puste pole, jeśli prośba go nie dotyczy.
Odpowiedź to JSON.

Prośba:
${String(instruction || "").slice(0, 1000)}

Aktualna karta:
${JSON.stringify(facts).slice(0, 8000)}`;
}

export function escHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function field(id, label, value, hint, attrs = "") {
  return `<label class="ed-f"><span>${escHtml(label)}</span><input id="${id}" value="${escHtml(value ?? "")}" ${attrs}><small>${escHtml(hint)}</small></label>`;
}

export function editorFormHtml(data, active) {
  const d = cleanSiteData(data || {});
  const e = escHtml;
  if (active === "gallery") {
    const words = String(d.headline || "").split(/\s+/).filter(Boolean).length;
    const images = (d.images || []).map((image, index) => `<label class="ed-img"><img src="${e(image.url)}" alt=""><span><input type="checkbox" id="ed-img-${index}" ${image.rights ? "checked" : ""}> Pokaż zdjęcie ${index + 1}</span></label>`).join("");
    return `${field("ed-headline", "Nagłówek – krótko, max ~8 słów", d.headline, words > 8 ? `Teraz ${words} słów. Skróć, żeby mieściło się w dwóch liniach.` : "Jedno zdanie, które mówi, co to jest.")}
      ${field("ed-kicker", "Mały napis nad tytułem", d.kicker, "Na przykład kategoria. Można zostawić puste.")}
      ${field("ed-lead", "Krótki opis pod tytułem", d.subheadline, "Jedno albo dwa zdania z faktów.")}
      ${field("ed-accent", "Kolor przycisku", d.theme.accent, "Na przykład #1f7a45 albo zielony.", 'type="text"')}
      <p class="ed-h">Zdjęcia produktu</p><div class="ed-imgs">${images || "<p>Brak zdjęć w karcie.</p>"}</div>`;
  }
  if (active === "bundles") {
    return `<p class="ed-h">Ceny zestawów. Puste pole nie tworzy zestawu.</p>` + [0, 1, 2].map((i) => {
      const b = d.bundles[i] || {};
      return `<div class="ed-pack">${field(`ed-b-label-${i}`, `Nazwa zestawu ${i + 1}`, b.label || `${i + 1} szt.`, "Na przykład „2 szt.”")}
        ${field(`ed-b-qty-${i}`, "Ile sztuk", b.qty || i + 1, "Liczba w paczce.", 'inputmode="numeric"')}
        ${field(`ed-b-price-${i}`, "Cena całego zestawu (zł)", b.price ?? "", "Nie zgadujemy ceny.", 'inputmode="decimal"')}</div>`;
    }).join("");
  }
  if (active === "benefits") {
    return [0, 1, 2].map((i) => {
      const b = d.benefits[i] || {};
      return `<div class="ed-pack">${field(`ed-ben-${i}`, `Zaleta ${i + 1}`, b.title, "Krótko, jak hasło.")}
        ${field(`ed-ben-t-${i}`, "Dopowiedzenie", b.text, "Jedno zdanie, po co to klientowi.")}</div>`;
    }).join("");
  }
  if (active === "trust") {
    return `${field("ed-trust", "Tytuł paska", d.trust_title || "Zaufanie", "Na przykład „Dostawa, zwroty, płatność”.")}
      <label class="ed-f"><span>Nazwy, po jednej w wierszu</span><textarea id="ed-trust-names">${e((d.trust_names || []).join("\n"))}</textarea><small>Tylko to, co możecie naprawdę napisać. Bez cudzych logo.</small></label>`;
  }
  if (active === "features") {
    return [0, 1, 2, 3].map((i) => {
      const f = d.features[i] || {};
      return `<div class="ed-pack">${field(`ed-ft-${i}`, `Krok ${i + 1} – tytuł`, f.title, "Co klient ma zrozumieć.")}
        ${field(`ed-fx-${i}`, "Treść", f.text, "Fakty z produktu, bez obietnic z powietrza.")}</div>`;
    }).join("");
  }
  if (active === "compare") {
    return `${field("ed-ours", "Nagłówek kolumny „my”", d.compare_ours, "Wasza nazwa produktu.")}
      ${field("ed-others", "Nagłówek kolumny „oni”", d.compare_others, "Na przykład „Zwykły produkt”.")}
      ${(d.compare || []).slice(0, 4).map((row, i) => `<div class="ed-pack">${field(`ed-c-f-${i}`, "Cecha", row.feature, "")}${field(`ed-c-o-${i}`, "U nas", row.ours, "")}${field(`ed-c-t-${i}`, "U innych", row.others, "")}</div>`).join("")}`;
  }
  if (active === "faq") {
    return (d.faq.length ? d.faq : [{}, {}, {}]).slice(0, 4).map((item, i) => `<div class="ed-pack">${field(`ed-q-${i}`, `Pytanie ${i + 1}`, item.q, "Tak, jak zapytałby klient.")}${field(`ed-a-${i}`, "Odpowiedź", item.a, "Krótko i z faktów.")}</div>`).join("");
  }
  if (active === "reviews") {
    return `<p class="ed-h">Nie dopisujemy opinii. Wpisz tylko taką, którą macie, razem z linkiem do źródła.</p>` + [0, 1, 2].map((i) => {
      const r = d.reviews[i] || {};
      return `<div class="ed-pack">${field(`ed-r-a-${i}`, "Kto napisał", r.author, "")}${field(`ed-r-s-${i}`, "Ocena 1–5", r.rating || "", "")}${field(`ed-r-u-${i}`, "Link do źródła", r.source_url, "Bez linku opinia nie wejdzie na stronę.")}${field(`ed-r-t-${i}`, "Treść", r.text, "")}</div>`;
    }).join("");
  }
  if (active === "ugc") {
    const u = d.ugc[0] || {};
    return `<p class="ed-h">Bez adresu filmu ta sekcja jest ukryta.</p>${field("ed-ugc", "Adres nagrania (https)", u.video, "Tylko film, do którego macie prawa.")}${field("ed-ugc-a", "Kto nagrał", u.author, "")}`;
  }
  if (active === "sale") {
    return `${field("ed-sale", "Napis na pasku", d.sale.label, "Na przykład „Sezonowa obniżka”.")}${field("ed-sale-t", "Dopisek", d.sale.text, "Jedno zdanie. Bez zmyślonego licznika.")}`;
  }
  if (active === "urgency") {
    return `${field("ed-stock", "Ile sztuk naprawdę jest", d.stock ?? "", "Puste = nie pokazujemy liczby.", 'inputmode="numeric"')}${field("ed-until", "Do kiedy oferta", d.urgency.ends_at ? d.urgency.ends_at.slice(0, 16) : "", "Puste = bez licznika.", 'type="datetime-local"')}`;
  }
  if (active === "sticky") return `<p class="ed-h">Przycisk na dole telefonu bierze nazwę i cenę z góry strony. Tu włączasz go albo ukrywasz przełącznikiem na liście.</p>`;
  return "";
}

export function editorShellHtml({ name, data, active, device = "desktop", history = [], diff = [] }) {
  const d = cleanSiteData(data || {});
  const on = d.sections || {};
  const list = (d.section_order || []).map((id) => {
    const section = EDITOR_SECTIONS.find((item) => item.id === id);
    if (!section) return "";
    const shown = on[id] !== false;
    return `<article class="ed-sec${active === id ? " is-on" : ""}" data-ed="open" data-id="${section.id}">
      <span class="ed-ico" aria-hidden="true">${section.icon}</span>
      <span class="ed-copy"><b>${escHtml(section.title)}</b><small>${escHtml(section.hint)}</small></span>
      <span class="ed-tools">
        <button type="button" data-ed="up" data-id="${section.id}" aria-label="Wyżej">↑</button>
        <button type="button" data-ed="down" data-id="${section.id}" aria-label="Niżej">↓</button>
        <button type="button" class="ed-sw${shown ? " is-on" : ""}" data-ed="toggle" data-id="${section.id}" aria-pressed="${shown ? "true" : "false"}">${shown ? "Widać" : "Ukryte"}</button>
      </span>
    </article>`;
  }).join("");
  const current = EDITOR_SECTIONS.find((item) => item.id === active) || EDITOR_SECTIONS[0];
  const versions = (history || []).slice(0, 10).map((item, index) => `<li><button type="button" data-ed="history" data-index="${index}">${escHtml(item.note || "zapis")} · ${escHtml(String(item.at || "").slice(0, 16).replace("T", " "))}</button></li>`).join("");
  return `<div class="ed">
    <div class="ed-bar"><div><b>Edytor strony</b><span>${escHtml(name || d.headline || "Karta")}</span></div>
      <div class="ed-bar-actions">
        <button type="button" data-ed="undo">Cofnij</button>
        <button type="button" data-ed="back">Pola zaawansowane</button>
        <button type="button" class="ed-save" data-ed="save">Zapisz</button>
      </div>
    </div>
    <div class="ed-body">
      <aside class="ed-list">${list}
        <details class="ed-hist"><summary>Ostatnie wersje (${Math.min(10, (history || []).length)})</summary><ul>${versions || "<li>Jeszcze brak zapisanych wersji.</li>"}</ul></details>
      </aside>
      <section class="ed-form"><h2>${escHtml(current.title)}</h2><p class="ed-hint">${escHtml(current.hint)}</p>${editorFormHtml(d, current.id)}
        <div class="ed-ask"><label>Opisz, co zmienić<textarea id="ed-ask" placeholder="Na przykład: zmień kolor przycisku na zielony, skróć opis"></textarea></label>
          <button type="button" data-ed="ask">Pokaż, co się zmieni</button>
          ${diff.length ? `<div class="ed-diff"><b>Zanim zapiszesz</b><ul>${diff.map((line) => `<li>${escHtml(line)}</li>`).join("")}</ul><button type="button" data-ed="apply-ai">Zastosuj</button><button type="button" data-ed="drop-ai">Odrzuć</button></div>` : ""}
        </div>
      </section>
      <section class="ed-prev">
        <div class="ed-dev"><button type="button" data-ed="device" data-device="desktop" aria-pressed="${device === "desktop"}">Komputer</button><button type="button" data-ed="device" data-device="mobile" aria-pressed="${device === "mobile"}">Telefon</button></div>
        <div class="ed-frame ${device === "mobile" ? "is-phone" : ""}"><iframe id="ed-preview" title="Podgląd strony"></iframe></div>
      </section>
    </div>
  </div>`;
}

export const EDITOR_CSS = `
.ed{display:grid;grid-template-rows:auto 1fr;gap:12px;min-height:calc(100vh - 120px)}
.ed-bar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
.ed-bar b{font-size:22px;margin-right:8px}
.ed-bar span{color:#5c6570}
.ed-bar-actions{display:flex;gap:8px;flex-wrap:wrap}
.ed-bar button,.ed-tools button,.ed-dev button,.ed-ask button{border:1px solid #d5dbe3;background:#fff;border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer}
.ed-bar button.ed-save{background:#13294b;color:#fff;border-color:#13294b}
.ed-body{display:grid;grid-template-columns:280px minmax(260px,340px) minmax(0,1fr);gap:12px;align-items:start}
.ed-list{display:grid;gap:8px;max-height:calc(100vh - 180px);overflow:auto}
.ed-sec{display:grid;grid-template-columns:36px 1fr;gap:8px;padding:10px;border:1px solid #e3e8ef;border-radius:14px;background:#fff;text-align:left;cursor:pointer}
.ed-sec.is-on{border-color:#13294b;box-shadow:0 0 0 1px #13294b}
.ed-ico{width:36px;height:36px;border-radius:10px;background:#f3f5f8;display:grid;place-items:center;font-size:16px}
.ed-copy{grid-column:2;display:grid}
.ed-copy b{font-size:14px}
.ed-copy small,.ed-hint,.ed-f small{color:#5c6570;font-size:12px}
.ed-tools{grid-column:1 / -1;display:flex;gap:6px}
.ed-sw.is-on{background:#e8f6ee;border-color:#1f7a45;color:#1f7a45}
.ed-form{background:#fff;border:1px solid #e3e8ef;border-radius:16px;padding:14px;display:grid;gap:10px;max-height:calc(100vh - 180px);overflow:auto}
.ed-form h2{margin:0;font-size:18px}
.ed-f{display:grid;gap:4px;font-size:13px;font-weight:650}
.ed-f input,.ed-f textarea,.ed-ask textarea{font:inherit;font-weight:500;border:1px solid #d5dbe3;border-radius:10px;padding:8px 10px;width:100%}
.ed-pack{display:grid;gap:8px;padding:8px;border:1px dashed #d5dbe3;border-radius:12px}
.ed-imgs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ed-img{display:grid;gap:4px;font-size:12px}
.ed-img img{width:100%;height:72px;object-fit:cover;border-radius:8px;background:#f3f5f8}
.ed-prev{display:grid;gap:8px}
.ed-dev{display:flex;gap:8px}
.ed-dev button[aria-pressed="true"]{background:#13294b;color:#fff}
.ed-frame{height:calc(100vh - 210px);border:1px solid #e3e8ef;border-radius:16px;overflow:hidden;background:#f6f7f9}
.ed-frame.is-phone{width:390px;max-width:100%;margin:0 auto}
.ed-frame iframe{width:100%;height:100%;border:0;background:#fff}
.ed-diff{background:#f7f3ea;border-radius:12px;padding:10px}
.ed-hist{font-size:13px}
@media(max-width:1100px){.ed-body{grid-template-columns:1fr}.ed-list,.ed-form,.ed-frame{max-height:none;height:auto;min-height:420px}}
`;

export const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "subheadline", "kicker", "accent", "benefits", "features", "faq", "compare", "compare_ours", "compare_others", "bundles", "problem_title", "problem_text"],
  properties: {
    headline: { type: "string" },
    subheadline: { type: "string" },
    kicker: { type: "string" },
    accent: { type: "string" },
    benefits: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "text"], properties: { title: { type: "string" }, text: { type: "string" } } } },
    features: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "text"], properties: { title: { type: "string" }, text: { type: "string" } } } },
    faq: { type: "array", items: { type: "object", additionalProperties: false, required: ["q", "a"], properties: { q: { type: "string" }, a: { type: "string" } } } },
    compare: { type: "array", items: { type: "object", additionalProperties: false, required: ["feature", "ours", "others"], properties: { feature: { type: "string" }, ours: { type: "string" }, others: { type: "string" } } } },
    compare_ours: { type: "string" },
    compare_others: { type: "string" },
    bundles: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "qty", "price"], properties: { label: { type: "string" }, qty: { type: "number" }, price: { type: "number" } } } },
    problem_title: { type: "string" },
    problem_text: { type: "string" }
  }
};
