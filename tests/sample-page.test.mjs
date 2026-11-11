import test from "node:test";
import assert from "node:assert/strict";
import { cleanSiteData } from "../lib/site-model.mjs";
import { samplePageData } from "../lib/sample-page.mjs";
import { renderLightPage } from "../lib/render.mjs";

const SECTIONS = ["kup", "zaufanie", "nagrania", "obawa", "korzysci", "porownanie", "opinie", "pytania", "pasuje", "zamow"];

test("przykładowa strona wypełnia szablon bez AI i jest oznaczona jako przykład", () => {
  for (const tier of ["s1", "s1_pro", "s1_max"]) {
    const data = samplePageData(tier);
    assert.equal(data.example, true);
    assert.match(data.announcement, /PRZYKŁADOWE/);
    assert.equal(data.price > 0, true);
    const html = renderLightPage(
      { name: data.headline, slug: "przyklad", status: "draft", id: "przyklad" },
      data,
      { preview: true, origin: "https://panel.example" }
    );
    for (const id of SECTIONS) assert.match(html, new RegExp(`id="${id}"`), id);
    assert.match(html, /DANE PRZYKŁADOWE/);
  }
  assert.ok(samplePageData("s1_pro").images.length > samplePageData("s1").images.length);
  const withClip = cleanSiteData({
    ...samplePageData("s1_max"),
    video: { url: "blob:https://panel.example/przyklad-klip", poster: "/assets/demo/slide-1.svg", rights: true }
  });
  assert.equal(withClip.video.url, "blob:https://panel.example/przyklad-klip");
});
