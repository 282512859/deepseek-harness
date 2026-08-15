# @deepseek-ai/dsh-tool-selfmod-git

Model-facing git versioning for self-modification: `selfmod_commit` stages and
commits the session workspace's drift, `selfmod_rollback` discards uncommitted
drift back to HEAD. Every git run goes through the shell seam (`ctx.shell`), so
the mounted sandbox and approval policy confine each command exactly like
`bash`; nothing spawns a raw child process.

## Composition

```yaml
- id: tool-selfmod-git
  name: '@deepseek-ai/dsh-tool-selfmod-git'
  config:
    addArgs: ['-A']
    commitPrefix: 'agent: '
    timeoutMs: 60000
```

The session workspace must be a git repository; `git rev-parse` guards every
operation and fails loud otherwise.

## Model experience

Two tools:

- `selfmod_commit {message?}` — `git add <addArgs>` then
  `git commit -m "<prefix><message>"`; a "nothing to commit" exit reports a
  no-op, not a failure. Returns `{committed, head, detail}`.
- `selfmod_rollback` — `git reset --hard HEAD`; untracked files survive (no
  `git clean`). Returns `{ok, head, detail}`.

No prompt section: the tool descriptions are the whole model-facing contract.

## Known limitations and deferred work

- The `sandboxPolicy` scope resolution passes `{session: undefined}` for
  agent-less calls; a future layer can thread the actual session.
- Commit identity comes from the repository's git config, not from the agent.
