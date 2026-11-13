import { test } from "node:test";
import assert from "node:assert/strict";
import { folderChoices, addSaved, normPath, DEFAULT_ROOTS } from "../mods/new-session/model.js";

test("same folder spelled differently appears once", () => {
  const c = folderChoices({ recent: [{ folder: "D:\\Acme\\" }], saved: [], cache: [{ path: "d:/acme", name: "Acme (gốc)" }] }, "");
  assert.equal(c.filter((x) => normPath(x.path) === "d:\\acme").length, 1);
});

test("folderChoices keeps unicode path", () => {
  const c = folderChoices({ recent: [{ folder: "D:\\Dự án\\x y" }], saved: [], cache: [] }, "");
  assert.equal(c[0].path, "D:\\Dự án\\x y");
  assert.equal(c[0].section, "Gần đây");
});

test("filter keeps only matching folders, accents optional", () => {
  const cache = [{ path: "D:\\Acme\\Acme.Claims", name: "Acme.Claims" }, { path: "D:\\Acme\\Acme.Shop", name: "Acme.Shop" }];
  assert.deepEqual(folderChoices({ recent: [], saved: [], cache }, "claim").map((x) => x.path), ["D:\\Acme\\Acme.Claims"]);
  assert.equal(folderChoices({ recent: [{ folder: "D:\\Dự án\\x" }], saved: [], cache: [] }, "du an").length, 1);
});

test("recent is capped at 8 and listed before projects", () => {
  const recent = Array.from({ length: 12 }, (_, i) => ({ folder: `C:\\r${i}` }));
  const c = folderChoices({ recent, saved: [{ path: "C:\\saved" }], cache: [] }, "");
  assert.equal(c.filter((x) => x.section === "Gần đây").length, 8);
  assert.equal(c.at(-1).path, "C:\\saved");
  assert.equal(c.at(-1).section, "Dự án");
});

test("addSaved replaces an existing entry and keeps roots", () => {
  const cfg = { roots: ["D:\\Acme"], saved: [{ path: "D:\\x", name: "x", dev: null }] };
  const next = addSaved(cfg, { path: "d:/x/", name: "X mới", dev: "npm run dev" });
  assert.equal(next.saved.length, 1);
  assert.equal(next.saved[0].name, "X mới");
  assert.equal(next.saved[0].dev, "npm run dev");
  assert.deepEqual(next.roots, ["D:\\Acme"]);
  assert.equal(addSaved(cfg, { path: "E:\\y" }).saved.length, 2);
});

test("addSaved on a missing config starts from the default roots", () => {
  const next = addSaved(null, { path: "E:\\y" });
  assert.deepEqual(next.roots, DEFAULT_ROOTS); // none shipped: install.ps1 writes the person's roots to projects.json
  assert.equal(next.saved.length, 1);
});

import { tabName } from "../mods/new-session/model.js";
test("tabName: a short name from the task, else the agent's name (not 'work')", () => {
  assert.equal(tabName("Sửa lỗi đăng nhập trên trang quản trị khi token hết hạn", "Claude Code"), "Sửa lỗi đăng nhập");
  assert.equal(tabName("  fix   login  ", "Claude Code"), "fix login");
  assert.equal(tabName("", "Codex"), "Codex");
  assert.equal(tabName(null, null), "agent");
  assert.equal(tabName("averyveryveryverylongsingleworddddddddddd", "X").length <= 28, true);
});
