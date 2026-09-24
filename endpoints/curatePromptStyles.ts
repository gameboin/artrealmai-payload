import type { Endpoint, PayloadRequest } from 'payload'
import { userIsGenAdmin } from '../lib/genAdmin'

async function authorized(req: PayloadRequest) {
  if (await userIsGenAdmin(req)) return true
  const header = String(req.headers.get('authorization') || '')
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const secret = process.env.PAYLOAD_SECRET || ''
  return Boolean(secret && token && token === secret)
}

export const curatePromptStylesEndpoint: Endpoint = {
  path: '/curate-prompt-styles',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!(await authorized(req))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = (await req.json?.().catch(() => null)) as {
      category?: unknown
      terms?: unknown
    } | null
    const category = typeof body?.category === 'string' ? body.category.trim() : ''
    const terms = Array.isArray(body?.terms)
      ? body.terms.map((row) => String(row || '').trim()).filter(Boolean).slice(0, 400)
      : []
    if (!category || !terms.length) {
      return Response.json({ error: 'category and terms are required' }, { status: 400 })
    }
    const found = await req.payload.find({
      collection: 'prompt-styles',
      where: { category: { equals: category } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const docs = [...found.docs].sort((a, b) => {
      const an = Array.isArray(a.terms) ? a.terms.length : 0
      const bn = Array.isArray(b.terms) ? b.terms.length : 0
      return bn - an
    })
    const data = { category, terms: terms.map((text) => ({ text })) }
    let id = ''
    if (docs.length) {
      const updated = await req.payload.update({
        collection: 'prompt-styles',
        id: docs[0].id,
        data,
        overrideAccess: true,
      })
      id = String(updated.id)
      for (const extra of docs.slice(1)) {
        await req.payload.delete({
          collection: 'prompt-styles',
          id: extra.id,
          overrideAccess: true,
        })
      }
    } else {
      const created = await req.payload.create({
        collection: 'prompt-styles',
        data,
        overrideAccess: true,
      })
      id = String(created.id)
    }
    return Response.json({
      ok: true,
      category,
      id,
      terms: terms.length,
      removedDocs: Math.max(0, docs.length - 1),
    })
  },
}

export const curatePromptStylesEndpoints: Endpoint[] = [curatePromptStylesEndpoint]
