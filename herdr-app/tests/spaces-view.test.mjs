import { test } from "node:test";
import assert from "node:assert/strict";
import { projectOf, clusters, arrange } from "../mods/desktop-spaces/view.js";

const roots = ["D:\\Acme", "D:\\Acme.Core", "D:\\Projects\\tools"];

test("projectOf: the deepest root holding the folder, else null", () => {
  assert.equal(projectOf("D:\\Acme\\Acme.Claims", roots), "D:\\Acme");
  assert.equal(projectOf("d:/acme.core/x", roots), "D:\\Acme.Core");   // not D:\Acme: Acme.Core is its own root
  assert.equal(projectOf("D:\\Acme", roots), "D:\\Acme");
  assert.equal(projectOf("C:\\Users\\dev", roots), null);
});

const row = (name, folder, status, tree = null) => ({ w: { id: name, name, folder, status }, tree });

test("clusters: a worktree row stays with the space it hangs under", () => {
  const rows = [row("a", "D:\\Acme\\a"), row("a-wt", "D:\\x", null, { last: true }), row("b", "D:\\Acme\\b")];
  assert.deepEqual(clusters(rows).map((c) => c.map((r) => r.w.name)), [["a", "a-wt"], ["b"]]);
});

test("arrange: groups by project (roots order, then Khác), status or none; sorts; filters", () => {
  const rows = [
    row("Claims", "D:\\Acme\\Acme.Claims", "idle"),
    row("home", "C:\\Users\\dev", null),
    row("Approval", "D:\\Acme\\Acme.Approval", "blocked"),
    row("tools", "D:\\Projects\\tools", "working"),
  ];
  const by = (view) => arrange(rows, { roots, ...view }).map((g) => [g.key, g.rows.map((r) => r.w.name)]);
  assert.deepEqual(by({ group: "project", sort: "manual", show: "all" }), [
    ["D:\\Acme", ["Claims", "Approval"]], ["D:\\Projects\\tools", ["tools"]], ["other", ["home"]],
  ]);
  assert.deepEqual(by({ group: "project", sort: "name", show: "all" })[0][1], ["Approval", "Claims"]);
  assert.deepEqual(by({ group: "none", sort: "status", show: "all" }), [["all", ["Approval", "tools", "Claims", "home"]]]);
  assert.deepEqual(by({ group: "status", sort: "manual", show: "all" }).map((g) => g[0]), ["need", "working", "idle", "none"]);
  assert.deepEqual(by({ group: "none", sort: "manual", show: "agents" })[0][1], ["Claims", "Approval", "tools"]);
});

test("arrange: projects.json groups merge several roots into one project; the header shows the roots themselves", () => {
  const rows = [row("Claims", "D:\\Acme\\Acme.Claims", "idle"), row("core", "D:\\Acme.Core\\Core.API", null), row("tools", "D:\\Projects\\tools", null)];
  const g = arrange(rows, { group: "project", roots, groups: { Acme: ["D:\\Acme", "D:\\Acme.Core"] } });
  assert.deepEqual(g.map((x) => [x.key, x.label, x.roots, x.rows.map((r) => r.w.name)]), [
    ["Acme", "Acme", ["D:\\Acme", "D:\\Acme.Core"], ["Claims", "core"]],
    ["D:\\Projects\\tools", "tools", ["D:\\Projects\\tools"], ["tools"]],
  ]);
});
