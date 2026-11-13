// Prints Claude's last answer from a transcript (for the composer's "insert an agent's answer"):
//   node last-reply.mjs <transcript.jsonl>
// Reads only the file's tail, so a big transcript costs little.
import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import { lastReply } from "../mods/desktop-rail/session.js";

try {
  const fd = openSync(process.argv[2], "r");
  const size = fstatSync(fd).size, n = Math.min(size, 8 * 1024 * 1024);
  const buf = Buffer.alloc(n);
  readSync(fd, buf, 0, n, size - n);
  closeSync(fd);
  const text = buf.toString("utf8");
  const reply = lastReply(size > n ? text.slice(text.indexOf("\n") + 1) : text);
  process.stdout.write(reply ?? "");
} catch (e) {
  process.stderr.write(String(e?.message ?? e));
  process.exit(1);
}
