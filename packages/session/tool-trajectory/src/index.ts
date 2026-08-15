/**
 * Model-facing trajectory digest: `trajectory` reads the current session log
 * and returns a compact summary of the most recent events, so the agent can
 * review its own recent path (thinking, tools, turns) without replaying raw
 * log lines. The digest is derived from the authoritative session event
 * window (`Session.events`), never from a shadow copy.
 * @module @deepseek-ai/dsh-tool-trajectory
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-trajectory'

/** Services required by the tool registry. */
export const inject = ['tools']

/** Plugin config — no knobs today; `Config` keeps the shape for future gating. */
export interface Config {
  /** Maximum digest events when the caller omits `limit`. */
  defaultLimit?: number
}

export const Config: z<Config> = z.object({
  defaultLimit: z.natural().default(20),  // schemastery: natural = 非负整数
})

/** One digest line + the trailing summary. */
export interface TrajectoryResult {
  events: number
  digest: string
}

/** One event's one-line summary; chunk/status noise folds into nothing. */
export function summarize(event: SessionEvent, index: number): string {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'user/message': {
      const message = data.message as { content?: unknown } | undefined
      return `#${index} user: ${textOf(message?.content)}`
    }
    case 'assistant/message': {
      const message = data.message as { content?: unknown } | undefined
      return `#${index} assistant: ${textOf(message?.content)}`
    }
    case 'tool/call':
      return `#${index} tool: ${String((data.name ?? data.toolName ?? '?') as string)}`
    case 'tool/result':
      return `#${index} tool-result: ${data.error === undefined ? 'ok' : `err ${String(data.error)}`}`
    case 'turn/end': {
      const reason = data.reason as { kind?: string } | undefined
      return `#${index} turn-end: ${String(reason?.kind ?? '?')}`
    }
    default:
      return ''
  }
}

function textOf(content: unknown): string {
  const parts: string[] = []
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'object' && block !== null
        && (block as { type?: unknown }).type === 'text') {
        const text = String((block as { text?: unknown }).text ?? '')
        if (text.length > 0) parts.push(text.slice(0, 160))
      }
    }
  }
  return parts.join(' ') || '(no text)'
}

/**
 * Build the digest for the tail of an event window.
 * @param events - the authoritative session events.
 * @param limit - how many trailing events to summarize.
 * @returns the digest payload.
 */
export function digest(events: readonly SessionEvent[], limit: number): TrajectoryResult {
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20
  const tail = events.slice(-n)
  const lines = tail.map((event, i) => summarize(event, tail.length - i)).filter(l => l.length > 0)
  lines.reverse()  // 最近在前（#1 = 最新）
  return {
    events: events.length,
    digest: lines.slice(0, n).join('\n') || '(no summarizable events)',
  }
}

/** Register the `trajectory` tool. */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as Required<Config>
  ctx.tools.register(defineTool({
    name: 'trajectory',
    description:
      'Read the current session log and return a compact digest of the most recent events '
      + '(user/assistant messages, tool calls and results, turn endings). Use it to review your '
      + 'own recent path before continuing.',
    parameters: {
      limit: {
        type: 'integer',
        description: `How many trailing events to summarize. Defaults to ${resolved.defaultLimit}.`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          events: { type: 'integer', required: true },
          digest: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `trajectory (${value.events} events total):\n${value.digest}` },
      ],
    },
    execute: async (args, exec) => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('trajectory: no agent scope for this call')
      const session = agent.session
      if (session === undefined) throw new Error('trajectory: no active session')
      const requested = typeof args.limit === 'number' ? args.limit : NaN
      const limit = requested > 0 ? requested : resolved.defaultLimit
      return digest(session.events, limit)
    },
  }))
}
