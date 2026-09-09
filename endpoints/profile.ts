import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from 'payload'
import { assertHandle, avatarUrlOf, clipBio, normalizeHandle, ownerIdOf, PIN_CAP } from '../lib/handle'
import { userIsGenAdmin } from '../lib/genAdmin'
import { deleteFromR2 } from './generateImage'

type UserRow = {
  id: string
  name?: string | null
  handle?: string | null
  bio?: string | null
  avatar?: unknown
}

type GenRow = {
  id: string
  user?: unknown
  prompt?: string
  model?: string
  modelId?: string | null
  mode?: string | null
  url?: string
  width?: number | null
  height?: number | null
  format?: string | null
  bytes?: number | null
  kind?: string | null
  durationSec?: number | null
  durationMs?: number | null
  resolution?: string | null
  imageSize?: string | null
  createdAt?: string
  pinned?: boolean | null
  pinnedAt?: string | null
  promptPublic?: boolean | null
  sourceUrl?: string | null
}

function publicUser(row: UserRow) {
  return {
    handle: row.handle || '',
    realm: row.handle || '',
    name: row.name || 'Creator',
    bio: row.bio || '',
    avatarUrl: avatarUrlOf(row.avatar),
  }
}

function publicPin(row: GenRow, withUser?: ReturnType<typeof publicUser>) {
  const promptPublic = Boolean(row.promptPublic)
  return {
    id: row.id,
    url: row.url,
    kind: row.kind || 'image',
    format: row.format,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    model: row.model,
    modelId: row.modelId || undefined,
    mode: row.mode || undefined,
    imageSize: row.imageSize,
    resolution: row.resolution,
    durationSec: row.durationSec,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    pinnedAt: row.pinnedAt,
    promptPublic,
    prompt: promptPublic ? row.prompt : undefined,
    user: withUser,
  }
}

async function readJson(req: PayloadRequest) {
  try {
    await addDataAndFileToRequest(req)
  } catch {
    return null
  }
  return (req.data || {}) as Record<string, unknown>
}

export const profileGetEndpoint: Endpoint = {
  path: '/profile/:handle',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const params = req.routeParams as { handle?: unknown } | undefined
    const handle = normalizeHandle(params?.handle)
    if (!handle) {
      return Response.json({ message: 'Missing realm.' }, { status: 400 })
    }

    const users = await req.payload.find({
      collection: 'users' as never,
      overrideAccess: true,
      depth: 1,
      limit: 1,
      where: { handle: { equals: handle } },
    })
    const user = users.docs[0] as UserRow | undefined
    if (!user || !user.handle) {
      return Response.json({ message: 'Profile not found.' }, { status: 404 })
    }

    const pins = await req.payload.find({
      collection: 'generations' as never,
      overrideAccess: true,
      depth: 0,
      limit: PIN_CAP,
      sort: '-pinnedAt',
      where: {
        and: [
          { user: { equals: String(user.id) } },
          { pinned: { equals: true } },
          { format: { not_equals: 'BLOCKED' } },
        ],
      },
    })

    const profile = publicUser(user)
    return Response.json({
      ...profile,
      pins: (pins.docs as GenRow[]).map((doc) => publicPin(doc, profile)),
      adminComp: await userIsGenAdmin(req),
    })
  },
}

export const profilePatchEndpoint: Endpoint = {
  path: '/profile',
  method: 'patch',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to edit your profile.' }, { status: 401 })
    }
    const body = await readJson(req)
    if (!body) {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }

    const data: { name?: string; handle?: string | null; bio?: string } = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim().slice(0, 80)
      if (!name) return Response.json({ message: 'Display name cannot be empty.' }, { status: 400 })
      data.name = name
    }
    if ('handle' in body || 'realm' in body) {
      const handle = normalizeHandle(body.realm ?? body.handle)
      if (handle) assertHandle(handle)
      data.handle = handle
    }
    if ('bio' in body) data.bio = clipBio(body.bio)

    try {
      const updated = (await req.payload.update({
        collection: 'users' as never,
        id: String(req.user.id),
        data: data as never,
        depth: 1,
        overrideAccess: true,
      })) as UserRow

      return Response.json({
        ok: true,
        handle: updated.handle || '',
        realm: updated.handle || '',
        name: updated.name || '',
        bio: updated.bio || '',
        avatarUrl: avatarUrlOf(updated.avatar),
        profileUrl: updated.handle ? `/u/${updated.handle}` : '',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save profile.'
      return Response.json({ message }, { status: 400 })
    }
  },
}

export const genPinEndpoint: Endpoint = {
  path: '/gen/pin',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to pin a generation.' }, { status: 401 })
    }
    const body = await readJson(req)
    if (!body) {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return Response.json({ message: 'Missing generation id.' }, { status: 400 })

    const wantPinned = body.pinned !== false && body.pinned !== 'false'
    const wantPromptPublic =
      'promptPublic' in body ? Boolean(body.promptPublic) && body.promptPublic !== 'false' : undefined

    let doc: GenRow
    try {
      doc = (await req.payload.findByID({
        collection: 'generations' as never,
        id,
        depth: 0,
        overrideAccess: true,
      })) as GenRow
    } catch {
      return Response.json({ message: 'Generation not found.' }, { status: 404 })
    }

    if (ownerIdOf(doc.user) !== String(req.user.id)) {
      return Response.json({ message: 'Generation not found.' }, { status: 404 })
    }

    const me = (await req.payload.findByID({
      collection: 'users' as never,
      id: String(req.user.id),
      depth: 0,
      overrideAccess: true,
    })) as UserRow

    if (wantPinned && !me.handle) {
      return Response.json(
        { message: 'Set a public realm on your account before pinning gens to your profile.' },
        { status: 400 },
      )
    }

    if (wantPinned && !doc.pinned) {
      const already = await req.payload.find({
        collection: 'generations' as never,
        overrideAccess: true,
        depth: 0,
        limit: 1,
        where: {
          and: [
            { user: { equals: String(req.user.id) } },
            { pinned: { equals: true } },
            { id: { not_equals: id } },
          ],
        },
      })
      if (already.totalDocs >= PIN_CAP) {
        return Response.json(
          { message: `You can pin up to ${PIN_CAP} gens on your profile. Unpin one first.` },
          { status: 400 },
        )
      }
    }

    const nextPinned = wantPinned
    const nextPromptPublic = nextPinned ? (wantPromptPublic ?? Boolean(doc.promptPublic)) : false

    const updated = (await req.payload.update({
      collection: 'generations' as never,
      id,
      overrideAccess: true,
      depth: 0,
      data: {
        pinned: nextPinned,
        pinnedAt: nextPinned ? doc.pinnedAt || new Date().toISOString() : null,
        promptPublic: nextPromptPublic,
      } as never,
    })) as GenRow

    return Response.json({
      ok: true,
      id: updated.id,
      pinned: Boolean(updated.pinned),
      promptPublic: Boolean(updated.promptPublic),
      handle: me.handle || '',
      realm: me.handle || '',
      profileUrl: me.handle ? `/u/${me.handle}` : '',
    })
  },
}

async function outpostHandler(req: PayloadRequest) {
    let page = 1
    let limit = 24
    let q = ''
    let kind = ''
    let modelId = ''
    try {
      const url = new URL(typeof req.url === 'string' ? req.url : '', 'http://local')
      page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      limit = Math.min(48, Math.max(1, Number(url.searchParams.get('limit')) || 24))
      q = normalizeHandle(url.searchParams.get('q')) || String(url.searchParams.get('q') || '').trim().toLowerCase()
      kind = String(url.searchParams.get('kind') || '').trim().toLowerCase()
      modelId = String(url.searchParams.get('model') || '').trim()
    } catch {
      /* defaults */
    }

    const clauses: Record<string, unknown>[] = [
      { pinned: { equals: true } },
      { format: { not_equals: 'BLOCKED' } },
    ]

    if (kind === 'video') {
      clauses.push({ kind: { equals: 'video' } })
    } else if (kind === 'image') {
      clauses.push({ kind: { not_equals: 'video' } })
    }

    if (modelId) {
      clauses.push({ modelId: { equals: modelId } })
    }

    if (q) {
      const people = await req.payload.find({
        collection: 'users' as never,
        overrideAccess: true,
        depth: 0,
        limit: 20,
        where: {
          or: [
            { handle: { contains: q } },
            { name: { contains: q } },
          ],
        },
      })
      const ids = (people.docs as UserRow[]).map((row) => String(row.id)).filter(Boolean)
      if (!ids.length) {
        return Response.json({ docs: [], page, limit, hasNextPage: false, totalDocs: 0 })
      }
      clauses.push({ user: { in: ids } })
    }

    const result = await req.payload.find({
      collection: 'generations' as never,
      overrideAccess: true,
      depth: 0,
      page,
      limit,
      sort: '-pinnedAt',
      where: { and: clauses } as never,
    })

    const ownerIds = Array.from(
      new Set((result.docs as GenRow[]).map((doc) => ownerIdOf(doc.user)).filter(Boolean)),
    )
    const peopleById: Record<string, ReturnType<typeof publicUser>> = {}
    if (ownerIds.length) {
      const people = await req.payload.find({
        collection: 'users' as never,
        overrideAccess: true,
        depth: 1,
        limit: ownerIds.length,
        where: { id: { in: ownerIds } },
      })
      for (const row of people.docs as UserRow[]) {
        if (!row.handle) continue
        peopleById[String(row.id)] = publicUser(row)
      }
    }

    const docs = (result.docs as GenRow[])
      .map((doc) => {
        const owner = peopleById[ownerIdOf(doc.user)]
        if (!owner) return null
        return publicPin(doc, owner)
      })
      .filter(Boolean)

    return Response.json({
      docs,
      page,
      limit,
      totalDocs: result.totalDocs,
      hasNextPage: Boolean(result.hasNextPage) || page * limit < Number(result.totalDocs || 0),
      adminComp: await userIsGenAdmin(req),
    })
}

export const outpostRemoveEndpoint: Endpoint = {
  path: '/outpost/remove',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) {
      return Response.json({ message: 'Sign in to moderate Outpost.' }, { status: 401 })
    }
    if (!(await userIsGenAdmin(req))) {
      return Response.json({ message: 'Not allowed.' }, { status: 403 })
    }
    const body = await readJson(req)
    if (!body) {
      return Response.json({ message: 'Invalid request body.' }, { status: 400 })
    }
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return Response.json({ message: 'Missing generation id.' }, { status: 400 })

    let doc: GenRow
    try {
      doc = (await req.payload.findByID({
        collection: 'generations' as never,
        id,
        depth: 0,
        overrideAccess: true,
      })) as GenRow
    } catch {
      return Response.json({ message: 'Generation not found.' }, { status: 404 })
    }

    if (doc.url) await deleteFromR2(doc.url)
    if (doc.sourceUrl) await deleteFromR2(doc.sourceUrl)

    await req.payload.delete({
      collection: 'generations' as never,
      id,
      overrideAccess: true,
    })

    return Response.json({ ok: true, id })
  },
}

export const outpostEndpoint: Endpoint = {
  path: '/outpost',
  method: 'get',
  handler: outpostHandler,
}

export const communityEndpoint: Endpoint = {
  path: '/community',
  method: 'get',
  handler: outpostHandler,
}

export const profileEndpoints: Endpoint[] = [
  profileGetEndpoint,
  profilePatchEndpoint,
  genPinEndpoint,
  outpostEndpoint,
  communityEndpoint,
  outpostRemoveEndpoint,
]
