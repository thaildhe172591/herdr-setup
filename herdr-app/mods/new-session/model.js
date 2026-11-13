// Pure logic for the New session dialog: no herdr/gpui imports, tested with node --test.
import { L } from "./i18n.js";

export const fold = (s) =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

// For comparing folders only: forward slashes, trailing slash and case don't matter.
export const normPath = (p) => String(p ?? "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

const leaf = (p) => String(p).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

// Folders to offer: up to 8 recent ones, then saved projects, then scanned projects; each
// folder once (first spelling wins). Filter words match name or path, accents optional.
export function folderChoices({ recent = [], saved = [], cache = [] }, filter) {
  const out = [];
  const seen = new Set();
  const add = (section, path, label) => {
    const k = normPath(path);
    if (!path || seen.has(k)) return;
    seen.add(k);
    out.push({ section, path, label: label || leaf(path) });
  };
  recent.filter((r) => r?.folder).slice(0, 8).forEach((r) => add(L("Gần đây", "Recent"), r.folder, r.name));
  saved.forEach((s) => add(L("Dự án", "Projects"), s.path, s.name));
  cache.forEach((c) => add(L("Dự án", "Projects"), c.path, c.name));
  const words = fold(filter).split(/\s+/).filter(Boolean);
  return out.filter((c) => { const hay = fold(`${c.label} ${c.path}`); return words.every((w) => hay.includes(w)); });
}

// ponytail: same list as list.ps1 and desktop-sidebar (mods can't share files).
// Project folders come from ~/.config/herdr-app/projects.json (install.ps1 asks for them); none by default.
export const DEFAULT_ROOTS = [];

// projects.json with `entry` saved: replaces the entry for the same folder, keeps everything else.
// A missing config starts from the default roots.
export function addSaved(config, entry) {
  config = config ?? { roots: DEFAULT_ROOTS, saved: [] };
  const saved = (config?.saved ?? []).filter((s) => normPath(s.path) !== normPath(entry.path));
  const old = (config?.saved ?? []).find((s) => normPath(s.path) === normPath(entry.path)) ?? {};
  return { ...config, saved: [...saved, { ...old, ...entry }] };
}

// A new session's tab name: the task's first four words (≤ 28 chars), else the agent's name.
export function tabName(task, agentName) {
  const words = String(task ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  return (words || agentName || "agent").slice(0, 28).trim();
}
