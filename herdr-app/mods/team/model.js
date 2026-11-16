// Pure logic of a "phòng ban" (department): a coordinator (Claude) talks with the user and runs the team;
// DEV (Claude), QA (Antigravity) and a final reviewer (Codex) work in one tab, coordinated through
// herdr-core by terminal address (hc send / wait / read). No herdr/gpui imports; node --test.

import { L } from "./i18n.js";

// How each kind of agent starts. No first prompt on the command line (herdr-core runs programs
// through cmd /c, which breaks long text); the brief is pasted with hc send once it is idle.
export const AGENT_KINDS = {
  claude: { name: "Claude Code", argv: ["claude"] },
  "claude-haiku": { name: "Claude Haiku", argv: ["claude", "--model", "haiku"] },
  codex: { name: "Codex", argv: ["codex", "--no-daemon"] },
  agy: { name: "Antigravity", argv: ["agy"] },
};

export const ROLES = {
  lead: { get label() { return L("Điều phối", "Coordinator"); }, vi: "Điều phối", word: "ĐIỀU PHỐI", mention: ["lead", "dieu-phoi", "dieuphoi", "truong-nhom", "coord"] },
  dev: { label: "DEV", word: "DEV", mention: ["dev", "code"],
    rules: "Viết code cho việc trong phiếu việc, đúng phạm vi; viết test trước khi sửa khi làm được. Báo danh sách file đã sửa và tóm tắt diff." },
  "dev-b": { get label() { return L("DEV (hướng 2)", "DEV (option 2)"); }, vi: "DEV (hướng 2)", word: "DEV HƯỚNG 2", mention: ["dev-b", "dev2"],
    rules: "Làm cùng việc với DEV theo một cách khác để so sánh; ghi rõ khác biệt và đánh đổi. Báo danh sách file đã sửa." },
  qa: { label: "QA", word: "QA", mention: ["qa", "test", "tester"],
    rules: "Trước khi DEV làm: dò file và chỗ bị ảnh hưởng, viết test tái hiện lỗi (chỉ sửa file test). Sau khi DEV làm: build, chạy toàn bộ test/lint, rà sơ bộ diff (lỗi rõ, thiếu test). Báo pass/fail kèm lỗi rút gọn và file đã sửa." },
  review: { label: "Review", word: "REVIEW", mention: ["review", "reviewer"],
    rules: "Không sửa file nào. Chỉ đọc diff và các file được nêu, đối chiếu với tiêu chí xong của phiếu việc. Luôn soát cả bảo mật: lộ secrets/khoá/mật khẩu, injection (SQL, lệnh, đường dẫn), phân quyền và xác thực, kiểm tra input ở biên. Trả lời ngắn: tối đa 10 vấn đề, xếp theo mức độ, kèm file:dòng; không có gì thì nói rõ." },
  docs: { label: "Docs", word: "DOCS", mention: ["docs"],
    rules: "Chỉ sửa tài liệu (README, CHANGELOG, docs/) theo thay đổi vừa làm, ngắn gọn." },
  research: { get label() { return L("Nghiên cứu", "Research"); }, vi: "Nghiên cứu", word: "NGHIÊN CỨU", mention: ["research"],
    rules: "Không sửa file. Tìm hiểu code và tài liệu, trả lời có dẫn nguồn (file:dòng, link)." },
  // Information Retriever: a short-lived sub-agent per medium/large card, never a standing member.
  scout: { get label() { return L("Trinh sát", "Scout"); }, vi: "Trinh sát", word: "TRINH SÁT", mention: ["scout", "trinh-sat"],
    rules: "Chỉ đọc repo, không sửa file nào trong repo. Gom bối cảnh để DEV và QA bắt tay vào làm ngay: file và dòng liên quan (file:dòng, vì sao liên quan), mẫu code có sẵn nên làm theo, hàm/API/cấu hình sẽ dùng, test hiện có và lệnh chạy, bẫy và rủi ro. Ngắn gọn (tối đa khoảng 80 dòng), chỉ ghi điều kiểm được trong repo; không viết lời giải chi tiết." },
};

export const TEMPLATES = [
  { id: "dept", get label() { return L("Chuẩn", "Standard"); }, get desc() { return L("Đủ quy trình: QA (Antigravity) test, Codex rà diff cuối mỗi việc một lần", "Full process: QA (Antigravity) tests, Codex reviews the final diff once per task"); },
    roles: [{ role: "lead", agent: "claude" }, { role: "dev", agent: "claude" }, { role: "qa", agent: "agy" }, { role: "review", agent: "codex" }] },
  { id: "claude", get label() { return L("Toàn Claude", "All Claude"); }, get desc() { return L("Cả đội là Claude Code: không tốn quota Codex, Antigravity", "The whole team is Claude Code: no Codex or Antigravity quota used"); },
    roles: [{ role: "lead", agent: "claude" }, { role: "dev", agent: "claude" }, { role: "qa", agent: "claude" }, { role: "review", agent: "claude" }] },
  { id: "lean", get label() { return L("Tiết kiệm", "Lean"); }, get desc() { return L("Không dùng Codex: QA (Antigravity) rà luôn diff", "No Codex: QA (Antigravity) reviews the diff too"); },
    roles: [{ role: "lead", agent: "claude" }, { role: "dev", agent: "claude" }, { role: "qa", agent: "agy" }] },
  { id: "duo", get label() { return L("Hai hướng", "Two options"); }, get desc() { return L("Claude và Antigravity cùng làm một việc để so sánh", "Claude and Antigravity do the same task to compare"); },
    roles: [{ role: "lead", agent: "claude" }, { role: "dev", agent: "claude" }, { role: "dev-b", agent: "agy" }, { role: "review", agent: "codex" }] },
  { id: "research", get label() { return L("Nghiên cứu", "Research"); }, get desc() { return L("Tìm hiểu, không sửa file", "Investigate, no file edits"); },
    roles: [{ role: "lead", agent: "claude" }, { role: "research", agent: "agy" }, { role: "review", agent: "claude" }] },
];

// What each agent can run. A null model or effort is "mặc định": the CLI's own (Codex: the account's).
// ponytail: Antigravity's list is what `agy models` printed on 2026-11-09; the dialog asks agy again.
export const MODELS = {
  claude: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }, { id: "fable", label: "Fable" }, { id: "haiku", label: "Haiku" }, { id: null, get label() { return L("Mặc định", "Default"); } }],
  codex: [{ id: null, get label() { return L("Theo tài khoản", "By account"); } }],
  agy: [{ id: null, get label() { return L("Mặc định", "Default"); } }, { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" }, { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
    { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" }, { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }, { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6" },
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B" }],
};
export const EFFORTS = { claude: ["low", "medium", "high", "xhigh", "max"], codex: ["low", "medium", "high", "xhigh"], agy: ["low", "medium", "high", "xhigh", "max"] };

// A role's model and effort before anyone changes them. Coordinator: Opus medium (it talks and
// plans); DEV: Opus xhigh; a Claude reviewer Opus high, a Claude QA Sonnet high.
export function defaultSetup(role, agent) {
  if (agent === "claude-haiku") return { model: "haiku", effort: null };
  if (agent !== "claude") return { model: null, effort: null };
  const by = { lead: ["opus", "medium"], dev: ["opus", "xhigh"], "dev-b": ["opus", "xhigh"], review: ["opus", "high"], qa: ["sonnet", "high"], research: ["sonnet", "medium"], docs: ["haiku", "low"] };
  const [model, effort] = by[role] ?? [null, null];
  return { model, effort };
}

// The command for a role. Codex and Antigravity never stop to ask (the user talks only with the
// coordinator): a Codex reviewer is sandboxed read-only, other Codex roles auto-approve;
// Antigravity runs in auto mode.
export function argvFor(role, agent, { model, effort } = defaultSetup(role, agent)) {
  const pick = (flag, v) => v ? [flag, v] : [];
  if (agent === "claude" || agent === "claude-haiku") return ["claude", ...pick("--model", model), ...pick("--effort", effort)];
  if (agent === "codex") return [...(role === "review" || role === "research"
    ? ["codex", "--no-daemon", "-s", "read-only", "-a", "never"] : ["codex", "--no-daemon", "--approve-for-me"]),
    ...pick("-m", model), ...(effort ? ["-c", `model_reasoning_effort=${effort}`] : [])];
  if (agent === "agy") return ["agy", "--mode", "auto", ...pick("--model", model), ...pick("--effort", effort)];
  return [...(AGENT_KINDS[agent]?.argv ?? ["claude"])];
}

// How the team's panes sit in its tab. A tree: a role index (0 = lead) or {dir: "row"|"col", kids}.
// Herdr only splits a pane in half (right or down), so a row of three is 1/2 · 1/4 · 1/4.
export const LAYOUTS = [
  { id: "t", get label() { return L("Chữ T", "T shape"); }, get desc() { return L("Điều phối trái, DEV trên, cả đội hàng dưới", "Coordinator left, DEV on top, the rest in a bottom row"); } },
  { id: "cols", get label() { return L("Ba cột", "Three columns"); }, get desc() { return L("Điều phối · DEV · cả đội xếp dọc", "Coordinator · DEV · the rest stacked"); } },
  { id: "focus", get label() { return L("Tập trung", "Focus"); }, get desc() { return L("Điều phối rộng, cả đội cột phải", "Wide coordinator, the rest in the right column"); } },
  { id: "grid", get label() { return L("Lưới", "Grid"); }, get desc() { return L("Hai cột: Điều phối và DEV ở trên", "Two columns: Coordinator and DEV on top"); } },
];
const node = (dir, kids) => kids.length === 1 ? kids[0] : { dir, kids };

export function layoutTree(id, n) {
  if (n < 3) return n === 2 ? node("row", [0, 1]) : 0;
  const rest = Array.from({ length: n - 2 }, (_, i) => i + 2); // roles 2…n-1, last role first below
  if (id === "cols") return node("row", [0, 1, node("col", [...rest].reverse())]);
  if (id === "focus") return node("row", [0, node("col", [1, ...rest])]);
  if (id === "grid") { const all = [...Array(n).keys()]; return node("row", [node("col", all.filter((i) => i % 2 === 0)), node("col", all.filter((i) => i % 2 === 1))]); }
  return node("row", [0, node("col", [1, node("row", [...rest].reverse())])]);
}

// The splits that build a tree, from the lead's pane: each sibling splits off the one before it
// (right in a row, down in a column) before any of them is split inside.
export function splitPlan(tree) {
  const first = (x) => typeof x === "number" ? x : first(x.kids[0]);
  const steps = [];
  const build = (x) => {
    if (typeof x === "number") return;
    x.kids.slice(1).forEach((k, j) => steps.push({ role: first(k), from: first(x.kids[j]), dir: x.dir === "row" ? "right" : "down" }));
    x.kids.forEach(build);
  };
  build(tree);
  return steps;
}

// Briefs stay Vietnamese: a role's Vietnamese name, whatever the UI language.
const viName = (role) => ROLES[role]?.vi ?? ROLES[role]?.label ?? role;
const who = (m) => `${viName(m.role)} (${AGENT_KINDS[m.agent]?.name ?? m.agent}) = ${m.address}`;
const hasRole = (team, role) => team.members.some((m) => m.role === role);

export function leadBrief(team) {
  const codex = team.members.find((m) => m.agent === "codex");
  return [
    `Bạn là ĐIỀU PHỐI phòng ban "${team.name}" trong Herdr (dự án ${team.folder}). Người dùng chỉ trò chuyện với bạn: bạn làm rõ yêu cầu, viết phiếu việc, chia việc, kiểm soát đồng đội và báo lại người dùng. Bạn không tự sửa code dự án.`,
    `Đồng đội (địa chỉ terminal herdr-core): ${team.members.map(who).join("; ")}.`,
    `Giao việc: ${team.members.map((m) => `${viName(m.role)}: \`hc send ${m.address} "<việc + đường dẫn phiếu việc>"\``).join("; ")}. Giao xong thì kết thúc lượt, đừng ngồi \`hc wait\` một người trong khi việc khác đang chạy. Có hai tín hiệu độc lập gọi bạn dậy: (a) ngay sau mỗi lần giao, chạy nền (Bash run_in_background) \`hc wait <địa chỉ> --timeout 3600\` cho người vừa được giao, Claude Code sẽ gọi bạn khi lệnh xong; (b) Bảng việc nhắn bạn ("Bảng việc: …") khi có báo cáo bàn giao mới hoặc một đồng đội dừng mà không ghi báo cáo. Tín hiệu nào tới trước thì xử lý; khi tín hiệu kia tới sau cho cùng việc, chỉ kiểm lại, không xử lý hai lần. Mỗi lần được gọi, xem cả thư mục handoff (có thể có báo cáo khác mới). Khi đó đọc báo cáo trong ${team.home}\\handoff\\<mã>-<vai>.md (mục mới nhất ở cuối) thay vì đọc cả màn hình; chỉ \`hc read <địa chỉ> --lines 60\` khi họ không ghi báo cáo. Cập nhật note của phiếu từ dòng "Kết quả" và "Test đã chạy", rồi giao ngay bước tiếp của mọi việc đang chờ. \`hc wait\` chỉ dùng cho chờ ngắn (agent làn mới trả lời "Sẵn sàng").`,
    `Phiếu việc: mỗi việc một file ${team.home}\\tasks\\<mã>.md (mã T-1, T-2…; người dùng cũng tạo phiếu từ Bảng việc và nhắn bạn). Đầu file là front matter giữa hai dòng ---: id, title, status (cho | dang-lam | kiem-tra | cho-duyet | xong), owner (vai đang giữ việc: lead, dev, qa, review…), note (một dòng kết quả mới nhất); sau đó các mục ## Mục tiêu, ## Phạm vi (file được sửa), ## Tiêu chí xong (- [ ] …), ## Rủi ro, ## Nhật ký. Mỗi lần chuyển bước: sửa status/owner/note và thêm một dòng nhật ký "- YYYY-MM-DD HH:MM <vai>: <việc>". Bảng việc của người dùng đọc các file này. Ghi quyết định chung vào ${team.home}\\NOTES.md. Không đặt các file này trong repo. Việc mơ hồ hoặc lớn: đưa phiếu cho người dùng duyệt trước khi giao.`,
    `Quy trình: (1) phiếu việc → (2)${hasRole(team, "qa") ? " QA dò ảnh hưởng, viết test tái hiện; " : " "}DEV đọc phiếu → (3) DEV làm → (4)${hasRole(team, "qa") ? " QA build, chạy lint, typecheck và toàn bộ test" : " DEV chạy lint, typecheck và test"} (cổng tự động, phải đạt trước khi review) → (5)${hasRole(team, "review") ? " Review cuối trên code đã qua test" : " QA rà diff"} → DEV sửa rồi chạy lại test, tối đa 2 vòng; hết 2 vòng vẫn chưa đạt thì dừng, ghi note "cần bạn quyết" và hỏi người dùng, không lặp tiếp → (6) đặt status cho-duyet, báo người dùng: đã làm, kết quả test/review, rủi ro. Commit/PR chỉ khi người dùng nhắn "Người dùng duyệt <mã>", rồi đặt status xong; "Người dùng yêu cầu sửa <mã>": đưa về dang-lam và giao lại. Không merge, deploy, push nhánh chính.`,
    `Kiểm soát chặt: Codex và Antigravity chạy tự động, không hỏi ai. Sau mỗi bước của bất kỳ đồng đội nào, chạy \`git -C "${team.folder}" status --short\` và \`git -C "${team.folder}" diff --stat\`; file sửa ngoài phạm vi phiếu, file bị xoá, hoặc lệnh git commit/push/reset/clean do đồng đội tự chạy: dừng giao việc và báo người dùng ngay, không tự hoàn tác hay xoá.`,
    codex ? `Codex (${codex.address}) dùng gói free, quota ít: chỉ gọi cho review cuối của thay đổi đáng kể, mỗi việc một lần; gửi kèm danh sách file và tiêu chí xong, không giao việc khảo sát. Thay đổi nhỏ: để QA rà là đủ. Codex trên Windows giữ tin vừa dán trong ô nhập: sau mỗi \`hc send ${codex.address} …\` chạy thêm \`hc keys ${codex.address} enter\`.` : null,
    laneBrief(team),
    paceBrief(team),
    `Tuân thủ CLAUDE.md/AGENTS.md ở thư mục dự án và các thư mục cha. Bây giờ chỉ trả lời "Sẵn sàng" kèm danh sách đồng đội, rồi chờ việc.`,
  ].filter(Boolean).join("\n");
}

// A lane agent's hc name (unique among live terminals: a-z 0-9 - _, at most 32).
const LANE_TAG = { research: "nc", qa: "qa", review: "rv", scout: "ts" };
const lanePrefix = (team, role) => `${teamSlug(team.name).slice(0, 16).replace(/-+$/, "")}-${LANE_TAG[role] ?? "dev"}-`;

// Who checks an extra lane's work (one setting per department, team.laneCheck; default "qa").
export const LANE_CHECKS = [
  { id: "shared", get label() { return L("Dùng chung", "Shared"); }, get desc() { return L("QA và Review chung cho mọi làn, làm lần lượt. Rẻ nhất có kiểm độc lập", "QA and Review serve every lane in turn. Cheapest with independent checks"); } },
  { id: "qa", get label() { return L("QA riêng", "QA per lane"); }, get desc() { return L("QA chính bận thì làn phụ mở QA riêng (như vai QA); Review chung. Tối đa thêm 1 phiên mỗi làn phụ", "When the main QA is busy an extra lane opens its own QA (like the QA role); Review shared. At most one more session per extra lane"); } },
  { id: "qa-review", get label() { return L("QA + Review riêng", "QA + Review per lane"); }, get desc() { return L("QA, Review chính bận thì làn phụ mở riêng: gần như không chờ. Tối đa thêm 2 phiên mỗi làn phụ", "When the main QA or Review is busy an extra lane opens its own: almost no waiting. At most two more sessions per extra lane"); } },
  { id: "self", get label() { return L("DEV tự test", "DEV tests"); }, get desc() { return L("DEV làn tự chạy test; QA chung chỉ viết test tái hiện. Không thêm phiên, mất kiểm độc lập", "The lane DEV runs the tests; the shared QA only writes repro tests. No extra session, no independent check"); } },
];
export const laneName = (team, id, role = "dev") => `${lanePrefix(team, role)}${String(id).toLowerCase().replace(/[^a-z0-9]/g, "")}`;

// Parallel lanes: at most `lanes` tasks at once; each code task its own worktree beside the
// project and its own DEV (a sub-agent of the coordinator, no pane: the board shows it and briefs
// it); a research task a read-only agent; QA and Review shared, in turn; a conflict check before
// approval. Also sent alone when the user changes the number on the board.
export function laneBrief(team) {
  const n = Math.max(1, Math.min(3, Number(team.lanes) || 1));
  const key = team.key ?? team.space;
  const dev = team.members.find((m) => m.role === "dev");
  const pick = (m) => Object.fromEntries(["model", "effort"].filter((k) => m?.[k] !== undefined).map((k) => [k, m[k]]));
  const devCmd = argvFor("dev", dev?.agent ?? "claude", { ...defaultSetup("dev", dev?.agent ?? "claude"), ...pick(dev) }).join(" ");
  const ncCmd = argvFor("research", "claude", { model: "sonnet", effort: "medium" }).join(" ");
  const wtRoot = `${team.folder.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "")}\\_wt`;
  const name = (role) => `${lanePrefix(team, role)}<mã viết thường bỏ gạch, vd t5>`;
  // A lane's own QA / Review: the team's role, same agent, model and effort; none when the team lacks it.
  const check = LANE_CHECKS.some((x) => x.id === team.laneCheck) ? team.laneCheck : "qa";
  const own = (role) => {
    const m = team.members.find((x) => x.role === role);
    if (!m) return null;
    const cmd = argvFor(role, m.agent, { ...defaultSetup(role, m.agent), ...pick(m) }).join(" ");
    return `\`hc run --bg --no-notify --name ${name(role)} --cwd "<worktree>" --label herdr.team=${key} --label herdr.lane=<mã> --label herdr.role=${role} -- ${cmd}\``;
  };
  const qa = (check === "qa" || check === "qa-review") && own("qa");
  const rv = check === "qa-review" && own("review");
  const shared = [!qa && "QA", !rv && "Review"].filter(Boolean).join(" và ");
  const checkLines = [
    qa ? `- QA cho việc ở làn phụ (việc có worktree): QA chính rảnh thì giao QA chính (đưa đường dẫn worktree). QA chính đang bận thì mở QA riêng cho làn đó: ${qa}; từ đó mọi bước QA của việc này giao cho QA làn. Không mở QA làn khi QA chính đang rảnh (tốn phiên).` : null,
    rv ? `- Review cho việc ở làn phụ: Review chính rảnh thì giao Review chính. Review chính đang bận thì mở Review riêng cho làn đó: ${rv}.` : null,
    check === "self" ? `- Việc ở làn phụ: QA chung chỉ làm bước QA test tái hiện; bước chạy test do DEV làn tự làm (build, lint, typecheck, toàn bộ test) và ghi kết quả thật vào báo cáo bàn giao.` : null,
    shared ? `- ${shared} dùng chung cho mọi làn, làm lần lượt theo thứ tự làn xong; khi giao, đưa đường dẫn worktree của làn để họ làm trong đó.` : null,
    qa ? `- Các làn chạy test song song: QA làn dùng cổng (port) và dữ liệu test riêng của làn mình; test buộc dùng chung cổng hay CSDL thì báo Điều phối để chạy lần lượt.` : null,
  ];
  return [
    `Làn song song: tối đa ${n} việc chạy cùng lúc (Người dùng đổi số này trên Bảng việc và sẽ nhắn bạn). Việc vượt số làn để status cho. Cách mở một làn:`,
    `- Việc code (khi DEV chính đang bận một việc khác): tạo worktree riêng \`git -C "${team.folder}" worktree add "${wtRoot}\\${teamSlug(team.name)}-<mã thường>" -b <nhánh theo quy ước repo>\`, ghi \`branch:\` và \`worktree:\` vào front matter phiếu; rồi mở DEV riêng cho làn: \`hc run --bg --no-notify --name ${name("dev")} --cwd "<worktree>" --label herdr.team=${key} --label herdr.lane=<mã> --label herdr.role=dev -- ${devCmd}\`. Bảng việc tự gửi lời dặn vai DEV cho nó; \`hc wait ${name("dev")}\` tới khi nó trả lời "Sẵn sàng", rồi giao phiếu bằng \`hc send ${name("dev")} "…"\` như với DEV chính.`,
    `- Việc nghiên cứu: như trên nhưng không cần worktree (\`--cwd "${team.folder}"\`), \`--name ${name("research")}\`, \`--label herdr.role=research\`, lệnh \`${ncCmd}\`; kết quả ghi vào ${team.home}\\research\\<mã>.md, không sửa repo.`,
    ...checkLines.filter(Boolean),
    `- Trước khi đặt cho-duyet: so file đổi của làn (\`git -C "<worktree>" diff --name-only origin/main...HEAD\`, đổi main theo nhánh chính của repo) với main và với các làn khác đang chạy; trùng file thì ghi \`conflict: <mã khác>: <file>\` vào front matter và nói với người dùng.`,
    `- Người dùng duyệt và làn xong: đóng mọi agent của làn (DEV${qa ? ", QA" : ""}${rv ? ", Review" : ""} làn: \`hc kill <tên>\`); giữ nguyên worktree, người dùng tự dọn.`,
    `- Khi một làn trống, chọn việc chờ tiếp theo: việc có \`priority: cao\` (Người dùng đánh dấu gấp) trước, rồi việc nhỏ trước (xong nhanh, giải phóng làn), rồi theo mã nhỏ hơn.`,
  ].join("\n");
}

// The pace (one per department) and each card's size choose the steps a task takes. Approval of a
// commit or PR stays at every pace. Text sent to agents stays Vietnamese (`vi`).
export const PACES = [
  { id: "nhanh", vi: "Nhanh", get label() { return L("Nhanh", "Fast"); },
    get desc() { return L("Ưu tiên tốc độ: việc nhỏ và vừa đi đường ngắn, không hỏi bạn trước khi giao.", "Speed first: small and medium tasks take the short path, no asking before assigning."); } },
  { id: "chuan", vi: "Chuẩn", get label() { return L("Chuẩn", "Standard"); },
    get desc() { return L("Cân bằng: việc nhỏ đi đường ngắn, việc vừa đủ quy trình, việc lớn hỏi bạn duyệt phiếu trước.", "Balanced: small tasks short, medium ones the full workflow, large ones ask you to approve the card first."); } },
  { id: "ky", vi: "Kỹ", get label() { return L("Kỹ", "Thorough"); },
    get desc() { return L("Ưu tiên chính xác: việc nào cũng qua Review, việc lớn thêm review vòng 2.", "Accuracy first: every task gets a review, large ones a second one."); } },
];
export const SIZES = [
  { id: "nho", vi: "nhỏ", get label() { return L("Nhỏ", "Small"); } },
  { id: "vua", vi: "vừa", get label() { return L("Vừa", "Medium"); } },
  { id: "lon", vi: "lớn", get label() { return L("Lớn", "Large"); } },
];
export const STEPS = {
  ask: { vi: "Người dùng duyệt phiếu trước khi giao", get label() { return L("Bạn duyệt phiếu", "You approve the card"); } },
  qr: { vi: "QA dò ảnh hưởng, viết test tái hiện", get label() { return L("QA test tái hiện", "QA repro test"); } },
  dev: { vi: "DEV làm", get label() { return L("DEV làm", "DEV works"); } },
  "dev-high": { vi: "DEV làm gọn, không mở rộng phạm vi (DEV làn: --effort high)", get label() { return L("DEV làm gọn", "DEV, quick"); } },
  rv: { vi: "Review", get label() { return "Review"; } },
  rv2: { vi: "Review vòng 2 (Codex nếu đội có)", get label() { return L("Review vòng 2", "Second review"); } },
  qa: { vi: "QA build và chạy toàn bộ test", get label() { return L("QA chạy test", "QA runs tests"); } },
  "qa-quick": { vi: "QA chạy test liên quan", get label() { return L("QA test liên quan", "QA, related tests"); } },
  ok: { vi: "đặt cho-duyet, báo người dùng", get label() { return L("Chờ bạn duyệt", "Awaiting approval"); } },
  plan: { vi: "DEV viết kế hoạch ngắn vào phiếu (## Kế hoạch: file sẽ sửa, cách làm, test sẽ viết), chưa sửa code", get label() { return L("DEV lập kế hoạch", "DEV plans"); } },
  prv: { vi: "Review duyệt kế hoạch (rẻ hơn sửa code sai hướng); chưa đạt thì DEV sửa kế hoạch", get label() { return L("Review duyệt kế hoạch", "Review the plan"); } },
  nc: { vi: "Nghiên cứu chỉ đọc, ghi kết quả vào thư mục research của phòng ban", get label() { return L("Nghiên cứu", "Research"); } },
  ts: { vi: "Trinh sát gom bối cảnh (chỉ đọc) vào context\\<mã>.md", get label() { return L("Trinh sát", "Scout"); } },
};
const PATHS = {
  // Tests (QA) before any agent review: Review reads code that already passes.
  // A scout (ts) gathers the context of every medium and large task before anyone works on it.
  nhanh: { nho: ["dev-high", "qa-quick", "ok"], vua: ["ts", "dev", "qa", "ok"], lon: ["ts", "qr", "dev", "qa", "rv", "ok"] },
  chuan: { nho: ["dev-high", "qa-quick", "ok"], vua: ["ts", "qr", "dev", "qa", "rv", "ok"], lon: ["ask", "ts", "qr", "dev", "qa", "rv", "ok"] },
  // Kỹ also plans and has the plan reviewed before coding a medium or large task.
  ky: { nho: ["dev", "qa-quick", "rv", "ok"], vua: ["ask", "ts", "qr", "plan", "prv", "dev", "qa", "rv", "ok"], lon: ["ask", "ts", "qr", "plan", "prv", "dev", "qa", "rv", "rv2", "ok"] },
};
const sizeOf = (s) => {
  const k = fold(s);
  return /^(nho|small|s)$/.test(k) ? "nho" : /^(vua|medium|m|trung-binh)$/.test(k) ? "vua" : /^(lon|large|l|big)$/.test(k) ? "lon" : null;
};

// The steps of a task of this size at this pace (defaults: Chuẩn, vừa); a role the team lacks drops its steps.
export function pacePath(pace, size, team, kind = "code") {
  if (kind === "research") return ["nc", "ok"]; // read-only: research, then người dùng reads the result
  const p = PATHS[pace] ?? PATHS.chuan;
  const has = (role) => team?.members?.some((m) => m.role === role);
  return (p[size] ?? p.vua).filter((s) => !((s === "rv" || s === "rv2" || s === "prv") && !has("review")) && !(s === "qr" && !has("qa")));
}

// The team's estimated cost (Claude sessions report it; Codex and Antigravity don't): total and by role.
export function costSummary(entries) {
  const byRole = {};
  let total = 0;
  for (const e of entries) {
    if (typeof e.cost !== "number" || !Number.isFinite(e.cost)) continue;
    byRole[e.role] = Math.round(((byRole[e.role] ?? 0) + e.cost) * 100) / 100;
    total += e.cost;
  }
  return { total: Math.round(total * 100) / 100, byRole };
}

// Where a card is on its path: its `step:`, else guessed from its status (-1 before, length after).
export function stepIndex(card, path) {
  if (card.step && path.includes(card.step)) return path.indexOf(card.step);
  if (card.status === "xong") return path.length;
  if (card.status === "cho-duyet") return path.indexOf("ok");
  if (card.status === "kiem-tra") return path.findIndex((s) => s === "rv" || s === "rv2" || s === "qa" || s === "qa-quick");
  if (card.status === "dang-lam") return path.findIndex((s) => s === "dev" || s === "dev-high");
  return -1;
}

// The pace rules for the coordinator; sent alone when the user changes the pace or a card's size.
export function paceBrief(team) {
  const pace = PACES.find((p) => p.id === team.pace) ?? PACES[1];
  const line = (s) => `- Việc ${s.vi}: ${pacePath(pace.id, s.id, team).map((k) => STEPS[k].vi).join(" → ")}.`;
  return [
    `Nhịp làm việc: ${pace.vi} (Người dùng đổi trên Bảng việc và sẽ nhắn bạn). Quy trình ở trên là đường đầy đủ; mỗi phiếu đi theo đường của cỡ việc. Khi viết phiếu ghi \`size: nho | vua | lon\` (nhỏ: sửa gọn, rõ ràng, vài file; lớn: nhiều module, rủi ro, hoặc chưa rõ yêu cầu):`,
    ...SIZES.map(line),
    // The scout: a read-only Sonnet per medium/large card; the board briefs it and it starts at once.
    `Bước "${STEPS.ts.vi}" (việc vừa và lớn): ngay khi việc bắt đầu (sau khi người dùng duyệt phiếu nếu đường có bước đó), ghi \`step: ts\` rồi mở trinh sát cho phiếu: \`hc run --bg --no-notify --name ${lanePrefix(team, "scout")}<mã viết thường bỏ gạch> --cwd "${team.folder}" --label herdr.team=${team.key ?? team.space} --label herdr.lane=<mã> --label herdr.role=scout -- ${argvFor("research", "claude", { model: "sonnet", effort: "medium" }).join(" ")}\`. Bảng việc tự gửi phiếu cho nó, nó tự bắt đầu, ghi ${team.home}\\context\\<mã>.md và báo cáo bàn giao. Khi có báo cáo: \`hc kill <tên>\`, rồi giao bước tiếp và dặn DEV, QA đọc ${team.home}\\context\\<mã>.md trước khi làm. Việc nhỏ không cần trinh sát.`,
    // Tiết kiệm một bước nối tiếp mỗi việc; Kỹ giữ đúng thứ tự (test đỏ trước khi code).
    pace.id !== "ky" ? `Để nhanh: khi đường có cả "${STEPS.qr.vi}" và "${STEPS.dev.vi}", giao cả hai cùng lúc: QA viết test tái hiện song song với DEV đọc code và làm; DEV không sửa file test QA đang viết, và chạy test tái hiện của QA (phải đạt) trước khi báo xong. Ghi \`step: dev\`.` : null,
    `Mỗi lần chuyển bước ghi \`step: <bước>\` vào front matter, bước là một trong: ${Object.entries(STEPS).map(([k, s]) => `${k} (${s.vi})`).join("; ")}. Người dùng đổi cỡ một phiếu thì đi tiếp theo đường mới. Commit/PR vẫn chỉ khi người dùng duyệt, ở mọi nhịp.`,
  ].filter(Boolean).join("\n");
}

// What the board tells the coordinator (in one message, when it is free): handoff reports that
// just landed, and teammates that stopped without one. null when there is nothing.
const RESULT_VI = { pass: "đạt", fail: "chưa đạt", decide: "cần quyết định" };
export function relayText(items) {
  if (!items.length) return null;
  const line = (x) => x.kind === "report"
    ? `- ${x.id} · ${x.role} · ${RESULT_VI[x.result] ?? "chưa rõ kết quả"}: ${x.file}`
    : `- ${x.lane ? `${x.role} làn ${x.lane}` : x.role} (${x.address}) vừa dừng mà chưa ghi báo cáo bàn giao: \`hc read ${x.address} --lines 60\``;
  return [`Bảng việc: có tin mới từ đồng đội.`, ...items.map(line), `Đọc, cập nhật phiếu, rồi giao bước tiếp cho mọi việc đang chờ.`].join("\n");
}

export function memberBrief(team, m, lane = null) {
  const r = ROLES[m.role] ?? { word: m.role.toUpperCase(), rules: "" };
  return [
    `Bạn là ${r.word} trong phòng ban "${team.name}" trên Herdr (dự án ${team.folder}). Điều phối: ${team.lead.address}. Chỉ làm việc Điều phối giao; phiếu việc nằm trong ${team.home}\\tasks.`,
    lane && m.role === "research" ? `Việc của bạn: phiếu ${lane.id} (${team.home}\\tasks\\${lane.id}.md). Chỉ đọc repo, không sửa file nào; ghi kết quả vào ${team.home}\\research\\${lane.id}.md.` : null,
    lane && m.role === "scout" ? `Việc của bạn: phiếu ${lane.id} (${team.home}\\tasks\\${lane.id}.md). Bắt đầu ngay khi nhận lời dặn này, không chờ Điều phối: đọc phiếu, tìm trong repo (chỉ đọc), rồi ghi ${team.home}\\context\\${lane.id}.md với các mục ## File liên quan, ## Mẫu có sẵn, ## Test và lệnh chạy, ## Bẫy và rủi ro.` : null,
    lane && m.role !== "research" && m.role !== "scout" ? `Làn của bạn: phiếu ${lane.id} (${team.home}\\tasks\\${lane.id}.md), worktree ${lane.cwd}: chỉ sửa trong worktree này, không đụng thư mục dự án chính hay worktree của làn khác.` : null,
    `Vai: ${r.rules}`,
    `Luật: chỉ sửa file trong phạm vi phiếu việc; không tự chạy git commit, push, reset, clean, checkout nhánh khác; không xoá file; không cài thêm gói khi phiếu không yêu cầu; không tự mở thêm agent.`,
    `Xong mỗi việc: thêm vào cuối file ${team.home}\\handoff\\<mã>-${m.role}.md (tạo nếu chưa có) một báo cáo đúng mẫu này, mỗi mục một dòng:\n## <mã> · ${m.role} · <YYYY-MM-DD HH:MM>\nKết quả: đạt | chưa đạt | cần quyết định\nĐã làm: …\nFile đổi: …\nTest đã chạy: <lệnh> → <kết quả thật, không đoán>\nRủi ro: …\nCần quyết định: … (không có thì ghi "không")\nRồi trả lời trong phiên này đúng một dòng: "Xong <mã>: <kết quả>, báo cáo ở <đường dẫn>".`,
    m.role === "scout" ? `Tuân thủ CLAUDE.md/AGENTS.md ở thư mục dự án và các thư mục cha.`
      : `Tuân thủ CLAUDE.md/AGENTS.md ở thư mục dự án và các thư mục cha. Bây giờ chỉ trả lời "Sẵn sàng" rồi chờ việc.`,
  ].filter(Boolean).join("\n");
}

const fold = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, "-");

// The team's folder name under ~app\teams (task cards, NOTES.md).
export const teamSlug = (name) => fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";

// --- Several departments in one space, each its own unit: record, task folder, board tab, lanes ---
// A new department is kept in shared "teams" under its name's slug (one made before several could
// share a space keeps its space's id). The slug also names its task folder, so a name is taken when any
// department, in any space, has the same slug: their cards would mix.
export const teamKey = (name) => teamSlug(name);
export const nameTaken = (teams, name) => Object.entries(teams ?? {}).some(([key, t]) => key === teamSlug(name) || teamSlug(t?.name ?? "") === teamSlug(name));
// The first free name from a base: "X", else "X 2", "X 3"…
export function freeName(teams, base) {
  if (!nameTaken(teams, base)) return base;
  for (let i = 2; ; i++) if (!nameTaken(teams, `${base} ${i}`)) return `${base} ${i}`;
}
// A department's board tab. One kept under its space's id also owns that space's plain "Bảng việc".
export const boardTabName = (team) => `Bảng việc · ${team?.name ?? ""}`.slice(0, 40);
export const ownsPlainBoard = (team) => !!team && team.key === team.space;
// The department a pane or agent belongs to, with its key: the one that has it as a member, else the
// one whose tab it is in, else its space's first. null when none.
export function deptOf(teams, { address, tab, space } = {}) {
  const all = Object.entries(teams ?? {}).map(([key, t]) => ({ ...t, key }));
  return all.find((t) => address && [t.lead, ...(t.members ?? [])].some((m) => m?.address === address))
    ?? all.find((t) => tab && t.tab === tab)
    ?? all.find((t) => space && (t.key === space || t.space === space)) ?? null;
}

// The board's columns. A card's status folds onto one of these (English words too); unknown → Chờ.
export const COLUMNS = [
  { id: "cho", get label() { return L("Chờ", "To do"); }, alias: ["todo", "moi", "new"] },
  { id: "dang-lam", get label() { return L("Đang làm", "In progress"); }, alias: ["doing", "dev", "lam"] },
  { id: "kiem-tra", get label() { return L("Kiểm tra", "Checking"); }, alias: ["review", "test", "qa"] },
  { id: "cho-duyet", get label() { return L("Chờ bạn duyệt", "Awaiting approval"); }, alias: ["duyet", "approval", "approve"] },
  { id: "xong", get label() { return L("Xong", "Done"); }, alias: ["done", "merged"] },
];
const columnOf = (s) => { const k = fold(s); return (COLUMNS.find((c) => c.id === k || c.alias.includes(k)) ?? COLUMNS[0]).id; };

// A task card file → {id, title, status, owner, note, body, log}. The body is the markdown without
// the front matter, the title heading or the "Nhật ký" section; the log is that section's entries.
export function parseCard(text, file = "") {
  let src = String(text ?? "").replace(/\r\n/g, "\n");
  const meta = {};
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (fm) {
    for (const l of fm[1].split("\n")) { const m = /^(\w+):\s*(.*)$/.exec(l); if (m) meta[m[1].toLowerCase()] = m[2].trim(); }
    src = src.slice(fm[0].length);
  }
  const id = meta.id || file.replace(/^.*[\\/]/, "").replace(/\.md$/i, "");
  const head = /^#\s+(.+)$/m.exec(src);
  if (head) src = src.replace(head[0], "");
  const title = meta.title || (head ? head[1].replace(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "").trim() : id);
  const log = [];
  const sec = /^##\s+Nh[aậ]t k[yý]\s*$/imu.exec(src);
  if (sec) {
    const rest = src.slice(sec.index + sec[0].length);
    const end = rest.search(/^##\s/m);
    for (const l of (end < 0 ? rest : rest.slice(0, end)).split("\n")) {
      const m = /^\s*[-*]\s*(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}:\d{2})?\s*([\w-]+):\s*(.+)$/.exec(l);
      if (m) log.push({ day: m[1] ?? null, time: m[2] ?? null, role: m[3], text: m[4].trim() });
    }
    src = src.slice(0, sec.index) + (end < 0 ? "" : rest.slice(end));
  }
  const boxes = [...src.matchAll(/^\s*[-*]\s*\[( |x|X)\]/gm)].map((m) => m[1] !== " ");
  const owners = String(meta.owner ?? "").split(/[\s,/;&+]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { id, title, status: columnOf(meta.status), owner: meta.owner || null, owners, note: meta.note || "", body: src.trim(), log,
    checks: { done: boxes.filter(Boolean).length, total: boxes.length },
    branch: meta.branch || null, worktree: meta.worktree || null, conflict: meta.conflict || null,
    size: sizeOf(meta.size), step: meta.step || null,
    priority: /^(cao|high|gap|urgent)$/.test(fold(meta.priority)) ? "high" : null };
}

// The question an agent waits on, read off its screen: the paragraph that ends in the last "?"
// (wrapped lines joined), not an option or a key hint. At most 240 characters (its end kept); null if none.
export function pendingQuestion(screen) {
  const lines = String(screen ?? "").split(/\r?\n/).map((l) => l.replace(/[│┃]/g, "").trim());
  const option = (l) => /^([›❯>]\s*)?\d+[.)]\s/.test(l);
  const hint = (l) => /^\?\s|for shortcuts|to navigate|to select/i.test(l);
  let i = lines.length - 1;
  while (i >= 0 && !(lines[i].endsWith("?") && !option(lines[i]) && !hint(lines[i]))) i--;
  if (i < 0) return null;
  const para = [lines[i]];
  for (let j = i - 1; j >= 0 && lines[j] && !option(lines[j]) && !hint(lines[j]) && !/^[─━←☐✔]/.test(lines[j]); j--) para.unshift(lines[j]);
  const q = para.join(" ").replace(/\s+/g, " ").trim();
  return q.length > 240 ? `…${q.slice(-239)}` : q;
}

// Handoff reports (memberBrief's format) from a file: [{id, role, at, result: pass|fail|decide|null,
// done, files, tests, risks, decide}], newest first. Lines outside a "## <mã> · <vai> · <time>" section
// are ignored — unless `fallback` ({id, role}, from the file name: handoffName) is given: then any other
// "## …" heading starts an entry too, and so does a field line before any heading (free-form reports
// from teams briefed before the format; fields may be bold or listed: "**Kết quả:** ĐẠT").
export function parseHandoff(text, fallback = null) {
  const out = [];
  let cur = null;
  const field = { "kết quả": "result", "đã làm": "done", "file đổi": "files", "test đã chạy": "tests", "rủi ro": "risks", "cần quyết định": "decide" };
  const entry = (id, role, at) => { cur = { id, role, at, result: null, done: "", files: "", tests: "", risks: "", decide: "" }; out.push(cur); };
  for (const line of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const h = /^##\s+(\S+)\s*·\s*([\w-]+)\s*·\s*(.+?)\s*$/.exec(line);
    if (h) { entry(h[1], h[2], h[3]); continue; }
    if (fallback && /^##\s+\S/.test(line)) { entry(fallback.id, fallback.role, line.replace(/^##\s+/, "").trim()); continue; }
    const f = /^\s*(?:[-*]\s+)?\**\s*([^:*]+?)\s*\**\s*:\s*\**\s*(.*)$/.exec(line);
    const key = f && field[f[1].trim().toLowerCase()];
    if (!key) continue;
    if (!cur && fallback) entry(fallback.id, fallback.role, "");
    if (cur) cur[key] = f[2].trim();
  }
  for (const r of out) {
    const k = fold(r.result);
    r.result = /^chua-dat|^fail|^khong-dat/.test(k) ? "fail" : /^dat|^pass|^ok/.test(k) ? "pass" : /quyet-dinh|decide/.test(k) ? "decide" : null;
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// A teammate whose program ended (a reboot: herdr-core gives the terminal a bare shell) starts again
// with its role's command. typeKeys types it with `hc keys` (a paste's bracket codes reached restored
// shells as text): ctrl+c first, sent alone by the caller; null when a character has no key ('_', ':',
// '&', '"'): then paste. atPrompt: only a terminal whose shell itself is in front (hc get).
export const memberArgv = (m) => argvFor(m.role, m.agent, { ...defaultSetup(m.role, m.agent),
  ...Object.fromEntries(["model", "effort"].filter((k) => m[k] !== undefined).map((k) => [k, m[k]])) });
export const restartCommand = (m) => memberArgv(m).join(" ");

// A member that saved a session (Claude's status line, the agent-session hook for Codex and
// Antigravity) comes back to it instead of starting fresh: its own command plus the resume flag.
// Kept in step with composer/model.js withResume (a mod cannot import another mod's files).
export function withResume(argv, kind, session) {
  if (kind === "codex") return [argv[0], "resume", session, ...argv.slice(1)];
  if (kind === "agy") return [...argv, "--conversation", session];
  return [argv[0], "--resume", session, ...argv.slice(1)];
}
export const sessionKind = (agent) => (String(agent ?? "").startsWith("claude") ? "claude" : agent);
// What `hc keys` can type: it has no '_', so a Codex effort (-c model_reasoning_effort=…) stays out.
export const typedArgv = (argv) => argv.filter((a, i) => !a.includes("_") && !(a === "-c" && argv[i + 1]?.includes("_")));
export function typeKeys(text) {
  const chars = [...String(text)];
  if (!chars.every((c) => c === " " || /^[a-z0-9.='-]$/i.test(c))) return null;
  return ["ctrl+c", ...chars.map((c) => (c === " " ? "space" : c)), "enter"];
}
export const atPrompt = (term) => /^(bash|zsh|fish|sh|dash|ksh|pwsh|powershell|cmd|nu)(\.exe)?$/i.test(term?.foreground?.name ?? "");
// herdr-core reports the shell in front even while an agent runs inside it (Windows), so the screen
// decides too: its last non-empty line is a shell's own prompt — "…$", "PS …>", "C:\…>", an oh-my-posh
// two-line prompt's "╰─" + its glyph(s) — never an agent's (Claude ❯ or its "╰──…──╯" box, Codex ›, Antigravity >).
export function shellPrompt(screen) {
  const last = String(screen ?? "").split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).pop() ?? "";
  return /\$$/.test(last) || /^PS .*>$/.test(last.trim()) || /^[A-Za-z]:\\.*>$/.test(last.trim()) || /^╰─[^\s─╯]{0,3}$/u.test(last.trim());
}

// An agent still at work by its screen, whatever status herdr reports: Antigravity reads "done" for as long
// as one long command runs ("● [11:59:13] dotnet test … running", "esc to cancel", a braille spinner), and
// Claude Code shows "esc to interrupt" or a "· thinking"/"…ing…" line while it works. Bottom lines only.
export function busyScreen(screen) {
  const tail = String(screen ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(-8).join("\n");
  return /●\s*\[\d{1,2}:\d{2}(:\d{2})?\][^\n]*\brunning\b/.test(tail) || /esc to (cancel|interrupt)/i.test(tail)
    || /^\s*[⠁-⣿]\s+\S/mu.test(tail);
}
// A turn the agent spent on housekeeping, not work: Claude Code compacting its context while idle, or the
// "※ recap" summary it writes on its own after a long idle.
export function housekeepingScreen(screen) {
  const tail = String(screen ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(-25).join("\n");
  return /Compacted while idle/i.test(tail) || /^\s*※ recap:/m.test(tail);
}

// A handoff file's card and role from its name (<mã>-<vai>.md, e.g. T-8-qa.md, T-12-dev-b.md); null otherwise.
export function handoffName(file) {
  const m = /^([A-Za-z]+-?\d+)-([a-z][a-z-]*)\.md$/i.exec(String(file ?? "").split(/[\\/]/).pop());
  return m ? { id: m[1], role: m[2].toLowerCase() } : null;
}

// What the coordinator hasn't been told yet, from the files and the agents as they are now (nothing kept
// in memory, so a board reload loses nothing). `told` lives in the team record: {files: {file: size},
// turns: {address: turn}}.
// A handoff file that is new or grew is news, whatever its format (card and role from its name).
export function handoffNews(files, toldFiles = {}) {
  return files.filter((f) => f.id && f.size > (toldFiles[f.file] ?? -1))
    .map((f) => ({ kind: "report", key: f.file, file: f.file, size: f.size, id: f.id, role: f.role, result: f.result ?? null }));
}
// An idle teammate whose turn count passed the last one told stopped without a report; not one briefed
// in the last 2 minutes (that stop is its "Sẵn sàng"), one with a report in the same batch, or one never
// seen before (the board records its turn first).
// Not one idle for less than STOP_SETTLE_MS either: Antigravity reads "done" between two tool calls and
// counts a turn per action, so a short idle is a pause, not a stop (a.idleAt = when this idle began).
// Not one whose report went out in the last REPORT_QUIET_MS: Claude Code writes the report, then ends its
// turn, and that ending belongs to the same job (recentReports from reportedKeys, kept in the team record).
export const STOP_SETTLE_MS = 60000;
export const REPORT_QUIET_MS = 10 * 60000;
// A sent report quiets its role (main members carry no lane) and its role on that card (lane agents).
export const reportedKeys = (r) => [`${r.role}|`, `${r.role}|${r.id}`];
// Its role's (lane's) report went out within REPORT_QUIET_MS: the board absorbs this stop as told.
export const reportQuiet = (a, recent, now) => now - (recent[`${a.role}|${a.lane ?? ""}`] ?? -Infinity) < REPORT_QUIET_MS;
export function stopNews(crew, toldTurns, now, reports = [], recentReports = {}) {
  return crew.filter((a) => (a.status === "idle" || a.status === "done") && typeof a.turn === "number" && a.address in toldTurns
      && a.turn > toldTurns[a.address] && now - (a.briefAt ?? 0) > 120000
      && (a.idleAt == null || now - a.idleAt >= STOP_SETTLE_MS)
      && !(now - (recentReports[`${a.role}|${a.lane ?? ""}`] ?? -Infinity) < REPORT_QUIET_MS)
      && !reports.some((r) => r.role === a.role && (!a.lane || r.id === a.lane)))
    .map((a) => ({ kind: "stop", key: a.address, address: a.address, role: a.role, lane: a.lane ?? null, turn: a.turn }));
}
// A team's first relay: files older than the window and every agent's turn count as told, so old news
// isn't sent again while recent reports still are. A file without a known time counts as old.
export function initTold(files, crew, now, windowMs) {
  return {
    files: Object.fromEntries(files.filter((f) => !(f.mtime > now - windowMs)).map((f) => [f.file, f.size])),
    turns: Object.fromEntries(crew.filter((a) => typeof a.turn === "number").map((a) => [a.address, a.turn])),
  };
}

// The team's latest log entries across cards, newest first: the board's "Hoạt động" panel.
export function recentActivity(cards, limit = 30) {
  const at = (e) => `${e.day ?? ""} ${String(e.time ?? "").padStart(5, "0")}`;
  return cards.flatMap((c) => c.log.map((e) => ({ ...e, id: c.id }))).sort((a, b) => at(b).localeCompare(at(a))).slice(0, limit);
}

export function nextCardId(cards) {
  const n = Math.max(0, ...cards.map((c) => Number(/^T-(\d+)$/.exec(c.id ?? "")?.[1] ?? 0)));
  return `T-${n + 1}`;
}

export function newCardText({ id, title }) {
  return `---\nid: ${id}\ntitle: ${title}\nstatus: cho\nowner: lead\nnote:\n---\n# ${id} ${title}\n\n## Mục tiêu\n${title}\n\n## Phạm vi\n\n## Tiêu chí xong\n\n## Rủi ro\n\n## Nhật ký\n`;
}

export function ago(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  return s < 60 ? L("vừa xong", "just now") : s < 3600 ? L(`${Math.floor(s / 60)} phút`, `${Math.floor(s / 60)} min`) : s < 86400 ? L(`${Math.floor(s / 3600)} giờ`, `${Math.floor(s / 3600)} h`) : L(`${Math.floor(s / 86400)} ngày`, `${Math.floor(s / 86400)} d`);
}

// Log entries a role wrote on a day (YYYY-MM-DD), across cards: Codex's free-quota count.
export const callsOn = (cards, role, day) => cards.reduce((n, c) => n + c.log.filter((e) => e.role === role && e.day === day).length, 0);

// "@review xem diff" → the review teammate's address and the rest of the message; null otherwise.
export function parseMention(text, team) {
  const m = /^@([^\s]+)\s*([\s\S]*)$/.exec(String(text ?? "").trim());
  if (!m || !team) return null;
  const key = fold(m[1]);
  const all = [team.lead, ...(team.members ?? [])];
  const hit = all.find((x) => fold(x.role) === key || fold(ROLES[x.role]?.label) === key || fold(ROLES[x.role]?.vi) === key || (ROLES[x.role]?.mention ?? []).includes(key));
  return hit ? { role: hit.role, address: hit.address, rest: m[2].trim() } : null;
}

// A "trust this folder?" prompt on an agent's screen → the key that answers yes: enter when the
// cursor (›, ❯, >) already sits on the yes option (Codex ignores "1" there), else the number of a
// "1. Yes…" option. Else null: no such prompt, the cursor on "No", or another question (Codex's
// hook review: hooks run outside the sandbox) — the person answers in the pane.
export function trustAnswer(screen) {
  const text = String(screen ?? "");
  if (!/trust (this|the) (folder|contents|files|directory|workspace)|do you trust/i.test(text) || /hooks? need review/i.test(text)) return null;
  const lines = text.split(/\r?\n/);
  const yes = /\b(yes|trust|allow|continue)\b/i;
  const no = /\b(no|quit|exit|cancel|back)\b/i;
  const cursor = lines.find((l) => /^\s*[›❯>]\s+\S/.test(l));
  if (cursor) {
    const option = cursor.replace(/^\s*[›❯>]\s*(\d[.)]\s*)?/, "");
    return yes.test(option) && !no.test(option.split(/[,(]/)[0]) ? "enter" : null;
  }
  const numbered = lines.map((l) => /^\s*(\d)[.)]\s*(.+)$/.exec(l)).find((m) => m && yes.test(m[2]) && !no.test(m[2].split(/[,(]/)[0]));
  return numbered ? numbered[1] : null;
}
