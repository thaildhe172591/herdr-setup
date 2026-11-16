import { test } from "node:test";
import assert from "node:assert/strict";
import { targets, resetLabel } from "../mods/composer/model.js";

test("targets: focused tab's agents first, then Claude Code, then the rest", () => {
  const agents = [
    { address: "t1", tab: "x", app: "codex" },
    { address: "t2", tab: "y", app: "claude-code" },
    { address: "t3", tab: "f", app: "claude-code" },
    { address: "t4", tab: "z", app: null },
  ];
  assert.deepEqual(targets(agents, { tab: "f" }).map((a) => a.address), ["t3", "t2", "t1", "t4"]);
  assert.deepEqual(targets([], { tab: "f" }), []);
});

test("resetLabel: time today, weekday + time later", () => {
  const now = new Date(2026, 10, 9, 4, 0).getTime(); // Monday 9 Nov 2026, 04:00 local
  assert.equal(resetLabel(new Date(2026, 10, 9, 8, 40).getTime() / 1000, now), "lúc 08:40");
  assert.equal(resetLabel(new Date(2026, 10, 12, 23, 0).getTime() / 1000, now), "T5 23:00");
  assert.equal(resetLabel(new Date(2026, 10, 15, 9, 5).getTime() / 1000, now), "CN 09:05");
  assert.equal(resetLabel(null, now), "");
});

import { modeOf, modelKey, pickTargets, bySpace, composerPx, MODES } from "../mods/composer/model.js";

const RULE = "─".repeat(40);
test("modeOf: reads the permission mode under Claude's prompt box", () => {
  const box = (footer) => ["older output", RULE, "❯ Try \"edit\"", RULE, "  Opus 5.5 xhigh · ctx 0%", ...footer].join("\n");
  assert.equal(modeOf(box(["  ⏵⏵ bypass permissions on (shift+tab to cycle)"])), "bypassPermissions");
  assert.equal(modeOf(box(["  ⏵⏵ accept edits on (shift+tab to cycle)"])), "acceptEdits");
  assert.equal(modeOf(box(["  ⏸ plan mode on (shift+tab to cycle)"])), "plan");
  assert.equal(modeOf(box(["  ⏵⏵ auto mode on (shift+tab to cycle)"])), "auto");
  assert.equal(modeOf(box(["  ? for shortcuts"])), "default");
  // A dialog (/usage, a question card) has no prompt box: don't press keys into it.
  assert.equal(modeOf("Settings  Status  Usage\n❯ 1. Yes\n  2. No"), null);
  assert.equal(modeOf(""), null);
  assert.deepEqual(MODES.map((m) => m.id), ["auto", "default", "acceptEdits", "plan", "bypassPermissions"]);
});

test("modelKey: display name → /model alias", () => {
  assert.equal(modelKey("Opus 5.5"), "opus");
  assert.equal(modelKey("Sonnet 5.5 (1M context)"), "sonnet");
  assert.equal(modelKey("Fable 5.1"), "fable");
  assert.equal(modelKey(null), null);
});

test("pickTargets: the picked agents still alive, else the automatic one", () => {
  assert.deepEqual(pickTargets(["t1", "t9"], ["t1", "t2"], "t2"), ["t1"]);
  assert.deepEqual(pickTargets(["t9"], ["t1"], "t1"), ["t1"]);
  assert.deepEqual(pickTargets(null, ["t1"], "t1"), ["t1"]);
  assert.deepEqual(pickTargets([], [], null), []);
});

test("bySpace: agents grouped per space, the shown space first", () => {
  const agents = [
    { address: "a", space: "s1", space_name: "Acme" },
    { address: "b", space: "s2", space_name: "App" },
    { address: "c", space: "s1", space_name: "Acme" },
  ];
  const g = bySpace(agents, { space: "s2" });
  assert.deepEqual(g.map((x) => [x.name, x.agents.map((a) => a.address)]), [["App", ["b"]], ["Acme", ["a", "c"]]]);
});

test("composerPx: grows with typed lines (max 6) and thumbnails", () => {
  assert.equal(composerPx({ lines: 1, thumbs: false }), 92);
  assert.equal(composerPx({ lines: 3, thumbs: false }), 92 + 2 * 18);
  assert.equal(composerPx({ lines: 40, thumbs: true }), 92 + 5 * 18 + 70);
});

import { withoutEnter } from "../mods/composer/model.js";
test("withoutEnter: drops the newline the textarea inserted for Enter", () => {
  assert.equal(withoutEnter("hello", "hello\n"), "hello");
  assert.equal(withoutEnter("ab", "a\nb"), "ab");          // Enter in the middle
  assert.equal(withoutEnter("  x", "  x\n  "), "  x");     // with the line's indent
  assert.equal(withoutEnter("", "\n"), "");
  assert.equal(withoutEnter("a\nb", "a\nb"), "a\nb");       // no change event missed
  assert.equal(withoutEnter("old", "new text\n"), "new text\n"); // unknown: keep what is there
});

import { lostSessions } from "../mods/composer/model.js";
test("lostSessions: shells whose Claude stopped before herdr-core started (reboot) get resumed once", () => {
  const coreStart = 1000;
  const terminals = [
    { address: "t1", cwd: "D:\Acme" },                 // Claude lost at reboot → resume
    { address: "t2", cwd: "D:\Acme\App" },            // Claude running again → no
    { address: "t3", cwd: "D:\Other" },               // folder moved → resume with cd
    { address: "t4", cwd: "D:\Acme" },                 // user exited Claude (ended) → no
    { address: "t5", cwd: "D:\Acme" },                 // status written after core start → no
    { address: "t6", cwd: "D:\Acme" },                 // already resumed in this core → no
    { address: "t7", cwd: "D:\Acme" },                 // no status file → no
  ];
  const agents = [{ address: "t2", app: "claude-code" }];
  const statuses = {
    t1: { at: 900, session: "s1", cwd: "D:\Acme" },
    t2: { at: 900, session: "s2", cwd: "D:\Acme\App" },
    t3: { at: 900, session: "s3", cwd: "D:\Acme\Deep" },
    t4: { at: 900, session: "s4", cwd: "D:\Acme" },
    t5: { at: 1500, session: "s5", cwd: "D:\Acme" },
    t6: { at: 900, session: "s6", cwd: "D:\Acme" },
  };
  const now = 5_000_000;
  const got = lostSessions({ terminals, agents, statuses, coreStart, ended: { t4: "s4" }, resumed: { t6: { session: "s6", at: now - 1000, tries: 1 } }, now });
  assert.deepEqual(got, [
    { terminal: "t1", kind: "claude", session: "s1", cwd: "D:\Acme", cd: false },
    { terminal: "t3", kind: "claude", session: "s3", cwd: "D:\Acme\Deep", cd: true },
  ]);
  assert.equal(resumeCommand(got[0]), "claude --resume s1");
  assert.equal(resumeCommand(got[1]), "cd 'D:\Acme\Deep' && claude --resume s3");
});
import { resumeCommand, resumeKeys } from "../mods/composer/model.js";

test("lostSessions: a resume that didn't bring Claude back is tried once more after a minute, then left", () => {
  const coreStart = 1000, now = 5_000_000;
  const terminals = [{ address: "t1", cwd: "D:/Acme" }];
  const statuses = { t1: { at: 900, session: "s1", cwd: "D:/Acme" } };
  const ask = (r) => lostSessions({ terminals, agents: [], statuses, coreStart, resumed: { t1: r }, now }).length;
  assert.equal(ask({ session: "s1", at: now - 90_000, tries: 1 }), 1); // typed, Claude never came: again
  assert.equal(ask({ session: "s1", at: now - 10_000, tries: 1 }), 0); // just typed: give it time
  assert.equal(ask({ session: "s1", at: now - 90_000, tries: 2 }), 0); // tried twice: the person decides
  assert.equal(ask("s1"), 1); // an older record (session only): one more try
  assert.equal(ask({ session: "s0", at: now, tries: 2 }), 1); // another session in that shell: new
});

import { atPrompt, teamSetup, shellPrompt } from "../mods/composer/model.js";
test("shellPrompt: only a shell's own prompt on the last line counts (not Claude's, Codex's or Antigravity's)", () => {
  const N = String.fromCharCode(10);
  assert.ok(shellPrompt(["Admin@PC MINGW64 /d/Acme/Acme.Shop (main)", "$"].join(N)));
  assert.ok(shellPrompt("PS C:\\Users\\dev> "));
  assert.ok(!shellPrompt(["❯ ", "  Opus 5.5 xhigh · ctx 8%", "  ⏵⏵ auto mode on (shift+tab to cycle)"].join(N)));
  assert.ok(!shellPrompt([">", "? for shortcuts   plan · Gemini 3.8 Flash · low"].join(N)));
  // oh-my-posh atomic in Git Bash: the prompt line is "╰─" and two Nerd Font glyphs
  assert.ok(shellPrompt(["╭─ bash App  main ?13 ~248   0ms", "╰─"].join(N)));
  assert.ok(!shellPrompt(["│ > ", "╰──────────────────────────────╯"].join(N))); // a Claude input box's bottom
  assert.ok(!shellPrompt("╰─╯"));
});
test("teamSetup: a terminal's model and effort from its department's record, if it is a member with them", () => {
  const teams = { sp1: { lead: { role: "lead", address: "t4s", model: "opus", effort: "medium" },
    members: [{ role: "dev", address: "t4t", model: "opus", effort: "xhigh" }, { role: "qa", address: "t4w" }] } };
  assert.deepEqual(teamSetup(teams, "t4s"), { model: "opus", effort: "medium" });
  assert.deepEqual(teamSetup(teams, "t4t"), { model: "opus", effort: "xhigh" });
  assert.deepEqual(teamSetup(teams, "t4w"), {});
  assert.deepEqual(teamSetup(teams, "t9"), {});
  assert.deepEqual(teamSetup(undefined, "t4s"), {});
});
test("atPrompt: type into a terminal only while its shell itself is in front (no program it started)", () => {
  for (const n of ["bash.exe", "pwsh.exe", "powershell.exe", "zsh", "fish", "bash"]) assert.ok(atPrompt({ foreground: { name: n } }), n);
  for (const n of ["claude.exe", "node.exe", "vim", "codex.exe"]) assert.ok(!atPrompt({ foreground: { name: n } }), n);
  assert.ok(!atPrompt({}));
});

test("resumeKeys: the resume typed key by key (a paste's bracket codes reached bash as text), else null", () => {
  assert.deepEqual(resumeKeys({ session: "be17-3c", cd: false }),
    ["ctrl+c", "c", "l", "a", "u", "d", "e", "space", "-", "-", "r", "e", "s", "u", "m", "e", "space", "b", "e", "1", "7", "-", "3", "c", "enter"]);
  assert.equal(resumeKeys({ session: "s1", cd: true, cwd: "D:/x" }), null); // a cd needs ':' — hc keys has no key for it
  // A team member comes back with its role's model and effort (a bare resume took the CLI defaults).
  const keys = resumeKeys({ session: "s1", cd: false, model: "opus", effort: "medium" });
  assert.equal(keys.slice(1, -1).map((k) => (k === "space" ? " " : k)).join(""), "claude --resume s1 --model opus --effort medium");
  assert.equal(resumeCommand({ session: "s1", cd: false, model: "sonnet", effort: "high" }), "claude --resume s1 --model sonnet --effort high");
  assert.equal(resumeKeys({ session: "a b/c", cd: false }), null);
});

import { routeMention } from "../mods/composer/model.js";
test("routeMention: '@review …' goes to that teammate of the space's team (role, label or alias)", () => {
  const team = {
    lead: { role: "lead", label: "Trưởng nhóm", aliases: ["lead", "truong-nhom"], address: "t40" },
    members: [{ role: "review", label: "Review", aliases: [], address: "t42" }, { role: "code-b", label: "Code (hướng 2)", aliases: [], address: "t44" }],
  };
  assert.deepEqual(routeMention("@review xem diff", team), { role: "review", address: "t42", rest: "xem diff" });
  assert.equal(routeMention("@Trưởng-nhóm chia việc", team)?.address, "t40");
  assert.equal(routeMention("@code-b thử cách khác", team)?.address, "t44");
  assert.equal(routeMention("@ai đó", team), null);
  assert.equal(routeMention("@review hi", null), null);
  assert.equal(routeMention("email a@b.c", team), null);
});

import { agentKind, parseCodexModels, parseAgyModels, modelsFor, effortsFor, modelCommand, effortCommand, codexFooter, agyFooter, currentModel } from "../mods/composer/model.js";

test("currentModel: the listed model a footer names (Antigravity's Flash variants by effort)", () => {
  const agy = modelsFor("agy", {});
  assert.equal(currentModel(agy, { model: "Gemini 3.8 Flash", effort: "medium" })?.id, "gemini-3.8-flash-medium");
  assert.equal(currentModel(agy, { model: "Claude Opus 4.6", effort: "high" })?.id, "claude-opus-4-6-thinking");
  assert.equal(currentModel(modelsFor("codex", {}), { model: "GPT-5.6-Terra", effort: "high" })?.id, "gpt-5.6-terra");
  assert.equal(currentModel(agy, null), null);
  assert.equal(currentModel(agy, { model: "Nope", effort: "low" }), null);
});

test("agentKind: which CLI an agent is, from its report or its program", () => {
  assert.equal(agentKind({ app: "claude-code" }), "claude");
  assert.equal(agentKind({ app: "codex" }), "codex");
  assert.equal(agentKind({ app: "x", program: { name: "Antigravity" } }), "agy");
  assert.equal(agentKind({ program: { name: "Codex" } }), "codex");
  assert.equal(agentKind({ app: "kiro" }), null);
  assert.equal(agentKind(null), null);
});

test("parseCodexModels / parseAgyModels: the models each CLI lists (Codex: only the visible ones)", () => {
  const codex = JSON.stringify({ models: [
    { slug: "gpt-reserve", display_name: "GPT-Reserve", visibility: "hide", supported_reasoning_levels: [{ effort: "low" }] },
    { slug: "gpt-6-luna", display_name: "GPT-6-Luna", description: "Fast and affordable", visibility: "list", default_reasoning_level: "medium", supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "max" }] },
    { slug: "gpt-5.6-terra", display_name: "GPT-5.6-Terra", visibility: "list", supported_reasoning_levels: [{ effort: "high" }, { effort: "ultra" }] },
  ] });
  assert.deepEqual(parseCodexModels(codex).map((m) => [m.id, m.label, m.efforts.join(",")]), [["gpt-6-luna", "GPT-6-Luna", "low,medium,max"], ["gpt-5.6-terra", "GPT-5.6-Terra", "high,ultra"]]);
  assert.deepEqual(parseCodexModels("not json"), []);
  const agy = ["Fetching available models...", "gemini-3.8-flash-high\tGemini 3.8 Flash (High)", "claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)", ""].join(String.fromCharCode(10));
  assert.deepEqual(parseAgyModels(agy).map((m) => [m.id, m.label]), [["gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"], ["claude-opus-4-6-thinking", "Claude Opus 4.6 (Thinking)"]]);
});

test("modelsFor / effortsFor: each agent's own list, falling back on a built-in one", () => {
  // Claude: the four current models first (as in Claude Desktop), the rest under "Thêm model" (more).
  const claude = modelsFor("claude", {});
  assert.deepEqual(claude.filter((m) => !m.more).map((m) => m.id), ["claude-opus-5-5", "claude-fable-5-2", "claude-sonnet-5-5", "claude-haiku-5-5"]);
  assert.deepEqual(claude.filter((m) => m.more).map((m) => m.id), ["claude-fable-5-1", "claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5",
    "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6", "default"]);
  assert.equal(claude.find((m) => m.id === "claude-fable-5-2").label, "Fable 5.2");
  // Effort levels per model: Opus/Sonnet 4.6 have no xhigh, Haiku 4.5 takes none.
  assert.deepEqual(effortsFor("claude", claude.find((m) => m.id === "claude-opus-4-6")), ["low", "medium", "high", "max"]);
  assert.deepEqual(effortsFor("claude", claude.find((m) => m.id === "claude-haiku-4-5")), []);
  assert.deepEqual(effortsFor("claude", claude.find((m) => m.id === "claude-opus-5-5")), ["low", "medium", "high", "xhigh", "max"]);
  // The status line's display name finds the listed model.
  assert.equal(currentModel(claude, { model: "Opus 4.6" })?.id, "claude-opus-4-6");
  assert.equal(currentModel(claude, { model: "Claude Fable 5.2" })?.id, "claude-fable-5-2");
  assert.ok(modelsFor("codex", {}).some((m) => m.id === "gpt-6-luna")); // built-in until codex answers
  assert.deepEqual(modelsFor("codex", { codex: [{ id: "x", label: "X", efforts: ["low"] }] }).map((m) => m.id), ["x"]);
  assert.ok(modelsFor("agy", {}).some((m) => m.id === "gemini-3.8-flash-high"));
  assert.deepEqual(modelsFor(null, {}), []);
  assert.deepEqual(effortsFor("claude"), ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(effortsFor("codex", { id: "t", efforts: ["low", "ultra"] }), ["low", "ultra"]);
  assert.deepEqual(effortsFor("agy"), ["low", "medium", "high", "xhigh", "max"]);
});

test("modelCommand / effortCommand: what each CLI takes (Codex sets effort with its current model)", () => {
  assert.equal(modelCommand("claude", "opus"), "/model opus");
  assert.equal(modelCommand("codex", "gpt-5.6-terra"), "/model gpt-5.6-terra");
  assert.equal(modelCommand("agy", "gemini-3.8-flash-low"), "/model gemini-3.8-flash-low");
  assert.equal(effortCommand("claude", "high"), "/effort high");
  assert.equal(effortCommand("agy", "medium"), "/effort medium");
  assert.equal(effortCommand("codex", "high", "gpt-5.6-terra"), "/model gpt-5.6-terra --reasoning=high");
  assert.equal(effortCommand("codex", "high", null), null); // no model known: nothing to send
});

test("codexFooter / agyFooter: the model and effort under each CLI's prompt", () => {
  const codex = ["› Ask Codex to do anything", "  GPT-5.6-Terra high · D:/Acme/Acme.Approval", "  ← for agents · ? for shortcuts"].join(String.fromCharCode(10));
  assert.deepEqual(codexFooter(codex), { model: "GPT-5.6-Terra", effort: "high" });
  assert.deepEqual(codexFooter("  GPT-6-Luna default · D:/x"), { model: "GPT-6-Luna", effort: null });
  assert.equal(codexFooter("nothing here"), null);
  const agy = ["> ", "? for shortcuts                plan · Gemini 3.8 Flash · medium"].join(String.fromCharCode(10));
  assert.deepEqual(agyFooter(agy), { model: "Gemini 3.8 Flash", effort: "medium", mode: "plan" });
  assert.deepEqual(agyFooter("? for shortcuts    auto · Claude Opus 4.6 · high"), { model: "Claude Opus 4.6", effort: "high", mode: "auto" });
  assert.deepEqual(agyFooter("? for shortcuts    accept-edits · Gemini 3.8 Flash · low"), { model: "Gemini 3.8 Flash", effort: "low", mode: "accept-edits" });
  // The default mode has no prefix (what `agy --mode auto` actually starts in).
  assert.deepEqual(agyFooter("? for shortcuts          Gemini 3.8 Flash · medium"), { model: "Gemini 3.8 Flash", effort: "medium", mode: "default" });
  assert.equal(agyFooter("nothing"), null);
});

import { targetTerminal, AGY_MODES, agyModeSteps, CODEX_PERMS, codexStatus, agyUsage, agyModeOf } from "../mods/composer/model.js";

test("agyModeOf: Antigravity's mode from its footer, else from the banner it shows right after a switch", () => {
  const N = String.fromCharCode(10);
  // Seen live: just after Shift+Tab a narrow pane shows the banner and drops the model from the footer.
  assert.equal(agyModeOf(["> Accept-edits mode: file edits auto-approved ...", "────", "? for shortcuts"].join(N)), "accept-edits");
  assert.equal(agyModeOf(["> Auto mode: edits & safe commands auto-approv...", "? for shortcuts   auto · Gemini 3.8 Flash · medium"].join(N)), "auto");
  assert.equal(agyModeOf(["> Plan mode: research & plan only (shift+tab to cycle)", "? for shortcuts"].join(N)), "plan");
  assert.equal(agyModeOf(["> ", "? for shortcuts          Gemini 3.8 Flash · medium"].join(N)), "default");
  assert.equal(agyModeOf("nothing"), null);
});

test("targetTerminal: the focused agent gets the message whatever its CLI; a plain terminal sends to its tab's Claude, then its space's", () => {
  const agents = [
    { address: "t1", tab: "A", space: "S", app: "claude-code" },
    { address: "t2", tab: "A", space: "S", app: "codex" },
    { address: "t3", tab: "A", space: "S", app: "antigravity" },
    { address: "t9", tab: "B", space: "S", app: "claude-code" },
  ];
  const at = (tab, terminal) => targetTerminal({ agents, focused: { tab, space: "S", terminal } });
  assert.equal(at("A", "t2"), "t2"); // the Codex pane of a team tab (it went to the tab's Claude before)
  assert.equal(at("A", "t3"), "t3");
  assert.equal(at("A", "t1"), "t1");
  assert.equal(at("A", "t5"), "t1"); // a plain shell in that tab
  assert.equal(at("C", "t6"), "t1"); // a tab without agents: the space's Claude
  assert.equal(targetTerminal({ agents: [], focused: { tab: "C", terminal: "t6" } }), "t6");
});

test("agyModeSteps: Shift+Tab presses from one Antigravity mode to another (plan → default → accept-edits → auto)", () => {
  assert.deepEqual(AGY_MODES.map((m) => m.id), ["default", "accept-edits", "auto", "plan"]);
  assert.equal(agyModeSteps("default", "auto"), 2);
  assert.equal(agyModeSteps("plan", "default"), 1);
  assert.equal(agyModeSteps("auto", "default"), 2);
  assert.equal(agyModeSteps("auto", "auto"), 0);
  assert.equal(agyModeSteps(null, "auto"), null);
});

test("CODEX_PERMS: Codex's /permissions choices, picked by their digit", () => {
  assert.deepEqual(CODEX_PERMS.map((p) => [p.id, p.key]), [["ask", "1"], ["approve", "2"], ["full", "3"], ["readonly", "4"]]);
});

test("codexStatus: model, effort, permissions, plan and limits from Codex's /status", () => {
  const N = String.fromCharCode(10);
  const s = codexStatus(["  Model:               GPT-6-Luna (reasoning medium, summaries auto)", "  Permissions:         Read Only (Ask for approval)",
    "  Account:             someone@example.com (Free)", "  Monthly limit:       [████████████████████] 98% left (resets 4:45 AM on 9 Dec)",
    "  Weekly limit:        [██████░░░░] 61% left (resets Mon 9:00)"].join(N));
  assert.deepEqual(s, { model: "GPT-6-Luna", effort: "medium", permissions: "Read Only", plan: "Free", context: null,
    limits: [{ label: "Monthly limit", left: 98, resets: "4:45 AM on 9 Dec" }, { label: "Weekly limit", left: 61, resets: "Mon 9:00" }] });
  assert.equal(codexStatus("nothing"), null);
  // A narrow pane: values wrap under their key and the bar is left out (seen live in a team tab).
  const narrow = codexStatus(["  Model:            GPT-6-Luna (reasoning", "                    medium, summaries auto)", "  Permissions:      Read Only (Ask for",
    "                    approval)", "  Context window:   97% left (18.9K used /", "                    258K)", "  Monthly limit:    98% left",
    "                    (resets 4:45 AM on 9 Dec)"].join(N));
  assert.deepEqual(narrow, { model: "GPT-6-Luna", effort: "medium", permissions: "Read Only", plan: null, context: { left: 97, detail: "18.9K used / 258K" },
    limits: [{ label: "Monthly limit", left: 98, resets: "4:45 AM on 9 Dec" }] });
});

test("agyUsage: Antigravity's /usage limits by model group", () => {
  const N = String.fromCharCode(10);
  const u = agyUsage(["GEMINI MODELS", "  Weekly Limit Remaining", "    [█████] 72.50%", "CLAUDE AND GPT MODELS", "  Models within this group: Claude Opus, GPT-OSS",
    "  Weekly Limit Remaining", "    [██████] 100.00%", "    Quota available", "  Five Hour Limit Remaining", "    [██████] 40.00%"].join(N));
  assert.deepEqual(u, [{ group: "GEMINI MODELS", label: "Weekly Limit Remaining", pct: 72.5 },
    { group: "CLAUDE AND GPT MODELS", label: "Weekly Limit Remaining", pct: 100 }, { group: "CLAUDE AND GPT MODELS", label: "Five Hour Limit Remaining", pct: 40 }]);
  assert.deepEqual(agyUsage("nothing"), []);
});
