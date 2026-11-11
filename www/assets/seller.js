/* Dane sprzedawcy w dokumentach wizytówki.
   Jedno źródło: panel → Ustawienia → Dane sprzedawcy (funkcja nhp_public_seller w Supabase).
   Wypełnia każdy element [data-seller]. Bez NIP pokazuje zdanie o działalności nierejestrowanej. */
(function () {
  const boxes = document.querySelectorAll("[data-seller]");
  const cfg = window.NHP_WWW;
  if (!boxes.length || !cfg) return;

  function line(parent, text) {
    parent.appendChild(document.createTextNode(text));
    parent.appendChild(document.createElement("br"));
  }
  function fill(box, s) {
    box.textContent = "";
    const b = document.createElement("b");
    b.textContent = "Nowoczesny Handel Polski";
    box.appendChild(b);
    box.appendChild(document.createElement("br"));
    line(box, s.name);
    if (s.address) line(box, s.address);
    line(box, s.nip ? "NIP: " + s.nip : "Działalność nierejestrowana (art. 5 ust. 1 ustawy Prawo przedsiębiorców)");
    if (s.vat_exempt) line(box, "Zwolnienie z VAT (art. 113 ust. 1 ustawy o VAT)");
    const parts = [];
    if (s.email) parts.push("E-mail: " + s.email);
    if (s.phone) parts.push("Telefon: " + s.phone);
    if (parts.length) box.appendChild(document.createTextNode(parts.join(" · ")));
  }

  fetch(cfg.url + "/rest/v1/rpc/nhp_public_seller", {
    method: "POST",
    headers: { apikey: cfg.key, "content-type": "application/json" },
    body: "{}"
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (s && s.name) boxes.forEach((box) => fill(box, s));
    })
    .catch(() => {});
})();
