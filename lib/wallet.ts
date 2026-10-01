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

type SlotField = 'logoLayerDay' | 'promptWriterDay' | 'genFreeDay'
type CountField = 'logoLayerBatches' | 'promptWriterCount' | 'genFreeCount'

/**
 * Take one daily free slot only while the stored count still has room.
 * A second caller sees the incremented count and does not also pass.
 * `rollCount` is the value written when the UTC day changes. It defaults to `cost`.
 */
export async function claimDailySlot(
  req: PayloadRequest,
  userId: string,
  dayField: SlotField,
  countField: CountField,
  day: string,
  limit: number,
  cost = 1,
  rollCount?: number,
) {
  const amount = chargeAmount(cost) || (Number.isFinite(cost) && cost > 0 ? Math.round(cost) : 0)
  if (!amount || amount > limit) return null
  const sameDay = await req.payload.db.updateOne({
    collection: 'users',
    where: {
      and: [
        { id: { equals: userId } },
        { [dayField]: { equals: day } },
        { [countField]: { less_than_equal: limit - amount } },
      ],
    } as Where,
    data: { [countField]: { $inc: amount } },
    returning: true,
  })
  if (sameDay) return sameDay
  const opening = rollCount == null ? amount : rollCount
  if (!Number.isFinite(opening) || opening < amount || opening > limit) return null
  const rolled = await req.payload.db.updateOne({
    collection: 'users',
    where: {
      and: [{ id: { equals: userId } }, { [dayField]: { not_equals: day } }],
    } as Where,
    data: { [dayField]: day, [countField]: opening },
    returning: true,
  })
  return rolled || null
}

/** Give back a slot claimed above. A count that does not cover it is left alone. */
export async function releaseDailySlot(
  req: PayloadRequest,
  userId: string,
  dayField: SlotField,
  countField: CountField,
  day: string,
  cost = 1,
) {
  const amount = chargeAmount(cost) || (Number.isFinite(cost) && cost > 0 ? Math.round(cost) : 0)
  if (!amount) return null
  const updated = await req.payload.db.updateOne({
    collection: 'users',
    where: {
      and: [
        { id: { equals: userId } },
        { [dayField]: { equals: day } },
        { [countField]: { greater_than_equal: amount } },
      ],
    } as Where,
    data: { [countField]: { $inc: -amount } },
    returning: true,
  })
  return updated || null
}

/**
 * Add a Stripe top-up once. The purchase flag and the balance commit together.
 * A retry finds the purchase already credited and does not add the money again.
 * Zero cents only closes the purchase row. It does not change the balance.
 */
export async function creditPurchase(
  req: PayloadRequest,
  purchaseId: string,
  userId: string,
  cents: number,
): Promise<'credited' | 'already' | 'no-user'> {
  const amount = chargeAmount(cents)
  const where: Where = {
    and: [{ id: { equals: purchaseId } }, { credited: { equals: false } }],
  }
  if (!amount) {
    const marked = await req.payload.db.updateOne({
      collection: 'gen-purchases',
      where,
      data: { credited: true },
      returning: true,
    })
    return marked ? 'credited' : 'already'
  }

  const db = req.payload.db
  let txId: string | number | undefined
  try {
    const begun = await db.beginTransaction()
    if (begun != null && !(begun instanceof Promise)) txId = begun
  } catch {
    txId = undefined
  }
  if (txId == null) return creditPurchaseFallback(req, userId, amount, where)

  const txReq = { transactionID: txId }
  try {
    const claimed = await db.updateOne({
      collection: 'gen-purchases',
      where,
      data: { credited: true },
      req: txReq,
      returning: true,
    })
    if (!claimed) {
      await db.rollbackTransaction(txId)
      return 'already'
    }
    const updated = await db.updateOne({
      collection: 'users',
      where: { id: { equals: userId } },
      data: { genBalanceCents: { $inc: amount } },
      req: txReq,
      returning: true,
    })
    if (!updated) {
      await db.rollbackTransaction(txId)
      return 'no-user'
    }
    await db.commitTransaction(txId)
    return 'credited'
  } catch (err) {
    try {
      await db.rollbackTransaction(txId)
    } catch {
      // The session is already closed.
    }
    throw err
  }
}

/** Used only when this Mongo server cannot open a transaction. Still credits the wallet. */
async function creditPurchaseFallback(
  req: PayloadRequest,
  userId: string,
  amount: number,
  where: Where,
): Promise<'credited' | 'no-user'> {
  const credited = await creditWallet(req, userId, amount)
  if (!credited) return 'no-user'
  await req.payload.db.updateOne({
    collection: 'gen-purchases',
    where,
    data: { credited: true },
    returning: true,
  })
  return 'credited'
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
