// Lokalny serwer panelu (piaskownica) i stron /p/<slug>. Nie łączy się z Supabase.
//   node scripts/dev-server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createMemoryStore } from "../lib/memory-store.mjs";
import { placeLead, placeMessage, placeOrder } from "../lib/intake.mjs";
import { cleanSiteData } from "../lib/site-model.mjs";
import { notFoundHtml, renderLightPage, sitemapXml } from "../lib/render.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const store = createMemoryStore();
let version = 1;
const bump = () => { version += 1; };
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp"
};

function send(res, status, body, headers) {
  res.writeHead(status, headers);
  res.end(body);
}
function json(res, status, data) {
  send(res, status, JSON.stringify(data), { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/__sandbox/version") return json(res, 200, { n: version });
    if (pathname === "/__sandbox/client.js") {
      const file = fs.readFileSync(path.join(root, "scripts/sandbox-client.js"));
      return send(res, 200, file, { "content-type": "text/javascript; charset=utf-8" });
    }
    if (pathname === "/__sandbox/records") {
      if (req.method === "GET") return json(res, 200, store.records());
      if (req.method === "POST") {
        const row = await readBody(req);
        await store.upsertRecord(row.col, row.id, row.data || {});
        bump();
        return json(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        const body = await readBody(req);
        const col = (body.filters || []).find((f) => f[0] === "col");
        const id = (body.filters || []).find((f) => f[0] === "id");
        if (col && id) await store.deleteRecord(col[1], id[1]);
        bump();
        return json(res, 200, { ok: true });
      }
    }
    if (pathname === "/__sandbox/pages") {
      if (req.method === "GET") return json(res, 200, store.allPages());
      if (req.method === "POST") {
        const row = await readBody(req);
        await store.savePage(row);
        bump();
        return json(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        const body = await readBody(req);
        const id = (body.filters || []).find((f) => f[0] === "id");
        if (id) await store.deletePage(id[1]);
        bump();
        return json(res, 200, { ok: true });
      }
    }

    const pub = pathname.match(/^\/p\/([a-z0-9-]{1,70})(?:\/(order|lead|contact))?$/);
    if (pathname === "/p/sitemap.xml" || pathname === "/sitemap.xml") {
      const xml = sitemapXml(`http://127.0.0.1:${port}`, await store.listPublished());
      return send(res, 200, xml, { "content-type": "application/xml; charset=utf-8" });
    }
    if (pub && req.method === "POST" && pub[2]) {
      const body = await readBody(req);
      const ip = req.socket.remoteAddress || "local";
      const fn = pub[2] === "order" ? placeOrder : pub[2] === "lead" ? placeLead : placeMessage;
      const result = await fn(store, process.env, pub[1], body, { ip });
      bump();
      return json(res, result.status, result.body);
    }
    if (pub && (req.method === "GET" || req.method === "HEAD") && !pub[2]) {
      const page = await store.getPage(pub[1], { publishedOnly: true });
      if (!page) return send(res, 404, notFoundHtml(), { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" });
      const html = renderLightPage(page, cleanSiteData(page.data || {}), { origin: `http://127.0.0.1:${port}` });
      return send(res, 200, req.method === "HEAD" ? "" : html, {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "index, follow"
      });
    }

    let filePath = path.normalize(path.join(root, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(root)) return send(res, 403, "no");
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return send(res, 404, "Nie znaleziono", { "content-type": "text/plain; charset=utf-8" });
    }
    let body = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    if (filePath.endsWith(`${path.sep}index.html`)) {
      body = Buffer.from(String(body).replace(
        '<script src="generator.js"></script>',
        '<script>window.NHP_LOCAL=true</script><script src="/__sandbox/client.js"></script><script src="generator.js"></script>'
      ));
    }
    send(res, 200, body, { "content-type": types[ext] || "application/octet-stream" });
  } catch (err) {
    json(res, 500, { ok: false, message: String(err && err.message || err).slice(0, 300) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Panel (piaskownica): http://127.0.0.1:${port}/`);
  console.log(`Strony publiczne: http://127.0.0.1:${port}/p/<slug>`);
});
