// Pure logic for the "Cần bạn" box: reads a Claude Code question card (AskUserQuestion, a
// permission prompt) from the terminal's screen text. No herdr/gpui imports; node --test.

const OPTION = /^\s*(?:❯\s*)?(\d+)\.\s+(.*\S)\s*$/;
const RULE = /^\s*[─━-]{8,}\s*$/;
const FOOTER = /(Enter to (select|confirm)|↑\/↓|Esc to cancel)/;
const HEADER = /^\s*[☐☒✔✓]\s*(.*\S)/;

// → {header, question, options: [{n, label, desc}]}, or null when the screen shows no choices.
export function parseQuestion(screen) {
  const lines = String(screen ?? "").replace(/\r/g, "").split("\n");
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = OPTION.exec(lines[i]);
    if (m && m[1] === "1") { start = i; break; }
  }
  if (start < 0) return null;

  // Each choice: its label ("(Recommended)" becomes a flag), its whole description (wrapped lines
  // joined), whether the cursor is on it, and Claude's two built-in ones (type an answer, chat).
  const options = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (FOOTER.test(l)) break;
    const m = OPTION.exec(l);
    if (m && Number(m[1]) === options.length + 1) {
      const recommended = /\s*\(recommended\)\s*$/i.test(m[2]);
      const label = m[2].replace(/\s*\(recommended\)\s*$/i, "");
      const kind = /^type something/i.test(label) ? "type" : /^chat about this/i.test(label) ? "chat" : null;
      options.push({ n: Number(m[1]), label, desc: "", recommended, cursor: /^\s*❯/.test(l), kind });
    } else if (l.trim() && !RULE.test(l) && options.length && /^\s{3,}/.test(l)) {
      const o = options.at(-1);
      o.desc = o.desc ? `${o.desc} ${l.trim()}` : l.trim();
    }
  }
  if (!options.length) return null;
  // A real card always has its cursor on one choice; a plain numbered list in Claude's output has none.
  if (!lines.slice(start, start + options.length * 4 + 4).some((l) => /^\s*❯\s*\d+\./.test(l))) return null;

  // Above the choices: the step strip of a multi-question card ("☐ A  ☐ B  ✔ Submit") and the
  // question, its "│" margin dropped and wrapped lines joined into paragraphs.
  let steps = [];
  const raw = [];
  for (let i = start - 1; i >= 0 && !RULE.test(lines[i]) && raw.length < 24; i--) {
    const l = lines[i];
    if (HEADER.test(l.replace(/^\s*←\s*/, ""))) {
      steps = [...l.matchAll(/([☐☒✔✓])\s*([^☐☒✔✓←→]+)/g)].map((m) => ({ label: m[2].trim(), done: m[1] !== "☐" })).filter((s) => s.label);
      continue;
    }
    raw.unshift(l.replace(/^\s*[│┃|]\s?/, "").trim());
  }
  const question = raw.join("\n").replace(/\n{2,}/g, "\u0000").replace(/\n/g, " ").split("\u0000").map((p) => p.trim()).filter(Boolean).join("\n\n");
  const header = (steps.find((s) => !s.done) ?? steps[0])?.label ?? null;
  return { header, steps, question, options };
}

// Same card on screen as the one shown? (header, question and every choice's label.) Clock and
// countdown numbers ("will automatically block this request in 1:48") tick while it waits: ignored.
const steady = (s) => String(s ?? "").replace(/\d+(:\d+)+|\d+\s*(s|sec|seconds?|giây)\b/gi, "#");
export function sameQuestion(a, b) {
  if (!a || !b) return false;
  return a.header === b.header && steady(a.question) === steady(b.question) && a.options.length === b.options.length &&
    a.options.every((o, i) => o.label === b.options[i].label);
}

// Index of the selected agent by its address; when it left the list, the nearest valid position.
export function selectedIndex(list, address, fallback) {
  if (!list.length) return 0;
  const i = list.findIndex((a) => a.address === address);
  return i >= 0 ? i : Math.max(0, Math.min(fallback, list.length - 1));
}
