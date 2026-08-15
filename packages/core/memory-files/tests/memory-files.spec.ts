import { describe, expect, it } from 'vitest'
import { sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply, appendNoteLine, memoryRootPath, memorySectionText,
  recallNotes, validateMemoryFile, type FsSeam,
} from '../src/index.ts'

function stubCtx(
  register: (def: unknown) => void,
  section: (opts: unknown) => void,
  fs: unknown,
  effect?: (fn: () => unknown, label: string) => void,
  noPolicy = false,
): Context {
  return {
    tools: { register },
    systemPrompt: { section },
    fs,
    get: (name: string) => (name === 'sandboxPolicy' && !noPolicy
      ? { resolve: () => ({ workspaceRoot: '/ws' }) }
      : undefined),
    effect: effect ?? ((fn: () => unknown) => { fn(); return () => undefined }),
  } as unknown as Context
}

/** In-memory fs seam with a fake virtual dir for the memory root. */
function stubFs(initial: Record<string, string> = {}): {
  fs: FsSeam
  files: Map<string, string>
} {
  const files = new Map(Object.entries(initial))
  const rootTarget = { kind: 'dir' }
  const fs: FsSeam = {
    resolve: async (path, opts) => {
      const cwd = (opts?.cwd as string | undefined) ?? ''
      if (cwd === '') return rootTarget  // root resolve
      const key = (cwd + '/' + String(path)).replaceAll('\\', '/')
      return { kind: 'file', path: key }
    },
    readText: async (target) => {
      const p = (target as { path?: string }).path ?? ''
      if (!files.has(p)) throw new Error('ENOENT')
      return files.get(p) as string
    },
    writeText: async (target, content) => {
      const p = (target as { path?: string }).path ?? ''
      files.set(p, content)
      return { version: 1 }
    },
  }
  return { fs, files }
}

function regs() {
  const captured: Array<Record<string, unknown>> = []
  const sections: Array<Record<string, unknown>> = []
  const reg = (def: unknown) => { captured.push(def as Record<string, unknown>) }
  const section = (opts: unknown) => { sections.push(opts as Record<string, unknown>) }
  return { captured, sections, reg, section }
}

describe('pure helpers', () => {
  it('validateMemoryFile accepts allowlisted basenames and rejects traversal', () => {
    expect(validateMemoryFile('IDENTITY.md', ['IDENTITY.md', 'SOUL.md'])).toBe('IDENTITY.md')
    expect(() => validateMemoryFile('../evil.md', ['IDENTITY.md'])).toThrow('invalid memory file')
    expect(() => validateMemoryFile('a/b.md', ['b.md'])).toThrow('invalid memory file')
    expect(() => validateMemoryFile('SECRET.md', ['IDENTITY.md'])).toThrow('not in the memory allowlist')
  })

  it('appendNoteLine stamps and joins lines', () => {
    const now = new Date(2026, 7, 15, 9, 5)
    expect(appendNoteLine('', 'first', now)).toBe('- 2026-08-15 09:05 first')
    const next = appendNoteLine('- 2026-08-15 09:05 first', 'second\nline', now)
    expect(next).toBe('- 2026-08-15 09:05 first\n- 2026-08-15 09:05 second line')
  })

  it('recallNotes filters, caps, and reverses (append-only files, newest first)', () => {
    const content = '- 2026-08-13 a\n- 2026-08-14 b\n- 2026-08-15 a'
    expect(recallNotes(content, 'a', 10)).toEqual(['- 2026-08-15 a', '- 2026-08-13 a'])
    expect(recallNotes(content, undefined, 2)).toEqual(['- 2026-08-15 a', '- 2026-08-14 b'])
    expect(recallNotes('', 'x', 5)).toEqual([])
  })

  it('memoryRootPath and memorySectionText compose', () => {
    expect(memoryRootPath('/ws', { root: 'memory', files: [], notesFile: 'n.md', sectionOrder: 0 }))
      .toContain(`${sep}memory`)
    const text = memorySectionText(['IDENTITY.md'], 'notes.md')
    expect(text).toContain('IDENTITY.md')
    expect(text).toContain('note_recall')
  })
})

describe('registration', () => {
  it('registers the prompt section and three tools', () => {
    const { captured, sections, reg, section } = regs()
    apply(stubCtx(reg, section, stubFs().fs), {})
    expect(captured.map(d => d.name).sort())
      .toEqual(['memory_write', 'note_append', 'note_recall'])
    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe('memory-files')
    expect(String(sections[0]?.text)).toContain('memory_write')
  })

  it('sections register through the effect with a label', () => {
    const labels: string[] = []
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, stubFs().fs, (fn, label) => {
      labels.push(label); fn(); return () => undefined
    }), {})
    expect(labels).toEqual(['memory-files.section()'])
    expect(captured).toHaveLength(3)
  })
})

describe('memory_write', () => {
  async function writeWith(files: Record<string, string>): Promise<{
    out: Record<string, unknown>
    files: Map<string, string>
  }> {
    const { fs, files: map } = stubFs(files)
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, fs), {})
    const tool = captured.find(d => d.name === 'memory_write')
    const out = await (tool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { file: 'SOUL.md', content: 'be concise' },
      { signal: new AbortController().signal })
    return { out: out as Record<string, unknown>, files: map }
  }

  it('writes the file under the memory root and reports chars', async () => {
    const { out, files } = await writeWith({})
    expect(out).toMatchObject({ written: true, file: 'SOUL.md', chars: 10 })
    expect(files.get('/ws/memory/SOUL.md')).toBe('be concise')
  })

  it('rejects files outside the allowlist', async () => {
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, stubFs().fs), {})
    const tool = captured.find(d => d.name === 'memory_write')
    await expect((tool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { file: '../x.md', content: 'x' }, { signal: new AbortController().signal }))
      .rejects.toThrow('invalid memory file')
  })
})

describe('note_append and note_recall', () => {
  it('appends to an existing notes file and recalls with a query', async () => {
    const { fs, files } = stubFs({ '/ws/memory/notes.md': '- 2026-08-14 old' })
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, fs), {})
    const append = captured.find(d => d.name === 'note_append')
    const appendOut = await (append?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { note: 'remember x' }, { signal: new AbortController().signal })
    expect(appendOut).toMatchObject({ appended: true, file: 'notes.md' })
    const content = files.get('/ws/memory/notes.md') as string
    expect(content).toContain('- 2026-08-14 old')
    expect(content).toContain('remember x')

    const recall = captured.find(d => d.name === 'note_recall')
    const recallOut = await (recall?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { query: 'remember' }, { signal: new AbortController().signal })
    const r = recallOut as { total: number; notes: string[] }
    expect(r.total).toBe(1)
    expect(r.notes[0]).toContain('remember x')
  })

  it('creates the notes file from scratch and recalls the latest without a query', async () => {
    const { fs, files } = stubFs({})
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, fs), {})
    const append = captured.find(d => d.name === 'note_append')
    await (append?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { note: 'first' }, { signal: new AbortController().signal })
    expect(files.get('/ws/memory/notes.md')).toContain('first')

    const recall = captured.find(d => d.name === 'note_recall')
    const out = await (recall?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      {}, { signal: new AbortController().signal })
    expect((out as { notes: string[] }).notes).toHaveLength(1)
  })

  it('honors a caller limit and a non-positive limit falls back', async () => {
    const { fs } = stubFs({ '/ws/memory/notes.md': '- a\n- b\n- c' })
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, fs), {})
    const recall = captured.find(d => d.name === 'note_recall')
    const exec = recall?.execute as (a: unknown, e: unknown) => Promise<unknown>
    const one = await exec({ limit: 1 }, { signal: new AbortController().signal })
    expect((one as { notes: string[] }).notes).toEqual(['- c'])
    const zero = await exec({ limit: 0 }, { signal: new AbortController().signal })
    expect((zero as { notes: string[] }).notes).toHaveLength(3)
  })
  it('rejects an empty note and recalls nothing when the file is missing', async () => {
    const { fs } = stubFs({})
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, fs), {})
    const append = captured.find(d => d.name === 'note_append')
    await expect((append?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { note: '   ' }, { signal: new AbortController().signal })).rejects.toThrow('empty note')

    const recall = captured.find(d => d.name === 'note_recall')
    const out = await (recall?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      {}, { signal: new AbortController().signal })
    expect((out as { total: number }).total).toBe(0)
  })
})

describe('edge coverage', () => {
  it('renders all three tool outputs', () => {
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, stubFs().fs), {})
    const render = (name: string, value: unknown) => {
      const tool = captured.find(d => d.name === name)
      const r = tool?.output as { render: (a: unknown, v: unknown) => unknown[] }
      return r.render({}, value)[0] as { text: string }
    }
    expect(render('memory_write', { written: true, file: 'SOUL.md', chars: 1 }).text).toContain('memory_write:')
    expect(render('note_append', { appended: true, file: 'notes.md', chars: 1 }).text).toContain('note_append:')
    expect(render('note_recall', { total: 1, notes: ['n'] }).text).toContain('note_recall:')
  })

  it('falls back to process.cwd() without a sandbox policy', async () => {
    const { fs } = stubFs({})
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, fs, undefined, true), {})
    const tool = captured.find(d => d.name === 'memory_write')
    const out = await (tool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { file: 'SOUL.md', content: 'x' }, { agent: {}, signal: new AbortController().signal })
    expect(out).toMatchObject({ written: true, file: 'SOUL.md' })
  })

  it('accepts an agent scope for the policy branch', async () => {
    const { fs } = stubFs({})
    const { captured, reg, section } = regs()
    apply(stubCtx(reg, section, fs), {})
    const tool = captured.find(d => d.name === 'memory_write')
    const out = await (tool?.execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { file: 'SOUL.md', content: 'x' }, { agent: {}, signal: new AbortController().signal })
    expect(out).toMatchObject({ written: true, chars: 1 })
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
    expect(installed[0]?.[0]).toBe('@deepseek-ai/dsh-memory-files')
    expect(typeof disposer).toBe('function')
    const installer = installed[0]?.[1] as () => void
    installer()
  })
})
