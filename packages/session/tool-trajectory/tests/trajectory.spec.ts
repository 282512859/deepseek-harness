import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { apply, digest, summarize, type TrajectoryResult } from '../src/index.ts'

function stubCtx(register: (def: unknown) => void): Context {
  return { tools: { register } } as unknown as Context
}

const textEvent = (type: 'user/message' | 'assistant/message', text: string): SessionEvent =>
  ({ type, seq: 0, time: 0, data: { message: { content: [{ type: 'text', text }] } } }) as SessionEvent

describe('summarize', () => {
  it('summarizes messages, tools, results, and turn endings', () => {
    expect(summarize(textEvent('user/message', '你好'), 1)).toContain('#1 user: 你好')
    expect(summarize(textEvent('assistant/message', '世界'), 2)).toContain('#2 assistant: 世界')
    expect(summarize({ type: 'tool/call', seq: 0, time: 0, data: { name: 'read_file' } } as SessionEvent, 3))
      .toContain('#3 tool: read_file')
    expect(summarize({ type: 'tool/result', seq: 0, time: 0, data: {} } as SessionEvent, 4))
      .toContain('tool-result: ok')
    expect(summarize({ type: 'tool/result', seq: 0, time: 0, data: { error: 'boom' } } as SessionEvent, 5))
      .toContain('err boom')
    expect(summarize({ type: 'turn/end', seq: 0, time: 0, data: { reason: { kind: 'completed' } } } as SessionEvent, 6))
      .toContain('turn-end: completed')
  })

  it('folds chunk and unknown events to nothing', () => {
    expect(summarize({ type: 'assistant/chunk', seq: 0, time: 0, data: {} } as SessionEvent, 1)).toBe('')
    expect(summarize({ type: 'unknown-thing', seq: 0, time: 0, data: {} } as SessionEvent, 2)).toBe('')
  })

  it('handles text blocks without a type', () => {
    const ev = { type: 'user/message', seq: 0, time: 0,
      data: { message: { content: ['plain'] } } } as SessionEvent
    expect(summarize(ev, 1)).toContain('(no text)')
  })
})

describe('digest', () => {
  it('summarizes the trailing window newest-first with the total count', () => {
    const events = [
      textEvent('user/message', 'a'),
      textEvent('assistant/message', 'b'),
      { type: 'turn/end', seq: 0, time: 0, data: { reason: { kind: 'completed' } } } as SessionEvent,
    ]
    const out = digest(events, 2)
    expect(out.events).toBe(3)
    const lines = out.digest.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('#1 turn-end')  // 最近在前
  })

  it('caps the window at the available events and falls back gracefully', () => {
    const events = [textEvent('user/message', 'x')]
    expect(digest(events, 100).digest).toContain('#1 user: x')
    expect(digest([], 5).digest).toBe('(no summarizable events)')
  })

  it('handles non-array, null, non-text, and empty content blocks', () => {
    const ev1 = { type: 'user/message', seq: 0, time: 0,
      data: { message: { content: 'plain-string' } } } as SessionEvent
    const ev2 = { type: 'user/message', seq: 0, time: 0,
      data: { message: { content: [null, { type: 'image' }, { type: 'text', text: '' }] } } } as SessionEvent
    const ev3 = { type: 'user/message', seq: 0, time: 0,
      data: { message: { content: ['primitive-block'] } } } as SessionEvent
    const ev4 = { type: 'user/message', seq: 0, time: 0,
      data: { message: { content: [{ foo: 1 }] } } } as SessionEvent
    const ev5 = { type: 'turn/end', seq: 0, time: 0 } as SessionEvent  // 无 data 字段：data ?? {} 兜底
    const ev6 = { type: 'user/message', seq: 0, time: 0,
      data: { message: { content: [{ type: 'text' }] } } } as SessionEvent  // text 字段缺失：?? '' 兜底
    const out = digest([ev1, ev2, ev3, ev4, ev5, ev6], 10)
    expect(out.digest).toContain('(no text)')
    expect(out.events).toBe(6)
  })

  it('honors a positive caller limit and falls back for bare events', () => {
    expect(digest([textEvent('user/message', 'x')], 3).events).toBe(1)
    const noReason = { type: 'turn/end', seq: 0, time: 0, data: {} } as SessionEvent
    expect(summarize(noReason, 1)).toContain('turn-end: ?')
    const bareTool = { type: 'tool/call', seq: 0, time: 0, data: {} } as SessionEvent
    expect(summarize(bareTool, 2)).toContain('tool: ?')
  })
})

describe('tool-trajectory registration', () => {
  it('registers trajectory with the expected schema and default limit', () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    expect(captured?.name).toBe('trajectory')
    expect(String(captured?.description)).toContain('session log')
    const output = captured?.output as { schema: { required: string[]; properties: Record<string, unknown> } }
    expect(output.schema.required).toEqual(['events', 'digest'])
  })

  it('render emits the digest with the total count', () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    const output = captured?.output as { render: (a: unknown, v: TrajectoryResult) => unknown[] }
    const blocks = output.render({}, { events: 5, digest: 'd' })
    expect((blocks[0] as { text: string }).text).toContain('5 events total')
  })

  it('registered execute refuses calls without an agent or session', async () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    const exec = captured?.execute as (a: unknown, e: unknown) => Promise<unknown>
    await expect(exec({}, {})).rejects.toThrow('no agent scope')
    await expect(exec({}, { agent: {} })).rejects.toThrow('no active session')
  })

  it('registered execute digests the agent session events', async () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    const events = [textEvent('user/message', 'hi')]
    const exec = captured?.execute as (
      a: unknown, e: { agent: { session: { events: SessionEvent[] } } }) => Promise<unknown>
    const out = await exec({}, { agent: { session: { events } } }) as TrajectoryResult
    expect(out.events).toBe(1)
    expect(out.digest).toContain('user: hi')
    const out2 = await exec({ limit: 1 }, { agent: { session: { events } } }) as TrajectoryResult
    expect(out2.events).toBe(1)
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
    expect(installed[0]?.[0]).toBe('@deepseek-ai/dsh-tool-trajectory')
    expect(typeof disposer).toBe('function')
    const installer = installed[0]?.[1] as () => void
    installer()
  })
})
