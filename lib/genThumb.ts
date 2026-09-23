import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { randomFileName } from './randomFile'

const THUMB = 360

function r2Client() {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) return null
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
}

async function persistThumb(buffer: Buffer): Promise<string | null> {
  const client = r2Client()
  const bucket = process.env.R2_BUCKET
  const domain = process.env.R2_PUBLIC_ACCESS_DOMAIN
  if (!client || !bucket || !domain) return null
  const filename = randomFileName('webp')
  const key = `gens/thumbs/${filename}`
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/webp',
    }),
  )
  return `https://${domain}/${key}`
}

export async function makeGenThumbFromBuffer(source: Buffer): Promise<string | null> {
  try {
    const webp = await sharp(source)
      .rotate()
      .resize(THUMB, THUMB, { fit: 'cover', position: 'centre' })
      .webp({ quality: 72 })
      .toBuffer()
    return persistThumb(webp)
  } catch {
    return null
  }
}

export async function makeGenThumbFromUrl(url: string): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return makeGenThumbFromBuffer(buf)
  } catch {
    return null
  }
}

function abortAfter(ms: number): AbortSignal {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
}

// Sharp cannot decode MP4. Ask the video service for one JPEG frame, then store the usual 360 WebP.
export async function makeVideoPosterFromUrl(videoUrl: string): Promise<string | null> {
  if (!videoUrl || !videoUrl.startsWith('http')) return null
  const falKey = process.env.FAL_KEY || ''
  if (!falKey) return null
  try {
    const res = await fetch('https://fal.run/fal-ai/ffmpeg-api/extract-frame', {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_url: videoUrl, frame_type: 'middle' }),
      signal: abortAfter(30000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { images?: { url?: string }[] }
    const frameUrl = json.images?.[0]?.url || ''
    if (!frameUrl.startsWith('http')) return null
    const frameRes = await fetch(frameUrl, { signal: abortAfter(15000) })
    if (!frameRes.ok) return null
    const buf = Buffer.from(await frameRes.arrayBuffer())
    return makeGenThumbFromBuffer(buf)
  } catch {
    return null
  }
}

export function isVideoGen(kind?: string | null, format?: string | null) {
  return kind === 'video' || String(format || '').toUpperCase() === 'MP4'
}
