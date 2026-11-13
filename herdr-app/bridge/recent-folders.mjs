// Prints the folders the person worked in with Claude, newest first (JSON [{path, at}]), for the
// "Gần đây" group of "Mở dự án":  node recent-folders.mjs [max]
// Reads only the head of each folder's newest session file.
import { readdirSync, statSync, openSync, readSync, closeSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { firstCwd, recentFolders } from "../mods/projects/recent.js";

const root = join(homedir(), ".claude", "projects");
const max = Number(process.argv[2]) || 40;
const found = [];
try {
  for (const dir of readdirSync(root)) {
    const full = join(root, dir);
    let newest = null;
    try {
      for (const f of readdirSync(full)) {
        if (!f.endsWith(".jsonl")) continue;
        const at = statSync(join(full, f)).mtimeMs;
        if (!newest || at > newest.at) newest = { file: join(full, f), at };
      }
    } catch { continue; }
    if (!newest) continue;
    const fd = openSync(newest.file, "r");
    const buf = Buffer.alloc(65536);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    const path = firstCwd(buf.toString("utf8", 0, n));
    // Claude Desktop's scratch workspaces and temp folders aren't projects.
    if (path && !/\\AppData\\|\\Temp\\/i.test(path)) found.push({ path, at: newest.at });
  }
} catch {}
process.stdout.write(JSON.stringify(recentFolders(found, (p) => existsSync(p)).slice(0, max)));
