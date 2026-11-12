import test from "node:test";
import assert from "node:assert/strict";
import { classify, deadlineFor, deadlineState, TEMPLATES, fillTemplate, botKnowledge, botAnswer, STATUSES } from "../lib/support.mjs";

test("typ zgłoszenia z tematu albo treści", () => {
  assert.equal(classify("Reklamacja (wada produktu)", ""), "reklamacja");
  assert.equal(classify("zwrot", ""), "zwrot");
  assert.equal(classify("", "Chcę odstąpić od umowy"), "zwrot");
  assert.equal(classify("Inne", "Kolczyk jest uszkodzony"), "reklamacja");
  assert.equal(classify("", "Gdzie jest moja paczka?"), "zamowienie");
  assert.equal(classify("", "Czy pasuje do helixa?"), "pytanie");
});

test("terminy: reklamacja i zwrot 14 dni, pytanie 2 dni", () => {
  const t0 = Date.UTC(2026, 10, 12);
  assert.equal(deadlineFor("reklamacja", t0) - t0, 14 * 86400e3);
  assert.equal(deadlineFor("pytanie", t0) - t0, 2 * 86400e3);
  assert.equal(deadlineState({ status: "nowe", deadline: t0 - 1 }, t0), "po_terminie");
  assert.equal(deadlineState({ status: "nowe", deadline: t0 + 86400e3 }, t0), "pilne");
  assert.equal(deadlineState({ status: "uznana", deadline: t0 - 1 }, t0), "ok");
});

test("każdy typ ma statusy, szablony mają poprawne typy", () => {
  for (const tpl of TEMPLATES) assert.ok(STATUSES[tpl.type], tpl.id);
  const filled = fillTemplate("Dzień dobry {imie}, zamówienie {numer} {brak}", { imie: "Anna", numer: "S-1" });
  assert.equal(filled, "Dzień dobry Anna, zamówienie S-1 {brak}");
});

test("bot odpowiada z danych karty i z FAQ", () => {
  const kb = botKnowledge({ returns_days: 30, shipping: { free: true }, seller: { name: "NHP", email: "kontakt@x.pl" }, faq: [{ q: "Z czego jest kolczyk?", a: "Ze stali chirurgicznej 316L." }] });
  assert.match(botAnswer("jak zwrócić towar?", kb).a, /30 dni/);
  assert.match(botAnswer("ile kosztuje wysyłka", kb).a, /bezpłatna/);
  assert.match(botAnswer("Z czego jest zrobiony kolczyk", kb).a, /316L/);
  assert.match(botAnswer("produkt jest uszkodzony, reklamacja", kb).a, /14 dni/);
  assert.equal(botAnswer("xyz qwe", kb), null);
});
