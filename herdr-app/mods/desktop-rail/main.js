// Session rail of the "desktop" layout (Ctrl+Shift+R), a card like Herdr's Files/Changes panel and
// Claude Desktop's session panel. Toolbar (terminal, changes, files, more, hide), then sections:
// Environment (open / copy the folder), Git (copy branch, fetch / pull / push, changed files with
// +/-, the branch's PR), Agents of the space, Context (Desktop-style breakdown), Connectors (MCP),
// Skills, Plugins, Outputs (files the session wrote). Session facts come from the space's Claude:
// its status line file (live numbers) and bridge/session-info.mjs (its transcript, parsed in a
// separate node process so a big transcript never blocks the window).
// Performance: polls redraw only when what they read changed; closed sections build nothing.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, terminals, focused, run, theme, exec, hc, home, appHome, layout, openOverlay, closeOverlay, props, readTextFile, setShared, shared } from "herdr";
import { parsePr, prTone, checksTone, reviewTone, parseNumstat, parseStatusV2 } from "./model.js";
import { contextRows } from "./session.js";
import { L, setLang } from "./i18n.js";

const normPath = (p) => String(p ?? "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
const PR_STATE = { get open() { return L("Đang mở", "Open"); }, get draft() { return L("Nháp", "Draft"); }, get merged() { return L("Đã merge", "Merged"); }, get closed() { return L("Đã đóng", "Closed"); } };
const CHECKS = { get pass() { return L("✓ checks đạt", "✓ checks passed"); }, get fail() { return L("✗ checks lỗi", "✗ checks failed"); }, get pending() { return L("◌ checks đang chạy", "◌ checks running"); } };
const REVIEW = { get approved() { return L("Đã duyệt", "Approved"); }, get changes() { return L("Cần sửa", "Changes requested"); }, get review() { return L("Chờ review", "Awaiting review"); } };
const STATUS_LABEL = { get working() { return L("đang làm", "working"); }, get blocked() { return L("chờ bạn", "waiting for you"); }, get done() { return L("xong", "done"); }, get idle() { return L("rảnh", "idle"); } };
const MODE_LABEL = { get auto() { return L("Tự động", "Auto"); }, get default() { return L("Hỏi trước", "Ask first"); }, get acceptEdits() { return L("Tự nhận sửa", "Accept edits"); }, get plan() { return L("Lập kế hoạch", "Plan mode"); }, get bypassPermissions() { return L("Bỏ qua quyền", "Bypass permissions"); } };
const ICON = (n) => `mods/workspace-chrome/${n}.svg`;
// Desktop's context colours.
const CTX_COLOR = { messages: "#4a8cf7", system_tools: "#e8743b", mcp_tools: "#1fa889", system_prompt: "#d9a21b", skills: "#9aa0a6", memory: "#8a9099", mcp_instructions: "#7b828a", agents: "#6c737b" };
const CODE_TONE = { M: "ansi3", A: "ansi2", "?": "ansi2", D: "ansi1", R: "ansi4", C: "ansi4", U: "ansi1" };
// An agent's name like the Agents list: its own title (Claude names its session), else the tab.
const agentName = (a) => {
  const live = String(a.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const telling = live && live !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== a.program?.key;
  return telling ? live : a.tab_name;
};
const fileName = (p) => String(p).split(/[\\/]/).pop();
const dirName = (p) => String(p).split(/[\\/]/).slice(0, -1).join("\\");
const k = (n) => (n == null ? "–" : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));
const store = { get: (key, d) => { try { return JSON.parse(localStorage.getItem(key)) ?? d; } catch { return d; } }, set: (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} } };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const f = find(child, id); if (f) return f; }
  return null;
}

const COMPACT = 230; // px: narrower than this the header's five tools no longer fit

// Shows the Changes / Files panel (or hides it when it already shows that one).
function togglePanel(id) {
  const root = layout(), panel = find(root, "panel"), stack = find(root, "panel-body");
  if (!!panel && !panel.hidden && stack?.active === id) run("layout.hide", { id: "panel" });
  else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
}

function programIcon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none();
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// The space's Claude Code the rail describes: the focused tab's, else the space's first.
// The agent a phrase (Pull, Push, PR) goes to: the focused tab's, any kind, else the space's first.
function spaceAgent(space) {
  const mine = agents().filter((a) => a.space === space?.id);
  return mine.find((a) => a.tab === focused()?.tab && a.focused) ?? mine.find((a) => a.tab === focused()?.tab) ?? mine[0] ?? null;
}

function spaceClaude(space) {
  const mine = agents().filter((a) => a.space === space?.id && a.app === "claude-code");
  return mine.find((a) => a.tab === focused()?.tab) ?? mine[0] ?? null;
}

export default class DesktopRail extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    if (props()?.menu) return; // the "⋯" popup copy draws a menu only
    this.git = null; // {folder, branch, changed, ahead, behind, pr, files?} of the shown space
    this.prCache = {};
    this.fade = 1;
    this.open = store.get("rail.open", { files: false, agents: true, context: true, connectors: false, skills: false, plugins: false, outputs: true, more: {} });
    this.live = null; // {terminal, transcript, used, size, at}: the space's Claude, from its status line file
    this.info = null; // {terminal, transcript, data}: bridge/session-info.mjs output
    const poll = (cx) => cx.spawn(async (cx) => { if ((await this.refreshGit()) | (await this.refreshSession())) cx.notify(); });
    poll(cx);
    cx.timer.every(10000, poll);
  }

  toggle(key, cx) { this.open[key] = !this.open[key]; store.set("rail.open", this.open); cx.notify(); }
  more(key, cx) { this.open.more = { ...this.open.more, [key]: !this.open.more?.[key] }; store.set("rail.open", this.open); cx.notify(); }

  // Feedback inside the rail (copied, sent, fetched…), fading.
  flash(cx, kind, text) {
    const id = (this.noteId = (this.noteId ?? 0) + 1);
    this.note = { id, kind, text, shown: false };
    cx.timer.after(16, (cx) => { if (this.note?.id === id) { this.note.shown = true; cx.notify(); } });
    if (kind !== "busy") cx.timer.after(2400, (cx) => { if (this.note?.id === id) { this.note.shown = false; cx.notify(); cx.timer.after(220, (cx) => { if (this.note?.id === id) { this.note = null; cx.notify(); } }); } });
    cx.notify();
  }

  // ponytail: git for the shown space only, every 10 s, never two passes at once. Returns "changed".
  async refreshGit() {
    if (this.gitBusy) return false;
    this.gitBusy = true;
    const before = JSON.stringify(this.git);
    try {
      const s = spaces().find((x) => x.active);
      if (!s || s.machine || !s.folder) { this.git = null; return before !== JSON.stringify(this.git); }
      // --no-optional-locks: never take .git/index.lock away from a commit Claude is running.
      const git = (...a) => exec("git", ["--no-optional-locks", "-c", "core.quotepath=false", "-C", s.folder, ...a], { timeout: 5000 });
      // ponytail: the repo root once per folder (5 min); then ONE git run per poll for branch,
      // ahead/behind and files (numstat only while the file list is open).
      const key = normPath(s.folder);
      if (!this.tops?.[key] || Date.now() - this.tops[key].at > 300000) {
        const top = await git("rev-parse", "--show-toplevel");
        this.tops = { ...this.tops, [key]: { at: Date.now(), top: top.code === 0 ? top.stdout.trim().replace(/\//g, "\\") : null } };
      }
      const topDir = this.tops[key].top;
      if (!topDir) { this.git = { folder: s.folder, repo: false }; return before !== JSON.stringify(this.git); }
      const st = await git("status", "--porcelain=v2", "--branch");
      const v2 = parseStatusV2(st.code === 0 ? st.stdout : "");
      let num = {};
      if (this.open.files && v2.files.length) { const ns = await git("diff", "--numstat", "HEAD"); if (ns.code === 0) num = parseNumstat(ns.stdout); }
      this.git = {
        folder: s.folder, top: topDir, repo: true, branch: v2.branch,
        changed: v2.files.length,
        files: v2.files.slice(0, 200).map((f) => ({ ...f, ...(num[f.path] ?? {}) })),
        ahead: v2.ahead, behind: v2.behind,
        pr: await this.prFor(s.folder, v2.branch),
      };
    } catch { this.git = null; } finally { this.gitBusy = false; }
    return before !== JSON.stringify(this.git);
  }

  // ponytail: gh once per folder+branch per 60 s; no PR, no gh or offline → null.
  async prFor(folder, branch) {
    const key = `${normPath(folder)}|${branch}`;
    const hit = this.prCache[key];
    if (hit && Date.now() - hit.at < 60000) return hit.pr;
    let pr = null;
    try {
      const r = await exec("gh", ["pr", "view", "--json", "number,title,state,isDraft,reviewDecision,statusCheckRollup,url"], { cwd: folder, timeout: 15000 });
      if (r.code === 0) pr = parsePr(JSON.parse(r.stdout));
    } catch {}
    this.prCache[key] = { at: Date.now(), pr };
    return pr;
  }

  // The space's Claude: live numbers every poll (a small file); its transcript parsed again only when
  // it moved on and 30 s passed (or another Claude / "Làm mới"). Returns "changed".
  async refreshSession(force) {
    const a = spaceClaude(spaces().find((x) => x.active));
    const before = JSON.stringify([this.live, this.info?.at]);
    if (!a || a.address.includes("/")) { this.live = null; return before !== JSON.stringify([this.live, this.info?.at]); }
    try {
      const j = JSON.parse(await readTextFile(`${home()}\\AppData\\Local\\herdr-claude\\${a.address.replace(/[^\w.-]/g, "_")}.json`));
      const cw = j?.input?.context_window ?? {};
      this.live = { terminal: a.address, transcript: j?.input?.transcript_path ?? null, used: cw.total_input_tokens ?? null, size: cw.context_window_size ?? null, pct: cw.used_percentage ?? null, at: j?.at ?? null };
    } catch { if (this.live?.terminal !== a.address) this.live = { terminal: a.address, transcript: null }; }
    const L = this.live;
    const stale = L?.transcript && (force || this.info?.transcript !== L.transcript || (L.at !== this.info?.liveAt && Date.now() - (this.info?.at ?? 0) > 30000));
    if (stale && !this.infoBusy) {
      this.infoBusy = true;
      try {
        const r = await exec("node", [`${appHome()}\\bridge\\session-info.mjs`, L.transcript], { timeout: 20000 });
        if (r.code === 0) this.info = { terminal: L.terminal, transcript: L.transcript, liveAt: L.at, at: Date.now(), data: JSON.parse(r.stdout) };
      } catch {} finally { this.infoBusy = false; }
    }
    return before !== JSON.stringify([this.live, this.info?.at]);
  }

  // A phrase for the space's Claude (Pull, Push, PR), only while it is idle.
  async say(cx, text) {
    const a = spaceAgent(spaces().find((x) => x.active));
    const who = a?.program?.name ?? "Agent";
    if (!a) return this.flash(cx, "warn", L("Space này chưa có agent", "This space has no agent yet"));
    if (a.status === "working" || a.status === "blocked") return this.flash(cx, "warn", a.status === "working" ? L(`${who} đang làm…`, `${who} is working…`) : L(`${who} đang chờ bạn trả lời`, `${who} is waiting for your answer`));
    const r = await hc(["send", a.address, text]).catch(() => ({ code: 1 }));
    this.flash(cx, r.code === 0 ? "ok" : "error", r.code === 0 ? L(`Đã gửi "${text}" cho Claude`, `Sent "${text}" to Claude`) : L(`Không gửi được "${text}"`, `Couldn't send "${text}"`));
  }

  async copy(cx, text, label) {
    const r = await exec("powershell.exe", ["-STA", "-NoProfile", "-File", `${appHome()}\\mods\\desktop-rail\\clip.ps1`, "set", text], { timeout: 10000 }).catch(() => ({ code: 1 }));
    this.flash(cx, r.code === 0 ? "ok" : "error", r.code === 0 ? L(`Đã chép ${label}`, `Copied ${label}`) : L("Không chép được", "Couldn't copy"));
  }

  // Code.exe itself with an argument array: no shell to misread a path with & or ^.
  openFile(path) { exec(`${home()}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`, [path]).catch(() => {}); }
  // A tab of this space whose only pane is a mod (Files, Changes, Diff): the one there, else new.
  openTab(name, mod) {
    const sp = spaces().find((x) => x.active);
    const tab = sp?.tabs?.find((x) => x.name === name);
    if (tab) run("tab.select", { id: tab.id }); else run("tab.new", { space: sp?.id, name, mod });
  }
  // The Diff tab, on that file.
  openDiff(path) {
    if (path) setShared("diff.select", { path, at: Date.now() });
    this.openTab("Diff", "desktop-diff");
  }
  openFolder(path) { exec("explorer.exe", [path]).catch(() => {}); }

  async fetch(cx) {
    const g = this.git;
    if (!g?.repo) return;
    this.flash(cx, "busy", L("Đang fetch…", "Fetching…"));
    const r = await exec("git", ["-C", g.folder, "fetch", "--prune"], { timeout: 60000 }).catch(() => ({ code: 1 }));
    await this.refreshGit();
    this.flash(cx, r.code === 0 ? "ok" : "error", r.code === 0 ? L("Đã fetch", "Fetched") : L("Fetch lỗi", "Fetch failed"));
  }

  // The "⋯" menu of the header: the desktop layout's own commands.
  menu(t) {
    const close = () => closeOverlay(props().overlay);
    const item = (key, label, hint, icon, act) => h_flex().id(`rm-${key}`).h(30).px(10).gap(9).items_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click(() => { close(); act(); })
      .child(svg(ICON(icon)).size(14).text_color(t.dim))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(label))
      .child(div().text_size(10.5).text_color(t.dim).child(hint));
    return v_flex().size_full().p(5).gap(1).bg(t.popover).text_size(12.8)
      .child(item("new", L("Phiên mới", "New session"), "Ctrl+Shift+N", "plus", () => run("mod.open", { name: "new-session" })))
      .child(item("projects", L("Mở dự án", "Open project"), "Ctrl+Shift+J", "folder", () => run("mod.open", { name: "projects" })))
      .child(item("need", L("Cần bạn", "Needs you"), "Ctrl+Shift+Space", "circle-check", () => run("mod.open", { name: "needs-you" })))
      .child(item("team", L("Phòng ban mới…", "New team…"), "", "layers", () => run("mod.open", { name: "team" })))
      .child(item("keys", L("Phím tắt", "Keyboard shortcuts"), "F1", "square", () => run("mod.open", { name: "hotkeys" })))
      .child(div().h(1).mx(4).my(4).bg(t.border))
      .child(item("settings", L("Cài đặt", "Settings"), "Ctrl+,", "settings", () => run("app.settings")));
  }

  // The rail's width: below COMPACT it draws an icon strip (Herdr lets a drag go past "min").
  sized(size, cx) {
    const narrow = size.width < COMPACT;
    if (narrow !== this.narrow) { this.narrow = narrow; cx.notify(); }
  }

  // Dragged narrow: icons instead of squeezed rows; the first one widens it back.
  compact(t, space) {
    const claude = spaceClaude(space);
    const pct = claude && this.live?.terminal === claude.address ? this.live.pct : null;
    const icon = (id, name, tip, act) => h_flex().id(`rk-${id}`).size(30).flex_none().items_center().justify_center().rounded(7).cursor_pointer()
      .hover((x) => x.bg(t.hover)).tooltip(tip).on_click(act).child(svg(ICON(name)).size(15).text_color(t.muted));
    return v_flex().id("drail").size_full().min_h(0).py(8).gap(4).items_center().rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .on_size_change((size, cx) => this.sized(size, cx))
      .child(icon("open", "chevron-left", L("Mở rộng rail", "Expand rail"), () => run("layout.resize", { id: "rail", px: 340 })))
      .child(div().w(18).h(1).my(2).bg(t.border))
      .child(icon("term", "terminal", L("Terminal mới (tab)", "New terminal (tab)"), () => run("tab.new")))
      .child(icon("changes", "git-compare", L("Diff (tab)", "Diff (tab)"), () => this.openDiff(null)))
      .child(icon("files", "files", L("Files (tab)", "Files (tab)"), () => this.openTab("Files", "desktop-files")))
      .when(pct != null, (el) => el.child(div().pt(6).text_size(10.5).text_color(t.dim).child(`${Math.round(pct)}%`)))
      .child(div().flex_1())
      .child(icon("close", "x", L("Ẩn rail (Ctrl+Shift+R)", "Hide rail (Ctrl+Shift+R)"), () => run("layout.hide", { id: "rail" })));
  }

  render(cx) {
    setLang(shared("lang"));
    const t = theme();
    if (props()?.menu) return this.menu(t);
    const f = focused();
    const space = spaces().find((s) => s.active);
    // Another space shown: fade the body in and read it now, not at the next 10 s tick.
    if ((space?.id ?? null) !== this.shownSpace) {
      this.shownSpace = space?.id ?? null;
      this.fade = 0;
      cx.timer.after(30, (cx) => { this.fade = 1; cx.notify(); });
      cx.spawn(async (cx) => { await Promise.all([this.refreshGit(), this.refreshSession()]); cx.notify(); });
    }
    if (this.narrow) return this.compact(t, space);
    const g = this.git && space && normPath(this.git.folder) === normPath(space.folder) ? this.git : null;
    const git = g?.repo ? g : null;
    const claude = spaceClaude(space);
    // Context, connectors, skills… come from Claude Code's transcript: say so where only other agents run.
    const others = [...new Set(agents().filter((x) => x.space === space?.id && x.app !== "claude-code").map((x) => x.program?.name ?? x.app))];
    const noClaude = others.length ? L(`Mục này đọc từ phiên Claude Code; ${others.join(", ")} chưa có dữ liệu này.`, `This section reads from the Claude Code session; ${others.join(", ")} has no data for it yet.`) : L("Space này chưa có agent.", "This space has no agent yet.");
    const live = claude && this.live?.terminal === claude.address ? this.live : null;
    const info = claude && this.info?.terminal === claude.address ? this.info.data : null;

    // ---- building blocks ----
    const action = (id, icon, tip, act) => h_flex().id(id).size(22).flex_none().items_center().justify_center().rounded(5).cursor_pointer()
      .hover((x) => x.bg(t.selected)).tooltip(tip).on_click((_e, cx) => { cx.stop_propagation(); act(cx); })
      .child(svg(ICON(icon)).size(12).text_color(t.muted));
    const textBtn = (id, label, tip, act) => h_flex().id(id).h(22).px(7).flex_none().items_center().rounded(5).cursor_pointer().text_size(11).text_color(t.muted)
      .border_1().border_color(t.border).hover((x) => x.bg(t.selected).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); act(cx); }).child(label);
    // A row that reacts: hover background, click, actions on the right shown on hover.
    const row = (id, icon, text, o = {}) => h_flex().id(id).min_h(28).px(6).gap(10).items_center().rounded(6)
      .when(!!o.act, (el) => el.cursor_pointer().hover((x) => x.bg(t.hover)).on_click((_e, cx) => o.act(cx)))
      .when(!!o.tip, (el) => el.tooltip(o.tip))
      .child(typeof icon === "string" ? svg(ICON(icon)).size(14).flex_none().text_color(o.iconColor ?? t.muted) : icon)
      .child(div().flex_1().min_w(0).truncate().text_color(o.color ?? t.foreground).child(text))
      .when(!!o.right, (el) => el.child(o.right))
      .when(!!o.actions, (el) => el.child(h_flex().gap(2).flex_none().children(o.actions)));
    // A section header that folds; extra: a count or a button on the right.
    const section = (key, title, extra, foldable = true) => h_flex().id(`rs-${key}`).px(6).pt(16).pb(6).gap(6).items_center()
      .when(foldable, (el) => el.cursor_pointer().on_click((_e, cx) => this.toggle(key, cx)))
      .when(foldable, (el) => el.child(svg(ICON(this.open[key] ? "chevron-down" : "chevron-right")).size(11).text_color(t.dim)))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().text_color(t.dim).child(title))
      .when(extra != null, (el) => el.child(typeof extra === "string" || typeof extra === "number" ? div().text_size(11).text_color(t.dim).child(String(extra)) : extra));
    const dim = (text) => div().px(6).py(2).text_size(11.5).text_color(t.dim).child(text);
    const capped = (key, list, n, draw) => {
      const all = this.open.more?.[key];
      const shown = all ? list : list.slice(0, n);
      return v_flex().gap(1).children(shown.map(draw))
        .when(list.length > n, (el) => el.child(h_flex().id(`rm-more-${key}`).h(24).px(6).items_center().cursor_pointer().text_size(11.5).text_color(t.accent)
          .on_click((_e, cx) => this.more(key, cx)).child(all ? L("Thu gọn", "Show less") : L(`Xem thêm ${list.length - n}`, `Show ${list.length - n} more`))));
    };
    const tag = ([label, tone]) => div().px(7).h(20).flex().items_center().rounded(5).bg(t[tone] + "22").text_size(11).text_color(t[tone]).child(label);

    // ---- Environment ----
    const folder = f?.cwd ?? space?.folder ?? null;
    const env = v_flex()
      .child(section("env", L("Môi trường", "Environment"), null, false))
      .child(row("re-machine", "monitor", space?.machine ?? L("Máy này", "This computer"), { tip: L("Máy (Cài đặt → Machines)", "Machine (Settings → Machines)"), act: () => run("app.settings", { section: "machines" }) }))
      .when(!!folder, (el) => el.child(row("re-folder", "folder", folder, {
        tip: L("Mở trong Explorer", "Open in Explorer"), act: () => this.openFolder(folder),
        actions: [
          action("re-copy", "files", L("Chép đường dẫn", "Copy path"), (cx) => cx.spawn(async (cx) => this.copy(cx, folder, L("đường dẫn", "path")))),
          action("re-code", "square-pen", L("Mở trong VS Code", "Open in VS Code"), () => this.openFile(folder)),
          action("re-term", "terminal", L("Terminal tại đây (tab mới)", "Terminal here (new tab)"), () => run("tab.new", { folder })),
        ],
      })));

    // ---- Git ----
    const prCard = (pr) => {
      const tone = t[prTone(pr)] ?? t.dim;
      return v_flex().id("rail-pr").mt(6).mx(6).p(10).gap(6).rounded(8).bg(tone + "14").border_1().border_color(tone + "66")
        .child(h_flex().gap(8).items_center()
          .child(h_flex().id("rail-open-pr").gap(6).px(4).h(22).items_center().rounded(5).flex_none()
            .when(!!pr.url, (el) => el.cursor_pointer().hover((x) => x.bg(tone + "2e")).tooltip(L("Mở PR trên GitHub", "Open PR on GitHub"))
              .on_click(() => exec("rundll32", ["url.dll,FileProtocolHandler", pr.url])))
            .child(svg(ICON(pr.state === "merged" ? "git-branch" : "git-compare")).size(13).text_color(tone))
            .child(div().text_size(12).font_semibold().text_color(tone).child(`#${pr.number}`)))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(pr.title)))
        .child(h_flex().gap(6).flex_wrap()
          .child(div().px(7).h(20).flex().items_center().gap(5).rounded(5).bg(tone + "2e").text_size(11).font_semibold().text_color(tone)
            .child(div().size(6).rounded(3).bg(tone)).child(PR_STATE[pr.state] ?? pr.state))
          .when(!!checksTone(pr.checks), (el) => el.child(tag([CHECKS[pr.checks], checksTone(pr.checks)])))
          .when(!!reviewTone(pr.review), (el) => el.child(tag([REVIEW[pr.review], reviewTone(pr.review)]))));
    };
    const fileRow = (x, i) => h_flex().id(`rf-${i}`).h(26).px(6).gap(8).items_center().rounded(6).cursor_pointer().hover((y) => y.bg(t.hover))
      .tooltip(`${x.path} — ${L("xem diff", "view diff")}`).on_click(() => this.openDiff(x.path)).on_mouse_down("right", () => this.openFile(`${git.top}\\${x.path.replace(/\//g, "\\")}`))
      .child(div().w(14).flex_none().text_size(11).font_semibold().text_color(t[CODE_TONE[x.code] ?? "dim"] ?? t.dim).child(x.code === "?" ? "U" : x.code))
      .child(div().flex_shrink(1).min_w(0).truncate().text_size(12).child(fileName(x.path)))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(dirName(x.path)))
      .when(x.add != null, (el) => el.child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${x.add}`)).child(div().flex_none().text_size(11).text_color(t.ansi1).child(`−${x.del}`)));
    const gitBlock = v_flex().child(section("git", "Git", null, false))
      .when(!git, (el) => el.child(dim(space?.machine ? L("Chỉ có số liệu git cho space trên máy này.", "Git data is only available for spaces on this computer.") : !space ? "—" : g ? L("Thư mục này không phải repo git.", "This folder is not a git repo.") : L("Đang đọc git…", "Reading git…"))))
      .when(!!git, (el) => el
        .child(row("rg-branch", "git-branch", git.branch || "(detached)", { tip: L("Bấm để chép tên branch", "Click to copy the branch name"), act: (cx) => cx.spawn(async (cx) => this.copy(cx, git.branch, L("tên branch", "branch name"))) }))
        .when(git.ahead != null, (e2) => e2.child(row("rg-sync", "layers", L(`↑${git.ahead} chưa push · ↓${git.behind} chưa kéo về`, `↑${git.ahead} to push · ↓${git.behind} to pull`), {
          actions: [
            textBtn("rg-fetch", "Fetch", "git fetch --prune", (cx) => cx.spawn(async (cx) => this.fetch(cx))),
            ...(git.behind ? [textBtn("rg-pull", "Pull", L("Nhờ Claude pull về", "Ask Claude to pull"), (cx) => cx.spawn(async (cx) => this.say(cx, "Pull về (git pull --ff-only)")))] : []),
            ...(git.ahead ? [textBtn("rg-push", "Push", L("Nhờ Claude push", "Ask Claude to push"), (cx) => cx.spawn(async (cx) => this.say(cx, "Push nhánh này lên remote")))] : []),
          ],
        })))
        .child(row("rg-files", "file-text", git.changed ? L(`${git.changed} file thay đổi`, `${git.changed} changed files`) : L("Không có thay đổi", "No changes"), {
          color: git.changed ? t.blocked : t.dim,
          tip: git.changed ? L("Bấm để xem danh sách", "Click to see the list") : null,
          act: git.changed ? (cx) => { this.toggle("files", cx); if (this.open.files) cx.spawn(async (cx) => { await this.refreshGit(); cx.notify(); }); } : null,
          right: git.changed ? svg(ICON(this.open.files ? "chevron-down" : "chevron-right")).size(11).text_color(t.dim) : null,
          actions: git.changed ? [action("rg-changes", "git-compare", L("Mở tab Diff", "Open Diff tab"), () => this.openDiff(null))] : null,
        }))
        .when(this.open.files && git.changed > 0, (e2) => e2.child(v_flex().pl(4).child(capped("files", git.files ?? [], 12, fileRow))))
        .when(!!git.pr, (e2) => e2.child(prCard(git.pr)))
        .when(!git.pr, (e2) => e2.child(h_flex().px(6).pt(6).gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(L("Chưa có PR cho branch này.", "No PR for this branch yet.")))
          .child(textBtn("rg-mkpr", L("Tạo PR", "Create PR"), L("Nhờ Claude commit và tạo PR", "Ask Claude to commit and create a PR"), (cx) => cx.spawn(async (cx) => this.say(cx, "Commit + PR")))))));

    // ---- Agents of the space ----
    const mine = agents().filter((a) => a.space === space?.id);
    // Sub-sessions (started with hc run --parent, e.g. the composer's Ctrl+Enter) have no pane, so
    // they aren't in agents(): they come from terminals(), under their parent; a click peeks.
    const own = new Set(mine.map((a) => a.address));
    const kids = (addr) => terminals().filter((x) => x.parent === addr && x.state === "live" && !own.has(x.address));
    const kidRow = (k) => row(`rk-${k.address}`, svg(ICON("git-branch")).size(12).flex_none().text_color(t.dim), k.name || String(k.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim() || k.program?.name || k.address, {
      tip: L("Phiên con — bấm để xem", "Sub-session — click to view"), act: () => run("terminal.peek", { terminal: k.address }),
      right: h_flex().gap(6).items_center().flex_shrink(1).min_w(0)
        .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${k.address} · ${STATUS_LABEL[k.status] ?? k.status ?? ""}`))
        .child(div().size(7).rounded(4).bg(t[k.status] ?? t.dim)),
    }).pl(24);
    const agentsBlock = v_flex().child(section("agents", L("Agent", "Agents"), mine.length || null))
      .when(this.open.agents, (el) => el.when(!mine.length, (e2) => e2.child(dim(L("Chưa có agent trong space này.", "No agents in this space yet."))))
        .children(mine.flatMap((a) => [row(`ra-${a.address}`, programIcon(a.program, 14, t.muted), agentName(a), {
          tip: L("Chuyển tới agent này", "Go to this agent"), act: () => run("agent.focus", { terminal: a.address }),
          right: h_flex().gap(6).items_center().flex_shrink(1).min_w(0)
            .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${a.program?.name ?? a.app ?? ""} · ${STATUS_LABEL[a.status] ?? a.status ?? ""}`))
            .child(div().size(7).rounded(4).bg(t[a.status] ?? t.dim)),
        }), ...kids(a.address).map(kidRow)])));

    // ---- Context (like Claude Desktop) ----
    const ctxBlock = () => {
      if (!claude) return dim(noClaude);
      if (!live?.size) return dim(L("Chưa có số liệu — gửi một tin cho Claude, status line sẽ cập nhật.", "No data yet — send Claude a message and the status line will update."));
      const ctxLabel = (r) => ({
        messages: L("Tin nhắn", "Messages"), system_tools: L("Công cụ hệ thống", "System tools"), mcp_tools: L("Công cụ MCP", "MCP tools"),
        system_prompt: L("Prompt hệ thống", "System prompt"), skills: L("Kỹ năng", "Skills"), memory: L("Tệp bộ nhớ", "Memory files"),
        mcp_instructions: L("Hướng dẫn MCP server", "MCP server instructions"), agents: L("Agent tuỳ chỉnh", "Custom agents"),
      })[r.key] ?? r.label;
      const { rows, free } = contextRows(info?.fixed ?? [], live.used, live.size);
      const pct = live.pct ?? (live.used / live.size) * 100;
      const square = (c) => div().size(10).rounded(2).flex_none().bg(c);
      const line = (label, amount, share, color, subtle) => h_flex().h(24).gap(8).items_center()
        .child(square(color)).child(div().flex_1().min_w(0).truncate().text_size(12).text_color(subtle ? t.dim : t.foreground).child(label))
        .child(div().w(60).flex_none().text_size(11.5).text_color(t.muted).child(amount))
        .child(div().w(44).flex_none().text_size(11.5).text_color(subtle ? t.dim : t.foreground).child(share));
      const amt = (n) => (n == null ? "–" : `≈${k(n)}`);
      const pc = (x) => (x == null ? "—" : `${x.toFixed(1)}%`);
      return v_flex().px(6).gap(2)
        .child(h_flex().pb(4).gap(8).child(div().flex_1().min_w(0).truncate().font_semibold().child(L(`${Math.round(pct)}% đã dùng`, `${Math.round(pct)}% used`))).child(div().text_size(11.5).text_color(t.dim).child(`${k(live.used)} / ${k(live.size)}`)))
        .child(h_flex().h(6).mb(6).rounded(3).overflow_hidden().bg(t.border)
          .children(rows.filter((r) => r.pct > 0.05).map((r) => div().h_full().w(`${r.pct}%`).bg(CTX_COLOR[r.key] ?? t.dim))))
        .children(rows.map((r) => line(ctxLabel(r), amt(r.tokens), pc(r.pct), CTX_COLOR[r.key] ?? t.dim)))
        .child(line(L("Còn trống", "Free space"), amt(free), pc(free != null ? (free / live.size) * 100 : null), t.border))
        .when(!!info, (el) => el
          .child(line(L("Công cụ MCP (hoãn tải)", "MCP tools (deferred)"), L(`${info.deferred.mcp} tool`, `${info.deferred.mcp} tools`), "—", t.raised, true))
          .child(line(L("Công cụ hệ thống (hoãn tải)", "System tools (deferred)"), L(`${info.deferred.system} tool`, `${info.deferred.system} tools`), "—", t.raised, true)))
        .when(!!info?.memory?.length, (el) => el.child(sub("mem", L("Tệp bộ nhớ", "Memory files"), info.memory.length, () => info.memory.map((m, i) =>
          row(`rcm-${i}`, "file-text", fileName(m.path), { tip: m.path, right: div().text_size(11).text_color(t.dim).child(`${m.type ?? ""} · ≈${k(m.tokens)}`), act: () => this.openFile(m.path) })))))
        .when(!!info?.agents?.length, (el) => el.child(sub("cag", L("Agent tuỳ chỉnh", "Custom agents"), info.agents.length, () => info.agents.map((n, i) => row(`rca-${i}`, "square", n, {})))))
        .child(div().w_full().min_w(0).pt(4).text_size(10.5).text_color(t.dim).child(L("≈ ước tính từ transcript; số chính xác: /context", "≈ estimated from the transcript; exact numbers: /context")));
    };
    // A folding sub-list inside a section (Memory files, Custom agents).
    const sub = (key, label, count, rows) => v_flex()
      .child(h_flex().id(`rsub-${key}`).h(24).gap(6).items_center().cursor_pointer().on_click((_e, cx) => this.more(`sub-${key}`, cx))
        .child(svg(ICON(this.open.more?.[`sub-${key}`] ? "chevron-down" : "chevron-right")).size(11).text_color(t.dim))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(label)).child(div().text_size(11.5).text_color(t.dim).child(String(count))))
      .when(!!this.open.more?.[`sub-${key}`], (el) => el.child(v_flex().pl(16).children(rows())));
    const refresh = h_flex().gap(6).items_center().flex_none()
      .when(live?.pct != null, (el) => el.child(div().text_size(11).text_color(t.dim).child(`${Math.round(live.pct)}%`)))
      .when(!!claude, (el) => el.child(action("rc-refresh", "clock", L("Đọc lại transcript", "Re-read transcript"), (cx) => cx.spawn(async (cx) => { await this.refreshSession(true); cx.notify(); }))));
    const contextBlock = v_flex().child(section("context", L("Ngữ cảnh", "Context"), refresh))
      .when(this.open.context, (el) => el.child(ctxBlock()));

    // ---- Connectors / Skills / Plugins / Outputs (from the transcript) ----
    const waiting = !claude ? noClaude : !info ? L("Đang đọc phiên…", "Reading session…") : null;
    const dot = (c) => div().size(7).rounded(4).flex_none().bg(c);
    const connectors = info?.connectors ?? [];
    const connBlock = v_flex().child(section("connectors", L("Kết nối", "Connectors"), info ? connectors.length : null))
      .when(this.open.connectors, (el) => el.child(waiting ? dim(waiting) : !connectors.length ? dim(L("Phiên này không có MCP server.", "This session has no MCP servers."))
        : capped("connectors", connectors, 8, (c, i) => row(`rcn-${i}`, dot(c.status === "failed" ? t.ansi1 : c.status === "pending" ? t.ansi3 : t.ansi2), c.name, {
          color: c.status === "failed" ? t.dim : t.foreground,
          tip: c.status === "failed" ? L(`Lỗi kết nối: ${c.error}`, `Connection error: ${c.error}`) : c.status === "pending" ? L("Đang kết nối", "Connecting") : L(`${c.tools} tool`, `${c.tools} tools`),
          right: div().text_size(11).text_color(t.dim).child(c.status === "failed" ? L("lỗi", "error") : c.status === "pending" ? L("đang nối", "connecting") : L(`${c.tools} tool`, `${c.tools} tools`)),
        }))));
    const skillNames = info?.skills?.names ?? [];
    const usedSet = new Set(info?.skills?.used ?? []);
    const skillsSorted = [...skillNames].sort((a, b) => usedSet.has(b) - usedSet.has(a));
    const skillsBlock = v_flex().child(section("skills", L("Kỹ năng", "Skills"), info ? skillNames.length : null))
      .when(this.open.skills, (el) => el.child(waiting ? dim(waiting) : !skillNames.length ? dim(L("Không có skill.", "No skills."))
        : capped("skills", skillsSorted, 10, (s, i) => row(`rsk-${i}`, "layers", s, {
          color: usedSet.has(s) ? t.foreground : t.muted, iconColor: usedSet.has(s) ? t.accent : t.dim,
          right: usedSet.has(s) ? div().text_size(10.5).text_color(t.accent).child(L("đã dùng", "used")) : null,
        }))));
    const plugins = info?.plugins ?? [];
    const pluginsBlock = v_flex().child(section("plugins", L("Plugin", "Plugins"), info ? plugins.length : null))
      .when(this.open.plugins, (el) => el.child(waiting ? dim(waiting) : !plugins.length ? dim(L("Không có plugin.", "No plugins."))
        : capped("plugins", plugins, 8, (p, i) => row(`rpl-${i}`, "archive", p.name, {
          right: div().text_size(11).text_color(t.dim).child([p.skills && L(`${p.skills} skill`, `${p.skills} skills`), p.agents && L(`${p.agents} agent`, `${p.agents} agents`), p.mcp && `${p.mcp} MCP`].filter(Boolean).join(" · ")),
        }))));
    const outputs = info?.outputs ?? [];
    const outputsBlock = v_flex().child(section("outputs", L("Đầu ra", "Outputs"), info ? outputs.length : null))
      .when(this.open.outputs, (el) => el.child(waiting ? dim(waiting) : !outputs.length ? dim(L("Phiên này chưa tạo hay sửa file nào.", "This session hasn't created or edited any files."))
        : capped("outputs", outputs, 8, (o, i) => row(`rop-${i}`, o.action === "write" ? "file-text" : "square-pen", fileName(o.path), {
          tip: `${o.path} — ${L("mở trong VS Code", "open in VS Code")}`, act: () => this.openFile(o.path),
          iconColor: o.action === "write" ? t.ansi2 : t.ansi3,
          right: div().text_size(10.5).text_color(t.dim).child(o.action === "write" ? L("tạo", "created") : L("sửa", "edited")),
          actions: [action(`rop-dir-${i}`, "folder", L("Mở thư mục", "Open folder"), () => this.openFolder(dirName(o.path)))],
        }))));

    // Mode and the note under the header.
    const n = this.note;
    const nTone = n ? ({ busy: t.muted, ok: t.ansi2, warn: t.ansi3, error: t.ansi1 })[n.kind] ?? t.muted : null;
    // Scrolls without a painted bar: the bar sat over the numbers on the right.
    const body = v_flex().id("drail-body").flex_1().min_h(0).px(8).pb(14).overflow_y_scroll()
      .opacity(this.fade).transition("opacity", { duration: 220, easing: "ease-out" })
      .when(!!n, (el) => el.child(h_flex().id(`rnote-${n.id}`).mt(10).h(26).px(9).gap(7).items_center().rounded(8).bg(nTone + "1c").border_1().border_color(nTone + "55")
        .opacity(n.shown ? 1 : 0).transition("opacity", { duration: 180, easing: "ease-out" }).text_size(11.5)
        .child(n.kind === "busy" ? svg(ICON("spinner")).size(12).text_color(nTone).spin(800) : svg(ICON(n.kind === "ok" ? "check" : "x")).size(12).text_color(nTone))
        .child(div().flex_1().min_w(0).truncate().child(n.text))))
      .children([env, gitBlock, agentsBlock, contextBlock, connBlock, skillsBlock, pluginsBlock, outputsBlock].map((b) => b.w_full().min_w(0)))
      .when(!!info?.mode, (el) => el.child(div().px(6).pt(14).text_size(10.5).text_color(t.dim).child(L(`Mode của Claude: ${MODE_LABEL[info.mode] ?? info.mode}`, `Claude's mode: ${MODE_LABEL[info.mode] ?? info.mode}`))));

    // Header toolbar like Claude Desktop's session rail: terminal, changes, files, more, hide.
    const root = layout(), panel = find(root, "panel"), stack = find(root, "panel-body");
    const panelOn = (id) => !!panel && !panel.hidden && stack?.active === id;
    this.togglePanel = togglePanel;
    const tool = (id, icon, tip, act, on = false) => h_flex().id(`rt-${id}`).size(26).flex_none().items_center().justify_center().rounded(6).cursor_pointer()
      .when(on, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover)).tooltip(tip).on_click(act)
      .child(icon === "⋯" ? div().text_size(14).text_color(t.muted).child("⋯") : svg(ICON(icon)).size(14).text_color(on ? t.foreground : t.muted));

    return v_flex().id("drail").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_size(13).text_color(t.foreground)
      .on_size_change((size, cx) => this.sized(size, cx))
      .child(h_flex().h(42).flex_none().pl(14).pr(8).gap(4).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child(L("Phiên", "Session")))
        .child(div().flex_1().min_w(0).pl(4).truncate().text_size(12).text_color(t.dim).child(space ? space.name : ""))
        .child(tool("term", "terminal", L("Terminal mới (tab)", "New terminal (tab)"), () => run("tab.new")))
        .child(tool("changes", "git-compare", L("Diff (tab)", "Diff (tab)"), () => this.openDiff(null)))
        .child(tool("files", "files", L("Files (tab)", "Files (tab)"), () => this.openTab("Files", "desktop-files")))
        .child(tool("more", "⋯", L("Thêm", "More"), () => openOverlay({ mod: "desktop-rail", kind: "popup", width: 230, height: 230, props: { menu: true } })))
        .child(tool("close", "x", L("Ẩn rail (Ctrl+Shift+R)", "Hide rail (Ctrl+Shift+R)"), () => run("layout.hide", { id: "rail" }))))
      .child(body);
  }
}
