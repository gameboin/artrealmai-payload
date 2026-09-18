import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isVideoGen, makeGenThumbFromUrl } from '../lib/genThumb'

const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry-run')
const ALL = process.argv.includes('--all')

type GenDoc = {
  id: string
  url?: string | null
  thumbUrl?: string | null
  kind?: string | null
  format?: string | null
  pinned?: boolean | null
}

async function main() {
  const payload = await getPayload({ config })
  let page = 1
  let ok = 0
  let skip = 0
  let fail = 0

  for (;;) {
    const clauses: Record<string, unknown>[] = [
      { or: [{ kind: { exists: false } }, { kind: { not_equals: 'video' } }] },
    ]
    if (!ALL) clauses.push({ pinned: { equals: true } })
    if (!FORCE) {
      clauses.push({ or: [{ thumbUrl: { exists: false } }, { thumbUrl: { equals: '' } }] })
    }

    const paginate = FORCE || DRY
    const result = await payload.find({
      collection: 'generations' as never,
      limit: 20,
      page: paginate ? page : 1,
      depth: 0,
      overrideAccess: true,
      sort: '-pinnedAt',
      where: { and: clauses } as never,
    })

    if (!result.docs.length) break
    const batchOk = ok

    for (const raw of result.docs) {
      const doc = raw as GenDoc
      if (isVideoGen(doc.kind, doc.format)) {
        skip += 1
        continue
      }
      if (!FORCE && doc.thumbUrl) {
        skip += 1
        continue
      }
      const url = String(doc.url || '')
      if (!url.startsWith('http')) {
        console.warn('skip (no url)', doc.id)
        skip += 1
        continue
      }

      if (DRY) {
        console.log('would thumb', doc.id)
        ok += 1
        continue
      }

      try {
        const thumbUrl = await makeGenThumbFromUrl(url)
        if (!thumbUrl) throw new Error('thumb failed')
        await payload.update({
          collection: 'generations' as never,
          id: doc.id,
          overrideAccess: true,
          data: { thumbUrl } as never,
        })
        console.log('ok', doc.id)
        ok += 1
      } catch (err) {
        fail += 1
        console.error('fail', doc.id, err)
      }
    }

    if (paginate) {
      if (!result.hasNextPage) break
      page += 1
    } else if (ok === batchOk) {
      break
    }
  }

  console.log(JSON.stringify({ ok, skip, fail, dryRun: DRY, force: FORCE, all: ALL }))
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
