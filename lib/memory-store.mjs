/** Pamięć procesu — testy i lokalny serwer. Ten sam kontrakt co magazyn Supabase. */
export function createMemoryStore() {
  const pages = new Map();
  const records = new Map();
  const hits = [];
  const key = (col, id) => `${col}:${id}`;
  return {
    async getPage(slug, { publishedOnly = true } = {}) {
      for (const p of pages.values()) {
        if (p.slug === slug && (!publishedOnly || p.status === "published")) return structuredClone(p);
      }
      return null;
    },
    async listPublished() {
      return [...pages.values()]
        .filter((p) => p.status === "published")
        .map((p) => ({ slug: p.slug, updated_at: p.updated_at || "" }));
    },
    async savePage(page) {
      pages.set(page.id, structuredClone(page));
    },
    async updatePageData(id, data) {
      const p = pages.get(id);
      if (!p) return;
      p.data = structuredClone(data);
      p.updated_at = new Date().toISOString();
    },
    async upsertRecord(col, id, data) {
      records.set(key(col, id), { col, id, data: structuredClone(data), updated_at: new Date().toISOString() });
    },
    async findCustomerByEmail(email) {
      const em = String(email || "").toLowerCase();
      for (const r of records.values()) {
        if (r.col === "customers" && String(r.data.email || "").toLowerCase() === em) return structuredClone(r);
      }
      return null;
    },
    async findOrderByClientReq(pageId, req) {
      if (!req) return null;
      for (const r of records.values()) {
        if (r.col === "orders" && r.data.page_id === pageId && r.data.client_req === req) return structuredClone(r);
      }
      return null;
    },
    async countOrdersByEmail(email, sinceMs) {
      const em = String(email || "").toLowerCase();
      let n = 0;
      for (const r of records.values()) {
        if (r.col === "orders" && String(r.data.buyer_email || "").toLowerCase() === em && Number(r.data.createdAt || 0) >= sinceMs) n++;
      }
      return n;
    },
    async logHit(kind, slug, ip) { hits.push({ kind, slug, ip, at: Date.now() }); },
    async countHits(kind, ip, sinceMs) {
      return hits.filter((h) => h.kind === kind && h.ip === ip && h.at >= sinceMs).length;
    },
    records(col) {
      return [...records.values()].filter((r) => !col || r.col === col).map((r) => structuredClone(r));
    },
    allPages() {
      return [...pages.values()].map((p) => structuredClone(p));
    },
    async deleteRecord(col, id) { records.delete(`${col}:${id}`); },
    async deletePage(id) { pages.delete(id); }
  };
}
