import { app, type HttpRequest } from '@azure/functions'
import { randomUUID } from 'node:crypto'
import { callJsonModel } from '../ai.js'
import { json, publicMessage, requireSecureRequest } from '../http.js'

const categories = ['Hate', 'Sexual', 'SelfHarm', 'Violence']

app.http('moderate-image', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'moderate-image',
  handler: async (request: HttpRequest) => {
    const requestId = randomUUID()
    try {
      requireSecureRequest(request)
      const expectedKey = process.env.IMAGE_MODERATION_KEY
      if (!expectedKey || request.headers.get('x-api-key') !== expectedKey) throw new Error('invalid-content-type')
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new Error('invalid-content-type')
      const body = (await request.json()) as Record<string, unknown>
      const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : ''
      if (!imageBase64 || Buffer.byteLength(imageBase64, 'base64') > 8_000_000) throw new Error('invalid-image')

      const endpoint = process.env.CONTENT_SAFETY_ENDPOINT
      if (!endpoint) throw new Error('ai-unavailable')
      const result = (await callJsonModel(
        `${endpoint.replace(/\/$/u, '')}/contentsafety/image:analyze?api-version=2024-09-01`,
        { image: { content: imageBase64 }, categories, outputType: 'FourSeverityLevels' },
        'content-safety',
      )) as { categoriesAnalysis?: Array<{ category: string; severity: number }> }

      const threshold = Number(process.env.CONTENT_SAFETY_THRESHOLD || 2)
      const blocked = (result.categoriesAnalysis || []).filter((item) => item.severity >= threshold)
      if (blocked.length) {
        return json(request, 200, { safe: false, requestId })
      }

      return json(request, 200, {
        safe: true,
        accessibleDescription: 'AI-generated warm abstract eCard background with an open message area.',
        requestId,
      })
    } catch (error) {
      const response = publicMessage(error)
      return json(request, response.status, { message: response.message, requestId })
    }
  },
})
