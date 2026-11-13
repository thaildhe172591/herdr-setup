// Pure: what a Claude Code session has loaded and done, read from its transcript (JSONL text).
// Used by bridge/session-info.mjs (a separate node process, so a big transcript never blocks the
// window) and by node --test. No herdr/gpui imports.

// ponytail: tokens ≈ chars / 4, like a rough /context; exact counts need Claude's own /context.
const est = (s) => Math.round(String(s ?? "").length / 4);
const WRITES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// Lines worth parsing; the rest (message text, snapshots) are skipped without JSON.parse.
const MARKS = ['"type":"attachment"', '"api-request-shape"', '"tool_use"', '"permission-mode"'];

// "mcp__plugin_context7_context7__query-docs" → "plugin_context7_context7"
const serverOf = (tool) => (/^mcp__(.+?)__/.exec(tool) ?? [])[1] ?? null;
// MCP server names are normalized into tool names this way.
const norm = (name) => String(name).replace(/[^A-Za-z0-9_-]/g, "_");
// "plugin:context7:context7" → "context7"; plain names stay.
const pretty = (name) => (String(name).startsWith("plugin:") ? String(name).split(":").pop() : String(name));
// A tool-name key "plugin_playwright_playwright" → server "playwright", plugin "playwright".
const keyServer = (k) => (k.startsWith("plugin_") ? k.slice(k.lastIndexOf("_") + 1) : k);
const keyPlugin = (k) => (k.startsWith("plugin_") && k.lastIndexOf("_") > 7 ? k.slice(7, k.lastIndexOf("_")) : null);

export function sessionInfo(text) {
  let shape = null, mode = null, memory = [];
  let skills = { names: [], content: "" };
  const deferred = new Set(), mcpInstr = new Map(), agentList = new Map(), failed = new Map(), pending = new Set();
  const outputs = new Map(), used = new Set();
  for (const line of String(text ?? "").split("\n")) {
    if (!MARKS.some((m) => line.includes(m))) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type === "permission-mode") mode = o.permissionMode ?? mode;
    else if (o.type === "api-request-shape") shape = o.shape ?? shape;
    else if (o.type === "attachment") {
      const a = o.attachment ?? {};
      if (a.type === "deferred_tools_delta") {
        for (const n of [...(a.addedNames ?? []), ...(a.readdedNames ?? [])]) deferred.add(n);
        for (const n of a.removedNames ?? []) deferred.delete(n);
        for (const f of a.failedMcpServers ?? []) failed.set(f.name ?? String(f), f.error ?? f.errorCode ?? "");
        for (const p of a.pendingMcpServers ?? []) pending.add(p.name ?? String(p));
      } else if (a.type === "mcp_instructions_delta") {
        (a.addedNames ?? []).forEach((n, i) => mcpInstr.set(n, a.addedBlocks?.[i] ?? ""));
        for (const n of a.removedNames ?? []) mcpInstr.delete(n);
      } else if (a.type === "agent_listing_delta") {
        (a.addedTypes ?? []).forEach((n, i) => agentList.set(n, a.addedLines?.[i] ?? n));
        for (const n of a.removedTypes ?? []) agentList.delete(n);
      } else if (a.type === "skill_listing") {
        skills = a.isInitial === false
          ? { names: [...new Set([...skills.names, ...(a.names ?? [])])], content: skills.content + (a.content ?? "") }
          : { names: a.names ?? [], content: a.content ?? "" };
      } else if (a.type === "instructions") {
        memory = (a.files ?? []).map((f) => ({ path: f.path, type: f.type ?? null, tokens: est(f.content) }));
      }
    } else if (o.type === "assistant") {
      for (const c of o.message?.content ?? []) {
        if (c?.type !== "tool_use") continue;
        const path = c.input?.file_path ?? c.input?.notebook_path;
        if (WRITES.has(c.name) && path) { outputs.delete(path); outputs.set(path, { path, action: c.name === "Write" ? "write" : "edit", at: o.timestamp ?? null }); }
        else if (c.name === "Skill" && c.input?.skill) used.add(c.input.skill);
      }
    }
  }

  const tools = shape?.tools ?? [];
  const isMcp = (n) => String(n).startsWith("mcp__");
  const fixed = [
    { key: "system_tools", label: "System tools", tokens: est(JSON.stringify(tools.filter((t) => !isMcp(t.name)))) },
    { key: "mcp_tools", label: "MCP tools", tokens: tools.some((t) => isMcp(t.name)) ? est(JSON.stringify(tools.filter((t) => isMcp(t.name)))) : 0 },
    { key: "system_prompt", label: "System prompt", tokens: est((shape?.system ?? []).map((b) => b.text ?? "").join("")) },
    { key: "skills", label: "Skills", tokens: est(skills.content) },
    { key: "memory", label: "Memory files", tokens: memory.reduce((n, f) => n + f.tokens, 0) },
    { key: "mcp_instructions", label: "MCP server instructions", tokens: est([...mcpInstr.values()].join("")) },
    { key: "agents", label: "Custom agents", tokens: est([...agentList.values()].join("\n")) },
  ];

  // Connectors: every MCP server the session knows, with its tools; failed / pending ones too.
  const servers = new Map();
  const touch = (key, name) => { if (!servers.has(key)) servers.set(key, { name: pretty(name), tools: 0, status: "ok", error: null }); return servers.get(key); };
  for (const n of [...deferred, ...tools.map((t) => t.name)]) { const k = serverOf(n); if (k) touch(k, keyServer(k)).tools++; }
  for (const n of mcpInstr.keys()) touch(norm(n), n).name = pretty(n);
  for (const [n, err] of failed) Object.assign(touch(norm(n), n), { name: pretty(n), status: "failed", error: err });
  for (const n of pending) Object.assign(touch(norm(n), n), { name: pretty(n), status: "pending" });
  const connectors = [...servers.values()].sort((a, b) => (a.status === "failed") - (b.status === "failed") || b.tools - a.tools || a.name.localeCompare(b.name));

  // Plugins: the "<plugin>:" prefix of skills and agents, "plugin:<plugin>:" of MCP servers.
  const plugins = new Map();
  const add = (name, kind) => { if (!plugins.has(name)) plugins.set(name, { name, skills: 0, agents: 0, mcp: 0 }); plugins.get(name)[kind]++; };
  for (const s of skills.names) if (s.includes(":")) add(s.split(":")[0], "skills");
  for (const a of agentList.keys()) if (a.includes(":")) add(a.split(":")[0], "agents");
  const mcpPlugins = new Set([...mcpInstr.keys(), ...failed.keys()].filter((n) => String(n).startsWith("plugin:")).map((n) => norm(n)));
  for (const k of servers.keys()) if (keyPlugin(k)) mcpPlugins.add(k);
  for (const k of mcpPlugins) add(keyPlugin(k), "mcp");

  return {
    mode,
    fixed,
    deferred: { mcp: [...deferred].filter(isMcp).length, system: [...deferred].filter((n) => !isMcp(n)).length },
    memory,
    agents: [...agentList.keys()],
    connectors,
    skills: { names: skills.names, used: [...used] },
    plugins: [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name)),
    outputs: [...outputs.values()].reverse().slice(0, 60),
  };
}

// Context rows like Claude Desktop's: Messages = what the live count leaves after the fixed parts.
export function contextRows(fixed, used, size) {
  const sum = (fixed ?? []).reduce((n, r) => n + (r.tokens ?? 0), 0);
  const rows = [{ key: "messages", label: "Messages", tokens: used == null ? null : Math.max(0, used - sum) }, ...(fixed ?? [])];
  return {
    rows: rows.map((r) => ({ ...r, pct: size && r.tokens != null ? (r.tokens / size) * 100 : null })),
    free: used != null && size ? Math.max(0, size - used) : null,
  };
}

// Claude's last answer: the text of the assistant entries after the last real prompt (tool results
// and thinking left out), or null.
export function lastReply(text) {
  const lines = String(text ?? "").split("\n");
  const parts = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.includes('"type":"assistant"') && !l.includes('"type":"user"')) continue;
    let o;
    try { o = JSON.parse(l); } catch { continue; }
    const c = o.message?.content;
    if (o.type === "user") {
      const toolResult = Array.isArray(c) && c.some((x) => x?.type === "tool_result");
      if (!toolResult && parts.length) break; // the prompt that started this answer
      if (!toolResult) continue;
      if (parts.length) break; // a tool call came between: the answer is what followed it
      continue;
    }
    const said = (Array.isArray(c) ? c : []).filter((x) => x?.type === "text" && x.text?.trim()).map((x) => x.text.trim());
    if (said.length) parts.unshift(said.join("\n\n"));
    else if (parts.length) break;
  }
  return parts.length ? parts.join("\n\n") : null;
}
