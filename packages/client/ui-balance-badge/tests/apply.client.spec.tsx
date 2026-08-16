// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

interface Registration {
  options: Record<string, unknown>
  component: () => unknown
}

function stubCtx(timer: object | undefined) {
  const registrations: Registration[] = []
  const ctx = {
    get: vi.fn(() => timer),
    remote: { deepseekBalance: { get: vi.fn(async () => ({ ok: true })) } },
    slots: {
      inject: vi.fn((_name: string, contribute: () => unknown) => { contribute() }),
      register: vi.fn((options: Record<string, unknown>, component: () => unknown) => {
        registrations.push({ options, component })
        return () => undefined
      }),
    },
  }
  return { ctx, registrations }
}

describe('apply', () => {
  it('registers the balance chip in the input row without a timer', () => {
    const { ctx, registrations } = stubCtx(undefined)
    apply(ctx as never)
    expect(ctx.slots.inject).toHaveBeenCalledWith('conversation.input.right', expect.any(Function))
    expect(registrations).toHaveLength(1)
    expect(registrations[0]!.options).toMatchObject({
      name: 'conversation.input.right', id: 'deepseek-balance', order: 50,
    })
    expect((registrations[0]!.options.label as () => string)()).toBe('DeepSeek 余额')
    const element = registrations[0]!.component() as { props?: Record<string, unknown> }
    expect(element).toBeTruthy()
    expect(element.props?.timer).toBeUndefined()
    expect(element.props?.remote).toBe(ctx.remote.deepseekBalance)
  })

  it('passes the client timer when present', () => {
    const timer = { interval: vi.fn(() => () => undefined) }
    const { ctx, registrations } = stubCtx(timer)
    apply(ctx as never)
    const element = registrations[0]!.component() as { props?: Record<string, unknown> }
    expect(element.props?.timer).toBe(timer)
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
    expect(installed[0]?.[0]).toBe('@deepseek-ai/dsh-client-ui-balance-badge')
    expect(typeof disposer).toBe('function')
    const installer = installed[0]?.[1] as () => void
    installer()
  })
})
