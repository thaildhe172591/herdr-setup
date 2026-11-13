// Diff tab of the "desktop" layout: the shown space's uncommitted changes with room to read them.
// Left: changed files (status, folder, +/-), ↑/↓ to move. Right: the selected file's diff, unified
// or side by side, with line numbers, in the terminal font. Opened as a tab whose only pane is
// this mod (tab bar "Diff", the rail's file list); shared "diff.select" = {path} picks a file.
// Reads write nothing under .git (no index refresh or lock); a folder watch refreshes it.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, exec, home, readTextFile, watchFolder, theme, settings, shared } from "herdr";
import { unifiedRows, splitRows, parseStatusZ, parseNumstatZ } from "./model.js";
import { L, setLang } from "./i18n.js";

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "core.quotepath=false"];
const ICON = (n) => `mods/workspace-chrome/${n}.svg`;
const TONE = { A: "ansi2", D: "ansi1", U: "ansi1", M: "ansi3" };
const MAX_LINES = 20000;

// The shown space's folder: where its first terminal is now, else where it was made.
function place() {
  const s = spaces().find((x) => x.active);
  if (!s || s.machine) return null;
  const tabs = new Set((s.tabs ?? []).map((t) => t.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

export default class Diff extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.files = []; this.rows = []; this.split = []; this.width = 600;
    this.mode = (() => { try { return localStorage.getItem("diff.mode") ?? "unified"; } catch { return "unified"; } })();
    this.handle = cx.focus_handle();
    this.refresh(cx);
    cx.timer.every(15000, (cx) => this.refresh(cx)); // fallback; the folder watch is what refreshes
  }

  watch(root, cx) {
    if (this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try { while (this.watched === root) { await watchFolder(root); if (this.watched === root) this.refresh(cx); } } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading) return;
    const cwd = place();
    if (cwd !== this.cwd) { this.cwd = cwd; this.root = null; this.files = []; this.open = null; this.rows = []; this.split = []; this.error = null; this.watched = null; }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd });
        if (top.code !== 0) { this.root = null; this.files = []; this.error = L("Thư mục này không phải repo git", "This folder is not a git repo"); return; }
        const root = top.stdout.trim().replace(/\//g, "\\");
        const git = (args) => exec("git", [...READ, ...args], { cwd: root });
        const [st, head] = await Promise.all([git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]), git(["rev-parse", "--verify", "HEAD"])]);
        if (st.code !== 0) throw new Error(st.stderr);
        const ns = head.code === 0 ? await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"]) : { code: 0, stdout: "" };
        const stats = parseNumstatZ(ns.stdout);
        const sig = st.stdout + ns.stdout; // nothing changed: keep the shown diff as it is
        this.root = root; this.hasHead = head.code === 0; this.error = null;
        this.files = parseStatusZ(st.stdout).slice(0, 2000).map((f) => ({ ...f, ...(stats[f.path] ?? { add: 0, del: 0 }) }));
        this.watch(root, cx);
        const want = shared("diff.select")?.path;
        if (want && want !== this.applied && this.files.some((f) => f.path === want.replace(/\\/g, "/"))) { this.applied = want; this.open = want.replace(/\\/g, "/"); this.sig = null; }
        if (this.open && !this.files.some((f) => f.path === this.open)) this.open = null;
        if (!this.open && this.files.length) this.open = this.files[0].path;
        if (this.open && sig !== this.sig) { this.sig = sig; await this.load(this.open); }
      } catch (e) { this.error = String(e?.message ?? e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path) {
    const file = this.files.find((f) => f.path === path);
    if (!file || !this.root) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${this.root}\\${path.replace(/\//g, "\\")}`).catch(() => null);
      if (text === null) lines = [L("@@ không đọc được file (nhị phân, quá lớn hoặc bị khoá) @@", "@@ can't read the file (binary, too large or locked) @@")];
      else if (text.includes("\0")) lines = [L("@@ file nhị phân, không có diff dạng chữ @@", "@@ binary file, no text diff @@")];
      else { const body = text.replace(/\n$/, "").split("\n"); lines = [`@@ -0,0 +1,${body.length} @@ ${L("file mới", "new file")}`, ...body.slice(0, MAX_LINES).map((l) => `+${l}`)]; }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: this.root });
      const all = r.code === 0 ? r.stdout.replace(/\n$/, "").split("\n") : [];
      const first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? L("@@ file nhị phân đã đổi @@", "@@ binary file changed @@") : L("@@ không có diff dạng chữ @@", "@@ no text diff @@")] : all.slice(first, first + MAX_LINES);
    }
    if (this.open !== path) return;
    lines = lines.map((l) => (l.length > 3000 ? l.slice(0, 3000) + L(" … (dòng bị cắt)", " … (line truncated)") : l));
    this.rows = unifiedRows(lines);
    this.split = splitRows(this.rows);
    this.width = Math.max(600, ...lines.slice(0, 5000).map((l) => l.length * 7.4 + 110));
  }

  pick(path, cx) {
    if (this.open === path) return;
    this.open = path; this.rows = []; this.split = []; this.sig = null;
    cx.spawn(async (cx) => { await this.load(path).catch(() => {}); cx.notify(); });
    cx.notify();
  }

  move(step, cx) {
    if (!this.files.length) return;
    const i = Math.max(0, this.files.findIndex((f) => f.path === this.open));
    this.pick(this.files[Math.min(this.files.length - 1, Math.max(0, i + step))].path, cx);
  }

  setMode(mode, cx) { this.mode = mode; try { localStorage.setItem("diff.mode", mode); } catch {} cx.notify(); }

  // ---- rows ----
  num(t, n) { return div().w(44).flex_none().pr(8).text_right().text_color(t.dim).child(n == null ? "" : String(n)); }
  unifiedRow(r, t) {
    if (r.kind === "@") return div().w_full().h(22).px(12).flex().items_center().bg(t.accent + "14").text_color(t.accent).child(r.text);
    if (r.kind === "\\") return div().w_full().h(22).px(12).flex().items_center().text_color(t.dim).child(r.text);
    const tone = r.kind === "+" ? t.ansi2 : r.kind === "-" ? t.ansi1 : null;
    return h_flex().w_full().h(22).items_center().when(!!tone, (e) => e.bg(tone + "1a"))
      .child(this.num(t, r.old)).child(this.num(t, r.new))
      .child(div().w(16).flex_none().text_color(tone ?? t.dim).child(r.kind === " " ? "" : r.kind))
      .child(div().flex_1().whitespace_nowrap().child(r.text || " "));
  }
  side(t, s) {
    const tone = s?.kind === "+" ? t.ansi2 : s?.kind === "-" ? t.ansi1 : null;
    return h_flex().flex_1().min_w(0).h_full().items_center().overflow_hidden()
      .when(!s, (e) => e.bg(t.raised + "66")).when(!!tone, (e) => e.bg(tone + "1a"))
      .child(this.num(t, s?.n)).child(div().w(14).flex_none().text_color(tone ?? t.dim).child(s && s.kind !== " " ? s.kind : ""))
      .child(div().flex_1().min_w(0).whitespace_nowrap().overflow_hidden().child(s ? s.text || " " : ""));
  }
  splitRow(r, t) {
    if (r.hunk) return div().w_full().h(22).px(12).flex().items_center().bg(t.accent + "14").text_color(t.accent).child(r.hunk);
    return h_flex().w_full().h(22).child(this.side(t, r.left)).child(div().w(1).h_full().bg(t.border)).child(this.side(t, r.right));
  }

  render(cx) {
    setLang(shared("lang"));
    if (place() !== this.cwd) this.refresh(cx);
    const want = shared("diff.select")?.path;
    if (want && want !== this.applied && this.files.length) { this.applied = want; const p = want.replace(/\\/g, "/"); if (this.files.some((f) => f.path === p)) this.pick(p, cx); }
    const t = theme();
    const add = this.files.reduce((n, f) => n + (f.add ?? 0), 0), del = this.files.reduce((n, f) => n + (f.del ?? 0), 0);
    const file = this.files.find((f) => f.path === this.open);
    const split = this.mode === "split";
    const rows = split ? this.split : this.rows;
    const seg = (id, label) => h_flex().id(`dm-${id}`).h(24).px(9).items_center().rounded(6).cursor_pointer().text_size(11.5)
      .when(this.mode === id, (e) => e.bg(t.selected).text_color(t.foreground)).when(this.mode !== id, (e) => e.text_color(t.muted).hover((x) => x.bg(t.hover)))
      .on_click((_e, cx) => this.setMode(id, cx)).child(label);
    const btn = (id, icon, tip, act) => h_flex().id(id).size(26).items_center().justify_center().rounded(6).cursor_pointer().hover((x) => x.bg(t.hover)).tooltip(tip)
      .on_click(act).child(svg(ICON(icon)).size(13).text_color(t.muted));
    const full = file && this.root ? `${this.root}\\${file.path.replace(/\//g, "\\")}` : null;

    // h_flex centres its children vertically: both columns take the full height explicitly.
    const list = v_flex().w(300).h_full().flex_none().min_h(0).border_r(1).border_color(t.border)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Diff"))
        .child(div().px(5).rounded(4).border_1().border_color(t.border).text_size(10.5).text_color(t.muted).child(L(`${this.files.length} file`, `${this.files.length} file${this.files.length === 1 ? "" : "s"}`)))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`))
        .child(btn("d-refresh", "clock", L("Làm mới", "Refresh"), (_e, cx) => { this.sig = null; this.refresh(cx); })))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("diff-files").absolute().inset_0().overflow_y_scroll().p(6).gap(1)
          .children(this.files.map((f) => {
            const parts = f.path.split("/"), name = parts.pop();
            return h_flex().id(`df-${f.path}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer()
              .when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx))
              .child(div().w(12).flex_none().text_size(11).font_semibold().text_color(t[TONE[f.status]] ?? t.dim).child(f.status))
              // One line: the name, then its folder dimmed (the folder gives way first).
              .child(h_flex().flex_1().min_w(0).gap(6).items_center()
                .child(div().flex_shrink(0).max_w(200).truncate().text_size(12.5).child(name))
                .when(parts.length > 0, (e) => e.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(parts.join("/")))))
              .when(f.fresh, (e) => e.child(div().flex_none().text_size(10.5).text_color(t.ansi2).child(L("mới", "new"))))
              .when(!f.fresh && f.add > 0, (e) => e.child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${f.add}`)))
              .when(!f.fresh && f.del > 0, (e) => e.child(div().flex_none().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
          }))
          .when(!this.files.length, (e) => e.child(div().p(10).text_color(t.dim).child(this.error || (this.loading ? L("Đang đọc thay đổi…", "Reading changes…") : this.root ? L("Không có thay đổi chưa commit", "No uncommitted changes") : L("Chưa có thư mục", "No folder yet")))))));

    const body = v_flex().flex_1().h_full().min_w(0).min_h(0).overflow_hidden()
      .child(h_flex().h(42).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(12.5)
          .child(file ? file.path : L("Chọn một file để xem diff", "Pick a file to see its diff")))
        .when(!!file, (e) => e
          // A new file has no numstat: count its added rows instead.
          .child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${file.fresh ? this.rows.filter((r) => r.kind === "+").length : file.add ?? 0}`))
          .child(div().flex_none().text_size(11).text_color(t.ansi1).child(`−${file.fresh ? 0 : file.del ?? 0}`))
          .child(h_flex().flex_none().p(2).gap(2).rounded(8).border_1().border_color(t.border).child(seg("unified", L("Gộp", "Unified"))).child(seg("split", L("Hai cột", "Split"))))
          // Code.exe itself, an argument array: no shell to misread a file name with & or ^.
          .child(btn("d-code", "square-pen", L("Mở trong VS Code", "Open in VS Code"), () => exec(`${home()}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`, [full]).catch(() => {})))
          .child(btn("d-dir", "folder", L("Mở thư mục", "Open folder"), () => exec("explorer.exe", ["/select,", full]).catch(() => {})))))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
        .child(div().id("diff-x").size_full().when(!split, (e) => e.overflow_x_scroll())
          .child(div().h_full().when(!split, (e) => e.w_full().min_w(this.width)).when(split, (e) => e.w_full())
            .child(v_virtual_list("diff-rows", rows.length, 22, (i) => String(i),
              (range) => rows.slice(range.start, range.end).map((r) => (split ? this.splitRow(r, t) : this.unifiedRow(r, t)))).size_full()))));

    return h_flex().id("diff").size_full().min_h(0).min_w(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_mouse_down("left", () => this.handle.focus())
      .on_key_down((e, cx) => {
        if (e.key === "down" || e.key === "j") this.move(1, cx);
        else if (e.key === "up" || e.key === "k") this.move(-1, cx);
        else return;
        cx.stop_propagation();
      })
      .child(list).child(body);
  }
}
