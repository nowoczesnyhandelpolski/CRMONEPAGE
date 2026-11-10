import { TIERS } from "./tiers.mjs";

const MARK = `<svg class="die-logo" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="currentColor" d="M8.5 23.2V8.8h3.1l8.2 9.6V8.8H23v14.4h-3.1l-8.2-9.6v9.6H8.5z"/></svg>`;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const TIER_CSS = `
.tier-pick{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start;margin:8px 0 18px}
.tier-card{width:196px;border:0;background:transparent;padding:0;cursor:pointer;text-align:center;color:var(--ink);font:inherit}
.tier-card .die{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;width:168px;height:168px;margin:10px auto 12px;border-radius:28px;color:#f4f7fb;background-color:#14161c;background-image:linear-gradient(180deg,rgba(255,255,255,.08),transparent 42%),linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:auto,16px 16px,16px 16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 14px 30px rgba(20,24,40,.12);transition:transform .18s ease,box-shadow .18s ease}
.tier-card .die::before{content:"";position:absolute;inset:-3px;border-radius:31px;padding:3px;background:var(--glow);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:.85;pointer-events:none}
.tier-card[aria-pressed="true"] .die{transform:scale(1.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 0 28px var(--glow-soft),0 18px 40px rgba(20,24,40,.18)}
.tier-card[aria-pressed="true"] .die::before{opacity:1;filter:saturate(1.15)}
.die-logo{margin-bottom:6px;opacity:.92}
.die-name{font-family:var(--display, ui-sans-serif);font-weight:800;font-size:54px;line-height:.85;letter-spacing:-.04em}
.die-badge{min-height:16px;margin-top:6px;font-size:12px;font-weight:800;letter-spacing:.22em;opacity:.9}
.tier-copy{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);line-height:1.35}
.tier-copy b{color:var(--ink);font-size:14px}
.tier-cost{color:var(--ink);font-size:13px}
.tier-note{color:var(--muted);font-size:13px;margin:-6px 0 14px}
`;

export function renderTierPicker(selected = "s1") {
  const cards = TIERS.map((t) => `<button type="button" class="tier-card" data-tier="${t.id}" aria-pressed="${t.id === selected ? "true" : "false"}" style="--glow:${t.glow};--glow-soft:${t.glowSoft}">
      <span class="die">${MARK}<span class="die-name">S1</span><span class="die-badge">${esc(t.badge)}</span></span>
      <span class="tier-copy"><b>${esc(t.title)}</b><span>${esc(t.includes.join(" · "))}</span><strong class="tier-cost">${esc(t.costLabel)}</strong></span>
    </button>`).join("");
  return `<div class="tier-pick" role="radiogroup" aria-label="Poziom generacji">${cards}</div><p class="tier-note">Szacunek dotyczy zdjęć AI (0 / 0,60 / 3,00 zł). Wideo powstaje w tym panelu, bez zewnętrznej usługi wideo. Tekst idzie przez OpenAI. Brak ceny w źródle nie jest uzupełniany.</p>`;
}

export function ensureTierCss() {
  if (typeof document === "undefined" || document.getElementById("tier-css")) return;
  const el = document.createElement("style");
  el.id = "tier-css";
  el.textContent = TIER_CSS;
  document.head.appendChild(el);
}
