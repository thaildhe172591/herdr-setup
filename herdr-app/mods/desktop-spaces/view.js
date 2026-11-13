// Pure: how the Spaces sidebar groups, sorts and filters its rows (Claude Desktop's "Group by /
// Sort by / Show"). No herdr/gpui imports; node --test.

const lower = (p) => String(p ?? "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

// The project a folder belongs to: the deepest root (projects.json "roots") holding it, else null.
export function projectOf(folder, roots) {
  const f = lower(folder);
  return [...(roots ?? [])].filter((r) => f === lower(r) || f.startsWith(lower(r) + "\\"))
    .sort((a, b) => lower(b).length - lower(a).length)[0] ?? null;
}

// A row with `tree` (a worktree hanging under the space above it) stays with that space.
export function clusters(rows) {
  const out = [];
  for (const r of rows ?? []) { if (r.tree && out.length) out[out.length - 1].push(r); else out.push([r]); }
  return out;
}

import { L } from "./i18n.js";

const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
const rank = (c) => RANK[c[0].w.status] ?? 4;
const BUCKETS = [
  { key: "need", get label() { return L("Cần bạn", "Needs you"); }, has: (s) => s === "blocked" || s === "done" },
  { key: "working", get label() { return L("Đang làm", "Working"); }, has: (s) => s === "working" },
  { key: "idle", get label() { return L("Rảnh", "Idle"); }, has: (s) => s === "idle" },
  { key: "none", get label() { return L("Chưa có agent", "No agent yet"); }, has: () => true },
];

// The projects to show: each root alone, or the roots projects.json "groups" put together
// ({"Acme": ["D:\\Acme", "D:\\Acme.Core"]}), in roots order. → [{key, label, roots}]
export function projects(roots, groups = {}) {
  const out = [];
  for (const r of roots ?? []) {
    const name = Object.keys(groups ?? {}).find((n) => (groups[n] ?? []).some((x) => lower(x) === lower(r)));
    if (name) { if (!out.some((p) => p.key === name)) out.push({ key: name, label: name, roots: groups[name] }); }
    else out.push({ key: r, label: String(r).split(/[\\/]/).filter(Boolean).pop(), roots: [r] });
  }
  return out;
}

// view: {group: "project"|"status"|"none", sort: "manual"|"name"|"status", show: "all"|"agents", roots, groups}
// → [{key, label, roots?, rows}] in display order (empty groups left out).
export function arrange(rows, { group = "project", sort = "manual", show = "all", roots = [], groups = {} } = {}) {
  let cs = clusters(rows);
  if (show === "agents") cs = cs.filter((c) => c[0].w.status != null);
  if (sort === "name") cs = [...cs].sort((a, b) => String(a[0].w.name).localeCompare(String(b[0].w.name)));
  else if (sort === "status") cs = [...cs].sort((a, b) => rank(a) - rank(b));
  const flat = (list) => list.flat();
  if (group === "status") {
    const left = new Set(cs);
    return BUCKETS.map((b) => {
      const mine = cs.filter((c) => left.has(c) && b.has(c[0].w.status));
      mine.forEach((c) => left.delete(c));
      return { key: b.key, label: b.label, rows: flat(mine) };
    }).filter((g) => g.rows.length);
  }
  if (group === "project") {
    const all = [...new Set([...(roots ?? []), ...Object.values(groups ?? {}).flat()])];
    const ps = projects(all, groups);
    const of = (c) => { const r = projectOf(c[0].w.folder, all); return r ? ps.find((p) => p.roots.some((x) => lower(x) === lower(r))) : null; };
    const out = ps.map((p) => ({ ...p, rows: flat(cs.filter((c) => of(c) === p)) }));
    out.push({ key: "other", label: L("Khác", "Other"), rows: flat(cs.filter((c) => !of(c))) });
    return out.filter((g) => g.rows.length);
  }
  return [{ key: "all", label: null, rows: flat(cs) }];
}
