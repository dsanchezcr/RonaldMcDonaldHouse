export type ConcernCode =
  | 'required'
  | 'too-short'
  | 'too-long'
  | 'url'
  | 'email'
  | 'phone'
  | 'personal-info'
  | 'medical'
  | 'promise'
  | 'repeated'

export interface ValidationConcern {
  code: ConcernCode
  message: string
}

const patterns: Array<[ConcernCode, RegExp, string]> = [
  ['url', /\b(?:https?:\/\/|www\.)\S+/iu, 'Remove web links from your message.'],
  ['email', /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/iu, 'Remove email addresses from your message.'],
  ['phone', /(?:\+?\d[\s().-]*){7,}/u, 'Remove phone numbers from your message.'],
  ['personal-info', /\b(?:my (?:email|phone|address|alias) is|contact me|@[a-z0-9_]{2,})\b/iu, 'Remove personal or contact information.'],
  ['medical', /\b(?:diagnos(?:is|ed)|medication|dosage|treatment recommendation|you should take)\b/iu, 'Remove medical details or advice.'],
  ['promise', /\b(?:get well soon|speedy recovery|everything will be (?:ok|okay)|you will recover|feel better)\b/iu, 'Avoid promises or assumptions about recovery.'],
  ['repeated', /(.)\1{9,}/u, 'Please remove long repeated character sequences.'],
]

export function validateMessage(value: string, maxLength = 350): ValidationConcern[] {
  const text = value.trim()
  const concerns: ValidationConcern[] = []
  if (!text) concerns.push({ code: 'required', message: 'Write a message before continuing.' })
  if (text && text.length < 10) concerns.push({ code: 'too-short', message: 'Add a little more detail to your message.' })
  if (value.length > maxLength) concerns.push({ code: 'too-long', message: `Keep your message to ${maxLength} characters or fewer.` })
  for (const [code, pattern, message] of patterns) {
    if (pattern.test(value)) concerns.push({ code, message })
  }
  return concerns
}

export function validateFirstName(value: string): string | undefined {
  const name = value.trim()
  if (!name) return undefined
  if (name.length > 40 || /\s|@|\d|[./\\]/u.test(name)) {
    return 'Use one first name only, without contact information.'
  }
  return undefined
}

export function isRtlLanguage(language: string): boolean {
  return ['ar', 'he', 'fa', 'ur'].includes(language.toLowerCase())
}
