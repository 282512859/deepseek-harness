# Feature: memory-files (writable agent memory)

Date: 2026-08-15
Status: implemented (new package, additive)

## What

A scope-only row surfacing OpenClaw-style writable memory: IDENTITY/SOUL/USER
memory files as a prompt section plus `memory_write` / `note_append` /
`note_recall` tools. Distilled from DeepClaw's workspace memory files
(IDENTITY/SOUL/USER/TOOLS.md read into the persona) and OpenClaw's dated
notes into the harness-native shape: tools + a prompt section over the
sandboxed fs seam.

## Decisions worth keeping

1. **The fs seam, never raw paths.** Every read/write goes through
   `ctx.fs.resolve/readText/writeText`, so the mounted sandbox policy fences
   memory writes exactly like `tool-fs`; `memory_write` validates the file
   name against an allowlist and rejects traversal.
2. **Prompt section is static guidance, contents stay in files.** The section
   names the convention; the agent reads the actual contents with the regular
   fs tools. Avoids prompt-assembly file I/O and keeps the model-visible text
   stable for request caching.
3. **`defineTool` enforces required parameters**, so the tools drop the
   defensive `?? ''` fallbacks (unreachable after validation) — the coverage
   gate forced the discovery.
4. **OpenClaw's dated-note shape simplified to one append-only `notes.md`**
   with timestamped lines; recall is a substring filter over the tail,
   newest first (append-only assumption).

## Deferred

- Real-composition boot test is still owed per the product-visible-plugin
  policy; unit coverage is 100% on all four metrics.
- Read-modify-write `note_append` can race under concurrent appends.
