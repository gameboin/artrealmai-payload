import 'dotenv/config'

const BASE = process.env.PAYLOAD_PUBLIC_SERVER_URL || 'https://artrealmai-payload.vercel.app'
const SECRET = process.env.PAYLOAD_SECRET || ''
const FORCE = process.argv.includes('--force')
const ALL = process.argv.includes('--all')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = Math.min(8, Math.max(1, Number(limitArg?.split('=')[1]) || 4))

if (!SECRET) {
  console.error('PAYLOAD_SECRET missing in .env')
  process.exit(1)
}

async function main() {
  let page = 1
  let ok = 0
  let skip = 0
  let fail = 0
  for (;;) {
    const res = await fetch(`${BASE}/api/regenerate-gen-thumbs`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ page, limit, force: FORCE, pinnedOnly: !ALL }),
    })
    const data = (await res.json()) as {
      error?: string
      processed?: string[]
      skipped?: string[]
      failed?: { id: string; error: string }[]
      hasNextPage?: boolean
      nextPage?: number | null
      page?: number
      totalDocs?: number
    }
    if (!res.ok) {
      console.error(res.status, data)
      process.exit(1)
    }
    ok += data.processed?.length || 0
    skip += data.skipped?.length || 0
    fail += data.failed?.length || 0
    console.log('page', data.page, 'processed', data.processed, 'skipped', data.skipped?.length, 'failed', data.failed)
    if (!data.hasNextPage || !data.nextPage) break
    if (!FORCE && !data.processed?.length) break
    page = data.nextPage
  }
  console.log(JSON.stringify({ ok, skip, fail, force: FORCE, all: ALL }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
