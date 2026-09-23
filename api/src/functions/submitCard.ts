import { app, type HttpRequest } from '@azure/functions'
import { enforceRateLimit, json, publicMessage, requireSecureRequest } from '../http.js'
import { sanitizeJpeg, storeSubmission } from '../storage.js'
import { validateSubmissionMetadata } from '../validation.js'

app.http('submit-card', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'submit-card',
  handler: async (request: HttpRequest) => {
    try {
      requireSecureRequest(request)
      enforceRateLimit(request, 10)
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) throw new Error('invalid-content-type')
      const contentLength = Number(request.headers.get('content-length') || 0)
      const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 5_000_000)
      if (contentLength && contentLength > maxBytes + 20_000) throw new Error('invalid-image')
      const form = await request.formData()
      const card = form.get('card')
      if (!(card instanceof Blob) || card.type !== 'image/jpeg') throw new Error('invalid-image')
      const metadata = validateSubmissionMetadata(form.get('languageCode'), form.get('designSource'), form.get('consentVersion'))
      const image = await sanitizeJpeg(Buffer.from(await card.arrayBuffer()), maxBytes)
      const key = request.headers.get('idempotency-key') || ''
      const result = await storeSubmission(image, metadata, key)
      return json(request, 201, result)
    } catch (error) {
      const response = publicMessage(error)
      return json(request, response.status, { success: false, message: response.message })
    }
  },
})
