import { test } from "node:test";
import assert from "node:assert/strict";
import { unifiedRows, splitRows } from "../mods/desktop-diff/model.js";

const diff = [
  "@@ -1,4 +1,4 @@",
  " keep",
  "-old a",
  "-old b",
  "+new a",
  " end",
  "\\ No newline at end of file",
];

test("unifiedRows: old/new line numbers per row, hunk headers kept", () => {
  assert.deepEqual(unifiedRows(diff), [
    { kind: "@", text: "@@ -1,4 +1,4 @@" },
    { kind: " ", old: 1, new: 1, text: "keep" },
    { kind: "-", old: 2, text: "old a" },
    { kind: "-", old: 3, text: "old b" },
    { kind: "+", new: 2, text: "new a" },
    { kind: " ", old: 4, new: 3, text: "end" },
    { kind: "\\", text: "\\ No newline at end of file" },
  ]);
});

test("splitRows: removed lines face the added ones side by side; the rest pads with blanks", () => {
  assert.deepEqual(splitRows(unifiedRows(diff)), [
    { hunk: "@@ -1,4 +1,4 @@" },
    { left: { n: 1, text: "keep", kind: " " }, right: { n: 1, text: "keep", kind: " " } },
    { left: { n: 2, text: "old a", kind: "-" }, right: { n: 2, text: "new a", kind: "+" } },
    { left: { n: 3, text: "old b", kind: "-" }, right: null },
    { left: { n: 4, text: "end", kind: " " }, right: { n: 3, text: "end", kind: " " } },
  ]);
});
