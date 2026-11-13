// Open a project (ctrl-shift-j): the folders under the roots in projects.json (each root, its git repos and
// worktrees) as one list. Type to filter, ↑/↓ to pick, Esc to leave.
// Enter: jump to the project's space, or make one with a tab running its agent (Claude by default).
// Ctrl+Enter: the same, plus tab "run" = dev | check for its stack (list.ps1 decides).
// Anything not listed here keeps Herdr's default + / ctrl-shift-n flow.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, spaces, run, theme, props, closeOverlay, appHome, shared, setShared, knownAgents, pickFolder, readTextFile, writeTextFile, notify } from "herdr";
import { L, setLang } from "./i18n.js";

// Roots and saved projects live in ~/.config/herdr-app/projects.json (list.ps1 reads it). On top:
// "Gần đây", the folders worked in with Claude (Claude Code and Desktop sessions); at the end:
// browse any folder, add a root. props().root (a sidebar group's +) lists that root only.
const CONFIG = () => `${appHome()}\\projects.json`;
const ACTIONS = [
  { kind: "action", id: "browse", get group() { return L("Khác", "Other"); }, get name() { return L("Duyệt thư mục khác…", "Browse another folder…"); }, path: "" },
  { kind: "action", id: "addroot", get group() { return L("Khác", "Other"); }, get name() { return L("Thêm thư mục gốc vào danh sách…", "Add a root folder to the list…"); }, path: "" },
];
const ago = (ms) => { const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? L("hôm nay", "today") : d === 1 ? L("hôm qua", "yesterday") : L(`${d} ngày trước`, `${d} days ago`); };
const norm = (p) => (p ?? "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
const sh = (cmd) => ["pwsh", "-NoLogo", "-NoProfile", "-Command", cmd];

export default class Projects extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.items = shared("projects.cache") ?? [];
    this.recent = [];
    this.window = 16; // rows that fit; measured from the dialog's height
    this.filter = "";
    this.at = 0;
    this.loading = true;
    this.error = null;
    this.input = InputState.new({ placeholder: L("Mở dự án… gõ để lọc (vd: hc, claim, core)", "Open project… type to filter (e.g. hc, claim, core)") });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", (e, cx) => this.open(this.rows()[this.at], !!e.secondary, cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("node", [`${appHome()}\\bridge\\recent-folders.mjs`, "30"], { timeout: 15000 });
        this.recent = r.code === 0 ? JSON.parse(r.stdout).map((x) => ({
          kind: "recent", get group() { return L("Gần đây", "Recent"); }, path: x.path, at: x.at,
          name: x.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || x.path,
        })) : [];
        cx.notify();
      } catch {}
    });
    this.scan(cx);
  }

  scan(cx) {
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("pwsh", ["-NoLogo", "-NoProfile", "-File", `${appHome()}\\mods\\projects\\list.ps1`], { timeout: 60000 });
        if (r.code !== 0) throw new Error(r.stderr.trim() || `list.ps1 exit ${r.code}`);
        this.items = JSON.parse(r.stdout.replace(/^\uFEFF/, ""));
        setShared("projects.cache", this.items);
        // list.ps1 still lists (default roots) when projects.json is missing or broken; say so.
        const warn = r.stderr.trim().split(/\r?\n/)[0];
        if (warn) this.error = warn;
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      this.loading = false;
      cx.notify();
      try { this.agents = await knownAgents({}); } catch { this.agents = []; }
    });
  }

  // A saved project's own agent (projects.json "agent"), else Claude Code.
  argvFor(it) {
    return (it.agent && this.agents?.find((a) => a.key === it.agent)?.run) || ["claude"];
  }

  // Gần đây (10, or all while filtering) · the roots' projects · browse / add a root.
  // From a sidebar group's +: that root's folders only.
  rows() {
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    // A sidebar project's + passes its folders (a project group may have several).
    const roots = (props()?.roots ?? (props()?.root ? [props().root] : null))?.map(norm) ?? null;
    const under = (it) => !roots || roots.some((r) => norm(it.path) === r || norm(it.path).startsWith(r + "\\"));
    const match = (it) => words.every((w) => `${it.group} ${it.name} ${it.path} ${it.branch ?? ""} ${it.stack ?? ""}`.toLowerCase().includes(w));
    const recent = this.recent.filter((it) => under(it) && match(it)).slice(0, words.length ? 30 : 10);
    return [...recent, ...this.items.filter((it) => under(it) && match(it)), ...ACTIONS.filter((it) => !words.length || match(it))];
  }

  async action(it, cx) {
    const folder = await pickFolder({ prompt: it.id === "addroot" ? L("Thêm làm thư mục gốc", "Add as root folder") : L("Mở", "Open") });
    if (!folder) return;
    if (it.id === "browse") return this.open({ path: folder, name: folder.split(/[\\/]/).pop() });
    // Add a root to projects.json (the read text guards against a concurrent edit), then rescan.
    const text = await readTextFile(CONFIG()).catch(() => null);
    let cfg = { roots: [], saved: [] };
    try { if (text) cfg = JSON.parse(text); } catch { return notify({ title: L("projects.json bị lỗi cú pháp", "projects.json has a syntax error"), body: L("Sửa file rồi thử lại.", "Fix the file and try again."), level: "error" }); }
    if (!(cfg.roots ?? []).some((r) => norm(r) === norm(folder))) cfg.roots = [...(cfg.roots ?? []), folder];
    await writeTextFile(CONFIG(), JSON.stringify(cfg, null, 2) + "\n", text);
    setShared("projects.roots", cfg.roots); // the sidebar groups follow
    notify({ title: L(`Đã thêm thư mục gốc ${folder}`, `Added root folder ${folder}`), level: "success", timeout: 2500 });
    this.scan(cx);
  }

  // ponytail: matched by the space's folder only; a space whose terminals moved elsewhere
  // isn't found and a second one opens. Match on panes()' cwd too if that bites.
  spaceFor(it) {
    return spaces().find((s) => norm(s.folder) === norm(it.path));
  }

  open(it, withRun, cx) {
    if (!it) return;
    if (it.kind === "action") { if (cx) cx.spawn(async (cx) => { await this.action(it, cx); cx.notify(); }); return; }
    closeOverlay(props().overlay);
    const sp = this.spaceFor(it);
    if (sp) {
      run("space.select", { id: sp.id });
    } else {
      run("space.new", { folder: it.path, tab: this.agents?.find((a) => a.key === it.agent)?.name ?? "Claude Code", argv: this.argvFor(it) }); // terminal: rail button, as a tab
    }
    if (withRun) this.openRun(it, sp);
  }

  openRun(it, sp) {
    const cmds = [it.dev, it.check].filter(Boolean);
    if (!cmds.length) return;
    const have = sp?.tabs.find((t) => t.name === "run");
    if (have) return run("tab.select", { id: have.id });
    run("tab.new", { name: "run", folder: it.runDir, argv: sh(cmds[0]) });
    if (cmds[1]) run("pane.split", { direction: "right", argv: sh(cmds[1]) });
  }

  close() {
    closeOverlay(props().overlay);
  }

  render() {
    setLang(shared("lang"));
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const W = this.window;
    const start = Math.max(0, Math.min(this.at - Math.floor(W / 2), rows.length - W));
    const shown = rows.slice(start, start + W);
    const sel = rows[this.at];

    const row = (it, i) => {
      const on = it === sel;
      const open = !!this.spaceFor(it);
      const prev = i === 0 ? (start ? rows[start - 1] : null) : shown[i - 1];
      const head = !prev || prev.group !== it.group;
      return v_flex()
        .when(head, (el) => el.child(div().px(10).pt(i ? 8 : 2).pb(2).text_size(11).font_semibold().text_color(t.dim).child(it.group)))
        .child(
          h_flex()
            .id(`pj-${start + i}`)
            .mx(4).px(10).h(30).gap(10).items_center().rounded(7).cursor_pointer()
            .when(on, (el) => el.bg(t.hover))
            .hover((s) => s.bg(t.hover))
            .on_click((e, cx) => this.open(it, !!e.modifiers?.control, cx))
            .child(div().w(12).flex_none().text_color(open ? t.accent : t.dim).child(open ? "●" : it.kind === "worktree" ? "⑂" : it.kind === "recent" ? "↺" : it.kind === "action" ? "+" : "○"))
            .child(div().flex_1().truncate().text_color(t.foreground).when(on, (d) => d.font_semibold()).child(it.saved ? `★ ${it.name}` : it.name))
            .when(it.dirty, (el) => el.child(div().text_size(11).text_color(t.blocked).child("±")))
            .when(!!it.branch, (el) => el.child(div().max_w(220).truncate().text_size(11).text_color(t.muted).child(it.branch)))
            .when(it.kind === "recent", (el) => el.child(div().max_w(300).truncate().text_size(11).text_color(t.dim).child(`${it.path} · ${ago(it.at)}`)))
            .child(div().w(52).flex_none().text_size(10.5).text_color(t.dim).child(it.stack ?? "")),
        );
    };

    return v_flex()
      .id("projects")
      // As many rows as the dialog's height holds (it was a fixed 14).
      .on_size_change((size, cx) => { const w = Math.max(8, Math.floor((size.height - 190) / 31)); if (w !== this.window) { this.window = w; cx.notify(); } })
      .track_focus(this.handle)
      .size_full().min_h(0).p(18).gap(10).bg(t.popover).text_size(13) // fills the dialog: its height decides the rows
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (!rows.length) return;
        if (k === "down") this.at = (this.at + 1) % rows.length;
        else if (k === "up") this.at = (this.at + rows.length - 1) % rows.length;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .on_scroll_wheel((e, cx) => {
        if (!rows.length) return;
        this.at = Math.max(0, Math.min(rows.length - 1, this.at + (e.delta.y < 0 ? 1 : -1)));
        cx.notify();
      })
      .child(
        h_flex().items_center().gap(8)
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(props()?.label || props()?.root ? `${L("Mở dự án", "Open project")} · ${props()?.label ?? String(props().root).split(/[\\/]/).pop()}` : L("Mở dự án", "Open project")))
          .when(this.loading, (el) => el.child(div().text_size(11).text_color(t.dim).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"].map((f) => `${L("đang quét", "scanning")} ${f}`), 90)))
          .child(div().text_size(11).text_color(t.dim).child("Esc")),
      )
      .child(
        h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .when(!!this.error, (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(L(`Không quét được: ${this.error}`, `Couldn't scan: ${this.error}`))))
      .child(
        rows.length
          ? v_flex().min_h(0).children(shown.map(row))
          : div().px(10).py(8).text_color(t.dim).child(this.loading ? L("Đang quét các thư mục dự án…", "Scanning project folders…") : L("Không có dự án nào khớp.", "No matching projects.")),
      )
      .child(
        h_flex().pt(4).gap(14).text_size(11).text_color(t.dim)
          .child(L("Enter: mở (tab agent)", "Enter: open (agent tab)"))
          .child(L("Ctrl+Enter: mở kèm tab run (dev | check)", "Ctrl+Enter: open with a run tab (dev | check)"))
          .child(rows.length > W ? `${this.at + 1}/${rows.length}` : ""),
      );
  }
}
