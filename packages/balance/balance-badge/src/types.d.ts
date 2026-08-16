/**
 * Client-safe type surface of the DeepSeek balance Remote.
 * Types only — no runtime code, and nothing here reaches a Host-only symbol,
 * so a Client compilation face reads exactly the signature the Host emits.
 * @module @deepseek-ai/dsh-balance-badge/types
 */
/** The `get` Remote result. */
export interface BalanceResult {
  ok: boolean
  reason?: string
  available?: boolean
  cny?: string
  granted?: string | null
  topped?: string | null
}
//# sourceMappingURL=types.d.ts.map
