import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'

export interface StoredSubmission {
  success: true
  submissionId: string
  submittedUtc: string
}

function containerClient(): ContainerClient {
  const accountUrl = process.env.STORAGE_ACCOUNT_URL
  const containerName = process.env.STORAGE_CONTAINER
  if (!accountUrl || !containerName) throw new Error('storage-unavailable')
  return new BlobServiceClient(accountUrl, new DefaultAzureCredential()).getContainerClient(containerName)
}

export async function sanitizeJpeg(bytes: Buffer, maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 5_000_000)): Promise<Buffer> {
  if (bytes.length < 4 || bytes.length > maxBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('invalid-image')
  const image = sharp(bytes, { failOn: 'error', limitInputPixels: 20_000_000 })
  const metadata = await image.metadata()
  if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height) throw new Error('invalid-image')
  const ratio = metadata.width / metadata.height
  if (ratio < 1.6 || ratio > 1.9) throw new Error('invalid-image')
  return image.rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer()
}

export async function storeSubmission(
  image: Buffer,
  metadata: { languageCode: string; designSource: string; consentVersion: string },
  idempotencyKey: string,
): Promise<StoredSubmission> {
  if (!/^[a-zA-Z0-9-]{16,100}$/u.test(idempotencyKey)) throw new Error('invalid-idempotency-key')
  const container = containerClient()
  const hash = createHash('sha256').update(idempotencyKey).digest('hex')
  const marker = container.getBlockBlobClient(`idempotency/${hash}.json`)
  try {
    await marker.upload(JSON.stringify({ status: 'pending' }), Buffer.byteLength('{"status":"pending"}'), {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: 'application/json' },
    })
  } catch {
    const response = await marker.downloadToBuffer().catch(() => null)
    if (!response) throw new Error('duplicate-pending')
    const existing = JSON.parse(response.toString()) as Partial<StoredSubmission> & { status?: string }
    if (existing.success && existing.submissionId && existing.submittedUtc) return existing as StoredSubmission
    throw new Error('duplicate-pending')
  }

  const submissionId = randomUUID()
  const submittedUtc = new Date().toISOString()
  const result: StoredSubmission = { success: true, submissionId, submittedUtc }
  try {
    await container.getBlockBlobClient(`2026/10/16/cards/${submissionId}.jpg`).uploadData(image, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg', blobCacheControl: 'private, no-store' },
      metadata: {
        event: 'rmh-words-of-encouragement-2026',
        submissionversion: '1',
        languagecode: metadata.languageCode,
        designsource: metadata.designSource,
        submittedutc: submittedUtc,
      },
    })
    await marker.uploadData(Buffer.from(JSON.stringify(result)), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    })
    return result
  } catch {
    await marker.deleteIfExists().catch(() => undefined)
    throw new Error('storage-unavailable')
  }
}
