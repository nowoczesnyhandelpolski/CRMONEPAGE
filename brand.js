/* Motyw marki Nowoczesny Handel Polski — sceny (animowane SVG), ekran logowania, intro po zalogowaniu, dźwięki.
   Kolory z logo: granat #13294B, biel, czerwień #C8102E. Krój: Poppins. */
(function () {
  const RED = "#C8102E", RED_L = "#EF4058", NAVY = "#13294B", SKY = "#8FB0E6";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const css = document.createElement("style");
  css.textContent = `
  .scene{width:100%;height:100%;display:block;overflow:visible}
  .sc-float{animation:scFloat 4s ease-in-out infinite}
  .sc-float2{animation:scFloat 5s ease-in-out -2s infinite}
  .sc-blink{animation:scBlink 2.4s ease-in-out infinite}
  .sc-spin{transform-box:fill-box;transform-origin:center;animation:scSpin 10s linear infinite}
  .sc-belt{animation:scBelt 3.6s linear infinite}
  .sc-wave{animation:scWave 3s ease-in-out infinite}
  .sc-wave2{animation:scWave 3s ease-in-out -1.5s infinite}
  .sc-bob{transform-box:fill-box;transform-origin:center bottom;animation:scBob 3.2s ease-in-out infinite}
  .sc-swing{transform-box:fill-box;transform-origin:top center;animation:scSwing 2.6s ease-in-out infinite}
  .sc-pop{transform-box:fill-box;transform-origin:center;animation:scPop 3s ease-in-out infinite}
  .sc-pop.d1{animation-delay:.5s}.sc-pop.d2{animation-delay:1s}.sc-pop.d3{animation-delay:1.5s}
  .sc-draw{stroke-dasharray:6 7;animation:scDash 1.4s linear infinite}
  .sc-grow{transform-box:fill-box;transform-origin:left;animation:scGrow 3.5s ease-in-out infinite}
  .sc-grow.d1{animation-delay:.4s}.sc-grow.d2{animation-delay:.8s}.sc-grow.d3{animation-delay:1.2s}
  .sc-check{stroke-dasharray:30;stroke-dashoffset:30;animation:scCheck 3.6s ease infinite}
  .sc-check.d1{animation-delay:.6s}.sc-check.d2{animation-delay:1.2s}
  .sc-fly{animation:scFly 4.5s ease-in-out infinite}
  .sc-fly.d1{animation-delay:1.5s}.sc-fly.d2{animation-delay:3s}
  .sc-flag{transform-box:fill-box;transform-origin:left center;animation:scFlag 2.2s ease-in-out infinite}
  @keyframes scDrive{from{transform:translateX(-110px)}to{transform:translateX(440px)}}
  .sc-drive{animation:scDrive 9s linear infinite}
  @keyframes scFloat{50%{transform:translateY(-6px)}}
  @keyframes scBlink{50%{opacity:.25}}
  @keyframes scSpin{to{transform:rotate(360deg)}}
  @keyframes scBelt{from{transform:translateX(-90px)}to{transform:translateX(0)}}
  @keyframes scWave{50%{transform:translateX(-14px)}}
  @keyframes scBob{50%{transform:rotate(-3deg) translateY(-3px)}}
  @keyframes scSwing{50%{transform:rotate(9deg)}}
  @keyframes scPop{0%,100%{transform:scale(.85);opacity:.55}50%{transform:scale(1.08);opacity:1}}
  @keyframes scDash{to{stroke-dashoffset:-26}}
  @keyframes scGrow{0%{transform:scaleX(.2)}50%,100%{transform:scaleX(1)}}
  @keyframes scCheck{0%,15%{stroke-dashoffset:30}45%,100%{stroke-dashoffset:0}}
  @keyframes scFly{0%{transform:translate(-40px,30px) scale(.6);opacity:0}25%{opacity:1}100%{transform:translate(120px,-50px) scale(1);opacity:0}}
  @keyframes scFlag{50%{transform:skewY(4deg) scaleX(.96)}}

  .vbanner{position:relative;overflow:hidden;border-radius:20px;margin:22px clamp(16px,3vw,36px) 0;min-height:168px;display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,500px);align-items:center;gap:10px;color:#fff;
    background:radial-gradient(90% 140% at 100% 0%,#24477E 0,transparent 60%),radial-gradient(60% 120% at 0% 100%,#0A1A33 0,transparent 70%),${NAVY};
    box-shadow:0 18px 40px -18px rgba(19,41,75,.55)}
  .vbanner::after{content:"";position:absolute;left:0;right:0;bottom:0;height:10px;background:linear-gradient(#fff 0 50%,${RED} 50%)}
  .vbanner .vb-txt{padding:22px 0 30px 26px;position:relative;z-index:1}
  .vbanner .vb-eye{font:600 11px/1 var(--display);letter-spacing:.42em;text-transform:uppercase;color:${RED_L};display:flex;align-items:center;gap:10px}
  .vbanner .vb-eye::before{content:"";width:22px;height:8px;background:linear-gradient(#fff 0 50%,${RED} 50%);border-radius:2px}
  .vbanner h2{font:700 clamp(20px,2.3vw,28px)/1.15 var(--display);margin:10px 0 6px;color:#fff}
  .vbanner p{margin:0;color:rgba(255,255,255,.72);font-size:14px;max-width:46ch}
  .vbanner .vb-art{height:168px;padding:8px 10px 14px 0;position:relative}
  .vbanner .vb-grid{position:absolute;inset:0;opacity:.18;background-image:radial-gradient(rgba(255,255,255,.55) 1px,transparent 1.4px);background-size:16px 16px;mask-image:linear-gradient(90deg,transparent 30%,#000)}
  .vbanner.enter .vb-txt{animation:vbIn .5s cubic-bezier(.2,.8,.2,1)}
  .vbanner.enter .vb-art{animation:vbIn .6s .08s cubic-bezier(.2,.8,.2,1) both}
  @keyframes vbIn{from{opacity:0;transform:translateY(10px)}}
  @media(max-width:860px){.vbanner{grid-template-columns:1fr 46%;min-height:120px;margin-top:14px}.vbanner .vb-art{height:120px}.vbanner p{display:none}}
  @media(max-width:520px){.vbanner{grid-template-columns:1fr}.vbanner .vb-art{position:absolute;inset:0 -30% 0 35%;opacity:.35;padding:0}}

  /* ekran logowania */
  .gate{grid-template-columns:minmax(0,1.1fr) minmax(360px,1fr)!important;place-items:stretch!important;padding:0!important;background:var(--bg)!important}
  .g-art{position:relative;overflow:hidden;color:#fff;padding:clamp(28px,5vw,64px);display:flex;flex-direction:column;justify-content:space-between;gap:24px;
    background:radial-gradient(70% 60% at 85% 15%,#2A4F8A 0,transparent 65%),radial-gradient(60% 60% at 10% 100%,#08162C 0,transparent 70%),${NAVY}}
  .g-art::after{content:"";position:absolute;left:0;right:0;bottom:0;height:16px;background:linear-gradient(#fff 0 50%,${RED} 50%)}
  .g-art .g-logo{width:min(360px,80%)}
  .g-art .g-scene{width:100%;max-width:620px;height:auto;align-self:center}
  .g-art h2{font:700 clamp(26px,3.2vw,42px)/1.1 var(--display);margin:0;color:#fff}
  .g-art h2 em{font-style:normal;color:${RED_L}}
  .g-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .g-tags span{padding:7px 12px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-size:13px;font-weight:600}
  .g-form{display:grid;place-items:center;padding:28px 16px}
  @media(max-width:900px){.gate{grid-template-columns:1fr!important}.g-art{padding:24px 22px 34px}.g-art .g-scene{display:none}}

  /* intro po zalogowaniu */
  .intro{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:${NAVY};animation:introOut .5s 1.5s ease forwards}
  .intro::after{content:"";position:absolute;left:0;right:0;bottom:0;height:14px;background:linear-gradient(#fff 0 50%,${RED} 50%);transform-origin:left;animation:introBand .9s .2s cubic-bezier(.7,0,.2,1) both}
  .intro svg{width:min(150px,30vw)}
  .intro .leg{transform-box:fill-box;transform-origin:bottom;animation:introLeg .55s cubic-bezier(.2,.9,.2,1.2) both}
  .intro .leg.r{animation-delay:.12s}
  .intro .band{transform-box:fill-box;transform-origin:left;animation:introBand .5s .5s cubic-bezier(.7,0,.2,1) both}
  .intro .band.red{animation-delay:.62s}
  .intro .box{transform-box:fill-box;transform-origin:center;animation:introBox .5s cubic-bezier(.2,.9,.2,1.1) both}
  .intro .word{font:700 22px var(--display);color:#fff;text-align:center;margin-top:18px;animation:vbIn .5s .8s both}
  .intro .word small{display:block;font:600 11px var(--display);letter-spacing:.5em;color:${RED_L};margin-top:6px}
  @keyframes introLeg{from{transform:scaleY(0)}}
  @keyframes introBand{from{transform:scaleX(0)}}
  @keyframes introBox{from{transform:scale(.6);opacity:0}}
  @keyframes introOut{to{opacity:0;visibility:hidden}}

  .snd-btn[aria-pressed="false"] .on,.snd-btn[aria-pressed="true"] .off{display:none}
  `;
  document.head.appendChild(css);

  /* ---------- elementy scen ---------- */
  const box = (x, y, s = 30, tape = true) => `<g transform="translate(${x} ${y})"><rect width="${s}" height="${s * .82}" rx="3" fill="#E9D8B9"/><rect width="${s}" height="${s * .2}" rx="2" fill="#D9C29B"/>${tape ? `<rect x="${s * .4}" width="${s * .2}" height="${s * .82}" fill="#fff" opacity=".9"/><rect x="${s * .5}" width="${s * .1}" height="${s * .82}" fill="${RED}"/>` : ""}</g>`;
  const hMark = (x, y, s = 28) => `<g transform="translate(${x} ${y}) scale(${s / 225})"><rect width="225" height="225" rx="46.5" fill="${NAVY}" stroke="#fff" stroke-width="10"/><rect x="46.5" y="41.25" width="48" height="142.5" rx="6" fill="#fff"/><rect x="130.5" y="41.25" width="48" height="142.5" rx="6" fill="#fff"/><rect x="30" y="88.5" width="165" height="24" fill="#fff"/><rect x="30" y="112.5" width="165" height="24" fill="${RED}"/></g>`;
  const pin = (x, y) => `<g transform="translate(${x} ${y})"><circle r="14" fill="${RED}" opacity=".25" class="sc-pop"/><path d="M0 6c-7-8-10-12-10-17a10 10 0 0 1 20 0c0 5-3 9-10 17Z" fill="${RED}" stroke="#fff" stroke-width="2"/><circle cy="-11" r="3.5" fill="#fff"/></g>`;
  const truck = (x, y) => `<g transform="translate(${x} ${y})"><rect x="0" y="0" width="58" height="30" rx="4" fill="#fff"/><rect x="0" y="12" width="58" height="5" fill="${RED}"/><path d="M58 8h14l10 11v11H58Z" fill="#DCE6F5"/><path d="M62 11h9l7 8h-16Z" fill="${SKY}"/><circle cx="14" cy="32" r="6" fill="#0A1730" stroke="#fff" stroke-width="2.5"/><circle cx="68" cy="32" r="6" fill="#0A1730" stroke="#fff" stroke-width="2.5"/>${hMark(4, 2, 10)}</g>`;
  const person = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-30" r="11" fill="#F1D3B8"/><path d="M-11-34a11 11 0 0 1 22 0c-4-5-14-5-22 0Z" fill="#2B2B3B"/><path d="M-18 6c0-16 8-24 18-24s18 8 18 24Z" fill="${c}"/></g>`;
  const bubble = (x, y, w, txt, c = "#fff", tc = NAVY) => `<g transform="translate(${x} ${y})"><rect width="${w}" height="26" rx="13" fill="${c}"/><path d="M14 25l-4 9 11-9Z" fill="${c}"/><text x="${w / 2}" y="17.5" text-anchor="middle" font-family="Poppins,sans-serif" font-size="11" font-weight="700" fill="${tc}">${txt}</text></g>`;

  let uid = 0;
  const S = {
    map: (u = ++uid) => `
      <g opacity=".22" fill="#fff">${Array.from({ length: 70 }, (_, i) => { const x = 20 + (i % 14) * 28, y = 22 + Math.floor(i / 14) * 22; return (i * 7) % 5 < 3 ? `<circle cx="${x}" cy="${y}" r="2"/>` : ""; }).join("")}</g>
      <path id="rt1-${u}" d="M40 110 C 120 10, 260 10, 330 70" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" class="sc-draw"/>
      <path id="rt2-${u}" d="M90 135 C 170 90, 250 90, 330 72" fill="none" stroke="${RED_L}" stroke-opacity=".8" stroke-width="2" class="sc-draw"/>
      <g><text x="40" y="128" text-anchor="middle" font-family="Poppins,sans-serif" font-size="10" font-weight="600" fill="#fff" opacity=".7">AZJA</text><circle cx="40" cy="110" r="5" fill="#fff"/></g>
      <g><text x="90" y="150" text-anchor="middle" font-family="Poppins,sans-serif" font-size="10" font-weight="600" fill="#fff" opacity=".7">UE</text><circle cx="90" cy="135" r="5" fill="#fff"/></g>
      <g>${box(-9, -8, 18)}<animateMotion dur="5s" repeatCount="indefinite" rotate="0"><mpath href="#rt1-${u}"/></animateMotion></g>
      <g>${box(-8, -7, 16)}<animateMotion dur="4s" begin="1s" repeatCount="indefinite"><mpath href="#rt2-${u}"/></animateMotion></g>
      ${pin(330, 72)}${hMark(350, 34, 34)}
      <text x="368" y="88" text-anchor="middle" font-family="Poppins,sans-serif" font-size="10" font-weight="700" fill="#fff" letter-spacing="2">POLSKA</text>
      <g class="sc-float2" opacity=".9"><path d="M210 30h22a8 8 0 0 0 0-16 12 12 0 0 0-23-2 7 7 0 0 0 1 18Z" fill="#fff" opacity=".18"/></g>`,
    orders: () => `
      <rect x="0" y="108" width="420" height="12" rx="6" fill="#0A1730"/><g class="sc-belt">${Array.from({ length: 9 }, (_, i) => `<circle cx="${i * 60}" cy="114" r="4" fill="${SKY}" opacity=".6"/>`).join("")}</g>
      <g class="sc-belt">${[0, 90, 180, 270, 360, 450].map((x, i) => box(x - 40, i % 2 ? 72 : 66, i % 2 ? 36 : 42)).join("")}</g>
      <rect x="0" y="120" width="420" height="5" fill="#081326"/>
      <g class="sc-float">${bubble(296, 16, 104, "Nowe zamówienie", RED, "#fff")}</g>
      <g class="sc-blink"><circle cx="40" cy="30" r="5" fill="#3DDC97"/></g><text x="52" y="34" font-family="Poppins,sans-serif" font-size="11" font-weight="600" fill="#fff" opacity=".8">wysyłka dziś</text>`,
    products: () => `
      ${[44, 92, 140].map((y) => `<rect x="150" y="${y}" width="250" height="6" rx="3" fill="#fff" opacity=".85"/>`).join("")}
      ${box(160, 18, 26)}${box(194, 22, 22, false)}${box(226, 14, 30)}${box(320, 20, 24, false)}${box(352, 16, 28)}
      ${box(170, 64, 30, false)}${box(212, 70, 22)}${box(290, 62, 32)}${box(336, 68, 26, false)}
      ${box(160, 112, 28)}${box(198, 116, 24)}${box(250, 108, 32, false)}${box(300, 116, 24)}${box(340, 110, 30)}
      <g transform="translate(60 20)"><g class="sc-swing"><path d="M30 0v14" stroke="#fff" stroke-width="2"/><path d="M8 14h44l10 22-10 22H8a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6Z" fill="${RED}"/><circle cx="50" cy="36" r="4" fill="${NAVY}"/><text x="26" y="34" text-anchor="middle" font-family="Poppins,sans-serif" font-size="12" font-weight="800" fill="#fff">-20%</text><text x="26" y="48" text-anchor="middle" font-family="Poppins,sans-serif" font-size="8" font-weight="600" fill="#fff" opacity=".8">MARŻA OK</text></g></g>`,
    suppliers: () => `
      <g class="sc-bob"><path d="M70 92h290l-26 34H100Z" fill="#fff"/><path d="M70 92h290l-4 6H74Z" fill="${RED}"/>
      ${[[96, RED], [134, "#fff"], [172, SKY], [210, RED], [248, "#fff"], [286, SKY]].map(([x, c], i) => `<rect x="${x}" y="${i % 2 ? 56 : 66}" width="36" height="${i % 2 ? 34 : 24}" rx="2" fill="${c}" opacity="${c === "#fff" ? .9 : 1}"/><rect x="${x}" y="${i % 2 ? 56 : 66}" width="36" height="4" fill="#000" opacity=".12"/>`).join("")}
      <rect x="320" y="46" width="22" height="46" rx="3" fill="#DCE6F5"/><rect x="324" y="52" width="14" height="8" rx="2" fill="${NAVY}"/>${hMark(312, 18, 26)}</g>
      <path d="M0 128q20-10 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0v30H0Z" fill="${SKY}" opacity=".35" class="sc-wave"/>
      <path d="M0 136q20-10 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0v30H0Z" fill="${SKY}" opacity=".55" class="sc-wave2"/>
      <g class="sc-spin"><circle cx="390" cy="28" r="14" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-dasharray="4 5"/></g>`,
    customers: () => `
      ${person(150, 128, RED, 1.15)}${person(230, 128, "#fff", 1.3)}${person(310, 128, SKY, 1.15)}
      <g class="sc-float">${bubble(80, 18, 118, "Dziękuję! ★★★★★")}</g>
      <g class="sc-float2">${bubble(250, 10, 108, "Kiedy paczka?", RED, "#fff")}</g>
      <g class="sc-pop d1"><path d="M380 70c-6-6-14 0-8 7l8 8 8-8c6-7-2-13-8-7Z" fill="${RED_L}"/></g>
      <g class="sc-pop d3"><path d="M60 80c-5-5-12 0-7 6l7 7 7-7c5-6-2-11-7-6Z" fill="#fff"/></g>`,
    tasks: () => `
      <rect x="120" y="10" width="200" height="132" rx="14" fill="#fff"/><rect x="190" y="2" width="60" height="16" rx="8" fill="${RED}"/>
      ${[0, 1, 2].map((i) => `<rect x="140" y="${36 + i * 32}" width="20" height="20" rx="5" fill="none" stroke="${NAVY}" stroke-width="2.5"/><path d="M144 ${46 + i * 32}l5 5 9-11" fill="none" stroke="${RED}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="sc-check ${i ? "d" + i : ""}"/><rect x="172" y="${40 + i * 32}" width="${110 - i * 18}" height="10" rx="5" fill="${NAVY}" opacity=".18" class="sc-grow ${i ? "d" + i : ""}"/>`).join("")}
      <g transform="translate(340 40)"><g class="sc-float"><circle r="26" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5"/><path d="M0-26a26 26 0 0 1 22 40" fill="none" stroke="${RED_L}" stroke-width="5" stroke-linecap="round"/><text y="5" text-anchor="middle" font-family="Poppins,sans-serif" font-size="13" font-weight="800" fill="#fff">73%</text></g></g>`,
    shops: () => `
      <rect x="40" y="56" width="170" height="84" rx="6" fill="#fff"/><g>${Array.from({ length: 7 }, (_, i) => `<path d="M${40 + i * 24.3} 40h24.3v18a12 12 0 0 1-24.3 0Z" fill="${i % 2 ? "#fff" : RED}"/>`).join("")}</g>
      <rect x="40" y="36" width="170" height="6" rx="3" fill="#fff"/><rect x="60" y="80" width="54" height="60" rx="4" fill="${SKY}" opacity=".6"/><rect x="128" y="80" width="66" height="34" rx="4" fill="${NAVY}" opacity=".15"/>${hMark(146, 84, 26)}
      <g transform="translate(300 40)"><g class="sc-float"><rect x="-34" y="0" width="68" height="56" rx="16" fill="#fff"/><rect x="-24" y="12" width="48" height="26" rx="10" fill="${NAVY}"/><circle cx="-10" cy="25" r="5" fill="#3DDC97" class="sc-blink"/><circle cx="10" cy="25" r="5" fill="#3DDC97" class="sc-blink"/><path d="M0 0v-14" stroke="#fff" stroke-width="3"/><circle cy="-18" r="5" fill="${RED}"/><rect x="-12" y="44" width="24" height="4" rx="2" fill="${RED}"/>
      <g class="sc-swing"><rect x="34" y="12" width="8" height="30" rx="4" fill="#fff"/></g><rect x="-26" y="62" width="52" height="40" rx="10" fill="#fff" opacity=".9"/></g></g>
      <g class="sc-float2">${bubble(340, 6, 70, "24/7", RED, "#fff")}</g>`,
    generator: () => `
      <rect x="90" y="8" width="270" height="138" rx="12" fill="#fff"/><rect x="90" y="8" width="270" height="22" rx="12" fill="#DCE6F5"/><rect x="90" y="22" width="270" height="8" fill="#DCE6F5"/>
      <circle cx="106" cy="19" r="4" fill="${RED}"/><circle cx="120" cy="19" r="4" fill="#E9B44C"/><circle cx="134" cy="19" r="4" fill="#3DDC97"/><rect x="150" y="13" width="140" height="12" rx="6" fill="#fff"/>
      <rect x="104" y="40" width="110" height="12" rx="4" fill="${NAVY}" class="sc-grow"/><rect x="104" y="58" width="80" height="8" rx="4" fill="${NAVY}" opacity=".3" class="sc-grow d1"/>
      <rect x="104" y="74" width="60" height="18" rx="9" fill="${RED}" class="sc-pop"/><g transform="translate(232 40)">${box(0, 0, 100)}</g>
      ${[0, 1, 2].map((i) => `<rect x="${104 + i * 84}" y="112" width="74" height="24" rx="6" fill="${NAVY}" opacity=".1" class="sc-grow d${i + 1}"/>`).join("")}
      <g class="sc-float"><path d="M380 50l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#fff"/></g><g class="sc-float2"><path d="M60 90l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="${RED_L}"/></g>`,
    mail: () => `
      ${[0, 1, 2].map((i) => `<g transform="translate(120 70)"><g class="sc-fly ${i ? "d" + i : ""}"><rect x="0" y="0" width="64" height="44" rx="6" fill="${i === 1 ? RED : "#fff"}"/><path d="M0 4l32 22 32-22" fill="none" stroke="${i === 1 ? "#fff" : NAVY}" stroke-width="3"/></g></g>`).join("")}
      <rect x="250" y="70" width="120" height="70" rx="12" fill="#fff"/><path d="M250 100h36l10 14h28l10-14h36" fill="none" stroke="${NAVY}" stroke-width="3"/><circle cx="360" cy="74" r="14" fill="${RED}"/><text x="360" y="79" text-anchor="middle" font-family="Poppins,sans-serif" font-size="13" font-weight="800" fill="#fff">+3</text>`,
    prompts: () => `
      <g class="sc-float">${bubble(70, 18, 170, "Zbuduj landing produktu…")}</g>
      <g transform="translate(150 66)"><g class="sc-float2"><rect width="220" height="66" rx="14" fill="${RED}"/><rect x="14" y="14" width="150" height="8" rx="4" fill="#fff" class="sc-grow"/><rect x="14" y="30" width="190" height="8" rx="4" fill="#fff" opacity=".7" class="sc-grow d1"/><rect x="14" y="46" width="110" height="8" rx="4" fill="#fff" opacity=".5" class="sc-grow d2"/></g></g>
      <g class="sc-pop"><path d="M390 30l5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" fill="#fff"/></g><g class="sc-pop d2"><path d="M60 100l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#fff"/></g>${hMark(26, 20, 34)}`
  };
  const svg = (k) => `<svg class="scene" viewBox="0 0 420 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${(S[k] || S.map)()}</svg>`;

  const BANNERS = {
    pulpit: ["map", "Centrala", "Od dostawcy do klienta w Polsce", "Cel miesiąca, zysk i to, co dziś wymaga uwagi — wszystko w jednym miejscu."],
    zamowienia: ["orders", "Zamówienia", "Każda paczka pod kontrolą", "Nowe → w realizacji → wysłane. Płatność prowadzimy osobno."],
    produkty: ["products", "Produkty", "Półka, która zarabia", "Koszt, cena, marża i status testu każdego produktu."],
    dostawcy: ["suppliers", "Dostawcy", "Pewny łańcuch dostaw", "AliExpress, CJ, hurtownie PL i UE — oceny, czasy i kontakty."],
    klienci: ["customers", "Klienci", "Obsługa po polsku, od serca", "Historia zakupów i kontakt z każdym klientem."],
    zadania: ["tasks", "Zadania", "Wspólny cel, jasny podział", "Przeciągaj karty, odhaczaj — panel świętuje razem z Wami."],
    "sklepy-i-boty": ["shops", "Sklepy i boty", "Sprzedajemy 24 godziny na dobę", "Kanały sprzedaży i automaty, które pracują, gdy śpicie."],
    generator: ["generator", "Generator stron", "Strona produktu w kilka minut", "Karta one-page z zestawami, Omnibusem i GPSR, gotowa do publikacji."],
    leady: ["mail", "Leady", "Zainteresowani klienci", "Adresy zostawione na Waszych stronach produktów."],
    wiadomosci: ["mail", "Wiadomości", "Komunikator zespołu", "Czat wspólników na żywo i pytania klientów z Waszych stron."],
    prompty: ["prompts", "Generator promptów", "Pomysł → prompt → strona", "Schematy sprzedażowe i obsługi klienta gotowe dla AI."]
  };

  let lastView = null;
  function banner(view) {
    const host = document.getElementById("vart");
    if (!host || view === lastView) return;
    lastView = view;
    const b = BANNERS[view] || BANNERS.pulpit;
    host.innerHTML = `<section class="vbanner enter"><div class="vb-grid"></div><div class="vb-txt"><div class="vb-eye">${b[1]}</div><h2>${b[2]}</h2><p>${b[3]}</p></div><div class="vb-art">${svg(b[0])}</div></section>`;
  }

  function gate() {
    return `<div class="g-art"><img class="g-logo" src="assets/brand/logo-white.svg" alt="Nowoczesny Handel Polski">
      <svg class="scene g-scene" viewBox="0 0 420 200" aria-hidden="true">${S.map()}<rect x="0" y="190" width="420" height="3" rx="1.5" fill="#fff" opacity=".25"/><g class="sc-drive">${truck(0, 152)}</g></svg>
      <div><h2>Nowoczesny handel.<br><em>Polska</em> obsługa.</h2><div class="g-tags"><span>📦 Dropshipping</span><span>🤝 Trójka wspólników</span><span>⚡ Decyzje w czasie rzeczywistym</span></div></div></div>`;
  }

  function intro() {
    if (reduced || sessionStorage.getItem("nhp-intro")) return;
    try { sessionStorage.setItem("nhp-intro", "1"); } catch (e) {}
    const el = document.createElement("div");
    el.className = "intro";
    el.innerHTML = `<div><svg viewBox="0 0 225 225"><rect class="box" width="225" height="225" rx="46.5" fill="#1D3A68" stroke="#fff" stroke-opacity=".25" stroke-width="4"/><rect class="leg" x="46.5" y="41.25" width="48" height="142.5" rx="6" fill="#fff"/><rect class="leg r" x="130.5" y="41.25" width="48" height="142.5" rx="6" fill="#fff"/><rect class="band" x="30" y="88.5" width="165" height="24" fill="#fff"/><rect class="band red" x="30" y="112.5" width="165" height="24" fill="${RED}"/></svg>
      <div class="word">Nowoczesny Handel<small>POLSKI</small></div></div>`;
    document.body.appendChild(el);
    sound("intro");
    setTimeout(() => el.remove(), 2200);
  }

  /* ---------- dźwięki (WebAudio, bez plików) ---------- */
  let ctx = null;
  const soundOn = () => { try { return localStorage.getItem("nhp-sound") !== "off"; } catch (e) { return true; } };
  function tone(f, t0, dur, type = "sine", vol = .08) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime + t0);
    g.gain.setValueAtTime(0, ctx.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + t0 + .015);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t0 + dur);
    o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + .05);
  }
  function sound(kind) {
    if (!soundOn()) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      if (kind === "win") { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * .09, .35, "triangle", .07)); }
      else if (kind === "intro") { tone(392, 0, .3, "triangle", .05); tone(587.33, .18, .5, "triangle", .05); }
      else if (kind === "nav") { tone(880, 0, .06, "sine", .02); }
      else { tone(660, 0, .12, "sine", .04); }
    } catch (e) {}
  }
  function toggleSound() {
    const next = !soundOn();
    try { localStorage.setItem("nhp-sound", next ? "on" : "off"); } catch (e) {}
    document.querySelectorAll(".snd-btn").forEach((b) => b.setAttribute("aria-pressed", String(next)));
    if (next) sound("pop");
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest(".snd-btn")) toggleSound();
    else if (e.target.closest("[data-nav]")) sound("nav");
  });
  document.addEventListener("DOMContentLoaded", () => document.querySelectorAll(".snd-btn").forEach((b) => b.setAttribute("aria-pressed", String(soundOn()))));

  window.NHP_BRAND = { banner, gate, intro, sound, svg };
})();
