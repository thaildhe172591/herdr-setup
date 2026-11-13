import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, nextCommand } from "herdr";
import { L, setLang } from "./i18n.js";

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

export default class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  // desktop-chrome.lang-vi / .lang-en (keys, scripts) set the language; both copies get them, so
  // they set rather than toggle.
  init(_props, cx) {
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "lang-vi" || c === "lang-en") setShared("lang", c.slice(5)); cx.notify(); } });
  }
  // The UI language of every custom mod (shared "lang", docs/i18n-glossary.md): VI | EN.
  langPill(t) {
    const now = shared("lang") === "en" ? "en" : "vi";
    return h_flex().id("lang").flex_none().p(2).gap(2).rounded(7).bg(t.hover).tooltip(L("Ngôn ngữ giao diện", "Interface language"))
      .children(["vi", "en"].map((l) => div().id(`lang-${l}`).px(7).h(18).flex().items_center().rounded(5).text_size(11).cursor_pointer()
        .when(now === l, (x) => x.bg(t.popover).text_color(t.foreground))
        .when(now !== l, (x) => x.text_color(t.dim).hover((y) => y.text_color(t.foreground)))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { cx.stop_propagation(); setShared("lang", l); })
        .child(l.toUpperCase())));
  }
  render() {
    setLang(shared("lang"));
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/desktop-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      const ready = div().size(6).rounded_full().bg(t.accent);
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
        .when(collapsed, el => el.px(0).items_center())
        .child(row("settings", "settings", L("Cài đặt", "Settings"), false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .child(row("machine", "plus", L("Thêm máy", "Add machine"), true, () => run("mod.open", { name: "machine-add" })))
        // Its own row: VI | EN beside the label; on the rail, the icon switches.
        .child(row("language", "languages", L("Ngôn ngữ", "Language"), true,
            () => { if (collapsed) setShared("lang", shared("lang") === "en" ? "vi" : "en"); })
          .when(collapsed, el => el.tooltip(L("Ngôn ngữ: Tiếng Việt · bấm để đổi sang English", "Language: English · click for Tiếng Việt")))
          .when(!collapsed, el => el.child(div().flex_1()).child(this.langPill(t))));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("frame/welcome/herdr.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/desktop-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/desktop-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
