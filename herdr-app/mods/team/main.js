// "Phòng ban mới": a lead agent and teammates of any kind (Claude Code, Codex, Antigravity) in one
// tab of the shown space. Pick a team template, change any role's agent, create: the lead opens in
// a new tab, teammates split beside it, and each gets its role brief once it reports ready. The
// team is remembered in shared "teams" (by space) so the composer routes "@review …" to it.
// A space whose department runs is managed on its board (board.js), not here.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, agents, terminals, run, hc, exec, theme, shared, setShared, props, closeOverlay, nextCommand, appHome, readTextFile, writeTextFile } from "herdr";
import * as fsp from "fs/promises";
import { TEMPLATES, AGENT_KINDS, ROLES, LAYOUTS, MODELS, EFFORTS, PACES, LANE_CHECKS, argvFor, defaultSetup, trustAnswer, teamSlug, layoutTree, splitPlan } from "./model.js";
import { I, CHROME, ROLE_ICON, TEMPLATE_ICON, PACE_ICON, logo, icon, button, iconButton, tile, setupText } from "./ui.js";
import { boardInit, boardRender, openBoard, place } from "./board.js";
import { overviewInit, overviewRender } from "./overview.js";
import { L, setLang } from "./i18n.js";

const KIND_ORDER = ["claude", "codex", "agy"]; // Haiku is a Claude model now

// A layout tree drawn small, true to Herdr's halving splits; each cell shows its agent's logo.
function preview(t, x, w, h, roles) {
  if (typeof x === "number") return h_flex().w(w).h(h).flex_none().items_center().justify_center().rounded(3)
    .bg(t.background).border_1().border_color(x === 0 ? t.accent : t.border)
    .child(logo(roles[x]?.agent, Math.max(6, Math.min(12, Math.floor(Math.min(w, h)) - 6)), t));
  const row = x.dir === "row", k = x.kids.length, gap = 2;
  const total = (row ? w : h) - gap * (k - 1);
  return (row ? h_flex() : v_flex()).gap(gap).flex_none().children(x.kids.map((c, i) => {
    const f = i === k - 1 ? 2 ** -(k - 1) : 2 ** -(i + 1);
    return preview(t, c, row ? total * f : w, row ? h : total * f, roles);
  }));
}

export default class Team extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    const p = props() ?? {};
    this.isBoard = p.view === "board";
    this.space = this.isBoard ? spaces().find((s) => s.id === p.space) ?? null : spaces().find((s) => s.active) ?? null;
    this.trust = {}; // address → the key that answers its "trust this folder?" prompt
    this.handle = cx.focus_handle();
    // Agents not idle yet may be asking to trust the folder: look at their screens every 2 s.
    cx.timer.every(2000, (cx) => cx.spawn(async (cx) => {
      const team = (shared("teams") ?? {})[this.space?.id];
      const running = new Set(terminals().map((x) => x.address));
      const addrs = [...new Set([...(this.addr ?? []), ...(team ? [team.lead, ...team.members].map((m) => m?.address) : [])])].filter((a) => a && running.has(a));
      let changed = false;
      for (const a of addrs) {
        const st = agents().find((x) => x.address === a)?.status;
        let key = null;
        if (st !== "idle" && st !== "working" && st !== "done") {
          const r = await hc(["read", a, "--lines", "30"]).catch(() => null);
          key = r?.code === 0 ? trustAnswer(r.stdout) : null;
        }
        if ((this.trust[a] ?? null) !== key) { this.trust[a] = key; changed = true; }
      }
      if (changed) cx.notify();
    }));
    if (this.isBoard) return boardInit(this, cx);
    this.pick(TEMPLATES[0]);
    this.open = null; // the role whose model and effort are shown
    // Antigravity's models as it lists them now (the built-in list until it answers).
    cx.spawn(async (cx) => {
      const r = await exec("agy", ["models"], { timeout: 20000 }).catch(() => null);
      const list = String(r?.stdout ?? "").split(/\r?\n/).map((l) => /^(\S+)\t(.+)$/.exec(l.trim())).filter(Boolean).map((m) => ({ id: m[1], label: m[2] }));
      if (list.length) { this.agyModels = [{ id: null, get label() { return L("Mặc định", "Default"); } }, ...list]; cx.notify(); }
    });
    this.layout = LAYOUTS.some((l) => l.id === shared("team.layout")) ? shared("team.layout") : LAYOUTS[0].id; // the last one picked
    this.lanes = [1, 2, 3].includes(shared("team.lanes")) ? shared("team.lanes") : 2; // tasks at once, the last one picked
    this.pace = PACES.some((p) => p.id === shared("team.pace")) ? shared("team.pace") : "chuan"; // the last one picked
    this.laneCheck = LANE_CHECKS.some((k) => k.id === shared("team.laneCheck")) ? shared("team.laneCheck") : "qa"; // the last one picked
    this.name = InputState.new({ placeholder: L("Tên phòng ban", "Team name") });
    this.name.set_value(this.space?.name ?? L("Phòng ban", "Team"));
    this.handle.focus();
    this.steps = null; // while creating: [{state: "wait"|"run"|"need"|"ok"|"err", note}]
    // Every department first when there are any ("Phòng ban mới" there switches to the form).
    this.view = !p.fresh && Object.keys(shared("teams") ?? {}).length ? "list" : "create";
    if (this.view === "list") overviewInit(this, cx);
    // Enter or the "team.create" command creates (a key binding or a script can start it too).
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "create" && !this.steps) await this.create(cx); cx.notify(); } });
  }

  // A template's roles as last set up for it (kept in shared "team.setup"), else its defaults.
  pick(tpl) {
    this.tpl = tpl;
    const saved = (shared("team.setup") ?? {})[tpl.id];
    const same = saved?.length === tpl.roles.length && saved.every((r, i) => r.role === tpl.roles[i].role);
    this.roles = (same ? saved : tpl.roles).map((r) => r.agent === "claude-haiku" ? { role: r.role, agent: "claude", model: "haiku", effort: null }
      : { ...defaultSetup(r.role, r.agent), ...r });
  }

  save() {
    const roles = this.roles.map(({ role, agent, model, effort }) => ({ role, agent, model: model ?? null, effort: effort ?? null }));
    setShared("team.setup", { ...(shared("team.setup") ?? {}), [this.tpl.id]: roles });
  }

  models(agent) { return agent === "agy" && this.agyModels ? this.agyModels : MODELS[agent] ?? [{ id: null, label: L("Mặc định", "Default") }]; }

  close() { closeOverlay(props().overlay); }

  async waitFor(cx, test, ms) {
    for (let t = 0; t < ms; t += 400) { const v = test(); if (v) return v; await cx.sleep(400); }
    return null;
  }

  setStep(cx, i, state, note) { this.steps[i] = { ...this.steps[i], state, note: note ?? this.steps[i].note }; cx.notify(); }

  // Lead tab first, teammates split beside it (right, then down), briefs once each reports ready.
  async create(cx) {
    const space = this.space;
    if (!space || space.machine) return;
    const folder = place(space);
    const name = this.name.value().trim() || space.name;
    // The team's own folder (task cards, NOTES.md), outside the repo.
    const home = `${appHome()}\\teams\\${teamSlug(name)}`;
    try {
      await fsp.mkdir(`${home}\\tasks`, { recursive: true });
      if ((await readTextFile(`${home}\\NOTES.md`).catch(() => null)) == null)
        await writeTextFile(`${home}\\NOTES.md`, `# Phòng ban ${name}\n\nDự án: ${folder}\n\nQuyết định và quy ước chung của cả đội ghi ở đây.\n`, null);
    } catch {}
    this.steps = this.roles.map(() => ({ state: "wait" }));
    cx.notify();
    const before = new Set(space.tabs.map((t) => t.id));
    const addr = [];
    try {
      // 1. The lead, in a new tab.
      this.setStep(cx, 0, "run", L("mở tab mới…", "opening a new tab…"));
      run("tab.new", { space: space.id, name: `Phòng ban · ${name}`.slice(0, 40), folder, argv: argvFor("lead", this.roles[0].agent, this.roles[0]) });
      const tab = await this.waitFor(cx, () => spaces().find((s) => s.id === space.id)?.tabs.find((t) => !before.has(t.id)), 15000);
      if (!tab) throw new Error(L("không thấy tab mới", "new tab not found"));
      const leadPane = await this.waitFor(cx, () => panes().find((p) => p.tab === tab.id && p.terminal), 15000);
      if (!leadPane) throw new Error(L("không thấy pane của Điều phối", "Coordinator pane not found"));
      addr[0] = leadPane.terminal;
      // 2. Teammates, split from the lead's pane as the chosen layout says (a failed pane: its
      // neighbours split from the lead instead).
      const opened = { 0: leadPane };
      for (const s of splitPlan(layoutTree(this.layout, this.roles.length))) {
        const r = this.roles[s.role];
        this.setStep(cx, s.role, "run", L("mở pane…", "opening pane…"));
        const known = new Set(panes().filter((p) => p.tab === tab.id).map((p) => p.pane));
        run("pane.split", { direction: s.dir, pane: (opened[s.from] ?? leadPane).pane, argv: argvFor(r.role, r.agent, r) });
        const pane = await this.waitFor(cx, () => panes().find((p) => p.tab === tab.id && p.terminal && !known.has(p.pane)), 15000);
        if (!pane) { this.setStep(cx, s.role, "err", L("không mở được pane", "could not open pane")); continue; }
        addr[s.role] = pane.terminal;
        opened[s.role] = pane;
      }
      // 3. The team record and its board, which sends each brief once that agent is idle (this
      // dialog may close meanwhile). Each teammate carries its label and aliases, so the composer
      // can route "@review …" alone.
      const mate = (r, a) => ({ ...r, label: ROLES[r.role]?.label ?? r.role, aliases: ROLES[r.role]?.mention ?? [], address: a });
      const team = {
        name, folder, home, tab: tab.id, space: space.id, template: this.tpl.id, layout: this.layout, lanes: this.lanes, laneCheck: this.laneCheck, pace: this.pace, briefed: [],
        lead: mate(this.roles[0], addr[0]),
        members: this.roles.slice(1).map((r, i) => mate(r, addr[i + 1])).filter((m) => m.address),
      };
      setShared("teams", { ...(shared("teams") ?? {}), [space.id]: team });
      this.team = team;
      this.addr = addr;
      this.doneAt = Date.now();
      openBoard(team);
      this.done = true;
    } catch (e) {
      const i = this.steps.findIndex((s) => s.state === "run");
      if (i >= 0) this.setStep(cx, i, "err", String(e?.message ?? e));
      this.done = true;
    }
    cx.notify();
  }

  // A teammate's state once its pane is open, from live data: briefed (the board's record), a
  // trust prompt, starting, waiting on the person, or ready and about to get its brief.
  liveStep(s, i) {
    const a = this.addr?.[i];
    if (!this.done || s.state === "err" || !a) return s;
    if ((shared("teams") ?? {})[this.space?.id]?.briefed?.includes(a)) return { state: "ok", note: L(`${a} · đã nhận lời dặn`, `${a} · brief received`) };
    if (this.trust[a]) return { state: "need", note: L("hỏi tin tưởng thư mục", "asks to trust the folder") };
    const ag = agents().find((x) => x.address === a);
    if (ag?.status === "blocked" || (!ag && Date.now() - this.doneAt > 15000)) return { state: "need", note: L("đang chờ bạn trả lời trong pane", "waiting for your answer in the pane") };
    return { state: "run", note: ag ? L("sắp nhận lời dặn…", "about to receive its brief…") : L("đang khởi động…", "starting…") };
  }

  // The person's click says yes to the agent's "trust this folder?" (the key read off its screen).
  answerTrust(cx, address) {
    const key = this.trust[address];
    if (!key) return;
    this.trust[address] = null;
    hc(["keys", address, key]).catch(() => {});
    cx.notify();
  }

  render(cx) {
    setLang(shared("lang"));
    if (this.isBoard) return boardRender(this, cx);
    if (this.view === "list") return overviewRender(this, cx);
    const t = theme();
    const space = this.space;
    const ok = !!space && !space.machine;
    const label = (s) => div().pt(16).pb(7).text_size(11.5).text_color(t.dim).child(s);
    const roleTile = (path) => h_flex().size(30).flex_none().items_center().justify_center().rounded(8).bg(t.background).child(icon(path, 15, t.muted));
    const roleText = (r, sub, color) => v_flex().flex_1().min_w(0).gap(1)
      .child(div().truncate().text_size(12.5).child(ROLES[r.role]?.label ?? r.role))
      .child(div().truncate().text_size(11).text_color(color ?? t.dim).child(sub));

    // Each role's agent: three logos, the chosen one raised (name on hover). Changing it resets the
    // role's model and effort to that agent's defaults.
    const agentPick = (r, i) => h_flex().p(2).gap(2).flex_none().rounded(8).bg(t.background).children(KIND_ORDER.map((k) =>
      h_flex().id(`tk-${i}-${k}`).w(30).h(26).items_center().justify_center().rounded(6).cursor_pointer().tooltip(AGENT_KINDS[k].name)
        .when(r.agent === k, (el) => el.bg(t.selected).border_1().border_color(t.border))
        .when(r.agent !== k, (el) => el.opacity(0.4).hover((x) => x.opacity(0.9)))
        .on_click((_e, cx) => { if (r.agent !== k) { Object.assign(r, { agent: k }, defaultSetup(r.role, k)); this.save(); } cx.notify(); })
        .child(logo(k, 15, t))));
    // The open role's model and effort, as rows of chips.
    const chips = (id, name, items, cur, set) => h_flex().gap(5).items_center().flex_wrap()
      .child(div().w(46).flex_none().text_size(11).text_color(t.dim).child(name))
      .children(items.map((it, j) => {
        const on = (cur ?? null) === it.id;
        return h_flex().id(`${id}-${j}`).h(24).px(8).items_center().rounded(6).cursor_pointer().text_size(11.5)
          .when(on, (el) => el.bg(t.selected).border_1().border_color(t.border).text_color(t.foreground))
          .when(!on, (el) => el.text_color(t.muted).hover((x) => x.bg(t.hover)))
          .on_click((_e, cx) => { set(it.id); this.save(); cx.notify(); }).child(it.label);
      }));
    const editor = (r, i) => v_flex().gap(6).pl(49).pr(8).pt(2).pb(10)
      .when(this.models(r.agent).length > 1, (el) => el.child(chips(`tm-${i}`, "Model", this.models(r.agent), r.model, (v) => { r.model = v; })))
      .child(chips(`te-${i}`, "Effort", [{ id: null, label: L("Mặc định", "Default") }, ...EFFORTS[r.agent].map((e) => ({ id: e, label: e }))], r.effort, (v) => { r.effort = v; }));

    const form = v_flex()
      .child(label(L("Tên", "Name")))
      .child(h_flex().h(34).px(11).items_center().rounded(8).border_1().border_color(t.input).bg(t.background).child(Input.new(this.name).w_full().text_size(12.5)))
      .child(label(L("Mẫu đội", "Template")))
      .child(h_flex().p(3).gap(3).rounded(10).bg(t.background).children(TEMPLATES.map((tp) => {
        const on = this.tpl.id === tp.id;
        return h_flex().id(`tt-${tp.id}`).flex_1().min_w(0).h(30).gap(6).items_center().justify_center().rounded(7).cursor_pointer().text_size(12)
          .when(on, (el) => el.bg(t.selected).border_1().border_color(t.border).text_color(t.foreground))
          .when(!on, (el) => el.text_color(t.muted).hover((x) => x.bg(t.hover)))
          .on_click((_e, cx) => { this.pick(tp); cx.notify(); })
          .child(icon(TEMPLATE_ICON[tp.id] ?? I("users"), 13, on ? t.foreground : t.muted)).child(div().truncate().child(tp.label));
      })))
      .child(div().pt(7).px(2).text_size(11.5).text_color(t.dim).child(this.tpl.desc))
      .child(h_flex().pt(16).pb(7).items_center()
        .child(div().flex_1().text_size(11.5).text_color(t.dim).child(L("Vai và agent · bấm một vai để chọn model, effort", "Roles and agents · click a role to pick its model and effort")))
        .child(div().id("t-reset").text_size(11).text_color(t.dim).cursor_pointer().hover((x) => x.text_color(t.foreground))
          .on_click((_e, cx) => { setShared("team.setup", { ...(shared("team.setup") ?? {}), [this.tpl.id]: undefined }); this.pick(this.tpl); cx.notify(); })
          .child(L("Khôi phục mặc định", "Reset to defaults"))))
      .children(this.roles.map((r, i) => v_flex().rounded(10).when(this.open === i, (el) => el.bg(t.hover))
        .child(h_flex().id(`tr-${i}`).min_h(48).px(8).gap(11).items_center().rounded(10).cursor_pointer().hover((x) => x.bg(t.hover))
          .on_click((_e, cx) => { this.open = this.open === i ? null : i; cx.notify(); })
          .child(roleTile(ROLE_ICON[r.role] ?? I("users")))
          .child(roleText(r, `${AGENT_KINDS[r.agent]?.name ?? r.agent} · ${setupText(r, this.models(r.agent))}`))
          .child(icon(CHROME(this.open === i ? "chevron-down" : "chevron-right"), 13, t.dim))
          .child(agentPick(r, i)))
        .when(this.open === i, (el) => el.child(editor(r, i)))))
      // A reviewer of the same family as DEV shares its blind spots: say so (the user decides).
      .when((() => {
        const fam = (a) => (a === "claude-haiku" ? "claude" : a);
        const dev = this.roles.find((r) => r.role === "dev"), rv = this.roles.find((r) => r.role === "review");
        return !!dev && !!rv && fam(dev.agent) === fam(rv.agent);
      })(), (el) => el.child(h_flex().mt(6).px(10).py(7).gap(8).items_center().rounded(8).bg(t.ansi3 + "1f")
        .child(div().flex_none().text_size(12).text_color(t.ansi3).child("⚠"))
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.foreground)
          .child(L("DEV và Review cùng một loại agent: dễ chung điểm mù. Nên chọn Review là Codex hoặc Antigravity.",
            "DEV and Review are the same kind of agent and may share blind spots. Consider Codex or Antigravity for Review.")))))
      // How many tasks run at once: each code task a worktree and a DEV of its own.
      .child(label(L("Làn chạy cùng lúc", "Parallel lanes")))
      .child(h_flex().gap(10).items_center()
        .child(h_flex().p(2).gap(2).flex_none().rounded(8).bg(t.background).children([1, 2, 3].map((n) =>
          h_flex().id(`tn-${n}`).w(34).h(26).items_center().justify_center().rounded(6).cursor_pointer().text_size(12.5)
            .when(this.lanes === n, (el) => el.bg(t.selected).border_1().border_color(t.border).text_color(t.foreground))
            .when(this.lanes !== n, (el) => el.text_color(t.muted).hover((x) => x.bg(t.hover)))
            .on_click((_e, cx) => { this.lanes = n; setShared("team.lanes", n); cx.notify(); })
            .child(String(n)))))
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.dim)
          .child(L("Mỗi việc code một worktree và một DEV riêng (theo cài đặt vai DEV); nghiên cứu cũng chiếm một làn. Việc vượt số làn nằm ở Chờ.",
            "Each code task gets its own worktree and DEV (the DEV role's setup); research takes a lane too. Tasks over the limit wait in To do."))))
      // Who checks an extra lane's work (only matters with more than one lane).
      .when(this.lanes > 1, (el) => el
        .child(label(L("Kiểm tra ở làn phụ", "Checks on extra lanes")))
        .child(v_flex().gap(6)
          .child(h_flex().p(2).gap(2).rounded(8).bg(t.background).children(LANE_CHECKS.map((k) =>
            h_flex().id(`tc-${k.id}`).flex_1().min_w(0).h(26).px(8).items_center().justify_center().rounded(6).cursor_pointer().text_size(12)
              .when(this.laneCheck === k.id, (x) => x.bg(t.selected).border_1().border_color(t.border).text_color(t.foreground))
              .when(this.laneCheck !== k.id, (x) => x.text_color(t.muted).hover((y) => y.bg(t.hover)))
              .on_click((_e, cx) => { this.laneCheck = k.id; setShared("team.laneCheck", k.id); cx.notify(); })
              .child(div().truncate().child(k.label)))))
          .child(div().text_size(11.5).text_color(t.dim).child(LANE_CHECKS.find((k) => k.id === this.laneCheck)?.desc ?? ""))))
      // The pace: which steps each task size takes.
      .child(label(L("Nhịp làm việc", "Pace")))
      .child(h_flex().gap(10).items_center()
        .child(h_flex().p(2).gap(2).flex_none().rounded(8).bg(t.background).children(PACES.map((p) =>
          h_flex().id(`tp-${p.id}`).h(26).px(10).gap(5).items_center().rounded(6).cursor_pointer().text_size(12)
            .when(this.pace === p.id, (el) => el.bg(t.selected).border_1().border_color(t.border).text_color(t.foreground))
            .when(this.pace !== p.id, (el) => el.text_color(t.muted).hover((x) => x.bg(t.hover)))
            .on_click((_e, cx) => { this.pace = p.id; setShared("team.pace", p.id); cx.notify(); })
            .child(icon(PACE_ICON[p.id], 12, this.pace === p.id ? t.foreground : t.muted)).child(p.label))))
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.dim).child(PACES.find((p) => p.id === this.pace)?.desc ?? "")))
      .child(label(L("Bố cục", "Layout")))
      .child(h_flex().gap(6).children(LAYOUTS.map((l) => {
        const on = this.layout === l.id;
        return v_flex().id(`tl-${l.id}`).flex_1().min_w(0).p(7).gap(6).items_center().rounded(10).cursor_pointer().border_1()
          .border_color(on ? t.accent : t.border).when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((x) => x.bg(t.hover)))
          .tooltip(l.desc)
          .on_click((_e, cx) => { this.layout = l.id; setShared("team.layout", l.id); cx.notify(); })
          .child(preview(t, layoutTree(l.id, this.roles.length), 92, 52, this.roles))
          .child(div().text_size(11.5).text_color(on ? t.foreground : t.muted).child(l.label));
      })))
      .child(div().pt(7).px(2).text_size(11.5).text_color(t.dim).child(LAYOUTS.find((l) => l.id === this.layout)?.desc ?? ""));

    const stepIcon = (s) => s.state === "ok" ? icon(CHROME("check"), 15, t.ansi2)
      : s.state === "err" ? icon(CHROME("x"), 15, t.ansi1)
      : s.state === "run" ? svg(CHROME("spinner")).size(15).text_color(t.muted).spin(900)
      : s.state === "need" ? div().size(9).rounded(5).bg(t.ansi3)
      : div().size(7).rounded(4).bg(t.border);
    const smallBtn = (id, text, act, solid) => button(t, id, text, act, { small: true, solid });
    const live = this.steps?.map((s, i) => this.liveStep(s, i));
    const ready = !!this.done && !!live?.every((s) => s.state === "ok");
    const progress = live && v_flex().gap(4).pt(14).children(live.map((s, i) => {
      const r = this.roles[i];
      const color = s.state === "err" ? t.ansi1 : s.state === "need" ? t.ansi3 : t.dim;
      return h_flex().id(`ts-${i}`).min_h(48).px(8).gap(11).items_center().rounded(10).bg(s.state === "need" ? t.hover : t.popover)
        .child(h_flex().size(30).flex_none().items_center().justify_center().rounded(8).bg(t.background).child(logo(r.agent, 17, t)))
        .child(roleText(r, s.note ?? L(`${AGENT_KINDS[r.agent]?.name ?? r.agent} · chờ tới lượt`, `${AGENT_KINDS[r.agent]?.name ?? r.agent} · waiting its turn`), color))
        .when(s.state === "need" && !!this.trust[this.addr?.[i]], (el) => el.child(smallBtn(`ts-trust-${i}`, L("Tin tưởng", "Trust"), (_e, cx) => this.answerTrust(cx, this.addr[i]), true)))
        .when(s.state === "need" && !!this.addr?.[i], (el) => el.child(smallBtn(`ts-go-${i}`, L("Xem", "View"), () => { this.close(); run("pane.focus", { terminal: this.addr[i] }); })))
        .child(div().w(18).flex().justify_center().child(stepIcon(s)));
    }));

    const hint = !this.steps ? L("Điều phối kiểm tra git sau mỗi bước của đồng đội", "The coordinator checks git after each teammate step")
      : ready ? L("Giao việc ở Bảng việc, hoặc gõ @lead … trong khung chat", "Assign work on the Board, or type @lead … in the composer")
      : this.done ? L("Bảng việc gửi lời dặn khi từng agent sẵn sàng: đóng hộp này không sao", "The Board sends briefs as each agent is ready: you can close this dialog") : L("Đang mở các pane…", "Opening panes…");

    return v_flex().id("team").size_full().p(18).bg(t.popover).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_key_down((e, cx) => {
        if (e.key === "escape") this.close();
        else if (e.key === "enter" && !this.steps && ok) cx.spawn(async (cx) => this.create(cx));
      })
      .child(h_flex().gap(11).items_center()
        .child(tile(t, I("users"), 34))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(15).font_semibold().child(!this.steps ? L("Phòng ban mới", "New team") : ready ? L("Phòng ban đã sẵn sàng", "Team is ready") : L("Đang dựng phòng ban…", "Setting up the team…")))
          .child(h_flex().gap(5).items_center().min_w(0).child(icon(CHROME("folder"), 12, t.dim))
            .child(div().truncate().text_size(11.5).text_color(t.dim).child(space ? `${space.name} · ${place(space) ?? ""}` : L("Chưa chọn space", "No space selected")))))
        .child(iconButton(t, "t-x", CHROME("x"), L("Đóng (Esc)", "Close (Esc)"), () => this.close())))
      .child(div().id("t-body").flex_1().min_h(0).overflow_y_scroll().child(progress || form))
      .child(h_flex().gap(8).items_center().pt(14)
        .child(h_flex().flex_1().min_w(0).gap(6).items_center().child(icon(I("shield-check"), 13, t.dim)).child(div().truncate().text_size(11).text_color(t.dim).child(hint)))
        .child(button(t, "t-cancel", this.done ? L("Đóng", "Close") : L("Huỷ", "Cancel"), () => this.close()))
        .when(!this.steps, (el) => el.child(button(t, "t-create", L("Tạo phòng ban", "Create team"), (_e, cx) => { if (ok) cx.spawn(async (cx) => this.create(cx)); }, { solid: ok, hint: "↵" })))
        .when(!!this.done && !!this.team, (el) => el.child(button(t, "t-board", L("Mở bảng việc", "Open board"), () => { openBoard(this.team); this.close(); }, { solid: true, icon: I("square-kanban") }))));
  }
}
