import { createHmac } from 'crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { stripeCheckoutEnabled } from './stripeWallet'
import { userIsGenAdmin } from '../lib/genAdmin'
import { makeVideoPosterFromUrl } from '../lib/genThumb'
import { randomFileName } from '../lib/randomFile'
import { claimGenFormat, creditWallet, debitWallet, releaseReserved, walletCents } from '../lib/wallet'

type VideoKey =
  | 'grokvid'
  | 'grokvid15'
  | 'flux3t2vdraft'
  | 'flux3t2v'
  | 'flux3i2vdraft'
  | 'flux3i2v'
  | 'h3turbo'
  | 'h3max'
  | 'h3maxref'
  | 'seedance2fast'
  | 'seedance2fastref'
type VideoMode = 't2v' | 'i2v' | 'r2v'

type VideoModel = {
  key: VideoKey
  label: string
  blurb: string
  falT2v: string
  falI2v: string
  modes: VideoMode[]
  durations: number[]
  resolutions: { id: string; label: string }[]
  aspects: string[]
  pricePerSec: Record<string, number>
  defaultDuration: number
  defaultResolution: string
  /** Reference images included before a per-image surcharge. */
  freeRefImages?: number
  /** Cents charged for each reference image past freeRefImages. */
  refExtraCents?: number
}

const FLUX3_ASPECTS = ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16']
const FLUX3_DURATIONS = [5, 6, 8, 10, 15, 20]

const VIDEO_MODELS: Record<VideoKey, VideoModel> = {
  grokvid: {
    key: 'grokvid',
    label: 'Grok Imagine Video',
    blurb: 'Fast clips with audio',
    falT2v: 'xai/grok-imagine-video/text-to-video',
    falI2v: 'xai/grok-imagine-video/image-to-video',
    modes: ['t2v', 'i2v'],
    durations: [5, 6, 8, 10, 15],
    resolutions: [
      { id: '480p', label: '480p' },
      { id: '720p', label: '720p' },
    ],
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    pricePerSec: { '480p': 8, '720p': 12 },
    defaultDuration: 5,
    defaultResolution: '480p',
  },
  grokvid15: {
    key: 'grokvid15',
    label: 'Grok Imagine Video 1.5',
    blurb: 'Up to 1080p, with audio',
    falT2v: 'xai/grok-imagine-video/v1.5/text-to-video',
    falI2v: 'xai/grok-imagine-video/v1.5/image-to-video',
    modes: ['t2v', 'i2v'],
    durations: [5, 6, 8, 10, 15],
    resolutions: [
      { id: '480p', label: '480p' },
      { id: '720p', label: '720p' },
      { id: '1080p', label: '1080p' },
    ],
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    pricePerSec: { '480p': 13, '720p': 22, '1080p': 40 },
    defaultDuration: 5,
    defaultResolution: '480p',
  },
  flux3t2vdraft: {
    key: 'flux3t2vdraft',
    label: 'Flux 3 Text to Video Draft',
    blurb: 'Fast 720p preview with audio',
    falT2v: 'blackforestlabs/flux-3/text-to-video/draft',
    falI2v: 'blackforestlabs/flux-3/text-to-video/draft',
    modes: ['t2v'],
    durations: [...FLUX3_DURATIONS],
    resolutions: [{ id: '720p', label: '720p' }],
    aspects: [...FLUX3_ASPECTS],
    pricePerSec: { '720p': 12 },
    defaultDuration: 5,
    defaultResolution: '720p',
  },
  flux3t2v: {
    key: 'flux3t2v',
    label: 'Flux 3 Text to Video',
    blurb: 'Full quality, 720p or 1080p, with audio',
    falT2v: 'blackforestlabs/flux-3/text-to-video',
    falI2v: 'blackforestlabs/flux-3/text-to-video',
    modes: ['t2v'],
    durations: [...FLUX3_DURATIONS],
    resolutions: [
      { id: '720p', label: '720p' },
      { id: '1080p', label: '1080p' },
    ],
    aspects: [...FLUX3_ASPECTS],
    pricePerSec: { '720p': 23, '1080p': 35 },
    defaultDuration: 5,
    defaultResolution: '720p',
  },
  flux3i2vdraft: {
    key: 'flux3i2vdraft',
    label: 'Flux 3 Image to Video Draft',
    blurb: 'Fast 720p preview from a still, with audio',
    falT2v: 'blackforestlabs/flux-3/image-to-video/draft',
    falI2v: 'blackforestlabs/flux-3/image-to-video/draft',
    modes: ['i2v'],
    durations: [...FLUX3_DURATIONS],
    resolutions: [{ id: '720p', label: '720p' }],
    aspects: [...FLUX3_ASPECTS],
    pricePerSec: { '720p': 12 },
    defaultDuration: 5,
    defaultResolution: '720p',
  },
  flux3i2v: {
    key: 'flux3i2v',
    label: 'Flux 3 Image to Video',
    blurb: 'Full quality from a still, 720p or 1080p, with audio',
    falT2v: 'blackforestlabs/flux-3/image-to-video',
    falI2v: 'blackforestlabs/flux-3/image-to-video',
    modes: ['i2v'],
    durations: [...FLUX3_DURATIONS],
    resolutions: [
      { id: '720p', label: '720p' },
      { id: '1080p', label: '1080p' },
    ],
    aspects: [...FLUX3_ASPECTS],
    pricePerSec: { '720p': 23, '1080p': 35 },
    defaultDuration: 5,
    defaultResolution: '720p',
  },
  h3turbo: {
    key: 'h3turbo',
    label: 'MiniMax H3 Turbo',
    blurb: 'Fast motion, 5–15s',
    falT2v: 'minimax/h3-max-turbo/text-to-video',
    falI2v: 'minimax/h3-max-turbo/image-to-video',
    modes: ['t2v', 'i2v'],
    durations: [5, 6, 8, 10, 15],
    resolutions: [
      { id: '480P', label: '480p' },
      { id: '768P', label: '768p' },
    ],
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    pricePerSec: { '480P': 5, '768P': 8 },
    defaultDuration: 5,
    defaultResolution: '480P',
  },
  h3max: {
    key: 'h3max',
    label: 'MiniMax H3 Max',
    blurb: 'Stronger prompt follow, 5–15s',
    falT2v: 'minimax/h3-max/text-to-video',
    falI2v: 'minimax/h3-max/image-to-video',
    modes: ['t2v', 'i2v'],
    durations: [5, 6, 8, 10, 15],
    resolutions: [
      { id: '480P', label: '480p' },
      { id: '768P', label: '768p' },
    ],
    aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    pricePerSec: { '480P': 8, '768P': 13 },
    defaultDuration: 5,
    defaultResolution: '480P',
  },
  h3maxref: {
    key: 'h3maxref',
    label: 'MiniMax H3 Max Reference',
    blurb: 'Up to 9 images, 5–15s',
    falT2v: 'minimax/h3-max/reference-to-video',
    falI2v: 'minimax/h3-max/reference-to-video',
    modes: ['r2v'],
    durations: [5, 6, 8, 10, 15],
    resolutions: [
      { id: '480P', label: '480p' },
      { id: '768P', label: '768p' },
      { id: '1080P', label: '1080p' },
    ],
    aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    pricePerSec: { '480P': 8, '768P': 13, '1080P': 26 },
    defaultDuration: 5,
    defaultResolution: '768P',
    freeRefImages: 4,
    refExtraCents: 3,
  },
  seedance2fast: {
    key: 'seedance2fast',
    label: 'Seedance 2.0 Fast',
    blurb: 'Long clips with audio and camera, 4–15s',
    falT2v: 'bytedance/seedance-2.0/fast/text-to-video',
    falI2v: 'bytedance/seedance-2.0/fast/image-to-video',
    modes: ['t2v', 'i2v'],
    durations: [4, 5, 6, 8, 10, 12, 15],
    resolutions: [
      { id: '480p', label: '480p' },
      { id: '720p', label: '720p' },
    ],
    aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    pricePerSec: { '480p': 12, '720p': 30 },
    defaultDuration: 5,
    defaultResolution: '720p',
  },
  seedance2fastref: {
    key: 'seedance2fastref',
    label: 'Seedance 2.0 Fast Reference',
    blurb: 'Up to 9 images, @Image tags, 4–15s',
    falT2v: 'bytedance/seedance-2.0/fast/reference-to-video',
    falI2v: 'bytedance/seedance-2.0/fast/reference-to-video',
    modes: ['r2v'],
    durations: [4, 5, 6, 8, 10, 12, 15],
    resolutions: [
      { id: '480p', label: '480p' },
      { id: '720p', label: '720p' },
    ],
    aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    pricePerSec: { '480p': 12, '720p': 30 },
    defaultDuration: 5,
    defaultResolution: '720p',
    freeRefImages: 9,
    refExtraCents: 0,
  },
}

const MAX_SOURCE_BYTES = 4 * 1024 * 1024
const ASPECTS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '2:1'])

type JobPayload = {
  requestId: string
  falId: string
  statusUrl: string
  responseUrl: string
  userId: string
  model: VideoKey
  mode: VideoMode
  prompt: string
  aspect: string
  duration: number
  resolution: string
  started: number
  priceCents: number
  /** Set when the wallet was debited before the queue submit. Absent on jobs already in flight. */
  reservedCents?: number
  sourceUrl?: string
  h?: string
}

function reservedAmount(job: JobPayload) {
  const amount = Number(job.reservedCents)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

export function publicVideoModels() {
  return Object.values(VIDEO_MODELS).map((m) => ({
    id: m.key,
    label: m.label,
    blurb: m.blurb,
    modes: m.modes,
    durations: m.durations,
    resolutions: m.resolutions,
    aspects: m.aspects,
    pricePerSec: m.pricePerSec,
    defaultDuration: m.defaultDuration,
    defaultResolution: m.defaultResolution,
    priceCents: (m.pricePerSec[m.defaultResolution] || 8) * m.defaultDuration,
    free: false,
    freeRefImages: m.freeRefImages ?? 0,
    refExtraCents: m.refExtraCents ?? 0,
  }))
}

function resolveVideoModel(raw: unknown): VideoModel {
  if (typeof raw === 'string' && raw in VIDEO_MODELS) return VIDEO_MODELS[raw as VideoKey]
  return VIDEO_MODELS.grokvid
}

function money(cents: number) {
  return '$' + (Number(cents || 0) / 100).toFixed(2)
}

function videoPriceCents(model: VideoModel, resolution: string, duration: number, imageCount: number) {
  const base = (model.pricePerSec[resolution] || 0) * duration
  const extra = Math.max(0, imageCount - (model.freeRefImages ?? 0)) * (model.refExtraCents || 0)
  return base + extra
}

function jobSecret() {
  const secret = process.env.PAYLOAD_SECRET || process.env.FAL_KEY || ''
  if (!secret) throw new Error('Missing signing secret')
  return secret
}

function signJob(data: JobPayload) {
  const body: JobPayload = { ...data }
  delete body.h
  const json = JSON.stringify(body)
  const h = createHmac('sha256', jobSecret()).update(json).digest('hex')
  return Buffer.from(JSON.stringify({ ...body, h })).toString('base64url')
}

async function findVideoJobRow(req: PayloadRequest, userId: string, requestId: string) {
  const existing = await req.payload.find({
    collection: 'generations' as never,
    overrideAccess: true,
    limit: 1,
    where: {
      and: [{ user: { equals: userId } }, { jobId: { equals: requestId } }],
    },
  })
  return existing.docs[0] as
    | {
        id: string
        url?: string
        thumbUrl?: string | null
        prompt?: string
        model?: string
        modelId?: string
        mode?: string
        imageSize?: string
        width?: number
        height?: number
        format?: string
        bytes?: number
        chargedCents?: number
        durationMs?: number
        kind?: string
        durationSec?: number
        resolution?: string
        createdAt?: string
      }
    | undefined
}

async function balanceOf(req: PayloadRequest, userId: string) {
  const user = (await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })) as { genBalanceCents?: number | null }
  return walletCents(user)
}

function readJob(token: unknown): JobPayload | null {
  if (typeof token !== 'string' || !token) return null
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as JobPayload
    const h = parsed.h
    const body = { ...parsed }
    delete body.h
    const expect = createHmac('sha256', jobSecret()).update(JSON.stringify(body)).digest('hex')
    if (!h || h !== expect) return null
    return parsed
  } catch {
    return null
  }
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

function hostedImageUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw.startsWith('https://')) return ''
  const domain = process.env.R2_PUBLIC_ACCESS_DOMAIN || ''
  if (!domain) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== domain) return ''
    return url.toString()
  } catch {
    return ''
  }
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

function falHeaders(falKey: string) {
  return { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }
}

function falAuth(falKey: string) {
  return { Authorization: `Key ${falKey}` }
}

function queueRoot(falId: string) {
  const parts = falId.split('/')
  const leaf = parts[parts.length - 1] || ''
  if (['text-to-video', 'image-to-video', 'text-to-image', 'edit'].includes(leaf) && parts.length > 2) {
    return parts.slice(0, -1).join('/')
  }
  return falId
}

function statusUrlFor(falId: string, requestId: string) {
  return `https://queue.fal.run/${queueRoot(falId)}/requests/${requestId}/status`
}

function responseUrlFor(falId: string, requestId: string) {
  return `https://queue.fal.run/${queueRoot(falId)}/requests/${requestId}/response`
}

function isFlux3(key: string) {
  return key === 'flux3t2vdraft' || key === 'flux3t2v' || key === 'flux3i2vdraft' || key === 'flux3i2v'
}

function isFlux3Draft(key: string) {
  return key === 'flux3t2vdraft' || key === 'flux3i2vdraft'
}

function videoPayload(model: VideoModel, mode: VideoMode, prompt: string, aspect: string, duration: number, resolution: string, imageUrl?: string, imageUrls?: string[]) {
  const body: Record<string, unknown> = { prompt }
  if (model.key === 'h3maxref') {
    return {
      prompt,
      duration,
      resolution,
      aspect_ratio: !aspect || aspect === 'auto' ? 'adaptive' : aspect,
      prompt_expansion_mode: 'disabled',
      enable_safety_checker: false,
      reference_image_urls: imageUrls && imageUrls.length ? imageUrls : imageUrl ? [imageUrl] : [],
    }
  }
  if (model.key === 'seedance2fastref') {
    return {
      prompt,
      image_urls: imageUrls && imageUrls.length ? imageUrls : imageUrl ? [imageUrl] : [],
      resolution,
      duration: String(duration),
      aspect_ratio: !aspect || aspect === 'auto' ? 'auto' : aspect,
      generate_audio: true,
    }
  }
  if (model.key === 'seedance2fast') {
    body.duration = String(duration)
    body.resolution = resolution
    body.generate_audio = true
    if (mode === 'i2v') {
      body.aspect_ratio = 'auto'
      if (imageUrl) body.image_url = imageUrl
    } else if (aspect && aspect !== 'auto') {
      body.aspect_ratio = aspect
    }
    if (imageUrls && imageUrls.length > 1) body.image_urls = imageUrls
    return body
  }
  body.duration = duration
  if (isFlux3(model.key)) {
    body.generate_audio = true
    body.safety_tolerance = 4
    if (!isFlux3Draft(model.key)) body.resolution = resolution
    if (mode === 'i2v') {
      body.aspect_ratio = 'auto'
      if (imageUrl) body.image_url = imageUrl
    } else if (aspect && aspect !== 'auto') {
      body.aspect_ratio = aspect
    }
  } else if (model.key === 'grokvid') {
    body.resolution = resolution
    body.aspect_ratio = mode === 'i2v' ? 'auto' : aspect
    if (imageUrl) body.image_url = imageUrl
  } else if (model.key === 'grokvid15') {
    body.resolution = resolution
    if (mode === 't2v' && aspect !== 'auto') body.aspect_ratio = aspect
    if (imageUrl) body.image_url = imageUrl
  } else {
    body.resolution = resolution
    body.enable_safety_checker = false
    body.prompt_expansion_mode = 'balanced'
    if (mode === 't2v' && aspect !== 'auto') body.aspect_ratio = aspect
    if (imageUrl) body.image_url = imageUrl
  }
  if (imageUrls && imageUrls.length > 1) body.image_urls = imageUrls
  return body
}

function isPolicyFail(status: number, json: { error?: unknown; detail?: unknown; message?: unknown } | null) {
  if (status === 422) return true
  const text = JSON.stringify(json || {}).toLowerCase()
  return /content_policy|nsfw|safety|blocked|prohibited|moderation/.test(text)
}

const VIDEO_FILTERED_BILLED =
  "That prompt was blocked by the model's safety checker after the run. This uses 1 gen because the completed run was billed even though you did not get the video."
const VIDEO_FILTERED_FREE =
  "That prompt was blocked by the model's safety checker. You were not charged for this run."

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FalChargeCheck = { billed: boolean; costUsd: number; confirmed: boolean }

async function falRequestCharged(falKey: string, requestId: string, started: number): Promise<FalChargeCheck> {
  if (!requestId) return { billed: false, costUsd: 0, confirmed: false }
  const start = new Date(Math.max(0, started - 6 * 60 * 60 * 1000)).toISOString()
  const url =
    'https://api.fal.ai/v1/models/billing-events?request_id=' +
    encodeURIComponent(requestId) +
    '&start=' +
    encodeURIComponent(start) +
    '&limit=20'
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await sleep(700 * attempt)
    try {
      const res = await fetch(url, { headers: falAuth(falKey) })
      if (res.status === 401 || res.status === 403) {
        return { billed: false, costUsd: 0, confirmed: false }
      }
      if (!res.ok) continue
      const json = (await res.json()) as {
        billing_events?: { request_id?: string; cost_total?: number | null }[]
      }
      const events = (json.billing_events || []).filter((row) => row.request_id === requestId)
      if (!events.length) continue
      const costUsd = events.reduce((sum, row) => sum + (Number(row.cost_total) || 0), 0)
      if (costUsd > 0.0000001) return { billed: true, costUsd, confirmed: true }
      return { billed: false, costUsd: 0, confirmed: true }
    } catch {
      continue
    }
  }
  return { billed: false, costUsd: 0, confirmed: false }
}

const TERMINAL_VIDEO_STATUS = new Set(['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'])

function isPlayableGenUrl(url?: string | null) {
  return Boolean(url && !url.startsWith('hold://') && !url.startsWith('blocked://'))
}

function blockedVideoBody(
  job: JobPayload,
  chargedCents: number,
  balanceCents: number,
  adminComp: boolean,
  takeCredit: boolean,
  kind: 'policy' | 'service' = 'policy',
) {
  const policyMessage =
    takeCredit && adminComp
      ? VIDEO_FILTERED_BILLED + ' Admin account · not charged.'
      : chargedCents
        ? VIDEO_FILTERED_BILLED
        : VIDEO_FILTERED_FREE
  const serviceMessage = chargedCents
    ? 'The video service failed after the run was billed. This uses 1 gen.'
    : 'The video service failed. No gen was used. Try again.'
  return Response.json(
    {
      message: kind === 'service' ? serviceMessage : policyMessage,
      blockKind: kind === 'service' ? 'service' : chargedCents ? 'filtered' : 'rejected',
      chargedCents,
      priceCents: job.priceCents,
      balanceCents,
    },
    { status: kind === 'service' ? 502 : 422 },
  )
}

async function settleBlockedVideo(
  req: PayloadRequest,
  job: JobPayload,
  currentBalance: number,
  falBill: FalChargeCheck,
  kind: 'policy' | 'service' = 'policy',
) {
  const already = await findVideoJobRow(req, job.userId, job.requestId)
  const takeCredit = falBill.confirmed && falBill.billed
  const adminComp = await userIsGenAdmin(req)
  const reserved = reservedAmount(job)
  if (already?.format === 'BLOCKED' || already?.format === 'REFUNDED') {
    const chargedCents = already.format === 'REFUNDED' ? 0 : already.chargedCents || 0
    return blockedVideoBody(job, chargedCents, currentBalance, adminComp, chargedCents > 0, kind)
  }
  let chargedCents = 0
  let nextBalance = currentBalance
  if (reserved > 0) {
    if (takeCredit && !adminComp) {
      chargedCents = reserved
      if (already?.format === 'HOLD') {
        await claimGenFormat(req, already.id, 'HOLD', {
          format: 'BLOCKED',
          url: 'blocked://safety',
          chargedCents: reserved,
        })
      }
    } else if (already?.format === 'HOLD') {
      const released = await releaseReserved(req, already.id, job.userId, reserved)
      if (released != null) nextBalance = released
    }
  } else if (takeCredit && !adminComp) {
    const debited = await debitWallet(req, job.userId, job.priceCents)
    if (debited) {
      chargedCents = job.priceCents
      nextBalance = walletCents(debited)
    }
  }
  if (!already) {
    const model = VIDEO_MODELS[job.model]
    await req.payload.create({
      collection: 'generations' as never,
      overrideAccess: true,
      data: {
        user: job.userId,
        prompt: job.prompt,
        model: model.label,
        modelId: model.key,
        mode: job.mode,
        imageSize: job.aspect,
        url: chargedCents ? 'blocked://safety' : 'hold://refunded',
        format: chargedCents ? 'BLOCKED' : 'REFUNDED',
        chargedCents,
        durationMs: Date.now() - job.started,
        kind: 'video',
        durationSec: job.duration,
        resolution: job.resolution,
        jobId: job.requestId,
      } as never,
    })
  }
  return blockedVideoBody(
    job,
    chargedCents,
    nextBalance,
    adminComp,
    takeCredit && !adminComp && chargedCents > 0,
    kind,
  )
}

async function refundOpenHold(
  req: PayloadRequest,
  job: JobPayload,
  row?: { id: string; format?: string },
) {
  const reserved = reservedAmount(job)
  const current = row || (await findVideoJobRow(req, job.userId, job.requestId))
  if (reserved > 0 && current?.format === 'HOLD') {
    const released = await releaseReserved(req, current.id, job.userId, reserved)
    if (released != null) return released
  }
  return balanceOf(req, job.userId)
}

function videoDoneBody(
  doc: {
    id: string
    url?: string | null
    thumbUrl?: string | null
    prompt?: string
    model?: string
    modelId?: string
    mode?: string
    imageSize?: string
    width?: number | null
    height?: number | null
    format?: string
    bytes?: number | null
    durationMs?: number
    kind?: string
    durationSec?: number
    resolution?: string
    createdAt?: string
    chargedCents?: number
    sourceUrl?: string
  },
  job: JobPayload,
  balanceCents: number,
  adminComp?: boolean,
) {
  return Response.json({
    id: doc.id,
    url: doc.url,
    thumbUrl: doc.thumbUrl || undefined,
    prompt: doc.prompt ?? job.prompt,
    model: doc.model,
    modelId: doc.modelId,
    mode: doc.mode ?? job.mode,
    imageSize: doc.imageSize ?? job.aspect,
    width: doc.width,
    height: doc.height,
    format: doc.format,
    bytes: doc.bytes,
    durationMs: doc.durationMs,
    kind: doc.kind || 'video',
    durationSec: doc.durationSec ?? job.duration,
    resolution: doc.resolution ?? job.resolution,
    createdAt: doc.createdAt,
    sourceUrl: doc.sourceUrl || job.sourceUrl || undefined,
    chargedCents: doc.chargedCents || 0,
    priceCents: job.priceCents,
    balanceCents,
    ...(typeof adminComp === 'boolean' ? { adminComp } : {}),
  })
}

export const genVideoStatusEndpoint: Endpoint = {
  path: '/gen/video-status',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to generate.' }, { status: 401 })
    }
    const user = (await req.payload.findByID({
      collection: 'users',
      id: String(req.user.id),
      depth: 0,
      overrideAccess: true,
    })) as { genBalanceCents?: number | null }
    const adminComp = await userIsGenAdmin(req)
    return Response.json({
      enabled: Boolean(process.env.FAL_KEY),
      models: publicVideoModels(),
      modes: [
        { id: 't2v', label: 'Text to video' },
        { id: 'i2v', label: 'Image to video' },
        { id: 'r2v', label: 'Reference to video' },
      ],
      balanceCents: Number(user.genBalanceCents) || 0,
      stripeEnabled: stripeCheckoutEnabled(),
      adminComp,
    })
  },
}

export const genVideoStartEndpoint: Endpoint = {
  path: '/gen/video',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to generate.' }, { status: 401 })
    }
    const falKey = process.env.FAL_KEY || ''
    if (!falKey) {
      return Response.json({ message: 'Video generation is not connected yet.' }, { status: 503 })
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
      duration?: unknown
      resolution?: unknown
      image?: unknown
      images?: unknown
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (prompt.length < 3) {
      return Response.json({ message: 'Write a prompt of at least a few words.' }, { status: 400 })
    }
    if (prompt.length > 20000) {
      return Response.json({ message: 'Prompt is too long (max 20,000 characters).' }, { status: 400 })
    }

    const model = resolveVideoModel(body.model)
    const mode: VideoMode = body.mode === 'r2v' ? 'r2v' : body.mode === 'i2v' ? 'i2v' : 't2v'
    if (!model.modes.includes(mode)) {
      return Response.json(
        {
          message: `${model.label} does not support ${mode === 'r2v' ? 'reference to video' : mode === 'i2v' ? 'image to video' : 'text to video'}.`,
        },
        { status: 400 },
      )
    }
    const requestedAspect =
      mode === 'i2v'
        ? 'auto'
        : typeof body.aspect === 'string' && ASPECTS.has(body.aspect)
          ? body.aspect
          : '16:9'
    const aspect =
      requestedAspect === 'auto'
        ? 'auto'
        : model.aspects.includes(requestedAspect)
          ? requestedAspect
          : model.aspects.includes('16:9')
            ? '16:9'
            : model.aspects[0]
    const duration = Math.round(Number(body.duration))
    const resolution =
      typeof body.resolution === 'string' && model.resolutions.some((r) => r.id === body.resolution)
        ? body.resolution
        : model.defaultResolution
    if (!model.durations.includes(duration)) {
      return Response.json({ message: 'Pick a supported clip length.' }, { status: 400 })
    }
    if (!model.resolutions.some((r) => r.id === resolution)) {
      return Response.json({ message: 'Pick a supported resolution.' }, { status: 400 })
    }

    const rawList = Array.isArray(body.images) ? body.images : body.image ? [body.image] : []
    const imageCount = mode === 't2v' ? 0 : Math.min(9, rawList.length)
    const priceCents = videoPriceCents(model, resolution, duration, imageCount)
    if (priceCents < 1) {
      return Response.json({ message: 'Could not price that clip.' }, { status: 400 })
    }

    const userId = String(req.user.id)
    const adminComp = await userIsGenAdmin(req)

    const sourceUrls: string[] = []
    if (mode === 'i2v' || mode === 'r2v') {
      const list = rawList.slice(0, 9)
      if (!list.length) {
        return Response.json(
          { message: mode === 'r2v' ? 'Add at least one reference image.' : 'Add a JPEG, PNG, or WebP under 4 MB to use image to video.' },
          { status: 400 },
        )
      }
      for (const raw of list) {
        const remote = hostedImageUrl(raw)
        if (remote) {
          sourceUrls.push(remote)
          continue
        }
        const parsed = parseDataImage(raw)
        if (!parsed) {
          return Response.json(
            { message: 'Add a JPEG, PNG, or WebP under 4 MB.' },
            { status: 400 },
          )
        }
        const stored =
          (await persistToR2(parsed.buffer, randomFileName(parsed.ext), parsed.contentType, 'gens/in')) || ''
        if (!stored) {
          return Response.json({ message: 'Could not store the source image. Try a smaller file.' }, { status: 502 })
        }
        sourceUrls.push(stored)
      }
    }

    let balanceCents = await balanceOf(req, userId)
    let reservedForJob = 0
    if (!adminComp) {
      const debited = await debitWallet(req, userId, priceCents)
      if (!debited) {
        return Response.json(
          {
            message: `${model.label} is ${money(priceCents)} for ${duration}s. Add funds to generate.`,
            balanceCents: await balanceOf(req, userId),
            priceCents,
            needsFunds: true,
          },
          { status: 402 },
        )
      }
      balanceCents = walletCents(debited)
      reservedForJob = priceCents
    }
    const refundSubmit = async () => {
      if (!reservedForJob) return
      const amount = reservedForJob
      reservedForJob = 0
      const credited = await creditWallet(req, userId, amount)
      if (credited) balanceCents = walletCents(credited)
    }

    const falId = mode === 'r2v' ? model.falT2v : mode === 'i2v' ? model.falI2v : model.falT2v
    const started = Date.now()
    let submit: Response
    try {
      submit = await fetch(`https://queue.fal.run/${falId}`, {
        method: 'POST',
        headers: falHeaders(falKey),
        body: JSON.stringify(videoPayload(model, mode, prompt, aspect, duration, resolution, sourceUrls[0], sourceUrls)),
      })
    } catch {
      await refundSubmit()
      return Response.json(
        {
          message: 'The video service failed. No gen was used. Try again.',
          blockKind: 'service',
          balanceCents,
          priceCents,
        },
        { status: 502 },
      )
    }
    const submitJson = (await submit.json().catch(() => null)) as {
      request_id?: string
      requestId?: string
      status_url?: string
      response_url?: string
      error?: unknown
      detail?: unknown
    } | null
    const requestId = submitJson?.request_id || submitJson?.requestId
    if (!submit.ok || !requestId) {
      await refundSubmit()
      if (isPolicyFail(submit.status, submitJson)) {
        return Response.json(
          {
            message: 'That prompt was rejected before a billed run started, so this one is free.',
            blockKind: 'rejected',
            balanceCents,
            priceCents,
          },
          { status: 422 },
        )
      }
      return Response.json(
        {
          message: 'The video service failed. No gen was used. Try again.',
          blockKind: 'service',
          balanceCents,
          priceCents,
        },
        { status: 502 },
      )
    }

    if (reservedForJob) {
      try {
        await req.payload.create({
          collection: 'generations' as never,
          overrideAccess: true,
          data: {
            user: userId,
            prompt,
            model: model.label,
            modelId: model.key,
            mode,
            imageSize: aspect,
            url: 'hold://pending',
            format: 'HOLD',
            chargedCents: reservedForJob,
            durationMs: Date.now() - started,
            kind: 'video',
            durationSec: duration,
            resolution,
            jobId: requestId,
            sourceUrl: sourceUrls[0] || undefined,
          } as never,
        })
      } catch {
        await refundSubmit()
        return Response.json(
          {
            message: 'The video service failed. No gen was used. Try again.',
            blockKind: 'service',
            balanceCents,
            priceCents,
          },
          { status: 502 },
        )
      }
    }

    const job = signJob({
      requestId,
      falId,
      statusUrl: submitJson?.status_url || statusUrlFor(falId, requestId),
      responseUrl: submitJson?.response_url || responseUrlFor(falId, requestId),
      userId,
      model: model.key,
      mode,
      prompt,
      aspect,
      duration,
      resolution,
      started,
      priceCents,
      ...(reservedForJob ? { reservedCents: reservedForJob } : {}),
      sourceUrl: sourceUrls[0] || undefined,
    })
    return Response.json({
      pending: true,
      job,
      model: model.label,
      modelId: model.key,
      priceCents,
      duration,
      resolution,
      balanceCents,
    })
  },
}

export const genVideoPollEndpoint: Endpoint = {
  path: '/gen/video/poll',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to generate.' }, { status: 401 })
    }
    const falKey = process.env.FAL_KEY || ''
    if (!falKey) {
      return Response.json({ message: 'Video generation is not connected yet.' }, { status: 503 })
    }
    try {
      await addDataAndFileToRequest(req)
    } catch {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }
    const token = (req.data as { job?: unknown } | undefined)?.job
    const job = readJob(token)
    if (!job || job.userId !== String(req.user.id)) {
      return Response.json({ message: 'That video job was not found.' }, { status: 404 })
    }

    const statusRes = await fetch(job.statusUrl || statusUrlFor(job.falId, job.requestId), {
      headers: falAuth(falKey),
    })
    const statusJson = (await statusRes.json().catch(() => null)) as {
      status?: string
      response_url?: string
      error?: unknown
      detail?: unknown
    } | null
    const status = String(statusJson?.status || '').toUpperCase()

    if (status === 'IN_QUEUE' || status === 'QUEUED' || status === 'IN_PROGRESS') {
      return Response.json({ pending: true, status: status === 'IN_PROGRESS' ? 'generating' : 'queued' })
    }
    const jobYoung = Date.now() - job.started < 10 * 60 * 1000
    if (status !== 'COMPLETED') {
      const transient = !status || statusRes.status === 404 || statusRes.status === 429 || statusRes.status >= 500
      if (transient && jobYoung) {
        return Response.json({ pending: true, status: 'queued' })
      }
      const policy = isPolicyFail(statusRes.status, statusJson)
      const terminal = policy || TERMINAL_VIDEO_STATUS.has(status) || !jobYoung
      if (!terminal && jobYoung) {
        return Response.json({ pending: true, status: 'queued' })
      }
      const falBill = await falRequestCharged(falKey, job.requestId, job.started)
      if (policy || falBill.billed || reservedAmount(job) > 0) {
        return settleBlockedVideo(
          req,
          job,
          await balanceOf(req, job.userId),
          falBill,
          policy ? 'policy' : 'service',
        )
      }
      return Response.json(
        { message: 'The video service failed. No gen was used. Try again.', blockKind: 'service' },
        { status: 502 },
      )
    }

    const resultUrl = statusJson?.response_url || job.responseUrl || responseUrlFor(job.falId, job.requestId)
    const resultRes = await fetch(resultUrl, { headers: falAuth(falKey) })
    const resultJson = (await resultRes.json().catch(() => null)) as {
      video?: { url?: string; width?: number; height?: number; file_size?: number; content_type?: string; duration?: number }
      response?: { video?: { url?: string; width?: number; height?: number; file_size?: number; duration?: number } }
      data?: { video?: { url?: string; width?: number; height?: number; file_size?: number; duration?: number } }
      error?: unknown
      detail?: unknown
    } | null
    const video = resultJson?.video || resultJson?.response?.video || resultJson?.data?.video
    const existing = await req.payload.find({
      collection: 'generations' as never,
      overrideAccess: true,
      limit: 1,
      where: {
        and: [{ user: { equals: String(req.user.id) } }, { jobId: { equals: job.requestId } }],
      },
    })
    const already = existing.docs[0] as
      | {
          id: string
          url?: string
          thumbUrl?: string | null
          prompt?: string
          model?: string
          modelId?: string
          mode?: string
          imageSize?: string
          width?: number
          height?: number
          format?: string
          bytes?: number
          chargedCents?: number
          durationMs?: number
          kind?: string
          durationSec?: number
          resolution?: string
          createdAt?: string
        }
      | undefined
    const userId = job.userId
    const balanceUser = (await req.payload.findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
    })) as { genBalanceCents?: number | null }
    const currentBalance = Number(balanceUser.genBalanceCents) || 0
    if (already?.format === 'BLOCKED') {
      return Response.json(
        {
          message: already.chargedCents
            ? VIDEO_FILTERED_BILLED
            : VIDEO_FILTERED_FREE,
          blockKind: already.chargedCents ? 'filtered' : 'rejected',
          chargedCents: already.chargedCents || 0,
          priceCents: job.priceCents,
          balanceCents: currentBalance,
        },
        { status: 422 },
      )
    }
    if (already && isPlayableGenUrl(already.url)) {
      return videoDoneBody(already, job, currentBalance)
    }
    if (!resultRes.ok || !video?.url) {
      const policy = isPolicyFail(resultRes.status, resultJson)
      const falBill = await falRequestCharged(falKey, job.requestId, job.started)
      if (policy || falBill.billed) {
        return settleBlockedVideo(req, job, currentBalance, falBill, policy ? 'policy' : 'service')
      }
      if (!falBill.confirmed && Date.now() - job.started < 10 * 60 * 1000) {
        return Response.json({ pending: true, status: 'generating' })
      }
      const balanceCents = await refundOpenHold(req, job, already)
      return Response.json(
        { message: 'No video came back. Try again.', blockKind: 'service', balanceCents, priceCents: job.priceCents },
        { status: 502 },
      )
    }

    const model = VIDEO_MODELS[job.model]
    const adminComp = await userIsGenAdmin(req)
    const reserved = reservedAmount(job)
    const sourceVideoUrl = video.url || ''
    let storedUrl = sourceVideoUrl
    let fileBytes = Number(video.file_size) || 0
    const posterPromise = makeVideoPosterFromUrl(sourceVideoUrl)
    try {
      const fileRes = await fetch(sourceVideoUrl)
      if (fileRes.ok) {
        const bytes = Buffer.from(await fileRes.arrayBuffer())
        fileBytes = bytes.length
        storedUrl =
          (await persistToR2(bytes, randomFileName('mp4'), 'video/mp4')) || storedUrl
      }
    } catch {
      storedUrl = sourceVideoUrl
    }
    const thumbUrl = (await posterPromise) || ''
    if (!storedUrl) {
      const balanceCents = await refundOpenHold(req, job, already)
      return Response.json(
        { message: 'No video came back. Try again.', blockKind: 'service', balanceCents, priceCents: job.priceCents },
        { status: 502 },
      )
    }

    const fileFields = {
      url: storedUrl,
      thumbUrl: thumbUrl || undefined,
      width: video.width,
      height: video.height,
      format: 'MP4',
      bytes: fileBytes || undefined,
      durationMs: Date.now() - job.started,
      prompt: job.prompt,
      model: model.label,
      modelId: model.key,
      mode: job.mode,
      imageSize: job.aspect,
      kind: 'video',
      durationSec: job.duration,
      resolution: job.resolution,
      sourceUrl: job.sourceUrl || undefined,
    }

    if (already?.format === 'HOLD') {
      const chargedCents = reserved > 0 ? reserved : Number(already.chargedCents) || 0
      const claimed = await claimGenFormat(req, already.id, 'HOLD', { ...fileFields, chargedCents })
      if (claimed) {
        return videoDoneBody(
          { id: already.id, createdAt: already.createdAt, ...fileFields, chargedCents },
          job,
          currentBalance,
          adminComp,
        )
      }
      const winner = await findVideoJobRow(req, userId, job.requestId)
      if (winner && isPlayableGenUrl(winner.url)) {
        return videoDoneBody(winner, job, await balanceOf(req, userId), adminComp)
      }
      if (winner?.format === 'REFUNDED') {
        const recovered = await claimGenFormat(req, winner.id, 'REFUNDED', { ...fileFields, chargedCents: 0 })
        if (recovered) {
          return videoDoneBody(
            { id: winner.id, createdAt: winner.createdAt, ...fileFields, chargedCents: 0 },
            job,
            await balanceOf(req, userId),
            adminComp,
          )
        }
      }
      return Response.json({ pending: true, status: 'generating' })
    }

    if (already?.format === 'REFUNDED') {
      const recovered = await claimGenFormat(req, already.id, 'REFUNDED', { ...fileFields, chargedCents: 0 })
      if (recovered) {
        return videoDoneBody(
          { id: already.id, createdAt: already.createdAt, ...fileFields, chargedCents: 0 },
          job,
          currentBalance,
          adminComp,
        )
      }
      const winner = await findVideoJobRow(req, userId, job.requestId)
      if (winner && isPlayableGenUrl(winner.url)) {
        return videoDoneBody(winner, job, await balanceOf(req, userId), adminComp)
      }
      return Response.json({ pending: true, status: 'generating' })
    }

    let chargedCents = 0
    let nextBalance = currentBalance
    if (reserved > 0) {
      chargedCents = reserved
    } else if (!adminComp) {
      const debited = await debitWallet(req, userId, job.priceCents)
      if (!debited) {
        return Response.json(
          {
            message: `${model.label} is ${money(job.priceCents)} for ${job.duration}s. Add funds to generate.`,
            needsFunds: true,
            balanceCents: await balanceOf(req, userId),
            priceCents: job.priceCents,
          },
          { status: 402 },
        )
      }
      chargedCents = job.priceCents
      nextBalance = walletCents(debited)
    }

    try {
      const doc = (await req.payload.create({
        collection: 'generations' as never,
        overrideAccess: true,
        data: {
          user: userId,
          ...fileFields,
          chargedCents,
          jobId: job.requestId,
        } as never,
      })) as { id: string; createdAt?: string }
      return videoDoneBody(
        { id: doc.id, createdAt: doc.createdAt || new Date().toISOString(), ...fileFields, chargedCents },
        job,
        nextBalance,
        adminComp,
      )
    } catch (err) {
      if (reserved <= 0 && chargedCents > 0) await creditWallet(req, userId, chargedCents)
      throw err
    }
  },
}

export const generateVideoEndpoints: Endpoint[] = [
  genVideoStatusEndpoint,
  genVideoStartEndpoint,
  genVideoPollEndpoint,
]
