# Feature: tool-preset-switch (runtime preset switching)

Date: 2026-08-15
Status: implemented (new package, additive)

## What

A model-facing tool `switch_preset` that re-composes the current session's
agent composition onto another roster preset without a host restart. Comes
from DeepClaw's agent-driven mode switching (`persona.switch`), distilled into
the harness-native shape: a tool registered in the agent scope, deriving the
scope from `ToolExecution.agent.ctx` and delegating to
`agentPresets.recompose(agentCtx, id)`.

## Decisions worth keeping

1. **Tool, not file-watch.** DeepClaw's original design watched a
   `persona.switch` marker file. The harness-native equivalent is a tool the
   model calls: scope comes from the execution context, the switch is a logged
   tool result (model-visible ⟺ logged), and no host-side file watching or
   new event plumbing is needed.
2. **Scope from `ToolExecution.agent.ctx`, roster via `ctx.get('agentPresets')`.**
   `recompose` refuses unscoped contexts, so the tool must hand the agent's
   own scoped context; the roster is a host service read through the global
   store (tool `execute` receives `ToolRunContext`, not a full `Context`).
   Recompose re-links through the standing mount's private
   `ScopeParentBinding` — see [per-preset standing
   mounts](../architecture/2026-08-08-per-preset-standing-mounts.md).
3. **defineTool normalizes the schema.** `required` moves to the schema top
   level; per-property `required: true` is not preserved — tests assert the
   normalized shape.

## Deferred

- `requireApproval` config declared but unused (future gating via
  `dsh-user-approval`).
- A REAL-composition boot test (Loader + stub roster) is still owed per the
  product-visible-plugin testing policy; unit coverage is 100%.
