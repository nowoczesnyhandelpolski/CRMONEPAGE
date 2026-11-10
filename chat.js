/* Komunikator zespołu — czat na żywo między wspólnikami w zakładce Wiadomości.
   Wiadomości to rekordy col = "chat" w public.records (te same RLS i realtime co reszta CRM).
   Kto jest online i kto pisze — kanał Supabase Realtime (presence + broadcast), bez zapisu do bazy. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("chat-css")) return;
    const css = document.createElement("style");
    css.id = "chat-css";
    css.textContent = `
      .msg-tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
      .chat{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:14px;align-items:start}
      .chat-box{display:flex;flex-direction:column;height:min(70vh,760px);min-height:420px;overflow:hidden}
      .chat-list{flex:1;overflow-y:auto;padding:18px 18px 8px;display:flex;flex-direction:column;gap:4px;scroll-behavior:smooth;
        background:radial-gradient(rgba(19,41,75,.06) 1px,transparent 1.4px) 0 0/18px 18px,var(--surface)}
      .chat-day{align-self:center;margin:12px 0 6px;font:600 11px var(--display);letter-spacing:.18em;text-transform:uppercase;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);padding:4px 12px;border-radius:99px}
      .cm{display:flex;gap:8px;align-items:flex-end;max-width:78%}
      .cm.mine{align-self:flex-end;flex-direction:row-reverse}
      .cm .av{box-shadow:0 0 0 2px var(--surface)}
      .cm.cont .av{visibility:hidden}
      .cb{position:relative;padding:9px 13px 7px;border-radius:16px 16px 16px 5px;background:var(--surface-2);border:1px solid var(--line);word-wrap:break-word;overflow-wrap:anywhere;font-size:14.5px;animation:cbIn .22s ease}
      .cm.mine .cb{background:var(--navy);color:#fff;border-color:var(--navy);border-radius:16px 16px 5px 16px;box-shadow:inset 0 -3px 0 var(--red)}
      :root[data-theme="dark"] .cm.mine .cb{background:#1D3A68}
      .cb .tx{white-space:pre-wrap}
      .cb .who{display:block;font:700 12px var(--display);margin-bottom:2px;color:var(--pc,var(--accent))}
      .cb .meta{display:flex;gap:6px;justify-content:flex-end;align-items:center;font-size:11px;opacity:.65;margin-top:3px}
      .cb a{color:inherit;text-decoration:underline}
      .cb img{display:block;max-width:min(320px,100%);max-height:320px;border-radius:10px;margin:4px 0 2px;cursor:zoom-in}
      .cb .ment{font-weight:700;background:color-mix(in srgb,var(--red) 18%,transparent);border-radius:5px;padding:0 3px}
      .cm.mine .cb .ment{background:rgba(255,255,255,.18)}
      .cb.big{font-size:34px;line-height:1.1;background:none!important;border:0!important;box-shadow:none!important;padding:0 4px}
      .cb .del{border:0;background:none;color:inherit;cursor:pointer;opacity:0;padding:0 2px;font-size:12px}
      .cm:hover .del{opacity:.8}
      .cb .rx{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
      .cb .rx button{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:99px;padding:0 7px;font-size:12px;cursor:pointer}
      .cb .rx button[aria-pressed="true"]{border-color:var(--red);background:color-mix(in srgb,var(--red) 12%,var(--surface))}
      .cm .addrx{opacity:0;border:0;background:none;cursor:pointer;font-size:15px;align-self:center}
      .cm:hover .addrx{opacity:.7}
      @keyframes cbIn{from{transform:translateY(6px);opacity:0}}
      .chat-typing{min-height:22px;padding:0 18px;font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px}
      .chat-typing i{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:tyDot 1s infinite}
      .chat-typing i:nth-child(2){animation-delay:.15s}.chat-typing i:nth-child(3){animation-delay:.3s}
      @keyframes tyDot{50%{transform:translateY(-3px);opacity:.4}}
      .chat-in{border-top:1px solid var(--line);padding:10px;display:flex;gap:8px;align-items:flex-end;background:var(--surface)}
      .chat-in textarea{flex:1;resize:none;border:1px solid var(--line);background:var(--surface-2);border-radius:14px;padding:10px 12px;min-height:44px;max-height:160px;font:inherit;line-height:1.4}
      .chat-in textarea:focus{outline:2px solid color-mix(in srgb,var(--accent) 50%,transparent);border-color:var(--accent)}
      .chat-in .ib{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;display:grid;place-items:center;flex:none;font-size:18px}
      .chat-in .send{background:var(--navy);color:#fff;border-color:var(--navy);box-shadow:inset 0 -3px 0 var(--red)}
      .chat-in .send:hover{background:var(--red);border-color:var(--red)}
      .emo{display:flex;gap:2px;padding:6px 10px 0;flex-wrap:wrap;background:var(--surface)}
      .emo button{border:0;background:none;font-size:19px;cursor:pointer;border-radius:8px;padding:2px 4px}
      .emo button:hover{background:var(--surface-2)}
      .chat-side{padding:16px;display:grid;gap:12px}
      .chat-side h3{font-size:15px;margin:0}
      .pp{display:flex;align-items:center;gap:10px;font-weight:600}
      .pp .st{margin-left:auto;font-size:11px;font-weight:700;color:var(--muted)}
      .pp .on{color:var(--good)}
      .pp .avw{position:relative}
      .pp .avw::after{content:"";position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:var(--grey);border:2px solid var(--surface)}
      .pp .avw.on::after{background:var(--good)}
      .chat-tip{font-size:12px;color:var(--muted);line-height:1.5}
      .lightbox{position:fixed;inset:0;z-index:80;background:rgba(7,18,38,.85);display:grid;place-items:center;padding:20px;cursor:zoom-out}
      .lightbox img{max-width:100%;max-height:100%;border-radius:12px}
      @media(max-width:900px){.chat{grid-template-columns:1fr}.chat-side{display:none}.cm{max-width:90%}.chat-box{height:calc(100vh - 300px)}}
    `;
    document.head.appendChild(css);

    CRM.COLS.push("chat");
    CRM.S.chat = CRM.S.chat || {};
    CRM.UI.msgTab = CRM.UI.msgTab || "team";
    CRM.UI.chatDraft = "";
    const baseMessages = CRM.VIEW_FNS.wiadomosci;
    CRM.VIEW_FNS.wiadomosci = vInbox;

    const EMO = ["👍", "✅", "📦", "🔥", "💰", "🚚", "❤️", "😂", "🙏", "⚠️"];
    const RX = ["👍", "✅", "❤️", "😂", "🔥"];
    const MAX_LEN = 4000;
    const esc = (s) => CRM.esc(s ?? "");
    const lsGet = (k, f) => { try { const v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const readKey = () => `nhp-chat-read-${CRM.me}`;
    const lastRead = () => Number(lsGet(readKey(), "0")) || 0;
    const msgs = () => CRM.arr("chat").filter((m) => m && m.ts).sort((a, b) => a.ts - b.ts);
    const nameOf = (k) => (CRM.team().find((p) => p.k === k) || {}).name || "Ktoś";
    const isChatOpen = () => location.hash.slice(1) === "wiadomosci" && CRM.UI.msgTab === "team";
    const unread = () => { const t = lastRead(); return msgs().filter((m) => m.author !== CRM.me && m.ts > t).length; };

    /* ---------- obecność i „pisze…” ---------- */
    const online = new Set();
    const typing = {};
    let rt = null, lastTypingSent = 0;
    CRM.readyFns.push(async () => {
      seen = new Set(msgs().map((m) => m.id));
      if (rt || !CRM.SB.channel) return;
      try {
        rt = CRM.SB.channel("team-chat", { config: { presence: { key: CRM.me }, broadcast: { self: false } } });
        if (!rt || !rt.on) return;
        rt.on("presence", { event: "sync" }, () => {
          online.clear();
          Object.keys((rt.presenceState && rt.presenceState()) || {}).forEach((k) => online.add(k));
          if (location.hash.slice(1) === "wiadomosci") CRM.scheduleRender();
        });
        rt.on("broadcast", { event: "typing" }, (p) => {
          const k = p && p.payload && p.payload.who;
          if (!k || k === CRM.me) return;
          typing[k] = Date.now();
          paintTyping();
          setTimeout(paintTyping, 3200);
        });
        rt.subscribe((status) => { if (status === "SUBSCRIBED" && rt.track) rt.track({ who: CRM.me, at: Date.now() }); });
      } catch (e) { console.error(e); }
    });
    function paintTyping() {
      const el = document.getElementById("chatTyping");
      if (!el) return;
      const who = Object.keys(typing).filter((k) => Date.now() - typing[k] < 3000).map(nameOf);
      el.innerHTML = who.length ? `<i></i><i></i><i></i> ${esc(who.join(" i "))} ${who.length > 1 ? "piszą" : "pisze"}…` : "";
    }
    function sendTyping() {
      if (!rt || !rt.send || Date.now() - lastTypingSent < 1500) return;
      lastTypingSent = Date.now();
      try { rt.send({ type: "broadcast", event: "typing", payload: { who: CRM.me } }); } catch (e) {}
    }

    /* ---------- nowe wiadomości: dźwięk, licznik, tytuł ---------- */
    let seen = null;
    const baseTitle = document.title;
    CRM.badgeFns.push(() => {
      const list = msgs();
      if (seen) {
        const fresh = list.filter((m) => !seen.has(m.id));
        fresh.forEach((m) => seen.add(m.id));
        const fromOthers = fresh.filter((m) => m.author !== CRM.me);
        if (fromOthers.length) {
          if (window.NHP_BRAND) window.NHP_BRAND.sound("pop");
          if (!isChatOpen() || document.hidden) {
            const m = fromOthers[fromOthers.length - 1];
            setTimeout(() => CRM.toast(`💬 ${nameOf(m.author)}: ${String(m.text || "📷 zdjęcie").slice(0, 70)}`), 0);
          }
        }
      }
      if (isChatOpen() && !document.hidden && list.length) lsSet(readKey(), String(Math.max(lastRead(), list[list.length - 1].ts)));
      const u = unread();
      document.title = u ? `(${u}) ${baseTitle}` : baseTitle;
      const customers = CRM.arr("messages").filter((m) => (m.status || "nowe") === "nowe").length;
      return { wiadomosci: customers + u };
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && isChatOpen()) CRM.scheduleRender(); });

    /* ---------- widok ---------- */
    function vInbox() {
      const u = unread();
      const cust = CRM.arr("messages").filter((m) => (m.status || "nowe") === "nowe").length;
      const tabs = `<div class="msg-tabs chips">
        <button class="chip" data-chat="tab" data-tab="team" aria-pressed="${CRM.UI.msgTab === "team"}">💬 Czat zespołu${u ? ` · ${u}` : ""}</button>
        <button class="chip" data-chat="tab" data-tab="clients" aria-pressed="${CRM.UI.msgTab === "clients"}">✉️ Od klientów${cust ? ` · ${cust}` : ""}</button></div>`;
      if (CRM.UI.msgTab === "clients") {
        const html = baseMessages();
        const out = html.replace(/(<div class="top">[\s\S]*?<\/div><div class="row">[\s\S]*?<\/div><\/div>)/, `$1${tabs}`);
        return out === html ? tabs + html : out;
      }
      return top() + tabs + chatView();
    }
    function top() {
      return `<div class="top"><div><h1>Wiadomości</h1><p>Czat wspólników na żywo i pytania klientów z Waszych stron.</p></div><div class="row"></div></div>`;
    }

    function linkify(t) {
      let h = esc(t);
      h = h.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
      CRM.team().forEach((p) => { h = h.replace(new RegExp(`@${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), `<span class="ment">@${esc(p.name)}</span>`); });
      h = h.replace(/(^|\s)#(\d{1,8})\b/g, `$1<a href="#zamowienia" data-chat="order" data-n="$2">#$2</a>`);
      return h;
    }
    const onlyEmoji = (t) => /^\s*(\p{Extended_Pictographic}|‍|️|\s){1,8}$/u.test(t) && t.trim().length <= 16;

    function chatView() {
      const list = msgs();
      const day = (ts) => new Date(ts).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
      const todayStr = day(Date.now()), yStr = day(Date.now() - 864e5);
      let lastDay = "", prev = null;
      const rows = list.map((m) => {
        const d = day(m.ts);
        let sep = "";
        if (d !== lastDay) { sep = `<div class="chat-day">${d === todayStr ? "Dziś" : d === yStr ? "Wczoraj" : esc(d)}</div>`; lastDay = d; prev = null; }
        const mine = m.author === CRM.me;
        const cont = prev && prev.author === m.author && m.ts - prev.ts < 5 * 60e3;
        prev = m;
        const time = new Date(m.ts).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        const rx = m.rx || {};
        const rxHtml = Object.keys(rx).filter((e) => (rx[e] || []).length).map((e) => `<button type="button" data-chat="rx" data-id="${esc(m.id)}" data-e="${esc(e)}" aria-pressed="${(rx[e] || []).includes(CRM.me)}" title="${esc(rx[e].map(nameOf).join(", "))}">${esc(e)} ${rx[e].length}</button>`).join("");
        const big = !m.img && onlyEmoji(m.text || "");
        return sep + `<div class="cm ${mine ? "mine" : ""} ${cont ? "cont" : ""}">${CRM.avatar(m.author, 30)}
          <div class="cb ${big ? "big" : ""}" style="--pc:var(--${esc(m.author)})">${!mine && !cont ? `<span class="who">${esc(nameOf(m.author))}</span>` : ""}${m.img ? `<img src="${esc(m.img)}" alt="Zdjęcie od ${esc(nameOf(m.author))}" data-chat="zoom">` : ""}${m.text ? `<span class="tx">${linkify(m.text)}</span>` : ""}
          ${rxHtml ? `<div class="rx">${rxHtml}</div>` : ""}
          <div class="meta">${mine ? `<button class="del" type="button" data-chat="del" data-id="${esc(m.id)}" title="Usuń">🗑</button>` : ""}${time}</div></div>
          <button class="addrx" type="button" data-chat="rxpick" data-id="${esc(m.id)}" title="Reakcja">🙂</button></div>`;
      }).join("");

      const people = CRM.team().map((p) => {
        const on = p.k === CRM.me || online.has(p.k);
        return `<div class="pp"><span class="avw ${on ? "on" : ""}">${CRM.avatar(p.k, 32)}</span>${esc(p.name)}${p.k === CRM.me ? ' <span class="muted small">(Ty)</span>' : ""}<span class="st ${on ? "on" : ""}">${on ? "online" : "offline"}</span></div>`;
      }).join("");

      return `<div class="chat">
        <section class="card chat-box">
          <div class="chat-list" id="chatList">${rows || `<div class="empty"><b>Zacznijcie rozmowę</b>Napiszcie pierwszą wiadomość — zobaczą ją wszyscy wspólnicy, na żywo.</div>`}</div>
          <div class="chat-typing" id="chatTyping"></div>
          <div class="emo">${EMO.map((e) => `<button type="button" data-chat="emo" data-e="${e}">${e}</button>`).join("")}</div>
          <form class="chat-in" id="chatForm">
            <label class="ib" title="Wyślij zdjęcie">📷<input type="file" accept="image/*" id="chatFile" hidden></label>
            <textarea id="chatText" rows="1" maxlength="${MAX_LEN}" placeholder="Napisz do zespołu… (Enter wysyła, Shift+Enter nowa linia, @imię oznacza)">${esc(CRM.UI.chatDraft)}</textarea>
            <button class="ib send" type="submit" title="Wyślij">➤</button>
          </form>
        </section>
        <aside class="card chat-side"><h3>Zespół</h3>${people}
          <div class="chat-tip">Wpisz <b>#123</b>, żeby podlinkować zamówienie, <b>@${esc(CRM.team()[1]?.name || "imię")}</b>, żeby kogoś oznaczyć. Zdjęcie możesz też wkleić ze schowka (Ctrl+V).</div></aside>
      </div>`;
    }

    /* po każdym renderze: przewiń na dół i przywróć fokus */
    let wasAtBottom = true, hadFocus = false, lastCount = -1, autoUntil = 0;
    const mainEl = () => document.getElementById("main");
    document.addEventListener("scroll", (e) => {
      if (e.target && e.target.id === "chatList" && Date.now() > autoUntil) { const l = e.target; wasAtBottom = l.scrollHeight - l.scrollTop - l.clientHeight < 80; }
    }, true);
    const obsMain = () => { const m = mainEl(); if (m) new MutationObserver(() => document.body.dispatchEvent(new Event("chat-rendered"))).observe(m, { childList: true }); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", obsMain); else obsMain();
    document.body.addEventListener("chat-rendered", () => {
      const l = document.getElementById("chatList");
      if (!l) { lastCount = -1; return; }
      const n = l.querySelectorAll(".cm").length;
      if (lastCount === -1) wasAtBottom = true;
      if (wasAtBottom) autoUntil = Date.now() + 1200;
      const stick = () => { if (wasAtBottom && l.isConnected) { l.style.scrollBehavior = "auto"; l.scrollTop = l.scrollHeight; l.style.scrollBehavior = ""; } };
      stick(); requestAnimationFrame(stick); setTimeout(stick, 250); setTimeout(stick, 900);
      lastCount = n;
      l.querySelectorAll("img").forEach((im) => { if (!im.complete) im.addEventListener("load", stick, { once: true }); });
      const t = document.getElementById("chatText");
      if (t) { autoGrow(t); if (hadFocus) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
      paintTyping();
    });
    function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.min(160, t.scrollHeight + 2) + "px"; }
    document.addEventListener("focusin", (e) => { if (e.target.id === "chatText") hadFocus = true; });
    document.addEventListener("focusout", (e) => { if (e.target.id === "chatText") setTimeout(() => { hadFocus = document.activeElement && document.activeElement.id === "chatText"; }, 0); });

    /* ---------- wysyłanie ---------- */
    async function send(text, img) {
      text = String(text || "").trim().slice(0, MAX_LEN);
      if (!text && !img) return;
      const id = CRM.uid("c");
      const data = { author: CRM.me, text, ts: Date.now(), email: CRM.sessionEmail || "" };
      if (img) data.img = img;
      wasAtBottom = true;
      const ok = await CRM.put("chat", id, data);
      if (ok && seen) seen.add(id);
      return ok;
    }
    async function submit() {
      const t = document.getElementById("chatText");
      const text = t ? t.value : CRM.UI.chatDraft;
      if (!String(text).trim()) return;
      CRM.UI.chatDraft = "";
      if (t) { t.value = ""; autoGrow(t); }
      hadFocus = true;
      if (!(await send(text))) { CRM.UI.chatDraft = text; CRM.scheduleRender(); }
    }

    function compress(file) {
      return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type)) return reject(new Error("To nie jest obraz."));
        const r = new FileReader();
        r.onload = () => {
          const im = new Image();
          im.onload = () => {
            const max = 1100, k = Math.min(1, max / Math.max(im.width, im.height));
            const c = document.createElement("canvas");
            c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
            c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
            let q = .8, out = c.toDataURL("image/jpeg", q);
            while (out.length > 350000 && q > .4) { q -= .1; out = c.toDataURL("image/jpeg", q); }
            resolve(out);
          };
          im.onerror = () => reject(new Error("Nie udało się odczytać obrazu."));
          im.src = r.result;
        };
        r.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
        r.readAsDataURL(file);
      });
    }
    async function sendImage(file) {
      try {
        CRM.toast("Wysyłam zdjęcie…");
        const img = await compress(file);
        const t = document.getElementById("chatText");
        const caption = t ? t.value : "";
        if (await send(caption, img)) { CRM.UI.chatDraft = ""; if (t) t.value = ""; }
      } catch (e) { CRM.toast(e.message || "Nie udało się wysłać zdjęcia."); }
    }

    async function toggleRx(id, e) {
      const m = CRM.byId("chat", id);
      if (!m) return;
      const rx = { ...(m.rx || {}) };
      const list = new Set(rx[e] || []);
      list.has(CRM.me) ? list.delete(CRM.me) : list.add(CRM.me);
      rx[e] = [...list];
      if (!rx[e].length) delete rx[e];
      const { id: _x, ...rest } = m;
      await CRM.put("chat", id, { ...rest, rx });
    }

    /* ---------- zdarzenia ---------- */
    document.addEventListener("input", (e) => {
      if (e.target.id !== "chatText") return;
      CRM.UI.chatDraft = e.target.value;
      autoGrow(e.target);
      sendTyping();
    });
    document.addEventListener("keydown", (e) => {
      if (e.target.id !== "chatText") return;
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    document.addEventListener("submit", (e) => {
      if (e.target.id !== "chatForm") return;
      e.preventDefault(); e.stopImmediatePropagation(); submit();
    }, true);
    document.addEventListener("change", (e) => {
      if (e.target.id === "chatFile" && e.target.files && e.target.files[0]) { sendImage(e.target.files[0]); e.target.value = ""; }
    });
    document.addEventListener("paste", (e) => {
      if (e.target.id !== "chatText" || !e.clipboardData) return;
      const f = [...e.clipboardData.files].find((x) => /^image\//.test(x.type));
      if (f) { e.preventDefault(); sendImage(f); }
    });
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-chat]");
      if (!t) return;
      const a = t.dataset.chat;
      if (a === "tab") { CRM.UI.msgTab = t.dataset.tab; CRM.scheduleRender(); }
      else if (a === "emo") {
        const ta = document.getElementById("chatText");
        if (!ta) return;
        const s = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + t.dataset.e + ta.value.slice(ta.selectionEnd ?? s);
        CRM.UI.chatDraft = ta.value; ta.focus(); ta.setSelectionRange(s + t.dataset.e.length, s + t.dataset.e.length);
      }
      else if (a === "del") {
        const m = CRM.byId("chat", t.dataset.id);
        if (m && m.author === CRM.me && confirm("Usunąć tę wiadomość u wszystkich?")) CRM.del("chat", t.dataset.id);
      }
      else if (a === "rx") toggleRx(t.dataset.id, t.dataset.e);
      else if (a === "rxpick") {
        const old = document.getElementById("rxPick"); if (old) old.remove();
        const p = document.createElement("div");
        p.id = "rxPick"; p.className = "card";
        const r = t.getBoundingClientRect();
        p.style.cssText = `position:fixed;z-index:50;left:${Math.max(8, Math.min(innerWidth - 220, r.left - 90))}px;top:${Math.max(8, r.top - 50)}px;padding:6px;display:flex;gap:2px`;
        p.innerHTML = RX.map((x) => `<button type="button" data-chat="rxset" data-id="${esc(t.dataset.id)}" data-e="${x}" style="border:0;background:none;font-size:22px;cursor:pointer">${x}</button>`).join("");
        document.body.appendChild(p);
        setTimeout(() => document.addEventListener("click", () => p.remove(), { once: true }), 0);
      }
      else if (a === "rxset") { toggleRx(t.dataset.id, t.dataset.e); const p = document.getElementById("rxPick"); if (p) p.remove(); }
      else if (a === "zoom") {
        const lb = document.createElement("div");
        lb.className = "lightbox"; lb.innerHTML = `<img src="${esc(t.getAttribute("src"))}" alt="">`;
        lb.addEventListener("click", () => lb.remove());
        document.body.appendChild(lb);
      }
      else if (a === "order") {
        const q = t.dataset.n;
        if (CRM.UI.q) CRM.UI.q.orders = q;
      }
    });
  });
})();
