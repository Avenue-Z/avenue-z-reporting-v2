# AEO Outbound findings bullets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new report's two findings boxes read as Ryan's round-3 answer: Citation volume, Citation rate and Source-type mix on the Cited Sources page; Next-tier gap, Top-tier distance, Peer cluster and the competitor domain gaps on the Competitive Visibility page.

**Architecture:** `sentences.ts` gains two new box writers and keeps today's two, unchanged, behind an exported `boxesV2(d)` for older rows. Grounding allows `boxesV2`'s numbers on rows written with an earlier version, and the rename note ignores the own domain. `SENTENCES_VERSION` becomes 3. A last task rewords #415's pillar lines to "citations" on its own branch.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-aeo-outbound-bullets-design.md` (B1 to B4, edge cases §5, tests §6, decisions D1 to D6; review log beside it).

## Global Constraints

- Branch `feat/aeo-outbound-bullets` off `dev` (`049352a8`). The PR targets `dev`, opens as a **draft with no reviewer**, and goes to Paul with the rest of round 3. Nothing merges without my "merge".
- Sentence text exactly as below; leads exactly "Citation volume:", "Citation rate:", "Source-type mix:", "Next-tier gap:", "Top-tier distance:", "Peer cluster:", "Competitor domain gaps:", "AI visibility:".
- `boxesV2` output byte-identical to today's boxes (the existing wording tests prove it).
- No change to the context, methodology, Data block, prompt, gaps computation, render, contracts or `PAGE_KEYS`.
- Writing: no em or en dashes; sentence case; first person.
- Git: `git status --porcelain` before every commit; named files only; push after every commit. Bound long commands with `perl -e 'alarm N; exec @ARGV' --` and a matching tool timeout.

## Review Focus

1. **A draft written before this ships** gains no flag on its stored bullets: Task 3, on a fixture where it would.
2. **Ryan's PocketGuard sentences word for word**, "PocketGuard.com" and "8%" included: Task 2.
3. **A box is never empty**, in every edge case (no competitors, competitors without data, every brand at zero): Task 2.
4. **Two own sites** print the domain the same way in both bullets: Task 2.
5. **A brand named like its domain** ("Care.com") in the rename note: B4 skips its own domain, so such a mention is not counted. Accepted; noted in the PR.

---

### Task 1: Today's boxes become `boxesV2` (no behaviour change)

**Files:**
- Modify: `lib/aeo-outbound/sentences.ts:75`, `:240-241`
- Test: `lib/aeo-outbound/sentences.test.ts:5`, `:11`

**Interfaces:**
- Produces: `export function boxesV2(d: SnapshotData): Pick<DataSentences, 'competitive_bullets' | 'sources_bullets'>`. Tasks 2 and 3 consume it.

- [ ] **Step 1: Point the existing wording tests at `boxesV2` (the failing test)**

`lib/aeo-outbound/sentences.test.ts:5` becomes `import { boxesV2, countText, dataSentences, listText, ordinal, pctText } from './sentences'`. Line 11 becomes:

```ts
// The tests below pin today's boxes, which stay as boxesV2 for rows written before version 3 (spec 2026-10-22 B3): the
// context and methodology come from today's writer, the boxes from boxesV2.
const sent = (p: PeecPull = LIVE_SHAPE_PULL, decisions?: MetricDecisions, used?: typeof USED) => { const d = build(p, decisions, used); return { ...dataSentences(d), ...boxesV2(d) } }
```

- [ ] **Step 2: Run to verify it fails**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/sentences.test.ts`
Expected: FAIL: `boxesV2` is not exported (every test errors).

- [ ] **Step 3: Implement**

`lib/aeo-outbound/sentences.ts:75` `export function dataSentences(d: SnapshotData): DataSentences {` becomes `function write(d: SnapshotData) {`. The last line of that function, `  return { context: context(), competitive_bullets: firstBox(), sources_bullets: secondBox(), methodology: methodology() }` and its closing `}`, become:

```ts
  return { context: context(), methodology: methodology(), v2: { competitive_bullets: firstBox(), sources_bullets: secondBox() } }
}

export function dataSentences(d: SnapshotData): DataSentences {
  const w = write(d)
  return { context: w.context, competitive_bullets: w.v2.competitive_bullets, sources_bullets: w.v2.sources_bullets, methodology: w.methodology }
}

/** Spec 2026-10-22 B3: the version 2 boxes, kept unchanged so grounding can still allow the numbers that a row written with
 *  them prints. Rows of today's version never use them. */
export function boxesV2(d: SnapshotData): Pick<DataSentences, 'competitive_bullets' | 'sources_bullets'> {
  return write(d).v2
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `perl -e 'alarm 280; exec @ARGV' -- npx vitest run lib/aeo-outbound`
Expected: PASS, every file.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/sentences.ts lib/aeo-outbound/sentences.test.ts
git commit -m "Today's findings boxes become boxesV2, unchanged, for older rows (spec 2026-10-22 B3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: The new boxes, D5, D6 and version 3 (spec B1, B2, B3's bump)

**Files:**
- Modify: `lib/aeo-outbound/sentences.ts` (module helpers after `sharePctAll`, `:73`; inside `write`, a gaps helper and four box functions; `write`'s return; `dataSentences`), `lib/aeo-outbound/config.ts:33-36`
- Test: `lib/aeo-outbound/sentences.test.ts` (new tests at the end), `lib/aeo-outbound/config.test.ts:21-23`, `lib/aeo-outbound/generate.test.ts:359`, `:367`, `lib/aeo-outbound/grounding.test.ts:340-349`, `:351-377`, `:395-405`, `:431-443`, `:461-469`

**Interfaces:**
- Consumes: `boxesV2` (Task 1).
- Produces: `export function ownDomainText(domain: string, brand: string): string`; `dataSentences` returns the new boxes; `SENTENCES_VERSION = 3`.

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/sentences.test.ts`: line 5 imports `ownDomainText` too. After line 11 add:

```ts
// Today's writer (spec 2026-10-22): the boxes as Ryan worded them.
const now = (p: PeecPull = LIVE_SHAPE_PULL, decisions?: MetricDecisions, used?: typeof USED) => dataSentences(build(p, decisions, used))
```

At the end of the file add:

```ts
// Ryan's PocketGuard example, rebuilt from the values measured read only on 2026-10-22 (spec §3).
const POCKETGUARD: PeecPull = (() => {
  const vis: [string, string, number][] = [['ynab', 'YNAB', 0.575], ['monarch', 'Monarch', 0.528], ['monarch_money', 'Monarch Money', 0.512], ['everydollar', 'EveryDollar', 0.394], ['quicken', 'Quicken', 0.387], ['own', 'PocketGuard', 0.333], ['you_need', 'You Need A Budget', 0.309], ['rocket', 'Rocket Money', 0.264]]
  const roster = vis.map(([id, name]) => ({ id, name, is_own: id === 'own', domains: id === 'own' ? ['pocketguard.com'] : [`${id}.example`] }))
  const row = (domain: string, classification: string, weight: number, extra: Record<string, unknown> = {}) => ({ domain, classification, retrieved_chat_count: 10, retrieval_count: weight, usage_rate: weight, mentioned_brands: [], ...extra })
  return {
    ...LIVE_SHAPE_PULL,
    roster,
    ownBrand: roster.find((r) => r.is_own)!,
    brands: vis.map(([id, name, v]) => ({ brand: { id, name }, visibility: v, share_of_voice: 0.1, position: 2 })),
    domains: [
      row('pocketguard.com', 'OWN', 41, { retrieved_chat_count: 678, retrieved_percentage: 0.11758584807492195 }),
      row('corp.example', 'CORPORATE', 367), row('news.example', 'EDITORIAL', 188), row('rival.example', 'COMPETITOR', 171),
      row('gov.example', 'INSTITUTIONAL', 91), row('forum.example', 'UGC', 80), row('wiki.example', 'REFERENCE', 62),
    ],
  }
})()

test('round 3: Ryan\'s PocketGuard example reads word for word as he wrote it', () => {
  const s = now(POCKETGUARD)
  expect(s.competitive_bullets).toEqual([
    { lead: 'Citation volume:', text: 'PocketGuard.com appears in 678 retrieved citations.' },
    { lead: 'Citation rate:', text: 'PocketGuard is cited in 12% of tracked answers.' },
    { lead: 'Source-type mix:', text: 'Corporate sources account for 37% of citations, followed by Editorial sources at 19%; UGC accounts for 8%.' },
  ])
  expect(s.sources_bullets).toEqual([
    { lead: 'Next-tier gap:', text: 'PocketGuard is 5.4 percentage points behind Quicken in visibility.' },
    { lead: 'Top-tier distance:', text: 'PocketGuard is 20.5 percentage points below the top-three average visibility of 53.8%.' },
    { lead: 'Peer cluster:', text: 'PocketGuard sits within a 7.8-point visibility range alongside Quicken and You Need A Budget.' },
  ])
})

test('round 3: the live-shape fixture in the new boxes', () => {
  const s = now()
  expect(s.competitive_bullets).toEqual([
    { lead: 'Citation volume:', text: 'Examplesenior.com appears in 142 retrieved citations.' },
    { lead: 'Citation rate:', text: 'Example Senior Living is cited in 26% of tracked answers.' },
    { lead: 'Source-type mix:', text: 'Institutional sources account for 62% of citations, followed by Corporate sources at 22%; Editorial accounts for 3% and UGC for 4%.' },
  ])
  expect(s.sources_bullets).toEqual([
    { lead: 'Next-tier gap:', text: 'Example Senior Living is 0.2 percentage points behind Caringly in visibility.' },
    { lead: 'Top-tier distance:', text: 'Example Senior Living is 32.0 percentage points below the top-three average visibility of 33.1%.' },
    { lead: 'Peer cluster:', text: 'Example Senior Living sits within a 1.1-point visibility range alongside Caringly and Seniorway.' },
    { lead: 'Competitor domain gaps:', text: 'The largest gaps include health-institute.gov at 115 retrievals, medicare-info.gov at 90, retiree-benefits.gov at 60, and seniornews.example at 55.' },
  ])
})

const cv = (rows: [string, string, number, number | null][], extra: Partial<PeecPull> = {}) => now(brandPull(rows, extra)).sources_bullets.map((b) => b.text)

test('round 3, Competitive Visibility box: first, level at the top, last, ties above, inside the top three', () => {
  expect(cv([['own', 'Own', 0.5, 0.3], ['a', 'A', 0.4, 0.2], ['b', 'B', 0.3, 0.1]])).toEqual([
    'Own is 10.0 percentage points ahead of A in visibility.',
    'Own is 15.0 percentage points above the top-two average visibility of 35.0%.',
    'Own sits within a 20.0-point visibility range alongside A and B.',
  ])
  expect(cv([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.5, 0.2], ['b', 'B', 0.3, 0.1]])).toEqual([
    'Own is level with A at the top in visibility.',
    'Own is 10.0 percentage points above the top-two average visibility of 40.0%.',
    'Own sits within a 20.0-point visibility range alongside A and B.',
  ])
  expect(cv([['a', 'A', 0.5, 0.3], ['b', 'B', 0.4, 0.2], ['own', 'Own', 0.2, 0.1]])).toEqual([
    'Own is 20.0 percentage points behind B in visibility.',
    'Own is 25.0 percentage points below the top-two average visibility of 45.0%.',
    'Own sits within a 30.0-point visibility range alongside A and B.',
  ])
  expect(cv([['a', 'A', 0.5, 0.3], ['b', 'B', 0.4, 0.2], ['c', 'C', 0.4, 0.2], ['own', 'Own', 0.2, 0.1]])[0]).toBe('Own is 20.0 percentage points behind B and C in visibility.')
  expect(cv([['a', 'A', 0.6, 0.3], ['own', 'Own', 0.5, 0.2], ['b', 'B', 0.4, 0.1], ['c', 'C', 0.3, 0.1], ['d', 'D', 0.2, 0.1]])[1]).toBe('Own is 6.7 percentage points above the top-three average visibility of 43.3%.')
})

test('round 3, Competitive Visibility box: one competitor, none tracked, none with data, all at zero, the brand at zero', () => {
  expect(cv([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.2, 0.1]])).toEqual(['Own is 30.0 percentage points behind A in visibility.'])
  expect(now(brandPull([['own', 'Own', 0.2, 1]])).sources_bullets).toEqual([{ lead: 'AI visibility:', text: 'Own appears in 20% of tracked answers.' }])
  const noData = { brands: [{ brand: { id: 'own', name: 'Own' }, visibility: 0.2, share_of_voice: 1, position: 2 }] }
  expect(now(brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]], noData)).sources_bullets).toEqual([{ lead: 'AI visibility:', text: 'Own appears in 20% of tracked answers; no other brand tracked has Peec data in this window.' }])
  expect(cv([['a', 'A', 0, 0], ['own', 'Own', 0, 0]])).toEqual(['No brand tracked shows visibility in this window.'])
  expect(cv([['a', 'A', 0.3, 0.3], ['b', 'B', 0.1, 0.1], ['own', 'Own', 0, 0]])).toEqual([
    'Own is 10.0 percentage points behind B in visibility.',
    'Own is 20.0 percentage points below the top-two average visibility of 20.0%.',
    'Own sits within a 30.0-point visibility range alongside A and B.',
  ])
})

test('round 3, Competitive Visibility box: equal peers, a top-two average at a half tenth, a brand below tenth', () => {
  expect(cv([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.3, 0.2], ['b', 'B', 0.3, 0.1]])).toEqual([
    'Own is level with A and B at the top in visibility.',
    'Own matches the top-two average visibility of 30.0%.',
    'Own sits at the same visibility as A and B.',
  ])
  expect(cv([['a', 'A', 0.501, 0.3], ['b', 'B', 0.502, 0.2], ['own', 'Own', 0.2, 0.1]])[1]).toBe('Own is 30.2 percentage points below the top-two average visibility of 50.2%.')
  const many = Array.from({ length: 12 }, (_, i) => [`c${String(i).padStart(2, '0')}`, `C${i}`, 0.7 - i * 0.05, 0.1] as [string, string, number, number])
  const low = cv([...many, ['own', 'Own', 0.1, 0.05]])
  expect(low[0]).toBe('Own is 5.0 percentage points behind C11 in visibility.')
  expect(low[2]).toBe('Own sits within a 10.0-point visibility range alongside C10 and C11.')
})

test('round 3, Cited Sources box: no own site retrieved; two own sites print the domain the same way in both bullets', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  expect(now({ ...base, domains: base.domains.filter((r) => r.classification !== 'OWN') }).competitive_bullets.slice(0, 1)).toEqual([{ lead: 'Citation volume:', text: 'Own\'s own site does not appear in any retrieved citations in this window.' }])
  expect(now({ ...base, domains: base.domains.filter((r) => r.classification !== 'OWN') }).competitive_bullets.map((b) => b.lead)).toEqual(['Citation volume:', 'Source-type mix:'])
  const pg = brandPull([['a', 'A', 0.3, 0.3], ['own', 'PocketGuard', 0.2, 0.2]])
  const two: PeecPull = {
    ...pg,
    roster: pg.roster.map((r) => (r.is_own ? { ...r, domains: ['pocketguard.com'] } : r)),
    ownBrand: { ...pg.ownBrand, domains: ['pocketguard.com'] },
    domains: [
      { domain: 'pocketguard.com', classification: 'OWN', retrieved_chat_count: 50, retrieval_count: 60, usage_rate: 60, retrieved_percentage: 0.25, mentioned_brands: [] },
      { domain: 'blog.pocketguard.com', classification: 'OWN', retrieved_chat_count: 20, retrieval_count: 20, usage_rate: 20, mentioned_brands: [] },
      { domain: 'paper.example', classification: 'EDITORIAL', retrieved_chat_count: 40, retrieval_count: 40, usage_rate: 40, mentioned_brands: [] },
    ],
  }
  expect(now(two).competitive_bullets.slice(0, 2).map((b) => b.text)).toEqual(['PocketGuard.com appears in 50 retrieved citations.', 'PocketGuard.com is cited in 25% of tracked answers.'])
})

test('round 3, the own-domain rule (D6): the brand\'s casing only for a one-word capitalised brand on the first label', () => {
  expect(ownDomainText('pocketguard.com', 'PocketGuard')).toBe('PocketGuard.com')
  expect(ownDomainText('www.pocketguard.com', 'PocketGuard')).toBe('PocketGuard.com')
  expect(ownDomainText('blog.pocketguard.com', 'PocketGuard')).toBe('Blog.pocketguard.com')
  expect(ownDomainText('monarchmoney.com', 'Monarch Money')).toBe('Monarchmoney.com')
  expect(ownDomainText('bunq.com', 'bunq')).toBe('Bunq.com')
  expect(ownDomainText('example.com', 'PocketGuard')).toBe('Example.com')
})

const nowMix = (rows: [string, number][]) => now({ ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: rows.map(([c, w], i) => ({ domain: `d${i}.example`, classification: c, retrieved_chat_count: 1, retrieval_count: w, usage_rate: w, mentioned_brands: [] })) }).competitive_bullets.at(-1)

test('round 3, Source-type mix: edge lines, the own-site type first, and D5\'s whole percents', () => {
  expect(nowMix([])).toEqual({ lead: 'Source-type mix:', text: 'Peec reported no source types for this window.' })
  expect(nowMix([['CORPORATE', 100]])).toEqual({ lead: 'Source-type mix:', text: 'All citations come from Corporate sources.' })
  expect(nowMix([['CORPORATE', 9996], ['OWN', 4]])).toEqual({ lead: 'Source-type mix:', text: 'Almost all citations come from Corporate sources.' })
  expect(nowMix([['OWN', 60], ['CORPORATE', 40]])!.text).toBe('Own-site sources account for 60% of citations, followed by Corporate sources at 40%; Editorial accounts for 0.0% and UGC for 0.0%.')
  expect(nowMix([['CORPORATE', 60], ['INSTITUTIONAL', 39.5], ['EDITORIAL', 0.4], ['UGC', 0.1]])!.text).toBe('Corporate sources account for 60% of citations, followed by Institutional sources at 40%; Editorial accounts for 0.4% and UGC for 0.1%.')
  expect(nowMix([['CORPORATE', 60], ['INSTITUTIONAL', 28], ['EDITORIAL', 6.4], ['UGC', 5.6]])!.text).toBe('Corporate sources account for 60% of citations, followed by Institutional sources at 28%; Editorial accounts for 6.4% and UGC for 5.6%.')
  expect(nowMix([['CORPORATE', 99.9], ['UGC', 0.1]])!.text).toBe('Corporate sources account for 99.9% of citations, followed by UGC sources at 0.1%; Editorial accounts for 0.0%.')
})

test('round 3: each new box holds 1 to 4 bullets in every edge case above', () => {
  const pulls = [LIVE_SHAPE_PULL, POCKETGUARD, brandPull([['own', 'Own', 0.2, 1]]), brandPull([['a', 'A', 0, 0], ['own', 'Own', 0, 0]]), brandPull([['a', 'A', 0.5, 0.3], ['own', 'Own', 0.2, 0.1]]), { ...brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]]), domains: [] }]
  for (const p of pulls) for (const box of [now(p).competitive_bullets, now(p).sources_bullets]) {
    expect(box.length).toBeGreaterThanOrEqual(1)
    expect(box.length).toBeLessThanOrEqual(4)
  }
})
```

`lib/aeo-outbound/config.test.ts:21-23` becomes:

```ts
test('2026-10-22: the code-written sentences are version 3, since the findings bullets follow Ryan\'s per-page wording', () => {
  expect(SENTENCES_VERSION).toBe(3)
})
```

`lib/aeo-outbound/generate.test.ts:359`: the name "gives 1 to 3 bullets per box" becomes "gives 1 to 4 bullets per box"; `:367` `box.length <= 3` becomes `box.length <= 4`.

`lib/aeo-outbound/grounding.test.ts`, five mechanism tests move to the new sentences (same mechanism, new text):
- `:347-348`: edit `competitive_bullets[0]` to `'Examplesenior.com appears in 144 retrieved citations.'`; expect `[{ kind: 'number_not_in_data', path: 'competitive_bullets.0.text', text: '"144" does not match Peec\'s number in this sentence' }]`.
- `:360`, `:369`: `competitive_bullets[1]` becomes `competitive_bullets[0]`. `:373`, `:376`: `i === 1` becomes `i === 0`, and the texts become `'Elsewhere.com appears in 142 retrieved citations.'` and `'Fakeexamplesenior.com appears in 142 retrieved citations.'`.
- `:395-405` (count words): edit `sources_bullets[1]` (`s.sources_bullets = s.sources_bullets.map((b, i) => (i === 1 ? { ...b, text } : b))`); `'Example Senior Living is 32.0 percentage points below the top-nine average visibility of 33.1%.'` gives `[{ kind: 'number_not_in_data', path: 'sources_bullets.1.text', text: '"nine" does not match Peec\'s number in this sentence' }]`; `'Against the top-three average visibility of 33.1%, Example Senior Living is 32.0 percentage points below.'` gives `[]`.
- `:431-443` (a changed number or rank word): edit `sources_bullets[0]` to `'Example Senior Living is 0.4 percentage points behind Caringly in visibility, second from the top.'`; expect `"0.4"` then `"second"` flagged on `sources_bullets.0.text` with today's two messages. The rewording: `sources_bullets = [{ ...[0], text: 'Behind Caringly by 0.2 percentage points in visibility: Example Senior Living.' }, { lead: 'My own lead:', text: 'It has 26% of answers.' }]` gives `[]`.
- `:461-469` (other version): edit `sources_bullets[0]` to `'Example Senior Living trails Caringly at 1.3% visibility.'`; the `sentences: 99` row has no flag on `sources_bullets.0.text`.

- [ ] **Step 2: Run them to verify they fail**

Run: `perl -e 'alarm 280; exec @ARGV' -- npx vitest run lib/aeo-outbound`
Expected: FAIL: the eight new `sentences.test.ts` tests (`ownDomainText` is not exported; today's boxes come back), the config test (2), and the five rewritten grounding tests (the old sentences are still written). The generate test passes either way.

- [ ] **Step 3: Implement**

`lib/aeo-outbound/sentences.ts`, after `sharePctAll` (`:73`), add:

```ts
/** Spec 2026-10-22 D5: source shares in the source-type mix sentence. The stored one-decimal pct decides: below 1.0 one
 *  decimal, else whole, rounding the exact share as the donut does; a whole 100 under 100 keeps one decimal; two values
 *  that differ never read the same. */
function mixPctAll(items: { pct: number; exact: number }[]): string[] {
  const one = ({ pct, exact }: { pct: number; exact: number }) => {
    if (pct < 1) return `${pct.toFixed(1)}%`
    const whole = Math.round(exact)
    return whole === 100 && pct < 100 ? `${pct.toFixed(1)}%` : `${whole}%`
  }
  const text = items.map(one)
  return items.map((v, i) => (text.some((t, j) => j !== i && t === text[i] && items[j].pct !== v.pct) ? `${v.pct.toFixed(1)}%` : text[i]))
}

/** Spec 2026-10-22 D6: an own domain in a sentence. Without www.; when the brand is one word starting with a capital and the
 *  domain's first label is that word, the label takes the brand's casing ("PocketGuard.com"); otherwise today's capital. */
export function ownDomainText(domain: string, brand: string): string {
  const d = domain.replace(/^www\./i, '')
  const first = d.split('.')[0]
  if (/^[A-Z]\S*$/.test(brand) && first.toLowerCase() === brand.toLowerCase()) return brand + d.slice(first.length)
  return capital(d)
}

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
```

Inside `write`, in `secondBox`, the gaps block (`if (d.gapDomains.length) { ... }`) becomes `const gaps = gapsBullet(); if (gaps) out.push(gaps)`, with, before `secondBox`:

```ts
  function gapsBullet(): Bullet | null {
    if (!d.gapDomains.length) return null
    const items = d.gapDomains.map((g, i) => `${g.domain} at ${countText(g.retrievedChats)}${i === 0 ? ' retrievals' : ''}`)
    return { lead: 'Competitor domain gaps:', text: `The largest gaps include ${listText(items)}.` }
  }
```

Before `methodology`, add the new boxes:

```ts
  // Spec 2026-10-22 B1: the Cited Sources box, in Ryan's order.
  function citedSourcesBox(): Bullet[] {
    const out: Bullet[] = []
    const site = d.ownSites?.[0]
    if (!site || site.retrievedChats <= 0) {
      out.push({ lead: 'Citation volume:', text: `${brand}'s own site does not appear in any retrieved citations in this window.` })
    } else {
      const domain = ownDomainText(site.domain, brand)
      const n = site.retrievedChats
      out.push({ lead: 'Citation volume:', text: `${domain} appears in ${n >= 1000 ? 'approximately ' : ''}${countText(n)} retrieved ${n === 1 ? 'citation' : 'citations'}.` })
      if (site.retrievedPct !== null) out.push({ lead: 'Citation rate:', text: `${d.ownSites!.length === 1 ? brand : domain} is cited in ${pctText(site.retrievedPct)} of tracked answers.` })
    }
    out.push(sourceTypeMix())
    return out
  }

  function sourceTypeMix(): Bullet {
    const lead = 'Source-type mix:'
    const mix = d.sourceMix
    if (!mix.length) return { lead, text: 'Peec reported no source types for this window.' }
    if (mix.length === 1) return { lead, text: `All citations come from ${label(mix[0].label)} sources.` }
    if (mix[1].pct === 0) return { lead, text: `Almost all citations come from ${label(mix[0].label)} sources.` }
    const [t1, t2] = mix
    const named = new Set([t1.label, t2.label])
    const extras = ['Editorial', 'UGC'].filter((l) => !named.has(l))
    const total = mix.reduce((s, m) => s + m.weight, 0)
    const share = (l: string) => { const m = mix.find((x) => x.label === l); return { pct: m?.pct ?? 0, exact: m && total ? (m.weight / total) * 100 : 0 } }
    const [p1, p2, ...pe] = mixPctAll([share(t1.label), share(t2.label), ...extras.map(share)])
    const tail = extras.length === 2 ? `; ${extras[0]} accounts for ${pe[0]} and ${extras[1]} for ${pe[1]}` : extras.length === 1 ? `; ${extras[0]} accounts for ${pe[0]}` : ''
    return { lead, text: `${upper(label(t1.label))} sources account for ${p1} of citations, followed by ${label(t2.label)} sources at ${p2}${tail}.` }
  }

  // Spec 2026-10-22 B2: the Competitive Visibility box, in Ryan's order, then the gaps (D1).
  function competitiveBox(): Bullet[] {
    const out: Bullet[] = []
    if (solo) out.push({ lead: 'AI visibility:', text: `${brand} appears in ${pctText(own.visibilityPct)} of tracked answers.` })
    else if (!others.length) out.push({ lead: 'AI visibility:', text: `${brand} appears in ${pctText(own.visibilityPct)} of tracked answers; no other brand tracked has Peec data in this window.` })
    else {
      out.push(nextTier())
      if (!allZero) {
        const t = topTier()
        if (t) out.push(t)
        const p = peerCluster()
        if (p) out.push(p)
      }
    }
    const gaps = gapsBullet()
    if (gaps) out.push(gaps)
    return out
  }

  function nextTier(): Bullet {
    const lead = 'Next-tier gap:'
    if (allZero) return { lead, text: 'No brand tracked shows visibility in this window.' }
    const above = others.filter((b) => b.visibilityPct > own.visibilityPct)
    if (above.length) {
      const next = Math.min(...above.map((b) => b.visibilityPct))
      return { lead, text: `${brand} is ${points(tenths(next, own.visibilityPct))} percentage points behind ${someNames(above.filter((b) => b.visibilityPct === next).map((b) => b.name))} in visibility.` }
    }
    if (level.length) return { lead, text: `${brand} is level with ${someNames(level.map((b) => b.name))} at the top in visibility.` }
    const next = Math.max(...others.map((b) => b.visibilityPct))
    return { lead, text: `${brand} is ${points(tenths(own.visibilityPct, next))} percentage points ahead of ${someNames(others.filter((b) => b.visibilityPct === next).map((b) => b.name))} in visibility.` }
  }

  function topTier(): Bullet | null {
    const top3 = others.slice(0, 3)
    if (top3.length < 2) return null
    // In whole tenths, half up, so the average and the distance are exact on the printed one-decimal values (spec D3).
    const avg = Math.round(top3.reduce((s, b) => s + Math.round(b.visibilityPct * 10), 0) / top3.length) / 10
    const x = tenths(avg, own.visibilityPct)
    const set = `top-${countWord(top3.length)} average visibility of ${avg.toFixed(1)}%`
    if (x === 0) return { lead: 'Top-tier distance:', text: `${brand} matches the ${set}.` }
    return { lead: 'Top-tier distance:', text: `${brand} is ${points(x)} percentage points ${x > 0 ? 'below' : 'above'} the ${set}.` }
  }

  function peerCluster(): Bullet | null {
    if (others.length < 2) return null
    const i = d.brands.findIndex((b) => b.isOwn)
    const above = d.brands.slice(0, i)
    const below = d.brands.slice(i + 1)
    const peers = !above.length ? below.slice(0, 2) : !below.length ? above.slice(-2) : [above[above.length - 1], below[0]]
    const values = [own.visibilityPct, ...peers.map((b) => b.visibilityPct)]
    const x = tenths(Math.max(...values), Math.min(...values))
    const [p1, p2] = peers
    if (x === 0) return { lead: 'Peer cluster:', text: `${brand} sits at the same visibility as ${p1.name} and ${p2.name}.` }
    return { lead: 'Peer cluster:', text: `${brand} sits within a ${points(x)}-point visibility range alongside ${p1.name} and ${p2.name}.` }
  }
```

`write`'s return becomes:

```ts
  return {
    context: context(),
    methodology: methodology(),
    current: { competitive_bullets: citedSourcesBox(), sources_bullets: competitiveBox() },
    v2: { competitive_bullets: firstBox(), sources_bullets: secondBox() },
  }
```

and `dataSentences` returns `w.current.competitive_bullets` and `w.current.sources_bullets` in place of `w.v2`'s.

`lib/aeo-outbound/config.ts:33-36`: the comment gains a sentence and the value becomes 3:

```ts
/** Spec v1.1 §19.5, §19.11: the version of the code-written sentences (sentences.ts). Bump it whenever their wording or
 *  rounding changes, so an edited sentence on an older row is never compared word for word with today's. Version 2
 *  (2026-10-20): source-mix whole numbers round the exact share, as Peec does (sentences.ts sharePctAll). Version 3
 *  (2026-10-22): the findings bullets follow Ryan's per-page wording (spec 2026-10-22). */
export const SENTENCES_VERSION = 3
```

(The singular "1 retrieved citation" is a grammar detail the spec leaves open; ledger it as a ruling.)

- [ ] **Step 4: Run them to verify they pass**

Run: `perl -e 'alarm 280; exec @ARGV' -- npx vitest run lib/aeo-outbound components/aeo-outbound app/actions app/tools app/api/aeo-outbound`
Expected: PASS, every file. The live-shape and PocketGuard expectations are exact; if one differs, find why before changing the expectation (each value is derived in the spec §3 or above).

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/sentences.ts lib/aeo-outbound/config.ts lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/config.test.ts lib/aeo-outbound/generate.test.ts lib/aeo-outbound/grounding.test.ts
git commit -m "The findings bullets follow Ryan's per-page wording (round 3, question 1)

Cited Sources: citation volume, citation rate, source-type mix. Competitive Visibility: next-tier gap,
top-tier distance, peer cluster, then the competitor domain gaps. Whole percents in the mix as Ryan
writes them; the brand's casing on its own domain. SENTENCES_VERSION 3.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Older rows keep their numbers; the rename note skips the own domain (spec B3, B4)

**Files:**
- Modify: `lib/aeo-outbound/grounding.ts:8`, `:154`, `:253-254`
- Test: `lib/aeo-outbound/grounding.test.ts` (imports `:6`, new tests at the end)

**Interfaces:**
- Consumes: `boxesV2` (Task 1), the new boxes (Task 2).

- [ ] **Step 1: Write the failing tests**

`lib/aeo-outbound/grounding.test.ts:6` becomes `import { boxesV2, dataSentences } from './sentences'`. At the end:

```ts
// Spec 2026-10-22 B3: the brand at 33.3% visibility and 11.4% share of voice, six brands above it, share-of-voice gaps.
const BIG: PeecPull = {
  ...LIVE_SHAPE_PULL,
  brands: [
    ...([['kw_lead', 'Carefinder', 0.9, 0.4], ['kw_run', 'Caringly', 0.8, 0.2], ['kw_way', 'Seniorway', 0.7, 0.15], ['kw_pet', 'Petalcare', 0.6, 0.1], ['kw_x1', 'Xone', 0.5, 0.08], ['kw_x2', 'Xtwo', 0.45, 0.05]] as [string, string, number, number][])
      .map(([id, name, v, s]) => ({ brand: { id, name }, visibility: v, share_of_voice: s, position: 2 })),
    { brand: { id: 'kw_own', name: 'Example Senior Living' }, visibility: 0.333, share_of_voice: 0.114, position: 3 },
  ],
}

test('B3: a row written with version 2 or 1 gains no flag on the bullets it stored, numbers only those bullets print included', () => {
  for (const version of [2, 1]) {
    const d = { ...newRow(BIG), sentences: version } as SnapshotData
    expect(groundingFlags({ ...slotsFor(d), ...boxesV2(d) }, d, dataBlock(d))).toEqual([])
  }
})

test('B4: the rename note does not count the own domain printed in the brand\'s casing', () => {
  const name = 'Examplesenior'
  const p: PeecPull = { ...LIVE_SHAPE_PULL, roster: LIVE_SHAPE_PULL.roster.map((b) => (b.id === 'kw_own' ? { ...b, name } : b)), ownBrand: { ...LIVE_SHAPE_PULL.ownBrand, name }, brands: LIVE_SHAPE_PULL.brands.map((b) => (b.brand.id === 'kw_own' ? { ...b, brand: { ...b.brand, name } } : b)) }
  const d = newRow(p)
  const slots = { ...slotsFor(d), brand: 'New Co' }
  expect(slots.competitive_bullets[0].text).toBe('Examplesenior.com appears in 142 retrieved citations.')
  const note = (s: Slots) => groundingFlags(s, d, dataBlock(d)).find((n) => n.kind === 'brand_changed')?.text
  const without = { ...slots, competitive_bullets: [{ ...slots.competitive_bullets[0], text: 'It appears in 142 retrieved citations.' }, ...slots.competitive_bullets.slice(1)] }
  expect(note(slots)).toBe(note(without))
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/grounding.test.ts`
Expected: FAIL: B3 (the version 2 bullets' own numbers, such as "33%", "11%" and the gap to Carefinder, are flagged `number_not_in_data`) and B4 (the note counts one more place). Every other test passes.

- [ ] **Step 3: Implement**

`lib/aeo-outbound/grounding.ts:8` becomes `import { boxesV2, dataSentences, isCodeSentencePath, type DataSentences } from './sentences'`. Line 154 becomes:

```ts
    // Spec 2026-10-22 B3: a row written with an earlier sentences version also allows the numbers its version 2 boxes
    // print, so the bullets it stored never gain a flag. A row with no sentences (version 1) is unchanged.
    const older = typeof d.sentences === 'number' && d.sentences < SENTENCES_VERSION ? boxesV2(d) : null
    const boxes = [...s.competitive_bullets, ...s.sources_bullets, ...(older ? [...older.competitive_bullets, ...older.sources_bullets] : [])]
    const sentenceText = stripNames([s.context, s.methodology, ...boxes.flatMap((b) => [b.lead, b.text])].join(' | '))
```

`:253-254` become:

```ts
  if (d.brand && full.brand !== d.brand) {
    // Spec 2026-10-22 B4: the row's own domains (any case, with or without www.) are not the brand's name.
    const own = d.ownDomains.filter(Boolean).map((od) => new RegExp(`(?:www\\.)?${od.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'))
    const withoutOwn = (v: string) => own.reduce((t, re) => t.replace(re, ' '), v)
    const n = entries.filter(([p, v]) => p !== 'brand' && withoutOwn(v).split(full.brand).join(' ').includes(d.brand)).length
```

- [ ] **Step 4: Run them to verify they pass**

Run: `perl -e 'alarm 280; exec @ARGV' -- npx vitest run lib/aeo-outbound components/aeo-outbound`
Expected: PASS, every file (`v1-compat.test.ts` included: a version 1 row is untouched).

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/grounding.ts lib/aeo-outbound/grounding.test.ts
git commit -m "Older rows keep their bullets' numbers; the rename note skips the own domain (spec 2026-10-22 B3, B4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Whole suite, final review, draft PR

- [ ] **Step 1: Checks.** `npm test` to a file in the plan workspace (alarm 560, tool timeout 600000), `npx tsc --noEmit`, `npm run check:rsc`, and `npx eslint` on each changed file compared with `dev`. Expected: all pass; no new lint problem.
- [ ] **Step 2: Final review.** Fresh reviewer (`opus`) over `049352a8..HEAD` with the spec, this plan and the Review Focus. Critical and Important get one fix pass, RED then GREEN; minors listed in the PR.
- [ ] **Step 3: Draft PR to `dev`, no reviewer.** Title `feat(aeo-outbound): findings bullets follow Ryan's per-page wording → dev`. The body follows the round-3 descriptions' structure: Ryan's words (both lists), what changes, who sees it (new reports; older drafts keep their bullets and gain no flag), the decisions D1 to D6, how it was checked, docs, the round-3 merge order (this PR is fifth, after #414; with #415 whichever merges second sets `SENTENCES_VERSION` one higher), local checks at the head, deferred minors.

---

### Task 5: "Citations" in the pillar lines (spec D2), on #415's branch

**Files (branch `feat/aeo-outbound-opportunities`):**
- Modify: `lib/aeo-outbound/sentences.ts` (`pillarLines`, the `tail` and `missing` strings), `lib/aeo-outbound/config.ts` (`SENTENCES_VERSION` to 3, comment), `docs/superpowers/specs/2026-10-21-aeo-outbound-pillars-design.md` (P3 table and D4 note)
- Test: `lib/aeo-outbound/sentences.test.ts` (pillar tests), `lib/aeo-outbound/config.test.ts` (the version test)

- [ ] **Step 1: Failing tests.** In the pillar tests of `sentences.test.ts`, every "of the domain mix in this window." becomes "of citations in this window." and every "in the domain mix for this window." becomes "among citations in this window." (the test names that say "from the domain mix" say "from the citations"). In `config.test.ts` the version test expects 3 and says the pillar lines and Ryan's word changed it.
- [ ] **Step 2: Run** `perl -e 'alarm 200; exec @ARGV' -- npx vitest run lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/config.test.ts`. Expected: FAIL on those tests only.
- [ ] **Step 3: Implement.** In `pillarLines`, `const tail = 'of the domain mix in this window.'` becomes `const tail = 'of citations in this window.'` and `const missing = 'in the domain mix for this window.'` becomes `const missing = 'among citations in this window.'`. `SENTENCES_VERSION` becomes 3, its comment adding "Version 3 (2026-10-22): the pillar lines say "citations", Ryan's word (bullets spec D2)." The pillars spec P3 table takes the new wording and D4 notes the change.
- [ ] **Step 4: Run** `perl -e 'alarm 280; exec @ARGV' -- npx vitest run lib/aeo-outbound components/aeo-outbound`. Expected: PASS.
- [ ] **Step 5: Commit, push, and update #415's description** (the pillar examples say "of citations", and the merge note says whichever of #415 and the bullets PR merges second sets `SENTENCES_VERSION` one higher).
