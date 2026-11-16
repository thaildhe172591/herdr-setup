// Agent hooks → Herdr: which Codex / Antigravity conversation each Herdr terminal holds, so the composer
// resumes it after a reboot (Claude's comes from its status line, statusline.mjs). Registered as:
//   Antigravity  ~/.gemini/config/hooks.json  "herdr-app": { "PreInvocation": [{ "type": "command", "command": "node <app>/bridge/agent-session.mjs agy", "timeout": 10 }] }
//   Codex        ~/.codex/hooks.json          hooks.SessionStart[].hooks += { "type": "command", "command": "node <app>/bridge/agent-session.mjs codex", "timeout": 10 }
// Inside a Herdr terminal (HC_TERMINAL_ID set) it keeps %LOCALAPPDATA%\herdr-agents\<terminal>.json =
// { at, kind, session, cwd }. Elsewhere it does nothing. Prints nothing (a SessionStart hook's output
// would reach the model) and never fails the agent.

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { sessionRecord } from "../mods/composer/model.js";

const id = process.env.HC_TERMINAL_ID;
if (!id) process.exit(0);
try {
  const rec = sessionRecord(process.argv[2], JSON.parse(readFileSync(0, "utf8") || "{}"), process.cwd(), Date.now());
  if (rec) {
    const dir = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local"), "herdr-agents");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${id.replace(/[^\w.-]/g, "_")}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(rec));
    renameSync(`${file}.tmp`, file); // the composer never reads a half-written file
  }
} catch { /* the agent goes on either way */ }
