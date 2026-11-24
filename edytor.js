/* Edytor strony — prosty widok karty, po polsku. */
(function () {
  window.NHP_HOOKS = window.NHP_HOOKS || [];
  window.NHP_HOOKS.push(function (CRM) {
    if (document.getElementById("ed-css")) return;
    const style = document.createElement("style");
    style.id = "ed-css";
    document.head.appendChild(style);
    let E = null;
    CRM.readyFns.push(async () => {
      E = await import("./lib/page-editor.mjs");
      style.textContent = E.EDITOR_CSS;
    });

    function state() {
      return CRM.UI.pageEditor || null;
    }
    function draft() {
      return state()?.draft;
    }
    function snapshot(note) {
      const st = state();
      if (!st) return;
      st.undo = E.pushPageHistory(st.undo, structuredClone(st.draft), note || "zmiana");
    }

    CRM.pageEditorHtml = function () {
      const st = state();
      if (!st || !E) return `<div class="card pad"><p>Wczytuję edytor…</p></div>`;
      queueMicrotask(paintPreview);
      return E.editorShellHtml({
        name: st.name,
        data: st.draft,
        active: st.focus,
        device: st.device,
        history: st.saved,
        diff: st.diff || []
      });
    };

    async function paintPreview() {
      const frame = document.getElementById("ed-preview");
      const st = state();
      if (!frame || !st) return;
      const { renderPage } = await import("./lib/render.mjs");
      frame.srcdoc = renderPage(
        { id: st.id, slug: st.slug, name: st.name, status: st.status },
        st.draft,
        { preview: true, editor: true, origin: location.origin }
      );
    }

    function readFormIntoDraft() {
      const st = state();
      if (!st || !E) return;
      const d = st.draft;
      const v = (id) => { const el = document.getElementById(id); return el ? String(el.value || "").trim() : null; };
      const focus = st.focus;
      if (focus === "gallery") {
        if (v("ed-headline") != null) d.headline = v("ed-headline");
        if (v("ed-kicker") != null) d.kicker = v("ed-kicker");
        if (v("ed-lead") != null) d.subheadline = v("ed-lead");
        if (v("ed-accent") != null) d.theme = { ...(d.theme || {}), accent: v("ed-accent") };
        (d.images || []).forEach((image, index) => {
          const box = document.getElementById(`ed-img-${index}`);
          if (box) image.rights = box.checked;
        });
      } else if (focus === "bundles") {
        d.bundles = [0, 1, 2].map((i) => ({
          label: v(`ed-b-label-${i}`) || `${i + 1} szt.`,
          qty: v(`ed-b-qty-${i}`) || i + 1,
          price: v(`ed-b-price-${i}`),
          badge: "",
          compare_at: ""
        }));
        d.bundles = E ? (d.bundles) : d.bundles;
      } else if (focus === "benefits") {
        d.benefits = [0, 1, 2].map((i) => ({ title: v(`ed-ben-${i}`) || "", text: v(`ed-ben-t-${i}`) || "", icon: (d.benefits[i] || {}).icon || "check" }));
      } else if (focus === "trust") {
        if (v("ed-trust") != null) d.trust_title = v("ed-trust");
        const names = document.getElementById("ed-trust-names");
        if (names) d.trust_names = String(names.value || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
      } else if (focus === "features") {
        const next = [0, 1, 2, 3].map((i) => ({ title: v(`ed-ft-${i}`) || "", text: v(`ed-fx-${i}`) || "" }));
        const rest = (d.features || []).slice(4);
        d.features = next.concat(rest);
      } else if (focus === "compare") {
        if (v("ed-ours") != null) d.compare_ours = v("ed-ours");
        if (v("ed-others") != null) d.compare_others = v("ed-others");
        d.compare = [0, 1, 2, 3].map((i) => ({ feature: v(`ed-c-f-${i}`) || "", ours: v(`ed-c-o-${i}`) || "", others: v(`ed-c-t-${i}`) || "" }));
      } else if (focus === "faq") {
        d.faq = [0, 1, 2, 3].map((i) => ({ q: v(`ed-q-${i}`) || "", a: v(`ed-a-${i}`) || "" }));
      } else if (focus === "reviews") {
        d.reviews = [0, 1, 2].map((i) => ({
          author: v(`ed-r-a-${i}`) || "",
          rating: v(`ed-r-s-${i}`) || "",
          source_url: v(`ed-r-u-${i}`) || "",
          text: v(`ed-r-t-${i}`) || "",
          photo: (d.reviews[i] || {}).photo || ""
        }));
      } else if (focus === "ugc") {
        d.ugc = [{ video: v("ed-ugc") || "", author: v("ed-ugc-a") || "", text: "", poster: (d.ugc[0] || {}).poster || "" }];
      } else if (focus === "sale") {
        d.sale = { ...(d.sale || {}), enabled: !!(v("ed-sale") || v("ed-sale-t")), label: v("ed-sale") || "", text: v("ed-sale-t") || "" };
        d.sections = { ...(d.sections || {}), sale: d.sale.enabled };
      } else if (focus === "urgency") {
        d.stock = v("ed-stock");
        d.urgency = { ...(d.urgency || {}), show_stock: !!v("ed-stock"), show_timer: !!v("ed-until"), ends_at: v("ed-until") || "" };
        d.sections = { ...(d.sections || {}), urgency: !!(v("ed-stock") || v("ed-until")) };
      }
    }

    async function normalize() {
      const { cleanSiteData, fillBundleSavings } = await import("./lib/site-model.mjs");
      const st = state();
      if (!st) return;
      if (st.focus === "bundles") st.draft.bundles = fillBundleSavings(st.draft.bundles || []);
      st.draft = cleanSiteData(st.draft);
    }

    CRM.openPageEditor = function (id) {
      const page = (CRM.S.pagesList || []).find((item) => item.id === id);
      if (!page) { CRM.toast("Najpierw otwórz zapisaną stronę."); return; }
      CRM.UI.genId = id;
      CRM.UI.pageEditor = {
        id: page.id,
        slug: page.slug,
        name: page.name,
        status: page.status,
        productId: page.product_id,
        focus: "gallery",
        device: "desktop",
        draft: structuredClone(page.data || {}),
        undo: [],
        saved: Array.isArray(page.history) ? page.history : [],
        diff: [],
        proposal: null
      };
      CRM.scheduleRender();
    };

    async function saveEditor() {
      const st = state();
      if (!st) return;
      readFormIntoDraft();
      await normalize();
      const page = (CRM.S.pagesList || []).find((item) => item.id === st.id);
      const history = E.pushPageHistory(page?.history || st.saved, page?.data || {}, "zapis w edytorze");
      const row = {
        id: st.id,
        slug: st.slug,
        name: st.draft.headline || st.name,
        status: st.status || "draft",
        product_id: st.productId || null,
        data: st.draft,
        history,
        updated_at: new Date().toISOString()
      };
      let { error } = await CRM.SB.from("pages").upsert(row);
      if (error && /history|schema cache|column/i.test(String(error.message || ""))) {
        delete row.history;
        ({ error } = await CRM.SB.from("pages").upsert(row));
        CRM.toast("Zapisane. Historia wersji włączy się po ponownym uruchomieniu supabase.sql.");
      }
      if (error) { CRM.toast("Nie udało się zapisać strony."); return; }
      st.saved = history;
      st.name = row.name;
      if (CRM.loadPages) await CRM.loadPages();
      if (st.productId && CRM.afterPageSaved) {
        try { await CRM.afterPageSaved(st.productId, row.status); } catch { /* Shopify jest dodatkowy */ }
      }
      CRM.toast("Zapisano. Jeśli strona jest powiązana ze Shopify, zmiana idzie do sklepu.");
      CRM.scheduleRender();
    }

    document.addEventListener("click", async (e) => {
      const button = e.target.closest("[data-ed]");
      if (!button || !state() || !E) return;
      const st = state();
      const act = button.dataset.ed;
      if (act === "open") {
        readFormIntoDraft();
        st.focus = button.dataset.id;
        CRM.scheduleRender();
        return;
      }
      if (act === "up" || act === "down") {
        e.stopPropagation();
        snapshot("kolejność");
        st.draft.section_order = E.moveSection(st.draft.section_order || [], button.dataset.id, act === "up" ? -1 : 1);
        CRM.scheduleRender();
        return;
      }
      if (act === "toggle") {
        e.stopPropagation();
        snapshot("widoczność");
        const id = button.dataset.id;
        st.draft.sections = { ...(st.draft.sections || {}) };
        st.draft.sections[id] = st.draft.sections[id] === false;
        CRM.scheduleRender();
        return;
      }
      if (act === "device") { st.device = button.dataset.device; CRM.scheduleRender(); return; }
      if (act === "back") { readFormIntoDraft(); CRM.UI.pageEditor = null; CRM.scheduleRender(); return; }
      if (act === "undo") {
        const prev = (st.undo || [])[0];
        if (!prev) { CRM.toast("Nie ma już czego cofać."); return; }
        st.undo = st.undo.slice(1);
        st.draft = structuredClone(prev.data);
        CRM.scheduleRender();
        return;
      }
      if (act === "history") {
        const item = (st.saved || [])[Number(button.dataset.index)];
        if (!item?.data) return;
        snapshot("przywrócenie wersji");
        st.draft = structuredClone(item.data);
        CRM.scheduleRender();
        return;
      }
      if (act === "save") { await saveEditor(); return; }
      if (act === "drop-ai") { st.diff = []; st.proposal = null; CRM.scheduleRender(); return; }
      if (act === "apply-ai") {
        if (!st.proposal) return;
        snapshot("propozycja");
        st.draft = st.proposal;
        st.proposal = null;
        st.diff = [];
        CRM.scheduleRender();
        return;
      }
      if (act === "ask") {
        const instruction = document.getElementById("ed-ask")?.value || "";
        readFormIntoDraft();
        await normalize();
        try {
          const { panelFetch } = await import("./lib/panel-api.mjs");
          CRM.toast("Sprawdzam, co da się zmienić…");
          const res = await panelFetch(CRM.SB, "/api/generate/revise", { method: "POST", body: { instruction, data: st.draft } });
          st.proposal = res.data;
          st.diff = res.diff || [];
          if (!st.diff.length) st.diff = ["Nic się nie zmienia."];
          CRM.scheduleRender();
        } catch (err) {
          CRM.toast(err.message || "Nie udało się przygotować zmian.");
        }
      }
    });

    document.addEventListener("input", (e) => {
      if (!state() || !e.target.closest(".ed-form")) return;
      readFormIntoDraft();
      clearTimeout(CRM.UI.pageEditor._t);
      CRM.UI.pageEditor._t = setTimeout(() => { normalize().then(paintPreview); }, 250);
    });

    window.addEventListener("message", (event) => {
      const id = event.data && event.data.nhpEdit;
      if (!id || !state()) return;
      readFormIntoDraft();
      state().focus = id;
      CRM.scheduleRender();
    });
  });
})();
