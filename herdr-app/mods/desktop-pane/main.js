// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "desktop-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, shared, spaces } from "herdr";
import { L, setLang } from "./i18n.js";

// Tabs the custom mods name when they make them keep that name; shown in the interface language.
const TEAM = "Phòng ban · ";
const tabLabel = (n) => n === "Bảng việc" ? L("Bảng việc", "Board") : n === "Files" ? L("Tệp", "Files") : n === "Changes" ? L("Thay đổi", "Changes")
  : n?.startsWith(TEAM) ? L(n, `Team · ${n.slice(TEAM.length)}`) : n;

// A role's shown name, translated; unknown roles keep the stored label.
const roleName = (m) => ({
  lead: L("Điều phối", "Coordinator"), dev: "DEV", qa: "QA", review: "Review",
  "dev-b": L("DEV (hướng 2)", "DEV (2nd)"), docs: "Docs", research: L("Nghiên cứu", "Research"), scout: L("Trinh sát", "Scout"),
})[m.role] ?? m.label ?? m.role;

// A department role's colour; the team mod's board uses the same (mods/team/ui.js ROLE_TONE).
// The coordinator's purple is fixed: the themes' magenta reads close to DEV's blue.
const ROLE_TONE = { lead: "#c084fc", dev: "ansi4", "dev-b": "ansi4", qa: "ansi2", review: "ansi6", docs: "ansi3", research: "ansi3", scout: "ansi3" };
const roleTone = (t, role) => ROLE_TONE[role]?.startsWith("#") ? ROLE_TONE[role] : t[ROLE_TONE[role]] ?? t.accent;

// Splitting an agent's pane starts another of the same agent (Claude, Antigravity, Codex…), with
// the run command from programs.json / knownAgents(); a shell's pane splits into a shell.
const sameAgent = (p, known) => (p?.program?.agent && known?.find((k) => k.key === p.program.key && k.installed)?.run) || null;


function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.hovered = false;
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args, tip) {
    return div()
      .id(id)
      .tooltip(tip ?? "")
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/desktop-pane/${icon}.svg`).size(14));
  }

  render(cx) {
    setLang(shared("lang"));
    const t = theme();
    const p = this.me();
    if (!p) return div();
    // A mod pane (a board, a diff) goes by its tab's name when someone named it, not the mod's folder.
    const tab = p.mod ? spaces().flatMap((s) => s.tabs).find((x) => x.id === p.tab) : null;
    const name = (tab?.named && tabLabel(tab.name)) || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    // A department member's pane says its role first (shared "teams", this space's team first).
    const teams = shared("teams") ?? {};
    const here = spaces().find((s) => s.tabs.some((x) => x.id === p.tab));
    const mates = (team) => team ? [team.lead, ...(team.members ?? [])].filter(Boolean) : [];
    const mate = p.terminal && (mates(teams[here?.id]).find((m) => m.address === p.terminal)
      ?? Object.values(teams).flatMap(mates).find((m) => m.address === p.terminal));
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    const argv = sameAgent(p, shared("agents.known")); // learned once by the composer
    const split = (direction) => ({ direction, pane, ...(argv ? { argv } : {}) });
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .when(Boolean(mate), (el) => el.child(div().flex_none().px(7).h(18).flex().items_center().rounded(5).bg(roleTone(t, mate.role) + "2e")
        .text_size(11.5).font_semibold().text_color(roleTone(t, mate.role)).tooltip(`${roleName(mate)} · ${mate.address}`).id(`ph-role-${pane}`).child(roleName(mate))))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(mate ? t.muted : t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working) /* static: no repaint loop */))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child(L("Cần bạn", "Needs you"))))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", split("right"), `${L("Tách phải", "Split right")}${argv ? L(` · ${p.program.name} mới`, ` · new ${p.program.name}`) : ""}`))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", split("down"), `${L("Tách xuống", "Split down")}${argv ? L(` · ${p.program.name} mới`, ` · new ${p.program.name}`) : ""}`))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
