// Pure logic for the hotkeys sheet: no herdr/gpui imports, tested with node --test.

import { L } from "./i18n.js";

// Lowercase without Vietnamese accents, so "mo du an" finds "Mở dự án".
export const fold = (s) =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

const LABELS = {
  "mod.open:projects": ["Mở dự án", "Open project"],
  "mod.open:hotkeys": ["Bảng phím tắt", "Shortcuts sheet"],
  "mod.open:new-session": ["Phiên mới", "New session"],
  "mod.open:picker": ["Tìm tab / agent", "Find tab / agent"],
  "mod.open:needs-you": ["Hộp Cần bạn (trả lời agent)", "Needs you box (answer agents)"],
  "mod.open:team": ["Phòng ban (điều phối nhiều agent)", "Teams (coordinate several agents)"],
  "layout.toggle:rail": ["Bật/tắt session rail", "Toggle session rail"],
  "layout.toggle:sidebar": ["Bật/tắt sidebar", "Toggle sidebar"],
  "composer.paste": ["Dán ảnh vào khung chat", "Paste image into composer"],
  "composer.focus": ["Tới ô nhập khung chat", "Focus composer input"],
  "composer.split-right": ["Tách pane sang phải (agent cùng loại)", "Split pane right (same agent)"],
  "composer.split-down": ["Tách pane xuống dưới (agent cùng loại)", "Split pane down (same agent)"],
  "tab.new": ["Tab mới", "New tab"],
  "tab.close": ["Đóng tab", "Close tab"],
  "tab.next": ["Tab kế", "Next tab"],
  "tab.prev": ["Tab trước", "Previous tab"],
  "tab.rename": ["Đổi tên tab", "Rename tab"],
  "space.new": ["Space mới", "New space"],
  "space.next": ["Space kế", "Next space"],
  "space.prev": ["Space trước", "Previous space"],
  "space.rename": ["Đổi tên space", "Rename space"],
  "layout.switch": ["Đổi layout", "Switch layout"],
  "pane.split:right": ["Chia pane sang phải", "Split pane right"],
  "pane.split:down": ["Chia pane xuống dưới", "Split pane down"],
  "pane.close": ["Đóng pane", "Close pane"],
  "pane.zoom": ["Phóng to pane", "Zoom pane"],
  "agent.next": ["Agent kế", "Next agent"],
  "agent.prev": ["Agent trước", "Previous agent"],
  "terminal.copy": ["Sao chép", "Copy"],
  "terminal.paste": ["Dán", "Paste"],
  "terminal.paste_image": ["Dán (ảnh/chữ)", "Paste (image/text)"],
  "terminal.search": ["Tìm trong terminal", "Search in terminal"],
  "app.palette": ["Bảng lệnh", "Command palette"],
  "app.settings": ["Cài đặt", "Settings"],
  "app.help": ["Trợ giúp Herdr", "Herdr help"],
  "app.zoom_in": ["Phóng to", "Zoom in"],
  "app.zoom_out": ["Thu nhỏ", "Zoom out"],
  "app.zoom_reset": ["Cỡ mặc định", "Default size"],
};

const prefixed = [
  ["space.select:", ["Tới space ", "Go to space "]],
  ["tab.select:", ["Tới tab ", "Go to tab "]],
  ["pane.go:", ["Sang pane ", "Go to pane "]],
  ["pane.swap:", ["Đổi chỗ pane ", "Swap pane "]],
];
const DIR = { left: ["trái", "left"], right: ["phải", "right"], up: ["trên", "up"], down: ["dưới", "down"] };

function labelOf(action) {
  if (LABELS[action]) return L(...LABELS[action]);
  for (const [p, l] of prefixed) if (action.startsWith(p)) { const v = action.slice(p.length); return L(...l) + (DIR[v] ? L(...DIR[v]) : v); }
  if (action.startsWith("send:")) return L("Gõ phím vào terminal", "Type keys into terminal");
  return action;
}

const CLAUDE_KEYS = [
  ["Esc", "Ngắt Claude", "Interrupt Claude"],
  ["Esc Esc", "Tua lại / sửa tin trước", "Rewind / edit previous message"],
  ["Shift+Tab", "Đổi chế độ quyền", "Change permission mode"],
  ["Alt+V", "Dán ảnh vào khung chat (layout desktop)", "Paste image into composer (desktop layout)"],
  ["Ctrl+Enter", "Khung chat: gửi thành phiên con của agent đang chọn", "Composer: send as a sub-session of the selected agent"],
  ["/", "Lệnh slash", "Slash command"],
  ["!", "Chạy lệnh shell", "Run shell command"],
  ["#", "Ghi vào memory", "Write to memory"],
  ["@", "Nhắc file", "Mention file"],
  ["↑", "Lịch sử tin nhắn", "Message history"],
  ["Ctrl+R", "Tìm lịch sử", "Search history"],
  ["Ctrl+C", "Huỷ / thoát", "Cancel / exit"],
];
const claudeKeys = () => CLAUDE_KEYS.map(([keys, vi, en]) => ({ group: "Claude Code", keys, label: L(vi, en) }));

// "ctrl-shift-/" -> "Ctrl+Shift+/". Chords (space-separated) keep their spaces.
export function formatKeys(keys) {
  return String(keys).trim().split(/\s+/).map((stroke) => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const cap = (s) => (s.length === 1 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1).toLowerCase());
    return [...parts.map(cap), cap(key)].join("+");
  }).join(" ");
}

// Rows for the sheet: Herdr (global + layout:*), Terminal, mod sections, then Claude Code.
export function hotkeyRows(bindings, filter) {
  const groupOf = (section) => (section === "terminal" ? "Terminal" : section.startsWith("mod:") ? `Mod ${section.slice(4)}` : "Herdr");
  const rows = (bindings ?? [])
    .filter((b) => b.keys?.trim() && b.action !== "terminal")
    .map((b) => ({ group: groupOf(b.section), keys: formatKeys(b.keys), label: labelOf(b.action) }))
    .concat(claudeKeys());
  const words = fold(filter).split(/\s+/).filter(Boolean);
  return rows.filter((r) => { const hay = fold(`${r.group} ${r.keys} ${r.label}`); return words.every((w) => hay.includes(w)); });
}
