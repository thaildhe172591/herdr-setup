// Copy of desktop-spaces/view.js projectOf/projects: a mod cannot import across mod folders.
// Keep the two in step (tests/spaces-view.test.mjs covers the original).

const lower = (p) => String(p ?? "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

// The project a folder belongs to: the deepest root holding it, else null.
export function projectOf(folder, roots) {
  const f = lower(folder);
  return [...(roots ?? [])].filter((r) => f === lower(r) || f.startsWith(lower(r) + "\\"))
    .sort((a, b) => lower(b).length - lower(a).length)[0] ?? null;
}

// Each root alone, or the roots projects.json "groups" put together, in roots order.
export function projects(roots, groups = {}) {
  const out = [];
  for (const r of roots ?? []) {
    const name = Object.keys(groups ?? {}).find((n) => (groups[n] ?? []).some((x) => lower(x) === lower(r)));
    if (name) { if (!out.some((p) => p.key === name)) out.push({ key: name, label: name, roots: groups[name] }); }
    else out.push({ key: r, label: String(r).split(/[\\/]/).filter(Boolean).pop(), roots: [r] });
  }
  return out;
}
