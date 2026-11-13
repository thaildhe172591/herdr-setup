// Claude Code status line → Herdr. Set in ~/.claude/settings.json as
//   "statusLine": { "type": "command", "command": "node {{HOME_JSON}}\\.config\\herdr-app\\bridge\\statusline.mjs" }
// Inside a Herdr terminal (HC_TERMINAL_ID set) it keeps the JSON Claude sends in
// %LOCALAPPDATA%\herdr-claude\<terminal>.json for the desktop rail and prints a short line.
// Outside Herdr it prints nothing, so Claude elsewhere looks exactly as before. Never fails Claude.

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { summarize, statusText } from "../mods/composer/model.js";

const id = process.env.HC_TERMINAL_ID;
if (!id) process.exit(0);
let input = null;
try { input = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
try {
  const dir = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local"), "herdr-claude");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id.replace(/[^\w.-]/g, "_")}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify({ at: Date.now(), input }));
  renameSync(`${file}.tmp`, file); // the rail never reads a half-written file
} catch { /* the line still prints */ }
process.stdout.write(statusText(summarize(input)));
