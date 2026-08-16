/**
 * Task journal, mirrored from Claude Code's `.claude/tasks` into the
 * harness-native shape: one JSON file per task under the sandbox workspace,
 * with `task_start` / `task_update` / `task_list` / `task_show` tools. All
 * file access goes through the sandboxed `ctx.fs` seam, task ids are
 * validated against a strict pattern (no traversal), and notes are
 * append-only within a record.
 * @module @deepseek-ai/dsh-task-log
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-fs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'task-log'

/** Services required by the tool registry, the prompt section, and the fs seam. */
export const inject = ['tools', 'systemPrompt', 'fs']

/** Plugin config. */
export interface Config {
  /** Task journal root directory name under the sandbox workspace root. */
  root?: string
  /** Prompt section order. */
  sectionOrder?: number
  /** Maximum tasks a single `task_list` call returns. */
  maxList?: number
}

export const Config: z<Config> = z.object({
  root: z.string().default('tasks'),
  sectionOrder: z.natural().default(57),
  maxList: z.natural().default(100),
})

/** Resolved config type. */
export type ResolvedConfig = Required<Config>

/** The lifecycle status of one task. */
export type TaskStatus = 'open' | 'in-progress' | 'done' | 'blocked'

const TASK_STATUSES: readonly TaskStatus[] = ['open', 'in-progress', 'done', 'blocked']

/** One durable task record (one JSON file per task). */
export interface TaskRecord {
  id: string
  title: string
  status: TaskStatus
  created: string
  updated: string
  notes: string[]
}

/** The `task_list` tool's per-task summary. */
export interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  updated: string
}

/** The `task_list` tool result. */
export interface TaskListResult {
  total: number
  tasks: TaskSummary[]
}

/**
 * Validate a caller-supplied task id against the strict pattern.
 * @param id - the raw id.
 * @returns the validated id.
 */
export function validateTaskId(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || id.includes('..')) {
    throw new Error(`task_log: invalid task id "${id}"`)
  }
  return id
}

/** The file name for one task id. */
export function taskFileName(id: string): string {
  return `${validateTaskId(id)}.json`
}

/**
 * Create a new task record.
 * @param title - the task title.
 * @param now - the creation time.
 */
export function createTask(title: string, now: Date): TaskRecord {
  const stamp = now.toISOString()
  return {
    id: `task-${now.getTime()}`,
    title: title.trim(),
    status: 'open',
    created: stamp,
    updated: stamp,
    notes: [],
  }
}

/**
 * Apply one validated update to a task record (status change and/or note
 * append); at least one change is required.
 * @param record - the current record.
 * @param update - the requested change.
 * @param now - the update time.
 * @returns the updated record (input not mutated).
 */
export function applyTaskUpdate(
  record: TaskRecord,
  update: { status?: string; note?: string },
  now: Date,
): TaskRecord {
  const status = update.status === undefined ? undefined : update.status as TaskStatus
  if (status !== undefined && !(TASK_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`task_log: invalid status "${status}"`)
  }
  const note = update.note === undefined ? undefined : update.note.trim()
  if (note !== undefined && note.length === 0) throw new Error('task_log: empty note')
  if (status === undefined && note === undefined) {
    throw new Error('task_log: nothing to update (status or note required)')
  }
  return {
    ...record,
    status: status ?? record.status,
    notes: note === undefined ? record.notes : [...record.notes, note],
    updated: now.toISOString(),
  }
}

/**
 * Sort task records by `updated` descending (newest first).
 * @param records - the records to sort (not mutated).
 */
export function sortTasksByUpdated(records: TaskRecord[]): TaskRecord[] {
  return [...records].sort((a, b) => b.updated.localeCompare(a.updated))
}

/**
 * Filter records by status; `undefined` keeps every record.
 * @param records - the records.
 * @param status - the optional status filter.
 */
export function filterByStatus(records: TaskRecord[], status: TaskStatus | undefined): TaskRecord[] {
  return status === undefined ? records : records.filter(r => r.status === status)
}

/**
 * Parse one task file's content; malformed content yields `undefined`.
 * @param content - the raw file text.
 */
export function parseTaskRecord(content: string): TaskRecord | undefined {
  try {
    const raw = JSON.parse(content)
    if (raw === null || typeof raw !== 'object') return undefined
    const record = raw as Partial<TaskRecord>
    if (typeof record.id !== 'string' || typeof record.title !== 'string') return undefined
    if (!(TASK_STATUSES as readonly string[]).includes(String(record.status))) return undefined
    if (typeof record.created !== 'string' || typeof record.updated !== 'string') return undefined
    if (!Array.isArray(record.notes) || record.notes.some(n => typeof n !== 'string')) return undefined
    return record as TaskRecord
  } catch {
    return undefined
  }
}

/** The prompt section text naming the task journal convention. */
export function taskSectionText(root: string): string {
  return [
    '# Task journal',
    `Keep long-running work visible: record tasks with task_start, update them with task_update (${root}/),`,
    'and list them with task_list. Mirror of Claude Code\'s .claude/tasks.',
  ].join('\n')
}

/** The shell/fs seam faces the tools need (stubs in unit tests). */
export interface FsSeam {
  resolve(path: string, opts?: { cwd?: string }): Promise<unknown>
  readText(target: unknown): Promise<string>
  writeText(target: unknown, content: string): Promise<unknown>
  listDir(target: unknown): Promise<Array<{ name: string; type: string }>>
}

/** Resolve the task journal root path from the sandbox workspace root. */
export function taskRootPath(workspaceRoot: string, config: ResolvedConfig): string {
  return join(workspaceRoot, config.root)
}

/** Register the prompt section and the four task tools. */
export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = {
    root: config.root ?? 'tasks',
    sectionOrder: config.sectionOrder ?? 57,
    maxList: config.maxList ?? 100,
  }
  const sandboxPolicy = ctx.get('sandboxPolicy') as
    | { resolve: (scope: { session?: unknown }) => { workspaceRoot?: string } & SandboxExecutionPolicy | undefined }
    | undefined

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'task-log',
    order: resolved.sectionOrder,
    text: taskSectionText(resolved.root),
  }), 'task-log.section()')

  const rootFor = (exec: { agent?: unknown }): string => {
    const policy = sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: undefined })
    return taskRootPath(policy?.workspaceRoot ?? process.cwd(), resolved)
  }

  const fs = ctx.fs as unknown as FsSeam
  const targetFor = async (exec: { agent?: unknown }, rel: string): Promise<unknown> => {
    const root = rootFor(exec)
    await fs.resolve(root)
    return fs.resolve(rel, { cwd: root })
  }

  const readTask = async (target: unknown): Promise<TaskRecord> => {
    const parsed = parseTaskRecord(await fs.readText(target))
    if (parsed === undefined) throw new Error('task_log: corrupt task file')
    return parsed
  }

  ctx.tools.register(defineTool({
    name: 'task_start',
    description:
      'Create a task journal entry with status open. Use it to record long-running work '
      + 'the user should be able to track across turns.',
    parameters: {
      title: { type: 'string', required: true, description: 'The task title.' },
      note: { type: 'string', description: 'An optional initial note.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          status: { type: 'string', required: true },
          notes: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `task_start: ${value.id} ${value.title} (${value.status})` }],
    },
    execute: async (args, exec) => {
      const title = String(args.title).trim()
      if (title.length === 0) throw new Error('task_start: empty title')
      let record = createTask(title, new Date())
      if (typeof args.note === 'string' && args.note.trim().length > 0) {
        record = applyTaskUpdate(record, { note: args.note }, new Date())
      }
      const target = await targetFor(exec, taskFileName(record.id))
      await fs.writeText(target, JSON.stringify(record, null, 2))
      return { id: record.id, title: record.title, status: record.status, notes: record.notes }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'task_update',
    description:
      'Update one task journal entry: change its status (open/in-progress/done/blocked) '
      + 'and/or append a note. At least one change is required.',
    parameters: {
      id: { type: 'string', required: true, description: 'The task id returned by task_start.' },
      status: { type: 'string', description: 'One of: open, in-progress, done, blocked.' },
      note: { type: 'string', description: 'A note to append.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          status: { type: 'string', required: true },
          notes: { type: 'array', required: true, items: { type: 'string' } },
          updated: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `task_update: ${value.id} ${value.status} (${value.notes.length} notes)` }],
    },
    execute: async (args, exec) => {
      const id = validateTaskId(String(args.id))
      const target = await targetFor(exec, taskFileName(id))
      const record = await readTask(target)
      const update: { status?: string; note?: string } = {}
      if (typeof args.status === 'string') update.status = args.status
      if (typeof args.note === 'string') update.note = args.note
      const next = applyTaskUpdate(record, update, new Date())
      await fs.writeText(target, JSON.stringify(next, null, 2))
      return { id: next.id, status: next.status, notes: next.notes, updated: next.updated }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'task_list',
    description:
      'List task journal entries, newest first, optionally filtered by status.',
    parameters: {
      status: { type: 'string', description: 'Optional status filter: open, in-progress, done, blocked.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          tasks: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                status: { type: 'string', required: true },
                updated: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `task_list: ${value.tasks.length}/${value.total}\n${value.tasks.map(t => `- ${t.id} [${t.status}] ${t.title}`).join('\n')}` },
      ],
    },
    execute: async (args, exec) => {
      const status = typeof args.status === 'string' ? args.status as TaskStatus : undefined
      if (status !== undefined && !(TASK_STATUSES as readonly string[]).includes(status)) {
        throw new Error(`task_log: invalid status "${status}"`)
      }
      const dir = await targetFor(exec, '.')
      const entries = await fs.listDir(dir)
      const records: TaskRecord[] = []
      for (const entry of entries) {
        if (entry.type !== 'file' || !entry.name.endsWith('.json')) continue
        const target = await fs.resolve(entry.name, { cwd: dir as never })
        const parsed = parseTaskRecord(await fs.readText(target))
        if (parsed !== undefined) records.push(parsed)
      }
      const filtered = sortTasksByUpdated(filterByStatus(records, status)).slice(0, Math.max(1, resolved.maxList))
      const tasks: TaskSummary[] = filtered.map(r => ({ id: r.id, title: r.title, status: r.status, updated: r.updated }))
      return { total: tasks.length, tasks } satisfies TaskListResult
    },
  }))

  ctx.tools.register(defineTool({
    name: 'task_show',
    description:
      'Show one task journal entry in full, including its notes.',
    parameters: {
      id: { type: 'string', required: true, description: 'The task id returned by task_start.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          status: { type: 'string', required: true },
          created: { type: 'string', required: true },
          updated: { type: 'string', required: true },
          notes: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `task_show: ${value.id} [${value.status}] ${value.title}\n${value.notes.map(n => `- ${n}`).join('\n')}` },
      ],
    },
    execute: async (args, exec) => {
      const id = validateTaskId(String(args.id))
      const target = await targetFor(exec, taskFileName(id))
      const record = await readTask(target)
      return record satisfies TaskRecord
    },
  }))
}
