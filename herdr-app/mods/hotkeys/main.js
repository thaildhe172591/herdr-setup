// Hotkey sheet (F1, or the ⌨ button in the desktop sidebar): every binding keys.json has now,
// in Vietnamese, plus Claude Code's own keys. Type to filter (accents optional), Esc to close.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { keys, theme, props, closeOverlay, shared } from "herdr";
import { hotkeyRows } from "./model.js";
import { L, setLang } from "./i18n.js";

export default class Hotkeys extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.filter = "";
    this.input = InputState.new({ placeholder: L("Lọc phím tắt… (vd: tab, du an, esc)", "Filter shortcuts… (e.g. tab, project, esc)") });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  render() {
    setLang(shared("lang"));
    const t = theme();
    const rows = hotkeyRows(keys(), this.filter);
    const groups = [];
    for (const r of rows) (groups.at(-1)?.name === r.group ? groups.at(-1).rows : groups[groups.push({ name: r.group, rows: [] }) - 1].rows).push(r);
    const chip = (k) => div().px(6).h(20).flex().items_center().rounded(5).bg(t.raised).border_1().border_color(t.border).text_size(11).text_color(t.foreground).child(k);
    return v_flex()
      .id("hotkeys").track_focus(this.handle)
      .size_full().min_h(0).p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(L("Phím tắt", "Keyboard shortcuts"))).child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(
        h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        v_flex().id("hk-list").flex_1().min_h(0).overflow_y_scroll().gap(2)
          .when(!rows.length, (el) => el.child(div().px(4).py(8).text_color(t.dim).child(L("Không có phím nào khớp.", "No matching shortcuts."))))
          .children(groups.map((g) => v_flex().gap(1)
            .child(div().px(4).pt(8).pb(3).text_size(11).font_semibold().text_color(t.dim).child(g.name))
            .children(g.rows.map((r, i) => h_flex().id(`hk-${g.name}-${i}`).h(28).px(6).gap(10).items_center().rounded(6).hover((s) => s.bg(t.hover))
              .child(div().flex_1().truncate().text_color(t.foreground).child(r.label))
              .child(h_flex().gap(4).children(r.keys.split(" ").map(chip))))))),
      );
  }
}
