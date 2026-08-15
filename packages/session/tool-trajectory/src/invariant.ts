/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-trajectory`.
 * @module @deepseek-ai/dsh-tool-trajectory/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-trajectory'

/** Cordis companion plugin name. */
export const name = 'tool-trajectory-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this row registers one tool whose digest is a pure
 * function of the session event window; the session service owns event
 * authority and the tools registry owns registration and disposal.
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
