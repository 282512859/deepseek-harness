/**
 * Writable agent memory: IDENTITY/SOUL/USER memory files surfaced as a prompt
 * section plus `memory_write` / `note_append` / `note_recall` tools. All file
 * access goes through the sandboxed `ctx.fs` seam, so the mounted sandbox
 * policy fences every write exactly like `tool-fs`; paths are validated
 * against an allowlist and never escape the memory root.
 *
 * Distilled from OpenClaw's per-agent memory files (IDENTITY/SOUL/USER.md)
 * and dated memory notes into the harness-native shape: a scope-only row whose
 * prompt section names the convention and whose tools own the writes.
 * @module @deepseek-ai/dsh-memory-files
 */
import { basename, join, normalize, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-fs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'memory-files'

/** Services required by the tool registry, the prompt section, and the fs seam. */
export const inject = ['tools', 'systemPrompt', 'fs']

/** Plugin config. */
export interface Config {
  /** Memory root directory name under the sandbox workspace root. */
  root?: string
  /** Allowlist of memory file names `memory_write` may touch. */
  files?: string[]
  /** Notes file name inside the memory root. */
  notesFile?: string
  /** Prompt section order. */
  sectionOrder?: number
}

export const Config: z<Config> = z.object({
  root: z.string().default('memory'),
  files: z.array(z.string()).default(['IDENTITY.md', 'SOUL.md', 'USER.md']),
  notesFile: z.string().default('notes.md'),
  sectionOrder: z.natural().default(55),
})

/** Resolved config type. */
export type ResolvedConfig = Required<Config>

/** Memory write outcome. */
export interface MemoryWriteResult {
  written: boolean
  file: string
  chars: number
}

/** Notes append outcome. */
export interface NoteAppendResult {
  appended: boolean
  file: string
  chars: number
}

/** Notes recall outcome. */
export interface NoteRecallResult {
  total: number
  notes: string[]
}

/**
 * Validate a requested memory file against the allowlist; returns the safe
 * basename or throws. Path traversal and absolute paths are rejected.
 * @param file - the caller-supplied file name.
 * @param allowlist - the configured memory file names.
 */
export function validateMemoryFile(file: string, allowlist: string[]): string {
  const base = basename(normalize(file).replaceAll('\\', sep))
  if (base !== file || file === '' || file.includes('..') || file.startsWith('/')) {
    throw new Error(`memory_write: invalid memory file "${file}"`)
  }
  if (!allowlist.includes(base)) {
    throw new Error(`memory_write: "${base}" is not in the memory allowlist (${allowlist.join(', ')})`)
  }
  return base
}

/**
 * Append one timestamped note line to the notes content.
 * @param existing - the current notes file content ('' when absent).
 * @param note - the note text.
 * @param now - the timestamp used for the line.
 */
export function appendNoteLine(existing: string, note: string, now: Date): string {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const line = `- ${stamp} ${note.trim().replaceAll('\n', ' ')}`
  return existing.length === 0 ? line : `${existing}\n${line}`
}

/**
 * Recall matching note lines, newest first.
 * @param content - the notes file content.
 * @param query - substring filter (case-insensitive); empty matches everything.
 * @param limit - maximum lines to return.
 */
export function recallNotes(content: string, query: string | undefined, limit: number): string[] {
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  const needle = (query ?? '').trim().toLowerCase()
  const matches = needle.length === 0
    ? lines
    : lines.filter(l => l.toLowerCase().includes(needle))
  return matches.slice(-Math.max(1, limit)).reverse()
}

/** The prompt section text naming the memory convention. */
export function memorySectionText(files: string[], notesFile: string): string {
  return [
    '# Memory',
    `Keep your identity, values, and the user profile in the memory files (${files.join(', ')}) `
    + 'under memory/. Update them with memory_write when they change.',
    `Keep long-term notes in ${notesFile} with note_append and recall them with note_recall.`,
  ].join('\n')
}

/** The shell/fs seam faces the tools need (stubs in unit tests). */
export interface FsSeam {
  resolve(path: string, opts?: { cwd?: string }): Promise<unknown>
  readText(target: unknown): Promise<string>
  writeText(target: unknown, content: string): Promise<unknown>
}

/** Resolve the memory root path from the sandbox workspace root. */
export function memoryRootPath(workspaceRoot: string, config: ResolvedConfig): string {
  return join(workspaceRoot, config.root)
}

/** Register the prompt section and the three memory tools. */
export function apply(ctx: Context, config: Config): void {
  // schemastery 在 Loader 装配时填默认值；直接调用（测试/裸组合）时兜底
  const resolved: ResolvedConfig = {
    root: config.root ?? 'memory',
    files: config.files ?? ['IDENTITY.md', 'SOUL.md', 'USER.md'],
    notesFile: config.notesFile ?? 'notes.md',
    sectionOrder: config.sectionOrder ?? 55,
  }
  const sandboxPolicy = ctx.get('sandboxPolicy') as
    | { resolve: (scope: { session?: unknown }) => { workspaceRoot?: string } & SandboxExecutionPolicy | undefined }
    | undefined

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'memory-files',
    order: resolved.sectionOrder,
    text: memorySectionText(resolved.files, resolved.notesFile),
  }), 'memory-files.section()')

  const rootFor = (exec: { agent?: unknown }): string => {
    const policy = sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: undefined })
    return memoryRootPath(policy?.workspaceRoot ?? process.cwd(), resolved)
  }

  const fs = ctx.fs as unknown as FsSeam
  const targetFor = async (exec: { agent?: unknown }, rel: string): Promise<unknown> => {
    const root = rootFor(exec)
    const dir = await fs.resolve(root)
    const target = await fs.resolve(rel, { cwd: root })
    void dir
    return target
  }

  ctx.tools.register(defineTool({
    name: 'memory_write',
    description:
      'Update one memory file (identity, soul, or user profile) under memory/. '
      + 'Use it when who you are, your values, or the user profile change.',
    parameters: {
      file: { type: 'string', required: true, description: 'One of: IDENTITY.md, SOUL.md, USER.md.' },
      content: { type: 'string', required: true, description: 'The full new file content.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          written: { type: 'boolean', required: true },
          file: { type: 'string', required: true },
          chars: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `memory_write: ${value.file} (${value.chars} chars)` }],
    },
    execute: async (args, exec) => {
      const file = validateMemoryFile(String(args.file), resolved.files)
      const content = String(args.content)
      const target = await targetFor(exec, file)
      await fs.writeText(target, content)
      return { written: true, file, chars: content.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'note_append',
    description:
      'Append a timestamped long-term note under memory/. Use it to remember facts across sessions.',
    parameters: {
      note: { type: 'string', required: true, description: 'The note text.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          appended: { type: 'boolean', required: true },
          file: { type: 'string', required: true },
          chars: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `note_append: ${value.file} (${value.chars} chars)` }],
    },
    execute: async (args, exec) => {
      const note = String(args.note)
      if (note.trim().length === 0) throw new Error('note_append: empty note')
      const target = await targetFor(exec, resolved.notesFile)
      let existing = ''
      try {
        existing = await fs.readText(target)
      } catch {
        existing = ''  // 文件尚不存在：从空内容开始
      }
      const next = appendNoteLine(existing, note, new Date())
      await fs.writeText(target, next)
      return { appended: true, file: resolved.notesFile, chars: next.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'note_recall',
    description:
      'Recall matching long-term notes under memory/, newest first. Use it to recover facts from earlier sessions.',
    parameters: {
      query: { type: 'string', description: 'Case-insensitive substring filter; empty returns the latest notes.' },
      limit: { type: 'integer', description: 'Maximum lines to return. Defaults to 10.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          notes: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `note_recall: ${value.notes.length}/${value.total} notes\n${value.notes.join('\n')}` },
      ],
    },
    execute: async (args, exec) => {
      const target = await targetFor(exec, resolved.notesFile)
      let content = ''
      try {
        content = await fs.readText(target)
      } catch {
        content = ''  // 无笔记：空结果
      }
      const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 10
      const query = typeof args.query === 'string' ? args.query : undefined
      const notes = recallNotes(content, query, limit)
      return { total: notes.length, notes }
    },
  }))
}
