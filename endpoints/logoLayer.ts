import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { userIsGenAdmin } from '../lib/genAdmin'
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
    const used = usedToday(user)
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

    if (used < DAILY_FREE) {
      await req.payload.update({
        collection: 'users',
        id: userId,
        overrideAccess: true,
        data: {
          logoLayerDay: day,
          logoLayerBatches: used + 1,
        } as never,
      })
      return Response.json({
        free: true,
        chargedCents: 0,
        remainingFree: DAILY_FREE - used - 1,
        balanceCents,
        count,
        kind,
        adminComp: false,
      })
    }

    const chargedCents = count * unit
    if (balanceCents < chargedCents) {
      return Response.json(
        {
          message: `This batch is $${(chargedCents / 100).toFixed(2)} (${count} × ${unit}¢). Add funds to export.`,
          needsFunds: true,
          chargedCents,
          balanceCents,
          remainingFree: 0,
          imageCents: IMAGE_CENTS,
          videoCents: VIDEO_CENTS,
        },
        { status: 402 },
      )
    }

    const nextBalance = balanceCents - chargedCents
    await req.payload.update({
      collection: 'users',
      id: userId,
      overrideAccess: true,
      data: {
        genBalanceCents: nextBalance,
        logoLayerDay: day,
        logoLayerBatches: used,
      } as never,
    })
    return Response.json({
      free: false,
      chargedCents,
      remainingFree: 0,
      balanceCents: nextBalance,
      count,
      kind,
      adminComp: false,
    })
  },
}

export const logoLayerEndpoints: Endpoint[] = [logoLayerStatusEndpoint, logoLayerChargeEndpoint]
