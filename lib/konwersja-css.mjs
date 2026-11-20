export const KONWERSJA_CSS = `
:root{
  --bg:#fff;--ink:#141414;--muted:#5c5c5c;--line:#e7e7e7;--soft:#f5f5f5;
  --accent:#111;--accent-ink:#fff;--ok:#157a3a;--danger:#b42318;
  --font:Poppins,Manrope,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --max:1180px;--pad:16px;--header:60px;--radius:14px;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--font);-webkit-font-smoothing:antialiased}
img,svg{max-width:100%;height:auto;display:block}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
a{color:inherit}
h1,h2,h3,p{margin:0}
.w{width:min(var(--max),calc(100% - 32px));margin-inline:auto}
.pv{background:#fff6e8;color:#7a4b12;text-align:center;font-weight:600;font-size:13px;padding:8px 16px}
.sale{background:#111;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:600;letter-spacing:.02em}
.sale b{font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-right:8px}
.sale-time{display:inline-block;margin-left:8px;font-variant-numeric:tabular-nums}
.hd{position:sticky;top:0;z-index:30;height:var(--header);background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid transparent}
.hd.sc{border-bottom-color:var(--line)}
.hd .w{height:100%;display:flex;align-items:center;gap:12px}
.logo{text-decoration:none;font-weight:700;letter-spacing:.04em;font-size:15px}
.hd-r{margin-left:auto}
.icon-btn{width:42px;height:42px;border:1px solid var(--line);background:#fff;border-radius:12px;display:grid;place-items:center;position:relative}
.cart-n{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:99px;background:var(--accent);color:var(--accent-ink);font-size:11px;font-weight:700;display:grid;place-items:center}
.cart-n[hidden]{display:none!important}
.hero{padding:18px 0 36px}
.hero-w{display:grid;grid-template-columns:minmax(0,1fr);gap:22px;align-items:start}
.gallery,.buy,.hero-w>*{min-width:0;max-width:100%}
.gallery{display:grid;gap:10px;width:100%;max-width:100%;overflow:hidden}
.stage{position:relative;width:100%;max-width:100%;background:var(--soft);border-radius:18px;overflow:hidden;aspect-ratio:1/1}
.stage-art{position:absolute;inset:0;width:100%;height:100%;max-width:100%;overflow:hidden}
.stage-art[hidden]{display:none!important}
.stage-art img,.stage-art video{position:absolute;inset:0;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center}
.thumb img{width:100%;height:100%;object-fit:cover}
.stage-art.ph{display:grid;place-items:center;color:var(--muted);font-weight:600;padding:24px;text-align:center}
.thumbs{display:flex;gap:8px;align-items:center}
.thumbs-row{display:flex;gap:8px;overflow:auto;scrollbar-width:none;flex:1}
.thumbs-row::-webkit-scrollbar{display:none}
.thumb{flex:none;width:64px;height:64px;border-radius:10px;border:1px solid var(--line);padding:0;overflow:hidden;background:var(--soft)}
.thumb[aria-current="true"]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.nav-arrow{display:none;width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:#fff}
.buy{display:grid;gap:14px;align-content:start}
.rating{display:flex;align-items:center;gap:8px;font-size:13px}
.stars{color:#111;letter-spacing:1px;position:relative;display:inline-block}
.stars .bg{color:#ddd}
.stars .fg{position:absolute;left:0;top:0;overflow:hidden;color:#111}
.rating a,.rev a{color:var(--muted);text-underline-offset:3px}
h1{font-size:clamp(26px,3vw,36px);line-height:1.15;font-weight:650;letter-spacing:-.03em;overflow-wrap:anywhere}
.lead{color:#3a3a3a;font-size:15px}
.price-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.price{font-size:32px;font-weight:650;letter-spacing:-.03em}
.price s{color:var(--muted);font-size:18px;font-weight:500;margin-left:8px}
.omnibus{color:var(--muted);font-size:12px}
.perks{display:grid;gap:8px}
.perk{display:flex;gap:10px;align-items:flex-start}
.perk i{width:36px;height:36px;border-radius:50%;background:var(--soft);display:grid;place-items:center;flex:none}
.perk i svg{width:18px;height:18px}
.perk b{display:block;font-size:14px;font-weight:650;line-height:1.3}
.perk span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--muted);font-size:13px;line-height:1.35}
.buns{display:grid;gap:10px}
.bun{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;border:1px solid #dedede;border-radius:12px;padding:14px 14px 12px;background:#fff;cursor:pointer}
.bun input{position:absolute;opacity:0;pointer-events:none}
.bun.on,.bun:has(input:checked){border:2px solid var(--accent);padding:13px 13px 11px}
.bun-q{font-weight:650;font-size:15px}
.bun-p{text-align:right;font-weight:650}
.bun-p small{display:block;font-weight:500;color:var(--muted);font-size:12px}
.bun-gift{grid-column:1/-1;color:#333;font-size:12.5px}
.bun-badge{position:absolute;top:-9px;right:12px;background:var(--accent);color:var(--accent-ink);font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:99px;padding:3px 8px}
.var{border:0;margin:0;padding:0}
.var legend{font-size:13px;font-weight:650;margin-bottom:8px;padding:0}
.sws{display:flex;flex-wrap:wrap;gap:8px}
.swl{cursor:pointer}
.swl input{position:absolute;opacity:0}
.sw{width:28px;height:28px;border-radius:50%;background:var(--c,#ccc);box-shadow:0 0 0 1px var(--line);display:block}
.sw-t{display:inline-flex;align-items:center;height:32px;padding:0 10px;border-radius:99px;border:1px solid var(--line);font-size:13px;font-weight:600}
.swl:has(input:checked) .sw,.swl:has(input:checked) .sw-t{box-shadow:0 0 0 2px var(--accent)}
.stock{display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600}
.stock i{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 18%,transparent)}
.stock.is-out{color:var(--danger)}
.stock.is-out i{background:var(--danger);box-shadow:none}
.deal{display:flex;gap:8px;align-items:center;font-weight:650;font-size:14px}
.cta-row{display:grid;gap:8px}
.btn{appearance:none;border:0;border-radius:10px;background:var(--accent);color:var(--accent-ink);font-weight:650;padding:16px 18px;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;width:100%}
.btn--ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn[disabled]{opacity:.45}
.ship{background:var(--soft);border-radius:12px;padding:12px 14px;display:grid;gap:10px;font-size:13px}
.ship-cd{display:flex;gap:8px;align-items:flex-start;font-weight:600}
.tl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}
.tl b{display:block;font-size:12px}
.tl span{color:var(--muted);font-size:12px}
.pays{display:flex;flex-wrap:wrap;gap:6px;align-items:center;color:var(--muted);font-size:12px}
.pay{border:1px solid var(--line);border-radius:7px;padding:4px 8px;font-weight:700;font-size:11px;color:var(--ink);background:#fff}
.trustbar{background:var(--soft);padding:22px 0}
.trustbar .w{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;justify-content:center}
.trustbar .k{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:650}
.trustbar b{font-weight:650;font-size:14px}
.sec{padding:48px 0}
.sec h2{font-size:clamp(24px,4vw,34px);letter-spacing:-.03em;font-weight:650;margin-bottom:8px}
.sec .sub{color:var(--muted);margin-bottom:18px}
.ugcs{display:flex;gap:12px;overflow:auto;scroll-snap-type:x mandatory;padding-bottom:6px}
.ugc{margin:0;flex:none;width:min(220px,70vw);scroll-snap-align:start;position:relative;border-radius:16px;overflow:hidden;background:#1c1c1c;color:#fff;aspect-ratio:9/16}
.ugc img,.ugc video{width:100%;height:100%;object-fit:cover}
.ugc-play{position:absolute;inset:0;border:0;background:transparent;color:#fff;display:grid;place-items:center}
.ugc-play span{width:54px;height:54px;border-radius:50%;background:rgba(0,0,0,.55);display:grid;place-items:center}
.ugc figcaption{position:absolute;left:0;right:0;bottom:0;padding:28px 12px 12px;background:linear-gradient(transparent,rgba(0,0,0,.72));font-size:13px}
.revs{display:flex;gap:12px;overflow:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.rev{flex:none;width:min(320px,82vw);scroll-snap-align:start;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#fff;display:grid;align-content:start}
.rev img{width:100%;height:180px;object-fit:cover;background:var(--soft)}
.rev .pad{padding:14px 14px 16px;display:grid;gap:8px}
.rev q{font-size:14px;quotes:none}
.rev .who{font-size:13px;font-weight:650}
.rev-nav{display:flex;gap:8px}
.rev-nav button,.nav-arrow{width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:#fff}
.sh{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:14px}
.cmp-visual{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.cmp-visual figure{margin:0}
.cmp-visual img,.cmp-visual .blank{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:14px;background:var(--soft)}
.cmp-visual figcaption{margin-top:6px;font-size:13px;font-weight:650}
.cmp{overflow:auto;border:1px solid var(--line);border-radius:14px}
.cmp table{width:100%;border-collapse:collapse;min-width:520px}
.cmp th,.cmp td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);font-size:14px;vertical-align:top}
.cmp th{font-size:13px;background:var(--soft)}
.cmp td:nth-child(2){font-weight:650}
.steps{display:grid;gap:28px}
.step{display:grid;gap:14px;align-items:center}
.step-pic{position:relative;width:100%;max-width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:16px;background:var(--soft)}
.step-pic img{position:absolute;inset:0;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center}
.step h3{font-size:clamp(20px,2.4vw,28px);font-weight:650;letter-spacing:-.02em;margin-bottom:8px}
.step p{color:#333;font-size:15px}
.specs{margin-top:28px;border-top:1px solid var(--line)}
.spec{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}
.spec span{color:var(--muted)}
.acc{border-top:1px solid var(--line)}
.acc-item{border-bottom:1px solid var(--line)}
.acc-item button{width:100%;text-align:left;background:none;border:0;padding:16px 0;display:flex;justify-content:space-between;gap:12px;font-weight:650;font-size:16px}
.acc-item .a{color:#333;padding:0 0 16px;max-width:68ch}
.ph-slot{border:1.5px dashed #c8c8c8;border-radius:14px;padding:18px;background:#fafafa;color:#555}
.ph-slot b{display:block;margin-bottom:4px;color:#111}
.stab{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(255,255,255,.96);border-top:1px solid var(--line);padding:10px 12px calc(10px + env(safe-area-inset-bottom));transform:translateY(110%);transition:transform .2s}
.stab.on{transform:none}
.stab .w{display:flex;align-items:center;gap:12px;width:min(var(--max),100%)}
.stab .meta{min-width:0;display:grid}
.stab .meta b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.stab .btn{width:auto;padding:12px 16px;flex:none}
.ft{background:#111;color:#ddd;padding:36px 0 28px;font-size:13px}
.ft a,.ft button{color:#fff;background:none;border:0;padding:0;text-decoration:underline;font:inherit;cursor:pointer}
.ft-top{display:grid;gap:18px}
.ft h3{color:#fff;font-size:14px;margin-bottom:6px}
.legal{display:flex;flex-wrap:wrap;gap:10px 14px;margin-top:10px}
.ft-bot{border-top:1px solid #333;margin-top:18px;padding-top:12px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.contact-w{display:grid;gap:16px}
.ct-f,.drawer-p{display:grid;gap:10px}
.ct-f input,.ct-f textarea,.ct-f select,.drawer input,.drawer textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:12px;background:#fff}
.ct-row{display:grid;gap:10px}
.form-err{color:var(--danger);font-weight:650}
.form-ok{background:#f3faf5;border-radius:12px;padding:14px}
.hp{position:absolute;left:-9999px}
.drawer{position:fixed;inset:0;z-index:80}
.drawer[hidden]{display:none!important}
.drawer-bg{position:absolute;inset:0;background:rgba(0,0,0,.45)}
.drawer-p{position:absolute;top:0;right:0;bottom:0;width:min(460px,100%);background:#fff;overflow:auto;padding:18px 18px 28px}
.drawer-h{display:flex;justify-content:space-between;align-items:center}
.x{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:#fff}
.sum{display:flex;justify-content:space-between;gap:8px;background:var(--soft);border-radius:12px;padding:12px}
.paysel{display:flex;flex-wrap:wrap;gap:8px}
.paysel label,.chk{display:flex;gap:8px;align-items:flex-start;font-size:14px}
.toast{position:fixed;top:72px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;font-weight:650;opacity:0;pointer-events:none;z-index:90}
.toast.on{opacity:1}
.botb{position:fixed;right:12px;bottom:12px;z-index:50;border:0;border-radius:99px;background:#111;color:#fff;font-weight:650;padding:12px 14px}
.botp{position:fixed;right:12px;bottom:12px;z-index:55;width:min(360px,calc(100% - 24px));max-height:70vh;background:#fff;border:1px solid var(--line);border-radius:16px;display:flex;flex-direction:column;overflow:hidden}
.botp[hidden],.ckb[hidden]{display:none!important}
.botp-h,.botp-f{display:flex;gap:8px;align-items:center;padding:10px;border-bottom:1px solid var(--line)}
.botp-f{border-bottom:0;border-top:1px solid var(--line)}
.botp-l{padding:10px;overflow:auto;display:grid;gap:8px}
.bm{background:var(--soft);border-radius:12px;padding:8px 10px;font-size:14px}
.botq{display:flex;flex-wrap:wrap;gap:6px}
.botq button{border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 8px;font-size:12px}
.ckb{position:fixed;left:12px;right:12px;bottom:12px;z-index:70;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;gap:10px;max-width:520px;margin-inline:auto}
.lgd{border:0;border-radius:16px;width:min(680px,calc(100% - 24px));max-height:80vh}
.lgd::backdrop{background:rgba(0,0,0,.45)}
.lgd-c{padding:8px 22px 22px;font-size:14px;line-height:1.55}
@media(min-width:800px){
  .step{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px}
  .step.flip .step-pic{order:2}
}
@media(min-width:900px){
  .hero-w{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:40px}
  .gallery{position:sticky;top:calc(var(--header) + 16px)}
  .nav-arrow{display:grid;place-items:center}
  .stab{display:none}
  .ct-row{grid-template-columns:1fr 1fr}
  .ft-top{grid-template-columns:1.1fr 1fr 1fr}
  .contact-w{grid-template-columns:.8fr 1.2fr;align-items:start}
}
`;
