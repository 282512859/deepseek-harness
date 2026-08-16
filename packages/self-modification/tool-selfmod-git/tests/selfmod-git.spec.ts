import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply, assertRepo, classifyCommit, classifyRollback, commitCommands,
  parseHead, rollbackCommands, type ShellSeam,
} from '../src/index.ts'

function stubCtx(register: (def: unknown) => void, shell?: unknown, shellEnv?: unknown): Context {
  return { tools: { register }, shell, shellEnv, get: () => undefined } as unknown as Context
}

/** Canned shell seam: returns the given results per sequential run, real ShellRunResult shape. */
function stubShell(results: Array<{ exitCode: number; stdout?: string; stderr?: string; aborted?: boolean }>): {
  seam: ShellSeam
  commands: string[]
} {
  const commands: string[] = []
  let i = 0
  const seam: ShellSeam = {
    resolve: request => request,
    run: async (spec) => {
      commands.push(String((spec as { command?: unknown }).command ?? ''))
      const r = results[i++] ?? { exitCode: 1, stderr: 'unexpected call' }
      return {
        exitCode: r.exitCode,
        signal: null,
        timedOut: false,
        aborted: r.aborted ?? false,
        timeoutMs: 60000,
        stdout: { text: r.stdout ?? '', truncated: false },
        stderr: { text: r.stderr ?? '', truncated: false },
      }
    },
  }
  return { seam, commands }
}

function regs() {
  const captured: Array<Record<string, unknown>> = []
  const reg = (def: unknown) => { captured.push(def as Record<string, unknown>) }
  return { captured, reg }
}

describe('command builders', () => {
  it('builds the commit sequence with an escaped message', () => {
    const cmds = commitCommands('say "hi"', ['-A'], 'agent: ')
    expect(cmds).toHaveLength(4)
    expect(cmds[0]).toBe('git rev-parse --is-inside-work-tree')
    expect(cmds[1]).toBe('git add -A')
    expect(cmds[2]).toContain('agent: say \\"hi\\"')
    expect(cmds[3]).toBe('git log -1 --format=%s')
  })

  it('builds the rollback sequence', () => {
    expect(rollbackCommands()).toEqual([
      'git rev-parse --is-inside-work-tree',
      'git reset --hard HEAD',
      'git log -1 --format=%s',
    ])
  })
})

describe('classifiers', () => {
  it('classifyCommit maps success, no-op, and failure', () => {
    expect(classifyCommit(0, '', 'fix').committed).toBe(true)
    expect(classifyCommit(1, 'nothing to commit', '').committed).toBe(false)
    expect(() => classifyCommit(2, 'boom', '')).toThrow('git exited 2')
  })

  it('classifyRollback maps success and failure', () => {
    expect(classifyRollback(0, 'fix').ok).toBe(true)
    expect(() => classifyRollback(3, '')).toThrow('git exited 3')
  })
})

describe('parseHead and assertRepo', () => {
  it('parses the first log line and trims noise', () => {
    expect(parseHead('fix: thing\n')).toBe('fix: thing')
    expect(parseHead('   ')).toBeNull()
    expect(parseHead('')).toBeNull()
  })

  it('assertRepo throws when rev-parse fails', () => {
    expect(() => assertRepo({ exitCode: 128, signal: null, timedOut: false, aborted: false, timeoutMs: 60000, stdout: { text: '', truncated: false }, stderr: { text: 'not a repository', truncated: false } }))
      .toThrow('not a git repository')
    expect(() => assertRepo({ exitCode: 0, signal: null, timedOut: false, aborted: false, timeoutMs: 60000, stdout: { text: 'true', truncated: false }, stderr: { text: '', truncated: false } })).not.toThrow()
  })
})

describe('registered execute flows', () => {
  it('selfmod_commit runs the sequence and reports the committed head', async () => {
    const results = [
      { exitCode: 0, stdout: 'true' },
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'agent: fix\n' },
    ]
    const { seam, commands } = stubShell(results)
    const { captured, reg } = regs()
    apply(stubCtx(reg, seam, { collect: () => ({}) }), {})
    const commitTool = captured.find(d => d.name === 'selfmod_commit')
    const out = await (commitTool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { message: 'fix' }, { signal: new AbortController().signal })
    expect(commands[0]).toContain('rev-parse')
    expect(commands[2]).toContain('git commit -m "agent: fix"')
    expect(out).toMatchObject({ committed: true, head: 'agent: fix' })
  })

  it('selfmod_commit reports the nothing-to-commit no-op', async () => {
    const results = [
      { exitCode: 0, stdout: 'true' },
      { exitCode: 0 },
      { exitCode: 1, stderr: 'nothing to commit, working tree clean' },
    ]
    const { seam } = stubShell(results)
    const { captured, reg } = regs()
    apply(stubCtx(reg, seam, { collect: () => ({}) }), {})
    const commitTool = captured.find(d => d.name === 'selfmod_commit')
    const out = await (commitTool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      {}, { signal: new AbortController().signal })
    expect(out).toMatchObject({ committed: false, detail: 'no changes to commit' })
  })

  it('selfmod_commit fails loud outside a repository', async () => {
    const results = [{ exitCode: 128, stderr: 'not a git repository' }]
    const { seam } = stubShell(results)
    const { captured, reg } = regs()
    apply(stubCtx(reg, seam, { collect: () => ({}) }), {})
    const commitTool = captured.find(d => d.name === 'selfmod_commit')
    await expect((commitTool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      {}, { signal: new AbortController().signal }))
      .rejects.toThrow('not a git repository')
  })

  it('selfmod_commit surfaces an aborted shell call', async () => {
    const results = [
      { exitCode: 0, stdout: 'true' },
      { exitCode: 0, aborted: true },
    ]
    const { seam } = stubShell(results)
    const { captured, reg } = regs()
    apply(stubCtx(reg, seam, { collect: () => ({}) }), {})
    const commitTool = captured.find(d => d.name === 'selfmod_commit')
    await expect((commitTool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      {}, { signal: new AbortController().signal }))
      .rejects.toThrow('aborted')
  })

  it('selfmod_rollback resets and reports the new head', async () => {
    const results = [
      { exitCode: 0, stdout: 'true' },
      { exitCode: 0 },
      { exitCode: 0, stdout: 'after reset\n' },
    ]
    const { seam, commands } = stubShell(results)
    const { captured, reg } = regs()
    apply(stubCtx(reg, seam, { collect: () => ({}) }), {})
    const tool = captured.find(d => d.name === 'selfmod_rollback')
    const out = await (tool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      {}, { signal: new AbortController().signal })
    expect(commands[1]).toBe('git reset --hard HEAD')
    expect(out).toMatchObject({ ok: true, head: 'after reset' })
  })

  it('registers both tools with schemas and renders', () => {
    const { captured, reg } = regs()
    apply(stubCtx(reg, stubShell([]).seam, { collect: () => ({}) }), {})
    expect(captured.map(d => d.name).sort()).toEqual(['selfmod_commit', 'selfmod_rollback'])
    const commit = captured.find(d => d.name === 'selfmod_commit')
    const output = commit?.output as { schema: { required: string[] } }
    expect(output.schema.required).toEqual(['committed', 'head', 'detail'])
    const render = commit?.output as { render: (a: unknown, v: unknown) => unknown[] }
    expect((render.render({}, { committed: true, head: 'h', detail: 'd' })[0] as { text: string }).text)
      .toContain('selfmod_commit: d')
  })
})

describe('invariant companion', () => {
  it('registers the package with the invariant service', async () => {
    const installed: Array<[string, unknown]> = []
    const ctx = { invariants: { register: (name: string, installer: unknown) => {
      installed.push([name, installer]); return () => undefined
    } } }
    const mod = await import('../src/invariant.ts')
    const disposer = await mod.apply(ctx as never)
    expect(installed[0]?.[0]).toBe('@deepseek-ai/dsh-tool-selfmod-git')
    expect(typeof disposer).toBe('function')
    const installer = installed[0]?.[1] as () => void
    installer()
  })
})
