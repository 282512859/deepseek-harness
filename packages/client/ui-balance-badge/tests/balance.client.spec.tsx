// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { BalanceResult } from '@deepseek-ai/dsh-balance-badge/types'
import { BalanceChip, type BalanceChipProps } from '../src/client/BalanceChip.tsx'

afterEach(() => cleanup())

function okResult(overrides?: Partial<BalanceResult>): BalanceResult {
  return { ok: true, available: true, cny: '42.30', granted: null, topped: null, ...overrides }
}

function props(overrides?: Partial<BalanceChipProps>): BalanceChipProps {
  return {
    remote: { get: vi.fn(async () => okResult()) },
    ...overrides,
  }
}

describe('BalanceChip', () => {
  it('renders the loading state then the balance', async () => {
    render(<BalanceChip {...props()} />)
    expect(screen.getByText('余额 ···')).toBeTruthy()
    expect(await screen.findByText('余额 ¥42.30')).toBeTruthy()
    expect(screen.getByTitle('账户可用 · 点击刷新')).toBeTruthy()
  })

  it('renders topped-up and granted breakdowns', async () => {
    render(<BalanceChip {...props({ remote: { get: vi.fn(async () => okResult({ topped: '40.30', granted: '2.00' })) } })} />)
    expect(await screen.findByTitle('充值 ¥40.30 · 赠送 ¥2.00 · 账户可用 · 点击刷新')).toBeTruthy()
  })

  it('omits missing breakdown fields', async () => {
    const bare = { ok: true, available: true } as BalanceResult
    render(<BalanceChip {...props({ remote: { get: vi.fn(async () => bare) } })} />)
    expect(await screen.findByText('余额 ¥')).toBeTruthy()
    expect(await screen.findByTitle('账户可用 · 点击刷新')).toBeTruthy()
  })

  it('renders the unavailable state', async () => {
    render(<BalanceChip {...props({ remote: { get: vi.fn(async () => okResult({ available: false })) } })} />)
    expect(await screen.findByTitle('账户不可用 · 点击刷新')).toBeTruthy()
  })

  it('renders a business failure', async () => {
    render(<BalanceChip {...props({ remote: { get: vi.fn(async () => ({ ok: false, reason: '未配置 DEEPSEEK_API_KEY' })) } })} />)
    expect(await screen.findByText('余额 查询失败')).toBeTruthy()
    expect(screen.getByTitle('未配置 DEEPSEEK_API_KEY（点击重试）')).toBeTruthy()
  })

  it('renders the default failure text and Error/Catch failures', async () => {
    const first = render(<BalanceChip {...props({ remote: { get: vi.fn(async () => ({ ok: false })) } })} />)
    expect(await first.findByText('余额 查询失败')).toBeTruthy()
    expect(first.getByTitle('查询失败（点击重试）')).toBeTruthy()
    first.unmount()

    const second = render(<BalanceChip {...props({ remote: { get: vi.fn(async () => { throw new Error('boom') }) } })} />)
    expect(await second.findByText('余额 查询失败')).toBeTruthy()
    expect(second.getByTitle('boom（点击重试）')).toBeTruthy()
    second.unmount()

    const third = render(<BalanceChip {...props({ remote: { get: vi.fn(async () => { throw 'oops' }) } })} />)
    expect(await third.findByText('余额 查询失败')).toBeTruthy()
    expect(third.getByTitle('oops（点击重试）')).toBeTruthy()
  })

  it('refreshes on click', async () => {
    const get = vi.fn(async () => okResult())
    render(<BalanceChip {...props({ remote: { get } })} />)
    await screen.findByText('余额 ¥42.30')
    fireEvent.click(screen.getByText('余额 ¥42.30'))
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('registers the five-minute refresh interval when a timer is present', async () => {
    const interval = vi.fn((_cb: () => void, _delay: number) => () => undefined)
    render(<BalanceChip {...props({ timer: { interval } })} />)
    await screen.findByText('余额 ¥42.30')
    expect(interval).toHaveBeenCalledTimes(1)
    expect(interval.mock.calls[0]?.[1]).toBe(300000)
  })
})
