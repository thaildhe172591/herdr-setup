import { test } from "node:test";
import assert from "node:assert/strict";
import { checksState, parsePr, prTone, checksTone, reviewTone, parseAheadBehind } from "../mods/desktop-rail/model.js";

test("checksState", () => {
  assert.equal(checksState([]), null);
  assert.equal(checksState([{ conclusion: "SUCCESS", status: "COMPLETED" }, { conclusion: "SKIPPED", status: "COMPLETED" }]), "pass");
  assert.equal(checksState([{ conclusion: "SUCCESS", status: "COMPLETED" }, { status: "IN_PROGRESS" }]), "pending");
  assert.equal(checksState([{ state: "PENDING" }]), "pending");
  assert.equal(checksState([{ conclusion: "FAILURE", status: "COMPLETED" }, { status: "IN_PROGRESS" }]), "fail");
  assert.equal(checksState([{ state: "ERROR" }]), "fail");
});

test("parsePr maps gh output", () => {
  const pr = parsePr({ number: 8, title: "Docs", url: "https://x/8", state: "OPEN", isDraft: false, reviewDecision: "APPROVED", statusCheckRollup: [{ conclusion: "SUCCESS", status: "COMPLETED" }] });
  assert.deepEqual(pr, { number: 8, title: "Docs", url: "https://x/8", state: "open", checks: "pass", review: "approved" });
  assert.equal(parsePr({ number: 2, state: "OPEN", isDraft: true, statusCheckRollup: [] }).state, "draft");
  assert.equal(parsePr({ number: 3, state: "MERGED", statusCheckRollup: [] }).state, "merged");
  assert.equal(parsePr({ number: 4, state: "OPEN", reviewDecision: "CHANGES_REQUESTED", statusCheckRollup: [] }).review, "changes");
  assert.equal(parsePr(null), null);
});

test("prTone follows GitHub / Claude Desktop state colours", () => {
  const pr = (state, o) => ({ number: 1, state, checks: null, review: null, ...o });
  assert.equal(prTone(pr("open")), "ansi2"); // green
  assert.equal(prTone(pr("open", { checks: "fail" })), "ansi2"); // checks get their own tag
  assert.equal(prTone(pr("draft")), "dim"); // grey
  assert.equal(prTone(pr("merged")), "ansi5"); // purple
  assert.equal(prTone(pr("closed")), "ansi1"); // red
});

test("checksTone and reviewTone", () => {
  assert.equal(checksTone("pass"), "ansi2");
  assert.equal(checksTone("pending"), "ansi3"); // orange/yellow
  assert.equal(checksTone("fail"), "ansi1");
  assert.equal(checksTone(null), null);
  assert.equal(reviewTone("approved"), "ansi2");
  assert.equal(reviewTone("review"), "ansi3");
  assert.equal(reviewTone("changes"), "ansi1");
});

test("parseAheadBehind", () => {
  assert.deepEqual(parseAheadBehind("3\t1\n"), { behind: 3, ahead: 1 });
  assert.deepEqual(parseAheadBehind("0 0"), { behind: 0, ahead: 0 });
  assert.equal(parseAheadBehind("fatal: no upstream"), null);
});

import { parseStatus, parseNumstat } from "../mods/desktop-rail/model.js";

test("parseStatus: porcelain v1 lines → code + path (renames take the new path)", () => {
  const out = " M src/a.cs\nA  docs/Tài liệu.md\n?? new file.txt\nR  old.cs -> lib/new.cs\n D gone.js\n";
  assert.deepEqual(parseStatus(out), [
    { code: "M", path: "src/a.cs" },
    { code: "A", path: "docs/Tài liệu.md" },
    { code: "?", path: "new file.txt" },
    { code: "R", path: "lib/new.cs" },
    { code: "D", path: "gone.js" },
  ]);
  assert.deepEqual(parseStatus(""), []);
});

test("parseNumstat: path → added/removed; binary files have none", () => {
  const m = parseNumstat("12\t3\tsrc/a.cs\n-\t-\timg.png\n0\t7\tgone.js\n");
  assert.deepEqual(m["src/a.cs"], { add: 12, del: 3 });
  assert.deepEqual(m["img.png"], { add: null, del: null });
  assert.deepEqual(m["gone.js"], { add: 0, del: 7 });
});

import { parseStatusV2 } from "../mods/desktop-rail/model.js";
test("parseStatusV2: branch, ahead/behind and files from one `git status --porcelain=v2 --branch`", () => {
  const out = [
    "# branch.oid 1a2b3c",
    "# branch.head claude/tai-lieu",
    "# branch.upstream origin/claude/tai-lieu",
    "# branch.ab +2 -1",
    "1 .M N... 100644 100644 100644 aaa bbb src/My File.cs",
    "1 A. N... 000000 100644 100644 000 ccc docs/Tài liệu.md",
    "2 R. N... 100644 100644 100644 ddd eee R100 lib/new.cs\told.cs",
    "u UU N... 100644 100644 100644 100644 f1 f2 f3 conflict.txt",
    "? new file.txt",
    "",
  ].join("\n");
  assert.deepEqual(parseStatusV2(out), {
    branch: "claude/tai-lieu", ahead: 2, behind: 1,
    files: [
      { code: "M", path: "src/My File.cs" },
      { code: "A", path: "docs/Tài liệu.md" },
      { code: "R", path: "lib/new.cs" },
      { code: "U", path: "conflict.txt" },
      { code: "?", path: "new file.txt" },
    ],
  });
  // No upstream: no ahead/behind; detached HEAD: no branch name.
  assert.deepEqual(parseStatusV2("# branch.head (detached)\n"), { branch: "", ahead: null, behind: null, files: [] });
});
