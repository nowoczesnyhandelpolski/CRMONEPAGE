import { KONWERSJA_CSS } from "./konwersja-css.mjs";
import { PAGE_CLIENT } from "./page-client.mjs";
import { legalDocs } from "./legal.mjs";
import { TOPICS, botKnowledge } from "./support.mjs";
import {
  accentInk, cleanSiteData, kEsc, kMoney, ratingOf, sectionOn, shippingPlan, siteBundles
} from "./site-model.mjs";
import { splitSectionOrder } from "./page-editor.mjs";

const stroke = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  check: stroke('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  truck: stroke('<path d="M3 7h11v8H3zM14 10h4l3 3v2h-7"/><circle cx="7" cy="17.5" r="1.4"/><circle cx="17" cy="17.5" r="1.4"/>'),
  shield: stroke('<path d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6Z"/>'),
  star: stroke('<path d="m12 3 2.4 5.2 5.6.6-4.2 3.8 1.2 5.5L12 15.8 6.9 18.1 8.1 12.6 3.9 8.8l5.6-.6Z"/>'),
  heart: stroke('<path d="M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z"/>'),
  leaf: stroke('<path d="M5 19c8-1 12-8 13-14-6 1-12 5-13 14Z"/><path d="M9 14c2-2 4-3 7-4"/>'),
  clock: stroke('<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>'),
  box: stroke('<path d="m3 8 9-4 9 4-9 4Z"/><path d="M3 8v8l9 4 9-4V8"/><path d="m12 12 9-4"/>'),
  chevL: stroke('<path d="m15 6-6 6 6 6"/>'),
  chevR: stroke('<path d="m9 6 6 6-6 6"/>'),
  play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 7v10l8-5z" fill="currentColor"/></svg>',
  cart: stroke('<circle cx="8" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/><path d="M3 5h2l2 10h11l2-7H8"/>'),
  plus: stroke('<path d="M12 6v12M6 12h12"/>')
};

const SWATCHES = {
  grafit: "#4a4d52", czarny: "#1d1d1f", szary: "#9a9ea3", bez: "#cdb89a", biały: "#f4f2ee", bialy: "#f4f2ee",
  zielony: "#2d6a4f", granat: "#24304a", niebieski: "#1c3f94", czerwony: "#c0392b", bordo: "#7a1f2b",
  różowy: "#e2a8b4", brązowy: "#7a5235", naturalny: "#cdb89a", oliwkowy: "#6b7040", oliwka: "#6b7040"
};

function swatch(name) {
  const k = String(name || "").toLowerCase();
  return SWATCHES[k] || "";
}

function stars(avg) {
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  return `<span class="stars" aria-hidden="true"><span class="bg">★★★★★</span><span class="fg" style="width:${pct}%">★★★★★</span></span>`;
}

function slot(preview, title, text) {
  if (!preview) return "";
  return `<div class="ph-slot"><b>${kEsc(title)}</b><span>${kEsc(text)} Na opublikowanej stronie tej sekcji nie będzie.</span></div>`;
}

function future(iso, now) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) && t > now.getTime();
}

export function renderKonwersjaPage(row, raw, { preview = false, origin = "", now = new Date(), editor = false } = {}) {
  const e = kEsc;
  const d = cleanSiteData(raw || {});
  const imgs = d.images.filter((i) => i.rights || preview);
  const bundles = siteBundles(d);
  const def = Math.min(bundles.length - 1, Math.max(0, d.default_bundle ?? (bundles.length >= 2 ? 1 : 0)));
  const first = bundles[def] || null;
  const plan = shippingPlan(now, d.shipping.cutoff || "15:00");
  const brand = d.brand || row.name || "Sklep";
  const accent = d.theme.accent || "#111111";
  const title = d.seo.title || d.headline || row.name;
  const desc = d.seo.description || d.subheadline || "";
  const pageUrl = origin ? `${origin}/p/${row.slug}` : "";
  const rating = ratingOf(d);
  const outOfStock = d.stock === 0;
  const nb = (n) => e(kMoney(n)).replace(/[\u00a0 ]/g, "&nbsp;");
  const on = (key) => sectionOn(d, key);

  const showVideo = on("gallery") && d.video?.url && (d.video.rights || preview);
  const slides = [];
  if (showVideo) slides.push(`<div class="stage-art" data-slide="0"><video src="${e(d.video.url)}" playsinline controls preload="metadata"${d.video.poster ? ` poster="${e(d.video.poster)}"` : ""}></video></div>`);
  if (on("gallery")) imgs.forEach((img, n) => {
    slides.push(`<div class="stage-art" data-slide="${slides.length}"${slides.length ? " hidden" : ""}><img src="${e(img.url)}" alt="${e(img.alt || row.name || "")}"${n ? ' loading="lazy"' : ' fetchpriority="high"'}></div>`);
  });
  const thumbs = imgs.map((img, n) => `<button type="button" class="thumb" data-i="${showVideo ? n + 1 : n}" aria-label="Zdjęcie ${n + 1}"${!showVideo && n === 0 ? ' aria-current="true"' : ""}><img src="${e(img.url)}" alt=""></button>`).join("");
  const gallery = slides.length
    ? `<div class="gallery"><div class="stage" id="stage">${slides.join("")}</div>
        <div class="thumbs"><button type="button" class="nav-arrow" id="prevImg" aria-label="Poprzednie zdjęcie">${ICONS.chevL}</button><div class="thumbs-row" id="thumbs">${thumbs}</div><button type="button" class="nav-arrow" id="nextImg" aria-label="Następne zdjęcie">${ICONS.chevR}</button></div></div>`
    : (preview && on("gallery") ? `<div class="gallery"><div class="stage"><div class="stage-art ph">Tu wejdą zdjęcia produktu. Puste miejsce nie idzie na opublikowaną stronę jako obca grafika.</div></div></div>` : "");

  const price0 = first ? first.price : 0;
  const was0 = first && first.compare_at && first.compare_at > first.price ? first.compare_at : null;
  const om0 = first && first.omnibus ? first.omnibus : null;
  const bunCards = bundles.map((b, n) => {
    const unit = `<small>${e(kMoney(b.price / (b.qty || 1)))} / szt.</small>`;
    return `<label class="bun${n === def ? " on" : ""}">
      <input type="radio" name="b" value="${n}" data-price="${b.price}" data-was="${b.compare_at || ""}" data-omnibus="${b.omnibus || ""}" data-qty="${b.qty}" data-label="${e(b.label)}"${n === def ? " checked" : ""}>
      ${b.badge ? `<span class="bun-badge">${e(b.badge)}</span>` : ""}
      <span class="bun-q">${e(b.label)}</span>
      <span class="bun-p">${nb(b.price)}${unit}</span>
      ${b.note ? `<span class="bun-gift">${e(b.note)}</span>` : ""}
    </label>`;
  }).join("");
  const buns = bunCards ? `<div class="buns" role="radiogroup" aria-label="Wybierz zestaw"${on("bundles") ? "" : " hidden"}>${bunCards}</div>` : "";

  const variants = d.variants.length ? `<fieldset class="var"><legend>${e(d.variant_label || "Wariant")}: <b id="varName">${e(d.variants[0])}</b></legend><div class="sws">${d.variants.map((v, n) => {
    const c = swatch(v);
    return `<label class="swl" title="${e(v)}"><input type="radio" name="v" value="${e(v)}"${n ? "" : " checked"}>${c ? `<span class="sw" style="--c:${c}"></span>` : `<span class="sw-t">${e(v)}</span>`}</label>`;
  }).join("")}</div></fieldset>` : "";

  const perks = on("benefits") ? (d.benefits || []).filter((b) => b.title).slice(0, 3) : [];
  const perkHtml = perks.length ? `<div class="perks">${perks.map((b) => `<div class="perk"><i>${ICONS[b.icon] || ICONS.check}</i><div><b>${e(b.title)}</b>${b.text ? `<span>${e(b.text)}</span>` : ""}</div></div>`).join("")}</div>` : "";

  let urgency = "";
  if (on("urgency")) {
    const bits = [];
    if (d.urgency.show_stock && d.stock != null) {
      bits.push(d.stock === 0
        ? `<p class="stock is-out" data-stock="0"><i></i>Brak w magazynie — zamówienia wstrzymane.</p>`
        : `<p class="stock" data-stock="${d.stock}"><i></i>Zostało ${d.stock} szt. — stan z magazynu</p>`);
    }
    if (d.urgency.show_timer && future(d.urgency.ends_at, now)) {
      bits.push(`<p class="deal">${ICONS.clock} <span>${e(d.urgency.label || "Oferta do")}</span> <span id="dealEnds" data-ends="${e(d.urgency.ends_at)}"></span></p>`);
    }
    urgency = bits.join("");
  }

  const saleOn = on("sale") && d.sale.enabled && (d.sale.label || d.sale.text);
  const saleTimer = saleOn && future(d.sale.ends_at, now) ? `<span class="sale-time" id="saleEnds" data-ends="${e(d.sale.ends_at)}"></span>` : "";
  const sale = saleOn
    ? `<div class="sale"><b>${e(d.sale.label || "Promocja")}</b>${e(d.sale.text)}${saleTimer}</div>`
    : (preview && on("sale") ? slot(true, "Baner sezonowy", "Włącz baner i wpisz własny tekst. Nie podstawiamy Black Friday ani licznika.") : "");

  const trust = on("trust") && d.trust_names.length
    ? `<section class="trustbar" id="zaufanie"><div class="w"><span class="k">${e(d.trust_title || "Zaufanie")}</span>${d.trust_names.map((n) => `<b>${e(n)}</b>`).join("")}</div></section>`
    : (preview && on("trust") ? `<section class="sec" id="zaufanie"><div class="w">${slot(true, "Pasek zaufania", "Wpisz nazwy, które naprawdę możesz podać. Logotypów nie kopiujemy.")}</div></section>` : "");

  const ugcItems = on("ugc") ? d.ugc.filter((u) => u.video) : [];
  const ugc = ugcItems.length
    ? `<section class="sec" id="nagrania"><div class="w"><h2>Tak to wygląda w użyciu</h2><p class="sub">Tylko nagrania dodane do karty.</p><div class="ugcs">${ugcItems.map((u) => `<figure class="ugc">${u.poster ? `<img src="${e(u.poster)}" alt="">` : ""}<video src="${e(u.video)}" playsinline preload="metadata"${u.poster ? ` poster="${e(u.poster)}"` : ""}></video><button type="button" class="ugc-play" aria-label="Odtwórz"><span>${ICONS.play}</span></button><figcaption>${u.author ? `<b>${e(u.author)}</b> ` : ""}${e(u.text)}</figcaption></figure>`).join("")}</div></div></section>`
    : (preview && on("ugc") ? `<section class="sec" id="nagrania"><div class="w">${slot(true, "Nagrania klientów", "Wklej adres wideo, do którego masz prawa. Nie generujemy nagrań ani opinii.")}</div></section>` : "");

  const reviews = on("reviews") ? d.reviews : [];
  const reviewHtml = reviews.length
    ? `<section class="sec" id="opinie"><div class="w"><div class="sh"><div><h2>Opinie</h2><p class="sub">Każda ma link do źródła.</p></div><div class="rev-nav"><button type="button" id="revPrev" aria-label="Poprzednie opinie">${ICONS.chevL}</button><button type="button" id="revNext" aria-label="Następne opinie">${ICONS.chevR}</button></div></div><div class="revs" id="revs">${reviews.map((r) => `<figure class="rev">${r.photo ? `<img src="${e(r.photo)}" alt="">` : ""}<div class="pad"><div class="stars" aria-label="${r.rating} na 5">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div><q>${e(r.text)}</q><div class="who">${e(r.author)} · <a href="${e(r.source_url)}" rel="nofollow noopener" target="_blank">źródło</a></div></div></figure>`).join("")}</div></div></section>`
    : (preview && on("reviews") ? `<section class="sec" id="opinie"><div class="w">${slot(true, "Opinie", "Wpisz autora, treść, ocenę i link do źródła. Puste pole nie zamienia się w recenzję.")}</div></section>` : "");

  const ours = d.compare_ours || brand;
  const others = d.compare_others || "Zwykły produkt";
  const comparePics = on("compare") && (d.compare_image_ours || d.compare_image_others)
    ? `<div class="cmp-visual">
        <figure>${d.compare_image_ours ? `<img src="${e(d.compare_image_ours)}" alt="${e(d.compare_caption_ours || ours)}">` : `<div class="blank"></div>`}<figcaption>${e(d.compare_caption_ours || ours)}</figcaption></figure>
        <figure>${d.compare_image_others ? `<img src="${e(d.compare_image_others)}" alt="${e(d.compare_caption_others || others)}">` : `<div class="blank"></div>`}<figcaption>${e(d.compare_caption_others || others)}</figcaption></figure>
      </div>` : "";
  const compareTable = on("compare") && d.compare.length
    ? `<div class="cmp"><table><thead><tr><th></th><th>${e(ours)}</th><th>${e(others)}</th></tr></thead><tbody>${d.compare.map((r) => `<tr><td>${e(r.feature)}</td><td>${e(r.ours)}</td><td>${e(r.others)}</td></tr>`).join("")}</tbody></table></div>` : "";
  const compare = (comparePics || compareTable)
    ? `<section class="sec" id="porownanie"><div class="w"><h2>Porównanie</h2><p class="sub">${e(ours)} i ${e(others)}.</p>${comparePics}${compareTable}</div></section>`
    : (preview && on("compare") ? `<section class="sec" id="porownanie"><div class="w">${slot(true, "Porównanie", "Miejsce na własne zdjęcie „u nas” i „zwykły produkt” oraz wiersze z faktów. Bez cudzej grafiki.")}</div></section>` : "");

  const story = on("features") ? (d.features || []).filter((f) => f.title) : [];
  const specRows = on("features") ? (d.specs || []).filter((spec) => spec.name && spec.value && !/taryfy celnej/i.test(spec.name)) : [];
  const steps = story.map((f, i) => `<article class="step${i % 2 ? " flip" : ""}">${f.image ? `<div class="step-pic"><img src="${e(f.image)}" alt="${e(f.title)}"></div>` : ""}<div><h3>${e(f.title)}</h3>${f.text ? `<p>${e(f.text)}</p>` : ""}</div></article>`).join("");
  const specHtml = specRows.length ? `<div class="specs">${specRows.map((spec) => `<div class="spec"><b>${e(spec.name)}</b><span>${e(spec.value)}</span></div>`).join("")}</div>` : "";
  const features = (steps || specHtml) ? `<section class="sec" id="korzysci"><div class="w"><h2>${e(d.benefits_title || "Jak to działa")}</h2>${steps ? `<div class="steps">${steps}</div>` : ""}${specHtml}</div></section>` : "";

  const faqItems = on("faq") ? d.faq.filter((f) => f.q && f.a) : [];
  const problem = (d.problem?.title || d.problem?.text) ? `<p class="sub">${e(d.problem.text || "")}</p>` : `<p class="sub">Odpowiedzi z karty produktu.</p>`;
  const faq = faqItems.length ? `<section class="sec" id="pytania"><div class="w"><h2>${e(d.problem?.title || "Zanim kupisz")}</h2>${problem}<div class="acc" id="faq">${faqItems.map((f, i) => `<div class="acc-item"${i === 0 ? " open" : ""}><button type="button" aria-expanded="${i === 0 ? "true" : "false"}">${e(f.q)} <i>${ICONS.plus}</i></button><div class="a"${i ? " hidden" : ""}>${e(f.a)}</div></div>`).join("")}</div></div></section>` : "";

  const contact = d.contact.enabled ? `<section class="sec" id="kontakt"><div class="w contact-w"><div><h2>${e(d.contact.title || "Masz pytanie?")}</h2><p class="sub">${e(d.contact.text || "Odpisujemy na e-mail, zwykle w ciągu jednego dnia roboczego.")}</p></div>
    <form class="ct-f" id="ctF" novalidate>
      <div class="ct-row"><label>Imię<input id="ctName" name="name" autocomplete="name" required></label><label>E-mail<input id="ctMail" name="email" type="email" autocomplete="email" required></label></div>
      <label>Temat<select id="ctTopic" name="topic">${TOPICS.map(([k, l]) => `<option value="${k}">${e(l)}</option>`).join("")}</select></label>
      <label>Wiadomość<textarea id="ctMsg" name="message" maxlength="2000" required></textarea></label>
      <div class="hp" aria-hidden="true"><label>Strona<input id="ctHp" name="company_website" tabindex="-1" autocomplete="off"></label></div>
      <input type="hidden" id="ctOpened" value="">
      <p class="form-err" id="ctErr" role="alert" hidden></p>
      <button class="btn" type="submit">Wyślij wiadomość</button>
    </form>
    <div class="form-ok" id="ctDone" hidden><b>Dziękujemy, wiadomość dotarła.</b></div>
  </div></section>` : "";

  const docs = legalDocs(row, d);
  const docLink = (k, label, url) => url && url !== "#" ? `<a href="${e(url)}">${label}</a>` : `<button type="button" data-doc="${k}">${label}</button>`;
  const sellerBits = [d.seller.name, d.seller.address, d.seller.nip && `NIP ${d.seller.nip}`, d.seller.email, d.seller.phone].filter(Boolean);
  const gpsrBits = [d.gpsr.producer, d.gpsr.address, d.gpsr.contact].filter(Boolean);
  const reqId = crypto.randomUUID();
  const drawer = first ? `<div class="drawer" id="co" hidden><div class="drawer-bg" data-co-close></div><aside class="drawer-p" role="dialog" aria-modal="true" aria-labelledby="coT">
    <div class="drawer-h"><h2 id="coT">Twoje zamówienie</h2><button type="button" class="x" data-co-close aria-label="Zamknij">×</button></div>
    <form id="coF" novalidate>
      <div class="sum"><div><b id="coL">${e(first.label)}</b><small id="coV">${d.variants[0] ? `Wariant: ${e(d.variants[0])}` : ""}</small></div><b id="coP">${nb(price0)}</b></div>
      <p class="omnibus" id="coShipNote">${d.shipping.free ? "Dostawa gratis" : d.shipping.price != null ? `Dostawa ${e(kMoney(d.shipping.price))}` : "Koszt dostawy podamy przy zamówieniu"}</p>
      <label>Imię i nazwisko<input id="coName" autocomplete="name" required></label>
      <div class="ct-row"><label>Telefon<input id="coTel" type="tel" autocomplete="tel" required></label><label>E-mail<input id="coMail" type="email" autocomplete="email" required></label></div>
      <div class="paysel" role="radiogroup" aria-label="Dostawa"><label><input type="radio" name="ship" value="paczkomat" checked> Paczkomat</label><label><input type="radio" name="ship" value="kurier"> Kurier</label></div>
      <label id="coAddrLab">Kod paczkomatu albo adres<input id="coAddr" autocomplete="street-address" required></label>
      <div class="paysel" role="radiogroup" aria-label="Płatność"><label><input type="radio" name="pay" value="blik" checked> BLIK</label><label><input type="radio" name="pay" value="przelew"> Przelew</label><label><input type="radio" name="pay" value="karta"> Karta</label></div>
      <label class="chk"><input type="checkbox" id="coTerms" required><span>Akceptuję <button type="button" data-doc="regulamin">regulamin</button> i <button type="button" data-doc="prywatnosc">politykę prywatności</button>.</span></label>
      <div class="hp" aria-hidden="true"><label>Strona<input id="coHp" tabindex="-1" autocomplete="off"></label></div>
      <input type="hidden" id="coOpened" value=""><input type="hidden" id="coReq" value="${e(reqId)}">
      <p class="form-err" id="coErr" role="alert" hidden></p>
      <button class="btn" id="coGo" type="submit" ${outOfStock ? "disabled" : ""}>Zamawiam i płacę</button>
    </form>
    <div class="form-ok" id="coOk" hidden><h3>Dziękujemy</h3><p id="coOkT"></p></div>
  </aside></div>` : "";

  const offers = bundles.length > 1
    ? { "@type": "AggregateOffer", priceCurrency: "PLN", lowPrice: Math.min(...bundles.map((b) => b.price)), highPrice: Math.max(...bundles.map((b) => b.price)), offerCount: bundles.length, availability: outOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: pageUrl || undefined }
    : first ? { "@type": "Offer", priceCurrency: "PLN", price: first.price, availability: outOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: pageUrl || undefined } : undefined;
  const ld = { "@context": "https://schema.org", "@type": "Product", name: d.headline || row.name, description: desc, image: imgs.map((i) => i.url).filter((u) => /^https?:/.test(u)), brand: d.brand ? { "@type": "Brand", name: d.brand } : undefined, offers, sku: row.id };
  const faqLd = faqItems.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqItems.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) } : null;
  const metaPixel = !preview && d.tracking.meta_pixel ? d.tracking.meta_pixel : "";
  const googleAds = !preview && d.tracking.google_ads_id ? { id: d.tracking.google_ads_id, label: d.tracking.google_ads_label } : null;
  const bot = botKnowledge(d).map(({ q, a, k }) => ({ q, a, k }));
  const clientData = { bot, reviews: d.reviews, cutoff: plan.cutoff, headline: d.headline || row.name, shippingFree: d.shipping.free !== false, shippingPrice: d.shipping.price || 0, metaPixel, googleAds, price0, productId: row.id || "" };
  const sticky = on("sticky") && first ? `<div class="stab" id="stab"><div class="w"><div class="meta"><b id="stabName">${e(d.headline || row.name)} · ${e(first.label)}</b><span id="stabPrice">${nb(price0)}</span></div><button type="button" class="btn" id="stabBtn" ${outOfStock ? "disabled" : ""}>Dodaj do koszyka</button></div></div>` : "";

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title><meta name="description" content="${e(desc)}">${preview && origin ? `<base href="${e(String(origin).replace(/\/$/, "") + "/")}">` : ""}${preview ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">'}
${pageUrl && !preview ? `<link rel="canonical" href="${e(pageUrl)}">` : ""}
<meta property="og:type" content="product"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(desc)}">${pageUrl ? `<meta property="og:url" content="${e(pageUrl)}">` : ""}${imgs[0] && /^https?:/.test(imgs[0].url) ? `<meta property="og:image" content="${e(imgs[0].url)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, "\\u003c")}</script>` : ""}
<style>:root{--accent:${accent};--accent-ink:${accentInk(accent)}}</style>
<style>${KONWERSJA_CSS}</style></head>
<body class="tpl-konwersja" data-live="${preview ? "0" : "1"}" data-stock="${d.stock == null ? "" : d.stock}">
${preview && !editor ? `<div class="pv">Podgląd szablonu Konwersja — ${row.status === "published" ? "strona jest opublikowana" : "szkic"}. Zamówienia z podglądu nie są zapisywane. Puste sekcje opinii i nagrań widać tylko tutaj.</div>` : ""}
${splitSectionOrder(d.section_order).before.map((id) => ({ sale, trust, ugc, reviews: reviewHtml, compare, features, faq }[id] ? `<div data-edit="${id}">${{ sale, trust, ugc, reviews: reviewHtml, compare, features, faq }[id]}</div>` : "")).join("")}
<header class="hd" id="hd"><div class="w"><a class="logo" href="#kup">${e(brand)}</a><div class="hd-r"><button type="button" class="icon-btn" id="cartBtn" aria-label="Koszyk">${ICONS.cart}<span class="cart-n" id="cartN" hidden>0</span></button></div></div></header>
<main>
<section class="hero" id="kup" data-edit="gallery"><div class="w hero-w">${gallery}
<div class="buy">
${rating ? `<div class="rating">${stars(rating.avg)}<strong>${e(String(rating.avg.toFixed(1)).replace(".", ","))}</strong><a href="#opinie">${rating.count} ${rating.count === 1 ? "opinia" : "opinii"}</a></div>` : ""}
${d.kicker ? `<p class="lead">${e(d.kicker)}</p>` : ""}
<h1>${e(d.headline || row.name)}</h1>
${d.subheadline ? `<p class="lead">${e(d.subheadline)}</p>` : ""}
${first ? `<div class="price-box"><div class="price-row"><div class="price"><span id="priceNow">${nb(price0)}</span>${was0 ? `<s id="priceWas">${nb(was0)}</s>` : `<s id="priceWas" hidden></s>`}</div></div>
<p class="omnibus" id="omnibusRow"${om0 ? "" : " hidden"}>Najniższa cena z 30 dni przed obniżką: <span id="omnibus">${om0 ? nb(om0) : ""}</span></p></div>` : ""}
${splitSectionOrder(d.section_order).buy.map((id) => ({ benefits: `<div data-edit="benefits">${perkHtml}</div>`, bundles: `<div data-edit="bundles">${buns}</div>`, urgency: urgency ? `<div data-edit="urgency">${urgency}</div>` : "" }[id] || "")).join("")}
${variants}
<div class="cta-row"><button type="button" class="btn" id="addCart" ${outOfStock ? "disabled" : ""}>Dodaj do koszyka</button></div>
<div class="pays"><span>Płatność</span><span class="pay">BLIK</span><span class="pay">Przelewy24</span><span class="pay">Karta</span></div>
<div class="ship"><p class="ship-cd" id="shipCd" data-cutoff="${e(plan.cutoff)}">${ICONS.clock}<span>${e(plan.message)}</span></p>
<div class="tl" aria-label="Oś dostawy"><div><b>Zamówione</b><span id="dOrder">${e(plan.orderLabel)}</span></div><div><b>Wysłane</b><span id="dShip">${e(plan.shipLabel)}</span></div><div><b>Dostawa</b><span id="dDeliv">${e(plan.delivLabel)}</span></div></div></div>
${d.guarantee ? `<p class="lead">${e(d.guarantee)}</p>` : ""}
</div></div></section>
${splitSectionOrder(d.section_order).after.map((id) => {
  const block = { sale, trust, ugc, reviews: reviewHtml, compare, features, faq }[id];
  return block ? `<div data-edit="${id}">${block}</div>` : "";
}).join("")}${contact}
</main>
<footer class="ft"><div class="w"><div class="ft-top">
<div><a class="logo" href="#kup">${e(brand)}</a><nav class="legal">${docLink("regulamin", "Regulamin", d.legal.terms_url)}${docLink("zwroty", "Zwroty", d.legal.returns_url)}${docLink("prywatnosc", "Polityka prywatności", d.legal.privacy_url)}${docLink("cookies", "Cookies", "")}</nav></div>
<div><h3>Sprzedawca</h3><p>${sellerBits.length ? e(sellerBits.join(", ")) : "Uzupełnij dane sprzedawcy."}</p>${d.seller.vat_exempt ? "<p>Sprzedawca korzysta ze zwolnienia z VAT.</p>" : ""}</div>
<div><h3>Producent</h3><p>${gpsrBits.length ? e(gpsrBits.join(", ")) : "Uzupełnij producenta."}</p>${d.gpsr.warnings ? `<p>${e(d.gpsr.warnings)}</p>` : ""}</div>
</div><div class="ft-bot"><span>© ${new Date(now).getUTCFullYear()} ${e(brand)}</span><span>${d.returns_days} dni na zwrot</span></div></div></footer>
${sticky ? `<div data-edit="sticky">${sticky}</div>` : ""}${drawer}
${Object.entries(docs).map(([k, v]) => `<template id="doc-${k}">${v}</template>`).join("")}
<dialog class="lgd" id="lgd"><div style="display:flex;justify-content:flex-end;padding:8px"><button type="button" class="x" id="lgdX" aria-label="Zamknij">×</button></div><article class="lgd-c" id="lgdC"></article></dialog>
<div class="toast" id="toast" role="status"></div>
<button type="button" class="botb" id="botB" aria-controls="botP">Masz pytanie?</button>
<div class="botp" id="botP" hidden role="dialog" aria-label="Pytania"><div class="botp-h"><b>Zapytaj o produkt</b><button type="button" class="x" id="botX" aria-label="Zamknij">×</button></div><div class="botp-l" id="botL"><div class="bm">Dzień dobry. Zapytaj o dostawę, zwrot albo sam produkt.</div><div class="botq">${bot.slice(0, 4).map((x, i) => `<button type="button" data-botq="${i}">${e(x.q)}</button>`).join("")}</div></div><form class="botp-f" id="botF"><input id="botI" maxlength="200" placeholder="Wpisz pytanie" aria-label="Pytanie"><button class="btn" type="submit">Zapytaj</button></form></div>
${metaPixel || googleAds ? `<div class="ckb" id="ckb" hidden><p>Cookies reklamowe włączymy tylko za zgodą. <button type="button" data-doc="cookies">Więcej</button></p><div class="paysel"><button type="button" class="btn btn--ghost" id="ckNo">Tylko niezbędne</button><button type="button" class="btn" id="ckYes">Akceptuję</button></div></div>` : ""}
<script id="site-data" type="application/json">${JSON.stringify(clientData).replace(/</g, "\\u003c")}</script>
<script>${PAGE_CLIENT}</script>
<script>(function(){function tick(el){if(!el)return;var end=Date.parse(el.getAttribute("data-ends")||"");if(!end){el.hidden=true;return}function run(){var left=end-Date.now();if(left<=0){el.hidden=true;return}var s=Math.floor(left/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60;el.textContent=(d?d+" d ":"")+String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(sec).padStart(2,"0")}run();setInterval(run,1000)}tick(document.getElementById("dealEnds"));tick(document.getElementById("saleEnds"));document.addEventListener("click",function(ev){var n=ev.target.closest("[data-edit]");if(!n||window.parent===window)return;parent.postMessage({nhpEdit:n.getAttribute("data-edit")},"*");});})();</script>
</body></html>`;
}
