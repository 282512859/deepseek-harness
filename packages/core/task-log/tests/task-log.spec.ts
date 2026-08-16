import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  applyTaskUpdate,
  createTask,
  filterByStatus,
  parseTaskRecord,
  sortTasksByUpdated,
  taskFileName,
  taskRootPath,
  taskSectionText,
  validateTaskId,
} from '../src/index.ts'

const t = (iso: string): Date => new Date(iso)

describe('validateTaskId', () => {
  it('accepts ids matching the strict pattern', () => {
    expect(validateTaskId('task-123')).toBe('task-123')
    expect(validateTaskId('a0')).toBe('a0')
  })

  it('rejects traversal, uppercase, and malformed ids', () => {
    expect(() => validateTaskId('../evil')).toThrow()
    expect(() => validateTaskId('Task-1')).toThrow()
    expect(() => validateTaskId('a b')).toThrow()
    expect(() => validateTaskId('-lead')).toThrow()
    expect(() => validateTaskId('')).toThrow()
    expect(() => validateTaskId('a'.repeat(65))).toThrow()
  })
})

describe('taskFileName', () => {
  it('appends the json suffix after validation', () => {
    expect(taskFileName('task-1')).toBe('task-1.json')
    expect(() => taskFileName('../x')).toThrow()
  })
})

describe('createTask', () => {
  it('builds an open task with a millisecond id and equal timestamps', () => {
    const record = createTask('  Do the thing  ', t('2026-08-16T10:00:00.123Z'))
    expect(record.id).toBe('task-1786874400123')
    expect(record.title).toBe('Do the thing')
    expect(record.status).toBe('open')
    expect(record.created).toBe('2026-08-16T10:00:00.123Z')
    expect(record.updated).toBe(record.created)
    expect(record.notes).toEqual([])
  })
})

describe('applyTaskUpdate', () => {
  const record = createTask('T', t('2026-08-16T10:00:00.000Z'))

  it('changes the status and bumps updated', () => {
    const next = applyTaskUpdate(record, { status: 'done' }, t('2026-08-16T11:00:00.000Z'))
    expect(next.status).toBe('done')
    expect(next.updated).toBe('2026-08-16T11:00:00.000Z')
    expect(record.status).toBe('open')
  })

  it('appends a trimmed note', () => {
    const next = applyTaskUpdate(record, { note: '  first note  ' }, t('2026-08-16T11:00:00.000Z'))
    expect(next.notes).toEqual(['first note'])
    expect(record.notes).toEqual([])
  })

  it('applies status and note together', () => {
    const next = applyTaskUpdate(record, { status: 'blocked', note: 'waiting' }, t('2026-08-16T11:00:00.000Z'))
    expect(next.status).toBe('blocked')
    expect(next.notes).toEqual(['waiting'])
  })

  it('rejects invalid status, empty note, and empty updates', () => {
    expect(() => applyTaskUpdate(record, { status: 'flying' }, t('2026-08-16T11:00:00Z'))).toThrow(/invalid status/)
    expect(() => applyTaskUpdate(record, { note: '   ' }, t('2026-08-16T11:00:00Z'))).toThrow(/empty note/)
    expect(() => applyTaskUpdate(record, {}, t('2026-08-16T11:00:00Z'))).toThrow(/nothing to update/)
  })
})

describe('sortTasksByUpdated and filterByStatus', () => {
  it('sorts newest first without mutating input', () => {
    const older = createTask('a', t('2026-08-15T10:00:00Z'))
    const newer = createTask('b', t('2026-08-16T10:00:00Z'))
    const sorted = sortTasksByUpdated([older, newer])
    expect(sorted.map(r => r.id)).toEqual([newer.id, older.id])
    expect([older, newer].map(r => r.id)).toEqual([older.id, newer.id])
  })

  it('filters by status and keeps everything without a filter', () => {
    const open = createTask('a', t('2026-08-16T10:00:00Z'))
    const done = applyTaskUpdate(open, { status: 'done' }, t('2026-08-16T11:00:00Z'))
    expect(filterByStatus([open, done], 'done').map(r => r.id)).toEqual([done.id])
    expect(filterByStatus([open, done], undefined).length).toBe(2)
  })
})

describe('parseTaskRecord', () => {
  it('parses a valid record', () => {
    const record = createTask('T', t('2026-08-16T10:00:00Z'))
    expect(parseTaskRecord(JSON.stringify(record))).toEqual(record)
  })

  it('rejects malformed content', () => {
    expect(parseTaskRecord('{broken')).toBeUndefined()
    expect(parseTaskRecord('null')).toBeUndefined()
    expect(parseTaskRecord(JSON.stringify({ id: 'x' }))).toBeUndefined()
    expect(parseTaskRecord(JSON.stringify({ ...createTask('T', t('2026-08-16T10:00:00Z')), status: 'flying' }))).toBeUndefined()
    expect(parseTaskRecord(JSON.stringify({ ...createTask('T', t('2026-08-16T10:00:00Z')), notes: [1] }))).toBeUndefined()
    expect(parseTaskRecord(JSON.stringify({ id: 'a', title: 'T', status: 'open', notes: [] }))).toBeUndefined()
  })
})

describe('taskSectionText and taskRootPath', () => {
  it('names the convention', () => {
    const text = taskSectionText('tasks')
    expect(text).toContain('task_start')
    expect(text).toContain('task_update')
    expect(text).toContain('task_list')
    expect(text).toContain('tasks/')
  })

  it('joins the root path', () => {
    expect(taskRootPath('/ws', { root: 'tasks', sectionOrder: 57, maxList: 100 })).toBe(join('/ws', 'tasks'))
  })
})

describe('apply', () => {
  interface ToolDef {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: { render: (args: unknown, value: unknown) => unknown[] }
    execute: (args: Record<string, unknown>, exec: { agent?: unknown }) => Promise<unknown>
  }

  const fs = {
    resolve: vi.fn(async (path: string) => ({ rel: path })),
    readText: vi.fn(async (_target: unknown) => ''),
    writeText: vi.fn(async (_target: unknown, _content: string) => undefined),
    listDir: vi.fn(async () => [] as Array<{ name: string; type: string }>),
  }

  function makeCtx() {
    const sections: Array<{ name: string }> = []
    const tools: ToolDef[] = []
    const ctx = {
      get: () => undefined as unknown,
      effect: (fn: () => unknown) => fn(),
      systemPrompt: { section: (s: { name: string }) => { sections.push(s); return () => undefined } },
      tools: { register: (d: ToolDef) => { tools.push(d) } },
      fs,
    }
    return { ctx, sections, tools }
  }

  function registered(tools: ToolDef[], name: string): ToolDef {
    const def = tools.find(x => x.name === name)
    if (def === undefined) throw new Error(`tool ${name} not registered`)
    return def
  }

  it('registers the prompt section and all four tools', () => {
    const { ctx, sections, tools } = makeCtx()
    apply(ctx as never, {})
    expect(sections).toHaveLength(1)
    expect(sections[0]!.name).toBe('task-log')
    expect(tools.map(x => x.name)).toEqual(['task_start', 'task_update', 'task_list', 'task_show'])
  })

  it('task_start writes an open task and returns it', async () => {
    const { ctx, tools } = makeCtx()
    apply(ctx as never, {})
    const result = (await registered(tools, 'task_start').execute({ title: 'Build X' }, { agent: undefined })) as { id: string; title: string; status: string; notes: string[] }
    expect(result.status).toBe('open')
    expect(result.title).toBe('Build X')
    expect(result.notes).toEqual([])
    expect(registered(tools, 'task_start').output.render({}, result)[0]).toMatchObject({ type: 'text' })
    expect(fs.writeText).toHaveBeenCalledTimes(1)
    const [target, content] = fs.writeText.mock.calls[0]!
    expect(String((target as { rel?: string }).rel)).toBe(`${result.id}.json`)
    expect(JSON.parse(String(content)).id).toBe(result.id)
  })

  it('task_start includes an initial note and rejects empty titles', async () => {
    const { ctx, tools } = makeCtx()
    apply(ctx as never, {})
    const withNote = (await registered(tools, 'task_start').execute({ title: 'T', note: 'kickoff' }, { agent: undefined })) as { notes: string[] }
    expect(withNote.notes).toEqual(['kickoff'])
    await expect(registered(tools, 'task_start').execute({ title: '   ' }, { agent: undefined }))
      .rejects.toThrow(/empty title/)
  })

  it('task_update applies status and note and persists', async () => {
    fs.readText.mockResolvedValue(JSON.stringify({
      id: 'task-1', title: 'T', status: 'open', created: '2026-08-16T10:00:00.000Z',
      updated: '2026-08-16T10:00:00.000Z', notes: [],
    }))
    fs.writeText.mockClear()
    const { ctx, tools } = makeCtx()
    apply(ctx as never, {})
    const result = (await registered(tools, 'task_update').execute({ id: 'task-1', status: 'in-progress', note: 'started' }, { agent: undefined })) as { id: string; status: string; notes: string[]; updated: string }
    expect(result.status).toBe('in-progress')
    expect(result.notes).toEqual(['started'])
    registered(tools, 'task_update').output.render({}, result)
    const [, content] = fs.writeText.mock.calls[0]!
    expect(JSON.parse(String(content)).status).toBe('in-progress')
  })

  it('task_update rejects empty updates, bad ids, and corrupt files', async () => {
    fs.readText.mockResolvedValue('{broken')
    const { ctx, tools } = makeCtx()
    apply(ctx as never, {})
    await expect(registered(tools, 'task_update').execute({ id: 'task-1' }, { agent: undefined }))
      .rejects.toThrow(/corrupt/)
    await expect(registered(tools, 'task_update').execute({ id: '../x' }, { agent: undefined }))
      .rejects.toThrow(/invalid task id/)
    fs.readText.mockResolvedValue(JSON.stringify({ id: 'task-1', title: 'T', status: 'open', created: 'c', updated: 'u', notes: [] }))
    await expect(registered(tools, 'task_update').execute({ id: 'task-1' }, { agent: undefined }))
      .rejects.toThrow(/nothing to update/)
  })

  it('task_list reads json files, skips corrupt entries, sorts, and caps', async () => {
    fs.listDir.mockResolvedValue([
      { name: 'task-2.json', type: 'file' },
      { name: 'task-1.json', type: 'file' },
      { name: 'readme.txt', type: 'file' },
      { name: 'sub', type: 'directory' },
    ])
    fs.readText.mockImplementation(async (target: unknown) => {
      const rel = String((target as { rel?: string }).rel ?? '')
      if (rel === 'task-2.json') return JSON.stringify({ id: 'task-2', title: 'Newer', status: 'open', created: '2026-08-16T10:00:00Z', updated: '2026-08-16T10:00:00Z', notes: [] })
      if (rel === 'task-1.json') return '{broken'
      return ''
    })
    const { ctx, tools } = makeCtx()
    apply(ctx as never, { maxList: 1 })
    const result = (await registered(tools, 'task_list').execute({}, { agent: undefined })) as { total: number; tasks: Array<{ id: string }> }
    expect(result.total).toBe(1)
    expect(result.tasks[0]!.id).toBe('task-2')
    registered(tools, 'task_list').output.render({}, result)

    fs.readText.mockImplementation(async (target: unknown) => {
      const rel = String((target as { rel?: string }).rel ?? '')
      if (rel === 'task-2.json') return JSON.stringify({ id: 'task-2', title: 'Newer', status: 'open', created: '2026-08-16T10:00:00Z', updated: '2026-08-16T11:00:00Z', notes: [] })
      if (rel === 'task-1.json') return JSON.stringify({ id: 'task-1', title: 'Older', status: 'done', created: '2026-08-16T09:00:00Z', updated: '2026-08-16T09:00:00Z', notes: [] })
      return ''
    })
    const { ctx: ctx2, tools: tools2 } = makeCtx()
    apply(ctx2 as never, {})
    const filtered = (await registered(tools2, 'task_list').execute({ status: 'open' }, { agent: undefined })) as { total: number; tasks: Array<{ id: string }> }
    expect(filtered.total).toBe(1)
    expect(filtered.tasks[0]!.id).toBe('task-2')
    await expect(registered(tools2, 'task_list').execute({ status: 'flying' }, { agent: undefined }))
      .rejects.toThrow(/invalid status/)
  })

  it('task_show returns the full record', async () => {
    fs.readText.mockResolvedValue(JSON.stringify({
      id: 'task-1', title: 'T', status: 'done', created: '2026-08-16T10:00:00Z',
      updated: '2026-08-16T11:00:00Z', notes: ['n1'],
    }))
    const { ctx, tools } = makeCtx()
    apply(ctx as never, {})
    const result = (await registered(tools, 'task_show').execute({ id: 'task-1' }, { agent: undefined })) as { id: string; status: string; notes: string[] }
    expect(result.id).toBe('task-1')
    expect(result.status).toBe('done')
    expect(result.notes).toEqual(['n1'])
    registered(tools, 'task_show').output.render({}, result)
    await expect(registered(tools, 'task_show').execute({ id: '../x' }, { agent: undefined }))
      .rejects.toThrow(/invalid task id/)
  })

  it('resolves the workspace root through sandboxPolicy when present', async () => {
    const policy = { resolve: vi.fn(() => ({ workspaceRoot: '/ws/policy' })) }
    fs.writeText.mockClear()
    fs.resolve.mockClear()
    const { ctx, tools } = makeCtx()
    ctx.get = () => policy
    apply(ctx as never, {})
    await registered(tools, 'task_start').execute({ title: 'T' }, { agent: {} })
    expect(policy.resolve).toHaveBeenLastCalledWith({ session: undefined })
    await registered(tools, 'task_start').execute({ title: 'T2' }, { agent: undefined })
    expect(policy.resolve).toHaveBeenLastCalledWith({})
    expect(fs.resolve.mock.calls[0]![0]).toBe(join('/ws/policy', 'tasks'))
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
    expect(installed[0]?.[0]).toBe('@deepseek-ai/dsh-task-log')
    expect(typeof disposer).toBe('function')
    const installer = installed[0]?.[1] as () => void
    installer()
  })
})
