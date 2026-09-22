import { app, type HttpRequest } from '@azure/functions'
import { randomUUID } from 'node:crypto'
import { callJsonModel, contentSafetyConcerns } from '../ai.js'
import { enforceRateLimit, json, publicMessage, requireSecureRequest } from '../http.js'
import { messageConcerns } from '../validation.js'

const constraints = `Landscape 16:9 eCard background; warm, supportive, family-friendly; large uncluttered message area.
No people, faces, patients, hospitals, medical devices, treatments, logos, brands, text, letters, numbers,
signatures, copyrighted characters, living-artist imitation, frightening, clinical, or distressing imagery.`

app.http('generate-background', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'generate-background',
  handler: async (request: HttpRequest) => {
    const requestId = randomUUID()
    try {
      requireSecureRequest(request)
      enforceRateLimit(request, 5)
      const body = (await request.json()) as Record<string, unknown>
      const description = typeof body.description === 'string' ? body.description.trim() : ''
      if (description.length < 3 || description.length > 300) throw new Error('invalid-prompt')
      const concerns = [...messageConcerns(description), ...(await contentSafetyConcerns(description))]
      if (concerns.length) throw new Error('unsafe-message')
      const endpoint = process.env.AI_IMAGE_ENDPOINT
      if (!endpoint) return json(request, 503, { message: 'AI image generation is not configured. Please choose an approved design.', requestId })
      const result = (await callJsonModel(endpoint, {
        prompt: `${description}\n\nRequired constraints:\n${constraints}`,
        size: '1792x1024',
        quality: 'standard',
        n: 1,
        response_format: 'b64_json',
      })) as { data?: Array<{ b64_json?: string; revised_prompt?: string }> }
      const image = result.data?.[0]?.b64_json
      if (!image || Buffer.byteLength(image, 'base64') > 8_000_000) throw new Error('ai-unavailable')
      return json(request, 200, {
        status: 'generated',
        imageDataUrl: `data:image/png;base64,${image}`,
        accessibleDescription: 'AI-generated warm abstract eCard background with an open message area.',
        requestId,
      })
    } catch (error) {
      const response = publicMessage(error)
      return json(request, response.status, { message: response.message, requestId })
    }
  },
})
