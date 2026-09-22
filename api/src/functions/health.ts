import { app, type HttpRequest } from '@azure/functions'
import { json } from '../http.js'

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (request: HttpRequest) => json(request, 200, { status: 'healthy' }),
})
