// scripts/verify-ai-retrievals.ts
export {} // module scope: keep top-level `main` out of the global script namespace
// Run: npx tsx --env-file=.env.local scripts/verify-ai-retrievals.ts [clientSlug]
// Read-only. End-to-end /verify for AI Retrievals (Task 10): fetches live Top Content
// the same way the section does, joins per-post retrievals (Dash post -> canonical
// resolution -> Peec `retrievals`), and prints the owned-only ranked list — confirms
// the whole pipeline against a real client (default: renaissance).

import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { retrievalsForPosts, ownedAiRetrievedContent } from '@/lib/organic-social/ai-retrievals'

// Design probing showed this LinkedIn post cited by Peec with retrievals=34 — the
// canary that confirms the Dash -> resolve -> Peec join actually works end to end.
const KNOWN_CITED_URL_FRAGMENT = 'activity-7450989177057267713'

async function main() {
  const slug = process.argv[2] ?? 'renaissance'

  if (!process.env.DASH_API_TOKEN) {
    console.log('No DASH_API_TOKEN — skipped; set DASH_API_TOKEN in .env.local')
    return
  }
  if (!process.env.PEEC_AI_CUSTOMER_TOKEN) {
    console.log('No PEEC_AI_CUSTOMER_TOKEN — skipped; set PEEC_AI_CUSTOMER_TOKEN in .env.local')
    return
  }

  console.log(`Client: ${slug}\n`)

  // 1. Live Top Content, same fetch path the section uses.
  const posts = await fetchTopContentFrozen(slug, 'last_30_days', null)
  const linkedin = posts.filter((p) => p.channel === 'LINKEDIN')
  console.log(`Fetched ${posts.length} posts (${linkedin.length} LinkedIn) for last_30_days\n`)

  // 2. Per-post retrievals.
  const retrievals = await retrievalsForPosts(slug, posts)
  console.log('--- LinkedIn post retrievals ---')
  let sawKnownCited = false
  for (const p of linkedin) {
    const v = retrievals.get(p.id)
    const shown = v === null || v === undefined ? '—' : String(v)
    const caption = p.caption.replace(/\s+/g, ' ').slice(0, 60)
    console.log(`  #${p.id}  ${shown.padStart(4)}  ${caption}  (${p.url ?? 'no url'})`)
    if (p.url?.includes(KNOWN_CITED_URL_FRAGMENT)) {
      sawKnownCited = true
      console.log(`    ^ known-cited post (design probing: retrievals=34) — EXPECT non-null, got ${shown}`)
    }
  }
  if (!sawKnownCited) {
    console.log(`  (known-cited post "${KNOWN_CITED_URL_FRAGMENT}" not present in this window — cannot confirm)`)
  }

  // 3. Owned-only ranked list (Surface B).
  const owned = await ownedAiRetrievedContent(slug)
  console.log('\n--- Owned AI-retrieved content (ranked) ---')
  if (!owned.length) {
    console.log('  (empty — check clients.owned_linkedin_handle is set for this client)')
  }
  for (const o of owned) {
    console.log(`  ${String(o.retrievals).padStart(4)}  ${o.title ?? '(no title)'}  [${o.engines.join(', ')}]  ${o.url}`)
  }
  console.log('\nEXPECT: owned list includes the company "hr-teams" article (retrievals≈230) and')
  console.log('        EXCLUDES the Howell/Tolbert third-party Pulse articles.')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
