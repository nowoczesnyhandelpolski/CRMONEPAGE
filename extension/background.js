const DEFAULT_BASE = "https://panel.nowoczesnyhandelpolski.pl";

async function settings() {
  const stored = await chrome.storage.local.get(["apiBase", "apiKey"]);
  return {
    apiBase: String(stored.apiBase || DEFAULT_BASE).replace(/\/$/, ""),
    apiKey: String(stored.apiKey || "")
  };
}

async function saveOffer(payload) {
  const { apiBase, apiKey } = await settings();
  if (!apiKey) return { ok: false, error: "Wpisz klucz API w oknie wtyczki." };
  let res;
  try {
    res = await fetch(`${apiBase}/api/nhp/offer-export`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nhp-key": apiKey,
        "x-nhp-version": chrome.runtime.getManifest().version
      },
      body: JSON.stringify({ items: [payload] })
    });
  } catch (err) {
    return { ok: false, error: "Brak połączenia z Centralą. Sprawdź adres panelu w ustawieniach wtyczki." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `Centrala zwróciła HTTP ${res.status}.` };
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "capture") return;
  saveOffer(message.payload).then(sendResponse);
  return true;
});
