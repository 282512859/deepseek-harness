# @deepseek-ai/dsh-tool-trajectory

Model-facing trajectory digest: `trajectory` reads the current session log and
returns a compact summary of the most recent events (user/assistant messages,
tool calls and results, turn endings), so the agent can review its own recent
path without replaying raw log lines.

## Composition

```yaml
- id: tool-trajectory
  name: '@deepseek-ai/dsh-tool-trajectory'
  config:
    defaultLimit: 20
```

The digest is a pure function of the authoritative session event window
(`Session.events`); the session service owns event authority. A call without an
agent scope or active session fails loud.

## Model experience

One tool: `trajectory {limit?}`.

- Returns `{events, digest}` — total event count and newest-first digest lines
  (`#1` = latest).
- Messages summarize their text (truncated to 160 chars); chunk and unknown
  events fold into nothing.
- No prompt section: the tool description is the whole model-facing contract.

## Known limitations and deferred work

- Summarizes messages, tools, and turn endings only; plan/workflow/projection
  events are not summarized yet.
- Digest lines are plain text; no structured event metadata.
