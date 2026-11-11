// Klasyczny skrypt treści (bez type:module w manifeście — Chrome MV3 go nie uruchamia).
// Selektory ładują się w locie, więc podmiana selectors.mjs nie wymaga przebudowy wtyczki.
(async function () {
  let extractOffer;
  try {
    ({ extractOffer } = await import(chrome.runtime.getURL("selectors.mjs")));
  } catch (err) {
    console.error("NHP: nie udało się wczytać selektorów.", err);
    return;
  }

  const BTN_ID = "nhp-capture-btn";

  function toast(text, bad) {
    let el = document.getElementById("nhp-capture-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "nhp-capture-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.classList.toggle("bad", !!bad);
    el.textContent = text;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.remove(), 4200);
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "Zapisz w Centrali";
    btn.addEventListener("click", () => capture());
    document.body.appendChild(btn);
  }

  async function capture() {
    const payload = extractOffer(document, location.href);
    if (!payload.catalog_name && !payload.price && !payload.ean) {
      toast("Nie widzę karty produktu. Odśwież stronę albo zaktualizuj selektory.", true);
      return;
    }
    toast("Zapisuję szkic…");
    const res = await chrome.runtime.sendMessage({ type: "capture", payload });
    if (!res?.ok) {
      toast(res?.error || "Nie udało się zapisać.", true);
      return;
    }
    const flagged = res.flagged || 0;
    toast(flagged ? "Zapisano, ale brakuje ceny — pozycja jest oznaczona, cena nie została zgadnięta." : "Zapisano szkic w Centrali.");
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "e" && event.key !== "E") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target && target.closest && target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    capture();
  });

  ensureButton();
})();
