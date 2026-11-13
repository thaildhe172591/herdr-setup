// How the Files panel draws a row, VS Code style: an icon and a theme tone per file or folder, and
// git decorations (a letter on the file, a dot and a tint on the folders above it).
// Herdr draws every SVG in one color (the text color), so a type is told apart by icon and tone.
// Tones are theme tokens: ansi1 red, ansi2 green, ansi3 yellow, ansi4 blue, ansi5 magenta, ansi6 cyan.

const logo = (name) => `icons/${name}.svg`;
const FILE = "mods/desktop-files/file.svg";

// By whole name first (the first match wins), then by extension.
const NAMES = [
  [/^(dockerfile.*|\.dockerignore|(docker-)?compose.*\.ya?ml)$/, logo("docker"), "ansi6"],
  [/^package\.json$/, logo("npm"), "ansi1"],
  [/^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|.*\.lock)$/, FILE, "dim"],
  [/^\.git(ignore|attributes|modules|keep)$/, logo("git"), "ansi1"],
  [/^(global\.json|dotnet-tools\.json|nuget\.config|directory\.(build|packages)\.(props|targets))$/, logo("dotnet"), "ansi5"],
  [/^tsconfig.*\.json$/, logo("tsc"), "ansi4"],
  [/^vite\.config\./, logo("vite"), "ansi5"],
  [/^vitest\.config\./, logo("vitest"), "ansi2"],
  [/^(eslint\.config\.|\.eslintrc)/, logo("eslint"), "ansi4"],
  [/^(\.prettierrc|prettier\.config\.)/, logo("prettier"), "ansi3"],
  [/^\.env(\..*)?$/, FILE, "ansi3"],
  [/^license(\.(md|txt))?$/, FILE, "ansi3"],
];
const EXTENSIONS = [
  ["cs csx csproj sln slnx props targets razor cshtml fs fsproj vb vbproj", logo("dotnet"), "ansi5"],
  ["ts tsx mts cts", logo("tsc"), "ansi4"],
  ["js mjs cjs jsx", logo("node"), "ansi3"],
  ["py", logo("python"), "ansi4"],
  ["sh bash zsh ps1 psm1 psd1 cmd bat", logo("shell"), "ansi2"],
  ["sql", logo("mysql"), "ansi6"],
  ["json jsonc json5", FILE, "ansi3"],
  ["md mdx", FILE, "ansi4"],
  ["yml yaml toml", FILE, "ansi5"],
  ["xml config runsettings resx xaml html htm", FILE, "ansi1"],
  ["css scss sass less", FILE, "ansi4"],
  ["png jpg jpeg gif svg webp ico bmp", FILE, "ansi6"],
  ["pdf", FILE, "ansi1"],
  ["zip gz tar 7z rar", FILE, "ansi3"],
].flatMap(([exts, icon, tone]) => exts.split(" ").map((e) => [e, { icon, tone }]));
const BY_EXTENSION = new Map(EXTENSIONS);

export function fileLook(name) {
  const n = String(name).toLowerCase();
  const hit = NAMES.find(([re]) => re.test(n));
  if (hit) return { icon: hit[1], tone: hit[2] };
  const ext = n.includes(".") ? n.split(".").pop() : "";
  return BY_EXTENSION.get(ext) ?? { icon: FILE, tone: "muted" };
}

const FOLDERS = [
  [/^src$/, "ansi2"],
  [/^(tests?|__tests__|spec)$/, "ansi6"],
  [/^(tools|scripts)$/, "ansi3"],
  [/^(docs?|\.github|\.gitlab|\.vscode)$/, "ansi4"],
  [/^(\.claude|\.agents|_bmad.*)$/, "ansi5"],
  [/^(node_modules|bin|obj|dist|build|out|\.vs)$/, "dim"],
];

export function folderLook(name, open) {
  const n = String(name).toLowerCase();
  return { icon: `mods/desktop-files/${open ? "folder-open" : "folder"}.svg`, tone: FOLDERS.find(([re]) => re.test(n))?.[1] ?? "muted" };
}

// git status --porcelain XY → the letter VS Code shows and its tone.
export function gitLook(xy) {
  if (xy === "??") return { mark: "U", tone: "ansi2" };
  if (xy.includes("U") || xy === "AA" || xy === "DD") return { mark: "!", tone: "ansi1" };
  if (xy.includes("D")) return { mark: "D", tone: "ansi1" };
  if (xy.includes("A")) return { mark: "A", tone: "ansi2" };
  return { mark: "M", tone: "blocked" };
}

// Paths compared the way Windows does: slashes either way, any case.
export const pathKey = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

// Git entries ([XY, path from the repo top]) → decorations keyed by path relative to the shown root:
// marks for files, dirty for every folder above a change (its strongest tone: red > amber > green).
const RANK = { ansi1: 3, blocked: 2, ansi2: 1 };
export function decorate(entries, top, root) {
  const marks = {}, dirty = {}, base = pathKey(root) + "/";
  for (const [xy, file] of entries) {
    const full = pathKey(`${top}/${file}`);
    if (!full.startsWith(base)) continue;
    const rel = full.slice(base.length), look = gitLook(xy);
    marks[rel] = look;
    for (let i = rel.lastIndexOf("/"); i > 0; i = rel.lastIndexOf("/", i - 1)) {
      const folder = rel.slice(0, i);
      if ((RANK[look.tone] ?? 0) > (RANK[dirty[folder]] ?? 0)) dirty[folder] = look.tone;
    }
  }
  return { marks, dirty };
}
