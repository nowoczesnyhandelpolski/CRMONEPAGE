import { LIGHT_CSS } from "./light-css.mjs";
import { PAGE_CLIENT } from "./page-client.mjs";
import { legalDocs } from "./legal.mjs";
import { TOPICS, botKnowledge } from "./support.mjs";
import {
  accentInk, cleanSiteData, featureItems, kEsc, kMoney, ratingOf, shippingPlan, siteBundles, tickItems
} from "./site-model.mjs";

const SWATCHES = {
  grafit: "#4a4d52", czarny: "#1d1d1f", szary: "#9a9ea3", bez: "#cdb89a", beżowy: "#cdb89a", kremowy: "#ece3d2",
  biały: "#f4f2ee", bialy: "#f4f2ee", zielony: "#2d6a4f", zieleń: "#2f4f43", granat: "#24304a", granatowy: "#1c3f94",
  niebieski: "#1c3f94", czerwony: "#c0392b", bordo: "#7a1f2b", bordowy: "#7a1f2b", różowy: "#e2a8b4", rozowy: "#e2a8b4",
  brązowy: "#7a5235", brazowy: "#7a5235", naturalny: "#cdb89a", pomarańcz: "#ff5a00", pomaranczowy: "#ff5a00"
};

const strokeIcon = (body) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const svg = {
  check: strokeIcon('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  cross: strokeIcon('<path d="M7 7l10 10M17 7 7 17"/>'),
  truck: strokeIcon('<path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>'),
  back: strokeIcon('<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11"/>'),
  shield: strokeIcon('<path d="M12 3 5 6.5v6.2c0 4 3 6.8 7 8.3 4-1.5 7-4.3 7-8.3V6.5Z"/><path d="m9 12 2 2 4-4"/>'),
  lock: strokeIcon('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  clock: strokeIcon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  arrow: strokeIcon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  cart: strokeIcon('<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.2 11h11.3l2-7H7"/>'),
  play: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>',
  plus: strokeIcon('<path d="M12 6v12M6 12h12"/>'),
  chevL: strokeIcon('<path d="M15 5 8 12l7 7"/>'),
  chevR: strokeIcon('<path d="m9 5 7 7-7 7"/>'),
  logo: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M4 14c4-1 6-5 8-11 2 6 4 10 8 11-4 1.2-6 4-8 9-2-5-4-7.8-8-9Z"/></svg>'
};

function swatch(name) {
  const k = String(name || "").toLowerCase();
  return SWATCHES[k] || SWATCHES[k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l")] || "";
}

function stars(avg) {
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  const label = `${String(avg.toFixed(1)).replace(".", ",")} na 5`;
  return `<span class="stars" aria-label="Ocena ${kEsc(label)}"><span class="bg">★★★★★</span><span class="fg" style="width:${pct}%">★★★★★</span></span>`;
}

export function renderLightPage(row, raw, { preview = false, origin = "", now = new Date() } = {}) {
  const e = kEsc;
  const d = cleanSiteData(raw || {});
  const imgs = d.images.filter((i) => i.rights || preview);
  const bundles = siteBundles(d);
  const def = Math.min(bundles.length - 1, Math.max(0, d.default_bundle ?? (bundles.length >= 2 ? 1 : 0)));
  const first = bundles[def] || null;
  const plan = shippingPlan(now, d.shipping.cutoff || "15:00");
  const brand = d.brand || row.name || "Sklep";
  const accent = d.theme.accent || "#ff5a00";
  const title = d.seo.title || d.headline || row.name;
  const desc = d.seo.description || d.subheadline || "";
  const pageUrl = origin ? `${origin}/p/${row.slug}` : "";
  const rating = ratingOf(d);
  const ticks = tickItems(d);
  const feats = featureItems(d);
  const outOfStock = d.stock === 0;
  const okImg = (url) => url && (preview || imgs.some((i) => i.url === url) || /^https?:/.test(url) || url.startsWith("/"));
  const nb = (n) => e(kMoney(n)).replace(/[\u00a0 ]/g, "&nbsp;");

  const tickerItems = [];
  if (d.announcement) tickerItems.push(d.announcement);
  else if (d.shipping.free) tickerItems.push("Darmowa dostawa");
  else if (d.shipping.price) tickerItems.push(`Dostawa ${kMoney(d.shipping.price)}`);
  tickerItems.push(`${d.returns_days} dni na zwrot`);
  if (d.shipping.time) tickerItems.push(d.shipping.time);
  if (d.shipping.from) tickerItems.push(`Wysyłka z: ${d.shipping.from}`);
  let seq = tickerItems.slice();
  while (seq.length < 8) seq = seq.concat(tickerItems);
  const track = seq.concat(seq).map((t) => `<span>${e(t)}</span>`).join("");

  const showVideo = d.video?.url && (d.video.rights || preview);
  const heroVideo = showVideo ? `<div class="stage-art" data-slide="0"${imgs.length ? "" : ""}><video src="${e(d.video.url)}" playsinline controls preload="metadata"${d.video.poster ? ` poster="${e(d.video.poster)}"` : ""}></video></div>` : "";
  const slides = imgs.map((img, n) => `<div class="stage-art" data-slide="${showVideo ? n + 1 : n}"${n || showVideo ? " hidden" : ""}><img src="${e(img.url)}" alt="${e(img.alt || row.name || "")}"${n ? ' loading="lazy"' : ' fetchpriority="high"'}></div>`).join("");
  const thumbs = imgs.map((img, n) => `<button type="button" class="thumb" data-i="${showVideo ? n + 1 : n}" aria-label="Zdjęcie ${n + 1}"${!showVideo && n === 0 ? ' aria-current="true"' : ""}><img src="${e(img.url)}" alt=""></button>`).join("");
  const callouts = d.callouts.slice(0, 3).map((c, n) => {
    const cls = `c${n + 1}`;
    const line = n === 0 ? `<b>${e(c.label)}</b><span class="line"></span>` : `<span class="line"></span><b>${e(c.label)}</b>`;
    return `<div class="callout ${cls}">${line}</div>`;
  }).join("");
  const gallery = (imgs.length || showVideo)
    ? `<div class="stage" id="stage">${heroVideo}${slides}${callouts ? `<div class="callouts" id="callouts">${callouts}</div>` : ""}</div>
      <div class="thumbs">
        <button type="button" class="nav-arrow" id="prevImg" aria-label="Poprzednie zdjęcie">${svg.chevL}</button>
        <div class="thumbs-row" id="thumbs">${thumbs}</div>
        <button type="button" class="nav-arrow" id="nextImg" aria-label="Następne zdjęcie">${svg.chevR}</button>
      </div>`
    : `<div class="stage"><div class="stage-art ph">Dodaj zdjęcie produktu</div></div>`;

  const price0 = first ? first.price : 0;
  const was0 = first && first.compare_at && first.compare_at > first.price ? first.compare_at : null;
  const om0 = first && first.omnibus ? first.omnibus : null;
  const buns = bundles.map((b, n) => {
    const unit = b.qty > 1 ? `<small>${e(kMoney(b.price / b.qty))} / szt.</small>` : `<small>${e(kMoney(b.price))} / szt.</small>`;
    return `<label class="bun${n === def ? " on" : ""}">
      <input type="radio" name="b" value="${n}" data-price="${b.price}" data-was="${b.compare_at || ""}" data-omnibus="${b.omnibus || ""}" data-qty="${b.qty}" data-label="${e(b.label)}"${n === def ? " checked" : ""}>
      ${b.badge ? `<span class="bun-badge">${e(b.badge)}</span>` : ""}
      <span class="bun-q">${e(b.label)}</span>
      <span class="bun-p">${nb(b.price)}${unit}</span>
      ${b.note ? `<span class="bun-gift">${e(b.note)}</span>` : ""}
    </label>`;
  }).join("");

  const variants = d.variants.length ? `<fieldset class="var"><legend>${e(d.variant_label || "Wariant")}: <b id="varName">${e(d.variants[0])}</b></legend><div class="sws">${d.variants.map((v, n) => {
    const c = swatch(v);
    return `<label class="swl" title="${e(v)}"><input type="radio" name="v" value="${e(v)}"${n ? "" : " checked"}>${c ? `<span class="sw" style="--c:${c}"></span>` : `<span class="sw-t">${e(v)}</span>`}</label>`;
  }).join("")}</div></fieldset>` : "";

  const addon = d.checkout.bump && d.addons[0] ? d.addons[0] : null;
  const upsell = addon ? `<label class="upsell"><input type="checkbox" id="bump" data-price="${addon.price}"><span><b>Dobierz ${e(addon.name)} za ${nb(addon.price)}</b>${addon.text ? `<small>${e(addon.text)}</small>` : ""}</span></label>` : "";

  const stockHtml = d.stock == null ? "" : d.stock === 0
    ? `<p class="stock is-out" data-stock="0"><i></i>Brak w magazynie — zamówienia wstrzymane.</p>`
    : `<p class="stock" data-stock="${d.stock}"><i></i>Zostało ${d.stock} szt. — stan z magazynu</p>`;

  const shipRule = d.shipping.cutoff
    ? `Zamówienia w dni robocze do ${e(d.shipping.cutoff)} (czas Warszawy) wychodzą tego samego dnia.`
    : "Wysyłamy w dni robocze.";
  const trust = `<section class="sec" id="zaufanie" style="padding-top:0"><div class="w trust">
    <article><div class="ic">${svg.truck}</div><div><h3>${e(d.shipping.time || "Wysyłka")}</h3><p>${shipRule} Kurier zwykle 1–2 dni robocze.${d.shipping.free ? " Dostawa gratis." : ""}</p></div></article>
    <article><div class="ic">${svg.back}</div><div><h3>${d.returns_days} dni na zwrot</h3><p>Oddajesz bez podawania przyczyny. Pieniądze wracają po otrzymaniu przesyłki.</p></div></article>
    <article><div class="ic">${svg.shield}</div><div><h3>Gwarancja satysfakcji</h3><p>${e(d.guarantee || "Jeśli produkt nie spełni oczekiwań, odsyłasz go do nas.")}</p></div></article>
    <article><div class="ic">${svg.lock}</div><div><h3>Płatność online</h3><p>BLIK, Przelewy24, karta, Apple Pay i Google Pay. Status płatności jest osobny od wysyłki.</p></div></article>
  </div></section>`;

  const ugcItems = d.ugc.slice();
  if (showVideo && !ugcItems.some((u) => u.video === d.video.url)) {
    ugcItems.unshift({ video: d.video.url, poster: d.video.poster, author: "", text: "Wideo produktu" });
  }
  const ugc = ugcItems.length ? `<section class="sec sec--block" id="nagrania"><div class="w"><div class="sh"><span class="eyebrow">Nagrania</span><h2>${d.ugc.length ? "Tak wygląda u naszych klientów" : "Wideo produktu"}</h2></div><div class="ugcs">${ugcItems.map((u) => `<figure class="ugc">${u.poster ? `<img src="${e(u.poster)}" alt="">` : ""}<video src="${e(u.video)}" playsinline preload="metadata"${u.poster ? ` poster="${e(u.poster)}"` : ""}></video><button type="button" class="ugc-play" aria-label="Odtwórz nagranie ${e(u.author || u.text || "")}"><span>${svg.play}</span></button><figcaption>${u.author ? `<b>${e(u.author)}</b>` : ""}${e(u.text)}</figcaption></figure>`).join("")}</div></div></section>` : "";

  const probImg = okImg(d.problem.image) ? d.problem.image : "";
  const probReview = d.reviews[0];
  const problem = (d.problem.title || d.problem.text) ? `<section class="sec" id="obawa"><div class="w prob-w">
    <div class="prob-img">${probImg ? `<img src="${e(probImg)}" alt="">` : `<div class="art ph"></div>`}${probReview ? `<aside class="rev-card"><div class="stars" aria-hidden="true">${"★".repeat(probReview.rating || 5)}</div><q>${e(probReview.text)}</q><footer>${e(probReview.author)} · <a href="${e(probReview.source_url)}" rel="nofollow noopener" target="_blank">źródło</a></footer></aside>` : ""}</div>
    <div class="prob-copy"><span class="eyebrow">Największa obawa</span><h2>${e(d.problem.title || "Zanim kupisz")}</h2><p>${e(d.problem.text)}</p></div>
  </div></section>` : "";

  const featImg = okImg(d.features_image) ? d.features_image : (okImg(feats[0]?.image) ? feats[0].image : "");
  const features = feats.length ? `<section class="sec sec--block" id="korzysci"><div class="w"><div class="sh"><span class="eyebrow">${e(brand)}</span><h2>${e(d.benefits_title || "Małe detale, które robią różnicę")}</h2></div>
    <div class="feat-w">${featImg ? `<div class="feat-img"><img src="${e(featImg)}" alt=""></div>` : ""}<div class="feat-list">${feats.map((f, n) => `<article class="feat"><span class="n">${String(n + 1).padStart(2, "0")}</span><div><h3>${e(f.title)}</h3>${f.text ? `<p>${e(f.text)}</p>` : ""}</div></article>`).join("")}</div></div>
  </div></section>` : "";

  const compare = d.compare.length ? `<section class="sec" id="porownanie"><div class="w"><div class="sh"><span class="eyebrow">Porównanie</span><h2>My a zwykły produkt</h2></div>
    <div class="cmp"><table><thead><tr><th></th><th class="us">${e(d.compare_ours || brand)}</th><th>${e(d.compare_others || "Zwykły produkt")}</th></tr></thead><tbody>
    ${d.compare.map((r) => `<tr><td>${e(r.feature)}</td><td><span class="yes">${svg.check} ${e(r.ours)}</span></td><td><span class="no">${svg.cross} ${e(r.others)}</span></td></tr>`).join("")}
    </tbody></table></div></div></section>` : "";

  const reviews = d.reviews.length ? `<section class="sec sec--block" id="opinie"><div class="w">
    <div class="sh" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap"><div><span class="eyebrow">Opinie</span><h2>Co mówią kupujący</h2><p class="lead">Tylko opinie z podanym źródłem.</p></div>
    <div class="rev-nav"><button type="button" id="revPrev" aria-label="Poprzednie opinie">${svg.chevL}</button><button type="button" id="revNext" aria-label="Następne opinie">${svg.chevR}</button></div></div>
    <div class="revs-wrap"><div class="revs" id="revs">${d.reviews.map((r) => `<figure class="rev"><div class="stars" aria-label="${r.rating} na 5">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div><q>${e(r.text)}</q><div class="who"><span class="av">${e((r.author || "?").trim().charAt(0).toUpperCase())}</span><span>${e(r.author)}</span> <a href="${e(r.source_url)}" rel="nofollow noopener" target="_blank">źródło</a></div></figure>`).join("")}</div></div>
  </div></section>` : "";

  const faq = d.faq.length ? `<section class="sec" id="pytania"><div class="w faq-w"><div class="sh"><span class="eyebrow">Pytania</span><h2>Masz wątpliwość? Tu są odpowiedzi</h2><p class="lead">Dostawa, zwroty i dane producenta.</p></div>
    <div class="acc" id="faq">${d.faq.map((f, i) => `<div class="acc-item"${i === 0 ? " open" : ""}><button type="button" aria-expanded="${i === 0 ? "true" : "false"}" aria-controls="faq-a-${i}">${e(f.q)}<i>${svg.plus}</i></button><div class="a" id="faq-a-${i}"${i ? " hidden" : ""}>${e(f.a)}</div></div>`).join("")}</div>
  </div></section>` : "";

  const related = d.related.length ? `<section class="sec sec--block" id="pasuje"><div class="w"><div class="sh"><span class="eyebrow">Dobierz</span><h2>Pasuje do</h2></div>
    <div class="rels">${d.related.map((r) => `<a class="rel" href="${e(r.url || "#kup")}">${r.image ? `<div class="rel-art"><img src="${e(r.image)}" alt=""></div>` : `<div class="rel-art ph">${e(r.name.slice(0, 1))}</div>`}<div class="rel-c"><h3>${e(r.name)}</h3><b>${nb(r.price)}</b></div></a>`).join("")}</div>
  </div></section>` : "";

  const contact = d.contact.enabled ? `<section class="sec" id="kontakt"><div class="w contact-w"><div><span class="eyebrow">Kontakt</span><h2>${e(d.contact.title || "Masz pytanie? Napisz do nas")}</h2><p class="lead">${e(d.contact.text || "Odpisujemy na e-mail, zwykle w ciągu jednego dnia roboczego.")}</p></div>
    <form class="ct-f" id="ctF" novalidate>
      <div class="ct-row"><label>Imię<input id="ctName" name="name" autocomplete="name" required></label><label>E-mail<input id="ctMail" name="email" type="email" autocomplete="email" required></label></div>
      <label>Temat<select id="ctTopic" name="topic">${TOPICS.map(([k, l]) => `<option value="${k}">${e(l)}</option>`).join("")}</select></label>
      <label>Wiadomość<textarea id="ctMsg" name="message" maxlength="2000" required></textarea></label>
      <div class="hp" aria-hidden="true"><label>Strona<input id="ctHp" name="company_website" tabindex="-1" autocomplete="off"></label></div>
      <input type="hidden" id="ctOpened" value="">
      <p class="form-err" id="ctErr" role="alert" hidden></p>
      <button class="btn" type="submit">Wyślij wiadomość</button>
    </form>
    <div class="form-ok" id="ctDone" hidden><b>Dziękujemy, wiadomość dotarła.</b><span>Odpiszemy na podany e-mail.</span></div>
  </div></section>` : "";

  const fin = first ? `<section class="final" id="zamow"><div class="w"><span class="eyebrow" style="color:#ffb089">Wybierz zestaw</span><h2>${e(d.headline || row.name)}</h2><p>${e(bundles.map((b) => `${b.label} — ${kMoney(b.price)}`).join(" · "))}</p><button type="button" class="btn" data-buy ${outOfStock ? "disabled" : ""}>Wybierz swój zestaw ${svg.arrow}</button></div></section>` : "";

  const docs = legalDocs(row, d);
  const docLink = (k, label, url) => url && url !== "#" ? `<a href="${e(url)}">${label}</a>` : `<button type="button" data-doc="${k}">${label}</button>`;
  const sellerBits = [d.seller.name, d.seller.address, d.seller.krs && `KRS ${d.seller.krs}`, d.seller.court, d.seller.nip && `NIP ${d.seller.nip}`, d.seller.regon && `REGON ${d.seller.regon}`, d.seller.capital && `kapitał zakładowy ${d.seller.capital}`, d.seller.email, d.seller.phone].filter(Boolean);
  const gpsrBits = [d.gpsr.producer, d.gpsr.address, d.gpsr.contact].filter(Boolean);

  const reqId = crypto.randomUUID();
  const drawer = first ? `<div class="drawer" id="co" hidden><div class="drawer-bg" data-co-close></div><aside class="drawer-p" role="dialog" aria-modal="true" aria-labelledby="coT">
    <div class="drawer-h"><h2 id="coT">Twoje zamówienie</h2><button type="button" class="x" data-co-close aria-label="Zamknij">×</button></div>
    <form id="coF" novalidate>
      <div class="sum"><div><b id="coL">${e(first.label)}</b><small id="coV">${d.variants[0] ? `Wariant: ${e(d.variants[0])}` : ""}</small></div><b id="coP">${nb(price0)}</b></div>
      <p class="omnibus" id="coShipNote">${d.shipping.free ? "Dostawa gratis" : d.shipping.price != null ? `Dostawa ${e(kMoney(d.shipping.price))}` : "Koszt dostawy podamy przy zamówieniu"}</p>
      <label class="fld">Imię i nazwisko<input id="coName" autocomplete="name" required></label>
      <div class="ct-row"><label class="fld">Telefon<input id="coTel" type="tel" autocomplete="tel" required></label><label class="fld">E-mail<input id="coMail" type="email" autocomplete="email" required></label></div>
      <div class="paysel" role="radiogroup" aria-label="Dostawa">
        <label><input type="radio" name="ship" value="paczkomat" checked> Paczkomat</label>
        <label><input type="radio" name="ship" value="kurier"> Kurier</label>
      </div>
      <label class="fld" id="coAddrLab">Kod paczkomatu albo adres<input id="coAddr" autocomplete="street-address" required></label>
      <div class="paysel" role="radiogroup" aria-label="Płatność">
        <label><input type="radio" name="pay" value="blik" checked> BLIK</label>
        <label><input type="radio" name="pay" value="przelew"> Przelew</label>
        <label><input type="radio" name="pay" value="karta"> Karta</label>
        <label><input type="radio" name="pay" value="wallet"> Apple Pay / Google Pay</label>
      </div>
      ${d.checkout.gift ? `<label class="chk"><input type="checkbox" id="coGift"><span><b>To prezent</b><small style="display:block;color:var(--muted);font-weight:600">Dopiszemy prośbę o bilecik. Paragonu nie wkładamy, jeśli o to poprosisz w treści.</small></span></label><label class="fld">Treść bileciku<textarea id="coNote" maxlength="200"></textarea></label>` : ""}
      ${d.checkout.reminder ? `<label class="chk"><input type="checkbox" id="coMk"><span>Chcę dostać e-mailem przypomnienie, jeśli nie dokończę płatności.</span></label>` : ""}
      <label class="chk"><input type="checkbox" id="coTerms" required><span>Akceptuję <button type="button" data-doc="regulamin">regulamin</button> i <button type="button" data-doc="prywatnosc">politykę prywatności</button>.</span></label>
      <div class="hp" aria-hidden="true"><label>Strona firmowa<input id="coHp" tabindex="-1" autocomplete="off"></label></div>
      <input type="hidden" id="coOpened" value=""><input type="hidden" id="coReq" value="${e(reqId)}">
      <p class="form-err" id="coErr" role="alert" hidden></p>
      <button class="btn" id="coGo" type="submit" ${outOfStock ? "disabled" : ""}>Zamawiam i płacę <b id="coGoP"></b></button>
      <p class="guar">${svg.lock} Zamówienie trafia do sklepu. Płatność (Przelewy24) ma osobny status — link otworzy się, gdy operator jest podłączony.</p>
    </form>
    <div class="form-ok" id="coOk" hidden>${svg.check}<h3>Dziękujemy</h3><p id="coOkT"></p></div>
  </aside></div>` : "";

  const offers = bundles.length > 1
    ? { "@type": "AggregateOffer", priceCurrency: "PLN", lowPrice: Math.min(...bundles.map((b) => b.price)), highPrice: Math.max(...bundles.map((b) => b.price)), offerCount: bundles.length, availability: outOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: pageUrl || undefined }
    : first ? { "@type": "Offer", priceCurrency: "PLN", price: first.price, availability: outOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: pageUrl || undefined } : undefined;
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: d.headline || row.name, description: desc,
    image: imgs.map((i) => i.url).filter((u) => /^https?:/.test(u)),
    brand: d.brand ? { "@type": "Brand", name: d.brand } : undefined,
    offers, sku: row.id
  };
  const faqLd = d.faq.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: d.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) } : null;
  const metaPixel = !preview && d.tracking.meta_pixel ? d.tracking.meta_pixel : "";
  const googleAds = !preview && d.tracking.google_ads_id ? { id: d.tracking.google_ads_id, label: d.tracking.google_ads_label } : null;
  const bot = botKnowledge(d).map(({ q, a, k }) => ({ q, a, k }));
  const clientData = { bot, reviews: d.reviews, cutoff: plan.cutoff, headline: d.headline || row.name, shippingFree: d.shipping.free !== false, shippingPrice: d.shipping.price || 0, metaPixel, googleAds, price0, productId: row.id || "" };

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title><meta name="description" content="${e(desc)}">${preview && origin ? `<base href="${e(String(origin).replace(/\/$/, "") + "/")}">` : ""}${preview ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">'}
${pageUrl && !preview ? `<link rel="canonical" href="${e(pageUrl)}">` : ""}
<meta property="og:type" content="product"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(desc)}">${pageUrl ? `<meta property="og:url" content="${e(pageUrl)}">` : ""}${imgs[0] && /^https?:/.test(imgs[0].url) ? `<meta property="og:image" content="${e(imgs[0].url)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Manrope:wght@400;500;600;700;800&display=swap">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, "\\u003c")}</script>` : ""}
<style>:root{--accent:${accent};--accent-ink:${accentInk(accent)}}.form-ok svg{width:36px;height:36px;color:var(--ok)}.stage-art video{width:100%;height:100%;object-fit:contain;background:#faf8f5}</style>
<style>${LIGHT_CSS}</style></head>
<body data-live="${preview ? "0" : "1"}" data-stock="${d.stock == null ? "" : d.stock}">
${preview ? `<div class="pv">Podgląd z Centrali — ${row.status === "published" ? "strona jest opublikowana" : "strona nie jest jeszcze opublikowana"}. Zamówienia z podglądu nie są zapisywane. Zdjęcia bez potwierdzonych praw widać tylko tutaj.</div>` : ""}
<div class="ticker" aria-label="${e(tickerItems.join(" · "))}"><div class="ticker-track">${track}</div></div>
<header class="hd" id="hd"><div class="w"><a class="logo" href="#kup"><span class="logo-mark">${svg.logo}</span>${e(brand)}</a>
<div class="hd-r"><button type="button" class="icon-btn" id="cartBtn" aria-label="Koszyk, 0 produktów">${svg.cart}<span class="cart-n" id="cartN" hidden>0</span></button></div></div></header>
<main>
<section class="hero" id="kup"><div class="w hero-w"><div class="gallery">${gallery}</div>
<div class="buy">
${rating ? `<div class="rating">${stars(rating.avg)}<strong>${e(String(rating.avg.toFixed(1)).replace(".", ","))}</strong><a href="#opinie">${rating.count} ${rating.count === 1 ? "opinia" : rating.count < 5 ? "opinie" : "opinii"}</a></div>` : ""}
${d.kicker ? `<p class="kicker">${e(d.kicker)}</p>` : ""}
<h1>${e(d.headline || row.name)}</h1>
${d.subheadline ? `<p class="lead">${e(d.subheadline)}</p>` : ""}
${ticks.length ? `<ul class="ticks">${ticks.map((t) => `<li>${svg.check}<span>${e(t.title)}</span></li>`).join("")}</ul>` : ""}
${d.reviews.length ? `<div class="snip" aria-live="polite"><div id="snipBody"><q>${e(d.reviews[0].text)}</q><footer>${e(d.reviews[0].author)} · <a href="${e(d.reviews[0].source_url)}" rel="nofollow noopener" target="_blank">źródło</a></footer></div><div class="snip-nav" id="snipNav"></div></div>` : ""}
<div class="price-box"><div class="price-row"><div class="price"><span id="priceNow">${first ? nb(price0) : ""}</span>${was0 ? `<s id="priceWas">${nb(was0)}</s>` : `<s id="priceWas" hidden></s>`}</div></div>
<p class="omnibus" id="omnibusRow"${om0 ? "" : " hidden"}>Najniższa cena z 30 dni przed obniżką: <span id="omnibus">${om0 ? nb(om0) : ""}</span></p></div>
${buns ? `<div class="buns" role="radiogroup" aria-label="Wybierz zestaw">${buns}</div>` : ""}
${variants}${upsell}${stockHtml}
<div class="cta-row">
<button type="button" class="btn" id="addCart" ${outOfStock ? "disabled" : ""}>Dodaj do koszyka ${svg.arrow}</button>
<button type="button" class="btn btn--ghost" id="buyNow" data-buy ${outOfStock ? "disabled" : ""}>Kup teraz</button>
</div>
<div class="ship"><p class="ship-cd" id="shipCd" data-cutoff="${e(plan.cutoff)}">${svg.clock}<span>${e(plan.message)}</span></p>
<div class="tl" aria-label="Oś dostawy"><div class="tl-i"><i></i><b>Zamówione dziś</b><span id="dOrder">${e(plan.orderLabel)}</span></div><div class="tl-i"><i></i><b>Wysłane</b><span id="dShip">${e(plan.shipLabel)}</span></div><div class="tl-i"><i></i><b>Dostarczone</b><span id="dDeliv">${e(plan.delivLabel)}</span></div></div></div>
${d.guarantee ? `<p class="guar">${svg.shield} ${e(d.guarantee)}</p>` : ""}
<div class="pays"><span>Płatności:</span><span class="pay">BLIK</span><span class="pay">Przelewy24</span><span class="pay">Visa</span><span class="pay">Mastercard</span><span class="pay">Apple&nbsp;Pay</span><span class="pay">Google&nbsp;Pay</span></div>
</div></div></section>
${trust}${ugc}${problem}${features}${compare}${reviews}${faq}${related}${contact}${fin}
</main>
<footer class="ft"><div class="w"><div class="ft-top">
<div><a class="logo" href="#kup"><span class="logo-mark">${svg.logo}</span>${e(brand)}</a>
<nav class="legal">${docLink("regulamin", "Regulamin", d.legal.terms_url)}${docLink("zwroty", "Zwroty", d.legal.returns_url)}${docLink("prywatnosc", "RODO / polityka prywatności", d.legal.privacy_url)}${docLink("cookies", "Cookies", "")}</nav></div>
<div class="seller"><h3>Sprzedawca</h3><p>${sellerBits.length ? e(sellerBits.join(", ")) : "Uzupełnij dane sprzedawcy."}</p>${d.seller.vat_exempt ? "<p>Sprzedawca korzysta ze zwolnienia z VAT (art. 113 ust. 1 ustawy o VAT).</p>" : ""}</div>
<div class="gpsr"><h3>Producent (GPSR)</h3><p>${gpsrBits.length ? e(gpsrBits.join(", ")) : "Uzupełnij dane producenta."}</p>${d.gpsr.responsible ? `<p>Osoba odpowiedzialna w UE: ${e(d.gpsr.responsible)}</p>` : ""}${d.gpsr.warnings ? `<p>${e(d.gpsr.warnings)}</p>` : ""}</div>
</div><div class="ft-bot"><span>© ${new Date(now).getUTCFullYear()} ${e(brand)}</span><span>${d.returns_days} dni na zwrot</span></div></div></footer>
${first ? `<div class="stab" id="stab"><div class="w"><div class="meta"><b id="stabName">${e(d.headline || row.name)} · ${e(first.label)}</b><span id="stabPrice">${nb(price0)}</span></div><button type="button" class="btn" id="stabBtn" ${outOfStock ? "disabled" : ""}>Dodaj do koszyka</button></div></div>` : ""}
${drawer}
${Object.entries(docs).map(([k, v]) => `<template id="doc-${k}">${v}</template>`).join("")}
<dialog class="lgd" id="lgd"><div class="lgd-h" style="display:flex;justify-content:flex-end;padding:10px"><button type="button" class="x" id="lgdX" aria-label="Zamknij">×</button></div><article class="lgd-c" id="lgdC"></article></dialog>
<div class="toast" id="toast" role="status"></div>
<button type="button" class="botb" id="botB" aria-controls="botP" aria-expanded="false">Masz pytanie?</button>
<div class="botp" id="botP" hidden role="dialog" aria-label="Pytania i odpowiedzi"><div class="botp-h"><b>Zapytaj o produkt</b><button type="button" class="x" id="botX" aria-label="Zamknij">×</button></div><div class="botp-l" id="botL" aria-live="polite"><div class="bm bm--a">Dzień dobry! Zapytaj o dostawę, zwrot, reklamację, płatność albo sam produkt.</div><div class="botq">${bot.slice(0, 4).map((x, i) => `<button type="button" data-botq="${i}">${e(x.q)}</button>`).join("")}</div></div><form class="botp-f" id="botF"><input id="botI" maxlength="200" placeholder="Wpisz pytanie…" aria-label="Twoje pytanie"><button type="submit" class="btn">Zapytaj</button></form></div>
${metaPixel || googleAds ? `<div class="ckb" id="ckb" hidden role="dialog" aria-label="Pliki cookies"><p>Używamy plików cookies reklamowych (Meta, Google), żeby mierzyć skuteczność reklam. Włączymy je tylko za Twoją zgodą. <button type="button" data-doc="cookies">Więcej</button></p><div class="ckb-b"><button type="button" class="btn btn--ghost" id="ckNo">Tylko niezbędne</button><button type="button" class="btn" id="ckYes">Akceptuję</button></div></div>` : ""}
<script id="site-data" type="application/json">${JSON.stringify(clientData).replace(/</g, "\\u003c")}</script>
<script>${PAGE_CLIENT}</script>
</body></html>`;
}

export function notFoundHtml() {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Nie znaleziono</title></head><body style="font:16px/1.5 Manrope,system-ui;padding:48px;background:#faf8f5;color:#1c1917"><h1 style="font-family:Barlow Condensed,sans-serif;letter-spacing:.04em">Tej strony nie ma</h1><p>Oferta nie istnieje albo nie jest opublikowana.</p></body></html>`;
}

export function sitemapXml(origin, pages) {
  const urls = (pages || []).map((p) => `<url><loc>${kEsc(origin)}/p/${kEsc(p.slug)}</loc>${p.updated_at ? `<lastmod>${kEsc(String(p.updated_at).slice(0, 10))}</lastmod>` : ""}</url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}
