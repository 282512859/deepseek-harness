# Feature: tool-trajectory (model-facing session digest)

Date: 2026-08-15
Status: implemented (new package, additive)

## What

A model-facing tool `trajectory {limit?}` returning a newest-first digest of
the current session's recent events. Distilled from DeepClaw's `/trajectory`
client command into the harness-native shape: a tool whose digest is a pure
function of the authoritative `Session.events` window.

## Decisions worth keeping

1. **Session events as the source, not raw log files.** DeepClaw's version
   parsed JSONL paths from `DSH_SESSION_ROOT`. The harness-native source is the
   session service's authoritative event window (`agent.session.events`), which
   is always in-sync and format-independent.
2. **Scope from `ToolExecution.agent` → `agent.session`, same as
   `tool-preset-switch`.** Both tools derive the agent from the execution
   context; a call without an agent scope or active session fails loud.
3. **Digest is a pure function** — `summarize`/`digest` are exported and fully
   unit-covered; chunk/unknown events fold to nothing so the digest stays
   compact.

## Deferred

- Summarize plan/workflow/projection events (currently messages, tools, and
  turn endings only).
- A REAL-composition boot test is still owed per the product-visible-plugin
  testing policy; unit coverage is 100% on all four metrics.
