# AEO Outbound pillars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new report's Opportunities page shows the three pillars of the audit slide, each with one code-written line that links the report's domain-mix data to it; drafts made before keep their table.

**Architecture:** Code writes three pillar rows (`sentences.ts`), stored in the existing `opportunities` shape with a slots marker `opportunities_layout: 'pillars'`. Glean stops writing opportunities. Grounding, render, labels and `slotEntries` branch on the marker only, so table rows are untouched. One new data field, `ownMixWeight`, carries the Content share.

**Tech Stack:** TypeScript, zod 4, Vitest with jsdom and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-aeo-outbound-pillars-design.md` (decisions D2 to D4 in §7, minors in §9 and §10; review log and trial beside it, trial note `docs/findings/2026-10-21-aeo-outbound-pillars-trial.md`).

## Global Constraints

- Branch `feat/aeo-outbound-pillars` off `dev`. The PR targets `dev`, opens as a **draft with no reviewer**, and waits with the rest of round 3 for Thomas's word to go to Paul. Nothing merges without Thomas's "merge".
- `SENTENCES_VERSION` stays 2. No `PAGE_KEYS` change. No migration. No AIVx file, settings contract or settings database change.
- Pillar names, descriptions and title exactly as `PILLARS` / `PILLARS_TITLE` below; data-line wording exactly as Task 1.
- A table row (no marker) renders, grounds and labels exactly as today; `v1-compat.test.ts` passes unchanged.
- Writing: no em or en dashes; sentence case; first person.
- Git: `git status --porcelain` before every commit; named files only; push after every commit. Bound long commands with `perl -e 'alarm N; exec @ARGV' --`.

## Review Focus

1. **A draft made before this ships** (no marker) must render, ground and label exactly as today. Pinned in Tasks 3 and 4 (table-row tests) and by `v1-compat.test.ts`.
2. **An own subdomain Peec files under another type** must count in the Content line (decision D3 (a)), so the page never denies a site the first findings box shows. Pinned in Task 1.
3. **A brand whose name looks like a domain** ("Seniorcare.com") must not raise a domain flag on its own pillar line. Pinned in Task 3.
4. **Glean still sending a malformed `opportunities`** must not fail or retry generation. Pinned in Task 2 (contract).
5. **Two pillars whose shares differ but round alike** must not read the same. Pinned in Task 1.

---

### Task 1: Pillar data and sentences (spec P3, D3 (a), §9 m1 to m4)

**Files:**
- Modify: `lib/aeo-outbound/config.ts` (after `SENTENCES_VERSION`, lines 33-36), `lib/aeo-outbound/metrics.ts` (interface near `:45-70`, build near `:240`, return near `:285`), `lib/aeo-outbound/contracts.ts:164`, `lib/aeo-outbound/sentences.ts:1-6`, `:236-238`
- Test: `lib/aeo-outbound/sentences.test.ts`, `lib/aeo-outbound/config.test.ts`, `lib/aeo-outbound/contracts.test.ts`

**Interfaces:**
- Produces: `PILLARS`, `PILLARS_TITLE` (config); `SnapshotData.ownMixWeight?: number`; `DataSentences.opportunities: Opportunity[]` (`workstream` name, `opportunity` description, `signal` data line). Tasks 2 to 4 read these.

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/config.test.ts`: import becomes `import { DECISIONS, PILLARS, PILLARS_TITLE, SENTENCES_VERSION } from './config'`; append:

```ts
test('the three pillars (Ryan, round 3): the slide names in its order, descriptions verbatim, the title in sentence case', () => {
  expect(PILLARS.map((p) => p.name)).toEqual(['Earned & Affiliate Media', 'Content and Creative', 'Technical Optimizations'])
  expect(PILLARS.map((p) => p.description)).toEqual([
    'Quality citations from trusted media publications are a key factor in determining the credibility and authority of information.',
    'Publish high quality content that mimics natural language, rather than keyword stuffed blogs, to better influence how LLMs answer the questions buyers ask.',
    'Technical data structuring ensures your brand authority is optimized for AI crawlability and visibility across LLMs.',
  ])
  expect(PILLARS_TITLE).toBe('The pillars of AI search')
  for (const p of PILLARS) expect(`${p.name} ${p.description}`).not.toMatch(/[0-9–—]/)
  expect(SENTENCES_VERSION).toBe(2)
})
```

`lib/aeo-outbound/contracts.test.ts`, append:

```ts
test('stored data: ownMixWeight is absent or a number of at least 0 (pillars)', () => {
  for (const v of [undefined, 0, 12.5]) expect(checkContract('stored.data', STORED_DATA, { ...JSON.parse(JSON.stringify(V1_DATA)), ...(v === undefined ? {} : { ownMixWeight: v }) }, 'enforce')).toEqual({ ok: true })
  for (const v of [-1, '3', null]) expect(checkContract('stored.data', STORED_DATA, { ...JSON.parse(JSON.stringify(V1_DATA)), ownMixWeight: v }, 'enforce').ok).toBe(false)
})
```

`lib/aeo-outbound/sentences.test.ts`: add `import { PILLARS } from './config'` after line 5, and append:

```ts
// Round 3 (Ryan, 2026-10-21): the pillar rows. Domains by [domain, classification, weight].
const dom = ([domain, classification, w]: [string, string, number]) => ({ domain, classification, retrieved_chat_count: 1, retrieval_count: w, usage_rate: w, mentioned_brands: [] })
const pillarsOf = (rows: [string, string, number][], extra: Partial<PeecPull> = {}) =>
  sent({ ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]], extra), domains: rows.map(dom) }).opportunities
const soloPillars = (rows: [string, string, number][]) => sent({ ...brandPull([['own', 'Own', 0.2, 1]]), domains: rows.map(dom) }).opportunities

test('pillars: the slide names and descriptions in order, and one data line each from the domain mix', () => {
  const p = pillarsOf([['ed.example', 'EDITORIAL', 19], ['own.example', 'OWN', 4], ['rival.example', 'COMPETITOR', 17], ['corp.example', 'CORPORATE', 60]])
  expect(p.map((o) => o.workstream)).toEqual(PILLARS.map((x) => x.name))
  expect(p.map((o) => o.opportunity)).toEqual(PILLARS.map((x) => x.description))
  expect(p.map((o) => o.signal)).toEqual([
    'Editorial sites make up 19% of the domain mix in this window.',
    "Own's own site makes up 4.0% of the domain mix in this window.",
    "Competitors' own websites make up 17% of the domain mix in this window.",
  ])
})

test('pillars D3 (a): an own subdomain Peec files under another type counts in the Content line, as the own-site bullet counts it', () => {
  expect(pillarsOf([['own.example', 'OWN', 4], ['blog.own.example', 'CORPORATE', 6], ['corp.example', 'CORPORATE', 90]])[1].signal).toBe("Own's own site makes up 10% of the domain mix in this window.")
  expect(pillarsOf([['blog.own.example', 'CORPORATE', 5], ['corp.example', 'CORPORATE', 95]])[1].signal).toBe("Own's own site makes up 5.0% of the domain mix in this window.")
  const d = buildSnapshotData({ ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: [['own.example', 'OWN', 4], ['blog.own.example', 'CORPORATE', 6], ['corp.example', 'CORPORATE', 90]].map((r) => dom(r as [string, string, number])) }, AT, DEFAULTS, USED)
  expect(d.ownMixWeight).toBe(10)
})

test('pillars: absent slices, a share under 0.1%, an empty mix', () => {
  expect(pillarsOf([['corp.example', 'CORPORATE', 100]]).map((o) => o.signal)).toEqual([
    "Editorial sites don't appear in the domain mix for this window.",
    "Own's own site doesn't appear in the domain mix for this window.",
    "Competitors' own websites don't appear in the domain mix for this window.",
  ])
  expect(pillarsOf([['ed.example', 'EDITORIAL', 0.04], ['corp.example', 'CORPORATE', 99.96]])[0].signal).toBe('Editorial sites make up under 0.1% of the domain mix in this window.')
  expect(pillarsOf([['corp.example', 'CORPORATE', 0]]).map((o) => o.signal)).toEqual(Array(3).fill('Peec reported no source types for this window.'))
})

test('pillars: no competitors tracked, a Competitor slice anyway, and an empty mix wins (spec §9 m3)', () => {
  expect(soloPillars([['corp.example', 'CORPORATE', 100]])[2].signal).toBe('No competitors are tracked in this Peec project.')
  expect(soloPillars([['rival.example', 'COMPETITOR', 20], ['corp.example', 'CORPORATE', 80]])[2].signal).toBe("Competitors' own websites make up 20% of the domain mix in this window.")
  expect(soloPillars([['corp.example', 'CORPORATE', 0]])[2].signal).toBe('Peec reported no source types for this window.')
})

test('pillars: two distinct own domains read "sites"; a repeated or empty entry does not (spec §10 r2-m5)', () => {
  const own = (domains: string[]) => ({ ownBrand: { id: 'own', name: 'Own', is_own: true, domains } })
  expect(pillarsOf([['own.example', 'OWN', 10], ['corp.example', 'CORPORATE', 90]], own(['own.example', 'own2.example']))[1].signal).toBe("Own's own sites make up 10% of the domain mix in this window.")
  expect(pillarsOf([['corp.example', 'CORPORATE', 100]], own(['own.example', 'own2.example']))[1].signal).toBe("Own's own sites don't appear in the domain mix for this window.")
  expect(pillarsOf([['own.example', 'OWN', 10], ['corp.example', 'CORPORATE', 90]], own(['own.example', 'own.example', '']))[1].signal).toBe("Own's own site makes up 10% of the domain mix in this window.")
})

test('pillars: shares that differ but would round alike keep one decimal (spec §9 m1)', () => {
  const p = pillarsOf([['ed.example', 'EDITORIAL', 17.4], ['rival.example', 'COMPETITOR', 16.6], ['corp.example', 'CORPORATE', 66]])
  expect([p[0].signal, p[2].signal]).toEqual(['Editorial sites make up 17.4% of the domain mix in this window.', "Competitors' own websites make up 16.6% of the domain mix in this window."])
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/config.test.ts lib/aeo-outbound/contracts.test.ts`
Expected: FAIL. `PILLARS` is not exported; `opportunities` is undefined on the sentences; the contract accepts `-1`.

- [ ] **Step 3: Write the implementation**

`lib/aeo-outbound/config.ts`, the comment above `SENTENCES_VERSION` (lines 33-35) gains the pillar lines (spec §10 r2-m4); replace `rounding changes, so` with `rounding changes (the pillar data lines included), so`. After line 36 (`export const SENTENCES_VERSION = 2`) add:

```ts
/** Round 3 (Ryan, 2026-10-21): the three pillars of the Avenue Z audit slide, in its order, shown on the Opportunities
 *  page of every new report with one data line each (sentences.ts pillars). The Content description completes the
 *  slide's sentence, which is cut off after "LLMs for". */
export const PILLARS = [
  { name: 'Earned & Affiliate Media', description: 'Quality citations from trusted media publications are a key factor in determining the credibility and authority of information.' },
  { name: 'Content and Creative', description: 'Publish high quality content that mimics natural language, rather than keyword stuffed blogs, to better influence how LLMs answer the questions buyers ask.' },
  { name: 'Technical Optimizations', description: 'Technical data structuring ensures your brand authority is optimized for AI crawlability and visibility across LLMs.' },
] as const
/** The Opportunities page title on a new report: the slide's title, in sentence case. */
export const PILLARS_TITLE = 'The pillars of AI search'
```

`lib/aeo-outbound/metrics.ts`:
- In `interface SnapshotData`, after the `ownRetrievedPct` line, add:

```ts
  /** Round 3 (pillars D3 (a)): the source-mix weight of the brand's own rows (OWN class or own-domain match, weight above
   *  0), the Content pillar's share. Absent on older rows, which are never pillar rows. */
  ownMixWeight?: number
```

- Extend the `sentences?: number` comment (`metrics.ts:66`): "context, findings and methodology" becomes "context, findings, methodology and pillar lines".
- After the weights loop (`metrics.ts:240`, the closing `}` of `for (const r of pull.domains)`), add:

```ts
  // Round 3 (pillars spec D3 (a)): the Content pillar counts the brand's own rows the way the own-site bullet does.
  const ownMixWeight = ownRows.reduce((s, r) => { const w = r[decisions.sourceMixWeight] ?? 0; return w > 0 ? s + w : s }, 0)
```

- In the returned object, after `ownRetrievedPct,` add `ownMixWeight,`.

`lib/aeo-outbound/contracts.ts`, in `STORED_DATA` after the `sourceMixWeight` line (164):

```ts
  // Round 3 (pillars): the own rows' source-mix weight; absent on older rows.
  ownMixWeight: z.number().min(0).optional(),
```

`lib/aeo-outbound/sentences.ts`:
- Lines 3-6 become:

```ts
import { PILLARS } from './config'
import { pyRound, settingsUsedOf, tenths, type SnapshotData } from './metrics'
import type { Bullet, Opportunity } from './slots'

export interface DataSentences { context: string; competitive_bullets: Bullet[]; sources_bullets: Bullet[]; methodology: string; opportunities: Opportunity[] }
```

- In `dataSentences`, before `return { context: context(), ...` (line 237), add:

```ts
  /** Round 3 (Ryan, 2026-10-21; pillars spec P3): one data line per pillar from the domain mix. */
  function pillars(): Opportunity[] {
    const none = 'Peec reported no source types for this window.'
    const lines = d.sourceMix.length ? pillarLines() : [none, none, none]
    return PILLARS.map((p, i) => ({ workstream: p.name, opportunity: p.description, signal: lines[i] }))
  }
  function pillarLines(): string[] {
    const mix = d.sourceMix
    const total = mix.reduce((s, m) => s + m.weight, 0)
    const editorial = mix.find((m) => m.label === 'Editorial')
    const competitor = mix.find((m) => m.label === 'Competitor')
    const ownWeight = d.ownMixWeight ?? 0
    const own = ownWeight > 0 ? { weight: ownWeight, pct: total ? pyRound((ownWeight / total) * 100, 1) : 0 } : undefined
    // One rounding pass over the shares shown, so two pillars never read alike when their values differ (spec §9 m1).
    const shown = [editorial, own, competitor].filter((x): x is { weight: number; pct: number } => !!x)
    const texts = sharePctAll(shown.map((x) => ({ pct: x.pct, exact: total ? (x.weight / total) * 100 : 0 })))
    const share = (x: { weight: number; pct: number }) => (x.pct === 0 ? 'under 0.1%' : texts[shown.indexOf(x)])
    const tail = 'of the domain mix in this window.'
    const missing = 'in the domain mix for this window.'
    const plural = new Set(d.ownDomains.filter(Boolean)).size > 1
    const ownSubject = `${brand}'s own ${plural ? 'sites' : 'site'}`
    return [
      editorial ? `Editorial sites make up ${share(editorial)} ${tail}` : `Editorial sites don't appear ${missing}`,
      own ? `${ownSubject} ${plural ? 'make' : 'makes'} up ${share(own)} ${tail}` : `${ownSubject} ${plural ? "don't" : "doesn't"} appear ${missing}`,
      competitor ? `Competitors' own websites make up ${share(competitor)} ${tail}` : solo ? 'No competitors are tracked in this Peec project.' : `Competitors' own websites don't appear ${missing}`,
    ]
  }
```

- The return becomes:

```ts
  return { context: context(), competitive_bullets: firstBox(), sources_bullets: secondBox(), methodology: methodology(), opportunities: pillars() }
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/config.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/metrics.test.ts lib/aeo-outbound/v1-compat.test.ts`
Expected: PASS. A test that compares a whole built `SnapshotData` with a literal now needs `ownMixWeight`: ledger a ruling for each such line.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/config.ts lib/aeo-outbound/metrics.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/sentences.ts lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/config.test.ts lib/aeo-outbound/contracts.test.ts
git commit -m "Pillars: the three slide pillars with one data line each, from the domain mix (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 2: Generation writes the pillars; Glean stops writing opportunities (spec P1, P2, P4, P6)

**Files:**
- Modify: `lib/aeo-outbound/slots.ts` (`Slots` `:21-37`, `pageDefaults` `:76-78`, `slotEntries` `:135-143`, `FixedSlots` `:150-158`, `validateGeneratedSlots` `:181-187`), `lib/aeo-outbound/contracts.ts` (`GLEAN_SLOTS` `:105-112`, `STORED_SLOTS` `:168-176`), `lib/aeo-outbound/prompt.ts:66`, `:84`, `lib/aeo-outbound/generate.ts:29-35`, `:100-101`
- Test: `lib/aeo-outbound/slots.test.ts`, `lib/aeo-outbound/contracts.test.ts`, `lib/aeo-outbound/prompt.test.ts`, `lib/aeo-outbound/generate.test.ts`

**Interfaces:**
- Consumes: `DataSentences.opportunities`, `PILLARS_TITLE` (Task 1).
- Produces: `Slots.opportunities_layout?: 'pillars'`; `FixedSlots.opportunities?: Opportunity[]`. Tasks 3 to 5 branch on the marker.

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/slots.test.ts`:
- Line 140: the expected object gains `opps_title: 'The pillars of AI search'` (after `series: 'AEO Lens Report'`), and the test name becomes `'a new row takes the section titles and wordmark from settings, the pillar title, and every other word from v1.0'`.
- Append:

```ts
test('pillars: fixed opportunities replace the reply\'s with no count check (Ryan, round 3)', () => {
  const pillars = [0, 1, 2].map((i) => ({ signal: `line ${i}`, opportunity: `desc ${i}`, workstream: `name ${i}` }))
  const fixed = { category: 'c', market: 'm', next_step: 'N', opportunities: pillars }
  const r = validateGeneratedSlots({ headline: 'H', summary: 'S', why: 'W' }, fixed)
  expect(r.ok && r.slots.opportunities).toEqual(pillars)
  const r2 = validateGeneratedSlots({ ...MODEL, opportunities: MODEL.opportunities.slice(0, 2) }, fixed)
  expect(r2.ok && r2.slots.opportunities).toEqual(pillars)
})

test('a pillar row leaves the table words out of slotEntries; a table row keeps them', () => {
  const words = ['page.opps_col_1', 'page.opps_col_2', 'page.opps_col_3', 'page.opps_takeaway']
  const table = slotEntries(S).map(([p]) => p)
  const pillar = slotEntries({ ...S, opportunities_layout: 'pillars' }).map(([p]) => p)
  for (const w of words) { expect(table).toContain(w); expect(pillar).not.toContain(w) }
  expect(table.filter((p) => !pillar.includes(p)).sort()).toEqual([...words].sort())
})
```

`lib/aeo-outbound/contracts.test.ts`:
- The test at line 159: its name becomes `'the Glean reply contract: every copy key a non-empty string, next_step optional, opportunities ignored'`, and line 167 becomes `expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, opportunities: reply.opportunities.slice(0, 2) }, 'enforce').ok).toBe(true)`.
- Line 245: the loop list becomes `['headline', 'summary', 'why'] as const`.
- Append:

```ts
test('the Glean reply contract ignores opportunities of any shape, or none (pillars P4)', () => {
  const reply = { headline: 'H', summary: 'S', why: 'W' }
  for (const opportunities of [undefined, [], [{ signal: 5 }, null], 'x']) expect(checkContract('glean.slots', GLEAN_SLOTS, { ...reply, ...(opportunities === undefined ? {} : { opportunities }) }, 'enforce').ok).toBe(true)
})

test('stored slots: opportunities_layout is absent or pillars; anything else breaks the contract (pillars P1)', () => {
  for (const v of [undefined, 'pillars']) expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, ...(v ? { opportunities_layout: v } : {}) }, 'enforce')).toEqual({ ok: true })
  for (const v of ['table', true, null]) expect(checkContract('stored.slots', STORED_SLOTS, { ...V1_SLOTS, opportunities_layout: v }, 'enforce').ok).toBe(false)
})
```

`lib/aeo-outbound/prompt.test.ts`:
- Line 52 becomes `expect(p).not.toContain('Peec recommends')`.
- Line 59 becomes `for (const f of ['- headline:', '- summary:', '- why:']) expect(p).toContain(f)` and a new next line `expect(p).not.toContain('- opportunities:')`.
- Lines 131-132 become `expect(p).not.toContain('Peec recommended actions list')`.

`lib/aeo-outbound/generate.test.ts`:
- Line 374: remove `'opportunities.0.signal'` from the false list; line 372's true list gains `'opportunities.0.signal', 'opportunities.2.workstream'`.
- Append:

```ts
test('pillars (Ryan, round 3): a generated row carries the marker, the code-written pillars and the pillar title, whatever Glean sends', async () => {
  const r = await generateSnapshot('or_a', deps(vi.fn(async () => reply(GOOD))))
  if (!r.ok) throw new Error(r.error)
  expect(r.slots.opportunities_layout).toBe('pillars')
  expect(r.slots.opportunities).toEqual(dataSentences(r.data).opportunities)
  expect(r.slots.opportunities.map((o) => o.workstream)).toEqual(['Earned & Affiliate Media', 'Content and Creative', 'Technical Optimizations'])
  expect(r.slots.page.opps_title).toBe('The pillars of AI search')
  const { opportunities: _o, ...noOpps } = JSON.parse(GOOD)
  const r2 = await generateSnapshot('or_a', deps(vi.fn(async () => reply(JSON.stringify(noOpps)))))
  expect(r2.ok).toBe(true)
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/slots.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/prompt.test.ts lib/aeo-outbound/generate.test.ts`
Expected: FAIL. Fixed opportunities are ignored, the reply contract still requires three, the prompt still asks for opportunities, generation sets no marker.

- [ ] **Step 3: Write the implementation**

`lib/aeo-outbound/slots.ts`:
- Import line 5 becomes `import { NEEDS_VALIDATION, PAGE_WORDS_V1, PILLARS_TITLE } from './config'`.
- In `Slots`, after `page?: Partial<PageWords>`:

```ts
  /** Round 3 (Ryan, 2026-10-21): every report generated after the pillars change; absent reads today's table. */
  opportunities_layout?: 'pillars'
```

- `pageDefaults` comment and body (lines 75-78) become:

```ts
/** The page words a new row is created with: v1.0's, with the section titles, wordmark and report name from settings
 *  (v1.1 §3) and the pillar title (round 3). */
export function pageDefaults(s: { sectionTitles: readonly string[]; sidebarWordmark: string; series: string }): PageWords {
  return { ...V1_WORDS, section_1_title: s.sectionTitles[0], section_2_title: s.sectionTitles[1], sidebar_wordmark: s.sidebarWordmark, series: s.series, opps_title: PILLARS_TITLE }
}
```

- In `slotEntries`, the page-words line (`for (const k of PAGE_KEYS) out.push(...)`) becomes:

```ts
  // A pillar row shows no table, so its column words and footnote are not on the page (round 3).
  const unseen: readonly string[] = s.opportunities_layout === 'pillars' ? ['opps_col_1', 'opps_col_2', 'opps_col_3', 'opps_takeaway'] : []
  for (const k of PAGE_KEYS) if (!unseen.includes(k)) out.push([`page.${k}`, s.page[k]])
```

- `FixedSlots` comment gains "and, since round 3, the pillar rows"; add the field `opportunities?: Opportunity[]` after `sources_bullets?: Bullet[]`.
- In `validateGeneratedSlots`, the `const opps = ...` statement (lines 181-187) becomes:

```ts
  // Round 3: code writes the pillar rows; a reply's opportunities are then ignored, as its boxes are.
  const opps = fixed.opportunities
    ? fixed.opportunities.map((x, i) => ({
        signal: text(`opportunities.${i}.signal`, x.signal),
        opportunity: text(`opportunities.${i}.opportunity`, x.opportunity),
        workstream: text(`opportunities.${i}.workstream`, x.workstream),
      }))
    : Array.isArray(o.opportunities) && o.opportunities.length === 3
      ? o.opportunities.map((x, i) => ({
          signal: text(`opportunities.${i}.signal`, (x as Opportunity)?.signal),
          opportunity: text(`opportunities.${i}.opportunity`, (x as Opportunity)?.opportunity),
          workstream: text(`opportunities.${i}.workstream`, (x as Opportunity)?.workstream),
        }))
      : (errors.push('opportunities: needs exactly 3'), [])
```

`lib/aeo-outbound/contracts.ts`:
- `GLEAN_SLOTS` (lines 105-112) becomes:

```ts
/** The Glean reply's shape (spec §6; v1.1 §19.2: code writes the context, both boxes and the methodology; round 3: and
 *  the pillar rows, so any of those keys Glean still sends are ignored, whatever their shape). validateGeneratedSlots
 *  still cleans and length-checks every value afterwards. */
export const GLEAN_SLOTS = z.looseObject({
  headline: copyText, summary: copyText,
  why: copyText,
  // validateGeneratedSlots owns next_step and enforces it only when no fixed sentence is set.
  next_step: z.unknown().optional(),
})
```

- In `STORED_SLOTS`, after the `page:` line:

```ts
  // Round 3 (Ryan, 2026-10-21): the pillar layout marker; absent reads today's table.
  opportunities_layout: z.literal('pillars').optional(),
```

`lib/aeo-outbound/prompt.ts`: delete line 66 (`const peecRows = used.peecOpportunityRows`) and line 84 (the `- opportunities:` line with its Peec-actions clause).

`lib/aeo-outbound/generate.ts`:
- `codeSetPath` comment (lines 29-31) gains "the pillar rows (round 3)," after "the data sentences (spec v1.1 §19.2),", and its first line becomes `if (/^(page|kpis)\./.test(path) || /^opportunities\.\d\./.test(path) || isCodeSentencePath(path)) return true`.
- Lines 100-101 become:

```ts
      // v1.1 §3: the row is created with every key: brand, window label and KPIs from its data, words from settings.
      // Round 3: every new row shows the pillars.
      const full: FullSlots = { ...withDefaults(checked.slots, data), page: pageDefaults(settings), opportunities_layout: 'pillars' }
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/slots.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/prompt.test.ts lib/aeo-outbound/generate.test.ts lib/aeo-outbound/v1-compat.test.ts 'app/api/aeo-outbound/generate/route.test.ts'`
Expected: PASS. Ledger a ruling for any other existing test whose fixture now meets the new prompt or marker.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/slots.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/prompt.ts lib/aeo-outbound/generate.ts lib/aeo-outbound/slots.test.ts lib/aeo-outbound/contracts.test.ts lib/aeo-outbound/prompt.test.ts lib/aeo-outbound/generate.test.ts
git commit -m "Generation writes the pillar rows and the pillar title; Glean no longer writes opportunities (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 3: Grounding keyed on the marker (spec P7, §10 r2-m1)

**Files:**
- Modify: `lib/aeo-outbound/grounding.ts:151-163`, `:154`, `:170-180`, `:214`, `:216`, `:245`
- Test: `lib/aeo-outbound/grounding.test.ts`

**Interfaces:**
- Consumes: the marker (Task 2) and `dataSentences(d).opportunities` (Task 1).

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/grounding.test.ts`, append:

```ts
// Round 3 (Ryan, 2026-10-21): a pillar row is the opinion fields plus the code-written pillars and the marker.
const pillarSlots = (d: SnapshotData, over: Partial<Slots> = {}): Slots => ({ ...slotsFor(d), opportunities: dataSentences(d).opportunities, opportunities_layout: 'pillars', ...over })
const pillarFlags = (d: SnapshotData, over: Partial<Slots> = {}) => groundingFlags(pillarSlots(d, over), d, dataBlock(d))

test('pillar rows: fresh lines carry no flags; an edited number is checked against its own sentence; no Peec-recommends check', () => {
  const d = newRow()
  expect(pillarFlags(d)).toEqual([])
  const lines = dataSentences(d).opportunities
  const edited = lines.map((o, i) => (i === 0 ? { ...o, signal: o.signal.replace(/\d+(?:\.\d)?%/, '55%') } : o))
  expect(edited[0].signal).not.toBe(lines[0].signal)
  expect(pillarFlags(d, { opportunities: edited })).toEqual([{ kind: 'number_not_in_data', path: 'opportunities.0.signal', text: '"55%" does not match Peec\'s number in this sentence' }])
  const recommends = lines.map((o, i) => (i === 2 ? { ...o, signal: 'Peec recommends unblocking AI crawlers.' } : o))
  expect(pillarFlags(d, { opportunities: recommends }).some((n) => n.kind === 'peec_recommends')).toBe(false)
})

test('pillar rows: a brand named like a domain raises no domain flag on its own pillar line', () => {
  const own = LIVE_SHAPE_PULL.ownBrand
  const n = 'Seniorcare.com'
  const pull: PeecPull = {
    ...LIVE_SHAPE_PULL,
    ownBrand: { ...own, name: n },
    roster: LIVE_SHAPE_PULL.roster.map((b) => (b.id === own.id ? { ...b, name: n } : b)),
    brands: LIVE_SHAPE_PULL.brands.map((b) => (b.brand.id === own.id ? { ...b, brand: { ...b.brand, name: n } } : b)),
  }
  const d = newRow(pull)
  expect(pillarFlags(d).filter((f) => f.path?.startsWith('opportunities.'))).toEqual([])
})

test('a table row is checked as before: its opportunities are Glean\'s', () => {
  const d = newRow()
  const opps = [0, 1, 2].map(() => ({ signal: 'Grew 40%', opportunity: 'Explore it', workstream: 'Content' }))
  expect(flagsFor(d, { opportunities: opps }).some((n) => n.kind === 'unchecked_number' && n.path === 'opportunities.0.signal')).toBe(true)
})
```

Add `dataSentences` to the existing `import { dataSentences } from './sentences'` (line 6, already imported).

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/grounding.test.ts`
Expected: FAIL. The pillar data lines' percents are flagged `unchecked_number` (Glean-written today); the table-row test passes already (a pin).

- [ ] **Step 3: Write the implementation**

`lib/aeo-outbound/grounding.ts`:
- After `const sameVersion = d.sentences === SENTENCES_VERSION` (line 151) add:

```ts
  // Round 3 (pillars spec P7): on a pillar row the data line is a code sentence and no opportunity field is Glean's.
  // Table rows are checked exactly as before.
  const pillarRow = full.opportunities_layout === 'pillars'
  const pillarLine = (path: string): boolean => pillarRow && /^opportunities\.\d\.signal$/.test(path)
```

- In the `sentenceText` line (154), the array gains the pillar lines on a pillar row: `[s.context, s.methodology, ...[...s.competitive_bullets, ...s.sources_bullets].flatMap((b) => [b.lead, b.text]), ...(pillarRow ? s.opportunities.map((o) => o.signal) : [])].join(' | ')`.
- `gleanWrote` first line (after its opening brace, line 159): `if (pillarRow && path.startsWith('opportunities.')) return false`.
- In `peecSentence`, after `if (path === 'methodology') return sentences.methodology` add:

```ts
    const line = pillarLine(path) ? /^opportunities\.(\d)\.signal$/.exec(path) : null
    if (line) return sentences.opportunities[Number(line[1])]?.signal
```

- Line 214: `sentencesRow && isCodeSentencePath(path)` becomes `sentencesRow && (isCodeSentencePath(path) || pillarLine(path))`.
- Line 216: `sameVersion && isCodeSentencePath(path)` becomes `sameVersion && (isCodeSentencePath(path) || pillarLine(path))`.
- Line 245: `if (sentencesRow && /^opportunities` becomes `if (sentencesRow && !pillarRow && /^opportunities`.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/grounding.test.ts lib/aeo-outbound/v1-compat.test.ts lib/aeo-outbound/generate.test.ts 'app/api/aeo-outbound/reports/[id]/slots/route.test.ts'`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/grounding.ts lib/aeo-outbound/grounding.test.ts
git commit -m "Grounding: pillar data lines are code sentences; table rows checked as before (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 4: Render the pillar cards (spec P5)

**Files:**
- Modify: `lib/aeo-outbound/render.ts` (`PAGE_CSS` after line 111 and after line 133; the section body lines 290-296)
- Test: `lib/aeo-outbound/render.test.ts`

**Interfaces:**
- Consumes: the marker (Task 2).

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/render.test.ts`:
- After `METHOD_RULES` (line 390) add:

```ts
/** Round 3 (Ryan, 2026-10-21): the pillar cards, one column by default, after the Methodology rules. */
const PILLAR_RULES = [
  '.aeo-pillars{display:grid;grid-template-columns:1fr;gap:12px;margin-top:20px}',
  '.aeo-pillar{display:flex;flex-direction:column;padding:24px}',
  '.aeo-pillar-desc{font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6);margin:10px 0 18px}',
  '.aeo-pillar-line{margin:auto 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:16px;line-height:1.5;font-weight:600;color:#fff}',
]
```

- `DESKTOP_RULES` gains a last entry: `'#opportunities .aeo-pillars{grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}',`.
- Line 413: the expected list ends `...METHOD_RULES, ...PILLAR_RULES])`.
- Line 484: `expect(out.slice(-3)).toEqual(METHOD_RULES)` becomes `expect(out.slice(-3 - PILLAR_RULES.length, -PILLAR_RULES.length)).toEqual(METHOD_RULES)`.
- Append:

```ts
const PILLAR_SLOTS: Slots = { ...SLOTS, opportunities_layout: 'pillars', opportunities: [0, 1, 2].map((i) => ({ workstream: `Pillar ${i}`, opportunity: `About ${i}`, signal: `Line ${i}` })) }
test('pillar layout (Ryan, round 3): three cards in order, name, description and line as slots, no table or footnote, every mode', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const doc = parse(renderSnapshotHtml(DATA, PILLAR_SLOTS, mode, 'x'))
    const cards = [...doc.querySelectorAll('#opportunities .aeo-pillars > .cluster-card.aeo-pillar')]
    expect(cards.map((c) => [c.querySelector('.cluster-name')!.textContent, c.querySelector('.aeo-pillar-desc')!.textContent, c.querySelector('.aeo-pillar-line')!.textContent]), mode).toEqual([0, 1, 2].map((i) => [`Pillar ${i}`, `About ${i}`, `Line ${i}`]))
    expect(doc.querySelector('#opportunities table'), mode).toBeNull()
    expect(doc.querySelector('#opportunities .chart-takeaway'), mode).toBeNull()
    expect(doc.querySelector('#opportunities h2.section-title'), mode).not.toBeNull()
  }
  const draft = parse(renderSnapshotHtml(DATA, PILLAR_SLOTS, 'draft', 'x'))
  expect([...draft.querySelectorAll('#opportunities [data-slot]')].map((e) => e.getAttribute('data-slot'))).toEqual(['page.opps_label', 'page.opps_title', ...[0, 1, 2].flatMap((i) => [`opportunities.${i}.workstream`, `opportunities.${i}.opportunity`, `opportunities.${i}.signal`])])
  const paths = [...draft.querySelectorAll('[data-slot]')].map((e) => e.getAttribute('data-slot'))
  expect(new Set(paths)).toEqual(new Set(slotEntries(withDefaults(PILLAR_SLOTS, DATA)).map(([p]) => p).filter((p) => p !== 'page.sidebar_powered')))
})

test('pillar rules: verbatim after the Methodology rules, the 3-column rule in the desktop block, each once per mode', () => {
  for (const mode of ['draft', 'preview', 'final'] as const) {
    const h = renderSnapshotHtml(DATA, SLOTS, mode, 'x')
    for (const r of PILLAR_RULES) expect(h.split(r).length - 1, `${mode} ${r.slice(0, 40)}`).toBe(1)
  }
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts`
Expected: FAIL. No cards render; the CSS lists lack the pillar rules.

- [ ] **Step 3: Write the implementation**

`lib/aeo-outbound/render.ts`:
- In `PAGE_CSS`, after the line `'#methodology .method-note strong{color:var(--white);font-weight:800;font-style:normal}',` (line 111) add:

```ts
  // Round 3 (Ryan, 2026-10-21): the pillar cards, one column on a phone; three from 901px (below).
  '.aeo-pillars{display:grid;grid-template-columns:1fr;gap:12px;margin-top:20px}',
  '.aeo-pillar{display:flex;flex-direction:column;padding:24px}',
  '.aeo-pillar-desc{font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6);margin:10px 0 18px}',
  '.aeo-pillar-line{margin:auto 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:16px;line-height:1.5;font-weight:600;color:#fff}',
```

- In the desktop block, after `'#opportunities .chart-takeaway{border-top:none;padding:16px 0 0;margin:0;color:rgba(255,255,255,0.6)}',` (line 133) add:

```ts
  '#opportunities .aeo-pillars{grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}',
```

- After `const chartMark = attr('data-locked', 'chart')` (line 225) add, with the table branch byte-identical to lines 290-296 today:

```ts
  // Round 3 (Ryan, 2026-10-21): a pillar row shows three cards (name, description, data line) in place of the table and
  // its footnote; a table row is byte-identical to before.
  const oppsBody = s.opportunities_layout === 'pillars'
    ? `<div class="aeo-pillars">${s.opportunities.map((o, i) => `<div class="cluster-card aeo-pillar">${slot('div', `opportunities.${i}.workstream`, o.workstream, 'cluster-name')}${slot('p', `opportunities.${i}.opportunity`, o.opportunity, 'aeo-pillar-desc')}${slot('p', `opportunities.${i}.signal`, o.signal, 'aeo-pillar-line')}</div>`).join('')}</div>`
    : `<div class="leaderboard-wrap">
    <table class="leaderboard">
      <thead><tr>${slot('th', 'page.opps_col_1', p.opps_col_1)}${slot('th', 'page.opps_col_2', p.opps_col_2)}${slot('th', 'page.opps_col_3', p.opps_col_3)}</tr></thead>
      <tbody>${s.opportunities.map((o, i) => `<tr>${slot('td', `opportunities.${i}.signal`, o.signal, '', label(p.opps_col_1))}${slot('td', `opportunities.${i}.opportunity`, o.opportunity, '', label(p.opps_col_2))}${slot('td', `opportunities.${i}.workstream`, o.workstream, '', label(p.opps_col_3))}</tr>`).join('')}</tbody>
    </table>
  </div>
  ${slot('p', 'page.opps_takeaway', p.opps_takeaway, 'chart-takeaway')}`
```

- Lines 290-296 (from `  <div class="leaderboard-wrap">` through `  ${slot('p', 'page.opps_takeaway', ...)}`) become the single line `  ${oppsBody}`. The implementer checks with a script that the removed text equals the table branch above, character for character, before saving.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/render.test.ts lib/aeo-outbound/render.frame.test.ts lib/aeo-outbound/v1-compat.test.ts app/actions/aeo-outbound.test.ts`
Expected: PASS, `v1-compat.test.ts` included unchanged.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/render.ts lib/aeo-outbound/render.test.ts
git commit -m "Render the pillar cards on a pillar row; table rows unchanged (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 5: Pillar labels, and the dead setting off the Settings form (spec P8, P9, D2)

**Files:**
- Modify: `lib/aeo-outbound/labels.ts:22-38`, `components/aeo-outbound/editor.tsx` (Props, `:341`, `:458`, `<BeforeYouSend` `:540-541`), `components/aeo-outbound/before-you-send.tsx:36-52`, `app/tools/new-business/[reportId]/page.tsx:56`, `components/aeo-outbound/settings-form.tsx:128-134`
- Test: `lib/aeo-outbound/labels.test.ts`, `components/aeo-outbound/editor.test.tsx`, `components/aeo-outbound/before-you-send.test.tsx`, `components/aeo-outbound/settings-form.test.tsx`

**Interfaces:**
- Consumes: the marker (Task 2).
- Produces: `fieldLabel(path, titles, pillars = false)`; `OutboundEditor` prop `pillars: boolean`; `BeforeYouSendProps.pillars?: boolean`.

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/labels.test.ts`, append:

```ts
test('pillar rows name their fields as pillars (Ryan, round 3); a table row keeps its labels', () => {
  expect(fieldLabel('opportunities.0.workstream', T, true)).toBe('Pillar 1, name')
  expect(fieldLabel('opportunities.1.opportunity', T, true)).toBe('Pillar 2, description')
  expect(fieldLabel('opportunities.2.signal', T, true)).toBe('Pillar 3, data line')
  expect(fieldLabel('opportunities.2.signal', T)).toBe('Opportunity 3, signal')
  for (const [p] of slotEntries({ ...FULL, opportunities_layout: 'pillars' })) expect(fieldLabel(p, T, true), p).not.toBe(p)
})
```

`components/aeo-outbound/editor.test.tsx`: in `base` (line 48) add `pillars: false,` after `needsValidation: [],`; append:

```ts
test('on a pillar row a refused opportunity field is named as a pillar (Ryan, round 3)', async () => {
  patch = async () => json(400, { error: 'Keep this under 1000 characters.' })
  const { iframe } = await setup({ pillars: true })
  await fromFrame(iframe, { type: 'dirty', path: 'opportunities.0.signal' })
  await fromFrame(iframe, { type: 'edit', path: 'opportunities.0.signal', value: 'x' })
  expect(await screen.findByText('Pillar 1, data line: Keep this under 1000 characters.')).toBeInTheDocument()
})
```

`components/aeo-outbound/before-you-send.test.tsx`, append:

```ts
test('pillar rows label a Needs validation item as a pillar field (Ryan, round 3)', () => {
  render(
    <BeforeYouSend
      needsValidation={['opportunities.1.opportunity']} notes={[]} titles={['A', 'B']} about={null} ticks={new Set()} ownTicks={new Set()} highlight={null}
      onTick={() => {}} onOwnTick={() => {}} onGoTo={() => {}} onMinimize={() => {}} pillars
    />,
  )
  expect(screen.getByText(/Pillar 2, description/)).toBeInTheDocument()
})
```

`components/aeo-outbound/settings-form.test.tsx`:
- Line 38 becomes `expect(screen.queryByLabelText('Most opportunities from Peec recommendations')).toBeNull()`.
- In the Save test, after the `expect(save.mock.calls[0]).toEqual(...)` line add `expect(save.mock.calls[0][0]).toMatchObject({ peecOpportunityRows: '1' })`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/labels.test.ts components/aeo-outbound/editor.test.tsx components/aeo-outbound/before-you-send.test.tsx components/aeo-outbound/settings-form.test.tsx`
Expected: FAIL. Labels read "Opportunity N"; the select still shows. The settings Save assertion passes already (the form keeps the value).

- [ ] **Step 3: Write the implementation**

`lib/aeo-outbound/labels.ts`:
- Before `export function fieldLabel`, add `const PILLAR_FIELDS: Record<string, string> = { workstream: 'name', opportunity: 'description', signal: 'data line' }`.
- The signature becomes `export function fieldLabel(path: string, titles: readonly [string, string], pillars = false): string {`, with the doc line above it gaining "On a pillar row (round 3) an opportunity field reads as a pillar's." .
- The opportunities line (`if (m) return `Opportunity ${Number(m[1]) + 1}, ${m[2]}``, line 35) becomes:

```ts
  if (m) return pillars ? `Pillar ${Number(m[1]) + 1}, ${PILLAR_FIELDS[m[2]]}` : `Opportunity ${Number(m[1]) + 1}, ${m[2]}`
```

`components/aeo-outbound/before-you-send.tsx`:
- In `BeforeYouSendProps`, after `titles: readonly [string, string]`: `/** Round 3: label opportunity paths as pillar fields. */ pillars?: boolean`.
- Line 52 becomes `const label = (path: string) => fieldLabel(path, p.titles, p.pillars ?? false)`.

`components/aeo-outbound/editor.tsx`:
- In `Props`, after `needsValidation: string[]`: `/** Round 3: the draft's Opportunities page shows the pillars, so its fields are labeled as pillars. */ pillars: boolean`.
- `editor.tsx:341` and `:458`: each `fieldLabel(x, titles)` becomes `fieldLabel(x, titles, props.pillars)`.
- `<BeforeYouSend` (line 540): add `pillars={props.pillars}` after `titles={titles}`.

`app/tools/new-business/[reportId]/page.tsx`, after line 56: `      pillars={full?.opportunities_layout === 'pillars'}`.

`components/aeo-outbound/settings-form.tsx`: remove the `<div>` holding the Peec-rows select (lines 128-134, from `<div>` with `htmlFor="s-rows"` through its closing `</div>`). The form state keeps `peecOpportunityRows`, so a save still sends the stored value.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/labels.test.ts components/aeo-outbound/editor.test.tsx components/aeo-outbound/editor-page.test.tsx components/aeo-outbound/before-you-send.test.tsx components/aeo-outbound/settings-form.test.tsx app/tools/new-business/settings/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/labels.ts lib/aeo-outbound/labels.test.ts components/aeo-outbound/editor.tsx components/aeo-outbound/editor.test.tsx components/aeo-outbound/before-you-send.tsx components/aeo-outbound/before-you-send.test.tsx 'app/tools/new-business/[reportId]/page.tsx' components/aeo-outbound/settings-form.tsx components/aeo-outbound/settings-form.test.tsx
git commit -m "Pillar labels in the editor and Before you send; the unused Peec-rows setting leaves the Settings form (Ryan, round 3)"
perl -e 'alarm 30; exec @ARGV' -- git push
```

---

### Task 6: Full checks, browser check, draft PR

- [ ] **Step 1: The CI commands, locally** (`Makefile:17-21`, build left to CI)

```bash
perl -e 'alarm 300; exec @ARGV' -- npm run typecheck
perl -e 'alarm 590; exec @ARGV' -- npm test
perl -e 'alarm 300; exec @ARGV' -- npm run check:rsc
perl -e 'alarm 120; exec @ARGV' -- npx eslint lib/aeo-outbound/config.ts lib/aeo-outbound/metrics.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/sentences.ts lib/aeo-outbound/slots.ts lib/aeo-outbound/prompt.ts lib/aeo-outbound/generate.ts lib/aeo-outbound/grounding.ts lib/aeo-outbound/render.ts lib/aeo-outbound/labels.ts components/aeo-outbound/editor.tsx components/aeo-outbound/before-you-send.tsx components/aeo-outbound/settings-form.tsx 'app/tools/new-business/[reportId]/page.tsx'
```

Expected: each passes; any lint error is shown to predate the branch (same line on dev) or fixed.

- [ ] **Step 2: Browser check** of this branch's real render (a local static page from `renderSnapshotHtml` with PocketGuard's real donut weights and a generated pillar row), at 1440, 1105 and 375px: three cards in order, name, description and line; 3 columns from 901px, 1 below; no horizontal scroll; a table row unchanged. The live check on a real generated report happens on staging after promotion.

- [ ] **Step 3: Open the PR as a draft against `dev` with no reviewer** ("AEO Outbound: the Opportunities page shows the three pillars → dev"). The body says what changed and why (Ryan's answer, the decisions D2 to D4), the rollout notes (older builds show a pillar row in the old table; previews share the dev database), links the spec, review log, trial and plan, and pastes the Step 1 output. Do not request Paul.
