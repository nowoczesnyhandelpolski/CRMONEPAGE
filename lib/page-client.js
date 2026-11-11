(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const dataEl = $("#site-data");
  const data = dataEl ? JSON.parse(dataEl.textContent) : {};
  const live = document.body.dataset.live === "1";

  // Meta Pixel ładuje się dopiero po zgodzie na cookies marketingowe. Bez zgody track() nic nie robi.
  const CK = "nhp-cookies";
  const pending = [];
  let pixelOn = false;
  function loadPixel() {
    if (pixelOn || !data.metaPixel) return;
    pixelOn = true;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", data.metaPixel);
    window.fbq("track", "PageView");
    pending.splice(0).forEach((a) => window.fbq.apply(null, a));
  }
  function track(ev, params, opts) {
    if (!data.metaPixel) return;
    const args = opts ? ["track", ev, params || {}, opts] : ["track", ev, params || {}];
    if (pixelOn && window.fbq) window.fbq.apply(null, args);
    else pending.push(args);
  }
  function consent() {
    if (!data.metaPixel) return;
    let v = "";
    try { v = localStorage.getItem(CK) || ""; } catch { /* prywatna sesja */ }
    if (v === "yes") { loadPixel(); return; }
    if (v === "no") return;
    const box = document.getElementById("ckb");
    if (!box) return;
    box.hidden = false;
    const done = (ans) => { try { localStorage.setItem(CK, ans); } catch { /* prywatna sesja */ } box.hidden = true; if (ans === "yes") loadPixel(); };
    const yes = document.getElementById("ckYes"), no = document.getElementById("ckNo");
    if (yes) yes.addEventListener("click", () => done("yes"));
    if (no) no.addEventListener("click", () => done("no"));
  }
  if (live) {
    consent();
    track("ViewContent", { content_ids: [data.productId], content_type: "product", value: Number(data.price0) || 0, currency: "PLN" });
    const q = new URLSearchParams(location.search);
    if (q.get("zaplacono") === "1") {
      const nr = q.get("nr") || "";
      let paid = 0;
      try { paid = Number(sessionStorage.getItem("nhp-paid:" + nr)) || 0; } catch { /* prywatna sesja */ }
      track("Purchase", { content_ids: [data.productId], content_type: "product", value: paid || Number(data.price0) || 0, currency: "PLN" }, nr ? { eventID: "order-" + nr } : undefined);
    }
  }
  const money = (n) => {
    const v = Math.round(Number(n || 0) * 100) / 100;
    const frac = Math.round(Math.abs(v) * 100) % 100;
    return v.toLocaleString("pl-PL", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 }) + " zł";
  };
  const toast = (msg) => {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast._id);
    toast._id = setTimeout(() => t.classList.remove("on"), 3200);
  };

  let slide = 0;
  const slides = $$(".stage-art");
  const thumbs = $$(".thumb");
  const callouts = $("#callouts");
  function show(i) {
    if (!slides.length) return;
    slide = (i + slides.length) % slides.length;
    slides.forEach((el, n) => { el.hidden = n !== slide; });
    thumbs.forEach((el, n) => el.setAttribute("aria-current", n === slide ? "true" : "false"));
    if (callouts) callouts.style.display = slide === 0 ? "" : "none";
  }
  thumbs.forEach((t) => t.addEventListener("click", () => show(+t.dataset.i)));
  const prev = $("#prevImg");
  const next = $("#nextImg");
  if (prev) prev.addEventListener("click", () => show(slide - 1));
  if (next) next.addEventListener("click", () => show(slide + 1));

  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  let snipI = 0;
  function renderSnip() {
    const box = $("#snipBody");
    if (!box || !reviews.length) return;
    const r = reviews[snipI];
    box.innerHTML = "<q></q><footer></footer>";
    box.querySelector("q").textContent = r.text;
    const foot = box.querySelector("footer");
    foot.textContent = r.author + " · ";
    if (r.source_url) {
      const a = document.createElement("a");
      a.href = r.source_url;
      a.rel = "nofollow noopener";
      a.target = "_blank";
      a.textContent = "źródło";
      foot.appendChild(a);
    }
    const nav = $("#snipNav");
    if (!nav) return;
    nav.innerHTML = reviews.map((_, n) => `<button type="button" aria-label="Opinia ${n + 1}" ${n === snipI ? 'aria-current="true"' : ""}></button>`).join("");
    $$("#snipNav button").forEach((b, n) => b.addEventListener("click", () => { snipI = n; renderSnip(); }));
  }
  if (reviews.length) {
    renderSnip();
    setInterval(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      snipI = (snipI + 1) % reviews.length;
      renderSnip();
    }, 6000);
  }
  const revs = $("#revs");
  const revPrev = $("#revPrev");
  const revNext = $("#revNext");
  if (revPrev && revs) revPrev.addEventListener("click", () => revs.scrollBy({ left: -360, behavior: "smooth" }));
  if (revNext && revs) revNext.addEventListener("click", () => revs.scrollBy({ left: 360, behavior: "smooth" }));

  $$("#faq .acc-item button").forEach((btn) => btn.addEventListener("click", () => {
    const item = btn.parentElement;
    const open = !item.hasAttribute("open");
    $$("#faq .acc-item").forEach((it) => {
      it.removeAttribute("open");
      it.querySelector("button").setAttribute("aria-expanded", "false");
      it.querySelector(".a").hidden = true;
    });
    if (open) {
      item.setAttribute("open", "");
      btn.setAttribute("aria-expanded", "true");
      item.querySelector(".a").hidden = false;
    }
  }));

  function current() {
    const r = $(".bun input:checked");
    const bumpEl = $("#bump");
    const bump = bumpEl && bumpEl.checked ? +bumpEl.dataset.price || 0 : 0;
    const ship = data.shippingFree === false && data.shippingPrice ? +data.shippingPrice : 0;
    const price = r ? +r.dataset.price + bump + ship : 0;
    const was = r && r.dataset.was ? +r.dataset.was + (bumpEl && bumpEl.checked ? bump : 0) : 0;
    const omnibus = r ? r.dataset.omnibus : "";
    return { r, price, was, omnibus, label: r ? r.dataset.label : "", qty: r ? +r.dataset.qty || 1 : 1 };
  }
  function renderPrice() {
    const c = current();
    $$(".bun").forEach((l) => l.classList.toggle("on", !!l.querySelector("input:checked")));
    const now = $("#priceNow");
    const was = $("#priceWas");
    const om = $("#omnibus");
    if (now && c.r) now.textContent = money(c.price);
    if (was) {
      if (c.was && c.was > (c.r ? +c.r.dataset.price : 0)) { was.hidden = false; was.textContent = money(+c.r.dataset.was); }
      else was.hidden = true;
    }
    const omRow = $("#omnibusRow");
    if (om && c.omnibus) { om.textContent = money(+c.omnibus); if (omRow) omRow.hidden = false; }
    else if (omRow) omRow.hidden = true;
    const sp = $("#stabPrice");
    const sn = $("#stabName");
    if (sp && c.r) sp.textContent = money(c.price);
    if (sn && c.r) sn.textContent = (data.headline || "") + " · " + c.label;
    const coL = $("#coL");
    const coP = $("#coP");
    if (coL && c.r) coL.textContent = c.label;
    if (coP && c.r) coP.textContent = money(c.price);
    const shipNote = $("#coShipNote");
    if (shipNote) shipNote.textContent = data.shippingFree === false && data.shippingPrice ? "Dostawa " + money(data.shippingPrice) : "Dostawa gratis";
  }
  $$(".bun input").forEach((i) => i.addEventListener("change", renderPrice));
  const bump = $("#bump");
  if (bump) bump.addEventListener("change", renderPrice);
  $$('input[name="v"]').forEach((i) => i.addEventListener("change", () => {
    const vn = $("#varName");
    if (vn) vn.textContent = i.value;
    const coV = $("#coV");
    if (coV) coV.textContent = i.value ? "Wariant: " + i.value : "";
  }));
  renderPrice();

  function atWarsaw(d) {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
    const p = Object.fromEntries(fmt.formatToParts(d || new Date()).map((x) => [x.type, x.value]));
    let h = +p.hour; if (h === 24) h = 0;
    const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday] || 1;
    return { y: +p.year, mo: +p.month, d: +p.day, h, mi: +p.minute, wd, date: new Date(Date.UTC(+p.year, +p.month - 1, +p.day)) };
  }
  function addBusiness(date, days) {
    const x = new Date(date);
    let left = days;
    while (left > 0) {
      x.setUTCDate(x.getUTCDate() + 1);
      const wd = x.getUTCDay();
      if (wd !== 0 && wd !== 6) left--;
    }
    return x;
  }
  function fmtPL(d) { return new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", day: "numeric", month: "long" }).format(d); }
  function updateShip() {
    const el = $("#shipCd span");
    if (!el) return;
    const cutoff = data.cutoff || "15:00";
    const [ch, cm] = cutoff.split(":").map(Number);
    const now = atWarsaw(new Date());
    const weekend = now.wd === 6 || now.wd === 7;
    const before = !weekend && (now.h < ch || (now.h === ch && now.mi < cm));
    let shipDate;
    if (before) {
      shipDate = now.date;
      const mins = ch * 60 + cm - (now.h * 60 + now.mi);
      const hh = Math.floor(mins / 60), mm = mins % 60;
      const parts = [];
      if (hh) parts.push(hh + " godz.");
      if (mm) parts.push(mm + " min");
      el.textContent = "Zamów w ciągu " + (parts.join(" ") || "kilku minut") + ", wyślemy dziś";
    } else {
      shipDate = addBusiness(now.date, 1);
      const when = weekend ? "Weekend — wyślemy w następnym dniu roboczym" : "Po godzinie granicznej " + cutoff;
      el.textContent = when + ". Wyślemy " + fmtPL(shipDate);
    }
    const delivFrom = addBusiness(shipDate, 1);
    const delivTo = addBusiness(shipDate, 2);
    const o = $("#dOrder"), s = $("#dShip"), dv = $("#dDeliv");
    if (o) o.textContent = fmtPL(now.date);
    if (s) s.textContent = fmtPL(shipDate);
    if (dv) {
      const a = fmtPL(delivFrom), b = fmtPL(delivTo);
      if (a === b) dv.textContent = a;
      else if (delivFrom.getUTCMonth() === delivTo.getUTCMonth()) {
        dv.textContent = new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", day: "numeric" }).format(delivFrom) + "–" + b;
      } else dv.textContent = a + "–" + b;
    }
  }
  if ($("#shipCd")) { updateShip(); setInterval(updateShip, 30000); }

  const hd = $("#hd");
  const stab = $("#stab");
  const hero = $(".hero");
  if (hd) addEventListener("scroll", () => hd.classList.toggle("sc", scrollY > 8), { passive: true });
  if (stab && hero && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => stab.classList.toggle("on", !e.isIntersecting), { threshold: 0, rootMargin: "-64px 0px 0px 0px" }).observe(hero);
  }

  const drawer = $("#co");
  let openedAt = Date.now();
  function openDrawer(ev) {
    if (ev) ev.preventDefault();
    if (!drawer) return;
    if (document.body.dataset.stock === "0") { toast("Tego produktu nie ma teraz w magazynie."); return; }
    openedAt = Date.now();
    const hid = $("#coOpened");
    if (hid) hid.value = String(openedAt);
    renderPrice();
    track("AddToCart", { content_ids: [data.productId], content_type: "product", value: current().price, currency: "PLN" });
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
    const f = $("#coName");
    if (f) setTimeout(() => f.focus(), 40);
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    document.body.style.overflow = "";
  }
  $$("[data-buy]").forEach((b) => b.addEventListener("click", openDrawer));
  $$("[data-co-close]").forEach((b) => b.addEventListener("click", closeDrawer));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer && !drawer.hidden) closeDrawer(); });

  let cart = 0;
  function bumpCart() {
    const c = current();
    cart += c.qty || 1;
    const n = $("#cartN");
    if (n) { n.hidden = cart <= 0; n.textContent = String(cart); }
    const btn = $("#cartBtn");
    if (btn) btn.setAttribute("aria-label", "Koszyk, " + cart + " szt.");
  }
  const addCart = $("#addCart");
  if (addCart) addCart.addEventListener("click", () => { bumpCart(); openDrawer(); });
  const stabBtn = $("#stabBtn");
  if (stabBtn) stabBtn.addEventListener("click", () => { bumpCart(); openDrawer(); });
  const cartBtn = $("#cartBtn");
  if (cartBtn) cartBtn.addEventListener("click", () => { if (cart > 0 || $(".bun input:checked")) openDrawer(); else toast("Koszyk jest pusty."); });

  $$('input[name="ship"]').forEach((r) => r.addEventListener("change", () => {
    const lab = $("#coAddrLab");
    if (lab) lab.textContent = r.value === "kurier" ? "Adres dostawy" : "Kod paczkomatu albo adres";
  }));

  const coF = $("#coF");
  if (coF) coF.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#coErr");
    const name = $("#coName").value.trim();
    const phone = $("#coTel").value.trim();
    const email = $("#coMail").value.trim();
    const address = $("#coAddr").value.trim();
    const terms = $("#coTerms").checked;
    const show = (m) => { err.hidden = false; err.textContent = m; };
    if (!live) { show("To jest podgląd. Zamówienie zapisze się dopiero na opublikowanej stronie."); return; }
    if (!name || phone.replace(/\D/g, "").length < 9 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || address.length < 3 || !terms) {
      show("Uzupełnij imię, telefon (9 cyfr), poprawny e-mail i adres oraz zaakceptuj regulamin.");
      return;
    }
    err.hidden = true;
    const c = current();
    const variant = ($('input[name="v"]:checked') || {}).value || "";
    const order = {
      bundle: c.r ? +c.r.value : 0,
      variant,
      bump: !!(bump && bump.checked),
      gift: !!($("#coGift") && $("#coGift").checked),
      note: ($("#coNote") || {}).value || "",
      name, phone, email, address,
      ship: ($('input[name="ship"]:checked') || {}).value || "paczkomat",
      pay: ($('input[name="pay"]:checked') || {}).value || "blik",
      marketing: !!($("#coMk") && $("#coMk").checked),
      company_website: ($("#coHp") || {}).value || "",
      opened_at: Number(($("#coOpened") || {}).value || openedAt),
      client_req: ($("#coReq") || {}).value || ""
    };
    const btn = $("#coGo");
    btn.disabled = true;
    try {
      const res = await fetch(location.pathname.replace(/\/$/, "") + "/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(order) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Nie udało się zapisać zamówienia.");
      track("InitiateCheckout", { content_ids: [data.productId], content_type: "product", value: Number(body.total) || c.price, currency: "PLN", num_items: c.qty || 1 });
      try { sessionStorage.setItem("nhp-paid:" + body.number, String(Number(body.total) || c.price)); } catch { /* prywatna sesja */ }
      if (body.pay_url) { location.href = body.pay_url; return; }
      coF.hidden = true;
      const ok = $("#coOk");
      ok.hidden = false;
      $("#coOkT").textContent = "Zamówienie nr " + body.number + " jest w sklepie. Płatność ma status „oczekuje”. Link Przelewy24 otworzy się, gdy operator będzie podłączony. Potwierdzenie wyślemy na " + email + ".";
    } catch (ex) {
      btn.disabled = false;
      show(ex.message || "Błąd połączenia.");
    }
  });

  const ctF = $("#ctF");
  if (ctF) ctF.addEventListener("submit", async (e) => {
    e.preventDefault();
    const er = $("#ctErr");
    const name = $("#ctName").value.trim();
    const email = $("#ctMail").value.trim();
    const message = $("#ctMsg").value.trim();
    if (!name || message.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      er.hidden = false; er.textContent = "Uzupełnij imię, poprawny e-mail i wiadomość."; return;
    }
    if (!live) { er.hidden = false; er.textContent = "Podgląd nie wysyła wiadomości."; return; }
    er.hidden = true;
    const btn = ctF.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await fetch(location.pathname.replace(/\/$/, "") + "/contact", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name, email, message,
          topic: ($("#ctTopic") || {}).value || "",
          company_website: ($("#ctHp") || {}).value || "",
          opened_at: Number($("#ctOpened").value || Date.now() - 5000)
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Nie udało się wysłać.");
      ctF.hidden = true;
      $("#ctDone").hidden = false;
    } catch (ex) {
      btn.disabled = false;
      er.hidden = false;
      er.textContent = ex.message || "Błąd połączenia.";
    }
  });
  const ctOpened = $("#ctOpened");
  if (ctOpened) ctOpened.value = String(Date.now() - 4000);

  const lgd = $("#lgd");
  function openDoc(k) {
    const t = $("#doc-" + k);
    if (!t || !lgd) return;
    $("#lgdC").innerHTML = t.innerHTML;
    if (lgd.showModal) lgd.showModal();
    else lgd.setAttribute("open", "");
  }
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-doc]");
    if (!a) return;
    ev.preventDefault();
    openDoc(a.dataset.doc);
  });
  const lgdX = $("#lgdX");
  if (lgdX) lgdX.addEventListener("click", () => (lgd.close ? lgd.close() : lgd.removeAttribute("open")));
  if (lgd) lgd.addEventListener("click", (ev) => { if (ev.target === lgd && lgd.close) lgd.close(); });

  $$(".ugc-play").forEach((b) => b.addEventListener("click", () => {
    const v = b.parentElement.querySelector("video");
    if (!v) return;
    b.hidden = true;
    v.controls = true;
    v.play().catch(() => { b.hidden = false; });
  }));

  if (live) {
    const viewKey = "nhp-view:" + location.pathname;
    try {
      if (!sessionStorage.getItem(viewKey)) {
        sessionStorage.setItem(viewKey, "1");
        fetch(location.pathname.replace(/\/$/, "") + "/view", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          keepalive: true
        }).catch(() => {});
      }
    } catch { /* prywatna sesja */ }
  }
})();
