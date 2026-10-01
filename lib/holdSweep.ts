import type { PayloadRequest } from 'payload'
import { releaseReserved } from './wallet'

const STALE_MS = 10 * 60 * 1000

type HoldRow = {
  id: string
  user?: string | { id?: string } | null
  chargedCents?: number | null
  jobId?: string | null
  createdAt?: string | null
}

function ownerId(user: HoldRow['user']) {
  if (!user) return ''
  return typeof user === 'string' ? user : String(user.id || '')
}

/** One billing lookup. An empty or failed reply is unknown, so the hold is left in place. */
async function videoBill(falKey: string, requestId: string, startedMs: number): Promise<'yes' | 'no' | 'unknown'> {
  if (!falKey || !requestId) return 'unknown'
  const start = new Date(Math.max(0, startedMs - 6 * 60 * 60 * 1000)).toISOString()
  const url =
    'https://api.fal.ai/v1/models/billing-events?request_id=' +
    encodeURIComponent(requestId) +
    '&start=' +
    encodeURIComponent(start) +
    '&limit=20'
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Key ${falKey}` },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return 'unknown'
    const json = (await res.json()) as {
      billing_events?: { request_id?: string; cost_total?: number | null }[]
    }
    const events = (json.billing_events || []).filter((row) => row.request_id === requestId)
    if (!events.length) return 'unknown'
    const cost = events.reduce((sum, row) => sum + (Number(row.cost_total) || 0), 0)
    return cost > 0.0000001 ? 'yes' : 'no'
  } catch {
    return 'unknown'
  }
}

/**
 * Release abandoned reservations.
 * Image holds have no provider job. After 10 minutes the process is gone, so the debit is returned.
 * Video holds are refunded only when the provider confirms it did not bill.
 * A billed or unknown video hold stays reserved so a later poll can still deliver the clip.
 */
export async function sweepStaleHolds(req: PayloadRequest) {
  try {
    const cutoff = new Date(Date.now() - STALE_MS).toISOString()
    const found = await req.payload.find({
      collection: 'generations' as never,
      overrideAccess: true,
      depth: 0,
      limit: 8,
      where: {
        and: [{ format: { equals: 'HOLD' } }, { createdAt: { less_than: cutoff } }],
      },
    })
    const falKey = process.env.FAL_KEY || ''
    for (const doc of found.docs) {
      const row = doc as HoldRow
      const userId = ownerId(row.user)
      if (!userId) continue
      const cents = Number(row.chargedCents) || 0
      if (row.jobId) {
        if (cents <= 0) continue
        const started = row.createdAt ? Date.parse(row.createdAt) : Date.now()
        const bill = await videoBill(falKey, row.jobId, Number.isFinite(started) ? started : Date.now())
        if (bill === 'no') await releaseReserved(req, row.id, userId, cents)
        continue
      }
      if (cents > 0) await releaseReserved(req, row.id, userId, cents)
    }
  } catch {
    // Sweeping must not block a top-up, a gen, or a status read.
  }
}
