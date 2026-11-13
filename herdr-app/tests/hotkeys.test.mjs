import { test } from "node:test";
import assert from "node:assert/strict";
import { hotkeyRows, formatKeys } from "../mods/hotkeys/model.js";

const B = [
  { section: "global", keys: "ctrl-shift-j", action: "mod.open:projects" },
  { section: "terminal", keys: "ctrl-shift-c", action: "terminal.copy" },
  { section: "layout:desktop", keys: "ctrl-shift-r", action: "layout.toggle:rail" },
];

test("global binding gets group, formatted keys and Vietnamese label", () => {
  assert.ok(hotkeyRows(B, "").some((r) => r.group === "Herdr" && r.keys === "Ctrl+Shift+J" && r.label === "Mở dự án"));
});

test("sections map to groups", () => {
  const rows = hotkeyRows(B, "");
  assert.equal(rows.find((r) => r.keys === "Ctrl+Shift+C").group, "Terminal");
  assert.equal(rows.find((r) => r.keys === "Ctrl+Shift+R").group, "Herdr");
});

test("filter ignores Vietnamese accents", () => {
  const rows = hotkeyRows(B, "mo du an");
  assert.ok(rows.some((r) => r.label === "Mở dự án"));
  assert.ok(!rows.some((r) => r.keys === "Ctrl+Shift+C"));
});

test("Claude Code keys are listed and filterable", () => {
  assert.ok(hotkeyRows(B, "esc").some((r) => r.group === "Claude Code" && r.keys === "Esc"));
});

test("formatKeys", () => {
  assert.equal(formatKeys("alt-shift-h"), "Alt+Shift+H");
  assert.equal(formatKeys("f1"), "F1");
  assert.equal(formatKeys("ctrl-shift-/"), "Ctrl+Shift+/");
});
