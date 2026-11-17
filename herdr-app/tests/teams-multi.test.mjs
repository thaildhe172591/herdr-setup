import { test } from "node:test";
import assert from "node:assert/strict";
import * as team from "../mods/team/model.js";
import * as composer from "../mods/composer/model.js";

// Two departments in one space: one made before (kept under the space's id), one new (under its name's slug).
const teams = {
  sp1: { name: "Zalo Mini App", space: "sp1", tab: "tbA", lead: { address: "t28" }, members: [{ role: "qa", address: "t2c" }] },
  "web-admin": { name: "Web Admin", space: "sp1", tab: "tbB", lead: { address: "t1p" }, members: [{ role: "review", address: "t1r" }] },
};

test("nameTaken: a name whose slug any department has, in any space (their task folders would mix)", () => {
  assert.equal(team.nameTaken(teams, "Zalo Mini App"), true);
  assert.equal(team.nameTaken(teams, "zalo  mini-app"), true); // same slug
  assert.equal(team.nameTaken(teams, "WEB ADMIN"), true); // its key
  assert.equal(team.nameTaken(teams, "Báo cáo"), false);
  assert.equal(team.nameTaken({}, "X"), false);
});

test("freeName: the base when free, else the first numbered one", () => {
  assert.equal(team.freeName(teams, "Báo cáo"), "Báo cáo");
  assert.equal(team.freeName(teams, "Web Admin"), "Web Admin 2");
  assert.equal(team.freeName({ ...teams, "web-admin-2": { name: "Web Admin 2" } }, "Web Admin"), "Web Admin 3");
});

test("deptOf: a member's own department first, then the tab's, then the space's; the two copies agree", () => {
  for (const f of [team.deptOf, composer.deptOf]) {
    assert.equal(f(teams, { address: "t1r", tab: "tbA", space: "sp1" }).key, "web-admin");
    assert.equal(f(teams, { address: "t9", tab: "tbB", space: "sp1" }).key, "web-admin");
    assert.equal(f(teams, { tab: "tbX", space: "sp1" }).key, "sp1");
    assert.equal(f(teams, { space: "sp2" }), null);
    assert.equal(f(undefined, { address: "t1r" }), null);
  }
});

test("board tabs: each department its own; only one kept under its space's id also owns the plain one", () => {
  const zalo = { ...teams.sp1, key: "sp1" }, web = { ...teams["web-admin"], key: "web-admin" };
  assert.equal(team.boardTabName(web), "Bảng việc · Web Admin");
  assert.equal(team.ownsPlainBoard(zalo), true);
  assert.equal(team.ownsPlainBoard(web), false);
  const tabs = [{ id: "a", name: "Bảng việc" }, { id: "b", name: "Bảng việc · Web Admin" }];
  assert.equal(composer.boardTab(zalo, tabs).id, "a");
  assert.equal(composer.boardTab(web, tabs).id, "b");
  assert.equal(composer.boardTab(web, [{ id: "a", name: "Bảng việc" }]), null); // never another department's board
});

test("byTeam: the picker splits a space's two departments (same roles) and puts the shown tab's first", () => {
  const ags = [
    { address: "t28", space: "sp1", space_name: "Repo", tab: "tbA" }, { address: "t1p", space: "sp1", space_name: "Repo", tab: "tbB" },
    { address: "t2c", space: "sp1", space_name: "Repo", tab: "tbA" }, { address: "t9", space: "sp1", space_name: "Repo", tab: "tbC" },
    { address: "t7", space: "sp2", space_name: "Other", tab: "tbD" },
  ];
  const g = composer.byTeam(ags, { space: "sp1", tab: "tbB" }, teams);
  assert.deepEqual(g.map((x) => [x.name, x.agents.map((a) => a.address)]), [
    ["Repo · Web Admin", ["t1p"]], ["Repo · Zalo Mini App", ["t28", "t2c"]], ["Repo", ["t9"]], ["Other", ["t7"]]]);
  assert.deepEqual(composer.byTeam([], {}, teams), []);
});
