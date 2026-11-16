// "Phòng ban": every department in shared "teams" — running ones first, then stopped — with its
// space and project, live agents and card counts. Open its board, forget a stopped one, or make a
// new one for the shown space. The dialog opens here when any department exists.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { terminals, theme, shared, setShared, spaces, appHome, readTextFile } from "herdr";
import * as fsp from "fs/promises";
import { parseCard, teamSlug } from "./model.js";
import { L } from "./i18n.js";
import { I, CHROME, logo, icon, button, iconButton, tile } from "./ui.js";
import { openBoard, spaceOf } from "./board.js";

const homeOf = (team) => team.home || `${appHome()}\\teams\\${teamSlug(team.name)}`;

export function overviewInit(v, cx) {
  v.counts = {}; // key → {doing, approve, done}
  v.forget = null; // the key asked to be forgotten (a second click forgets it)
  cx.spawn(async (cx) => {
    for (const [key, team] of Object.entries(shared("teams") ?? {})) {
      const dir = `${homeOf(team)}\\tasks`;
      const names = (await fsp.readdir(dir).catch(() => [])).filter((n) => /\.md$/i.test(n));
      const cards = [];
      for (const n of names) { const text = await readTextFile(`${dir}\\${n}`).catch(() => null); if (text != null) cards.push(parseCard(text, n)); }
      const n = (...s) => cards.filter((c) => s.includes(c.status)).length;
      v.counts[key] = { doing: n("dang-lam", "kiem-tra"), approve: n("cho-duyet"), done: n("xong"), all: cards.length };
      cx.notify();
    }
  });
}

export function overviewRender(v, cx) {
  const t = theme();
  const live = new Set(terminals().map((x) => x.address));
  const here = spaces().find((s) => s.active);
  const rows = Object.entries(shared("teams") ?? {}).map(([key, team]) => {
    const all = [team.lead, ...(team.members ?? [])].filter(Boolean);
    const space = spaceOf(team);
    return { key, team, all, space, alive: all.filter((m) => live.has(m.address)).length };
  }).sort((a, b) => (b.alive > 0) - (a.alive > 0) || (b.space?.id === here?.id) - (a.space?.id === here?.id) || a.team.name.localeCompare(b.team.name));
  const running = rows.filter((r) => r.alive > 0);
  const stopped = rows.filter((r) => !r.alive);

  const pill = (text, color) => div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(color + "1f").text_size(10.5).text_color(color).child(text);
  const row = ({ key, team, all, space, alive }) => {
    const c = v.counts[key];
    const forget = v.forget === key;
    return h_flex().id(`ov-${key}`).min_h(54).px(10).gap(11).items_center().rounded(10).bg(space?.id === here?.id ? t.hover : t.popover)
      .border_1().border_color(t.border)
      // The team's agents, overlapping like avatars.
      .child(h_flex().flex_none().w(46).children(all.slice(0, 4).map((m, i) => div().ml(i ? -6 : 0).p(1).rounded(5).bg(t.popover)
        .when(!live.has(m.address), (el) => el.opacity(0.4)).child(logo(m.agent, 14, t)))))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_size(12.5).child(team.name))
        .child(div().truncate().text_size(11).text_color(t.dim).child(space ? `${space.name} · ${team.folder}` : L(`${team.folder} · không còn space`, `${team.folder} · space is gone`))))
      .when(!!c?.approve, (el) => el.child(pill(L(`${c.approve} chờ duyệt`, `${c.approve} to approve`), t.ansi3)))
      .when(!!c?.doing, (el) => el.child(pill(L(`${c.doing} đang làm`, `${c.doing} in progress`), t.ansi4)))
      .child(alive ? pill(`${alive}/${all.length} agent`, t.ansi2) : div().flex_none().text_size(11).text_color(t.dim).child(c?.all ? L(`${c.done}/${c.all} xong`, `${c.done}/${c.all} done`) : L("đã dừng", "stopped")))
      .when(!!space, (el) => el.child(button(t, `ov-board-${key}`, L("Bảng việc", "Board"), () => { openBoard({ ...team, key }); v.close(); }, { small: true, icon: I("square-kanban") })))
      .when(!alive, (el) => el.child(forget
        ? button(t, `ov-forget-${key}`, L("Bỏ khỏi danh sách?", "Remove from list?"), (_e, cx) => {
            const { [key]: _gone, ...rest } = shared("teams") ?? {};
            setShared("teams", rest);
            v.forget = null;
            cx.notify();
          }, { small: true })
        : iconButton(t, `ov-x-${key}`, CHROME("x"), L("Bỏ khỏi danh sách (phiếu việc vẫn giữ)", "Remove from list (task cards are kept)"), (_e, cx) => { v.forget = key; cx.notify(); })));
  };
  const section = (name, list) => list.length > 0 && v_flex().gap(6)
    .child(div().pt(14).text_size(11.5).text_color(t.dim).child(`${name} · ${list.length}`))
    .children(list.map(row));

  return v_flex().id("team-ov").size_full().p(18).bg(t.popover).text_color(t.foreground).text_size(13)
    .track_focus(v.handle).on_key_down((e) => { if (e.key === "escape") v.close(); })
    .child(h_flex().gap(11).items_center()
      .child(tile(t, I("users"), 34))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(15).font_semibold().child(L("Phòng ban", "Teams")))
        .child(div().text_size(11.5).text_color(t.dim).child(L(`${running.length} đang hoạt động · ${stopped.length} đã dừng`, `${running.length} active · ${stopped.length} stopped`))))
      .child(iconButton(t, "ov-close", CHROME("x"), L("Đóng (Esc)", "Close (Esc)"), () => v.close())))
    .child(div().id("ov-body").flex_1().min_h(0).overflow_y_scroll().child(v_flex()
      .children([section(L("Đang hoạt động", "Active"), running), section(L("Đã dừng", "Stopped"), stopped)].filter(Boolean))))
    .child(h_flex().gap(8).items_center().pt(14)
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(here ? L(`Phòng ban mới sẽ ở space ${here.name}`, `A new team will go in space ${here.name}`) : ""))
      .child(button(t, "ov-done", L("Đóng", "Close"), () => v.close()))
      .child(button(t, "ov-new", L("Phòng ban mới", "New team"), (_e, cx) => { v.view = "create"; cx.notify(); }, { solid: true, icon: CHROME("plus") })));
}
