import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { stripeCheckoutEnabled } from './stripeWallet'

const DAILY_LIMIT = 4

type ModelKey = 'schnell' | 'banana2' | 'krea2'

type GenModel = {
  key: ModelKey
  falId: string
  label: string
  blurb: string
  priceCents: number
  free: boolean
}

const MODELS: Record<ModelKey, GenModel> = {
  schnell: {
    key: 'schnell',
    falId: 'fal-ai/flux/schnell',
    label: 'Flux Schnell',
    blurb: 'Fast preview',
    priceCents: 5,
    free: true,
  },
  banana2: {
    key: 'banana2',
    falId: 'fal-ai/nano-banana-2',
    label: 'Nano Banana 2',
    blurb: 'Gemini · sharp text',
    priceCents: 15,
    free: false,
  },
  krea2: {
    key: 'krea2',
    falId: 'krea/v2/large/text-to-image',
    label: 'Krea 2',
    blurb: 'Art-directed stills',
    priceCents: 12,
    free: false,
  },
}

const ASPECTS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4'])
const LEGACY_SIZE_TO_ASPECT: Record<string, string> = {
  square_hd: '1:1',
  square: '1:1',
  landscape_16_9: '16:9',
  portrait_16_9: '9:16',
  landscape_4_3: '4:3',
  portrait_4_3: '3:4',
}

function publicModels() {
  return Object.values(MODELS).map((m) => ({
    id: m.key,
    label: m.label,
    blurb: m.blurb,
    priceCents: m.priceCents,
    free: m.free,
  }))
}

function resolveModel(raw: unknown): GenModel {
  if (typeof raw === 'string' && raw in MODELS) return MODELS[raw as ModelKey]
  return MODELS.schnell
}

function resolveAspect(body: { aspect?: unknown; imageSize?: unknown }) {
  if (typeof body.aspect === 'string' && ASPECTS.has(body.aspect)) return body.aspect
  if (typeof body.imageSize === 'string') {
    if (ASPECTS.has(body.imageSize)) return body.imageSize
    if (LEGACY_SIZE_TO_ASPECT[body.imageSize]) return LEGACY_SIZE_TO_ASPECT[body.imageSize]
  }
  return '1:1'
}

function falPayload(model: GenModel, prompt: string, aspect: string, seed?: number) {
  const body: Record<string, unknown> = { prompt }
  if (typeof seed === 'number') body.seed = seed
  if (model.key === 'schnell') {
    body.image_size =
      aspect === '16:9'
        ? 'landscape_16_9'
        : aspect === '9:16'
          ? 'portrait_16_9'
          : aspect === '4:3'
            ? 'landscape_4_3'
            : aspect === '3:4'
              ? 'portrait_4_3'
              : 'square_hd'
    body.num_images = 1
    body.num_inference_steps = 4
    body.enable_safety_checker = true
    body.output_format = 'jpeg'
  } else if (model.key === 'banana2') {
    body.num_images = 1
    body.aspect_ratio = aspect
    body.output_format = 'jpeg'
    body.safety_tolerance = '4'
    body.resolution = '1K'
    body.limit_generations = true
  } else {
    body.aspect_ratio = aspect === '3:4' ? '4:5' : aspect
    body.creativity = 'medium'
  }
  return body
}

function looksBlocked(status: number, falJson: { error?: string; detail?: unknown; description?: string } | null) {
  if (status === 422) return true
  const bits = [falJson?.error, falJson?.description, typeof falJson?.detail === 'string' ? falJson.detail : '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return /nsfw|safety|blocked|content.?polic|prohibited|moderation/.test(bits)
}

type FalImage = {
  url?: string
  width?: number
  height?: number
}

const FAILS_PER_SLOT = 3

function startOfUtcDay() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function utcDayKey() {
  return startOfUtcDay().toISOString().slice(0, 10)
}

type GenUser = {
  id: string
  genFailStreak?: number | null
  genPenaltySlots?: number | null
  genPenaltyDay?: string | null
  genBalanceCents?: number | null
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

async function deleteFromR2(url: string) {
  const client = r2Client()
  const bucket = process.env.R2_BUCKET
  const domain = process.env.R2_PUBLIC_ACCESS_DOMAIN
  if (!client || !bucket || !domain || !url.includes(`${domain}/`)) return
  const marker = `${domain}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const key = decodeURIComponent(url.slice(idx + marker.length).split('?')[0] || '')
  if (!key.startsWith('gens/')) return
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } catch {
    // Record removal still proceeds if the object is already gone.
  }
}

function ownerIdOf(user: string | { id?: string } | null | undefined) {
  if (!user) return ''
  return typeof user === 'string' ? user : String(user.id || '')
}

function isAdminUser(user: { roles?: string[] } | null | undefined) {
  return Array.isArray(user?.roles) && user.roles.includes('admin')
}

async function gensToday(req: PayloadRequest, userId: string) {
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

async function loadGenUser(req: PayloadRequest, userId: string) {
  return (await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })) as GenUser
}

function penaltySlotsForToday(user: GenUser) {
  const day = utcDayKey()
  if (user.genPenaltyDay !== day) return 0
  return Number(user.genPenaltySlots) || 0
}

async function usedToday(req: PayloadRequest, userId: string) {
  const user = await loadGenUser(req, userId)
  const gens = await gensToday(req, userId)
  return gens + penaltySlotsForToday(user)
}

async function recordBlockedGen(req: PayloadRequest, userId: string) {
  const user = await loadGenUser(req, userId)
  const day = utcDayKey()
  const penalties = penaltySlotsForToday(user)
  const nextStreak = (Number(user.genFailStreak) || 0) + 1
  const consumed = nextStreak >= FAILS_PER_SLOT
  const streak = consumed ? 0 : nextStreak
  const nextPenalties = penalties + (consumed ? 1 : 0)

  await req.payload.update({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    data: {
      genFailStreak: streak,
      genPenaltySlots: nextPenalties,
      genPenaltyDay: day,
    } as never,
  })

  return { streak, consumed, penalties: nextPenalties }
}

export const genStatusEndpoint: Endpoint = {
  path: '/gen/status',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to generate.' }, { status: 401 })
    }
    const userId = String(req.user.id)
    const used = await usedToday(req, userId)
    const genUser = await loadGenUser(req, userId)
    const remaining = Math.max(0, DAILY_LIMIT - used)
    const balanceCents = Number(genUser.genBalanceCents) || 0
    const cheapestPaid = Math.min(...Object.values(MODELS).map((m) => m.priceCents))
    return Response.json({
      enabled: Boolean(process.env.FAL_KEY),
      model: MODELS.schnell.label,
      modelId: MODELS.schnell.key,
      models: publicModels(),
      dailyLimit: DAILY_LIMIT,
      used,
      remaining,
      failStreak: Number(genUser.genFailStreak) || 0,
      failsPerSlot: FAILS_PER_SLOT,
      balanceCents,
      priceCents: MODELS.schnell.priceCents,
      stripeEnabled: stripeCheckoutEnabled(),
      packs: [5, 15, 40, 100, 500],
      canGenerate: remaining > 0 || balanceCents >= cheapestPaid,
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

export const genFileEndpoint: Endpoint = {
  path: '/gen/file/:id',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to download.' }, { status: 401 })
    }
    const params = req.routeParams as { id?: unknown } | undefined
    const id = typeof params?.id === 'string' ? params.id : ''
    if (!id) {
      return Response.json({ message: 'Missing image id' }, { status: 400 })
    }

    try {
      const doc = (await req.payload.findByID({
        collection: 'generations' as never,
        id,
        depth: 0,
        overrideAccess: true,
      })) as { url?: string; user?: string | { id?: string } }

      const ownerId = typeof doc.user === 'string' ? doc.user : doc.user?.id
      const isAdmin = Array.isArray((req.user as { roles?: string[] }).roles)
        && (req.user as { roles?: string[] }).roles?.includes('admin')
      if (!doc?.url || (!isAdmin && ownerId !== String(req.user.id))) {
        return Response.json({ message: 'Image not found' }, { status: 404 })
      }

      const upstream = await fetch(doc.url)
      if (!upstream.ok || !upstream.body) {
        return Response.redirect(doc.url, 302)
      }

      return new Response(upstream.body, {
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
          'Content-Disposition': 'attachment; filename="artrealmai-gen.jpg"',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch {
      return Response.json({ message: 'Image not found' }, { status: 404 })
    }
  },
}

export const genDeleteEndpoint: Endpoint = {
  path: '/gen/file/:id',
  method: 'delete',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to delete.' }, { status: 401 })
    }
    const params = req.routeParams as { id?: unknown } | undefined
    const id = typeof params?.id === 'string' ? params.id : ''
    if (!id) {
      return Response.json({ message: 'Missing image id' }, { status: 400 })
    }

    try {
      const doc = (await req.payload.findByID({
        collection: 'generations' as never,
        id,
        depth: 0,
        overrideAccess: true,
      })) as { url?: string; user?: string | { id?: string } }

      const ownerId = ownerIdOf(doc.user)
      if (!isAdminUser(req.user as { roles?: string[] }) && ownerId !== String(req.user.id)) {
        return Response.json({ message: 'Image not found' }, { status: 404 })
      }

      if (doc.url) await deleteFromR2(doc.url)
      await req.payload.delete({
        collection: 'generations' as never,
        id,
        overrideAccess: true,
      })
      return Response.json({ ok: true, id })
    } catch {
      return Response.json({ message: 'Image not found' }, { status: 404 })
    }
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
      model?: unknown
      aspect?: unknown
      imageSize?: unknown
      seed?: unknown
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (prompt.length < 3) {
      return Response.json({ message: 'Write a prompt of at least a few words.' }, { status: 400 })
    }
    if (prompt.length > 20000) {
      return Response.json({ message: 'Prompt is too long (max 20,000 characters).' }, { status: 400 })
    }

    const model = resolveModel(body.model)
    const aspect = resolveAspect(body)
    const seed =
      typeof body.seed === 'number' && Number.isFinite(body.seed)
        ? Math.floor(body.seed)
        : typeof body.seed === 'string' && body.seed.trim() && Number.isFinite(Number(body.seed))
          ? Math.floor(Number(body.seed))
          : undefined

    const userId = String(req.user.id)
    const used = await usedToday(req, userId)
    const remainingFree = Math.max(0, DAILY_LIMIT - used)
    const genUser = await loadGenUser(req, userId)
    const balanceCents = Number(genUser.genBalanceCents) || 0
    const useFree = model.free && remainingFree > 0
    if (!useFree && balanceCents < model.priceCents) {
      const hint = model.free
        ? `Daily free gens are used. Add funds to keep generating ($${(model.priceCents / 100).toFixed(2)} each).`
        : `${model.label} is $${(model.priceCents / 100).toFixed(2)} each. Add funds to generate.`
      return Response.json(
        {
          message: hint,
          remaining: remainingFree,
          balanceCents,
          priceCents: model.priceCents,
          model: model.label,
          modelId: model.key,
          needsFunds: true,
        },
        { status: 402 },
      )
    }

    const falRes = await fetch(`https://fal.run/${model.falId}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falPayload(model, prompt, aspect, seed)),
    })

    const falJson = (await falRes.json().catch(() => null)) as {
      images?: FalImage[]
      seed?: number
      has_nsfw_concepts?: boolean[]
      detail?: unknown
      error?: string
      description?: string
    } | null

    const blocked = Boolean(falJson?.has_nsfw_concepts?.[0]) || looksBlocked(falRes.status, falJson)
    if (blocked) {
      const block = await recordBlockedGen(req, userId)
      const usedAfter = await usedToday(req, userId)
      const remaining = Math.max(0, DAILY_LIMIT - usedAfter)
      const policy = 'Every 3 blocked prompts uses 1 free gen, to stop abuse and bots.'
      const message = block.consumed
        ? `That prompt was blocked by the safety checker. ${policy} This was fail ${FAILS_PER_SLOT} of ${FAILS_PER_SLOT} and used 1 free gen. ${remaining} left today.`
        : `That prompt was blocked by the safety checker. ${policy} This is fail ${block.streak} of ${FAILS_PER_SLOT}.`
      return Response.json(
        {
          message,
          remaining,
          failStreak: block.streak,
          failsPerSlot: FAILS_PER_SLOT,
          slotConsumed: block.consumed,
          balanceCents,
          priceCents: model.priceCents,
          model: model.label,
          modelId: model.key,
        },
        { status: 422 },
      )
    }

    if (!falRes.ok) {
      const detail = falJson && typeof falJson.error === 'string' ? falJson.error : 'The image service failed.'
      return Response.json(
        { message: detail, remaining: remainingFree, balanceCents, priceCents: model.priceCents },
        { status: 502 },
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
        const contentType = fileRes.headers.get('content-type') || 'image/jpeg'
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
        const name = `${userId}-${Date.now()}.${ext}`
        storedUrl = (await persistToR2(bytes, name, contentType)) || image.url
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
        model: model.label,
        imageSize: aspect,
        seed: typeof falJson?.seed === 'number' ? falJson.seed : seed,
        url: storedUrl,
        width: image.width,
        height: image.height,
      } as never,
    })) as { id: string }

    let chargedCents = 0
    let nextBalance = balanceCents
    let remaining = remainingFree
    if (useFree) {
      remaining = Math.max(0, remainingFree - 1)
    } else {
      chargedCents = model.priceCents
      nextBalance = balanceCents - model.priceCents
      await req.payload.update({
        collection: 'users',
        id: userId,
        overrideAccess: true,
        data: { genBalanceCents: nextBalance } as never,
      })
    }

    return Response.json({
      id: doc.id,
      url: storedUrl,
      seed: typeof falJson?.seed === 'number' ? falJson.seed : seed,
      model: model.label,
      modelId: model.key,
      remaining,
      balanceCents: nextBalance,
      chargedCents,
      priceCents: model.priceCents,
    })
  },
}

export const generateImageEndpoints: Endpoint[] = [
  genStatusEndpoint,
  genListEndpoint,
  genFileEndpoint,
  genDeleteEndpoint,
  genImageEndpoint,
]
