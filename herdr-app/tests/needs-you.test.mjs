import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuestion, sameQuestion, selectedIndex } from "../mods/needs-you/model.js";
import { ACTIONS, actionState, shouldSend } from "../mods/composer/model.js";
import { statusFor } from "../mods/desktop-status/model.js";

test("parseQuestion ignores numbered lists when no choice has the ❯ cursor", () => {
  const screen = [
    "● Plan:",
    "  1. Refactor the parser",
    "  2. Delete old tests",
    "─────────────────────────",
    " Enter the value for MCP field `token`:",
    " > ",
  ].join("\n");
  assert.equal(parseQuestion(screen), null);
});

test("sameQuestion compares header, question and choice labels", () => {
  const q = parseQuestion(fixture);
  assert.equal(sameQuestion(q, parseQuestion(fixture)), true);
  assert.equal(sameQuestion(q, { ...q, question: "Push --force?" }), false);
  assert.equal(sameQuestion(q, { ...q, options: q.options.slice(0, 2) }), false);
  assert.equal(sameQuestion(q, null), false);
});

test("selectedIndex follows the agent's address, not its position", () => {
  const list = [{ address: "t9" }, { address: "t5" }, { address: "t7" }];
  assert.equal(selectedIndex(list, "t5", 0), 1);
  assert.equal(selectedIndex(list, "gone", 2), 2);
  assert.equal(selectedIndex(list, "gone", 8), 2);
  assert.equal(selectedIndex([], "t5", 0), 0);
});

test("shouldSend ignores a repeat to the same terminal within 3 s", () => {
  assert.equal(shouldSend(undefined, 10000), true);
  assert.equal(shouldSend(9000, 10000), false);
  assert.equal(shouldSend(6000, 10000), true);
});

test("statusFor shows only the focused tab's live Claude", () => {
  const sum = { model: "Opus 5.5" };
  const agents = [{ address: "t5", tab: "tabA", app: "claude-code" }, { address: "t6", tab: "tabB", app: "claude-code" }];
  assert.equal(statusFor({ terminal: "t5", sum }, agents, { tab: "tabA" }), sum);
  assert.equal(statusFor({ terminal: "t5", sum }, agents, { tab: "tabB" }), null);
  assert.equal(statusFor({ terminal: "t1", sum }, agents, { tab: "tabA" }), null);
  assert.equal(statusFor(null, agents, { tab: "tabA" }), null);
});

const fixture = readFileSync(new URL("./fixture-askuserquestion.txt", import.meta.url), "utf8");

test("parseQuestion reads a real AskUserQuestion card", () => {
  const q = parseQuestion(fixture);
  assert.equal(q.header, "Color");
  assert.equal(q.question, "Which color do you prefer?");
  assert.deepEqual(q.options.map((o) => [o.n, o.label]), [[1, "Red"], [2, "Blue"], [3, "Green"], [4, "Type something."], [5, "Chat about this"]]);
  assert.equal(q.options[0].desc, "Red");
  assert.equal(q.options[3].desc, "");
});

test("parseQuestion reads a permission prompt", () => {
  const screen = [
    "──────────────────────────",
    " Bash command",
    "   npm run build",
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. Yes, and don't ask again for npm run build",
    "   3. No, and tell Claude what to do differently (esc)",
    "",
  ].join("\n");
  const q = parseQuestion(screen);
  assert.equal(q.options.length, 3);
  assert.equal(q.options[2].label, "No, and tell Claude what to do differently (esc)");
  assert.ok(q.question.includes("Do you want to proceed?"));
  assert.ok(q.question.includes("npm run build"));
});

test("parseQuestion: steps, a wrapped │ question as one paragraph, full descriptions, recommended and built-in choices", () => {
  const screen = [
    "──────────────────────────────────────────",
    "← ☐ Duyệt T-1  ☐ File sửa dở  ✔ Submit →",
    "",
    "│ Review (t4v) báo nhánh đang mở (claude/project-thread-689rbd, HEAD 9fcd6320, PR",
    "│ #18) chậm 124 commit so với origin/main. CONTEXT.md nên chốt theo bản nào?",
    "",
    "❯ 1. origin/main (9eaaeed0) (Recommended)",
    "     Chốt theo main. DEV bổ sung phần khác biệt",
    "     đọc bằng git show/log origin/main",
    "  2. HEAD 9fcd6320",
    "     Giữ đúng như phiếu",
    "  3. Type something.",
    "─────────────────",
    "  4. Chat about this",
    "",
    "Enter to select · Tab/Arrow keys to navigate · Esc to cancel",
  ].join("\n");
  const q = parseQuestion(screen);
  assert.deepEqual(q.steps, [{ label: "Duyệt T-1", done: false }, { label: "File sửa dở", done: false }, { label: "Submit", done: true }]);
  assert.equal(q.header, "Duyệt T-1"); // the first step not answered yet
  assert.equal(q.question, "Review (t4v) báo nhánh đang mở (claude/project-thread-689rbd, HEAD 9fcd6320, PR #18) chậm 124 commit so với origin/main. CONTEXT.md nên chốt theo bản nào?");
  assert.deepEqual(q.options.map((o) => [o.n, o.label, o.recommended, o.cursor, o.kind]),
    [[1, "origin/main (9eaaeed0)", true, true, null], [2, "HEAD 9fcd6320", false, false, null], [3, "Type something.", false, false, "type"], [4, "Chat about this", false, false, "chat"]]);
  assert.equal(q.options[0].desc, "Chốt theo main. DEV bổ sung phần khác biệt đọc bằng git show/log origin/main");
});

test("sameQuestion: a permission prompt's countdown ticking is the same question", () => {
  const card = (left) => parseQuestion(["Bash command", "", "  rm -f \"$S\"/*.rc",
    `possibly-empty variable path ⚠ Claude Code will automatically block this request in ${left}, to avoid holding up an unattended session`,
    "", "Do you want to proceed?", "❯ 1. Yes", "  2. No", "Esc to cancel"].join("\n"));
  assert.equal(sameQuestion(card("1:48"), card("1:31")), true);
  assert.equal(sameQuestion(card("1:48"), { ...card("1:48"), question: "Do you want to delete it?" }), false);
});

test("parseQuestion returns null without options", () => {
  assert.equal(parseQuestion("● You picked Blue.\n❯ \n  Opus 5.5 · ctx 6%"), null);
  assert.equal(parseQuestion(""), null);
});

test("actionState: any agent (Claude Code, Codex, Antigravity…), named in the reason", () => {
  assert.deepEqual(actionState({ status: "idle" }), { enabled: true, reason: null });
  assert.equal(actionState({ status: "done" }).enabled, true);
  assert.deepEqual(actionState({ status: "working" }), { enabled: false, reason: "Agent đang làm…" });
  assert.deepEqual(actionState({ status: "working", name: "Codex" }), { enabled: false, reason: "Codex đang làm…" });
  assert.deepEqual(actionState({ status: "blocked", name: "Claude Code" }), { enabled: false, reason: "Claude Code đang chờ bạn trả lời" });
  assert.deepEqual(actionState(null), { enabled: false, reason: "Chưa có agent để gửi" });
});

test("actionsFor: plain phrases go to any agent; a slash command only to agents that know it", () => {
  const ids = (app) => actionsFor(ACTIONS, app).map((a) => a.id);
  assert.ok(ids("codex").includes("commit") && ids("antigravity").includes("review"));
  assert.ok(ids("claude-code").includes("clear") && ids("claude-code").includes("compact"));
  assert.ok(ids("codex").includes("compact") && !ids("codex").includes("clear"));
  // Antigravity lists /compact and /clear among its commands (agy 1.5.4).
  assert.ok(ids("antigravity").includes("compact") && ids("antigravity").includes("clear"));
  // Claude Code's own review commands go to Claude only.
  assert.ok(ids("claude-code").includes("sec-review") && ids("claude-code").includes("code-review"));
  assert.ok(!ids("codex").includes("sec-review") && !ids("antigravity").includes("code-review"));
});
import { actionsFor } from "../mods/composer/model.js";

test("ACTIONS keep the user's own phrases, grouped; only merge and /clear ask first", () => {
  const text = (id) => ACTIONS.find((a) => a.id === id)?.text;
  assert.equal(text("commit"), "Commit");
  assert.equal(text("pr"), "Commit + PR");
  assert.equal(text("deploy"), "Build bộ deploy");
  assert.equal(text("merge"), "Merge PR đi");
  assert.deepEqual([...new Set(ACTIONS.map((a) => a.group))], ["Git", "Kiểm tra", "Claude"]);
  assert.deepEqual(ACTIONS.filter((a) => a.confirm).map((a) => a.id), ["merge", "clear"]);
});

test("withCustom: the person's actions.json entries join under 'Của tôi'; broken ones are skipped", () => {
  const got = withCustom(ACTIONS, [{ label: "Deploy DEV", text: "Deploy lên DEV" }, { label: "x" }, "junk", { label: "Nguy hiểm", text: "Xoá", confirm: true, group: "Ops" }]);
  const mine = got.slice(ACTIONS.length);
  assert.deepEqual(mine.map((a) => [a.group, a.label, a.text, !!a.confirm]), [["Của tôi", "Deploy DEV", "Deploy lên DEV", false], ["Ops", "Nguy hiểm", "Xoá", true]]);
  assert.equal(new Set(got.map((a) => a.id)).size, got.length);
  assert.deepEqual(withCustom(ACTIONS, null), ACTIONS);
});
import { withCustom } from "../mods/composer/model.js";
