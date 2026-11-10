import { extensionZipResponse } from "../../lib/extension-download.mjs";

export async function onRequest(context) {
  try {
    return await extensionZipResponse(context.request, context.env);
  } catch (err) {
    console.log(JSON.stringify({ msg: "extension_zip_error", error: String(err?.message || err).slice(0, 200) }));
    return new Response("Nie udało się oddać wtyczki.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" }
    });
  }
}
