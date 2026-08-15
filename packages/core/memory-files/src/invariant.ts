/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-memory-files`.
 * @module @deepseek-ai/dsh-memory-files/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-memory-files'

/** Cordis companion plugin name. */
export const name = 'memory-files-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this row registers one prompt section and three
 * tools; the prompt registry owns section assembly and the tools registry owns
 * registration and disposal, while the fs seam owns write confinement.
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
