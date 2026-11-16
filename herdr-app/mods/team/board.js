// The department's board: a tab of its space (pane mod "team" with props {view: "board", space}).
// Members on top, the task cards (team.home\tasks\*.md, kept by the coordinator) in five columns.
// The board never moves a card itself: "Việc mới", "Duyệt" and "Sửa thêm" message the coordinator.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { spaces, panes, agents, terminals, run, hc, exec, theme, settings, shared, setShared, props, openOverlay, appHome, home, readTextFile, writeTextFile, watchFolder } from "herdr";
import * as fsp from "fs/promises";
import { AGENT_KINDS, ROLES, COLUMNS, MODELS, parseCard, nextCardId, newCardText, ago, callsOn, teamSlug, leadBrief, memberBrief, laneBrief, paceBrief, recentActivity, pendingQuestion, PACES, SIZES, STEPS, pacePath, stepIndex, parseHandoff, costSummary, relayText, LANE_CHECKS, handoffName, handoffNews, stopNews, reportedKeys, reportQuiet, busyScreen, housekeepingScreen, initTold, typeKeys, atPrompt, restartCommand, shellPrompt, memberArgv, withResume, sessionKind, typedArgv, boardTabName, ownsPlainBoard } from "./model.js";
import { I, CHROME, PACE_ICON, roleTone, logo, icon, button, iconButton, tile, openInCode } from "./ui.js";
import { L } from "./i18n.js";

const COLOR = { cho: "dim", "dang-lam": "ansi4", "kiem-tra": "ansi5", "cho-duyet": "ansi3", xong: "ansi2" };
// A space's folder: where its first terminal is now, else where it was made.
export function place(s) {
  const tabs = new Set((s?.tabs ?? []).map((t) => t.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s?.folder;
}
const sameDir = (a, b) => !!a && !!b && a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();
// A department's space: the one it was made in, else (made again) the one in its folder.
export const spaceOf = (team) => spaces().find((x) => x.id === team?.space) ?? spaces().find((x) => sameDir(place(x), team?.folder));

// The board's department: the one its tab was opened for (props.team, v.teamKey); else, for a board
// opened before a space could hold several, the one kept under the space's id, else (the space was made
// again) the one working in its folder. One made before teams had a folder gets the one the dialog would
// give it now. `key` is where it is kept in shared "teams" (updateTeam writes back there).
const teamOf = (v) => {
  const teams = shared("teams") ?? {};
  const s = spaces().find((x) => x.id === v.space?.id);
  const key = v.teamKey && teams[v.teamKey] ? v.teamKey
    : teams[v.space?.id] ? v.space.id : Object.keys(teams).find((k) => sameDir(teams[k]?.folder, place(s)));
  const team = key ? teams[key] : null;
  return team ? { ...team, key, home: team.home || `${appHome()}\\teams\\${teamSlug(team.name)}` } : null;
};
const updateTeam = (v, change) => {
  const teams = shared("teams") ?? {};
  const team = teamOf(v);
  if (team && teams[team.key]) setShared("teams", { ...teams, [team.key]: { ...teams[team.key], ...change(teams[team.key]) } });
};

// Briefs go out from the board (it stays alive in its tab; the dialog may be closed): each member
// once it is idle. A team made by this version lists the briefed in `briefed`; an older one gets a
// brief only for a member the board saw before it was ready (starting, or at a trust or hook prompt).
async function briefMember(cx, team, m) {
  await hc(["label", m.address, `herdr.role=${m.role}`]).catch(() => {});
  return (await sendText(cx, m.address, m.address === team.lead.address ? leadBrief(team) : memberBrief(team, m))).code === 0;
}
async function briefPending(v, cx) {
  const team = teamOf(v);
  if (!team) return;
  const tracked = Array.isArray(team.briefed);
  const running = new Set(terminals().map((x) => x.address));
  for (const m of [team.lead, ...team.members]) {
    const a = agents().find((x) => x.address === m?.address);
    if (!m?.address || v.sending.has(m.address)) continue;
    if (!tracked && running.has(m.address) && !a) v.unready.add(m.address);
    if (tracked ? team.briefed.includes(m.address) : !v.unready.has(m.address)) continue;
    if (a?.status !== "idle" && a?.status !== "done") continue;
    v.sending.add(m.address);
    if (tracked) updateTeam(v, (x) => ({ briefed: [...new Set([...(x.briefed ?? []), m.address])] })); // claimed before sending
    v.briefAt[m.address] = Date.now();
    const ok = await briefMember(cx, team, m);
    if (ok) v.unready.delete(m.address);
    else if (tracked) updateTeam(v, (x) => ({ briefed: (x.briefed ?? []).filter((y) => y !== m.address) }));
    v.sending.delete(m.address);
    cx.notify();
  }
  // Lane agents (a DEV or a researcher the coordinator opened for one card) get their brief too.
  for (const m of laneAgents(team)) {
    const fresh = teamOf(v);
    if (v.sending.has(m.address) || !fresh) continue;
    if (!Array.isArray(fresh.briefed)) { // an older team: its members were briefed already, start the list
      updateTeam(v, () => ({ briefed: [fresh.lead, ...fresh.members].map((x) => x?.address).filter(Boolean) }));
      continue;
    }
    if (fresh.briefed.includes(m.address)) continue;
    const a = agents().find((x) => x.address === m.address);
    if (a?.status !== "idle" && a?.status !== "done") continue;
    v.sending.add(m.address);
    updateTeam(v, (x) => ({ briefed: [...new Set([...(x.briefed ?? []), m.address])] }));
    v.briefAt[m.address] = Date.now();
    const ok = (await sendText(cx, m.address, memberBrief(fresh, m, { id: m.lane, cwd: m.cwd }))).code === 0;
    if (!ok) updateTeam(v, (x) => ({ briefed: (x.briefed ?? []).filter((y) => y !== m.address) }));
    v.sending.delete(m.address);
    cx.notify();
  }
}
// The coordinator ends its turn after assigning (leadBrief), so the board wakes it (besides its own
// background hc wait): handoff files that are new or grew, and teammates whose turn count passed the
// last one told while they sit idle. Worked out from the files and `hc ls` every time, against what the
// team record says was told (team.told), so a board reload or a closed tab loses nothing. Sent as one
// message once the coordinator is free; `told` moves only after a send that worked.
const TOLD_WINDOW = 30 * 60000; // a team's first relay still sends reports from the last 30 minutes
async function relay(v, cx) {
  const team = teamOf(v);
  if (!team?.home || v.relaying || v.telling) return;
  const now = Date.now();
  const hdir = `${team.home}\\handoff`;
  const files = [];
  for (const n of (await fsp.readdir(hdir).catch(() => [])).filter((x) => /\.md$/i.test(x))) {
    const who = handoffName(n);
    const text = who ? await readTextFile(`${hdir}\\${n}`).catch(() => null) : null;
    if (text == null) continue;
    const entries = parseHandoff(text, who);
    files.push({ file: `${hdir}\\${n}`, name: n, size: text.length, ...who, result: entries[entries.length - 1]?.result ?? null });
  }
  const ls = await hc(["ls", "--json"]).catch(() => null);
  let terms = [];
  try { terms = JSON.parse(ls?.stdout || "{}").terminals ?? []; } catch {}
  const byAddr = Object.fromEntries(terms.map((x) => [x.address, x]));
  const crew = [...team.members, ...laneAgents(team)].filter((m) => m?.address).map((m) => ({
    address: m.address, role: m.role, lane: m.lane ?? null, briefAt: v.briefAt[m.address],
    status: byAddr[m.address]?.status ?? agents().find((a) => a.address === m.address)?.status, turn: byAddr[m.address]?.turn }));
  // When each idle began (same turn = same idle); stopNews waits for it to settle.
  v.idleSince ??= {};
  for (const a of crew) {
    if (a.status !== "idle" && a.status !== "done") { delete v.idleSince[a.address]; continue; }
    if (v.idleSince[a.address]?.turn !== a.turn) v.idleSince[a.address] = { turn: a.turn, at: now };
    a.idleAt = v.idleSince[a.address].at;
  }
  let told = team.told;
  if (!told?.files || !told?.turns) {
    const times = await fileTimes(hdir);
    told = initTold(files.map((f) => ({ ...f, mtime: times[f.name] })), crew, now, TOLD_WINDOW);
    updateTeam(v, () => ({ told }));
  }
  // Agents not seen before, an idle one just briefed (its "Sẵn sàng"), and an idle one whose report went
  // out moments ago (the end of that same job) count as told at their turn now — absorbed, not deferred.
  const turns = { ...told.turns };
  const recent = team.told?.reportedAt ?? {};
  let fresh = false;
  for (const a of crew) if (typeof a.turn === "number" && (!(a.address in turns)
      || ((a.status === "idle" || a.status === "done") && a.turn > turns[a.address]
        && (now - (a.briefAt ?? 0) < 120000 || reportQuiet(a, recent, now))))) { turns[a.address] = a.turn; fresh = true; }
  if (fresh) updateTeam(v, (x) => ({ told: { ...x.told, files: x.told?.files ?? told.files, turns: { ...(x.told?.turns ?? {}), ...turns } } }));
  const reports = handoffNews(files, told.files);
  const stops = [];
  // herdr's status can say idle while a long command runs: only a screen without signs of work is a stop.
  // A turn spent compacting while idle is no stop either: count it as told so it isn't asked again.
  const chores = {};
  for (const s of stopNews(crew, turns, now, reports, recent)) {
    const scr = await hc(["read", s.address, "--lines", "20"]).catch(() => null);
    if (housekeepingScreen(scr?.stdout)) chores[s.address] = s.turn;
    else if (!busyScreen(scr?.stdout)) stops.push(s);
  }
  if (Object.keys(chores).length) updateTeam(v, (x) => ({ told: { ...x.told, turns: { ...(x.told?.turns ?? {}), ...chores } } }));
  const lead = agents().find((a) => a.address === team.lead?.address);
  if (!reports.length && !stops.length || (lead?.status !== "idle" && lead?.status !== "done")) return;
  v.relaying = true;
  const r = await sendText(cx, lead.address, relayText([...reports, ...stops]));
  if (r.code === 0) {
    // What was sent is told; a teammate whose report went out is told at its turn now too.
    const reported = crew.filter((a) => typeof a.turn === "number" && reports.some((x) => x.role === a.role && (!a.lane || x.id === a.lane)));
    updateTeam(v, (x) => ({ told: {
      files: { ...(x.told?.files ?? told.files), ...Object.fromEntries(reports.map((i) => [i.file, i.size])) },
      turns: { ...(x.told?.turns ?? turns), ...Object.fromEntries([...stops.map((i) => [i.address, i.turn]), ...reported.map((a) => [a.address, a.turn])]) },
      reportedAt: { ...(x.told?.reportedAt ?? {}), ...Object.fromEntries(reports.flatMap((i) => reportedKeys(i).map((k) => [k, now]))) } } }));
  }
  v.relaying = false;
}
// Members whose program ended (a reboot: herdr-core brings the terminal back as a bare shell, never
// the agent): live terminal, no agent reporting, the shell itself in front.
async function scanBare(v, cx) {
  const team = teamOf(v);
  if (!team) return;
  const running = new Set(terminals().filter((x) => x.state === "live").map((x) => x.address));
  const live = new Set(agents().map((a) => a.address));
  const bare = new Set();
  for (const m of [team.lead, ...team.members].filter((x) => x?.address && running.has(x.address) && !live.has(x.address))) {
    if (await atShellPrompt(m.address)) bare.add(m.address);
  }
  if (bare.size !== v.bare.size || [...bare].some((a) => !v.bare.has(a))) { v.bare = bare; cx.notify(); }
  // Each member's start command in the team record: the composer, which cannot import this mod,
  // resumes a lost member after a reboot with these flags (sandbox, auto mode, model, effort).
  if ([team.lead, ...team.members].some((m) => m?.address && !Array.isArray(m.argv))) {
    const withArgv = (m) => (m && !Array.isArray(m.argv) ? { ...m, argv: memberArgv(m) } : m);
    updateTeam(v, (x) => ({ lead: withArgv(x.lead), members: (x.members ?? []).map(withArgv) }));
  }
}
// The session a member's agent saved before it stopped (Claude's status line, the agent-session hook
// of Codex and Antigravity), when it is of the member's own kind; null otherwise.
async function savedSession(m) {
  const kind = sessionKind(m.agent), file = String(m.address).replace(/[^\w.-]/g, "_");
  const read = async (dir) => { try { return JSON.parse(await readTextFile(`${home()}\\AppData\\Local\\${dir}\\${file}.json`)); } catch { return null; } };
  const s = kind === "claude" ? (await read("herdr-claude"))?.input?.session_id : ((a) => (a?.kind === kind ? a.session : null))(await read("herdr-agents"));
  return typeof s === "string" && /^[A-Za-z0-9-]+$/.test(s) ? s : null;
}
// A terminal whose shell sits at its own prompt: the shell in front (hc get) and, since herdr-core
// reports the shell even while an agent runs in it, a shell prompt on the screen's last line.
async function atShellPrompt(address) {
  const g = await hc(["get", address, "--json"]).then((r) => JSON.parse(r.stdout || "{}")).catch(() => null);
  if (!atPrompt(g)) return false;
  const s = await hc(["read", address]).catch(() => null);
  return s?.code === 0 && shellPrompt(s.stdout);
}
// Starts a stopped member again (typed key by key: a paste's bracket codes reached restored shells as
// text): back into the session it saved when there is one (it keeps its brief and its work), else
// fresh with its role's command, and then briefPending sends its brief once it is idle.
async function restartMember(v, cx, m) {
  const label = ROLES[m.role]?.label ?? m.label ?? m.role;
  if (!(await atShellPrompt(m.address))) return flash(v, cx, L(`${label}: terminal không ở dấu nhắc shell, không gõ gì`, `${label}: the terminal isn't at a shell prompt; nothing typed`), true);
  const session = await savedSession(m);
  const argv = session ? withResume(Array.isArray(m.argv) ? m.argv : memberArgv(m), sessionKind(m.agent), session) : memberArgv(m);
  const cmd = argv.join(" ");
  const keys = typeKeys(cmd) ?? (session ? typeKeys(typedArgv(argv).join(" ")) : null);
  await hc(["keys", m.address, "--", "ctrl+c"]).catch(() => {}); // clears what a broken paste left
  await cx.sleep(500);
  const r = await (keys ? hc(["keys", m.address, "--", ...keys.slice(1)]) : hc(["send", "--force", m.address, cmd])).catch(() => ({ code: 1 }));
  if (r?.code !== 0) return flash(v, cx, L(`Không khởi động lại được ${label}`, `Couldn't restart ${label}`), true);
  v.bare.delete(m.address);
  if (session) return flash(v, cx, L(`Đã mở lại phiên cũ của ${label}`, `Resumed ${label}'s previous session`));
  // A fresh agent needs its brief again (an older team without the list briefs whoever it saw starting).
  updateTeam(v, (x) => (Array.isArray(x.briefed) ? { briefed: x.briefed.filter((a) => a !== m.address) } : {}));
  flash(v, cx, L(`Đã khởi động lại ${label}: lời dặn sẽ gửi khi nó sẵn sàng`, `Restarted ${label}: its brief goes out once it is ready`));
}
// The handoff files' modified times (ms), once per team (its first relay); {} when node can't tell.
async function fileTimes(dir) {
  const r = await exec("node", ["-e", "const fs=require('fs'),d=process.argv[1];let o={};try{for(const n of fs.readdirSync(d))o[n]=fs.statSync(d+'/'+n).mtimeMs}catch{};console.log(JSON.stringify(o))", dir]).catch(() => null);
  try { return JSON.parse(r?.stdout || "{}"); } catch { return {}; }
}

// The team's lane agents: live terminals the coordinator started with herdr.team = this team and
// herdr.lane = a card id (laneBrief), with no pane of their own.
function laneAgents(team) {
  return terminals().filter((x) => x.state === "live" && x.labels?.["herdr.team"] === team.key && x.labels?.["herdr.lane"])
    .map((x) => ({ address: x.address, name: x.name, lane: x.labels["herdr.lane"], role: x.labels["herdr.role"] || "dev", cwd: x.cwd,
      agent: /codex/i.test(x.argv?.[0] ?? "") ? "codex" : /\bagy\b/i.test(x.argv?.[0] ?? "") ? "agy" : "claude" }));
}
const pad = (n) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const newTeamDialog = () => openOverlay({ mod: "team", kind: "dialog", width: 560, height: 720, props: { fresh: true } });

// Shows a department's own board tab ("Bảng việc · <name>"; a department kept under its space's id
// also takes that space's plain "Bảng việc"), opening it the first time for that department alone.
export function openBoard(team) {
  const s = spaceOf(team);
  if (!s) return;
  const tab = s.tabs.find((x) => x.name === boardTabName(team)) ?? (ownsPlainBoard(team) ? s.tabs.find((x) => x.name === "Bảng việc") : null);
  run("space.select", { id: s.id });
  if (tab) run("tab.select", { id: tab.id });
  else run("tab.new", { space: s.id, name: boardTabName(team), mod: "team", props: { view: "board", space: s.id, team: team.key } });
}

export function boardInit(v, cx) {
  v.cards = [];
  v.sel = props()?.sel ?? null; // the open card's id (props.sel opens one at start)
  v.sheet = v.sel; // the card the sheet shows (kept while it slides away)
  v.doneOpen = false; // the Xong column unfolded
  try { v.inspector = props()?.inspector ?? !!localStorage.getItem("team.inspector"); } catch { v.inspector = !!props()?.inspector; } // the activity panel
  v.ask = null; // {kind: "new" | "fix", id}: the input bar
  v.menu = false;
  v.note = null; // {text, err}: a short line under the title
  v.sent = {}; // card id → {kind: "duyet" | "sua", from: its status then, at}
  v.input = InputState.new({ placeholder: "" });
  v.sending = new Set();
  v.unready = new Set();
  v.asks = {}; // address → the question a waiting member asks (read off its screen while it waits)
  cx.timer.every(2000, (cx) => cx.spawn(async (cx) => {
    const team = teamOf(v);
    if (!team) return;
    let changed = false;
    for (const m of [team.lead, ...team.members].filter(Boolean)) {
      if (agents().find((x) => x.address === m.address)?.status === "blocked") {
        const r = await hc(["read", m.address, "--lines", "40"]).catch(() => null);
        const q = (r?.code === 0 && pendingQuestion(r.stdout)) || "";
        if (v.asks[m.address] !== q) { v.asks[m.address] = q; changed = true; }
      } else if (m.address in v.asks) { delete v.asks[m.address]; changed = true; }
    }
    if (changed) cx.notify();
  }));
  cx.timer.every(1500, (cx) => cx.spawn(async (cx) => briefPending(v, cx)));
  Object.assign(v, { briefAt: {}, relaying: false, telling: false, bare: new Set() });
  cx.timer.every(5000, (cx) => cx.spawn(async (cx) => scanBare(v, cx)));
  cx.timer.every(5000, (cx) => cx.spawn(async (cx) => relay(v, cx)));
  v.costs = {};
  cx.spawn(async (cx) => readCosts(v, cx));
  cx.timer.every(15000, (cx) => cx.spawn(async (cx) => readCosts(v, cx)));
  cx.spawn(async (cx) => load(v, cx));
  cx.timer.every(10000, (cx) => cx.spawn(async (cx) => load(v, cx)));
  cx.spawn(async (cx) => {
    for (;;) {
      const team = teamOf(v);
      try { if (!team?.home) throw 0; await watchFolder(team.home); } catch { await cx.sleep(5000); } // tasks, handoff, research
      await load(v, cx);
    }
  });
}

// What the team's open Claude sessions have cost so far: each one's statusline writes
// %LOCALAPPDATA%\herdr-claude\<address>.json. Codex and Antigravity report none.
// ponytail: a closed lane's cost drops out; keep a running total in the team record if that matters.
async function readCosts(v, cx) {
  const team = teamOf(v);
  if (!team) return;
  const costs = {};
  for (const m of [team.lead, ...team.members, ...laneAgents(team)].filter((x) => x?.address)) {
    const text = await readTextFile(`${home()}\\AppData\\Local\\herdr-claude\\${m.address}.json`).catch(() => null);
    try { const c = JSON.parse(text)?.input?.cost?.total_cost_usd; if (typeof c === "number") costs[m.address] = { role: m.role, cost: c }; } catch {}
  }
  v.costs = costs;
  cx.notify();
}

async function load(v, cx) {
  const team = teamOf(v);
  const dir = team?.home ? `${team.home}\\tasks` : null;
  const names = dir ? (await fsp.readdir(dir).catch(() => [])).filter((n) => /\.md$/i.test(n)) : [];
  const cards = [];
  for (const n of names) {
    const text = await readTextFile(`${dir}\\${n}`).catch(() => null);
    if (text == null) continue;
    const c = parseCard(text, n);
    const last = c.log.at(-1);
    cards.push({ ...c, file: `${dir}\\${n}`, when: last?.day && last?.time ? Date.parse(`${last.day}T${last.time.padStart(5, "0")}`) : 0 });
  }
  // Handoff reports (team home\handoff\<mã>-<vai>.md): each card's, newest first.
  const hdir = team?.home ? `${team.home}\\handoff` : null;
  const reports = [];
  for (const n of hdir ? (await fsp.readdir(hdir).catch(() => [])).filter((x) => /\.md$/i.test(x)) : []) {
    const text = await readTextFile(`${hdir}\\${n}`).catch(() => null);
    // The card and role come from the file name too, so free-form reports still count.
    if (text != null) reports.push(...parseHandoff(text, handoffName(n)).map((r) => ({ ...r, file: `${hdir}\\${n}` })));
  }
  for (const c of cards) c.reports = reports.filter((r) => r.id === c.id).sort((a, b) => b.at.localeCompare(a.at));
  // The scouts' context files (team home\context\<id>.md).
  if (team?.home) for (const c of cards) c.context = (await readTextFile(`${team.home}\\context\\${c.id}.md`).catch(() => null))?.trim() || null;
  const num = (c) => Number(/\d+/.exec(c.id)?.[0] ?? 0);
  v.cards = cards.sort((a, b) => b.when - a.when || num(b) - num(a));
  for (const [id, s] of Object.entries(v.sent)) {
    const c = cards.find((x) => x.id === id);
    if (!c || c.status !== s.from || Date.now() - s.at > 600000) delete v.sent[id];
  }
  cx.notify();
}

// hc send, then Enter once more if the agent hasn't started: Codex on Windows takes an Enter that
// follows a paste as a new line. An extra Enter on an empty input does nothing.
export async function sendText(cx, address, text) {
  const r = await hc(["send", address, text]).catch((e) => ({ code: 1, stderr: String(e) }));
  if (r.code !== 0) return r;
  await cx.sleep(1500);
  if (agents().find((a) => a.address === address)?.status !== "working") await hc(["keys", address, "enter"]).catch(() => {});
  return r;
}

function flash(v, cx, text, err = false) {
  v.note = { text, err };
  cx.notify();
  cx.timer.after(4500, (cx) => { if (v.note?.text === text) { v.note = null; cx.notify(); } });
}

// A message to the coordinator, never while it waits on a question (the text would answer it).
// Says `ok` at once and sends in the background (a send takes a couple of seconds); only a
// failure speaks again, and runs `undo`.
function tell(v, cx, text, ok, undo) {
  const lead = agents().find((a) => a.address === teamOf(v)?.lead?.address);
  if (!lead) { undo?.(); return flash(v, cx, L("Điều phối đã thoát: tạo lại phòng ban ở menu ⋯", "The coordinator has exited: recreate the team from the ⋯ menu"), true); }
  // Waiting on a question (often its own "duyệt T-…?"): take the person there to answer it.
  if (lead.status === "blocked") {
    undo?.();
    run("agent.focus", { terminal: lead.address });
    return flash(v, cx, L("Điều phối đang hỏi bạn: đã mở pane của nó để bạn trả lời", "The coordinator is asking you: its pane is open so you can answer"));
  }
  flash(v, cx, ok);
  cx.spawn(async (cx) => {
    while (v.relaying) await cx.sleep(300); // never paste over the board's own relay
    v.telling = true;
    const r = await sendText(cx, lead.address, text).finally(() => { v.telling = false; });
    if (r.code !== 0) { undo?.(); flash(v, cx, L("Không gửi được cho Điều phối", "Could not send to the coordinator"), true); }
  });
}

// A card the person just acted on shows it at once, until the coordinator moves it (or 10 min).
function mark(v, c, kind) { v.sent[c.id] = { kind, from: c.status, at: Date.now() }; }

async function newCard(v, cx, title) {
  const team = teamOf(v);
  const id = nextCardId(v.cards);
  const file = `${team.home}\\tasks\\${id}.md`;
  try {
    await fsp.mkdir(`${team.home}\\tasks`, { recursive: true });
    await writeTextFile(file, newCardText({ id, title }), null);
  } catch (e) { return flash(v, cx, L(`Không tạo được ${id}: ${e?.message ?? e}`, `Could not create ${id}: ${e?.message ?? e}`), true); }
  await load(v, cx);
  tell(v, cx, `Phiếu việc mới ${id}: "${title}" (${file}). Làm rõ với người dùng nếu cần, viết đủ phiếu rồi chia việc.`, L(`Đã tạo ${id} và nhắn Điều phối`, `Created ${id} and messaged the coordinator`));
}

function approve(v, cx, c) {
  mark(v, c, "duyet");
  Object.assign(v, { sel: null, sheet: null });
  tell(v, cx, `Người dùng duyệt ${c.id}: commit và tạo PR theo luật, rồi đặt status xong.`, L(`Đã gửi duyệt ${c.id}: Điều phối sẽ commit/PR rồi chuyển phiếu`, `Approval sent for ${c.id}: the coordinator will commit/PR, then move the task`), () => { delete v.sent[c.id]; });
}

function startAsk(v, cx, kind, id = null) {
  Object.assign(v, { ask: { kind, id }, sel: null, sheet: null, menu: false });
  v.input.set_value("");
  cx.timer.after(16, () => v.input.focus());
  cx.notify();
}

async function submit(v, cx) {
  const text = v.input.value().trim();
  const ask = v.ask;
  if (!text || !ask) return;
  v.ask = null;
  v.input.set_value("");
  v.handle.focus();
  cx.notify();
  if (ask.kind === "new") return newCard(v, cx, text);
  if (ask.kind === "budget") {
    const n = Number(text.replace(/[$\s]/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return flash(v, cx, L("Ngưỡng phải là một số USD, ví dụ 20", "The limit must be a USD amount, e.g. 20"), true);
    updateTeam(v, () => ({ budget: n || null }));
    return flash(v, cx, n ? L(`Ngưỡng chi phí: $${n}`, `Cost limit: $${n}`) : L("Đã bỏ ngưỡng chi phí", "Cost limit removed"));
  }
  const c = v.cards.find((x) => x.id === ask.id);
  if (c) mark(v, c, "sua");
  tell(v, cx, `Người dùng yêu cầu sửa ${ask.id}: ${text}. Đưa phiếu về dang-lam và giao lại.`, L(`Đã nhắn Điều phối sửa ${ask.id}`, `Asked the coordinator to change ${ask.id}`), () => { delete v.sent[ask.id]; });
}

// macOS-style board: a unified toolbar (Bảng | Hoạt động), members with status dots, columns with
// icons and count capsules, a Xong column folded to a strip, a sheet that drops from the toolbar
// and an activity panel that slides in. Motion is native (width, top, opacity transitions), never a timer.
const TB = 54; // the toolbar's height
const COL_ICON = { cho: I("circle-dashed"), "dang-lam": I("loader-circle"), "kiem-tra": I("scan-eye"), "cho-duyet": I("shield-check"), xong: CHROME("circle-check") };
const EASE = { duration: 280, easing: "ease-out" };

// The sheet first renders closed, then opens a frame later, so the drop animates.
function openCard(v, cx, id) {
  Object.assign(v, { menu: false, ask: null });
  v.handle.focus();
  if (v.sel) { Object.assign(v, { sheet: id, sel: id }); return cx.notify(); }
  Object.assign(v, { sheet: id, sel: null });
  cx.notify();
  cx.timer.after(20, (cx) => { if (v.sheet === id) { v.sel = id; cx.notify(); } });
}
function closeSheet(v, cx) {
  v.sel = null;
  cx.notify();
  cx.timer.after(360, (cx) => { if (!v.sel) { v.sheet = null; cx.notify(); } });
}

export function boardRender(v, cx) {
  const t = theme();
  const team = teamOf(v);
  if (!team) return v_flex().size_full().items_center().justify_center().gap(12).bg(t.background).text_color(t.muted).text_size(13)
    .child(icon(I("square-kanban"), 30, t.dim)).child(L("Space này chưa có phòng ban.", "This space has no team yet."))
    .child(button(t, "b-make", L("Tạo phòng ban", "Create team"), () => newTeamDialog(), { solid: true, icon: I("users") }));

  // on_size_change reports window pixels; the board is drawn in zoomed units.
  const zoom = Number(settings()?.zoom) || 1;
  const W = (v.size?.width ?? 1200) / zoom, H = (v.size?.height ?? 720) / zoom;
  const all = [team.lead, ...team.members].filter(Boolean);
  const live = new Map(agents().map((a) => [a.address, a]));
  const running = new Set(terminals().map((x) => x.address));
  const member = (role) => all.find((m) => m.role === role);
  const roleLabel = (role) => ROLES[role]?.label ?? member(role)?.label ?? role ?? "";
  const ownerLogo = (role, size) => member(role) ? logo(member(role).agent, size, t) : null;
  // Who holds a card: one owner's logo; several owners as role tags in their colours (up to three).
  const ownerLogos = (roles, size) => {
    const ms = roles.map(member).filter(Boolean).slice(0, 3);
    if (ms.length < 2) return ms.length ? logo(ms[0].agent, size, t) : null;
    return h_flex().flex_none().gap(3).children(ms.map((m) => div().px(5).h(15).flex().items_center().rounded(4).bg(roleTone(t, m.role) + "2e")
      .text_size(10).font_semibold().text_color(roleTone(t, m.role)).child(ROLES[m.role]?.label ?? m.label ?? m.role)));
  };
  const setupOf = (m) => m.model ? [MODELS[m.agent]?.find((x) => x.id === m.model)?.label ?? m.model, m.effort].filter(Boolean).join(" ") : (AGENT_KINDS[m.agent]?.name ?? m.agent);
  const approvals = v.cards.filter((c) => c.status === "cho-duyet");
  // Parallel lanes: the limit, the lane agents and which card each works on.
  const lanes = Math.max(1, Math.min(3, Number(team.lanes) || 1));
  const laneList = laneAgents(team);
  const laneCheck = LANE_CHECKS.find((x) => x.id === team.laneCheck) ?? LANE_CHECKS[1]; // default: QA per lane
  // A lane's worker (its DEV or researcher); its own QA / Review, when opened, are in laneList too.
  const laneOf = Object.fromEntries(laneList.filter((x) => x.role === "dev" || x.role === "research").map((x) => [x.lane, x]));
  const doing = v.cards.filter((c) => c.status === "dang-lam").length;
  const rolePill = (role, text) => div().flex_none().px(5).h(15).flex().items_center().rounded(4).bg(roleTone(t, role) + "2e")
    .text_size(10).font_semibold().text_color(roleTone(t, role)).child(text);
  // The pace and each card's size: its path of steps and where it is on it (a card without a size goes as "vừa").
  const pace = PACES.find((p) => p.id === team.pace) ?? PACES[1];
  const SIZE_TONE = { nho: t.ansi2, vua: t.ansi4, lon: "#c084fc" };
  const isResearch = (c) => laneOf[c.id]?.role === "research" || (c.owners.length > 0 && c.owners.every((r) => r === "research"));
  const pathOf = (c) => pacePath(pace.id, c.size ?? "vua", team, isResearch(c) ? "research" : "code");
  // Cost so far (Claude sessions open now, at API prices) against the team's limit.
  const cost = costSummary(Object.values(v.costs ?? {}));
  const budget = Number(team.budget) || 0;
  const costTone = budget && cost.total >= budget ? t.ansi3 : t.muted;
  // The newest handoff report's result on a card: ✓ đạt, ✗ chưa đạt, ? cần quyết (by role).
  const RESULT = { pass: [t.ansi2, "✓", () => L("đạt", "pass")], fail: [t.ansi1, "✗", () => L("chưa đạt", "failing")], decide: [t.ansi3, "?", () => L("cần quyết", "decide")] };
  const resultTag = (c) => {
    const r = c.reports?.[0];
    const k = r && RESULT[r.result];
    return k && div().flex_none().px(6).h(16).flex().items_center().rounded(5).bg(k[0] + "26").text_size(10).font_semibold().text_color(k[0])
      .child(`${k[1]} ${roleLabel(r.role)} ${k[2]()}`);
  };
  const sizeTag = (c) => c.size && div().flex_none().px(6).h(16).flex().items_center().rounded(5).bg(SIZE_TONE[c.size] + "2e")
    .text_size(10).font_semibold().text_color(SIZE_TONE[c.size]).child(SIZES.find((s) => s.id === c.size)?.label ?? c.size);
  const setSize = (cx, c, s) => tell(v, cx,
    `Người dùng đổi cỡ phiếu ${c.id} thành ${SIZES.find((x) => x.id === s)?.vi ?? s} (ghi size: ${s}); đi tiếp theo đường của cỡ này.\n${paceBrief(team)}`,
    L(`Đã đổi cỡ ${c.id} và nhắn Điều phối`, `Changed ${c.id}'s size and told the coordinator`));

  // Toolbar.
  const showInspector = (on) => (_e, cx) => { v.inspector = on; try { localStorage.setItem("team.inspector", on ? "1" : ""); } catch {} cx.notify(); };
  const segItem = (id, label, on, act) => h_flex().id(id).h(24).px(12).items_center().rounded(6).cursor_pointer().text_size(12)
    .when(on, (el) => el.bg(t.popover).border_1().border_color(t.border).text_color(t.foreground))
    .when(!on, (el) => el.text_color(t.muted).hover((x) => x.text_color(t.foreground)))
    .on_click(act).child(label);
  const toolbar = h_flex().h(TB).flex_none().px(16).gap(10).items_center().border_b(1).border_color(t.border)
    .child(tile(t, I("square-kanban"), 30))
    .child(v_flex().min_w(0).max_w(340)
      .child(div().truncate().text_size(14).font_semibold().child(team.name))
      .child(div().truncate().text_size(11.5).text_color(v.note ? (v.note.err ? t.ansi1 : t.ansi2) : t.dim)
        .child(v.note?.text ?? L(`Phòng ban · ${all.length} thành viên · ${v.cards.length} việc`, `Team · ${all.length} members · ${v.cards.length} tasks`))))
    .child(h_flex().flex_1().justify_center().child(h_flex().p(2).gap(2).rounded(8).bg(t.hover)
      .child(segItem("b-seg-board", L("Bảng", "Board"), !v.inspector, showInspector(false)))
      .child(segItem("b-seg-act", L("Hoạt động", "Activity"), !!v.inspector, showInspector(true)))))
    // The pace (icons; its name and meaning on hover); a change is told to the coordinator.
    .child(h_flex().p(2).gap(2).rounded(8).bg(t.hover).flex_none().children(PACES.map((p) => h_flex().id(`b-pace-${p.id}`).w(26).h(22)
      .items_center().justify_center().rounded(6).cursor_pointer()
      .when(pace.id === p.id, (el) => el.bg(t.popover).border_1().border_color(t.border))
      .tooltip(`${L("Nhịp", "Pace")}: ${p.label} · ${p.desc}`)
      .on_click((_e, cx) => {
        if (p.id === pace.id) return tell(v, cx, paceBrief(team), L(`Đã gửi lại luật nhịp ${p.label} cho Điều phối`, `Resent the ${p.label} pace rules to the coordinator`));
        const prev = team.pace;
        updateTeam(v, () => ({ pace: p.id }));
        tell(v, cx, paceBrief({ ...team, pace: p.id }), L(`Đã đổi nhịp sang ${p.label} và nhắn Điều phối`, `Pace set to ${p.label}; told the coordinator`), () => updateTeam(v, () => ({ pace: prev })));
      })
      .child(icon(PACE_ICON[p.id], 13, pace.id === p.id ? t.foreground : t.muted)))))
    // How many tasks run at once; a change is told to the coordinator with the lane rules.
    .child(h_flex().gap(6).items_center().flex_none()
      .child(div().text_size(11.5).text_color(t.dim).child(L("Làn", "Lanes")))
      .child(h_flex().p(2).gap(2).rounded(8).bg(t.hover).children([1, 2, 3].map((n) => h_flex().id(`b-lane-${n}`).w(26).h(22).items_center().justify_center()
        .rounded(6).cursor_pointer().text_size(12)
        .when(lanes === n, (el) => el.bg(t.popover).border_1().border_color(t.border).text_color(t.foreground))
        .when(lanes !== n, (el) => el.text_color(t.muted).hover((x) => x.text_color(t.foreground)))
        .tooltip(L(`Tối đa ${n} việc chạy cùng lúc · kiểm tra làn phụ: ${laneCheck.label} (menu ⋯)`, `At most ${n} tasks at once · extra-lane checks: ${laneCheck.label} (⋯ menu)`))
        .on_click((_e, cx) => {
          if (n === lanes) return tell(v, cx, laneBrief({ ...team, lanes: n }), L(`Đã gửi lại luật ${n} làn cho Điều phối`, `Resent the lane rules to the coordinator`));
          const prev = team.lanes;
          updateTeam(v, () => ({ lanes: n }));
          tell(v, cx, laneBrief({ ...team, lanes: n }), L(`Đã đặt ${n} làn và nhắn Điều phối`, `Set ${n} lane${n > 1 ? "s" : ""} and told the coordinator`), () => updateTeam(v, () => ({ lanes: prev })));
        })
        .child(String(n))))))
    // Cost so far; amber at the limit. Click: set the limit.
    .child(h_flex().id("b-cost").h(24).px(8).gap(5).flex_none().items_center().rounded(12).cursor_pointer().text_size(11.5)
      .bg(budget && cost.total >= budget ? t.ansi3 + "26" : t.hover).text_color(costTone).hover((x) => x.text_color(t.foreground))
      .tooltip([L("Chi phí ước tính (giá API, các phiên Claude đang mở)", "Estimated cost (API prices, open Claude sessions)"),
        ...Object.entries(cost.byRole).map(([r, c]) => `${roleLabel(r)} $${c.toFixed(2)}`),
        budget ? L(`Ngưỡng $${budget} · bấm để đổi`, `Limit $${budget} · click to change`) : L("Bấm để đặt ngưỡng", "Click to set a limit")].join("\n"))
      .on_click((_e, cx) => startAsk(v, cx, "budget"))
      .child(icon(I("wallet"), 12, costTone)).child(`$${cost.total.toFixed(2)}${budget ? ` / $${budget}` : ""}`))
    .when(approvals.length > 0, (el) => el.child(h_flex().id("b-bell").h(24).px(9).gap(5).items_center().rounded(12).cursor_pointer()
      .bg(t.ansi3 + "26").text_color(t.ansi3).text_size(11.5).hover((x) => x.bg(t.ansi3 + "40"))
      .tooltip(L("Mở phiếu đang chờ bạn duyệt", "Open the task awaiting your approval")).on_click((_e, cx) => openCard(v, cx, approvals[0].id))
      .child(icon(I("bell"), 13, t.ansi3)).child(L(`${approvals.length} chờ duyệt`, `${approvals.length} to approve`))))
    .child(button(t, "b-new", L("Việc mới", "New task"), (_e, cx) => startAsk(v, cx, "new"), { solid: true, icon: CHROME("plus") }))
    .child(iconButton(t, "b-notes", I("notebook-pen"), L("Mở NOTES.md của phòng ban", "Open the team's NOTES.md"), () => openInCode(`${team.home}\\NOTES.md`)))
    .child(iconButton(t, "b-more", I("ellipsis"), L("Thêm", "More"), (_e, cx) => { v.menu = !v.menu; cx.notify(); }));

  const askBar = v.ask && h_flex().h(38).px(10).gap(8).items_center().rounded(10).border_1().border_color(t.accent).bg(t.popover)
    .child(icon(v.ask.kind === "new" ? CHROME("plus") : v.ask.kind === "budget" ? I("wallet") : CHROME("square-pen"), 14, t.muted))
    .child(div().flex_none().text_size(12).text_color(t.muted).child(v.ask.kind === "new" ? L("Việc mới", "New task")
      : v.ask.kind === "budget" ? L("Ngưỡng chi phí, USD (0 = bỏ)", "Cost limit, USD (0 = none)") : L(`Sửa ${v.ask.id}`, `Change ${v.ask.id}`)))
    .child(div().flex_1().min_w(0).child(Input.new(v.input).w_full().text_size(12.5)))
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(L("Enter gửi · Esc huỷ", "Enter to send · Esc to cancel")));

  // Members: a ring around each avatar tells its state (green ready, blue working, amber needs you).
  const chip = (m, i) => {
    const a = live.get(m.address);
    const exists = running.has(m.address);
    const need = !!v.trust?.[m.address];
    const bare = v.bare.has(m.address); // its program ended: only a shell left (a reboot)
    // A card a lane DEV codes isn't the main DEV's.
    const task = v.cards.find((c) => c.owners.includes(m.role) && (c.status === "dang-lam" || c.status === "kiem-tra") && !(m.role === "dev" && laneOf[c.id]));
    const pending = (Array.isArray(team.briefed) && !team.briefed.includes(m.address)) || v.unready.has(m.address);
    const last = task ? [...task.log].reverse().find((e) => e.role === m.role) : null;
    const sub = !exists ? L("đã thoát", "exited") : need ? L("hỏi tin tưởng thư mục", "asks to trust the folder") : bare ? L("đã dừng · chỉ còn shell", "stopped · only a shell") : !a ? L("đang khởi động", "starting") : a.status === "blocked" ? L("cần bạn trả lời", "needs your answer")
      : pending ? L("chờ nhận lời dặn", "waiting for its brief") : task ? `${last?.text ?? L("đang làm", "working")} · ${task.id}`
      : a.status === "working" ? L(`đang chạy · ${setupOf(m)}`, `running · ${setupOf(m)}`) : m.agent === "codex" ? L(`${callsOn(v.cards, m.role, today())} lần hôm nay · ${setupOf(m)}`, `${callsOn(v.cards, m.role, today())} calls today · ${setupOf(m)}`) : L(`rảnh · ${setupOf(m)}`, `idle · ${setupOf(m)}`);
    const warn = need || bare || a?.status === "blocked";
    // DEV's, QA's and Review's chips also count the lane agents of their role and list their cards.
    const extra = ["dev", "qa", "review"].includes(m.role) ? laneList.filter((x) => x.role === m.role) : [];
    const subText = extra.length && exists && a && !warn && !pending
      ? `${task?.id ?? (a.status === "working" ? L("đang chạy", "running") : L("rảnh", "idle"))} · ${L("làn", "lane")} ${extra.map((x) => x.lane).join(", ")}` : sub;
    const dot = !exists ? t.border : warn ? t.ansi3 : a?.status === "working" || task ? t.ansi4 : a ? t.ansi2 : t.dim;
    return h_flex().id(`bm-${i}`).flex_1().min_w(0).h(48).px(12).gap(10).items_center().rounded(10).cursor_pointer()
      .hover((x) => x.bg(t.hover))
      .tooltip(L(`${AGENT_KINDS[m.agent]?.name ?? m.agent} · ${m.address}: bấm để xem`, `${AGENT_KINDS[m.agent]?.name ?? m.agent} · ${m.address}: click to view`))
      .on_click(() => { if (a) run("agent.focus", { terminal: m.address }); else if (exists) run("pane.focus", { terminal: m.address }); })
      // The avatar, with a small status dot on its corner (green ready, blue working, amber needs you).
      .child(div().relative().flex_none()
        .child(h_flex().size(28).items_center().justify_center().rounded(8).bg(t.hover).child(logo(m.agent, 17, t)))
        .child(div().absolute().right(-2).bottom(-2).size(10).rounded(5).border_2().border_color(t.background).bg(dot)))
      .child(v_flex().flex_1().min_w(0)
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().truncate().text_size(12.5).font_semibold().text_color(roleTone(t, m.role)).child(ROLES[m.role]?.label ?? m.label ?? m.role))
          .when(extra.length > 0, (el) => el.child(rolePill(m.role, `+${extra.length} ${L("làn", "lanes")}`))))
        .child(div().truncate().text_size(11).text_color(warn ? t.ansi3 : t.dim).child(subText)))
      .when(need, (el) => el.child(button(t, `bm-trust-${i}`, L("Tin tưởng", "Trust"), (_e, cx) => v.answerTrust(cx, m.address), { small: true })))
      .when(bare, (el) => el.child(button(t, `bm-restart-${i}`, L("Khởi động lại", "Restart"), (_e, cx) => { cx.stop_propagation(); cx.spawn(async (cx) => restartMember(v, cx, m)); },
        { small: true, icon: I("rotate-ccw") })));
  };

  // What the person just did to a card, until the coordinator moves it.
  const sentChip = (c) => h_flex().gap(5).items_center().pt(6).text_size(11).text_color(t.ansi2)
    .child(icon(CHROME("check"), 12, t.ansi2))
    .child(div().truncate().child(v.sent[c.id].kind === "duyet" ? L("Đã gửi duyệt · chờ Điều phối", "Approval sent · waiting for the coordinator") : L("Đã gửi yêu cầu sửa · chờ Điều phối", "Change request sent · waiting for the coordinator")));

  const inspW = 268;
  const colW = Math.max(150, (W - 32 - (v.inspector ? inspW + 12 : 0) - 4 * 10) / 5);
  const card = (c, queue = 0) => {
    const meta = c.note || [c.owners.length ? c.owners.map(roleLabel).join(", ") : null, c.checks.total ? `${c.checks.done}/${c.checks.total}` : null, c.when ? ago(c.when) : null].filter(Boolean).join(" · ");
    const pw = Math.max(40, colW - 42);
    const lane = laneOf[c.id];
    const research = lane?.role === "research";
    // Its lane: the agents working it (DEV or researcher, and its own QA / Review when opened; click
    // one: peek at it) and its branch; a research lane reads only.
    const PILL = { scout: "TS", dev: "DEV", research: L("NC", "RS"), qa: "QA", review: "RV" };
    const crew = laneList.filter((x) => x.lane === c.id).sort((a, b) => Object.keys(PILL).indexOf(a.role) - Object.keys(PILL).indexOf(b.role));
    const laneBox = (crew.length || c.branch) && h_flex().id(`bl-${c.id}`).gap(4).items_center().min_w(0).mt(5).px(6).py(4).rounded(7).bg(t.hover)
      .children(crew.map((x) => div().id(`bl-${c.id}-${x.role}`).flex_none().cursor_pointer().tooltip(L(`Xem ${x.name ?? x.address}`, `Peek at ${x.name ?? x.address}`))
        .on_click((_e, cx) => { cx.stop_propagation(); run("terminal.peek", { terminal: x.address }); })
        .child(rolePill(x.role, crew.length > 1 ? PILL[x.role] ?? x.role : `${PILL[x.role] ?? x.role}·${c.id}`))))
      .when(!research, (x) => x.child(icon(CHROME("git-branch"), 11, t.dim)))
      .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(research ? L("chỉ đọc · không worktree", "read-only · no worktree") : c.branch ?? ""));
    const waiting = team.lanes && c.status === "cho" && doing >= lanes;
    return v_flex().id(`bk-${c.id}`).relative().pl(13).pr(10).py(9).gap(2).rounded(10).bg(t.popover).border_1().border_color(t.border)
      .cursor_pointer().hover((x) => x.border_color(t.input).shadow_sm())
      .on_click((_e, cx) => openCard(v, cx, c.id))
      .when(c.status === "dang-lam", (el) => el.child(div().absolute().left(4).top(9).bottom(9).w(3).rounded(2).bg(t.ansi4)))
      .child(h_flex().gap(6).items_center().child(div().flex_1().text_size(10.5).text_color(t.dim).child(c.id))
        .when(c.priority === "high", (x) => x.child(div().flex_none().px(6).h(16).flex().items_center().rounded(5).bg(t.ansi1 + "26")
          .text_size(10).font_semibold().text_color(t.ansi1).child(L("Gấp", "Urgent"))))
        .when(!!resultTag(c), (x) => x.child(resultTag(c))).when(!!sizeTag(c), (x) => x.child(sizeTag(c))))
      .child(div().text_size(12.5).pb(4).child(c.title))
      // Its path at this pace: done steps green, the current one blue, and the step's name.
      .when(c.status !== "cho", (el) => {
        const path = pathOf(c);
        const at = stepIndex(c, path);
        return el.child(h_flex().gap(6).items_center().min_w(0)
          .child(h_flex().flex_1().min_w(0).gap(3).children(path.map((_, i) => div().flex_1().h(4).rounded(2).bg(i < at ? t.ansi2 : i === at ? t.ansi4 : t.hover))))
          .when(at >= 0 && at < path.length, (x) => x.child(div().flex_none().text_size(10).text_color(t.dim).child(`${STEPS[path[at]]?.label ?? ""} · ${at + 1}/${path.length}`))));
      })
      .when(!!meta, (el) => el.child(h_flex().gap(6).items_center().min_w(0).pt(5)
        .when(queue > 0, (x) => x.child(div().flex_none().size(16).flex().items_center().justify_center().rounded(8).bg(t.hover).text_size(10.5).text_color(t.muted).child(String(queue))))
        .when(!!ownerLogos(c.owners, 14), (x) => x.child(ownerLogos(c.owners, 14)))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(meta))))
      .when(!!laneBox, (el) => el.child(laneBox))
      .when(!!waiting, (el) => el.child(div().mt(5).px(6).py(3).rounded(7).bg(t.hover).text_size(10.5).text_color(t.dim)
        .child(L(`chờ làn trống (${doing}/${lanes})`, `waiting for a free lane (${doing}/${lanes})`))))
      .when(!!c.conflict, (el) => el.child(div().mt(5).px(6).py(3).rounded(7).bg(t.ansi3 + "1f").text_size(10.5).text_color(t.ansi3)
        .child(`⚠ ${L("trùng file", "overlaps")}: ${c.conflict}`)))
      .when(!!v.sent[c.id], (el) => el.child(sentChip(c)))
      .when(c.status === "cho-duyet" && !v.sent[c.id], (el) => el.child(h_flex().gap(5).pt(7)
        .child(button(t, `bk-ok-${c.id}`, L("Duyệt", "Approve"), (_e, cx) => approve(v, cx, c), { small: true, icon: CHROME("check") }))
        .child(button(t, `bk-fix-${c.id}`, L("Sửa thêm", "Request changes"), (_e, cx) => startAsk(v, cx, "fix", c.id), { small: true }))));
  };

  const column = (col) => {
    const list = v.cards.filter((c) => c.status === col.id);
    const gate = col.id === "cho-duyet" && list.length > 0;
    const tone = gate ? t.ansi3 : t[COLOR[col.id]] ?? t.dim;
    const done = col.id === "xong";
    const mini = done && !v.doneOpen;
    const toggle = (_e, cx) => { v.doneOpen = !v.doneOpen; cx.notify(); };
    const capsule = div().flex_none().min_w(18).h(18).px(6).flex().items_center().justify_center().rounded(9).text_size(11)
      .bg(gate ? t.ansi3 + "26" : t.background).text_color(gate ? t.ansi3 : t.muted).child(String(list.length));
    let el = v_flex().id(`bcol-${col.id}`).h_full().p(8).gap(7).rounded(12).bg(t.hover).when(gate, (x) => x.border_1().border_color(t.ansi3));
    el = done ? el.flex_none().w(mini ? 46 : colW).transition("width", EASE) : el.flex_1().min_w(0);
    if (mini) return el.items_center().cursor_pointer().tooltip(L("Xong · bấm để mở", "Done · click to open")).on_click(toggle)
      .child(div().pt(3).child(icon(COL_ICON.xong, 15, tone))).child(capsule);
    return el
      .child(h_flex().id(`bh-${col.id}`).gap(7).items_center().px(4).py(2)
        .when(done, (x) => x.cursor_pointer().tooltip(L("Thu gọn cột Xong", "Collapse the Done column")).on_click(toggle))
        .child(icon(COL_ICON[col.id], 14, tone))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(gate ? t.ansi3 : t.muted).child(col.label))
        .child(capsule))
      .child(div().id(`bc-${col.id}`).flex_1().min_h(0).overflow_y_scroll().child(v_flex().gap(7)
        // Kiểm tra is QA's and Review's queue: oldest first, numbered.
        .children(col.id === "kiem-tra" ? [...list].sort((a, b) => a.when - b.when).map((c, i) => card(c, i + 1)) : list.map((c) => card(c)))
        .when(!list.length && col.id === "cho" && !v.cards.length, (x) => x.child(div().px(4).py(10).text_size(11).text_color(t.dim)
          .child(L("Chưa có phiếu. Bấm Việc mới, hoặc nhờ Điều phối viết phiếu.", "No tasks yet. Click New task, or ask the coordinator to write one."))))));
  };

  // The activity panel: the team's latest log lines, sliding in from the right.
  const acts = recentActivity(v.cards, 40);
  const inspector = div().flex_none().h_full().w(v.inspector ? inspW + 12 : 0).overflow_hidden().transition("width", { duration: 300, easing: "ease-out" })
    .child(div().w(inspW + 12).h_full().pl(12).child(v_flex().size_full().pl(12).gap(6).border_l(1).border_color(t.border)
      .child(h_flex().gap(7).items_center().pt(2)
        .child(icon(I("panel-right-open"), 14, t.muted))
        .child(div().flex_1().text_size(12.5).font_semibold().child(L("Hoạt động", "Activity")))
        .child(div().text_size(11).text_color(t.dim).child(String(acts.length))))
      .child(div().id("b-acts").flex_1().min_h(0).overflow_y_scroll().child(v_flex().gap(2)
        .children(acts.map((e, i) => h_flex().id(`ba-${i}`).gap(9).items_start().px(6).py(6).rounded(8).cursor_pointer()
          .hover((x) => x.bg(t.hover)).on_click((_e, cx) => openCard(v, cx, e.id))
          .child(h_flex().size(22).flex_none().items_center().justify_center().rounded(7).bg(t.hover).child(ownerLogo(e.role, 14) ?? icon(I("users"), 12, t.dim)))
          .child(v_flex().flex_1().min_w(0)
            .child(div().text_size(12).child(`${roleLabel(e.role)}: ${e.text}`))
            .child(div().text_size(10.5).text_color(t.dim).child(`${e.id} · ${e.day ? `${e.day.slice(8, 10)}/${e.day.slice(5, 7)} ` : ""}${e.time ?? ""}`)))))
        .when(!acts.length, (x) => x.child(div().px(6).py(10).text_size(11.5).text_color(t.dim).child(L("Chưa có hoạt động. Nhật ký trong phiếu việc sẽ hiện ở đây.", "No activity yet. Task log entries will show up here."))))))));

  // Members on the columns' grid: one chip over each of the four main columns (avatar in line with
  // the column icon), spacers that follow the Xong column and the activity panel as they move.
  const members = h_flex().px(16).pt(10).pb(8)
    .child(h_flex().flex_1().min_w(0).gap(10)
      .children(all.map(chip))
      .children(Array.from({ length: Math.max(0, 4 - all.length) }, () => div().flex_1()))
      .child(div().flex_none().w(v.doneOpen ? colW : 46).transition("width", EASE)))
    .child(div().flex_none().w(v.inspector ? inspW + 12 : 0).transition("width", { duration: 300, easing: "ease-out" }));

  // The card sheet, dropping from under the toolbar over a dimmed board.
  const sc = v.sheet && v.cards.find((x) => x.id === v.sheet);
  const open = !!v.sel && !!sc;
  const sheetW = Math.min(540, W - 48), sheetH = Math.max(240, Math.min(560, H - TB - 24));
  const sheet = (c) => v_flex().id("bd").w(sheetW).h(sheetH).p(16).gap(10).rounded_b(14).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .child(h_flex().gap(8).items_center()
      .child(div().flex_none().text_size(11).text_color(t.dim).child(c.id))
      .child(div().flex_1().min_w(0).truncate().text_size(14).font_semibold().child(c.title))
      .child(div().flex_none().px(8).h(20).flex().items_center().rounded(10).bg(t.hover).text_size(11).text_color(t[COLOR[c.status]] ?? t.dim)
        .child(COLUMNS.find((x) => x.id === c.status)?.label ?? c.status))
      .child(iconButton(t, "bd-x", CHROME("x"), L("Đóng (Esc)", "Close (Esc)"), (_e, cx) => closeSheet(v, cx))))
    .when(c.owners.length > 0 || !!c.note, (el) => el.child(h_flex().gap(6).items_center().min_w(0)
      .when(!!ownerLogos(c.owners, 14), (x) => x.child(ownerLogos(c.owners, 14)))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted)
        .child([c.owners.length ? L(`${c.owners.map(roleLabel).join(", ")} đang giữ`, `held by ${c.owners.map(roleLabel).join(", ")}`) : null, c.checks.total ? L(`${c.checks.done}/${c.checks.total} tiêu chí`, `${c.checks.done}/${c.checks.total} criteria`) : null, c.note || null].filter(Boolean).join(" · ")))))
    // Its size (changing it tells the coordinator) and its whole path, the current step marked.
    .child(h_flex().gap(10).items_center().flex_wrap()
      .child(h_flex().p(2).gap(2).flex_none().rounded(8).bg(t.hover).children(SIZES.map((s) => h_flex().id(`bd-size-${s.id}`).h(22).px(9).items_center()
        .rounded(6).cursor_pointer().text_size(11.5)
        .when(c.size === s.id, (el) => el.bg(t.popover).border_1().border_color(t.border).text_color(SIZE_TONE[s.id]))
        .when(c.size !== s.id, (el) => el.text_color(t.muted).hover((x) => x.text_color(t.foreground)))
        .on_click((_e, cx) => { if (c.size !== s.id) setSize(cx, c, s.id); })
        .child(s.label))))
      .child(h_flex().flex_1().min_w(0).gap(4).items_center().flex_wrap().children(pathOf(c).flatMap((k, i) => {
        const at = stepIndex(c, pathOf(c));
        return [i ? div().text_size(10.5).text_color(t.dim).child("→") : null,
          div().px(7).h(20).flex().items_center().rounded(10).text_size(11).bg(i === at ? t.ansi4 + "2e" : t.hover)
            .text_color(i < at ? t.ansi2 : i === at ? t.ansi4 : t.muted).child(STEPS[k].label)].filter(Boolean);
      }))))
    .child(div().id("bd-body").flex_1().min_h(0).overflow_y_scroll().child(v_flex().gap(12)
      .child(TextView.markdown(`bd-md-${c.id}`, c.body.replace(/^#{1,3} /gm, "#### ") || L("_Phiếu chưa có nội dung._", "_This task has no content yet._")).selectable(true))
      // What the scout gathered (team home\context\<id>.md), for DEV and QA to start from.
      .when(!!c.context, (el) => el.child(v_flex().gap(6)
        .child(h_flex().gap(6).items_center().child(rolePill("scout", roleLabel("scout")))
          .child(div().text_size(11.5).text_color(t.dim).child(L("Bối cảnh", "Context"))))
        .child(div().px(10).py(8).rounded(8).bg(t.hover)
          .child(TextView.markdown(`bd-ctx-${c.id}`, c.context.replace(/^#{1,3} /gm, "#### ")).selectable(true)))))
      // The latest handoff reports: who, the result, the tests actually run, what needs deciding.
      .when((c.reports ?? []).length > 0, (el) => el.child(v_flex().gap(6)
        .child(div().text_size(11.5).text_color(t.dim).child(L("Báo cáo bàn giao", "Handoff reports")))
        .children(c.reports.slice(0, 4).map((r, i) => v_flex().id(`bd-hr-${i}`).gap(2).px(10).py(8).rounded(8).bg(t.hover)
          .child(h_flex().gap(6).items_center()
            .child(rolePill(r.role, roleLabel(r.role)))
            .when(!!RESULT[r.result], (x) => x.child(div().text_size(11).font_semibold().text_color(RESULT[r.result][0]).child(`${RESULT[r.result][1]} ${RESULT[r.result][2]()}`)))
            .child(div().flex_1())
            .child(div().text_size(10.5).text_color(t.dim).child(r.at)))
          .when(!!r.tests, (x) => x.child(div().text_size(11.5).child(`${L("Test", "Tests")}: ${r.tests}`)))
          .when(!!r.files, (x) => x.child(div().text_size(11).text_color(t.muted).child(`${L("File đổi", "Files")}: ${r.files}`)))
          .when(!!r.decide && !/^(không|none|no)$/i.test(r.decide), (x) => x.child(div().text_size(11.5).text_color(t.ansi3).child(`${L("Cần quyết định", "Needs a decision")}: ${r.decide}`)))))))
      .when(c.log.length > 0, (el) => el.child(v_flex().gap(5)
        .child(div().text_size(11.5).text_color(t.dim).child(L("Nhật ký", "Log")))
        .children(c.log.map((e, i) => h_flex().id(`bd-log-${i}`).gap(8).items_center().min_w(0)
          .child(div().w(76).flex_none().text_size(10.5).text_color(t.dim).child(`${e.day ? e.day.slice(5) : ""} ${e.time ?? ""}`.trim()))
          .child(ownerLogo(e.role, 13) ?? div().size(13).flex_none())
          .child(div().flex_1().min_w(0).text_size(12).child(`${roleLabel(e.role)}: ${e.text}`))))))))
    .child(h_flex().gap(8).items_center()
      .child(button(t, "bd-open", L("Mở phiếu", "Open task"), () => openInCode(c.file), { icon: CHROME("file-text") }))
      .child(div().flex_1())
      .when(!!v.sent[c.id], (el) => el.child(sentChip(c)))
      .when(c.status !== "xong" && !v.sent[c.id], (el) => el.child(button(t, "bd-fix", L("Sửa thêm", "Request changes"), (_e, cx) => startAsk(v, cx, "fix", c.id))))
      .when(c.status === "cho-duyet" && !v.sent[c.id], (el) => el.child(button(t, "bd-ok", L("Duyệt", "Approve"), (_e, cx) => approve(v, cx, c), { solid: true, icon: CHROME("check") }))));
  // While a card is open the whole board, toolbar too, sits behind a backdrop that keeps every
  // press and scroll from what's under it; a click on it closes the card. The card keeps its own
  // presses (selecting its text must not reach the backdrop).
  const stop = (_e, cx) => cx.stop_propagation();
  const backdrop = open && div().id("b-dim").absolute().top(0).left(0).size_full().bg("#000000").opacity(0.32)
    .on_mouse_down("left", stop).on_mouse_down("right", stop).on_mouse_up("left", stop).on_scroll_wheel(stop)
    .on_click((_e, cx) => closeSheet(v, cx));
  const sheetLayer = sc && div().absolute().top(TB).left(0).w(W).h(Math.max(0, H - TB)).overflow_hidden()
    .child(sheet(sc).absolute().left(Math.max(0, (W - sheetW) / 2)).top(open ? 0 : -(sheetH + 24)).transition("top", { duration: 320, easing: "ease-out" })
      .on_mouse_down("left", stop).on_mouse_down("right", stop).on_mouse_up("left", stop));

  const item = (id, path, label, act) => h_flex().id(id).h(32).px(9).gap(9).items_center().rounded(7).cursor_pointer().text_size(12.5)
    .hover((x) => x.bg(t.hover)).on_click((_e, cx) => { v.menu = false; act(cx); cx.notify(); })
    .child(icon(path, 14, t.muted)).child(label);
  const menu = v.menu && v_flex().absolute().top(TB - 4).right(16).w(250).p(4).gap(1).rounded(10).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .child(item("bm-brief", I("send"), L("Gửi lại lời dặn cho cả đội", "Resend briefs to the team"), (cx) => {
      updateTeam(v, () => ({ briefed: [] }));
      flash(v, cx, L("Sẽ gửi lại lời dặn khi từng agent rảnh", "Briefs will be resent as each agent goes idle"));
    }))
    .when(v.bare.size > 0, (el) => el.child(item("bm-restart", I("rotate-ccw"), L(`Khởi động lại ${v.bare.size} thành viên đã dừng`, `Restart ${v.bare.size} stopped member${v.bare.size > 1 ? "s" : ""}`),
      (cx) => cx.spawn(async (cx) => { for (const m of all.filter((x) => v.bare.has(x.address))) await restartMember(v, cx, m); }))))
    .child(item("bm-budget", I("wallet"), L("Đặt ngưỡng chi phí…", "Set a cost limit…"), (cx) => startAsk(v, cx, "budget")))
    // Who checks an extra lane's work; a change (or the current one again) tells the coordinator.
    .child(div().h(1).mx(6).my(3).bg(t.border))
    .child(div().px(9).py(2).text_size(10.5).text_color(t.dim).child(L("Kiểm tra ở làn phụ", "Checks on extra lanes")))
    .children(LANE_CHECKS.map((k) => h_flex().id(`bm-check-${k.id}`).h(30).px(9).gap(9).items_center().rounded(7).cursor_pointer().text_size(12.5)
      .hover((x) => x.bg(t.hover)).tooltip(k.desc)
      .on_click((_e, cx) => {
        v.menu = false;
        if (k.id === laneCheck.id) tell(v, cx, laneBrief(team), L("Đã gửi lại luật làn cho Điều phối", "Resent the lane rules to the coordinator"));
        else {
          const prev = team.laneCheck;
          updateTeam(v, () => ({ laneCheck: k.id }));
          tell(v, cx, laneBrief({ ...team, laneCheck: k.id }), L(`Kiểm tra làn phụ: ${k.label} · đã nhắn Điều phối`, `Extra-lane checks: ${k.label} · told the coordinator`), () => updateTeam(v, () => ({ laneCheck: prev })));
        }
        cx.notify();
      })
      .child(div().size(14).flex_none().when(k.id === laneCheck.id, (x) => x.child(icon(CHROME("check"), 14, t.accent))))
      .child(k.label)))
    .child(div().h(1).mx(6).my(3).bg(t.border))
    .child(item("bm-folder", CHROME("folder"), L("Mở thư mục phiếu việc", "Open the tasks folder"), () => exec("explorer.exe", [`${team.home}\\tasks`]).catch(() => {})))
    .child(item("bm-team", I("users"), L("Tạo phòng ban khác…", "Create another team…"), () => newTeamDialog()));

  return v_flex().id("board").relative().size_full().overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13)
    .track_focus(v.handle)
    .on_size_change((size, cx) => { v.size = size; cx.notify(); })
    .on_key_down((e, cx) => {
      if (e.key === "escape") {
        if (v.sel) return closeSheet(v, cx);
        Object.assign(v, { ask: null, menu: false });
        v.handle.focus();
        cx.notify();
      } else if (e.key === "enter" && v.ask) cx.spawn(async (cx) => submit(v, cx));
    })
    .child(toolbar)
    // A member waiting on the person: what it asks, and a way to its pane to answer.
    .children(all.filter((m) => live.get(m.address)?.status === "blocked").map((m, i) => h_flex().id(`bq-${i}`).mx(16).mt(10).px(12).py(9).gap(10)
      .items_center().rounded(10).bg(t.ansi3 + "1f").border_1().border_color(t.ansi3 + "66")
      .child(icon(I("bell"), 15, t.ansi3))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(12).font_semibold().text_color(roleTone(t, m.role)).child(L(`${ROLES[m.role]?.label ?? m.label ?? m.role} đang hỏi bạn`, `${ROLES[m.role]?.label ?? m.label ?? m.role} is asking you`)))
        .child(div().text_size(12).child(v.asks[m.address] || L("Câu hỏi đang chờ trong pane của agent", "A question is waiting in the agent's pane"))))
      .child(button(t, `bq-go-${i}`, L("Trả lời", "Answer"), () => run("agent.focus", { terminal: m.address }), { solid: true, icon: CHROME("chevron-right") }))))
    .when(!!askBar, (el) => el.child(div().px(16).pt(12).child(askBar)))
    .child(members)
    .child(h_flex().flex_1().min_h(0).px(16).pb(16)
      .child(h_flex().flex_1().min_w(0).h_full().gap(10).children(COLUMNS.map(column)))
      .child(inspector))
    .when(!!backdrop, (el) => el.child(backdrop))
    .when(!!sheetLayer, (el) => el.child(sheetLayer))
    .when(!!menu, (el) => el.child(menu));
}
