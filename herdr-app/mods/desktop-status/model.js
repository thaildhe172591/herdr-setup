// Pure logic for the status bar: no herdr/gpui imports, tested with node --test.

// The rail's shared "claude.status" only when it belongs to a live Claude Code agent of the
// focused tab — shared values outlive restarts and tab switches, so never show them blindly.
export function statusFor(claudeStatus, agents, focused) {
  if (!claudeStatus?.sum || !focused) return null;
  const live = (agents ?? []).some((a) => a.address === claudeStatus.terminal && a.tab === focused.tab && a.app === "claude-code");
  return live ? claudeStatus.sum : null;
}
