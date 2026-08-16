/**
 * Model-facing git versioning for self-modification: `selfmod_commit` stages
 * and commits the session workspace's drift, `selfmod_rollback` discards
 * uncommitted drift back to HEAD. All git runs go through the shell seam
 * (`ctx.shell`), so the mounted sandbox and approval policy confine every
 * command exactly like `bash`; nothing spawns a raw child process here.
 * @module @deepseek-ai/dsh-tool-selfmod-git
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, TOOL_ABORTED, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-shell-env'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-selfmod-git'

/** Services required by the tool registry and the shell seam. */
export const inject = ['tools', 'shell', 'shellEnv']

/** Plugin config. */
export interface Config {
  /** `git add` arguments; `-A` stages everything. */
  addArgs?: string[]
  /** Commit message prefix naming the author as the agent. */
  commitPrefix?: string
  /** Per-shell-command timeout. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  addArgs: z.array(z.string()).default(['-A']),
  commitPrefix: z.string().default('agent: '),
  timeoutMs: z.natural().default(60000),
})

/** Resolved config type. */
export type ResolvedConfig = Required<Config>

/** Commit tool outcome. */
export interface CommitResult {
  committed: boolean
  head: string
  detail: string
}

/** Rollback tool outcome. */
export interface RollbackResult {
  ok: boolean
  head: string
  detail: string
}

/** The git command sequence for one operation (pure, unit-testable). */
export function commitCommands(message: string, addArgs: string[], prefix: string): string[] {
  return [
    'git rev-parse --is-inside-work-tree',
    `git add ${addArgs.join(' ')}`,
    `git commit -m "${prefix}${message.replace(/"/g, '\\"')}"`,
    'git log -1 --format=%s',
  ]
}

/** The git command sequence for rollback. */
export function rollbackCommands(): string[] {
  return ['git rev-parse --is-inside-work-tree', 'git reset --hard HEAD', 'git log -1 --format=%s']
}

/**
 * Map a commit run's exit to the tool outcome.
 * @param code - the shell exit code.
 * @param stderr - the captured stderr (exit 1 with "nothing to commit" is a no-op, not a failure).
 * @param head - the resulting HEAD subject when the commit landed.
 */
export function classifyCommit(code: number, stderr: string, head: string): CommitResult {
  if (code === 0) {
    return { committed: true, head, detail: `committed: ${head ?? '?'}` }
  }
  if (code === 1 && stderr.includes('nothing to commit')) {
    return { committed: false, head, detail: 'no changes to commit' }
  }
  throw new Error(`selfmod_commit: git exited ${code}: ${stderr.trim()}`)
}

/**
 * Map a rollback run's exit to the tool outcome.
 * @param code - the shell exit code.
 * @param head - the resulting HEAD subject after the reset.
 */
export function classifyRollback(code: number, head: string): RollbackResult {
  if (code === 0) {
    return { ok: true, head, detail: `reset to HEAD: ${head ?? '?'}` }
  }
  throw new Error(`selfmod_rollback: git exited ${code}`)
}

/** Strip trailing newline and quote noise from `git log --format=%s` output. */
export function parseHead(stdout: string): string | null {
  const line = stdout.split('\n')[0]?.trim() ?? ''
  return line.length > 0 ? line : null
}

/** The shell seam face the tool needs (a stub in unit tests). */
export interface ShellSeam {
  resolve(request: Record<string, unknown>): Record<string, unknown>
  run(spec: Record<string, unknown>): Promise<ShellRunResult>
}

/** Run one command through the seam and return the raw result. */
export async function runOne(
  shell: ShellSeam,
  command: string,
  timeoutMs: number,
  dshEnv: Record<string, string>,
  policy: SandboxExecutionPolicy | undefined,
  signal: AbortSignal,
): Promise<ShellRunResult> {
  const result = await shell.run(shell.resolve({
    command,
    timeoutMs,
    dshEnv,
    ...policy !== undefined ? { sandboxPolicy: policy } : {},
    signal,
  }))
  if (result.aborted) {
    const error = new Error('selfmod: tool call aborted')
    error.name = TOOL_ABORTED
    throw error
  }
  return result
}

/** Guard: the session workspace must be a git repository. */
export function assertRepo(result: ShellRunResult): void {
  if (result.exitCode !== 0) {
    throw new Error('selfmod: session workspace is not a git repository (git rev-parse failed)')
  }
}

/** Register the `selfmod_commit` and `selfmod_rollback` tools. */
export function apply(ctx: Context, config: Config): void {
  // schemastery 在 Loader 装配时填默认值；直接调用（测试/裸组合）时兜底
  const resolved: ResolvedConfig = {
    addArgs: config.addArgs ?? ['-A'],
    commitPrefix: config.commitPrefix ?? 'agent: ',
    timeoutMs: config.timeoutMs ?? 60000,
  }
  const sandboxPolicy = ctx.get('sandboxPolicy') as
    | { resolve: (scope: { session?: unknown }) => SandboxExecutionPolicy | undefined }
    | undefined

  const policyFor = (exec: { agent?: unknown }): SandboxExecutionPolicy | undefined =>
    sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: undefined })

  // 数组索引保证存在（构建器恒返回 4/3 项）；避免 lint 禁用的非空断言
  const cmd = (list: string[], i: number): string => list[i] as string

  const runOneFor = async (command: string, exec: ToolExecution): Promise<ShellRunResult> =>
    runOne(ctx.shell as unknown as ShellSeam, command,
      resolved.timeoutMs, ctx.shellEnv.collect(exec), policyFor(exec), exec.signal)

  ctx.tools.register(defineTool({
    name: 'selfmod_commit',
    description:
      'Stage and commit the session workspace drift (self-modification versioning). '
      + 'Run this after writing workspace/plugins/cordis changes; requires the workspace to be a git repository.',
    parameters: {
      message: { type: 'string', description: 'Commit message; defaults to a timestamped auto message.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          committed: { type: 'boolean', required: true },
          head: { type: 'string', required: true },
          detail: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `selfmod_commit: ${value.detail}` }],
    },
    execute: async (args, exec) => {
      const message = typeof args.message === 'string' && args.message.length > 0
        ? args.message : `auto ${new Date().toISOString()}`
      const commands = commitCommands(message, resolved.addArgs, resolved.commitPrefix)
      const guard = await runOneFor(cmd(commands, 0), exec)
      assertRepo(guard)
      await runOneFor(cmd(commands, 1), exec)
      const commit = await runOneFor(cmd(commands, 2), exec)
      let head = ''
      if (commit.exitCode === 0) {
        const log = await runOneFor(cmd(commands, 3), exec)
        head = parseHead(log.stdout?.text ?? '') ?? ''
      }
      return classifyCommit(commit.exitCode ?? -1, commit.stderr?.text ?? '', head)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'selfmod_rollback',
    description:
      'Discard uncommitted drift in the session workspace back to the last commit (git reset --hard HEAD). '
      + 'Use it to revert an agent self-modification that went wrong.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          head: { type: 'string', required: true },
          detail: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `selfmod_rollback: ${value.detail}` }],
    },
    execute: async (_args, exec) => {
      const commands = rollbackCommands()
      const guard = await runOneFor(cmd(commands, 0), exec)
      assertRepo(guard)
      const reset = await runOneFor(cmd(commands, 1), exec)
      let head = ''
      if (reset.exitCode === 0) {
        const log = await runOneFor(cmd(commands, 2), exec)
        head = parseHead(log.stdout?.text ?? '') ?? ''
      }
      return classifyRollback(reset.exitCode ?? -1, head)
    },
  }))
}
