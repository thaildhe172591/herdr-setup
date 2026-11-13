import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionInfo, contextRows } from "../mods/desktop-rail/session.js";

const L = (o) => JSON.stringify(o);
const transcript = [
  L({ type: "permission-mode", permissionMode: "default" }),
  L({ type: "api-request-shape", shape: { system: [{ type: "text", text: "x".repeat(400) }], tools: [{ name: "Read", description: "y".repeat(392) }] } }),
  L({ type: "attachment", attachment: { type: "deferred_tools_delta", addedNames: ["WebSearch", "mcp__glab__glab_mr_list", "mcp__glab__glab_ci_list", "mcp__plugin_context7_context7__query-docs", "mcp__plugin_playwright_playwright__browser_click"], failedMcpServers: [{ name: "plugin:data:definite", error: "ENDPOINT_NOT_FOUND" }] } }),
  L({ type: "attachment", attachment: { type: "mcp_instructions_delta", addedNames: ["glab", "plugin:context7:context7"], addedBlocks: ["g".repeat(40), "c".repeat(40)] } }),
  L({ type: "attachment", attachment: { type: "agent_listing_delta", addedTypes: ["Explore", "claude-security:explore"], addedLines: ["- Explore: read", "- claude-security:explore: map"] } }),
  L({ type: "attachment", attachment: { type: "skill_listing", isInitial: true, names: ["pr", "superpowers:brainstorming", "superpowers:tdd"], content: "s".repeat(80) } }),
  L({ type: "attachment", attachment: { type: "instructions", files: [{ path: "C:\Users\A\.claude\CLAUDE.md", type: "User", content: "m".repeat(200) }] } }),
  L({ type: "user", message: { content: "hello, ignored" } }),
  L({ type: "assistant", timestamp: "t1", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "D:\a.md", content: "z" } }] } }),
  L({ type: "assistant", timestamp: "t2", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "superpowers:brainstorming" } }] } }),
  L({ type: "assistant", timestamp: "t3", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "D:\b.cs" } }, { type: "tool_use", name: "Edit", input: { file_path: "D:\a.md" } }] } }),
  L({ type: "permission-mode", permissionMode: "plan" }),
  "{broken json",
].join("\n");

test("sessionInfo: mode, context parts, connectors, skills, plugins, outputs from a transcript", () => {
  const s = sessionInfo(transcript);
  assert.equal(s.mode, "plan");
  const part = (k) => s.fixed.find((r) => r.key === k).tokens;
  assert.equal(part("system_prompt"), 100);
  assert.ok(part("system_tools") > 98);
  assert.equal(part("skills"), 20);
  assert.equal(part("memory"), 50);
  assert.equal(part("mcp_instructions"), 20);
  assert.deepEqual(s.deferred, { mcp: 4, system: 1 });
  assert.deepEqual(s.connectors.map((c) => [c.name, c.tools, c.status]), [["glab", 2, "ok"], ["context7", 1, "ok"], ["playwright", 1, "ok"], ["definite", 0, "failed"]]);
  assert.deepEqual(s.skills.used, ["superpowers:brainstorming"]);
  assert.deepEqual(s.plugins.map((p) => [p.name, p.skills, p.agents, p.mcp]), [["claude-security", 0, 1, 0], ["context7", 0, 0, 1], ["data", 0, 0, 1], ["playwright", 0, 0, 1], ["superpowers", 2, 0, 0]]);
  assert.deepEqual(s.outputs.map((o) => [o.path, o.action]), [["D:\a.md", "edit"], ["D:\b.cs", "edit"]]);
  assert.deepEqual(s.agents, ["Explore", "claude-security:explore"]);
  assert.equal(s.memory[0].type, "User");
});

test("contextRows: Messages is what the live count leaves; free space; shares of the window", () => {
  const { rows, free } = contextRows([{ key: "a", label: "A", tokens: 1000 }], 5000, 100000);
  assert.deepEqual(rows.map((r) => [r.key, r.tokens, r.pct]), [["messages", 4000, 4], ["a", 1000, 1]]);
  assert.equal(free, 95000);
  assert.equal(contextRows([], null, null).rows[0].tokens, null);
});

import { lastReply } from "../mods/desktop-rail/session.js";
test("lastReply: the text of Claude's last answer (tool calls and earlier turns left out)", () => {
  const L = (o) => JSON.stringify(o);
  const t = [
    L({ type: "assistant", message: { content: [{ type: "text", text: "old answer" }] } }),
    L({ type: "user", message: { content: "next question" } }),
    L({ type: "assistant", message: { content: [{ type: "thinking", thinking: "hmm" }, { type: "tool_use", name: "Bash", input: {} }] } }),
    L({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
    L({ type: "assistant", message: { content: [{ type: "text", text: "Part one." }] } }),
    L({ type: "assistant", message: { content: [{ type: "text", text: "Part two." }] } }),
    L({ type: "system", subtype: "turn_duration" }),
  ].join("\n");
  assert.equal(lastReply(t), "Part one.\n\nPart two.");
  assert.equal(lastReply(""), null);
});
