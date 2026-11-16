# Cited Sources counts real citations: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (chosen: native, one fresh opus review of the
> whole branch at the end). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Citation volume and Citation rate become two different, totalled stats built on Peec's real citation fields,
and the source mix, donut and pillars count citations too, without changing any stored report.

**Architecture:** The pull reads three more fields per domain row and, only when several own sites are cited, makes one
extra domains call by answer. Metrics stores one new `citations` object. Sentences write the new Cited Sources box only
when `citations` is present; every older row keeps today's box, frozen as `citedSourcesBoxV3`.

**Tech stack:** TypeScript, Next.js 16, zod contracts (`lib/aeo-outbound/contracts.ts`), vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-aeo-outbound-cited-sources-citations-design.md` (S1 to S5, the edge table,
the minor lists of rounds 1 and 2). Evidence: `docs/findings/2026-11-02-aeo-outbound-citation-total.md`.

## Global constraints

- Older rows (sentences 1, 2, 3, or none) print exactly what they print today: same boxes, same grounding result.
- Shares in S1 print with `sliceLabel` ("<1%" reads "under 1%", ">99%" reads "over 99%"), so they read as the donut's
  "You" slice does.
- A spent deadline still fails the report. Any other failure of the extra call leaves the rate out with a note.
- No em or en dashes in any sentence the code writes.
- Commit named files only; push after every commit.

## Review focus

1. A project where the brand's only cited site ties a non-own site at the top: "tied for most cited", never "the most-cited".
2. A project where every cited site is the brand's own (N counts own rows): the sentence must not read "of 1".
3. Several own rows where only one is cited: no extra call, C from that row, subject is the domain.
4. A version 3 row re-saved after the change: its stored bullets pass grounding with no new flags.
5. The extra call returning a row without `chat.id`: contract violation, caught, rate left out, report still generates.

## Rulings made while planning

- **TS types.** `citation_count`, `cited_chat_count`, `total_chat_count` are required `number` on `DomainRow` (the
  contract enforces them on every row), so the compiler finds every fixture that must state them. Fixtures that stand
  for today's data get `citation_count` equal to their `usage_rate`, so every source-mix expectation stays the same.
- **Older-row tests.** A test of today's (version 3) Cited Sources box builds its row and removes `citations`, which is
  exactly what a stored version 3 row is.
- **N = 1** (the brand's own site is the only cited site): "the only cited site". Not in the spec table; the alternative
  "the most-cited site of 1" reads badly. Cost if wrong: one sentence variant.
- **Extra-call filter values:** every own row's domain, as the spec says (an uncited row adds no citing answer).

## Files

- Create `lib/aeo-outbound/own-rows.ts`: `ownDomainMatch`, `ownRowsOf` (the one own-row match). Test `own-rows.test.ts`.
- Modify `pull.ts` (DomainRow, PeecPull, the extra call), `contracts.ts` (domains report, `peec.own_cited_chats`,
  STORED_DATA), `config.ts` (weight, SENTENCES_VERSION 4, CONTRACT_MODES), `metrics.ts` (helper, `citations`),
  `sentences.ts` (new box, frozen V3, `boxesV3`, OLDER_BOXES[3]), `prompt.ts` (data block, terms), `sweep-checks.ts`.
- Tests: own-rows, pull, contracts, config, metrics, sentences, grounding, prompt, sweep-checks; fixtures
  `__fixtures__/sentences-live-shape.ts` and any inline DomainRow fixtures tsc reports.

---

### Task 1: One own-row match

**Produces:** `ownDomainMatch(domains: readonly string[] | null | undefined): string[]` and
`ownRowsOf<R extends { domain: string; classification: string }>(rows: R[], ownDomains): R[]`.

- [ ] Write `own-rows.test.ts`: OWN class matches; an own domain and its subdomain match (`www.` and case ignored); a
  look-alike (`notexample.com`) does not; an empty own domain never matches by suffix; null domains match OWN rows only.
- [ ] Run `npx vitest run lib/aeo-outbound/own-rows.test.ts`. Expected: FAIL, module not found.
- [ ] Implement:

```ts
// The brand's own domain rows, one definition for the pull and the metrics (spec 2026-11-02 S2).
const bare = (d: string) => d.trim().toLowerCase().replace(/^www\./, '')

/** The own domains as rows are matched against: bare, with empty entries dropped so one can never match by suffix. */
export const ownDomainMatch = (domains: readonly string[] | null | undefined): string[] => (domains ?? []).map(bare).filter(Boolean)

/** A row is own when Peec classifies it OWN, or its domain is an own domain or a subdomain of one (spec 18.2). */
export function ownRowsOf<R extends { domain: string; classification: string }>(rows: readonly R[], ownDomains: readonly string[] | null | undefined): R[] {
  const match = ownDomainMatch(ownDomains)
  return rows.filter((r) => {
    if (r.classification === 'OWN') return true
    const d = bare(r.domain)
    return match.some((od) => d === od || d.endsWith(`.${od}`))
  })
}
```

- [ ] `metrics.ts:225-230`: `const ownMatch = ownDomainMatch(pull.ownBrand.domains)` and
  `const ownRows = ownRowsOf(pull.domains, pull.ownBrand.domains)`. `ownMatch` stays for the gap filter (`:293`).
- [ ] Run own-rows and metrics tests. Expected: PASS (no behavior change). Commit, push.

### Task 2: Contracts, config and the row type

- [ ] Tests first (`contracts.test.ts`, `config.test.ts`):
  - `peec.domains_report` refuses a row missing `citation_count`, `cited_chat_count` or `total_chat_count`, or with a
    negative, fractional or string value; accepts a row with no `usage_rate`; still refuses a negative `usage_rate`.
  - `peec.own_cited_chats` accepts `{ domain, chat: { id }, citation_count }` rows; refuses a missing `chat.id` or a
    negative count, with the message `peec.own_cited_chats.<field>`.
  - STORED_DATA accepts `citations` absent, accepts the full object (with `citedAnswers: null`, `topSite: null`), and
    refuses a wrong shape; `sourceMixWeight: 'citation_count'` is accepted.
  - `DECISIONS.sourceMixWeight` is `citation_count`; `SENTENCES_VERSION` is 4; CONTRACT_MODES has
    `peec.own_cited_chats: 'enforce'`.
- [ ] Run them. Expected: FAIL on each new assertion.
- [ ] Implement:
  - `contracts.ts:79`: add `citation_count: z.number().int().nonnegative(), cited_chat_count: z.number().int().nonnegative(),
    total_chat_count: z.number().int().nonnegative()`; `usage_rate: z.number().min(0).nullish()`.
  - Add `'peec.own_cited_chats': { enforce: z.array(z.looseObject({ domain: z.string().min(1), chat: z.looseObject({ id:
    z.string().min(1) }), citation_count: z.number().int().nonnegative() })), observe: z.unknown() }`.
  - STORED_DATA: `citations: z.looseObject({ own, total, answers: int >= 0, citedAnswers: int >= 0 nullable, citedSites,
    ownSitesCited: int >= 0, topSite: z.looseObject({ domain: z.string(), rank: int >= 1, tied: z.boolean() }).nullable()
    }).optional()`; add `'citation_count'` to the weight enum.
  - `config.ts`: weight `'citation_count'` (type union gains it; comment says why: Ryan's citation stats, 2026-11-02),
    `SENTENCES_VERSION = 4` with a version 4 line in its comment, CONTRACT_MODES entry.
  - `pull.ts` DomainRow: `citation_count: number; cited_chat_count: number; total_chat_count: number; usage_rate?: number | null`.
- [ ] Fix every fixture tsc reports (`npx tsc --noEmit -p .`): add the three fields; `citation_count` = the row's
  `usage_rate`, `cited_chat_count` = its `retrieved_chat_count`, `total_chat_count` = one window value.
- [ ] Run the whole aeo-outbound suite. Expected: only the tests of today's Cited Sources box and the pinned weight and
  version fail; those are handled in Tasks 4 and 5. Commit, push.

### Task 3: The pull

**Produces:** `PeecPull.ownCitedAnswers?: number | null`.

- [ ] Tests first (`pull.test.ts`), with a domains route that answers the `chat_id` call:
  - One cited own row (two own rows, one with 0 citations): no `chat_id` call, `ownCitedAnswers` absent.
  - Two cited own rows: exactly one extra call with body `{ project_id, start_date, end_date, dimensions: ['chat_id'],
    filters: [{ field: 'domain', operator: 'in', values: [<every own row's domain>] }] }`; `ownCitedAnswers` is the
    number of distinct `chat.id` with `citation_count` above 0 (fixture: 3 rows over 2 answers plus one 0-count row).
  - The extra call fails with 500: `ownCitedAnswers` null and the warning
    "Peec's answers by own site could not be loaded, so the citation rate is left out."
  - The extra call returns a row without `chat.id`: same as a failure (contract violation caught here).
  - A spent deadline during the extra call: the pull fails.
- [ ] Run. Expected: FAIL.
- [ ] Implement after the zero_retrievals guard (`pull.ts:132`):

```ts
  // Spec 2026-11-02 S2: answers citing any own site, counted once. One cited own row carries that count itself
  // (cited_chat_count); several need the report by answer, since one answer can cite two own sites. Only the Citation rate
  // bullet depends on it, so any failure but a spent deadline leaves that bullet out, a broken contract included.
  const ownRows = ownRowsOf(domains, owned[0].domains)
  let ownCitedAnswers: number | null | undefined
  if (ownRows.filter((r) => r.citation_count > 0).length > 1) {
    try {
      const byAnswer = peecContract('peec.own_cited_chats', await client.all<{ domain: string; chat: { id: string }; citation_count: number }>(
        'POST', '/reports/domains', { ...W, dimensions: ['chat_id'], filters: [{ field: 'domain', operator: 'in', values: ownRows.map((r) => r.domain) }] },
        (r) => `${r.domain}|${r.chat?.id}`, 10_000))
      ownCitedAnswers = new Set(byAnswer.filter((r) => r.citation_count > 0).map((r) => r.chat.id)).size
    } catch (e) {
      if (isPeecDeadline(e)) throw e
      ownCitedAnswers = null
      warnings.push("Peec's answers by own site could not be loaded, so the citation rate is left out.")
    }
  }
```

  and return `...(ownCitedAnswers !== undefined ? { ownCitedAnswers } : {})`.
- [ ] Run. Expected: PASS. Commit, push.

### Task 4: Metrics

**Produces:** `SnapshotData.citations?: Citations` with
`Citations = { own; total; answers; citedAnswers: number | null; citedSites; ownSitesCited; topSite: { domain; rank; tied } | null }`.

- [ ] Tests first (`metrics.test.ts`):
  - X, Y, T, N, R from fixture rows (own rows summed; N counts every row above 0, own included).
  - Rank counts any row strictly above the top own row; a non-own row level with it at rank 1 sets `tied`; another own
    row level with it does not.
  - One cited own row: `citedAnswers` is its `cited_chat_count`; several: `pull.ownCitedAnswers` (null stays null).
  - X = 0: `topSite` null, `ownSitesCited` 0.
  - Default weight now `citation_count`: APFM-shaped fixture reproduces the measured shares (Institutional 45.7,
    Corporate 34.2) only if the fixture carries those weights; otherwise assert the mix equals the citation weights.
  - Replace the pinned weight assertions (`config.test.ts:19`, `contracts.test.ts:281-285`) with `citation_count`.
- [ ] Run. Expected: FAIL.
- [ ] Implement in `buildSnapshotData` after `ownSiteRank`:

```ts
  // Spec 2026-11-02 S1/S2: the brand's citations against every citation, the top own site's rank as Peec ranks domains,
  // and the answers that cite any own site.
  const citedOwn = ownRows.filter((r) => r.citation_count > 0)
  const topCited = [...citedOwn].sort((a, b) => (b.citation_count - a.citation_count) || (a.domain < b.domain ? -1 : 1))[0]
  const ownSet = new Set(ownRows)
  const citations = {
    own: citedOwn.reduce((s, r) => s + r.citation_count, 0),
    total: pull.domains.reduce((s, r) => s + r.citation_count, 0),
    answers: pull.domains[0]?.total_chat_count ?? 0,
    citedAnswers: citedOwn.length > 1 ? (pull.ownCitedAnswers ?? null) : (citedOwn[0]?.cited_chat_count ?? 0),
    citedSites: pull.domains.filter((r) => r.citation_count > 0).length,
    ownSitesCited: citedOwn.length,
    topSite: topCited ? {
      domain: topCited.domain,
      rank: 1 + pull.domains.filter((r) => r.citation_count > topCited.citation_count).length,
      tied: pull.domains.every((r) => r.citation_count <= topCited.citation_count) && pull.domains.some((r) => !ownSet.has(r) && r.citation_count === topCited.citation_count),
    } : null,
  }
```

  and add `citations` to the return. Add the `Citations` interface and `citations?` to `SnapshotData` with a doc comment.
- [ ] Run. Expected: PASS. Commit, push.

### Task 5: Sentences

- [ ] Tests first (`sentences.test.ts`), each through `dataSentences` on a built row:
  - Every S1 table row: one site; several sites; R = 1; R = 1 tied; several sites R = 1 and tied; X = 0 (one own row:
    the domain; several uncited own rows: "<Brand>'s own sites"; no own rows: "<Brand>'s own site"); Y = 0.
  - "under 1%" and "over 99%"; N = 1 reads "the only cited site"; ordinals past twenty ("106th").
  - S2: "is cited in 441 of 2,004 tracked answers (22%)"; one decimal under 10; "under 0.1%" below 0.05%; C = 0
    "isn't cited in any of the T tracked answers"; C null leaves the bullet out (box is volume then mix).
  - A row without `citations` prints today's box exactly (existing version 3 tests, now run on rows with `citations`
    removed).
  - `OLDER_BOXES[3]` exists and equals today's boxes on a version 3 row.
- [ ] Run. Expected: FAIL.
- [ ] Implement: rename today's `citedSourcesBox` to `citedSourcesBoxV3` unchanged; the new `citedSourcesBox` returns
  `citedSourcesBoxV3()` when `!d.citations`, else the S1 and S2 bullets then `sourceTypeMix()`; `write()` returns
  `v3: { competitive_bullets: tidyBullets(citedSourcesBoxV3()), sources_bullets: tidyBullets(competitiveBox()) }`;
  `export function boxesV3(d)`; `OLDER_BOXES = { 1: boxesV2, 2: boxesV2, 3: boxesV3 }`.
- [ ] Grounding tests (`grounding.test.ts`): a version 1, 2 and 3 row (no `citations`) produces today's sentences byte for
  byte through `dataSentences` and its stored bullets pass `groundingFlags` with no flag; a version 4 row whose Citation
  volume number is edited gets `number_not_in_data`.
- [ ] Run the whole suite. Expected: PASS. Commit, push.

### Task 6: Glean data block and the sweep

- [ ] Tests first: `prompt.test.ts`: a row with `citations` has the line
  `Own site citations: 731 of 16,287 citations in AI answers; top own site aplaceformom.com ranks 4 of 1,118 cited sites;
  answers citing the brand: 441 of 2,004` and the mix label "share of citations"; a row without keeps every line it
  has today; the writing rules name "citations", not "retrievals". `sweep-checks.test.ts`: `checkReport` flags a Citation
  volume count that is not `citations.own`, and a share that differs from the donut's "You" slice.
- [ ] Run. Expected: FAIL.
- [ ] Implement `prompt.ts` (new rows replace the retrievals line with the citations line; mix label branch for
  `citation_count`; "position, citations") and `sweep-checks.ts` (replace the `appears in` check with the S1 numbers and
  the "You" slice check, keeping the old check for rows without `citations`).
- [ ] Run. Expected: PASS. Commit, push.

### Task 7: Verify

- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, `npx eslint lib/aeo-outbound`, each bounded; all clean.
- [ ] `npm run aeo:sweep` against live Peec (read only), bounded: every pitch project generates, 0 problems, and the 12
  multi-site projects make the extra call.
- [ ] Final review by a fresh opus subagent over the branch diff; one fix pass for Critical and Important.
- [ ] Open the PR into `dev` (draft), self-review comment, `self-reviewed` label. Thomas sends it to Paul.
