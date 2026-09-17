import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry-run')

function hasCardSize(doc: { sizes?: { card?: { filename?: string | null } } }) {
  const name = doc.sizes?.card?.filename
  return Boolean(name && name !== 'undefined')
}

async function main() {
  const payload = await getPayload({ config })
  let page = 1
  let ok = 0
  let skip = 0
  let fail = 0

  for (;;) {
    const result = await payload.find({
      collection: 'media',
      limit: 50,
      page,
      depth: 0,
      overrideAccess: true,
    })

    for (const doc of result.docs) {
      const mime = String(doc.mimeType || '')
      if (!mime.startsWith('image/')) {
        skip += 1
        continue
      }
      if (!FORCE && hasCardSize(doc)) {
        skip += 1
        continue
      }
      const url = String(doc.url || '')
      if (!url.startsWith('http')) {
        console.warn('skip (no url)', doc.id, doc.filename)
        skip += 1
        continue
      }

      if (DRY) {
        console.log('would regenerate', doc.filename || doc.id)
        ok += 1
        continue
      }

      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`fetch ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const name = String(doc.filename || 'cover.jpg')
        await payload.update({
          collection: 'media',
          id: doc.id,
          data: {},
          overrideAccess: true,
          overwriteExistingFiles: true,
          file: {
            data: buf,
            mimetype: mime,
            name,
            size: buf.length,
          },
        })
        console.log('ok', name)
        ok += 1
      } catch (err) {
        fail += 1
        console.error('fail', doc.filename || doc.id, err)
      }
    }

    if (!result.hasNextPage) break
    page += 1
  }

  console.log(JSON.stringify({ ok, skip, fail, dryRun: DRY, force: FORCE }))
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
