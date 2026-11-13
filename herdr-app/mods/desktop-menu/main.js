// Context menus (Herdr's items). Opened as a popup with
// props { tab: "pane" | "tab" | "space" | "global", target }.
// ↑/↓ move, Enter runs, Esc closes. An item is [label, command, args];
// a command "worktree" opens the worktree dialog instead.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, terminals, spaces, panes, exec, knownAgents, shared } from "herdr";
import { L, setLang } from "./i18n.js";

// Splitting an agent's pane starts another of the same agent (Claude, Antigravity, Codex…), with
// the run command from programs.json / knownAgents(); a shell's pane splits into a shell.
const sameAgent = (p, known) => (p?.program?.agent && known?.find((k) => k.key === p.program.key && k.installed)?.run) || null;


// Where a space is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

function items(p, git, known) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "pane": {
      // A kept sub-agent can go back under its parent, still running.
      const all = terminals();
      const term = all.find((t) => t.address === tg.terminal);
      const parent = term?.parent && all.find((t) => t.address === term.parent);
      // Once they go to the program, Shift+right-click still opens this menu.
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      // A terminal shown outside a tab (a layout terminal block, a window) has
      // no pane to split, zoom or close: its pane is the block's id.
      const me = panes().find((pane) => pane.pane === tg.pane);
      const inTab = !!me;
      const argv = sameAgent(me, known);
      const who = argv ? ` · ${me.program.name}` : "";
      return [
        ...(inTab
          ? [
              [`${L("Tách phải", "Split right")}${who}`, "pane.split", { direction: "right", pane: tg.pane, ...(argv ? { argv } : {}) }],
              [`${L("Tách xuống", "Split down")}${who}`, "pane.split", { direction: "down", pane: tg.pane, ...(argv ? { argv } : {}) }],
              ...(argv ? [[L("Tách phải · Terminal", "Split right · Terminal"), "pane.split", { direction: "right", pane: tg.pane }, ""]] : []),
              [L("Phóng to", "Zoom"), "pane.zoom", { pane: tg.pane }],
            ]
          : []),
        ...(term
          ? [
              toProgram
                ? [L("Dùng menu chuột phải của Herdr", "Use Herdr right-click menu"), "terminal.right_click", { terminal: term.address, to: "menu" }]
                : [L("Gửi chuột phải vào pane", "Send right-clicks to pane"), "terminal.right_click", { terminal: term.address, to: "program" }],
            ]
          : []),
        ...(parent ? [[L(`Trả về ${parent.name || parent.address}`, `Send back to ${parent.name || parent.address}`), "terminal.park", { terminal: term.address }]] : []),
        ...(inTab ? [[L("Đóng pane", "Close pane"), "pane.close", { pane: tg.pane }]] : []),
      ];
    }
    case "tab":
      return [
        [L("Đổi tên", "Rename"), "tab.rename", { id: tg.id }],
        [L("Tab mới", "New tab"), "tab.new", { space: tg.space }],
        [L("Đóng", "Close"), "tab.close", { id: tg.id }],
      ];
    case "space":
      return [
        [L("Đổi tên", "Rename"), "space.rename", { id: tg.id }],
        ...(git ? [[L("Worktree mới", "New worktree"), "worktree", { space: tg.id, action: "new" }], [L("Mở worktree", "Open worktree"), "worktree", { space: tg.id, action: "open" }]] : []),
        ...(git === "linked" ? [[L("Gỡ worktree", "Remove worktree"), "worktree", { space: tg.id, action: "remove" }]] : []),
        [L("Đóng", "Close"), "space.close", { id: tg.id }],
      ];
    default:
      return [
        [L("Không gian mới", "New space"), "space.new", {}],
        [L("Phím tắt", "Keyboard shortcuts"), "app.help", {}],
        [L("Giao diện: graphite", "Theme: graphite"), "app.theme", { name: "graphite" }],
        [L("Giao diện: ink", "Theme: ink"), "app.theme", { name: "ink" }],
        [L("Giao diện: moss", "Theme: moss"), "app.theme", { name: "moss" }],
        [L("Giao diện: atom one dark", "Theme: atom one dark"), "app.theme", { name: "atom-one-dark" }],
      ];
  }
}

function menuIcon(command) {
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : command === "app.help" ? "terminal" : command === "app.theme" ? "settings" : command === "pane.split" ? "panel-right" : command === "pane.zoom" ? "square" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}

// The key bound to a command, for the hint on the right.
function shortcut(name, args) {
  // In the desktop layout Ctrl+Shift+O / E split into the same agent (composer.split-*).
  if (name === "pane.split") {
    const k = keys().find((b) => b.action === `composer.split-${args?.direction}`);
    if (k) return k.keys;
  }
  // `pane.split:right` binds pane.split with { direction: "right" }.
  const value = args && Object.values(args)[0];
  const k = keys().find((b) => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  return k ? k.keys : "";
}

export default class Menu extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.at = 0;
    this.git = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.known = shared("agents.known"); // learned once by the composer
    if (!this.known) cx.spawn(async (cx) => { this.known = await knownAgents().catch(() => []); cx.notify(); });
    const p = props();
    const space = p?.tab === "space" && spaces().find((s) => s.id === p.target?.id);
    const folder = space && place(space);
    if (folder)
      cx.spawn(async (cx) => {
        this.git = await checkout(folder, space.machine).catch(() => null);
        cx.notify();
      });
  }

  choose(i, cx) {
    setLang(shared("lang"));
    const it = items(props(), this.git, this.known)[i];
    if (!it) return;
    closeOverlay(props()?.overlay);
    if (it[1] === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    else run(it[1], it[2]);
  }

  render(cx) {
    setLang(shared("lang"));
    const t = theme();
    const list = items(props(), this.git, this.known);
    return v_flex()
      .id("menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at, cx);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((it, i) =>
          v_flex()
            .when(i > 0 && (it[1].endsWith(".close") || it[1] === "app.help" || (it[1] === "app.theme" && list[i - 1][1] !== "app.theme")), el => el.child(div().mx(7).my(4).h(1).bg(t.border)))
            .child(h_flex()
            .id(`mi-${i}`)
            .h(31)
            .px(8)
            .gap(9)
            .rounded(7)
            .items_center()
            .justify_between()
            .text_color(t.foreground)
            .when(i === this.at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.choose(i, cx))
            .child(svg(menuIcon(it[1])).size(14).flex_none().text_color(t.muted))
            .child(div().flex_1().min_w(0).truncate().child(it[0]))
            .child(div().text_size(11).text_color(t.dim).child(it[3] ?? shortcut(it[1], it[2])))),
        ),
      );
  }
}
