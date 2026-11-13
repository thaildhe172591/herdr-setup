import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, TEMPLATES, AGENT_KINDS, argvFor, leadBrief, memberBrief, parseMention, trustAnswer,
  COLUMNS, parseCard, nextCardId, newCardText, ago, callsOn, teamSlug, LAYOUTS, layoutTree, splitPlan,
  MODELS, EFFORTS, defaultSetup, recentActivity, pendingQuestion, laneName,
  PACES, pacePath, stepIndex, paceBrief, parseHandoff, STEPS, laneBrief, costSummary, LANE_CHECKS, relayText,
  handoffName, handoffNews, stopNews, reportedKeys, reportQuiet, busyScreen, housekeepingScreen, initTold, typeKeys, atPrompt, restartCommand, shellPrompt } from "../mods/team/model.js";

const step = (role, from, dir) => ({ role, from, dir });

test("splitPlan: each layout opens the teammates (role 1…n-1) where its picture shows them", () => {
  // Chữ T: lead left, DEV top right, the rest in the row under DEV, last role leftmost.
  assert.deepEqual(splitPlan(layoutTree("t", 4)), [step(1, 0, "right"), step(3, 1, "down"), step(2, 3, "right")]);
  // Ba cột: lead | DEV | the rest stacked, last role on top (Codex over Antigravity).
  assert.deepEqual(splitPlan(layoutTree("cols", 4)), [step(1, 0, "right"), step(3, 1, "right"), step(2, 3, "down")]);
  assert.deepEqual(splitPlan(layoutTree("cols", 3)), [step(1, 0, "right"), step(2, 1, "right")]);
  // Tập trung: lead wide, the whole team stacked on the right.
  assert.deepEqual(splitPlan(layoutTree("focus", 4)), [step(1, 0, "right"), step(2, 1, "down"), step(3, 2, "down")]);
  // Lưới: two columns, lead and DEV on top.
  assert.deepEqual(splitPlan(layoutTree("grid", 4)), [step(1, 0, "right"), step(2, 0, "down"), step(3, 1, "down")]);
  for (const l of LAYOUTS) for (const n of [2, 3, 4, 5])
    assert.deepEqual(splitPlan(layoutTree(l.id, n)).map((s) => s.role).sort((a, b) => a - b), Array.from({ length: n - 1 }, (_, i) => i + 1), `${l.id} × ${n}`);
});

test("teamSlug: the team folder's name, plain ASCII", () => {
  assert.equal(teamSlug("Acme.Approval"), "acme-approval");
  assert.equal(teamSlug("Đội Phê duyệt"), "doi-phe-duyet");
  assert.equal(teamSlug("…"), "team");
});

const team = {
  name: "Acme.Claims",
  folder: "D:\\Acme\\Acme.Claims",
  home: "C:\\Users\\A\\.config\\herdr-app\\teams\\acme-claims",
  lead: { role: "lead", agent: "claude", address: "t40" },
  members: [
    { role: "dev", agent: "claude", address: "t41" },
    { role: "qa", agent: "agy", address: "t42" },
    { role: "review", agent: "codex", address: "t43" },
  ],
};

test("TEMPLATES: the department is coordinator + DEV (Claude) + QA (Antigravity) + final review (Codex)", () => {
  const dept = TEMPLATES[0];
  assert.equal(dept.id, "dept");
  assert.deepEqual(dept.roles.map((r) => `${r.role}:${r.agent}`), ["lead:claude", "dev:claude", "qa:agy", "review:codex"]);
  assert.ok(TEMPLATES.some((t) => t.id === "lean" && !t.roles.some((r) => r.agent === "codex")), "a template without Codex (free quota)");
  for (const t of TEMPLATES) assert.equal(t.roles[0].role, "lead");
});

test("argvFor: coordinator Opus medium, DEV Opus xhigh, Codex and Antigravity never stop to ask", () => {
  assert.deepEqual(argvFor("lead", "claude"), ["claude", "--model", "opus", "--effort", "medium"]);
  assert.deepEqual(argvFor("dev", "claude"), ["claude", "--model", "opus", "--effort", "xhigh"]);
  assert.deepEqual(argvFor("review", "codex"), ["codex", "--no-daemon", "-s", "read-only", "-a", "never"]);
  assert.deepEqual(argvFor("dev", "codex"), ["codex", "--no-daemon", "--approve-for-me"]);
  assert.deepEqual(argvFor("qa", "agy"), ["agy", "--mode", "auto"]);
  assert.deepEqual(argvFor("docs", "claude-haiku"), ["claude", "--model", "haiku"]);
  assert.ok(Object.keys(AGENT_KINDS).includes("agy"));
});

test("argvFor: a role's own model and effort, per agent's flags", () => {
  assert.deepEqual(argvFor("qa", "claude"), ["claude", "--model", "sonnet", "--effort", "high"]); // a Claude QA by default
  assert.deepEqual(argvFor("dev", "claude", { model: "sonnet", effort: "max" }), ["claude", "--model", "sonnet", "--effort", "max"]);
  assert.deepEqual(argvFor("lead", "claude", { model: null, effort: null }), ["claude"]); // "mặc định": the CLI decides
  assert.deepEqual(argvFor("review", "codex", { model: null, effort: "xhigh" }), ["codex", "--no-daemon", "-s", "read-only", "-a", "never", "-c", "model_reasoning_effort=xhigh"]);
  assert.deepEqual(argvFor("qa", "agy", { model: "gemini-3.8-flash-low", effort: "high" }), ["agy", "--mode", "auto", "--model", "gemini-3.8-flash-low", "--effort", "high"]);
  for (const k of ["claude", "codex", "agy"]) assert.ok(EFFORTS[k].includes("high") && MODELS[k].length > 0, k);
  assert.deepEqual(defaultSetup("lead", "claude"), { model: "opus", effort: "medium" });
});

test("TEMPLATES: 'Toàn Claude' is a whole department of Claude Code, its brief has no Codex quota rule", () => {
  const all = TEMPLATES.find((t) => t.id === "claude");
  assert.ok(all && all.roles.every((r) => r.agent === "claude"));
  const b = leadBrief({ ...team, members: team.members.map((m) => ({ ...m, agent: "claude" })) });
  assert.match(b, /Review cuối/);
  assert.doesNotMatch(b, /quota/);
});

test("leadBrief: task cards in the team folder, the gated workflow, tight file control, Codex quota", () => {
  const b = leadBrief(team);
  assert.match(b, /ĐIỀU PHỐI/);
  for (const m of team.members) assert.ok(b.includes(m.address), m.address);
  assert.match(b, /hc send t43/);
  assert.match(b, /hc keys t43 enter/); // Codex on Windows keeps a pasted message in its input box
  assert.ok(b.includes(team.home), "task cards live in the team folder, not the repo");
  assert.match(b, /phiếu việc/i);
  assert.match(b, /git -C "D:\\Acme\\Acme\.Claims" status --short/); // checks the project folder after every step
  assert.match(b, /Codex/);
  assert.match(b, /quota/i);
  assert.match(b, /merge|deploy/i);
  assert.match(b, /status/); // keeps each card's front matter current for the board
  assert.match(b, /cho-duyet/);
  assert.match(b, /người dùng duyệt/);
});

const card = [
  "---",
  "id: T-12",
  "title: Webhook duyệt claim",
  "status: Đang làm",
  "owner: dev",
  "note: DEV · 3 file",
  "---",
  "# T-12 Webhook duyệt claim",
  "",
  "## Mục tiêu",
  "Gửi webhook khi claim được duyệt.",
  "",
  "## Tiêu chí xong",
  "- [x] Có test",
  "",
  "## Nhật ký",
  "- 2026-11-09 09:12 dev: sửa 3 file, thêm 4 test",
  "- 2026-11-09 09:51 review: không còn lỗi",
  "",
].join("\n");

test("COLUMNS: Chờ → Đang làm → Kiểm tra → Chờ bạn duyệt → Xong", () => {
  assert.deepEqual(COLUMNS.map((c) => c.id), ["cho", "dang-lam", "kiem-tra", "cho-duyet", "xong"]);
});

test("parseCard: front matter, the body without it or the log, and the log entries", () => {
  const c = parseCard(card, "T-12.md");
  assert.equal(c.id, "T-12");
  assert.equal(c.title, "Webhook duyệt claim");
  assert.equal(c.status, "dang-lam"); // "Đang làm" folds to the column id
  assert.equal(c.owner, "dev");
  assert.equal(c.note, "DEV · 3 file");
  assert.match(c.body, /## Mục tiêu/);
  assert.match(c.body, /- \[x\] Có test/);
  assert.doesNotMatch(c.body, /status:|Nhật ký|# T-12/);
  assert.deepEqual(c.log, [
    { day: "2026-11-09", time: "09:12", role: "dev", text: "sửa 3 file, thêm 4 test" },
    { day: "2026-11-09", time: "09:51", role: "review", text: "không còn lỗi" },
  ]);
});

test("parseCard: a card without front matter goes to Chờ, named by its heading and file", () => {
  const c = parseCard("# Sửa chữ màn OTP\n\nNội dung", "T-15.md");
  assert.equal(c.id, "T-15");
  assert.equal(c.title, "Sửa chữ màn OTP");
  assert.equal(c.status, "cho");
  for (const [s, col] of [["review", "kiem-tra"], ["test", "kiem-tra"], ["Chờ duyệt", "cho-duyet"], ["done", "xong"], ["lạ", "cho"]])
    assert.equal(parseCard(`---\nstatus: ${s}\n---\n`, "T-1.md").status, col, s);
});

test("parseCard: its done criteria, ticked of total, for the card's progress bar", () => {
  assert.deepEqual(parseCard(card, "T-12.md").checks, { done: 1, total: 1 });
  const three = "## Tiêu chí xong\n- [x] A\n- [ ] B\n* [X] C\n\n## Nhật ký\n";
  assert.deepEqual(parseCard(three, "T-2.md").checks, { done: 2, total: 3 });
  assert.deepEqual(parseCard("# không có tiêu chí", "T-3.md").checks, { done: 0, total: 0 });
});

test("parseCard: a lane's branch, worktree and conflict note", () => {
  const c = parseCard("---\nid: T-5\nbranch: fix/t5-chot\nworktree: D:\\Acme\\_wt\\hc-t5\nconflict: T-1: AGENTS.md\n---\n", "T-5.md");
  assert.equal(c.branch, "fix/t5-chot");
  assert.equal(c.worktree, "D:\\Acme\\_wt\\hc-t5");
  assert.equal(c.conflict, "T-1: AGENTS.md");
  assert.equal(parseCard("# x", "T-2.md").branch, null);
});

test("leadBrief: parallel lanes — the limit, a worktree and a DEV per lane, shared QA/Review, the conflict check", () => {
  const b = leadBrief({ ...team, lanes: 2, space: "sp1" });
  assert.match(b, /tối đa 2/);
  assert.match(b, /worktree add/);
  assert.match(b, /hc run --bg --no-notify/);
  assert.match(b, /herdr\.lane=/);
  assert.match(b, /herdr\.team=sp1/);
  assert.match(b, /claude --model opus --effort xhigh/); // the DEV role's own command
  assert.match(b, /conflict:/);
  assert.ok(b.includes("D:\\Acme\\_wt"), "worktrees beside the project");
  assert.equal(laneName(team, "T-5"), "acme-claims-dev-t5");
  assert.ok(laneName({ ...team, name: "a".repeat(40) }, "T-12").length <= 32);
});

test("memberBrief: a lane DEV knows its card and its worktree, and edits only there", () => {
  const b = memberBrief(team, { role: "dev", agent: "claude", address: "t9" }, { id: "T-5", cwd: "D:\\Acme\\_wt\\acme-claims-t5" });
  assert.match(b, /T-5/);
  assert.match(b, /chỉ sửa trong worktree/);
  assert.ok(b.includes("D:\\Acme\\_wt\\acme-claims-t5"));
});

test("pacePath: each pace sends each task size down its own steps; a missing role's steps drop out", () => {
  assert.deepEqual(pacePath("chuan", "nho", team), ["dev-high", "qa-quick", "ok"]);
  // Real tests run before an agent reviews: Review reads code that already passes.
  assert.deepEqual(pacePath("chuan", "vua", team), ["ts", "qr", "dev", "qa", "rv", "ok"]);
  assert.deepEqual(pacePath("chuan", "lon", team), ["ask", "ts", "qr", "dev", "qa", "rv", "ok"]);
  for (const p of ["nhanh", "chuan", "ky"]) for (const s of ["nho", "vua", "lon"]) {
    const path = pacePath(p, s, team);
    const review = path.findIndex((x) => x === "rv");
    if (review >= 0) assert.ok(path.findIndex((x) => x === "qa" || x === "qa-quick") < review, `${p}/${s}: tests before review`);
  }
  assert.deepEqual(pacePath("nhanh", "vua", team), ["ts", "dev", "qa", "ok"]);
  assert.ok(pacePath("ky", "lon", team).includes("rv2"));
  assert.ok(pacePath("ky", "nho", team).includes("rv"));
  const noReview = { ...team, members: team.members.filter((m) => m.role !== "review") };
  assert.ok(!pacePath("chuan", "vua", noReview).includes("rv"));
  assert.deepEqual(pacePath(undefined, undefined, team), pacePath("chuan", "vua", team)); // defaults
  assert.deepEqual(PACES.map((p) => p.id), ["nhanh", "chuan", "ky"]);
});

test("parseCard: a card's size and step; stepIndex falls back on its status", () => {
  const c = parseCard("---\nid: T-12\nstatus: dang-lam\nsize: Nhỏ\nstep: qa-quick\n---\n", "T-12.md");
  assert.equal(c.size, "nho");
  assert.equal(c.step, "qa-quick");
  assert.equal(parseCard("---\nsize: large\n---\n", "T-1.md").size, "lon");
  assert.equal(parseCard("# x", "T-2.md").size, null);
  const path = pacePath("chuan", "vua", team);
  assert.equal(stepIndex({ ...c, step: "rv" }, path), path.indexOf("rv"));
  assert.equal(stepIndex({ status: "dang-lam", step: null }, path), path.indexOf("dev"));
  assert.equal(stepIndex({ status: "cho-duyet", step: null }, path), path.indexOf("ok"));
  assert.equal(stepIndex({ status: "xong", step: null }, path), path.length);
  assert.equal(stepIndex({ status: "cho", step: null }, path), -1);
});

test("leadBrief: the pace — a size on every card, the path for each size, the current step", () => {
  const b = leadBrief({ ...team, pace: "nhanh" });
  assert.match(b, /Nhanh/);
  assert.match(b, /size: nho \| vua \| lon/);
  assert.match(b, /step:/);
  assert.match(b, /Commit\/PR/); // approval stays at every pace
  assert.match(paceBrief({ ...team, pace: "ky" }), /Kỹ/);
});

test("briefs: a fixed handoff report in a file, a stop after 2 rounds, a security check in review", () => {
  const dev = memberBrief(team, team.members[0]);
  assert.ok(dev.includes(`${team.home}\\handoff\\`), "the report goes to the team's handoff folder");
  assert.match(dev, /Kết quả: đạt \| chưa đạt \| cần quyết định/);
  assert.match(dev, /Test đã chạy:/);
  const lead = leadBrief(team);
  assert.match(lead, /handoff/);
  assert.match(lead, /2 vòng/);
  assert.match(lead, /dừng/);
  assert.match(memberBrief(team, team.members[2]), /bảo mật/); // the reviewer
});

test("parseHandoff: report sections from a handoff file, newest first; the result as a word", () => {
  const text = [
    "## T-5 · dev · 2026-11-10 09:12", "Kết quả: đạt", "Đã làm: sửa 3 file", "File đổi: a.ts, b.ts", "Test đã chạy: npm test → 48/48 pass", "Rủi ro: không", "Cần quyết định: không", "",
    "## T-5 · qa · 2026-11-10 09:40", "Kết quả: chưa đạt", "Test đã chạy: npm run check:all → 2 lỗi", "Cần quyết định: không",
  ].join("\n");
  const r = parseHandoff(text);
  assert.deepEqual(r.map((x) => [x.id, x.role, x.result]), [["T-5", "qa", "fail"], ["T-5", "dev", "pass"]]);
  assert.equal(r[1].tests, "npm test → 48/48 pass");
  assert.equal(parseHandoff("## T-6 · review · 2026-11-10 10:00\nKết quả: cần quyết định\nCần quyết định: đổi tên API?")[0].result, "decide");
  assert.deepEqual(parseHandoff("ghi chú lung tung"), []);
});

test("pacePath: a research task has its own short path; Kỹ plans and reviews the plan before coding", () => {
  assert.deepEqual(pacePath("nhanh", "vua", team, "research"), ["nc", "ok"]);
  const ky = pacePath("ky", "vua", team);
  assert.ok(ky.indexOf("plan") >= 0 && ky.indexOf("plan") < ky.indexOf("prv") && ky.indexOf("prv") < ky.indexOf("dev"), ky.join(" > "));
  assert.ok(!pacePath("chuan", "vua", team).includes("plan")); // only Kỹ plans first
  const noReview = { ...team, members: team.members.filter((m) => m.role !== "review") };
  assert.ok(!pacePath("ky", "lon", noReview).includes("prv"));
  assert.ok(STEPS.nc && STEPS.plan && STEPS.prv);
});

test("laneBrief: which waiting task takes a free lane — urgent first, then small, then by id", () => {
  const b = laneBrief({ ...team, lanes: 2 });
  assert.match(b, /priority: cao/);
  assert.match(b, /việc nhỏ trước/);
  assert.equal(parseCard("---\npriority: Cao\n---\n", "T-3.md").priority, "high");
  assert.equal(parseCard("# x", "T-4.md").priority, null);
});

test("costSummary: the team's estimated cost, in total and by role", () => {
  const s = costSummary([{ role: "lead", cost: 1.25 }, { role: "dev", cost: 3 }, { role: "dev", cost: 0.5 }, { role: "qa", cost: null }]);
  assert.equal(s.total, 4.75);
  assert.deepEqual(s.byRole, { lead: 1.25, dev: 3.5 });
  assert.deepEqual(costSummary([]), { total: 0, byRole: {} });
});

test("parseCard: owner may name several roles; owners lists them", () => {
  assert.deepEqual(parseCard("---\nowner: dev, qa, review\n---\n", "T-1.md").owners, ["dev", "qa", "review"]);
  assert.deepEqual(parseCard("---\nowner: dev/qa\n---\n", "T-1.md").owners, ["dev", "qa"]);
  assert.deepEqual(parseCard(card, "T-12.md").owners, ["dev"]);
  assert.deepEqual(parseCard("# x", "T-2.md").owners, []);
});

test("recentActivity: the team's latest log entries across cards, newest first", () => {
  const a = parseCard(card, "T-12.md");
  const b = parseCard("---\nid: T-10\n---\n## Nhật ký\n- 2026-11-09 09:40 qa: build ok\n- 2026-11-08 17:00 dev: bắt đầu\n", "T-10.md");
  const r = recentActivity([a, b], 3);
  assert.deepEqual(r.map((e) => `${e.id} ${e.time} ${e.role}`), ["T-12 09:51 review", "T-10 09:40 qa", "T-12 09:12 dev"]);
  assert.equal(recentActivity([a, b], 10).length, 4);
});

test("pendingQuestion: the question an agent waits on, from its screen (a wrapped paragraph ending in ?)", () => {
  const screen = [
    "  +e-T-1.txt, chờ người dùng duyệt trước khi giao",
    "───────────────────────────────────────────",
    "← ☐ Duyệt T-1  ☐ File sửa dở  ✔ Submit →",
    "",
    "Phiếu T-1 đã viết đủ: việc chỉ đọc repo; DEV soạn kiến trúc và bản đồ code, QA",
    "soạn cổng chất lượng. Người dùng duyệt cho giao việc chứ?",
    "",
    "❯ 1. Duyệt, giao luôn",
    "     Giao song song cho t4t, t4w, t4v theo đúng phiếu",
    "  2. QA không chạy lệnh",
    "  3. Sửa phiếu trước",
    "  4. Type something.",
    "Enter to select · Tab/Arrow keys to navigate · Esc to cancel",
  ].join("\n");
  assert.equal(pendingQuestion(screen), "Phiếu T-1 đã viết đủ: việc chỉ đọc repo; DEV soạn kiến trúc và bản đồ code, QA soạn cổng chất lượng. Người dùng duyệt cho giao việc chứ?");
  assert.equal(pendingQuestion("› Ask Codex to do anything\n? for shortcuts"), null);
  assert.equal(pendingQuestion("Do you want to make this edit to auth.ts?\n❯ 1. Yes\n  2. No"), "Do you want to make this edit to auth.ts?");
  assert.ok(pendingQuestion(`${"chữ ".repeat(100)}?`).length <= 240);
});

test("nextCardId: one past the highest T-number, T-1 when there are none", () => {
  assert.equal(nextCardId([]), "T-1");
  assert.equal(nextCardId([{ id: "T-3" }, { id: "T-12" }, { id: "khac" }]), "T-13");
});

test("newCardText: a card the board reads back in Chờ, owned by the coordinator", () => {
  const c = parseCard(newCardText({ id: "T-16", title: "Lọc claim theo ngày" }), "T-16.md");
  assert.equal(c.id, "T-16");
  assert.equal(c.title, "Lọc claim theo ngày");
  assert.equal(c.status, "cho");
  assert.equal(c.owner, "lead");
});

test("ago: how long since a time, in short Vietnamese", () => {
  const now = Date.parse("2026-11-09T10:00:00");
  assert.equal(ago(now - 20e3, now), "vừa xong");
  assert.equal(ago(now - 5 * 60e3, now), "5 phút");
  assert.equal(ago(now - 2 * 3600e3, now), "2 giờ");
  assert.equal(ago(now - 3 * 86400e3, now), "3 ngày");
});

test("callsOn: how many log entries a role made on a day, across cards", () => {
  const cards = [parseCard(card, "T-12.md"), parseCard(card.replace("09:51", "10:30"), "T-13.md")];
  assert.equal(callsOn(cards, "review", "2026-11-09"), 2);
  assert.equal(callsOn(cards, "review", "2026-11-10"), 0);
});

test("memberBrief: role rules, the coordinator, forbidden git/delete actions, answer 'Sẵn sàng'", () => {
  const qa = memberBrief(team, team.members[1]);
  assert.match(qa, /QA/);
  assert.match(qa, /t40/);
  assert.match(qa, /Sẵn sàng/);
  assert.match(qa, /commit|push/);
  const rv = memberBrief(team, team.members[2]);
  assert.match(rv, /Không sửa file/);
  assert.match(rv, /ngắn|tối đa/);
});

test("parseMention: @role, its label or alias routes to that teammate", () => {
  assert.deepEqual(parseMention("@review xem diff giúp", team), { role: "review", address: "t43", rest: "xem diff giúp" });
  assert.equal(parseMention("@dieu-phoi chia việc", team)?.address, "t40");
  assert.equal(parseMention("@qa chạy test", team)?.address, "t42");
  assert.equal(parseMention("@nobody hi", team), null);
  assert.equal(parseMention("@review hi", null), null);
});

test("trustAnswer: the key that says yes to a 'trust this folder?' prompt, or null", () => {
  const codex = ["Trust this folder? Codex can read, edit, and run files", "here, subject to your permission settings.", "› 1. Yes, continue", "  2. No, quit"].join("\n");
  assert.equal(trustAnswer(codex), "enter"); // the cursor already sits on yes: Enter, not "1"
  // Codex 0.167's prompt: "1" does nothing there, Enter picks the highlighted option.
  const codexNew = ["Folder access", "Note: You're in a subdirectory of a Git project. Trusting will apply", "to the repository root:",
    "Trust this folder? Codex can read, edit, and run files here, subject", "to your permission settings. Your trust decision will be saved.",
    "› 1. Trust and continue", "  2. Back to Agent Command Center"].join("\n");
  assert.equal(trustAnswer(codexNew), "enter");
  assert.equal(trustAnswer(["Trust this folder?", "  1. Yes, continue", "  2. No, quit"].join("\n")), "1"); // no cursor drawn: the number
  // Codex's hook review is not a folder-trust question: hooks run outside the sandbox, the person decides.
  const hooks = ["Hooks need review", "1 hook is new or changed.", "Hooks can run outside the sandbox", "after you trust them.",
    "› 1. Review hooks", "  2. Trust all and continue", "  3. Continue without trusting (hooks", "     won't run)", "enter confirm · esc skip"].join("\n");
  assert.equal(trustAnswer(hooks), null);
  const agy = ["Accessing workspace:", "D:\\Acme\\App", "Do you trust the contents of this project?", "❯ Yes, I trust this folder", "  No, exit"].join("\n");
  assert.equal(trustAnswer(agy), "enter");
  const noSel = ["Do you trust the contents of this project?", "  No, exit", "❯ Yes"].join("\n");
  assert.equal(trustAnswer(noSel), "enter");
  assert.equal(trustAnswer("Do you trust the contents of this project?\n❯ No, exit\n  Yes"), null); // the cursor is on No
  assert.equal(trustAnswer("› Try \"edit <file>\""), null);
});

test("laneBrief: by default each extra lane gets its own QA (the QA role's command); Review stays shared", () => {
  const b = laneBrief({ ...team, lanes: 3 });
  assert.match(b, /herdr\.role=qa/);
  assert.match(b, /--name acme-claims-qa-/);
  assert.match(b, /agy --mode auto/); // the QA role's own command
  assert.doesNotMatch(b, /herdr\.role=review/);
  assert.match(b, /Review dùng chung/);
  assert.match(b, /cổng|port/i); // parallel test runs must not collide
  assert.equal(laneName(team, "T-9", "qa"), "acme-claims-qa-t9");
  assert.equal(laneName(team, "T-9", "review"), "acme-claims-rv-t9");
});

test("laneBrief: QA + Review per lane, shared, or the lane DEV running the tests itself", () => {
  const both = laneBrief({ ...team, lanes: 3, laneCheck: "qa-review" });
  assert.match(both, /herdr\.role=qa/);
  assert.match(both, /herdr\.role=review/);
  assert.match(both, /codex --no-daemon -s read-only/); // the Review role's own command
  const shared = laneBrief({ ...team, lanes: 3, laneCheck: "shared" });
  assert.doesNotMatch(shared, /herdr\.role=(qa|review)/);
  assert.match(shared, /QA và Review dùng chung/);
  const self = laneBrief({ ...team, lanes: 3, laneCheck: "self" });
  assert.doesNotMatch(self, /herdr\.role=(qa|review)/);
  assert.match(self, /DEV làn tự/);
  assert.deepEqual(LANE_CHECKS.map((x) => x.id), ["shared", "qa", "qa-review", "self"]);
});

test("laneBrief: a team without a QA (or Review) opens no lane QA (or Review) for it", () => {
  const noQa = { ...team, members: team.members.filter((m) => m.role !== "qa") };
  assert.doesNotMatch(laneBrief({ ...noQa, lanes: 3 }), /herdr\.role=qa/);
  const noRv = { ...team, members: team.members.filter((m) => m.role !== "review") };
  assert.doesNotMatch(laneBrief({ ...noRv, lanes: 3, laneCheck: "qa-review" }), /herdr\.role=review/);
});

test("laneBrief: a lane QA opens only while the main QA is busy (no idle sessions)", () => {
  const b = laneBrief({ ...team, lanes: 3 });
  assert.match(b, /QA chính rảnh thì giao QA chính/);
  assert.match(b, /QA chính đang bận/);
});

test("paceBrief: at Nhanh and Chuẩn the repro test and the coding run side by side; Kỹ keeps them in order", () => {
  for (const pace of ["nhanh", "chuan"]) assert.match(paceBrief({ ...team, pace }), /QA viết test tái hiện song song với DEV/);
  assert.doesNotMatch(paceBrief({ ...team, pace: "ky" }), /song song với DEV/);
});

test("leadBrief: the coordinator ends its turn after assigning; the board tells it when a handoff lands", () => {
  const b = leadBrief({ ...team, lanes: 2 });
  assert.match(b, /Bảng việc nhắn bạn/);
  assert.match(b, /kết thúc lượt/);
});

test("relayText: new handoff reports and silent stops in one message to the coordinator", () => {
  const text = relayText([
    { kind: "report", id: "T-9", role: "qa", result: "pass", file: "H\handoff\T-9-qa.md" },
    { kind: "report", id: "T-8", role: "dev", result: "fail", file: "H\handoff\T-8-dev.md" },
    { kind: "stop", role: "dev", lane: "T-7", address: "t5x" },
  ]);
  assert.match(text, /^Bảng việc:/);
  assert.match(text, /T-9 · qa · đạt/);
  assert.match(text, /T-8 · dev · chưa đạt/);
  assert.match(text, /hc read t5x --lines 60/);
  assert.equal(relayText([]), null);
});

test("pacePath: medium and large tasks start with a scout (after người dùng approves the card), small ones don't", () => {
  for (const p of ["nhanh", "chuan", "ky"]) {
    assert.ok(!pacePath(p, "nho", team).includes("ts"), `${p}/nho: no scout`);
    for (const s of ["vua", "lon"]) {
      const path = pacePath(p, s, team);
      assert.ok(path.includes("ts"), `${p}/${s}: scout`);
      const first = Math.min(...["qr", "plan", "dev"].map((k) => path.indexOf(k)).filter((i) => i >= 0));
      assert.ok(path.indexOf("ts") < first, `${p}/${s}: scout before anyone works`);
      if (path.includes("ask")) assert.ok(path.indexOf("ask") < path.indexOf("ts"), `${p}/${s}: card approved first`);
    }
  }
  assert.deepEqual(pacePath("ky", "vua", team), ["ask", "ts", "qr", "plan", "prv", "dev", "qa", "rv", "ok"]);
  assert.deepEqual(pacePath("chuan", "vua", team, "research"), ["nc", "ok"]); // research has no scout
  assert.ok(STEPS.ts && ROLES.scout);
  assert.equal(laneName(team, "T-9", "scout"), "acme-claims-ts-t9");
});

test("paceBrief: how to open a scout (read-only Sonnet in the project), where it writes, and to close it", () => {
  const b = paceBrief({ ...team, key: "sp1", pace: "chuan" });
  assert.match(b, /herdr\.role=scout/);
  assert.match(b, /--name acme-claims-ts-/);
  assert.match(b, /claude --model sonnet --effort medium/);
  assert.ok(b.includes(`${team.home}\\context\\<mã>.md`));
  assert.match(b, /hc kill/);
  assert.match(b, /đọc .*context/);
});

test("memberBrief: a scout starts on its card at once, reads only, writes the context file", () => {
  const b = memberBrief(team, { role: "scout", agent: "claude", address: "t60" }, { id: "T-9", cwd: team.folder });
  assert.match(b, /TRINH SÁT/);
  assert.match(b, /Bắt đầu ngay/);
  assert.ok(b.includes(`${team.home}\\context\\T-9.md`));
  assert.doesNotMatch(b, /chỉ sửa trong worktree/);
  assert.doesNotMatch(b, /chỉ trả lời "Sẵn sàng"/);
});

// A real report from a team briefed before the fixed format (Acme.Shop, T-8-qa.md).
const FREEFORM = `# T-8 — Bàn giao QA (t4w)

## 2026-11-10 — QA sau khi DEV sửa tài liệu cho khớp ci.yml

Worktree \`D:/Acme/_wt/acme-shop-t8\`, chưa commit.

**Kết quả:** ĐẠT. Lint, type-check, \`check:all\` giữ nguyên mốc.

**Test đã chạy:** (tất cả với \`CI=true\`)
`;

test("handoffName: the card and the role from a handoff file's name", () => {
  assert.deepEqual(handoffName("T-8-qa.md"), { id: "T-8", role: "qa" });
  assert.deepEqual(handoffName("T-12-dev-b.md"), { id: "T-12", role: "dev-b" });
  assert.deepEqual(handoffName("D:\\x\\handoff\\T-3-scout.md"), { id: "T-3", role: "scout" });
  assert.equal(handoffName("ghi-chu.md"), null);
});

test("parseHandoff: a free-form report still yields an entry (card and role from the file name) and its result", () => {
  const r = parseHandoff(FREEFORM, { id: "T-8", role: "qa" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "T-8");
  assert.equal(r[0].role, "qa");
  assert.equal(r[0].result, "pass");
  assert.match(r[0].tests, /CI=true/);
  assert.deepEqual(parseHandoff(FREEFORM), []); // without the file name: as before
  assert.equal(parseHandoff("**Kết quả:** chưa đạt, 2 test đỏ", { id: "T-1", role: "dev" })[0].result, "fail");
});

test("handoffNews: a handoff file that is new or grew since the coordinator was told is news", () => {
  const files = [
    { file: "H\\T-8-dev.md", size: 900, id: "T-8", role: "dev", result: null },
    { file: "H\\T-8-qa.md", size: 1200, id: "T-8", role: "qa", result: "pass" },
    { file: "H\\T-9-dev.md", size: 300, id: "T-9", role: "dev", result: "fail" },
  ];
  const news = handoffNews(files, { "H\\T-8-dev.md": 900, "H\\T-9-dev.md": 100 });
  assert.deepEqual(news.map((x) => [x.kind, x.id, x.role, x.result, x.size]), [["report", "T-8", "qa", "pass", 1200], ["report", "T-9", "dev", "fail", 300]]);
  assert.deepEqual(handoffNews(files, Object.fromEntries(files.map((f) => [f.file, f.size]))), []);
});

test("stopNews: an idle teammate whose turn count passed the last one told is news, unless just briefed or reported", () => {
  const now = 1_000_000;
  const agents = [
    { address: "t1", role: "qa", lane: null, status: "idle", turn: 15 },
    { address: "t2", role: "dev", lane: null, status: "working", turn: 20 },
    { address: "t3", role: "review", lane: null, status: "done", turn: 11 },
    { address: "t4", role: "dev", lane: "T-7", status: "idle", turn: 3, briefAt: now - 30_000 },
    { address: "t5", role: "dev", lane: null, status: "idle", turn: 9 },
  ];
  const told = { t1: 14, t2: 18, t3: 11, t4: 1, t5: 8 };
  const news = stopNews(agents, told, now, [{ role: "dev", id: "T-1" }]);
  assert.deepEqual(news.map((x) => x.address), ["t1"]); // t2 works, t3 told, t4 just briefed, t5 reported
  assert.equal(news[0].turn, 15);
});

test("stopNews: a short idle (Antigravity between tool calls) is no stop; nor the end of a turn just reported", () => {
  const now = 10_000_000;
  const a = (address, role, idleAt, lane = null) => ({ address, role, lane, status: "done", turn: 9, idleAt });
  const crew = [
    a("t1", "qa", now - 20_000),            // idle 20 s: a pause, not a stop
    a("t2", "qa", now - 90_000),            // idle 90 s, no recent report: a stop
    a("t3", "dev", now - 90_000),           // its report went out 3 min ago: same job
    a("t4", "dev", now - 90_000, "T-7"),    // lane agent, report on another card: a stop
    a("t5", "review", now - 90_000),        // report 11 min ago: quiet window over, a stop
  ];
  const told = { t1: 1, t2: 1, t3: 1, t4: 1, t5: 1 };
  const recent = {
    ...Object.fromEntries(reportedKeys({ role: "dev", id: "T-11" }).map((k) => [k, now - 180_000])),
    ...Object.fromEntries(reportedKeys({ role: "review", id: "T-11" }).map((k) => [k, now - 11 * 60_000])),
  };
  assert.deepEqual(stopNews(crew, told, now, [], recent).map((x) => x.address), ["t2", "t4", "t5"]);
});

test("leadBrief: a second, independent wake-up — a background hc wait per assignment", () => {
  const b = leadBrief({ ...team, lanes: 2 });
  assert.match(b, /hc wait <địa chỉ> --timeout 3600/);
  assert.match(b, /chạy nền|run_in_background/);
  assert.match(b, /không xử lý (hai lần|trùng)/);
});

test("initTold: a team's first relay counts as told what is older than the window (recent reports still go out)", () => {
  const now = 10_000_000;
  const files = [{ file: "a", size: 10, mtime: now - 3_600_000 }, { file: "b", size: 20, mtime: now - 60_000 }];
  const t = initTold(files, [{ address: "t1", turn: 15 }, { address: "t2" }], now, 20 * 60_000);
  assert.deepEqual(t, { files: { a: 10 }, turns: { t1: 15 } });
});

test("typeKeys: a command as hc keys (ctrl+c first; '_', ':', '&' have no key → null, then paste)", () => {
  assert.deepEqual(typeKeys("agy --mode auto"), ["ctrl+c", "a", "g", "y", "space", "-", "-", "m", "o", "d", "e", "space", "a", "u", "t", "o", "enter"]);
  assert.ok(typeKeys("codex --no-daemon -s read-only -a never -m gpt-5.5"));
  assert.ok(typeKeys("x=1"));
  assert.equal(typeKeys("codex -c model_reasoning_effort=high"), null);
  assert.equal(typeKeys("cd D:/x && y"), null);
});

test("atPrompt: only a terminal whose shell itself is in front is a stopped member", () => {
  assert.ok(atPrompt({ foreground: { name: "bash.exe" } }));
  assert.ok(atPrompt({ foreground: { name: "pwsh.exe" } }));
  assert.ok(!atPrompt({ foreground: { name: "codex.exe" } }));
  assert.ok(!atPrompt({ foreground: { name: "node.exe" } }));
  assert.ok(!atPrompt(null));
});

test("shellPrompt: a shell's prompt on the last line (herdr-core reports bash.exe in front even while an agent runs in it)", () => {
  const N = String.fromCharCode(10);
  assert.ok(shellPrompt(["Admin@PC MINGW64 /d/Acme (main)", "$ ", ""].join(N)));
  assert.ok(shellPrompt("PS D:\\Acme> "));
  assert.ok(shellPrompt("C:\\Users\\dev>"));
  assert.ok(!shellPrompt(["  Sẵn sàng", ">", "? for shortcuts          Gemini 3.8 Flash · medium"].join(N))); // Antigravity
  assert.ok(!shellPrompt(["› Ask Codex", "  GPT-6-Luna default · D:/Acme", "  ← for agents · ? for shortcuts"].join(N))); // Codex
  assert.ok(!shellPrompt(["❯ ", "  Opus 5.5 medium · ctx 63%", "  ⏵⏵ auto mode on"].join(N))); // Claude
  assert.ok(!shellPrompt(""));
  assert.ok(shellPrompt(["╭─ bash App  main ?13 ~248   0ms", "╰─"].join(N))); // oh-my-posh atomic
  assert.ok(!shellPrompt(["│ > ", "╰──────────────────────────────╯"].join(N))); // a Claude input box's bottom
});

test("restartCommand: a stopped member starts again with its role's command, model and effort", () => {
  assert.equal(restartCommand({ role: "review", agent: "codex" }), "codex --no-daemon -s read-only -a never");
  assert.equal(restartCommand({ role: "qa", agent: "agy" }), "agy --mode auto");
  assert.equal(restartCommand({ role: "lead", agent: "claude", model: "opus", effort: "medium" }), "claude --model opus --effort medium");
  assert.equal(restartCommand({ role: "dev", agent: "claude" }), "claude --model opus --effort xhigh"); // role default
});

test("busyScreen: a running command or spinner is work even when herdr reads done; a bare prompt is not", () => {
  const ag = "  Đang chạy IntegrationTests trên worktree vá 42eef024...\n\n────\n>\n────\n  ● [11:59:13] dotnet test \"D:\Work ... running\n────\n? for shortcuts   auto · Gemini 3.8 Flash · high";
  const spin = "● Ran (dotnet build ...)\n  Đang biên dịch...\n⣟  Generating...\n────\n>\n────\nesc to cancel     auto · Gemini";
  const cc = "✶ Drizzling… (thinking with xhigh effort)\n────\n❯\n────\n  Opus · esc to interrupt";
  const idle = "  Xong T-11: đạt, báo cáo ở C:/x/T-11-qa.md\n\n────\n>\n────\n? for shortcuts   auto · Gemini 3.8 Flash · high";
  assert.equal(busyScreen(ag), true);
  assert.equal(busyScreen(spin), true);
  assert.equal(busyScreen(cc), true);
  assert.equal(busyScreen(idle), false);
  assert.equal(busyScreen(null), false);
});

test("reportQuiet: a stop right after its report is the same job (absorbed); one past the window is not", () => {
  const now = 50_000_000;
  const recent = Object.fromEntries(reportedKeys({ role: "qa", id: "T-11" }).map((k) => [k, now - 60_000]));
  assert.equal(reportQuiet({ role: "qa", lane: null }, recent, now), true);
  assert.equal(reportQuiet({ role: "qa", lane: "T-11" }, recent, now), true);
  assert.equal(reportQuiet({ role: "qa", lane: "T-12" }, recent, now), false);
  assert.equal(reportQuiet({ role: "dev", lane: null }, recent, now), false);
  assert.equal(reportQuiet({ role: "qa", lane: null }, recent, now + 10 * 60_000), false);
});

test("housekeepingScreen: a turn spent compacting while idle is housekeeping, a finished task is not", () => {
  const compact = "  ⎿  Skills restored (claude-in-chrome)\n\n● Compacted while idle, before the\n  prompt cache expired · turn off with\n  \"idleCompaction\": false in\n  settings.json\n────\n❯\n────\n  Opus 5.5 xhigh · ctx 0%";
  const done = "● Xong T-11: đạt, báo cáo ở C:/x/T-11-dev.md\n────\n❯\n────\n  Opus 5.5 xhigh";
  assert.equal(housekeepingScreen(compact), true);
  assert.equal(housekeepingScreen(done), false);
  const recap = ["✻ Worked for 9m · done 11:31 AM", "", "※ recap: Mục tiêu là sửa bug NOID-f6d8729a", "  (gán trưởng thôn)", "────", "❯", "────", "  Opus 5.5"].join("\n");
  assert.equal(housekeepingScreen(recap), true);
});
