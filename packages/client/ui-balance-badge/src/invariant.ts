/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-balance-badge`.
 * @module @deepseek-ai/dsh-client-ui-balance-badge/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-balance-badge'

/** Cordis companion plugin name. */
export const name = 'ui-balance-badge-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the client half registers one slot contribution and
 * the Remote service owns the data; the slot registry owns registration and
 * disposal, and the client timer owns the refresh interval.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
