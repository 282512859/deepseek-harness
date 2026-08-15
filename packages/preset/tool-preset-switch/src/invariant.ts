/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-preset-switch`.
 * @module @deepseek-ai/dsh-tool-preset-switch/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-preset-switch'

/** Cordis companion plugin name. */
export const name = 'tool-preset-switch-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this row registers one tool; the tools registry owns
 * registration, disposal, prompt assembly, and scope enforcement. Recomposition
 * safety (unscoped refusal, roster validation) is owned by `dsh-agent-presets`.
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
