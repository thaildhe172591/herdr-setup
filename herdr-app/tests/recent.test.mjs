import { test } from "node:test";
import assert from "node:assert/strict";
import { firstCwd, recentFolders } from "../mods/projects/recent.js";

test("firstCwd: the cwd a Claude session ran in, from the head of its transcript", () => {
  const head = ['{"type":"permission-mode"}', '{"type":"user","cwd":"D:\\\\Acme\\\\Acme.Web","sessionId":"x"}'].join("\n");
  assert.equal(firstCwd(head), "D:\\Acme\\Acme.Web");
  assert.equal(firstCwd('{"type":"x"}'), null);
});

test("recentFolders: newest first, one entry per folder, missing folders dropped", () => {
  const got = recentFolders([
    { path: "D:\\A", at: 10 }, { path: "d:\\a\\", at: 30 }, { path: "D:\\B", at: 20 }, { path: "D:\\Gone", at: 40 },
  ], (p) => !p.toLowerCase().includes("gone"));
  assert.deepEqual(got.map((x) => [x.path, x.at]), [["d:\\a\\", 30], ["D:\\B", 20]]);
});
