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
    let body: { category?: unknown; terms?: unknown } | null = null
    try {
      body = ((await req.json?.()) || null) as { category?: unknown; terms?: unknown } | null
    } catch {
      body = null
    }
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
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })
    const data = { category, terms: terms.map((text) => ({ text })) } as never
    const existing = found.docs[0]
    const saved = existing
      ? await req.payload.update({
          collection: 'prompt-styles',
          id: existing.id,
          data,
          overrideAccess: true,
        })
      : await req.payload.create({
          collection: 'prompt-styles',
          data,
          overrideAccess: true,
        })
    return Response.json({ ok: true, category, id: String(saved.id), terms: terms.length })
  },
}

export const curatePromptStylesEndpoints: Endpoint[] = [curatePromptStylesEndpoint]
