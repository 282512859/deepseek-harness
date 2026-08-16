/**
 * Balance badge, browser half: the DeepSeek account-balance chip in the
 * composer tool row (`conversation.input.right`). Reads through the generated
 * `deepseekBalance` Remote; refreshes every five minutes and on click.
 * @module @deepseek-ai/dsh-client-ui-balance-badge/client
 */

import React from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.right entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { BalanceChip, type BalanceChipProps } from './BalanceChip.tsx'

/** Required services: the slot registry and the Remote namespace. */
export const inject = ['slots', 'remote', 'remote.deepseekBalance']

/**
 * Client plugin body: the balance chip in the composer tool row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const timer = ctx.get('timer') as
    | { interval(callback: () => void, delay: number): () => void }
    | undefined

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
    { name: 'conversation.input.right', id: 'deepseek-balance', order: 50, label: () => 'DeepSeek 余额' },
    () => {
      const props: BalanceChipProps = timer === undefined
        ? { remote: ctx.remote.deepseekBalance }
        : { remote: ctx.remote.deepseekBalance, timer }
      return React.createElement(BalanceChip, props)
    },
  ))
}
