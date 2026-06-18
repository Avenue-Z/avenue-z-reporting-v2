# Configurable Dashboard — Sub-project #4: NL → Config Resolver — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `lib/dashboard/nl/` — a server-side resolver that turns a natural-language description into a validated leaf `BlockConfig` proposal (or a clarifying question) via Glean's chat API.

**Architecture:** `resolveBlockNL` builds a strict-JSON prompt, calls Glean (reusing `lib/glean.ts`, dependency-injected for tests), extracts the final JSON object from Glean's agentic reply, validates it with #2's `parseBlockConfig`, and returns a discriminated `ResolutionResult` (`proposal | clarify | error`) — never throwing, with one repair retry.

**Tech Stack:** TypeScript (strict), existing `lib/glean.ts` REST client, `tsx` test scripts with `node:assert`.

## Global Constraints

- TypeScript strict mode; **no `any`** in any new file.
- Tests are **pure** — no live Glean calls, no `.env` loading, no creds. Run `npx tsx <file>.test.ts`. Test files: `import { strict as assert } from 'node:assert'`, top-level assertions (or an `async function run(){…}; run().catch(e=>{console.error(e);process.exit(1)})` wrapper if top-level await is needed), final `console.log('ok')`.
- Reuse the existing Glean transport (`GLEAN_BASE_URL`, `getGleanHeaders(actAsEmail)` from `@/lib/glean`) and the Glean chat shape from `app/api/glean/meeting-brief/route.ts` (`POST /chat` with `{ messages, saveChat: false }`; reply `{ messages: [{ author, fragments: [{text?, citation?}] }] }`, AI author is `'GLEAN_AI'`).
- Reuse #2's `parseBlockConfig` (`@/lib/dashboard/persistence`) to validate the proposed config — do not re-implement validation.
- Leaf sources only: `'supermetrics' | 'triplewhale'`. Aggregate is rejected (sub-project #5).
- `MIN_CONFIDENCE = 0.5`. Below it (or an explicit `clarify`) → `kind:'clarify'`.
- The resolver assigns a placeholder id `'__pending__'` to the proposed config so it satisfies `parseBlockConfig` (which requires `id`); the real id is assigned at save time.
- Server-side only — never import `lib/dashboard/nl/*` into a Client Component.
- Commit after each task with the message shown. Stage only the files the task names; never the unrelated uncommitted paid-search edits in the working tree.

---

## Inter-Component Dependency Map (read before parallelizing)

```
                         types.ts (T1)  ← foundation; every nl file imports it
                               │
        ┌──────────────┬───────┴───────┬──────────────────┐
        ▼              ▼               ▼                  ▼
   prompt (T2)    extract (T3)     parse (T4)        glean-chat (T5)
   build prompt   pull JSON     validate+map        real GleanChatFn
   (T1)           (T1)          (T1 + #2            (T1 + lib/glean.ts,
                                 parseBlockConfig)    both committed)
        └──────────────┴───────┬───────┴──────────────────┘
                               ▼
                         resolve (T6)  ← orchestrator; imports T2,T3,T4,T5 (+T1)
```

**Edges = "imports / consumes".** A task may start as soon as every task it points *from* is committed. `parse` (T4) depends only on T1 plus the **already-committed** #2 `parseBlockConfig`; `glean-chat` (T5) depends only on T1 plus the **already-committed** `lib/glean.ts`. So T2–T5 share a wave.

### Parallelization waves (agent fleet)

| Wave | Tasks (parallel within a wave) | Unblocked by |
|---|---|---|
| 0 | **T1 types** | nothing — land first |
| 1 | **T2 prompt**, **T3 extract**, **T4 parse**, **T5 glean-chat** | T1 (+ committed `parseBlockConfig` / `lib/glean.ts`) |
| 2 | **T6 resolve** | T1,T2,T3,T4,T5 |

Wave 1 fans out to **4 concurrent agents** — four disjoint files, no cross-imports within the wave. Wave 2 is the single integration task. Same model as #1/#2: parallel implementers in no-git mode, controller commits sequentially per task and reviews each.

---

## File Structure

```
lib/dashboard/nl/
  types.ts          # ResolutionResult, BlockProposal, Candidate, GleanMessage, GleanChatFn, SourceKind, ResolveInput, MIN_CONFIDENCE
  types.test.ts
  prompt.ts         # buildResolutionPrompt(source, userPrompt)
  prompt.test.ts
  extract.ts        # extractJson(messages)
  extract.test.ts
  parse.ts          # parseProposal(json)  (reuses ../persistence parseBlockConfig)
  parse.test.ts
  glean-chat.ts     # realGleanChat: GleanChatFn over lib/glean.ts (thin; tsc-gated only)
  resolve.ts        # resolveBlockNL(input, deps?)
  resolve.test.ts
```

---

## Task 1: Types (`lib/dashboard/nl/types.ts`)

**Files:**
- Create: `lib/dashboard/nl/types.ts`
- Test: `lib/dashboard/nl/types.test.ts`

**Interfaces:**
- Consumes: `BlockConfig` (from `@/lib/dashboard/types`).
- Produces: `SourceKind`, `Candidate`, `BlockProposal`, `ResolutionResult`, `GleanMessage`, `GleanChatFn`, `ResolveInput`, `MIN_CONFIDENCE`.

- [ ] **Step 1: Write the type definitions**

```ts
// lib/dashboard/nl/types.ts
import type { BlockConfig } from '@/lib/dashboard/types'

/** Leaf sources only — aggregate NL is sub-project #5. */
export type SourceKind = 'supermetrics' | 'triplewhale'

/** Core-metric confidence below this routes to a clarifying question. */
export const MIN_CONFIDENCE = 0.5

export interface Candidate { value: string; label: string; confidence?: number }

export interface BlockProposal {
  config: BlockConfig // best-guess, already validated by parseBlockConfig (leaf binding only)
  confidence: number  // 0..1 for the core metric
  alternatives: { metric?: Candidate[]; account?: Candidate[] } // ranked best-first, capped at 5
}

export type ResolutionResult =
  | { kind: 'proposal'; proposal: BlockProposal }
  | { kind: 'clarify'; question: string }
  | { kind: 'error'; error: string }

/** One Glean chat message (mirrors the shape used in app/api/glean/meeting-brief/route.ts). */
export interface GleanMessage {
  author: string
  fragments: Array<{ text?: string; citation?: { sourceDocument?: { title?: string; url?: string } } }>
}

/** Injectable Glean transport — real impl in glean-chat.ts; tests pass a fake. */
export type GleanChatFn = (messages: GleanMessage[], actAsEmail: string) => Promise<GleanMessage[]>

export interface ResolveInput { source: SourceKind; prompt: string; actAsEmail: string }
```

- [ ] **Step 2: Write the test**

```ts
// lib/dashboard/nl/types.test.ts
// Run: npx tsx lib/dashboard/nl/types.test.ts
import { strict as assert } from 'node:assert'
import { MIN_CONFIDENCE, type ResolutionResult, type ResolveInput } from './types'

assert.equal(typeof MIN_CONFIDENCE, 'number')
assert.ok(MIN_CONFIDENCE > 0 && MIN_CONFIDENCE < 1)
const input: ResolveInput = { source: 'supermetrics', prompt: 'facebook spend last 30 days', actAsEmail: 'a@b.com' }
assert.equal(input.source, 'supermetrics')
const r: ResolutionResult = { kind: 'clarify', question: 'which metric?' }
assert.equal(r.kind, 'clarify')
console.log('ok')
```

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl/types" || echo "types ok"`
Expected: `types ok`

- [ ] **Step 4: Run the test**

Run: `npx tsx lib/dashboard/nl/types.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/nl/types.ts lib/dashboard/nl/types.test.ts
git commit -m "feat(dashboard/nl): resolver types"
```

---

## Task 2: Prompt builder (`lib/dashboard/nl/prompt.ts`)

**Files:**
- Create: `lib/dashboard/nl/prompt.ts`
- Test: `lib/dashboard/nl/prompt.test.ts`

**Interfaces:**
- Consumes: `SourceKind` (Task 1).
- Produces: `buildResolutionPrompt(source: SourceKind, userPrompt: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/nl/prompt.test.ts
// Run: npx tsx lib/dashboard/nl/prompt.test.ts
import { strict as assert } from 'node:assert'
import { buildResolutionPrompt } from './prompt'

const sm = buildResolutionPrompt('supermetrics', 'facebook ad spend last 30 days')
// embeds the user request and instructs strict JSON
assert.ok(sm.includes('facebook ad spend last 30 days'))
assert.ok(/json/i.test(sm))
assert.ok(sm.includes('confidence'))
assert.ok(sm.includes('clarify'))
assert.ok(sm.includes('metricField')) // supermetrics schema field
// source-specific: triplewhale prompt names the metric field, not metricField
const tw = buildResolutionPrompt('triplewhale', 'blended roas')
assert.ok(tw.includes('blended roas'))
assert.ok(tw.includes('"metric"'))
assert.ok(!tw.includes('metricField'))
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/prompt.test.ts`
Expected: FAIL with `Cannot find module './prompt'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/dashboard/nl/prompt.ts
import type { SourceKind } from './types'

const SUPERMETRICS_SCHEMA = `{
  "config": {
    "name": string,                         // human label, e.g. "Facebook Ad Spend"
    "binding": { "source": "supermetrics", "dsId": string, "metricField": string, "account": string },
    "format": "currency" | "percent" | "count" | "number",
    "range": null
  },
  "confidence": number,                       // 0..1 for the core metric
  "alternatives": { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
                    "account"?: [{ "value": string, "label": string, "confidence"?: number }] },
  "clarify"?: string                          // set ONLY if the request is too vague to pick a metric
}`

const TRIPLEWHALE_SCHEMA = `{
  "config": {
    "name": string,
    "binding": { "source": "triplewhale", "metric": string },
    "format": "currency" | "percent" | "count" | "number",
    "range": null
  },
  "confidence": number,
  "alternatives": { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
                    "account"?: [{ "value": string, "label": string, "confidence"?: number }] },
  "clarify"?: string
}`

export function buildResolutionPrompt(source: SourceKind, userPrompt: string): string {
  const schema = source === 'supermetrics' ? SUPERMETRICS_SCHEMA : TRIPLEWHALE_SCHEMA
  return `You are resolving a marketing-metric request into a structured dashboard block for the ${source} data source.

Use your ${source} tools to discover and VALIDATE the exact metric field and account that exist for this workspace. Rank alternative metric/account matches best-first.

User request: "${userPrompt}"

Return EXACTLY ONE fenced JSON object matching this schema and NOTHING else (no prose before or after):
\`\`\`json
${schema}
\`\`\`

Rules:
- Pick the single best-guess metric/account for "config"; put other plausible matches in "alternatives" (max 5 each, ranked).
- Set "confidence" to your confidence (0..1) that the core metric is what the user meant.
- If the request is too vague to choose a metric at all, set "clarify" to a single short narrowing question and omit a meaningful "config".
- "range" must be null (the block inherits the dashboard's time range).
- Use only metric fields and accounts that your tools confirm exist. Do not invent identifiers.`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/prompt.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/nl/prompt.ts lib/dashboard/nl/prompt.test.ts
git commit -m "feat(dashboard/nl): buildResolutionPrompt"
```

---

## Task 3: JSON extractor (`lib/dashboard/nl/extract.ts`)

**Files:**
- Create: `lib/dashboard/nl/extract.ts`
- Test: `lib/dashboard/nl/extract.test.ts`

**Interfaces:**
- Consumes: `GleanMessage` (Task 1).
- Produces: `extractJson(messages: GleanMessage[]): unknown | null`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/nl/extract.test.ts
// Run: npx tsx lib/dashboard/nl/extract.test.ts
import { strict as assert } from 'node:assert'
import { extractJson } from './extract'
import type { GleanMessage } from './types'

const msg = (author: string, text: string): GleanMessage => ({ author, fragments: [{ text }] })

// realistic multi-message reply: thinking + tool call + final fenced json
const messages: GleanMessage[] = [
  msg('GLEAN_AI', 'Let me check the Supermetrics fields...'),
  msg('GLEAN_AI', 'Found candidates.'),
  msg('GLEAN_AI', 'Here is the result:\n```json\n{"config":{"name":"X"},"confidence":0.9}\n```'),
]
const out = extractJson(messages) as { confidence: number }
assert.equal(out.confidence, 0.9)

// ignores USER messages, picks the LAST json block when several appear
const multi: GleanMessage[] = [
  msg('USER', '```json\n{"ignored":true}\n```'),
  msg('GLEAN_AI', '```json\n{"n":1}\n```'),
  msg('GLEAN_AI', '```json\n{"n":2}\n```'),
]
assert.equal((extractJson(multi) as { n: number }).n, 2)

// fallback: bare object with no fence
assert.equal((extractJson([msg('GLEAN_AI', 'answer: {"k":5} done')]) as { k: number }).k, 5)

// no json → null
assert.equal(extractJson([msg('GLEAN_AI', 'no json here')]), null)
// malformed json → null
assert.equal(extractJson([msg('GLEAN_AI', '```json\n{bad}\n```')]), null)
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/extract.test.ts`
Expected: FAIL with `Cannot find module './extract'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/dashboard/nl/extract.ts
import type { GleanMessage } from './types'

/**
 * Pull the final JSON object out of Glean's AI reply. Glean is agentic and
 * returns several GLEAN_AI messages (thinking, tool calls, final answer); the
 * answer is the LAST valid JSON we can find. Returns null if none parses.
 */
export function extractJson(messages: GleanMessage[]): unknown | null {
  const text = messages
    .filter((m) => m.author === 'GLEAN_AI')
    .flatMap((m) => m.fragments)
    .map((f) => f.text ?? '')
    .join('\n')

  const candidates: string[] = []
  // fenced ```json ... ``` blocks, in order
  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/gi)) candidates.push(m[1])
  // fallback: the last bare {...} span
  if (candidates.length === 0) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1))
  }

  // try last candidate first (the final answer)
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(candidates[i].trim())
    } catch {
      // try the next-earlier candidate
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/extract.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/nl/extract.ts lib/dashboard/nl/extract.test.ts
git commit -m "feat(dashboard/nl): extractJson from Glean reply"
```

---

## Task 4: Proposal parser (`lib/dashboard/nl/parse.ts`)

**Files:**
- Create: `lib/dashboard/nl/parse.ts`
- Test: `lib/dashboard/nl/parse.test.ts`

**Interfaces:**
- Consumes: `MIN_CONFIDENCE`, `ResolutionResult`, `Candidate` (Task 1); `parseBlockConfig` (`@/lib/dashboard/persistence`, already committed).
- Produces: `parseProposal(json: unknown): ResolutionResult`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/nl/parse.test.ts
// Run: npx tsx lib/dashboard/nl/parse.test.ts
import { strict as assert } from 'node:assert'
import { parseProposal } from './parse'

const goodConfig = {
  name: 'FB Spend',
  binding: { source: 'supermetrics', dsId: 'FA', metricField: 'cost', account: 'act_1' },
  format: 'currency',
  range: null,
}

// high-confidence valid proposal
{
  const r = parseProposal({ config: goodConfig, confidence: 0.9, alternatives: {} })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.confidence, 0.9)
    assert.equal(r.proposal.config.binding.source, 'supermetrics')
    assert.equal(r.proposal.config.id, '__pending__') // placeholder id assigned
  }
}

// explicit clarify wins
assert.equal(parseProposal({ clarify: 'Which metric — spend, ROAS, or conversions?' }).kind, 'clarify')

// below threshold → clarify even with a config
assert.equal(parseProposal({ config: goodConfig, confidence: 0.3, alternatives: {} }).kind, 'clarify')

// invalid config → error
assert.equal(parseProposal({ config: { name: 'x', binding: { source: 'supermetrics' }, format: 'currency', range: null }, confidence: 0.9 }).kind, 'error')

// aggregate binding rejected (leaf-only in #4)
{
  const agg = { name: 'roas', binding: { source: 'aggregate', op: '/', left: goodConfig.binding, right: goodConfig.binding }, format: 'number', range: null }
  assert.equal(parseProposal({ config: agg, confidence: 0.9 }).kind, 'error')
}

// alternatives parsed, ranked, capped at 5
{
  const alts = Array.from({ length: 8 }, (_, i) => ({ value: `m${i}`, label: `M${i}`, confidence: 1 - i * 0.1 }))
  const r = parseProposal({ config: goodConfig, confidence: 0.9, alternatives: { metric: alts } })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.alternatives.metric!.length, 5)
    assert.equal(r.proposal.alternatives.metric![0].value, 'm0')
  }
}

// non-object → error
assert.equal(parseProposal('nope').kind, 'error')
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/parse.test.ts`
Expected: FAIL with `Cannot find module './parse'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/dashboard/nl/parse.ts
import { parseBlockConfig } from '@/lib/dashboard/persistence'
import { MIN_CONFIDENCE, type Candidate, type ResolutionResult } from './types'

const PROPOSAL_PLACEHOLDER_ID = '__pending__'

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseCandidates(v: unknown): Candidate[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: Candidate[] = []
  for (const c of v) {
    if (isObj(c) && typeof c.value === 'string' && typeof c.label === 'string') {
      const cand: Candidate = { value: c.value, label: c.label }
      if (typeof c.confidence === 'number') cand.confidence = c.confidence
      out.push(cand)
    }
  }
  return out.slice(0, 5) // cap at 5, preserving given (best-first) order
}

export function parseProposal(json: unknown): ResolutionResult {
  if (!isObj(json)) return { kind: 'error', error: 'proposal: expected object' }

  // explicit intent-ambiguity clarify wins
  if (typeof json.clarify === 'string' && json.clarify.trim().length > 0) {
    return { kind: 'clarify', question: json.clarify.trim() }
  }

  if (!isObj(json.config)) return { kind: 'error', error: 'proposal.config: expected object' }

  // assign a placeholder id so the config satisfies parseBlockConfig (real id assigned at save)
  const candidate = { ...json.config, id: PROPOSAL_PLACEHOLDER_ID }
  const pb = parseBlockConfig(candidate, 'proposal.config')
  if (!pb.ok) return { kind: 'error', error: pb.error }
  if (pb.block.binding.source === 'aggregate') {
    return { kind: 'error', error: 'proposal.config.binding: aggregate not supported by the NL resolver (#5)' }
  }

  const confidence = typeof json.confidence === 'number' ? json.confidence : 0
  if (confidence < MIN_CONFIDENCE) {
    return { kind: 'clarify', question: 'I could not confidently identify the metric. Which metric did you mean?' }
  }

  const altsRaw = isObj(json.alternatives) ? json.alternatives : {}
  const alternatives: { metric?: Candidate[]; account?: Candidate[] } = {}
  const metric = parseCandidates(altsRaw.metric)
  const account = parseCandidates(altsRaw.account)
  if (metric && metric.length) alternatives.metric = metric
  if (account && account.length) alternatives.account = account

  return { kind: 'proposal', proposal: { config: pb.block, confidence, alternatives } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/parse.test.ts`
Expected: `ok`

- [ ] **Step 5: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl/parse" || echo "parse ok"`
Expected: `parse ok`

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/nl/parse.ts lib/dashboard/nl/parse.test.ts
git commit -m "feat(dashboard/nl): parseProposal (validate + clarify + alternatives)"
```

---

## Task 5: Real Glean transport (`lib/dashboard/nl/glean-chat.ts`)

**Files:**
- Create: `lib/dashboard/nl/glean-chat.ts`

**Interfaces:**
- Consumes: `GLEAN_BASE_URL`, `getGleanHeaders` (`@/lib/glean`, already committed); `GleanChatFn`, `GleanMessage` (Task 1).
- Produces: `realGleanChat: GleanChatFn`.

**Note:** thin network wrapper — `lib/glean.ts` reads the Glean token from env (defaults to `''`, so importing this module does not throw). It makes a real `fetch` when called, so there is no env-free unit test; verified by the tsc gate only. Do NOT add a test file. Mirrors the `POST /chat` shape in `app/api/glean/meeting-brief/route.ts`.

- [ ] **Step 1: Write the implementation**

```ts
// lib/dashboard/nl/glean-chat.ts
import { GLEAN_BASE_URL, getGleanHeaders } from '@/lib/glean'
import type { GleanChatFn, GleanMessage } from './types'

/** Real Glean chat call. resolveBlockNL uses this by default; tests inject a fake. */
export const realGleanChat: GleanChatFn = async (messages, actAsEmail) => {
  const res = await fetch(`${GLEAN_BASE_URL}/chat`, {
    method: 'POST',
    headers: getGleanHeaders(actAsEmail),
    body: JSON.stringify({ messages, saveChat: false }),
  })
  if (!res.ok) {
    throw new Error(`Glean API error: ${res.status}`)
  }
  const data = (await res.json()) as { messages?: GleanMessage[] }
  return data.messages ?? []
}
```

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl/glean-chat" || echo "glean-chat ok"`
Expected: `glean-chat ok`

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/nl/glean-chat.ts
git commit -m "feat(dashboard/nl): real Glean chat transport"
```

---

## Task 6: Orchestrator (`lib/dashboard/nl/resolve.ts`) — integration

**Files:**
- Create: `lib/dashboard/nl/resolve.ts`
- Test: `lib/dashboard/nl/resolve.test.ts`

**Interfaces:**
- Consumes: `buildResolutionPrompt` (T2), `extractJson` (T3), `parseProposal` (T4), `realGleanChat` (T5); `GleanChatFn`, `GleanMessage`, `ResolutionResult`, `ResolveInput` (T1).
- Produces: `resolveBlockNL(input: ResolveInput, deps?: { chat?: GleanChatFn }): Promise<ResolutionResult>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/nl/resolve.test.ts
// Run: npx tsx lib/dashboard/nl/resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveBlockNL } from './resolve'
import type { GleanChatFn, GleanMessage } from './types'

const aiJson = (obj: unknown): GleanMessage[] => [
  { author: 'GLEAN_AI', fragments: [{ text: '```json\n' + JSON.stringify(obj) + '\n```' }] },
]
const good = {
  config: { name: 'FB Spend', binding: { source: 'supermetrics', dsId: 'FA', metricField: 'cost', account: 'act_1' }, format: 'currency', range: null },
  confidence: 0.9,
  alternatives: {},
}
const input = { source: 'supermetrics' as const, prompt: 'fb spend', actAsEmail: 'a@b.com' }

async function run() {
  // proposal path
  {
    const chat: GleanChatFn = async () => aiJson(good)
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'proposal')
  }
  // clarify path
  {
    const chat: GleanChatFn = async () => aiJson({ clarify: 'Which metric?' })
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'clarify')
  }
  // repair retry: garbage first, valid second → proposal, and chat called twice
  {
    let calls = 0
    const chat: GleanChatFn = async () => { calls++; return calls === 1 ? [{ author: 'GLEAN_AI', fragments: [{ text: 'no json' }] }] : aiJson(good) }
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'proposal')
    assert.equal(calls, 2)
  }
  // repair retry exhausted → error
  {
    const chat: GleanChatFn = async () => [{ author: 'GLEAN_AI', fragments: [{ text: 'never json' }] }]
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'error')
  }
  // network error → error (never throws)
  {
    const chat: GleanChatFn = async () => { throw new Error('boom') }
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'error')
    if (r.kind === 'error') assert.ok(r.error.includes('boom'))
  }
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/resolve.test.ts`
Expected: FAIL with `Cannot find module './resolve'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/dashboard/nl/resolve.ts
import { buildResolutionPrompt } from './prompt'
import { extractJson } from './extract'
import { parseProposal } from './parse'
import { realGleanChat } from './glean-chat'
import type { GleanChatFn, GleanMessage, ResolutionResult, ResolveInput } from './types'

const userMsg = (text: string): GleanMessage => ({ author: 'USER', fragments: [{ text }] })

function resolveFromReply(reply: GleanMessage[]): ResolutionResult {
  const json = extractJson(reply)
  if (json === null) return { kind: 'error', error: 'no JSON found in Glean reply' }
  return parseProposal(json)
}

/**
 * Resolve a natural-language request into a validated leaf BlockConfig proposal
 * (or a clarifying question). Never throws — Glean/transport failures return
 * { kind: 'error' }. One repair retry on an unusable reply.
 */
export async function resolveBlockNL(
  input: ResolveInput,
  deps: { chat?: GleanChatFn } = {},
): Promise<ResolutionResult> {
  const chat = deps.chat ?? realGleanChat
  const basePrompt = buildResolutionPrompt(input.source, input.prompt)
  try {
    let result = resolveFromReply(await chat([userMsg(basePrompt)], input.actAsEmail))
    if (result.kind === 'error') {
      const repair = userMsg(
        `Your previous reply was not valid JSON matching the schema (${result.error}). Return ONLY the single fenced JSON object, no prose.`,
      )
      result = resolveFromReply(await chat([userMsg(basePrompt), repair], input.actAsEmail))
    }
    return result
  } catch (e) {
    return { kind: 'error', error: e instanceof Error ? e.message : 'Glean call failed' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/resolve.test.ts`
Expected: `ok`

- [ ] **Step 5: Full layer type-check + run the whole #4 suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl" || echo "no new type errors"
for f in lib/dashboard/nl/types.test.ts lib/dashboard/nl/prompt.test.ts lib/dashboard/nl/extract.test.ts lib/dashboard/nl/parse.test.ts lib/dashboard/nl/resolve.test.ts; do echo "== $f"; npx tsx "$f"; done
```
Expected: `no new type errors`, and each test prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/nl/resolve.ts lib/dashboard/nl/resolve.test.ts
git commit -m "feat(dashboard/nl): resolveBlockNL orchestrator (chat + repair retry)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-18-dashboard-nl-resolver-design.md`):
- §3 architecture (reuse lib/glean.ts, DI'd chat, Glean owns discovery) → T5 + T6. ✅
- §4 output contract (`ResolutionResult`, `BlockProposal`, `Candidate`, `GleanChatFn`) → T1. ✅
- §5 reliability: prompt-for-JSON → T2; extractJson (last valid block) → T3; validate via parseBlockConfig → T4; one repair retry → T6; confidence threshold → clarify → T4 (`MIN_CONFIDENCE`); never throws → T6 try/catch. ✅
- §5 leaf-only (aggregate rejected) → T4 + test. ✅
- §6 testing (pure, fake Glean; thin wrapper tsc-gated) → tests in T1–T4, T6; T5 note. ✅
- §7 file layout → matches File Structure. ✅
- §8 out-of-scope (preview UI, aggregate NL, persistence) → none included; placeholder-id note covers the "id assigned at save" boundary. ✅

**Placeholder scan:** none. (`PROPOSAL_PLACEHOLDER_ID = '__pending__'` is a real sentinel value, not a TODO.) ✅

**Type consistency:** `ResolutionResult`/`BlockProposal`/`Candidate`/`GleanMessage`/`GleanChatFn`/`ResolveInput`/`MIN_CONFIDENCE` defined in T1 are used with identical shapes in T2–T6; `resolveBlockNL(input, deps?)`, `parseProposal(json)`, `extractJson(messages)`, `buildResolutionPrompt(source, userPrompt)`, `realGleanChat` names match definitions and call sites; `parseBlockConfig` consumed with its real `{ ok, block } | { ok:false, error }` shape from #2. ✅

**Out-of-band:** do not stage the unrelated uncommitted paid-search edits in any task.
