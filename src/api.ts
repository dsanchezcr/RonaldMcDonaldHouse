import type { CardState, GeneratedBackgroundResponse, ReviewResponse, SubmissionResponse } from './types'
import type { MessageKey } from './locales'

export class ServiceError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Service request failed (${status}).`)
    this.status = status
  }
}

export function serviceErrorKey(error: unknown, fallback: MessageKey): MessageKey {
  if (error instanceof ServiceError) {
    if (error.status === 429) return 'rateError'
    if (error.status === 409) return 'pendingError'
    if (error.status === 400 || error.status === 413) return 'requestError'
  }
  return fallback
}

export function resolveApiUrl(path: string, baseUrl = import.meta.env.VITE_API_BASE_URL || ''): string {
  return `${baseUrl.replace(/\/+$/u, '')}${path}`
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ServiceError(response.status)
  }
  return response.json() as Promise<T>
}

export async function reviewMessage(message: string, language: string): Promise<ReviewResponse> {
  return parseResponse<ReviewResponse>(
    await fetch(resolveApiUrl('/api/review-message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, language, action: 'review' }),
    }),
  )
}

export async function generateBackground(description: string, locale: string): Promise<GeneratedBackgroundResponse> {
  return parseResponse<GeneratedBackgroundResponse>(
    await fetch(resolveApiUrl('/api/generate-background'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, stylePreset: 'warm-illustration', locale }),
    }),
  )
}

export async function submitCard(
  image: Blob,
  language: string,
  designSource: string,
  consentVersion: string,
  idempotencyKey: string,
): Promise<SubmissionResponse> {
  const form = new FormData()
  form.append('card', image, 'card.jpg')
  form.append('languageCode', language)
  form.append('designSource', designSource)
  form.append('consentVersion', consentVersion)
  return parseResponse<SubmissionResponse>(
    await fetch(resolveApiUrl('/api/submit-card'), {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: form,
    }),
  )
}

export async function cardFingerprint(
  card: CardState,
  consentVersion: string,
): Promise<string> {
  const canonicalState = JSON.stringify({
    designId: card.design.id,
    designSource: card.design.source,
    message: card.message,
    firstName: card.firstName,
    language: card.language,
    textAlign: card.textAlign,
    fontSize: card.fontSize,
    consentVersion,
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalState))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
