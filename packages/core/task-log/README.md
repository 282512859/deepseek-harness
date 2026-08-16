# @deepseek-ai/dsh-task-log

Task journal, mirrored from Claude Code's `.claude/tasks` into the
harness-native shape: one JSON file per task under the sandbox workspace,
with `task_start` / `task_update` / `task_list` / `task_show` tools. All file
access goes through the sandboxed `ctx.fs` seam (identical fencing to
`tool-fs`); task ids are validated against a strict pattern before any file
access, and notes are append-only within a record.

## Composition

```yaml
- id: task-log
  name: '@deepseek-ai/dsh-task-log'
  config:
    root: tasks
    sectionOrder: 57
    maxList: 100
```

Task files live at `<workspace>/tasks/<id>.json`.

## Model experience

Four tools plus a prompt section:

- `task_start {title, note?}` — create an open task. Returns `{id, title, status, notes}`.
- `task_update {id, status?, note?}` — change status (`open`/`in-progress`/
  `done`/`blocked`) and/or append a note; at least one change required.
  Returns `{id, status, notes, updated}`.
- `task_list {status?}` — newest-first summaries, optionally filtered.
  Returns `{total, tasks: [{id, title, status, updated}]}`.
- `task_show {id}` — the full record including notes.
- Prompt section names the convention so the agent keeps long-running work
  visible across turns.

## Known limitations and deferred work

- Task ids are time-derived (`task-<unix-ms>`); two `task_start` calls in the
  same millisecond collide (acceptable for a single agent).
- `task_list` rescans the journal directory on every call; no index is kept.
