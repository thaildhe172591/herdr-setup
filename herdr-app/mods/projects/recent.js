// Pure: the folders the person worked in with Claude (Claude Code and Claude Desktop keep their
// sessions in ~/.claude/projects/<folder>/<session>.jsonl). No herdr/gpui imports; node --test.

// The cwd a session ran in: the first "cwd" in the head of its transcript.
export function firstCwd(head) {
  const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(String(head ?? ""));
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

// Newest first, one entry per folder (case and trailing slash ignored), only folders that exist.
export function recentFolders(list, exists) {
  const key = (p) => String(p).replace(/[\\/]+$/, "").toLowerCase();
  const seen = new Set();
  return [...(list ?? [])].sort((a, b) => b.at - a.at).filter((x) => {
    const k = key(x.path);
    if (!x.path || seen.has(k) || !exists(x.path)) return false;
    seen.add(k);
    return true;
  });
}
