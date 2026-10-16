import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardFingerprint, generateBackground, resolveApiUrl, reviewMessage, ServiceError, serviceErrorKey, submitCard } from './api'
import { designs } from './config'
import { languages } from './locales'

afterEach(() => vi.unstubAllGlobals())

describe('localized API requests', () => {
  it.each(languages)('preserves $code in review, background and submission requests', async ({ code }) => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await reviewMessage('A supportive message.', code)
    await generateBackground('A warm background.', code)
    await submitCard(new Blob(['jpg']), code, 'approved-catalog', '2026-01', 'retry-key')
    const calls = vi.mocked(fetch).mock.calls
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({ language: code })
    expect(JSON.parse(String(calls[1][1]?.body))).toMatchObject({ locale: code })
    const body = calls[2][1]?.body
    expect(body).toBeInstanceOf(FormData)
    if (!(body instanceof FormData)) throw new Error('Missing submission form')
    expect(body.get('languageCode')).toBe(code)
  })

  it('maps service failures to localizable errors without displaying server details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('internal details', { status: 429 })))
    await expect(reviewMessage('A supportive message.', 'ja')).rejects.toBeInstanceOf(ServiceError)
    expect(serviceErrorKey(new ServiceError(429), 'reviewError')).toBe('rateError')
    expect(serviceErrorKey(new TypeError('Network error'), 'submitError')).toBe('submitError')
  })
})

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

describe('API URL resolution', () => {
  it('keeps local relative API paths and normalizes a configured Function App URL', () => {
    expect(resolveApiUrl('/api/health', '')).toBe('/api/health')
    expect(resolveApiUrl('/api/health', 'https://rmh-ecard-api.azurewebsites.net/')).toBe(
      'https://rmh-ecard-api.azurewebsites.net/api/health',
    )
  })
})
