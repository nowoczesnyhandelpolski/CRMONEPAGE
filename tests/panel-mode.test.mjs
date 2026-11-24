import test from "node:test";
import assert from "node:assert/strict";
import { dockMode, nextDockMode } from "../extension/panel-mode.mjs";

test("bez zapisu panel jest zwinięty, a przy trwającej sesji otwarty", () => {
  assert.equal(dockMode({ saved: "", sessionActive: false }), "collapsed");
  assert.equal(dockMode({ sessionActive: false }), "collapsed");
  assert.equal(dockMode({ saved: "", sessionActive: true }), "open");
  assert.equal(dockMode({ saved: "closed", sessionActive: true }), "closed");
  assert.equal(dockMode({ saved: "collapsed", sessionActive: true }), "collapsed");
  assert.equal(dockMode({ saved: "open", sessionActive: false }), "open");
});

test("Zwiń, Zamknij i Esc prowadzą do znanego stanu", () => {
  assert.equal(nextDockMode("open", "collapsed"), "collapsed");
  assert.equal(nextDockMode("open", "collapse"), "collapsed");
  assert.equal(nextDockMode("collapsed", "open"), "open");
  assert.equal(nextDockMode("collapsed", "toggle"), "open");
  assert.equal(nextDockMode("open", "toggle"), "collapsed");
  assert.equal(nextDockMode("open", "closed"), "closed");
  assert.equal(nextDockMode("closed", "collapsed"), "closed");
  assert.equal(nextDockMode("closed", "open"), "open");
});
