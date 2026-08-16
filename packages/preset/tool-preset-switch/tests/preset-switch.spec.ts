import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, execute, type SwitchResult } from '../src/index.ts'

function stubCtx(register: (def: unknown) => void): Context {
  return { tools: { register } } as unknown as Context
}

describe('tool-preset-switch registration', () => {
  it('registers switch_preset with the expected schema and prompt', () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    expect(captured).toBeDefined()
    expect(captured?.name).toBe('switch_preset')
    const output = captured?.output as {
      schema: { required: string[]; properties: Record<string, { type: string }> }
    }
    expect(output.schema.required).toEqual(['switched', 'from', 'to', 'detail'])
    expect(output.schema.properties.switched!.type).toBe('boolean')
    expect(output.schema.properties.from!.type).toBe('string')
    expect(output.schema.properties.to!.type).toBe('string')
    expect(output.schema.properties.detail!.type).toBe('string')
    expect(typeof captured?.execute).toBe('function')
    expect(String(captured?.description)).toContain('agent preset')
  })

  it('render emits a switch summary line', () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    const output = captured?.output as { render: (args: unknown, value: SwitchResult) => unknown[] }
    const blocks = output.render({ preset: 'minimal' }, {
      switched: true, from: 'standard', to: 'minimal', detail: 'x',
    })
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as { text: string }).text).toContain('standard → minimal')
  })

  it('registered execute refuses a call without an agent scope', async () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    const executeDef = captured?.execute as (args: unknown, exec: unknown) => Promise<unknown>
    await expect(executeDef({ preset: 'minimal' }, {})).rejects.toThrow('no agent scope')
  })

  it('registered execute recomposes through the agent scope', async () => {
    let captured: Record<string, unknown> | undefined
    apply(stubCtx((def) => { captured = def as Record<string, unknown> }), {})
    const presets = {
      composedPreset: vi.fn(() => 'standard'),
      recompose: vi.fn(async () => undefined),
    }
    const agentCtx = { get: vi.fn((name: string) => (name === 'agentPresets' ? presets : undefined)) }
    const executeDef = captured?.execute as (
      args: unknown, exec: { agent: { ctx: unknown } }) => Promise<unknown>
    const out = await executeDef({ preset: 'ptc' }, { agent: { ctx: agentCtx } }) as SwitchResult
    expect(out).toMatchObject({ switched: true, from: 'standard', to: 'ptc' })
    expect(presets.recompose).toHaveBeenCalledWith(agentCtx, 'ptc')
  })
})

describe('invariant companion', () => {
  it('registers the package with the invariant service', async () => {
    const installed: Array<[string, unknown]> = []
    const ctx = {
      invariants: {
        register: (name: string, installer: unknown) => {
          installed.push([name, installer])
          return () => undefined
        },
      },
    }
    const mod = await import('../src/invariant.ts')
    const disposer = await mod.apply(ctx as never)
    expect(installed[0]?.[0]).toBe('@deepseek-ai/dsh-tool-preset-switch')
    expect(typeof disposer).toBe('function')
    const installer = installed[0]?.[1] as () => void
    installer()  // 覆盖 noop 安装器本体（函数覆盖率门）
  })
})

describe('execute', () => {
  const scope = { isolate: {} } as unknown as Context

  it('throws when the roster service is unavailable', async () => {
    await expect(execute('minimal', undefined, scope)).rejects.toThrow('service unavailable')
  })

  it('no-ops when already on the target preset', async () => {
    const presets = {
      composedPreset: vi.fn(() => 'minimal'),
      recompose: vi.fn(),
    }
    const out = await execute('minimal', presets, scope)
    expect(out.switched).toBe(false)
    expect(out.from).toBe('minimal')
    expect(presets.recompose).not.toHaveBeenCalled()
  })

  it('uses "(default)" when no preset is composed', async () => {
    const presets = {
      composedPreset: vi.fn(() => undefined),
      recompose: vi.fn(),
    }
    const out = await execute('minimal', presets, scope)
    expect(out.from).toBe('(default)')
    expect(out.to).toBe('minimal')
    expect(presets.recompose).toHaveBeenCalledWith(scope, 'minimal')
  })

  it('recomposes onto the target and reports the switch', async () => {
    const presets = {
      composedPreset: vi.fn(() => 'standard'),
      recompose: vi.fn(),
    }
    const out = await execute('ptc', presets, scope)
    expect(out).toMatchObject({ switched: true, from: 'standard', to: 'ptc' })
    expect(presets.recompose).toHaveBeenCalledWith(scope, 'ptc')
  })
})
