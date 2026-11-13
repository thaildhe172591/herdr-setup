// Small drawing pieces shared by the department dialog and its board.

import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, home } from "herdr";
import { L } from "./i18n.js";

export const I = (n) => `mods/team/icons/${n}.svg`; // Lucide (icons/LICENSE-Lucide.txt)
export const CHROME = (n) => `mods/workspace-chrome/${n}.svg`;
export const ROLE_ICON = { lead: I("route"), dev: I("code-xml"), "dev-b": I("code-xml"), qa: I("flask-conical"), review: I("scan-eye"), docs: I("notebook-pen"), research: CHROME("search") };
// Each role's colour, the same on pane headers (mods/desktop-pane keeps a copy) and the board.
// The coordinator's purple is fixed: the themes' magenta reads close to DEV's blue.
export const ROLE_TONE = { lead: "#c084fc", dev: "ansi4", "dev-b": "ansi4", qa: "ansi2", review: "ansi6", docs: "ansi3", research: "ansi3", scout: "ansi3" };
export const roleTone = (t, role) => ROLE_TONE[role]?.startsWith("#") ? ROLE_TONE[role] : t[ROLE_TONE[role]] ?? t.foreground;
export const TEMPLATE_ICON = { claude: "mods/composer/sparkle.svg", dept: I("building"), lean: I("leaf"), duo: I("git-fork"), research: CHROME("search") };
export const PACE_ICON = { nhanh: I("zap"), chuan: I("scale"), ky: I("shield-check") };
const LOGO = { claude: "icons/claude.svg", "claude-haiku": "icons/claude.svg", codex: "icons/codex.svg", agy: "icons/antigravity.svg" };

export const icon = (path, size, color) => svg(path).size(size).flex_none().text_color(color);

// An agent kind's own logo; Haiku is Claude's with a small "H".
export function logo(kind, size, t) {
  const img = image(LOGO[kind] ?? "icons/agent.svg").w(size).h(size).flex_none();
  if (kind !== "claude-haiku") return img;
  return div().relative().flex_none().child(img)
    .child(div().absolute().right(-3).bottom(-3).px(2).rounded(3).bg(t.foreground).text_color(t.background).text_size(8).font_semibold().child("H"));
}

// solid = the primary button; small = inside a row or card. A click inside a clickable row stays here.
export function button(t, id, label, act, { solid = false, icon: ic = null, small = false, hint = null } = {}) {
  return h_flex().id(id).h(small ? 24 : 30).px(small ? 8 : 12).gap(6).items_center().flex_none().rounded(small ? 6 : 8).cursor_pointer()
    .text_size(small ? 11.5 : 12.5)
    .when(solid, (el) => el.bg(t.solid).text_color(t.solid_foreground).hover((x) => x.opacity(0.88)))
    .when(!solid, (el) => el.border_1().border_color(t.border).hover((x) => x.bg(t.hover)))
    .when(!!ic, (el) => el.child(icon(ic, small ? 12 : 14, solid ? t.solid_foreground : t.muted)))
    .child(label)
    .when(!!hint, (el) => el.child(div().text_size(10.5).opacity(0.6).child(hint)))
    .on_click((e, cx) => { cx.stop_propagation(); act(e, cx); });
}

export const iconButton = (t, id, path, tip, act) => h_flex().id(id).size(28).flex_none().items_center().justify_center().rounded(7).cursor_pointer()
  .hover((x) => x.bg(t.hover)).tooltip(tip).on_click((e, cx) => { cx.stop_propagation(); act(e, cx); }).child(icon(path, 15, t.muted));

export const tile = (t, path, size = 30) => h_flex().size(size).flex_none().items_center().justify_center().rounded(9)
  .bg(t.background).border_1().border_color(t.border).child(icon(path, Math.round(size * 0.5), t.foreground));

export const openInCode = (file) => exec(`${home()}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`, [file]).catch(() => {});

// A role's setup in a few words: model · effort · how it runs ("Opus · xhigh", "By account · high · read-only").
export function setupText(r, models) {
  const model = models.find((m) => m.id === (r.model ?? null))?.label ?? r.model;
  const how = r.agent === "codex" ? (r.role === "review" || r.role === "research" ? L("chỉ đọc", "read-only") : L("tự duyệt", "auto-approve")) : r.agent === "agy" ? L("tự động", "auto") : null;
  return [model, r.effort, how].filter(Boolean).join(" · ");
}
