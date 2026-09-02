import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'

const DAILY_LIMIT = 8
const MODEL_ID = 'fal-ai/flux/schnell'
const MODEL_LABEL = 'Flux Schnell'

const IMAGE_SIZES = new Set([
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
])

type FalImage = {
  url?: string
  width?: number
  height?: number
}

function startOfUtcDay() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

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

async function persistToR2(buffer: Buffer, filename: string, contentType: string) {
  const client = r2Client()
  const bucket = process.env.R2_BUCKET
  const domain = process.env.R2_PUBLIC_ACCESS_DOMAIN
  if (!client || !bucket || !domain) return null
  const key = `gens/${filename}`
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )
  return `https://${domain}/${key}`
}

async function usedToday(req: PayloadRequest, userId: string) {
  const result = await req.payload.find({
    collection: 'generations' as never,
    overrideAccess: true,
    limit: 1,
    where: {
      and: [{ user: { equals: userId } }, { createdAt: { greater_than_equal: startOfUtcDay().toISOString() } }],
    },
  })
  return result.totalDocs
}

export const genStatusEndpoint: Endpoint = {
  path: '/gen/status',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to generate.' }, { status: 401 })
    }
    const used = await usedToday(req, String(req.user.id))
    return Response.json({
      enabled: Boolean(process.env.FAL_KEY),
      model: MODEL_LABEL,
      modelId: MODEL_ID,
      dailyLimit: DAILY_LIMIT,
      used,
      remaining: Math.max(0, DAILY_LIMIT - used),
    })
  },
}

export const genListEndpoint: Endpoint = {
  path: '/gen/mine',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to view your gallery.' }, { status: 401 })
    }
    const result = await req.payload.find({
      collection: 'generations' as never,
      overrideAccess: true,
      where: { user: { equals: String(req.user.id) } },
      sort: '-createdAt',
      limit: 24,
    })
    return Response.json({
      docs: result.docs.map((doc) => {
        const row = doc as {
          id: string
          prompt?: string
          model?: string
          url?: string
          seed?: number | null
          imageSize?: string | null
          createdAt?: string
        }
        return {
          id: row.id,
          prompt: row.prompt,
          model: row.model,
          url: row.url,
          seed: row.seed,
          imageSize: row.imageSize,
          createdAt: row.createdAt,
        }
      }),
    })
  },
}

export const genImageEndpoint: Endpoint = {
  path: '/gen/image',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to generate.' }, { status: 401 })
    }

    const falKey = process.env.FAL_KEY || ''
    if (!falKey) {
      return Response.json(
        { message: 'Image generation is not connected yet. Add FAL_KEY on Vercel.' },
        { status: 503 },
      )
    }

    try {
      await addDataAndFileToRequest(req)
    } catch {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }

    const body = (req.data || {}) as {
      prompt?: unknown
      imageSize?: unknown
      seed?: unknown
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (prompt.length < 3) {
      return Response.json({ message: 'Write a prompt of at least a few words.' }, { status: 400 })
    }
    if (prompt.length > 2000) {
      return Response.json({ message: 'Prompt is too long (max 2000 characters).' }, { status: 400 })
    }

    const imageSize =
      typeof body.imageSize === 'string' && IMAGE_SIZES.has(body.imageSize) ? body.imageSize : 'square_hd'
    const seed =
      typeof body.seed === 'number' && Number.isFinite(body.seed)
        ? Math.floor(body.seed)
        : typeof body.seed === 'string' && body.seed.trim() && Number.isFinite(Number(body.seed))
          ? Math.floor(Number(body.seed))
          : undefined

    const userId = String(req.user.id)
    const used = await usedToday(req, userId)
    if (used >= DAILY_LIMIT) {
      return Response.json(
        {
          message: `Daily preview limit reached (${DAILY_LIMIT} images). Credits come next.`,
          remaining: 0,
        },
        { status: 429 },
      )
    }

    const falBody: Record<string, unknown> = {
      prompt,
      image_size: imageSize,
      num_images: 1,
      num_inference_steps: 4,
      enable_safety_checker: true,
      output_format: 'jpeg',
    }
    if (typeof seed === 'number') falBody.seed = seed

    const falRes = await fetch(`https://fal.run/${MODEL_ID}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falBody),
    })

    const falJson = (await falRes.json().catch(() => null)) as {
      images?: FalImage[]
      seed?: number
      has_nsfw_concepts?: boolean[]
      detail?: unknown
      error?: string
    } | null

    if (!falRes.ok) {
      const detail = falJson && typeof falJson.error === 'string' ? falJson.error : 'The image service failed.'
      return Response.json({ message: detail }, { status: 502 })
    }

    if (falJson?.has_nsfw_concepts?.[0]) {
      return Response.json(
        { message: 'That prompt was blocked by the safety checker. Try a different description.' },
        { status: 422 },
      )
    }

    const image = falJson?.images?.[0]
    if (!image?.url) {
      return Response.json({ message: 'No image came back. Try again.' }, { status: 502 })
    }

    let storedUrl = image.url
    try {
      const fileRes = await fetch(image.url)
      if (fileRes.ok) {
        const bytes = Buffer.from(await fileRes.arrayBuffer())
        const name = `${userId}-${Date.now()}.jpg`
        storedUrl = (await persistToR2(bytes, name, 'image/jpeg')) || image.url
      }
    } catch {
      storedUrl = image.url
    }

    const doc = (await req.payload.create({
      collection: 'generations' as never,
      overrideAccess: true,
      data: {
        user: userId,
        prompt,
        model: MODEL_LABEL,
        imageSize,
        seed: typeof falJson?.seed === 'number' ? falJson.seed : seed,
        url: storedUrl,
        width: image.width,
        height: image.height,
      } as never,
    })) as { id: string }

    return Response.json({
      id: doc.id,
      url: storedUrl,
      seed: typeof falJson?.seed === 'number' ? falJson.seed : seed,
      model: MODEL_LABEL,
      remaining: Math.max(0, DAILY_LIMIT - used - 1),
    })
  },
}

export const generateImageEndpoints: Endpoint[] = [genStatusEndpoint, genListEndpoint, genImageEndpoint]
