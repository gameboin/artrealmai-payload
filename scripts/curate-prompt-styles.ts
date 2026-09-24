import 'dotenv/config'
import { readFileSync } from 'fs'
import { getPayload } from 'payload'
import config from '@payload-config'

const file = process.argv[2] || '/tmp/inspirations-curated.json'
const DRY = process.argv.includes('--dry-run')
const curated = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>

async function main() {
  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'prompt-styles',
    limit: 200,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  const byCat = new Map<string, { id: string; n: number }[]>()
  for (const doc of found.docs) {
    const cat = String(doc.category || '')
    const n = Array.isArray(doc.terms) ? doc.terms.length : 0
    const list = byCat.get(cat) || []
    list.push({ id: String(doc.id), n })
    byCat.set(cat, list)
  }

  for (const [cat, terms] of Object.entries(curated)) {
    const clean = terms.map((text) => text.trim()).filter(Boolean)
    const docs = (byCat.get(cat) || []).sort((a, b) => b.n - a.n)
    console.log(cat, 'terms', clean.length, 'docs', docs.length, DRY ? 'dry' : 'write')
    if (DRY) continue
    const data = { category: cat, terms: clean.map((text) => ({ text })) }
    if (docs.length) {
      await payload.update({
        collection: 'prompt-styles',
        id: docs[0].id,
        data,
        overrideAccess: true,
      })
      for (const extra of docs.slice(1)) {
        await payload.delete({
          collection: 'prompt-styles',
          id: extra.id,
          overrideAccess: true,
        })
      }
    } else {
      await payload.create({
        collection: 'prompt-styles',
        data,
        overrideAccess: true,
      })
    }
  }
  console.log('done')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
