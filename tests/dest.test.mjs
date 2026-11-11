import test from "node:test";
import assert from "node:assert/strict";
import { assertHttpEndpoint, endpointOriginPattern } from "../extension/dest.mjs";

test("własny serwer przyjmuje tylko HTTP i HTTPS", () => {
  assert.equal(assertHttpEndpoint("https://sklep.example/nhp"), "https://sklep.example/nhp");
  assert.equal(endpointOriginPattern("https://sklep.example/nhp"), "https://sklep.example/*");
  assert.throws(() => assertHttpEndpoint("ftp://sklep.example/nhp"), /FTP/);
  assert.throws(() => assertHttpEndpoint("nie-adres"), /pełny adres/);
});
