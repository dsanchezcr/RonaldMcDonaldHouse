type KeyAuthKind = 'azure-openai' | 'content-safety' | 'image-moderation'

function authHeaders(kind: KeyAuthKind): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (kind === 'content-safety') {
    const key = process.env.CONTENT_SAFETY_KEY || process.env.AZURE_AI_SERVICES_KEY
    if (!key) throw new Error('ai-unavailable')
    headers['Ocp-Apim-Subscription-Key'] = key
    return headers
  }
  if (kind === 'image-moderation') {
    const key = process.env.IMAGE_MODERATION_KEY
    if (!key) throw new Error('ai-unavailable')
    headers['x-api-key'] = key
    return headers
  }
  const key = process.env.AI_API_KEY || process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_AI_SERVICES_KEY
  if (!key) throw new Error('ai-unavailable')
  headers['api-key'] = key
  return headers
}

export async function callJsonModel(endpoint: string, payload: unknown, authKind: KeyAuthKind = 'azure-openai'): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(authKind),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error('ai-unavailable')
  return response.json()
}

export async function contentSafetyConcerns(text: string): Promise<string[]> {
  const endpoint = process.env.CONTENT_SAFETY_ENDPOINT
  if (!endpoint) return []
  const result = (await callJsonModel(
    `${endpoint.replace(/\/$/u, '')}/contentsafety/text:analyze?api-version=2024-09-01`,
    { text, categories: ['Hate', 'Sexual', 'SelfHarm', 'Violence'], outputType: 'FourSeverityLevels' },
    'content-safety',
  )) as { categoriesAnalysis?: Array<{ category: string; severity: number }> }
  const threshold = Number(process.env.CONTENT_SAFETY_THRESHOLD || 2)
  return (result.categoriesAnalysis || []).filter((item) => item.severity >= threshold).map((item) => item.category.toLowerCase())
}

export async function moderateGeneratedImage(imageBase64: string): Promise<string> {
  const endpoint = process.env.IMAGE_MODERATION_ENDPOINT
  if (!endpoint) throw new Error('ai-unavailable')
  const result = (await callJsonModel(endpoint, {
    imageBase64,
    checks: ['harm', 'text', 'logo', 'recognizable-character', 'identifiable-person', 'medical-imagery'],
  }, 'image-moderation')) as { safe?: boolean; accessibleDescription?: string }
  if (!result.safe) throw new Error('unsafe-message')
  return result.accessibleDescription || 'AI-generated warm abstract eCard background with an open message area.'
}
