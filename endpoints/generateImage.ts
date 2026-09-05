import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { stripeCheckoutEnabled } from './stripeWallet'

const DAILY_LIMIT = 4

type ModelKey =
  | 'schnell'
  | 'flux2pro'
  | 'banana2'
  | 'bananapro'
  | 'seedream45'
  | 'seedream5lite'
  | 'grok'
  | 'krea2'
type GenMode = 't2i' | 'i2i'

type GenModel = {
  key: ModelKey
  falId: string
  falEditId?: string
  label: string
  blurb: string
  priceCents: number
  free: boolean
  modes: GenMode[]
}

const MODELS: Record<ModelKey, GenModel> = {
  schnell: {
    key: 'schnell',
    falId: 'fal-ai/flux/schnell',
    label: 'Flux Schnell',
    blurb: 'Fast preview',
    priceCents: 5,
    free: true,
    modes: ['t2i'],
  },
  flux2pro: {
    key: 'flux2pro',
    falId: 'fal-ai/flux-2-pro',
    falEditId: 'fal-ai/flux-2-pro/edit',
    label: 'Flux.2 Pro',
    blurb: 'Photoreal detail',
    priceCents: 8,
    free: false,
    modes: ['t2i', 'i2i'],
  },
  banana2: {
    key: 'banana2',
    falId: 'fal-ai/nano-banana-2',
    falEditId: 'fal-ai/nano-banana-2/edit',
    label: 'Nano Banana 2',
    blurb: 'Sharp text',
    priceCents: 15,
    free: false,
    modes: ['t2i', 'i2i'],
  },
  bananapro: {
    key: 'bananapro',
    falId: 'fal-ai/nano-banana-pro',
    falEditId: 'fal-ai/nano-banana-pro/edit',
    label: 'Nano Banana Pro',
    blurb: 'Studio quality',
    priceCents: 25,
    free: false,
    modes: ['t2i', 'i2i'],
  },
  seedream45: {
    key: 'seedream45',
    falId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    falEditId: 'fal-ai/bytedance/seedream/v4.5/edit',
    label: 'Seedream 4.5',
    blurb: 'Strong prompt follow',
    priceCents: 10,
    free: false,
    modes: ['t2i', 'i2i'],
  },
  seedream5lite: {
    key: 'seedream5lite',
    falId: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    falEditId: 'fal-ai/bytedance/seedream/v5/lite/edit',
    label: 'Seedream 5 Lite',
    blurb: 'Fast 2K stills',
    priceCents: 8,
    free: false,
    modes: ['t2i', 'i2i'],
  },
  grok: {
    key: 'grok',
    falId: 'xai/grok-imagine-image',
    falEditId: 'xai/grok-imagine-image/edit',
    label: 'Grok Imagine',
    blurb: 'High-fidelity stills',
    priceCents: 6,
    free: false,
    modes: ['t2i', 'i2i'],
  },
  krea2: {
    key: 'krea2',
    falId: 'krea/v2/large/text-to-image',
    label: 'Krea 2',
    blurb: 'Art-directed stills',
    priceCents: 12,
    free: false,
    modes: ['t2i'],
  },
}

const MAX_SOURCE_BYTES = 4 * 1024 * 1024

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
    modes: m.modes,
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

function fluxImageSize(aspect: string) {
  if (aspect === '16:9') return 'landscape_16_9'
  if (aspect === '9:16') return 'portrait_16_9'
  if (aspect === '4:3') return 'landscape_4_3'
  if (aspect === '3:4') return 'portrait_4_3'
  return 'square_hd'
}

function seedreamImageSize(aspect: string) {
  if (aspect === '16:9') return { width: 2560, height: 1440 }
  if (aspect === '9:16') return { width: 1440, height: 2560 }
  if (aspect === '4:3') return { width: 2304, height: 1728 }
  if (aspect === '3:4') return { width: 1728, height: 2304 }
  return { width: 2048, height: 2048 }
}

function falPayload(model: GenModel, prompt: string, aspect: string, seed?: number, imageUrl?: string) {
  const body: Record<string, unknown> = { prompt }
  if (typeof seed === 'number' && model.key !== 'grok') body.seed = seed

  if (model.key === 'schnell') {
    body.image_size = fluxImageSize(aspect)
    body.num_images = 1
    body.num_inference_steps = 4
    body.enable_safety_checker = true
    body.output_format = 'jpeg'
  } else if (model.key === 'flux2pro') {
    body.image_size = imageUrl ? 'auto' : fluxImageSize(aspect)
    body.enable_safety_checker = true
    body.safety_tolerance = '2'
    body.output_format = 'jpeg'
    if (imageUrl) body.image_urls = [imageUrl]
  } else if (model.key === 'banana2' || model.key === 'bananapro') {
    body.num_images = 1
    body.aspect_ratio = aspect
    body.output_format = 'jpeg'
    body.safety_tolerance = '4'
    body.resolution = '1K'
    body.limit_generations = true
    if (imageUrl) body.image_urls = [imageUrl]
  } else if (model.key === 'seedream45' || model.key === 'seedream5lite') {
    body.image_size = seedreamImageSize(aspect)
    body.num_images = 1
    body.max_images = 1
    body.enable_safety_checker = true
    if (imageUrl) body.image_urls = [imageUrl]
  } else if (model.key === 'grok') {
    body.num_images = 1
    body.aspect_ratio = imageUrl ? 'auto' : aspect
    body.resolution = '1k'
    body.output_format = 'jpeg'
    if (imageUrl) body.image_urls = [imageUrl]
  } else {
    body.aspect_ratio = aspect === '3:4' ? '4:5' : aspect
    body.creativity = 'medium'
  }
  return body
}

function parseDataImage(raw: unknown) {
  if (typeof raw !== 'string' || !raw.startsWith('data:image/')) return null
  const match = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return null
  const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) return null
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  return { buffer, contentType, ext }
}

type FalImage = {
  url?: string
  width?: number
  height?: number
}

type FalJson = {
  images?: FalImage[]
  seed?: number
  has_nsfw_concepts?: boolean[]
  detail?: unknown
  body?: unknown
  payload?: unknown
  error?: unknown
  description?: string
} | null

const FILTERED_LEAD =
  "That prompt was blocked by the model's safety checker after the image ran. This uses 1 gen because a completed run still costs us even when you do not get the image."
const REJECTED_LEAD =
  'That prompt was rejected before a billed run started, so this one is free.'
const SERVICE_FAIL =
  'The image service failed. No gen was used. Try again.'
const SERVICE_TIMEOUT =
  'The image service timed out. No gen was used. Try again.'
const SERVICE_INVALID =
  'That request could not be processed. No gen was used.'

function normalizeFalJson(raw: unknown): FalJson {
  if (!raw) return null
  if (Array.isArray(raw)) return { detail: raw }
  if (typeof raw === 'string') return { error: raw }
  if (typeof raw === 'object') return raw as FalJson
  return null
}

function collectFalErrorBits(falJson: FalJson) {
  const types: string[] = []
  const parts: string[] = []
  if (!falJson) return { text: '', types }
  if (typeof falJson.description === 'string') parts.push(falJson.description)
  const walk = (value: unknown) => {
    if (!value) return
    if (typeof value === 'string') {
      parts.push(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (typeof value === 'object') {
      const row = value as { msg?: unknown; type?: unknown; message?: unknown; error?: unknown }
      if (typeof row.type === 'string') types.push(row.type)
      if (typeof row.msg === 'string') parts.push(row.msg)
      if (typeof row.message === 'string') parts.push(row.message)
      if (row.error && row.error !== value) walk(row.error)
    }
  }
  walk(falJson.error)
  walk(falJson.detail)
  walk(falJson.body)
  walk(falJson.payload)
  return { text: parts.join(' ').toLowerCase(), types }
}

function isPolicyReject(falJson: FalJson) {
  const { text, types } = collectFalErrorBits(falJson)
  if (types.some((type) => /content_policy|safety|moderation|nsfw|prohibited/i.test(type))) return true
  return /content_policy_violation|content.?polic|nsfw|safety checker|image_safety|prohibited_content|flagged|blocked|prohibited|moderation/.test(
    text,
  )
}

function classifyFal(status: number, falJson: FalJson): 'ok' | 'filtered' | 'rejected' | 'error' {
  const nsfwFlag = Array.isArray(falJson?.has_nsfw_concepts) && falJson.has_nsfw_concepts.some(Boolean)
  const imageUrl = falJson?.images?.[0]?.url
  if (nsfwFlag) return 'filtered'
  if (status >= 200 && status < 300) {
    if (!imageUrl) return 'filtered'
    return 'ok'
  }
  if (isPolicyReject(falJson)) return imageUrl ? 'filtered' : 'rejected'
  return 'error'
}

function serviceFailMessage(status: number, falJson: FalJson) {
  const { text } = collectFalErrorBits(falJson)
  if (!falJson || status === 408 || status === 504 || /timeout|timed out|gateway/.test(text)) {
    return SERVICE_TIMEOUT
  }
  if (status === 422) return SERVICE_INVALID
  return SERVICE_FAIL
}

function money(cents: number) {
  return '$' + (Number(cents || 0) / 100).toFixed(2)
}

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
  genBlockCount?: number | null
  genRejectCount?: number | null
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

async function persistToR2(buffer: Buffer, filename: string, contentType: string, folder = 'gens') {
  const client = r2Client()
  const bucket = process.env.R2_BUCKET
  const domain = process.env.R2_PUBLIC_ACCESS_DOMAIN
  if (!client || !bucket || !domain) return null
  const key = `${folder}/${filename}`
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

function sameGenDay(user: GenUser) {
  return user.genPenaltyDay === utcDayKey()
}

function penaltySlotsForToday(user: GenUser) {
  if (!sameGenDay(user)) return 0
  return Number(user.genPenaltySlots) || 0
}

function filteredToday(user: GenUser) {
  if (!sameGenDay(user)) return 0
  return Number(user.genBlockCount) || 0
}

function rejectsToday(user: GenUser) {
  if (!sameGenDay(user)) return 0
  return Number(user.genRejectCount) || 0
}

async function usedToday(req: PayloadRequest, userId: string) {
  const user = await loadGenUser(req, userId)
  const gens = await gensToday(req, userId)
  return gens + penaltySlotsForToday(user)
}

async function saveSafetyDay(
  req: PayloadRequest,
  userId: string,
  state: { filtered: number; rejects: number; penalties: number },
) {
  await req.payload.update({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    data: {
      genFailStreak: 0,
      genPenaltySlots: state.penalties,
      genPenaltyDay: utcDayKey(),
      genBlockCount: state.filtered,
      genRejectCount: state.rejects,
    } as never,
  })
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
      modes: [
        { id: 't2i', label: 'Text to image' },
        { id: 'i2i', label: 'Image to image' },
        { id: 'video', label: 'Video', soon: true },
      ],
      dailyLimit: DAILY_LIMIT,
      used,
      remaining,
      failStreak: 0,
      failsPerSlot: 1,
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
          modelId?: string | null
          mode?: string | null
          url?: string
          seed?: number | null
          imageSize?: string | null
          width?: number | null
          height?: number | null
          format?: string | null
          bytes?: number | null
          chargedCents?: number | null
          durationMs?: number | null
          kind?: string | null
          durationSec?: number | null
          resolution?: string | null
          createdAt?: string
        }
        return {
          id: row.id,
          prompt: row.prompt,
          model: row.model,
          modelId: row.modelId,
          mode: row.mode,
          url: row.url,
          seed: row.seed,
          imageSize: row.imageSize,
          width: row.width,
          height: row.height,
          format: row.format,
          bytes: row.bytes,
          chargedCents: row.chargedCents,
          durationMs: row.durationMs,
          kind: row.kind || 'image',
          durationSec: row.durationSec,
          resolution: row.resolution,
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
      })) as { url?: string; user?: string | { id?: string }; kind?: string; format?: string }

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

      const isVideo = doc.kind === 'video' || (doc.format || '').toUpperCase() === 'MP4'
      const filename = isVideo ? 'artrealmai-gen.mp4' : 'artrealmai-gen.jpg'
      return new Response(upstream.body, {
        headers: {
          'Content-Type':
            upstream.headers.get('content-type') || (isVideo ? 'video/mp4' : 'image/jpeg'),
          'Content-Disposition': `attachment; filename="${filename}"`,
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
      mode?: unknown
      aspect?: unknown
      imageSize?: unknown
      seed?: unknown
      image?: unknown
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (prompt.length < 3) {
      return Response.json({ message: 'Write a prompt of at least a few words.' }, { status: 400 })
    }
    if (prompt.length > 20000) {
      return Response.json({ message: 'Prompt is too long (max 20,000 characters).' }, { status: 400 })
    }

    const model = resolveModel(body.model)
    const mode: GenMode = body.mode === 'i2i' ? 'i2i' : 't2i'
    if (!model.modes.includes(mode)) {
      return Response.json(
        { message: `${model.label} does not support ${mode === 'i2i' ? 'image to image' : 'text to image'} yet.` },
        { status: 400 },
      )
    }

    const aspect = resolveAspect(body)
    const seed =
      typeof body.seed === 'number' && Number.isFinite(body.seed)
        ? Math.floor(body.seed)
        : typeof body.seed === 'string' && body.seed.trim() && Number.isFinite(Number(body.seed))
          ? Math.floor(Number(body.seed))
          : undefined

    const userId = String(req.user.id)

    let sourceUrl = ''
    if (mode === 'i2i') {
      const parsed = parseDataImage(body.image)
      if (!parsed) {
        return Response.json(
          { message: 'Add a JPEG, PNG, or WebP under 4 MB to use image to image.' },
          { status: 400 },
        )
      }
      sourceUrl =
        (await persistToR2(parsed.buffer, `${userId}-${Date.now()}.${parsed.ext}`, parsed.contentType, 'gens/in')) || ''
      if (!sourceUrl) {
        return Response.json({ message: 'Could not store the source image. Try a smaller file.' }, { status: 502 })
      }
    }

    const used = await usedToday(req, userId)
    const remainingFree = Math.max(0, DAILY_LIMIT - used)
    const genUser = await loadGenUser(req, userId)
    const balanceCents = Number(genUser.genBalanceCents) || 0
    const useFree = model.free && mode === 't2i' && remainingFree > 0
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

    const falId = mode === 'i2i' ? model.falEditId || model.falId : model.falId
    const started = Date.now()
    const falRes = await fetch(`https://fal.run/${falId}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falPayload(model, prompt, aspect, seed, sourceUrl || undefined)),
    })

    const falJson = normalizeFalJson(await falRes.json().catch(() => null))
    const outcome = classifyFal(falRes.status, falJson)

    if (outcome === 'filtered' || outcome === 'rejected') {
      const nextFiltered = filteredToday(genUser) + (outcome === 'filtered' ? 1 : 0)
      const nextRejects = rejectsToday(genUser) + (outcome === 'rejected' ? 1 : 0)
      const nextPenalties = penaltySlotsForToday(genUser) + (outcome === 'filtered' && useFree ? 1 : 0)
      await saveSafetyDay(req, userId, {
        filtered: nextFiltered,
        rejects: nextRejects,
        penalties: nextPenalties,
      })

      let chargedCents = 0
      let nextBalance = balanceCents
      if (outcome === 'filtered' && !useFree) {
        chargedCents = model.priceCents
        nextBalance = Math.max(0, balanceCents - model.priceCents)
        await req.payload.update({
          collection: 'users',
          id: userId,
          overrideAccess: true,
          data: { genBalanceCents: nextBalance } as never,
        })
      }

      const usedAfter = await usedToday(req, userId)
      const remaining = Math.max(0, DAILY_LIMIT - usedAfter)
      let message = REJECTED_LEAD
      if (outcome === 'filtered') {
        if (useFree) {
          message = `${FILTERED_LEAD} Used 1 free gen. ${remaining} left today.`
        } else {
          message = `${FILTERED_LEAD} Used 1 ${model.label} gen (${money(model.priceCents)}). Balance ${money(nextBalance)}.`
        }
      }

      return Response.json(
        {
          message,
          remaining,
          failStreak: 0,
          failsPerSlot: 1,
          slotConsumed: outcome === 'filtered',
          chargedCents,
          balanceCents: nextBalance,
          priceCents: model.priceCents,
          model: model.label,
          modelId: model.key,
          blockKind: outcome,
        },
        { status: 422 },
      )
    }

    if (outcome === 'error' || !falRes.ok) {
      return Response.json(
        {
          message: serviceFailMessage(falRes.status, falJson),
          remaining: remainingFree,
          balanceCents,
          priceCents: model.priceCents,
          blockKind: 'service',
        },
        { status: 502 },
      )
    }

    const image = falJson?.images?.[0]
    if (!image?.url) {
      return Response.json({ message: 'No image came back. Try again.' }, { status: 502 })
    }

    let storedUrl = image.url
    let fileBytes = 0
    let fileFormat = 'JPEG'
    try {
      const fileRes = await fetch(image.url)
      if (fileRes.ok) {
        const bytes = Buffer.from(await fileRes.arrayBuffer())
        const contentType = fileRes.headers.get('content-type') || 'image/jpeg'
        fileBytes = bytes.length
        fileFormat = contentType.includes('png') ? 'PNG' : contentType.includes('webp') ? 'WEBP' : 'JPEG'
        const ext = fileFormat === 'PNG' ? 'png' : fileFormat === 'WEBP' ? 'webp' : 'jpg'
        const name = `${userId}-${Date.now()}.${ext}`
        storedUrl = (await persistToR2(bytes, name, contentType)) || image.url
      }
    } catch {
      storedUrl = image.url
    }
    const durationMs = Date.now() - started

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

    const usedSeed = typeof falJson?.seed === 'number' ? falJson.seed : seed
    const doc = (await req.payload.create({
      collection: 'generations' as never,
      overrideAccess: true,
      data: {
        user: userId,
        prompt,
        model: model.label,
        modelId: model.key,
        mode,
        imageSize: aspect,
        seed: usedSeed,
        url: storedUrl,
        width: image.width,
        height: image.height,
        format: fileFormat,
        bytes: fileBytes || undefined,
        chargedCents,
        durationMs,
      } as never,
    })) as { id: string; createdAt?: string }

    return Response.json({
      id: doc.id,
      url: storedUrl,
      seed: usedSeed,
      prompt,
      model: model.label,
      modelId: model.key,
      mode,
      imageSize: aspect,
      width: image.width,
      height: image.height,
      format: fileFormat,
      bytes: fileBytes || undefined,
      durationMs,
      createdAt: doc.createdAt || new Date().toISOString(),
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
