# AEO Outbound Executive Summary and competitor gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two of Ryan's round-3 items, exactly as he worded them: "Changing headline signal page title to Executive Summary", and for the Competitor domain gaps "Only include competitor domains".

**Architecture:** A new report's page words get `headline_label: 'Executive Summary'` from `pageDefaults`; older rows keep `PAGE_WORDS_V1`. `buildSnapshotData` lists the own sites of the competitors the report compares (by roster domain, or Peec's `COMPETITOR` class plus a mention of a compared competitor) where the brand does not appear. The Data block line Glean reads says so on version 2 rows. The bullet wording and `SENTENCES_VERSION` do not change.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-aeo-outbound-exec-summary-competitor-gaps-design.md` (E1 to E4 in §3, edge cases §5, tests §6, decisions D1 to D4 decided in §7, minors §9 and §10; review log beside it).

## Global Constraints

- Branch `feat/aeo-outbound-exec-summary-competitor-gaps` off `dev` (`5fedaa52`). The PR targets `dev`, opens as a **draft with no reviewer**, and waits with the rest of round 3 for my word to go to Paul. Nothing merges without my "merge".
- `PAGE_WORDS_V1` unchanged (`config.ts:74` stays "Headline signal"). `SENTENCES_VERSION` stays 2. No `PAGE_KEYS`, contract schema, settings, migration or AIVx file change.
- Label text exactly `Executive Summary`. Data line text for a version 2 row exactly `Competitor domain gaps (competitors' own sites where the brand does not appear, by answers that used them): ...`; a version 1 row keeps today's text.
- Rule per spec E2 with D1 (brand mentioned: never a gap), D3 (a `COMPETITOR` site off every kept competitor's roster domains needs a kept competitor in its mentions), D4 (a) (a non-kept competitor's roster domain or subdomain never counts). Own wins over competitor.
- `v1-compat.test.ts` passes unchanged.
- Writing: no em or en dashes; sentence case; first person.
- Git: `git status --porcelain` before every commit; named files only; push after every commit. Bound long commands with `perl -e 'alarm N; exec @ARGV' --`.

## Review Focus

1. **A draft made before this ships** keeps its stored `gapDomains`, its bullet and its grounding. Pinned in Task 2 (older-row grounding test) and by `v1-compat.test.ts`.
2. **No competitors tracked, but Peec still reports another brand's row** must list no site, even a `COMPETITOR` site naming that brand. Pinned in Task 2.
3. **`rankAmong` set** (it is read from live settings, `generate.ts:52`): a cut competitor's own sites never count, even a `COMPETITOR` comparison page that mentions a kept one. Pinned in Task 2.
4. **Own and a competitor sharing a domain**: own wins. Pinned in Task 2.
5. **A roster domain written with `www.`, or a blank roster entry**: matches with or without `www.` on either side; a blank entry matches nothing. Pinned in Task 2.

---

### Task 1: Executive Summary on new reports (spec E1, D2)

**Files:**
- Modify: `lib/aeo-outbound/config.ts` (after `PAGE_WORDS_V1`, which closes at `:101`), `lib/aeo-outbound/slots.ts:5`, `:75-78`
- Test: `lib/aeo-outbound/slots.test.ts:3`, `:139-141`; `lib/aeo-outbound/render.test.ts:5` and a new test after `:101`

**Interfaces:**
- Produces: `HEADLINE_LABEL = 'Executive Summary'` (config). Nothing later consumes it.

- [ ] **Step 1: Write the failing test**

In `lib/aeo-outbound/slots.test.ts`, line 3 becomes:

```ts
import { HEADLINE_LABEL, PAGE_WORDS_V1 } from './config'
```

Replace the test at `:139-141` with:

```ts
test('a new row takes the section titles and wordmark from settings, "Executive Summary" as its headline label (Ryan, round 3), and every other word from v1.0', () => {
  expect(HEADLINE_LABEL).toBe('Executive Summary')
  expect(pageDefaults({ sectionTitles: ['Strengths', 'Gaps'], sidebarWordmark: 'Avenue Z', series: 'AEO Lens Report' })).toEqual({ ...PAGE_WORDS_V1, headline_label: 'Executive Summary', section_1_title: 'Strengths', section_2_title: 'Gaps', sidebar_wordmark: 'Avenue Z', series: 'AEO Lens Report' })
  expect(PAGE_WORDS_V1.headline_label).toBe('Headline signal')
})
```

The test at `:130` (`withDefaults` fills `headline_label: 'Headline signal'` on a row from before v1.1) stays as is: it pins that older rows keep the old word.

In `lib/aeo-outbound/render.test.ts`, line 5 becomes `import { pageDefaults, slotEntries, withDefaults } from './slots'`, and after the test ending at `:101` add (final review m1: the word reaches both places it shows):

```ts
test('round 3: a new row reads Executive Summary in menu item 01 and as the headline section label', () => {
  const page = pageDefaults({ sectionTitles: ['Category data', 'Competitive visibility'], sidebarWordmark: 'Avenue Z', series: 'AI Visibility Snapshot' })
  const h = renderSnapshotHtml(DATA, { ...SLOTS, page }, 'final', 'Oct 9, 2026')
  expect(h).toContain('<a href="#headline"><span class="nav-num">01</span> Executive Summary</a>')
  expect(h).toContain('<div class="exec-label">Executive Summary</div>')
  expect(h).not.toContain('Headline signal')
})
```

(AIVx's stylesheet already holds a `/* ── Executive Summary` comment, so the test asserts the two elements, not the bare words. Both strings were measured on a final render before writing this plan.)

**Merging with #415.** #415 edits the same three places (`slots.ts:5`, the `pageDefaults` return, `slots.test.ts:139-141`). Whichever merges second keeps both: the import holds `HEADLINE_LABEL` and `PILLARS_TITLE`; `pageDefaults` returns `{ ...V1_WORDS, headline_label: HEADLINE_LABEL, section_1_title: ..., section_2_title: ..., sidebar_wordmark: ..., series: ..., opps_title: PILLARS_TITLE }`; the test expects both words.

- [ ] **Step 2: Run it to verify it fails**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/slots.test.ts lib/aeo-outbound/render.test.ts`
Expected: FAIL. `HEADLINE_LABEL` is not exported, so the slots test fails (`expected undefined to be 'Executive Summary'`), and the render test fails (the page says "Headline signal"); every other test passes.

- [ ] **Step 3: Implement**

`lib/aeo-outbound/config.ts`, directly after the closing `}` of `PAGE_WORDS_V1` (`:101`):

```ts
/** Round 3 (Ryan, 2026-10-21): the headline section's label and menu item 01 on a new report. A row from before keeps
 *  its stored word, or "Headline signal" from PAGE_WORDS_V1. */
export const HEADLINE_LABEL = 'Executive Summary'
```

`lib/aeo-outbound/slots.ts:5` becomes:

```ts
import { HEADLINE_LABEL, NEEDS_VALIDATION, PAGE_WORDS_V1 } from './config'
```

`lib/aeo-outbound/slots.ts:75-78` becomes:

```ts
/** The page words a new row is created with: v1.0's, with the section titles, wordmark and report name from settings (v1.1 §3),
 *  and "Executive Summary" as the headline label (Ryan, round 3). */
export function pageDefaults(s: { sectionTitles: readonly string[]; sidebarWordmark: string; series: string }): PageWords {
  return { ...V1_WORDS, headline_label: HEADLINE_LABEL, section_1_title: s.sectionTitles[0], section_2_title: s.sectionTitles[1], sidebar_wordmark: s.sidebarWordmark, series: s.series }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/slots.test.ts lib/aeo-outbound/render.test.ts lib/aeo-outbound/v1-compat.test.ts lib/aeo-outbound/config.test.ts`
Expected: PASS, every test in the four files.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/config.ts lib/aeo-outbound/slots.ts lib/aeo-outbound/slots.test.ts lib/aeo-outbound/render.test.ts
git commit -m "New reports label the headline section Executive Summary (Ryan, round 3)

Older rows keep their stored word, or Headline signal from PAGE_WORDS_V1.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: The gaps list holds competitors' own sites (spec E2, E4, D1, D3, D4 (a))

**Files:**
- Modify: `lib/aeo-outbound/metrics.ts:247-257`, `lib/aeo-outbound/config.ts:9`, `lib/aeo-outbound/contracts.ts:76`, `lib/aeo-outbound/__fixtures__/sentences-live-shape.ts:1-3`, `:46`
- Test: `lib/aeo-outbound/metrics.test.ts:76-79`, `:239-262`; `lib/aeo-outbound/sentences.test.ts:36`, `:149-156`; `lib/aeo-outbound/grounding.test.ts` (after `:293`)

**Interfaces:**
- Consumes: `keptIds` (`metrics.ts:147`), `competitorsTracked` (`:161`), `ownMatch` (`:217`), `bare` (`:126`), all already defined above the gap code.
- Produces: `SnapshotData.gapDomains` keeps its type, `{ domain: string; retrievedChats: number }[]` (`metrics.ts:54`); only which rows it holds changes. Task 3 does not consume it.

- [ ] **Step 1: Write the failing tests**

**`lib/aeo-outbound/metrics.test.ts`.** Replace `:76-79` with:

```ts
test('competitor gap domains: a compared competitor\'s own site where the brand is absent, ranked by retrieved chats (Ryan, round 3)', () => {
  const d = buildSnapshotData(PULL, '2026-10-08T15:00:00Z')
  expect(d.gapDomains).toEqual([{ domain: 'alpha.com', retrievedChats: 1250 }])
})
```

Replace `:239-262` (the cap test, the `gapRow` helper, the exclusions test and the zero-chats test) with:

```ts
test('competitor gap domains are capped at 4, the top by retrieved chats', () => {
  const gap = (n: number) => ({ domain: `gap${n}.com`, classification: 'COMPETITOR', retrieved_chat_count: 100 * n, retrieval_count: 1, usage_rate: 1, mentioned_brands: [{ id: 'kw_a' }] })
  const d = buildSnapshotData({ ...PULL, domains: [...PULL.domains.filter((r) => r.domain === 'example.com'), ...[1, 2, 3, 4, 5].map(gap)] }, '2026-10-08T15:00:00Z')
  expect(d.gapDomains.map((g) => g.domain)).toEqual(['gap5.com', 'gap4.com', 'gap3.com', 'gap2.com'])
})

const gapRow = (domain: string, classification: string, chats = 100, mentioned = ['kw_a']) => ({ domain, classification, retrieved_chat_count: chats, retrieval_count: 1, usage_rate: 1, mentioned_brands: mentioned.map((id) => ({ id })) })
const gapsOf = (p: PeecPull, decisions?: MetricDecisions) => buildSnapshotData(p, '2026-10-08T15:00:00Z', decisions).gapDomains.map((g) => g.domain)

test('a competitor site counts by its roster domain or a subdomain, whatever its class and mentions; a third-party site never does', () => {
  const domains = [
    gapRow('www.beta.com', 'CORPORATE', 90, []),
    gapRow('shop.alpha.com', 'EDITORIAL', 80, []),
    gapRow('notalpha.com', 'EDITORIAL', 70),
    gapRow('rival-site.com', 'COMPETITOR', 60),
    gapRow('forum.com', 'UGC', 50),
  ]
  expect(gapsOf({ ...PULL, domains })).toEqual(['www.beta.com', 'shop.alpha.com', 'rival-site.com'])
})

test('a roster domain matches with or without www. on either side, and a blank roster entry matches nothing', () => {
  const roster = PULL.roster.map((b) => (b.id === 'kw_b' ? { ...b, domains: ['www.beta.com', ' '] } : b))
  const domains = [gapRow('beta.com', 'CORPORATE', 90, []), gapRow('trailing.com.', 'CORPORATE', 80, [])]
  expect(gapsOf({ ...PULL, roster, domains })).toEqual(['beta.com'])
})

test('the brand\'s own site never counts, and own wins when a competitor\'s roster shares its domain', () => {
  const roster = PULL.roster.map((b) => (b.id === 'kw_a' ? { ...b, domains: ['alpha.com', 'example.com'] } : b))
  const domains = [gapRow('mine.com', 'OWN'), gapRow('blog.example.com', 'COMPETITOR', 90), gapRow('help.example.com', 'CORPORATE', 80, []), gapRow('alpha.com', 'COMPETITOR', 50)]
  expect(gapsOf({ ...PULL, roster, domains })).toEqual(['alpha.com'])
})

test('a competitor site that mentions the brand is never a gap (decision D1)', () => {
  const domains = [gapRow('alpha.com', 'COMPETITOR', 100, ['kw_a', 'kw_own']), gapRow('beta.com', 'CORPORATE', 90, ['kw_own']), gapRow('compare.alpha.com', 'COMPETITOR', 10)]
  expect(gapsOf({ ...PULL, domains })).toEqual(['compare.alpha.com'])
})

test('a COMPETITOR site off every compared competitor\'s roster domains needs one in its mentions; a roster site with none still counts (decision D3)', () => {
  const domains = [gapRow('rival-site.com', 'COMPETITOR', 100, []), gapRow('other.com', 'COMPETITOR', 90, ['kw_x']), gapRow('alpha.com', 'CORPORATE', 10, [])]
  expect(gapsOf({ ...PULL, domains })).toEqual(['alpha.com'])
})

test('a compared brand with no roster row is matched by Peec\'s class only (spec §10 r2-3)', () => {
  const brands = [...PULL.brands, { brand: { id: 'kw_c', name: 'Gamma' }, visibility: 0.05, share_of_voice: 0.05, position: 4 }]
  const domains = [gapRow('gamma.com', 'COMPETITOR', 100, ['kw_c']), gapRow('gamma-news.com', 'EDITORIAL', 90, ['kw_c'])]
  expect(gapsOf({ ...PULL, brands, domains })).toEqual(['gamma.com'])
})

test('a competitor cut by rankAmong never counts, even on a COMPETITOR page that mentions a compared one (decision D4 (a))', () => {
  const domains = [gapRow('beta.com', 'CORPORATE', 100, []), gapRow('compare.beta.com', 'COMPETITOR', 90), gapRow('beta-vs.com', 'COMPETITOR', 80, ['kw_b']), gapRow('alpha.com', 'COMPETITOR', 70)]
  // rankAmong 2 keeps the brand and Alpha (26.1%); Beta (18.5%) is cut.
  expect(gapsOf({ ...PULL, domains }, { rankAmong: 2, competitorSiteGaps: true, sourceMixWeight: 'usage_rate' })).toEqual(['alpha.com'])
})

test('with no competitors tracked no site is listed, even a COMPETITOR site naming a brand Peec still reports', () => {
  const brands = [PULL.brands[1], { brand: { id: 'kw_s', name: 'Strayco' }, visibility: 0.3, share_of_voice: 0.2, position: 2 }]
  expect(gapsOf({ ...PULL, roster: [PULL.roster[0]], brands, domains: [gapRow('stray.com', 'COMPETITOR', 100, ['kw_s'])] })).toEqual([])
})

test('a domain with no retrieved chats is never a gap, so a sentence cannot list one "at 0" (final review M3)', () => {
  const domains = [gapRow('open.com', 'COMPETITOR', 40), gapRow('zero.com', 'COMPETITOR', 0), { ...gapRow('none.com', 'COMPETITOR'), retrieved_chat_count: null }]
  const d = buildSnapshotData({ ...PULL, domains }, '2026-10-08T15:00:00Z')
  expect(d.gapDomains).toEqual([{ domain: 'open.com', retrievedChats: 40 }])
})
```

`PeecPull` and `MetricDecisions` are already imported at `metrics.test.ts:4-6`.

**`lib/aeo-outbound/__fixtures__/sentences-live-shape.ts`.** Lines 1-3 become:

```ts
// Synthetic (spec v1.1 §19.10). Shaped like the 2026-10-14 live dev run: five brands, one far ahead, a brand at 0
// visibility, one own site at the top of the domains, an institutional-heavy source mix and two competitor domain
// gaps (round 3): one by a roster domain, one by Peec's COMPETITOR class. Every name and domain is made up; no prospect's data.
```

Insert, directly before the `rival-landing.example` row (`:46`):

```ts
    row('caringly.example', 'CORPORATE', 8, 9, []),
```

Measured before writing this plan (scratch run of `buildSnapshotData` and `dataSentences` on today's code with and without this row): every bullet but the gaps one reads the same, including "Institutional sources at 62% and Corporate sources at 22%; Editorial represents 2.7% and UGC 3.7%".

**`lib/aeo-outbound/sentences.test.ts`.** Line 36 becomes:

```ts
    { lead: 'Competitor domain gaps:', text: 'The largest gaps include caringly.example at 8 retrievals and rival-landing.example at 5.' },
```

Replace `:149-156` with:

```ts
test('competitor domain gaps: none, one, two, thousands; a competitor\'s roster site with no mentions counts', () => {
  const base = brandPull([['a', 'A', 0.3, 0.3], ['own', 'Own', 0.2, 0.2]])
  const gap = (domain: string, chats: number) => ({ domain, classification: 'COMPETITOR', retrieved_chat_count: chats, retrieval_count: 1, usage_rate: 1, mentioned_brands: [{ id: 'a' }] })
  const leads = (domains: PeecPull['domains']) => sent({ ...base, domains: [...base.domains, ...domains] }).sources_bullets.map((b) => b.lead)
  expect(leads([])).toEqual(['Leadership gap:', 'Source mix:'])
  expect(sent({ ...base, domains: [...base.domains, gap('one.example', 12)] }).sources_bullets[1].text).toBe('The largest gaps include one.example at 12 retrievals.')
  expect(sent({ ...base, domains: [...base.domains, gap('one.example', 1200), gap('two.example', 9)] }).sources_bullets[1].text).toBe('The largest gaps include one.example at 1.2K retrievals and two.example at 9.')
  expect(sent({ ...base, domains: [...base.domains, { ...gap('a.example', 30), classification: 'CORPORATE', mentioned_brands: [] }] }).sources_bullets[1].text).toBe('The largest gaps include a.example at 30 retrievals.')
})
```

(`brandPull` gives brand `a` the roster domain `a.example`, `sentences.test.ts:15`.)

**`lib/aeo-outbound/grounding.test.ts`.** After the test ending at `:293`, add (spec §9 m8, §10 r2-4):

```ts
test('round 3: a Glean field naming a listed competitor site is not flagged; on an older row whose list does not hold it, it still is', () => {
  const d = newRow()
  expect(d.gapDomains.map((g) => g.domain)).toEqual(['caringly.example', 'rival-landing.example'])
  const why = 'Answers lean on caringly.example for the category.'
  expect(flagsFor(d, { why })).toEqual([])
  const older = { ...d, gapDomains: [{ domain: 'health-institute.gov', retrievedChats: 115 }] }
  expect(flagsFor(older, { why }).map((n) => `${n.kind} ${n.path}: ${n.text}`)).toEqual(['domain_not_in_data why: "caringly.example" is not a domain in the Peec data'])
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/metrics.test.ts lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/grounding.test.ts`
Expected: FAIL, because today's code lists third-party sites and drops every `COMPETITOR` or roster site:
- `metrics.test.ts`: the alpha.com test (gets `forum.com`), the cap test, the roster-domain test, the `www.` test, the own test, D1, D3, r2-3, D4 (a) and zero-chats tests fail. The no-competitors test **passes** (today's code already lists nothing there); it guards the new code's `competitorsTracked === 0` branch, since `keptIds` holds Strayco.
- `sentences.test.ts`: the live-shape test (line 36) and the gaps test fail.
- `grounding.test.ts`: the new test fails on its first expectation (`gapDomains` is the third-party list).
Every other test passes.

- [ ] **Step 3: Implement**

`lib/aeo-outbound/metrics.ts:247-257` (from `const competitorIds` through the `.filter((r) => { ... })` close) becomes:

```ts
  // Round 3 (Ryan, 2026-10-21: "Only include competitor domains"): the gaps are the own sites of the competitors the
  // report compares (keptIds), where the brand does not appear. A site is a compared competitor's when its domain is one
  // of that competitor's roster domains or a subdomain of one, or Peec classifies it COMPETITOR and it mentions a
  // compared competitor. The brand's own site never counts (own wins), nor does a site of a competitor cut by rankAmong
  // (spec 2026-10-21 E2, D1, D3, D4 (a)). With no competitors tracked the report names no outside brand, so it lists none.
  const rosterSites = (keep: (id: string) => boolean) => pull.roster.filter((b) => keep(b.id)).flatMap((b) => (b.domains ?? []).map(bare)).filter(Boolean)
  const keptSites = rosterSites((id) => keptIds.has(id))
  const cutSites = rosterSites((id) => id !== pull.ownBrand.id && !keptIds.has(id))
  const within = (d: string, sites: string[]) => sites.some((s) => d === s || d.endsWith(`.${s}`))
  const gapDomains = !decisions.competitorSiteGaps || competitorsTracked === 0 ? [] : pull.domains
    .filter((r) => {
      // A domain no answer retrieved is not a gap worth naming (final review M3).
      if ((r.retrieved_chat_count ?? 0) <= 0) return false
      const d = bare(r.domain)
      if (r.classification === 'OWN' || within(d, ownMatch) || within(d, cutSites)) return false
      const ids = new Set(r.mentioned_brands.map((m) => m.id))
      if (ids.has(pull.ownBrand.id)) return false
      return within(d, keptSites) || (r.classification === 'COMPETITOR' && [...ids].some((id) => keptIds.has(id)))
    })
```

The `.sort(...)`, `.slice(0, 4)` and `.map(...)` lines after it (`:258-260`) are unchanged. `competitorIds`, `rosterDomains` and `isRosterSite` are gone; confirm nothing else used them:

Run: `grep -n "competitorIds\|rosterDomains\|isRosterSite" lib/aeo-outbound/metrics.ts`
Expected: no output.

`lib/aeo-outbound/config.ts:9` becomes:

```ts
  /** Q4: list competitors' own sites where the brand does not appear, ranked by AI answers that used them (Ryan, round 3,
   *  2026-10-21: "Only include competitor domains"; metrics.ts gapDomains). */
```

`lib/aeo-outbound/contracts.ts:76` becomes:

```ts
  // mentioned_brands keeps a site the brand appears on out of the competitor domain gaps, and ties a COMPETITOR site off the
  // roster to a compared competitor (often an empty array); the domain is printed in the sentences.
```

- [ ] **Step 4: Run them to verify they pass**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/metrics.test.ts lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/grounding.test.ts lib/aeo-outbound/v1-compat.test.ts lib/aeo-outbound/config.test.ts lib/aeo-outbound/contracts.test.ts`
Expected: PASS, every test in the six files.

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/metrics.ts lib/aeo-outbound/config.ts lib/aeo-outbound/contracts.ts lib/aeo-outbound/__fixtures__/sentences-live-shape.ts lib/aeo-outbound/metrics.test.ts lib/aeo-outbound/sentences.test.ts lib/aeo-outbound/grounding.test.ts
git commit -m "Competitor domain gaps list competitors' own sites where the brand does not appear (Ryan, round 3)

A site counts when it is a compared competitor's roster domain or a subdomain of one, or Peec
classifies it COMPETITOR and it mentions a compared competitor. Own wins, a competitor cut by
rankAmong never counts, a site that mentions the brand never counts, and with no competitors
tracked nothing is listed. This reverses the v1 design, which listed third-party sites on purpose
(2026-10-08 spec line 218). Rows made before keep their stored list.

Edge cases in the code touched (Peec domain rows, already validated by the contract):
- External failure: none here, a pure function over the pulled data. decline
- Operator visibility: an empty list leaves the bullet out with no note, as today. decline
- Bounds: top 4; roster domains are a handful per brand. decline
- Input boundaries: domains ?? [], blank roster entries skipped, null chats read as 0;
  mentioned_brands is an enforced array (contracts.ts). fix (blank entries, tested)
- State and concurrency: none, no shared state. decline
- Security: domains print as text through the existing escaping, unchanged. decline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: The Data line says what the list holds (spec E3, §9 m5)

**Files:**
- Modify: `lib/aeo-outbound/prompt.ts:57`
- Test: `lib/aeo-outbound/prompt.test.ts` (after the test ending at `:105`, so `line` and `D2` are defined)

**Interfaces:**
- Consumes: `v2` (`prompt.ts:33`), already in scope in `dataBlock`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

In `lib/aeo-outbound/prompt.test.ts`, after the test ending at `:105`, add:

```ts
test('round 3: a version 2 row says the gaps are competitors\' own sites; a version 1 row keeps its words', () => {
  expect(line(D2, 'Competitor domain gaps')).toBe("Competitor domain gaps (competitors' own sites where the brand does not appear, by answers that used them): alpha.com 1,250")
  expect(line({ ...D2, gapDomains: [] } as unknown as SnapshotData, 'Competitor domain gaps')).toBe("Competitor domain gaps (competitors' own sites where the brand does not appear, by answers that used them): none")
  expect(line(D, 'Competitor domain gaps')).toBe('Competitor domain gaps (sites where competitors appear and the brand does not, by answers that used them): alpha.com 1,250')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/prompt.test.ts`
Expected: FAIL on the first expectation (the version 2 row still prints "sites where competitors appear and the brand does not"); every other test passes.

- [ ] **Step 3: Implement**

`lib/aeo-outbound/prompt.ts:57` becomes:

```ts
    `Competitor domain gaps (${v2 ? "competitors' own sites where the brand does not appear" : 'sites where competitors appear and the brand does not'}, by answers that used them): ${d.gapDomains.map((g) => `${one(g.domain)} ${n(g.retrievedChats)}`).join('; ') || 'none'}`,
```

- [ ] **Step 4: Run it to verify it passes, with the version 1 pin**

Run: `perl -e 'alarm 120; exec @ARGV' -- npx vitest run lib/aeo-outbound/prompt.test.ts lib/aeo-outbound/v1-compat.test.ts lib/aeo-outbound/grounding.test.ts lib/aeo-outbound/generate.test.ts`
Expected: PASS, every test in the four files (`v1-compat.test.ts:14-16` still matches `v1-row.ts:64` word for word).

- [ ] **Step 5: Commit and push**

```bash
git status --porcelain
git add lib/aeo-outbound/prompt.ts lib/aeo-outbound/prompt.test.ts
git commit -m "The Data block tells Glean the gaps are competitors' own sites, on version 2 rows (Ryan, round 3)

A version 1 row keeps its words, pinned by v1-compat. Grounding reads only the line's domains and
numbers, so an older version 2 draft's flags do not change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 4: Whole suite, then the draft PR

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run the checks CI runs**

Run: `perl -e 'alarm 500; exec @ARGV' -- npm test > .superpowers/sdd/2026-10-21-aeo-outbound-exec-summary-competitor-gaps/suite.txt 2>&1; tail -8 .superpowers/sdd/2026-10-21-aeo-outbound-exec-summary-competitor-gaps/suite.txt`
Expected: every test file passes; the counts are the dev baseline plus the tests added here.

Run: `perl -e 'alarm 300; exec @ARGV' -- npm run typecheck`
Expected: no errors.

Run: `perl -e 'alarm 300; exec @ARGV' -- npm run lint`
Expected: the same result as on `dev`: the one error at `app/tools/new-business/[reportId]/page.tsx:32` (`Date.now`) and the editor's 3 warnings, which predate this branch. Nothing new.

- [ ] **Step 2: Final review**

Fresh reviewer (model `opus`) over `git merge-base dev HEAD..HEAD`, with this plan, the spec and the Review Focus. Critical and Important get one fix pass, each RED then GREEN; minors are listed in the PR.

- [ ] **Step 3: Open the draft PR to `dev`, no reviewer**

Title: `AEO Outbound: Executive Summary, and competitor domains in the gaps bullet (Ryan, round 3) → dev`.

The body states, in first person: what Ryan asked (both quotes); what changes for new reports; that drafts in flight and approved reports do not change; the design reversal (v1 listed third-party sites on purpose, 2026-10-08 spec line 218, and Ryan's feedback replaces it); decisions D1 to D4; that a Glean field naming a listed competitor site is no longer flagged (spec §8); the overlaps with #415 (`pageDefaults`) and the pending bullets PR; the raw test, typecheck and lint output; deferred minors (§9 m3: one competitor's subdomains can fill all four places).

```bash
gh pr create --draft --base dev --head feat/aeo-outbound-exec-summary-competitor-gaps --title "..." --body-file <body file>
```

Then bind it with the ccd_pr tools. No reviewer is requested.
