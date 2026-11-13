// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, readTextFile, home } from "herdr";
import { projectOf, projects } from "./projects.js";
import { L, setLang } from "./i18n.js";

// A department role's shown name, translated; unknown roles keep the stored label.
const roleName = (m) => ({
  lead: L("Điều phối", "Coordinator"), dev: "DEV", qa: "QA", review: "Review",
  "dev-b": L("DEV (hướng 2)", "DEV (2nd)"), docs: "Docs", research: L("Nghiên cứu", "Research"), scout: L("Trinh sát", "Scout"),
})[m.role] ?? m.label ?? m.role;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
// Group by and Sort by combine freely (shared "agents.view"), like the Spaces ≡ menu.
const GROUPS = [
  { id: "status", get label() { return L("Trạng thái", "Status"); }, icon: "clock" },
  { id: "space", get label() { return L("Space", "Space"); }, icon: "layers" },
  { id: "project", get label() { return L("Dự án", "Project"); }, icon: "folder" },
  { id: "project-space", get label() { return L("Dự án › Space", "Project › Space"); }, icon: "folder" },
  { id: "none", get label() { return L("Không nhóm", "No grouping"); }, icon: "square" },
];
const ORDERS = [
  { id: "priority", get label() { return L("Ưu tiên (cần bạn trước)", "Priority (needs you first)"); } },
  { id: "recent", get label() { return L("Mới hoạt động", "Recently active"); } },
  { id: "name", get label() { return L("Tên", "Name"); } },
  { id: "manual", get label() { return L("Thứ tự space", "Space order"); } },
];
// The old two-way "agents.sort" maps onto it: priority = status + priority, grouped = space + space order.
function viewOf() {
  const v = shared("agents.view");
  if (v?.group) return { group: v.group, order: v.order ?? "priority" };
  return shared("agents.sort") === "grouped" ? { group: "space", order: "manual" } : { group: "status", order: "priority" };
}
const sortOf = () => { const v = viewOf(); const g = GROUPS.find((x) => x.id === v.group) ?? GROUPS[0]; return { ...g, label: `${g.label} · ${ORDERS.find((o) => o.id === v.order)?.label ?? ""}` }; };
const SECTION = {
  get 4() { return L("Cần bạn", "Needs you"); }, get 3() { return L("Xong", "Done"); },
  get 2() { return L("Đang làm", "Working"); }, get 1() { return L("Rảnh", "Idle"); },
};
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return L("vừa xong", "just now");
  if (m < 60) return L(`${m} phút`, `${m} min`);
  const h = Math.floor(m / 60);
  return h < 24 ? L(`${h} giờ`, `${h} h`) : L(`${Math.floor(h / 24)} ngày`, `${Math.floor(h / 24)} d`);
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    if (props()?.sortMenu) return;
    if (props()?.agentMenu) { this.menuFocus = cx.focus_handle(); this.menuFocus.focus(); return; } // the agent menu copy draws a menu only
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  // Two parts that combine: how agents group, and how they sort inside a group. The menu stays open.
  sortMenu(t) {
    const v = viewOf();
    const opt = (key, o) => h_flex()
      .id(`sort-${key}-${o.id}`)
      .h(29).px(8).gap(9).rounded(7).items_center()
      .text_color(t.foreground)
      .hover((el) => el.bg(t.hover))
      .on_click(() => setShared("agents.view", { ...v, [key]: o.id }))
      .when(!!o.icon, (el) => el.child(svg(`mods/workspace-chrome/${o.icon}.svg`).size(14).flex_none().text_color(t.muted)))
      .child(div().flex_1().child(o.label))
      .when(v[key] === o.id, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.accent)));
    return v_flex()
      .w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(4).text_size(11).text_color(t.dim).child(L("Nhóm theo", "Group by")))
      .children(GROUPS.map((g) => opt("group", g)))
      .child(div().h(1).mx(6).my(4).bg(t.border))
      .child(div().px(8).pt(2).pb(4).text_size(11).text_color(t.dim).child(L("Sắp xếp trong nhóm", "Sort within group")))
      .children(ORDERS.map((o) => opt("order", o)))
      .child(div().h(1).mx(6).my(4).bg(t.border))
      .child(h_flex().id("sort-reset").h(29).px(8).items_center().rounded(7).text_color(t.foreground).hover((el) => el.bg(t.hover))
        .on_click(() => { setShared("agents.view", null); setShared("agents.sort", null); setShared("agents.hideNested", null); }).child(L("Đặt lại mặc định", "Reset to defaults")))
      .child(div().h(1).mx(6).my(4).bg(t.border))
      .child(h_flex().id("sort-nested").h(29).px(8).gap(9).items_center().rounded(7).text_color(t.foreground).hover((el) => el.bg(t.hover))
        .on_click(() => setShared("agents.hideNested", !shared("agents.hideNested")))
        .child(svg("mods/workspace-chrome/git-branch.svg").size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(L("Ẩn phiên con", "Hide sub-sessions")))
        .when(!!shared("agents.hideNested"), (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.accent))));
  }

  openMenu(address) {
    openOverlay({ mod: "desktop-agents", kind: "popup", width: 280, height: 470, props: { agentMenu: address } });
  }

  // One agent's actions, like Claude Desktop's session menu; letters are shortcuts while it is open.
  // Works for any agent (Claude Code, Codex, Antigravity…); Fork needs Claude Code's session id.
  agentMenu(t) {
    const addr = props().agentMenu;
    const a = agents().find((x) => x.address === addr) ?? null;   // null: a sub-session without a pane
    const term = terminals().find((x) => x.address === addr) ?? null;
    const close = () => closeOverlay(props().overlay);
    const isClaude = (a?.app ?? term?.agent) === "claude-code";
    const name = a ? `${a.space_name} · ${a.title || a.tab_name || a.program?.name || addr}` : term?.name || term?.program?.name || addr;
    const toComposer = (kind) => {
      setShared("composer.targets", [addr]);
      if (kind) setShared("composer.do", { kind, terminal: addr, at: Date.now() });
      run("composer.focus");
      close();
    };
    const fork = (cx) => cx.spawn(async () => {
      try {
        const j = JSON.parse(await readTextFile(`${home()}\\AppData\\Local\\herdr-claude\\${addr.replace(/[^\w.-]/g, "_")}.json`));
        const sid = j?.input?.session_id;
        if (sid) run("tab.new", { space: a?.space, name: `Fork · ${(a?.title || a?.tab_name || "Claude").slice(0, 20)}`, argv: ["claude", "--resume", sid, "--fork-session"] });
      } catch {}
      close();
    });
    const entries = [
      { id: "send", key: "M", icon: "square-pen", label: L("Gửi tin cho agent này", "Message this agent"), act: () => toComposer(null) },
      { id: "child", key: "N", icon: "git-branch", label: L("Tạo phiên con…", "New sub-session…"), hint: "Ctrl+Enter", act: () => toComposer("child") },
      { id: "reply", key: "C", icon: "files", label: L("Chèn câu trả lời vào khung chat", "Insert reply into composer"), act: () => toComposer("reply") },
      "-",
      { id: "peek", key: "V", icon: "search", label: L("Xem nhanh", "Peek"), act: () => { run("terminal.peek", { terminal: addr }); close(); } },
      a && { id: "go", key: "G", icon: "chevron-right", label: L("Chuyển tới tab của agent", "Go to agent's tab"), act: () => { run("agent.focus", { terminal: addr }); close(); } },
      !a && { id: "keep-r", key: "O", icon: "panel-right", label: L("Mở thành pane bên phải", "Open as pane on the right"), act: () => { run("terminal.keep", { terminal: addr, place: "right" }); close(); } },
      !a && { id: "keep-t", key: "T", icon: "square", label: L("Mở thành tab riêng", "Open as its own tab"), act: () => { run("terminal.keep", { terminal: addr, place: "tab" }); close(); } },
      "-",
      isClaude && a && { id: "fork", key: "F", icon: "git-compare", label: L("Fork phiên (tab mới)", "Fork session (new tab)"), act: (cx) => fork(cx) },
      a && { id: "pin", key: "P", icon: a.pinned ? "pin-off" : "pin", label: a.pinned ? L("Bỏ ghim", "Unpin") : L("Ghim lên đầu", "Pin to top"), act: () => { run("terminal.pin", { terminal: addr, pinned: !a.pinned }); close(); } },
      a && { id: "rename", key: "R", icon: "square-pen", label: L("Đổi tên tab…", "Rename tab…"), act: () => { close(); run("tab.rename", { id: a.tab }); } },
      { id: "nest", key: "H", icon: "layers", label: L("Ẩn / hiện phiên con", "Hide / show sub-sessions"), act: () => { setShared("agents.toggleFold", { address: addr, at: Date.now() }); close(); } },
      "-",
      { id: "stop", key: "D", icon: "x", label: this.confirmStop ? L("Bấm lần nữa để dừng hẳn", "Click again to stop for good") : L("Dừng agent…", "Stop agent…"), danger: true,
        act: (cx) => { if (!this.confirmStop) { this.confirmStop = true; cx.notify(); return; } run("terminal.kill", { terminal: addr }); close(); } },
    ].filter(Boolean);
    const rows = entries.filter((e, i, l) => e !== "-" || (i > 0 && l[i - 1] !== "-" && i < l.length - 1));
    return v_flex().id("agent-menu").track_focus(this.menuFocus).w_full().p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        const hit = entries.find((x) => x !== "-" && x.key?.toLowerCase() === e.key?.toLowerCase());
        if (e.key === "escape") return close();
        if (hit) { hit.act(cx); cx.stop_propagation(); }
      })
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).truncate().child(name))
      .children(rows.map((e, i) => e === "-"
        ? div().id(`am-sep-${i}`).h(1).mx(6).my(4).bg(t.border)
        : h_flex().id(`am-${e.id}`).h(30).px(9).gap(9).items_center().rounded(7).cursor_pointer().hover((s) => s.bg(t.hover))
            .text_color(e.danger ? t.ansi1 : t.foreground).on_click((_e, cx) => e.act(cx))
            .child(svg(`mods/workspace-chrome/${e.icon}.svg`).size(14).flex_none().text_color(e.danger ? t.ansi1 : t.muted))
            .child(div().flex_1().min_w(0).truncate().child(e.label))
            .when(!!e.hint, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(e.hint)))
            .child(div().w(12).text_size(11).text_color(t.dim).child(e.key ?? ""))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.openMenu(k.address); })
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working) /* static: no repaint loop */;
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child(L("Cần bạn", "Needs you"));
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    setLang(shared("lang"));
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    if (props()?.agentMenu) return this.agentMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    // `ha`'s project scope: agents of the spaces it shows.
    const scope = shared("scope");
    const lower = (p) => String(p ?? "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    // A project group (projects.json "groups") widens the scope to all its folders.
    const scopes = scope ? (Object.values(shared("projects.groups") ?? {}).find((rs) => rs.some((r) => lower(r) === lower(scope))) ?? [scope]) : [];
    const shownSpaces = scope ? new Set(spaces().filter((s) => s.active || scopes.some((f) => lower(s.folder) === lower(f) || lower(s.folder).startsWith(lower(f) + "\\"))).map((s) => s.id)) : null;
    let list = agents().filter((a) => !shownSpaces || shownSpaces.has(a.space));
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const view = viewOf();
    const byPriority = view.group === "status"; // status sections, as Herdr's "Priority"
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    // Group order first (status rank, space order, project order), then the chosen order inside.
    const sps = spaces(), spaceIdx = new Map(sps.map((s, i) => [s.id, i]));
    const allRoots = [...new Set([...(shared("projects.roots") ?? []), ...Object.values(shared("projects.groups") ?? {}).flat()])];
    const projs = projects(allRoots, shared("projects.groups") ?? {});
    const projOf = (a) => {
      const r = projectOf(sps.find((s) => s.id === a.space)?.folder, allRoots);
      const i = r ? projs.findIndex((p) => p.roots.some((x) => x.toLowerCase() === r.toLowerCase())) : -1;
      return i < 0 ? { key: "other", label: L("Khác", "Other"), i: projs.length } : { key: projs[i].key, label: projs[i].label, i };
    };
    const gkey = { status: (a) => [-(rankOf(a) || RANK.idle)], space: (a) => [spaceIdx.get(a.space) ?? 0], project: (a) => [projOf(a).i],
      "project-space": (a) => [projOf(a).i, spaceIdx.get(a.space) ?? 0], none: () => [] }[view.group] ?? (() => []);
    const name = (a) => `${a.space_name ?? ""} ${a.title || a.tab_name || ""}`;
    const inner = { priority: (x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq,
      recent: (x, y) => this.since(y) - this.since(x) || y.seq - x.seq, name: (x, y) => name(x).localeCompare(name(y)), manual: () => 0 }[view.order] ?? (() => 0);
    const byKey = (x, y) => { const a = gkey(x), b = gkey(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    list = [...list].sort((x, y) => byKey(x, y) || inner(x, y));
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    // The agent menu's "Ẩn/hiện phiên con" (another copy of this mod) asks through shared state.
    const req = shared("agents.toggleFold");
    if (req && req.at !== this.foldReq) {
      this.foldReq = req.at;
      this.folded.has(req.address) ? this.folded.delete(req.address) : this.folded.add(req.address);
    }
    const hideNested = !!shared("agents.hideNested");
    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (hideNested ? !this.folded.has(a.address) : this.folded.has(a.address)) return [r]; // hidden: unfolding one shows it
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? L("Bỏ ghim", "Unpin") : L("Ghim lên đầu", "Pin to the top"))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned || view.group === "project" || view.group === "none";
      // A department member reads as its role (Trưởng nhóm, Review…); the icon says Claude / Codex / Antigravity.
      const team = (shared("teams") ?? {})[a.space];
      const role = team && [team.lead, ...(team.members ?? [])].find((x) => x?.address === a.address);
      const name = role ? `${roleName(role)}${full ? ` · ${a.space_name}` : ""}`
        : full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.openMenu(a.address); })
        .when(this.hovered === a.address, el => el.child(pin).child(div().id(`more-${a.address}`).flex_none().px(3).rounded(4).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(L("Thao tác (chuột phải)", "Actions (right-click)"))
          .on_click((_e, cx) => { cx.stop_propagation(); this.openMenu(a.address); }).child("⋯")))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    // "Dự án › Space": a project header, then its spaces as sub-headers (level 1).
    const groups = pinned.length ? [{ id: "pinned", label: L("Đã ghim", "Pinned"), status: null, members: pinned }] : [];
    let project = null;
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const p = view.group.startsWith("project") ? projOf(a) : null;
      if (view.group === "project-space" && p.key !== project) { project = p.key; groups.push({ id: `pj-${p.key}`, label: p.label, status: null, members: [], level: 0, parent: true, project: p.key }); }
      if (view.group === "project-space") groups.findLast((g) => g.parent).members.push(a); // its count and top state
      const id = { status: `sec-${r}`, space: `sp-${a.space}`, project: `pj-${p?.key}`, "project-space": `ps-${a.space}`, none: "all" }[view.group] ?? "all";
      const label = { status: SECTION[r], space: a.space_name || "", project: p?.label, "project-space": a.space_name || "", none: null }[view.group];
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label, status: byPriority ? SECTION_STATUS[r] : null, members: [a], level: view.group === "project-space" ? 1 : 0, project: p?.key,
        space: view.group === "space" || view.group === "project-space" ? a.space : null });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .when(g.level === 1, (el) => el.pl(18).pt(4).h(24)) // a space under its project
        .when(!!g.parent, (el) => el.font_semibold())
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        // Tree: a chevron for every foldable level, then a project's folder or a space's avatar.
        .when(!byPriority && g.id !== "pinned", (el) => el.child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(10).flex_none().text_color(t.dim)))
        .when(!!g.parent || (view.group === "project" && g.level === 0), (el) => el.child(svg("mods/workspace-chrome/folder.svg").size(13).flex_none().text_color(t.muted)))
        .when(!!g.space, (el) => {
          const tone = t[(shared("space.colors") ?? {})[g.space]] ?? t.dim;
          return el.child(div().size(15).flex_none().rounded(4).bg(tone).flex().items_center().justify_center()
            .text_size(9.5).font_semibold().text_color(t.background).child(clean(g.label).charAt(0).toUpperCase() || "?"));
        })
        .child(div().flex_1().min_w(0).truncate()
          .text_color(g.status ? t[g.status] ?? t.dim : g.parent ? t.muted : g.space ? t.foreground : t.dim)
          .when(!!g.space, (el) => el.text_size(12)).child(g.label))
        .when(!open && !byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
        .child(div().flex_none().text_size(10.5).text_color(t.dim).child(String(g.members.length)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : (() => {
          let hidden = null; // a folded project hides its spaces
          return groups.flatMap((g) => {
            if (g.level === 1 && hidden === g.project) return [];
            if (g.parent) { hidden = this.folded.has(g.id) ? g.project : null; return [header(g)]; }
            if (g.label == null) return g.members.flatMap(withKids);
            if (this.folded.has(g.id)) return [header(g)];
            const tree = !byPriority && g.id !== "pinned";
            return [header(g), tree
              ? v_flex().ml(g.level === 1 ? 24 : 13).pl(2).border_l(1).border_color(t.border).children(g.members.flatMap(withKids))
              : v_flex().children(g.members.flatMap(withKids))];
          });
        })();

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child(L("Agent", "Agents")))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "desktop-agents", kind: "popup", width: 240, height: 440, props: { sortMenu: true } }))
                .tooltip(L(`Sắp xếp agent: ${sort.label}`, `Sort agents: ${sort.label}`))
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child(L("Chưa có trạng thái agent nào. Agent sẽ hiện ở đây khi báo trạng thái của mình. Phiên bản cũ và agent chạy trong tmux có thể không báo.", "No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not."))),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scroll().children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
