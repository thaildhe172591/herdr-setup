// Status bar of the "desktop" layout: machine and branch, the tab's Claude (model · context ·
// 5-hour limit, from the rail's shared "claude.status"), how many agents need you (click: the
// "Cần bạn" box), and the F1 hint.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, focused, run, theme, shared } from "herdr";
import { statusFor } from "./model.js";

export default class DesktopStatus extends View {
  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const all = agents();
    const blocked = all.filter((a) => a.status === "blocked");
    const done = all.filter((a) => a.status === "done");
    const need = blocked.length + done.length;
    const s = statusFor(shared("claude.status"), all, focused()); // only the focused tab's live Claude
    const pct = s?.ctxPct;
    const ctxColor = pct == null ? t.dim : pct >= 80 ? t.ansi1 : pct >= 60 ? t.ansi3 : t.dim;
    return h_flex().id("dst").size_full().px(14).gap(14).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
      .child(h_flex().gap(6).items_center().child(svg("mods/workspace-chrome/monitor.svg").size(12)).child(space?.machine ?? "This computer"))
      .when(!!space?.branch, (el) => el.child(h_flex().gap(6).items_center().child(svg("mods/workspace-chrome/git-branch.svg").size(12)).child(space.branch)))
      .child(h_flex().id("dst-need").gap(6).items_center().cursor_pointer()
        .text_color(blocked.length ? t.blocked : need ? t.done : t.dim)
        .on_click(() => { if (need) run("mod.open", { name: "needs-you" }); })
        .child(div().size(6).rounded(3).bg(blocked.length ? t.blocked : need ? t.done : t.border)
          .when(blocked.length > 0, (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1400 })))
        .child(need ? `${need} cần bạn` : `${all.length} agent${all.length === 1 ? "" : "s"}`))
      .child(div().flex_1())
      .when(!!s?.model, (el) => el.child(div().text_color(t.muted).child([s.model, s.effort].filter(Boolean).join(" "))))
      .when(pct != null, (el) => el.child(div().text_color(ctxColor).child(`ctx ${Math.round(pct)}%`)))
      .when(!!s?.fiveHour, (el) => el.child(div().child(`5h ${Math.round(s.fiveHour.pct)}%`)))
      .child(h_flex().id("dst-rail").gap(5).items_center().cursor_pointer().hover((st) => st.text_color(t.foreground))
        .tooltip("Bật/tắt session rail (Ctrl+Shift+R)").on_click(() => run("layout.toggle", { id: "rail" }))
        .child(svg("mods/workspace-chrome/panel-right.svg").size(12)).child("Rail"))
      .child("F1 phím tắt");
  }
}
