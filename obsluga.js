/* Obsługa klienta — moduł panelu Centrali.
   Zgłoszenia (records col=tickets) zakłada sam wyzwalacz w bazie z każdej wiadomości z formularza strony
   (nhp_ticket_from_message) albo zespół ręcznie. Typy: pytanie, zamówienie, zwrot, reklamacja, inne.
   Pilnuje terminów ustawowych (reklamacja i zwrot — 14 dni), daje szablony odpowiedzi z podstawionymi danymi
   i otwiera gotowego maila. Logika: lib/support.mjs. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("ob-css")) return;
    const css = document.createElement("style");
    css.id = "ob-css";
    css.textContent = `
      .ob-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .ob-dl{color:var(--muted);font-size:12px}
      .ob-dl.pilne{color:var(--warn);font-weight:700}.ob-dl.po_terminie{color:var(--bad);font-weight:700}
      .ob-msg{white-space:pre-wrap;background:var(--surface-2);border-radius:12px;padding:12px;font-size:14px}
      .ob-tpl{width:100%;min-height:220px;font:inherit;font-size:13px}
    `;
    document.head.appendChild(css);

    const esc = CRM.esc;
    let L = null;
    const ST = { filter: "otwarte", type: "wszystkie" };
    const TYPE_L = { pytanie: "Pytanie", zamowienie: "Zamówienie", zwrot: "Zwrot", reklamacja: "Reklamacja", inne: "Inne" };
    const TYPE_C = { pytanie: "var(--info)", zamowienie: "var(--violet)", zwrot: "var(--warn)", reklamacja: "var(--bad)", inne: "var(--grey)" };
    const CLOSED = ["zamkniete", "pieniadze_zwrocone", "uznana", "odrzucona", "odpisane"];
    const when = (t) => t ? new Date(Number(t)).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
    const day = (t) => t ? new Date(Number(t)).toLocaleDateString("pl-PL", { day: "numeric", month: "long" }) : "—";
    const tickets = () => CRM.arr("tickets").sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const statusL = (t) => ((L && L.STATUSES[t.type || "pytanie"]) || []).find((s) => s[0] === t.status)?.[1] || t.status || "Nowe";

    CRM.COLS.push("tickets");
    CRM.S.tickets = CRM.S.tickets || {};
    CRM.readyFns.push(async () => { L = await import("./lib/support.mjs"); CRM.scheduleRender(); });

    function dlBadge(t) {
      if (!L) return "";
      const s = L.deadlineState(t);
      if (s === "ok") return CLOSED.includes(t.status) ? "" : `<span class="ob-dl">do ${day(t.deadline)}</span>`;
      return `<span class="ob-dl ${s}">${s === "po_terminie" ? "PO TERMINIE" : "termin"} ${day(t.deadline)}</span>`;
    }

    function vObsluga() {
      const all = tickets();
      const open = all.filter((t) => !CLOSED.includes(t.status));
      const late = L ? open.filter((t) => L.deadlineState(t) !== "ok") : [];
      const head = `<div class="top"><div><h1>Obsługa klienta</h1><p>Pytania, zwroty i reklamacje z formularzy stron. Pilnujemy ustawowych 14 dni na reklamację i zwrot pieniędzy.</p></div><div class="row"><button class="btn sm primary" data-ob-new>Nowe zgłoszenie</button></div></div>`;
      const kpis = `<div class="grid kpis" style="margin-bottom:16px">
        <div class="card kpi" style="--k:var(--info)"><div class="lbl">Otwarte</div><div class="val num">${open.length}</div></div>
        <div class="card kpi" style="--k:var(--bad)"><div class="lbl">Pilne i po terminie</div><div class="val num">${late.length}</div></div>
        <div class="card kpi" style="--k:var(--warn)"><div class="lbl">Zwroty w toku</div><div class="val num">${open.filter((t) => t.type === "zwrot").length}</div></div>
        <div class="card kpi" style="--k:var(--bad)"><div class="lbl">Reklamacje w toku</div><div class="val num">${open.filter((t) => t.type === "reklamacja").length}</div></div></div>`;
      const filters = `<div class="ob-tabs">${[["otwarte", "Otwarte"], ["pilne", "Pilne"], ["wszystkie", "Wszystkie"]].map(([k, l]) => `<button class="btn sm ${ST.filter === k ? "primary" : ""}" data-ob-f="${k}">${l}</button>`).join("")}
        <select data-ob-type>${[["wszystkie", "Wszystkie typy"], ...Object.entries(TYPE_L)].map(([k, l]) => `<option value="${k}" ${ST.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
      let list = ST.filter === "otwarte" ? open : ST.filter === "pilne" ? late : all;
      if (ST.type !== "wszystkie") list = list.filter((t) => t.type === ST.type);
      const rows = list.map((t) => `<tr data-ob-open="${esc(t.id)}" style="cursor:pointer"><td class="muted num">${when(t.createdAt)}</td>
        <td><span class="pill" style="--c:${TYPE_C[t.type] || "var(--grey)"}">${esc(TYPE_L[t.type] || t.type || "—")}</span></td>
        <td class="strong">${esc(t.name || "—")}<div class="small muted">${esc(t.email || "")}</div></td>
        <td>${esc(String(t.message || "").slice(0, 90))}${t.order_number ? `<div class="small muted">#${esc(t.order_number)}</div>` : ""}</td>
        <td>${esc(statusL(t))}<div>${dlBadge(t)}</div></td></tr>`).join("");
      return head + kpis + filters + `<div class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Kiedy</th><th>Typ</th><th>Klient</th><th>Sprawa</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="pad muted">Brak zgłoszeń w tym widoku. Wiadomości z formularzy stron pojawią się tu same.</div>`}</div>`;
    }

    function vars(t) {
      const seller = (CRM.S.settings && CRM.S.settings.seller) || {};
      const order = CRM.arr("orders").find((o) => o.number && o.number === t.order_number) || {};
      return {
        imie: String(t.name || "").split(" ")[0], temat: t.topic || TYPE_L[t.type] || "Twoja wiadomość",
        numer: t.order_number || "[numer zamówienia]", przesylka: order.tracking || "[numer przesyłki]",
        kwota: order.price ? `${order.price} zł` : "[kwota]", termin: day(t.deadline),
        adres_zwrotu: seller.name && seller.address ? `${seller.name}, ${seller.address}` : "[adres zwrotu]",
        sprzedawca: seller.name || "Nowoczesny Handel Polski"
      };
    }

    function openTicket(id) {
      const t = CRM.S.tickets[id];
      if (!t || !L) return;
      const sts = L.STATUSES[t.type || "pytanie"] || L.STATUSES.pytanie;
      const tpls = L.TEMPLATES.filter((x) => x.type === t.type || x.type === "pytanie");
      const tpl0 = tpls[0];
      const v = vars(t);
      CRM.openModal(`<form id="obF" data-id="${esc(id)}" novalidate>
        <div class="modal-h"><h2 id="mTitle">${esc(TYPE_L[t.type] || "Zgłoszenie")} — ${esc(t.name || "klient")}</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">×</button></div>
        <div class="modal-b">
          <div class="f full"><label>Wiadomość klienta (${when(t.createdAt)}${t.page_slug ? `, /p/${esc(t.page_slug)}` : ""})</label><div class="ob-msg">${esc(t.message || "")}</div></div>
          <div class="f"><label for="ob-type">Typ</label><select id="ob-type" name="type">${Object.entries(TYPE_L).map(([k, l]) => `<option value="${k}" ${t.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="f"><label for="ob-st">Status</label><select id="ob-st" name="status">${sts.map(([k, l]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="f"><label for="ob-nr">Nr zamówienia</label><input id="ob-nr" name="order_number" value="${esc(t.order_number || "")}"></div>
          <div class="f"><label>Termin</label><div>${dlBadge(t) || day(t.deadline)}</div></div>
          <div class="f full"><label for="ob-notes">Notatki zespołu</label><textarea id="ob-notes" name="notes">${esc(t.notes || "")}</textarea></div>
          <div class="f full"><label for="ob-tpl">Szablon odpowiedzi</label><select id="ob-tpl">${tpls.map((x) => `<option value="${x.id}">${esc(x.title)}</option>`).join("")}</select></div>
          <div class="f full"><input id="ob-subj" value="${esc(L.fillTemplate(tpl0.subject, v))}" aria-label="Temat maila"><textarea id="ob-body" class="ob-tpl" aria-label="Treść odpowiedzi">${esc(L.fillTemplate(tpl0.body, v))}</textarea>
            <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-ob-copy>Kopiuj</button><button type="button" class="btn sm primary" data-ob-mail>Otwórz e-mail do klienta</button><span class="small muted">Pola w [nawiasach] uzupełnij przed wysłaniem.</span></div></div>
        </div>
        <div class="modal-f"><span></span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">Zapisz</button></div></div>
      </form>`);
    }

    CRM.VIEWS.push(["obsluga", "Obsługa klienta", "inbox"]);
    CRM.VIEW_FNS.obsluga = vObsluga;
    CRM.badgeFns.push(() => ({ obsluga: CRM.arr("tickets").filter((t) => !CLOSED.includes(t.status)).length }));

    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-ob-type]")) { ST.type = e.target.value; CRM.scheduleRender(); }
      if (e.target.id === "ob-tpl" && L) {
        const f = document.getElementById("obF");
        const t = CRM.S.tickets[f.dataset.id];
        const tpl = L.TEMPLATES.find((x) => x.id === e.target.value);
        const v = vars({ ...t, order_number: document.getElementById("ob-nr").value.trim() });
        document.getElementById("ob-subj").value = L.fillTemplate(tpl.subject, v);
        document.getElementById("ob-body").value = L.fillTemplate(tpl.body, v);
      }
    });

    document.addEventListener("submit", async (e) => {
      if (e.target.id !== "obF") return;
      e.preventDefault();
      const id = e.target.dataset.id;
      const t = CRM.S.tickets[id];
      const fd = new FormData(e.target);
      const type = String(fd.get("type"));
      const next = { ...t, type, status: String(fd.get("status")), order_number: String(fd.get("order_number") || "").trim(), notes: String(fd.get("notes") || "") };
      if (type !== t.type && L) next.deadline = L.deadlineFor(type, t.createdAt);
      delete next.id;
      if (await CRM.put("tickets", id, next)) { CRM.closeModal(); CRM.toast("Zgłoszenie zapisane"); CRM.logAct && CRM.logAct(`Obsługa klienta: ${TYPE_L[type]} — ${statusL(next)}`); }
    });

    document.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-ob-f],[data-ob-open],[data-ob-copy],[data-ob-mail],[data-ob-new]");
      if (!t) return;
      if (t.dataset.obF) { ST.filter = t.dataset.obF; CRM.scheduleRender(); return; }
      if (t.dataset.obOpen) { openTicket(t.dataset.obOpen); return; }
      if (t.hasAttribute("data-ob-copy")) {
        try { await navigator.clipboard.writeText(document.getElementById("ob-body").value); CRM.toast("Skopiowano"); } catch { CRM.toast("Nie udało się skopiować"); }
        return;
      }
      if (t.hasAttribute("data-ob-mail")) {
        const f = document.getElementById("obF");
        const tk = CRM.S.tickets[f.dataset.id];
        const href = `mailto:${encodeURIComponent(tk.email || "")}?subject=${encodeURIComponent(document.getElementById("ob-subj").value)}&body=${encodeURIComponent(document.getElementById("ob-body").value)}`;
        window.location.href = href;
        return;
      }
      if (t.hasAttribute("data-ob-new")) {
        const now = Date.now();
        const id = CRM.uid("tk");
        const rec = { type: "pytanie", status: "nowe", name: "", email: "", message: "", order_number: "", notes: "", source: "ręcznie", createdAt: now, deadline: L ? L.deadlineFor("pytanie", now) : now + 2 * 86400e3 };
        if (await CRM.put("tickets", id, rec)) openTicketManual(id);
      }
    });

    function openTicketManual(id) {
      const t = CRM.S.tickets[id];
      CRM.openModal(`<form id="obN" data-id="${esc(id)}" novalidate>
        <div class="modal-h"><h2 id="mTitle">Nowe zgłoszenie</h2><button type="button" class="btn ghost sm" data-act="close" aria-label="Zamknij">×</button></div>
        <div class="modal-b">
          <div class="f"><label for="obn-name">Klient</label><input id="obn-name" name="name" value="${esc(t.name || "")}"></div>
          <div class="f"><label for="obn-mail">E-mail</label><input id="obn-mail" name="email" type="email" value="${esc(t.email || "")}"></div>
          <div class="f"><label for="obn-type">Typ</label><select id="obn-type" name="type">${Object.entries(TYPE_L).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
          <div class="f"><label for="obn-nr">Nr zamówienia</label><input id="obn-nr" name="order_number"></div>
          <div class="f full"><label for="obn-msg">Sprawa</label><textarea id="obn-msg" name="message"></textarea></div>
        </div>
        <div class="modal-f"><span></span><div class="row"><button type="button" class="btn" data-act="close">Anuluj</button><button type="submit" class="btn primary">Zapisz</button></div></div>
      </form>`);
    }
    document.addEventListener("submit", async (e) => {
      if (e.target.id !== "obN") return;
      e.preventDefault();
      const id = e.target.dataset.id;
      const fd = new FormData(e.target);
      const t = CRM.S.tickets[id] || {};
      const type = String(fd.get("type"));
      const next = { ...t, name: String(fd.get("name") || "").trim(), email: String(fd.get("email") || "").trim().toLowerCase(), type, order_number: String(fd.get("order_number") || "").trim(), message: String(fd.get("message") || ""), deadline: L ? L.deadlineFor(type, t.createdAt) : t.deadline };
      delete next.id;
      if (await CRM.put("tickets", id, next)) { CRM.closeModal(); CRM.toast("Zgłoszenie dodane"); }
    });
  });
})();
