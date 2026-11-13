// A read-only view of one file, beside the Files tree like VS Code's editor beside its Explorer.
// Files opens it with pane.split {mod: "desktop-viewer", props: {tab}} and picks the file with
// shared "files.open.<tab>" = {root, on, path, at}: one viewer per tab, the next click replaces its file.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { panes, props, run, readTextFile, theme, settings, shared } from "herdr";
import { L, setLang } from "./i18n.js";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };

export default class Viewer extends View {
  init() { setLang(shared("lang")); this.key = null; }

  load(want, key, cx) {
    this.code?.release(); this.code = null; this.error = null; this.key = key; this.path = want?.path ?? null;
    if (!want?.path) return;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${want.root}/${want.path}`, { on: want.on });
        if (this.key !== key) return;
        if (text === null) { this.error = L("Tệp này không còn nữa", "This file is no longer available"); return; }
        if (text.includes("\0")) { this.error = L("Tệp nhị phân · không xem trước được", "Binary file · no text preview"); return; }
        const t = theme(), ext = want.path.includes(".") ? want.path.split(".").pop().toLowerCase() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + L("\n… (đã cắt bớt tệp)", "\n… (file truncated)") : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.key === key) this.error = L("Không xem trước được tệp này (nhị phân, quá lớn hoặc không đọc được)", "Cannot preview this file (binary, too large, or unreadable)"); }
      finally { cx.notify(); }
    });
  }

  render(cx) {
    setLang(shared("lang"));
    const t = theme(), tab = props()?.tab, want = shared(`files.open.${tab}`);
    const key = want ? `${want.root}|${want.path}|${want.at}` : null;
    if (key !== this.key) this.load(want, key, cx);
    const parts = this.path?.split("/") ?? [], name = parts.pop();
    const close = () => { const me = panes().find(p => p.tab === tab && p.mod === "desktop-viewer"); if (me) run("pane.close", { pane: me.pane }); };
    return v_flex().id("viewer").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_none().font_semibold().child(name ?? L("Xem tệp", "Viewer")))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(parts.join("/")))
        .child(div().id("viewer-close").size(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer().text_color(t.dim)
          .hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(L("Đóng", "Close")).on_click(close).child(svg("mods/pane/close.svg").size(12))))
      .child(this.code ? Editor.new(this.code).flex_1().min_h(0)
        : div().p(12).text_color(t.dim).child(this.error || (this.path ? L("Đang tải tệp…", "Loading file…") : L("Chọn một tệp ở cây thư mục", "Pick a file in the tree"))));
  }
}
