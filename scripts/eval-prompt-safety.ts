import { SAFETY_EVAL, scanPromptSafety } from '../lib/promptSafety'

function runBucket(name: string, briefs: string[], expectOk: boolean) {
  let pass = 0
  const fails: string[] = []
  for (const brief of briefs) {
    const hit = scanPromptSafety(brief)
    if (hit.ok === expectOk) pass += 1
    else fails.push(`${name}: ${brief.slice(0, 72)} → ${hit.ok ? 'allowed' : hit.message}`)
  }
  return { pass, fails }
}

const allow = runBucket('allow', SAFETY_EVAL.allow, true)
const porn = runBucket('porn', SAFETY_EVAL.porn, false)
const minor = runBucket('minor', SAFETY_EVAL.minor, false)
const fails = [...allow.fails, ...porn.fails, ...minor.fails]
console.log(JSON.stringify({
  allow: `${allow.pass}/10`,
  porn: `${porn.pass}/10`,
  minor: `${minor.pass}/10`,
  ok: fails.length === 0,
  fails,
}, null, 2))
process.exit(fails.length ? 1 : 0)
