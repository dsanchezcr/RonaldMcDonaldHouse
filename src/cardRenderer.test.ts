import { describe, expect, it } from 'vitest'
import { createCardFilename, wrapText } from './cardRenderer'

describe('card rendering helpers', () => {
  it('creates a non-identifying filename', () => {
    const filename = createCardFilename(new Date('2026-10-16T18:05:00Z'), '12345678-abcd-efgh')
    expect(filename).toBe('words-of-encouragement-20261016180500-12345678.jpg')
    expect(filename).not.toMatch(/name|message|language/iu)
  })

  it('wraps text without losing words or line breaks', () => {
    const context = { measureText: (value: string) => ({ width: value.length * 10 }) } as CanvasRenderingContext2D
    expect(wrapText(context, 'Sending kind thoughts\nToday', 100)).toEqual(['Sending', 'kind', 'thoughts', 'Today'])
  })
})
