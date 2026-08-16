/**
 * Host half of the balance-badge client plugin: a no-op row so the Loader
 * mounts the package; all behavior lives in the client half and the
 * `@deepseek-ai/dsh-balance-badge` Remote service.
 * @module @deepseek-ai/dsh-client-ui-balance-badge
 */
import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'ui-balance-badge'

/**
 * Register the host-side row. Nothing is registered here; the client half
 * contributes the badge UI and the Remote service owns the data.
 * @param _ctx - host context (unused).
 */
export function apply(_ctx: Context): void {}
