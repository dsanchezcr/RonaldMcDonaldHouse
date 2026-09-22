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

export function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/u)) {
    const words = paragraph.split(/\s+/u)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  return lines
}

export async function renderCard(state: CardState): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is not supported by this browser.')

  const image = await loadImage(state.design.image)
  context.drawImage(image, 0, 0, WIDTH, HEIGHT)
  context.fillStyle = state.design.panelColor
  context.fillRect(260, 150, 1080, 600)

  const fontSize = Math.min(68, Math.max(38, state.fontSize))
  context.font = `${fontSize}px "Segoe UI", Arial, sans-serif`
  context.fillStyle = state.design.textColor
  context.textAlign = state.textAlign
  context.textBaseline = 'middle'
  context.direction = isRtlLanguage(state.language) ? 'rtl' : 'ltr'

  const lines = wrapText(context, state.message, 920)
  if (state.firstName) lines.push('', `— ${state.firstName}`)
  const lineHeight = fontSize * 1.35
  const x = state.textAlign === 'left' ? 340 : state.textAlign === 'right' ? 1260 : 800
  const firstY = 450 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => context.fillText(line, x, firstY + index * lineHeight, 920))
  return canvas
}

export async function cardToBlob(state: CardState): Promise<Blob> {
  const canvas = await renderCard(state)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('JPG generation failed.'))), 'image/jpeg', 0.92)
  })
}
