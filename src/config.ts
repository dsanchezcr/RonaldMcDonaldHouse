import type { CardDesign } from './types'

export const config = {
  eventTitle: import.meta.env.VITE_EVENT_TITLE || '',
  eventDate: import.meta.env.VITE_EVENT_DATE || '',
  eventTime: import.meta.env.VITE_EVENT_TIME || '',
  eventDuration: import.meta.env.VITE_EVENT_DURATION || '',
  activityName: import.meta.env.VITE_ACTIVITY_NAME || '',
  trackingUrl: import.meta.env.VITE_VOLUNTEER_TRACKING_URL || '',
  maxMessageLength: Number(import.meta.env.VITE_MAX_MESSAGE_LENGTH || 350),
  consentVersion: import.meta.env.VITE_CONSENT_VERSION || '2026-01',
  aiReviewEnabled: import.meta.env.VITE_AI_REVIEW_ENABLED === 'true',
  aiImageEnabled: import.meta.env.VITE_AI_IMAGE_ENABLED === 'true',
  footerText: import.meta.env.VITE_APPROVED_FOOTER_TEXT || '',
}

export { languages } from './locales'

export const designs: CardDesign[] = [
  ['colorful-squares', 'Thinking of You: Colorful Squares', 'Warm geometric shapes surrounding an open message area.'],
  ['butterflies-flowers', 'Butterflies and Flowers', 'Gentle butterflies and flowers around a clear message area.'],
  ['joyful-wishes', 'Joyful Wishes', 'Cheerful shapes framing a spacious message area.'],
  ['sending-sunshine', 'Sending Sunshine', 'A bright, hopeful sunshine-inspired card.'],
  ['spring-flowers', 'Thinking of You: Spring Flowers', 'Soft spring flowers around a calm message area.'],
  ['heart-encouragement', 'Heart of Encouragement', 'Warm heart shapes framing the message.'],
].map(([id, title, description]) => ({
  id,
  title,
  description,
  image: `/assets/templates/${id}.jpg`,
  source: 'approved-catalog' as const,
  textColor: '#3a2a23',
  panelColor: 'rgba(255, 250, 239, 0.9)',
  embeddedEnglish: !['butterflies-flowers', 'heart-encouragement'].includes(id),
}))
