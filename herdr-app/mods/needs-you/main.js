// "Cần bạn" box (Ctrl+Shift+Space in the desktop layout, or "N cần bạn" in the status bar):
// agents waiting on a question first, then finished ones. For a question card it shows the
// question and its choices; 1–9 picks a choice (the card takes the digit at once). For a finished
// agent: quick replies and a text box (Enter sends). ↑/↓ switch agent, "Mở" goes to it, Esc closes.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, run, hc, theme, shared, props, closeOverlay, notify } from "herdr";
import { parseQuestion, sameQuestion, selectedIndex } from "./model.js";
import { L, setLang } from "./i18n.js";

const QUICK = ["ok", "cứ theo đề xuất", "tiếp tục"];
// A department role's colour (as mods/team/ui.js ROLE_TONE).
const ROLE_TONE = { lead: "#c084fc", dev: "ansi4", "dev-b": "ansi4", qa: "ansi2", review: "ansi6", docs: "ansi3", research: "ansi3", scout: "ansi3" };
const roleTone = (t, role) => ROLE_TONE[role]?.startsWith("#") ? ROLE_TONE[role] : t[ROLE_TONE[role]] ?? t.accent;
const roleName = (m) => ({ lead: L("Điều phối", "Coordinator"), dev: "DEV", qa: "QA", review: "Review" })[m.role] ?? m.label ?? m.role;

export default class NeedsYou extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    this.at = 0;
    this.selected = null; // the shown agent's address (positions shift as agents come and go)
    this.cards = {}; // address -> parsed question (or null) from its screen
    this.inFlight = {}; // address -> true while a choice is being sent
    this.input = InputState.new({ placeholder: L("Trả lời agent… (Enter để gửi)", "Reply to agent… (Enter to send)") });
    this.input.on("submit", (_e, cx) => { const t = this.input.value().trim(); if (t) this.reply(t, cx); });
    // The answer typed for a card's "Type something" choice.
    this.typed = InputState.new({ placeholder: L("Gõ câu trả lời của bạn…", "Type your answer…") });
    this.typed.on("submit", (_e, cx) => {
      const a = this.list().find((x) => x.address === this.selected);
      const o = a && this.cards[a.address]?.options.find((x) => x.kind === "type");
      if (o) cx.spawn(async (cx) => this.answerTyped(a, o, this.typed.value(), cx));
    });
    this.handle = cx.focus_handle();
    this.handle.focus();
    const read = (cx) => cx.spawn(async (cx) => { await this.readCards(); cx.notify(); });
    read(cx);
    cx.timer.every(2000, read);
  }

  list() {
    const all = agents();
    return [...all.filter((a) => a.status === "blocked"), ...all.filter((a) => a.status === "done")];
  }

  async readScreen(address) {
    try {
      const r = await hc(["read", "--lines", "40", address]);
      return r.code === 0 ? parseQuestion(r.stdout) : null;
    } catch { return null; }
  }

  async readCards() {
    const blocked = new Set(this.list().filter((x) => x.status === "blocked").map((x) => x.address));
    for (const k of Object.keys(this.cards)) if (!blocked.has(k)) delete this.cards[k]; // answered elsewhere
    for (const address of blocked) {
      if (this.inFlight[address]) continue;
      const q = await this.readScreen(address);
      if (!this.inFlight[address]) this.cards[address] = q;
    }
  }

  close() { closeOverlay(props().overlay); }

  // Send a choice only to the card the person saw: re-read the screen first, once per card.
  async pick(a, n, cx) {
    if (this.inFlight[a.address]) return;
    this.inFlight[a.address] = true;
    const shown = this.cards[a.address];
    delete this.cards[a.address];
    cx.notify();
    try {
      const now = await this.readScreen(a.address);
      const stillBlocked = agents().find((x) => x.address === a.address)?.status === "blocked";
      if (!stillBlocked || !sameQuestion(shown, now)) {
        notify({ title: L("Câu hỏi đã thay đổi", "The question changed"), body: L("Chưa gửi gì — xem lại câu hỏi mới.", "Nothing sent — check the new question."), level: "warning" });
        if (stillBlocked) this.cards[a.address] = now;
        return;
      }
      const r = await hc(["keys", a.address, String(n)]);
      if (r.code !== 0) notify({ title: L("Không gửi được lựa chọn", "Couldn't send the choice"), body: r.stderr.trim(), level: "warning" });
    } catch (e) {
      notify({ title: L("Không gửi được lựa chọn", "Couldn't send the choice"), body: String(e?.message ?? e), level: "warning" });
    } finally {
      this.inFlight[a.address] = false;
    }
    this.after(cx);
  }

  async reply(text, cx) {
    const a = this.list().find((x) => x.address === this.selected);
    if (!a || a.status === "blocked") return;
    this.input.set_value("");
    const r = await hc(["send", a.address, text]);
    if (r.code !== 0) notify({ title: L("Không gửi được", "Couldn't send"), body: r.stderr.trim(), level: "warning" });
    this.after(cx);
  }

  // Nothing left to answer → close; else stay on the next one.
  after(cx) {
    cx.timer.after(800, (cx) => { if (!this.list().length) this.close(); else cx.notify(); });
  }

  // "Type something": pick that choice, then paste the person's text and press Enter.
  async answerTyped(a, o, text, cx) {
    if (this.inFlight[a.address] || !text.trim()) return;
    const shown = this.cards[a.address];
    this.inFlight[a.address] = true;
    try {
      const now = await this.readScreen(a.address);
      if (!sameQuestion(shown, now)) {
        notify({ title: L("Câu hỏi đã thay đổi", "The question changed"), body: L("Chưa gửi gì — xem lại câu hỏi mới.", "Nothing sent — check the new question."), level: "warning" });
        this.cards[a.address] = now;
        return;
      }
      await hc(["keys", a.address, String(o.n)]);
      await cx.sleep(350);
      const r = await hc(["send", a.address, text.trim()]);
      if (r.code !== 0) notify({ title: L("Không gửi được", "Couldn't send"), body: r.stderr.trim(), level: "warning" });
      this.typed.set_value("");
      delete this.cards[a.address];
    } catch (e) {
      notify({ title: L("Không gửi được", "Couldn't send"), body: String(e?.message ?? e), level: "warning" });
    } finally {
      this.inFlight[a.address] = false;
    }
    this.after(cx);
  }

  render(cx) {
    setLang(shared("lang"));
    const t = theme();
    const list = this.list();
    this.at = selectedIndex(list, this.selected, this.at);
    const a = list[this.at];
    this.selected = a?.address ?? null;
    const q = a?.status === "blocked" ? this.cards[a.address] : null;
    // A new question (or another agent) shown: its choices fade in one after another.
    const key = `${a?.address}|${q?.question}|${q?.options.length}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.reveal = 0;
      cx.timer.after(30, (cx) => { this.reveal = 1; cx.notify(); });
    }
    // A department member goes by its role, in its colour (as on the board and pane headers).
    const mate = a && Object.values(shared("teams") ?? {}).flatMap((x) => [x.lead, ...(x.members ?? [])]).find((m) => m?.address === a.address);
    const tone = mate ? roleTone(t, mate.role) : t.accent;
    const pill = (id, label, act, solid) => h_flex().id(id).h(28).px(11).gap(6).items_center().rounded(8).cursor_pointer().flex_none()
      .when(solid, (el) => el.bg(t.solid).text_color(t.solid_foreground).hover((s) => s.opacity(0.88)))
      .when(!solid, (el) => el.bg(t.raised).border_1().border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .on_click(act).text_size(12.5).child(label);
    const answers = q ? q.options.filter((o) => !o.kind) : [];
    const typeOpt = q?.options.find((o) => o.kind === "type");
    const chatOpt = q?.options.find((o) => o.kind === "chat");

    const option = (o, i) => h_flex().id(`ny-opt-${o.n}`).relative().px(12).py(10).gap(12).items_start().rounded(10).cursor_pointer()
      .opacity(this.reveal).transition("opacity", { duration: 220, delay: 45 * i, easing: "ease-out" })
      .bg(o.cursor ? t.selected : t.raised).border_1().border_color(o.cursor ? t.accent : t.border)
      .hover((s) => s.bg(t.hover).border_color(t.accent))
      .on_click((_e, cx) => this.pick(a, o.n, cx))
      .child(div().flex_none().size(24).flex().items_center().justify_center().rounded(7).text_size(12).font_semibold()
        .bg(o.cursor ? t.accent : t.background).text_color(o.cursor ? t.accent_foreground : t.foreground).border_1().border_color(t.border).child(String(o.n)))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(8).items_center().flex_wrap()
          .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child(o.label))
          .when(o.recommended, (el) => el.child(div().px(6).h(18).flex().items_center().rounded(5).bg(t.ansi2 + "26").text_size(10.5).font_semibold().text_color(t.ansi2).child(L("Khuyến nghị", "Recommended"))))
          .when(o.cursor, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(L("↵ đang chọn", "↵ selected")))))
        .when(!!o.desc && o.desc !== o.label, (el) => el.child(div().text_size(12).text_color(t.muted).child(o.desc))));

    const body = !a
      ? v_flex().py(40).items_center().gap(8).text_color(t.dim).child(div().text_size(14).child(L("Không có agent nào cần bạn", "No agents need you"))).child(div().text_size(12).child(L("Khi agent hỏi hoặc làm xong, nó sẽ hiện ở đây.", "When an agent asks or finishes, it shows up here.")))
      : v_flex().gap(14)
          // Who asks, and where.
          .child(h_flex().gap(10).items_center()
            .child(div().flex_none().size(9).rounded(5).bg(t[a.status] ?? t.dim))
            .when(!!mate, (el) => el.child(div().flex_none().px(8).h(22).flex().items_center().rounded(6).bg(tone + "2e").text_size(12).font_semibold().text_color(tone).child(roleName(mate))))
            .child(v_flex().flex_1().min_w(0)
              .child(div().truncate().text_size(13).font_semibold().text_color(t.foreground).child(mate ? a.space_name : `${a.space_name} · ${a.tab_name}`))
              .child(div().truncate().text_size(11.5).text_color(t[a.status] ?? t.dim).child(a.status === "blocked" ? L("đang chờ bạn chọn", "waiting for your choice") : L("đã xong việc", "finished"))))
            .child(pill("ny-open", L("Mở pane", "Open pane"), () => { this.close(); run("agent.focus", { terminal: a.address }); })))
          .when(a.status === "blocked" && !q, (el) => el.child(div().p(12).rounded(10).bg(t.background).text_size(12.5).text_color(t.dim)
            .child(L("Đang đọc câu hỏi… Nếu không hiện lựa chọn, bấm Mở pane để trả lời trong terminal.", "Reading the question… If no choices show, click Open pane to answer in the terminal."))))
          .when(!!q, (el) => el
            // The step strip of a multi-question card.
            .when(q.steps.length > 1, (e2) => e2.child(h_flex().gap(6).flex_wrap().children(q.steps.map((s, i) => {
              const now = s.label === q.header;
              return h_flex().id(`ny-step-${i}`).h(24).px(9).gap(5).items_center().rounded(12).text_size(11.5)
                .when(s.done, (x) => x.bg(t.ansi2 + "1f").text_color(t.ansi2))
                .when(!s.done && now, (x) => x.bg(t.accent + "26").border_1().border_color(t.accent).text_color(t.foreground))
                .when(!s.done && !now, (x) => x.bg(t.raised).text_color(t.dim))
                .child(s.done ? "✓" : String(i + 1)).child(s.label);
            }))))
            .when(q.steps.length <= 1 && !!q.header, (e2) => e2.child(div().text_size(11.5).font_semibold().text_color(tone).child(q.header)))
            // The question, whole, in paragraphs.
            .when(!!q.question, (e2) => e2.child(v_flex().gap(8).px(14).py(12).rounded(10).bg(t.background).border_1().border_color(t.border)
              .children(q.question.split("\n\n").map((p, i) => div().id(`ny-q-${i}`).text_size(14).text_color(t.foreground).child(p)))))
            .child(v_flex().gap(6).children(answers.map(option)))
            // Claude's built-in choices: type an answer here, or talk it over in the pane.
            .when(!!typeOpt || !!chatOpt, (e2) => e2.child(v_flex().gap(8).pt(4)
              .when(!!typeOpt, (e3) => e3.child(h_flex().h(38).px(10).gap(8).items_center().rounded(10).border_1().border_color(t.border).bg(t.background)
                .child(div().flex_none().size(22).flex().items_center().justify_center().rounded(6).text_size(11).text_color(t.dim).border_1().border_color(t.border).child(String(typeOpt.n)))
                .child(Input.new(this.typed).flex_1().h_full().text_size(13).text_color(t.foreground))
                .child(div().flex_none().text_size(11).text_color(t.dim).child(L("Enter gửi", "Enter to send")))))
              .when(!!chatOpt, (e3) => e3.child(h_flex().id("ny-chat").gap(6).items_center().cursor_pointer().text_size(12).text_color(t.muted)
                .hover((s) => s.text_color(t.foreground))
                .on_click((_e, cx) => { this.pick(a, chatOpt.n, cx); this.close(); run("agent.focus", { terminal: a.address }); })
                .child(`${chatOpt.n} · ${L("Trao đổi thêm trong pane thay vì chọn", "Discuss more in the pane instead of choosing")}`))))))
          .when(a.status === "done", (el) => el
            .child(h_flex().gap(6).flex_wrap().children(QUICK.map((text, i) => pill(`ny-q-${i}`, text, (_e, cx) => this.reply(text, cx)))))
            .child(h_flex().h(38).px(10).items_center().rounded(10).border_1().border_color(t.accent).bg(t.background)
              .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground))));

    return v_flex().id("needs-you").track_focus(this.handle)
      .size_full().min_h(0).p(18).gap(14).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down" && list.length) this.selected = list[(this.at + 1) % list.length].address;
        else if (k === "up" && list.length) this.selected = list[(this.at + list.length - 1) % list.length].address;
        else if (/^[1-9]$/.test(k) && answers.some((o) => o.n === Number(k))) { this.pick(a, Number(k), cx); }
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(L("Cần bạn", "Needs you")))
        .when(list.length > 1, (el) => el.child(div().px(8).h(20).flex().items_center().rounded(10).bg(t.raised).text_size(11).text_color(t.muted).child(`${this.at + 1}/${list.length}`)))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(v_flex().id("ny-body").flex_1().min_h(0).overflow_y_scroll().child(body))
      .when(!!q, (el) => el.child(div().text_size(11).text_color(t.dim)
        .child(L(`Phím 1–${Math.min(9, answers.length || 1)} chọn ngay${list.length > 1 ? " · ↑/↓ đổi agent" : ""} · Esc đóng`, `Keys 1–${Math.min(9, answers.length || 1)} pick now${list.length > 1 ? " · ↑/↓ switch agent" : ""} · Esc close`))));
  }
}
