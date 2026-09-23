import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { sanitizeJpeg } from './storage.js'

describe('JPG sanitization', () => {
  it('decodes, bounds, and re-encodes a landscape JPEG without metadata', async () => {
    const source = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#fffaf0' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'Do not retain' } } })
      .jpeg()
      .toBuffer()
    const sanitized = await sanitizeJpeg(source)
    const metadata = await sharp(sanitized).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(metadata.exif).toBeUndefined()
  })

  it('rejects non-JPEG and extreme aspect ratios', async () => {
    await expect(sanitizeJpeg(Buffer.from('not-an-image'))).rejects.toThrow('invalid-image')
    const portrait = await sharp({
      create: { width: 200, height: 800, channels: 3, background: '#ffffff' },
    }).jpeg().toBuffer()
    await expect(sanitizeJpeg(portrait)).rejects.toThrow('invalid-image')
  })
})
