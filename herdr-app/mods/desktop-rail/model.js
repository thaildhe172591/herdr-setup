// Pure logic for the session rail (Environment + Git): no herdr/gpui imports, node --test.

// --- Git / pull requests (gh pr view --json …) ---

const FAILED = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
const PENDING = new Set(["PENDING", "EXPECTED"]);

// statusCheckRollup → "fail" | "pending" | "pass" | null (no checks).
export function checksState(rollup) {
  if (!rollup?.length) return null;
  if (rollup.some((c) => FAILED.has(c.conclusion) || FAILED.has(c.state))) return "fail";
  if (rollup.some((c) => (c.status && c.status !== "COMPLETED") || PENDING.has(c.state))) return "pending";
  return "pass";
}

const REVIEW = { APPROVED: "approved", CHANGES_REQUESTED: "changes", REVIEW_REQUIRED: "review" };

export function parsePr(j) {
  if (!j?.number) return null;
  const state = j.state === "MERGED" ? "merged" : j.state === "CLOSED" ? "closed" : j.isDraft ? "draft" : "open";
  return { number: j.number, title: j.title ?? "", url: j.url ?? "", state, checks: checksState(j.statusCheckRollup), review: REVIEW[j.reviewDecision] ?? null };
}

// PR state colour (theme key), as GitHub and Claude Desktop draw it: open green, draft grey,
// merged purple, closed red. Checks and review carry their own colours (below).
const STATE_TONE = { open: "ansi2", draft: "dim", merged: "ansi5", closed: "ansi1" };
export const prTone = (pr) => STATE_TONE[pr?.state] ?? "dim";
export const checksTone = (c) => ({ pass: "ansi2", pending: "ansi3", fail: "ansi1" })[c] ?? null;
export const reviewTone = (r) => ({ approved: "ansi2", review: "ansi3", changes: "ansi1" })[r] ?? null;

// `git rev-list --left-right --count @{u}...HEAD` → behind (upstream only) / ahead (HEAD only).
export function parseAheadBehind(out) {
  const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(String(out ?? ""));
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : null;
}

// `git status --porcelain` (core.quotepath=false) → [{code, path}]; a rename keeps the new path,
// "??" (untracked) is "?".
export function parseStatus(out) {
  return String(out ?? "").split(/\r?\n/).filter((l) => l.length > 3).map((l) => {
    const xy = l.slice(0, 2), rest = l.slice(3);
    const code = xy === "??" ? "?" : (xy.trim()[0] ?? "M");
    return { code, path: rest.includes(" -> ") ? rest.split(" -> ").pop() : rest };
  });
}

// `git diff --numstat HEAD` → { path: {add, del} } (binary files: null counts).
export function parseNumstat(out) {
  const map = {};
  for (const l of String(out ?? "").split(/\r?\n/)) {
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(l);
    if (m) map[m[3]] = { add: m[1] === "-" ? null : Number(m[1]), del: m[2] === "-" ? null : Number(m[2]) };
  }
  return map;
}

// One `git status --porcelain=v2 --branch` (core.quotepath=false) instead of three git runs:
// → { branch ("" when detached), ahead, behind (null without upstream), files: [{code, path}] }.
export function parseStatusV2(out) {
  const res = { branch: "", ahead: null, behind: null, files: [] };
  const after = (l, n) => { let i = 0; for (let k = 0; k < n; k++) i = l.indexOf(" ", i) + 1; return l.slice(i); };
  const code = (xy) => (xy.replace(/\./g, "")[0] ?? "M");
  for (const l of String(out ?? "").split(/\r?\n/)) {
    if (l.startsWith("# branch.head ")) { const h = l.slice(14); res.branch = h === "(detached)" ? "" : h; }
    else if (l.startsWith("# branch.ab ")) { const m = /\+(\d+) -(\d+)/.exec(l); if (m) { res.ahead = Number(m[1]); res.behind = Number(m[2]); } }
    else if (l.startsWith("1 ")) res.files.push({ code: code(l.slice(2, 4)), path: after(l, 8) });
    else if (l.startsWith("2 ")) res.files.push({ code: code(l.slice(2, 4)), path: after(l, 9).split("\t")[0] });
    else if (l.startsWith("u ")) res.files.push({ code: "U", path: after(l, 10) });
    else if (l.startsWith("? ")) res.files.push({ code: "?", path: l.slice(2) });
  }
  return res;
}
