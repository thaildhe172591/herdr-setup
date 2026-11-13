// Pure diff logic for the Diff tab: no herdr/gpui imports, node --test.

// `git diff` lines from the first hunk on → one row each, numbered once so a frame only draws
// the rows on screen.
export function unifiedRows(lines) {
  let o = 0, n = 0;
  return (lines ?? []).map((line) => {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (m) { o = +m[1]; n = +m[2]; return { kind: "@", text: line }; }
    const k = line[0];
    if (k === "-") return { kind: "-", old: o++, text: line.slice(1) };
    if (k === "+") return { kind: "+", new: n++, text: line.slice(1) };
    if (k === " ") return { kind: " ", old: o++, new: n++, text: line.slice(1) };
    return { kind: "\\", text: line };
  });
}

// Side by side: each run of removed lines faces the added lines after it, pair by pair; a side
// with fewer lines is padded with null. "\ No newline" notes are dropped.
export function splitRows(rows) {
  const out = [];
  let del = [], add = [];
  const flush = () => {
    for (let i = 0; i < Math.max(del.length, add.length); i++) {
      const d = del[i], a = add[i];
      out.push({ left: d ? { n: d.old, text: d.text, kind: "-" } : null, right: a ? { n: a.new, text: a.text, kind: "+" } : null });
    }
    del = []; add = [];
  };
  for (const r of rows ?? []) {
    if (r.kind === "-") { if (add.length) flush(); del.push(r); }
    else if (r.kind === "+") add.push(r);
    else {
      flush();
      if (r.kind === "@") out.push({ hunk: r.text });
      else if (r.kind === " ") out.push({ left: { n: r.old, text: r.text, kind: " " }, right: { n: r.new, text: r.text, kind: " " } });
    }
  }
  flush();
  return out;
}

// `git status --porcelain=v1 -z --no-renames --untracked-files=all` → [{path, status, fresh}].
export function parseStatusZ(out) {
  return String(out ?? "").split("\0").filter(Boolean).map((e) => {
    const xy = e.slice(0, 2), path = e.slice(3), fresh = xy === "??";
    const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
    return { path, fresh, status: conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M" };
  });
}

// `git diff HEAD --numstat -z --no-renames` → { path: {add, del, binary} }.
export function parseNumstatZ(out) {
  const map = {};
  for (const e of String(out ?? "").split("\0")) {
    const [a, d, ...rest] = e.split("\t");
    if (!rest.length) continue;
    map[rest.join("\t")] = { add: Number(a) || 0, del: Number(d) || 0, binary: a === "-" };
  }
  return map;
}
