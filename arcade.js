/* =====================================================================
   SALON GIER NHP — dwie gierki dla beki w mega banerze
   🐍 Wąż Dostawca  ·  🚐 Łap Paczki
   Ranking wspólników trafia do CRM (records, col = "arcade").
   Nic nie psuje: jeśli coś nie zadziała, gry działają lokalnie.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__NHP_ARCADE__) return;
  window.__NHP_ARCADE__ = true;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------- dźwięki 8-bit ---------- */
  let actx = null;
  const soundOn = () => { const b = document.querySelector(".snd-btn"); return !b || b.getAttribute("aria-pressed") !== "false"; };
  function beep(f, d, type, v, slide) {
    if (!soundOn()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(v || .05, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + .02);
    } catch (e) {}
  }
  const sfx = {
    eat: () => beep(660, .08, "square", .05, 990),
    gold: () => { beep(880, .08); setTimeout(() => beep(1320, .12), 70); setTimeout(() => beep(1760, .16), 150); },
    bad: () => beep(220, .35, "sawtooth", .07, 60),
    over: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, .22, "triangle", .07), i * 170)); },
    start: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, .1, "square", .05), i * 90)); }
  };

  /* ---------- wspólny ranking w CRM (best effort) ---------- */
  let sb = null;
  function client() {
    if (sb) return sb;
    try {
      const cfg = window.CRM_CONFIG;
      if (!window.supabase || !cfg || !cfg.url || !cfg.key) return null;
      sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
      return sb;
    } catch (e) { return null; }
  }
  async function whoAmI() {
    const c = client(); if (!c) return null;
    try { const { data } = await c.auth.getSession(); const em = data && data.session && data.session.user && data.session.user.email; return em || null; } catch (e) { return null; }
  }
  async function saveScore(game, score) {
    const c = client(); const email = await whoAmI();
    if (!c || !email) return;
    const id = `${game}:${email.toLowerCase()}`;
    try {
      const { data } = await c.from("records").select("data").eq("col", "arcade").eq("id", id).maybeSingle();
      const best = data && data.data && Number(data.data.score) || 0;
      if (score <= best) return;
      await c.from("records").upsert({ col: "arcade", id, data: { game, email, score, ts: Date.now() }, updated_at: new Date().toISOString() });
    } catch (e) {}
  }
  async function topScores(game) {
    const c = client(); if (!c) return [];
    try {
      const { data } = await c.from("records").select("id,data").eq("col", "arcade");
      return (data || []).map(r => r.data || {}).filter(d => d.game === game).sort((a, b) => b.score - a.score).slice(0, 5);
    } catch (e) { return []; }
  }
  function nick(email) {
    const e = String(email || "").toLowerCase();
    if (e.startsWith("kamil")) return "Kamil";
    if (e.startsWith("michal")) return "Michał";
    if (e.startsWith("agata")) return "Agata";
    return e.split("@")[0] || "Ktoś";
  }

  /* ---------- style ---------- */
  const css = `
  #arc{position:fixed;inset:0;z-index:80;display:none;place-items:center;background:rgba(6,14,30,.78);backdrop-filter:blur(3px);padding:12px}
  #arc.open{display:grid}
  #arc .ab{width:min(560px,100%);background:linear-gradient(180deg,#13294B,#0B1B35);color:#fff;border-radius:20px;border:4px solid #fff;
    box-shadow:0 0 0 6px #C8102E,0 30px 80px rgba(0,0,0,.6);overflow:hidden;font-family:Poppins,system-ui,sans-serif}
  #arc .ah{display:flex;align-items:center;gap:8px;padding:12px 14px;background:repeating-linear-gradient(-45deg,#C8102E 0 16px,#a40c25 16px 32px)}
  #arc .ah b{font-size:18px;font-weight:900;letter-spacing:.02em;text-shadow:0 2px 0 rgba(0,0,0,.3);margin-right:auto}
  #arc .ah button{font:800 13px Poppins,system-ui,sans-serif;border:2px solid #fff;background:rgba(0,0,0,.25);color:#fff;border-radius:999px;padding:6px 12px;cursor:pointer}
  #arc .ah button[aria-pressed="true"]{background:#fff;color:#C8102E}
  #arc .ah .ax{padding:6px 10px}
  #arc .hud{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;font-weight:800;font-size:14px;background:rgba(255,255,255,.06)}
  #arc .cw{position:relative;padding:10px 14px 4px}
  #arc canvas{display:block;width:100%;height:auto;border-radius:12px;background:#081429;touch-action:none;image-rendering:pixelated}
  #arc .ov{position:absolute;inset:10px 14px 4px;display:grid;place-items:center;text-align:center;border-radius:12px;background:rgba(6,14,30,.72);padding:18px}
  #arc .ov[hidden]{display:none}
  #arc .ov h3{margin:0 0 6px;font-size:26px;font-weight:900;line-height:1.1}
  #arc .ov p{margin:4px 0;opacity:.92}
  #arc .ov .big{font:900 15px Poppins,system-ui,sans-serif;margin-top:12px;border:0;border-radius:999px;padding:12px 22px;background:#C8102E;color:#fff;cursor:pointer;
    box-shadow:0 6px 0 #7d0a1c;animation:arcPulse 1s ease-in-out infinite}
  #arc .ov .big:active{transform:translateY(3px);box-shadow:0 3px 0 #7d0a1c}
  #arc .rank{margin:10px auto 0;font-size:13px;text-align:left;min-width:220px}
  #arc .rank li{margin:2px 0}
  #arc .pad{display:none;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,44px);gap:6px;justify-content:center;padding:6px 0 12px}
  #arc .pad button{font-size:20px;border:2px solid #fff;background:rgba(255,255,255,.1);color:#fff;border-radius:12px;cursor:pointer}
  #arc .pad .u{grid-column:2}
  #arc .tip{padding:4px 14px 12px;font-size:12px;opacity:.75;text-align:center}
  #arc .pop{position:absolute;pointer-events:none;font-weight:900;font-size:18px;color:#ffd34d;text-shadow:0 2px 0 #000;animation:arcPop .9s ease-out forwards;white-space:nowrap}
  @keyframes arcPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
  @keyframes arcPop{from{opacity:1;transform:translate(-50%,0) scale(.8)}to{opacity:0;transform:translate(-50%,-50px) scale(1.25)}}
  @media (hover:none),(max-width:700px){#arc .pad{display:grid}}
  @media (prefers-reduced-motion:reduce){#arc *{animation:none!important}}
  `;

  /* ---------- okno salonu gier ---------- */
  let root, cv, ctx, hud, ov, game = null, mode = store.get("nhp_arc_mode", "snake");
  const SIZE = 480;

  function build() {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    root = document.createElement("div");
    root.id = "arc";
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Salon gier NHP");
    root.innerHTML = `<div class="ab">
      <div class="ah"><b>🕹️ SALON GIER NHP</b>
        <button type="button" data-g="snake">🐍 Wąż Dostawca</button>
        <button type="button" data-g="catch">🚐 Łap Paczki</button>
        <button type="button" data-g="mario">🍄 Super Kurier</button>
        <button type="button" class="ax" data-g="close" aria-label="Zamknij">✕</button></div>
      <div class="hud"><span class="h1"></span><span class="h2"></span><span class="h3"></span></div>
      <div class="cw"><canvas width="${SIZE}" height="${SIZE}"></canvas><div class="ov"></div></div>
      <div class="pad"><button class="u" data-k="up">⬆️</button><button data-k="left">⬅️</button><button data-k="down">⬇️</button><button data-k="right">➡️</button></div>
      <div class="tip">Strzałki / WASD · na telefonie przesuwaj palcem · P = pauza (w Kurierze Spacja = skok) · Esc = zamknij</div>
    </div>`;
    document.body.appendChild(root);
    cv = root.querySelector("canvas"); ctx = cv.getContext("2d");
    hud = root.querySelector(".hud"); ov = root.querySelector(".ov");

    root.addEventListener("click", e => {
      const b = e.target.closest("[data-g]");
      if (e.target === root) close();
      if (!b) return;
      const g = b.dataset.g;
      if (g === "close") close(); else { mode = g; store.set("nhp_arc_mode", g); intro(); }
    });
    root.querySelectorAll(".pad [data-k]").forEach(b => {
      b.addEventListener("pointerdown", e => { e.preventDefault(); game && game.key(b.dataset.k); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, () => { game && game.release && game.release(b.dataset.k); }));
    });
    document.addEventListener("keyup", e => {
      if (!root.classList.contains("open") || !game || !game.release) return;
      const m = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right", " ": "up" };
      if (m[e.key]) game.release(m[e.key]);
    }, true);
    document.addEventListener("keydown", onKey, true);
    // przeciąganie palcem / myszą
    let sx = 0, sy = 0, down = false;
    cv.addEventListener("pointerdown", e => { down = true; sx = e.clientX; sy = e.clientY; game && game.pointer && game.pointer(e); });
    cv.addEventListener("pointermove", e => { game && game.pointer && game.pointer(e); if (!down || !game || game.pointer) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) { game.key(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")); sx = e.clientX; sy = e.clientY; } });
    window.addEventListener("pointerup", () => { down = false; });
  }

  function onKey(e) {
    if (!root || !root.classList.contains("open")) return;
    const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
    if (e.key === "Escape") { close(); e.preventDefault(); return; }
    if (e.key === " " && game && game.alive && game.spaceJumps) { e.preventDefault(); if (!e.repeat) game.key("up"); return; }
    if (e.key === " " || e.key === "Enter" || e.key === "p" || e.key === "P") { e.preventDefault(); if (game && game.alive) game.paused = !game.paused; else start(); return; }
    if (map[e.key]) { e.preventDefault(); game && game.key(map[e.key]); }
  }

  function open() { if (!root) build(); root.classList.add("open"); intro(); }
  function close() { if (!root) return; root.classList.remove("open"); if (game) game.stop(); game = null; }

  function setTabs() { root.querySelectorAll(".ah [data-g]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.g === mode))); }
  function setHud(a, b, c) { hud.querySelector(".h1").textContent = a; hud.querySelector(".h2").textContent = b; hud.querySelector(".h3").textContent = c; }
  function pop(text, x, y) {
    const r = cv.getBoundingClientRect(), wr = root.querySelector(".cw").getBoundingClientRect();
    const p = document.createElement("div"); p.className = "pop"; p.textContent = text;
    p.style.left = (r.left - wr.left + x / SIZE * r.width) + "px"; p.style.top = (r.top - wr.top + y / SIZE * r.height) + "px";
    root.querySelector(".cw").appendChild(p); setTimeout(() => p.remove(), 900);
  }

  function intro() {
    if (game) { game.stop(); game = null; }
    setTabs();
    const best = store.get("nhp_arc_best_" + mode, "0");
    drawBackdrop();
    if (mode === "snake") {
      setHud("🐍 Wąż Dostawca", "", `Rekord: ${best}`);
      ov.innerHTML = `<div><h3>🐍 WĄŻ DOSTAWCA</h3><p>Jesteś najdłuższym łańcuchem dostaw w Polsce.</p><p>📦 paczka +10 · 💰 przelew +50 (znika szybko!)</p><p>🧾 reklamacje i ściany = koniec kariery</p><button class="big" type="button">START (Spacja)</button></div>`;
    } else if (mode === "mario") {
      setHud("🍄 Super Kurier", "", `Rekord: ${best}`);
      ov.innerHTML = `<div><h3>🍄 SUPER KURIER</h3><p>Furgonetka NHP skacze po platformach jak hydraulik na sterydach.</p><p>📦 +1 · 🇵🇱 flaga +20 · skok na 🧾 reklamację = +5</p><p>Uderzenie z boku albo dziura = minus ❤️</p><p>⬅️➡️ jazda · ⬆️ / Spacja skok · P pauza</p><button class="big" type="button">START (Enter)</button></div>`;
    } else {
      setHud("🚐 Łap Paczki", "", `Rekord: ${best}`);
      ov.innerHTML = `<div><h3>🚐 ŁAP PACZKI</h3><p>Furgonetka NHP łapie wszystko, co spada z nieba.</p><p>📦 +1 · 🇵🇱 +3 · 💰 +5 · ⭐ zwolnione tempo</p><p>💣 zwrot i 🧾 kontrola skarbowa zabierają ❤️</p><button class="big" type="button">START (Spacja)</button></div>`;
    }
    ov.hidden = false;
    ov.querySelector(".big").addEventListener("click", start);
  }

  function drawBackdrop() {
    ctx.fillStyle = "#081429"; ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * .5})`; ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 2, 2); }
  }

  function start() {
    ov.hidden = true; sfx.start();
    if (game) game.stop();
    game = mode === "snake" ? snake() : mode === "mario" ? mario() : catcher();
  }

  async function gameOver(score, msg) {
    sfx.over();
    const key = "nhp_arc_best_" + mode, best = Math.max(score, parseInt(store.get(key, "0"), 10) || 0);
    const record = score > 0 && score >= best;
    store.set(key, String(best));
    ov.innerHTML = `<div><h3>${record ? "🏆 NOWY REKORD!" : "💥 KONIEC"}</h3><p>${esc(msg)}</p><p style="font-size:22px;font-weight:900">Wynik: ${score}</p>
      <ol class="rank"><li>Ranking wspólników: ładuję…</li></ol><button class="big" type="button">JESZCZE RAZ (Spacja)</button></div>`;
    ov.hidden = false;
    ov.querySelector(".big").addEventListener("click", start);
    setHud({ snake: "🐍 Wąż Dostawca", catch: "🚐 Łap Paczki", mario: "🍄 Super Kurier" }[mode], "", `Rekord: ${best}`);
    await saveScore(mode, score);
    const top = await topScores(mode);
    const ol = ov.querySelector(".rank");
    if (!ol) return;
    ol.innerHTML = top.length ? top.map((t, i) => `<li>${["🥇", "🥈", "🥉", "4.", "5."][i]} ${esc(nick(t.email))}: <b>${Number(t.score) || 0}</b></li>`).join("") : `<li>Ranking pojawi się po zalogowaniu do panelu.</li>`;
  }

  /* ================= 🐍 WĄŻ DOSTAWCA ================= */
  function snake() {
    const N = 20, C = SIZE / N;
    let body = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }], dir = { x: 1, y: 0 }, next = dir;
    let food = null, gold = null, goldUntil = 0, bad = [], score = 0, eaten = 0, step = 150, acc = 0, last = performance.now(), raf = 0;
    const g = { alive: true, paused: false };
    const free = () => { let p; do { p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; } while (body.some(s => s.x === p.x && s.y === p.y) || bad.some(b => b.x === p.x && b.y === p.y) || (food && food.x === p.x && food.y === p.y)); return p; };
    food = free();
    const CHEERS = ["COMBO!", "Kamil zatwierdza!", "Marża 400%!", "Michał w szoku!", "Agata klaszcze!", "Paczka dowieziona!", "Hurtownia płacze!"];
    const DEATHS = { wall: ["Kurier wjechał w ścianę sortowni.", "Paczka wypadła za płot.", "GPS kazał skręcić w ścianę."], self: ["Wąż zaplątał się we własny łańcuch dostaw.", "Ugryzłeś własną paczkę. Zwrot!"], bad: ["Reklamacja cię dopadła. 14 dni na odpowiedź!", "Klient napisał opinię na 1 gwiazdkę."] };
    g.key = k => {
      const m = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[k];
      if (!m) return;
      if (m.x === -dir.x && m.y === -dir.y) return;
      next = m;
    };
    g.stop = () => { g.alive = false; cancelAnimationFrame(raf); };
    function die(kind) { g.alive = false; sfx.bad(); draw(); setTimeout(() => gameOver(score, pick(DEATHS[kind])), 350); }
    function tick() {
      dir = next;
      const h = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N) return die("wall");
      if (body.some(s => s.x === h.x && s.y === h.y)) return die("self");
      if (bad.some(b => b.x === h.x && b.y === h.y)) return die("bad");
      body.unshift(h);
      if (h.x === food.x && h.y === food.y) {
        score += 10; eaten++; sfx.eat(); food = free(); step = Math.max(60, step - 4);
        if (eaten % 4 === 0) pop(pick(CHEERS), h.x * C + C / 2, h.y * C);
        if (eaten % 5 === 0) bad.push(free());
        if (!gold && Math.random() < .3) { gold = free(); goldUntil = performance.now() + 4500; }
      } else if (gold && h.x === gold.x && h.y === gold.y) {
        score += 50; sfx.gold(); pop("+50 💰 PRZELEW!", h.x * C + C / 2, h.y * C); gold = null;
      } else body.pop();
      if (gold && performance.now() > goldUntil) gold = null;
    }
    function emoji(e, x, y, s) { ctx.font = `${s || C * .8}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x * C + C / 2, y * C + C / 2 + 1); }
    function draw() {
      ctx.fillStyle = "#081429"; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = "rgba(255,255,255,.05)"; for (let i = 1; i < N; i++) { ctx.beginPath(); ctx.moveTo(i * C, 0); ctx.lineTo(i * C, SIZE); ctx.moveTo(0, i * C); ctx.lineTo(SIZE, i * C); ctx.stroke(); }
      bad.forEach(b => emoji("🧾", b.x, b.y));
      emoji("📦", food.x, food.y);
      if (gold) { const blink = (goldUntil - performance.now()) < 1500 && Math.floor(performance.now() / 120) % 2; if (!blink) emoji("💰", gold.x, gold.y, C * .95); }
      body.forEach((s, i) => {
        if (i === 0) return;
        ctx.fillStyle = i % 2 ? "#ffffff" : "#C8102E";
        ctx.fillRect(s.x * C + 2, s.y * C + 2, C - 4, C - 4);
      });
      const h = body[0];
      ctx.save(); ctx.translate(h.x * C + C / 2, h.y * C + C / 2);
      if (dir.x === -1) ctx.scale(-1, 1);
      ctx.rotate(dir.y === 1 ? Math.PI / 2 : dir.y === -1 ? -Math.PI / 2 : 0);
      ctx.font = `${C * .95}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🚐", 0, 1);
      ctx.restore();
      if (g.paused) { ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, 0, SIZE, SIZE); ctx.fillStyle = "#fff"; ctx.font = "900 34px Poppins,sans-serif"; ctx.textAlign = "center"; ctx.fillText("PAUZA NA KAWĘ ☕", SIZE / 2, SIZE / 2); }
      setHud(`📦 ${eaten}`, `Wynik: ${score}`, `Długość: ${body.length}`);
    }
    function loop(now) {
      if (!g.alive) return;
      const dt = now - last; last = now;
      if (!g.paused) { acc += dt; while (acc >= step && g.alive) { acc -= step; tick(); } }
      if (g.alive) draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return g;
  }

  /* ================= 🚐 ŁAP PACZKI ================= */
  function catcher() {
    const ITEMS = [
      { e: "📦", p: 1, w: 50 }, { e: "🇵🇱", p: 3, w: 14 }, { e: "💰", p: 5, w: 8 }, { e: "⭐", p: 0, slow: true, w: 4 },
      { e: "💣", p: 0, hurt: "Zwrot towaru!", w: 12 }, { e: "🧾", p: 0, hurt: "Kontrola skarbowa!", w: 9 }
    ];
    const wsum = ITEMS.reduce((s, i) => s + i.w, 0);
    const drawItem = () => { let r = Math.random() * wsum; for (const it of ITEMS) { r -= it.w; if (r <= 0) return it; } return ITEMS[0]; };
    let vanX = SIZE / 2, vx = 0, keys = { left: false, right: false }, score = 0, lives = 3, items = [], spawn = 0, speed = 2.2, slowUntil = 0, last = performance.now(), raf = 0, t = 0, shake = 0;
    const g = { alive: true, paused: false };
    const QUIPS = ["Jak z płatka!", "Logistyka level PRO", "Kurier roku!", "Złapane w locie!", "Hurtownia nie nadąża!"];
    g.key = k => { if (k === "left") { vx = -9; keys.left = true; setTimeout(() => keys.left = false, 120); } if (k === "right") { vx = 9; keys.right = true; setTimeout(() => keys.right = false, 120); } };
    g.pointer = e => { const r = cv.getBoundingClientRect(); if (e.buttons || e.pointerType === "mouse") vanX = Math.max(40, Math.min(SIZE - 40, (e.clientX - r.left) / r.width * SIZE)); };
    g.stop = () => { g.alive = false; cancelAnimationFrame(raf); document.removeEventListener("keyup", up); };
    const up = e => { if (["ArrowLeft", "a", "A"].includes(e.key) || ["ArrowRight", "d", "D"].includes(e.key)) vx *= .3; };
    document.addEventListener("keyup", up);
    function em(e, x, y, s) { ctx.font = `${s}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x, y); }
    function loop(now) {
      if (!g.alive) return;
      const dt = Math.min(40, now - last); last = now;
      if (!g.paused) {
        t += dt;
        const slow = now < slowUntil ? .45 : 1;
        vanX = Math.max(40, Math.min(SIZE - 40, vanX + vx)); vx *= .86;
        spawn -= dt;
        if (spawn <= 0) { const it = drawItem(); items.push({ it, x: rnd(30, SIZE - 30), y: -20, v: speed * rnd(.8, 1.3), r: rnd(-.05, .05), a: 0 }); spawn = Math.max(260, 900 - score * 6); }
        speed = 2.2 + score / 40;
        for (let i = items.length - 1; i >= 0; i--) {
          const o = items[i]; o.y += o.v * slow * dt / 16; o.a += o.r;
          if (o.y > SIZE - 70 && o.y < SIZE - 20 && Math.abs(o.x - vanX) < 46) {
            items.splice(i, 1);
            if (o.it.hurt) { lives--; shake = 14; sfx.bad(); pop(`💥 ${o.it.hurt}`, vanX, SIZE - 110); if (lives <= 0) { g.alive = false; draw(); setTimeout(() => gameOver(score, pick(["Furgonetka zakopana w zwrotach.", "Urząd skarbowy wjechał z buta.", "Kierowca poszedł na L4."])), 350); return; } }
            else if (o.it.slow) { slowUntil = now + 4000; sfx.gold(); pop("⭐ SLOW-MO!", vanX, SIZE - 110); }
            else { score += o.it.p; o.it.p >= 3 ? sfx.gold() : sfx.eat(); if (o.it.p >= 3 || score % 10 === 0) pop(`+${o.it.p} ${pick(QUIPS)}`, vanX, SIZE - 110); }
            continue;
          }
          if (o.y > SIZE + 30) items.splice(i, 1);
        }
      }
      draw();
      raf = requestAnimationFrame(loop);
    }
    function draw() {
      ctx.save();
      if (shake > 0) { ctx.translate(rnd(-shake, shake) / 2, rnd(-shake, shake) / 2); shake *= .85; if (shake < .5) shake = 0; }
      const sky = ctx.createLinearGradient(0, 0, 0, SIZE); sky.addColorStop(0, "#0B1B35"); sky.addColorStop(1, "#24477E");
      ctx.fillStyle = sky; ctx.fillRect(-20, -20, SIZE + 40, SIZE + 40);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, SIZE - 18, SIZE, 9); ctx.fillStyle = "#C8102E"; ctx.fillRect(0, SIZE - 9, SIZE, 9);
      items.forEach(o => { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); em(o.it.e, 0, 0, 34); ctx.restore(); });
      // furgonetka
      const y = SIZE - 52, x = vanX - 44;
      ctx.fillStyle = "#fff"; ctx.fillRect(x, y, 66, 30); ctx.fillStyle = "#C8102E"; ctx.fillRect(x, y + 14, 66, 6);
      ctx.fillStyle = "#cfe0ff"; ctx.fillRect(x + 68, y + 6, 20, 24); ctx.fillStyle = "#13294B"; ctx.fillRect(x + 72, y + 9, 12, 9);
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x + 16, y + 32, 7, 0, 7); ctx.arc(x + 70, y + 32, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "#13294B"; ctx.font = "900 10px Poppins,sans-serif"; ctx.textAlign = "left"; ctx.fillText("NHP", x + 6, y + 10);
      ctx.fillStyle = "rgba(255,211,77,.25)"; ctx.fillRect(x - 6, y - 8, 100, 4);
      if (performance.now() < slowUntil) { ctx.fillStyle = "rgba(255,211,77,.15)"; ctx.fillRect(0, 0, SIZE, SIZE); }
      if (g.paused) { ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, 0, SIZE, SIZE); ctx.fillStyle = "#fff"; ctx.font = "900 34px Poppins,sans-serif"; ctx.textAlign = "center"; ctx.fillText("PAUZA NA KAWĘ ☕", SIZE / 2, SIZE / 2); }
      ctx.restore();
      setHud(`${"❤️".repeat(Math.max(0, lives))}${"🖤".repeat(Math.max(0, 3 - lives))}`, `Wynik: ${score}`, performance.now() < slowUntil ? "⭐ SLOW-MO" : `Tempo: ${speed.toFixed(1)}x`);
    }
    // płynne sterowanie strzałkami przytrzymanymi
    const hold = e => { if (!g.alive || g.paused) return; if (["ArrowLeft", "a", "A"].includes(e.key)) vx = -9; if (["ArrowRight", "d", "D"].includes(e.key)) vx = 9; };
    document.addEventListener("keydown", hold);
    const oldStop = g.stop; g.stop = () => { oldStop(); document.removeEventListener("keydown", hold); };
    raf = requestAnimationFrame(loop);
    return g;
  }

  /* ================= 🍄 SUPER KURIER (platformówka) ================= */
  function mario() {
    const GROUND = SIZE - 60, GRAV = .55, PW = 46, PH = 26;
    const g = { alive: true, paused: false, spaceJumps: true };
    const P = { x: 60, y: GROUND - PH, vx: 0, vy: 0, on: true, face: 1, safeX: 60 };
    const keys = { left: false, right: false, up: false };
    let ground = [{ x: -200, w: 900 }], plats = [], coins = [], foes = [], flags = [], genX = 700;
    let camX = 0, score = 0, coinsN = 0, lives = 3, inv = 0, raf = 0, last = performance.now(), far = 0;
    const QUIPS = ["SKOK STULECIA!", "Kurier-Ninja!", "Reklamacja zgnieciona!", "Mamma mia, jaka marża!", "Boing!"];
    function gen(until) {
      while (genX < until) {
        const gap = genX < 900 ? 0 : rnd(70, 140), w = rnd(220, 480), x = genX + gap;
        ground.push({ x, w });
        for (let c = x + 40; c < x + w - 30; c += 46) if (Math.random() < .45) coins.push({ x: c, y: GROUND - 34, got: false });
        if (w > 280 && Math.random() < .7) foes.push({ x: x + w / 2, y: GROUND - 30, min: x + 20, max: x + w - 40, v: rnd(.8, 1.6) * (Math.random() < .5 ? -1 : 1), dead: 0 });
        if (Math.random() < .65) {
          const pw = rnd(90, 150), px = x + rnd(20, Math.max(30, w - pw)), py = GROUND - rnd(90, 150);
          plats.push({ x: px, y: py, w: pw });
          for (let c = px + 20; c < px + pw - 10; c += 36) coins.push({ x: c, y: py - 26, got: false });
        }
        if (Math.floor((x + w) / 1600) > Math.floor(x / 1600)) flags.push({ x: x + w - 40, got: false });
        genX = x + w;
      }
    }
    gen(1600);
    g.key = k => { if (k === "left") keys.left = true; if (k === "right") keys.right = true; if (k === "up") { keys.up = true; if (P.on) { P.vy = -11.5; P.on = false; beep(520, .12, "square", .05, 1040); } } };
    g.release = k => { if (k === "left") keys.left = false; if (k === "right") keys.right = false; if (k === "up") { keys.up = false; if (P.vy < -4) P.vy = -4; } };
    g.stop = () => { g.alive = false; cancelAnimationFrame(raf); };
    function hurt(msg) {
      if (inv > 0) return;
      lives--; sfx.bad(); inv = 90; pop(`💥 ${msg}`, P.x - camX, P.y - 20);
      if (lives <= 0) { g.alive = false; draw(); setTimeout(() => gameOver(score, pick(["Furgonetka wpadła do dziury w budżecie.", "Reklamacje wygrały tym razem.", "Kurier poszedł szukać grzybków."])), 350); return true; }
      return false;
    }
    function standOn(nx, ny, oy) {
      for (const s of ground) if (nx + PW > s.x + 4 && nx < s.x + s.w - 4 && oy + PH <= GROUND + 1 && ny + PH >= GROUND) return GROUND;
      for (const p of plats) if (nx + PW > p.x && nx < p.x + p.w && oy + PH <= p.y + 1 && ny + PH >= p.y) return p.y;
      return null;
    }
    function step() {
      const acc = .7, max = 6.2;
      if (keys.left) { P.vx = Math.max(-max, P.vx - acc); P.face = -1; }
      if (keys.right) { P.vx = Math.min(max, P.vx + acc); P.face = 1; }
      if (!keys.left && !keys.right) P.vx *= .82;
      P.vy = Math.min(14, P.vy + GRAV);
      const nx = Math.max(camX - 10, P.x + P.vx), ny = P.y + P.vy;
      const top = P.vy >= 0 ? standOn(nx, ny, P.y) : null;
      if (top != null) { P.y = top - PH; P.vy = 0; P.on = true; if (top === GROUND) P.safeX = nx; } else { P.y = ny; P.on = false; }
      P.x = nx;
      if (P.y > SIZE + 40) { if (hurt("Dziura w drodze!")) return; P.x = P.safeX; P.y = GROUND - PH - 40; P.vy = 0; P.vx = 0; }
      if (inv > 0) inv--;
      // monety
      for (const c of coins) if (!c.got && Math.abs(c.x - (P.x + PW / 2)) < 22 && Math.abs(c.y - (P.y + PH / 2)) < 24) { c.got = true; coinsN++; score++; sfx.eat(); }
      for (const f of flags) if (!f.got && P.x + PW > f.x && P.x < f.x + 20) { f.got = true; score += 20; sfx.gold(); pop("🇵🇱 CHECKPOINT +20!", f.x - camX, GROUND - 120); }
      // wrogowie
      for (const f of foes) {
        if (f.dead) { f.dead++; continue; }
        f.x += f.v; if (f.x < f.min || f.x > f.max) f.v *= -1;
        const hit = P.x + PW > f.x - 14 && P.x < f.x + 14 && P.y + PH > f.y - 14 && P.y < f.y + 14;
        if (!hit) continue;
        if (P.vy > 1 && P.y + PH - P.vy <= f.y - 6) { f.dead = 1; P.vy = -8; score += 5; beep(300, .15, "square", .06, 90); pop(pick(QUIPS), f.x - camX, f.y - 30); }
        else if (hurt("Reklamacja z boku!")) return;
        else P.vx = -P.face * 7;
      }
      foes = foes.filter(f => f.dead < 30);
      far = Math.max(far, P.x);
      score = Math.max(score, coinsN + Math.floor(far / 40) + 0);
      camX = Math.max(camX, P.x - 170);
      gen(camX + SIZE + 600);
      ground = ground.filter(s => s.x + s.w > camX - 300); plats = plats.filter(p => p.x + p.w > camX - 300);
      coins = coins.filter(c => c.x > camX - 300); flags = flags.filter(f => f.x > camX - 300);
    }
    function em(e, x, y, s) { ctx.font = `${s}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x, y); }
    function draw() {
      const sky = ctx.createLinearGradient(0, 0, 0, SIZE); sky.addColorStop(0, "#5aa0ff"); sky.addColorStop(1, "#bfe0ff");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, SIZE, SIZE);
      // chmury i góry (paralaksa)
      for (let i = -1; i < 5; i++) { const cx = i * 160 - (camX * .3 % 160); em("☁️", cx + 60, 70 + (i % 2) * 30, 46); }
      ctx.fillStyle = "#7bb661"; for (let i = -1; i < 6; i++) { const hx = i * 140 - (camX * .5 % 140); ctx.beginPath(); ctx.arc(hx + 70, GROUND + 10, 70, Math.PI, 0); ctx.fill(); }
      ctx.save(); ctx.translate(-camX, 0);
      for (const s of ground) { ctx.fillStyle = "#C8102E"; ctx.fillRect(s.x, GROUND, s.w, SIZE - GROUND); ctx.fillStyle = "#fff"; ctx.fillRect(s.x, GROUND, s.w, 10); ctx.fillStyle = "rgba(0,0,0,.12)"; for (let bx = s.x; bx < s.x + s.w; bx += 30) ctx.fillRect(bx, GROUND + 22, 2, SIZE); }
      for (const p of plats) { ctx.fillStyle = "#13294B"; ctx.fillRect(p.x, p.y, p.w, 16); ctx.fillStyle = "#ffd34d"; ctx.fillRect(p.x, p.y, p.w, 4); }
      for (const c of coins) if (!c.got) em("📦", c.x, c.y + Math.sin((performance.now() + c.x * 7) / 200) * 3, 24);
      for (const f of flags) { ctx.fillStyle = "#ddd"; ctx.fillRect(f.x, GROUND - 110, 4, 110); ctx.fillStyle = f.got ? "#fff" : "#fff"; ctx.fillRect(f.x + 4, GROUND - 110, 34, 11); ctx.fillStyle = "#C8102E"; ctx.fillRect(f.x + 4, GROUND - 99, 34, 11); }
      for (const f of foes) { ctx.save(); ctx.translate(f.x, f.y + (f.dead ? 8 : 0)); if (f.dead) ctx.scale(1.3, .3); em("🧾", 0, 0, 30); ctx.restore(); if (!f.dead) em(f.v > 0 ? "👀" : "👀", f.x, f.y - 22, 14); }
      // gracz: furgonetka
      if (!(inv > 0 && Math.floor(inv / 5) % 2)) {
        ctx.save(); ctx.translate(P.x + PW / 2, P.y); ctx.scale(P.face, 1); ctx.translate(-PW / 2, 0);
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 32, PH - 6); ctx.fillStyle = "#C8102E"; ctx.fillRect(0, 9, 32, 5);
        ctx.fillStyle = "#cfe0ff"; ctx.fillRect(33, 4, 13, PH - 10); ctx.fillStyle = "#13294B"; ctx.fillRect(36, 6, 8, 6);
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(9, PH - 4, 5, 0, 7); ctx.arc(37, PH - 4, 5, 0, 7); ctx.fill();
        em("🧢", 40, -6, 16);
        ctx.restore();
      }
      ctx.restore();
      if (g.paused) { ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, 0, SIZE, SIZE); ctx.fillStyle = "#fff"; ctx.font = "900 34px Poppins,sans-serif"; ctx.textAlign = "center"; ctx.fillText("PAUZA NA KAWĘ ☕", SIZE / 2, SIZE / 2); }
      setHud(`${"❤️".repeat(Math.max(0, lives))}${"🖤".repeat(Math.max(0, 3 - lives))}`, `Wynik: ${score}`, `📦 ${coinsN} · ${Math.floor(far / 40)} m`);
    }
    function loop(now) {
      if (!g.alive) return;
      const dt = Math.min(50, now - last); last = now;
      if (!g.paused) { let n = Math.round(dt / 16.7) || 1; while (n-- > 0 && g.alive) step(); }
      if (g.alive) draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return g;
  }

  /* ---------- przycisk w banerze ---------- */
  function hook() {
    const tools = document.querySelector("#mega .mg-tools");
    if (!tools) return false;
    if (tools.querySelector('[data-mg="games"]')) return true;
    const b = document.createElement("button");
    b.type = "button"; b.dataset.mg = "games"; b.innerHTML = "🕹️ <span>Gierki</span>";
    b.addEventListener("click", open);
    tools.insertBefore(b, tools.firstChild);
    return true;
  }
  if (!hook()) {
    const mo = new MutationObserver(() => { if (hook()) mo.disconnect(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.NHP_ARCADE = { open, close };
})();
