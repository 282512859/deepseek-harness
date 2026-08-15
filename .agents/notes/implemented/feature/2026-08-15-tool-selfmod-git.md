# Feature: tool-selfmod-git (agent-side git versioning for self-modification)

Date: 2026-08-15
Status: implemented (new package, additive)

## What

Two model-facing tools, `selfmod_commit` and `selfmod_rollback`, giving the
agent git versioning over its own self-modification drift (workspace/plugins/
cordis edits). Distilled from DeepClaw's auto-commit + `/rollback` into the
harness-native shape: tools whose git runs go through the shell seam.

## Decisions worth keeping

1. **Shell seam, never raw child processes.** Every git command runs through
   `ctx.shell.resolve` + `ctx.shell.run`, so the mounted sandbox and approval
   policy confine self-modification exactly like `bash`. A raw
   `node:child_process` git would bypass confinement.
2. **Pure command builders + exit classifiers.** `commitCommands`,
   `rollbackCommands`, `classifyCommit`, `classifyRollback`, `parseHead`, and
   `assertRepo` are exported pure functions; the 13 unit tests cover the
   sequences, the nothing-to-commit no-op, repo-guard failure, abort surfacing,
   and rollback, without a real shell.
3. **Coverage exemption is by design.** `vitest.config.ts` excludes
   `packages/self-modification/*/src/**` from the per-file coverage gate
   ("covered by focused lifecycle tests and assembled application checks");
   this package follows the group's quality bar (focused unit tests + the
   promised assembled check), not the per-file gate.
4. **Rollback discards tracked drift only** (`reset --hard HEAD`, no
   `git clean`), matching DeepClaw semantics where untracked files survive.

## Deferred

- Thread the real session into `sandboxPolicy.resolve` for agent-less calls.
- An assembled-application check (a real cordis boot with a stub shell) is
  still owed per the group's policy; unit tests are the current evidence.
