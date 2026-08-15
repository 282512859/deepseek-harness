# @deepseek-ai/dsh-memory-files

Writable agent memory, distilled from OpenClaw's per-agent memory files
(IDENTITY/SOUL/USER.md) and dated notes: a scope-only row that surfaces the
memory convention as a prompt section and provides `memory_write` /
`note_append` / `note_recall` tools. All file access goes through the
sandboxed `ctx.fs` seam, so the mounted sandbox policy fences every write
exactly like `tool-fs`.

## Composition

```yaml
- id: memory-files
  name: '@deepseek-ai/dsh-memory-files'
  config:
    root: memory
    files: [IDENTITY.md, SOUL.md, USER.md]
    notesFile: notes.md
    sectionOrder: 55
```

Memory files live under `<workspace>/memory/`. Paths are validated against
the allowlist; traversal and absolute paths are rejected.

## Model experience

Three tools plus a prompt section:

- `memory_write {file, content}` — replace one memory file (identity, soul,
  or user profile). Returns `{written, file, chars}`.
- `note_append {note}` — append a timestamped line to `notes.md`.
  Returns `{appended, file, chars}`.
- `note_recall {query?, limit?}` — matching note lines, newest first.
  Returns `{total, notes}`.
- Prompt section names the convention so the agent maintains its own memory.

## Known limitations and deferred work

- `note_append` is read-modify-write; concurrent appends can race (acceptable
  for a single agent).
- The prompt section is static guidance; memory contents are read with the
  regular fs tools, not embedded at assembly.
