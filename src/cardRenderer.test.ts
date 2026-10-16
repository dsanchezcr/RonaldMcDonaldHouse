import { describe, expect, it } from 'vitest'
import { createCardFilename, layoutCardText, wrapText } from './cardRenderer'
import { designs } from './config'
import { languages, messages } from './locales'

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

  it.each(['ja', 'zh-CN', 'ko', 'de'])('wraps unspaced %s text without loss or overflow', (language) => {
    const context = { measureText: (value: string) => ({ width: Array.from(value).length * 10 }) } as CanvasRenderingContext2D
    const text = language === 'de' ? 'Ermutigungsnachrichten'.repeat(4) : '温かい気持ち와응원祝福'.repeat(8)
    const lines = wrapText(context, text, 100, language)
    expect(lines.join('')).toBe(text)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => context.measureText(line).width <= 100)).toBe(true)
  })

  it('does not split combining marks or emoji graphemes', () => {
    const context = { measureText: (value: string) => ({ width: [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)].length * 20 }) } as CanvasRenderingContext2D
    expect(wrapText(context, 'e\u0301e\u0301👨‍👩‍👧‍👦', 20)).toEqual(['e\u0301', 'e\u0301', '👨‍👩‍👧‍👦'])
  })

  it.each(languages)('fits long $code messages and signatures within the panel', ({ code }) => {
    const context = {
      font: '',
      measureText(value: string) { return { width: Array.from(value).length * parseFloat(this.font) } },
    } as CanvasRenderingContext2D
    const message = messages[code].phrases.join(' ').repeat(8).slice(0, 350)
    const layout = layoutCardText(context, { design: designs[1], message, language: code, firstName: '名'.repeat(40), fontSize: 68, textAlign: 'center' })
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(500)
    expect(layout.lines.every((line) => context.measureText(line).width <= 920)).toBe(true)
    expect(layout.lines.join('').replace(/\s/gu, '')).toContain(message.replace(/\s/gu, ''))
  })

  it('reports messages that cannot fit instead of clipping them', () => {
    const context = { measureText: (value: string) => ({ width: value.length * 10 }) } as CanvasRenderingContext2D
    expect(() => layoutCardText(context, { design: designs[1], message: 'line\n'.repeat(80), language: 'en', firstName: '', fontSize: 68, textAlign: 'center' })).toThrow('does not fit')
  })
})
