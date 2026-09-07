import { createHmac } from 'crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { stripeCheckoutEnabled } from './stripeWallet'
import { userIsGenAdmin } from '../lib/genAdmin'
import { randomFileName } from '../lib/randomFile'

type VideoKey = 'grokvid' | 'grokvid15' | 'h3turbo' | 'h3max'
type VideoMode = 't2v' | 'i2v'

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
}

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
}

const MAX_SOURCE_BYTES = 4 * 1024 * 1024
const ASPECTS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'])

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
  sourceUrl?: string
  h?: string
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
  }))
}

function resolveVideoModel(raw: unknown): VideoModel {
  if (typeof raw === 'string' && raw in VIDEO_MODELS) return VIDEO_MODELS[raw as VideoKey]
  return VIDEO_MODELS.grokvid
}

function money(cents: number) {
  return '$' + (Number(cents || 0) / 100).toFixed(2)
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

function videoPayload(model: VideoModel, mode: VideoMode, prompt: string, aspect: string, duration: number, resolution: string, imageUrl?: string) {
  const body: Record<string, unknown> = { prompt, duration }
  if (model.key === 'grokvid') {
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

async function settleBlockedVideo(
  req: PayloadRequest,
  job: JobPayload,
  currentBalance: number,
  falBill: FalChargeCheck,
) {
  const existing = await req.payload.find({
    collection: 'generations' as never,
    overrideAccess: true,
    limit: 1,
    where: {
      and: [{ user: { equals: job.userId } }, { jobId: { equals: job.requestId } }],
    },
  })
  const already = existing.docs[0] as { format?: string; chargedCents?: number } | undefined
  if (already?.format === 'BLOCKED') {
    return Response.json(
      {
        message: already.chargedCents ? VIDEO_FILTERED_BILLED : VIDEO_FILTERED_FREE,
        blockKind: already.chargedCents ? 'filtered' : 'rejected',
        chargedCents: already.chargedCents || 0,
        priceCents: job.priceCents,
        balanceCents: currentBalance,
      },
      { status: 422 },
    )
  }
  const takeCredit = falBill.confirmed && falBill.billed
  const adminComp = await userIsGenAdmin(req)
  let chargedCents = 0
  let nextBalance = currentBalance
  if (takeCredit && !adminComp) {
    chargedCents = job.priceCents
    nextBalance = Math.max(0, currentBalance - job.priceCents)
    await req.payload.update({
      collection: 'users',
      id: job.userId,
      overrideAccess: true,
      context: { systemQuota: true },
      data: { genBalanceCents: nextBalance } as never,
    })
  }
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
      url: 'blocked://safety',
      format: 'BLOCKED',
      chargedCents,
      durationMs: Date.now() - job.started,
      kind: 'video',
      durationSec: job.duration,
      resolution: job.resolution,
      jobId: job.requestId,
    } as never,
  })
  return Response.json(
    {
      message:
        takeCredit && adminComp
          ? VIDEO_FILTERED_BILLED + ' Admin account · not charged.'
          : takeCredit
            ? VIDEO_FILTERED_BILLED
            : VIDEO_FILTERED_FREE,
      blockKind: takeCredit ? 'filtered' : 'rejected',
      chargedCents,
      priceCents: job.priceCents,
      balanceCents: nextBalance,
    },
    { status: 422 },
  )
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
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (prompt.length < 3) {
      return Response.json({ message: 'Write a prompt of at least a few words.' }, { status: 400 })
    }
    if (prompt.length > 20000) {
      return Response.json({ message: 'Prompt is too long (max 20,000 characters).' }, { status: 400 })
    }

    const model = resolveVideoModel(body.model)
    const mode: VideoMode = body.mode === 'i2v' ? 'i2v' : 't2v'
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
      return Response.json({ message: 'Pick a duration of 5, 6, 8, 10, or 15 seconds.' }, { status: 400 })
    }
    if (!model.resolutions.some((r) => r.id === resolution)) {
      return Response.json({ message: 'Pick a supported resolution.' }, { status: 400 })
    }

    const priceCents = (model.pricePerSec[resolution] || 0) * duration
    if (priceCents < 1) {
      return Response.json({ message: 'Could not price that clip.' }, { status: 400 })
    }

    const userId = String(req.user.id)
    const adminComp = await userIsGenAdmin(req)
    const user = (await req.payload.findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
    })) as { genBalanceCents?: number | null }
    const balanceCents = Number(user.genBalanceCents) || 0
    if (!adminComp && balanceCents < priceCents) {
      return Response.json(
        {
          message: `${model.label} is ${money(priceCents)} for ${duration}s. Add funds to generate.`,
          balanceCents,
          priceCents,
          needsFunds: true,
        },
        { status: 402 },
      )
    }

    let sourceUrl = ''
    if (mode === 'i2v') {
      const parsed = parseDataImage(body.image)
      if (!parsed) {
        return Response.json(
          { message: 'Add a JPEG, PNG, or WebP under 4 MB to use image to video.' },
          { status: 400 },
        )
      }
      sourceUrl =
        (await persistToR2(parsed.buffer, randomFileName(parsed.ext), parsed.contentType, 'gens/in')) ||
        ''
      if (!sourceUrl) {
        return Response.json({ message: 'Could not store the source image. Try a smaller file.' }, { status: 502 })
      }
    }

    const falId = mode === 'i2v' ? model.falI2v : model.falT2v
    const started = Date.now()
    const submit = await fetch(`https://queue.fal.run/${falId}`, {
      method: 'POST',
      headers: falHeaders(falKey),
      body: JSON.stringify(videoPayload(model, mode, prompt, aspect, duration, resolution, sourceUrl || undefined)),
    })
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
        { message: 'The video service failed. No gen was used. Try again.', blockKind: 'service' },
        { status: 502 },
      )
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
      sourceUrl: sourceUrl || undefined,
    })
    return Response.json({
      pending: true,
      job,
      model: model.label,
      modelId: model.key,
      priceCents,
      duration,
      resolution,
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
    if (status !== 'COMPLETED') {
      if (!status || statusRes.status === 404) {
        if (Date.now() - job.started < 10 * 60 * 1000) {
          return Response.json({ pending: true, status: 'queued' })
        }
      }
      if (isPolicyFail(statusRes.status, statusJson)) {
        const falBill = await falRequestCharged(falKey, job.requestId, job.started)
        const user = (await req.payload.findByID({
          collection: 'users',
          id: job.userId,
          depth: 0,
          overrideAccess: true,
        })) as { genBalanceCents?: number | null }
        return settleBlockedVideo(req, job, Number(user.genBalanceCents) || 0, falBill)
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
    if (already?.url) {
      return Response.json({
        id: already.id,
        url: already.url,
        prompt: already.prompt,
        model: already.model,
        modelId: already.modelId,
        mode: already.mode,
        imageSize: already.imageSize,
        width: already.width,
        height: already.height,
        format: already.format,
        bytes: already.bytes,
        durationMs: already.durationMs,
        kind: already.kind || 'video',
        durationSec: already.durationSec,
        resolution: already.resolution,
        createdAt: already.createdAt,
        chargedCents: already.chargedCents || 0,
        priceCents: job.priceCents,
        balanceCents: currentBalance,
      })
    }
    if (!resultRes.ok || !video?.url) {
      const policy = isPolicyFail(resultRes.status, resultJson)
      const falBill = await falRequestCharged(falKey, job.requestId, job.started)
      if (policy || falBill.billed) {
        return settleBlockedVideo(req, job, currentBalance, falBill)
      }
      return Response.json(
        { message: 'No video came back. Try again.', blockKind: 'service' },
        { status: 502 },
      )
    }

    const model = VIDEO_MODELS[job.model]
    const adminComp = await userIsGenAdmin(req)
    const user = (await req.payload.findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
    })) as { genBalanceCents?: number | null }
    const balanceCents = Number(user.genBalanceCents) || 0
    if (!adminComp && balanceCents < job.priceCents) {
      return Response.json(
        {
          message: `${model.label} is ${money(job.priceCents)} for ${job.duration}s. Add funds to generate.`,
          needsFunds: true,
          balanceCents,
          priceCents: job.priceCents,
        },
        { status: 402 },
      )
    }

    let storedUrl = video.url || ''
    let fileBytes = Number(video.file_size) || 0
    try {
      const fileRes = await fetch(video.url || '')
      if (fileRes.ok) {
        const bytes = Buffer.from(await fileRes.arrayBuffer())
        fileBytes = bytes.length
        storedUrl =
          (await persistToR2(bytes, randomFileName('mp4'), 'video/mp4')) || storedUrl
      }
    } catch {
      storedUrl = video.url || storedUrl
    }
    if (!storedUrl) {
      return Response.json(
        { message: 'No video came back. Try again.', blockKind: 'service' },
        { status: 502 },
      )
    }

    let chargedCents = 0
    let nextBalance = balanceCents
    if (!adminComp) {
      chargedCents = job.priceCents
      nextBalance = Math.max(0, balanceCents - job.priceCents)
      await req.payload.update({
        collection: 'users',
        id: userId,
        overrideAccess: true,
        data: { genBalanceCents: nextBalance } as never,
      })
    }

    const doc = (await req.payload.create({
      collection: 'generations' as never,
      overrideAccess: true,
      data: {
        user: userId,
        prompt: job.prompt,
        model: model.label,
        modelId: model.key,
        mode: job.mode,
        imageSize: job.aspect,
        url: storedUrl,
        width: video.width,
        height: video.height,
        format: 'MP4',
        bytes: fileBytes || undefined,
        chargedCents,
        durationMs: Date.now() - job.started,
        kind: 'video',
        durationSec: job.duration,
        resolution: job.resolution,
        jobId: job.requestId,
        sourceUrl: job.sourceUrl || undefined,
      } as never,
    })) as { id: string; createdAt?: string }

    return Response.json({
      id: doc.id,
      url: storedUrl,
      prompt: job.prompt,
      model: model.label,
      modelId: model.key,
      mode: job.mode,
      imageSize: job.aspect,
      width: video.width,
      height: video.height,
      format: 'MP4',
      bytes: fileBytes || undefined,
      durationMs: Date.now() - job.started,
      kind: 'video',
      durationSec: job.duration,
      resolution: job.resolution,
      createdAt: doc.createdAt || new Date().toISOString(),
      sourceUrl: job.sourceUrl || undefined,
      chargedCents,
      priceCents: job.priceCents,
      balanceCents: nextBalance,
      adminComp,
    })
  },
}

export const generateVideoEndpoints: Endpoint[] = [
  genVideoStatusEndpoint,
  genVideoStartEndpoint,
  genVideoPollEndpoint,
]
