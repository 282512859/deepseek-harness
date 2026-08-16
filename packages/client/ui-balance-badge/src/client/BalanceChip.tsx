/**
 * The DeepSeek balance chip: a small always-visible control at the right end
 * of the composer tool row. Pure props component — testable without the slot
 * machinery.
 * @module @deepseek-ai/dsh-client-ui-balance-badge/client
 */

import { useEffect, useState } from 'react'
import type { BalanceResult } from '@deepseek-ai/dsh-balance-badge/types'

/** Component props: the Remote getter and the optional client timer. */
export interface BalanceChipProps {
  remote: { get(): Promise<BalanceResult> }
  timer?: { interval(callback: () => void, delay: number): () => void }
}

/** One of the three render states. */
export type ChipState =
  | { kind: 'loading' }
  | { kind: 'error'; reason: string }
  | { kind: 'ok'; data: BalanceResult }

const REFRESH_MS = 5 * 60 * 1000

/**
 * Render the balance chip; refresh on mount, every five minutes, and on click.
 * @param props - the Remote getter and the optional client timer.
 */
export function BalanceChip({ remote, timer }: BalanceChipProps) {
  const [state, setState] = useState<ChipState>({ kind: 'loading' })

  const refresh = () => {
    remote.get().then((result) => {
      if (result.ok) setState({ kind: 'ok', data: result })
      else setState({ kind: 'error', reason: result.reason ?? '查询失败' })
    }).catch((error: unknown) => {
      setState({ kind: 'error', reason: error instanceof Error ? error.message : String(error) })
    })
  }

  useEffect(() => {
    refresh()
    if (timer !== undefined) return timer.interval(refresh, REFRESH_MS)
    return undefined
  }, [])

  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', fontSize: 11, lineHeight: '20px',
    padding: '0 8px', borderRadius: 10, cursor: 'pointer', userSelect: 'none',
    color: '#8b949e', border: '1px solid rgba(128,128,128,.25)',
    background: 'transparent', whiteSpace: 'nowrap',
  }

  let text: string
  let title: string
  if (state.kind === 'loading') {
    text = '余额 ···'
    title = '正在查询 DeepSeek 余额…'
  } else if (state.kind === 'error') {
    text = '余额 查询失败'
    title = `${state.reason}（点击重试）`
  } else {
    text = `余额 ¥${state.data.cny ?? ''}`
    const parts: string[] = []
    if (state.data.topped !== null && state.data.topped !== undefined) parts.push(`充值 ¥${state.data.topped}`)
    if (state.data.granted !== null && state.data.granted !== undefined) parts.push(`赠送 ¥${state.data.granted}`)
    parts.push(state.data.available ? '账户可用' : '账户不可用')
    parts.push('点击刷新')
    title = parts.join(' · ')
  }

  return (
    <span className="dsb-chip" style={style} title={title} onClick={() => refresh()}>
      {text}
    </span>
  )
}
