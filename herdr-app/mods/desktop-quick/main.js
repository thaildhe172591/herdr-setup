// Quick actions under the Herdr brand in the "desktop" layout, drawn like the Spaces list's own
// rows (28px, dim 12px text that lights up on hover; icon cells when the sidebar is a rail):
// Phiên mới (Ctrl+Shift+N), Mở dự án (Ctrl+Shift+J), Cần bạn (Ctrl+Shift+Space) with a count that pulses
// while an agent waits on you, Phòng ban (Ctrl+Shift+D) with the space's live members.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, run, theme, shared } from "herdr";
import { L, setLang } from "./i18n.js";

const ICON = (n) => `mods/workspace-chrome/${n}.svg`;

export default class DesktopQuick extends View {
  init() { this.width = 268; }

  render() {
    setLang(shared("lang"));
    const t = theme();
    const collapsed = this.width < 160;
    const all = agents();
    const blocked = all.filter((a) => a.status === "blocked").length;
    const need = blocked + all.filter((a) => a.status === "done").length;

    const row = (id, icon, label, hint, act, extra) => h_flex().id(`dq-${id}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
      .cursor_pointer().text_size(12).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(act)
      .when(collapsed, (el) => el.justify_center().tooltip(`${label} (${hint})`).child(svg(ICON(icon)).size(14)))
      .when(!collapsed, (el) => el
        .child(svg(ICON(icon)).size(12).flex_none())
        .child(div().flex_1().truncate().child(label))
        .when(!!extra, (e2) => e2.child(extra))
        .child(div().text_size(10.5).text_color(t.dim).opacity(0.7).child(hint)));

    const badge = need
      ? div().id("dq-badge").px(6).h(16).flex().items_center().rounded(8).text_size(10.5).font_bold()
          .bg((blocked ? t.blocked : t.done) + "33").text_color(blocked ? t.blocked : t.done).child(String(need))
          .when(blocked > 0, (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1400 })) // native, as the status bar's dot
      : null;

    // Live members of every department in this space (it may hold several).
    const sid = spaces().find((x) => x.active)?.id;
    const alive = Object.entries(shared("teams") ?? {}).filter(([k, x]) => k === sid || x?.space === sid)
      .flatMap(([, x]) => [x.lead, ...(x.members ?? [])]).filter((m) => all.some((a) => a.address === m?.address)).length;
    const teamBadge = alive
      ? div().px(6).h(16).flex().items_center().rounded(8).text_size(10.5).font_bold().bg(t.accent + "26").text_color(t.accent).child(String(alive))
      : null;

    return v_flex().id("dq").size_full().min_h(0).px(collapsed ? 0 : 8).pt(2).pb(4).bg(t.chrome).items_stretch()
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 1) { this.width = size.width; cx.notify(); } })
      .child(row("new", "plus", L("Phiên mới", "New session"), "Ctrl+Shift+N", () => run("mod.open", { name: "new-session" })))
      .child(row("projects", "folder", L("Mở dự án", "Open project"), "Ctrl+Shift+J", () => run("mod.open", { name: "projects" })))
      .child(row("need", "circle-check", L("Cần bạn", "Needs you"), "Ctrl+Shift+Space", () => run("mod.open", { name: "needs-you" }), badge))
      // The space's department (or a new one): coordinator, DEV, QA, review.
      .child(row("team", "layers", L("Phòng ban", "Teams"), "Ctrl+Shift+D", () => run("mod.open", { name: "team" }), teamBadge))
      .child(div().mx(collapsed ? 6 : 8).mt(4).h(1).bg(t.border));
  }
}
