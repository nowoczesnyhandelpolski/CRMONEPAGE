/* Social media + Płatności — moduł panelu Centrali.
   Social media: autopilot (Supabase Edge Function social-autopilot) prowadzi profile FB / IG / TikTok każdego sklepu.
   Panel jest podglądem: konta, marka, strategia, kolejka postów, log. Przełączniki: autopilot, częstotliwość, akceptacja.
   Płatności: linki Stripe tworzone automatycznie dla każdej strony z ceną (funkcja pay-link) i opłacone zamówienia. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("sm-css")) return;
    const css = document.createElement("style");
    css.id = "sm-css";
    css.textContent = `
      .sm-shop{margin-bottom:16px}
      .sm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:18px 18px 0}
      .sm-head h2{margin:0;font-family:var(--display);font-size:20px}
      .sm-acc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 18px}
      .sm-acc .a{border:1px solid var(--line);border-radius:12px;padding:12px;display:grid;gap:6px}
      .sm-acc .a b{font-size:14px}
      .sm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .sm-kit{padding:0 18px 18px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .sm-kit .box{border:1px dashed var(--line);border-radius:12px;padding:12px;font-size:13px;white-space:pre-wrap}
      .sm-kit .box h4{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
      .sm-feed{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:0 18px 18px}
      .sm-post{border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;background:var(--surface)}
      .sm-post img,.sm-post video{width:100%;aspect-ratio:1/1;object-fit:cover;background:var(--surface-2)}
      .sm-post .ph{aspect-ratio:1/1;display:grid;place-items:center;background:var(--surface-2);color:var(--muted);font-size:13px;padding:12px;text-align:center}
      .sm-post .b{padding:10px 12px;display:grid;gap:6px;font-size:13px}
      .sm-post .cap{max-height:7.5em;overflow:hidden;white-space:pre-wrap;color:var(--text)}
      .sm-post .err{color:var(--bad);font-size:12px}
      .sm-log{padding:0 18px 18px;font-size:12px;color:var(--muted);display:grid;gap:3px}
      .sm-log .error{color:var(--bad)} .sm-log .warn{color:var(--warn)}
      .sm-tabs{display:flex;gap:8px;margin:0 18px 12px;flex-wrap:wrap}
      @media(max-width:800px){.sm-acc,.sm-kit{grid-template-columns:1fr}}
    `;
    document.head.appendChild(css);

    const esc = CRM.esc;
    const PL = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
    const ACC_ST = { do_zalozenia: ["Do założenia", "var(--warn)"], polaczone: ["Połączone", "var(--good)"], blad: ["Błąd", "var(--bad)"], wstrzymane: ["Wstrzymane", "var(--grey)"] };
    const POST_ST = {
      szkic: ["Szkic", "var(--grey)"], do_akceptacji: ["Do akceptacji", "var(--violet)"], zaplanowany: ["Zaplanowany", "var(--info)"],
      publikacja: ["Publikuję…", "var(--warn)"], opublikowany: ["Opublikowany", "var(--good)"], czeka_na_wideo: ["Czeka na wideo", "var(--warn)"],
      blad: ["Błąd", "var(--bad)"], odrzucony: ["Odrzucony", "var(--grey)"],
    };
    const PAY_LINK_ST = { oczekuje: ["Tworzę link", "var(--warn)"], aktywny: ["Aktywny", "var(--good)"], za_drogo: ["Powyżej 2500 zł", "var(--grey)"], brak_klucza: ["Czeka na klucz Stripe", "var(--warn)"], blad: ["Błąd", "var(--bad)"], wylaczony: ["Wyłączony", "var(--grey)"] };
    const pill = (map, k) => { const [l, c] = map[k] || [k || "—", "var(--grey)"]; return `<span class="pill" style="--c:${c}">${esc(l)}</span>`; };
    const when = (t) => t ? new Date(t).toLocaleString("pl-PL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
    const zl = (n) => n == null ? "—" : CRM.fmtZl ? CRM.fmtZl(n) : `${n} zł`;

    const ST = { loaded: false, loading: false, shops: [], accounts: [], posts: [], log: [], links: [], payments: [], pages: [], filter: "nadchodzace", err: "" };
    CRM.S.social = ST;

    async function load() {
      if (!CRM.SB || ST.loading) return;
      ST.loading = true;
      try {
        const since = new Date(Date.now() - 14 * 86400e3).toISOString();
        const [shops, accounts, posts, log, links, payments, pages] = await Promise.all([
          CRM.SB.from("social_shops").select("*"),
          CRM.SB.from("social_accounts").select("*").order("platform"),
          CRM.SB.from("social_posts").select("*").gte("scheduled_at", since).order("scheduled_at").limit(400),
          CRM.SB.from("social_log").select("*").order("created_at", { ascending: false }).limit(40),
          CRM.SB.from("payment_links").select("*"),
          CRM.SB.from("payments").select("*").order("created_at", { ascending: false }).limit(100),
          CRM.SB.from("pages").select("id, slug, name, status, data"),
        ]);
        const firstErr = [shops, accounts, posts, log, links, payments, pages].find((r) => r.error);
        ST.err = firstErr ? firstErr.error.message : "";
        Object.assign(ST, {
          shops: shops.data || [], accounts: accounts.data || [], posts: posts.data || [], log: log.data || [],
          links: links.data || [], payments: payments.data || [], pages: pages.data || [], loaded: true,
        });
      } finally {
        ST.loading = false;
        CRM.scheduleRender();
      }
    }

    let channel = null;
    function subscribe() {
      if (channel || !CRM.SB) return;
      channel = CRM.SB.channel("nhp-social")
        .on("postgres_changes", { event: "*", schema: "public", table: "social_posts" }, () => load())
        .on("postgres_changes", { event: "*", schema: "public", table: "social_accounts" }, () => load())
        .subscribe();
    }

    function ensureLoaded() {
      if (!ST.loaded && !ST.loading) { load(); subscribe(); }
    }

    // Komunikat po powrocie z autoryzacji Meta / TikTok (?polaczono=… albo ?blad=…).
    (function oauthReturn() {
      const q = new URLSearchParams(location.search);
      const ok = q.get("polaczono"), bad = q.get("blad");
      if (!ok && !bad) return;
      setTimeout(() => CRM.toast(ok ? `Połączono: ${ok.replace(",", " + ")}` : `Nie udało się połączyć: ${bad}`), 600);
      history.replaceState(null, "", location.pathname + location.hash);
    })();

    const shopName = (id) => {
      const rec = CRM.S.shops && CRM.S.shops[id];
      return (rec && rec.name) || id;
    };

    function accountCard(a) {
      const f = a.stats && a.stats.followers != null ? `<span class="muted small">${Number(a.stats.followers).toLocaleString("pl-PL")} obserwujących</span>` : "";
      const link = a.profile_url ? `<a href="${esc(a.profile_url)}" target="_blank" rel="noopener">${esc(a.handle ? "@" + a.handle : a.display_name || "profil")}</a>` : `<span class="muted small">jeszcze nie połączone</span>`;
      return `<div class="a"><div class="sm-row"><b>${PL[a.platform]}</b>${pill(ACC_ST, a.status)}</div>${link}${f}${a.last_error ? `<span class="err small" style="color:var(--bad)">${esc(a.last_error)}</span>` : ""}</div>`;
    }

    function kit(cfg) {
      const b = cfg.brand || {}, s = cfg.strategy || {};
      if (!b.profile_name) return `<div class="sm-kit"><div class="box" style="grid-column:1/-1">Autopilot przygotuje markę i strategię przy najbliższym cyklu (co 15 min), gdy sklep ma niszę albo opublikowane strony.</div></div>`;
      const pillars = (s.pillars || []).map((p) => `• ${p.name} (${p.share_pct}%) — ${p.idea}`).join("\n");
      return `<div class="sm-kit">
        <div class="box"><h4>Profil do założenia</h4><b>${esc(b.profile_name)}</b>\nNazwy: ${esc((b.handle_ideas || []).join(", "))}\nTon: ${esc(b.tone || "")}\nPersona: ${esc(b.persona || "")}\nKolory: ${esc((b.colors || []).join(", "))}</div>
        <div class="box"><h4>Bio</h4>FB: ${esc(b.bio_facebook || "")}\n\nIG: ${esc(b.bio_instagram || "")}\n\nTikTok: ${esc(b.bio_tiktok || "")}\n\n<button class="btn sm" data-sm-copy="${esc(cfg.shop_id)}">Kopiuj zestaw do zakładania kont</button></div>
        <div class="box"><h4>Filary treści</h4>${esc(pillars)}</div>
        <div class="box"><h4>Godziny i hashtagi</h4>${esc((s.best_hours || []).map((h) => h + ":00").join(", "))}\n${esc((s.hashtags_core || []).join(" "))}\n\nCTA: ${esc(s.cta_style || "")}</div>
      </div>`;
    }

    function postCard(p) {
      const m = (p.media || [])[0];
      const visual = m ? (m.type === "video" ? `<video src="${esc(m.url)}" muted playsinline preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`)
        : `<div class="ph">${p.kind === "reel" ? "Scenariusz rolki" + ((p.script && p.script.scenes) ? ` · ${p.script.scenes.length} ujęć` : "") : "Bez grafiki"}</div>`;
      const acts = [];
      if (p.status === "do_akceptacji" || p.status === "szkic") acts.push(`<button class="btn sm primary" data-sm-post="${p.id}" data-st="zaplanowany">Zatwierdź</button>`);
      if (["do_akceptacji", "zaplanowany", "szkic", "czeka_na_wideo"].includes(p.status)) acts.push(`<button class="btn sm" data-sm-post="${p.id}" data-st="odrzucony">Odrzuć</button>`);
      if (p.status === "blad") acts.push(`<button class="btn sm" data-sm-post="${p.id}" data-st="zaplanowany" data-retry="1">Ponów</button>`);
      return `<div class="sm-post">${visual}<div class="b">
        <div class="sm-row"><b>${PL[p.platform]}</b>${pill(POST_ST, p.status)}<span class="muted small">${esc(p.kind)}</span></div>
        <div class="muted small">${when(p.published_at || p.scheduled_at)}${p.pillar ? " · " + esc(p.pillar) : ""}</div>
        ${p.hook ? `<b>${esc(p.hook)}</b>` : ""}
        <div class="cap">${esc(p.caption || "")}</div>
        <div class="muted small">${esc((p.hashtags || []).join(" "))}</div>
        ${p.error ? `<div class="err">${esc(p.error)}</div>` : ""}
        <div class="sm-row">${p.permalink ? `<a class="btn sm" href="${esc(p.permalink)}" target="_blank" rel="noopener">Zobacz</a>` : ""}${acts.join("")}</div>
      </div></div>`;
    }

    function top(title, sub, actions) {
      return `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions || ""}</div></div>`;
    }

    function vSocial() {
      ensureLoaded();
      const head = top("Social media", "Autopilot zakłada strategię, pisze i publikuje treści dla każdego sklepu. Tu widzisz efekty.",
        `<button class="btn sm" data-sm-reload>Odśwież</button>`);
      if (!ST.loaded) return head + `<div class="card pad">Wczytuję…</div>`;
      if (ST.err) return head + `<div class="card pad">Nie udało się wczytać: ${esc(ST.err)}</div>`;
      const shopIds = [...new Set([...Object.keys(CRM.S.shops || {}), ...ST.shops.map((s) => s.shop_id)])];
      if (!shopIds.length) return head + `<div class="card"><div class="empty"><b>Brak sklepów</b>Dodaj sklep w zakładce „Sklepy i boty” (nazwa + nisza). Autopilot przygotuje dla niego profile w ciągu 15 minut.</div></div>`;

      const now = Date.now();
      const filt = (p) => ST.filter === "nadchodzace" ? new Date(p.scheduled_at).getTime() >= now - 3600e3 && p.status !== "opublikowany"
        : ST.filter === "opublikowane" ? p.status === "opublikowany"
        : ST.filter === "problemy" ? ["blad", "szkic", "czeka_na_wideo", "do_akceptacji"].includes(p.status) : true;
      const tabs = [["nadchodzace", "Nadchodzące"], ["opublikowane", "Opublikowane"], ["problemy", "Wymaga uwagi"], ["wszystkie", "Wszystkie"]]
        .map(([k, l]) => `<button class="btn sm ${ST.filter === k ? "primary" : ""}" data-sm-filter="${k}">${l}</button>`).join("");

      const cards = shopIds.map((id) => {
        const cfg = ST.shops.find((s) => s.shop_id === id) || { shop_id: id, autopilot: true, posts_per_day: 1, require_approval: false };
        const accs = ["facebook", "instagram", "tiktok"].map((pl) => ST.accounts.find((a) => a.shop_id === id && a.platform === pl) || { platform: pl, status: "do_zalozenia" });
        let posts = ST.posts.filter((p) => p.shop_id === id).filter(filt);
        if (ST.filter === "opublikowane" || ST.filter === "wszystkie") posts = posts.slice().reverse();
        const logs = ST.log.filter((l) => l.shop_id === id).slice(0, 6);
        const ppd = [0, 0.5, 1, 2, 3].map((v) => `<option value="${v}" ${Number(cfg.posts_per_day) === v ? "selected" : ""}>${v === 0.5 ? "co 2 dni" : v + " / dzień"}</option>`).join("");
        return `<div class="card sm-shop">
          <div class="sm-head"><div><h2>${esc(shopName(id))}</h2><div class="muted small">${cfg.strategy_updated_at ? "Strategia z " + when(cfg.strategy_updated_at) : "Strategia w przygotowaniu"}</div></div>
            <div class="sm-row">
              <label class="sm-row small"><input type="checkbox" data-sm-cfg="${esc(id)}" data-k="autopilot" ${cfg.autopilot ? "checked" : ""}> Autopilot</label>
              <label class="sm-row small"><input type="checkbox" data-sm-cfg="${esc(id)}" data-k="require_approval" ${cfg.require_approval ? "checked" : ""}> Akceptuję posty ręcznie</label>
              <select data-sm-cfg="${esc(id)}" data-k="posts_per_day">${ppd}</select>
              <button class="btn sm" data-sm-connect="meta" data-shop="${esc(id)}">Połącz Facebook + Instagram</button>
              <button class="btn sm" data-sm-connect="tiktok" data-shop="${esc(id)}">Połącz TikTok</button>
              <button class="btn sm" data-sm-run="${esc(id)}">Odśwież strategię</button>
            </div></div>
          <div class="sm-acc">${accs.map(accountCard).join("")}</div>
          ${kit(cfg)}
          <div class="sm-tabs">${tabs}</div>
          ${posts.length ? `<div class="sm-feed">${posts.slice(0, 24).map(postCard).join("")}</div>` : `<div class="sm-log">Brak postów w tym widoku.</div>`}
          ${logs.length ? `<div class="sm-log">${logs.map((l) => `<div class="${esc(l.level)}">${when(l.created_at)} · ${esc(l.message)}</div>`).join("")}</div>` : ""}
        </div>`;
      }).join("");
      return head + cards;
    }

    function vPayments() {
      ensureLoaded();
      const head = top("Płatności", "Każda strona z ceną dostaje automatycznie link do szybkiej płatności (BLIK, Przelewy24, karta, Apple Pay, Google Pay). Limit zamówienia: 2500 zł.",
        `<button class="btn sm" data-sm-reload>Odśwież</button>`);
      if (!ST.loaded) return head + `<div class="card pad">Wczytuję…</div>`;
      const byPage = Object.fromEntries(ST.links.map((l) => [l.page_id, l]));
      const paid = ST.payments.filter((p) => p.status === "oplacone");
      const sum = paid.reduce((s, p) => s + Number(p.amount || 0), 0);
      const active = ST.links.filter((l) => l.status === "aktywny").length;
      const kpis = `<div class="grid kpis" style="margin-bottom:16px">
        <div class="card kpi"><div class="lbl">Aktywne linki</div><div class="val num">${active}</div></div>
        <div class="card kpi"><div class="lbl">Opłacone zamówienia</div><div class="val num">${paid.length}</div></div>
        <div class="card kpi"><div class="lbl">Wpłynęło</div><div class="val num">${zl(sum)}</div></div>
        <div class="card kpi"><div class="lbl">Strony bez linku</div><div class="val num">${ST.pages.filter((p) => Number(p.data && p.data.price) > 0 && !(byPage[p.id] && byPage[p.id].status === "aktywny")).length}</div></div></div>`;
      const rows = ST.pages.filter((p) => Number(p.data && p.data.price) > 0).map((p) => {
        const l = byPage[p.id] || { status: "oczekuje" };
        return `<tr><td class="strong">${esc(p.name)}<div class="small muted">/p/${esc(p.slug)}</div></td><td class="r num">${zl(Number(p.data.price))}</td><td>${pill(PAY_LINK_ST, l.status)}${l.error && l.status !== "brak_klucza" ? `<div class="small" style="color:var(--bad)">${esc(l.error)}</div>` : ""}</td>
          <td>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">Otwórz</a> · <button class="btn sm" data-sm-copylink="${esc(l.url)}">Kopiuj</button>` : "—"}</td><td class="num">${l.max_qty ? "do " + l.max_qty + " szt." : "—"}</td></tr>`;
      }).join("");
      const prow = ST.payments.map((p) => `<tr><td class="muted num">${when(p.created_at)}</td><td class="strong">${esc(p.buyer_name || p.buyer_email || "—")}<div class="small muted">${esc(p.buyer_email || "")} ${esc(p.buyer_phone || "")}</div></td><td>${p.page_slug ? "/p/" + esc(p.page_slug) : "—"}</td><td class="r num">${zl(Number(p.amount))}</td><td>${pill({ oplacone: ["Opłacone", "var(--good)"], anulowane: ["Anulowane", "var(--grey)"] }, p.status)}</td></tr>`).join("");
      return head + kpis +
        `<div class="card" style="margin-bottom:16px"><div class="tbl-wrap"><table><thead><tr><th>Strona</th><th class="r">Cena</th><th>Link</th><th></th><th>Ilość</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="muted">Brak stron z ceną.</td></tr>`}</tbody></table></div></div>` +
        `<div class="card">${ST.payments.length ? `<div class="tbl-wrap"><table><thead><tr><th>Kiedy</th><th>Kupujący</th><th>Strona</th><th class="r">Kwota</th><th>Status</th></tr></thead><tbody>${prow}</tbody></table></div>` : `<div class="empty"><b>Brak płatności</b>Opłacone zamówienia z linków trafią tutaj i do zakładki Zamówienia.</div>`}</div>`;
    }

    CRM.VIEWS.push(["social-media", "Social media", "globe"], ["platnosci", "Płatności", "key"]);
    CRM.VIEW_FNS["social-media"] = vSocial;
    CRM.VIEW_FNS.platnosci = vPayments;

    async function copy(text) {
      try { await navigator.clipboard.writeText(text); CRM.toast("Skopiowano"); } catch { CRM.toast("Nie udało się skopiować"); }
    }

    document.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-sm-reload],[data-sm-filter],[data-sm-connect],[data-sm-run],[data-sm-post],[data-sm-copy],[data-sm-copylink]");
      if (!t) return;
      if (t.hasAttribute("data-sm-reload")) { ST.loaded = false; load(); return; }
      if (t.dataset.smFilter) { ST.filter = t.dataset.smFilter; CRM.scheduleRender(); return; }
      if (t.dataset.smCopylink) { copy(t.dataset.smCopylink); return; }
      if (t.dataset.smCopy) {
        const cfg = ST.shops.find((s) => s.shop_id === t.dataset.smCopy) || {};
        const b = cfg.brand || {};
        copy(`Nazwa profilu: ${b.profile_name || ""}\nNazwy użytkownika: ${(b.handle_ideas || []).join(", ")}\n\nBio Facebook:\n${b.bio_facebook || ""}\n\nBio Instagram:\n${b.bio_instagram || ""}\n\nBio TikTok:\n${b.bio_tiktok || ""}\n\nAvatar (prompt do grafiki):\n${b.avatar_prompt || ""}`);
        return;
      }
      if (t.dataset.smConnect) {
        t.disabled = true;
        const { data, error } = await CRM.SB.functions.invoke("social-connect", { body: { shop_id: t.dataset.shop, provider: t.dataset.smConnect } });
        t.disabled = false;
        const msg = (data && data.error) || (error && (await error.context?.json?.().then((j) => j.error).catch(() => null) || error.message));
        if (msg || !data || !data.url) { CRM.toast(msg || "Nie udało się rozpocząć łączenia"); return; }
        location.href = data.url;
        return;
      }
      if (t.dataset.smRun) {
        t.disabled = true;
        CRM.toast("Autopilot pracuje — to potrwa do 2 minut");
        await CRM.SB.functions.invoke("social-autopilot", { body: { shop_id: t.dataset.smRun, refresh_strategy: true } }).catch(() => null);
        t.disabled = false;
        load();
        return;
      }
      if (t.dataset.smPost) {
        const patch = { status: t.dataset.st, updated_at: new Date().toISOString() };
        if (t.dataset.retry) Object.assign(patch, { attempts: 0, error: null, scheduled_at: new Date(Date.now() + 60e3).toISOString() });
        const { error } = await CRM.SB.from("social_posts").update(patch).eq("id", t.dataset.smPost);
        if (error) CRM.toast(error.message); else load();
      }
    });

    document.addEventListener("change", async (e) => {
      const t = e.target.closest("[data-sm-cfg]");
      if (!t) return;
      const k = t.dataset.k;
      const v = t.type === "checkbox" ? t.checked : Number(t.value);
      const { error } = await CRM.SB.from("social_shops").upsert({ shop_id: t.dataset.smCfg, [k]: v, updated_at: new Date().toISOString() }, { onConflict: "shop_id" });
      if (error) CRM.toast(error.message); else { CRM.toast("Zapisano"); load(); }
    });
  });
})();
