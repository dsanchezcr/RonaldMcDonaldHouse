import { describe, expect, it } from 'vitest'
import { cardFingerprint } from './api'
import { designs } from './config'

describe('submission fingerprint', () => {
  it('is stable for retries and changes with card content or metadata', async () => {
    const card = { design: designs[0], message: 'Sending warm thoughts.', firstName: '', language: 'en', textAlign: 'center' as const, fontSize: 54 }
    const first = await cardFingerprint(card, '2026-01')
    const retry = await cardFingerprint(card, '2026-01')
    const changedCard = await cardFingerprint({ ...card, message: 'Sending kind thoughts.' }, '2026-01')
    const changedLanguage = await cardFingerprint({ ...card, language: 'es' }, '2026-01')
    expect(retry).toBe(first)
    expect(changedCard).not.toBe(first)
    expect(changedLanguage).not.toBe(first)
  })
})
