const base = document.getElementById("base");
const key = document.getElementById("key");
const msg = document.getElementById("msg");

chrome.storage.local.get(["apiBase", "apiKey"]).then((stored) => {
  base.value = stored.apiBase || "https://panel.nowoczesnyhandelpolski.pl";
  key.value = stored.apiKey || "";
});

document.getElementById("save").addEventListener("click", async () => {
  const apiBase = base.value.trim().replace(/\/$/, "");
  const apiKey = key.value.trim();
  if (!/^https?:\/\//.test(apiBase)) {
    msg.textContent = "Adres musi zaczynać się od https://";
    return;
  }
  if (apiKey && !apiKey.startsWith("nhp_")) {
    msg.textContent = "Klucz z panelu zaczyna się od nhp_.";
    return;
  }
  await chrome.storage.local.set({ apiBase, apiKey });
  msg.textContent = "Zapisane w tej przeglądarce.";
});
