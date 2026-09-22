import { DefaultAzureCredential } from '@azure/identity'

const credential = new DefaultAzureCredential()

async function bearerToken(): Promise<string> {
  const token = await credential.getToken('https://cognitiveservices.azure.com/.default')
  if (!token?.token) throw new Error('ai-unavailable')
  return token.token
}

export async function callJsonModel(endpoint: string, payload: unknown): Promise<unknown> {
  const accessToken = await bearerToken()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: ['Bearer', accessToken].join(' '),
      'Content-Type': 'application/json',
    },
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
  )) as { categoriesAnalysis?: Array<{ category: string; severity: number }> }
  const threshold = Number(process.env.CONTENT_SAFETY_THRESHOLD || 2)
  return (result.categoriesAnalysis || []).filter((item) => item.severity >= threshold).map((item) => item.category.toLowerCase())
}
