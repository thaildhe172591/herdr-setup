import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as composer from "../mods/composer/model.js";
import * as team from "../mods/team/model.js";

test("sessionRecord: Antigravity's conversationId, Codex's session_id; anything a shell could misread is dropped", () => {
  const id = "e741caee-ad42-444d-9b6e-0a4de92d12f9";
  assert.deepEqual(composer.sessionRecord("agy", { conversationId: id, transcriptPath: "x" }, "D:\\w", 5), { at: 5, kind: "agy", session: id, cwd: "D:\\w" });
  assert.deepEqual(composer.sessionRecord("codex", { session_id: id, cwd: "D:\\p" }, "D:\\w", 5), { at: 5, kind: "codex", session: id, cwd: "D:\\p" });
  assert.equal(composer.sessionRecord("agy", { conversationId: "abc; rm -rf ~" }, "D:\\w", 5), null);
  assert.equal(composer.sessionRecord("agy", { conversationId: "short" }, "D:\\w", 5), null);
  assert.equal(composer.sessionRecord("vim", { session_id: id }, "D:\\w", 5), null);
  assert.equal(composer.sessionRecord("codex", null, "D:\\w", 5), null);
});

test("withResume: the composer's copy and the team's agree for every role and agent", () => {
  for (const role of ["lead", "dev", "qa", "review", "research"]) for (const agent of ["claude", "codex", "agy"]) {
    const argv = team.argvFor(role, agent, team.defaultSetup(role, agent));
    assert.deepEqual(composer.withResume(argv, agent, "s-1"), team.withResume(argv, agent, "s-1"), `${role}/${agent}`);
  }
  assert.deepEqual(team.withResume(["codex", "--no-daemon", "-s", "read-only"], "codex", "u1"), ["codex", "resume", "u1", "--no-daemon", "-s", "read-only"]);
  assert.deepEqual(team.withResume(["agy", "--mode", "auto"], "agy", "u1"), ["agy", "--mode", "auto", "--conversation", "u1"]);
  assert.deepEqual(team.withResume(["claude", "--model", "opus"], "claude", "u1"), ["claude", "--resume", "u1", "--model", "opus"]);
});

test("resumeArgv / resumeKeys: a member's recorded command, else its kind's; Codex effort is not typed (no '_' key)", () => {
  const argv = ["codex", "--no-daemon", "--approve-for-me", "-m", "gpt-6", "-c", "model_reasoning_effort=high"];
  assert.equal(composer.resumeCommand({ kind: "codex", session: "u1", argv }), "codex resume u1 --no-daemon --approve-for-me -m gpt-6 -c model_reasoning_effort=high");
  const keys = composer.resumeKeys({ kind: "codex", session: "u1", argv });
  assert.equal(keys.slice(1, -1).map((k) => (k === "space" ? " " : k)).join(""), "codex resume u1 --no-daemon --approve-for-me -m gpt-6");
  assert.equal(composer.resumeCommand({ kind: "agy", session: "u2", member: true }), "agy --mode auto --conversation u2");
  assert.equal(composer.resumeCommand({ kind: "agy", session: "u2" }), "agy --conversation u2");
  assert.equal(composer.resumeCommand({ kind: "codex", session: "u3", member: true }), "codex resume u3 --no-daemon");
  assert.equal(composer.resumeCommand({ session: "u4", model: "opus", effort: "xhigh" }), "claude --resume u4 --model opus --effort xhigh");
  assert.ok(composer.resumeKeys({ kind: "agy", session: "u2", argv: ["agy", "--mode", "auto", "--model", "gemini-3.8-flash"] }));
});

test("lostSessions: Codex and Antigravity come back like Claude; a terminal with any agent running is left alone", () => {
  const terminals = [{ address: "t1", cwd: "D:\\p" }, { address: "t2", cwd: "D:\\p" }, { address: "t3", cwd: "D:\\p" }];
  const statuses = { t1: { at: 1, kind: "agy", session: "a1", cwd: "D:\\p" }, t2: { at: 1, kind: "codex", session: "c1", cwd: "D:\\p" }, t3: { at: 1, kind: "agy", session: "a3" } };
  const got = composer.lostSessions({ terminals, agents: [{ address: "t3", app: "antigravity" }], statuses, coreStart: 10, now: 1e6 });
  assert.deepEqual(got.map((x) => [x.terminal, x.kind, x.session]), [["t1", "agy", "a1"], ["t2", "codex", "c1"]]);
  assert.deepEqual(composer.lostSessions({ terminals, statuses: { t1: { at: 1, kind: "agy", session: "x;y" } }, coreStart: 10 }), []);
});

test("agent-session bridge: keeps the session for its Herdr terminal, nothing outside Herdr", () => {
  const bridge = fileURLToPath(new URL("../bridge/agent-session.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "agent-session-"));
  try {
    const run = (env, input) => execFileSync("node", [bridge, "agy"], { input, env: { ...process.env, LOCALAPPDATA: dir, ...env }, encoding: "utf8" });
    assert.equal(run({ HC_TERMINAL_ID: "t9" }, JSON.stringify({ conversationId: "e741caee-ad42-444d-9b6e-0a4de92d12f9" })), "");
    const saved = JSON.parse(readFileSync(join(dir, "herdr-agents", "t9.json"), "utf8"));
    assert.equal(saved.kind, "agy");
    assert.equal(saved.session, "e741caee-ad42-444d-9b6e-0a4de92d12f9");
    assert.equal(run({ HC_TERMINAL_ID: "t9" }, "not json"), ""); // never fails the agent
    const env = { ...process.env, LOCALAPPDATA: dir }; delete env.HC_TERMINAL_ID;
    execFileSync("node", [bridge, "agy"], { input: "{}", env });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
