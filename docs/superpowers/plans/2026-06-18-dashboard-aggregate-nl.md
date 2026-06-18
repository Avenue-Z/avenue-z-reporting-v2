# Configurable Dashboard — Sub-project #5: Aggregate NL Formulas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the aggregate NL resolver in `lib/dashboard/nl/` — turn a free-form cross-source formula into a validated aggregate `BlockConfig` proposal (two leaf operands + binary op) or a clarifying question — and extract a shared repair runner that #4 also adopts.

**Architecture:** A single agentic Glean call returns the whole aggregate as one JSON object; it is validated with #2's `parseBlockConfig` (which validates the op + both leaves) and returned as a discriminated `AggregateResolutionResult`. A generic `resolveWithRepair` runner (new `run.ts`) factors out the prompt→chat→extract→parse→one-repair loop shared by #4 and #5; #4's `resolve.ts` is refactored onto it.

**Tech Stack:** TypeScript (strict), existing `lib/glean.ts` via #4's `glean-chat.ts`/`extract.ts`, `tsx` test scripts with `node:assert`.

## Global Constraints

- TypeScript strict mode; **no `any`** in any new file.
- Tests are **pure** — no live Glean calls, no `.env` loading, no creds. Run `npx tsx <file>.test.ts`. Test files: `import { strict as assert } from 'node:assert'`, top-level assertions (or an `async function run(){…}; run().catch(e=>{console.error(e);process.exit(1)})` wrapper if top-level await is needed), final `console.log('ok')`.
- Reuse, unchanged: `extractJson` (`./extract`), `realGleanChat` (`./glean-chat`), `GleanChatFn`/`GleanMessage`/`Candidate`/`MIN_CONFIDENCE` (`./types`), and #2's `parseBlockConfig` (`@/lib/dashboard/persistence`).
- Aggregate = two **leaf** operands + one binary op (`'+' | '-' | '*' | '/'`); reuse #1's `AggregateBinding`. No nesting / >2 operands.
- A proposal's config gets placeholder id `'__pending__'` (real id assigned at save); `parseAggregateProposal` **requires** the validated `binding.source === 'aggregate'`.
- `resolveWithRepair` is the single orchestration loop; do not duplicate it.
- Server-side only — never import `lib/dashboard/nl/*` into a Client Component.
- Commit after each task with the message shown. Stage only the files the task names; never the unrelated uncommitted paid-search edits in the working tree.

---

## Inter-Component Dependency Map (read before parallelizing)

```
   run.ts (T1)        aggregate-types.ts (T2)        aggregate-prompt.ts (T3)
   resolveWithRepair  AggregateProposal etc.         buildAggregatePrompt
   (extract+types,    (BlockConfig + Candidate,      (no deps)
    committed)         committed)
        │                    │                              │
        │                    ▼                              │
        │             aggregate-parse.ts (T4)               │
        │             parseAggregateProposal                │
        │             (T2 + committed parseBlockConfig;     │
        │              exports isObj/parseCandidates         │
        │              from #4 parse.ts)                     │
        │                    │                              │
   resolve.ts (T5)           │                              │
   refactor onto run.ts ─────┤                              │
   (T1; #4 file)             │                              │
        └──────────┬─────────┴──────────────┬───────────────┘
                   ▼                         ▼
              aggregate-resolve.ts (T6)  ← uses T1 (run) + T3 (prompt) + T4 (parse) + T2 (types) + glean-chat
```

**Edges = "imports / consumes".** A task may start once every task it points *from* is committed. T1/T2/T3 depend only on already-committed code.

### Parallelization waves (agent fleet)

| Wave | Tasks (parallel within a wave) | Unblocked by |
|---|---|---|
| 0 | **T1 run**, **T2 aggregate-types**, **T3 aggregate-prompt** | nothing (committed deps only) |
| 1 | **T4 aggregate-parse**, **T5 resolve refactor** | T4←T2; T5←T1 (different files: aggregate-parse.ts + #4 parse.ts vs #4 resolve.ts) |
| 2 | **T6 aggregate-resolve** | T1,T2,T3,T4 |

Wave 0 fans out to 3, wave 1 to 2, wave 2 is the integration task. Same model as before: parallel implementers in no-git mode, controller commits sequentially per task and reviews each.

---

## File Structure

```
lib/dashboard/nl/
  run.ts                 # NEW: RunResult<P>, resolveWithRepair generic runner
  run.test.ts
  aggregate-types.ts     # NEW: AggregateProposal, AggregateResolutionResult, AggregateResolveInput
  aggregate-types.test.ts
  aggregate-prompt.ts    # NEW: buildAggregatePrompt(formula)
  aggregate-prompt.test.ts
  aggregate-parse.ts     # NEW: parseAggregateProposal(json)
  aggregate-parse.test.ts
  aggregate-resolve.ts   # NEW: resolveAggregateNL(input, deps?)
  aggregate-resolve.test.ts
  parse.ts               # MODIFY: export isObj + parseCandidates (behavior unchanged)
  resolve.ts             # MODIFY: refactor resolveBlockNL onto resolveWithRepair (behavior unchanged)
```

---

## Task 1: Shared repair runner (`lib/dashboard/nl/run.ts`)

**Files:**
- Create: `lib/dashboard/nl/run.ts`
- Test: `lib/dashboard/nl/run.test.ts`

**Interfaces:**
- Consumes: `extractJson` (`./extract`); `GleanChatFn`, `GleanMessage` (`./types`).
- Produces: `RunResult<P>`; `resolveWithRepair<P>(opts: { buildPrompt: () => string; parse: (json: unknown) => RunResult<P> }, chat: GleanChatFn, actAsEmail: string): Promise<RunResult<P>>`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/run.test.ts`
Expected: FAIL with `Cannot find module './run'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/dashboard/nl/run.ts
import { extractJson } from './extract'
import type { GleanChatFn, GleanMessage } from './types'

/** The shared discriminated result shape, generic over the proposal payload. */
export type RunResult<P> =
  | { kind: 'proposal'; proposal: P }
  | { kind: 'clarify'; question: string }
  | { kind: 'error'; error: string }

const userMsg = (text: string): GleanMessage => ({ author: 'USER', fragments: [{ text }] })

/**
 * Generic Glean resolution loop shared by the leaf (#4) and aggregate (#5)
 * resolvers: build prompt → chat → extractJson → parse; on an error result, one
 * repair retry; never throws (Glean/transport failures become an error result).
 */
export async function resolveWithRepair<P>(
  opts: { buildPrompt: () => string; parse: (json: unknown) => RunResult<P> },
  chat: GleanChatFn,
  actAsEmail: string,
): Promise<RunResult<P>> {
  const basePrompt = opts.buildPrompt()
  const fromReply = (reply: GleanMessage[]): RunResult<P> => {
    const json = extractJson(reply)
    if (json === null) return { kind: 'error', error: 'no JSON found in Glean reply' }
    return opts.parse(json)
  }
  try {
    let result = fromReply(await chat([userMsg(basePrompt)], actAsEmail))
    if (result.kind === 'error') {
      const repair = userMsg(
        `Your previous reply was not valid JSON matching the schema (${result.error}). Return ONLY the single fenced JSON object, no prose.`,
      )
      result = fromReply(await chat([userMsg(basePrompt), repair], actAsEmail))
    }
    return result
  } catch (e) {
    return { kind: 'error', error: e instanceof Error ? e.message : 'Glean call failed' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/run.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/nl/run.ts lib/dashboard/nl/run.test.ts
git commit -m "feat(dashboard/nl): resolveWithRepair generic runner"
```

---

## Task 2: Aggregate types (`lib/dashboard/nl/aggregate-types.ts`)

**Files:**
- Create: `lib/dashboard/nl/aggregate-types.ts`
- Test: `lib/dashboard/nl/aggregate-types.test.ts`

**Interfaces:**
- Consumes: `BlockConfig` (`@/lib/dashboard/types`); `Candidate` (`./types`).
- Produces: `AggregateProposal`, `AggregateResolutionResult`, `AggregateResolveInput`.

- [ ] **Step 1: Write the type definitions**

```ts
// lib/dashboard/nl/aggregate-types.ts
import type { BlockConfig } from '@/lib/dashboard/types'
import type { Candidate } from './types'

type OperandAlternatives = { metric?: Candidate[]; account?: Candidate[] }

export interface AggregateProposal {
  config: BlockConfig // binding is an AggregateBinding; validated; id '__pending__'
  confidence: number  // 0..1 for the overall formula
  alternatives: { left?: OperandAlternatives; right?: OperandAlternatives }
}

export type AggregateResolutionResult =
  | { kind: 'proposal'; proposal: AggregateProposal }
  | { kind: 'clarify'; question: string }
  | { kind: 'error'; error: string }

export interface AggregateResolveInput { formula: string; actAsEmail: string }
```

- [ ] **Step 2: Write the test**

```ts
// lib/dashboard/nl/aggregate-types.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-types.test.ts
import { strict as assert } from 'node:assert'
import type { AggregateResolutionResult, AggregateResolveInput } from './aggregate-types'

const input: AggregateResolveInput = { formula: 'TW revenue / SM spend', actAsEmail: 'a@b.com' }
assert.equal(input.formula.length > 0, true)
const r: AggregateResolutionResult = { kind: 'clarify', question: 'restate?' }
assert.equal(r.kind, 'clarify')
console.log('ok')
```

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl/aggregate-types" || echo "aggregate-types ok"`
Expected: `aggregate-types ok`

- [ ] **Step 4: Run the test**

Run: `npx tsx lib/dashboard/nl/aggregate-types.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/nl/aggregate-types.ts lib/dashboard/nl/aggregate-types.test.ts
git commit -m "feat(dashboard/nl): aggregate resolver types"
```

---

## Task 3: Aggregate prompt (`lib/dashboard/nl/aggregate-prompt.ts`)

**Files:**
- Create: `lib/dashboard/nl/aggregate-prompt.ts`
- Test: `lib/dashboard/nl/aggregate-prompt.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildAggregatePrompt(formula: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/nl/aggregate-prompt.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-prompt.test.ts
import { strict as assert } from 'node:assert'
import { buildAggregatePrompt } from './aggregate-prompt'

const p = buildAggregatePrompt('blended ROAS = TripleWhale revenue / Supermetrics ad spend')
assert.ok(p.includes('blended ROAS = TripleWhale revenue / Supermetrics ad spend')) // embeds the formula
assert.ok(/json/i.test(p))            // strict JSON instruction
assert.ok(p.includes('aggregate'))    // aggregate binding
assert.ok(p.includes('"op"'))         // operator field
assert.ok(p.includes('"left"') && p.includes('"right"')) // two operands
assert.ok(p.includes('supermetrics') && p.includes('triplewhale')) // both leaf source shapes
assert.ok(p.includes('confidence') && p.includes('clarify'))
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/aggregate-prompt.test.ts`
Expected: FAIL with `Cannot find module './aggregate-prompt'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/dashboard/nl/aggregate-prompt.ts

const SCHEMA = `{
  "config": {
    "name": string,                         // human label, e.g. "Blended ROAS"
    "binding": {
      "source": "aggregate",
      "op": "+" | "-" | "*" | "/",
      "left":  <leaf>,
      "right": <leaf>
    },
    "format": "currency" | "percent" | "count" | "number",
    "range": null
  },
  "confidence": number,                       // 0..1 for the overall formula
  "alternatives": {
    "left"?:  { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
               "account"?: [{ "value": string, "label": string, "confidence"?: number }] },
    "right"?: { "metric"?: [{ "value": string, "label": string, "confidence"?: number }],
               "account"?: [{ "value": string, "label": string, "confidence"?: number }] }
  },
  "clarify"?: string                          // set ONLY if the formula is too vague to resolve
}
where <leaf> is either
  { "source": "supermetrics", "dsId": string, "metricField": string, "account": string }
  or { "source": "triplewhale", "metric": string }`

export function buildAggregatePrompt(formula: string): string {
  return `You are resolving a cross-source marketing formula into a structured aggregate dashboard block.

An aggregate combines exactly TWO metric operands with ONE binary operator (+, -, *, /). Each operand is a leaf metric from either Supermetrics or TripleWhale (they may be from different sources). Use your Supermetrics and TripleWhale tools to discover and VALIDATE each operand's exact metric/account. Rank alternative matches best-first per operand.

Formula: "${formula}"

Return EXACTLY ONE fenced JSON object matching this schema and NOTHING else (no prose before or after):
\`\`\`json
${SCHEMA}
\`\`\`

Rules:
- "left" and "right" are the two operands; "op" is the operator between them (e.g. revenue / spend → op "/").
- Pick the single best-guess metric/account for each operand; put other plausible matches in "alternatives.left" / "alternatives.right" (max 5 each, ranked).
- Set "confidence" (0..1) for the overall formula resolution.
- If the formula is too vague to identify two operands and an operator, set "clarify" to a single short narrowing question and omit a meaningful "config".
- "range" must be null (the block inherits the dashboard's time range).
- Use only metric fields and accounts your tools confirm exist. Do not invent identifiers.`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/aggregate-prompt.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/nl/aggregate-prompt.ts lib/dashboard/nl/aggregate-prompt.test.ts
git commit -m "feat(dashboard/nl): buildAggregatePrompt"
```

---

## Task 4: Aggregate parser (`lib/dashboard/nl/aggregate-parse.ts`)

**Files:**
- Create: `lib/dashboard/nl/aggregate-parse.ts`
- Modify: `lib/dashboard/nl/parse.ts` (export two existing helpers — no behavior change)
- Test: `lib/dashboard/nl/aggregate-parse.test.ts`

**Interfaces:**
- Consumes: `parseBlockConfig` (`@/lib/dashboard/persistence`); `MIN_CONFIDENCE`, `Candidate` (`./types`); `isObj`, `parseCandidates` (`./parse`, exported by this task); `AggregateProposal`, `AggregateResolutionResult` (`./aggregate-types`, Task 2).
- Produces: `parseAggregateProposal(json: unknown): AggregateResolutionResult`.

- [ ] **Step 1: Export the shared helpers from `lib/dashboard/nl/parse.ts`**

Change the two helper declarations (lines 6 and 10) to add `export` — nothing else changes:

```ts
export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseCandidates(v: unknown): Candidate[] | undefined {
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
```

- [ ] **Step 2: Verify #4's parse test still passes (no regression from the export change)**

Run: `npx tsx lib/dashboard/nl/parse.test.ts`
Expected: `ok`

- [ ] **Step 3: Write the failing test**

```ts
// lib/dashboard/nl/aggregate-parse.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-parse.test.ts
import { strict as assert } from 'node:assert'
import { parseAggregateProposal } from './aggregate-parse'

const tw = { source: 'triplewhale', metric: 'revenue' }
const sm = { source: 'supermetrics', dsId: 'AW', metricField: 'cost', account: 'act_1' }
const aggConfig = {
  name: 'Blended ROAS',
  binding: { source: 'aggregate', op: '/', left: tw, right: sm },
  format: 'number',
  range: null,
}

// valid cross-source aggregate
{
  const r = parseAggregateProposal({ config: aggConfig, confidence: 0.9, alternatives: {} })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.config.binding.source, 'aggregate')
    assert.equal(r.proposal.config.id, '__pending__')
  }
}

// explicit clarify wins
assert.equal(parseAggregateProposal({ clarify: 'Revenue ÷ what — spend or impressions?' }).kind, 'clarify')

// below threshold → clarify
assert.equal(parseAggregateProposal({ config: aggConfig, confidence: 0.3 }).kind, 'clarify')

// non-aggregate (single leaf) → error
assert.equal(parseAggregateProposal({ config: { name: 'x', binding: sm, format: 'currency', range: null }, confidence: 0.9 }).kind, 'error')

// invalid operand → error
{
  const bad = { ...aggConfig, binding: { source: 'aggregate', op: '/', left: { source: 'supermetrics', dsId: 'AW' }, right: sm } }
  assert.equal(parseAggregateProposal({ config: bad, confidence: 0.9 }).kind, 'error')
}

// bad op → error
{
  const bad = { ...aggConfig, binding: { source: 'aggregate', op: '%', left: tw, right: sm } }
  assert.equal(parseAggregateProposal({ config: bad, confidence: 0.9 }).kind, 'error')
}

// nested per-operand alternatives parsed
{
  const alts = {
    left: { metric: [{ value: 'rev_net', label: 'Net Revenue' }] },
    right: { account: [{ value: 'act_2', label: 'Brand Account' }] },
  }
  const r = parseAggregateProposal({ config: aggConfig, confidence: 0.9, alternatives: alts })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.alternatives.left?.metric?.[0].value, 'rev_net')
    assert.equal(r.proposal.alternatives.right?.account?.[0].value, 'act_2')
  }
}

// non-object → error
assert.equal(parseAggregateProposal(42).kind, 'error')
console.log('ok')
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/aggregate-parse.test.ts`
Expected: FAIL with `Cannot find module './aggregate-parse'`

- [ ] **Step 5: Write the implementation**

```ts
// lib/dashboard/nl/aggregate-parse.ts
import { parseBlockConfig } from '@/lib/dashboard/persistence'
import { MIN_CONFIDENCE, type Candidate } from './types'
import { isObj, parseCandidates } from './parse'
import type { AggregateProposal, AggregateResolutionResult } from './aggregate-types'

const PROPOSAL_PLACEHOLDER_ID = '__pending__'

type OperandAlternatives = { metric?: Candidate[]; account?: Candidate[] }

function parseOperandAlternatives(v: unknown): OperandAlternatives | undefined {
  if (!isObj(v)) return undefined
  const out: OperandAlternatives = {}
  const metric = parseCandidates(v.metric)
  const account = parseCandidates(v.account)
  if (metric && metric.length) out.metric = metric
  if (account && account.length) out.account = account
  return Object.keys(out).length > 0 ? out : undefined
}

export function parseAggregateProposal(json: unknown): AggregateResolutionResult {
  if (!isObj(json)) return { kind: 'error', error: 'proposal: expected object' }

  // explicit intent-ambiguity clarify wins
  if (typeof json.clarify === 'string' && json.clarify.trim().length > 0) {
    return { kind: 'clarify', question: json.clarify.trim() }
  }

  if (!isObj(json.config)) return { kind: 'error', error: 'proposal.config: expected object' }

  const candidate = { ...json.config, id: PROPOSAL_PLACEHOLDER_ID }
  const pb = parseBlockConfig(candidate, 'proposal.config')
  if (!pb.ok) return { kind: 'error', error: pb.error }
  if (pb.block.binding.source !== 'aggregate') {
    return { kind: 'error', error: 'proposal.config.binding: expected an aggregate formula with two operands' }
  }

  const confidence = typeof json.confidence === 'number' ? json.confidence : 0
  if (confidence < MIN_CONFIDENCE) {
    return { kind: 'clarify', question: 'I could not confidently resolve the formula. Can you restate it (e.g. "X divided by Y")?' }
  }

  const altsRaw = isObj(json.alternatives) ? json.alternatives : {}
  const alternatives: AggregateProposal['alternatives'] = {}
  const left = parseOperandAlternatives(altsRaw.left)
  const right = parseOperandAlternatives(altsRaw.right)
  if (left) alternatives.left = left
  if (right) alternatives.right = right

  return { kind: 'proposal', proposal: { config: pb.block, confidence, alternatives } }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/aggregate-parse.test.ts`
Expected: `ok`

- [ ] **Step 7: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl/aggregate-parse\|lib/dashboard/nl/parse" || echo "parse ok"`
Expected: `parse ok`

- [ ] **Step 8: Commit**

```bash
git add lib/dashboard/nl/aggregate-parse.ts lib/dashboard/nl/aggregate-parse.test.ts lib/dashboard/nl/parse.ts
git commit -m "feat(dashboard/nl): parseAggregateProposal (+ export shared parse helpers)"
```

---

## Task 5: Refactor #4 resolver onto the runner (`lib/dashboard/nl/resolve.ts`)

**Files:**
- Modify: `lib/dashboard/nl/resolve.ts`
- Test (re-run, unchanged): `lib/dashboard/nl/resolve.test.ts`

**Interfaces:**
- Consumes: `resolveWithRepair` (`./run`, Task 1); `buildResolutionPrompt` (`./prompt`), `parseProposal` (`./parse`), `realGleanChat` (`./glean-chat`); `BlockProposal`, `GleanChatFn`, `ResolutionResult`, `ResolveInput` (`./types`).
- Produces: `resolveBlockNL(input: ResolveInput, deps?: { chat?: GleanChatFn }): Promise<ResolutionResult>` (unchanged signature/behavior).

**Note:** behavior-preserving refactor — `resolveBlockNL`'s signature, return type, and observable behavior are identical; the inline loop is replaced by a `resolveWithRepair` call. The existing `resolve.test.ts` is the regression guard and must stay green. `RunResult<BlockProposal>` is structurally identical to `ResolutionResult`, so no type changes are needed.

- [ ] **Step 1: Replace the file contents**

```ts
// lib/dashboard/nl/resolve.ts
import { buildResolutionPrompt } from './prompt'
import { parseProposal } from './parse'
import { realGleanChat } from './glean-chat'
import { resolveWithRepair } from './run'
import type { BlockProposal, GleanChatFn, ResolutionResult, ResolveInput } from './types'

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
  return resolveWithRepair<BlockProposal>(
    { buildPrompt: () => buildResolutionPrompt(input.source, input.prompt), parse: parseProposal },
    chat,
    input.actAsEmail,
  )
}
```

- [ ] **Step 2: Run #4's resolver test to confirm no regression**

Run: `npx tsx lib/dashboard/nl/resolve.test.ts`
Expected: `ok`

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl/resolve" || echo "resolve ok"`
Expected: `resolve ok`

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard/nl/resolve.ts
git commit -m "refactor(dashboard/nl): resolveBlockNL uses shared resolveWithRepair"
```

---

## Task 6: Aggregate orchestrator (`lib/dashboard/nl/aggregate-resolve.ts`) — integration

**Files:**
- Create: `lib/dashboard/nl/aggregate-resolve.ts`
- Test: `lib/dashboard/nl/aggregate-resolve.test.ts`

**Interfaces:**
- Consumes: `resolveWithRepair` (`./run`, Task 1); `buildAggregatePrompt` (`./aggregate-prompt`, Task 3); `parseAggregateProposal` (`./aggregate-parse`, Task 4); `realGleanChat` (`./glean-chat`); `AggregateProposal`, `AggregateResolutionResult`, `AggregateResolveInput` (`./aggregate-types`, Task 2); `GleanChatFn` (`./types`).
- Produces: `resolveAggregateNL(input: AggregateResolveInput, deps?: { chat?: GleanChatFn }): Promise<AggregateResolutionResult>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/dashboard/nl/aggregate-resolve.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveAggregateNL } from './aggregate-resolve'
import type { GleanChatFn, GleanMessage } from './types'

const aiJson = (obj: unknown): GleanMessage[] => [
  { author: 'GLEAN_AI', fragments: [{ text: '```json\n' + JSON.stringify(obj) + '\n```' }] },
]
const tw = { source: 'triplewhale', metric: 'revenue' }
const sm = { source: 'supermetrics', dsId: 'AW', metricField: 'cost', account: 'act_1' }
const good = {
  config: { name: 'Blended ROAS', binding: { source: 'aggregate', op: '/', left: tw, right: sm }, format: 'number', range: null },
  confidence: 0.9,
  alternatives: {},
}
const input = { formula: 'TW revenue / SM spend', actAsEmail: 'a@b.com' }

async function run() {
  // proposal
  {
    const chat: GleanChatFn = async () => aiJson(good)
    const r = await resolveAggregateNL(input, { chat })
    assert.equal(r.kind, 'proposal')
    if (r.kind === 'proposal') assert.equal(r.proposal.config.binding.source, 'aggregate')
  }
  // clarify
  {
    const chat: GleanChatFn = async () => aiJson({ clarify: 'Revenue ÷ what?' })
    const r = await resolveAggregateNL(input, { chat })
    assert.equal(r.kind, 'clarify')
  }
  // network throw → error
  {
    const chat: GleanChatFn = async () => { throw new Error('boom') }
    const r = await resolveAggregateNL(input, { chat })
    assert.equal(r.kind, 'error')
  }
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/dashboard/nl/aggregate-resolve.test.ts`
Expected: FAIL with `Cannot find module './aggregate-resolve'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/dashboard/nl/aggregate-resolve.ts
import { resolveWithRepair } from './run'
import { buildAggregatePrompt } from './aggregate-prompt'
import { parseAggregateProposal } from './aggregate-parse'
import { realGleanChat } from './glean-chat'
import type { GleanChatFn } from './types'
import type { AggregateProposal, AggregateResolutionResult, AggregateResolveInput } from './aggregate-types'

/**
 * Resolve a free-form cross-source formula into a validated aggregate BlockConfig
 * proposal (two leaf operands + binary op) or a clarifying question. Never throws.
 */
export async function resolveAggregateNL(
  input: AggregateResolveInput,
  deps: { chat?: GleanChatFn } = {},
): Promise<AggregateResolutionResult> {
  const chat = deps.chat ?? realGleanChat
  return resolveWithRepair<AggregateProposal>(
    { buildPrompt: () => buildAggregatePrompt(input.formula), parse: parseAggregateProposal },
    chat,
    input.actAsEmail,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/dashboard/nl/aggregate-resolve.test.ts`
Expected: `ok`

- [ ] **Step 5: Full layer type-check + run the whole nl suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep "lib/dashboard/nl" || echo "no new type errors"
for f in lib/dashboard/nl/types.test.ts lib/dashboard/nl/prompt.test.ts lib/dashboard/nl/extract.test.ts lib/dashboard/nl/parse.test.ts lib/dashboard/nl/resolve.test.ts lib/dashboard/nl/run.test.ts lib/dashboard/nl/aggregate-types.test.ts lib/dashboard/nl/aggregate-prompt.test.ts lib/dashboard/nl/aggregate-parse.test.ts lib/dashboard/nl/aggregate-resolve.test.ts; do echo "== $f"; npx tsx "$f"; done
```
Expected: `no new type errors`, and each test prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/nl/aggregate-resolve.ts lib/dashboard/nl/aggregate-resolve.test.ts
git commit -m "feat(dashboard/nl): resolveAggregateNL orchestrator"
```

---

## Self-Review

**Spec coverage** (against `2026-06-18-dashboard-aggregate-nl-design.md`):
- §3 architecture (single Glean call, reuse extract/glean-chat, runner) → T1, T6. ✅
- §4 output contract (`AggregateProposal`, `AggregateResolutionResult`, `AggregateResolveInput`, nested per-operand alternatives) → T2. ✅
- §5 reliability: aggregate prompt-for-JSON → T3; validate via `parseBlockConfig` + require `source==='aggregate'` → T4; one repair retry + never-throws + confidence→clarify → T1 (runner) used by T6. ✅
- §6 DRY shared runner + refactor #4 `resolve.ts` → T1, T5; shared `isObj`/`parseCandidates` via exports → T4. ✅
- §7 testing (pure, fake Glean; runner tested generically; #4 resolve/parse re-run) → tests in T1–T6. ✅
- §8 files → matches File Structure. ✅
- §9 out-of-scope (UI, nesting, persistence, hybrid fallback) → none included. ✅

**Placeholder scan:** none. (`PROPOSAL_PLACEHOLDER_ID = '__pending__'` is a real sentinel.) ✅

**Type consistency:** `RunResult<P>` (T1) is structurally identical to `ResolutionResult` (#4) and `AggregateResolutionResult` (T2), so `resolveWithRepair<BlockProposal>` / `<AggregateProposal>` satisfy both resolvers' return types; `parseAggregateProposal`/`parseProposal` signatures match the runner's `parse` param; `isObj`/`parseCandidates` exported from `parse.ts` (T4) consumed by `aggregate-parse.ts` (T4); `buildAggregatePrompt`/`resolveAggregateNL` names match across tasks. ✅

**Out-of-band:** do not stage the unrelated uncommitted paid-search edits in any task.
