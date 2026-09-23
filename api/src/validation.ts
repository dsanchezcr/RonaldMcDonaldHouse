const supportedLanguages = new Set((process.env.SUPPORTED_LANGUAGES || 'en,es,fr,pt,ar,he').split(','))
const concernPatterns: Array<[string, RegExp]> = [
  ['contact-information', /\b(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s().-]*){7,}|@[a-z0-9_]{2,})/iu],
  ['medical-content', /\b(?:diagnos(?:is|ed)|medication|dosage|treatment recommendation|you should take)\b/iu],
  ['recovery-promise', /\b(?:get well soon|speedy recovery|everything will be (?:ok|okay)|you will recover|feel better)\b/iu],
  ['solicitation', /\b(?:donate|fundraiser|send money|cash app|venmo)\b/iu],
  ['prompt-injection', /\b(?:ignore (?:all |the )?(?:previous|system) instructions|reveal (?:your )?prompt|bypass (?:the )?rules)\b/iu],
  ['unsafe-content', /\b(?:kill yourself|sexual abuse|racial slur)\b/iu],
]

export function messageConcerns(message: string): string[] {
  return concernPatterns.filter(([, pattern]) => pattern.test(message)).map(([concern]) => concern)
}

export function validateReviewInput(input: unknown): { message: string; language: string; action: string } {
  if (!input || typeof input !== 'object') throw new Error('invalid-request')
  const value = input as Record<string, unknown>
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  const language = typeof value.language === 'string' ? value.language : ''
  const action = typeof value.action === 'string' ? value.action : 'review'
  if (message.length < 10 || message.length > Number(process.env.MAX_MESSAGE_LENGTH || 350)) throw new Error('invalid-message')
  if (!supportedLanguages.has(language)) throw new Error('invalid-language')
  if (!['review', 'shorten', 'clarify', 'improve-warmth'].includes(action)) throw new Error('invalid-action')
  return { message, language, action }
}

export function validateSubmissionMetadata(
  languageCode: unknown,
  designSource: unknown,
  consentVersion: unknown,
): { languageCode: string; designSource: 'approved-catalog' | 'ai-generated'; consentVersion: string } {
  if (typeof languageCode !== 'string' || !supportedLanguages.has(languageCode)) throw new Error('invalid-language')
  if (designSource !== 'approved-catalog' && designSource !== 'ai-generated') throw new Error('invalid-design-source')
  const expectedConsent = process.env.CONSENT_VERSION || '2026-01'
  if (consentVersion !== expectedConsent) throw new Error('invalid-consent')
  return { languageCode, designSource, consentVersion: expectedConsent }
}
