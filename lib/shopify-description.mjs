// Opis produktu do Shopify: sam HTML ze stylami w atrybutach, bez <script>, <style> i obcych marek.
// Motyw i tak rysuje galerię, cenę i koszyk. Tu jest reszta karty, którą widać bez instalacji sekcji.

import { cleanSiteData, kEsc, kMoney, sectionOn } from "./site-model.mjs";

function esc(value) {
  return kEsc(value);
}

function block(html) {
  return `<div style="margin:0 0 28px">${html}</div>`;
}

function stars(rating) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

export function konwersjaDescriptionHtml(product, page) {
  const d = cleanSiteData(page?.data || {});
  const e = esc;
  const parts = [];
  const title = d.headline || product?.catalog_name || product?.name || "";
  if (sectionOn(d, "sale") && d.sale?.enabled && (d.sale.label || d.sale.text)) {
    const when = d.sale.ends_at ? ` Koniec: ${e(d.sale.ends_at.slice(0, 16).replace("T", " "))}.` : "";
    parts.push(`<div style="background:#111;color:#fff;border-radius:12px;padding:14px 16px;margin:0 0 22px">
      <div style="font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:13px">${e(d.sale.label || "Promocja")}</div>
      ${d.sale.text ? `<div style="margin-top:4px;font-size:15px">${e(d.sale.text)}</div>` : ""}
      ${when ? `<div style="margin-top:6px;font-size:13px;opacity:.85">${when}</div>` : ""}
    </div>`);
  }
  if (d.subheadline) parts.push(`<p style="font-size:16px;line-height:1.55;margin:0 0 18px">${e(d.subheadline)}</p>`);
  const benefits = sectionOn(d, "benefits") ? (d.benefits || []).filter((b) => b.title).slice(0, 3) : [];
  if (benefits.length) {
    parts.push(block(`<div style="font-weight:700;margin:0 0 10px">Najważniejsze</div>
      <ul style="margin:0;padding:0;list-style:none">
        ${benefits.map((b) => `<li style="border:1px solid #e6e6e6;border-radius:12px;padding:12px 14px;margin:0 0 8px">
          <strong>${e(b.title)}</strong>${b.text ? `<div style="color:#555;margin-top:4px">${e(b.text)}</div>` : ""}
        </li>`).join("")}
      </ul>`));
  }
  if (sectionOn(d, "trust") && (d.trust_names || []).length) {
    parts.push(block(`<div style="background:#f6f6f6;border-radius:12px;padding:14px 16px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin-bottom:6px">${e(d.trust_title || "Zaufanie")}</div>
      <div style="font-weight:650">${d.trust_names.map((n) => e(n)).join(" · ")}</div>
    </div>`));
  }
  const bundles = sectionOn(d, "bundles") ? (d.bundles || []) : [];
  if (bundles.length > 1) {
    parts.push(block(`<div style="font-weight:700;margin:0 0 10px">Zestawy</div>
      <ul style="margin:0;padding:0;list-style:none">
        ${bundles.map((b) => {
          const unit = b.qty > 1 ? ` <span style="color:#666">(${e(kMoney(b.price / b.qty))} / szt.)</span>` : "";
          const was = b.compare_at && b.compare_at > b.price ? ` <s style="color:#888">${e(kMoney(b.compare_at))}</s>` : "";
          return `<li style="display:flex;justify-content:space-between;gap:12px;border:1px solid #e6e6e6;border-radius:12px;padding:12px 14px;margin:0 0 8px">
            <span><strong>${e(b.label)}</strong>${b.badge ? ` <span style="background:#111;color:#fff;border-radius:999px;padding:2px 8px;font-size:12px">${e(b.badge)}</span>` : ""}${b.note ? `<div style="color:#555;font-size:13px">${e(b.note)}</div>` : ""}</span>
            <span style="white-space:nowrap"><strong>${e(kMoney(b.price))}</strong>${was}${unit}</span>
          </li>`;
        }).join("")}
      </ul>
      <p style="color:#666;font-size:13px;margin:8px 0 0">W sklepie zestaw jest wariantem — cenę i koszyk bierze motyw.</p>`));
  }
  if (sectionOn(d, "compare") && ((d.compare || []).length || d.compare_image_ours || d.compare_image_others)) {
    const headOurs = d.compare_ours || title || "U nas";
    const headOthers = d.compare_others || "Zwykły produkt";
    const imgs = (d.compare_image_ours || d.compare_image_others) ? `<div style="display:flex;gap:8px;margin:0 0 12px">
      ${d.compare_image_ours ? `<figure style="margin:0;flex:1"><img src="${e(d.compare_image_ours)}" alt="${e(d.compare_caption_ours || headOurs)}" style="width:100%;border-radius:12px"><figcaption style="font-size:13px;margin-top:4px">${e(d.compare_caption_ours || headOurs)}</figcaption></figure>` : ""}
      ${d.compare_image_others ? `<figure style="margin:0;flex:1"><img src="${e(d.compare_image_others)}" alt="${e(d.compare_caption_others || headOthers)}" style="width:100%;border-radius:12px"><figcaption style="font-size:13px;margin-top:4px">${e(d.compare_caption_others || headOthers)}</figcaption></figure>` : ""}
    </div>` : "";
    const table = (d.compare || []).length ? `<table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e6e6e6"></th><th style="text-align:left;padding:8px;border-bottom:1px solid #e6e6e6">${e(headOurs)}</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e6e6e6">${e(headOthers)}</th></tr></thead>
      <tbody>${d.compare.map((r) => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${e(r.feature)}</td><td style="padding:8px;border-bottom:1px solid #eee">${e(r.ours)}</td><td style="padding:8px;border-bottom:1px solid #eee;color:#666">${e(r.others)}</td></tr>`).join("")}</tbody>
    </table>` : "";
    parts.push(block(`<div style="font-weight:700;font-size:20px;margin:0 0 12px">Porównanie</div>${imgs}${table}`));
  }
  const reviews = sectionOn(d, "reviews") ? (d.reviews || []).filter((r) => r.text && /^https?:/i.test(r.source_url)) : [];
  if (reviews.length) {
    parts.push(block(`<div style="font-weight:700;font-size:20px;margin:0 0 12px">Opinie ze źródłem</div>
      ${reviews.map((r) => `<blockquote style="margin:0 0 12px;border:1px solid #e6e6e6;border-radius:12px;padding:12px 14px">
        ${r.photo && /^https:\/\//i.test(r.photo) ? `<img src="${e(r.photo)}" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin-bottom:8px">` : ""}
        <div style="color:#b45309;letter-spacing:1px">${stars(r.rating)}</div>
        <p style="margin:6px 0">${e(r.text)}</p>
        <div style="font-size:13px;color:#555">${e(r.author)} · <a href="${e(r.source_url)}">${e(r.source_url)}</a></div>
      </blockquote>`).join("")}`));
  }
  const story = sectionOn(d, "features") ? (d.features || []).filter((f) => f.title) : [];
  if (story.length) {
    parts.push(block(`<div style="font-weight:700;font-size:22px;margin:0 0 16px">${e(d.benefits_title || "Jak to działa")}</div>
      ${story.map((f, i) => `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin:0 0 22px;${i % 2 ? "flex-direction:row-reverse" : ""}">
        ${f.image && /^https:\/\//i.test(f.image) ? `<img src="${e(f.image)}" alt="${e(f.title)}" style="width:min(100%,280px);max-width:100%;aspect-ratio:4/3;object-fit:contain;background:#f5f5f5;border-radius:12px">` : ""}
        <div style="flex:1;min-width:200px"><div style="font-weight:700;font-size:18px;margin:0 0 6px">${e(f.title)}</div>${f.text ? `<p style="margin:0;line-height:1.55;color:#333">${e(f.text)}</p>` : ""}</div>
      </div>`).join("")}`));
  }
  const faq = sectionOn(d, "faq") ? (d.faq || []).filter((f) => f.q && f.a) : [];
  if (d.problem?.title || d.problem?.text) {
    parts.push(block(`<div style="font-weight:700;font-size:20px;margin:0 0 8px">${e(d.problem.title || "Zanim kupisz")}</div><p style="margin:0;line-height:1.55">${e(d.problem.text || "")}</p>`));
  }
  if (faq.length) {
    parts.push(block(faq.map((f) => `<details style="border-bottom:1px solid #e6e6e6;padding:10px 0"><summary style="font-weight:700;cursor:pointer">${e(f.q)}</summary><p style="margin:8px 0 0;color:#444">${e(f.a)}</p></details>`).join("")));
  }
  const html = parts.join("");
  if (html) return html.slice(0, 100000);
  const text = product?.description || product?.catalog_name || product?.name || "";
  return `<p>${e(text)}</p>`;
}

export function shopifyBlocks(page) {
  const d = cleanSiteData(page?.data || {});
  return {
    template: d.template,
    accent: d.theme?.accent || "#111111",
    sale: sectionOn(d, "sale") && d.sale?.enabled ? d.sale : null,
    benefits: sectionOn(d, "benefits") ? (d.benefits || []).slice(0, 3) : [],
    trust_title: d.trust_title || "",
    trust_names: sectionOn(d, "trust") ? d.trust_names || [] : [],
    bundles: (d.bundles || []).map((b) => ({ label: b.label, qty: b.qty, price: b.price, compare_at: b.compare_at, badge: b.badge }))
  };
}
