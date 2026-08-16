/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-balance-badge`.
 * @module @deepseek-ai/dsh-balance-badge/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-balance-badge'

/** Cordis companion plugin name. */
export const name = 'balance-badge-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this row registers one stateless Remote service;
 * the typert registry owns its Remote surface and disposal, the credentials
 * seam owns key resolution, and the subprocess seam owns command confinement.
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
