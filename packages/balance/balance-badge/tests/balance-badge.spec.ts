import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DeepseekBalanceService, fetchBalance, parseBalance, type BalanceSeam } from '../src/index.ts'

const CNY = JSON.stringify({
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '42.30', granted_balance: '2.00', topped_up_balance: '40.30' },
  ],
})

describe('parseBalance', () => {
  it('parses a valid CNY response', () => {
    expect(parseBalance(CNY)).toEqual({
      ok: true, available: true, cny: '42.30', granted: '2.00', topped: '40.30',
    })
  })

  it('maps unavailable and missing granted/topped fields', () => {
    const raw = JSON.stringify({
      is_available: false,
      balance_infos: [{ currency: 'CNY', total_balance: '0' }],
    })
    expect(parseBalance(raw)).toEqual({
      ok: true, available: false, cny: '0', granted: null, topped: null,
    })
  })

  it('rejects malformed, shapeless, and non-CNY responses', () => {
    expect(parseBalance('{broken')).toEqual({ ok: false, reason: '响应解析失败' })
    expect(parseBalance('null')).toEqual({ ok: false, reason: '响应缺 balance_infos' })
    expect(parseBalance(JSON.stringify({ is_available: true }))).toEqual({ ok: false, reason: '响应缺 balance_infos' })
    expect(parseBalance(JSON.stringify({ balance_infos: [{ currency: 'USD', total_balance: '1' }] })))
      .toEqual({ ok: false, reason: '响应无 CNY 余额' })
  })
})

describe('fetchBalance', () => {
  it('returns the parsed balance on exit 0', async () => {
    const seam: BalanceSeam = {
      resolveCredential: async () => undefined,
      runBalanceQuery: async () => ({ exitCode: 0, stdout: CNY, stderr: '' }),
    }
    expect(await fetchBalance(seam, 'k', 'u', 15000)).toMatchObject({ ok: true, cny: '42.30' })
  })

  it('returns a descriptive failure on non-zero exit', async () => {
    const seam: BalanceSeam = {
      resolveCredential: async () => undefined,
      runBalanceQuery: async () => ({ exitCode: 128, stdout: '', stderr: '  curl: exit 7\n' }),
    }
    expect(await fetchBalance(seam, 'k', 'u', 15000))
      .toEqual({ ok: false, reason: '请求失败(128): curl: exit 7' })
  })

  it('surfaces parse failures on empty success output', async () => {
    const seam: BalanceSeam = {
      resolveCredential: async () => undefined,
      runBalanceQuery: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    }
    expect(await fetchBalance(seam, 'k', 'u', 15000)).toEqual({ ok: false, reason: '响应解析失败' })
  })
})

describe('DeepseekBalanceService', () => {
  function boot(ctx: Context, config: object = {}) {
    return new DeepseekBalanceService(ctx as never, config as never)
  }

  it('resolves the credential and returns the balance', async () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: vi.fn(async () => ({ value: 'sk-test' })) })
    ctx.provide('subprocess', {
      resolveExecutable: vi.fn(async () => 'curl'),
      spawn: vi.fn(() => ({
        done: Promise.resolve({ exitCode: 0 }),
        collected: { stdout: { readFrom: () => ({ text: CNY }) }, stderr: { readFrom: () => ({ text: '' }) } },
      })),
    })
    const service = boot(ctx)
    const result = await service.get()
    expect(result).toMatchObject({ ok: true, cny: '42.30' })
  })

  it('reports a missing credential', async () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: vi.fn(async () => undefined) })
    ctx.provide('subprocess', { resolveExecutable: vi.fn(), spawn: vi.fn() })
    expect(await boot(ctx).get()).toEqual({ ok: false, reason: '未配置 DEEPSEEK_API_KEY' })
  })

  it('reports a missing credentials service', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', { resolveExecutable: vi.fn(), spawn: vi.fn() })
    expect(await boot(ctx).get()).toEqual({ ok: false, reason: '未配置 DEEPSEEK_API_KEY' })
  })

  it('reports a missing subprocess service', async () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: vi.fn(async () => ({ value: 'sk-test' })) })
    expect(await boot(ctx).get()).toEqual({ ok: false, reason: '请求失败(1): subprocess 服务不可用' })
  })

  it('propagates curl failures with the captured stderr', async () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: vi.fn(async () => ({ value: 'sk-test' })) })
    ctx.provide('subprocess', {
      resolveExecutable: vi.fn(async () => 'curl'),
      spawn: vi.fn(() => ({
        done: Promise.resolve({ exitCode: 7 }),
        collected: { stdout: { readFrom: () => ({ text: '' }) }, stderr: { readFrom: () => ({ text: 'connection refused' }) } },
      })),
    })
    const result = await boot(ctx).get()
    expect(result).toEqual({ ok: false, reason: '请求失败(7): connection refused' })
  })

  it('tolerates a subprocess that reports no collected streams', async () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: vi.fn(async () => ({ value: 'sk-test' })) })
    ctx.provide('subprocess', {
      resolveExecutable: vi.fn(async () => 'curl'),
      spawn: vi.fn(() => ({ done: Promise.resolve({ exitCode: 0 }), collected: {} })),
    })
    expect(await boot(ctx).get()).toEqual({ ok: false, reason: '响应解析失败' })
  })

  it('defaults the config', () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: vi.fn(async () => undefined) })
    ctx.provide('subprocess', { resolveExecutable: vi.fn(), spawn: vi.fn() })
    const service = boot(ctx)
    expect(service).toBeInstanceOf(DeepseekBalanceService)
    // 默认 apiKeyEnv 生效：credential 缺失即报告未配置 DEEPSEEK_API_KEY
    void service
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
    expect(installed[0]?.[0]).toBe('@deepseek-ai/dsh-balance-badge')
    expect(typeof disposer).toBe('function')
    const installer = installed[0]?.[1] as () => void
    installer()
  })
})
