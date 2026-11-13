// New session (Ctrl+Shift+N in the desktop layout, or the sidebar's New), like Claude Desktop's:
// pick where (this computer or an SSH machine), a folder (recent, projects, or any folder via
// "Mở thư mục…"), an agent and an optional first message, then Bắt đầu: a space with one tab
// running the agent. "Lưu thành dự án" adds the folder to projects.json (name, dev, check).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, theme, props, closeOverlay, appHome, shared, setShared, readTextFile, writeTextFile, knownAgents, pickFolder, hc, notify } from "herdr";
import { folderChoices, addSaved, tabName } from "./model.js";
import { L, setLang } from "./i18n.js";

const CONFIG = () => `${appHome()}\\projects.json`;
const TERMINAL = { key: "terminal", name: "Terminal", run: null };

export default class NewSession extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.recent = [];
    this.saved = [];
    this.machines = [];
    this.machine = null; // null = this computer
    this.agents = [TERMINAL];
    this.agentKey = "claude";
    this.picked = null; // a folder chosen with "Mở thư mục…"
    this.at = 0;
    this.saving = false;
    this.handle = cx.focus_handle();
    const input = (placeholder, onSubmit) => {
      const s = InputState.new({ placeholder });
      s.on("change", (_e, cx) => { this.at = 0; cx.notify(); });
      if (onSubmit) s.on("submit", () => onSubmit());
      return s;
    };
    this.filter = input(L("Tìm thư mục… (gõ để lọc)", "Search folders… (type to filter)"), () => this.start());
    this.task = input(L("Yêu cầu đầu tiên cho agent (tuỳ chọn) — Enter để bắt đầu", "First request for the agent (optional) — Enter to start"), () => this.start());
    this.remote = input(L("Đường dẫn trên máy đó, vd /home/me/app", "Path on that machine, e.g. /home/me/app"), () => this.start());
    this.name = input(L("Tên dự án", "Project name"));
    this.dev = input(L("Lệnh dev (để trống = tự đoán)", "Dev command (empty = auto-detect)"));
    this.check = input(L("Lệnh check (để trống = tự đoán)", "Check command (empty = auto-detect)"));
    this.filter.focus();
    cx.timer.after(400, () => this.filter.focus());
    cx.spawn(async (cx) => {
      try { this.recent = JSON.parse((await readTextFile(`${appHome()}\\view.json`)) ?? "{}").recent ?? []; } catch {}
      try { this.saved = JSON.parse((await readTextFile(CONFIG())) ?? "{}").saved ?? []; } catch {}
      cx.notify();
      try {
        const known = await knownAgents({});
        this.agents = [...known.filter((a) => a.installed), TERMINAL];
      } catch {}
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "connected" && !m.temporary).map((m) => m.name);
      } catch {}
      cx.notify();
    });
  }

  choices() {
    const list = folderChoices({ recent: this.recent, saved: this.saved, cache: shared("projects.cache") ?? [] }, this.filter.value());
    return this.picked ? [{ section: L("Đã chọn", "Selected"), path: this.picked, label: this.picked.split("\\").pop() }, ...list.filter((c) => c.path !== this.picked)] : list;
  }

  folder() {
    return this.machine ? this.remote.value().trim() : this.choices()[this.at]?.path;
  }

  agent() {
    return this.agents.find((a) => a.key === this.agentKey) ?? this.agents[0];
  }

  start() {
    const folder = this.folder();
    if (!folder) return;
    const a = this.agent();
    const task = this.task.value().trim();
    closeOverlay(props().overlay);
    run("space.new", { folder, tab: tabName(task, a.name), ...(a.run ? { argv: a.run } : {}), ...(task && a.run ? { task } : {}), ...(this.machine ? { machine: this.machine } : {}) });
  }

  async save(cx) {
    const path = this.folder();
    if (!path || this.machine) return;
    const entry = { path, name: this.name.value().trim() || path.split("\\").pop(), agent: this.agentKey, dev: this.dev.value().trim() || null, check: this.check.value().trim() || null };
    for (let i = 0; i < 2; i++) {
      const text = await readTextFile(CONFIG());
      let cfg = null; // missing file: addSaved starts from the default roots
      try { if (text) cfg = JSON.parse(text); } catch { notify({ title: L("projects.json bị lỗi cú pháp", "projects.json has a syntax error"), body: L("Sửa file rồi lưu lại.", "Fix the file and save again."), level: "error" }); return; }
      try {
        await writeTextFile(CONFIG(), JSON.stringify(addSaved(cfg, entry), null, 2) + "\n", text);
        this.saved = addSaved(cfg, entry).saved;
        setShared("projects.cache", null);
        this.saving = false;
        notify({ title: L("Đã lưu dự án", "Project saved"), body: entry.name, level: "success" });
        return cx.notify();
      } catch { /* changed meanwhile: read again once */ }
    }
    notify({ title: L("Không lưu được projects.json", "Couldn't save projects.json"), level: "error" });
  }

  render() {
    setLang(shared("lang"));
    const t = theme();
    const list = this.choices();
    this.at = Math.max(0, Math.min(this.at, list.length - 1));
    const field = (state) => h_flex().h(34).flex_none().px(10).items_center().rounded(8).border_1().border_color(t.border).bg(t.background)
      .child(Input.new(state).flex_1().h_full().text_size(12.8).text_color(t.foreground));
    const label = (s) => div().pt(6).text_size(11).font_semibold().text_color(t.dim).child(s);
    const pill = (id, text, on, click) => h_flex().id(id).h(28).px(10).items_center().rounded(7).cursor_pointer()
      .border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover)).on_click(click).child(text);

    let section = null;
    // A window of 8 rows that follows the selection (the dialog's other sections stay visible).
    const start = Math.max(0, Math.min(this.at - 3, list.length - 8));
    const rows = list.slice(start, start + 8).map((c) => {
      const i = list.indexOf(c);
      const head = c.section !== section ? (section = c.section) : null;
      return v_flex()
        .when(!!head, (el) => el.child(div().px(8).pt(4).pb(2).text_size(10.5).text_color(t.dim).child(head)))
        .child(h_flex().id(`ns-${i}`).h(30).px(8).gap(10).items_center().rounded(7).cursor_pointer()
          .when(i === this.at, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.at = i; cx.notify(); })
          .child(svg("mods/workspace-chrome/folder.svg").size(14).text_color(t.dim))
          .child(div().flex_1().truncate().text_color(t.foreground).child(c.label))
          .child(div().max_w(320).truncate().text_size(11).text_color(t.dim).child(c.path)));
    });

    return v_flex()
      .id("new-session").track_focus(this.handle)
      .size_full().min_h(0).p(18).gap(6).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
        if (this.machine || this.saving || !list.length) return;
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(L("Phiên mới", "New session"))).child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(label(L("Môi trường", "Environment")))
      .child(h_flex().gap(6).flex_wrap()
        .child(pill("ns-here", L("Máy này", "This computer"), !this.machine, (_e, cx) => { this.machine = null; cx.notify(); }))
        .children(this.machines.map((m) => pill(`ns-m-${m}`, m, this.machine === m, (_e, cx) => { this.machine = m; this.remote.focus(); cx.notify(); }))))
      .child(label(this.machine ? L(`Thư mục trên ${this.machine}`, `Folder on ${this.machine}`) : L("Thư mục", "Folder")))
      .when(!!this.machine, (el) => el.child(field(this.remote)))
      .when(!this.machine, (el) => el
        .child(field(this.filter))
        .child(v_flex().id("ns-list").min_h(0).flex_1().overflow_hidden()
          .when(!list.length, (e2) => e2.child(div().px(8).py(6).text_color(t.dim).child(L("Không có thư mục nào khớp.", "No matching folders."))))
          .children(rows)
          .child(h_flex().id("ns-pick").h(30).px(8).gap(10).items_center().rounded(7).cursor_pointer().text_color(t.accent)
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => cx.spawn(async (cx) => { const f = await pickFolder({ prompt: L("Chọn", "Choose") }); if (f) { this.picked = f; this.at = 0; } cx.notify(); }))
            .child(svg("mods/workspace-chrome/folder-plus.svg").size(14))
            .child(L("Mở thư mục…", "Open folder…")))))
      .child(label("Agent"))
      .child(h_flex().gap(6).flex_wrap().children(this.agents.map((a) => pill(`ns-a-${a.key}`, a.name, a.key === this.agent().key, (_e, cx) => { this.agentKey = a.key; cx.notify(); }))))
      .when(!!this.agent().run, (el) => el.child(label(L("Yêu cầu đầu tiên", "First request"))).child(field(this.task)))
      .when(this.saving, (el) => el.child(label(L("Lưu thành dự án", "Save as project"))).child(field(this.name)).child(field(this.dev)).child(field(this.check)))
      .child(h_flex().pt(8).gap(8).items_center()
        .child(div().flex_1().truncate().text_size(11).text_color(t.dim).child(this.folder() ?? L("Chưa chọn thư mục", "No folder selected")))
        .when(!this.machine, (el) => el.child(pill("ns-save", this.saving ? L("Lưu", "Save") : L("Lưu thành dự án…", "Save as project…"), this.saving,
          (_e, cx) => { if (this.saving) cx.spawn(async (cx) => this.save(cx)); else { this.saving = true; this.name.set_value(this.folder()?.split("\\").pop() ?? ""); cx.notify(); } })))
        .child(h_flex().id("ns-start").h(30).px(14).items_center().rounded(7).cursor_pointer().bg(t.solid).text_color(t.solid_foreground).font_semibold()
          .on_click(() => this.start()).child(L("Bắt đầu  ↵", "Start  ↵"))));
  }
}
