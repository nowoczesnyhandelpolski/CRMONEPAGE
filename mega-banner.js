/* =====================================================================
   MEGA BANER — Nowoczesny Handel Polski
   Gigantyczne logo, przesadnie łopocące flagi, fajerwerki, konfetti,
   furgonetka z napędem rakietowym i fanfary. Dla beki. Na serio.
   Szanuje „ogranicz ruch” (wtedy wszystko stoi) i przycisk „Dźwięki”.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__NHP_MEGA__) return;
  window.__NHP_MEGA__ = true;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  const WINDS = [
    { name: "Bryza z Bałtyku", amp: 0.10, speed: 2.2 },
    { name: "Wichura", amp: 0.22, speed: 4.2 },
    { name: "Halny w Zakopanem", amp: 0.34, speed: 6.5 },
    { name: "HURAGAN PROMOCJI", amp: 0.48, speed: 9.5 },
    { name: "TORNADO KAMILA 🌪️", amp: 0.66, speed: 14 }
  ];
  const SLOGANS = [
    "🇵🇱 NAJWIĘKSZA FLAGA W HISTORII DROPSHIPPINGU",
    "📦 Dostawa szybsza niż światło*",
    "*nie dotyczy hurtowni z drugiego końca świata",
    "🚀 Furgonetka z napędem rakietowym w standardzie",
    "💸 Marża tak wysoka, że widać ją z kosmosu",
    "🦅 Orzeł już zamówił 3 sztuki",
    "📈 Wykres zysków idzie w górę. Flaga też",
    "🎺 Kliknij logo, a odpalimy fanfary",
    "🤖 Boty pracują, Kamil pije kawę",
    "🧈 Pierogi w promocji? Nie. Ale mogłyby być"
  ];

  /* ---------- style ---------- */
  const css = `
  #mega{position:relative;overflow:hidden;height:300px;flex:none;isolation:isolate;
    background:radial-gradient(120% 140% at 50% 120%,#24477E 0,#13294B 45%,#060E1E 100%);
    border-bottom:6px solid transparent;border-image:linear-gradient(90deg,#fff 0 50%,#C8102E 50%) 1;
    transition:height .45s cubic-bezier(.2,.9,.2,1.2)}
  #mega.mini{height:58px}
  #mega canvas{position:absolute;inset:0;width:100%;height:100%;z-index:0}
  #mega .mg-stage{position:absolute;inset:0;display:grid;place-items:center;z-index:2;pointer-events:none}
  #mega .mg-logo{pointer-events:auto;cursor:pointer;border:0;background:none;padding:0;position:relative;
    width:min(56vw,620px);filter:drop-shadow(0 0 18px rgba(255,255,255,.45)) drop-shadow(0 10px 26px rgba(200,16,46,.55));
    animation:mgJelly 2.6s ease-in-out infinite, mgFloat 5s ease-in-out infinite}
  #mega .mg-logo img{width:100%;height:auto;display:block;animation:mgGlow 1.8s ease-in-out infinite alternate}
  #mega .mg-logo:focus-visible{outline:3px solid #fff;outline-offset:6px;border-radius:12px}
  #mega .mg-crown{position:absolute;left:50%;top:-34px;transform:translateX(-50%);font-size:40px;animation:mgCrown 1.2s ease-in-out infinite alternate}
  #mega .mg-stamp{position:absolute;right:-18px;top:-8px;background:#C8102E;color:#fff;font:900 13px/1 Poppins,system-ui,sans-serif;
    padding:8px 12px;border-radius:999px;transform:rotate(14deg);box-shadow:0 6px 18px rgba(0,0,0,.35);border:3px dashed #fff;animation:mgStamp 1.1s ease-in-out infinite}
  #mega .mg-ticker{position:absolute;left:0;right:0;bottom:0;height:30px;z-index:3;overflow:hidden;
    background:repeating-linear-gradient(-45deg,#C8102E 0 18px,#a40c25 18px 36px);color:#fff;
    font:800 14px/30px Poppins,system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 2px 0 rgba(0,0,0,.25)}
  #mega .mg-ticker div{display:inline-block;white-space:nowrap;padding-left:100%;animation:mgTicker 38s linear infinite}
  #mega .mg-ticker span{margin:0 34px}
  #mega .mg-tools{position:absolute;top:10px;right:12px;z-index:4;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  #mega .mg-tools button{font:700 12px/1 Poppins,system-ui,sans-serif;border:2px solid rgba(255,255,255,.7);background:rgba(11,27,53,.55);
    color:#fff;padding:7px 11px;border-radius:999px;cursor:pointer;backdrop-filter:blur(4px)}
  #mega .mg-tools button:hover{background:#C8102E;border-color:#fff;transform:translateY(-1px) rotate(-2deg)}
  #mega .mg-wind{position:absolute;left:14px;top:12px;z-index:4;color:#fff;font:800 12px/1.2 Poppins,system-ui,sans-serif;
    background:rgba(200,16,46,.85);padding:6px 10px;border-radius:8px;transform:rotate(-3deg);box-shadow:0 4px 12px rgba(0,0,0,.3)}
  #mega.mini .mg-stage,#mega.mini .mg-ticker,#mega.mini .mg-wind{display:none}
  #mega.mini .mg-tools{top:14px}
  #mega .mg-minilabel{display:none;position:absolute;left:16px;top:0;line-height:52px;color:#fff;font:800 16px Poppins,system-ui,sans-serif;z-index:3}
  #mega.mini .mg-minilabel{display:block}
  #mega.shake{animation:mgShake .55s cubic-bezier(.36,.07,.19,.97) both}
  #mega.party .mg-logo{animation:mgSpin 1.1s cubic-bezier(.3,1.6,.5,1) 1, mgFloat 5s ease-in-out infinite}
  @keyframes mgJelly{0%,100%{transform:scale(1,1)}25%{transform:scale(1.06,.94)}50%{transform:scale(.95,1.06)}75%{transform:scale(1.03,.97)}}
  @keyframes mgFloat{0%,100%{translate:0 0}50%{translate:0 -10px}}
  @keyframes mgGlow{from{filter:brightness(1)}to{filter:brightness(1.25) saturate(1.3)}}
  @keyframes mgCrown{from{transform:translateX(-50%) rotate(-12deg) scale(1)}to{transform:translateX(-50%) rotate(12deg) scale(1.15)}}
  @keyframes mgStamp{0%,100%{transform:rotate(14deg) scale(1)}50%{transform:rotate(8deg) scale(1.12)}}
  @keyframes mgTicker{from{transform:translateX(0)}to{transform:translateX(-100%)}}
  @keyframes mgShake{10%,90%{transform:translate(-2px,1px)}20%,80%{transform:translate(4px,-2px)}30%,50%,70%{transform:translate(-7px,3px) rotate(-.6deg)}40%,60%{transform:translate(7px,-3px) rotate(.6deg)}}
  @keyframes mgSpin{from{transform:rotate(0) scale(1)}50%{transform:rotate(200deg) scale(1.35)}to{transform:rotate(360deg) scale(1)}}
  @media (max-width:860px){#mega{height:220px}#mega .mg-logo{width:min(70vw,420px)}#mega .mg-crown{font-size:28px;top:-26px}#mega .mg-stamp{font-size:10px;padding:6px 8px}}
  @media (max-width:520px){#mega{height:190px}#mega .mg-tools button span{display:none}#mega .mg-wind{display:none}}
  @media (prefers-reduced-motion:reduce){#mega *,#mega{animation:none!important;transition:none!important}}
  `;

  /* ---------- dźwięk (tylko po kliknięciu, i tylko gdy „Dźwięki” są włączone) ---------- */
  let actx = null;
  function soundOn() {
    const b = document.querySelector(".snd-btn");
    return !b || b.getAttribute("aria-pressed") !== "false";
  }
  function tone(freq, start, dur, type, vol) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(actx.destination); o.start(start); o.stop(start + dur + 0.05);
  }
  function fanfare() {
    if (!soundOn()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + 0.02;
      // ta-ta-ta-TAAAA (trąbka z syntezatora za 3 zł)
      [[523, 0, .14], [523, .16, .14], [523, .32, .14], [698, .48, .55], [880, .62, .45], [1047, .78, .9]]
        .forEach(([f, s, d]) => { tone(f, t + s, d, "sawtooth", .07); tone(f / 2, t + s, d, "square", .03); });
      // werbel
      for (let i = 0; i < 10; i++) tone(180 + Math.random() * 40, t + i * 0.045, .04, "triangle", .05);
    } catch (e) {}
  }
  function whoosh() {
    if (!soundOn()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(1400, t + .45);
      g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + .55);
    } catch (e) {}
  }

  /* ---------- budowa banera ---------- */
  function build() {
    const wrap = document.querySelector(".mainwrap");
    if (!wrap || document.getElementById("mega")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

    const el = document.createElement("section");
    el.id = "mega";
    el.setAttribute("aria-label", "Baner firmy Nowoczesny Handel Polski");
    el.innerHTML = `
      <canvas aria-hidden="true"></canvas>
      <div class="mg-wind" aria-live="polite"></div>
      <div class="mg-minilabel">🇵🇱 Nowoczesny Handel Polski</div>
      <div class="mg-stage">
        <button class="mg-logo" type="button" title="Kliknij. Serio. Kliknij.">
          <span class="mg-crown" aria-hidden="true">👑</span>
          <img src="assets/brand/logo-white.svg" alt="Nowoczesny Handel Polski">
          <span class="mg-stamp" aria-hidden="true">100% POLSKI!</span>
        </button>
      </div>
      <div class="mg-tools">
        <button type="button" data-mg="wind">🌬️ <span>Więcej wiatru!</span></button>
        <button type="button" data-mg="party">🎆 <span>Fajerwerki</span></button>
        <button type="button" data-mg="fold" aria-expanded="true">🙈 <span>Schowaj</span></button>
      </div>
      <div class="mg-ticker" aria-hidden="true"><div>${SLOGANS.concat(SLOGANS).map(s => `<span>${s}</span>`).join("")}</div></div>`;
    wrap.insertBefore(el, wrap.firstChild);

    const cv = el.querySelector("canvas"), ctx = cv.getContext("2d");
    const windLabel = el.querySelector(".mg-wind");
    let wind = Math.min(WINDS.length - 1, parseInt(store.get("nhp_mega_wind", "2"), 10) || 0);
    let W = 0, H = 0, dpr = 1, t0 = performance.now(), running = true, visible = true;
    const confetti = [], sparks = [], stars = [];
    let van = { x: -300, nextAt: performance.now() + 2500 };
    let nextFirework = performance.now() + 1200;

    function setWind(i) {
      wind = i; store.set("nhp_mega_wind", String(i));
      windLabel.textContent = `Wiatr: ${WINDS[i].name}`;
    }
    setWind(wind);

    function resize() {
      const r = el.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars.length = 0;
      for (let i = 0; i < Math.round(W / 9); i++) stars.push({ x: Math.random() * W, y: Math.random() * H * .8, r: Math.random() * 1.6 + .3, p: Math.random() * 6 });
    }
    resize();
    new ResizeObserver(resize).observe(el);

    /* ---- flaga: pionowe paski, każdy przesunięty sinusem; przy maszcie trzyma się mocno ---- */
    function flag(px, py, fw, fh, t, dir) {
      const w = WINDS[wind], cols = Math.ceil(fw / 3);
      // maszt
      const g = ctx.createLinearGradient(px - 6, 0, px + 6, 0);
      g.addColorStop(0, "#8a6a1e"); g.addColorStop(.5, "#ffe08a"); g.addColorStop(1, "#8a6a1e");
      ctx.fillStyle = g; ctx.fillRect(px - 4, py - 16, 8, H - py + 20);
      ctx.beginPath(); ctx.arc(px, py - 18, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd34d"; ctx.fill();
      for (let i = 0; i < cols; i++) {
        const u = i / cols, x = px + dir * u * fw;
        const amp = fh * w.amp * Math.pow(u, 1.15);
        const ph = u * 9 - t * w.speed;
        const dy = Math.sin(ph) * amp + Math.sin(ph * 2.3 + 1.7) * amp * .35 + Math.sin(t * 13 * w.amp + u * 20) * amp * .12 * (wind >= 3 ? 1 : 0);
        const slope = Math.cos(ph);
        const shade = .5 + .5 * slope;
        const sx = dir > 0 ? x : x - 3.5;
        // biały
        ctx.fillStyle = `rgb(${Math.round(205 + 50 * shade)},${Math.round(205 + 50 * shade)},${Math.round(212 + 43 * shade)})`;
        ctx.fillRect(sx, py + dy, 3.5, fh / 2 + .6);
        // czerwony
        const rr = Math.round(150 + 75 * shade), gg = Math.round(8 + 14 * shade), bb = Math.round(30 + 22 * shade);
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(sx, py + dy + fh / 2, 3.5, fh / 2);
      }
    }

    function firework(x, y, big) {
      const n = big ? 110 : 60, hue = Math.random() < .5 ? 0 : 352;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (Math.random() * 3.6 + 1.2) * (big ? 1.5 : 1);
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: Math.random() < .5 ? "#ffffff" : `hsl(${hue},90%,${55 + Math.random() * 15}%)` });
      }
    }
    function confettiBurst(n) {
      for (let i = 0; i < n; i++) confetti.push({ x: Math.random() * W, y: -10 - Math.random() * H, vy: 1 + Math.random() * 2.5, vx: (Math.random() - .5) * 2, r: Math.random() * 6, s: 4 + Math.random() * 6, c: Math.random() < .5 ? "#ffffff" : "#C8102E" });
    }
    confettiBurst(reduced ? 0 : 50);

    function drawVan(now) {
      if (now < van.nextAt) return;
      van.x += 6 + wind * 2.5;
      const y = H - 62, x = van.x;
      // smuga rakietowa
      const tr = ctx.createLinearGradient(x - 140, 0, x, 0);
      tr.addColorStop(0, "rgba(255,120,0,0)"); tr.addColorStop(1, "rgba(255,200,60,.9)");
      ctx.fillStyle = tr; ctx.beginPath(); ctx.moveTo(x - 140, y + 8); ctx.lineTo(x, y + 2); ctx.lineTo(x, y + 18); ctx.closePath(); ctx.fill();
      // furgonetka
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y - 4, 70, 26);
      ctx.fillStyle = "#C8102E"; ctx.fillRect(x, y + 9, 70, 6);
      ctx.fillStyle = "#cfe0ff"; ctx.fillRect(x + 72, y + 2, 20, 20);
      ctx.fillStyle = "#13294B"; ctx.fillRect(x + 76, y + 5, 12, 8);
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x + 16, y + 24, 6, 0, 7); ctx.arc(x + 70, y + 24, 6, 0, 7); ctx.fill();
      ctx.fillStyle = "#13294B"; ctx.font = "800 9px Poppins, system-ui, sans-serif"; ctx.fillText("NHP EXPRESS", x + 6, y + 6);
      // mini flaga na antenie
      ctx.fillStyle = "#888"; ctx.fillRect(x + 4, y - 26, 2, 22);
      const wv = Math.sin(now / 60) * 3;
      ctx.fillStyle = "#fff"; ctx.fillRect(x + 6, y - 26 + wv * .3, 16, 5);
      ctx.fillStyle = "#C8102E"; ctx.fillRect(x + 6, y - 21 + wv * .3, 16, 5);
      if (van.x > W + 200) { van.x = -300; van.nextAt = now + 6000 + Math.random() * 8000; }
    }

    function frame(now) {
      if (!running) return;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      // gwiazdy
      for (const s of stars) { ctx.globalAlpha = .35 + .35 * Math.sin(t * 2 + s.p); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      // reflektory
      for (let k = 0; k < 2; k++) {
        const a = Math.sin(t * .7 + k * 2) * .5 + (k ? 2.1 : 1.05);
        const bx = k ? W * .85 : W * .15;
        const grd = ctx.createLinearGradient(bx, H, bx + Math.cos(a) * H * 1.4, H - Math.sin(a) * H * 1.4);
        grd.addColorStop(0, "rgba(255,255,255,.16)"); grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(bx - 10, H); ctx.lineTo(bx + Math.cos(a - .12) * H * 1.6, H - Math.sin(a - .12) * H * 1.6);
        ctx.lineTo(bx + Math.cos(a + .12) * H * 1.6, H - Math.sin(a + .12) * H * 1.6); ctx.lineTo(bx + 10, H); ctx.fill();
      }
      // flagi po bokach (prawa macha w lewo, lewa w prawo)
      const fh = Math.min(H * .42, 120), fw = Math.min(W * .22, fh * 1.6);
      flag(W * .04 + 6, H * .2, fw, fh, t, 1);
      flag(W * .96 - 6, H * .2, fw, fh, t + 1.3, -1);
      // furgonetka
      drawVan(now);
      // fajerwerki
      if (now > nextFirework) { firework(W * (.15 + Math.random() * .7), H * (.15 + Math.random() * .35), false); nextFirework = now + 900 + Math.random() * (2600 - wind * 350); }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy += .045; p.vx *= .985; p.life -= .016;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 2.6, 2.6);
      }
      ctx.globalAlpha = 1;
      // konfetti (wiatr je zwiewa)
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i]; c.y += c.vy; c.x += c.vx + WINDS[wind].amp * 3 * Math.sin(t + c.r); c.r += .08;
        if (c.y > H + 10) { if (confetti.length > 140) { confetti.splice(i, 1); continue; } c.y = -10; c.x = Math.random() * W; }
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); ctx.restore();
      }
      if (confetti.length < 40) confettiBurst(2);
      requestAnimationFrame(frame);
    }

    function drawStatic() {
      ctx.clearRect(0, 0, W, H);
      const fh = Math.min(H * .42, 120), fw = Math.min(W * .22, fh * 1.6);
      flag(W * .04 + 6, H * .2, fw, fh, 0, 1);
      flag(W * .96 - 6, H * .2, fw, fh, 1.3, -1);
    }

    function start() { if (reduced || running) return; running = true; requestAnimationFrame(frame); }
    function stop() { running = false; }

    if (reduced) { running = false; drawStatic(); }
    else requestAnimationFrame(frame);

    // pauza, gdy baner niewidoczny albo zwinięty (oszczędza baterię)
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (reduced) return;
      if (visible && !el.classList.contains("mini")) { if (!running) start(); } else stop();
    }).observe(el);
    document.addEventListener("visibilitychange", () => { if (reduced) return; if (document.hidden) stop(); else if (visible && !el.classList.contains("mini") && !running) start(); });

    function party() {
      el.classList.remove("party", "shake"); void el.offsetWidth;
      el.classList.add("party", "shake");
      setTimeout(() => el.classList.remove("party", "shake"), 1200);
      fanfare();
      if (reduced) return;
      for (let k = 0; k < 6; k++) setTimeout(() => firework(W * (.1 + Math.random() * .8), H * (.1 + Math.random() * .45), true), k * 140);
      confettiBurst(120);
      van.x = -300; van.nextAt = performance.now() + 300;
    }

    el.querySelector(".mg-logo").addEventListener("click", party);
    el.querySelector('[data-mg="party"]').addEventListener("click", party);
    el.querySelector('[data-mg="wind"]').addEventListener("click", () => {
      setWind((wind + 1) % WINDS.length); whoosh();
      if (wind === WINDS.length - 1) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
      if (reduced) drawStatic();
    });
    const foldBtn = el.querySelector('[data-mg="fold"]');
    function setFold(mini) {
      el.classList.toggle("mini", mini);
      foldBtn.setAttribute("aria-expanded", String(!mini));
      foldBtn.innerHTML = mini ? "🎉 <span>Pokaż baner</span>" : "🙈 <span>Schowaj</span>";
      store.set("nhp_mega_mini", mini ? "1" : "0");
      if (reduced) return;
      if (mini) stop(); else setTimeout(start, 50);
    }
    foldBtn.addEventListener("click", () => setFold(!el.classList.contains("mini")));
    if (store.get("nhp_mega_mini", "0") === "1") setFold(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
