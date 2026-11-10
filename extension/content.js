import { extractOffer } from "./selectors.mjs";

const BTN_ID = "nhp-capture-btn";

function toast(text, bad) {
  let el = document.getElementById("nhp-capture-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "nhp-capture-toast";
    el.style.cssText = "position:fixed;z-index:2147483646;left:16px;bottom:76px;max-width:320px;padding:12px 14px;border-radius:12px;background:#fff;color:#1c1917;border:1px solid #e4dfd8;box-shadow:0 10px 30px rgba(28,25,23,.12);font:600 14px/1.4 Manrope,system-ui,sans-serif";
    document.body.appendChild(el);
  }
  el.style.borderColor = bad ? "#b42318" : "#ff5a00";
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
  btn.style.cssText = "position:fixed;z-index:2147483646;right:16px;bottom:16px;padding:10px 14px;border-radius:999px;border:0;background:#ff5a00;color:#fff;font:700 14px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px rgba(255,90,0,.35)";
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
