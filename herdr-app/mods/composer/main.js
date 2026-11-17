// Composer of the "desktop" layout, like Claude Desktop's: a chat box under the panes that sends to
// one or several agents in ANY space (target chip; default: the shown tab's Claude). Inside the box:
// attachments ("+", Alt+V, Ctrl+V of an image, drop), the text, target and send. Under it (the old
// status bar): machine, branch, agents (click: jump to one), Actions, model + effort, permission
// mode, context ring (context + plan limits). Menus are Popovers anchored to their chip.
// The same mod draws the large image view (props.view).

import { View, div, svg, image } from "gpui-kit";
import { L, setLang } from "./i18n.js";
import { v_flex, h_flex, TextareaState, Textarea, Popover, Scrollbar } from "gpui-base";
import { agents, focused, spaces, panes, terminals, knownAgents, run, hc, exec, theme, appHome, home, shared, setShared, nextCommand, pickFolder, props, openOverlay, closeOverlay, readTextFile, writeTextFile } from "herdr";
import {
  kindOf, insertText, targetTerminal, altVTarget, summarize, tokens, span, ctxTone, ACTIONS, withCustom, actionsFor, actionState, shouldSend, resetLabel,
  MODELS, EFFORTS, MODES, modelKey, effortLabel, modeOf, pickTargets, byTeam, composerPx, withoutEnter,
  lostSessions, resumeCommand, resumeKeys, atPrompt, teamSetup, teamMember, sessionKind, deptOf, boardTab, shellPrompt, routeMention,
  agentKind, parseCodexModels, parseAgyModels, modelsFor, effortsFor, modelCommand, effortCommand, codexFooter, agyFooter, currentModel,
  AGY_MODES, agyModeSteps, agyModeOf, CODEX_PERMS, codexStatus, agyUsage,
} from "./model.js";

const DIR = () => `${appHome()}\\attachments`;
const SCRIPT = (n) => `${appHome()}\\mods\\composer\\${n}`;
// Clipboard images go through clip-image.cs, built once with the .NET Framework compiler every Windows has:
// ~0.2 s a paste against ~0.7 s for Windows PowerShell's start (clip-image.ps1 stays the fallback). The number
// in the name changes with the source, so an edited helper is built again.
const CLIP_EXE = () => `${home()}\\AppData\\Local\\herdr-mods\\clip-image-1.exe`;
const CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const ICON = (n) => `mods/workspace-chrome/${n}.svg`;
// Codex's /status names a permission like its /permissions picker ("Read Only", "Approve for me").
const PERM_NAMES = { ask: "ask for approval", approve: "approve for me", full: "full access", readonly: "read only" };
const samePerm = (p, name) => !!name && name.toLowerCase().startsWith(PERM_NAMES[p.id]);
// The lowest quota left, in percent (null: not read yet).
const quotaLow = (q) => {
  const v = [...(q?.codex?.limits ?? []).map((x) => x.left), ...(q?.agy ?? []).map((x) => x.pct)];
  return v.length ? Math.min(...v) : null;
};
const EFFORT_SHORT = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra", max: "Max", ultra: "Ultra" };
const OWN = (n) => `mods/composer/${n}.svg`;
const lines = (s) => String(s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const fileName = (p) => p.split(/[\\/]/).pop();
const STATUS_LABEL = () => ({ working: L("đang làm", "working"), blocked: L("chờ bạn", "needs you"), done: L("xong", "done"), idle: L("rảnh", "idle") });
const PLACEHOLDER = () => L("Nhắn cho agent…  (Enter gửi · Shift+Enter xuống dòng · Ctrl+Enter phiên con)", "Message an agent…  (Enter to send · Shift+Enter for a new line · Ctrl+Enter for a sub-session)");
const POPS = ["plus", "target", "agents", "actions", "model", "mode", "ctx", "perm", "amode", "quota"];

const agentOf = (address) => agents().find((a) => a.address === address) ?? null;
const autoTarget = () => targetTerminal({ agents: agents(), focused: focused() });
// The picked targets live here: a shared write re-renders every mod, which made each tick in "Send to" lag.
// The agents list still hands one over through shared "composer.targets", taken over whenever it changes.
let picks = null, picksSeen;
const pickedTargets = () => {
  const s = shared("composer.targets") ?? null, k = JSON.stringify(s); // {pick, at} from the agents list (older: an array)
  if (k !== picksSeen) { picksSeen = k; picks = Array.isArray(s) ? s : s?.pick ?? null; }
  return picks ?? [];
};
const currentTargets = () => pickTargets(pickedTargets(), agents().map((a) => a.address), autoTarget());
const where = (a) => (a ? `${a.space_name} · ${a.tab_name}` : "");
// Its role in the department it belongs to (shared "teams"), e.g. "Trưởng nhóm", "Review"; else null.
const teamRole = (a) => {
  const m = a ? teamMember(shared("teams"), a.address) : null;
  // The stored label is the creation-time language; the known roles follow the interface's.
  const name = { lead: L("Điều phối", "Coordinator"), "dev-b": L("DEV (hướng 2)", "DEV (2nd)"), research: L("Nghiên cứu", "Research"), scout: L("Trinh sát", "Scout") }[m?.role];
  return m ? name ?? m.label ?? m.role : null;
};
// The program's icon (Claude Code, Codex, Antigravity…), as the pane headers draw it.
const programIcon = (p, size, color) => !p?.icon ? div().size(size).flex_none()
  : p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
// An agent's short name, as the Agents list shows it: its own title when it says something, else its tab.
const shortName = (a) => {
  const live = String(a?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const telling = live && live !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== a.program?.key;
  return telling ? live : a?.tab_name || a?.program?.name || a?.address || "";
};

export default class Composer extends View {
  init(_props, cx) {
    setLang(shared("lang"));
    if (props()?.view) return; // the image-view window draws only
    cx.spawn(async () => { this.clipExe = await this.buildClipHelper(); });
    this.items = [];
    this.status = null; // {terminal, sum, at}: the first target's status line data
    this.mode = {}; // terminal → permission mode read from its screen
    this.foot = {}; // terminal → {model, effort, mode?} under a Codex / Antigravity prompt
    this.quota = {}; // terminal → {at, codex: codexStatus | agy: agyUsage rows}, read on demand
    this.pop = null; // the open menu
    this.popIn = false; // its enter animation
    this.lines = 1;
    this.popFocus = cx.focus_handle();
    this.lang = shared("lang");
    this.text = TextareaState.new({ placeholder: PLACEHOLDER() });
    this.text.set_auto_grow(1, 6);
    this.prev = ""; // the text at the last change: Enter's newline is inserted without one
    this.doneReq = shared("composer.do")?.at ?? null; // requests from the agents' menu, handled once
    this.bindText();
    // A textarea's placeholder is fixed and a new one can't be made while drawing: on a language
    // switch, a timer swaps in a new box with the same text (checked twice a second, idle otherwise).
    cx.timer.every(500, (cx) => {
      if (this.lang === shared("lang")) return;
      setLang(shared("lang"));
      const v = this.text.value();
      this.lang = shared("lang");
      this.text = TextareaState.new({ placeholder: PLACEHOLDER() });
      this.text.set_auto_grow(1, 6);
      this.bindText();
      if (v) this.text.set_value(v);
      cx.notify();
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          if (c === "paste") await this.paste(true);
          else if (c === "pick-files") await this.pickFiles(cx);
          else if (c === "pick-folder") { const f = await pickFolder({ prompt: L("Đính kèm", "Attach") }); if (f) await this.addPaths([f], cx); }
          else if (c === "focus") this.text.focus();
          else if (c === "split-right" || c === "split-down") this.split(c.slice(6));
          else if (c === "scope") { // `ha` wrote the project scope: share it with the sidebar
            let folder = null;
            try { folder = JSON.parse(await readTextFile(`${appHome()}\\state\\scope.json`))?.folder ?? null; } catch {}
            if (folder !== (shared("scope") ?? null)) setShared("scope", folder);
          }
          else if (POPS.includes(c)) this.setPop(this.pop === c ? null : c, cx);
        } catch (e) { this.flash(cx, "error", L(`Không làm được: ${String(e?.message ?? e)}`, `Couldn't do that: ${String(e?.message ?? e)}`)); }
        cx.notify();
      }
    });
    // knownAgents() asks a shell: once here for every mod (pane headers, terminal menu), every 5 min.
    const learn = (cx) => cx.spawn(async () => {
      const list = (await knownAgents().catch(() => [])).map((x) => ({ key: x.key, name: x.name, run: x.run, installed: x.installed }));
      this.known = list;
      if (JSON.stringify(list) !== JSON.stringify(shared("agents.known"))) setShared("agents.known", list);
    });
    learn(cx);
    cx.timer.every(300000, learn);
    // The models Codex and Antigravity list, asked every 12 h (each CLI takes a few seconds).
    const lists = (cx) => cx.spawn(async () => {
      const had = shared("models.lists");
      if (had && Date.now() - (had.at ?? 0) < 12 * 3600000) return;
      const codex = parseCodexModels((await exec("cmd", ["/c", "codex", "debug", "models"], { timeout: 60000 }).catch(() => null))?.stdout);
      const agy = parseAgyModels((await exec("agy", ["models"], { timeout: 60000 }).catch(() => null))?.stdout);
      setShared("models.lists", { at: Date.now(), codex: codex.length ? codex : had?.codex ?? [], agy: agy.length ? agy : had?.agy ?? [] });
    });
    lists(cx);
    cx.timer.every(3600000, lists);
    // ponytail: every redraw repaints the whole window, so the 4 s poll redraws only on a change.
    const poll = (cx) => cx.spawn(async (cx) => { this.watchEnded(); if (await this.readStatus()) cx.notify(); });
    poll(cx);
    cx.timer.every(4000, poll);
    // Agent sessions (Claude, Codex, Antigravity) lost to a reboot come back in their panes (a few passes:
    // terminals may list late, and an agent's command can be missing for a while, see resumeLost).
    for (const ms of [2500, 15000, 35000]) cx.timer.after(ms, (cx) => cx.spawn(async (cx) => { await this.resumeLost(cx); cx.notify(); }));
    // A resume that didn't bring Claude back gets one more try a minute later (lostSessions).
    cx.timer.every(60000, (cx) => cx.spawn(async (cx) => { await this.resumeLost(cx); cx.notify(); }));
    this.show();
  }

  // The text box's handlers (bound again after a language switch, which makes a new box for its placeholder).
  bindText() {
    const typed = () => { this.prev = this.text.value(); this.lines = this.prev.split("\n").length; this.show(); };
    // Enter sends (the newline it inserted is dropped and the box clears at once); Shift+Enter is a new line.
    // Enter sends; Ctrl+Enter starts a sub-session of the target with the text as its task.
    this.text.on("submit", (e, cx) => {
      if (e.shift) typed();
      else if (e.secondary) this.spawnChild(withoutEnter(this.prev, this.text.value()), cx);
      else this.send(withoutEnter(this.prev, this.text.value()), cx);
      cx.notify();
    });
    this.text.on("change", (_e, cx) => { typed(); cx.notify(); });
    this.text.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.text.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.text.on("paste_other", (_e, cx) => cx.spawn(async (cx) => { await this.paste(false); cx.notify(); }));
  }

  // An agent (Claude, Codex, Antigravity) that disappears while its terminal lives was ended by the
  // person (/exit, Ctrl+C): remember its session so a later reboot doesn't bring it back.
  watchEnded() {
    const live = new Set(terminals().filter((t) => t.state === "live").map((t) => t.address));
    const now = new Set(agents().map((a) => a.address));
    const gone = this.prevClaude ? [...this.prevClaude].filter((a) => !now.has(a) && live.has(a)) : [];
    this.prevClaude = now;
    if (!gone.length) return;
    Promise.all(gone.map(async (t) => [t, (await this.savedSession(t))?.session ?? null])).then((pairs) => {
      const ended = { ...(shared("claude.ended") ?? {}) };
      for (const [t, s] of pairs) if (s) ended[t] = s;
      setShared("claude.ended", ended);
    });
  }

  statusPath(t) { return `${home()}\\AppData\\Local\\herdr-claude\\${t.replace(/[^\w.-]/g, "_")}.json`; }
  agentPath(t) { return `${home()}\\AppData\\Local\\herdr-agents\\${t.replace(/[^\w.-]/g, "_")}.json`; }
  // The newest session a terminal's agent saved: Claude's from its status line (herdr-claude), Codex's
  // and Antigravity's from their hooks (bridge/agent-session.mjs → herdr-agents). null when none.
  async savedSession(t) {
    const read = async (p) => { try { return JSON.parse(await readTextFile(p)); } catch { return null; } };
    const c = await read(this.statusPath(t)), a = await read(this.agentPath(t));
    const claude = c?.input?.session_id ? { at: c.at ?? 0, kind: "claude", session: c.input.session_id, cwd: c.input.cwd ?? null } : null;
    const other = a?.session ? { at: a.at ?? 0, kind: a.kind, session: a.session, cwd: a.cwd ?? null } : null;
    return claude && other ? (other.at > claude.at ? other : claude) : claude ?? other;
  }

  // Types each lost agent's resume (claude --resume, codex resume, agy --conversation) into its shell
  // when the agent stopped before herdr-core started (a reboot or a core restart). Once per core start.
  async resumeLost(cx) {
    if (this.resuming) return;
    this.resuming = true;
    try {
      const st = await hc(["server", "status", "--json"]);
      const up = JSON.parse(st.stdout || "{}").uptime_ms;
      if (st.code !== 0 || typeof up !== "number") return;
      const coreStart = Date.now() - up;
      const terms = terminals().filter((t) => t.state === "live" && !String(t.address).includes("/") && t.labels?.["herdr.space"]);
      const statuses = {};
      for (const t of terms) { const s = await this.savedSession(t.address); if (s) statuses[t.address] = s; }
      // "resumed" belongs to one core start: a later reboot may resume the same session again.
      const prev = shared("claude.resumed");
      const resumed = prev && Math.abs((prev.coreStart ?? 0) - coreStart) < 60000 ? { ...prev.map } : {};
      const list = lostSessions({ terminals: terms, agents: agents(), statuses, coreStart, ended: shared("claude.ended") ?? {}, resumed, now: Date.now() });
      if (!list.length) return;
      const done = [];
      for (const x of list) {
        // Typed key by key: a paste's bracket codes reached restored shells as text ("[200~claude…").
        // Only into a shell at its prompt (not a program someone started there); ctrl+c alone first.
        const term = await hc(["get", x.terminal, "--json"]).then((g) => JSON.parse(g.stdout || "{}")).catch(() => null);
        if (!atPrompt(term)) continue;
        // herdr-core reports the shell in front even while an agent runs in it: the screen decides too.
        const screen = await hc(["read", x.terminal]).catch(() => null);
        if (screen?.code !== 0 || !shellPrompt(screen.stdout)) continue;
        // The agent's command must be there: the first resumed Claude starts Claude Code's npm auto-update, which
        // removes the `claude` shim for ~15 s, and a resume typed then fails "command not found". Not counted as
        // a try: a later pass types it once the command is back.
        if ((await exec("where", [x.kind ?? "claude"]).catch(() => null))?.code !== 0) continue;
        // A team member resumes with its role's flags: the start argv the board kept, else model and effort.
        const member = teamMember(shared("teams"), x.terminal);
        if (member) Object.assign(x, teamSetup(shared("teams"), x.terminal), { member: true },
          Array.isArray(member.argv) && sessionKind(member.agent) === x.kind ? { argv: member.argv } : {});
        const keys = resumeKeys(x);
        let r;
        if (keys) {
          await hc(["keys", x.terminal, "--", keys[0]]).catch(() => {});
          await cx.sleep(500);
          r = await hc(["keys", x.terminal, "--", ...keys.slice(1)]).catch(() => ({ code: 1 }));
        } else r = await hc(["send", x.terminal, resumeCommand(x)]).catch(() => ({ code: 1 }));
        const before = resumed[x.terminal];
        const tries = (typeof before === "object" && before?.session === x.session ? before.tries : typeof before === "string" && before === x.session ? 1 : 0) + 1;
        resumed[x.terminal] = { session: x.session, at: Date.now(), tries };
        if (r.code === 0) done.push(x.terminal);
      }
      setShared("claude.resumed", { coreStart, map: resumed });
      const names = done.map((t) => { const a = terms.find((x) => x.address === t); return a?.labels?.where ?? t; });
      if (done.length) this.flash(cx, "ok", L(`Đã mở lại ${done.length} phiên agent sau khi khởi động lại: ${names.join(" · ")}`, `Resumed ${done.length} agent ${done.length === 1 ? "session" : "sessions"} after the restart: ${names.join(" · ")}`));
    } catch (e) {
      this.flash(cx, "error", L(`Không mở lại được phiên agent: ${String(e?.message ?? e)}`, `Couldn't resume the agent session: ${String(e?.message ?? e)}`));
    } finally { this.resuming = false; }
  }

  // Grows with the typed lines and the thumbnail row.
  show() {
    const px = composerPx({ lines: this.lines, thumbs: this.items.length > 0 });
    if (px !== this.px) { this.px = px; run("layout.resize", { id: "composer", px }); }
  }

  // Ctrl+Shift+O / E: an agent's pane splits into another of the same agent, a shell's into a shell.
  split(direction) {
    const p = panes().find((x) => x.pane === focused()?.pane);
    if (!p) return run("pane.split", { direction });
    const argv = (p.program?.agent && this.known?.find((k) => k.key === p.program.key && k.installed)?.run) || null;
    run("pane.split", { direction, pane: p.pane, ...(argv ? { argv } : {}) });
  }

  setPop(kind, cx) {
    if (this.pop === kind) return;
    // Typing when a menu opened: the caret comes back to the text when it closes (a popover hands
    // the keyboard back to wherever it was, sometimes a terminal pane).
    if (kind && !this.pop) this.refocus = !!this.typing;
    if (!kind && this.refocus) { this.refocus = false; cx.timer.after(16, () => this.text.focus()); }
    this.pop = kind;
    this.popIn = false;
    if (kind === "quota") {
      const term = currentTargets()[0], q = term && this.quota[term];
      if (term && !this.reading && (!q || Date.now() - q.at > 60000)) { this.reading = term; cx.spawn(async (cx) => this.readQuota(cx, term)); }
    }
    this.confirming = null; // the Actions entry waiting for "Gửi" / "Huỷ"
    if (kind === "actions") cx.spawn(async (cx) => { // the person's own actions, read fresh each time
      try { this.customActions = JSON.parse(await readTextFile(`${appHome()}\\actions.json`)); } catch { this.customActions = null; }
      cx.notify();
    });
    this.plusView = null; // the + menu opens on its first page
    if (kind) cx.timer.after(16, (cx) => { this.popIn = true; cx.notify(); });
    cx.notify();
  }

  // Feedback inside the composer instead of a toast over it: a pill that fades in at once and out
  // after a moment ("busy" stays until replaced). action: {label, run}.
  flash(cx, kind, text, action) {
    const id = (this.noteId = (this.noteId ?? 0) + 1);
    this.note = { id, kind, text, action, shown: false };
    cx.timer.after(16, (cx) => { if (this.note?.id === id) { this.note.shown = true; cx.notify(); } });
    if (kind !== "busy") {
      cx.timer.after(kind === "ok" ? 2600 : 7000, (cx) => {
        if (this.note?.id !== id) return;
        this.note.shown = false;
        cx.notify();
        cx.timer.after(220, (cx) => { if (this.note?.id === id) { this.note = null; cx.notify(); } });
      });
    }
    cx.notify();
  }

  // Returns whether anything shown changed.
  async readStatus() {
    const seen = () => JSON.stringify([this.status?.terminal, this.status?.sum, this.status?.remote, this.mode]); // not "at"
    const before = seen();
    const terminal = currentTargets()[0];
    if (!terminal || terminal.includes("/")) { this.status = terminal ? { terminal, sum: null, remote: true } : null; return seen() !== before; }
    try {
      const text = await readTextFile(`${home()}\\AppData\\Local\\herdr-claude\\${terminal.replace(/[^\w.-]/g, "_")}.json`);
      const j = JSON.parse(text);
      const sum = summarize(j?.input);
      if (JSON.stringify(sum) !== JSON.stringify(this.status?.terminal === terminal ? this.status.sum : undefined)) this.status = { terminal, sum, at: j?.at ?? null };
      else this.status.at = j?.at ?? null; // only "updated … ago" moved
    } catch {
      if (this.status?.terminal !== terminal) this.status = { terminal, sum: null, at: null }; // keep the last good read
    }
    // The mode from the screen: on a new target, while its menu is open, else every 20 s.
    this.polls = (this.polls ?? 0) + 1;
    if (agentOf(terminal)?.app === "claude-code" && (!(terminal in this.mode) || this.pop === "mode" || this.polls % 5 === 0)) {
      const r = await hc(["read", terminal, "--lines", "40"]).catch(() => null);
      const m = r?.code === 0 ? modeOf(r.stdout) : null;
      if (m) this.mode[terminal] = m;
    }
    // Codex / Antigravity: model and effort from under their prompt (new target, menu open, else every 20 s).
    const kind = agentKind(agentOf(terminal));
    if ((kind === "codex" || kind === "agy") && (!this.foot[terminal] || this.pop === "model" || this.polls % 5 === 0)) {
      const r = await hc(["read", terminal, "--lines", "30"]).catch(() => null);
      const f = r?.code === 0 ? (kind === "codex" ? codexFooter(r.stdout) : agyFooter(r.stdout)) : null;
      if (f && JSON.stringify(f) !== JSON.stringify(this.foot[terminal])) { this.foot[terminal] = f; return true; }
    }
    return seen() !== before;
  }

  // The helper exe, built when missing (it answers 2 without a folder: so it runs); null when it can't be.
  async buildClipHelper() {
    const exe = CLIP_EXE();
    if (await exec(exe, [], { timeout: 10000 }).then(() => true, () => false)) return exe;
    await exec("cmd", ["/c", "mkdir", exe.slice(0, exe.lastIndexOf("\\"))]).catch(() => {});
    const r = await exec(CSC, ["-nologo", "-optimize", "-target:exe", `-out:${exe}`, "-r:System.Windows.Forms.dll", "-r:System.Drawing.dll", SCRIPT("clip-image.cs")], { timeout: 60000 }).catch(() => null);
    return r?.code === 0 ? exe : null;
  }

  async paste(fromKey) {
    const helped = this.clipExe ? await exec(this.clipExe, [DIR()], { timeout: 15000 }).catch(() => null) : null;
    const r = helped?.code === 0 ? helped : await exec("powershell.exe", ["-STA", "-NoProfile", "-File", SCRIPT("clip-image.ps1"), DIR()], { timeout: 15000 });
    const saved = r.code === 0 ? lines(r.stdout) : [];
    if (!saved.length) {
      // Alt+V with no image: the pane in focus gets it, as if the composer weren't there.
      if (fromKey) { const t = altVTarget(focused(), currentTargets()[0]); if (t) await hc(["keys", t, "alt+v"]); }
      return;
    }
    this.items.push(...saved.map((p) => ({ path: p, kind: "image", preview: `attachments/${fileName(p)}` })));
    this.show();
  }

  async addPaths(paths, cx) {
    if (!paths.length) return;
    const r = await exec("pwsh", ["-NoProfile", "-File", SCRIPT("add-paths.ps1"), DIR(), ...paths], { timeout: 20000 });
    let found = [];
    try { found = r.code === 0 ? JSON.parse(r.stdout.replace(/^﻿/, "")) : []; } catch {}
    if (!found.length) return cx && this.flash(cx, "warn", L("Không đính kèm được: không tìm thấy file hoặc thư mục", "Couldn't attach: file or folder not found"));
    this.items.push(...found.map((f) => ({ path: f.path, kind: kindOf(f.path, f.isDir), preview: f.preview ? `attachments/${f.preview}` : null })));
    this.show();
  }

  async pickFiles(cx) {
    const r = await exec("powershell.exe", ["-STA", "-NoProfile", "-File", SCRIPT("pick-files.ps1")], { timeout: 600000 });
    await this.addPaths(r.code === 0 ? lines(r.stdout) : [], cx);
  }

  // One message to every target; one waiting on a question is skipped (answer it in "Cần bạn").
  // The box clears at once (Enter must feel instant); it comes back if nothing could be sent.
  send(raw, cx) {
    // "@review …" with a department in this space goes to that teammate only (the text without the mention).
    const typed = raw; // what comes back into the box when nothing is sent
    // The department of the target or of the tab in front (a space may hold several).
    const team = deptOf(shared("teams"), { address: autoTarget(), tab: focused()?.tab, space: spaces().find((s) => s.active)?.id });
    const mention = routeMention(raw, team);
    const list = mention && agentOf(mention.address) ? [mention.address] : currentTargets();
    if (mention && agentOf(mention.address)) raw = mention.rest;
    const items = this.items;
    const message = ((items.length ? insertText(items) : "") + raw.trim()).trim();
    const restore = (text) => { this.text.set_value(text); this.prev = text; this.lines = text.split("\n").length; this.show(); };
    if (!message || !list.length || !shouldSend(this.lastSentAt, Date.now(), 800)) { // nothing, no agent, double Enter
      restore(typed);
      if (message && !list.length) this.flash(cx, "warn", L("Chưa có agent để gửi — mở phiên (Ctrl+Shift+N) hoặc chọn ở nút →", "No agent to send to — open a session (Ctrl+Shift+N) or pick one with the → button"));
      return;
    }
    this.lastSentAt = Date.now();
    this.items = [];
    restore("");
    this.flash(cx, "busy", list.length > 1 ? L(`Đang gửi tới ${list.length} agent…`, `Sending to ${list.length} agents…`) : L(`Đang gửi tới ${where(agentOf(list[0])) || list[0]}…`, `Sending to ${where(agentOf(list[0])) || list[0]}…`));
    cx.spawn(async (cx) => {
      const sent = await this.deliver(list, message, cx);
      if (!sent && !this.text.value() && !this.items.length) { this.items = items; restore(typed); }
      cx.notify();
    });
  }

  async deliver(list, message, cx) {
    const skipped = list.map(agentOf).filter((a) => a?.status === "blocked");
    const results = await Promise.all(list.filter((t) => agentOf(t)?.status !== "blocked")
      .map(async (terminal) => ({ a: agentOf(terminal) ?? { address: terminal }, r: await hc(["send", terminal, message]).catch((e) => ({ code: 1, stderr: String(e) })) })));
    const sent = results.filter((x) => x.r.code === 0).map((x) => x.a);
    const failed = results.filter((x) => x.r.code !== 0).map((x) => x.a);
    const needYou = { label: L("Mở Cần bạn", "Open Needs you"), run: () => run("mod.open", { name: "needs-you" }) };
    if (failed.length) this.flash(cx, "error", L(`Không gửi được tới ${failed.map((a) => where(a) || a.address).join(", ")}`, `Couldn't send to ${failed.map((a) => where(a) || a.address).join(", ")}`));
    else if (skipped.length) this.flash(cx, "warn", L(`${skipped.map(where).join(", ")} đang chờ bạn trả lời — ${sent.length ? "các agent khác đã nhận" : "tin chưa gửi"}`, `${skipped.map(where).join(", ")} waiting for your answer — ${sent.length ? "the other agents got it" : "message not sent"}`), needYou);
    else this.flash(cx, "ok", sent.length > 1 ? L(`Đã gửi tới ${sent.length} agent · ${sent.map(where).join(" · ")}`, `Sent to ${sent.length} agents · ${sent.map(where).join(" · ")}`) : L(`Đã gửi tới ${where(sent[0]) || sent[0].address}`, `Sent to ${where(sent[0]) || sent[0].address}`));
    return sent.length > 0;
  }

  // A slash command or phrase for one agent, only while it isn't working or waiting.
  async say(cx, terminal, text, done) {
    const a = agentOf(terminal);
    const state = actionState(a ? { status: a.status, name: a.program?.name } : null);
    if (!state.enabled) return this.flash(cx, "warn", L(`Chưa gửi được — ${state.reason}`, `Not sent — ${state.reason}`));
    this.flash(cx, "busy", L(`Đang gửi "${text}"…`, `Sending "${text}"…`));
    const r = await hc(["send", terminal, text]).catch((e) => ({ code: 1, stderr: String(e) }));
    if (r.code === 0) this.flash(cx, "ok", done ?? L(`Đã gửi "${text}"`, `Sent "${text}"`));
    else this.flash(cx, "error", L(`Không gửi được "${text}": ${r.stderr.trim()}`, `Couldn't send "${text}": ${r.stderr.trim()}`));
  }

  // Shift+Tab until the footer under Claude's prompt shows the mode (it cycles through the enabled ones).
  async setMode(terminal, id, cx) {
    const label = MODES.find((m) => m.id === id)?.label ?? id;
    for (let i = 0; i < 7; i++) {
      const r = await hc(["read", terminal, "--lines", "40"]);
      const m = r.code === 0 ? modeOf(r.stdout) : null;
      if (m == null) return this.flash(cx, "warn", L("Claude đang mở hộp thoại — đóng nó (Esc) rồi đổi mode lại", "Claude has a dialog open — close it (Esc), then change the mode again"));
      this.mode[terminal] = m;
      cx.notify();
      if (m === id) return this.flash(cx, "ok", L(`Chế độ: ${label}`, `Mode: ${label}`));
      if (i === 0) this.flash(cx, "busy", L(`Đang chuyển sang ${label}…`, `Switching to ${label}…`));
      await hc(["keys", terminal, "shift+tab"]);
      await cx.sleep(350);
    }
    this.flash(cx, "warn", L(`Không chuyển được sang ${label} — mode này chưa bật trong phiên này`, `Couldn't switch to ${label} — this mode isn't enabled in this session`));
  }

  // ---------- drawing helpers ----------

  // A menu anchored to its chip, fading and sliding in.
  // content: a function, called only while open (a closed menu costs nothing per render).
  popover(kind, trigger, content, anchor = "bottom_left") {
    const lift = anchor.startsWith("bottom");
    if (this.pop !== kind) return Popover.new(`pop-${kind}`).anchor(anchor).open(false)
      .on_open_change((open, cx) => { if (open) this.setPop(kind, cx); }).trigger(trigger).content(div());
    return Popover.new(`pop-${kind}`).anchor(anchor).open(this.pop === kind).track_focus(this.popFocus)
      .on_open_change((open, cx) => this.setPop(open ? kind : this.pop === kind ? null : this.pop, cx))
      .trigger(trigger)
      .content(div().when(lift, (el) => el.pb(8)).when(!lift, (el) => el.pt(8))
        .child(div().id(`pop-${kind}-in`).relative().track_focus(this.popFocus)
          .on_key_down((e, cx) => { const act = this.digits?.[Number(e.key) - 1]; if (act) { act(cx); cx.stop_propagation(); } })
          .top(this.popIn ? 0 : lift ? 6 : -6).opacity(this.popIn ? 1 : 0)
          .transition("top", { duration: 170, easing: "ease-out" }).transition("opacity", { duration: 140, easing: "ease-out" })
          .child(content())));
  }

  card(t, w, kids) {
    return v_flex().w(w).p(6).gap(1).rounded(12).bg(t.popover).border_1().border_color(t.border).shadow_lg()
      .text_size(13).text_color(t.foreground).children(kids.filter(Boolean));
  }

  // The label stays whole; a long extra (space · tab) is cut with … on the right instead of spilling out.
  header(t, text, extra) {
    return h_flex().px(10).pt(6).pb(4).gap(8).items_center().min_w(0)
      .child(div().flex_none().text_size(11.5).text_color(t.dim).child(text))
      .when(!!extra, (el) => el.child(div().flex_1().min_w(0).truncate().text_right().text_size(11.5).text_color(t.dim).child(extra)));
  }

  sep(t) { return div().h(1).mx(6).my(4).bg(t.border); }

  // Like Desktop's menu rows: label (+ badge), description, check when current, digit hint.
  item(t, id, o) {
    return h_flex().id(id).px(10).py(o.desc ? 7 : 6).gap(10).items_center().rounded(8).cursor_pointer()
      .when(!!o.disabled, (el) => el.opacity(0.45))
      .hover((x) => x.bg(t.hover))
      .on_click((_e, cx) => { if (o.disabled) return; if (!o.keep) this.setPop(null, cx); o.act(cx); })
      .when(!!o.icon, (el) => el.child(svg(o.icon).size(15).text_color(t.muted)))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(7).items_center().child(div().truncate().child(o.label))
          .when(!!o.badge, (el) => el.child(div().px(6).h(18).flex().items_center().rounded(6).border_1().border_color(t.border).text_size(10.5).text_color(t.muted).child(o.badge))))
        .when(!!o.desc, (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim).child(o.desc))))
      .when(!!o.on, (el) => el.child(svg(ICON("check")).size(14).text_color(t.accent)))
      .when(o.hint != null, (el) => el.child(div().min_w(12).text_size(11.5).text_color(t.dim).child(String(o.hint))));
  }

  chip(t, id, kids, tip, open, extra) {
    // Pressed feedback (active) so every click visibly lands.
    return h_flex().id(id).h(26).px(8).gap(6).items_center().rounded(8).cursor_pointer().text_size(12).text_color(open ? t.foreground : t.muted)
      .when(open, (el) => el.bg(t.hover)).hover((x) => x.bg(t.hover).text_color(t.foreground)).active((x) => x.bg(t.selected)).tooltip(tip ?? "")
      .when(!!extra, extra).children(kids);
  }

  bar(t, id, pct, color, h = 4) {
    return div().h(h).rounded(h / 2).bg(t.border).overflow_hidden()
      .child(div().id(id).h_full().w(`${Math.min(100, Math.max(0, pct ?? 0))}%`).rounded(h / 2).bg(color).transition("width", { duration: 500, easing: "ease-out" }));
  }

  ring(t, pct) {
    const tone = t[ctxTone(pct)] ?? t.dim;
    const step = pct == null ? 0 : Math.max(pct > 0 ? 1 : 0, Math.round(Math.min(100, pct) / 5));
    return div().relative().size(16).flex_none()
      .child(svg(OWN("ring/track")).absolute().top(0).left(0).size(16).text_color(t.border))
      .child(svg(OWN(`ring/${step}`)).absolute().top(0).left(0).size(16).text_color(tone));
  }

  // ---------- menus ----------

  plusMenu(t) {
    this.digits = null;
    if (this.plusView === "forward") return this.forwardMenu(t);
    return this.card(t, 270, [
      this.item(t, "p-files", { icon: ICON("file-text"), label: L("Thêm file hoặc ảnh…", "Add files or images…"), act: () => run("composer.pick-files") }),
      this.item(t, "p-folder", { icon: ICON("folder"), label: L("Thêm thư mục…", "Add folder…"), act: () => run("composer.pick-folder") }),
      this.item(t, "p-paste", { icon: ICON("files"), label: L("Dán ảnh từ clipboard", "Paste image from clipboard"), hint: "Alt+V", act: () => run("composer.paste") }),
      this.sep(t),
      this.item(t, "p-fwd", { icon: ICON("chevron-right"), label: L("Chèn câu trả lời của agent…", "Insert an agent's answer…"), desc: L("Chuyển kết quả của agent A cho agent B", "Pass agent A's result to agent B"), keep: true, act: (cx) => { this.plusView = "forward"; cx.notify(); } }),
      this.item(t, "p-child", { icon: ICON("git-branch"), label: L("Gửi thành phiên con", "Send as sub-session"), hint: "Ctrl+Enter", desc: L("Agent mới làm task này, báo về agent đang chọn", "A new agent does this task and reports back to the selected agent"), act: (cx) => this.spawnChild(this.text.value(), cx) }),
      this.item(t, "p-team", { icon: ICON("layers"), label: L("Tạo phòng ban…", "New team…"), desc: L("Trưởng nhóm + Code, Review, Test… (Claude, Codex, Antigravity)", "Lead + Code, Review, Test… (Claude, Codex, Antigravity)"), act: () => run("mod.open", { name: "team" }) }),
      this.sep(t),
      this.item(t, "p-keys", { icon: ICON("square"), label: L("Phím tắt", "Keyboard shortcuts"), hint: "F1", act: () => run("mod.open", { name: "hotkeys" }) }),
    ]);
  }

  // Pick an agent: its last answer goes into the box as a quote, for the target to read.
  forwardMenu(t) {
    return this.card(t, 330, [
      h_flex().id("fw-back").px(10).pt(6).pb(4).gap(6).items_center().cursor_pointer().on_click((_e, cx) => { this.plusView = null; cx.notify(); })
        .child(svg(ICON("chevron-left")).size(12).text_color(t.dim)).child(div().text_size(11.5).text_color(t.dim).child(L("Chèn câu trả lời của…", "Insert the answer of…"))),
      this.scroll("fw-list", 300, this.groups(t, (a) => this.agentRow(t, a, { id: "fw", act: (_e, cx) => { this.setPop(null, cx); this.plusView = null; cx.spawn(async (cx) => { await this.insertReply(a, cx); cx.notify(); }); } }))),
    ]);
  }

  async insertReply(a, cx) {
    this.flash(cx, "busy", L(`Đang lấy câu trả lời của ${where(a)}…`, `Getting the answer of ${where(a)}…`));
    let reply = null;
    try {
      if (a.app === "claude-code" && !a.address.includes("/")) {
        const j = JSON.parse(await readTextFile(this.statusPath(a.address)));
        const r = await exec("node", [`${appHome()}\\bridge\\last-reply.mjs`, j?.input?.transcript_path ?? ""], { timeout: 15000 });
        if (r.code === 0 && r.stdout.trim()) reply = r.stdout.trim();
      }
      if (!reply) { // another agent, or no transcript: what its screen shows
        const r = await hc(["read", a.address, "--lines", "60"]);
        if (r.code === 0) reply = r.stdout.replace(/\[hc\][^\n]*\n?/g, "").trim();
      }
    } catch {}
    if (!reply) return this.flash(cx, "warn", L(`Không lấy được câu trả lời của ${where(a)}`, `Couldn't get the answer of ${where(a)}`));
    const quote = `Kết quả từ ${where(a)}:\n"""\n${reply.slice(0, 20000)}\n"""\n\n`;
    const next = quote + this.text.value();
    this.text.set_value(next); this.prev = next; this.lines = next.split("\n").length; this.show();
    this.text.focus();
    this.flash(cx, "ok", L(`Đã chèn câu trả lời của ${where(a)} — chọn agent nhận ở nút → rồi gửi`, `Inserted the answer of ${where(a)} — pick the receiving agent with the → button, then send`));
  }

  // A sub-session: a new agent of the target's kind, started by herdr-core as the target's child
  // (it shows under it, ends with it, and herdr-core tells the target when it is done).
  spawnChild(raw, cx) {
    const parent = currentTargets()[0];
    const pa = agentOf(parent);
    const task = ((this.items.length ? insertText(this.items) : "") + String(raw ?? "").trim()).trim();
    if (!pa) return this.flash(cx, "warn", L("Chọn một agent làm phiên cha ở nút → trước", "Pick an agent as the parent session with the → button first"));
    if (!task) return this.flash(cx, "warn", L("Gõ task cho phiên con rồi nhấn Ctrl+Enter", "Type a task for the sub-session, then press Ctrl+Enter"));
    const argv = (pa.program?.agent && (shared("agents.known") ?? []).find((k) => k.key === pa.program.key && k.installed)?.run) || ["claude"];
    const cwd = panes().find((p) => p.terminal === parent)?.cwd ?? spaces().find((s) => s.id === pa.space)?.folder;
    const items = this.items;
    this.items = []; this.text.set_value(""); this.prev = ""; this.lines = 1; this.show();
    this.flash(cx, "busy", L(`Đang tạo phiên con dưới ${where(pa)}…`, `Creating a sub-session under ${where(pa)}…`));
    cx.spawn(async (cx) => {
      const r = await hc(["run", "--bg", "--json", "--parent", parent, ...(cwd ? ["--cwd", cwd] : []), "--", ...argv, task]).catch((e) => ({ code: 1, stderr: String(e) }));
      let addr = null;
      try { addr = JSON.parse(r.stdout ?? "{}").address ?? null; } catch {}
      if (r.code !== 0 || !addr) { this.items = items; this.text.set_value(raw); this.prev = raw; this.flash(cx, "error", L(`Không tạo được phiên con: ${(r.stderr ?? "").trim()}`, `Couldn't create the sub-session: ${(r.stderr ?? "").trim()}`)); }
      else this.flash(cx, "ok", L(`Đã tạo phiên con ${addr} dưới ${where(pa)} — xong việc nó sẽ báo về`, `Created sub-session ${addr} under ${where(pa)} — it will report back when done`), { label: L("Xem", "View"), run: () => run("terminal.peek", { terminal: addr }) });
      cx.notify();
    });
  }

  // A list that scrolls inside a menu: a box of definite height (as tall as its rows, at most `cap`)
  // with the scrolling list inside; max_h + overflow on the list itself never scrolled in a popover.
  scroll(id, cap, kids) {
    const g = byTeam(agents(), focused(), shared("teams"));
    const h = Math.min(cap, g.reduce((n, x) => n + 26 + x.agents.length * 36, 4));
    return div().relative().w_full().h(Math.max(40, h)).flex_none()
      .child(v_flex().id(id).absolute().inset_0().overflow_y_scroll().gap(2).children(kids));
  }

  // Which agent, at a glance: its icon (Claude / Codex / Antigravity), its role in a department or
  // its own name, then kind · state; the space is the group header above.
  agentRow(t, a, o) {
    const role = teamRole(a);
    return h_flex().id(`${o.id}-${a.address}`).min_h(36).px(10).gap(9).items_center().rounded(8).cursor_pointer()
      .hover((x) => x.bg(t.hover)).on_click(o.act)
      .when(!!o.left, (el) => el.child(o.left))
      .child(div().relative().flex_none().child(programIcon(a.program, 16, t.muted))
        .child(div().absolute().right(-2).bottom(-2).size(7).rounded(4).border_1().border_color(t.popover).bg(t[a.status] ?? t.dim)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().child(role ?? shortName(a)))
        .child(div().truncate().text_size(11).text_color(t.dim).child(`${a.program?.name ?? a.app ?? "agent"} · ${STATUS_LABEL()[a.status] ?? a.status ?? ""}${role ? ` · ${a.address}` : ""}`)))
      .when(a.tab === focused()?.tab, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(L("đang xem", "viewing"))));
  }

  groups(t, rows) {
    const g = byTeam(agents(), focused(), shared("teams"));
    if (!g.length) return [div().px(10).py(8).text_color(t.dim).child(L("Chưa có agent nào đang chạy.", "No agents running."))];
    return g.map((x) => v_flex().gap(1)
      .child(div().px(10).pt(6).pb(2).text_size(11).font_semibold().text_color(t.dim).child(x.name))
      .children(x.agents.map(rows)));
  }

  targetMenu(t) {
    this.digits = null;
    const picked = pickedTargets().filter((a) => agentOf(a));
    const toggle = (address, cx) => {
      const next = picked.includes(address) ? picked.filter((x) => x !== address) : [...picked, address];
      picks = next.length ? next : null;
      cx?.notify();
    };
    const box = (on) => h_flex().size(16).flex_none().items_center().justify_center().rounded(4).border_1()
      .border_color(on ? t.accent : t.input).when(on, (el) => el.bg(t.accent).child(svg(ICON("check")).size(11).text_color(t.accent_foreground)));
    return this.card(t, 330, [
      this.header(t, L("Gửi tới", "Send to"), picked.length > 1 ? L(`${picked.length} agent`, `${picked.length} agents`) : null),
      this.item(t, "t-auto", { label: L("Tự động", "Auto"), desc: L("Agent của tab đang xem (tab terminal: Claude của space)", "The shown tab's agent (terminal tab: the space's Claude)"), on: !picked.length, act: (cx) => { picks = null; cx?.notify(); } }),
      this.sep(t),
      this.scroll("t-list", 300, this.groups(t, (a) => this.agentRow(t, a, { id: "t", left: box(picked.includes(a.address)), act: (_e, cx) => toggle(a.address, cx) }))),
      div().px(10).pt(6).pb(4).text_size(11).text_color(t.dim).child(L("Chọn nhiều agent ở nhiều space, nhiều phòng ban để gửi một tin cho tất cả.", "Pick several agents across spaces and teams to send one message to all.")),
    ]);
  }

  agentsMenu(t) {
    this.digits = null;
    const need = agents().filter((a) => a.status === "blocked" || a.status === "done").length;
    return this.card(t, 320, [
      this.header(t, "Agents", `${agents().length}`),
      need ? this.item(t, "g-need", { icon: ICON("circle-check"), label: L(`${need} cần bạn`, `${need} need you`), desc: L("Mở hộp Cần bạn (Ctrl+Shift+Space)", "Open the Needs you box (Ctrl+Shift+Space)"), act: () => run("mod.open", { name: "needs-you" }) }) : null,
      need ? this.sep(t) : null,
      this.scroll("g-list", 320, this.groups(t, (a) => this.agentRow(t, a, { id: "g", act: (_e, cx) => { this.setPop(null, cx); run("agent.focus", { terminal: a.address }); } }))),
    ]);
  }

  // Each agent's own models and efforts: Claude's (from its status line), Codex's and Antigravity's
  // (as their CLI lists them; the current one read under their prompt). Each takes its own slash command.
  // Claude's older models sit under "Thêm model", folded unless the one running is among them.
  modelMenu(t, terminal, s) {
    const a = agentOf(terminal);
    const kind = agentKind(a);
    const list = modelsFor(kind, shared("models.lists") ?? {});
    const foot = kind === "claude" ? { model: s?.model } : this.foot[terminal];
    const cur = currentModel(list, foot);
    const effort = kind === "claude" ? s?.effort : foot?.effort;
    const reread = () => { delete this.foot[terminal]; }; // the next poll reads its footer again
    const pickModel = (m) => (cx) => { this.setPop(null, cx); cx.spawn(async (cx) => { await this.say(cx, terminal, modelCommand(kind, m.id), L(`Mô hình: ${m.label}`, `Model: ${m.label}`)); reread(); }); };
    const pickEffort = (e) => (cx) => {
      this.setPop(null, cx);
      const cmd = effortCommand(kind, e, cur?.id);
      if (!cmd) return this.flash(cx, "warn", L("Chưa biết Codex đang chạy model nào: chọn model trước", "Codex's model isn't known yet: pick a model first"));
      cx.spawn(async (cx) => { await this.say(cx, terminal, cmd, L(`Mức suy luận: ${EFFORT_SHORT[e] ?? e}`, `Effort: ${EFFORT_SHORT[e] ?? e}`)); reread(); });
    };
    const main = list.filter((m) => !m.more), more = list.filter((m) => m.more);
    const open = this.moreModels || (!!cur?.more && this.moreModels !== false);
    this.digits = main.slice(0, 9).map(pickModel);
    const row = (m, i) => this.item(t, `m-${m.id}`, { label: m.label, desc: m.desc || null, on: cur?.id === m.id, hint: i != null && i < 9 ? i + 1 : null, act: (cx) => pickModel(m)(cx), keep: true });
    const efforts = effortsFor(kind, cur);
    const seg = (e) => h_flex().id(`e-${e}`).flex_1().h(28).items_center().justify_center().rounded(7).cursor_pointer().text_size(12)
      .when(effort === e, (el) => el.bg(t.selected).text_color(t.foreground).font_semibold())
      .when(effort !== e, (el) => el.text_color(t.muted).hover((x) => x.bg(t.hover).text_color(t.foreground)))
      .on_click((_e, cx) => pickEffort(e)(cx)).child(EFFORT_SHORT[e] ?? e);
    return this.card(t, 320, [
      this.header(t, L("Mô hình", "Model"), where(a)),
      ...main.map((m, i) => row(m, i)),
      more.length ? this.item(t, "m-more", { label: L("Thêm model", "More models"), desc: !open && cur?.more ? L(`Đang dùng ${cur.label}`, `Using ${cur.label}`) : null,
        hint: open ? "▾" : "›", act: (cx) => { this.moreModels = !open; cx.notify(); }, keep: true }) : null,
      open && more.length ? div().relative().w_full().h(Math.min(240, more.length * 34)).flex_none()
        .child(v_flex().id("m-more-list").absolute().inset_0().overflow_y_scroll().gap(1).children(more.map((m) => row(m, null)))) : null,
      this.sep(t),
      this.header(t, L("Mức suy luận", "Effort"), efforts.length && effort ? EFFORT_SHORT[effort] ?? effort : ""),
      efforts.length ? h_flex().px(6).pb(4).gap(3).children(efforts.map(seg))
        : div().px(10).pb(6).text_size(11.5).text_color(t.dim).child(L(`${cur?.label ?? "Model này"} không chỉnh mức suy luận`, `${cur?.label ?? "This model"} has no effort setting`)),
      // Claude Code's /effort also becomes the default of new sessions (its own behaviour).
      kind === "claude" && efforts.length ? div().px(10).pb(6).text_size(10.5).text_color(t.dim)
        .child(L("Claude lưu effort vừa chọn làm mặc định cho phiên mới", "Claude keeps the effort you pick as the default for new sessions")) : null,
      kind === "claude" ? this.sep(t) : null,
      kind === "claude" ? this.item(t, "m-fast", { label: L("Chế độ nhanh (/fast)", "Fast mode (/fast)"), desc: L("Bật/tắt: Opus trả lời nhanh hơn, giá cao hơn; cần usage credits", "Toggle: faster Opus output at a higher price; needs usage credits"),
        act: (cx) => cx.spawn(async (cx) => this.say(cx, terminal, "/fast", L("Đã gửi /fast (bật/tắt chế độ nhanh)", "Sent /fast (fast mode toggled)"))) }) : null,
    ]);
  }

  // A Codex / Antigravity agent must be free before keys go to it (its own dialog would take them).
  busyReason(terminal) {
    const st = agentOf(terminal)?.status;
    return st === "working" ? L("Agent đang làm, đợi nó xong", "The agent is working; wait for it") : st === "blocked" ? L("Agent đang chờ bạn trả lời", "The agent is waiting for your answer") : null;
  }

  permMenu(t, terminal) {
    const cur = CODEX_PERMS.find((p) => samePerm(p, this.quota[terminal]?.codex?.permissions));
    const pick = (p) => (cx) => { this.setPop(null, cx); cx.spawn(async (cx) => this.setCodexPerm(cx, terminal, p)); };
    this.digits = CODEX_PERMS.map(pick);
    return this.card(t, 330, [
      this.header(t, L("Quyền của Codex", "Codex permissions"), where(agentOf(terminal))),
      ...CODEX_PERMS.map((p, i) => this.item(t, `pe-${p.id}`, { label: p.label, desc: p.desc, on: cur?.id === p.id, hint: i + 1, act: (cx) => pick(p)(cx), keep: true })),
      div().px(10).pt(2).pb(6).text_size(10.5).text_color(t.dim).child(cur ? L("Quyền hiện tại đọc từ /status", "Current permission read from /status") : L("Mở Hạn mức để đọc quyền hiện tại", "Open Quota to read the current permission")),
    ]);
  }

  async setCodexPerm(cx, terminal, p) {
    const why = this.busyReason(terminal);
    if (why) return this.flash(cx, "warn", why);
    const r = await hc(["send", terminal, "/permissions"]).catch(() => ({ code: 1 }));
    if (r.code !== 0) return this.flash(cx, "error", L("Không gửi được /permissions", "Couldn't send /permissions"));
    await cx.sleep(900);
    await hc(["keys", terminal, p.key]).catch(() => {});
    if (this.quota[terminal]?.codex) this.quota[terminal].codex.permissions = null; // read again next time
    this.flash(cx, "ok", L(`Quyền Codex: ${p.label}`, `Codex permissions: ${p.label}`));
  }

  agyModeMenu(t, terminal) {
    const cur = this.foot[terminal]?.mode;
    const pick = (m) => (cx) => { this.setPop(null, cx); cx.spawn(async (cx) => { await this.setAgyMode(cx, terminal, m); cx.notify(); }); };
    this.digits = AGY_MODES.map(pick);
    return this.card(t, 320, [
      this.header(t, L("Chế độ Antigravity", "Antigravity mode"), where(agentOf(terminal))),
      ...AGY_MODES.map((m, i) => this.item(t, `am-${m.id}`, { label: m.label, desc: m.desc, badge: m.id === "auto" ? L("Vai QA", "QA role") : null, on: cur === m.id, hint: i + 1, act: (cx) => pick(m)(cx), keep: true })),
      div().px(10).pt(2).pb(6).text_size(10.5).text_color(t.dim).child(L("`agy --mode auto` vẫn khởi động ở Hỏi trước: chọn ở đây để chuyển", "`agy --mode auto` still starts in Ask first: switch here")),
    ]);
  }

  // Shift+Tab until the footer names the wanted mode (the cycle is plan → default → accept-edits → auto).
  async setAgyMode(cx, terminal, m) {
    const why = this.busyReason(terminal);
    if (why) return this.flash(cx, "warn", why);
    for (let i = 0; i < 5; i++) {
      const r = await hc(["read", terminal]).catch(() => null);
      const f = r?.code === 0 ? agyFooter(r.stdout) : null;
      if (f) this.foot[terminal] = f;
      // Right after a switch a narrow pane shows the mode only in a banner: read that too.
      const mode = r?.code === 0 ? agyModeOf(r.stdout) : null;
      if (mode && this.foot[terminal]) this.foot[terminal] = { ...this.foot[terminal], mode };
      if (mode === m.id) return this.flash(cx, "ok", L(`Chế độ Antigravity: ${m.label}`, `Antigravity mode: ${m.label}`));
      if (!mode || agyModeSteps(mode, m.id) == null) break;
      await hc(["keys", terminal, "shift+tab"]).catch(() => {});
      await cx.sleep(500);
    }
    this.flash(cx, "warn", L(`Không chuyển được sang ${m.label}: mở pane để xem`, `Couldn't switch to ${m.label}: open the pane to check`));
  }

  quotaMenu(t, terminal, kind) {
    const q = this.quota[terminal];
    const rows = kind === "codex" ? [
        ...(q?.codex?.context ? [{ label: L("Context còn trống", "Context left"), pct: q.codex.context.left, sub: q.codex.context.detail }] : []),
        ...(q?.codex?.limits ?? []).map((x) => ({ label: x.label, pct: x.left, sub: x.resets ? L(`Reset ${x.resets}`, `Resets ${x.resets}`) : null }))]
      : (q?.agy ?? []).map((x) => ({ label: `${x.group ?? ""} · ${x.label.replace(/ Remaining$/i, "")}`, pct: x.pct, sub: null }));
    const bar = (pct) => div().h(5).w_full().rounded(3).bg(t.hover).child(div().h_full().w(`${Math.max(2, Math.min(100, pct))}%`).rounded(3).bg(pct < 10 ? t.ansi1 : pct < 30 ? t.ansi3 : t.ansi2));
    return this.card(t, 340, [
      this.header(t, L("Hạn mức còn lại", "Quota left"), kind === "codex" ? (q?.codex?.plan ? `Codex · ${q.codex.plan}` : "Codex") : "Antigravity"),
      ...(rows.length ? rows.map((r, i) => v_flex().id(`qu-${i}`).px(10).py(5).gap(4)
        .child(h_flex().gap(8).child(div().flex_1().min_w(0).truncate().text_size(12).child(r.label)).child(div().text_size(12).font_semibold().child(`${Math.round(r.pct)}%`)))
        .child(bar(r.pct)).when(!!r.sub, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(r.sub))))
        : [div().px(10).py(6).text_size(12).text_color(t.dim).child(this.reading === terminal ? L("Đang đọc… (khoảng 10 giây)", "Reading… (about 10 seconds)") : L("Chưa có số liệu", "No data yet"))]),
      kind === "codex" && q?.codex ? div().px(10).pt(2).text_size(11).text_color(t.dim).child(`${q.codex.model ?? ""}${q.codex.effort ? " · " + q.codex.effort : ""}${q.codex.permissions ? " · " + q.codex.permissions : ""}`) : null,
      div().px(10).pt(4).pb(6).text_size(10.5).text_color(t.dim).child(q ? L(`Đọc lúc ${new Date(q.at).toLocaleTimeString()} từ ${kind === "codex" ? "/status" : "/usage"}`, `Read at ${new Date(q.at).toLocaleTimeString()} from ${kind === "codex" ? "/status" : "/usage"}`) : L(`Đọc từ ${kind === "codex" ? "/status" : "/usage"} của agent`, `Read from the agent's ${kind === "codex" ? "/status" : "/usage"}`)),
    ]);
  }

  // Codex prints /status into its transcript; Antigravity opens /usage as a panel (closed with Esc).
  async readQuota(cx, terminal) {
    const kind = agentKind(agentOf(terminal));
    try {
      if (this.busyReason(terminal) || (kind !== "codex" && kind !== "agy")) return;
      const r = await hc(["send", terminal, kind === "codex" ? "/status" : "/usage"]).catch(() => ({ code: 1 }));
      if (r.code !== 0) return;
      await cx.sleep(kind === "codex" ? 2500 : 4000);
      const scr = await hc(["read", terminal, "--lines", "40"]).catch(() => null);
      if (kind === "agy") await hc(["keys", terminal, "esc"]).catch(() => {});
      const text = scr?.code === 0 ? scr.stdout : "";
      this.quota[terminal] = kind === "codex" ? { at: Date.now(), codex: codexStatus(text) } : { at: Date.now(), agy: agyUsage(text) };
    } finally { this.reading = null; cx.notify(); }
  }

  modeMenu(t, terminal) {
    const cur = this.mode[terminal];
    const pick = (m) => (cx) => { this.setPop(null, cx); cx.spawn(async (cx) => { await this.setMode(terminal, m.id, cx); cx.notify(); }); };
    this.digits = MODES.map(pick);
    return this.card(t, 310, [
      this.header(t, L("Chế độ", "Mode"), where(agentOf(terminal))),
      ...MODES.map((m, i) => this.item(t, `mo-${m.id}`, { label: m.label, desc: m.desc, badge: m.id === "auto" ? L("Khuyên dùng", "Recommended") : null, on: cur === m.id, hint: i + 1, act: (cx) => pick(m)(cx), keep: true })),
    ]);
  }

  ctxMenu(t, terminal, s) {
    this.digits = null;
    const st = this.status;
    const lim = (id, label, l) => !l ? null : v_flex().px(10).py(5).gap(6)
      .child(h_flex().gap(8).child(div().flex_1().child(label)).child(div().text_size(11.5).text_color(t.dim).child(L(`Reset ${resetLabel(l.resetsAt, Date.now())}`, `Resets ${resetLabel(l.resetsAt, Date.now())}`))).child(div().w(34).text_size(11.5).text_color(t.muted).child(`${Math.round(l.pct)}%`)))
      .child(this.bar(t, id, l.pct, t[l.pct >= 90 ? "ansi1" : l.pct >= 70 ? "ansi3" : "accent"]));
    if (!s) return this.card(t, 340, [this.header(t, L("Ngữ cảnh", "Context")), div().px(10).pb(8).text_color(t.dim).child(L("Chưa có số liệu — gửi một tin cho Claude, status line sẽ cập nhật.", "No data yet — send Claude a message and the status line will update."))]);
    const tone = t[ctxTone(s.ctxPct)] ?? t.dim;
    const ok = actionState(agentOf(terminal) ? { status: agentOf(terminal).status } : null).enabled;
    const tile = (label, value) => v_flex().flex_1().min_w(0).gap(2).px(8).py(6).rounded(8).bg(t.raised)
      .child(div().text_size(10.5).text_color(t.dim).child(label)).child(value);
    return this.card(t, 350, [
      this.header(t, L("Ngữ cảnh", "Context"), `${tokens(s.ctxUsed)} / ${tokens(s.ctxSize)}`),
      v_flex().px(10).pb(4).gap(6)
        .child(h_flex().child(div().flex_1().font_semibold().text_color(tone).child(L(`${Math.round(s.ctxPct ?? 0)}% đã dùng`, `${Math.round(s.ctxPct ?? 0)}% used`)))
          .child(div().text_size(11.5).text_color(t.dim).child(L(`còn ${tokens(Math.max(0, (s.ctxSize ?? 0) - (s.ctxUsed ?? 0)))}`, `${tokens(Math.max(0, (s.ctxSize ?? 0) - (s.ctxUsed ?? 0)))} left`))))
        .child(this.bar(t, "c-ctx", s.ctxPct, tone, 6))
        .child(h_flex().pt(4).gap(6)
          .child(tile(L("Chi phí", "Cost"), div().font_semibold().child(s.cost == null ? "–" : `$${s.cost.toFixed(2)}`)))
          .child(tile(L("Thời gian", "Time"), div().font_semibold().child(span(s.durationMs))))
          .child(tile(L("Dòng code", "Code lines"), h_flex().gap(4).font_semibold().child(div().text_color(t.ansi2).child(`+${s.added ?? 0}`)).child(div().text_color(t.ansi1).child(`−${s.removed ?? 0}`)))))
        .child(h_flex().pt(2).gap(8).items_center()
          .child(div().flex_1().text_size(11).text_color(t.dim).child(st?.at ? L(`Cập nhật ${span(Date.now() - st.at)} trước`, `Updated ${span(Date.now() - st.at)} ago`) : ""))
          .child(h_flex().id("c-compact").h(26).px(10).items_center().rounded(7).border_1().border_color(t.border).bg(t.raised).text_size(12).text_color(ok ? t.foreground : t.dim)
            .when(ok, (el) => el.cursor_pointer().hover((x) => x.bg(t.hover)).on_click((_e, cx) => { this.setPop(null, cx); cx.spawn(async (cx) => this.say(cx, terminal, "/compact", L("Đã gửi /compact", "Sent /compact"))); }))
            .child(L("Compact phiên", "Compact session")))),
      s.fiveHour || s.sevenDay ? this.sep(t) : null,
      s.fiveHour || s.sevenDay ? this.header(t, L("Giới hạn gói Claude", "Claude plan limits")) : null,
      lim("u-5h", L("Giới hạn 5 giờ", "5-hour limit"), s.fiveHour),
      lim("u-7d", L("Tuần · mọi model", "Week · all models"), s.sevenDay),
    ]);
  }

  actionsMenu(t, terminal) {
    this.digits = null;
    const a = agentOf(terminal);
    const state = actionState(a ? { status: a.status, name: a.program?.name } : null);
    const all = actionsFor(withCustom(ACTIONS, this.customActions), a?.app); // /compact, /clear only where they exist
    const send = (x) => (cx) => { this.setPop(null, cx); cx.spawn(async (cx) => this.say(cx, terminal, x.text)); };
    const icons = { commit: "circle-check", pr: "git-compare", push: "chevron-right", pull: "chevron-down", branch: "git-branch", merge: "git-branch",
      test: "circle-check", build: "layers", fix: "square-pen", review: "search", deploy: "layers", summary: "file-text", explain: "file-text", docs: "file-text", compact: "minus", clear: "x" };
    // An action that asks first opens a small "Gửi / Huỷ" box in its place.
    const confirmBox = (x) => v_flex().m(4).p(10).gap(8).rounded(8).bg(t.raised).border_1().border_color(t.ansi3)
      .child(div().text_size(12).child(L(`Gửi “${x.text}” cho ${a?.program?.name ?? "agent"} của ${a?.space_name ?? "?"}? ${x.id === "merge" ? "Merge không hoàn tác được." : x.id === "clear" ? "Context của phiên sẽ bị xoá." : ""}`, `Send “${x.text}” to ${a?.program?.name ?? "agent"} in ${a?.space_name ?? "?"}? ${x.id === "merge" ? "A merge can't be undone." : x.id === "clear" ? "The session's context will be deleted." : ""}`)))
      .child(h_flex().gap(6)
        .child(h_flex().id("a-confirm").h(28).px(12).items_center().rounded(7).bg(t.solid).text_color(t.solid_foreground).cursor_pointer().hover((y) => y.opacity(0.85))
          .on_click((_e, cx) => send(x)(cx)).child(L("Gửi", "Send")))
        .child(h_flex().id("a-cancel").h(28).px(12).items_center().rounded(7).border_1().border_color(t.border).cursor_pointer().hover((y) => y.bg(t.hover))
          .on_click((_e, cx) => { this.confirming = null; cx.notify(); }).child(L("Huỷ", "Cancel"))));
    const kids = [];
    let group = null;
    for (const x of all) {
      if (x.group !== group) { group = x.group; kids.push(div().px(10).pt(8).pb(3).text_size(11).text_color(t.dim).child(group)); }
      kids.push(x.confirm && this.confirming === x.id ? confirmBox(x) : this.item(t, `a-${x.id}`, {
        icon: ICON(icons[x.id] ?? "chevron-right"), label: x.label, desc: x.confirm ? L("Hỏi lại trước khi gửi", "Asks again before sending") : L(`Gửi “${x.text}”`, `Send “${x.text}”`),
        disabled: !state.enabled, keep: true, act: x.confirm ? (cx) => { this.confirming = x.id; cx.notify(); } : send(x),
      }));
    }
    const groups = new Set(all.map((x) => x.group)).size;
    return this.card(t, 330, [
      this.header(t, L("Thao tác", "Actions"), where(a)),
      state.reason ? div().px(10).pb(4).text_size(11.5).text_color(t.ansi3).child(state.reason) : null,
      this.scrollBox("a-list", Math.min(420, groups * 26 + all.length * 46 + (this.confirming ? 70 : 0)), kids),
      this.sep(t),
      this.item(t, "a-edit", { icon: ICON("square-pen"), label: L("Sửa action của tôi…", "Edit my actions…"), desc: L("actions.json: thêm câu lệnh hay dùng của bạn", "actions.json: add your frequently used commands"), act: (cx) => cx.spawn(async (cx) => this.editActions(cx)) }),
    ]);
  }

  // actions.json, with two examples the first time, opened in VS Code.
  async editActions(cx) {
    const path = `${appHome()}\\actions.json`;
    const text = await readTextFile(path).catch(() => null);
    if (text == null) {
      const sample = [
        { label: "Deploy DEV", text: "Deploy bản hiện tại lên môi trường DEV rồi báo kết quả" },
        { label: "Viết test cho thay đổi", text: "Viết unit test cho các thay đổi chưa commit", group: "Của tôi" },
      ];
      try { await writeTextFile(path, JSON.stringify(sample, null, 2) + "\n"); } catch (e) { return this.flash(cx, "error", L(`Không tạo được actions.json: ${String(e?.message ?? e)}`, `Couldn't create actions.json: ${String(e?.message ?? e)}`)); }
    }
    exec(`${home()}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`, [path]).catch(() => {});
    this.flash(cx, "ok", L("Đã mở actions.json — lưu file là menu Actions cập nhật", "Opened actions.json — save the file and the Actions menu updates"));
  }

  // A list that scrolls inside a menu, in a box of definite height.
  scrollBox(id, h, kids) {
    return div().relative().w_full().h(Math.max(40, h)).flex_none()
      .child(v_flex().id(id).absolute().inset_0().overflow_y_scroll().gap(1).children(kids));
  }

  // ---------- the composer ----------

  render(cx) {
    setLang(shared("lang"));
    const t = theme();
    if (props()?.view) {
      return v_flex().id("cv").size_full().bg(t.background)
        .child(h_flex().h(34).px(12).items_center().border_b(1).border_color(t.border)
          .child(div().flex_1().truncate().text_size(12).text_color(t.muted).child(fileName(props().view)))
          .child(h_flex().id("cv-close").px(8).h(26).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => closeOverlay(props().overlay)).child(L("Đóng", "Close"))))
        .child(div().flex_1().min_h(0).p(10).flex().items_center().justify_center().child(image(props().view).size_full()));
    }
    // The Agents list's menu asks through shared "composer.do": insert an agent's answer, or get
    // ready for a sub-session task (the target is already set to that agent).
    const req = shared("composer.do");
    if (req && req.at !== this.doneReq) {
      this.doneReq = req.at;
      const who = agentOf(req.terminal);
      if (req.kind === "reply" && who) cx.spawn(async (cx) => { await this.insertReply(who, cx); cx.notify(); });
      else if (req.kind === "child") cx.timer.after(10, (cx) => { this.text.focus(); this.flash(cx, "ok", L(`Gõ task rồi nhấn Ctrl+Enter — phiên con dưới ${where(who) || req.terminal}`, `Type a task, then press Ctrl+Enter — sub-session under ${where(who) || req.terminal}`)); });
    }
    // New attachments fade in.
    if (this.items.some((it) => !it.seen)) cx.timer.after(30, (cx) => { this.items.forEach((it) => (it.seen = true)); cx.notify(); });

    const list = currentTargets();
    const terminal = list[0];
    const a = agentOf(terminal);
    const picked = pickedTargets().filter((x) => agentOf(x)).length > 0;
    const s = terminal && this.status?.terminal === terminal ? this.status.sum : null;
    const isClaude = a?.app === "claude-code";
    const all = agents();
    const blocked = all.filter((x) => x.status === "blocked").length;
    const need = blocked + all.filter((x) => x.status === "done").length;
    const space = spaces().find((x) => x.active);
    const hasText = this.lines > 1 || this.text.value().trim().length > 0 || this.items.length > 0;
    const mode = MODES.find((m) => m.id === this.mode[terminal]);

    const tile = (it, i) => {
      const x = h_flex().id(`ci-x-${i}`).size(18).items_center().justify_center().rounded(9).bg(t.popover).border_1().border_color(t.border).cursor_pointer()
        .hover((y) => y.bg(t.hover)).on_click((_e, cx) => { this.items.splice(i, 1); this.show(); cx.stop_propagation(); cx.notify(); })
        .child(svg(ICON("x")).size(10).text_color(t.muted));
      return it.preview
        ? div().id(`ci-${i}`).relative().w(84).h(60).flex_none().rounded(10).overflow_hidden().border_1().border_color(t.border).cursor_pointer()
            .opacity(it.seen ? 1 : 0).transition("opacity", { duration: 260, easing: "ease-out" })
            .on_click(() => openOverlay({ mod: "composer", kind: "window", key: "composer-view", width: 900, height: 640, props: { view: it.preview } }))
            .child(image(it.preview).size_full()).child(div().absolute().top(3).right(3).child(x))
        : h_flex().id(`ci-${i}`).h(32).max_w(240).flex_none().pl(10).pr(4).gap(8).items_center().rounded(10).bg(t.raised).border_1().border_color(t.border)
            .opacity(it.seen ? 1 : 0).transition("opacity", { duration: 260, easing: "ease-out" })
            .child(svg(ICON(it.kind === "folder" ? "folder" : "file-text")).size(13).text_color(t.muted))
            .child(div().truncate().text_size(12).child(fileName(it.path))).child(x);
    };
    const round = (id, kids, extra) => h_flex().id(id).size(30).flex_none().items_center().justify_center().rounded(15).cursor_pointer().when(!!extra, extra).active((x) => x.opacity(0.7)).children(kids);
    const caret = () => svg(ICON("chevron-down")).size(11).text_color(t.dim);

    // Inside the box: + · target … send.
    const plus = this.popover("plus", round("c-plus", [svg(ICON("plus")).size(16).text_color(this.pop === "plus" ? t.foreground : t.muted)],
      (el) => el.border_1().border_color(t.border).when(this.pop === "plus", (x) => x.bg(t.hover)).hover((x) => x.bg(t.hover)).tooltip(L("Đính kèm", "Attach"))), () => this.plusMenu(t));
    // Short: the agent's own name (Claude names its session), or its tab; space and "tự động" live in the tooltip.
    const targetLabel = list.length > 1 ? L(`${list.length} agent`, `${list.length} agents`) : a ? shortName(a) : L("chưa có agent", "no agent");
    const targetTip = list.length > 1 ? L(`Gửi tới ${list.length} agent: ${list.map((x) => where(agentOf(x)) || x).join(" · ")}`, `Send to ${list.length} agents: ${list.map((x) => where(agentOf(x)) || x).join(" · ")}`)
      : a ? L(`Gửi tới ${where(a)}${picked ? "" : " — tự động: agent của tab đang xem"}`, `Send to ${where(a)}${picked ? "" : " — auto: the shown tab's agent"}`) : L("Chọn agent nhận tin", "Pick the agent to receive the message");
    // [agent icon + state dot] Space › name (role in a department, else its own name).
    const target = this.popover("target", this.chip(t, "c-target", [
      list.length === 1 && a
        ? div().relative().flex_none().child(programIcon(a.program, 14, t.muted))
            .child(div().absolute().right(-2).bottom(-2).size(6).rounded(3).border_1().border_color(t.background).bg(t[a.status] ?? t.dim))
        : div().size(7).rounded(4).bg(a ? t[a.status] ?? t.dim : t.border),
      list.length === 1 && a ? div().max_w(110).truncate().text_color(t.dim).child(`${a.space_name} ›`) : null,
      div().max_w(150).truncate().child(list.length === 1 && a ? teamRole(a) ?? targetLabel : targetLabel),
      caret(),
    ].filter(Boolean), targetTip, this.pop === "target"), () => this.targetMenu(t));
    const sendBtn = round("c-send", [svg(OWN("arrow-up")).size(15).text_color(hasText ? t.solid_foreground : t.dim)],
      (el) => el.bg(hasText ? t.solid : t.raised).when(hasText, (x) => x.hover((y) => y.opacity(0.85))).tooltip(list.length > 1 ? L(`Gửi tới ${list.length} agent (Enter)`, `Send to ${list.length} agents (Enter)`) : L("Gửi (Enter)", "Send (Enter)"))
        .on_click((_e, cx) => { this.send(this.text.value(), cx); cx.notify(); }));

    // One line: + · target · text · send (the text grows upward, the buttons stay at the bottom).
    // A press anywhere in the box that no button takes puts the caret in the text.
    // No click handler on the whole box: it grabbed the keyboard back from the + / → menus as they
    // opened (the "jumping" focus). The text field itself fills the middle (30 px tall), so a click
    // anywhere there lands in it; the buttons keep their clicks to themselves.
    const box = v_flex().id("cbox").flex_1().min_h(0).rounded(14).bg(t.background).border_1().border_color(this.typing ? t.input : t.border)
      .px(8).py(8).gap(8)
      .on_drop((e, cx) => cx.spawn(async (cx) => { await this.addPaths(e.paths ?? [], cx); cx.notify(); }))
      .when(this.items.length > 0, (el) => el.child(h_flex().id("ci-list").px(4).gap(8).items_center().overflow_x_scroll().children(this.items.map(tile))))
      .child(h_flex().flex_1().min_h(0).gap(6).items_end()
        .child(plus).child(h_flex().h(30).flex_none().items_center().child(target))
        .child(div().id("c-text").flex_1().min_w(0).min_h(30).flex().items_center().cursor_text()
          .child(Textarea.new(this.text).w_full().min_h(30).text_size(13.5).text_color(t.foreground)))
        .child(sendBtn));

    // Under the box (was the status bar): where · agents … Actions · model · mode · context.
    const dim = (icon, text) => h_flex().gap(6).items_center().text_size(11.5).text_color(t.dim).child(svg(ICON(icon)).size(12)).child(div().max_w(220).truncate().child(text));
    const agentsChip = this.popover("agents", this.chip(t, "c-agents", [
      div().size(6).rounded(3).bg(blocked ? t.blocked : need ? t.done : t.border),
      div().child(need ? L(`${need} cần bạn`, `${need} need you`) : `${all.length} agent${all.length === 1 ? "" : "s"}`),
    ], L("Các agent — bấm để chuyển tới", "Agents — click to jump to one"), this.pop === "agents", (el) => el.text_size(11.5).when(!!need, (x) => x.text_color(blocked ? t.blocked : t.done))), () => this.agentsMenu(t));
    // The space's department, when it has one: its members alive, a click opens it (Ctrl+Shift+D).
    const dept = deptOf(shared("teams"), { address: a?.address, tab: focused()?.tab, space: space?.id });
    const deptAlive = dept ? [dept.lead, ...dept.members].filter((m) => all.some((x) => x.address === m?.address)) : [];
    const teamChip = deptAlive.length ? this.chip(t, "c-team", [svg(ICON("layers")).size(12), div().child(L(`Phòng ban · ${deptAlive.length}`, `Team · ${deptAlive.length}`))],
      L(`Phòng ban "${dept.name}": mở Bảng việc (Ctrl+Shift+D: mọi phòng ban)`, `Team "${dept.name}": open the Board (Ctrl+Shift+D: all teams)`), false, (el) => el.text_size(11.5).on_click(() => {
        // Straight to this department's own board, opening it the first time.
        const s = spaces().find((x) => x.id === dept.space) ?? spaces().find((x) => x.active);
        const tab = s && boardTab(dept, s.tabs ?? []);
        if (tab) run("tab.select", { id: tab.id });
        else if (s) run("tab.new", { space: s.id, name: `Bảng việc · ${dept.name}`.slice(0, 40), mod: "team", props: { view: "board", space: s.id, team: dept.key } });
      })) : null;
    const right = [];
    if (a) right.push(this.popover("actions", this.chip(t, "c-actions", [svg(ICON("layers")).size(12), div().child(L("Thao tác", "Actions"))], "Commit, PR, test, review…", this.pop === "actions"), () => this.actionsMenu(t, terminal), "bottom_right"));
    const kind = agentKind(a);
    if (kind === "codex" || kind === "agy") {
      const f = this.foot[terminal];
      right.push(this.popover("model", this.chip(t, "c-model", [svg(OWN("sparkle")).size(12), div().child(f?.model ?? a.program?.name ?? L("Mô hình", "Model")), div().text_color(t.dim).child(f?.effort ? EFFORT_SHORT[f.effort] ?? f.effort : ""), caret()],
        L(`Đổi model và effort của ${a.program?.name ?? "agent"}`, `Change ${a.program?.name ?? "the agent"}'s model and effort`), this.pop === "model"), () => this.modelMenu(t, terminal, null), "bottom_right"));
      const q = this.quota[terminal];
      if (kind === "codex") {
        const perm = CODEX_PERMS.find((p) => samePerm(p, q?.codex?.permissions));
        right.push(this.popover("perm", this.chip(t, "c-perm", [svg(OWN("shield")).size(12), div().child(perm?.label ?? L("Quyền", "Permissions")), caret()], L("Đổi quyền của Codex (/permissions)", "Change Codex's permissions (/permissions)"), this.pop === "perm"), () => this.permMenu(t, terminal), "bottom_right"));
      } else {
        const mode = AGY_MODES.find((m) => m.id === this.foot[terminal]?.mode);
        right.push(this.popover("amode", this.chip(t, "c-amode", [svg(OWN("shield")).size(12), div().child(mode?.label ?? L("Chế độ", "Mode")), caret()], L("Đổi chế độ của Antigravity (Shift+Tab)", "Change Antigravity's mode (Shift+Tab)"), this.pop === "amode"), () => this.agyModeMenu(t, terminal), "bottom_right"));
      }
      const low = quotaLow(q);
      right.push(this.popover("quota", this.chip(t, "c-quota", [this.ring(t, low == null ? null : 100 - low), div().child(low == null ? L("Hạn mức", "Quota") : `${Math.round(low)}%`)], L("Hạn mức còn lại của gói", "Plan quota left"), this.pop === "quota"), () => this.quotaMenu(t, terminal, kind), "bottom_right"));
    }
    if (a && !isClaude && kind !== "codex" && kind !== "agy") right.push(this.chip(t, "c-agent", [div().child(a.program?.name ?? a.app ?? "agent")], L(`${a.program?.name ?? "Agent"} · model và context chỉ đọc được của Claude Code`, `${a.program?.name ?? "Agent"} · model and context can only be read from Claude Code`), false, (el) => el.cursor_default()));
    if (isClaude) {
      right.push(this.popover("model", this.chip(t, "c-model", [svg(OWN("sparkle")).size(12), div().child(s?.model ?? L("Mô hình", "Model")), div().text_color(t.dim).child(s?.effort === "xhigh" ? "Extra" : effortLabel(s?.effort)), caret()], L("Đổi model và effort", "Change model and effort"), this.pop === "model"), () => this.modelMenu(t, terminal, s), "bottom_right"));
      right.push(this.popover("mode", this.chip(t, "c-mode", [svg(OWN("shield")).size(12), div().child(mode?.label ?? L("Chế độ", "Mode")), caret()], L("Đổi chế độ quyền (Shift+Tab của Claude)", "Change permission mode (Claude's Shift+Tab)"), this.pop === "mode"), () => this.modeMenu(t, terminal), "bottom_right"));
      right.push(this.popover("ctx", this.chip(t, "c-ctx", [this.ring(t, s?.ctxPct), div().child(s?.ctxPct == null ? "ctx" : `${Math.round(s.ctxPct)}%`)].concat(s?.fiveHour ? [div().text_color(t.dim).child(`· 5h ${Math.round(s.fiveHour.pct)}%`)] : []), L("Context và giới hạn gói", "Context and plan limits"), this.pop === "ctx"), () => this.ctxMenu(t, terminal, s), "bottom_right"));
    }
    right.push(this.chip(t, "c-rail", [svg(ICON("panel-right")).size(13)], L("Bật/tắt rail (Ctrl+Shift+R)", "Toggle the rail (Ctrl+Shift+R)"), false, (el) => el.px(6).on_click(() => run("layout.toggle", { id: "rail" }))));

    // The latest feedback (sending, sent, why not), in place of a toast over the box.
    const n = this.note;
    const nTone = n ? ({ busy: t.muted, ok: t.ansi2, warn: t.ansi3, error: t.ansi1 })[n.kind] ?? t.muted : null;
    const note = n && h_flex().id(`note-${n.id}`).h(24).max_w(560).pl(9).pr(4).gap(7).items_center().rounded(12)
      .bg(nTone + "1c").border_1().border_color(nTone + "55").text_size(11.5).text_color(t.foreground)
      .opacity(n.shown ? 1 : 0).transition("opacity", { duration: 180, easing: "ease-out" })
      .child(n.kind === "busy" ? svg(ICON("spinner")).size(12).text_color(nTone).spin(800)
        : svg(ICON(n.kind === "ok" ? "check" : n.kind === "error" ? "x" : "circle-check")).size(12).text_color(nTone))
      .child(div().flex_shrink(1).min_w(0).truncate().child(n.text))
      .when(!!n.action, (el) => el.child(div().id("note-act").px(7).h(18).flex().items_center().rounded(9).bg(nTone + "33").text_color(nTone).font_semibold().cursor_pointer()
        .hover((x) => x.opacity(0.8)).on_click((_e, cx) => { n.action.run(); this.note = null; cx.notify(); }).child(n.action.label)))
      .child(h_flex().id("note-x").size(18).flex_none().items_center().justify_center().rounded(9).cursor_pointer().hover((x) => x.bg(t.hover))
        .on_click((_e, cx) => { this.note = null; cx.notify(); }).child(svg(ICON("x")).size(10).text_color(t.dim)));

    return v_flex().id("composer").size_full().px(12).pt(6).pb(6).gap(6).bg(t.canvas)
      .child(box)
      .child(h_flex().h(26).flex_none().gap(10).items_center().pl(4)
        .when(!n, (el) => el.child(dim("monitor", space?.machine ?? L("Máy này", "This computer"))))
        .when(!!space?.branch && !n, (el) => el.child(dim("git-branch", space.branch)))
        .child(agentsChip)
        .when(!!teamChip, (el) => el.child(teamChip))
        .when(!!n, (el) => el.child(note))
        .child(div().flex_1())
        .child(h_flex().gap(2).items_center().children(right)));
  }
}
