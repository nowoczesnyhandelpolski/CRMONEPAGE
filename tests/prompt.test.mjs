import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, emptyPrompt, missingCount, SCHEMAS } from "../lib/prompt-builder.mjs";

test("prompt zawiera dane, schemat i wymogi prawne", () => {
  const p = buildPrompt({ ...emptyPrompt(), company: "NHP sp. z o.o.", category: "dom", products: "Lampka – 79 zł\nKubek – 39 zł", schema: "C" });
  assert.match(p, /NHP sp\. z o\.o\./);
  assert.match(p, /- Lampka – 79 zł\n- Kubek – 39 zł/);
  assert.match(p, /SCHEMAT C – CENTRUM POMOCY/);
  assert.match(p, /Omnibus/);
  assert.match(p, /GPSR/);
});

test("puste pola zostają jako [nawiasy] i są liczone", () => {
  const p = buildPrompt({ company: "", category: "", products: "" });
  assert.ok(missingCount(p) >= 3);
});

test("schemat sezonowy podstawia nazwę akcji, nieznane dodatki są pomijane", () => {
  const p = buildPrompt({ schema: "E", season: "Black Week", extras: ["ab", "zly"] });
  assert.match(p, /AKCJA SEZONOWA: Black Week/);
  assert.match(p, /A\/B/);
  assert.doesNotMatch(p, /zly/);
  assert.equal(SCHEMAS.length, 6);
});
