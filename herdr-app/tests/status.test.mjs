import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, statusText, tokens, span, ctxTone } from "../mods/composer/model.js";

test("span formats durations for people", () => {
  assert.equal(span(45 * 1000), "45s");
  assert.equal(span(14 * 60000), "14m");
  assert.equal(span((2 * 60 + 5) * 60000), "2h 05m");
  assert.equal(span((3 * 24 + 4) * 3600000), "3d 4h");
  assert.equal(span(null), "–");
});

test("ctxTone", () => {
  assert.equal(ctxTone(null), "dim");
  assert.equal(ctxTone(23), "accent");
  assert.equal(ctxTone(60), "ansi3");
  assert.equal(ctxTone(85), "ansi1");
});

const sample = {
  model: { display_name: "Opus 5.5" },
  effort: { level: "xhigh" },
  context_window: { used_percentage: 23.4, total_input_tokens: 240900, context_window_size: 1000000 },
  cost: { total_cost_usd: 1.2, total_duration_ms: 840000, total_lines_added: 128, total_lines_removed: 12 },
  rate_limits: { five_hour: { used_percentage: 12, resets_at: 1794200000 }, seven_day: { used_percentage: 40.6, resets_at: 1794700000 } },
};

test("summarize reads the status line fields", () => {
  const s = summarize(sample);
  assert.equal(s.model, "Opus 5.5");
  assert.equal(s.effort, "xhigh");
  assert.equal(s.ctxPct, 23.4);
  assert.equal(s.ctxUsed, 240900);
  assert.equal(s.ctxSize, 1000000);
  assert.equal(s.cost, 1.2);
  assert.equal(s.durationMs, 840000);
  assert.equal(s.added, 128);
  assert.equal(s.removed, 12);
  assert.deepEqual(s.fiveHour, { pct: 12, resetsAt: 1794200000 });
  assert.equal(s.sevenDay.pct, 40.6);
});

test("summarize tolerates missing fields", () => {
  const s = summarize({ model: { display_name: "Sonnet" } });
  assert.equal(s.ctxPct, null);
  assert.equal(s.cost, null);
  assert.equal(s.fiveHour, null);
  assert.equal(summarize(null), null);
});

test("context percent is computed when only tokens are given", () => {
  assert.equal(summarize({ context_window: { total_input_tokens: 50000, context_window_size: 200000 } }).ctxPct, 25);
});

test("statusText", () => {
  assert.equal(statusText(summarize(sample)), "Opus 5.5 xhigh · ctx 23% (240.9k/1M) · 5h 12% · $1.20");
  assert.equal(statusText(summarize({ model: { display_name: "Sonnet" } })), "Sonnet");
});

test("tokens", () => {
  assert.equal(tokens(240900), "240.9k");
  assert.equal(tokens(1000000), "1M");
  assert.equal(tokens(950), "950");
  assert.equal(tokens(null), "–");
});
