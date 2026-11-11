/* Skrzynka sklepu: wątki z IMAP, odpowiedź przez SMTP, szkice autorespondera. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (!document.getElementById("mail-css")) {
      const css = document.createElement("style");
      css.id = "mail-css";
      css.textContent = `
        .mail{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:14px;align-items:start}
        .mail-list{max-height:min(72vh,820px);overflow:auto}
        .mail-item{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:transparent;padding:12px 14px;cursor:pointer}
        .mail-item[aria-current="true"]{background:color-mix(in srgb,var(--navy) 8%,var(--surface))}
        .mail-item .sub{display:block;color:var(--muted);font-size:12px;margin-top:2px}
        .mail-item.unread b{color:var(--navy)}
        .mail-thread{display:grid;gap:12px}
        .mail-msg{padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2)}
        .mail-msg.out{background:color-mix(in srgb,var(--navy) 8%,var(--surface));border-color:color-mix(in srgb,var(--navy) 25%,var(--line))}
        .mail-msg p{white-space:pre-wrap;margin:6px 0 0}
        @media(max-width:900px){.mail{grid-template-columns:1fr}}
      `;
      document.head.appendChild(css);
    }
    const ST = {
      nowa: ["Nowa", "var(--info)"],
      w_toku: ["W toku", "var(--warn)"],
      odpowiedziana: ["Odpowiedziana", "var(--good)"],
      zamknieta: ["Zamknięta", "var(--grey)"]
    };
    CRM.S.mail = CRM.S.mail || { threads: [], messages: [], drafts: [], rules: [], settings: { auto_send: false, ack_enabled: false }, sync: null };
    CRM.UI.mailId = CRM.UI.mailId || "";
    CRM.UI.mailReply = CRM.UI.mailReply || "";
    let polledAt = 0;

    async function call(path, body) {
      const { panelFetch } = await import("./lib/panel-api.mjs");
      return panelFetch(CRM.SB, path, { method: body ? "POST" : "GET", body });
    }
    async function loadMail() {
      const sb = CRM.SB;
      if (!sb?.from) return;
      const load = async (query) => {
        const { data, error } = await query;
        if (error) {
          CRM.S.mailError = /does not exist|schema cache|PGRST/i.test(String(error.message || ""))
            ? "Brakuje tabel skrzynki. Uruchom ponownie supabase.sql."
            : String(error.message || error);
          return [];
        }
        return data || [];
      };
      const mail = CRM.S.mail;
      mail.threads = await load(sb.from("mail_threads").select("*").order("last_message_at", { ascending: false }).limit(200));
      mail.messages = await load(sb.from("mail_messages").select("*").order("sent_at", { ascending: true }).limit(500));
      mail.drafts = await load(sb.from("mail_drafts").select("*").eq("status", "szkic").order("created_at", { ascending: false }).limit(100));
      mail.rules = await load(sb.from("mail_rules").select("*").order("position"));
      const settings = await load(sb.from("mail_settings").select("*").limit(1));
      mail.settings = settings[0] || { auto_send: false, ack_enabled: false };
      const sync = await load(sb.from("mail_sync_state").select("*").limit(1));
      mail.sync = sync[0] || null;
      CRM.S.mailUnread = mail.threads.filter((thread) => thread.unread).length;
    }
    async function refreshMail(force) {
      if (force || Date.now() - polledAt > 45000) {
        polledAt = Date.now();
        try {
          const res = await call("/api/mail/poll", {});
          CRM.S.mailConfigured = res.configured !== false;
          if (res.imported) CRM.toast(`Nowe wiadomości ze skrzynki: ${res.imported}`);
        } catch (err) {
          CRM.S.mailError = err.message || "Nie udało się odświeżyć skrzynki.";
        }
      }
      await loadMail();
      CRM.scheduleRender();
    }
    CRM.openMail = () => refreshMail(false);
    CRM.readyFns.push(async () => { try { await loadMail(); } catch { /* skrzynka dojedzie po SQL */ } });

    function pill(status) {
      const row = ST[status] || ST.nowa;
      return `<span class="pill" style="--c:${row[1]}">${CRM.esc(row[0])}</span>`;
    }
    function mailHtml(tabs) {
      const mail = CRM.S.mail;
      const threads = mail.threads || [];
      const current = threads.find((thread) => thread.id === CRM.UI.mailId) || threads[0];
      if (current && CRM.UI.mailId !== current.id) CRM.UI.mailId = current.id;
      const messages = (mail.messages || []).filter((item) => item.thread_id === current?.id);
      const drafts = (mail.drafts || []).filter((item) => item.thread_id === current?.id);
      const list = threads.map((thread) => `<button type="button" class="mail-item ${thread.unread ? "unread" : ""}" data-mail="open" data-id="${thread.id}" aria-current="${current && current.id === thread.id}">
        <b>${CRM.esc(thread.customer_name || thread.customer_email || "Bez nadawcy")}</b> ${pill(thread.status)}
        <span class="sub">${CRM.esc(thread.subject || "(bez tematu)")}</span>
        <span class="sub">${thread.last_message_at ? new Date(thread.last_message_at).toLocaleString("pl-PL") : ""}</span>
      </button>`).join("");
      const people = CRM.team().map((person) => `<option value="${person.k}" ${current?.assignee_key === person.k ? "selected" : ""}>${CRM.esc(person.name)}</option>`).join("");
      const history = messages.map((item) => `<article class="mail-msg ${item.direction === "out" ? "out" : ""}"><b>${item.direction === "out" ? "My" : CRM.esc(item.from_name || item.from_email || "Klient")}</b> <span class="small muted">${item.sent_at ? new Date(item.sent_at).toLocaleString("pl-PL") : ""}</span><p>${CRM.esc(item.body_text || "")}</p></article>`).join("");
      const draftHtml = drafts.map((draft) => `<div class="banner"><b>Szkic autorespondera</b> (${CRM.esc(draft.rule_slug || "reguła")})<p style="white-space:pre-wrap">${CRM.esc(draft.body)}</p><div class="row"><button class="btn sm primary" type="button" data-mail="send-draft" data-id="${draft.id}">Wyślij</button><button class="btn sm" type="button" data-mail="drop-draft" data-id="${draft.id}">Odrzuć</button></div></div>`).join("");
      const rules = (mail.rules || []).map((rule) => `<tr>
        <td>${CRM.esc(rule.name)}</td>
        <td><input data-mail="kw" data-id="${rule.id}" value="${CRM.esc(rule.keywords || "")}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:6px"></td>
        <td><input type="checkbox" data-mail="ai" data-id="${rule.id}" ${rule.use_ai ? "checked" : ""}></td>
        <td><input type="checkbox" data-mail="rule-auto" data-id="${rule.id}" ${rule.auto_send ? "checked" : ""}></td>
        <td><input type="checkbox" data-mail="rule-on" data-id="${rule.id}" ${rule.enabled ? "checked" : ""}></td>
      </tr>`).join("");
      const settings = mail.settings || {};
      const sync = mail.sync;
      const banner = !CRM.S.mailConfigured && CRM.S.mailConfigured !== undefined
        ? `<div class="banner">Skrzynka nie jest podłączona. Ustaw sekrety MAIL_IMAP_HOST, MAIL_IMAP_PORT, MAIL_IMAP_USER, MAIL_IMAP_PASS, MAIL_SMTP_HOST, MAIL_SMTP_PORT, MAIL_SMTP_USER, MAIL_SMTP_PASS i MAIL_FROM. Opis: docs/poczta.md.</div>`
        : "";
      const err = CRM.S.mailError ? `<div class="banner">${CRM.esc(CRM.S.mailError)}</div>` : "";
      const syncLine = sync?.last_error ? `<p class="small" style="color:var(--bad)">${CRM.esc(sync.last_error)}</p>` : `<p class="small muted">Ostatnie pobranie: ${sync?.last_poll_at ? new Date(sync.last_poll_at).toLocaleString("pl-PL") : "jeszcze nie było"}.</p>`;
      const detail = current ? `<section class="card pad mail-thread">
        <div class="row" style="justify-content:space-between"><h2>${CRM.esc(current.subject || "(bez tematu)")}</h2>${pill(current.status)}</div>
        <p class="small muted">${CRM.esc(current.customer_email || "")}${current.order_label ? ` · zamówienie ${CRM.esc(current.order_label)}` : ""}${current.product_label ? ` · ${CRM.esc(current.product_label)}` : ""}</p>
        <div class="row">
          <label class="small">Status <select data-mail="status" data-id="${current.id}">${Object.entries(ST).map(([id, label]) => `<option value="${id}" ${current.status === id ? "selected" : ""}>${label[0]}</option>`).join("")}</select></label>
          <label class="small">Opiekun <select data-mail="assign" data-id="${current.id}"><option value="">— nikt —</option>${people}</select></label>
        </div>
        ${history || `<p class="muted">Brak treści.</p>`}
        ${draftHtml}
        <label class="small">Odpowiedź<textarea id="mailReply" style="width:100%;min-height:90px;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--surface-2)">${CRM.esc(CRM.UI.mailReply || "")}</textarea></label>
        <button class="btn primary" type="button" data-mail="reply" data-id="${current.id}">Wyślij odpowiedź</button>
      </section>` : `<section class="card"><div class="empty"><b>Wybierz wątek</b>Albo odśwież skrzynkę.</div></section>`;
      return `<div class="top"><div><h1>Wiadomości</h1><p>Skrzynka sklepu. Pobieranie idzie przy otwarciu i po „Odśwież” — panel nie trzyma stałego połączenia IMAP.</p></div><div class="row"><button class="btn" type="button" data-mail="refresh">Odśwież</button></div></div>${tabs}${banner}${err}
        <div class="card pad" style="margin-bottom:14px"><div class="row">
          <label class="small"><input type="checkbox" data-mail="global-auto" ${settings.auto_send ? "checked" : ""}> Wysyłaj automatycznie, gdy reguła też ma zgodę</label>
          <label class="small"><input type="checkbox" data-mail="ack" ${settings.ack_enabled ? "checked" : ""}> Potwierdzenie otrzymania (domyślnie wyłączone)</label>
        </div>${syncLine}</div>
        <div class="mail"><section class="card mail-list">${list || `<div class="empty"><b>Skrzynka pusta</b>Nowe listy pojawią się po odświeżeniu.</div>`}</section>${detail}</div>
        <div class="card pad" style="margin-top:14px"><h2>Reguły autorespondera</h2><p class="small muted">Domyślnie powstaje szkic do zatwierdzenia. Automatyczna wysyłka wymaga przełącznika globalnego i przełącznika reguły. Pętle (no-reply, Auto-Submitted, listy mailingowe) są pomijane.</p>
        <div class="tbl-wrap"><table><thead><tr><th>Temat</th><th>Słowa</th><th>AI</th><th>Auto</th><th>Włączona</th></tr></thead><tbody>${rules}</tbody></table></div></div>`;
    }
    CRM.renderMail = mailHtml;

    async function patchThread(id, body) {
      const { error } = await CRM.SB.from("mail_threads").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) CRM.toast("Nie udało się zapisać wątku.");
      else { await loadMail(); CRM.scheduleRender(); }
    }
    document.addEventListener("input", (e) => { if (e.target.id === "mailReply") CRM.UI.mailReply = e.target.value; });
    document.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.dataset?.mail === "status") return patchThread(t.dataset.id, { status: t.value, unread: t.value === "nowa" });
      if (t.dataset?.mail === "assign") return patchThread(t.dataset.id, { assignee_key: t.value });
      if (t.dataset?.mail === "global-auto" || t.dataset?.mail === "ack") {
        const body = t.dataset.mail === "ack" ? { ack_enabled: t.checked } : { auto_send: t.checked };
        const { error } = await CRM.SB.from("mail_settings").update({ ...body, updated_at: new Date().toISOString() }).eq("id", 1);
        if (error) CRM.toast("Nie udało się zapisać ustawień. Uruchom supabase.sql.");
        return;
      }
      if (t.dataset?.mail === "kw" || t.dataset?.mail === "ai" || t.dataset?.mail === "rule-auto" || t.dataset?.mail === "rule-on") {
        const patch = t.dataset.mail === "kw" ? { keywords: t.value }
          : t.dataset.mail === "ai" ? { use_ai: t.checked }
          : t.dataset.mail === "rule-auto" ? { auto_send: t.checked }
          : { enabled: t.checked };
        const { error } = await CRM.SB.from("mail_rules").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", t.dataset.id);
        if (error) CRM.toast("Nie udało się zapisać reguły.");
      }
    });
    document.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-mail]");
      if (!t) return;
      const act = t.dataset.mail;
      if (act === "open") {
        CRM.UI.mailId = t.dataset.id;
        const thread = (CRM.S.mail.threads || []).find((item) => item.id === t.dataset.id);
        if (thread?.unread) await patchThread(thread.id, { unread: false, status: thread.status === "nowa" ? "w_toku" : thread.status });
        else CRM.scheduleRender();
      } else if (act === "refresh") {
        CRM.toast("Pobieram skrzynkę…");
        polledAt = 0;
        await refreshMail(true);
      } else if (act === "reply") {
        const text = document.getElementById("mailReply")?.value || CRM.UI.mailReply;
        try {
          await call("/api/mail/reply", { thread_id: t.dataset.id, text });
          CRM.UI.mailReply = "";
          CRM.toast("Odpowiedź wysłana.");
          await loadMail();
          CRM.scheduleRender();
        } catch (err) { CRM.toast(err.message || "Nie udało się wysłać."); }
      } else if (act === "send-draft") {
        try {
          await call("/api/mail/draft", { draft_id: t.dataset.id });
          CRM.toast("Szkic wysłany.");
          await loadMail();
          CRM.scheduleRender();
        } catch (err) { CRM.toast(err.message || "Nie udało się wysłać szkicu."); }
      } else if (act === "drop-draft") {
        await CRM.SB.from("mail_drafts").update({ status: "odrzucona" }).eq("id", t.dataset.id);
        await loadMail();
        CRM.scheduleRender();
      }
    });
  });
})();
