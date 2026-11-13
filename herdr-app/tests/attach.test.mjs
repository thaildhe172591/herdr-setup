import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf, insertText, targetTerminal, altVTarget } from "../mods/composer/model.js";

test("kindOf", () => {
  assert.equal(kindOf("a.PNG", false), "image");
  assert.equal(kindOf("D:\\x", true), "folder");
  assert.equal(kindOf("a.cs", false), "file");
  assert.equal(kindOf("shot.webp", false), "image");
});

test("insertText quotes spaces", () => {
  assert.equal(
    insertText([{ path: "D:\\Dự án\\a b.png", kind: "image" }, { path: "D:\\src\\x.cs", kind: "file" }]),
    "\"D:\\Dự án\\a b.png\" @D:\\src\\x.cs ",
  );
  assert.equal(insertText([{ path: "D:\\my dir", kind: "folder" }]), "@\"D:\\my dir\" ");
});

test("targetTerminal falls back to focused", () => {
  assert.equal(targetTerminal({ agents: [], focused: { tab: "t1", terminal: "t9" } }), "t9");
  const agents = [{ address: "t5", tab: "t1", app: "claude-code" }, { address: "t7", tab: "t2", app: "claude-code" }];
  assert.equal(targetTerminal({ agents, focused: { tab: "t1", terminal: "t9" } }), "t5");
  assert.equal(targetTerminal({ agents: [], focused: null }), null);
});

test("targetTerminal prefers the focused Claude when a tab has several", () => {
  const agents = [{ address: "t5", tab: "t1", app: "claude-code" }, { address: "t6", tab: "t1", app: "claude-code" }];
  assert.equal(targetTerminal({ agents, focused: { tab: "t1", terminal: "t6" } }), "t6");
});

test("altVTarget forwards to the focused pane, not the tab's Claude", () => {
  assert.equal(altVTarget({ tab: "t1", terminal: "t9" }, "t5"), "t9");
  assert.equal(altVTarget(null, "t5"), "t5");
});

test("targetTerminal: a tab without Claude (a terminal tab) sends to its space's Claude", () => {
  const agents = [{ address: "t5", tab: "t1", space: "s1", app: "claude-code" }, { address: "t7", tab: "t2", space: "s2", app: "claude-code" }];
  assert.equal(targetTerminal({ agents, focused: { tab: "t3", space: "s1", terminal: "t9" } }), "t5");
  assert.equal(targetTerminal({ agents, focused: { tab: "t4", space: "s9", terminal: "t9" } }), "t9");
});

test("targetTerminal: a focused non-Claude agent (Codex tab) gets the message, not the space's Claude", () => {
  const agents = [{ address: "t5", tab: "t1", space: "s1", app: "claude-code" }, { address: "t8", tab: "t3", space: "s1", app: "codex" }];
  assert.equal(targetTerminal({ agents, focused: { tab: "t3", space: "s1", terminal: "t8" } }), "t8");
});
