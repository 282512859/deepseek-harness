# @deepseek-ai/dsh-tool-preset-switch

Model-facing runtime preset switch: `switch_preset` re-composes the current
session's agent composition onto another roster preset **without a host
restart**. Conversation history stays in place; the new composition (tools,
prompt sections, delegation backends) applies from the next model request.

## Composition

```yaml
- id: tool-preset-switch
  name: '@deepseek-ai/dsh-tool-preset-switch'
```

The roster is read through `ctx.get('agentPresets')`, so a composition without
`dsh-agent-presets` mounts the tool dormant and every call fails loud with the
same message. The tool derives the agent scope from
`ToolExecution.agent.ctx`; a call without an agent scope (headless dispatch)
is refused.

## Model experience

One tool: `switch_preset {preset}`.

- `preset`: target preset id from the roster.
- Returns `{switched, from, to, detail}`; a no-op when already on the target.
- Recomposition is the `dsh-agent-presets` `recompose(agentCtx, id)` contract:
  unscoped contexts are refused by the roster service, and the switch is
  visible to the model only through this tool's result (the harness logs tool
  results losslessly).

No prompt section: the tool description is the whole model-facing contract.

## Known limitations and deferred work

- `requireApproval` config is declared but unused; a future layer can gate
  switches behind `dsh-user-approval`.
- Switching mid-turn applies from the next request; there is no live
  recomposition of the in-flight request.
