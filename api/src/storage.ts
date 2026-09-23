import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'

export interface StoredSubmission {
  success: true
  submissionId: string
  submittedUtc: string
}

function containerClient(): ContainerClient {
  const containerName = process.env.STORAGE_CONTAINER
  const connectionString = process.env.STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
  if (!connectionString || !containerName) throw new Error('storage-unavailable')
  const service = BlobServiceClient.fromConnectionString(connectionString)
  return service.getContainerClient(containerName)
}

export async function sanitizeJpeg(bytes: Buffer, maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 5_000_000)): Promise<Buffer> {
  if (
    bytes.length < 4 ||
    bytes.length > maxBytes ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) throw new Error('invalid-image')
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
  recoveryAttempt = 0,
): Promise<StoredSubmission> {
  if (!/^[a-zA-Z0-9-]{16,100}$/u.test(idempotencyKey)) throw new Error('invalid-idempotency-key')
  const container = containerClient()
  if (process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development') await container.createIfNotExists()
  const hash = createHash('sha256').update(idempotencyKey).digest('hex')
  const marker = container.getBlockBlobClient(`idempotency/${hash}.json`)
  try {
    await marker.upload(JSON.stringify({ status: 'pending' }), Buffer.byteLength('{"status":"pending"}'), {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: 'application/json' },
    })
  } catch {
    const [response, properties] = await Promise.all([
      marker.downloadToBuffer().catch(() => null),
      marker.getProperties().catch(() => null),
    ])
    if (!response || !properties) throw new Error('duplicate-pending')
    const existing = JSON.parse(response.toString()) as Partial<StoredSubmission> & { status?: string }
    if (existing.success && existing.submissionId && existing.submittedUtc) return existing as StoredSubmission
    const staleAfterMs = Number(process.env.IDEMPOTENCY_PENDING_SECONDS || 300) * 1_000
    if (recoveryAttempt === 0 && properties.lastModified && Date.now() - properties.lastModified.getTime() > staleAfterMs && properties.etag) {
      const deleted = await marker.deleteIfExists({ conditions: { ifMatch: properties.etag } }).catch(() => null)
      if (deleted?.succeeded) return storeSubmission(image, metadata, idempotencyKey, recoveryAttempt + 1)
    }
    throw new Error('duplicate-pending')
  }

  const submissionId = randomUUID()
  const submittedUtc = new Date().toISOString()
  const result: StoredSubmission = { success: true, submissionId, submittedUtc }
  try {
    const pathPrefix = (process.env.BLOB_PATH_PREFIX || '2026/10/16/cards').replace(/^\/|\/$/gu, '')
    await container.getBlockBlobClient(`${pathPrefix}/${submissionId}.jpg`).uploadData(image, {
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
