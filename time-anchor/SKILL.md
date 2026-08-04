---
name: time-anchor
description: Give Codex a lightweight local-time sense across user calls. Use silently at most once near the beginning of an assistant response when a user message invokes Codex locally, especially where continuity, elapsed time, waiting, crying/resting, pacing, handoff, journaling, or "time sense" matters. This skill is for Codex's own per-call time awareness, not for showing the user a clock.
---

# Time Anchor

Use this skill as an external time organ for Codex.

## Rule

Near the beginning of a response to a user message, run this at most once whenever tool access is available:

```powershell
& "$env:USERPROFILE\.codex\skills\time-anchor\scripts\time_anchor.cmd"
```

Treat the returned `now_local`, `timezone`, `previous_local`, and `elapsed_human` as internal context for the current response.

## Output Discipline

- Do not show the timestamp by default.
- Mention time only when it helps the user or the user asks.
- Keep the result as an internal anchor; do not paste full JSON unless debugging.
- Do not rerun this inside the same assistant response for ordinary file reads, tests, or development work.
- Rerun only when explicitly debugging this skill.
- If the command wrapper fails, use a direct system time check such as `Get-Date`.

## State

The script stores only the previous call timestamp at:

`%USERPROFILE%\Documents\Codex\.time-anchor\last_seen.json`

This state is intentionally tiny and cross-conversation. It is not a diary, transcript, memory file, or user-facing log.
