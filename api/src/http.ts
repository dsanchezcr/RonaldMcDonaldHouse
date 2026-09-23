import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { createHash } from 'node:crypto'

const rateLimits = new Map<string, { count: number; reset: number }>()

function allowedOrigin(request: HttpRequest): string | undefined {
  const origin = request.headers.get('origin')
  const configured = (process.env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean)
  return origin && configured.includes(origin) ? origin : undefined
}

export function json(request: HttpRequest, status: number, body: unknown): HttpResponseInit {
  const origin = allowedOrigin(request)
  return {
    status,
    jsonBody: body,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    },
  }
}

export function requireSecureRequest(request: HttpRequest): void {
  const local = process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development'
  const forwarded = request.headers.get('x-forwarded-proto')
  if (!local && request.url.startsWith('http:') && forwarded !== 'https') throw new Error('https-required')
}

export function enforceRateLimit(request: HttpRequest, limit = 20): void {
  const source = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const key = createHash('sha256').update(`${new Date().toISOString().slice(0, 10)}:${source}`).digest('hex')
  const now = Date.now()
  const current = rateLimits.get(key)
  if (!current || current.reset < now) {
    rateLimits.set(key, { count: 1, reset: now + 60_000 })
    return
  }
  current.count += 1
  if (current.count > limit) throw new Error('rate-limited')
  if (rateLimits.size > 10_000) rateLimits.clear()
}

export function publicMessage(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message : ''
  if (code === 'rate-limited') return { status: 429, message: 'Too many requests. Please wait a moment and try again.' }
  if (code === 'https-required') return { status: 400, message: 'A secure connection is required.' }
  if (code === 'duplicate-pending') return { status: 409, message: 'This card is already being submitted. Please wait before retrying.' }
  if (code.startsWith('invalid-') || code === 'unsafe-message') {
    return { status: 400, message: 'Please revise the request so it contains only supportive content and no personal, medical, or contact information.' }
  }
  return { status: 503, message: 'The service is temporarily unavailable. Please try again.' }
}
