import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { userIsGenAdmin } from '../lib/genAdmin'
import { deepseekChat, deepseekEnabled } from '../lib/deepseek'
import { buildOptimizeUserText, isPromptTarget, systemPackFor, type PromptTarget } from '../lib/promptPacks'
import { scanPromptSafety } from '../lib/promptSafety'

const DAILY_LIMIT = 5
const MAX_BRIEF = 4000
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

type QuotaUser = {
  promptWriterDay?: string | null
  promptWriterCount?: number | null
}

function utcDayKey() {
  return new Date().toISOString().slice(0, 10)
}

async function loadUser(req: PayloadRequest, userId: string) {
  return (await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
    context: { systemQuota: true },
  })) as QuotaUser
}

function usedToday(user: QuotaUser) {
  const day = utcDayKey()
  if (user.promptWriterDay !== day) return 0
  return Math.max(0, Number(user.promptWriterCount) || 0)
}

async function bumpUse(req: PayloadRequest, userId: string, user: QuotaUser) {
  const day = utcDayKey()
  const used = usedToday(user)
  await req.payload.update({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    context: { systemQuota: true },
    data: {
      promptWriterDay: day,
      promptWriterCount: used + 1,
    } as never,
  })
}

function parseImage(raw: unknown): { mime: string; dataUrl: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { mime?: unknown; data?: unknown }
  const mime = String(row.mime || '').toLowerCase()
  const data = String(row.data || '').replace(/^data:[^;]+;base64,/, '')
  if (!ALLOWED_IMAGE.has(mime) || !data) return null
  const buf = Buffer.from(data, 'base64')
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null
  return { mime, dataUrl: `data:${mime};base64,${data}` }
}

function stripJsonFence(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return (fenced ? fenced[1] : trimmed).trim()
}

function validateOutput(raw: unknown, target: PromptTarget) {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.adult_confirmed !== true) return null
  const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : ''
  if (!prompt) return null
  const settings =
    row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
      ? (row.settings as Record<string, unknown>)
      : {}
  return {
    target,
    adult_confirmed: true as const,
    prompt,
    negative: typeof row.negative === 'string' ? row.negative.trim() : '',
    settings,
    notes: typeof row.notes === 'string' ? row.notes.trim() : '',
  }
}

export const promptOptimizeStatusEndpoint: Endpoint = {
  path: '/prompt-optimize',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to use Prompt Writer.' }, { status: 401 })
    }
    const userId = String(req.user.id)
    const user = await loadUser(req, userId)
    const used = usedToday(user)
    const adminComp = await userIsGenAdmin(req)
    const remaining = adminComp ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - used)
    return Response.json({
      enabled: deepseekEnabled(),
      dailyLimit: DAILY_LIMIT,
      used: adminComp ? 0 : used,
      remaining,
      adminComp,
      targets: [
        { id: 'imagine-video', label: 'Imagine Video', blurb: 'Grok Imagine video' },
        { id: 'minimax-h3', label: 'MiniMax H3', blurb: 'H3 shot and physics' },
        { id: 'nl-image', label: 'NL Image', blurb: 'Flux / Krea / SD-class stills' },
      ],
    })
  },
}

export const promptOptimizeEndpoint: Endpoint = {
  path: '/prompt-optimize',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to use Prompt Writer.' }, { status: 401 })
    }
    if (!deepseekEnabled()) {
      return Response.json({ message: 'Prompt writer is not wired yet.' }, { status: 503 })
    }
    try {
      await addDataAndFileToRequest(req)
    } catch {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }
    const body = (req.data || {}) as {
      target?: unknown
      brief?: unknown
      image?: unknown
      mode?: unknown
      durationSec?: unknown
      aspect?: unknown
      refNotes?: unknown
    }
    if (!isPromptTarget(body.target)) {
      return Response.json({ message: 'Pick a target family.' }, { status: 400 })
    }
    const target = body.target
    const brief = String(body.brief || '').trim().slice(0, MAX_BRIEF)
    const safety = scanPromptSafety(brief)
    if (!safety.ok) {
      return Response.json({ message: safety.message, blockKind: 'safety' }, { status: 422 })
    }
    const image = parseImage(body.image)
    const userId = String(req.user.id)
    const user = await loadUser(req, userId)
    const adminComp = await userIsGenAdmin(req)
    const used = usedToday(user)
    if (!adminComp && used >= DAILY_LIMIT) {
      return Response.json(
        { message: 'Daily Prompt Craft limit reached. Try again tomorrow.', blockKind: 'limit' },
        { status: 429 },
      )
    }

    const system = systemPackFor(target)
    const userText = buildOptimizeUserText(target, {
      brief,
      mode: typeof body.mode === 'string' ? body.mode : undefined,
      durationSec: Number(body.durationSec),
      aspect: typeof body.aspect === 'string' ? body.aspect : undefined,
      refNotes: typeof body.refNotes === 'string' ? body.refNotes : undefined,
      hasImage: Boolean(image),
    })
    const userContent = image
      ? ([
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: image.dataUrl } },
        ] as const)
      : userText

    async function once() {
      return deepseekChat([
        { role: 'system', content: system },
        { role: 'user', content: userContent as never },
      ])
    }

    let result
    try {
      result = await once()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Prompt writer failed.'
      if (msg === 'DEEPSEEK_UNWIRED') {
        return Response.json({ message: 'Prompt writer is not wired yet.' }, { status: 503 })
      }
      console.warn('prompt-optimize deepseek', { finishReason: 'error' })
      return Response.json({ message: 'Could not optimize that brief.' }, { status: 502 })
    }

    const parse = (content: string) => {
      try {
        return validateOutput(JSON.parse(stripJsonFence(content)), target)
      } catch {
        return null
      }
    }

    let validated = parse(result.content)
    if (!validated && result.finishReason !== 'content_filter') {
      try {
        result = await once()
        validated = parse(result.content)
      } catch {
        validated = null
      }
    }

    console.warn('prompt-optimize', {
      finishReason: result.finishReason,
      promptTokens: result.usage?.prompt_tokens,
      cacheHit: result.usage?.prompt_cache_hit_tokens,
    })

    if (result.finishReason === 'content_filter') {
      return Response.json(
        { message: 'That brief was refused. Try a cleaner adult fashion, dance, or public scene.', blockKind: 'filtered' },
        { status: 422 },
      )
    }
    if (!validated) {
      return Response.json(
        { message: 'No usable prompt came back. Try a clearer adult brief.', blockKind: 'invalid' },
        { status: 422 },
      )
    }

    if (!adminComp) await bumpUse(req, userId, user)
    const remaining = adminComp ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - used - 1)
    return Response.json({ ...validated, remaining, dailyLimit: DAILY_LIMIT })
  },
}

export const promptOptimizeEndpoints: Endpoint[] = [promptOptimizeStatusEndpoint, promptOptimizeEndpoint]
