import { APIError, type PayloadRequest } from 'payload'

const MESSAGE = 'Too many attempts. Try again later.'
const TEN_MIN = 10 * 60 * 1000
const FIVE_MIN = 5 * 60 * 1000
const HOUR = 60 * 60 * 1000

export type RateRule = {
  scope: string
  id: string
  limit: number
  windowMs: number
}

type RateDoc = { _id?: string; count?: unknown; resetAt?: Date }
type RateResult = RateDoc | { value?: RateDoc | null } | null

export type RateCollection = {
  createIndex(keys: Record<string, 1>, options: { expireAfterSeconds: number; name: string }): Promise<unknown>
  findOneAndUpdate(
    filter: { _id: string },
    update: Record<string, unknown>[],
    options: { upsert: boolean; returnDocument: 'after' },
  ): Promise<RateResult>
}

let indexOnce: Promise<void> | null = null

function headersOf(req: PayloadRequest) {
  return req.headers && typeof req.headers.get === 'function' ? req.headers : null
}

/** Client address Vercel records. Empty when the request has no address header. */
export function clientIp(req: PayloadRequest): string {
  const headers = headersOf(req)
  if (!headers) return ''
  const real = headers.get('x-real-ip')?.trim() || ''
  const forwarded = (headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || ''
  return (real || forwarded).replace(/[^\w.:-]/g, '').slice(0, 80)
}

export function rateKey(scope: string, id: string): string {
  const clean = id.trim().toLowerCase().replace(/\s+/g, '').slice(0, 160)
  if (!clean) return ''
  return `${scope}:${clean}`
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'toNumber' in value) {
    const n = (value as { toNumber: () => number }).toNumber()
    if (Number.isFinite(n)) return n
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function readCount(result: RateResult): number {
  if (!result || typeof result !== 'object') return 0
  if ('count' in result) return asCount(result.count)
  if ('value' in result && result.value) return asCount(result.value.count)
  return 0
}

function rateCollection(req: PayloadRequest): RateCollection | null {
  const db = req.payload.db.connection?.db
  if (!db) return null
  return db.collection('artrealm_rate_limits') as unknown as RateCollection
}

function ensureIndex(col: RateCollection) {
  if (!indexOnce) {
    indexOnce = col
      .createIndex({ resetAt: 1 }, { expireAfterSeconds: 0, name: 'artrealm_rate_reset' })
      .then(() => undefined)
      .catch(() => undefined)
  }
  return indexOnce
}

/**
 * Fixed window stored in Mongo so every Vercel instance shares the count.
 * Returns the count after this hit. 0 means the counter could not be read.
 */
export async function bumpRateCount(col: RateCollection, key: string, windowMs: number, now = new Date()): Promise<number> {
  const resetAt = new Date(now.getTime() + windowMs)
  const expired = {
    $or: [{ $eq: [{ $ifNull: ['$resetAt', null] }, null] }, { $lte: ['$resetAt', now] }],
  }
  const update = [
    {
      $set: {
        count: {
          $cond: [expired, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }],
        },
        resetAt: {
          $cond: [expired, resetAt, '$resetAt'],
        },
      },
    },
  ]
  const options = { upsert: true, returnDocument: 'after' as const }
  try {
    return readCount(await col.findOneAndUpdate({ _id: key }, update, options))
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? Number((err as { code?: number }).code) : 0
    if (code !== 11000) throw err
    return readCount(await col.findOneAndUpdate({ _id: key }, update, { upsert: false, returnDocument: 'after' }))
  }
}

async function assertRateLimit(req: PayloadRequest, rule: RateRule) {
  const key = rateKey(rule.scope, rule.id)
  if (!key || rule.limit < 1 || rule.windowMs < 1) return
  const col = rateCollection(req)
  if (!col) return
  await ensureIndex(col)
  const count = await bumpRateCount(col, key, rule.windowMs)
  if (!count) return
  if (count > rule.limit) {
    throw new APIError(MESSAGE, 429, { retryAfter: Math.ceil(rule.windowMs / 1000) }, true)
  }
}

/** Throws 429 when any bucket is over its cap. A counter failure allows the request. */
export async function assertWithinLimits(req: PayloadRequest, rules: RateRule[]) {
  try {
    for (const rule of rules) {
      await assertRateLimit(req, rule)
    }
  } catch (err) {
    if (err instanceof APIError) throw err
    try {
      req.payload.logger.error('Rate limit counter was skipped.')
    } catch {
      /* the request still proceeds */
    }
  }
}

export async function rateLimitResponse(req: PayloadRequest, rules: RateRule[]): Promise<Response | null> {
  try {
    await assertWithinLimits(req, rules)
    return null
  } catch (err) {
    if (!(err instanceof APIError) || err.status !== 429) return null
    const retryAfter =
      err.data && typeof err.data === 'object' && 'retryAfter' in err.data
        ? Number((err.data as { retryAfter?: number }).retryAfter) || 60
        : 60
    return Response.json(
      { message: err.message },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfter),
        },
      },
    )
  }
}

export function loginRules(req: PayloadRequest, email: string): RateRule[] {
  return [
    { scope: 'login-ip', id: clientIp(req), limit: 30, windowMs: TEN_MIN },
    { scope: 'login-email', id: email, limit: 10, windowMs: TEN_MIN },
  ]
}

export function registerRules(req: PayloadRequest): RateRule[] {
  return [{ scope: 'register-ip', id: clientIp(req), limit: 8, windowMs: HOUR }]
}

export function genImageRules(req: PayloadRequest, userId: string): RateRule[] {
  return [
    { scope: 'gen-image-user', id: userId, limit: 40, windowMs: FIVE_MIN },
    { scope: 'gen-image-ip', id: clientIp(req), limit: 60, windowMs: FIVE_MIN },
  ]
}

export function genVideoRules(req: PayloadRequest, userId: string): RateRule[] {
  return [
    { scope: 'gen-video-user', id: userId, limit: 15, windowMs: FIVE_MIN },
    { scope: 'gen-video-ip', id: clientIp(req), limit: 30, windowMs: FIVE_MIN },
  ]
}

export function enhanceRules(req: PayloadRequest, userId: string): RateRule[] {
  return [
    { scope: 'enhance-user', id: userId, limit: 20, windowMs: FIVE_MIN },
    { scope: 'enhance-ip', id: clientIp(req), limit: 40, windowMs: FIVE_MIN },
  ]
}

export function contactRules(req: PayloadRequest, email: string): RateRule[] {
  return [
    { scope: 'contact-ip', id: clientIp(req), limit: 8, windowMs: HOUR },
    { scope: 'contact-email', id: email, limit: 5, windowMs: HOUR },
  ]
}
