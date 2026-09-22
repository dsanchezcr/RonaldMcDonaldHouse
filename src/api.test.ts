import { describe, expect, it } from 'vitest'
import { cardFingerprint } from './api'

describe('submission fingerprint', () => {
  it('is stable for retries and changes with card content or metadata', async () => {
    const first = await cardFingerprint(new Blob(['card-one']), 'en', 'approved-catalog', '2026-01')
    const retry = await cardFingerprint(new Blob(['card-one']), 'en', 'approved-catalog', '2026-01')
    const changedCard = await cardFingerprint(new Blob(['card-two']), 'en', 'approved-catalog', '2026-01')
    const changedLanguage = await cardFingerprint(new Blob(['card-one']), 'es', 'approved-catalog', '2026-01')
    expect(retry).toBe(first)
    expect(changedCard).not.toBe(first)
    expect(changedLanguage).not.toBe(first)
  })
})
