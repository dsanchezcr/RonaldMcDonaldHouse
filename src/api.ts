import type { GeneratedBackgroundResponse, ReviewResponse, SubmissionResponse } from './types'

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message || 'The service is temporarily unavailable. Please try again.')
  }
  return response.json() as Promise<T>
}

export async function reviewMessage(message: string, language: string): Promise<ReviewResponse> {
  return parseResponse<ReviewResponse>(
    await fetch('/api/review-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, language, action: 'review' }),
    }),
  )
}

export async function generateBackground(description: string, locale: string): Promise<GeneratedBackgroundResponse> {
  return parseResponse<GeneratedBackgroundResponse>(
    await fetch('/api/generate-background', {
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
    await fetch('/api/submit-card', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: form,
    }),
  )
}

export async function cardFingerprint(
  image: Blob,
  language: string,
  designSource: string,
  consentVersion: string,
): Promise<string> {
  const metadata = new TextEncoder().encode(`${language}:${designSource}:${consentVersion}`)
  const imageBytes = new Uint8Array(await image.arrayBuffer())
  const combined = new Uint8Array(metadata.length + imageBytes.length)
  combined.set(metadata)
  combined.set(imageBytes, metadata.length)
  const digest = await crypto.subtle.digest('SHA-256', combined)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
