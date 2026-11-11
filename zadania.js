/* Zadania w stylu Asany + Lista zmian („kto co zrobił”).
   Wszystko to rekordy w public.records (te same RLS i realtime co reszta CRM):
     tasks      — zadania (rozszerzone: kategoria, zlecający, akceptujący, podzadania, następny krok, czas…)
     taskcats   — kategorie zadań (nazwa, kolor, emoji)
     tcomments  — komentarze pod zadaniami
     worklog    — wpisy czasu pracy (kto, ile minut, nad czym)
     tasklog    — historia zadań (kto co zmienił)
     updates    — wpisy listy zmian: jak było → jak jest → co to da → plusy → minusy
     shifts     — czas w pracy: „Zaczynam pracę” → „Kończę pracę” (kto, od, do, co zrobił)
   Podpięcie: <script src="zadania.js"></script> obok chat.js / oferty.js (przed config.js). */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("tk-css")) return;
    const css = document.createElement("style");
    css.id = "tk-css";
    css.textContent = `
      .tk-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:-6px 0 14px;overflow-x:auto;scrollbar-width:none}
      .tk-tabs button{border:0;background:none;padding:10px 14px;font-weight:700;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px;white-space:nowrap;display:inline-flex;gap:7px;align-items:center}
      .tk-tabs button[aria-pressed="true"]{color:var(--ink);border-bottom-color:var(--red)}
      .tk-tabs .n{font-size:11px;background:var(--red);color:#fff;border-radius:99px;padding:0 7px}
      .tk-sum{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
      .tk-sum div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:8px 14px;font-size:13px;color:var(--muted);font-weight:600}
      .tk-sum b{font-family:var(--display);font-size:18px;color:var(--ink);margin-right:4px}
      .tk-sum .bad b{color:var(--bad)}.tk-sum .vio b{color:var(--violet)}.tk-sum .ok b{color:var(--good)}
      .tk-timer{display:inline-flex;align-items:center;gap:8px;background:var(--navy);color:#fff;border-radius:99px;padding:6px 8px 6px 14px;font-weight:700;font-size:13px;box-shadow:inset 0 -3px 0 var(--red)}
      .tk-timer button{border:0;border-radius:99px;padding:4px 10px;font-weight:700;cursor:pointer;background:var(--red);color:#fff}
      .tk-timer .t{font-variant-numeric:tabular-nums}
      .tk-list{overflow:hidden}
      .tk-lh,.tk-row{display:grid;grid-template-columns:30px minmax(0,1fr) 40px 96px 92px 160px 88px;gap:8px;align-items:center;padding:0 14px}
      .tk-lh{font:700 11px var(--display);text-transform:uppercase;letter-spacing:.08em;color:var(--muted);background:var(--surface-2);border-bottom:2px solid var(--line);padding-top:10px;padding-bottom:10px}
      .tk-sech{display:flex;align-items:center;gap:9px;width:100%;border:0;background:none;padding:14px 14px 8px;font:700 15px var(--display);cursor:pointer;text-align:left;color:var(--ink)}
      .tk-sech .cnt{color:var(--muted);font:600 12px var(--body)}
      .tk-sech .chev{width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);transition:transform .15s;margin-right:2px}
      .tk-sec.fold .tk-sech .chev{transform:rotate(-45deg)}
      .tk-sec.fold .tk-row,.tk-sec.fold .tk-add{display:none}
      .tk-sec.tk-over{background:color-mix(in srgb,var(--accent) 7%,transparent)}
      .tk-row{border-top:1px solid var(--line);min-height:46px;cursor:pointer;transition:background .12s}
      .tk-row:hover,.tk-row:focus-visible{background:var(--surface-2)}
      .tk-row.sel{background:color-mix(in srgb,var(--info) 10%,var(--surface))}
      .tk-row .tk-name{min-width:0;padding:7px 0}
      .tk-row .tk-name .t{font-weight:600;overflow-wrap:anywhere}
      .tk-row.done .tk-name .t{text-decoration:line-through;color:var(--muted)}
      .tk-row .tk-name small{display:block;color:var(--muted);font-size:12px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tk-b{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:99px;padding:0 7px;line-height:18px}
      .tk-b.warn{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}
      .tk-b.run{color:#fff;background:var(--red);border-color:var(--red)}
      .tk-chk{width:22px;height:22px;border-radius:50%;border:2px solid var(--grey);background:transparent;display:grid;place-items:center;cursor:pointer;color:transparent;padding:0;transition:all .15s}
      .tk-chk:hover{border-color:var(--good);color:var(--good)}
      .tk-chk.on{background:var(--good);border-color:var(--good);color:#fff}
      .tk-chk.rev{border-color:var(--violet);color:var(--violet);border-style:dashed}
      .tk-due{font-size:13px;font-weight:600;color:var(--muted)}
      .tk-due.late{color:var(--bad)}.tk-due.today{color:var(--good)}.tk-due.soon{color:var(--warn)}
      .tk-cat{display:inline-flex;align-items:center;gap:5px;max-width:100%;font-size:12px;font-weight:700;padding:2px 9px;border-radius:99px;background:color-mix(in srgb,var(--c) 16%,transparent);color:color-mix(in srgb,var(--c) 70%,var(--ink));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tk-time{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;text-align:right}
      .tk-time.over{color:var(--bad);font-weight:700}
      .tk-add{padding:6px 14px 10px 52px;border-top:1px solid var(--line)}
      .tk-add input{width:100%;border:1px dashed var(--line);background:transparent;border-radius:10px;padding:8px 11px;font-size:14px}
      .tk-add input:focus{outline:2px solid color-mix(in srgb,var(--accent) 50%,transparent);border-style:solid;background:var(--surface)}
      .tk-hint{font-size:12px;color:var(--muted);margin:8px 2px 0}
      .tk-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,1fr);gap:14px;overflow-x:auto;padding-bottom:8px;align-items:start}
      .tk-col{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r);padding:10px;min-height:200px;transition:background .15s,border-color .15s}
      .tk-col.tk-over{background:color-mix(in srgb,var(--accent) 10%,var(--surface-2));border-color:var(--accent)}
      .tk-colh{display:flex;align-items:center;gap:8px;font:700 14px var(--display);padding:4px 4px 10px}
      .tk-colh .cnt{margin-left:auto;color:var(--muted);font:600 12px var(--body)}
      .tk-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 12px;margin-bottom:9px;cursor:grab;box-shadow:var(--shadow);border-top:4px solid var(--c,var(--line));transition:transform .15s}
      .tk-card:hover{transform:translateY(-2px)}
      .tk-card.done .t{text-decoration:line-through;opacity:.6}
      .tk-card .t{font-weight:700;font-size:14px;display:flex;gap:8px;align-items:flex-start}
      .tk-card .t .tk-chk{width:19px;height:19px;flex:none;margin-top:1px}
      .tk-card .m{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--muted)}
      .tk-card .m .r{margin-left:auto;display:flex;gap:6px;align-items:center}
      .tk-prog{height:5px;border-radius:99px;background:var(--surface-2);overflow:hidden;margin-top:8px}
      .tk-prog i{display:block;height:100%;background:var(--good)}
      .tk-dragging{opacity:.45}
      .tk-cal-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}
      .tk-cal-h h2{font-size:20px;min-width:190px;text-align:center}
      .tk-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:var(--line);gap:1px}
      .tk-cal .dh{background:var(--surface-2);font:700 11px var(--display);text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:8px;text-align:center}
      .tk-day{background:var(--surface);min-height:112px;padding:6px;display:flex;flex-direction:column;gap:3px;position:relative}
      .tk-day.out{background:var(--surface-2);opacity:.6}
      .tk-day.now{box-shadow:inset 0 0 0 2px var(--red)}
      .tk-day .dn{font-size:12px;font-weight:700;color:var(--muted)}
      .tk-day.now .dn{color:var(--red)}
      .tk-day .plus{position:absolute;right:5px;top:4px;border:0;background:none;color:var(--muted);cursor:pointer;opacity:0;font-size:16px;line-height:1}
      .tk-day:hover .plus{opacity:1}
      .tk-day.tk-over{background:color-mix(in srgb,var(--accent) 10%,var(--surface))}
      .tk-ct{display:block;width:100%;text-align:left;border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 12%,var(--surface));border-radius:5px;padding:2px 6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
      .tk-ct.done{text-decoration:line-through;opacity:.55}
      .tk-ct.late{color:var(--bad)}
      .tk-drawer{position:fixed;top:0;right:0;bottom:0;width:min(600px,100%);background:var(--surface);border-left:1px solid var(--line);box-shadow:-20px 0 60px -20px rgba(7,18,38,.45);z-index:35;display:flex;flex-direction:column;animation:tkIn .2s ease}
      @keyframes tkIn{from{transform:translateX(30px);opacity:.4}}
      .tk-dh{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;background:var(--surface-2)}
      .tk-dh .sp{flex:1}
      .tk-dh .btn{padding:7px 12px;font-size:13px}
      .tk-dh .btn.okb{background:var(--good);border-color:var(--good);color:#fff}
      .tk-dh .btn.vio{background:var(--violet);border-color:var(--violet);color:#fff}
      .tk-dh .info{font-size:13px;font-weight:700;color:var(--violet)}
      .tk-db{flex:1;overflow-y:auto;padding:16px 20px 30px}
      .tk-db .crumb{font-size:12px;color:var(--muted);font-weight:600;margin-bottom:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .tk-title{width:100%;border:1px solid transparent;background:transparent;border-radius:10px;font:700 22px/1.25 var(--display);padding:6px 8px;margin:0 -8px;resize:none;overflow:hidden;color:var(--ink)}
      .tk-title:hover{border-color:var(--line)}.tk-title:focus{border-color:var(--accent);outline:none;background:var(--surface-2)}
      .tk-fields{display:grid;grid-template-columns:150px minmax(0,1fr);gap:6px 12px;align-items:center;margin:12px 0 18px}
      .tk-fields > label{font-size:13px;color:var(--muted);font-weight:600}
      .tk-fields select,.tk-fields input{border:1px solid transparent;background:transparent;border-radius:9px;padding:6px 8px;width:100%;max-width:300px}
      .tk-fields select:hover,.tk-fields input:hover{border-color:var(--line);background:var(--surface-2)}
      .tk-fields select:focus,.tk-fields input:focus{border-color:var(--accent);outline:none;background:var(--surface-2)}
      .tk-h{font:700 14px var(--display);margin:20px 0 8px;display:flex;align-items:center;gap:8px}
      .tk-h .muted{font:600 12px var(--body)}
      .tk-ta{width:100%;border:1px solid var(--line);background:var(--surface-2);border-radius:10px;padding:9px 11px;min-height:70px;resize:vertical}
      .tk-ta:focus,.tk-in:focus{outline:2px solid color-mix(in srgb,var(--accent) 50%,transparent);border-color:var(--accent)}
      .tk-in{border:1px solid var(--line);background:var(--surface-2);border-radius:10px;padding:8px 10px;width:100%}
      .tk-next{border:1px solid color-mix(in srgb,var(--info) 40%,var(--line));background:color-mix(in srgb,var(--info) 8%,var(--surface));border-radius:12px;padding:10px 12px}
      .tk-next label{font-size:12px;font-weight:700;color:var(--info);display:block;margin-bottom:4px}
      .tk-next input{border:0;background:transparent;width:100%;padding:2px 0;font-weight:600}
      .tk-next input:focus{outline:none}
      .tk-sub{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line)}
      .tk-sub .tk-chk{width:19px;height:19px;flex:none}
      .tk-sub input.tx{flex:1;border:0;background:transparent;padding:4px 2px;min-width:0}
      .tk-sub.done input.tx{text-decoration:line-through;color:var(--muted)}
      .tk-sub select{border:0;background:transparent;font-size:12px;max-width:110px;color:var(--muted)}
      .tk-sub input[type=date]{border:0;background:transparent;font-size:12px;color:var(--muted);max-width:130px}
      .tk-x{border:0;background:none;color:var(--muted);cursor:pointer;padding:2px 6px;border-radius:6px;font-size:14px}
      .tk-x:hover{background:var(--surface-2);color:var(--bad)}
      .tk-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .tk-chip{display:inline-flex;align-items:center;gap:4px;background:var(--surface-2);border:1px solid var(--line);border-radius:99px;padding:2px 4px 2px 10px;font-size:12px;font-weight:600}
      .tk-chip.done{text-decoration:line-through;opacity:.6}
      .tk-tbar{height:10px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line);overflow:hidden;margin:4px 0 8px}
      .tk-tbar i{display:block;height:100%;background:linear-gradient(var(--navy) 0 50%,var(--red) 50%)}
      .tk-tbar.over i{background:var(--bad)}
      .tk-wl{display:flex;gap:8px;align-items:center;font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)}
      .tk-wl .h{font-weight:700;font-variant-numeric:tabular-nums;min-width:64px}
      .tk-wl .n{flex:1;color:var(--muted);min-width:0;overflow-wrap:anywhere}
      .tk-wlf{display:grid;grid-template-columns:110px 140px 1fr auto;gap:6px;margin-top:8px}
      .tk-feed{display:flex;flex-direction:column;gap:10px}
      .tk-ev{display:flex;gap:9px;font-size:13px;color:var(--muted);align-items:flex-start}
      .tk-ev b{color:var(--ink)}
      .tk-cm{display:flex;gap:9px;align-items:flex-start}
      .tk-cm .bx{flex:1;background:var(--surface-2);border:1px solid var(--line);border-radius:4px 14px 14px 14px;padding:8px 12px;font-size:14px;min-width:0}
      .tk-cm .bx .hd{font-size:12px;color:var(--muted);margin-bottom:2px;display:flex;gap:6px}
      .tk-cm .bx .tx{white-space:pre-wrap;overflow-wrap:anywhere}
      .tk-ment{font-weight:700;background:color-mix(in srgb,var(--red) 16%,transparent);border-radius:5px;padding:0 3px}
      .tk-cmf{display:flex;gap:8px;margin-top:10px;align-items:flex-end}
      .tk-cmf textarea{flex:1;min-height:44px}
      .tk-df{border-top:1px solid var(--line);padding:10px 16px;background:var(--surface-2);font-size:12px;color:var(--muted)}
      .tk-kid{display:grid;gap:10px;grid-column:1/-1;background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
      .tk-kid .f textarea{min-height:52px}
      .tk-kid summary{font-weight:700;cursor:pointer}
      .tk-kid p{margin:0;color:var(--muted);font-size:13px}
      .tk-period{display:flex;gap:6px;flex-wrap:wrap}
      .tk-people{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px}
      .tk-pc{padding:16px;position:relative;overflow:hidden}
      .tk-pc::after{content:"";position:absolute;left:0;top:0;right:0;height:5px;background:var(--pc)}
      .tk-pc .who{display:flex;align-items:center;gap:10px}
      .tk-pc .who b{font:700 18px var(--display)}
      .tk-pc .who small{display:block;color:var(--muted);font-size:12px}
      .tk-pc .nums{display:grid;grid-template-columns:1.7fr 1fr 1fr;gap:8px;margin:12px 0}
      .tk-pc .nums div{background:var(--surface-2);border-radius:10px;padding:8px}
      .tk-pc .nums strong{display:block;font:700 20px var(--display);white-space:nowrap}
      .tk-pc .nums span{font-size:11px;color:var(--muted);font-weight:600}
      .tk-share{height:8px;border-radius:99px;background:var(--surface-2);overflow:hidden;margin-bottom:10px}
      .tk-share i{display:block;height:100%;background:var(--pc)}
      .tk-pcat{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 0}
      .tk-pcat .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tk-pcat .bar{width:70px;height:6px;border-radius:99px;background:var(--surface-2);overflow:hidden}
      .tk-pcat .bar i{display:block;height:100%;background:var(--c)}
      .tk-pcat .v{font-weight:700;font-variant-numeric:tabular-nums;min-width:56px;text-align:right}
      .tk-mx td,.tk-mx th{text-align:right}.tk-mx td:first-child,.tk-mx th:first-child{text-align:left}
      .tk-mx tbody tr{cursor:default}
      .tk-mx .z{color:var(--muted);opacity:.5}
      .tk-dayh{font:700 13px var(--display);text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:20px 0 8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .tk-dayh::after{content:"";flex:1;height:1px;background:var(--line)}
      .tk-dayh span{font:600 12px var(--body);letter-spacing:0;text-transform:none}
      .tk-line{display:flex;gap:10px;align-items:center;padding:8px 12px;font-size:14px;border-bottom:1px solid var(--line)}
      .tk-line:last-child{border-bottom:0}
      .tk-line .tx{flex:1;min-width:0;overflow-wrap:anywhere}
      .tk-line .tm{font-size:12px;color:var(--muted);white-space:nowrap}
      .tk-line .ico{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--c,var(--grey)) 16%,transparent);flex:none;font-size:14px}
      .tk-linkb{border:0;background:none;padding:0;color:inherit;font-weight:700;cursor:pointer;text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px}
      .tk-cats-row{display:grid;grid-template-columns:54px 1fr 52px 30px;gap:8px;align-items:center;grid-column:1/-1}
      .tk-cats-row input{border:1px solid var(--line);background:var(--surface-2);border-radius:9px;padding:7px 9px;width:100%}
      .tk-cats-row input[type=color]{padding:2px;height:36px}
      .tk-me{display:flex;gap:16px;align-items:center;padding:16px 20px;margin-bottom:14px;flex-wrap:wrap}
      .tk-me h2{font-size:20px}
      .tk-me p{margin:2px 0 0;color:var(--muted)}
      .tk-rv{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}.tk-name .tk-rv{margin-left:0}
      .tk-rv .btn{padding:4px 10px;font-size:12px}
      #tkShift{position:sticky;top:0;z-index:30;padding:10px clamp(16px,3vw,36px) 0}
      .tk-shbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 10px 9px 16px;border-radius:14px;font-size:15px;box-shadow:var(--shadow)}
      .tk-shbar.on{background:color-mix(in srgb,var(--good) 18%,var(--surface));border:2px solid color-mix(in srgb,var(--good) 55%,transparent)}
      .tk-shbar.off{background:var(--surface);border:2px dashed color-mix(in srgb,var(--warn) 60%,var(--line))}
      .tk-shbar .tk-sht{flex:1;min-width:0}
      .tk-shbar .clk{font:700 17px var(--display);font-variant-numeric:tabular-nums}
      .tk-dot{width:12px;height:12px;border-radius:50%;background:var(--grey);flex:none}
      .tk-shbar.on .tk-dot{background:var(--good);box-shadow:0 0 0 0 color-mix(in srgb,var(--good) 60%,transparent);animation:tkPulse 1.8s infinite}
      .tk-shbar.off .tk-dot{background:var(--warn)}
      @keyframes tkPulse{70%{box-shadow:0 0 0 9px transparent}}
      .tk-shw{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
      .tk-shw span{margin-right:4px}
      .btn.tk-stop{background:var(--bad);border-color:var(--bad);color:#fff;font-weight:700}
      .btn.tk-stop:hover{filter:brightness(1.08);background:var(--bad)}
      .btn.tk-go{background:var(--good);border-color:var(--good);color:#fff;box-shadow:none;font-weight:700}
      .btn.tk-go:hover{background:var(--good);border-color:var(--good);filter:brightness(1.08)}
      .tk-ask p{margin:0 0 6px}
      .tk-early summary{cursor:pointer;color:var(--muted);font-size:13px;font-weight:600}
      .tk-early input{margin-top:6px;max-width:160px}
      .tk-stage{font:700 12px var(--display);padding:3px 10px;border-radius:99px;white-space:nowrap;background:var(--surface-2);border:1px solid var(--line)}
      .tk-stage.live{color:var(--good);border-color:color-mix(in srgb,var(--good) 45%,transparent)}
      .tk-stage.pending{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
      .tk-stage.plan{color:var(--info);border-color:color-mix(in srgb,var(--info) 45%,transparent)}
      .tk-ask .big{font:700 26px var(--display);margin-bottom:8px}
      .tk-sel{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:7px 10px;font-weight:600}
      .tk-sh{display:flex;align-items:center;gap:10px;margin:22px 0 12px}
      .tk-sh h2{font-size:22px}
      .tk-pc .tk-live{display:block;color:var(--good);font-size:13px;font-weight:700}
      .tk-pc.live{box-shadow:0 0 0 2px color-mix(in srgb,var(--good) 50%,transparent),var(--shadow)}
      .tk-mxd{margin:0 0 6px}
      @media(max-width:860px){#tkShift{position:fixed;left:0;right:0;bottom:0;top:auto;padding:0 8px 8px}.tk-shbar{font-size:14px;gap:8px}.tk-shw{display:none}body{padding-bottom:76px}.toasts{bottom:84px}}
      .tk-new{background:var(--red);color:#fff;font:800 12px var(--display);padding:3px 10px;border-radius:99px;letter-spacing:.08em}
      .tk-u{background:var(--surface);border:1px solid var(--line);border-top:6px solid var(--c);border-radius:20px;box-shadow:var(--shadow);padding:18px 22px 20px;margin-bottom:18px}
      .tk-u.new{box-shadow:0 0 0 3px color-mix(in srgb,var(--red) 45%,transparent),var(--shadow)}
      .tk-u header{display:flex;gap:12px;align-items:center}
      .tk-u .who{flex:1;min-width:0}
      .tk-u .who b{display:block;font:700 16px var(--display)}
      .tk-u .who span{color:var(--muted);font-size:13px}
      .tk-u h3{font-size:clamp(20px,2.2vw,25px);margin:14px 0;line-height:1.25}
      .tk-u ul{margin:0;padding-left:20px}.tk-u li{margin:3px 0}.tk-u p{margin:0}
      .tk-u .lb{font:800 13px var(--display);letter-spacing:.12em;margin-bottom:6px}
      .tk-bj{display:grid;grid-template-columns:1fr 44px 1fr;gap:10px;align-items:stretch}
      .tk-bj .was,.tk-bj .is{border-radius:16px;padding:14px 16px;font-size:16px;line-height:1.5}
      .tk-bj .was{background:color-mix(in srgb,var(--bad) 11%,var(--surface));border:2px solid color-mix(in srgb,var(--bad) 35%,transparent)}
      .tk-bj .is{background:color-mix(in srgb,var(--good) 12%,var(--surface));border:2px solid color-mix(in srgb,var(--good) 45%,transparent)}
      .tk-bj .was .lb{color:var(--bad)}.tk-bj .is .lb{color:var(--good)}
      .tk-bj .arr{display:grid;place-items:center;font-size:30px;color:var(--muted)}
      .tk-gives{margin-top:10px;border-radius:16px;padding:14px 16px;background:color-mix(in srgb,var(--info) 12%,var(--surface));border:2px solid color-mix(in srgb,var(--info) 38%,transparent);font-size:17px;font-weight:600;line-height:1.45}
      .tk-gives .lb{color:var(--info)}
      .tk-pmx{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .tk-pmx > div{border-radius:16px;padding:12px 16px;font-size:15px;background:var(--surface-2);border:1px solid var(--line)}
      .tk-pmx .pl .lb{color:var(--good)}.tk-pmx .mi .lb{color:var(--bad)}
      .tk-u footer{margin-top:12px;font-size:13px;color:var(--muted)}
      .tk-hist{margin-top:24px}
      .tk-hist summary{padding:16px 18px;font:700 16px var(--display);cursor:pointer}
      @media(max-width:640px){.tk-bj{grid-template-columns:1fr}.tk-bj .arr{transform:rotate(90deg);height:26px}.tk-pmx{grid-template-columns:1fr}.tk-u{padding:16px}}
      @media(max-width:1100px){.tk-lh,.tk-row{grid-template-columns:30px minmax(0,1fr) 36px 90px 140px}.tk-row > .c-prio,.tk-row > .c-time,.tk-lh > .c-prio,.tk-lh > .c-time{display:none}}
      @media(max-width:860px){.tk-people{grid-template-columns:1fr}.tk-day{min-height:78px}.tk-ct{font-size:11px}}
      @media(max-width:640px){
        .tk-lh{display:none}
        .tk-row{grid-template-columns:30px minmax(0,1fr) auto;row-gap:0;padding:6px 12px}
        .tk-row > .c-cat{display:none}
        .tk-row > .c-who{grid-column:3;grid-row:1}
        .tk-row > .c-due{grid-column:2;grid-row:2;padding-bottom:4px}
        .tk-add{padding-left:14px}
        .tk-fields{grid-template-columns:110px minmax(0,1fr)}
            .tk-wlf{grid-template-columns:1fr 1fr}
        .tk-cal .dh{padding:6px 2px;font-size:10px;letter-spacing:0}
        .tk-day{padding:3px;min-height:64px}
        .tk-ct{padding:1px 3px;font-size:10px}
      }
    `;
    document.head.appendChild(css);

    /* ---------- dane ---------- */
    const NEW_COLS = ["taskcats", "tcomments", "worklog", "tasklog", "updates", "shifts"];
    NEW_COLS.forEach((c) => { if (!CRM.COLS.includes(c)) CRM.COLS.push(c); CRM.S[c] = CRM.S[c] || {}; });
    const zi = CRM.VIEWS.findIndex((v) => v[0] === "zadania");
    CRM.VIEWS.splice(zi >= 0 ? zi + 1 : CRM.VIEWS.length, 0, ["zmiany", "Lista zmian i update'y", "inbox"]);
    CRM.VIEW_FNS.zadania = vTasks;
    CRM.VIEW_FNS.zmiany = vChanges;
    const coreStatus = (CRM.SCHEMA.tasks.fields.find((f) => f.k === "status") || {}).opts;
    if (coreStatus && !coreStatus.some((o) => o[0] === "review")) coreStatus.splice(2, 0, ["review", "Do akceptacji", "var(--violet)"]);

    const ST = [["todo", "Do zrobienia", "var(--info)"], ["doing", "W trakcie", "var(--warn)"], ["review", "Do akceptacji", "var(--violet)"], ["done", "Zrobione", "var(--good)"]];
    const PR = [["wysoki", "Wysoki", "var(--bad)"], ["sredni", "Średni", "var(--warn)"], ["niski", "Niski", "var(--grey)"]];
    const RECUR = [["", "Nie powtarzaj"], ["daily", "Codziennie"], ["weekly", "Co tydzień"], ["monthly", "Co miesiąc"]];
    const KINDS = [["zmiana", "Zmiana / ulepszenie", "var(--good)", "✨"], ["praca", "Wykonana praca", "var(--info)", "🛠️"], ["decyzja", "Decyzja", "var(--violet)", "🤝"], ["problem", "Problem", "var(--bad)", "⚠️"]];
    const STAGES = [["", "— nie dotyczy —"], ["live", "✅ Działa"], ["pending", "⏳ Czeka na wdrożenie"], ["plan", "📝 Plan"]];
    const PERIODS = [["today", "Dziś"], ["7", "7 dni"], ["30", "30 dni"], ["month", "Ten miesiąc"], ["all", "Od początku"]];
    const DEF_CATS = [
      ["sklepy", "Sklepy i strony", "🛍️", "#2F6FD6"], ["produkty", "Produkty i dostawcy", "📦", "#C98A00"],
      ["reklamy", "Reklamy Meta / Google", "📣", "#C8102E"], ["social", "Social media", "📱", "#6B4FD8"],
      ["klienci", "Obsługa klienta", "💬", "#0E8A7D"], ["zamowienia", "Zamówienia i wysyłka", "🚚", "#12805C"],
      ["finanse", "Finanse i KSeF", "💰", "#8A6D1E"], ["tech", "Panel i automatyzacje", "⚙️", "#5B6782"], ["inne", "Inne", "🗂️", "#8A93A8"]
    ];
    const PRI = { wysoki: 0, sredni: 1, niski: 2 };
    const STI = { doing: 0, review: 1, todo: 2, done: 3 };

    const lsGet = (k, f) => { try { const v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const U = (CRM.UI.tk = Object.assign({
      view: lsGet("tk-view", "moje"), group: lsGet("tk-group", "cat"), boardBy: lsGet("tk-board", "status"),
      who: "all", cat: "all", prio: "all", q: "", showDone: false, period: "month", month: CRM.TODAY().slice(0, 7),
      drafts: {}, fold: {}, open: null, zWho: "all", zKind: "all", zq: "", zLimit: 120, zPeriod: "30"
    }, CRM.UI.tk || {}));

    const esc = (s) => CRM.esc(s ?? "");
    const me = () => CRM.me;
    const T = () => CRM.arr("tasks");
    const isTeam = (k) => ["p1", "p2", "p3"].includes(k);
    const pname = (k) => (CRM.team().find((p) => p.k === k) || {}).name || (k === "claude" ? "Claude" : "—");
    const av = (k, s = 24) => (k === "claude" ? `<span class="av" title="Claude" style="width:${s}px;height:${s}px;background:#D97757;font-size:${s * 0.42}px">C</span>` : CRM.avatar(k, s));
    const cats = () => CRM.arr("taskcats").sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name), "pl"));
    const catOf = (id) => (id && CRM.S.taskcats[id]) || null;
    const catColor = (id) => (catOf(id) || {}).color || "var(--grey)";
    const catName = (id) => { const c = catOf(id); return c ? `${c.emoji ? c.emoji + " " : ""}${c.name}` : "Bez kategorii"; };
    const catChip = (id) => `<span class="tk-cat" style="--c:${catColor(id)}">${esc(catName(id))}</span>`;
    const optL = (list, k) => (list.find((x) => x[0] === k) || [k, k || "—"])[1];
    const pill = (list, k) => CRM.pill(list, k);
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
    const today = () => CRM.TODAY();
    const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
    const daysTo = (s) => Math.round((new Date(s + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5);
    const fmtD = (s) => (s ? new Date(s + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "");
    const fmtDue = (s) => {
      if (!s) return "";
      const d = daysTo(s);
      if (d === 0) return "Dziś"; if (d === 1) return "Jutro"; if (d === -1) return "Wczoraj";
      if (d > 1 && d < 7) return new Date(s + "T12:00:00").toLocaleDateString("pl-PL", { weekday: "long" });
      return fmtD(s);
    };
    const dueCls = (t) => { if (!t.due || t.status === "done") return ""; const d = daysTo(t.due); return d < 0 ? "late" : d === 0 ? "today" : d <= 2 ? "soon" : ""; };
    const fmtTs = (ts) => new Date(ts).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const fmtHm = (ts) => new Date(ts).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    const fmtMin = (m) => { m = Math.round(+m || 0); if (!m) return "0 h"; const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; };
    const hrs = fmtMin; // czytelnie: „3 h 48 min” zamiast „3,8 h”
    function parseDur(s) {
      s = String(s || "").toLowerCase().replace(/,/g, ".").trim();
      if (!s) return 0;
      let m = 0, hit = false;
      s.replace(/(\d+(?:\.\d+)?)\s*(?:h|godz\w*|g)(?![a-z])/g, (_, n) => { m += parseFloat(n) * 60; hit = true; return ""; });
      s.replace(/(\d+)\s*(?:m|min\w*)(?![a-z])/g, (_, n) => { m += parseInt(n, 10); hit = true; return ""; });
      if (!hit) { const n = parseFloat(s); if (isFinite(n)) m = n * 60; }
      return Math.max(0, Math.min(24 * 60, Math.round(m)));
    }
    const tsOfDate = (d, ts) => (d ? new Date(d + "T12:00:00").getTime() : +ts || 0);
    function since(p) {
      if (p === "all") return 0;
      const d = new Date();
      if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      if (p === "today") { d.setHours(0, 0, 0, 0); return d.getTime(); }
      return Date.now() - Number(p) * 864e5;
    }
    const spentOf = (id) => CRM.arr("worklog").reduce((s, w) => s + (w.taskId === id ? +w.minutes || 0 : 0), 0);
    const cmCount = (id) => CRM.arr("tcomments").filter((c) => c.taskId === id).length;
    const linkify = (html) => html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    const mentions = (html) => { CRM.team().forEach((p) => { html = html.split("@" + esc(p.name)).join(`<span class="tk-ment">@${esc(p.name)}</span>`); }); return html; };
    const richText = (s) => mentions(linkify(esc(s)));

    /* ---------- zapis ---------- */
    async function tlog(task, kind, text, mirror = true) {
      const ts = Date.now();
      await CRM.put("tasklog", CRM.uid("tl"), { taskId: task.id, cat: task.cat || "", who: me(), ts, kind, text: String(text).slice(0, 240) });
      if (mirror) CRM.put("activity", CRM.uid("ac"), { ts, who: me(), text: String(text).slice(0, 200), src: "zadania" });
    }
    async function patch(id, ch, logText, mirror = true) {
      const t = CRM.S.tasks[id];
      if (!t) return false;
      const ok = await CRM.put("tasks", id, { ...t, ...ch });
      if (ok && logText) tlog({ ...t, ...ch, id }, "edit", logText, mirror);
      return ok;
    }
    async function createTask(data, silent) {
      const id = CRM.uid("ta");
      const t = { title: "", desc: "", status: "todo", prio: "sredni", owner: me(), createdBy: me(), reviewer: "", cat: "", due: "", tags: [], subtasks: [], createdAt: Date.now(), ...data };
      if (!data.reviewer && t.owner && t.owner !== t.createdBy) t.reviewer = t.createdBy;
      if (!(await CRM.put("tasks", id, t))) return null;
      tlog({ ...t, id }, "new", t.owner && t.owner !== me() ? `Nowe zadanie dla ${pname(t.owner)}: ${t.title}` : `Nowe zadanie: ${t.title}`);
      if (!silent) CRM.toast(t.owner && t.owner !== me() ? `Zlecone: ${pname(t.owner)} dostał(a) „${t.title}”` : `Dodano: ${t.title}`);
      return id;
    }
    async function addWork(task, minutes, note, date) {
      if (!minutes) return;
      await CRM.put("worklog", CRM.uid("wl"), { taskId: task ? task.id : "", cat: task ? task.cat || "" : "", who: me(), date: date || today(), minutes, note: String(note || "").slice(0, 300), ts: Date.now() });
    }

    /* ---------- stoper ---------- */
    const tKey = () => `tk-timer-${me()}`;
    const getTimer = () => { try { return JSON.parse(lsGet(tKey(), "null")); } catch (e) { return null; } };
    const fmtClock = (ms) => { const s = Math.floor(ms / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
    function startTimer(id) {
      const cur = getTimer();
      if (cur && cur.id === id) return;
      if (cur) stopTimer(true);
      lsSet(tKey(), JSON.stringify({ id, start: Date.now() }));
      if (!openShift(me())) startShift(true);
      const t = CRM.S.tasks[id];
      if (t && t.status === "todo") patch(id, { status: "doing" }, `${t.title} → W trakcie`, false);
      CRM.toast("Stoper włączony. Kliknij Stop, gdy skończysz.");
      CRM.scheduleRender();
    }
    async function stopTimer(save) {
      const cur = getTimer();
      if (!cur) return 0;
      lsSet(tKey(), "null");
      const min = Math.round((Date.now() - cur.start) / 6e4);
      const t = CRM.S.tasks[cur.id];
      if (save && t && min >= 1) { await addWork(t, min, "stoper"); CRM.toast(`Zapisano ${fmtMin(min)} pracy: ${t.title}`); }
      else if (save) CRM.toast("Mniej niż minuta — nie zapisuję czasu.");
      CRM.scheduleRender();
      return min;
    }
    setInterval(() => {
      const cur = getTimer();
      document.querySelectorAll("[data-tk-clock]").forEach((el) => { el.textContent = cur ? fmtClock(Date.now() - cur.start) : "00:00:00"; });
    }, 1000);
    function timerPill() {
      const cur = getTimer();
      if (!cur || !CRM.S.tasks[cur.id]) return "";
      return `<span class="tk-timer">⏱ <button class="tk-linkb" style="background:none;padding:0;text-decoration:none;color:#fff" data-tk="open" data-id="${esc(cur.id)}">${esc(CRM.S.tasks[cur.id].title)}</button> <span class="t" data-tk-clock>${fmtClock(Date.now() - cur.start)}</span><button data-tk="timer-stop">Stop</button></span>`;
    }


    /* ---------- czas w pracy: „Zaczynam pracę” / „Kończę pracę” ---------- */
    const openShift = (k) => CRM.arr("shifts").filter((x) => x.who === k && !x.end).sort((a, b) => b.start - a.start)[0] || null;
    const shiftMin = (x, from = 0) => Math.max(0, Math.round(((+x.end || Date.now()) - Math.max(+x.start, from)) / 6e4));
    const fmtSince = (ts) => (isoOf(new Date(ts)) === today() ? fmtHm(ts) : `${fmtD(isoOf(new Date(ts)))} ${fmtHm(ts)}`);
    const dayMinOf = (k, iso) => CRM.arr("shifts").filter((x) => x.who === k && isoOf(new Date(+x.start)) === iso).reduce((a, x) => a + shiftMin(x), 0);
    async function startShift(quiet, from) {
      if (openShift(me())) return;
      let ts = Date.now();
      if (from) { const d = new Date(); const [h, m] = from.split(":").map(Number); d.setHours(h, m || 0, 0, 0); if (isFinite(d.getTime()) && d.getTime() < ts) ts = d.getTime(); }
      if (!(await CRM.put("shifts", CRM.uid("sh"), { who: me(), start: ts, end: null, date: today() }))) return;
      CRM.put("activity", CRM.uid("ac"), { ts, who: me(), text: "Zaczyna pracę", src: "zadania" });
      try { sessionStorage.setItem("tk-shift-asked", me()); } catch (e) {}
      if (!quiet) { CRM.toast("Miłej pracy! Na koniec kliknij „Kończę pracę” na górze."); if (window.NHP_BRAND) NHP_BRAND.sound("pop"); }
      paintShift(true);
    }
    async function endShift(summary, endTs) {
      const x = openShift(me());
      if (!x) return;
      if (getTimer()) await stopTimer(true);
      const end = Math.max(+x.start + 6e4, Math.min(endTs || Date.now(), Date.now()));
      const done = { ...x, end, minutes: shiftMin({ ...x, end }), summary: String(summary || "").trim().slice(0, 1000) };
      if (!(await CRM.put("shifts", x.id, done))) return;
      CRM.put("activity", CRM.uid("ac"), { ts: end, who: me(), text: `Kończy pracę (${fmtMin(done.minutes)})`, src: "zadania" });
      CRM.toast(`Zapisano ${fmtMin(done.minutes)} pracy. Dzięki!`);
      paintShift(true);
    }
    function openStartAsk() {
      const name = pname(me());
      const now = CRM.arr("shifts").filter((x) => !x.end && x.who !== me()).map((x) => pname(x.who));
      CRM.openModal(`<form id="tkShiftAsk" novalidate>
        <div class="modal-h"><h2 id="mTitle">Cześć${name && name !== "Ja" ? ", " + esc(name) : ""}! 👋</h2><button type="button" class="btn ghost sm" data-tk="shift-skip" aria-label="Zamknij">✕</button></div>
        <div class="modal-b"><div class="f full tk-ask"><p class="big">Zaczynasz pracę?</p><p>Panel zapisze Twój czas pracy. Na koniec kliknij <b>„Kończę pracę”</b> na zielonym pasku u góry.</p>${now.length ? `<p class="small muted">Teraz pracuje: ${esc(now.join(", "))}</p>` : ""}</div>
        <details class="f full tk-early"><summary>Pracujesz już od jakiegoś czasu? Wpisz, od której</summary><label for="tks-from" class="small muted">Zacząłem(am) dziś o:</label><input id="tks-from" name="from" type="time" max="${fmtHm(Date.now())}"></details></div>
        <div class="modal-f"><button type="button" class="btn" data-tk="shift-skip">Tylko zaglądam</button><button type="submit" class="btn primary tk-go">▶ Zaczynam pracę</button></div>
      </form>`);
    }
    function openEndAsk() {
      const x = openShift(me());
      if (!x) return;
      const todayMin = dayMinOf(me(), today());
      CRM.openModal(`<form id="tkShiftEnd" novalidate>
        <div class="modal-h"><h2 id="mTitle">Kończysz pracę?</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b"><div class="f full tk-ask"><p class="big">⏱ ${esc(fmtMin(shiftMin(x)))}</p><p>Pracujesz od ${esc(fmtSince(x.start))}.${todayMin > shiftMin(x) ? ` Dziś razem: <b>${esc(fmtMin(todayMin))}</b>.` : ""}</p></div>
        <div class="f full"><label for="tks-sum">Co dziś zrobiłeś(aś)? (1–2 zdania, opcjonalnie)</label><textarea id="tks-sum" name="summary" placeholder="np. Odpisałem klientom i dodałem 2 produkty."></textarea></div></div>
        <div class="modal-f"><button type="button" class="btn" data-act="close">Pracuję dalej</button><button type="submit" class="btn primary tk-stop">■ Kończę pracę</button></div>
      </form>`);
    }
    const dtLocal = (ts) => new Date(ts - new Date(ts).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    function openForgot(x) {
      const guess = new Date(Math.min(+x.start + 8 * 3600e3, Date.now()));
      CRM.openModal(`<form id="tkShiftFix" novalidate>
        <div class="modal-h"><h2 id="mTitle">Nie zakończyłeś(aś) pracy</h2></div>
        <div class="modal-b"><div class="f full tk-ask"><p>Zacząłeś(aś) <b>${esc(fmtSince(x.start))}</b> i nie kliknąłeś(aś) „Kończę pracę”. O której mniej więcej skończyłeś(aś)?</p></div>
        <div class="f"><label for="tkf-end">Koniec pracy (dzień i godzina)</label><input id="tkf-end" name="end" type="datetime-local" value="${dtLocal(guess.getTime())}" min="${dtLocal(+x.start)}" max="${dtLocal(Date.now())}"></div></div>
        <div class="modal-f"><span></span><button type="submit" class="btn primary">Zapisz koniec pracy</button></div>
      </form>`);
    }
    function askShift() {
      if (!CRM.S.settings || document.getElementById("scrim").classList.contains("open") || document.querySelector(".app[hidden]")) return;
      const x = openShift(me());
      if (x) { if (isoOf(new Date(+x.start)) !== today() || Date.now() - x.start > 14 * 3600e3) openForgot(x); return; }
      let asked = "";
      try { asked = sessionStorage.getItem("tk-shift-asked") || ""; } catch (e) {}
      if (asked !== me()) openStartAsk();
    }
    let lastShiftHtml = "";
    function paintShift(force) {
      let el = document.getElementById("tkShift");
      const app = document.querySelector(".app");
      if (!app || app.hidden || !CRM.S.settings) { if (el) el.hidden = true; return; }
      if (!el) { el = document.createElement("div"); el.id = "tkShift"; const host = document.querySelector(".mainwrap"); if (!host) return; host.prepend(el); }
      el.hidden = false;
      const x = openShift(me());
      const others = CRM.arr("shifts").filter((o) => !o.end && o.who !== me() && isTeam(o.who));
      const who = others.length ? `<span class="tk-shw">Teraz pracuje: ${others.map((o) => `${av(o.who, 22)}<span>${esc(pname(o.who))}</span>`).join("")}</span>` : "";
      const html = x
        ? `<div class="tk-shbar on"><span class="tk-dot"></span><span class="tk-sht"><b>Pracujesz</b> od ${esc(fmtSince(x.start))} · <span class="clk" data-tk-shift>${fmtClock(Date.now() - x.start)}</span></span>${who}<button type="button" class="btn tk-stop" data-tk="shift-end">■ Kończę pracę</button></div>`
        : `<div class="tk-shbar off"><span class="tk-dot"></span><span class="tk-sht">Nie jesteś w pracy</span>${who}<button type="button" class="btn primary tk-go" data-tk="shift-start">▶ Zaczynam pracę</button></div>`;
      const key = html.replace(/<span class="clk"[^>]*>[^<]*<\/span>/, "");
      if (!force && key === lastShiftHtml) return;
      lastShiftHtml = key; el.innerHTML = html;
    }
    setInterval(() => {
      const x = CRM.S.settings && openShift(me());
      document.querySelectorAll("[data-tk-shift]").forEach((el) => { el.textContent = x ? fmtClock(Date.now() - x.start) : ""; });
    }, 1000);

    /* ---------- statusy: zrobione / akceptacja ---------- */
    const needsReview = (t) => t.reviewer && t.reviewer !== me() && t.status !== "review";
    function confetti() {
      if (window.NHP_BRAND) NHP_BRAND.sound("win");
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const cv = document.getElementById("fx");
      if (!cv) return;
      const ctx = cv.getContext("2d"), W = (cv.width = innerWidth), H = (cv.height = innerHeight);
      const cols = ["#C8102E", "#FFFFFF", "#13294B", "#EF4058", "#8FB0E6"];
      const P = Array.from({ length: 110 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4, r: Math.random() * 6 + 4, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, s: (Math.random() - 0.5) * 0.3 }));
      let f = 0;
      (function tick() {
        ctx.clearRect(0, 0, W, H);
        P.forEach((p) => { p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.s; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - f / 90); ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
        if (++f < 90) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
      })();
    }
    async function spawnRecurring(t) {
      if (!t.recur) return;
      const base = t.due || today();
      let due = base;
      if (t.recur === "daily") due = addDays(base, 1);
      else if (t.recur === "weekly") due = addDays(base, 7);
      else { const d = new Date(base + "T12:00:00"); d.setMonth(d.getMonth() + 1); due = isoOf(d); }
      await createTask({ title: t.title, desc: t.desc || "", owner: t.owner, createdBy: t.createdBy || me(), reviewer: t.reviewer || "", cat: t.cat || "", prio: t.prio || "sredni", recur: t.recur, estimateMin: t.estimateMin || 0, tags: t.tags || [], due, subtasks: (t.subtasks || []).map((s) => ({ id: CRM.uid("st"), t: s.t, owner: s.owner || "", done: false })), prevId: t.id }, true);
      CRM.toast(`Zadanie cykliczne: następne ${fmtD(due)}`);
    }
    async function finalize(t, extra) {
      const ch = { status: "done", doneAt: Date.now(), doneBy: t.doneBy || me(), ...extra };
      if (await patch(t.id, ch)) {
        await tlog({ ...t, ...ch }, "done", `Zrobione: ${t.title}${t.owner && t.owner !== me() ? ` (${pname(t.owner)})` : ""}`);
        confetti();
        await spawnRecurring({ ...t, ...ch });
        return true;
      }
      return false;
    }
    function openComplete(id) {
      const t = CRM.S.tasks[id];
      if (!t) return;
      if (t.status === "review" && t.reviewer === me()) { approve(id); return; }
      const toReview = needsReview(t);
      const cur = getTimer();
      const running = cur && cur.id === id ? Math.max(1, Math.round((Date.now() - cur.start) / 6e4)) : 0;
      const spent = spentOf(id);
      CRM.openModal(`<form id="tkDone" novalidate data-id="${esc(id)}">
        <div class="modal-h"><h2 id="mTitle">${toReview ? "Oddajesz do akceptacji" : "Zamykasz zadanie"}</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b">
          <div class="f full"><b style="font:700 17px var(--display)">${esc(t.title)}</b><span class="small muted">${toReview ? `Po zamknięciu trafi do: <b>${esc(pname(t.reviewer))}</b> — on(a) potwierdzi, że jest OK.` : "Uzupełnij, co się da — wszystko jest opcjonalne. Enter = zamknij."}${spent ? ` Dotąd zapisano: ${fmtMin(spent)}.` : ""}</span></div>
          <div class="f"><label for="tkd-dur">Ile czasu Ci to zajęło (teraz)?</label><input id="tkd-dur" name="dur" placeholder="np. 1h 30m albo 45m" value="${running ? esc(fmtMin(running).replace(" h", "h").replace(" min", "m")) : ""}" autocomplete="off"></div>
          <div class="f"><label for="tkd-date">Kiedy pracowałeś/aś</label><input id="tkd-date" name="date" type="date" value="${today()}"></div>
          <div class="f full"><label for="tkd-res">Co zostało zrobione? (efekt, link)</label><textarea id="tkd-res" name="result" placeholder="np. Strona produktu opublikowana: https://…">${esc(t.result || "")}</textarea></div>
          <details class="tk-kid"${t.cat === "tech" ? " open" : ""}><summary>📣 Dodaj update do „Listy zmian” (było → jest → co daje)</summary>
            <p>Wypełnij, jeśli to zmienia coś w firmie. Pojawi się w zakładce Lista zmian z Twoim imieniem.</p>
            <div class="f"><label for="tkd-b">❌ BYŁO</label><textarea id="tkd-b" name="before" placeholder="np. Klient czekał 2 dni na odpowiedź."></textarea></div>
            <div class="f"><label for="tkd-a">✅ JEST</label><textarea id="tkd-a" name="after" placeholder="np. Bot odpisuje w minutę."></textarea></div>
            <div class="f"><label for="tkd-g">🎯 CO NAM TO DAJE</label><textarea id="tkd-g" name="benefit" placeholder="np. Więcej zamówień, mniej pytań."></textarea></div>
            <div class="f"><label for="tkd-p">👍 PLUSY</label><textarea id="tkd-p" name="plus" placeholder="np. Szybciej i taniej."></textarea></div>
            <div class="f"><label for="tkd-m">👎 MINUSY</label><textarea id="tkd-m" name="minus" placeholder="np. Raz w tygodniu trzeba sprawdzić bota."></textarea></div>
          </details>
          <div class="f full"><label for="tkd-nx">➡️ Następny krok (utworzy nowe zadanie)</label><input id="tkd-nx" name="nextTitle" value="${esc(t.nextStep || "")}" placeholder="np. Puścić reklamę na nową stronę" autocomplete="off"></div>
          <div class="f"><label for="tkd-no">Kto robi następny krok</label>${personSelect("nextOwner", t.owner || me(), "tkd-no")}</div>
          <div class="f"><label for="tkd-nd">Termin następnego kroku</label><input id="tkd-nd" name="nextDue" type="date" value="${addDays(today(), 1)}"></div>
        </div>
        <div class="modal-f"><span></span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">${toReview ? "Wyślij do akceptacji" : "✓ Zamknij zadanie"}</button></div></div>
      </form>`);
    }
    async function submitComplete(form) {
      const id = form.dataset.id, t = CRM.S.tasks[id];
      if (!t) { CRM.closeModal(); return; }
      const fd = new FormData(form), g = (k) => String(fd.get(k) || "").trim();
      const cur = getTimer();
      if (cur && cur.id === id) lsSet(tKey(), "null");
      const min = parseDur(g("dur"));
      if (min) await addWork(t, min, "przy zamknięciu", g("date"));
      const kid = { before: g("before"), after: g("after"), benefit: g("benefit"), plus: g("plus"), minus: g("minus") };
      if (Object.values(kid).some(Boolean)) {
        await CRM.put("updates", CRM.uid("up"), { who: me(), ts: Date.now(), date: g("date") || today(), kind: kid.before && kid.after ? "zmiana" : "praca", title: t.title, cat: t.cat || "", taskId: id, ...kid });
      }
      const result = g("result");
      CRM.closeModal();
      if (needsReview(t)) {
        if (await patch(id, { status: "review", result, doneBy: me(), submittedAt: Date.now() })) {
          await tlog(t, "review", `Do akceptacji (${pname(t.reviewer)}): ${t.title}`);
          CRM.toast(`Wysłane do akceptacji: ${pname(t.reviewer)}`);
          if (window.NHP_BRAND) NHP_BRAND.sound("pop");
        }
      } else {
        await finalize(t, { result });
        CRM.toast(cheer());
      }
      const nx = g("nextTitle");
      if (nx) await createTask({ title: nx, owner: g("nextOwner") || me(), due: g("nextDue"), cat: t.cat || "", prio: t.prio || "sredni", prevId: id });
      if (nx && t.nextStep) patch(id, { nextStep: "" });
    }
    function cheer() { const w = ["Brawo", "Super robota", "Pięknie", "Odhaczone"][Math.floor(Math.random() * 4)]; const n = pname(me()); return `${w}${n && n !== "Ja" ? ", " + n : ""}! Jedno mniej na liście.`; }
    async function approve(id) {
      const t = CRM.S.tasks[id];
      if (!t) return;
      if (await finalize(t, { approvedBy: me(), approvedAt: Date.now() })) {
        await tlog(t, "approve", `Zaakceptowane: ${t.title} (zrobił(a) ${pname(t.doneBy || t.owner)})`, false);
        CRM.toast(`Zaakceptowane! Dzięki, ${pname(t.doneBy || t.owner)}.`);
      }
    }
    function openReject(id) {
      const t = CRM.S.tasks[id];
      if (!t) return;
      CRM.openModal(`<form id="tkRej" novalidate data-id="${esc(id)}">
        <div class="modal-h"><h2 id="mTitle">Do poprawki</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b"><div class="f full"><b>${esc(t.title)}</b><span class="small muted">Zadanie wróci do ${esc(pname(t.doneBy || t.owner))} ze statusem „W trakcie”.</span></div>
        <div class="f full"><label for="tkr-why">Co poprawić?</label><textarea id="tkr-why" name="why" required placeholder="np. Brakuje zdjęć produktu na stronie."></textarea></div></div>
        <div class="modal-f"><span></span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">Odeślij do poprawki</button></div></div></form>`);
    }
    async function submitReject(form) {
      const id = form.dataset.id, t = CRM.S.tasks[id];
      const why = String(new FormData(form).get("why") || "").trim();
      if (!t) return;
      if (!why) { const el = form.querySelector("textarea"); el.setCustomValidity("Napisz, co poprawić"); el.reportValidity(); setTimeout(() => el.setCustomValidity(""), 1500); return; }
      CRM.closeModal();
      await CRM.put("tcomments", CRM.uid("cm"), { taskId: id, who: me(), ts: Date.now(), text: "Do poprawki: " + why });
      await patch(id, { status: "doing", doneAt: null }, `Do poprawki: ${t.title}`);
      CRM.toast("Odesłane do poprawki");
    }
    async function reopen(id) {
      const t = CRM.S.tasks[id];
      if (!t) return;
      await patch(id, { status: "doing", doneAt: null, approvedBy: "", approvedAt: null }, `Otwarte ponownie: ${t.title}`);
    }
    function setStatus(t, v) {
      if (v === (t.status || "todo")) return;
      if (v === "done") { openComplete(t.id); return; }
      if (v === "review") { const rv = t.reviewer || (t.createdBy && t.createdBy !== t.owner ? t.createdBy : ""); if (!rv) { CRM.toast("Ustaw najpierw, kto akceptuje (pole „Akceptuje”)."); CRM.scheduleRender(); refreshDrawer(true); return; } openComplete(t.id); return; }
      patch(t.id, { status: v, doneAt: null }, `${t.title} → ${optL(ST, v)}`);
    }

    /* ---------- szybkie dodawanie: „Zadzwonić do hurtowni @Michał #produkty jutro !” ---------- */
    function parseQuick(txt, base) {
      let s = " " + txt + " ";
      const d = { ...base };
      s = s.replace(/\s@([\p{L}]+)/gu, (m, n) => { const p = CRM.team().find((p) => norm(p.name).startsWith(norm(n))); if (p) { d.owner = p.k; return " "; } return m; });
      s = s.replace(/\s#([\p{L}\d-]+)/gu, (m, n) => { const c = cats().find((c) => norm(c.name).startsWith(norm(n)) || c.id === n); if (c) { d.cat = c.id; return " "; } return m; });
      s = s.replace(/\s!+(?:wysoki)?(?=\s)/g, () => { d.prio = "wysoki"; return " "; });
      const rel = { dzis: 0, jutro: 1, pojutrze: 2 };
      s = s.replace(/\s(dziś|dzis|jutro|pojutrze)(?=\s)/gi, (m, w) => { d.due = addDays(today(), rel[norm(w)]); return " "; });
      s = s.replace(/\s(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=\s)/g, (m, dd, mm, yy) => {
        const y = yy ? (yy.length === 2 ? 2000 + +yy : +yy) : new Date().getFullYear();
        let iso = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        if (isNaN(new Date(iso + "T12:00:00"))) return m;
        if (!yy && iso < today()) iso = `${y + 1}${iso.slice(4)}`;
        d.due = iso; return " ";
      });
      d.title = s.replace(/\s+/g, " ").trim();
      return d;
    }

    /* ---------- filtry i grupy ---------- */
    function filtered(list) {
      const q = norm(U.q);
      return (list || T()).filter((t) =>
        (U.who === "all" || (U.who === "none" ? !isTeam(t.owner) : t.owner === U.who)) &&
        (U.cat === "all" || (U.cat === "none" ? !catOf(t.cat) : t.cat === U.cat)) &&
        (U.prio === "all" || (t.prio || "sredni") === U.prio) &&
        (!q || norm([t.title, t.desc, t.nextStep, (t.tags || []).join(" "), t.result, catName(t.cat), pname(t.owner)].join(" ")).includes(q)));
    }
    const sortT = (a, b) => {
      const sa = a.status || "todo", sb = b.status || "todo";
      if (sa === "done" && sb === "done") return (+b.doneAt || 0) - (+a.doneAt || 0);
      return (STI[sa] - STI[sb]) || (a.due || "9999").localeCompare(b.due || "9999") || (PRI[a.prio] ?? 1) - (PRI[b.prio] ?? 1) || (+a.createdAt || 0) - (+b.createdAt || 0);
    };
    function groups(by) {
      const t0 = today();
      if (by === "status") return ST.map(([k, l, c]) => ({ key: "s-" + k, label: l, color: c, test: (t) => (t.status || "todo") === k, set: { status: k } }));
      if (by === "owner") return [...CRM.team().map((p) => ({ key: "o-" + p.k, label: p.name, av: p.k, test: (t) => t.owner === p.k, set: { owner: p.k } })), { key: "o-none", label: "Bez osoby", color: "var(--grey)", test: (t) => !isTeam(t.owner), set: { owner: "" } }];
      if (by === "due") return [
        { key: "d-late", label: "Po terminie", color: "var(--bad)", test: (t) => t.due && daysTo(t.due) < 0 && t.status !== "done" },
        { key: "d-today", label: "Dziś", color: "var(--good)", test: (t) => t.due === t0, set: { due: t0 } },
        { key: "d-week", label: "Najbliższe 7 dni", color: "var(--warn)", test: (t) => t.due && daysTo(t.due) >= 1 && daysTo(t.due) <= 7, set: { due: addDays(t0, 1) } },
        { key: "d-later", label: "Później", color: "var(--info)", test: (t) => t.due && daysTo(t.due) > 7, set: { due: addDays(t0, 14) } },
        { key: "d-none", label: "Bez terminu", color: "var(--grey)", test: (t) => !t.due || (daysTo(t.due) < 0 && t.status === "done"), set: { due: "" } }
      ];
      return [...cats().map((c) => ({ key: "c-" + c.id, label: c.name, emoji: c.emoji, color: c.color, test: (t) => t.cat === c.id, set: { cat: c.id } })), { key: "c-none", label: "Bez kategorii", color: "var(--grey)", test: (t) => !catOf(t.cat), set: { cat: "" } }];
    }
    const findGroup = (key) => [..."status owner due cat".split(" ")].flatMap(groups).find((g) => g.key === key);
    const baseFor = (set) => ({ ...(U.who !== "all" && U.who !== "none" ? { owner: U.who } : {}), ...(U.cat !== "all" && U.cat !== "none" ? { cat: U.cat } : {}), ...(set || {}) });

    /* ---------- elementy ---------- */
    function badges(t) {
      const b = [];
      const subs = t.subtasks || [];
      if (subs.length) b.push(`<span class="tk-b" title="Podzadania">☑ ${subs.filter((s) => s.done).length}/${subs.length}</span>`);
      const cm = cmCount(t.id);
      if (cm) b.push(`<span class="tk-b" title="Komentarze">💬 ${cm}</span>`);
      const blocked = (t.blockedBy || []).filter((id) => CRM.S.tasks[id] && CRM.S.tasks[id].status !== "done");
      if (blocked.length && t.status !== "done") b.push(`<span class="tk-b warn" title="Czeka na inne zadanie">⛓ czeka</span>`);
      if (t.recur) b.push(`<span class="tk-b" title="${esc(optL(RECUR, t.recur))}">↻</span>`);
      if (t.status === "review") b.push(`<span class="tk-b" style="color:var(--violet)">akceptuje ${esc(pname(t.reviewer))}</span>`);
      const cur = getTimer();
      if (cur && cur.id === t.id) b.push(`<span class="tk-b run">⏱ trwa</span>`);
      return b.length ? `<span class="tk-badges">${b.join("")}</span>` : "";
    }
    function chk(t) {
      const st = t.status || "todo";
      const cls = st === "done" ? "on" : st === "review" ? "rev" : "";
      const lbl = st === "done" ? "Zrobione — kliknij, by otworzyć ponownie" : st === "review" ? (t.reviewer === me() ? "Akceptuj" : "Czeka na akceptację") : "Oznacz jako zrobione";
      return `<button type="button" class="tk-chk ${cls}" data-tk="check" data-id="${esc(t.id)}" aria-label="${lbl}" title="${lbl}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></button>`;
    }
    function timeCell(t) {
      const sp = spentOf(t.id), est = +t.estimateMin || 0;
      if (!sp && !est) return `<span class="tk-time">—</span>`;
      return `<span class="tk-time ${est && sp > est ? "over" : ""}">${sp ? hrs(sp) : "0 h"}${est ? ` / ${hrs(est)}` : ""}</span>`;
    }
    function row(t, groupBy, extra) {
      const sub = t.nextStep ? `→ Następny krok: ${t.nextStep}` : t.desc ? t.desc.split("\n")[0] : "";
      const third = groupBy === "cat" ? pill(ST, t.status || "todo") : catChip(t.cat);
      return `<div class="tk-row ${t.status === "done" ? "done" : ""} ${U.open === t.id ? "sel" : ""}" data-tk="open" data-id="${esc(t.id)}" tabindex="0" draggable="true" data-drag="${esc(t.id)}">
        ${chk(t)}
        <div class="tk-name"><span class="t">${esc(t.title || "Bez nazwy")}</span>${badges(t)}${sub ? `<small>${esc(sub)}</small>` : ""}${extra || ""}</div>
        <div class="c-who">${isTeam(t.owner) ? av(t.owner, 26) : `<span class="av" style="width:26px;height:26px;background:var(--surface-2);color:var(--muted);border:1px dashed var(--grey);font-size:12px">?</span>`}</div>
        <div class="c-due"><span class="tk-due ${dueCls(t)}">${esc(fmtDue(t.due))}</span></div>
        <div class="c-prio">${t.prio && t.prio !== "sredni" ? pill(PR, t.prio) : `<span class="small muted">średni</span>`}</div>
        <div class="c-cat">${third}</div>
        <div class="c-time">${timeCell(t)}</div>
      </div>`;
    }
    function section(g, items, groupBy, extraBase) {
      const folded = !!U.fold[g.key];
      const head = g.av ? av(g.av, 22) : g.emoji ? `<span>${esc(g.emoji)}</span>` : `<span class="dot" style="background:${g.color || "var(--grey)"}"></span>`;
      const addable = g.set || extraBase;
      return `<section class="tk-sec ${folded ? "fold" : ""}" ${g.set ? `data-drop="${esc(g.key)}"` : ""}>
        <button type="button" class="tk-sech" data-tk="fold" data-k="${esc(g.key)}" aria-expanded="${!folded}"><i class="chev"></i>${head}${esc(g.label)}<span class="cnt">${items.length}</span></button>
        ${items.map((t) => row(t, groupBy)).join("")}
        ${addable ? `<div class="tk-add"><input id="tkq-${esc(g.key)}" data-tkq="${esc(g.key)}" value="${esc(U.drafts[g.key] || "")}" placeholder="+ Dodaj zadanie i naciśnij Enter" autocomplete="off" aria-label="Dodaj zadanie w sekcji ${esc(g.label)}"></div>` : ""}
      </section>`;
    }
    const listHead = (groupBy) => `<div class="tk-lh"><span></span><span>Zadanie</span><span class="c-who">Kto</span><span class="c-due">Termin</span><span class="c-prio">Priorytet</span><span class="c-cat">${groupBy === "cat" ? "Status" : "Kategoria"}</span><span class="c-time" style="text-align:right">Czas / plan</span></div>`;
    function personSelect(name, v, id, empty = "— nikt —") {
      return `<select ${id ? `id="${id}"` : ""} name="${name}"><option value="">${empty}</option>${CRM.team().map((p) => `<option value="${p.k}" ${v === p.k ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`;
    }
    function catSelect(name, v, id, attr = "name") {
      return `<select ${id ? `id="${id}"` : ""} ${attr}="${name}"><option value="">Bez kategorii</option>${cats().map((c) => `<option value="${esc(c.id)}" ${v === c.id ? "selected" : ""}>${esc((c.emoji ? c.emoji + " " : "") + c.name)}</option>`).join("")}</select>`;
    }
    const optSelect = (attr, name, list, v, id) => `<select ${id ? `id="${id}"` : ""} ${attr}="${name}">${list.map(([k, l]) => `<option value="${esc(k)}" ${String(v || "") === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const top = (title, sub, actions) => `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions || ""}</div></div>`;

    /* ---------- widok: Zadania ---------- */
    function vTasks() {
      const all = T();
      const open = all.filter((t) => t.status !== "done");
      const late = open.filter((t) => t.due && daysTo(t.due) < 0 && t.status !== "review").length;
      const rev = all.filter((t) => t.status === "review");
      const myRev = rev.filter((t) => t.reviewer === me()).length;
      const doneWeek = all.filter((t) => t.status === "done" && +t.doneAt > Date.now() - 7 * 864e5).length;
      const myOpen = open.filter((t) => t.owner === me() && t.status !== "review").length;
      const tabs = [["moje", "Moje zadania", myOpen + myRev], ["lista", "Lista"], ["tablica", "Tablica"], ["kalendarz", "Kalendarz"], ["rozliczenie", "Rozliczenie"]]
        .map(([k, l, n]) => `<button type="button" data-tk="view" data-v="${k}" aria-pressed="${U.view === k}">${l}${n ? `<span class="n">${n}</span>` : ""}</button>`).join("");
      const sum = `<div class="tk-sum"><div><b>${open.length}</b>otwartych</div>${late ? `<div class="bad"><b>${late}</b>po terminie</div>` : ""}${rev.length ? `<div class="vio"><b>${rev.length}</b>do akceptacji</div>` : ""}${doneWeek ? `<div class="ok"><b>${doneWeek}</b>zrobionych w 7 dni</div>` : ""}${timerPill()}</div>`;
      const sub = doneWeek ? `W tym tygodniu odhaczyliście już ${doneWeek}. Tak trzymać!` : "Zlecaj, odhaczaj, rozliczaj — wszystko w jednym miejscu.";
      const actions = `<button class="btn" type="button" data-tk="cats">🏷️ Kategorie</button><button class="btn primary" type="button" data-tk="new">${CRM.ic("plus", 16)} Nowe zadanie</button>`;
      let body = "";
      if (U.view === "moje") body = vMine();
      else if (U.view === "tablica") body = filterBar("board") + vBoard();
      else if (U.view === "kalendarz") body = filterBar("cal") + vCal();
      else if (U.view === "rozliczenie") body = vReport();
      else body = filterBar("list") + vList();
      return top("Zadania", sub, actions) + `<div class="tk-tabs" role="tablist">${tabs}</div>` + sum + body;
    }
    function filterBar(kind) {
      const who = [["all", "Wszyscy"], ...CRM.team().map((p) => [p.k, p.name]), ["none", "Bez osoby"]]
        .map(([k, l]) => `<button type="button" class="chip" data-tk="who" data-v="${k}" aria-pressed="${U.who === k}">${isTeam(k) ? av(k, 18) : ""}${esc(l)}</button>`).join("");
      const doneN = filtered().filter((t) => t.status === "done").length;
      return `<div class="tk-bar">
        <label class="search">${CRM.ic("search", 16)}<input id="tk-q" data-tkin="q" placeholder="Szukaj zadania…" value="${esc(U.q)}" autocomplete="off"></label>
        <div class="chips">${who}</div>
        <select data-tkin="cat" aria-label="Kategoria"><option value="all">Wszystkie kategorie</option>${cats().map((c) => `<option value="${esc(c.id)}" ${U.cat === c.id ? "selected" : ""}>${esc((c.emoji || "") + " " + c.name)}</option>`).join("")}<option value="none" ${U.cat === "none" ? "selected" : ""}>Bez kategorii</option></select>
        <select data-tkin="prio" aria-label="Priorytet"><option value="all">Każdy priorytet</option>${PR.map(([k, l]) => `<option value="${k}" ${U.prio === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${kind === "list" ? `<select data-tkin="group" aria-label="Grupuj">${[["cat", "Grupuj: kategorie"], ["status", "Grupuj: status"], ["owner", "Grupuj: osoby"], ["due", "Grupuj: termin"]].map(([k, l]) => `<option value="${k}" ${U.group === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
        ${kind === "board" ? `<select data-tkin="boardBy" aria-label="Kolumny">${[["status", "Kolumny: status"], ["cat", "Kolumny: kategorie"], ["owner", "Kolumny: osoby"], ["due", "Kolumny: termin"]].map(([k, l]) => `<option value="${k}" ${U.boardBy === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
        ${kind !== "cal" && !(kind === "board" && U.boardBy === "status") ? `<button type="button" class="chip" data-tk="showDone" aria-pressed="${U.showDone}">✓ Pokaż zrobione (${doneN})</button>` : ""}
      </div>`;
    }
    function vList() {
      let list = filtered();
      if (!U.showDone && U.group !== "status") list = list.filter((t) => t.status !== "done");
      if (!T().length) return emptyTasks();
      const gs = groups(U.group);
      const html = gs.map((g) => {
        let items = list.filter(g.test).sort(sortT);
        if (U.group === "status" && g.key === "s-done" && !U.showDone) items = items.slice(0, 5);
        if (!items.length && !g.set) return "";
        if (!items.length && U.group === "cat" && g.key === "c-none") return "";
        return section(g, items, U.group);
      }).join("");
      return `<div class="card tk-list">${listHead(U.group)}${html}</div><p class="tk-hint">Skróty w szybkim dodawaniu: <b>@Imię</b> — kto robi, <b>#kategoria</b>, <b>dziś / jutro / 15.11</b> — termin, <b>!</b> — wysoki priorytet. Kliknij zadanie, żeby zobaczyć szczegóły, podzadania, komentarze i czas.</p>`;
    }
    function emptyTasks() {
      return `<div class="card"><div class="empty"><b>Pusto — czas na pierwsze zadanie</b>Zleć coś wspólnikowi albo sobie. Zadanie trafi do jego „Moich zadań”.<div style="margin-top:12px"><button class="btn primary" type="button" data-tk="new">${CRM.ic("plus", 16)} Nowe zadanie</button></div></div></div>`;
    }
    function vMine() {
      const m = me(), t0 = today();
      const all = T();
      const mine = all.filter((t) => t.owner === m && t.status !== "done" && t.status !== "review").sort(sortT);
      const toApprove = all.filter((t) => t.status === "review" && t.reviewer === m).sort(sortT);
      const waiting = all.filter((t) => t.status === "review" && t.owner === m && t.reviewer !== m).sort(sortT);
      const delegated = all.filter((t) => t.createdBy === m && t.owner !== m && t.status !== "done").sort(sortT);
      const doneMine = all.filter((t) => t.status === "done" && (t.doneBy || t.owner) === m && +t.doneAt > Date.now() - 7 * 864e5).sort(sortT);
      const wk = CRM.arr("worklog").filter((w) => w.who === m && tsOfDate(w.date, w.ts) > Date.now() - 7 * 864e5).reduce((s, w) => s + (+w.minutes || 0), 0);
      const buckets = [
        { key: "m-late", label: "Po terminie", color: "var(--bad)", items: mine.filter((t) => t.due && t.due < t0) },
        { key: "m-today", label: "Na dziś", color: "var(--good)", items: mine.filter((t) => t.due === t0), set: { owner: m, due: t0 } },
        { key: "m-week", label: "Najbliższe 7 dni", color: "var(--warn)", items: mine.filter((t) => t.due > t0 && daysTo(t.due) <= 7), set: { owner: m, due: addDays(t0, 1) } },
        { key: "m-later", label: "Później", color: "var(--info)", items: mine.filter((t) => t.due && daysTo(t.due) > 7) },
        { key: "m-none", label: "Bez terminu", color: "var(--grey)", items: mine.filter((t) => !t.due), set: { owner: m } }
      ];
      const name = pname(m);
      const lateN = buckets[0].items.length, todayN = buckets[1].items.length;
      const hello = `<div class="card tk-me">${av(m, 46)}<div><h2>Cześć${name && name !== "Ja" ? ", " + esc(name) : ""}!</h2><p>${todayN ? `Na dziś masz <b>${todayN}</b> ${todayN === 1 ? "zadanie" : "zadań"}.` : "Na dziś nic pilnego."} ${lateN ? `<b style="color:var(--bad)">${lateN} po terminie.</b>` : ""} ${toApprove.length ? `Czeka na Twoją akceptację: <b>${toApprove.length}</b>.` : ""}</p><p class="small">Ostatnie 7 dni: zrobione <b>${doneMine.length}</b> · czas pracy <b>${fmtMin(wk)}</b></p></div><div class="tk-rv">${timerPill()}</div></div>`;
      const revRow = (t) => row(t, "cat", `<span class="tk-rv" style="margin:6px 0 2px"><button type="button" class="btn sm" data-tk="approve" data-id="${esc(t.id)}" style="color:var(--good)">✓ Akceptuj</button><button type="button" class="btn sm" data-tk="reject" data-id="${esc(t.id)}">↩ Do poprawki</button>${t.result ? `<span class="small muted" style="align-self:center">Efekt: ${esc(t.result.slice(0, 90))}</span>` : ""}</span>`);
      let html = "";
      if (toApprove.length) html += `<section class="tk-sec"><div class="tk-sech" style="cursor:default"><span class="dot" style="background:var(--violet)"></span>Czeka na Twoją akceptację<span class="cnt">${toApprove.length}</span></div>${toApprove.map(revRow).join("")}</section>`;
      html += buckets.map((b) => (b.items.length || b.set ? section(b, b.items, "cat", b.set) : "")).join("");
      if (waiting.length) html += section({ key: "m-wait", label: "Oddane — czekają na akceptację", color: "var(--violet)" }, waiting, "cat");
      if (delegated.length) html += section({ key: "m-deleg", label: "Zleciłem/am innym", color: "var(--p2)" }, delegated, "cat");
      if (doneMine.length) html += section({ key: "m-done", label: "Zrobione w tym tygodniu", color: "var(--good)" }, doneMine, "cat");
      return hello + `<div class="card tk-list">${listHead("cat")}${html}</div>`;
    }
    function vBoard() {
      let list = filtered();
      if (!U.showDone && U.boardBy !== "status") list = list.filter((t) => t.status !== "done");
      const gs = groups(U.boardBy);
      return `<div class="tk-board">${gs.map((g) => {
        let items = list.filter(g.test).sort(sortT);
        const extra = g.key === "s-done" && !U.showDone && items.length > 12 ? items.length - 12 : 0;
        if (extra) items = items.slice(0, 12);
        const head = g.av ? av(g.av, 20) : g.emoji ? esc(g.emoji) : `<span class="dot" style="background:${g.color || "var(--grey)"}"></span>`;
        return `<div class="tk-col" ${g.set ? `data-drop="${esc(g.key)}"` : ""}><div class="tk-colh">${head} ${esc(g.label)}<span class="cnt">${items.length + extra}</span></div>
          ${items.map(card).join("") || `<div class="empty small" style="padding:18px 8px">${g.set ? "Przeciągnij tu kartę" : "Pusto"}</div>`}
          ${extra ? `<button type="button" class="btn ghost sm" data-tk="showDone" style="width:100%;justify-content:center">+ ${extra} starszych</button>` : ""}
          ${g.set && g.key !== "s-done" && g.key !== "s-review" ? `<button type="button" class="btn ghost sm" data-tk="new" data-preset='${esc(JSON.stringify(baseFor(g.set)))}' style="width:100%;justify-content:center">${CRM.ic("plus", 14)} Dodaj</button>` : ""}
        </div>`;
      }).join("")}</div>`;
    }
    function card(t) {
      const subs = t.subtasks || [], sd = subs.filter((s) => s.done).length;
      return `<div class="tk-card ${t.status === "done" ? "done" : ""}" style="--c:${catColor(t.cat)}" data-tk="open" data-id="${esc(t.id)}" draggable="true" data-drag="${esc(t.id)}" tabindex="0">
        <div class="small muted" style="margin-bottom:4px">${esc(catName(t.cat))}</div>
        <div class="t">${chk(t)}<span>${esc(t.title || "Bez nazwy")}</span></div>
        ${t.nextStep ? `<div class="small muted" style="margin-top:4px">→ ${esc(t.nextStep)}</div>` : ""}
        ${subs.length ? `<div class="tk-prog" title="Podzadania ${sd}/${subs.length}"><i style="width:${Math.round((sd / subs.length) * 100)}%"></i></div>` : ""}
        <div class="m">${isTeam(t.owner) ? av(t.owner, 22) : ""}${t.due ? `<span class="tk-due ${dueCls(t)}">${esc(fmtDue(t.due))}</span>` : ""}${t.prio === "wysoki" ? pill(PR, "wysoki") : ""}<span class="r">${badges(t)}</span></div>
      </div>`;
    }
    function vCal() {
      const [y, mo] = U.month.split("-").map(Number);
      const first = new Date(y, mo - 1, 1, 12);
      const startOff = (first.getDay() + 6) % 7;
      const start = new Date(y, mo - 1, 1 - startOff, 12);
      const list = filtered();
      const byDay = {};
      list.forEach((t) => { if (t.due) (byDay[t.due] = byDay[t.due] || []).push(t); });
      const t0 = today();
      const cells = [];
      const weeks = Math.ceil((startOff + new Date(y, mo, 0).getDate()) / 7);
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const iso = isoOf(d);
        const items = (byDay[iso] || []).sort(sortT);
        const show = items.slice(0, 4);
        cells.push(`<div class="tk-day ${d.getMonth() !== mo - 1 ? "out" : ""} ${iso === t0 ? "now" : ""}" data-drop-due="${iso}">
          <span class="dn">${d.getDate()}</span><button type="button" class="plus" data-tk="new" data-preset='${esc(JSON.stringify(baseFor({ due: iso })))}' aria-label="Dodaj zadanie na ${esc(fmtD(iso))}">+</button>
          ${show.map((t) => `<button type="button" class="tk-ct ${t.status === "done" ? "done" : ""} ${dueCls(t) === "late" ? "late" : ""}" style="--c:${catColor(t.cat)}" data-tk="open" data-id="${esc(t.id)}" draggable="true" data-drag="${esc(t.id)}" title="${esc(t.title)} — ${esc(pname(t.owner))}">${isTeam(t.owner) ? esc(pname(t.owner).charAt(0)) + " · " : ""}${esc(t.title)}</button>`).join("")}
          ${items.length > 4 ? `<span class="small muted">+${items.length - 4} więcej</span>` : ""}
        </div>`);
      }
      const label = first.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
      const noDue = list.filter((t) => !t.due && t.status !== "done").length;
      return `<div class="tk-cal-h"><button class="btn sm" type="button" data-tk="month" data-v="-1" aria-label="Poprzedni miesiąc">‹</button><h2>${esc(label.charAt(0).toUpperCase() + label.slice(1))}</h2><button class="btn sm" type="button" data-tk="month" data-v="1" aria-label="Następny miesiąc">›</button><button class="btn sm" type="button" data-tk="month" data-v="0">Dziś</button><span class="small muted" style="margin-left:auto">${noDue ? `${noDue} otwartych bez terminu · ` : ""}przeciągnij zadanie na inny dzień, żeby zmienić termin</span></div>
        <div class="tk-cal">${["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d) => `<div class="dh">${d}</div>`).join("")}${cells.join("")}</div>`;
    }

    /* ---------- statystyki pracy (Rozliczenie + Lista zmian) ---------- */
    function stats(period) {
      const s = since(period);
      const team = CRM.team();
      const per = {};
      team.forEach((p) => (per[p.k] = { work: 0, min: 0, done: 0, onTime: 0, withDue: 0, ups: 0, cms: 0, given: 0, cats: {} }));
      const bump = (k, cat, f, v) => { if (!per[k]) return; per[k][f] += v; cat = catOf(cat) ? cat : ""; const c = (per[k].cats[cat] = per[k].cats[cat] || { min: 0, done: 0 }); if (f === "min") c.min += v; if (f === "done") c.done += v; };
      CRM.arr("worklog").forEach((w) => { if (tsOfDate(w.date, w.ts) >= s) bump(w.who, w.cat || (CRM.S.tasks[w.taskId] || {}).cat, "min", +w.minutes || 0); });
      CRM.arr("updates").forEach((u) => { if (tsOfDate(u.date, u.ts) >= s) { bump(u.who, u.cat, "ups", 1); if (+u.minutes) bump(u.who, u.cat, "min", +u.minutes); } });
      CRM.arr("tcomments").forEach((c) => { if (+c.ts >= s && per[c.who]) per[c.who].cms++; });
      CRM.arr("shifts").forEach((x) => { if (per[x.who] && (+x.end || Date.now()) > s) per[x.who].work += shiftMin(x, s); });
      const done = T().filter((t) => t.status === "done" && +t.doneAt >= s);
      done.forEach((t) => {
        const k = t.doneBy || t.owner;
        bump(k, t.cat, "done", 1);
        if (t.due && per[k]) { per[k].withDue++; if (isoOf(new Date(+t.doneAt)) <= t.due) per[k].onTime++; }
      });
      T().forEach((t) => { if (+t.createdAt >= s && t.createdBy && t.owner && t.owner !== t.createdBy && per[t.createdBy]) per[t.createdBy].given++; });
      const totalMin = Object.values(per).reduce((a, p) => a + p.min, 0);
      const totalWork = Object.values(per).reduce((a, p) => a + p.work, 0);
      return { per, totalMin, totalWork, done, s };
    }
    const periodChips = (key) => `<div class="tk-period">${PERIODS.map(([k, l]) => `<button type="button" class="chip" data-tk="period" data-key="${key}" data-v="${k}" aria-pressed="${U[key] === k}">${l}</button>`).join("")}</div>`;
    function vReport() {
      const st = stats(U.period);
      const all = T();
      const rows = CRM.team().map((p) => {
        const x = st.per[p.k];
        const open = all.filter((t) => t.owner === p.k && t.status !== "done");
        const late = open.filter((t) => t.due && daysTo(t.due) < 0 && t.status !== "review").length;
        const estDone = st.done.filter((t) => (t.doneBy || t.owner) === p.k);
        const est = estDone.reduce((a, t) => a + (+t.estimateMin || 0), 0), real = estDone.reduce((a, t) => a + spentOf(t.id), 0);
        return `<tr><td>${av(p.k, 24)} <b>${esc(p.name)}</b></td><td class="r num strong">${x.done}</td><td class="r num">${x.withDue ? Math.round((x.onTime / x.withDue) * 100) + "%" : "—"}</td><td class="r num">${open.length}</td><td class="r num ${late ? "neg" : ""}">${late}</td><td class="r num strong">${hrs(x.work)}</td><td class="r num">${hrs(x.min)}</td><td class="r num">${est ? `${hrs(real)} / ${hrs(est)}` : "—"}</td><td class="r num">${x.given}</td><td class="r num">${all.filter((t) => t.status === "review" && t.reviewer === p.k).length}</td></tr>`;
      }).join("");
      const doneRows = st.done.sort((a, b) => b.doneAt - a.doneAt).map((t) => `<tr data-tk="open" data-id="${esc(t.id)}"><td class="muted num">${esc(fmtD(isoOf(new Date(+t.doneAt))))}</td><td class="strong">${esc(t.title)}</td><td>${catChip(t.cat)}</td><td>${av(t.doneBy || t.owner, 22)} ${esc(pname(t.doneBy || t.owner))}</td><td>${t.approvedBy ? `${av(t.approvedBy, 20)} ${esc(pname(t.approvedBy))}` : `<span class="muted small">bez akceptacji</span>`}</td><td class="r num">${hrs(spentOf(t.id))}</td><td class="small" style="max-width:280px">${richText((t.result || "").slice(0, 160))}</td></tr>`).join("");
      return `<div class="row" style="justify-content:space-between;margin-bottom:12px">${periodChips("period")}<div class="row"><button type="button" class="btn sm" data-tk="csv-tasks">⬇ Zadania CSV</button><button type="button" class="btn sm" data-tk="csv-time">⬇ Czas pracy CSV</button></div></div>
        <div class="card" style="margin-bottom:16px"><div class="pad sec-h" style="margin:0;padding-bottom:4px"><h2>Rozliczenie osób</h2><span class="hint">„W pracy” = od „Zaczynam pracę” do „Kończę pracę”</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Osoba</th><th class="r">Zrobione</th><th class="r">W terminie</th><th class="r">Otwarte</th><th class="r">Po terminie</th><th class="r">W pracy</th><th class="r">Przy zadaniach</th><th class="r">Czas vs plan</th><th class="r">Zlecił(a)</th><th class="r">Do jego akcept.</th></tr></thead><tbody>${rows}</tbody></table></div></div>
        <div class="card"><div class="pad sec-h" style="margin:0;padding-bottom:4px"><h2>Zamknięte zadania</h2><span class="hint">${st.done.length} w okresie · kliknij, by zobaczyć szczegóły</span></div>
        ${doneRows ? `<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Zadanie</th><th>Kategoria</th><th>Zrobił(a)</th><th>Zaakceptował(a)</th><th class="r">Czas</th><th>Efekt</th></tr></thead><tbody>${doneRows}</tbody></table></div>` : `<div class="empty"><b>Brak zamkniętych zadań w tym okresie</b>Zmień okres albo odhacz pierwsze zadanie.</div>`}</div>`;
    }
    function dl(name, rows) {
      const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function csvTasks() {
      const s = since(U.period);
      dl(`zadania-${today()}.csv`, [["Zadanie", "Kategoria", "Status", "Kto robi", "Zlecił", "Akceptuje", "Termin", "Priorytet", "Zrobione", "Zaakceptował", "Czas (h)", "Plan (h)", "Efekt"],
        ...T().filter((t) => t.status !== "done" || +t.doneAt >= s).sort(sortT).map((t) => [t.title, catName(t.cat), optL(ST, t.status || "todo"), pname(t.owner), pname(t.createdBy), t.reviewer ? pname(t.reviewer) : "", t.due || "", optL(PR, t.prio || "sredni"), t.doneAt ? isoOf(new Date(+t.doneAt)) : "", t.approvedBy ? pname(t.approvedBy) : "", (spentOf(t.id) / 60).toFixed(2).replace(".", ","), ((+t.estimateMin || 0) / 60).toFixed(2).replace(".", ","), t.result || ""])]);
    }
    function csvTime(periodKey) {
      const s = since(U[periodKey] || U.period);
      dl(`czas-pracy-${today()}.csv`, [["Data", "Osoba", "Kategoria", "Zadanie / wpis", "Minuty", "Godziny", "Notatka"],
        ...CRM.arr("worklog").filter((w) => tsOfDate(w.date, w.ts) >= s).sort((a, b) => tsOfDate(a.date, a.ts) - tsOfDate(b.date, b.ts)).map((w) => [w.date, pname(w.who), catName(w.cat || (CRM.S.tasks[w.taskId] || {}).cat), (CRM.S.tasks[w.taskId] || {}).title || "", w.minutes, (w.minutes / 60).toFixed(2).replace(".", ","), w.note || ""]),
        ...CRM.arr("updates").filter((u) => +u.minutes && tsOfDate(u.date, u.ts) >= s).map((u) => [u.date, pname(u.who), catName(u.cat), u.title, u.minutes, (u.minutes / 60).toFixed(2).replace(".", ","), "wpis z listy zmian"]),
        ...CRM.arr("shifts").filter((x) => (+x.end || Date.now()) > s).sort((a, b) => a.start - b.start).map((x) => { const m = shiftMin(x, s); return [isoOf(new Date(+x.start)), pname(x.who), "W pracy", `${fmtHm(x.start)}–${x.end ? fmtHm(x.end) : "trwa"}`, m, (m / 60).toFixed(2).replace(".", ","), x.summary || ""]; })]);
    }

    /* ---------- widok: Lista zmian ---------- */
    function vChanges() {
      const seenKey = `tk-seen-${me()}`;
      if (!U.zSeen) U.zSeen = Number(lsGet(seenKey, "0")) || 1;
      lsSet(seenKey, String(Date.now()));
      const st = stats(U.zPeriod);
      const team = CRM.team();
      const ups = CRM.arr("updates")
        .filter((u) => tsOfDate(u.date, u.ts) >= st.s && (U.zWho === "all" || u.who === U.zWho))
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (+b.ts || 0) - (+a.ts || 0));
      const people = team.map((p) => {
        const x = st.per[p.k];
        const live = openShift(p.k);
        const last = CRM.arr("shifts").filter((o) => o.who === p.k && o.end).sort((a, b) => b.end - a.end)[0];
        const status = live ? `<span class="tk-live">🟢 pracuje teraz · od ${esc(fmtSince(live.start))}</span>` : last ? `<small>ostatnio: ${esc(fmtSince(last.end))}</small>` : `<small>jeszcze nie zaczął(a) pracy w panelu</small>`;
        const share = st.totalWork ? Math.round((x.work / st.totalWork) * 100) : 0;
        const cl = Object.entries(x.cats).filter(([, v]) => v.min || v.done).sort((a, b) => b[1].min - a[1].min || b[1].done - a[1].done).slice(0, 4);
        const maxMin = Math.max(1, ...cl.map(([, v]) => v.min));
        return `<div class="card tk-pc ${live ? "live" : ""}" style="--pc:var(--${p.k})"><div class="who">${av(p.k, 40)}<div><b>${esc(p.name)}</b>${status}</div></div>
          <div class="nums"><div><strong>${hrs(x.work)}</strong><span>w pracy</span></div><div><strong>${x.done}</strong><span>zadań zrobionych</span></div><div><strong>${x.ups}</strong><span>update'ów</span></div></div>
          ${st.totalWork ? `<div class="tk-share" title="${share}% czasu pracy zespołu"><i style="width:${share}%"></i></div>` : ""}
          ${cl.length ? `<div class="small muted" style="margin-bottom:2px">Nad czym:</div>` + cl.map(([c, v]) => `<div class="tk-pcat" style="--c:${catColor(c)}"><span class="nm">${esc(catName(c))}</span><span class="bar"><i style="width:${Math.round((v.min / maxMin) * 100)}%"></i></span><span class="v">${v.min ? hrs(v.min) : ""}${v.done ? ` · ${v.done}✓` : ""}</span></div>`).join("") : ""}
        </div>`;
      }).join("");
      const allCats = [...cats().map((c) => c.id), ""];
      const mxRows = allCats.map((c) => {
        const vals = team.map((p) => (st.per[p.k].cats[c] || { min: 0, done: 0 }));
        if (!vals.some((v) => v.min || v.done)) return "";
        const tot = vals.reduce((a, v) => a + v.min, 0), totD = vals.reduce((a, v) => a + v.done, 0);
        return `<tr><td>${catChip(c)}</td>${vals.map((v) => `<td class="num ${v.min || v.done ? "" : "z"}">${v.min ? hrs(v.min) : "—"}${v.done ? ` <span class="small muted">· ${v.done}✓</span>` : ""}</td>`).join("")}<td class="num strong">${hrs(tot)}${totD ? ` <span class="small muted">· ${totD}✓</span>` : ""}</td></tr>`;
      }).join("");
      const mx = mxRows ? `<details class="card tk-hist tk-mxd"><summary>📊 Nad czym pracowaliśmy (godziny przy zadaniach)</summary><div class="tbl-wrap"><table class="tk-mx"><thead><tr><th>Kategoria</th>${team.map((p) => `<th>${esc(p.name)}</th>`).join("")}<th>Razem</th></tr></thead><tbody>${mxRows}</tbody></table></div></details>` : "";
      const who = [["all", "Wszyscy"], ...team.map((p) => [p.k, p.name])].map(([k, l]) => `<button type="button" class="chip" data-tk="zwho" data-v="${k}" aria-pressed="${U.zWho === k}">${k !== "all" ? av(k, 18) : ""}${esc(l)}</button>`).join("");
      const kinds = [["all", "Wszystko"], ["czas", "Praca i czas"], ["zadania", "Zadania"], ["inne", "Reszta panelu"]].map(([k, l]) => `<option value="${k}" ${U.zKind === k ? "selected" : ""}>${l}</option>`).join("");
      const period = `<select data-tkin="zPeriod" aria-label="Okres" class="tk-sel">${PERIODS.map(([k, l]) => `<option value="${k}" ${U.zPeriod === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;
      const fresh = ups.filter((u) => +u.ts > U.zSeen && u.who !== me()).length;
      return top("Lista zmian i update'y", "", `<button class="btn primary" type="button" data-tk="new-up">${CRM.ic("plus", 16)} Dodaj update</button>`) +
        `<div class="tk-bar">${period}<div class="chips">${who}</div></div>
        <div class="tk-sh"><h2>👥 Kto ile pracował</h2><button type="button" class="btn ghost sm" data-tk="csv-time-z">⬇ CSV</button></div>
        <div class="tk-people">${people}</div>${mx}
        <div class="tk-sh"><h2>📣 Update'y</h2>${fresh ? `<span class="tk-new">${fresh} NOWE</span>` : ""}</div>
        ${ups.length ? ups.map(upCard).join("") : `<div class="card"><div class="empty small"><b>Brak update'ów w tym okresie</b><div style="margin-top:10px"><button class="btn primary" type="button" data-tk="new-up">${CRM.ic("plus", 16)} Dodaj update</button></div></div></div>`}
        <details class="card tk-hist" ${U.zHist ? "open" : ""}><summary>📜 Pełna historia — każde kliknięcie</summary>
          <div class="tk-bar" style="padding:0 16px"><select data-tkin="zKind" aria-label="Rodzaj" class="tk-sel">${kinds}</select></div>
          <div style="padding:0 16px 16px">${feedHtml(st.s)}</div>
        </details>`;
    }
    function feedHtml(s) {
      const q = norm(U.zq), W = U.zWho, K = U.zKind;
      const ev = [];
      const okWho = (k) => W === "all" || k === W;
      if (K === "wpisy") CRM.arr("updates").forEach((u) => { const ts = tsOfDate(u.date, u.ts); if (ts >= s && okWho(u.who)) ev.push({ type: "up", ts: +u.ts || ts, day: u.date || isoOf(new Date(+u.ts)), r: u, text: [u.title, u.before, u.after, u.benefit, u.plus, u.minus].join(" ") }); });
      if (K === "all" || K === "zadania") CRM.arr("tasklog").forEach((l) => { if (+l.ts >= s && okWho(l.who) && l.kind !== "edit") ev.push({ type: "tl", ts: +l.ts, r: l, text: l.text }); });
      if (K === "all" || K === "czas") CRM.arr("worklog").forEach((w) => { const ts = tsOfDate(w.date, w.ts); if (ts >= s && okWho(w.who)) ev.push({ type: "wl", ts: +w.ts || ts, day: w.date || isoOf(new Date(+w.ts)), r: w, text: ((CRM.S.tasks[w.taskId] || {}).title || "") + " " + (w.note || "") }); });
      if (K === "all" || K === "czas") CRM.arr("shifts").forEach((x) => { if ((+x.end || Date.now()) >= s && okWho(x.who)) ev.push({ type: "sh", ts: +x.start, day: isoOf(new Date(+x.start)), r: x, text: x.summary || "" }); });
      if (K === "all" || K === "inne") Object.values(CRM.S.activityAll || {}).forEach((a) => { if (a.src !== "zadania" && +a.ts >= s && okWho(a.who)) ev.push({ type: "ac", ts: +a.ts, r: a, text: a.text }); });
      const list = ev.filter((e) => !q || norm(e.text).includes(q)).map((e) => ({ ...e, day: e.day || isoOf(new Date(e.ts)) })).sort((a, b) => b.day.localeCompare(a.day) || b.ts - a.ts);
      if (!list.length) return `<div class="empty small"><b>Pusto w tym okresie</b>Tu widać każde kliknięcie: nowe zadania, zamknięcia, czas pracy.</div>`;
      const shown = list.slice(0, U.zLimit);
      let html = "", day = "", lines = [];
      const flush = () => { if (lines.length) { html += `<div class="card">${lines.join("")}</div>`; lines = []; } };
      shown.forEach((e) => {
        const d = e.day || isoOf(new Date(e.ts));
        if (d !== day) {
          flush(); day = d;
          const dayMin = {};
          CRM.team().forEach((p) => { const m = dayMinOf(p.k, d); if (m) dayMin[p.k] = m; });
          const lbl = new Date(d + "T12:00:00").toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
          html += `<div class="tk-dayh">${esc(daysTo(d) === 0 ? "Dziś" : daysTo(d) === -1 ? "Wczoraj" : lbl)}<span>${Object.entries(dayMin).filter(([k]) => isTeam(k)).map(([k, m]) => `${esc(pname(k))}: ${hrs(m)}`).join(" · ")}</span></div>`;
        }
        if (e.type === "up") { flush(); html += upCard(e.r); return; }
        lines.push(lineHtml(e));
      });
      flush();
      if (list.length > shown.length) html += `<div style="text-align:center;margin-top:14px"><button type="button" class="btn" data-tk="more">Pokaż starsze (${list.length - shown.length})</button></div>`;
      return html;
    }
    function lineHtml(e) {
      const r = e.r;
      if (e.type === "sh") return `<div class="tk-line" style="--c:var(--good)"><span class="ico">${r.end ? "🕘" : "🟢"}</span>${av(r.who, 22)}<span class="tx"><b>${esc(pname(r.who))}</b> ${r.end ? `pracował(a) ${esc(fmtHm(r.start))}–${esc(fmtHm(r.end))} · <b>${esc(fmtMin(shiftMin(r)))}</b>` : `pracuje od ${esc(fmtHm(r.start))} · <b>${esc(fmtMin(shiftMin(r)))}</b>`}${r.summary ? ` — ${esc(r.summary)}` : ""}</span><span class="tm">${esc(fmtHm(r.start))}</span></div>`;
      if (e.type === "wl") {
        const t = CRM.S.tasks[r.taskId];
        return `<div class="tk-line" style="--c:var(--info)"><span class="ico">⏱</span>${av(r.who, 22)}<span class="tx"><b>${esc(pname(r.who))}</b> pracował(a) <b>${esc(fmtMin(r.minutes))}</b>${t ? ` nad <button type="button" class="tk-linkb" data-tk="open" data-id="${esc(t.id)}">${esc(t.title)}</button>` : ""}${r.note && r.note !== "stoper" && r.note !== "przy zamknięciu" ? ` — ${esc(r.note)}` : ""} ${catChip(r.cat || (t || {}).cat)}</span><span class="tm">${esc(fmtHm(r.ts))}</span></div>`;
      }
      if (e.type === "tl") {
        const t = CRM.S.tasks[r.taskId];
        const ico = { new: ["➕", "var(--info)"], done: ["✅", "var(--good)"], approve: ["👍", "var(--good)"], review: ["📨", "var(--violet)"] }[r.kind] || ["✏️", "var(--grey)"];
        return `<div class="tk-line" style="--c:${ico[1]}"><span class="ico">${ico[0]}</span>${av(r.who, 22)}<span class="tx"><b>${esc(pname(r.who))}</b>: ${t ? `<button type="button" class="tk-linkb" data-tk="open" data-id="${esc(t.id)}">${esc(r.text)}</button>` : esc(r.text)} ${r.cat ? catChip(r.cat) : ""}</span><span class="tm">${esc(fmtHm(r.ts))}</span></div>`;
      }
      return `<div class="tk-line"><span class="ico">•</span>${av(r.who, 22)}<span class="tx"><b>${esc(pname(r.who))}</b>: ${esc(r.text)}</span><span class="tm">${esc(fmtHm(r.ts))}</span></div>`;
    }
    function bullets(v) {
      const parts = String(v || "").split(/\n|•|;/).map((x) => x.replace(/^[\s\-–*]+/, "").trim()).filter(Boolean);
      if (!parts.length) return "";
      return parts.length === 1 ? `<p>${richText(parts[0])}</p>` : `<ul>${parts.map((x) => `<li>${richText(x)}</li>`).join("")}</ul>`;
    }
    function upCard(u) {
      const k = KINDS.find((x) => x[0] === u.kind) || KINDS[1];
      const t = u.taskId && CRM.S.tasks[u.taskId];
      const isNew = U.zSeen && +u.ts > U.zSeen && u.who !== me();
      const when = new Date(tsOfDate(u.date, u.ts)).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
      const empty = (txt) => `<p class="muted">${txt}</p>`;
      return `<article class="tk-u ${isNew ? "new" : ""}" style="--c:${k[2]}">
        <header>${av(u.who, 36)}<div class="who"><b>${esc(pname(u.who))}</b><span>${esc(when)} · ${k[3]} ${esc(k[1])}${u.cat ? " · " + esc(catName(u.cat)) : ""}</span></div>${u.stage ? `<span class="tk-stage ${esc(u.stage)}">${esc(optL(STAGES, u.stage))}</span>` : ""}${isNew ? `<span class="tk-new">NOWE</span>` : ""}<button type="button" class="tk-x" data-tk="edit-up" data-id="${esc(u.id)}" title="Edytuj" aria-label="Edytuj update">✏️</button></header>
        <h3>${esc(u.title || "Update")}</h3>
        <div class="tk-bj"><div class="was"><div class="lb">❌ BYŁO</div>${bullets(u.before) || empty("—")}</div><div class="arr" aria-hidden="true">➜</div><div class="is"><div class="lb">✅ JEST</div>${bullets(u.after) || empty("—")}</div></div>
        ${u.benefit ? `<div class="tk-gives"><div class="lb">🎯 CO NAM TO DAJE</div>${bullets(u.benefit)}</div>` : ""}
        <div class="tk-pmx"><div class="pl"><div class="lb">👍 PLUSY</div>${bullets(u.plus) || empty("—")}</div><div class="mi"><div class="lb">👎 MINUSY</div>${bullets(u.minus) || empty("Brak minusów")}</div></div>
        ${+u.minutes || t ? `<footer>${+u.minutes ? `⏱ ${esc(fmtMin(u.minutes))} pracy` : ""}${+u.minutes && t ? " · " : ""}${t ? `zadanie: <button type="button" class="tk-linkb" data-tk="open" data-id="${esc(t.id)}">${esc(t.title)}</button>` : ""}</footer>` : ""}
      </article>`;
    }
    function openUpdate(id, preset) {
      const u = (id && CRM.S.updates[id]) || { who: me(), date: today(), kind: "zmiana", cat: "", ...(preset || {}) };
      const recent = T().filter((t) => t.status !== "done" || +t.doneAt > Date.now() - 30 * 864e5).sort(sortT).slice(0, 80);
      CRM.openModal(`<form id="tkUp" novalidate data-id="${esc(id || "")}">
        <div class="modal-h"><h2 id="mTitle">${id ? "Edytuj update" : "Nowy update"}</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b">
          <div class="f full"><span class="small muted">Pisz jak najprościej. Krótkie zdania. Każda nowa linia = nowy punkt na liście.</span></div>
          <div class="f full"><label for="tku-t">Tytuł: co się zmieniło? *</label><input id="tku-t" name="title" value="${esc(u.title || "")}" placeholder="np. Nowa strona dla sklepu z lampkami" autocomplete="off"></div>
          <div class="f"><label for="tku-who">Kto</label>${personSelect("who", u.who, "tku-who", "— wybierz —")}</div>
          <div class="f"><label for="tku-k">Rodzaj</label>${optSelect("name", "kind", KINDS.map((k) => [k[0], k[3] + " " + k[1]]), u.kind, "tku-k")}</div>
          <div class="f"><label for="tku-c">Kategoria</label>${catSelect("cat", u.cat, "tku-c")}</div>
          <div class="f"><label for="tku-d">Kiedy</label><input id="tku-d" name="date" type="date" value="${esc(u.date || today())}"></div>
          <div class="f"><label for="tku-st">Stan</label>${optSelect("name", "stage", STAGES, u.stage || "", "tku-st")}</div>
          <div class="f"><label for="tku-m">Ile czasu to zajęło</label><input id="tku-m" name="dur" value="${+u.minutes ? esc(fmtMin(u.minutes)) : ""}" placeholder="np. 2h albo 30m" autocomplete="off"></div>
          <div class="f"><label for="tku-task">Dotyczy zadania</label><select id="tku-task" name="taskId"><option value="">— żadnego —</option>${recent.map((t) => `<option value="${esc(t.id)}" ${u.taskId === t.id ? "selected" : ""}>${esc(t.title.slice(0, 60))}</option>`).join("")}</select></div>
          <div class="f full"><label for="tku-b">❌ BYŁO — jak było przedtem?</label><textarea id="tku-b" name="before" placeholder="np. Każdą fakturę wpisywaliśmy ręcznie. Zajmowało to godzinę dziennie.">${esc(u.before || "")}</textarea></div>
          <div class="f full"><label for="tku-a">✅ JEST — jak jest teraz?</label><textarea id="tku-a" name="after" placeholder="np. Faktury same wpadają z KSeF do panelu.">${esc(u.after || "")}</textarea></div>
          <div class="f full"><label for="tku-g">🎯 CO NAM TO DAJE?</label><textarea id="tku-g" name="benefit" placeholder="np. Godzina dziennie więcej na sprzedaż.">${esc(u.benefit || "")}</textarea></div>
          <div class="f"><label for="tku-p">👍 PLUSY (każdy w nowej linii)</label><textarea id="tku-p" name="plus" placeholder="np. Mniej błędów, szybciej.">${esc(u.plus || "")}</textarea></div>
          <div class="f"><label for="tku-mi">👎 MINUSY (każdy w nowej linii, albo pusto)</label><textarea id="tku-mi" name="minus" placeholder="np. Raz w miesiącu trzeba odnowić token. Albo: nic.">${esc(u.minus || "")}</textarea></div>
        </div>
        <div class="modal-f"><div>${id ? `<button type="button" class="btn danger" data-tk="del-up" data-id="${esc(id)}">Usuń</button>` : ""}</div><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">${id ? "Zapisz" : "Dodaj update"}</button></div></div>
      </form>`);
    }
    async function submitUpdate(form) {
      const fd = new FormData(form), g = (k) => String(fd.get(k) || "").trim();
      if (!g("title")) { const el = form.querySelector("#tku-t"); el.setCustomValidity("Napisz w kilku słowach, co się zmieniło"); el.reportValidity(); setTimeout(() => el.setCustomValidity(""), 1500); return; }
      const id = form.dataset.id || CRM.uid("up");
      const prev = CRM.S.updates[id] || {};
      const data = { ...prev, title: g("title"), who: g("who") || me(), kind: g("kind") || "zmiana", cat: g("cat"), date: g("date") || today(), minutes: parseDur(g("dur")), taskId: g("taskId"), stage: g("stage"), before: g("before"), after: g("after"), benefit: g("benefit"), plus: g("plus"), minus: g("minus"), ts: prev.ts || Date.now() };
      if (data.taskId && !data.cat) data.cat = (CRM.S.tasks[data.taskId] || {}).cat || "";
      if (await CRM.put("updates", id, data)) {
        CRM.closeModal();
        if (!form.dataset.id) CRM.put("activity", CRM.uid("ac"), { ts: Date.now(), who: me(), text: `Lista zmian: ${data.title}`.slice(0, 200), src: "zadania" });
        CRM.toast(form.dataset.id ? "Zapisano update" : "Dodano update do Listy zmian");
      }
    }

    /* ---------- nowe zadanie (formularz) ---------- */
    function openNew(preset) {
      const p = { owner: me(), prio: "sredni", ...(preset || {}) };
      CRM.openModal(`<form id="tkNew" novalidate>
        <div class="modal-h"><h2 id="mTitle">Nowe zadanie</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b">
          <div class="f full"><label for="tkn-t">Co trzeba zrobić? *</label><input id="tkn-t" name="title" value="${esc(p.title || "")}" placeholder="np. Przygotować 3 reklamy na Meta dla lampek" autocomplete="off"></div>
          <div class="f"><label for="tkn-o">Kto robi</label>${personSelect("owner", p.owner, "tkn-o")}</div>
          <div class="f"><label for="tkn-d">Termin</label><input id="tkn-d" name="due" type="date" value="${esc(p.due || "")}"></div>
          <div class="f"><label for="tkn-c">Kategoria</label>${catSelect("cat", p.cat || "", "tkn-c")}</div>
          <div class="f"><label for="tkn-p">Priorytet</label>${optSelect("name", "prio", PR, p.prio, "tkn-p")}</div>
          <div class="f"><label for="tkn-r">Kto akceptuje efekt</label>${personSelect("reviewer", p.reviewer || "", "tkn-r", "— auto: zlecający, gdy zlecasz komuś —")}</div>
          <div class="f"><label for="tkn-e">Ile to może zająć</label><input id="tkn-e" name="estimate" placeholder="np. 2h" autocomplete="off"></div>
          <div class="f full"><label for="tkn-desc">Szczegóły (co, jak, linki)</label><textarea id="tkn-desc" name="desc" placeholder="Co dokładnie ma być zrobione i jak poznamy, że jest gotowe?">${esc(p.desc || "")}</textarea></div>
          <div class="f full"><label for="tkn-s">Podzadania (każde w nowej linii)</label><textarea id="tkn-s" name="subs" placeholder="np.\nZrobić zdjęcia\nNapisać opis\nOpublikować"></textarea></div>
        </div>
        <div class="modal-f"><span class="small muted" style="align-self:center">Zadanie trafi do „Moich zadań” tej osoby.</span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">Dodaj zadanie</button></div></div>
      </form>`);
    }
    async function submitNew(form) {
      const fd = new FormData(form), g = (k) => String(fd.get(k) || "").trim();
      if (!g("title")) { const el = form.querySelector("#tkn-t"); el.setCustomValidity("Napisz, co trzeba zrobić"); el.reportValidity(); setTimeout(() => el.setCustomValidity(""), 1500); return; }
      const subs = g("subs").split("\n").map((s) => s.trim()).filter(Boolean).map((t) => ({ id: CRM.uid("st"), t, done: false, owner: "" }));
      CRM.closeModal();
      const data = { title: g("title"), owner: g("owner"), due: g("due"), cat: g("cat"), prio: g("prio") || "sredni", desc: g("desc"), estimateMin: parseDur(g("estimate")), subtasks: subs };
      if (g("reviewer")) data.reviewer = g("reviewer");
      await createTask(data);
    }

    /* ---------- kategorie ---------- */
    function openCats() {
      const list = cats();
      const rowC = (c, i) => `<div class="tk-cats-row" data-cid="${esc(c.id || "")}"><input name="emoji" value="${esc(c.emoji || "")}" maxlength="4" aria-label="Emoji"><input name="name" value="${esc(c.name || "")}" placeholder="Nazwa kategorii" aria-label="Nazwa"><input name="color" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#8A93A8")}" aria-label="Kolor"><button type="button" class="tk-x" data-tk="cat-del" aria-label="Usuń kategorię">✕</button></div>`;
      CRM.openModal(`<form id="tkCats" novalidate>
        <div class="modal-h"><h2 id="mTitle">Kategorie zadań</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">✕</button></div>
        <div class="modal-b"><div class="f full"><span class="small muted">Kategorie grupują zadania i pokazują w Liście zmian, kto nad czym pracuje. Usunięcie kategorii nie usuwa zadań — trafią do „Bez kategorii”.</span></div>
        <div id="tkCatRows" style="display:contents">${list.map(rowC).join("")}</div>
        <div class="f full"><button type="button" class="btn sm" data-tk="cat-add">+ Dodaj kategorię</button></div></div>
        <div class="modal-f"><span></span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">Zapisz kategorie</button></div></div>
      </form>`);
    }
    async function submitCats(form) {
      const rows = [...form.querySelectorAll(".tk-cats-row")];
      const keep = new Set();
      let i = 0;
      for (const r of rows) {
        const name = r.querySelector("[name=name]").value.trim();
        if (!name) continue;
        const id = r.dataset.cid || "c" + norm(name).replace(/[^a-z0-9]+/g, "-").slice(0, 20) + "-" + Math.random().toString(36).slice(2, 5);
        keep.add(id);
        const data = { name, emoji: r.querySelector("[name=emoji]").value.trim(), color: r.querySelector("[name=color]").value, order: i++ };
        const prev = CRM.S.taskcats[id];
        if (!prev || prev.name !== data.name || prev.emoji !== data.emoji || prev.color !== data.color || prev.order !== data.order) await CRM.put("taskcats", id, data);
      }
      for (const c of cats()) if (!keep.has(c.id)) await CRM.del("taskcats", c.id);
      CRM.closeModal();
      CRM.toast("Kategorie zapisane");
    }

    /* ---------- panel szczegółów zadania ---------- */
    let lastDrawer = "", drawerDirty = false;
    function openTask(id) { if (!CRM.S.tasks[id]) return; U.open = id; refreshDrawer(true); CRM.scheduleRender(); }
    function closeTask() { U.open = null; refreshDrawer(true); CRM.scheduleRender(); }
    function refreshDrawer(force) {
      let el = document.getElementById("tkDrawer");
      const t = U.open && CRM.S.tasks[U.open];
      if (!t) { if (el) el.remove(); document.body.classList.remove("tk-open"); lastDrawer = ""; if (U.open && !CRM.S.tasks[U.open]) U.open = null; return; }
      if (!force && el && el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { drawerDirty = true; return; }
      const html = drawerHtml(t);
      if (el && html === lastDrawer && !force) return;
      if (!el) { el = document.createElement("aside"); el.id = "tkDrawer"; el.className = "tk-drawer"; el.setAttribute("aria-label", "Szczegóły zadania"); document.body.appendChild(el); }
      const body = el.querySelector(".tk-db"), sc = body ? body.scrollTop : 0;
      el.innerHTML = html; lastDrawer = html; drawerDirty = false;
      const nb = el.querySelector(".tk-db"); if (nb) nb.scrollTop = sc;
      const ta = el.querySelector(".tk-title"); if (ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
      document.body.classList.add("tk-open");
    }
    function drawerHtml(t) {
      const st = t.status || "todo";
      const wl = CRM.arr("worklog").filter((w) => w.taskId === t.id).sort((a, b) => b.ts - a.ts);
      const spent = wl.reduce((s, w) => s + (+w.minutes || 0), 0), est = +t.estimateMin || 0;
      const subs = t.subtasks || [];
      const cur = getTimer(), running = cur && cur.id === t.id;
      let action;
      if (st === "done") action = `<button type="button" class="btn okb" data-tk="reopen" data-id="${esc(t.id)}" title="Otwórz ponownie">✓ Zrobione${t.approvedBy ? ` · zaakceptował(a) ${esc(pname(t.approvedBy))}` : ""}</button>`;
      else if (st === "review" && t.reviewer === me()) action = `<button type="button" class="btn okb" data-tk="approve" data-id="${esc(t.id)}">✓ Akceptuj</button><button type="button" class="btn" data-tk="reject" data-id="${esc(t.id)}">↩ Do poprawki</button>`;
      else if (st === "review") action = `<span class="info">📨 Czeka na akceptację: ${esc(pname(t.reviewer))}</span><button type="button" class="btn sm" data-tk="reopen" data-id="${esc(t.id)}">Cofnij</button>`;
      else action = `<button type="button" class="btn ${needsReview(t) ? "vio" : "okb"}" data-tk="complete" data-id="${esc(t.id)}">✓ ${needsReview(t) ? `Oddaj do akceptacji (${esc(pname(t.reviewer))})` : "Oznacz jako zrobione"}</button>`;
      const blocked = (t.blockedBy || []).map((id) => CRM.S.tasks[id]).filter(Boolean);
      const blockOpts = T().filter((x) => x.id !== t.id && x.status !== "done" && !(t.blockedBy || []).includes(x.id)).sort(sortT).slice(0, 100);
      const feed = [
        ...CRM.arr("tcomments").filter((c) => c.taskId === t.id).map((c) => ({ ...c, _t: "c" })),
        ...CRM.arr("tasklog").filter((l) => l.taskId === t.id).map((l) => ({ ...l, _t: "l" })),
        ...CRM.arr("updates").filter((u) => u.taskId === t.id).map((u) => ({ ...u, _t: "u" }))
      ].sort((a, b) => a.ts - b.ts);
      const prev = t.prevId && CRM.S.tasks[t.prevId];
      const nexts = T().filter((x) => x.prevId === t.id);
      return `<div class="tk-dh">${action}<span class="sp"></span>
          <button type="button" class="btn sm" data-tk="${running ? "timer-stop" : "timer-start"}" data-id="${esc(t.id)}" title="${running ? "Zatrzymaj i zapisz czas" : "Włącz stoper"}">${running ? `⏹ <span data-tk-clock>${fmtClock(Date.now() - cur.start)}</span>` : "⏱ Start"}</button>
          <button type="button" class="btn sm ghost" data-tk="dup" data-id="${esc(t.id)}" title="Duplikuj">⧉</button>
          <button type="button" class="btn sm ghost" data-tk="del" data-id="${esc(t.id)}" title="Usuń zadanie">🗑</button>
          <button type="button" class="btn sm ghost" data-tk="close" aria-label="Zamknij panel">✕</button></div>
        <div class="tk-db">
          <div class="crumb">${catChip(t.cat)} ${pill(ST, st)} ${t.createdAt ? `<span>dodane ${esc(fmtTs(t.createdAt))}${t.createdBy ? ` przez ${esc(pname(t.createdBy))}` : ""}</span>` : ""}</div>
          <textarea class="tk-title" data-tkf="title" rows="1" aria-label="Nazwa zadania">${esc(t.title || "")}</textarea>
          <div class="tk-fields">
            <label for="tkf-owner">Kto robi</label><select id="tkf-owner" data-tkf="owner"><option value="">— nikt —</option>${CRM.team().map((p) => `<option value="${p.k}" ${t.owner === p.k ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
            <label for="tkf-due">Termin</label><input id="tkf-due" type="date" data-tkf="due" value="${esc(t.due || "")}">
            <label for="tkf-cat">Kategoria</label>${catSelect("cat", t.cat || "", "tkf-cat", "data-tkf")}
            <label for="tkf-prio">Priorytet</label>${optSelect("data-tkf", "prio", PR, t.prio || "sredni", "tkf-prio")}
            <label for="tkf-st">Status</label>${optSelect("data-tkf", "status", ST.map((s) => [s[0], s[1]]), st, "tkf-st")}
            <label for="tkf-cb">Zlecił(a)</label><select id="tkf-cb" data-tkf="createdBy"><option value="">—</option>${CRM.team().map((p) => `<option value="${p.k}" ${t.createdBy === p.k ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
            <label for="tkf-rv">Akceptuje efekt</label><select id="tkf-rv" data-tkf="reviewer"><option value="">— bez akceptacji —</option>${CRM.team().map((p) => `<option value="${p.k}" ${t.reviewer === p.k ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
            <label for="tkf-start">Start</label><input id="tkf-start" type="date" data-tkf="start" value="${esc(t.start || "")}">
            <label for="tkf-est">Plan czasu</label><input id="tkf-est" data-tkf="estimate" value="${est ? esc(fmtMin(est)) : ""}" placeholder="np. 2h" autocomplete="off">
            <label for="tkf-rc">Powtarzaj</label>${optSelect("data-tkf", "recur", RECUR, t.recur || "", "tkf-rc")}
            <label for="tkf-tags">Tagi</label><input id="tkf-tags" data-tkf="tags" value="${esc((t.tags || []).join(", "))}" placeholder="np. pilne, lampki" autocomplete="off">
          </div>
          <div class="tk-next"><label for="tkf-next">➡️ Następny krok (co dalej po tym zadaniu?)</label><input id="tkf-next" data-tkf="nextStep" value="${esc(t.nextStep || "")}" placeholder="np. Po akceptacji puścić reklamę" autocomplete="off"></div>
          ${prev || nexts.length ? `<div class="tk-chips" style="margin-top:10px">${prev ? `<span class="small muted">Wynika z:</span><button type="button" class="tk-chip ${prev.status === "done" ? "done" : ""}" data-tk="open" data-id="${esc(prev.id)}" style="padding-right:10px;cursor:pointer">${esc(prev.title)}</button>` : ""}${nexts.length ? `<span class="small muted">Kolejne kroki:</span>${nexts.map((n) => `<button type="button" class="tk-chip ${n.status === "done" ? "done" : ""}" data-tk="open" data-id="${esc(n.id)}" style="padding-right:10px;cursor:pointer">${esc(n.title)} · ${esc(pname(n.owner))}</button>`).join("")}` : ""}</div>` : ""}
          <div class="tk-h">Opis</div>
          <textarea class="tk-ta" data-tkf="desc" placeholder="Co dokładnie zrobić i jak poznamy, że jest gotowe?">${esc(t.desc || "")}</textarea>
          <div class="tk-h">Podzadania <span class="muted">${subs.length ? `${subs.filter((s) => s.done).length} z ${subs.length}` : ""}</span></div>
          ${subs.map((s) => `<div class="tk-sub ${s.done ? "done" : ""}"><button type="button" class="tk-chk ${s.done ? "on" : ""}" data-tk="sub-toggle" data-sid="${esc(s.id)}" aria-label="${s.done ? "Odznacz" : "Zrobione"}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></button><input class="tx" data-tkf="sub-t" data-sid="${esc(s.id)}" value="${esc(s.t)}" aria-label="Podzadanie"><input type="date" data-tkf="sub-due" data-sid="${esc(s.id)}" value="${esc(s.due || "")}" aria-label="Termin podzadania"><select data-tkf="sub-o" data-sid="${esc(s.id)}" aria-label="Kto"><option value="">kto?</option>${CRM.team().map((p) => `<option value="${p.k}" ${s.owner === p.k ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><button type="button" class="tk-x" data-tk="sub-del" data-sid="${esc(s.id)}" aria-label="Usuń podzadanie">✕</button></div>`).join("")}
          <input class="tk-in" id="tkd-subnew" data-tkenter="sub" placeholder="+ Dodaj podzadanie i Enter" autocomplete="off" style="margin-top:8px">
          <div class="tk-h">Czeka na <span class="muted">zadanie nie ruszy, dopóki te nie są zrobione</span></div>
          <div class="tk-chips">${blocked.map((b) => `<span class="tk-chip ${b.status === "done" ? "done" : ""}"><button type="button" class="tk-linkb" data-tk="open" data-id="${esc(b.id)}" style="text-decoration:none">${esc(b.title)}</button><button type="button" class="tk-x" data-tk="block-del" data-bid="${esc(b.id)}" aria-label="Usuń zależność">✕</button></span>`).join("")}
            <select data-tkf="block-add" style="border:1px dashed var(--line);background:transparent;border-radius:99px;padding:3px 8px;font-size:12px" aria-label="Dodaj zadanie, na które czekamy"><option value="">+ dodaj</option>${blockOpts.map((x) => `<option value="${esc(x.id)}">${esc(x.title.slice(0, 60))}</option>`).join("")}</select></div>
          <div class="tk-h">Czas pracy <span class="muted">${fmtMin(spent)}${est ? ` z planowanych ${fmtMin(est)}` : ""}</span></div>
          ${est ? `<div class="tk-tbar ${spent > est ? "over" : ""}"><i style="width:${Math.min(100, Math.round((spent / est) * 100))}%"></i></div>` : ""}
          ${wl.map((w) => `<div class="tk-wl">${av(w.who, 20)}<span class="h">${esc(fmtMin(w.minutes))}</span><span class="n">${esc(fmtD(w.date))}${w.note ? " · " + esc(w.note) : ""}</span><button type="button" class="tk-x" data-tk="wl-del" data-wid="${esc(w.id)}" aria-label="Usuń wpis czasu">✕</button></div>`).join("")}
          <div class="tk-wlf"><input class="tk-in" id="tkd-wdur" placeholder="np. 1h 30m" aria-label="Ile czasu" autocomplete="off" data-tkenter="wl"><input class="tk-in" id="tkd-wdate" type="date" value="${today()}" aria-label="Data"><input class="tk-in" id="tkd-wnote" placeholder="Co robiłeś/aś? (opcjonalnie)" aria-label="Notatka" autocomplete="off" data-tkenter="wl"><button type="button" class="btn sm" data-tk="wl-add">+ Dodaj czas</button></div>
          <div class="tk-h">Efekt / rozliczenie</div>
          <textarea class="tk-ta" data-tkf="result" placeholder="Co zostało zrobione? Link do efektu, liczby, zrzut.">${esc(t.result || "")}</textarea>
          <div class="tk-h">Komentarze i historia</div>
          <div class="tk-feed">${feed.map((f) => f._t === "c"
            ? `<div class="tk-cm">${av(f.who, 28)}<div class="bx"><div class="hd"><b style="color:var(--ink)">${esc(pname(f.who))}</b><span>${esc(fmtTs(f.ts))}</span>${f.who === me() ? `<button type="button" class="tk-x" data-tk="cm-del" data-cid="${esc(f.id)}" aria-label="Usuń komentarz" style="margin-left:auto">✕</button>` : ""}</div><div class="tx">${richText(f.text)}</div></div></div>`
            : f._t === "u" ? `<div class="tk-ev">${av(f.who, 20)}<span><b>${esc(pname(f.who))}</b> dodał(a) wpis do listy zmian: <button type="button" class="tk-linkb" data-tk="edit-up" data-id="${esc(f.id)}">${esc(f.title)}</button> · ${esc(fmtTs(f.ts))}</span></div>`
            : `<div class="tk-ev">${av(f.who, 20)}<span><b>${esc(pname(f.who))}</b> · ${esc(f.text)} · ${esc(fmtTs(f.ts))}</span></div>`).join("") || `<div class="small muted">Brak komentarzy. Napisz pierwszy — użyj @Imię, żeby oznaczyć wspólnika.</div>`}</div>
          <div class="tk-cmf"><textarea class="tk-ta" id="tkd-cm" placeholder="Napisz komentarz… (@Michał, Ctrl+Enter wysyła)"></textarea><button type="button" class="btn primary" data-tk="cm-add">Wyślij</button></div>
        </div>
        <div class="tk-df">Zmiany zapisują się same i widać je u wspólników na żywo.</div>`;
    }
    async function onField(k, el) {
      const t = CRM.S.tasks[U.open];
      if (!t) return;
      const v = el.value;
      const sid = el.dataset.sid;
      const subs = (t.subtasks || []).map((s) => ({ ...s }));
      switch (k) {
        case "title": { const nv = v.replace(/\s+/g, " ").trim(); if (nv && nv !== t.title) await patch(t.id, { title: nv }, `Zmiana nazwy: ${t.title} → ${nv}`, false); else el.value = t.title; break; }
        case "owner": await patch(t.id, { owner: v, reviewer: t.reviewer || (v && v !== me() ? me() : "") }, v ? `${t.title} → robi ${pname(v)}` : `${t.title}: bez osoby`, !!v && v !== me()); break;
        case "createdBy": await patch(t.id, { createdBy: v }); break;
        case "reviewer": await patch(t.id, { reviewer: v }, v ? `${t.title}: akceptuje ${pname(v)}` : `${t.title}: bez akceptacji`, false); break;
        case "due": await patch(t.id, { due: v }, `${t.title}: termin ${v ? fmtD(v) : "usunięty"}`, false); break;
        case "start": await patch(t.id, { start: v }); break;
        case "prio": await patch(t.id, { prio: v }, `${t.title}: priorytet ${optL(PR, v)}`, false); break;
        case "status": setStatus(t, v); break;
        case "cat": await patch(t.id, { cat: v }, `${t.title} → ${catName(v)}`, false); break;
        case "estimate": await patch(t.id, { estimateMin: parseDur(v) }); break;
        case "recur": await patch(t.id, { recur: v }); break;
        case "tags": await patch(t.id, { tags: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12) }); break;
        case "desc": if (v !== (t.desc || "")) await patch(t.id, { desc: v }); break;
        case "nextStep": if (v.trim() !== (t.nextStep || "")) await patch(t.id, { nextStep: v.trim() }); break;
        case "result": if (v !== (t.result || "")) await patch(t.id, { result: v }); break;
        case "block-add": if (v) await patch(t.id, { blockedBy: [...new Set([...(t.blockedBy || []), v])] }); break;
        case "sub-t": { const s = subs.find((x) => x.id === sid); if (s && v.trim() && v.trim() !== s.t) { s.t = v.trim(); await patch(t.id, { subtasks: subs }); } break; }
        case "sub-o": { const s = subs.find((x) => x.id === sid); if (s) { s.owner = v; await patch(t.id, { subtasks: subs }); } break; }
        case "sub-due": { const s = subs.find((x) => x.id === sid); if (s) { s.due = v; await patch(t.id, { subtasks: subs }); } break; }
      }
      refreshDrawer(true);
    }

    /* Update'y dopisywane przez ten moduł: zmiany w panelu (autor: Claude) i praca zrobiona z Claude w innych miejscach.
       Podbicie „v” odświeża tekst; wpisu poprawionego ręcznie w panelu (bez „seeded”) nie nadpisujemy. */
    const CLAUDE_UPDATES = {
      "up-20261111-bez-banera": {
        v: 1, who: "p1", date: "2026-11-11", stage: "live", cat: "tech", title: "Panel bez mega banera — spokojnie i przejrzyście",
        before: "Na górze każdej strony wielki baner: łopoczące flagi, fajerwerki, gierki i pasek z żartami.\nPod nim drugi baner z animacją.",
        after: "Banery usunięte. Od razu widać tytuł zakładki i to, co ważne.\nLogo, biało-czerwone barwy i wstęga w menu zostają.",
        benefit: "Mniej przewijania, spokój dla oczu, szybsza praca.",
        plus: "Przejrzyście\nNic nie miga i nie łopocze\nPanel ładuje się szybciej",
        minus: "Gierki zniknęły (wyniki w bazie zostają)"
      },
      "up-20261111-sprzedawca": {
        v: 1, who: "p1", date: "2026-11-11", stage: "live", cat: "sklepy", title: "Dane sprzedawcy wpisywane raz + pełny regulamin sklepu",
        before: "Dane sprzedawcy trzeba było wpisywać osobno na każdej karcie (wszystkie były puste).\nRegulamin karty był skrócony, a na www stały puste pola [NIP], [REGON].",
        after: "Ustawienia → Dane sprzedawcy: wpisujesz raz, trafiają do każdej karty i na www.\nRegulamin ma pełne prawa konsumenta, płatność Stripe, wzór odstąpienia i wariant bez NIP.\nPolityka prywatności opisuje zamówienia (dostawca, kurier, Stripe).",
        benefit: "Strony mogą legalnie sprzedawać konsumentom bez ręcznego poprawiania każdej karty.",
        plus: "Jedno miejsce na dane\nDziała też bez NIP (działalność nierejestrowana)",
        minus: "Trzeba raz uruchomić SQL z supabase.sql (sekcja Dane sprzedawcy)\nRegulamin to wzór — warto, żeby przejrzał go prawnik"
      },
      "up-20261111-kampanie": {
        v: 2, who: "p1", date: "2026-11-11", stage: "live", cat: "reklamy", title: "Zakładka Kampanie reklamowe (Meta, Google Ads, TikTok)",
        before: "W panelu nie było miejsca na płatne reklamy.\nNie było wiadomo, która reklama zarabia, a która przepala pieniądze.",
        after: "Każda kampania ma swoją kartę: ile wydaliśmy, ile sprzedaliśmy i ile zostało na czysto.\nPanel sam mówi: zarabia / traci / wyłącz / zwiększ budżet o 20%.\nPrzy dodawaniu kampanii widać, ile może kosztować jedno zamówienie z reklamy.",
        benefit: "Wydajemy na reklamy tylko tam, gdzie wraca więcej, niż kosztują.",
        plus: "Zysk liczony po koszcie towaru, wysyłce i prowizji — nie tylko ROAS\nLista „Co zrobić teraz”\nGotowy link z UTM do każdej reklamy\nLista kroków „Start reklam” (Pixel, konwersje, API)",
        minus: "Na razie wyniki przepisujemy z Ads Managera ręcznie (minuta dziennie)\nAutomatyczne pobieranie ruszy po podpięciu kont Meta i Google (token Google trwa kilka dni)"
      },
      "up-20261111-realizacja": {
        v: 1, who: "p1", date: "2026-11-11", stage: "pending", cat: "sklepy", title: "Realizacja: zamówienie samo idzie do dostawcy, numer przesyłki sam wraca",
        before: "Opłacone zamówienie trzeba było ręcznie zamówić u dostawcy.\nNumer przesyłki i status wpisywaliśmy sami.",
        after: "Opłacone zamówienie trafia do kolejki i co 5 minut idzie do dostawcy: BigBuy (API), e-mail do hurtowni albo etykieta InPost.\nNumer przesyłki i statusy „Wysłane” / „Dostarczone” wracają same.\nLimity: koszt jednego zamówienia, dzienny budżet, minimalna marża. Start w trybie próbnym.",
        benefit: "Zamówienia realizują się bez nas, a pieniądze nie wyciekną przez błąd.",
        plus: "Działa z każdą hurtownią (e-mail)\nPaczkomaty i kurier InPost\nTryb próbny i limity wydatków",
        minus: "Trzeba wybrać hurtownię i wpisać klucze w zakładce Realizacja\nNa żywo włączacie sami\nBigBuy nie dowozi do paczkomatów"
      },
      "up-20261111-platnosci": {
        v: 2, who: "p1", date: "2026-11-11", stage: "live", cat: "sklepy", title: "Płatności BLIK, Przelewy24 i kartą (Stripe) na stronach produktów",
        before: "Strona produktu zbierała tylko zamówienie.\nNa pieniądze czekaliśmy na przelew.",
        after: "Klient płaci od razu: BLIK, Przelewy24 albo karta, na dokładną kwotę.\nOpłacone zamówienie samo dostaje status „Opłacone”.\nW panelu jest zakładka Płatności z listą wpłat.",
        benefit: "Pieniądze od razu i mniej porzuconych zamówień.",
        plus: "Płatność w kilka sekund\nStatus płatności ustawia się sam",
        minus: "Stripe bierze prowizję od każdej płatności"
      },
      "up-20261111-social": {
        v: 2, who: "p1", date: "2026-11-11", stage: "live", cat: "social", title: "Zakładka Social media (Facebook, TikTok, Instagram)",
        before: "Social media prowadziliśmy poza panelem, bez wspólnego planu.",
        after: "W panelu jest zakładka Social media z podglądem autopilota postów dla sklepów.",
        benefit: "Posty dla każdego sklepu w jednym miejscu, bez ręcznego pilnowania.",
        plus: "Wszystko w jednym miejscu\nAutopilot podpowiada posty",
        minus: "Konta FB / TikTok / Instagram trzeba jeszcze założyć i podpiąć"
      },
      "up-20261111-www": {
        v: 1, who: "p1", date: "2026-11-11", stage: "pending", cat: "sklepy", title: "Strona www: tradycyjne wartości, polityka prywatności i regulamin",
        before: "Strona firmowa była tylko na home.pl.\nNie było polityki prywatności ani regulaminu.",
        after: "Nowa treść: tradycyjne wartości i „Dlaczego warto nam zaufać”.\nJest polityka prywatności i regulamin.\nFormularz kontaktowy zapisuje leady w panelu.",
        benefit: "Klient bardziej ufa firmie, a my spełniamy wymogi RODO.",
        plus: "Zgodność z prawem\nLepsze pierwsze wrażenie\nLeady z formularza od razu w panelu",
        minus: "Czeka na Merge PR #14 i #17\nTrzeba przestawić DNS w home.pl na Cloudflare\nBrakuje danych firmy (NIP, REGON, adres) w polityce"
      },
      "up-praca-start": {
        v: 1, cat: "tech", title: "Panel zapisuje czas pracy: „Zaczynam pracę” i „Kończę pracę”",
        before: "Panel nie wiedział, kto i ile pracuje.\nW „Kto ile pracował” było 0 h.",
        after: "Po zalogowaniu panel pyta: „Zaczynasz pracę?”.\nNa górze cały czas jest zielony pasek z zegarem.\nNa koniec klikasz „Kończę pracę”.",
        benefit: "Każda godzina Kamila, Michała i Agaty zapisuje się sama.",
        plus: "Jedno kliknięcie na start, jedno na koniec\nWidać, kto teraz pracuje\nZapomniane zakończenie panel poprawi przy następnym logowaniu",
        minus: "Trzeba pamiętać o „Kończę pracę” (pasek o tym przypomina)"
      },
      "up-start-zadania": {
        v: 2, cat: "tech", title: "Zadania działają teraz jak w Asanie",
        before: "Zadania to były 3 kolumny z kartkami.\nNie dało się zlecić zadania i sprawdzić, czy jest zrobione.\nNie było widać, kto ile pracuje.",
        after: "Każde zadanie ma: kto robi, na kiedy i z jakiej kategorii.\nZlecasz → wspólnik robi → Ty klikasz „Akceptuj”.\nCzas pracy liczy stoper.",
        benefit: "Każdy rano wie, co ma zrobić. Nic nie ginie.",
        plus: "Porządek w zadaniach\nWidać, kto co zrobił\nNastępny krok tworzy się sam przy zamykaniu",
        minus: "Trzeba włączać stoper albo wpisać czas"
      },
      "up-start-zmiany": {
        v: 1, cat: "tech", title: "Lista zmian i update'y — wszystko po ludzku",
        before: "Nie było jednego miejsca, gdzie widać, co się zmieniło w firmie.",
        after: "Każda zmiana to jedna karta: ❌ było → ✅ jest → 🎯 co nam to daje → 👍 plusy → 👎 minusy.",
        benefit: "W 10 sekund wiesz, co się zmieniło i po co.",
        plus: "Prosto i czytelnie\nWidać autora i datę\nWidać godziny Kamila, Michała i Agaty",
        minus: "Ktoś musi dopisać update (przy zamykaniu zadania to pół minuty)"
      }
    };

    /* ---------- seed: kategorie + wpis o tej zmianie ---------- */
    CRM.readyFns.push(async () => {
      if (!CRM.S.settings || !CRM.SB) return;
      if (!CRM.arr("taskcats").length) {
        for (let i = 0; i < DEF_CATS.length; i++) { const [id, name, emoji, color] = DEF_CATS[i]; await CRM.put("taskcats", id, { name, emoji, color, order: i }); }
      }
      for (const [id, u] of Object.entries(CLAUDE_UPDATES)) {
        const cur = CRM.S.updates[id];
        if (!cur || ((cur.seeded || cur.who === "claude") && (cur.v || 0) < u.v)) await CRM.put("updates", id, { who: "claude", kind: "zmiana", ts: cur ? cur.ts : Date.now(), date: cur ? cur.date : today(), seeded: true, ...u });
      }
      paintShift(true);
      setTimeout(askShift, 1800);
    });

    /* ---------- liczniki w menu + odświeżanie panelu ---------- */
    CRM.badgeFns.push(() => {
      queueMicrotask(() => { refreshDrawer(false); paintShift(false); });
      const m = me();
      const mine = T().filter((t) => t.owner === m && t.status !== "done" && t.status !== "review").length;
      const rev = T().filter((t) => t.status === "review" && t.reviewer === m).length;
      const seen = Number(lsGet(`tk-seen-${m}`, "0")) || 0;
      if (location.hash.slice(1) !== "zmiany") U.zSeen = 0;
      const fresh = location.hash.slice(1) === "zmiany" ? 0 : CRM.arr("updates").filter((u) => u.who !== m && +u.ts > seen).length;
      return { zadania: mine + rev, zmiany: fresh };
    });

    /* ---------- baner widoku Lista zmian ---------- */
    const B = window.NHP_BRAND;
    if (B && B.banner && !B._tk) {
      const orig = B.banner;
      let mine = false;
      B.banner = (v) => {
        if (v !== "zmiany") { mine = false; return orig(v); }
        if (mine) return;
        orig("__tk"); mine = true;
        const host = document.getElementById("vart");
        if (host) host.innerHTML = `<section class="vbanner enter"><div class="vb-grid"></div><div class="vb-txt"><div class="vb-eye">Lista zmian i update'y</div><h2>Było ❌ → Jest ✅</h2><p>Każda zmiana w firmie w jednej prostej karcie. I kto ile pracował.</p></div><div class="vb-art">${B.svg ? B.svg("tasks") : ""}</div></section>`;
      };
      B._tk = 1;
    }

    /* ---------- zdarzenia ---------- */
    // Zadania klikane z Pulpitu i przycisk „Nowe zadanie” z rdzenia otwierają nowy panel zamiast starego formularza.
    document.addEventListener("click", (e) => {
      const ed = e.target.closest('[data-edit^="tasks:"]');
      if (ed) { e.preventDefault(); e.stopPropagation(); openTask(ed.dataset.edit.slice(6)); return; }
      const nw = e.target.closest('[data-new="tasks"]');
      if (nw) { e.preventDefault(); e.stopPropagation(); openNew({}); }
    }, true);

    document.addEventListener("click", async (e) => {
      const el = e.target.closest("[data-tk]");
      if (!el) return;
      const a = el.dataset.tk, id = el.dataset.id;
      const t = id && CRM.S.tasks[id];
      const dt = U.open && CRM.S.tasks[U.open];
      switch (a) {
        case "open": if (t) openTask(id); break;
        case "check": e.stopPropagation(); if (!t) break; if (t.status === "done") reopen(id); else if (t.status === "review") { if (t.reviewer === me()) approve(id); else CRM.toast(`Czeka na akceptację: ${pname(t.reviewer)}`); } else openComplete(id); break;
        case "complete": if (t) openComplete(id); break;
        case "approve": e.stopPropagation(); approve(id); break;
        case "reject": e.stopPropagation(); openReject(id); break;
        case "reopen": reopen(id); break;
        case "close": closeTask(); break;
        case "view": U.view = el.dataset.v; lsSet("tk-view", U.view); CRM.scheduleRender(); break;
        case "who": U.who = el.dataset.v; CRM.scheduleRender(); break;
        case "showDone": U.showDone = !U.showDone; CRM.scheduleRender(); break;
        case "fold": U.fold[el.dataset.k] = !U.fold[el.dataset.k]; CRM.scheduleRender(); break;
        case "period": U[el.dataset.key] = el.dataset.v; CRM.scheduleRender(); break;
        case "zwho": U.zWho = el.dataset.v; CRM.scheduleRender(); break;
        case "more": U.zLimit += 150; CRM.scheduleRender(); break;
        case "month": { const n = +el.dataset.v; if (!n) U.month = today().slice(0, 7); else { const [y, m] = U.month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1, 12); U.month = isoOf(d).slice(0, 7); } CRM.scheduleRender(); break; }
        case "new": { let p = {}; try { p = JSON.parse(el.dataset.preset || "{}"); } catch (err) {} openNew({ ...baseFor(), ...p }); break; }
        case "cats": openCats(); break;
        case "cat-add": { const box = document.getElementById("tkCatRows"); if (box) { box.insertAdjacentHTML("beforeend", `<div class="tk-cats-row" data-cid=""><input name="emoji" value="📌" maxlength="4" aria-label="Emoji"><input name="name" placeholder="Nazwa kategorii" aria-label="Nazwa"><input name="color" type="color" value="#2F6FD6" aria-label="Kolor"><button type="button" class="tk-x" data-tk="cat-del" aria-label="Usuń kategorię">✕</button></div>`); box.lastElementChild.querySelector("[name=name]").focus(); } break; }
        case "cat-del": el.closest(".tk-cats-row").remove(); break;
        case "new-up": openUpdate(null); break;
        case "edit-up": openUpdate(id); break;
        case "del-up": if (!el.dataset.sure) { el.dataset.sure = "1"; el.textContent = "Na pewno usunąć?"; break; } if (await CRM.del("updates", id)) { CRM.closeModal(); CRM.toast("Usunięto wpis"); } break;
        case "csv-tasks": csvTasks(); break;
        case "csv-time": csvTime("period"); break;
        case "csv-time-z": csvTime("zPeriod"); break;
        case "timer-start": startTimer(id); refreshDrawer(true); break;
        case "timer-stop": await stopTimer(true); refreshDrawer(true); break;
        case "shift-start": CRM.closeModal(); await startShift(); break;
        case "shift-end": openEndAsk(); break;
        case "shift-skip": try { sessionStorage.setItem("tk-shift-asked", me()); } catch (err) {} CRM.closeModal(); break;
        case "dup": if (t) { const nid = await createTask({ ...t, id: undefined, title: t.title + " (kopia)", status: "todo", doneAt: null, doneBy: "", approvedBy: "", approvedAt: null, result: "", createdBy: me(), createdAt: Date.now(), subtasks: (t.subtasks || []).map((s) => ({ ...s, id: CRM.uid("st"), done: false })) }); if (nid) openTask(nid); } break;
        case "del": {
          if (!t) break;
          if (!el.dataset.sure) { el.dataset.sure = "1"; el.textContent = "Usunąć?"; el.classList.add("danger"); setTimeout(() => { if (el.isConnected) { el.dataset.sure = ""; el.textContent = "🗑"; el.classList.remove("danger"); } }, 3000); break; }
          const extra = [...CRM.arr("tcomments").filter((c) => c.taskId === id).map((c) => ["tcomments", c.id]), ...CRM.arr("tasklog").filter((c) => c.taskId === id).map((c) => ["tasklog", c.id])];
          if (await CRM.del("tasks", id)) {
            U.open = null; refreshDrawer(true);
            CRM.put("activity", CRM.uid("ac"), { ts: Date.now(), who: me(), text: `Usunięto zadanie: ${t.title}`.slice(0, 200), src: "zadania-del" });
            for (const [c, x] of extra) await CRM.del(c, x);
            CRM.toast("Zadanie usunięte (czas pracy zostaje w rozliczeniu)");
          }
          break;
        }
        case "sub-toggle": if (dt) { const subs = (dt.subtasks || []).map((s) => (s.id === el.dataset.sid ? { ...s, done: !s.done, doneBy: !s.done ? me() : "", doneAt: !s.done ? Date.now() : null } : s)); const s = subs.find((x) => x.id === el.dataset.sid); await patch(dt.id, { subtasks: subs }, s && s.done ? `Podzadanie zrobione: ${s.t} (${dt.title})` : "", false); if (s && s.done && subs.every((x) => x.done)) CRM.toast("Wszystkie podzadania zrobione — możesz zamknąć zadanie ✓"); refreshDrawer(true); } break;
        case "sub-del": if (dt) { await patch(dt.id, { subtasks: (dt.subtasks || []).filter((s) => s.id !== el.dataset.sid) }); refreshDrawer(true); } break;
        case "block-del": if (dt) { await patch(dt.id, { blockedBy: (dt.blockedBy || []).filter((x) => x !== el.dataset.bid) }); refreshDrawer(true); } break;
        case "wl-add": await addWorkFromDrawer(); break;
        case "wl-del": { const w = CRM.S.worklog[el.dataset.wid]; if (w && (w.who === me() || confirm("Usunąć czas pracy wspólnika?"))) { await CRM.del("worklog", w.id); refreshDrawer(true); } break; }
        case "cm-add": await addComment(); break;
        case "cm-del": await CRM.del("tcomments", el.dataset.cid); refreshDrawer(true); break;
      }
    });
    async function addWorkFromDrawer() {
      const t = CRM.S.tasks[U.open]; if (!t) return;
      const d = document.getElementById("tkd-wdur"), n = document.getElementById("tkd-wnote"), dt = document.getElementById("tkd-wdate");
      const min = parseDur(d && d.value);
      if (!min) { if (d) { d.focus(); d.setCustomValidity("Wpisz czas, np. 1h 30m"); d.reportValidity(); setTimeout(() => d.setCustomValidity(""), 1500); } return; }
      await addWork(t, min, n ? n.value : "", dt ? dt.value : today());
      if (t.status === "todo") await patch(t.id, { status: "doing" }, `${t.title} → W trakcie`, false);
      CRM.toast(`Zapisano ${fmtMin(min)}`);
      refreshDrawer(true);
    }
    async function addComment() {
      const t = CRM.S.tasks[U.open]; const box = document.getElementById("tkd-cm");
      if (!t || !box || !box.value.trim()) return;
      const text = box.value.trim().slice(0, 4000);
      box.value = "";
      await CRM.put("tcomments", CRM.uid("cm"), { taskId: t.id, who: me(), ts: Date.now(), text });
      const tagged = CRM.team().filter((p) => p.k !== me() && text.includes("@" + p.name));
      if (tagged.length) CRM.put("activity", CRM.uid("ac"), { ts: Date.now(), who: me(), text: `${tagged.map((p) => "@" + p.name).join(" ")} — komentarz w: ${t.title}`.slice(0, 200), src: "zadania-cm" });
      refreshDrawer(true);
    }

    document.addEventListener("change", (e) => {
      const f = e.target.closest("[data-tkf]");
      if (f && U.open && f.closest("#tkDrawer")) { onField(f.dataset.tkf, f); return; }
      const i = e.target.closest("[data-tkin]");
      if (i && i.tagName === "SELECT") { const k = i.dataset.tkin; U[k] = i.value; if (k === "group") lsSet("tk-group", i.value); if (k === "boardBy") lsSet("tk-board", i.value); CRM.scheduleRender(); }
    });
    document.addEventListener("input", (e) => {
      const i = e.target.closest("input[data-tkin]");
      if (i) { U[i.dataset.tkin] = i.value; CRM.scheduleRender(); return; }
      const q = e.target.closest("[data-tkq]");
      if (q) U.drafts[q.dataset.tkq] = q.value;
      if (e.target.classList.contains("tk-title")) { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }
    });
    document.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("tk-hist")) U.zHist = e.target.open; }, true);
    document.addEventListener("focusout", (e) => { if (drawerDirty && e.target.closest && e.target.closest("#tkDrawer")) setTimeout(() => refreshDrawer(false), 60); });
    document.addEventListener("keydown", async (e) => {
      const q = e.target.closest && e.target.closest("[data-tkq]");
      if (q && e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        const txt = q.value.trim(); if (!txt) return;
        const key = q.dataset.tkq;
        const g = findGroup(key);
        const mineSet = { "m-today": { owner: me(), due: today() }, "m-week": { owner: me(), due: addDays(today(), 1) }, "m-none": { owner: me() } }[key];
        const data = parseQuick(txt, mineSet || baseFor(g && g.set));
        if (!data.title) return;
        if (data.status === "done") data.status = "todo";
        U.drafts[key] = ""; q.value = "";
        await createTask(data);
        return;
      }
      if (e.target.classList && e.target.classList.contains("tk-title") && e.key === "Enter") { e.preventDefault(); e.target.blur(); return; }
      if (e.target.id === "tkd-subnew" && e.key === "Enter") {
        e.preventDefault();
        const t = CRM.S.tasks[U.open], v = e.target.value.trim();
        if (!t || !v) return;
        e.target.value = "";
        await patch(t.id, { subtasks: [...(t.subtasks || []), { id: CRM.uid("st"), t: v, done: false, owner: "" }] });
        refreshDrawer(true);
        const ni = document.getElementById("tkd-subnew"); if (ni) ni.focus();
        return;
      }
      if (e.target.dataset && e.target.dataset.tkenter === "wl" && e.key === "Enter") { e.preventDefault(); addWorkFromDrawer(); return; }
      if (e.target.id === "tkd-cm" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addComment(); return; }
      if (e.key === "Enter" && e.target.matches && e.target.matches('[data-tk="open"]:not(button)')) { e.target.click(); return; }
      if (e.key === "Escape" && U.open && !document.getElementById("scrim").classList.contains("open")) closeTask();
    });
    document.addEventListener("submit", (e) => {
      const id = e.target.id;
      if (!["tkDone", "tkRej", "tkUp", "tkNew", "tkCats", "tkShiftAsk", "tkShiftEnd", "tkShiftFix"].includes(id)) return;
      e.preventDefault();
      if (id === "tkShiftAsk") { const from = e.target.from ? e.target.from.value : ""; CRM.closeModal(); startShift(false, from); return; }
      if (id === "tkShiftEnd") { const sm = e.target.summary.value; CRM.closeModal(); endShift(sm); return; }
      if (id === "tkShiftFix") {
        const x = openShift(me()), v = e.target.end.value;
        CRM.closeModal();
        if (x) { const t = v ? new Date(v).getTime() : NaN; endShift("", isFinite(t) ? t : Math.min(+x.start + 8 * 3600e3, Date.now())).then(() => setTimeout(askShift, 400)); }
        return;
      }
      if (id === "tkDone") submitComplete(e.target);
      else if (id === "tkRej") submitReject(e.target);
      else if (id === "tkUp") submitUpdate(e.target);
      else if (id === "tkNew") submitNew(e.target);
      else submitCats(e.target);
    });

    /* przeciąganie: tablica (status/kategoria/osoba/termin), lista (między sekcjami), kalendarz (termin) */
    let dragId = null;
    document.addEventListener("dragstart", (e) => {
      const c = e.target.closest && e.target.closest("[data-drag]");
      if (!c) return;
      dragId = c.dataset.drag;
      try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) {}
      c.classList.add("tk-dragging");
    });
    document.addEventListener("dragend", () => { dragId = null; document.querySelectorAll(".tk-dragging,.tk-over").forEach((x) => x.classList.remove("tk-dragging", "tk-over")); });
    document.addEventListener("dragover", (e) => {
      if (!dragId) return;
      const z = e.target.closest && e.target.closest("[data-drop],[data-drop-due]");
      if (!z) return;
      e.preventDefault();
      document.querySelectorAll(".tk-over").forEach((x) => x !== z && x.classList.remove("tk-over"));
      z.classList.add("tk-over");
    });
    document.addEventListener("drop", async (e) => {
      if (!dragId) return;
      const z = e.target.closest && e.target.closest("[data-drop],[data-drop-due]");
      if (!z) return;
      e.preventDefault();
      z.classList.remove("tk-over");
      const id = dragId; dragId = null;
      const t = CRM.S.tasks[id];
      if (!t) return;
      if (z.dataset.dropDue !== undefined) { if (t.due !== z.dataset.dropDue) await patch(id, { due: z.dataset.dropDue }, `${t.title}: termin ${fmtD(z.dataset.dropDue)}`, false); return; }
      const g = findGroup(z.dataset.drop);
      if (!g || !g.set || g.test(t)) return;
      if (g.set.status) { setStatus(t, g.set.status); return; }
      const k = Object.keys(g.set)[0];
      const lbl = k === "owner" ? `${t.title} → robi ${pname(g.set.owner)}` : k === "cat" ? `${t.title} → ${catName(g.set.cat)}` : `${t.title}: termin ${g.set.due ? fmtD(g.set.due) : "usunięty"}`;
      await patch(id, g.set, lbl, k === "owner" && g.set.owner && g.set.owner !== me());
    });
  });
})();
