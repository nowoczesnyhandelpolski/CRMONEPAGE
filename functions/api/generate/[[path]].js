import { json, readJson } from "../../_util.js";
import { applyCopyToPage, copyPrompt, COPY_SCHEMA, photoPrompt, scenesForTier } from "../../../lib/copy-prompt.mjs";
import { resolveOpenAIConfig, scrubSecrets } from "../../../lib/openai-secret.mjs";
import { cleanSiteData } from "../../../lib/site-model.mjs";
import { supabaseProject, supabaseRest, teamUser } from "../../../lib/supabase-rest.mjs";
import { tierById } from "../../../lib/tiers.mjs";

function parts(context) {
  const p = context.params?.path;
  if (Array.isArray(p)) return p.filter(Boolean);
  return String(p || "").split("/").filter(Boolean);
}

function textFrom(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("");
}

async function sourceFor(env, body) {
  let page = null;
  let product = null;
  if (body.page_id) {
    const rows = await supabaseRest(env, `pages?id=eq.${encodeURIComponent(body.page_id)}&select=*&limit=1`);
    page = rows?.[0] || null;
  }
  if (body.product_id) {
    const rows = await supabaseRest(env, `products?id=eq.${encodeURIComponent(body.product_id)}&select=*&limit=1`);
    product = rows?.[0] || null;
  }
  const data = page?.data || {};
  const source = data.source || {};
  return {
    page,
    product,
    source: {
      catalog_name: product?.catalog_name || source.title || data.headline || product?.name || "",
      producer: product?.producer || source.producer || data.gpsr?.producer || "",
      ean: product?.ean || "",
      category: product?.category || "",
      price: product?.price ?? source.price ?? data.price ?? null,
      shipping_time: product?.shipping_time || data.shipping?.time || "",
      parameters: product?.params || (source.params || []).map((p) => ({ name: p.k, value: p.v })),
      description_sections: product?.description_sections || (source.description ? [{ type: "text", text: source.description }] : []),
      images: (product?.images || source.images || data.images || []).map((i) => (typeof i === "string" ? i : i?.url)).filter(Boolean)
    }
  };
}

async function runText(ai, source) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${ai.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: ai.textModel,
      input: copyPrompt(source),
      text: { format: { type: "json_schema", name: "copy", strict: true, schema: COPY_SCHEMA } }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(scrubSecrets(data.error?.message || "OpenAI nie zwróciło tekstu.", [ai.apiKey]));
    err.status = 502;
    throw err;
  }
  let copy;
  try { copy = JSON.parse(textFrom(data)); }
  catch { const err = new Error("Model nie zwrócił JSON."); err.status = 502; throw err; }
  return { copy, model: ai.textModel };
}

async function uploadBytes(env, path, bytes, mime) {
  const { url, key } = supabaseProject(env);
  const res = await fetch(`${url}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": mime }
  });
  if (!res.ok) {
    const err = new Error("Nie udało się zapisać pliku w Storage.");
    err.status = 502;
    throw err;
  }
  return `${url}/storage/v1/object/public/media/${path}`;
}

async function runImage(env, ai, source, scene) {
  const src = (source.images || []).find((u) => /^https?:\/\//.test(u));
  if (!src) {
    const err = new Error("Brak zdjęcia źródłowego do edycji.");
    err.status = 422;
    throw err;
  }
  const img = await fetch(src);
  const mime = String(img.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
  const buf = await img.arrayBuffer();
  if (!img.ok || !buf.byteLength || buf.byteLength > 8 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) {
    const err = new Error("Nie udało się pobrać zdjęcia źródłowego.");
    err.status = 422;
    throw err;
  }
  const fd = new FormData();
  const model = ai.imageModel;
  fd.append("model", model);
  fd.append("prompt", photoPrompt(scene, source.catalog_name));
  fd.append("image", new Blob([buf], { type: mime }), "produkt.jpg");
  fd.append("size", "1024x1024");
  fd.append("quality", "medium");
  fd.append("output_format", "webp");
  fd.append("output_compression", "70");
  fd.append("n", "1");
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${ai.apiKey}` },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data?.[0]?.b64_json) {
    const err = new Error(scrubSecrets(data?.error?.message || "OpenAI nie zwróciło zdjęcia.", [ai.apiKey]));
    err.status = 502;
    throw err;
  }
  const bin = atob(data.data[0].b64_json);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, model };
}

async function attachImage(env, job, url) {
  if (job.product_id) {
    const rows = await supabaseRest(env, `products?id=eq.${job.product_id}&select=images,generated&limit=1`);
    const images = Array.isArray(rows?.[0]?.images) ? rows[0].images : [];
    images.push({ url, alt: "", rights: false, ai: true });
    const generated = { ...(rows?.[0]?.generated || {}), images: [...(rows?.[0]?.generated?.images || []), url] };
    await supabaseRest(env, `products?id=eq.${job.product_id}`, { method: "PATCH", prefer: "return=minimal", body: { images, generated, updated_at: new Date().toISOString() } });
  }
  if (job.page_id) {
    const rows = await supabaseRest(env, `pages?id=eq.${encodeURIComponent(job.page_id)}&select=data&limit=1`);
    const data = cleanSiteData(rows?.[0]?.data || {});
    data.images.push({ url, alt: "", rights: false });
    await supabaseRest(env, `pages?id=eq.${encodeURIComponent(job.page_id)}`, { method: "PATCH", prefer: "return=minimal", body: { data, updated_at: new Date().toISOString() } });
  }
  await supabaseRest(env, "media", {
    method: "POST",
    prefer: "return=minimal",
    body: { product_id: job.product_id, page_id: job.page_id, kind: "image", path: url.split("/media/")[1] || url, public_url: url, mime: "image/webp", meta: { ai: true } }
  });
}

async function attachCopy(env, job, copy, model) {
  if (job.product_id) {
    const rows = await supabaseRest(env, `products?id=eq.${job.product_id}&select=generated&limit=1`);
    const generated = { ...(rows?.[0]?.generated || {}), copy, model, tier: job.tier, at: new Date().toISOString() };
    await supabaseRest(env, `products?id=eq.${job.product_id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { generated, updated_at: new Date().toISOString() }
    });
  }
  if (job.page_id) {
    const rows = await supabaseRest(env, `pages?id=eq.${encodeURIComponent(job.page_id)}&select=data&limit=1`);
    const prev = rows?.[0]?.data || {};
    const overwrite = job.payload?.overwrite === true;
    const merged = cleanSiteData(applyCopyToPage(prev, copy, { overwrite }));
    merged.generated = { ...(merged.generated || {}), tier: job.tier, model };
    await supabaseRest(env, `pages?id=eq.${encodeURIComponent(job.page_id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { data: merged, name: merged.headline || undefined, updated_at: new Date().toISOString() }
    });
  }
}

function publicJob(row) {
  return {
    id: row.id,
    tier: row.tier,
    status: row.status,
    cost_estimate_pln: row.cost_estimate_pln,
    error: row.error,
    result: row.result,
    page_id: row.page_id,
    product_id: row.product_id
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const held = [];
  try {
    const user = await teamUser(request, env);
    if (!user) return json({ ok: false, error: "Zaloguj się na konto zespołu." }, 401);
    const path = parts(context);

    if (request.method === "POST" && path.length === 1) {
      const jobId = path[0];
      const rows = await supabaseRest(env, `generation_jobs?id=eq.${encodeURIComponent(jobId)}&select=*&limit=1`);
      const job = rows?.[0];
      if (!job) return json({ ok: false, error: "Nie ma takiego zadania." }, 404);
      if (job.status === "ready" || job.status === "partial") return json({ ok: true, job: publicJob(job) });
      const tier = tierById(job.tier);
      const scenes = scenesForTier(tier);
      const next = Number(job.payload?.next || 0);
      const scene = scenes[next];
      if (!scene) {
        const status = (job.result?.image_errors || 0) > 0 ? "partial" : "ready";
        const result = { ...(job.result || {}), video: tier.video ? "panel" : "off" };
        await supabaseRest(env, `generation_jobs?id=eq.${job.id}`, { method: "PATCH", prefer: "return=minimal", body: { status, result, updated_at: new Date().toISOString() } });
        return json({ ok: true, job: publicJob({ ...job, status, result }) });
      }
      try {
        const ai = await resolveOpenAIConfig(env, request);
        held.push(ai.apiKey);
        const image = await runImage(env, ai, job.payload.source, scene);
        const file = `${job.id}/${scene.id}.webp`;
        const url = await uploadBytes(env, file, image.bytes, "image/webp");
        await attachImage(env, job, url);
        const result = { ...(job.result || {}), images: [...(job.result?.images || []), { scene: scene.id, url }] };
        const payload = { ...job.payload, next: next + 1 };
        const done = next + 1 >= scenes.length;
        const status = done ? "ready" : "running";
        if (done) result.video = tier.video ? "panel" : "off";
        await supabaseRest(env, `generation_jobs?id=eq.${job.id}`, {
          method: "PATCH", prefer: "return=minimal",
          body: { status, result, payload, updated_at: new Date().toISOString() }
        });
        return json({ ok: true, job: publicJob({ ...job, status, result }) });
      } catch (err) {
        const result = { ...(job.result || {}), image_errors: (job.result?.image_errors || 0) + 1, images: [...(job.result?.images || []), { scene: scene.id, error: String(err.message || err).slice(0, 200) }] };
        const payload = { ...job.payload, next: next + 1 };
        const done = next + 1 >= scenes.length;
        const status = done ? "partial" : "running";
        if (done) result.video = tier.video ? "panel" : "off";
        await supabaseRest(env, `generation_jobs?id=eq.${job.id}`, {
          method: "PATCH", prefer: "return=minimal",
          body: { status, result, payload, error: String(err.message || err).slice(0, 240), updated_at: new Date().toISOString() }
        });
        return json({ ok: true, job: publicJob({ ...job, status, result, error: err.message }) });
      }
    }

    if (request.method === "POST" && path.length === 0) {
      const body = await readJson(request, 80_000);
      const tier = tierById(body.tier);
      if (!tier) return json({ ok: false, error: "Wybierz poziom S1, S1 Pro albo S1 Max." }, 400);
      const loaded = await sourceFor(env, body);
      if (!loaded.page && !loaded.product) return json({ ok: false, error: "Wskaż stronę albo produkt." }, 400);
      const ai = await resolveOpenAIConfig(env, request);
      held.push(ai.apiKey);
      const { copy, model } = await runText(ai, loaded.source);
      const scenes = scenesForTier(tier);
      const result = { copy, video: tier.video && !scenes.length ? "panel" : tier.video ? "after_images" : "off", images: [] };
      const status = scenes.length ? "running" : "ready";
      const rows = await supabaseRest(env, "generation_jobs?select=*", {
        method: "POST",
        prefer: "return=representation",
        body: {
          tier: tier.id,
          status,
          target: loaded.page ? "page" : "product",
          product_id: body.product_id || null,
          page_id: body.page_id || null,
          import_item_id: body.import_item_id || null,
          cost_estimate_pln: tier.estimatePln,
          model,
          result,
          payload: { source: loaded.source, next: 0, overwrite: body.overwrite === true },
          created_by: user.id
        }
      });
      const job = rows?.[0];
      await attachCopy(env, job, copy, model);
      return json({ ok: true, job: publicJob(job) });
    }

    return json({ ok: false, error: "Nie ma takiej ścieżki." }, 404);
  } catch (err) {
    const status = err.status || 500;
    const message = scrubSecrets(err.message || "Generacja nie powiodła się.", [...held, env.OPENAI_API_KEY, env.NHP_ENC_KEY]).slice(0, 300);
    held.length = 0;
    console.log(JSON.stringify({ msg: "generate_error", status, error: message.slice(0, 240) }));
    return json({ ok: false, error: message }, status >= 500 ? (err.status || 500) : status);
  }
}
