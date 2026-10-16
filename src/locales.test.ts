import { describe, expect, it } from 'vitest'
import { browserLanguage, languages, messages } from './locales'
import { validateMessage } from './validation'

function leaves(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'string') return { [path]: value }
  if (!value || typeof value !== 'object') throw new Error(`Invalid translation at ${path}`)
  return Object.assign({}, ...Object.entries(value).map(([key, child]) => leaves(child, `${path}.${key}`)))
}

describe('translations', () => {
  it.each(languages)('provides complete, safe messages and matching placeholders for $code', ({ code }) => {
    const reference = leaves(messages.en)
    const actual = leaves(messages[code])
    expect(Object.keys(actual)).toEqual(Object.keys(reference))
    for (const [key, value] of Object.entries(actual)) {
      expect(value.trim(), key).not.toBe('')
      expect(value.match(/\{\w+\}/gu) || [], key).toEqual(reference[key].match(/\{\w+\}/gu) || [])
    }
    for (const phrase of messages[code].phrases) expect(validateMessage(phrase), phrase).toEqual([])
  })

  it.each([
    [['es-MX'], 'es'], [['pt-PT'], 'pt-BR'], [['zh-Hans'], 'zh-CN'],
    [['unsupported', 'de-DE'], 'de'], [[], 'en'],
  ] as const)('resolves browser languages %j to %s', (input, expected) => {
    expect(browserLanguage(input)).toBe(expected)
  })
})
