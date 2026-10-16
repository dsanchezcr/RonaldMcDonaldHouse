import { HttpRequest, InvocationContext, type HttpHandler, type HttpFunctionOptions } from '@azure/functions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callJsonModel, contentSafetyConcerns, moderateGeneratedImage } from './ai.js'

const handlers = vi.hoisted(() => new Map<string, HttpHandler>())
vi.mock('@azure/functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@azure/functions')>()
  return { ...actual, app: { http: (name: string, options: HttpFunctionOptions) => handlers.set(name, options.handler) } }
})
vi.mock('./ai.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./ai.js')>(),
  callJsonModel: vi.fn(),
  contentSafetyConcerns: vi.fn(),
  moderateGeneratedImage: vi.fn(),
}))

import './functions/reviewMessage.js'
import './functions/generateBackground.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('server-side AI feature flags', () => {
  it.each([
    ['review-message', 'AI_REVIEW_ENABLED'],
    ['generate-background', 'AI_IMAGE_ENABLED'],
  ])('rejects direct %s requests before contacting upstream services when disabled', async (route, flag) => {
    const handler = handlers.get(route)
    if (!handler) throw new Error(`Missing handler: ${route}`)
    for (const value of [undefined, '', 'false', 'False', ' FALSE ', '0', 'yes']) {
      vi.stubEnv(flag, value)
      const request = new HttpRequest({
        method: 'POST',
        url: `https://example.org/api/${route}`,
        headers: { 'content-type': 'application/json' },
        body: { string: JSON.stringify({ message: 'Sending warm thoughts.', language: 'es', description: 'Warm sunshine', locale: 'es' }) },
      })
      const response = await handler(request, new InvocationContext())
      expect(response?.status).toBe(503)
      expect(callJsonModel).not.toHaveBeenCalled()
      expect(contentSafetyConcerns).not.toHaveBeenCalled()
      expect(moderateGeneratedImage).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['review-message', 'AI_REVIEW_ENABLED'],
    ['generate-background', 'AI_IMAGE_ENABLED'],
  ])('accepts explicit true regardless of casing in %s', async (route, flag) => {
    const handler = handlers.get(route)
    if (!handler) throw new Error(`Missing handler: ${route}`)
    for (const value of ['true', 'True', 'TRUE', ' true ']) {
      vi.stubEnv(flag, value)
      const request = new HttpRequest({
        method: 'POST',
        url: `https://example.org/api/${route}`,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `${route}-${value.trim()}` },
        body: { string: '{}' },
      })
      const response = await handler(request, new InvocationContext())
      expect(response?.status).toBe(400)
      expect(callJsonModel).not.toHaveBeenCalled()
      expect(contentSafetyConcerns).not.toHaveBeenCalled()
    }
  })
})
