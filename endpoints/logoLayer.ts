import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { userIsGenAdmin } from '../lib/genAdmin'
import { claimDailySlot, debitWallet, walletCents } from '../lib/wallet'
import { stripeCheckoutEnabled } from './stripeWallet'

const DAILY_FREE = 2
const IMAGE_CENTS = 5
const VIDEO_CENTS = 10
const MAX_COUNT = 500

function utcDayKey() {
  return new Date().toISOString().slice(0, 10)
}

type LayerUser = {
  genBalanceCents?: number | null
  logoLayerDay?: string | null
  logoLayerBatches?: number | null
}

async function loadUser(req: PayloadRequest, userId: string) {
  return (await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
    context: { systemQuota: true },
  })) as LayerUser
}

function usedToday(user: LayerUser) {
  const day = utcDayKey()
  if (user.logoLayerDay !== day) return 0
  return Math.max(0, Number(user.logoLayerBatches) || 0)
}

export const logoLayerStatusEndpoint: Endpoint = {
  path: '/logo-layer/status',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to export.' }, { status: 401 })
    }
    const userId = String(req.user.id)
    const user = await loadUser(req, userId)
    const used = usedToday(user)
    const remainingFree = Math.max(0, DAILY_FREE - used)
    const adminComp = await userIsGenAdmin(req)
    return Response.json({
      dailyLimit: DAILY_FREE,
      used,
      remainingFree: adminComp ? DAILY_FREE : remainingFree,
      balanceCents: Number(user.genBalanceCents) || 0,
      imageCents: IMAGE_CENTS,
      videoCents: VIDEO_CENTS,
      stripeEnabled: stripeCheckoutEnabled(),
      adminComp,
    })
  },
}

export const logoLayerChargeEndpoint: Endpoint = {
  path: '/logo-layer/charge',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to export.' }, { status: 401 })
    }
    try {
      await addDataAndFileToRequest(req)
    } catch {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }
    const body = (req.data || {}) as { kind?: unknown; count?: unknown }
    const kind = body.kind === 'video' ? 'video' : body.kind === 'image' ? 'image' : ''
    const count = Math.floor(Number(body.count))
    if (!kind) {
      return Response.json({ message: 'Choose image or video.' }, { status: 400 })
    }
    if (!Number.isFinite(count) || count < 1 || count > MAX_COUNT) {
      return Response.json({ message: 'That batch size is not valid.' }, { status: 400 })
    }

    const userId = String(req.user.id)
    const adminComp = await userIsGenAdmin(req)
    const user = await loadUser(req, userId)
    const day = utcDayKey()
    const balanceCents = Number(user.genBalanceCents) || 0
    const unit = kind === 'video' ? VIDEO_CENTS : IMAGE_CENTS

    if (adminComp) {
      return Response.json({
        free: true,
        chargedCents: 0,
        remainingFree: DAILY_FREE,
        balanceCents,
        count,
        kind,
        adminComp: true,
      })
    }

    let slot = await claimDailySlot(req, userId, 'logoLayerDay', 'logoLayerBatches', day, DAILY_FREE, 1)
    if (!slot) slot = await claimDailySlot(req, userId, 'logoLayerDay', 'logoLayerBatches', day, DAILY_FREE, 1)
    if (slot) {
      const batches = Number((slot as { logoLayerBatches?: number }).logoLayerBatches) || 1
      return Response.json({
        free: true,
        chargedCents: 0,
        remainingFree: Math.max(0, DAILY_FREE - batches),
        balanceCents,
        count,
        kind,
        adminComp: false,
      })
    }

    const chargedCents = count * unit
    const debited = await debitWallet(req, userId, chargedCents)
    if (!debited) {
      const fresh = await loadUser(req, userId)
      return Response.json(
        {
          message: `This batch is $${(chargedCents / 100).toFixed(2)} (${count} × ${unit}¢). Add funds to export.`,
          needsFunds: true,
          chargedCents,
          balanceCents: walletCents(fresh),
          remainingFree: 0,
          imageCents: IMAGE_CENTS,
          videoCents: VIDEO_CENTS,
        },
        { status: 402 },
      )
    }

    return Response.json({
      free: false,
      chargedCents,
      remainingFree: 0,
      balanceCents: walletCents(debited),
      count,
      kind,
      adminComp: false,
    })
  },
}

export const logoLayerEndpoints: Endpoint[] = [logoLayerStatusEndpoint, logoLayerChargeEndpoint]
