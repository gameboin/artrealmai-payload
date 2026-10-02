import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { isAdmin } from '../lib/access'
import { userIsGenAdmin } from '../lib/genAdmin'
import { enhanceRules, rateLimitResponse } from '../lib/rateLimit'
import { deepseekChat, deepseekEnabled } from '../lib/deepseek'
import { claimDailySlot, creditWallet, debitWallet, releaseDailySlot, walletCents } from '../lib/wallet'
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
    if (!isAdmin(req.user)) {
      const blocked = await rateLimitResponse(req, enhanceRules(req, String(req.user.id)))
      if (blocked) return blocked
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
    let balanceCents = Number(user.genBalanceCents) || 0
    let paidReserved = false
    let freeClaimed = false
    let freeCount = 0
    const quotaDay = utcDayKey()
    if (!adminComp) {
      let slot = await claimDailySlot(
        req,
        userId,
        'promptWriterDay',
        'promptWriterCount',
        quotaDay,
        DAILY_LIMIT,
        1,
      )
      if (!slot) {
        slot = await claimDailySlot(
          req,
          userId,
          'promptWriterDay',
          'promptWriterCount',
          quotaDay,
          DAILY_LIMIT,
          1,
        )
      }
      if (slot) {
        freeClaimed = true
        freeCount = Number((slot as { promptWriterCount?: number }).promptWriterCount) || 1
      }
    }
    if (!adminComp && !freeClaimed) {
      const debited = await debitWallet(req, userId, PAID_CENTS)
      if (!debited) {
        const fresh = await loadUser(req, userId)
        return Response.json(
          {
            message: `5 free enhances used. Extra ones are 1.5¢ from your Gen wallet.`,
            needsFunds: true,
            priceCents: PAID_CENTS,
            balanceCents: walletCents(fresh),
            remaining: 0,
            blockKind: 'funds',
          },
          { status: 402 },
        )
      }
      paidReserved = true
      balanceCents = walletCents(debited)
    }
    const unwindEnhance = async () => {
      if (paidReserved) {
        paidReserved = false
        const credited = await creditWallet(req, userId, PAID_CENTS)
        if (credited) balanceCents = walletCents(credited)
      }
      if (freeClaimed) {
        freeClaimed = false
        await releaseDailySlot(req, userId, 'promptWriterDay', 'promptWriterCount', quotaDay, 1)
      }
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
      await unwindEnhance()
      const msg = err instanceof Error ? err.message : 'Prompt writer failed.'
      if (msg === 'DEEPSEEK_UNWIRED') {
        return Response.json({ message: 'Prompt writer is not wired yet.', balanceCents }, { status: 503 })
      }
      console.warn('prompt-optimize deepseek', { finishReason: 'error' })
      return Response.json({ message: 'Could not optimize that brief.', balanceCents }, { status: 502 })
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
      await unwindEnhance()
      return Response.json(
        {
          message: 'That brief was refused. Try a cleaner adult fashion, dance, or public scene.',
          blockKind: 'filtered',
          balanceCents,
        },
        { status: 422 },
      )
    }
    if (!validated) {
      await unwindEnhance()
      return Response.json(
        { message: 'No usable prompt came back. Try a clearer adult brief.', blockKind: 'invalid', balanceCents },
        { status: 422 },
      )
    }

    const chargedCents = paidReserved ? PAID_CENTS : 0
    const nextBalance = balanceCents
    const remaining = adminComp
      ? DAILY_LIMIT
      : freeClaimed
        ? Math.max(0, DAILY_LIMIT - freeCount)
        : 0
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
