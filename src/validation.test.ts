import { describe, expect, it } from 'vitest'
import { isRtlLanguage, validateFirstName, validateMessage } from './validation'

describe('message validation', () => {
  it('accepts a supportive anonymous message', () => {
    expect(validateMessage('Sending warmth and kind thoughts your way.')).toEqual([])
  })

  it.each([
    ['Email me at person@example.com', 'email'],
    ['Call me at 425-555-1212 today', 'phone'],
    ['Visit https://example.com for help', 'url'],
    ['Everything will be okay, feel better', 'promise'],
    ['You should take this medication', 'medical'],
  ])('detects unsafe pattern in %s', (message, code) => {
    expect(validateMessage(message).map((item) => item.code)).toContain(code)
  })

  it('enforces the configured character maximum', () => {
    expect(validateMessage('a'.repeat(351), 350).map((item) => item.code)).toContain('too-long')
  })

  it('allows one optional first name and recognizes RTL languages', () => {
    expect(validateFirstName('Amina')).toBeUndefined()
    expect(validateFirstName('Amina Smith')).toBeDefined()
    expect(isRtlLanguage('ar')).toBe(true)
    expect(isRtlLanguage('es')).toBe(false)
  })
})
