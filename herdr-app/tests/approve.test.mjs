import { test } from "node:test";
import assert from "node:assert/strict";
import { APPROVALS, leadBrief } from "../mods/team/model.js";

test("APPROVALS: commit + PR (first, the old default), commit only, no commit; each says what to do with the work", () => {
  assert.deepEqual(APPROVALS.map((a) => a.id), ["pr", "commit", "none"]);
  for (const a of APPROVALS) assert.match(a.tell("T-7"), /^Người dùng duyệt T-7: .+đặt status xong\.$/); // the brief's approval rule
  assert.match(APPROVALS[0].tell("T-7"), /commit và tạo PR/);
  assert.match(APPROVALS[1].tell("T-7"), /chỉ commit.*không tạo PR/);
  assert.match(APPROVALS[2].tell("T-7"), /không commit, không tạo PR/);
});

test("leadBrief: the coordinator does the kind of approval the message names", () => {
  const b = leadBrief({ name: "X", folder: "D:\\x", home: "C:\\h", lead: { role: "lead", agent: "claude", address: "t1" }, members: [] });
  assert.match(b, /commit và tạo PR \/ chỉ commit \/ không commit/);
});
