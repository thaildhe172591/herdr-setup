// Prints what a Claude Code session loaded and did (JSON), for the desktop rail:
//   node session-info.mjs <transcript.jsonl>
// A separate process so a big transcript is parsed off the window's thread.
import { readFileSync } from "node:fs";
import { sessionInfo } from "../mods/desktop-rail/session.js";

try {
  process.stdout.write(JSON.stringify(sessionInfo(readFileSync(process.argv[2], "utf8"))));
} catch (e) {
  process.stderr.write(String(e?.message ?? e));
  process.exit(1);
}
