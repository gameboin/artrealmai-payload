import type { Endpoint, PayloadRequest } from 'payload'
import { userIsGenAdmin } from '../lib/genAdmin'

function hasCardSize(doc: { sizes?: { card?: { filename?: string | null } } }) {
  const name = doc.sizes?.card?.filename
  return Boolean(name && name !== 'undefined')
}

async function authorized(req: PayloadRequest) {
  if (await userIsGenAdmin(req)) return true
  const header = String(req.headers.get('authorization') || '')
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const secret = process.env.PAYLOAD_SECRET || ''
  return Boolean(secret && token && token === secret)
}

export const regenerateCardSizesEndpoint: Endpoint = {
  path: '/regenerate-card-sizes',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!(await authorized(req))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { limit?: number; page?: number; force?: boolean } = {}
    try {
      body = (await req.json?.()) || {}
    } catch {
      body = {}
    }
    const limit = Math.min(8, Math.max(1, Number(body.limit) || 4))
    const page = Math.max(1, Number(body.page) || 1)
    const force = Boolean(body.force)

    const result = await req.payload.find({
      collection: 'media',
      limit,
      page,
      depth: 0,
      overrideAccess: true,
    })

    const processed: string[] = []
    const skipped: string[] = []
    const failed: { id: string; error: string }[] = []

    for (const doc of result.docs) {
      const mime = String(doc.mimeType || '')
      const label = String(doc.filename || doc.id)
      if (!mime.startsWith('image/')) {
        skipped.push(label)
        continue
      }
      if (!force && hasCardSize(doc)) {
        skipped.push(label)
        continue
      }
      const url = String(doc.url || '')
      if (!url.startsWith('http')) {
        failed.push({ id: label, error: 'no url' })
        continue
      }
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`fetch ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        await req.payload.update({
          collection: 'media',
          id: doc.id,
          data: {},
          overrideAccess: true,
          overwriteExistingFiles: true,
          file: {
            data: buf,
            mimetype: mime,
            name: String(doc.filename || 'cover.jpg'),
            size: buf.length,
          },
        })
        processed.push(label)
      } catch (err) {
        failed.push({ id: label, error: err instanceof Error ? err.message : 'update failed' })
      }
    }

    return Response.json({
      page,
      limit,
      hasNextPage: result.hasNextPage,
      nextPage: result.hasNextPage ? page + 1 : null,
      totalDocs: result.totalDocs,
      processed,
      skipped,
      failed,
    })
  },
}

export const regenerateCardSizesEndpoints: Endpoint[] = [regenerateCardSizesEndpoint]
