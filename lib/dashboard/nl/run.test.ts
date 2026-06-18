// lib/dashboard/nl/run.test.ts
// Run: npx tsx lib/dashboard/nl/run.test.ts
import { strict as assert } from 'node:assert'
import { resolveWithRepair, type RunResult } from './run'
import type { GleanChatFn, GleanMessage } from './types'

const aiJson = (obj: unknown): GleanMessage[] => [
  { author: 'GLEAN_AI', fragments: [{ text: '```json\n' + JSON.stringify(obj) + '\n```' }] },
]
type P = { v: number }
const parse = (json: unknown): RunResult<P> => {
  const o = json as { ok?: boolean; clarify?: boolean }
  if (o.clarify) return { kind: 'clarify', question: 'q' }
  if (o.ok) return { kind: 'proposal', proposal: { v: 1 } }
  return { kind: 'error', error: 'bad' }
}
const opts = { buildPrompt: () => 'PROMPT', parse }

async function run() {
  // proposal — one call, no retry
  {
    let n = 0
    const chat: GleanChatFn = async () => { n++; return aiJson({ ok: true }) }
    const r = await resolveWithRepair(opts, chat, 'a@b.com')
    assert.equal(r.kind, 'proposal'); assert.equal(n, 1)
  }
  // clarify — no retry
  {
    let n = 0
    const chat: GleanChatFn = async () => { n++; return aiJson({ clarify: true }) }
    const r = await resolveWithRepair(opts, chat, 'a@b.com')
    assert.equal(r.kind, 'clarify'); assert.equal(n, 1)
  }
  // repair retry: bad first, ok second → proposal, chat twice
  {
    let n = 0
    const chat: GleanChatFn = async () => { n++; return n === 1 ? aiJson({}) : aiJson({ ok: true }) }
    const r = await resolveWithRepair(opts, chat, 'a@b.com')
    assert.equal(r.kind, 'proposal'); assert.equal(n, 2)
  }
  // repair exhausted → error
  {
    let n = 0
    const chat: GleanChatFn = async () => { n++; return aiJson({}) }
    const r = await resolveWithRepair(opts, chat, 'a@b.com')
    assert.equal(r.kind, 'error'); assert.equal(n, 2)
  }
  // no JSON extractable → error (after retry)
  {
    const chat: GleanChatFn = async () => [{ author: 'GLEAN_AI', fragments: [{ text: 'no json' }] }]
    const r = await resolveWithRepair(opts, chat, 'a@b.com')
    assert.equal(r.kind, 'error')
  }
  // chat throws → error (never throws out)
  {
    const chat: GleanChatFn = async () => { throw new Error('boom') }
    const r = await resolveWithRepair(opts, chat, 'a@b.com')
    assert.equal(r.kind, 'error')
    if (r.kind === 'error') assert.ok(r.error.includes('boom'))
  }
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
