import type { Endpoint, PayloadRequest } from 'payload'
import { userIsGenAdmin } from '../lib/genAdmin'
import { isVideoGen, makeGenThumbFromUrl } from '../lib/genThumb'

async function authorized(req: PayloadRequest) {
  if (await userIsGenAdmin(req)) return true
  const header = String(req.headers.get('authorization') || '')
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const secret = process.env.PAYLOAD_SECRET || ''
  return Boolean(secret && token && token === secret)
}

type GenDoc = {
  id: string
  url?: string | null
  thumbUrl?: string | null
  kind?: string | null
  format?: string | null
}

export const regenerateGenThumbsEndpoint: Endpoint = {
  path: '/regenerate-gen-thumbs',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!(await authorized(req))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { limit?: number; page?: number; force?: boolean; pinnedOnly?: boolean } = {}
    try {
      body = (await req.json?.()) || {}
    } catch {
      body = {}
    }
    const limit = Math.min(8, Math.max(1, Number(body.limit) || 4))
    const force = Boolean(body.force)
    const pinnedOnly = body.pinnedOnly !== false
    const page = force ? Math.max(1, Number(body.page) || 1) : 1

    const clauses: Record<string, unknown>[] = [
      { or: [{ kind: { exists: false } }, { kind: { not_equals: 'video' } }] },
    ]
    if (pinnedOnly) clauses.push({ pinned: { equals: true } })
    if (!force) {
      clauses.push({ or: [{ thumbUrl: { exists: false } }, { thumbUrl: { equals: '' } }] })
    }

    const result = await req.payload.find({
      collection: 'generations' as never,
      limit,
      page,
      depth: 0,
      overrideAccess: true,
      sort: '-pinnedAt',
      where: { and: clauses } as never,
    })

    const processed: string[] = []
    const skipped: string[] = []
    const failed: { id: string; error: string }[] = []

    for (const raw of result.docs) {
      const doc = raw as GenDoc
      if (isVideoGen(doc.kind, doc.format)) {
        skipped.push(doc.id)
        continue
      }
      if (!force && doc.thumbUrl) {
        skipped.push(doc.id)
        continue
      }
      const url = String(doc.url || '')
      if (!url.startsWith('http')) {
        failed.push({ id: doc.id, error: 'no url' })
        continue
      }
      try {
        const thumbUrl = await makeGenThumbFromUrl(url)
        if (!thumbUrl) throw new Error('thumb failed')
        await req.payload.update({
          collection: 'generations' as never,
          id: doc.id,
          overrideAccess: true,
          data: { thumbUrl } as never,
        })
        processed.push(doc.id)
      } catch (err) {
        failed.push({ id: doc.id, error: err instanceof Error ? err.message : 'update failed' })
      }
    }

    return Response.json({
      page,
      limit,
      hasNextPage: force ? result.hasNextPage : result.docs.length >= limit,
      nextPage: force ? (result.hasNextPage ? page + 1 : null) : (result.docs.length >= limit ? 1 : null),
      totalDocs: result.totalDocs,
      processed,
      skipped,
      failed,
    })
  },
}

export const regenerateGenThumbsEndpoints: Endpoint[] = [regenerateGenThumbsEndpoint]
