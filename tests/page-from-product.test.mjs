import test from "node:test";
import assert from "node:assert/strict";
import { factSpecs, isForeignLogo, listProductPhotos, pageFromProduct } from "../lib/page-from-product.mjs";
import { sitePublishIssues } from "../lib/site-model.mjs";
import { copyPrompt } from "../lib/copy-prompt.mjs";

const product = {
  catalog_name: "Szczotka teleskopowa 2w1",
  name: "Szczotka teleskopowa 2w1",
  price: "109,90",
  price_before_promo: 149,
  ean: "5901234123457",
  producer: "Firma Przykład",
  brand: "Firma Przykład",
  shipping_time: "24 h",
  delivery_cost: "0",
  images: [
    "https://cdn.example/front.jpg",
    "https://cdn.example/logo.png",
    { url: "https://cdn.example/side.jpg", alt: "bok" },
    "https://cdn.example/front.jpg"
  ],
  description_sections: [
    { type: "text", title: "Zastosowanie", text: "Myje szyby i zgarnia śnieg." },
    { type: "image", url: "https://cdn.example/logotyp-sklepu.svg" },
    { type: "text", text: "Długość 130 cm." }
  ],
  parameters: [{ name: "Długość", value: "130 cm" }, { name: "Stan", value: "[object Object]" }],
  raw: { cena_2: "199,00", cena_3: "" },
  source_link: "https://allegro.pl/oferta/1"
};

test("logotyp odpada, kolejność zdjęć zostaje, pierwsze jest główne", () => {
  assert.equal(isForeignLogo("https://cdn.example/logo.png"), true);
  assert.equal(isForeignLogo("https://cdn.example/logotyp-sklepu.svg"), true);
  assert.equal(isForeignLogo("https://a.allegroimg.com/s512/front.jpg"), false);
  const photos = listProductPhotos(product);
  assert.deepEqual(photos.map((photo) => photo.url), [
    "https://cdn.example/front.jpg",
    "https://cdn.example/side.jpg"
  ]);
  const draft = pageFromProduct(product, { rights: true });
  assert.equal(draft.data.images[0].url, "https://cdn.example/front.jpg");
  assert.equal(draft.data.images[1].url, "https://cdn.example/side.jpg");
  assert.equal(draft.data.images.length, 2);
  assert.equal(draft.data.images.every((image) => image.rights), true);
});

test("odznaczone zdjęcie nie wchodzi na kartę, bez prawa nie jest do publikacji", () => {
  const draft = pageFromProduct(product, {
    images: [
      { url: "https://cdn.example/front.jpg", include: false },
      { url: "https://cdn.example/side.jpg", include: true },
      { url: "https://cdn.example/logo.png", include: true }
    ]
  });
  assert.deepEqual(draft.data.images.map((image) => image.url), ["https://cdn.example/side.jpg"]);
  assert.equal(draft.data.images[0].rights, false);
});

test("oryginalny opis i nagłówki zostają, fakty też, opinie nie powstają", () => {
  const draft = pageFromProduct(product);
  assert.equal(draft.data.headline, "Szczotka teleskopowa 2w1");
  assert.equal(draft.data.source.keep_original, true);
  assert.equal(draft.data.template, "konwersja");
  assert.equal(draft.data.features[0].title, "Zastosowanie");
  assert.equal(draft.data.features[0].text, "Myje szyby i zgarnia śnieg.");
  assert.match(draft.data.features[1].text, /130 cm/);
  assert.match(draft.data.source.description, /Myje szyby/);
  assert.equal(draft.data.brand, "Firma Przykład");
  assert.equal(draft.data.gpsr.producer, "Firma Przykład");
  assert.equal(draft.data.reviews.length, 0);
  assert.equal(draft.data.ugc.length, 0);
  assert.equal(draft.data.faq.length, 0);
  assert.equal(draft.data.sections.reviews, false);
  assert.equal(draft.data.sections.ugc, false);
  assert.equal(draft.data.omnibus_price, null);
  assert.equal(draft.data.compare_at, null);
  const specs = factSpecs(product);
  assert.equal(specs[0].name, "EAN");
  assert.equal(specs[0].value, "5901234123457");
  assert.deepEqual(specs.find((spec) => spec.name === "Długość"), { name: "Długość", value: "130 cm" });
  assert.equal(specs.some((spec) => spec.value.includes("[object Object]")), false);
  assert.equal(draft.data.bundles[0].label, "1 szt.");
  assert.equal(draft.data.bundles[0].price, 109.9);
  assert.equal(draft.data.bundles[1].label, "2 szt.");
  assert.equal(draft.data.bundles[1].price, 199);
  assert.equal(draft.data.bundles[1].compare_at, 219.8);
  assert.match(draft.data.bundles[1].badge, /Oszczędzasz/);
  assert.equal(draft.data.bundles.length, 2);
  const issues = sitePublishIssues({ name: draft.name }, draft.data);
  assert.equal(issues.some((issue) => /skopiowany/.test(issue)), false);
});

test("wyłączenie oryginału nie dopisuje marketingu ani opinii", () => {
  const draft = pageFromProduct(product, { keepOriginal: false, bundle2: null, bundle3: "300" });
  assert.equal(draft.data.source.keep_original, false);
  assert.equal(draft.data.features.length, 0);
  assert.equal(draft.data.headline, "Szczotka teleskopowa 2w1");
  assert.match(draft.data.source.description, /Myje szyby/);
  assert.equal(draft.data.reviews.length, 0);
  assert.equal(draft.data.specs.some((spec) => spec.name === "EAN"), true);
  assert.equal(draft.data.bundles.some((bundle) => bundle.qty === 2), false);
  assert.equal(draft.data.bundles.find((bundle) => bundle.qty === 3).price, 300);
});

test("prompt przepisu nie każe wymyślać opinii ani ruszać EAN", () => {
  const prompt = copyPrompt({ catalog_name: "Szczotka", ean: "5901234123457", description_sections: [{ type: "text", text: "Myje." }] });
  assert.match(prompt, /Nie wymyślaj/);
  assert.match(prompt, /opinii/);
  assert.match(prompt, /EAN/);
  assert.match(prompt, /logotyp/);
});
