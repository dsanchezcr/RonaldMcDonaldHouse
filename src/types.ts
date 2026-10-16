export type DesignSource = 'approved-catalog' | 'ai-generated'
export type TextAlign = 'left' | 'center' | 'right'

export interface CardDesign {
  id: string
  title: string
  description: string
  image: string
  source: DesignSource
  textColor: string
  panelColor: string
  embeddedEnglish?: boolean
}

export interface ReviewResponse {
  status: 'approved' | 'suggestion' | 'blocked' | 'unavailable'
  safetyClassification: 'safe' | 'needs-revision' | 'not-reviewed'
  detectedConcerns: string[]
  suggestedRevision?: string
  explanation: string
  requestId: string
}

export interface SubmissionResponse {
  success: boolean
  submissionId: string
  submittedUtc: string
}

export interface GeneratedBackgroundResponse {
  status: 'generated'
  imageDataUrl: string
  accessibleDescription: string
  requestId: string
}

export interface CardState {
  design: CardDesign
  message: string
  firstName: string
  language: string
  textAlign: TextAlign
  fontSize: number
}
