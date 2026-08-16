import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('host half', () => {
  it('applies as a no-op row', () => {
    const ctx = { get: () => undefined }
    expect(() => apply(ctx as never)).not.toThrow()
  })
})
