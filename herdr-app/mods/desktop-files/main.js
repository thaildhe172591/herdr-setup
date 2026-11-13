// A lazy file browser for the focused pane's folder; a click opens the file in the viewer pane beside it.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, run, exec, watchFolder, theme, window, shared, setShared } from "herdr";
import { L, setLang } from "./i18n.js";
import { fileLook, folderLook, decorate, pathKey } from "./look.js";
import { LIST } from "./list.js";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // node first (~60 ms against PowerShell's 1-2 s start); PowerShell only where node can't start.
    const listed = await exec("node", ["-e", LIST, path], { on }).catch(() => null);
    if (listed?.code === 0) return JSON.parse(listed.stdout || "[]");
    if (listed) throw new Error(listed.stderr.trim() || L("Không thể liệt kê thư mục này", "Cannot list this folder"));
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || L("Không thể liệt kê thư mục này", "Cannot list this folder"));
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || L("Không thể liệt kê thư mục này", "Cannot list this folder"));
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {}; this.dirty = {};
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    // Closed folders keep their entries as a cache; only shown ones count against the total.
    const used = [...this.entries.entries()].filter(([p]) => p !== path && (p === "" || this.folders.has(p))).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, this.folders);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(this.saved.get(next));
      this.pending = new Set(); this.marks = {}; this.dirty = {}; this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        let found = { marks: {}, dirty: {} };
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          // git prints D:/… and the pane D:\…: decorate compares them as Windows does.
          if (status?.code === 0) found = decorate(status.stdout.split("\0").filter(Boolean).slice(0, TOTAL).map((e) => [e.slice(0, 2), e.slice(3)]), top.stdout.trim(), cwd);
        }
        if (!this.current(context)) return;
        this.marks = found.marks; this.dirty = found.dirty; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) this.folders.delete(folder);
    } else {
      this.folders.add(path);
      // A folder opened before shows its cached entries at once and is listed again behind them.
      if (!this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  // The file goes to this tab's viewer pane (mods/desktop-viewer), split to the right of the tree when there is none yet.
  open(path) {
    const tab = focused()?.tab, here = panes().filter(p => p.tab === tab), me = here.find(p => p.mod === "desktop-files");
    setShared(`files.open.${tab}`, { root: this.root, on: this.on, path, at: Date.now() });
    if (!here.some(p => p.mod === "desktop-viewer")) run("pane.split", { direction: "right", ...(me ? { pane: me.pane } : {}), mod: "desktop-viewer", props: { tab } });
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), rel = pathKey(path);
      const git = entry.dir ? null : this.marks[rel], dirty = entry.dir ? this.dirty[rel] : null;
      const look = entry.dir ? folderLook(entry.name, open) : fileLook(entry.name), tint = git?.tone ?? dirty;
      out.push(h_flex().id(`file-${path}`).h(22).flex_none().pl(4).pr(8).items_center().rounded(4).cursor_pointer()
        .when(path === this.selected, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.open(path))
        // One indent guide per level, under its parent's chevron (VS Code's tree lines).
        .children(Array.from({ length: depth }, () => div().w(16).h_full().flex_none().child(div().ml(7).w(1).h_full().bg(t.border))))
        .child(h_flex().w(16).flex_none().justify_center().when(entry.dir, el => el.child(svg(`mods/desktop-files/chevron-${open ? "down" : "right"}.svg`).size(12).text_color(t.dim))))
        .child(h_flex().w(22).flex_none().child(svg(look.icon).size(16).text_color(t[look.tone] ?? t.muted)))
        .child(div().flex_1().min_w(0).truncate().text_color((tint && t[tint]) || t.foreground).child(entry.name))
        .when(Boolean(git), el => el.child(div().flex_none().w(14).text_right().text_size(11).font_semibold().text_color(t[git.tone] ?? t.blocked).child(git.mark)))
        .when(Boolean(dirty), el => el.child(div().flex_none().w(14).text_right().text_size(9).text_color(t[dirty] ?? t.blocked).child("●"))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    setLang(shared("lang"));
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme(), open = shared(`files.open.${focused()?.tab}`);
    this.selected = open && open.root === this.root ? open.path : null; // the viewer's file, highlighted as VS Code does
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child(L("Tệp", "Files")))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.root?.split(/[\\/]/).pop() ?? "")))
      .child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? L("Đang tải tệp…", "Loading files…") : this.root ? L("Không có tệp", "No files") : L("Chưa có thư mục", "No folder")))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child(L("Danh sách tệp giới hạn 500 mục mỗi thư mục và 5.000 mục tổng cộng", "File list limited to 500 entries per folder and 5,000 total")))));
  }
}
