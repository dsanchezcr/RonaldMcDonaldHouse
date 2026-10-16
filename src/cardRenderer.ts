import type { CardState } from './types'
import { isRtlLanguage } from './validation'

const WIDTH = 1600
const HEIGHT = 900

export function createCardFilename(now = new Date(), random: string = crypto.randomUUID()): string {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14)
  return `words-of-encouragement-${stamp}-${random.slice(0, 8)}.jpg`
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The selected design could not be loaded.'))
    image.src = source
  })
}

export function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, language = 'en'): string[] {
  const lines: string[] = []
  const words = new Intl.Segmenter(language, { granularity: 'word' })
  const graphemes = new Intl.Segmenter(language, { granularity: 'grapheme' })
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = ''
    for (const { segment } of words.segment(paragraph.trim())) {
      if (/^\s+$/u.test(segment)) {
        if (line) line += ' '
        continue
      }
      if (line && context.measureText(line + segment).width > maxWidth) {
        lines.push(line.trimEnd())
        line = ''
      }
      for (const { segment: grapheme } of graphemes.segment(segment)) {
        if (context.measureText(grapheme).width > maxWidth) throw new Error('A character is too wide for the card.')
        if (line && context.measureText(line + grapheme).width > maxWidth) {
          lines.push(line)
          line = ''
        }
        line += grapheme
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

export function layoutCardText(context: CanvasRenderingContext2D, state: CardState) {
  const fontFamily = '"Segoe UI", "Yu Gothic", "Microsoft YaHei", "Malgun Gothic", Arial, sans-serif'
  for (let fontSize = Math.min(68, Math.max(38, state.fontSize)); fontSize >= 20; fontSize -= 1) {
    context.font = `${fontSize}px ${fontFamily}`
    const lines = wrapText(context, state.message, 920, state.language)
    if (state.firstName) lines.push('', ...wrapText(context, `— ${state.firstName}`, 920, state.language))
    const lineHeight = fontSize * 1.35
    if (lines.length * lineHeight <= 500) return { lines, lineHeight, fontSize }
  }
  throw new Error('The message does not fit on the card. Shorten it or remove some line breaks.')
}

export async function renderCard(state: CardState): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  canvas.lang = state.language
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is not supported by this browser.')

  const image = await loadImage(state.design.image)
  context.drawImage(image, 0, 0, WIDTH, HEIGHT)
  context.fillStyle = state.design.panelColor
  context.fillRect(260, 150, 1080, 600)

  context.fillStyle = state.design.textColor
  context.textAlign = state.textAlign
  context.textBaseline = 'middle'
  context.direction = isRtlLanguage(state.language) ? 'rtl' : 'ltr'

  await document.fonts?.ready
  const { lines, lineHeight } = layoutCardText(context, state)
  const x = state.textAlign === 'left' ? 340 : state.textAlign === 'right' ? 1260 : 800
  const firstY = 450 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => context.fillText(line, x, firstY + index * lineHeight))
  return canvas
}

export async function cardToBlob(state: CardState): Promise<Blob> {
  const canvas = await renderCard(state)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('JPG generation failed.'))), 'image/jpeg', 0.92)
  })
}
