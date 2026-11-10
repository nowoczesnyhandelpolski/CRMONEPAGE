/* Lokalny klient tylko dla scripts/dev-server.mjs. Na produkcji ten plik nie jest podpinany. */
(function () {
  let last = 0;
  function chain(table) {
    const state = { filters: [], del: false };
    const exec = async () => {
      if (state.del) {
        const res = await fetch("/__sandbox/" + table, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filters: state.filters })
        });
        return { data: null, error: res.ok ? null : { message: "Nie udało się usunąć." } };
      }
      const res = await fetch("/__sandbox/" + table);
      let data = await res.json();
      for (const [k, v] of state.filters) data = data.filter((row) => row[k] === v);
      return { data, error: res.ok ? null : { message: "Nie udało się odczytać." } };
    };
    const api = {
      select() { return api; },
      order() { return api; },
      range() { return exec(); },
      eq(k, v) { state.filters.push([k, v]); return api; },
      in() { return api; },
      delete() { state.del = true; return api; },
      upsert(row) {
        return fetch("/__sandbox/" + table, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(row)
        }).then(async (res) => {
          const data = await res.json().catch(() => null);
          return { data, error: res.ok ? null : { message: (data && data.message) || "Nie udało się zapisać." } };
        });
      },
      insert(row) { return api.upsert(row); },
      then(resolve, reject) { return exec().then(resolve, reject); }
    };
    return api;
  }
  window.NHP_LOCAL_CLIENT = function () {
    return {
      from(table) { return chain(table); },
      channel() { return { on() { return this; }, subscribe() { return {}; } }; },
      auth: {
        async getSession() { return { data: { session: { user: { email: "sandbox@local" } } } }; },
        onAuthStateChange() {},
        async signOut() { location.reload(); },
        async signInWithPassword() { return { data: { session: {} }, error: null }; },
        async updateUser() { return { error: null }; },
        async resetPasswordForEmail() { return { error: null }; }
      }
    };
  };
  setInterval(async () => {
    if (!window.CRM_API || typeof window.CRM_API.reload !== "function") return;
    try {
      const v = await fetch("/__sandbox/version").then((r) => r.json());
      if (v.n !== last) {
        const first = last === 0;
        last = v.n;
        if (!first) await window.CRM_API.reload();
      }
    } catch (e) { /* serwer lokalny chwilowo niedostępny */ }
  }, 1200);
})();
