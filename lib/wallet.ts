import type { PayloadRequest, Where } from 'payload'

type WalletDoc = { genBalanceCents?: number | null }

function chargeAmount(cents: number) {
  const amount = Number(cents)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 10) / 10
}

export function walletCents(doc: WalletDoc | null | undefined) {
  return Number(doc?.genBalanceCents) || 0
}

/** Gallery, profile, and free-credit counts skip reserved and refunded rows. */
export function hiddenFormatWhere(): Where {
  return { format: { not_in: ['BLOCKED', 'HOLD', 'REFUNDED'] } }
}

async function moveBalance(req: PayloadRequest, where: Where, delta: number) {
  // Omit req so this write is not enrolled in a later document transaction.
  // A parallel debit has to see the new balance immediately.
  const updated = await req.payload.db.updateOne({
    collection: 'users',
    where,
    data: { genBalanceCents: { $inc: delta } },
    returning: true,
  })
  if (!updated) return null
  return updated as WalletDoc
}

/** Subtract cents only when the stored balance covers it. Null means the balance was too low. */
export function debitWallet(req: PayloadRequest, userId: string, cents: number) {
  const amount = chargeAmount(cents)
  if (!amount) return Promise.resolve(null)
  return moveBalance(
    req,
    {
      and: [{ id: { equals: userId } }, { genBalanceCents: { greater_than_equal: amount } }],
    },
    -amount,
  )
}

/** Add cents back, or apply a Stripe top-up. */
export function creditWallet(req: PayloadRequest, userId: string, cents: number) {
  const amount = chargeAmount(cents)
  if (!amount) return Promise.resolve(null)
  return moveBalance(req, { id: { equals: userId } }, amount)
}

/**
 * Flip a HOLD row to REFUNDED and credit once.
 * A second call finds the row already changed and does not credit again.
 */
export async function releaseReserved(
  req: PayloadRequest,
  holdId: string,
  userId: string,
  cents: number,
) {
  const claimed = await req.payload.db.updateOne({
    collection: 'generations',
    where: {
      and: [{ id: { equals: holdId } }, { format: { equals: 'HOLD' } }],
    },
    data: { format: 'REFUNDED', url: 'hold://refunded', chargedCents: 0 },
    returning: true,
  })
  if (!claimed) return null
  const credited = await creditWallet(req, userId, cents)
  return credited ? walletCents(credited) : null
}

/** Update a generation only while it still has `from` as its format. */
export async function claimGenFormat(
  req: PayloadRequest,
  genId: string,
  from: string,
  data: Record<string, unknown>,
) {
  const updated = await req.payload.db.updateOne({
    collection: 'generations',
    where: {
      and: [{ id: { equals: genId } }, { format: { equals: from } }],
    },
    data,
    returning: true,
  })
  return updated || null
}
