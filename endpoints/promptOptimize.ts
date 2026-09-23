import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { userIsGenAdmin } from '../lib/genAdmin'
import { deepseekChat, deepseekEnabled } from '../lib/deepseek'
import { buildOptimizeUserText, isAdminPromptTarget, isBareChatTarget, isPromptTarget, systemPackFor, type PromptTarget } from '../lib/promptPacks'
import { scanPromptSafety } from '../lib/promptSafety'

const DAILY_LIMIT = 5
const PAID_CENTS = 1.5
const MAX_BRIEF = 4000
const MAX_IMAGE_BYTES = 1.2 * 1024 * 1024
const MAX_IMAGES = 9
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

type QuotaUser = {
  promptWriterDay?: string | null
  promptWriterCount?: number | null
  genBalanceCents?: number | null
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

function roundCents(n: number) {
  return Math.round(n * 10) / 10
}

async function settleEnhance(
  req: PayloadRequest,
  userId: string,
  user: QuotaUser,
  opts: { charge: boolean; nextBalance?: number },
) {
  const day = utcDayKey()
  const used = usedToday(user)
  const data: Record<string, unknown> = {
    promptWriterDay: day,
    promptWriterCount: used + 1,
  }
  if (opts.charge && typeof opts.nextBalance === 'number') {
    data.genBalanceCents = opts.nextBalance
  }
  await req.payload.update({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    context: { systemQuota: true },
    data: data as never,
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

function parseImages(body: { image?: unknown; images?: unknown }) {
  const list: { mime: string; dataUrl: string }[] = []
  if (Array.isArray(body.images)) {
    for (const row of body.images) {
      const parsed = parseImage(row)
      if (parsed) list.push(parsed)
      if (list.length >= MAX_IMAGES) break
    }
  }
  if (!list.length) {
    const one = parseImage(body.image)
    if (one) list.push(one)
  }
  return list
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
    const balanceCents = Number(user.genBalanceCents) || 0
    return Response.json({
      enabled: deepseekEnabled(),
      dailyLimit: DAILY_LIMIT,
      used: adminComp ? 0 : used,
      remaining,
      priceCents: PAID_CENTS,
      balanceCents,
      adminComp,
      targets: [
        { id: 'nl-image', label: 'Natural Language', blurb: 'Flux / Krea / SD-class stills' },
        { id: 'minimax-h3', label: 'MiniMax H3', blurb: 'H3 shot and physics' },
        { id: 'seedance', label: 'Seedance', blurb: 'Seedance / Dreamina video' },
        { id: 'flux-3-video', label: 'Flux 3 Video', blurb: 'FLUX 3 video' },
        { id: 'imagine-video', label: 'Grok Imagine', blurb: 'Grok Imagine video' },
        ...(adminComp
          ? [
              { id: 'nova-json', label: 'Nova JSON', blurb: 'Admin still JSON' },
              { id: 'nova-dynamic-light', label: 'Nova Dynamic Light', blurb: 'Admin still JSON, dynamic tree' },
              { id: 'deepseek-chat', label: 'DeepSeek Chat', blurb: 'Admin default chat' },
            ]
          : []),
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
      images?: unknown
      mode?: unknown
      durationSec?: unknown
      aspect?: unknown
      camera?: unknown
      imageModel?: unknown
      refNotes?: unknown
    }
    if (!isPromptTarget(body.target)) {
      return Response.json({ message: 'Pick a target family.' }, { status: 400 })
    }
    const target = body.target
    const adminComp = await userIsGenAdmin(req)
    if (isAdminPromptTarget(target) && !adminComp) {
      return Response.json({ message: 'That format is not available.' }, { status: 403 })
    }
    const brief = String(body.brief || '').trim().slice(0, MAX_BRIEF)
    const safety = scanPromptSafety(brief)
    if (!safety.ok) {
      return Response.json({ message: safety.message, blockKind: 'safety' }, { status: 422 })
    }
    const images = parseImages(body)
    const userId = String(req.user.id)
    const user = await loadUser(req, userId)
    const used = usedToday(user)
    const remainingFree = adminComp ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - used)
    const useFree = adminComp || remainingFree > 0
    const balanceCents = Number(user.genBalanceCents) || 0
    if (!useFree && balanceCents < PAID_CENTS) {
      return Response.json(
        {
          message: `5 free enhances used. Extra ones are 1.5¢ from your Gen wallet.`,
          needsFunds: true,
          priceCents: PAID_CENTS,
          balanceCents,
          remaining: 0,
          blockKind: 'funds',
        },
        { status: 402 },
      )
    }

    const bareChat = isBareChatTarget(target)
    const system = systemPackFor(target)
    const userText = buildOptimizeUserText(target, {
      brief,
      mode: typeof body.mode === 'string' ? body.mode : undefined,
      durationSec: Number(body.durationSec),
      aspect: typeof body.aspect === 'string' ? body.aspect : undefined,
      camera: typeof body.camera === 'string' ? body.camera : undefined,
      imageModel: typeof body.imageModel === 'string' ? body.imageModel : undefined,
      refNotes: typeof body.refNotes === 'string' ? body.refNotes : undefined,
      hasImage: images.length > 0,
      imageCount: images.length,
    })
    const userContent = images.length
      ? ([
          { type: 'text', text: userText },
          ...images.map((img) => ({ type: 'image_url' as const, image_url: { url: img.dataUrl } })),
        ] as const)
      : userText

    async function once() {
      const messages = []
      if (!bareChat && system) messages.push({ role: 'system' as const, content: system })
      messages.push({ role: 'user' as const, content: userContent as never })
      const maxTokens = bareChat ? 8192 : target === 'nova-dynamic-light' ? 4096 : 2048
      return deepseekChat(messages, maxTokens, {
        json: !bareChat,
        thinking: bareChat ? true : false,
      })
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
      if (bareChat) {
        const prompt = String(content || '').trim()
        if (!prompt) return null
        return {
          target,
          adult_confirmed: true as const,
          prompt,
          negative: '',
          settings: {},
          notes: '',
        }
      }
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

    let chargedCents = 0
    let nextBalance = balanceCents
    if (!adminComp && !useFree) {
      chargedCents = PAID_CENTS
      nextBalance = roundCents(Math.max(0, balanceCents - PAID_CENTS))
    }
    if (!adminComp) {
      await settleEnhance(req, userId, user, { charge: chargedCents > 0, nextBalance })
    }
    const remaining = adminComp ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - used - (useFree ? 1 : 0))
    return Response.json({
      ...validated,
      remaining,
      dailyLimit: DAILY_LIMIT,
      priceCents: PAID_CENTS,
      chargedCents,
      balanceCents: nextBalance,
    })
  },
}

export const promptOptimizeEndpoints: Endpoint[] = [promptOptimizeStatusEndpoint, promptOptimizeEndpoint]
