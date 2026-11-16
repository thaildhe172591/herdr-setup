// Pure logic for the composer (chat box under the panes): no herdr/gpui imports, node --test.
import { L } from "./i18n.js";

// --- Attachments ---

const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;

export const kindOf = (path, isDir) => (isDir ? "folder" : IMAGE.test(path) ? "image" : "file");

// What goes into Claude's input: images as their (quoted) path, so Claude Code attaches them;
// files and folders as @-mentions. Quoted only when the path has a space. Ends with a space.
export function insertText(items) {
  const q = (p) => (/\s/.test(p) ? `"${p}"` : p);
  return items.map((i) => (i.kind === "image" ? q(i.path) : `@${q(i.path)}`)).join(" ") + " ";
}

// The terminal to paste into: the focused one when it is Claude Code, else the shown tab's Claude
// Code agent, else the focused terminal.
export function targetTerminal({ agents = [], focused }) {
  if (!focused) return null;
  const claude = agents.filter((a) => a.tab === focused.tab && a.app === "claude-code");
  // The focused agent gets it, whatever its CLI (a Codex or Antigravity pane in a department's tab
  // used to lose to the tab's first Claude); a plain terminal sends to its tab's Claude, then to its
  // space's (a terminal tab next to the work tab).
  const own = agents.find((a) => a.address === focused.terminal);
  const inSpace = agents.find((a) => focused.space && a.space === focused.space && a.app === "claude-code");
  return (own ?? claude[0] ?? inSpace)?.address ?? focused.terminal ?? null;
}

// Where Alt+V goes when the clipboard has no image: the pane you're in, as if the tray weren't there.
export const altVTarget = (focused, target) => focused?.terminal ?? target;

// --- Status line data (bridge/statusline.mjs imports this file too) and the Actions buttons ---

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const limit = (l) => (num(l?.used_percentage) == null ? null : { pct: l.used_percentage, resetsAt: num(l.resets_at) });

// Claude Code's status line input → what the rail and status line show.
export function summarize(input) {
  if (!input || typeof input !== "object") return null;
  const cw = input.context_window ?? {};
  const used = num(cw.total_input_tokens), size = num(cw.context_window_size);
  const pct = num(cw.used_percentage) ?? (used != null && size ? (used / size) * 100 : null);
  const c = input.cost ?? {};
  return {
    model: input.model?.display_name ?? null,
    effort: input.effort?.level ?? null,
    fast: !!input.fast_mode,
    ctxPct: pct,
    ctxUsed: used,
    ctxSize: size,
    cost: num(c.total_cost_usd),
    durationMs: num(c.total_duration_ms),
    added: num(c.total_lines_added),
    removed: num(c.total_lines_removed),
    fiveHour: limit(input.rate_limits?.five_hour),
    sevenDay: limit(input.rate_limits?.seven_day),
  };
}

// 240900 → "240.9k", 1000000 → "1M".
export function tokens(n) {
  if (num(n) == null) return "–";
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(n);
}

// The composer's Actions menu: phrases sent to the target Claude, grouped; confirm = asks first.
// The person's own come from ~/.config/herdr-app/actions.json (withCustom).
export const ACTIONS = [
  { group: "Git", id: "commit", get label() { return L("Commit", "Commit"); }, text: "Commit" },
  { group: "Git", id: "pr", get label() { return L("Commit + PR", "Commit + PR"); }, text: "Commit + PR" },
  { group: "Git", id: "push", get label() { return L("Push", "Push"); }, text: "Push nhánh này lên remote" },
  { group: "Git", id: "pull", get label() { return L("Pull về", "Pull"); }, text: "Pull về (git pull --ff-only)" },
  { group: "Git", id: "branch", get label() { return L("Tạo branch mới", "New branch"); }, text: "Tạo branch mới cho việc đang làm rồi chuyển sang" },
  { group: "Git", id: "merge", get label() { return L("Merge PR", "Merge PR"); }, text: "Merge PR đi", confirm: true },
  { get group() { return L("Kiểm tra", "Checks"); }, id: "test", get label() { return L("Chạy test", "Run tests"); }, text: "Chạy test và báo kết quả" },
  { get group() { return L("Kiểm tra", "Checks"); }, id: "build", get label() { return L("Build", "Build"); }, text: "Build và báo lỗi nếu có" },
  { get group() { return L("Kiểm tra", "Checks"); }, id: "fix", get label() { return L("Sửa lỗi build/test", "Fix build/test errors"); }, text: "Build, chạy test rồi sửa hết lỗi" },
  { get group() { return L("Kiểm tra", "Checks"); }, id: "review", get label() { return L("Review thay đổi", "Review changes"); }, text: "Review các thay đổi chưa commit, liệt kê lỗi và rủi ro" },
  { get group() { return L("Kiểm tra", "Checks"); }, id: "deploy", get label() { return L("Build bộ deploy", "Build deploy package"); }, text: "Build bộ deploy" },
  { group: "Claude", id: "summary", get label() { return L("Tóm tắt việc đã làm", "Summarize work done"); }, text: "Tóm tắt ngắn những gì đã làm trong phiên này" },
  { group: "Claude", id: "explain", get label() { return L("Giải thích thay đổi", "Explain changes"); }, text: "Giải thích các thay đổi chưa commit" },
  { group: "Claude", id: "docs", get label() { return L("Cập nhật tài liệu", "Update docs"); }, text: "Cập nhật README/tài liệu theo thay đổi vừa làm" },
  { group: "Claude", id: "sec-review", get label() { return L("Review bảo mật", "Security review"); }, text: "/security-review" },
  { group: "Claude", id: "code-review", label: "Code review", text: "/code-review" },
  { group: "Claude", id: "compact", label: "/compact", text: "/compact" },
  { group: "Claude", id: "clear", label: "/clear", text: "/clear", confirm: true },
];

// actions.json: [{label, text, group?, confirm?}] → appended under "Của tôi" (or its group);
// entries without a label and a text are skipped.
export function withCustom(builtIn, custom) {
  const mine = (Array.isArray(custom) ? custom : [])
    .filter((x) => x && typeof x.label === "string" && typeof x.text === "string" && x.label.trim() && x.text.trim())
    .map((x, i) => ({ group: typeof x.group === "string" && x.group.trim() ? x.group.trim() : L("Của tôi", "Mine"), id: `my-${i}`, label: x.label.trim(), text: x.text.trim(), confirm: !!x.confirm }));
  return [...builtIn, ...mine];
}

// A double click (or a second click before Claude's status turns "working") must not send twice.
export const shouldSend = (lastSentAt, now, gap = 3000) => lastSentAt == null || now - lastSentAt >= gap;

// Whether the buttons may send now: never while Claude works or waits on a question.
// agent: {status, name?} of any agent (Claude Code, Codex, Antigravity…), or null.
export function actionState(agent) {
  if (!agent) return { enabled: false, reason: L("Chưa có agent để gửi", "No agent to send to") };
  const who = agent.name || "Agent";
  if (agent.status === "working") return { enabled: false, reason: L(`${who} đang làm…`, `${who} is working…`) };
  if (agent.status === "blocked") return { enabled: false, reason: L(`${who} đang chờ bạn trả lời`, `${who} is waiting for your answer`) };
  return { enabled: true, reason: null };
}

// The Actions an agent understands: every plain phrase; a slash command only where it exists
// (/compact: Claude Code, Codex, Antigravity; /clear: Claude Code, Antigravity; Claude Code's review commands).
const SLASH = { compact: ["claude-code", "codex", "antigravity"], clear: ["claude-code", "antigravity"], "sec-review": ["claude-code"], "code-review": ["claude-code"] };
export const actionsFor = (list, app) => (list ?? []).filter((a) => !SLASH[a.id] || SLASH[a.id].includes(app));

// A duration for people: 45s, 14m, 2h 05m, 3d 4h.
export function span(ms) {
  if (num(ms) == null) return "–";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Context bar colour (theme key): fills toward an automatic compact.
export const ctxTone = (pct) => (num(pct) == null ? "dim" : pct >= 80 ? "ansi1" : pct >= 60 ? "ansi3" : "accent");

// One line for Claude's own status line, e.g. "Opus 5.5 xhigh · ctx 23% (240.9k/1M) · 5h 12% · $1.20".
export function statusText(s) {
  if (!s) return "";
  const parts = [[s.model, s.effort].filter(Boolean).join(" ")];
  if (s.ctxPct != null) parts.push(`ctx ${Math.round(s.ctxPct)}%` + (s.ctxUsed != null && s.ctxSize ? ` (${tokens(s.ctxUsed)}/${tokens(s.ctxSize)})` : ""));
  if (s.fiveHour) parts.push(`5h ${Math.round(s.fiveHour.pct)}%`);
  if (s.cost != null) parts.push(`$${s.cost.toFixed(2)}`);
  return parts.filter(Boolean).join(" · ");
}

// --- Routing and usage labels ---

// Agents to offer as the message's target: the focused tab's first, then Claude Code, then the rest.
export function targets(agents, focused) {
  const rank = (a) => (a.tab === focused?.tab ? 0 : a.app === "claude-code" ? 1 : 2);
  return [...(agents ?? [])].sort((a, b) => rank(a) - rank(b));
}

const DAYS = () => L(["CN", "T2", "T3", "T4", "T5", "T6", "T7"], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// When a plan limit resets, like Claude Desktop's "Resets at 8:40 AM" / "Resets Thu 11:00 PM".
export function resetLabel(resetsAtSec, nowMs) {
  if (typeof resetsAtSec !== "number") return "";
  const d = new Date(resetsAtSec * 1000), now = new Date(nowMs);
  return d.toDateString() === now.toDateString() ? L(`lúc ${hhmm(d)}`, `at ${hhmm(d)}`) : `${DAYS()[d.getDay()]} ${hhmm(d)}`;
}

// --- Model, effort and permission mode of the target Claude (changed from the composer) ---

// Sent as `/model <id>`.
export const MODELS = [
  { id: "opus", label: "Opus", get desc() { return L("Mạnh nhất cho việc khó", "Most capable, for hard tasks"); } },
  { id: "sonnet", label: "Sonnet", get desc() { return L("Nhanh, cân bằng cho việc hằng ngày", "Fast and balanced for everyday work"); } },
  { id: "haiku", label: "Haiku", get desc() { return L("Nhanh nhất cho việc nhỏ", "Fastest, for small tasks"); } },
  { id: "fable", label: "Fable", get desc() { return L("Thế hệ Fable", "The Fable generation"); } },
];
// Sent as `/effort <id>`.
export const EFFORTS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
  { id: "max", label: "Max" },
];
// Claude Code's footer under the prompt box names every mode but the default one.
export const MODES = [
  { id: "auto", get label() { return L("Tự động", "Auto"); }, get desc() { return L("Claude tự quyết khi nào cần hỏi quyền", "Claude decides when to ask for permission"); }, footer: "auto mode on" },
  { id: "default", get label() { return L("Hỏi trước", "Ask first"); }, get desc() { return L("Luôn hỏi trước khi sửa", "Always ask before editing"); } },
  { id: "acceptEdits", get label() { return L("Tự nhận sửa", "Accept edits"); }, get desc() { return L("Tự nhận mọi sửa file", "Accept every file edit"); }, footer: "accept edits on" },
  { id: "plan", get label() { return L("Lập kế hoạch", "Plan mode"); }, get desc() { return L("Lập kế hoạch trước khi sửa", "Plan before editing"); }, footer: "plan mode on" },
  { id: "bypassPermissions", get label() { return L("Bỏ qua quyền", "Bypass permissions"); }, get desc() { return L("Nhận mọi quyền", "Grant every permission"); }, footer: "bypass permissions on" },
];

// --- Models per agent: Claude, Codex, Antigravity (each changed with its own slash command) ---

// Which CLI an agent is, from its own report (app) or its program's name.
export function agentKind(a) {
  const s = `${a?.app ?? ""} ${a?.program?.name ?? ""}`.toLowerCase();
  return /claude/.test(s) ? "claude" : /codex/.test(s) ? "codex" : /antigravity|\bagy\b/.test(s) ? "agy" : null;
}
// Built in until `codex debug models` / `agy models` answer (as listed on 2026-11-10).
const LEVELS = ["low", "medium", "high", "xhigh", "max"];
// Claude Code takes full model IDs in /model (e.g. /model claude-fable-5-2). The four current ones
// first, as in Claude Desktop; older ones under "Thêm model" (more). IDs from the Claude API docs
// (2026-11-03). Effort per model: Opus / Sonnet 4.6 have no xhigh, Haiku 4.5 takes none.
const LEVELS_46 = ["low", "medium", "high", "max"];
const claude = (id, label, vi, en, more = false, efforts = LEVELS) => ({ id, label, more, efforts, get desc() { return vi ? L(vi, en) : ""; } });
const CLAUDE_MODELS = [
  claude("claude-opus-5-5", "Opus 5.5", "Mạnh, cân bằng cho việc khó", "Capable and balanced, for hard tasks"),
  claude("claude-fable-5-2", "Fable 5.2", "Mạnh nhất, cho việc dài và khó nhất (đắt hơn)", "Most capable, for the longest and hardest work (costs more)"),
  claude("claude-sonnet-5-5", "Sonnet 5.5", "Nhanh, cân bằng cho việc hằng ngày", "Fast and balanced for everyday work"),
  claude("claude-haiku-5-5", "Haiku 5.5", "Nhanh nhất, rẻ nhất cho việc nhỏ", "Fastest and cheapest, for small tasks"),
  claude("claude-fable-5-1", "Fable 5.1", null, null, true),
  claude("claude-haiku-4-5", "Haiku 4.5", null, null, true, []),
  claude("claude-sonnet-5", "Sonnet 5", null, null, true),
  claude("claude-opus-5", "Opus 5", null, null, true),
  claude("claude-fable-5", "Fable 5", null, null, true),
  claude("claude-opus-4-8", "Opus 4.8", null, null, true),
  claude("claude-opus-4-7", "Opus 4.7", null, null, true),
  claude("claude-opus-4-6", "Opus 4.6", null, null, true, LEVELS_46),
  claude("claude-sonnet-4-6", "Sonnet 4.6", null, null, true, LEVELS_46),
  { id: "default", more: true, efforts: LEVELS, get label() { return L("Mặc định", "Default"); }, get desc() { return L("Theo cài đặt của tài khoản", "The account's setting"); } },
];
const CODEX_BUILTIN = [
  { id: "gpt-6-luna", label: "GPT-6-Luna", desc: "Fast and affordable model for easier tasks.", efforts: LEVELS },
  { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", desc: "Older balanced model for straightforward work.", efforts: [...LEVELS, "ultra"] },
  { id: "gpt-5.6-luna", label: "GPT-5.6-Luna", desc: "Older fast and efficient model.", efforts: LEVELS },
];
const AGY_BUILTIN = [
  ["gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"], ["gemini-3.8-flash-medium", "Gemini 3.8 Flash (Medium)"], ["gemini-3.8-flash-low", "Gemini 3.8 Flash (Low)"],
  ["claude-sonnet-4-6", "Claude Sonnet 4.6 (Thinking)"], ["claude-opus-4-6-thinking", "Claude Opus 4.6 (Thinking)"], ["gpt-oss-120b-medium", "GPT-OSS 120B (Medium)"],
].map(([id, label]) => ({ id, label, desc: "" }));

// `codex debug models` (JSON): the visible models with the efforts each takes.
export function parseCodexModels(json) {
  try {
    return (JSON.parse(json).models ?? []).filter((m) => m.visibility === "list").map((m) => ({ id: m.slug, label: m.display_name ?? m.slug,
      desc: m.description ?? "", efforts: (m.supported_reasoning_levels ?? []).map((x) => x.effort), def: m.default_reasoning_level ?? null }));
  } catch { return []; }
}
// `agy models`: "<id>\t<label>" lines.
export function parseAgyModels(text) {
  return String(text ?? "").split(/\r?\n/).map((l) => /^([\w.-]+)\t+(.+?)\s*$/.exec(l)).filter(Boolean).map((m) => ({ id: m[1], label: m[2], desc: "" }));
}
// An agent's models: Claude's built in, Codex's and Antigravity's as their CLI listed them (lists).
export function modelsFor(kind, lists = {}) {
  if (kind === "claude") return CLAUDE_MODELS;
  if (kind === "codex") return lists.codex?.length ? lists.codex : CODEX_BUILTIN;
  if (kind === "agy") return lists.agy?.length ? lists.agy : AGY_BUILTIN;
  return [];
}
// The efforts a model takes (Codex: as its CLI lists; Claude: per model, Haiku 4.5 none), else all five.
export const effortsFor = (kind, model = null) => (kind === "codex" && model?.efforts?.length ? model.efforts : kind === "claude" && model?.efforts ? model.efforts : LEVELS);
export const modelCommand = (kind, id) => `/model ${id}`;
// Codex has no /effort: its /model takes --reasoning, with the model it runs (null: unknown, send nothing).
export const effortCommand = (kind, effort, current = null) => (kind === "codex" ? (current ? `/model ${current} --reasoning=${effort}` : null) : `/effort ${effort}`);

// The listed model a footer names: the same label, or "<model> (<variant>)" — Antigravity's Flash
// variants told apart by the effort in the footer.
export function currentModel(list, foot) {
  if (!foot?.model) return null;
  // As written, then without a leading "Claude" ("Claude Fable 5.2" → Claude Code's "Fable 5.2";
  // Antigravity's own labels keep it: "Claude Opus 4.6 (Thinking)").
  const full = foot.model.toLowerCase();
  for (const name of [full, full.replace(/^claude\s+/, "")]) {
    const exact = list.find((m) => m.label.toLowerCase() === name);
    if (exact) return exact;
    const variants = list.filter((m) => m.label.toLowerCase().startsWith(`${name} (`));
    const hit = variants.find((m) => foot.effort && m.label.toLowerCase().includes(`(${foot.effort}`)) ?? variants[0];
    if (hit) return hit;
  }
  return null;
}

// Under Codex's prompt: "GPT-5.6-Terra high · <folder>" ("default" effort: null).
export function codexFooter(screen) {
  const lines = String(screen ?? "").split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^\s*(\S+)\s+(low|medium|high|xhigh|max|ultra|default)\s+·\s/i.exec(lines[i]);
    if (m) return { model: m[1], effort: m[2].toLowerCase() === "default" ? null : m[2].toLowerCase() };
  }
  return null;
}
// Antigravity's last line: "? for shortcuts      [<mode> · ]Gemini 3.8 Flash · medium" — no mode
// prefix in the default mode.
export function agyFooter(screen) {
  const lines = String(screen ?? "").split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const right = lines[i].trimEnd().split(/\s{2,}/).pop() ?? "";
    const parts = right.split(/\s+·\s+/).map((x) => x.trim());
    const effort = parts.at(-1)?.toLowerCase();
    if (parts.length < 2 || parts.length > 3 || !LEVELS.includes(effort)) continue;
    const mode = parts.length === 3 ? parts[0].toLowerCase() : "default";
    if (!AGY_MODES.some((m) => m.id === mode)) continue;
    return { model: parts.at(-2), effort, mode };
  }
  return null;
}
// Antigravity's modes, as its footer names them; Shift+Tab cycles plan → default → accept-edits → auto.
export const AGY_MODES = [
  { id: "default", get label() { return L("Hỏi trước", "Ask first"); }, get desc() { return L("Hỏi duyệt mỗi lần sửa file và chạy lệnh", "Asks before every edit and command"); } },
  { id: "accept-edits", get label() { return L("Tự nhận sửa", "Accept edits"); }, get desc() { return L("Tự duyệt sửa file, vẫn hỏi khi chạy lệnh", "File edits auto-approved; asks for commands"); } },
  { id: "auto", get label() { return L("Tự động", "Auto"); }, get desc() { return L("Tự duyệt sửa file và lệnh an toàn", "Edits and safe commands auto-approved"); } },
  { id: "plan", get label() { return L("Lập kế hoạch", "Plan"); }, get desc() { return L("Chỉ tìm hiểu và lập kế hoạch, không sửa", "Research and plan only, no edits"); } },
];
const AGY_CYCLE = ["plan", "default", "accept-edits", "auto"];
// Its mode from the footer, else from the banner it puts in the input right after a switch ("> Auto
// mode: …"), when a narrow pane drops the model from the footer. null: neither on screen.
export function agyModeOf(screen) {
  const f = agyFooter(screen);
  if (f) return f.mode;
  const b = /^\s*>\s*(Accept-edits|Auto|Plan) mode:/im.exec(String(screen ?? "").split(/\r?\n/).reverse().join("\n"));
  return b ? b[1].toLowerCase() : null;
}
export const agyModeSteps = (from, to) => (AGY_CYCLE.includes(from) && AGY_CYCLE.includes(to) ? (AGY_CYCLE.indexOf(to) - AGY_CYCLE.indexOf(from) + 4) % 4 : null);

// Codex's /permissions choices, picked by their digit.
export const CODEX_PERMS = [
  { id: "ask", key: "1", get label() { return L("Hỏi khi cần", "Ask for approval"); }, get desc() { return L("Sửa trong workspace, hỏi khi ra internet hay sửa ngoài workspace", "Edits in the workspace; asks for internet or outside edits"); } },
  { id: "approve", key: "2", get label() { return L("Tự duyệt an toàn", "Approve for me"); }, get desc() { return L("Chỉ hỏi việc có vẻ không an toàn", "Asks only for actions that look unsafe"); } },
  { id: "full", key: "3", get label() { return L("Toàn quyền", "Full access"); }, get desc() { return L("Sửa ngoài workspace, ra internet không hỏi (cẩn thận)", "Edits outside the workspace and goes online without asking (careful)"); } },
  { id: "readonly", key: "4", get label() { return L("Chỉ đọc", "Read only"); }, get desc() { return L("Chỉ đọc file, hỏi khi sửa hay ra internet", "Reads only; asks for edits or internet"); } },
];

// Codex's /status: model, effort, permissions, plan, context and limits. Read as "Key: value" pairs,
// a value's wrapped lines joined back (a narrow pane wraps them and leaves the [████] bar out); the
// last /status on screen wins.
export function codexStatus(screen) {
  const kv = {};
  let key = null;
  for (const raw of String(screen ?? "").split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Za-z0-9 ]*?):\s+(\S.*)$/.exec(raw);
    if (m) { key = m[1]; kv[key] = m[2].trim(); continue; }
    if (key && /^\s{6,}\S/.test(raw)) kv[key] += ` ${raw.trim()}`;
    else key = null;
  }
  const model = /^(\S+)\s+\(reasoning (\w+)/.exec(kv.Model ?? "");
  const perm = /^(.+?)(?:\s+\(|$)/.exec(kv.Permissions ?? "");
  const plan = /\((\w+)\)\s*$/.exec(kv.Account ?? "");
  const ctx = /(\d+)% left(?:\s*\((.+?)\))?/.exec(kv["Context window"] ?? "");
  const limits = Object.entries(kv).filter(([k]) => / limit$/i.test(k)).map(([k, v]) => [k, /(\d+)% left(?:\s*\(resets (.+?)\))?/.exec(v)])
    .filter(([, m]) => m).map(([k, m]) => ({ label: k, left: Number(m[1]), resets: m[2] ?? null }));
  if (!model && !kv.Permissions && !limits.length) return null;
  return { model: model?.[1] ?? null, effort: model?.[2] ?? null, permissions: perm?.[1] ?? null, plan: plan?.[1] ?? null,
    context: ctx ? { left: Number(ctx[1]), detail: ctx[2] ?? null } : null, limits };
}
// Antigravity's /usage: "<GROUP>" lines, then "<…> Limit Remaining" with a percentage under it.
export function agyUsage(screen) {
  const out = [];
  let group = null, label = null;
  for (const raw of String(screen ?? "").split(/\r?\n/)) {
    const l = raw.trim();
    if (/^[A-Z][A-Z0-9 &/-]{3,}$/.test(l)) { group = l; label = null; continue; }
    if (/Limit Remaining$/i.test(l)) { label = l; continue; }
    const p = label && /([\d.]+)%/.exec(l);
    if (p) { out.push({ group, label, pct: Number(p[1]) }); label = null; }
  }
  return out;
}

export const modelKey = (displayName) => MODELS.find((m) => String(displayName ?? "").toLowerCase().startsWith(m.id))?.id ?? null;
export const effortLabel = (level) => EFFORTS.find((e) => e.id === level)?.label ?? level ?? "";

// The mode shown under Claude's prompt box (rule, "❯ …", rule, footer), or null when no prompt box
// is on screen (a dialog or a question card is open: keys must not go there).
export function modeOf(screen) {
  const ls = String(screen ?? "").split(/\r?\n/);
  const rule = (l) => /^\s*─{10,}/.test(l ?? "");
  let end = -1;
  for (let i = ls.length - 1; i > 0 && end < 0; i--) {
    if (!/^\s*❯/.test(ls[i]) || !rule(ls[i - 1])) continue;
    for (let j = i + 1; j < Math.min(ls.length, i + 10); j++) if (rule(ls[j])) { end = j; break; }
  }
  if (end < 0) return null;
  const footer = ls.slice(end + 1).join("\n");
  return MODES.find((m) => m.footer && footer.includes(m.footer))?.id ?? "default";
}

// --- Several targets ---

// The agents a message goes to: the picked ones still alive, else the automatic one (if any).
export function pickTargets(picked, live, auto) {
  const alive = (picked ?? []).filter((a) => live.includes(a));
  return alive.length ? alive : auto ? [auto] : [];
}

// Agents grouped by space for the pickers, the shown space first.
export function bySpace(agents, focused) {
  const groups = new Map();
  for (const a of agents ?? []) {
    if (!groups.has(a.space)) groups.set(a.space, { space: a.space, name: a.space_name, agents: [] });
    groups.get(a.space).agents.push(a);
  }
  return [...groups.values()].sort((x, y) => (y.space === focused?.space) - (x.space === focused?.space));
}

// The composer block's height: one text line by default, up to 6, plus the thumbnail row.
export const composerPx = ({ lines, thumbs }) => 92 + (Math.min(6, Math.max(1, lines)) - 1) * 18 + (thumbs ? 70 : 0);

// The textarea inserts "\n" (+ the line's indent) for Enter before it reports submit: the text
// before that keystroke, when the only difference is that newline; else the text as it is.
export function withoutEnter(prev, cur) {
  if (prev == null || prev === cur) return cur;
  let i = 0;
  while (i < prev.length && prev[i] === cur[i]) i++;
  if (cur[i] !== "\n") return cur;
  let j = i + 1;
  while (cur[j] === " " || cur[j] === "\t") j++;
  for (let k = j; k >= i + 1; k--) if (cur.slice(0, i) + cur.slice(k) === prev) return prev;
  return cur;
}

// --- Agent sessions lost to a reboot / core restart (Claude, Codex, Antigravity) ---

// What the agent-session bridge keeps from a hook's payload: Antigravity sends conversationId, Codex
// (like Claude) session_id. Ids are typed into a shell later, so only letters, digits and '-' pass.
const SAFE_ID = /^[A-Za-z0-9-]+$/;
export const KINDS = ["claude", "codex", "agy"];
export function sessionRecord(kind, payload, cwd, now) {
  const session = [payload?.conversationId, payload?.session_id, payload?.sessionId].find((x) => typeof x === "string");
  if (!KINDS.includes(kind) || !session || session.length < 8 || session.length > 128 || !SAFE_ID.test(session)) return null;
  return { at: now, kind, session, cwd: typeof payload?.cwd === "string" && payload.cwd ? payload.cwd : cwd };
}
// A team record's agent ("claude-haiku" is Claude too) as a session kind.
export const sessionKind = (agent) => (String(agent ?? "").startsWith("claude") ? "claude" : agent);

// herdr-core gives a lost terminal a shell with the same address, never its program again. A shell
// whose agent last saved its session before the core started lost that agent: resume it, unless the
// person ended it themselves (ended) or it was just resumed (resumed: {session, at, tries}).
// statuses: terminal → {at, session, cwd, kind}; kind claude | codex | agy (Claude when absent).
// A resume typed more than a minute ago that didn't bring the agent back is tried once more.
export function lostSessions({ terminals = [], agents = [], statuses = {}, coreStart, ended = {}, resumed = {}, now = Date.now() }) {
  const running = new Set(agents.map((a) => a.address)); // any agent there: never type over it
  const same = (a, b) => String(a ?? "").replace(/[\/]+$/, "").toLowerCase() === String(b ?? "").replace(/[\/]+$/, "").toLowerCase();
  return terminals.flatMap((t) => {
    const s = statuses[t.address];
    if (!s?.session || !SAFE_ID.test(s.session) || running.has(t.address) || !(s.at < coreStart)) return [];
    const r = typeof resumed[t.address] === "string" ? { session: resumed[t.address], at: 0, tries: 1 } : resumed[t.address];
    if (ended[t.address] === s.session || (r?.session === s.session && (r.tries >= 2 || now - r.at < 60000))) return [];
    return [{ terminal: t.address, kind: KINDS.includes(s.kind) ? s.kind : "claude", session: s.session, cwd: s.cwd ?? t.cwd, cd: !!s.cwd && !same(s.cwd, t.cwd) }];
  });
}

// An agent's own command taking a saved session back. Kept in step with team/model.js withResume
// (a mod cannot import another mod's files; tests/resume.test.mjs checks the two agree).
export function withResume(argv, kind, session) {
  if (kind === "codex") return [argv[0], "resume", session, ...argv.slice(1)];
  if (kind === "agy") return [...argv, "--conversation", session];
  return [argv[0], "--resume", session, ...argv.slice(1)];
}
// The command to resume with: a team member's recorded start command (x.argv, kept by the board),
// else the kind's plain command. A member without a record still gets what the team started it with:
// model and effort (Claude, Antigravity), auto mode (Antigravity), no daemon (Codex).
const setupFlags = (x) => [...(x.model ? ["--model", x.model] : []), ...(x.effort ? ["--effort", x.effort] : [])];
export function resumeArgv(x) {
  const kind = x.kind ?? "claude";
  const base = x.argv?.length ? x.argv
    : kind === "codex" ? ["codex", ...(x.member ? ["--no-daemon"] : [])]
    : kind === "agy" ? ["agy", ...(x.member ? ["--mode", "auto"] : []), ...setupFlags(x)]
    : ["claude", ...setupFlags(x)];
  return withResume(base, kind, x.session);
}
// What to type into that shell (Git Bash and PowerShell 7 both take it).
export const resumeCommand = (x) => `${x.cd ? `cd '${x.cwd}' && ` : ""}${resumeArgv(x).join(" ")}`;

// A team member's record (role, agent, model, effort, and its start argv once the board kept it);
// null for a terminal outside every department.
export function teamMember(teams, address) {
  for (const t of Object.values(teams ?? {})) {
    const m = [t?.lead, ...(t?.members ?? [])].find((x) => x?.address === address);
    if (m) return m;
  }
  return null;
}

// A terminal's model and effort from its department's record (shared "teams"), when it is a member
// that has them; {} otherwise.
export function teamSetup(teams, address) {
  for (const t of Object.values(teams ?? {})) {
    const m = [t?.lead, ...(t?.members ?? [])].find((x) => x?.address === address);
    if (m) return Object.fromEntries(["model", "effort"].filter((k) => m[k]).map((k) => [k, m[k]]));
  }
  return {};
}

// The same, as keys for `hc keys`. A paste (hc send) wraps the text in bracketed-paste codes, and in
// shells herdr-core brought back after a reboot the leading ESC got lost: bash ran "[200~claude…~".
// Keys carry no codes. ctrl+c first clears what an earlier broken paste left on the line (a dangling
// ESC ate the next "c": "laude --resume…"); the caller sends it alone and waits before the rest.
// null when a key is missing (a cd needs ':'): then paste.
// hc keys has no '_': a Codex effort (-c model_reasoning_effort=…) is left out of what is typed, and the
// resumed Codex takes its config's effort.
export const typedArgv = (argv) => argv.filter((a, i) => !a.includes("_") && !(a === "-c" && argv[i + 1]?.includes("_")));
export function resumeKeys(x) {
  if (x.cd) return null;
  const chars = [...typedArgv(resumeArgv(x)).join(" ")];
  if (!chars.every((c) => c === " " || /^[a-z0-9.=-]$/i.test(c))) return null;
  return ["ctrl+c", ...chars.map((c) => (c === " " ? "space" : c)), "enter"];
}

// Whether a terminal (hc get) has its shell itself in front, at its prompt: only then is typing (and
// ctrl+c) safe — never into a program the person started there.
const SHELLS = /^(bash|zsh|fish|sh|dash|ksh|pwsh|powershell|cmd|nu)(\.exe)?$/i;
export const atPrompt = (term) => SHELLS.test(term?.foreground?.name ?? "");
// herdr-core reports the shell in front even while an agent runs inside it (Windows), so the screen
// decides too: its last non-empty line is a shell's own prompt — "…$", "PS …>", "C:\…>", or an
// oh-my-posh two-line prompt's "╰─" + its glyph(s) (never a Claude box's "╰──…──╯").
export function shellPrompt(screen) {
  const last = String(screen ?? "").split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).pop() ?? "";
  return /\$$/.test(last) || /^PS .*>$/.test(last.trim()) || /^[A-Za-z]:\\.*>$/.test(last.trim()) || /^╰─[^\s─╯]{0,3}$/u.test(last.trim());
}

// --- Departments (mods/team): "@review …" in the composer ---

const foldKey = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, "-");

// The space's team record (shared "teams") carries each teammate's role, label and aliases.
// "@review xem diff" → {role, address, rest}; anything else → null.
export function routeMention(text, team) {
  const m = /^@(\S+)\s*([\s\S]*)$/.exec(String(text ?? "").trim());
  if (!m || !team) return null;
  const key = foldKey(m[1]);
  const all = [team.lead, ...(team.members ?? [])].filter(Boolean);
  const hit = all.find((x) => foldKey(x.role) === key || foldKey(x.label) === key || (x.aliases ?? []).map(foldKey).includes(key));
  return hit?.address ? { role: hit.role, address: hit.address, rest: m[2].trim() } : null;
}
