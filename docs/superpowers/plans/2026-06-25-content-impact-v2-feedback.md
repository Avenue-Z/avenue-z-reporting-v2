# Content Impact V2 Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠ LINE-NUMBER CORRECTIONS (2026-06-25, post-rebase):** This plan was written against branch base `a447713`. The branch has been rebased onto `c493b30` (current `main` = a447713 + PR #83 remove-demo-mode + PR #84 organic-social + PR #85 Renaissance content-impact). Line numbers in the original task bodies below have drifted. **Implementer subagents MUST read `.superpowers/sdd/plan-reverification-report.md` alongside this plan** — that report contains the verified current line numbers for every FB. The plan's code blocks (what to write) remain correct; only the line numbers (where to write) have drifted.

> **⚠ FB-042 is ALREADY ON MAIN.** PR #85 commit `afd9921` shipped the equivalent Prompt Coverage delta fix before this branch's rebase. Task 1 below is now a no-op: the ask is satisfied in production. Do NOT re-execute Task 1. The plan's Tina coverage map still shows FB-042 for Row 3 — that ask is closed.

> **⚠ FB-050 is PARTIALLY SHIPPED on main.** The `ownedHostKeys` Set scaffold exists at `content-impact.tsx:1224-1233` but still uses exact-match (`.has()`). Task 16 reduces to adding the `.endsWith(\`.${ownedKey}\`)` suffix-match disjunct to the existing `isOwnedHost()` function — smaller change than the plan describes.

**Goal:** Address all 16 of Tina's V2 column-E feedback items on the Content Impact tab, plus 2 silent bugs caught by forensic sweep (synopsis prose lying with inflated numbers; §F subdomain pages silently dropped), plus the meta-feedback about jumbled metrics (Task 5.5 sweeping audit).

**Architecture:** 13 FBs grouped into 3 sequential phases.
- **Phase 1** (5 FBs, ~80 LOC) = zero-risk surgical fixes that kill the most embarrassing bugs (199.9% Citation Share, lying synopsis, broken Prompt Coverage delta, mislabeled column, wrong tooltips).
- **Phase 2** (6 FBs, ~330 LOC) = literal-Tina UI fixes (delta columns, footnote rewrite, source URLs, scatter polish, slope chart legend).
- **Phase 3** (3 FBs, ~60 LOC) = investigation-informed fixes (subdomain match, competitor cap bump, date-range honor — requires 1 live Peec API call before FB-048 path locks).

**Tech Stack:** Next.js 15 App Router (RSC), TypeScript strict, Recharts, Tailwind v4, Drizzle ORM (Neon Postgres), Peec AI customer API (`api.peec.ai/customer/v1`), GA4 Data API, Glean Chat API.

## Global Constraints

These bind every task. Copy from this section verbatim into any reviewer dispatch.

1. **Literal interpretation only.** If Tina did not explicitly ask for a change, do not change it. No drift, no scope creep, no unsolicited tweaks.
2. **Glean Chat API for ALL LLM inference.** No `actAs`. No Vertex/Gemini/OpenAI/Anthropic direct calls.
3. **No em-dashes anywhere** in code, comments, copy, or docs. Use commas, periods, or hyphens.
4. **Truth-grounded.** Uncomputable metric → render `--`. Never fake zero. Never invent counts.
5. **Compare-period gating:** all deltas gate on `compareIso !== null`. Tina's literal ask was deltas show "when you have a comparison period turned on" — not always.
6. **GA4 `engagementRate` is a fraction [0,1].** Any consumer must `* 100` in BOTH the value renderer AND the delta math.
7. **Never skip hooks. Never force-push. No Neon migrations without explicit Paul approval.**
8. **Before adding cross-cutting plumbing (compareRange, dateRange, units), grep siblings.** Lessons from FB-035 hotfix (deriveCompareRange not parseDateRange) and FB-039 hotfix (engagementRate * 100 in both renderer AND delta).
9. **Cache version bump required** whenever a Peec response type shape changes. `getPeecOverview` currently at `v8`. Bumping to `v9` invalidates prior cached entries that lack new fields.
10. **One commit per task.** Tasks are independently reviewable. Do not bundle.
11. **Type-check before every commit:** `npx tsc --noEmit`. Zero output = clean.
12. **Run the 6 test files before merging each phase:**
    ```
    npx tsc --noEmit
    DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
    npx tsx lib/peec/bot-vs-human-scatter.test.ts
    npx tsx lib/peec/slope-chart.test.ts
    npx tsx lib/peec/url-citations.test.ts
    npx tsx lib/peec/content-impact-synopsis.test.ts
    npx tsx lib/ga4/content-derive.test.ts
    ```
    Every test must print "all assertions passed" (synopsis test prints 2 lines).

## Tina's V2 Feedback → FB Coverage Map (16 of 16 covered)

| Tina V2 ask (column E) | FB | Phase |
|---|---|---|
| Row 3: Prompt Coverage delta missing | FB-042 | 1 |
| Row 4-a: §B `--` rows confusing | FB-043 | 2 |
| Row 4-b: §B delta columns sortable | FB-044 | 2 |
| Row 5: §C show source URLs | FB-045 | 2 |
| Row 6-a: §D 4 quadrants not visible | FB-046 | 2 |
| Row 6-b: §D hover should show URL | FB-047 | 2 |
| Row 6-c: §D should honor date range | FB-048 | 3 |
| Row 7: §E right legend + hover muting | FB-049 | 2 |
| Row 8-a: §F delta columns sortable | FB-044 | 2 |
| Row 8-b: §F only 14 pages, should be more | FB-050 | 3 |
| Row 9-a: §H.1 Citation Share 199.9% bug | FB-051 | 1 |
| Row 9-b: §H.1 only 7 competitors | FB-052 | 3 |
| Row 9-c: §H.1 "AI Visibility" wrong | FB-053 | 1 |
| Row 9-d: §H.1 Citation Share tooltip wrong | FB-054 | 1 |
| Row 9-e: §H.1 delta columns sortable | FB-044 | 2 |
| Row 10: §H.2 Citation Share tooltip wrong | FB-055 | 1 |
| Meta-feedback: "metrics seem misnamed / misrepresented... titles, descriptions, and value representation getting jumbled" | FB-051-audit (Task 5.5 sweeping metric coherence audit + any FB-051a..z fixes the audit surfaces) | 1 |

## Silent bugs caught by forensic sweep (folded into existing FBs)

1. **Synopsis lying:** `lib/peec/content-impact-synopsis.ts:127-135` template renders `${d.domain} - ${d.citationCount.toFixed(1)} AI citations`, but the `citationCount` field is sourced from `d.citationRate ?? 0` at `content-impact.tsx:960,967` — that field is Peec's `citation_rate * 100` (an inflated avg, not a count). Glean prose currently writes inflated "AI citations" claims. Validator does NOT catch this. **Folded into FB-051.**

2. **§F subdomain drop:** `content-impact.tsx:1265-1268` filter does exact-host string equality. If Peec lists `renaissance.com` as Own and cites `blog.renaissance.com`, the row is silently dropped. **This is the likely real cause of "only 14 pages."** Folded into FB-050 as the primary fix.

---

# Phase 1 — Surgical zero-risk fixes (~80 LOC, single PR)

Ship all 5 in one PR. Tina sees the 199.9% bug gone, synopsis truthful, tooltips honest, Prompt Coverage delta wired, "AI Visibility" renamed.

---

## Task 1: FB-042 — §A Prompt Coverage delta

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx:800-846, 1062-1072`

**Interfaces:**
- Consumes: `coveragePrior` (already fetched at line 305-307), `getPromptCoveragePrior(domain)` helper (already exists at line 526-529), `ownDomains` (line 447)
- Produces: `promptCoveragePctPrior: number | null`, `promptCoveragePctDelta: number | null`, `promptCoveragePriorAvailable: boolean`

**Background:** Tina V2 row 3: *"The prompt coverage metric isn't showing a comparison change."* The data is already fetched. The §H.1 builder at line 1361-1366 already uses `getPromptCoveragePrior` for competitor domains. We mirror that for §A.

- [ ] **Step 1: Delete stale comment**

Replace [content-impact.tsx:800-812](components/report-sections/peec-ai/content-impact.tsx:800):

```typescript
  // KPI 2: Prompt Coverage. Aggregate across all owned domains (union of
  // prompt IDs cited). Delta available when compareRange is on and prior
  // coverage data was successfully fetched.
  const ownedPromptIdSet = new Set<string>()
  for (const d of ownDomains) {
    for (const pid of domainPromptIds(coverage, d.domain)) {
      ownedPromptIdSet.add(pid)
    }
  }
  const promptCoveragePct = coverageAvailable && totalTrackedPrompts > 0
    ? Math.round((ownedPromptIdSet.size / totalTrackedPrompts) * 100)
    : null

  // Prior period Prompt Coverage — same aggregation pattern, against coveragePrior.
  const ownedPromptIdSetPrior = new Set<string>()
  for (const d of ownDomains) {
    for (const pid of domainPromptIds(coveragePrior, d.domain)) {
      ownedPromptIdSetPrior.add(pid)
    }
  }
  const promptCoveragePctPrior = coveragePriorAvailable && totalTrackedPrompts > 0
    ? Math.round((ownedPromptIdSetPrior.size / totalTrackedPrompts) * 100)
    : null
  const promptCoveragePctDelta =
    promptCoveragePct !== null && promptCoveragePctPrior !== null
      ? promptCoveragePct - promptCoveragePctPrior
      : null
```

- [ ] **Step 2: Replace the "intentionally absent" comment**

In [content-impact.tsx:842-846](components/report-sections/peec-ai/content-impact.tsx:842):

```typescript
  const compareActive = compareIso !== null
  const aiPriorAvailable = compareActive && aiReferralTrafficPrior !== null
  const organicPriorAvailable = compareActive && organicTrafficPrior !== null
  const citationSharePriorAvailable = compareActive && citationSharePctPrior !== null
  const promptCoveragePriorAvailable = compareActive && promptCoveragePctPrior !== null
```

- [ ] **Step 3: Wire delta into KPI card**

Replace [content-impact.tsx:1062-1072](components/report-sections/peec-ai/content-impact.tsx:1062):

```typescript
          {/* KPI 2 · Prompt Coverage */}
          <KpiCard
            label="Prompt Coverage"
            hint="Tracked prompts citing owned domains"
            value={
              calendarIsDemo ? '67%'
                : promptCoveragePct !== null ? `${promptCoveragePct}%`
                : 'None'
            }
            live={calendarIsDemo || promptCoveragePct !== null}
            delta={
              calendarIsDemo ? 4.5
                : promptCoveragePriorAvailable && promptCoveragePctDelta !== null ? promptCoveragePctDelta
                : undefined
            }
          />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: empty output (clean)

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-042: §A Prompt Coverage delta wired (was missing in v1)"
```

---

## Task 2: FB-051 — §H.1 Citation Share 199.9% bug + synopsis lying fix

**Files:**
- Modify: `lib/peec/client.ts:91-102, 135-142, 461-476, 461-494, 835`
- Modify: `components/report-sections/peec-ai/content-impact.tsx:447-494, 956-1005, 1349-1383`
- Modify: `lib/peec/content-impact-synopsis.ts` (if any type guards need updating)

**Interfaces:**
- Consumes: `ApiDomainRow.citation_count` (already in Peec API at line 99), `compareIso`
- Produces: New `TopDomain.citationCount: number` field; correct share-of-period math for §H.1; truthful synopsis context

**Background:** Tina V2 row 9-a: *"Citation Share has one of the competitors at 199.9% — something must be wrong here?"* Root cause at `client.ts:471`: `citationRate: d.citation_rate * 100`. Peec's `citation_rate` is an average count (~2.0), not a fraction. We multiply by 100 → "200%". `TopDomain` doesn't carry the raw `citation_count` we need for true share math.

Additional silent bug: `content-impact.tsx:960, 967` passes `d.citationRate` labeled as `citationCount` to the Glean synopsis context. Synopsis prose currently writes inflated "AI citations" numbers. Validator does NOT catch this (see `lib/peec/content-impact-synopsis.ts:58-101` — Rules 1/3 only validate URL/domain integer counts).

- [ ] **Step 1: Add `citationCount` field to TopDomain type**

In [lib/peec/client.ts:135-142](lib/peec/client.ts:135) replace:

```typescript
export type TopDomain = {
  domain: string
  retrieved: number
  retrievedDelta: number
  citationRate: number
  citationRateDelta: number
  citationCount: number  // Peec citation_count (raw integer), used for share-of-period math
  type: string
}
```

- [ ] **Step 2: Populate citationCount in buildTopDomains**

In [lib/peec/client.ts:461-476](lib/peec/client.ts:461) replace the `.map` body:

```typescript
  function buildTopDomains(data: ApiDomainRow[], priorData: ApiDomainRow[] = []): TopDomain[] {
    const priorMap = new Map(priorData.map((d) => [d.domain, d]))
    return (data ?? [])
      .sort((a, b) => b.retrieved_percentage - a.retrieved_percentage)
      .map((d) => {
        const prior = priorMap.get(d.domain)
        return {
          domain: d.domain,
          retrieved: d.retrieved_percentage * 100,
          retrievedDelta: prior ? (d.retrieved_percentage - prior.retrieved_percentage) * 100 : 0,
          citationRate: d.citation_rate * 100,
          citationRateDelta: prior ? (d.citation_rate - prior.citation_rate) * 100 : 0,
          citationCount: d.citation_count ?? 0,
          type: normalizeClassification(d.classification),
        }
      })
  }
```

- [ ] **Step 3: Bump cache version v8 → v9**

In [lib/peec/client.ts:835](lib/peec/client.ts:835) change:

```typescript
    version: 'v9',
```

And add a comment line above explaining the bump:

```typescript
    // v9 = FB-051: TopDomain now carries citationCount (raw Peec citation_count
    //      integer). Required for §H.1 Citation Share share-of-period math.
    //      v8 cached entries lack this field — must invalidate.
```

- [ ] **Step 4: Clean up the sloppy "treat citationRate as citationCount" hack**

In [content-impact.tsx:475-494](components/report-sections/peec-ai/content-impact.tsx:475) replace:

```typescript
  // ── Model-filtered domain lists ──────────────────────────────────────────────
  // For Peec citation tables: when a model filter is active, recompute citationCount
  // from per-model data and apply through filterDomainRowsByModel. Falls back to
  // unfiltered domain list when no filter is set.
  const filteredOwnDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterDomainRowsByModel(
        ownDomains,
        peecData.domainCitationsByModel,
        models ?? null,
      )
    : ownDomains

  const filteredCompetitorDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterDomainRowsByModel(
        competitorDomains,
        peecData.domainCitationsByModel,
        models ?? null,
      )
    : competitorDomains
```

Note: `filterDomainRowsByModel` reads `citationCount` directly on the row — now that TopDomain has it natively, no remap needed. Verify the helper at `lib/peec/by-model.ts` accepts the TopDomain shape. If it requires a separate type, leave the wrapping but use the new real `citationCount` field instead of `citationRate`.

- [ ] **Step 5: Fix synopsis context to pass real counts**

In [content-impact.tsx:955-977](components/report-sections/peec-ai/content-impact.tsx:955) replace:

```typescript
  // Top 3 owned domains by AI citation count (real integer counts, FB-051).
  const topOwnedForSynopsis = filteredOwnDomains
    .slice()
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationCount ?? 0 }))

  // Top 3 competitor domains by AI citation count.
  const topCompetitorForSynopsis = filteredCompetitorDomains
    .slice()
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationCount ?? 0 }))
```

- [ ] **Step 6: Rebuild §H.1 row builder with share-of-period math**

In [content-impact.tsx:1355-1383](components/report-sections/peec-ai/content-impact.tsx:1355) replace the IIFE:

```typescript
        {/* Sub-view 1: Top Competitor Domains - AI Visibility / Citation Share / Prompt Coverage */}
        {(() => {
          // FB-051: Citation Share = (domain.citationCount / sumOfAllCompetitorCitationCounts) * 100.
          // Mirrors §B and §H.2 share-of-period math. Replaces the broken
          // d.citationRate path that produced 199.9% values (citation_rate is
          // an avg count, not a fraction).
          //
          // Prior-period denominator needs prior competitor list, which requires
          // plumbing peecData.topDomainsPrior. v1 deferred: deltas use null when
          // prior data is not on TopDomain. Adding a prior topDomains field is
          // tracked in TODO file (post-PR) — for now, citationShareDelta is null
          // when we cannot compute it truthfully.
          const totalCompetitorCitations = filteredCompetitorDomains
            .reduce((s, d) => s + (d.citationCount ?? 0), 0)
          const h1Rows: CompetitorDomainsCitedRow[] = filteredCompetitorDomains.slice(0, 10).map((d) => {
            const promptCovCurrent = getPromptCoverage(d.domain)
            const promptCovPrior   = compareIso ? getPromptCoveragePrior(d.domain) : null
            const promptCovDelta   = compareIso && promptCovCurrent !== null && promptCovPrior !== null
              ? promptCovCurrent - promptCovPrior
              : null
            const citationShareValue = totalCompetitorCitations > 0
              ? (d.citationCount / totalCompetitorCitations) * 100
              : 0
            return {
              domain: d.domain,
              aiVisibility:        d.retrieved,
              aiVisibilityDelta:   compareIso ? d.retrievedDelta : null,
              citationShare:       citationShareValue,
              citationShareDelta:  null,  // FB-051: truthful null until prior topDomains is plumbed
              promptCoverage:      promptCovCurrent,
              promptCoverageDelta: promptCovDelta,
            }
          })
          return (
            <CompetitorDomainsCitedTable
              rows={h1Rows}
              emptyMessage="No competitor domain data available from Peec AI"
            />
          )
        })()}
```

- [ ] **Step 7: Update existing url-citations test if it asserts on TopDomain shape**

Run: `npx tsx lib/peec/url-citations.test.ts`
Expected: passes. If any test asserts on a `TopDomain`-shaped object literal, add `citationCount: 0` (or matching test value) to the assertion.

- [ ] **Step 8: Update synopsis test if it asserts on context shape**

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected: passes (test does not currently check per-domain citation numbers in context).

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: empty output.

- [ ] **Step 10: Commit**

```bash
git add lib/peec/client.ts \
        components/report-sections/peec-ai/content-impact.tsx \
        lib/peec/url-citations.test.ts \
        lib/peec/content-impact-synopsis.test.ts
git commit -m "FB-051: §H.1 Citation Share share-of-period (kills 199.9% bug) + synopsis context now passes real citationCount"
```

---

## Task 3: FB-053 — §H.1 "AI Visibility" → "Source Visibility" rename

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:414`

**Background:** Tina V2 row 9-c: *"AI visibility metric is wrong... tooltip says 'Percentage of chats where at least one URL from this domain appeared as a source.'"* Forensic sweep verdict: the math is correct (`d.retrieved_percentage * 100`, properly bounded [0,100]). Tina's complaint is naming — "AI Visibility" connotes brand-level visibility (Peec's `visibility` metric: % of AI responses where the BRAND appears). This metric is actually DOMAIN-level source visibility. Rename to match Peec's `sourceVisibility` definition. Tooltip stays correct.

- [ ] **Step 1: Rename column label**

In [content-impact-tables.tsx:414](components/report-sections/peec-ai/content-impact-tables.tsx:414) change `label: 'AI Visibility'` to `label: 'Source Visibility'`:

```typescript
    {
      key: 'aiVisibility', label: 'Source Visibility', align: 'right',
      tooltip: TT.aiVisibility,
      accessor: (r) => r.aiVisibility,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.aiVisibility.toFixed(1)}%
          {renderDelta(r.aiVisibilityDelta, 'pp')}
        </span>
      ),
    },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-053: §H.1 column 'AI Visibility' renamed 'Source Visibility' to match Peec metric definition"
```

---

## Task 4: FB-054 — §H.1 Citation Share tooltip rewrite

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:426`

**Background:** Tina V2 row 9-d: *"Citation share metric is wrong... tooltip says 'Average number of times the domain was explicitly referenced in response text when used.' but it should be a percentage."* After FB-051 lands, the value IS a share-of-period percentage. The tooltip must match.

- [ ] **Step 1: Replace tooltip text**

In [content-impact-tables.tsx:424-442](components/report-sections/peec-ai/content-impact-tables.tsx:424) replace the `tooltip` value:

```typescript
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This domain's share of total citations across all competitor domains in the period. (Avenue Z internal — derived from Peec citation_count.)",
      accessor: (r) => r.citationShare,
      render: (r) => {
        const barWidth = (r.citationShare / maxCitationShare) * 100
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="tabular-nums text-white/60">
              {r.citationShare.toFixed(1)}%
              {renderDelta(r.citationShareDelta, 'pp')}
            </span>
          </div>
        )
      },
    },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-054: §H.1 Citation Share tooltip now describes share-of-period (matches FB-051 math)"
```

---

## Task 5: FB-055 — §H.2 Citation Share tooltip rewrite

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:515`

**Background:** Tina V2 row 10: *"I think this citation share metric is either wrong or the tooltip is wrong."* Value math was correct in FB-041 (share-of-period). Tooltip never updated. Fix it.

- [ ] **Step 1: Replace tooltip text**

In [content-impact-tables.tsx:513-522](components/report-sections/peec-ai/content-impact-tables.tsx:513) replace the `tooltip` value:

```typescript
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This URL's share of total citations across all cited URLs in the period. (Avenue Z internal — derived from Peec citation_count.)",
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.citationShare !== null ? `${r.citationShare.toFixed(1)}%` : '--'}
          {renderDelta(r.citationShareDelta, 'pp')}
        </span>
      ),
    },
```

- [ ] **Step 2: Type-check + run all 6 tests**

```
npx tsc --noEmit
DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts
npx tsx lib/peec/bot-vs-human-scatter.test.ts
npx tsx lib/peec/slope-chart.test.ts
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
npx tsx lib/ga4/content-derive.test.ts
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-055: §H.2 Citation Share tooltip now describes share-of-period (matches FB-041 math)"
```

---

## Task 5.5: Phase 1 metric coherence audit (sweeping pass before PR opens)

**Files:**
- Read-only audit pass; create one new doc: `docs/official-feedback/content-impact-v2-metric-audit.md`
- If a mismatch is found beyond what Tasks 1-5 already cover, fold the fix into the appropriate file under a `FB-051a / FB-051b / ...` commit before Task 6 opens the PR

**Background:** Tina's overarching V2 meta-feedback: *"Overall, I'm noticing that a lot of metrics seem like they are misnamed / misrepresented... titles, descriptions, and representation of values (count vs percentage) in the metrics are getting jumbled around."* Phase 1 Tasks 2-5 fix the 4 specific instances she cited (199.9% bug, "AI Visibility" name, §H.1 + §H.2 tooltips). This audit closes the gap so no other jumbled metric escapes to V3 — every metric on the Content Impact tab is reconciled against its real data source before the Phase 1 PR opens.

**Coverage scope — every metric currently rendered on the Content Impact tab:**

| Section | Metrics to audit |
|---|---|
| §A KPI cards | Citation Share · Prompt Coverage · AI Referral Traffic · Organic Traffic |
| §B Watched Pages | Prompt Coverage · Citation Share · AI Referral Traffic · Organic Sessions · Engagement Rate |
| §C Speed Stats | Median Days to First Traffic · Median Days to First AI Activity · Fastest AI-Indexed · Slowest AI-Indexed |
| §F Fullsite Content | Prompt Coverage · Citation Share · AI Referral Traffic · Organic Sessions · Engagement Rate |
| §H.1 Competitor Analysis | Source Visibility · Citation Share · Prompt Coverage |
| §H.2 Brand-Absent | Citation Share |

**For each metric, record 5 columns:**
1. **Title** — column header / card label / tile label
2. **Tooltip text** — what the user reads on hover (verbatim)
3. **Value source** — exact field from API / computation, with `file:line` receipt
4. **Units** — count / percentage / fraction [0,1] / days / etc.
5. **Verdict** — `OK` or `MISMATCH: <which dimension>` (title vs tooltip vs value)

- [ ] **Step 1: Gather every title + tooltip + value-source from the codebase**

```bash
grep -n "label:\|tooltip:" components/report-sections/peec-ai/content-impact-tables.tsx
grep -n "KpiCard\|label=\|hint=" components/report-sections/peec-ai/content-impact.tsx | head -60
cat lib/peec/metric-definitions.ts
```

- [ ] **Step 2: Cross-check against Peec's verbatim metric definitions**

For every metric that pulls from Peec (`citationShare`, `sourceVisibility`, `promptCoverage`), confirm:
- the tooltip text reflects Peec's own definition in `lib/peec/metric-definitions.ts` (or Avenue Z's internal derivation if applicable)
- the value's units match what the tooltip claims (count vs % vs fraction)
- the title's wording matches what the value actually measures

For GA4-sourced metrics (`aiReferralTraffic`, `organicSessions`, `engagementRate`), confirm:
- units match GA4's semantics (sessions = count integer; engagementRate = fraction [0,1] rendered as `× 100`%)
- the renderer and any delta math both apply the same unit transform (FB-039 hotfix lesson)

- [ ] **Step 3: Write the audit doc**

Save `docs/official-feedback/content-impact-v2-metric-audit.md` with:
- a header section explaining the meta-feedback and audit purpose
- the full audit table (one row per metric in the coverage scope, ~25 rows total)
- a "Mismatches found" summary section listing each MISMATCH verdict and the fix that closed it (or `none` if everything reconciled)

- [ ] **Step 4: Fold fixes (if any) into Phase 1 — one commit per mismatch**

For each MISMATCH:
- **Title wrong** → fix the label string (precedent: FB-053)
- **Tooltip wrong** → fix the tooltip text (precedent: FB-054 / FB-055)
- **Value units wrong** → fix the math / render path (precedent: FB-051)
- **Title implies brand-level but metric is domain-level (or vice versa)** → rename (precedent: FB-053)

Commit each fix individually with message `FB-051a: <section> <metric> <what changed>` (then `FB-051b`, `FB-051c`, ...). Keeps traceability to the meta-feedback root.

- [ ] **Step 5: Type-check + commit the audit doc**

```bash
npx tsc --noEmit
git add docs/official-feedback/content-impact-v2-metric-audit.md
git commit -m "FB-051-audit: Content Impact tab metric coherence audit (titles + tooltips + values reconciled)"
```

- [ ] **Step 6: Wire the audit into Task 6's PR body**

When Task 6 runs `gh pr create`, the body must include a new `## Metric coherence audit` section pointing at `docs/official-feedback/content-impact-v2-metric-audit.md` and naming any `FB-051a..z` commits that closed mismatches. Task 6's PR-body template (see below) is updated accordingly.

---

## Task 6: Phase 1 push + docs + open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin official-feedback-content-impact-tab-content-v2
```

- [ ] **Step 2: Update feedback-log + changelog + status.md**

Append entries to `docs/official-feedback/feedback-log.md` (one per FB, including any FB-051a/b/c... commits from Task 5.5), `docs/official-feedback/changelog.md` (one combined entry for Phase 1 that names the audit), and bump `docs/official-feedback/status.md` (commits ahead count + next FB ID = FB-056). Add 5 sheet rows to the V2 columns of `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab (1).csv` for FB-042, 051, 053, 054, 055. Add a 6th sheet row for the metric coherence audit ("V2 — What shipped" = "Sweeping audit of every metric on tab; reconciled title/tooltip/value across §A/B/C/F/H.1/H.2. See `docs/official-feedback/content-impact-v2-metric-audit.md`.").

- [ ] **Step 3: Commit docs**

```bash
git add docs/official-feedback/ "/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab (1).csv"
git commit -m "docs: Phase 1 V2 feedback (FB-042, 051, 053, 054, 055) log + changelog + status + sheet"
git push
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "Content Impact V2 Phase 1: kill 199.9% bug + synopsis lying + tooltips truthful + Prompt Coverage delta" --body "$(cat <<'EOF'
## Summary
- FB-042: §A Prompt Coverage KPI delta now wired (data already fetched, was disconnected)
- FB-051: §H.1 Citation Share now uses share-of-period math, killing the 199.9% bug; synopsis context now passes real `citationCount` instead of inflated `citationRate * 100`
- FB-053: §H.1 column "AI Visibility" renamed "Source Visibility" (matches Peec metric definition; old name was misleading)
- FB-054: §H.1 Citation Share tooltip rewritten (was describing an avg count, now describes share-of-period)
- FB-055: §H.2 Citation Share tooltip rewritten (FB-041 fixed the math but not the tooltip)
- FB-051a..z (audit findings): any additional title/tooltip/value mismatches surfaced by the sweeping metric coherence audit (see Metric coherence audit section below)

## Metric coherence audit
Per Tina's V2 meta-feedback ("metrics seem misnamed / misrepresented... titles, descriptions, and value representation getting jumbled"), every metric currently rendered on the Content Impact tab (§A KPIs, §B Watched Pages, §C Speed Stats, §F Fullsite Content, §H.1 Competitor Analysis, §H.2 Brand-Absent) was audited before this PR opened. Each metric's title, tooltip text, value source (file:line), and units were reconciled against Peec's verbatim metric definitions and GA4's documented semantics. Full audit table: `docs/official-feedback/content-impact-v2-metric-audit.md`. Mismatches found beyond Tasks 1-5 are listed in the FB-051a..z bullets above.

## Test plan
- [ ] Type-check clean (`npx tsc --noEmit`)
- [ ] All 6 test files pass
- [ ] Visual QA on preview: §A shows Prompt Coverage delta when comparison period is on
- [ ] Visual QA: §H.1 Citation Share max value is bounded to ~25-40%, never >100%
- [ ] Visual QA: §H.1 column header reads "Source Visibility"
- [ ] Visual QA: §H.1 and §H.2 tooltips read share-of-period text
- [ ] Visual QA: synopsis prose does NOT claim inflated citation numbers
- [ ] Metric audit doc exists and lists every metric on the tab with a verdict
EOF
)"
```

---

# Phase 2 — Literal Tina UI fixes (~330 LOC, separate PR after Phase 1 visually QA'd)

Ship the 6 remaining UI fixes Tina explicitly asked for. All bulletproof per forensic sweep.

---

## Task 7: FB-043 — §B `--` framing improvement

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:130-260` (footnote, plus add subtitle stat prop)
- Modify: `components/report-sections/peec-ai/content-impact.tsx:1195-1203` (compute + pass the subtitle stat)

**Interfaces:**
- Consumes: `publishedRows` (already exists, line 1113), `sectionBRows` (already built)
- Produces: new `unmatchedCount: number` prop on `PlannedContentPerformanceTable`

**Background:** Tina V2 row 4-a: *"I like the footnote on the chart, but I'm confused why there would be any rows that don't have matches."* Forensic verdict: `--` is truth-grounded. Caused by (1) URL hostname not tracked by GA4, (2) calendar URL typo vs live URL, or (3) page too recently published. Better footnote + a subtitle stat will surface the truth.

- [ ] **Step 1: Compute the unmatched count in the orchestrator**

In [content-impact.tsx:1194-1203](components/report-sections/peec-ai/content-impact.tsx:1194) replace the `return` block with:

```typescript
        const unmatchedCount = sectionBRows.filter(r =>
          r.aiReferralTraffic === null && r.organicSessions === null && r.engagementRate === null
        ).length
        return (
          <PlannedContentPerformanceTable
            rows={sectionBRows}
            ga4Connected={!!ga4Rows}
            unmatchedCount={unmatchedCount}
            totalPublishedCount={sectionBRows.length}
            emptyMessage={calendarData
              ? 'No published content yet -- table populates once status flips to live/published/complete'
              : 'Connect content calendar (Google Sheet) + GA4 page-level data to populate'}
          />
        )
```

- [ ] **Step 2: Update the PlannedContentPerformanceTable signature**

In [content-impact-tables.tsx:130-138](components/report-sections/peec-ai/content-impact-tables.tsx:130) extend the props:

```typescript
export function PlannedContentPerformanceTable({
  rows,
  ga4Connected,
  unmatchedCount,
  totalPublishedCount,
  emptyMessage,
}: {
  rows: PlannedContentRow[]
  ga4Connected: boolean
  unmatchedCount: number
  totalPublishedCount: number
  emptyMessage: string
}) {
```

- [ ] **Step 3: Replace the footnote**

In [content-impact-tables.tsx:253-258](components/report-sections/peec-ai/content-impact-tables.tsx:253) replace:

```typescript
      {ga4Connected && unmatchedCount > 0 && (
        <p className="text-[10px] text-text-muted">
          {unmatchedCount} of {totalPublishedCount} published URLs have no GA4 sessions in this period.
          A row shows `--` when GA4 was queried successfully but recorded no traffic to that path. This usually means: the URL has not received visits yet, the live URL differs from the calendar entry, or GA4 is not configured to track that hostname.
        </p>
      )}
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add components/report-sections/peec-ai/content-impact.tsx \
        components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-043: §B footnote names the 3 real causes of -- + adds X of Y unmatched stat"
```

---

## Task 8: FB-044 — Delta columns split across §B, §F, §H.1

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:172-236` (§B columns)
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:291-363` (§F columns)
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:405-454` (§H.1 columns)

**Interfaces:** Architecture confirmed clean by forensic sweep — `SortableColumn` interface at `sortable-table.tsx:9-21` supports independent accessors per column; `renderDelta(delta, 'pp'|'pct')` at `content-impact-tables.tsx:95-106` reusable unchanged.

**Background:** Tina V2 rows 4-b, 8-a, 9-e: *"Instead of the deltas being in the same column as the metric, can they have their own columns so we're able to sort by that change?"* Every metric column currently packs `{value, renderDelta()}` into one cell. Split each into 2 sortable columns. Result: §B 9→14 cols, §F 6→11 cols, §H.1 4→7 cols.

Recipe applied identically to every metric column:
- Original column stays, with delta removed from `render`
- New column added immediately after, with `key: '<metric>Delta'`, `label: 'Δ'`, `align: 'right'`, `sortable: true`, `accessor: (r) => r.<metric>Delta ?? -Infinity`, `render: (r) => renderDelta(r.<metric>Delta, '<pp|pct>')`

- [ ] **Step 1: Rebuild §B columns array**

In [content-impact-tables.tsx:139-237](components/report-sections/peec-ai/content-impact-tables.tsx:139) the columns array becomes 14 entries. Replace fully:

```typescript
  const columns: SortableColumn<PlannedContentRow>[] = [
    {
      key: 'contentPiece', label: 'Content Piece',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic,
      render: (r) => r.url
        ? <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[220px] truncate font-medium text-white underline-offset-2 hover:underline"
            title={`${r.topic} → ${r.url}`}
          >
            {r.topic}
          </a>
        : <span className="block max-w-[220px] truncate font-medium text-white" title={r.topic}>{r.topic}</span>,
    },
    {
      key: 'contentType', label: 'Content Type',
      tooltip: TT.calendarField,
      accessor: (r) => r.contentType,
      render: (r) => <span className="text-white/60">{r.contentType}</span>,
    },
    {
      key: 'publishDate', label: 'Publish Date',
      accessor: (r) => r.publishDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.publishDate ?? '--'}</span>,
    },
    {
      key: 'updateDate', label: 'Last Updated',
      accessor: (r) => r.updateDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.updateDate ?? '--'}</span>,
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      tooltip: 'Percentage of tracked prompts citing this specific URL. (Avenue Z internal - derived from Peec per-URL prompt_id dimension.)',
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => r.promptCoverage !== null
        ? <span className="tabular-nums text-white">{r.promptCoverage.toFixed(0)}%</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'promptCoverageDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.promptCoverageDelta ?? -Infinity,
      render: (r) => renderDelta(r.promptCoverageDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This URL's share of total AI citations across all tracked URLs in the period. (Peec AI citation_count weighted by URL.)",
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => r.citationShare !== null
        ? <span className="tabular-nums text-white">{r.citationShare.toFixed(1)}%</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'citationShareDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.citationShareDelta ?? -Infinity,
      render: (r) => renderDelta(r.citationShareDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'aiReferralTraffic', label: 'AI Referral Traffic', align: 'right',
      tooltip: TT.aiReferredSessions,
      accessor: (r) => r.aiReferralTraffic ?? -1,
      render: (r) => r.aiReferralTraffic !== null
        ? <span className="tabular-nums text-white">{r.aiReferralTraffic.toLocaleString()}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'aiReferralTrafficDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.aiReferralTrafficDelta ?? -Infinity,
      render: (r) => renderDelta(r.aiReferralTrafficDelta, 'pct') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'organicSessions', label: 'Organic Sessions', align: 'right',
      tooltip: 'GA4 sessions whose default channel group is Organic Search. (GA4 sessionDefaultChannelGroup dimension.)',
      accessor: (r) => r.organicSessions ?? -1,
      render: (r) => r.organicSessions !== null
        ? <span className="tabular-nums text-white">{r.organicSessions.toLocaleString()}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'organicSessionsDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.organicSessionsDelta ?? -Infinity,
      render: (r) => renderDelta(r.organicSessionsDelta, 'pct') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'engagementRate', label: 'Engagement Rate', align: 'right',
      tooltip: TT.engagementRate,
      accessor: (r) => r.engagementRate ?? -1,
      render: (r) => r.engagementRate !== null
        ? <span className="tabular-nums text-white">{(r.engagementRate * 100).toFixed(1)}%</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'engagementRateDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.engagementRateDelta ?? -Infinity,
      render: (r) => renderDelta(r.engagementRateDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
  ]
```

- [ ] **Step 2: Rebuild §F columns array**

In [content-impact-tables.tsx:291-363](components/report-sections/peec-ai/content-impact-tables.tsx:291) apply the same recipe to FullsiteContentPerformanceTable's 5 metric columns (promptCoverage, citationShare, aiReferralTraffic, organicSessions, engagementRate). §F goes from 6 columns to 11.

Pattern per metric (using promptCoverage as example):

```typescript
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      sortable: true,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.promptCoverage !== null ? `${r.promptCoverage.toFixed(1)}%` : '--'}
        </span>
      ),
    },
    {
      key: 'promptCoverageDelta', label: 'Δ', align: 'right',
      sortable: true,
      accessor: (r) => r.promptCoverageDelta ?? -Infinity,
      render: (r) => renderDelta(r.promptCoverageDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
```

Apply identically to citationShare (pp), aiReferralTraffic (pct), organicSessions (pct), engagementRate (pp).

- [ ] **Step 3: Rebuild §H.1 columns array**

In [content-impact-tables.tsx:405-454](components/report-sections/peec-ai/content-impact-tables.tsx:405) split each of the 3 metric columns (aiVisibility, citationShare, promptCoverage). §H.1 goes from 4 columns to 7. CRITICAL: preserve the red bar on the Citation Share value column.

Citation Share with preserved bar:

```typescript
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This domain's share of total citations across all competitor domains in the period. (Avenue Z internal — derived from Peec citation_count.)",
      accessor: (r) => r.citationShare,
      render: (r) => {
        const barWidth = (r.citationShare / maxCitationShare) * 100
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="tabular-nums text-white/60">{r.citationShare.toFixed(1)}%</span>
          </div>
        )
      },
    },
    {
      key: 'citationShareDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.citationShareDelta ?? -Infinity,
      render: (r) => renderDelta(r.citationShareDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
```

Same recipe for aiVisibility (pp) and promptCoverage (pp).

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-044: delta columns split into own sortable columns across §B (14 cols), §F (11 cols), §H.1 (7 cols)"
```

---

## Task 9: FB-045 — §C source URLs under fastest + slowest tiles

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx:642-652, 1212-1225`

**Interfaces:**
- Consumes: `urlTimings` (already exists at line 642-644 — has `url` paired with `daysToFirstAi`)
- Produces: `fastestAiUrl: string | null`, `slowestAiUrl: string | null`

**Background:** Tina V2 row 5: *"Below the 'fastest ai indexed content' and 'slowest ai indexed content' can we add something that shows the specific URL it's referencing?"* The min/max throws away the URL. Find the URL whose `daysToFirstAi === fastestAi/slowestAi` and render hyperlinked under each tile.

- [ ] **Step 1: Derive the source URLs**

After [content-impact.tsx:652](components/report-sections/peec-ai/content-impact.tsx:652) (after `slowestAi = ...`) insert:

```typescript
  const fastestAiUrl = fastestAi !== null
    ? urlTimings.find(t => t.daysToFirstAi === fastestAi)?.url ?? null
    : null
  const slowestAiUrl = slowestAi !== null
    ? urlTimings.find(t => t.daysToFirstAi === slowestAi)?.url ?? null
    : null
```

Note: confirm `urlTimings` has a `.url` field by reading `lib/ga4/content-derive.ts` — `computeUrlTiming` returns `{ url, publishDate, daysToFirstTraffic, daysToFirstAi }`. If the field is named differently (e.g. `path`), adjust accordingly.

- [ ] **Step 2: Extend the §C tile array shape and render the URL**

In [content-impact.tsx:1212-1225](components/report-sections/peec-ai/content-impact.tsx:1212) replace:

```typescript
          {[
            { icon: Clock, label: 'Median Days to First Traffic',     color: '#39A0FF', demo: '14 days', val: medFirstTraffic, sourceUrl: null as string | null },
            { icon: Clock, label: 'Median Days to First AI Activity', color: '#60FDFF', demo: '22 days', val: medFirstAi, sourceUrl: null as string | null },
            { icon: TrendingUp,   label: 'Fastest AI-Indexed Content',  color: '#60FF80', demo: '4 days', val: fastestAi, sourceUrl: fastestAiUrl },
            { icon: TrendingDown, label: 'Slowest AI-Indexed Content',  color: '#FF4444', demo: '47 days', val: slowestAi, sourceUrl: slowestAiUrl },
          ].map(({ icon: Icon, label, color, demo, val, sourceUrl }) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-[11px] font-semibold text-text-muted">{label}</span>
              <span className={cn('text-lg font-bold', (calendarIsDemo || val !== null) ? 'text-white' : 'text-white/20')}>
                {calendarIsDemo ? demo : val !== null ? `${Math.round(val)} days` : 'None'}
              </span>
              {sourceUrl && !calendarIsDemo && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-full truncate text-[10px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
                  title={sourceUrl}
                >
                  {sourceUrl}
                </a>
              )}
            </div>
          ))}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-045: §C surfaces source URL beneath Fastest + Slowest AI-Indexed tiles"
```

---

## Task 10: FB-046 — §D scatter visible crosshair + quadrant labels

**Files:**
- Modify: `components/report-sections/peec-ai/bot-vs-human-scatter.tsx:50-86`

**Background:** Tina V2 row 6-a: *"This scatter plot doesn't quite make sense — see example of how there should be 4 quadrants."* Crosshair is `stroke="#FFFFFF40"` (25% opacity, invisible). Labels are absolutely positioned to chart container corners, not quadrant centers.

- [ ] **Step 1: Brighten the crosshair**

In [bot-vs-human-scatter.tsx:85-86](components/report-sections/peec-ai/bot-vs-human-scatter.tsx:85) replace:

```typescript
          <ReferenceLine x={data.medianBot} stroke="#FFFFFF80" strokeDasharray="4 4" strokeWidth={1.5} />
          <ReferenceLine y={data.medianHuman} stroke="#FFFFFF80" strokeDasharray="4 4" strokeWidth={1.5} />
```

- [ ] **Step 2: Replace corner-anchored labels with quadrant-centered Recharts Labels**

The cleanest approach is to remove the absolute-positioned overlay block entirely and use Recharts `<Label>` children inside each ReferenceLine to render text near the median crossings. Drop [bot-vs-human-scatter.tsx:51-56](components/report-sections/peec-ai/bot-vs-human-scatter.tsx:51) entirely and instead keep the overlay but reposition to true quadrant centers via inline transforms based on chart-fraction positions:

```typescript
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-2 grid-rows-2">
        <div className="flex items-start justify-start p-4"><span className={cornerLabel}>Low Bot, High Human</span></div>
        <div className="flex items-start justify-end p-4"><span className={cornerLabel}>High Bot, High Human</span></div>
        <div className="flex items-end justify-start p-4"><span className={cornerLabel}>Low Bot, Low Human</span></div>
        <div className="flex items-end justify-end p-4"><span className={cornerLabel}>High Bot, Low Human</span></div>
      </div>
      <ResponsiveContainer width="100%" height={420}>
        {/* unchanged ScatterChart with brighter ReferenceLines from Step 1 */}
      </ResponsiveContainer>
    </div>
  )
```

The 2×2 CSS grid places each label in its own quadrant cell, anchored to the cell corner that aligns with the chart-pane corner. The visible crosshair from Step 1 visually divides the chart into the 4 quadrants the labels describe.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add components/report-sections/peec-ai/bot-vs-human-scatter.tsx
git commit -m "FB-046: §D scatter crosshair brightened + quadrant labels placed in true quadrant cells"
```

---

## Task 11: FB-047 — §D scatter hover URL

**Files:**
- Modify: `components/report-sections/peec-ai/bot-vs-human-scatter.tsx:74-84`

**Background:** Tina V2 row 6-b: *"When you hover over the dots it should display the page URL or something to indicate what the dot represents."* Tooltip's `labelFormatter` reads `payload[0].payload.path` but the rendering is confusing.

- [ ] **Step 1: Replace Tooltip with custom content**

In [bot-vs-human-scatter.tsx:74-84](components/report-sections/peec-ai/bot-vs-human-scatter.tsx:74) replace:

```typescript
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0]?.payload as { path?: string; bots?: number; humans?: number } | undefined
              if (!p) return null
              return (
                <div className="rounded-md border border-white/[0.08] bg-[#272727] p-3 text-xs">
                  <div className="mb-2 font-semibold text-white">{p.path ?? '(unknown)'}</div>
                  <div className="text-white/70">AI Bot Visits: <span className="tabular-nums text-white">{(p.bots ?? 0).toLocaleString()}</span></div>
                  <div className="text-white/70">Human Sessions: <span className="tabular-nums text-white">{(p.humans ?? 0).toLocaleString()}</span></div>
                </div>
              )
            }}
          />
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/report-sections/peec-ai/bot-vs-human-scatter.tsx
git commit -m "FB-047: §D scatter custom tooltip surfaces page path + bot/human counts on hover"
```

---

## Task 12: FB-049 — §E slope chart right legend + hover muting

**Files:**
- Modify: `components/report-sections/peec-ai/slope-chart.tsx:45-118`

**Background:** Tina V2 row 7: *"Can we just add the list to the right margin in the order of 'Current'? And then when you hover over one of the dots/lines, it mutes the color of the others?"*

- [ ] **Step 1: Refactor SlopeChart to add hover state + right-margin legend + per-line opacity**

Replace [slope-chart.tsx:45-118](components/report-sections/peec-ai/slope-chart.tsx:45) with:

```typescript
export default function SlopeChart({ input, compareActive }: Props) {
  const [metric, setMetric] = useState<SlopeMetric>('ai-referral')
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null)

  if (!compareActive) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
        <p className="text-xs text-text-muted">
          Turn on a comparison period from the date picker to see which pages are gaining momentum across periods.
        </p>
      </div>
    )
  }

  const result = computeSlopeChart(metric, input)

  if (result.points.length === 0) {
    return (
      <div className="space-y-3">
        <ToggleRow active={metric} onChange={setMetric} />
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">No movers in this metric for the selected periods.</p>
        </div>
      </div>
    )
  }

  const chartData = [
    { period: 'Prior',   ...Object.fromEntries(result.points.map((p) => [p.url, p.prior])) },
    { period: 'Current', ...Object.fromEntries(result.points.map((p) => [p.url, p.current])) },
  ]

  const yTickFormatter = metric === 'citation-share'
    ? (v: number) => `${v.toFixed(1)}%`
    : (v: number) => `${v.toLocaleString()}`

  // Right-margin legend: sort by Current value desc (Tina's literal ask).
  const legendItems = [...result.points].sort((a, b) => b.current - a.current)

  const opacityFor = (url: string) => {
    if (hoveredUrl === null) return 0.7
    return hoveredUrl === url ? 1.0 : 0.15
  }

  return (
    <div className="space-y-3">
      <ToggleRow active={metric} onChange={setMetric} />
      <div className="flex gap-4">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#FFFFFF14" />
              <XAxis dataKey="period" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <YAxis tickFormatter={yTickFormatter} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              {hoveredUrl && (
                <Tooltip
                  contentStyle={{ background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}
                  labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
                  itemStyle={{ color: '#FFFFFF' }}
                  formatter={(value: unknown, name: unknown) => {
                    if (String(name) !== hoveredUrl) return [null, null]
                    const p = result.points.find((pt) => pt.url === String(name))
                    const label = p?.topic ?? String(name)
                    return [yTickFormatter(Number(value)), label]
                  }}
                />
              )}
              {result.points.map((p) => (
                <Line
                  key={p.url}
                  type="linear"
                  dataKey={p.url}
                  stroke={DIRECTION_COLOR[p.direction]}
                  strokeOpacity={opacityFor(p.url)}
                  strokeWidth={hoveredUrl === p.url ? 3 : 2}
                  dot={{ r: 3, fill: DIRECTION_COLOR[p.direction], fillOpacity: opacityFor(p.url) }}
                  activeDot={{ r: 5, onMouseEnter: () => setHoveredUrl(p.url), onMouseLeave: () => setHoveredUrl(null) }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto pr-1">
          {legendItems.map((p) => (
            <li
              key={p.url}
              onMouseEnter={() => setHoveredUrl(p.url)}
              onMouseLeave={() => setHoveredUrl(null)}
              className={cn(
                'flex items-center justify-between gap-2 rounded px-2 py-1 text-[10px] transition-colors',
                hoveredUrl === p.url ? 'bg-white/[0.06] text-white' : 'text-text-muted hover:bg-white/[0.03]',
              )}
              style={{ opacity: hoveredUrl === null ? 1 : (hoveredUrl === p.url ? 1 : 0.4) }}
            >
              <span
                className="block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: DIRECTION_COLOR[p.direction] }}
              />
              <span className="flex-1 truncate" title={p.topic ?? p.url}>{p.topic ?? p.url}</span>
              <span className="tabular-nums">{yTickFormatter(p.current)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

Note: confirm `result.points[].topic` exists by reading `lib/peec/slope-chart.ts` `computeSlopeChart` return type. If not present, fall back to `p.url` for the legend label.

- [ ] **Step 2: Type-check + run slope-chart test**

```bash
npx tsc --noEmit
npx tsx lib/peec/slope-chart.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/slope-chart.tsx
git commit -m "FB-049: §E slope chart right-margin legend (sorted by Current desc) + hover mutes other lines"
```

---

## Task 13: Phase 2 push + docs + open PR

- [ ] **Step 1: Push branch**

```bash
git push
```

- [ ] **Step 2: Update feedback-log + changelog + status.md + sheet**

Append 6 entries (one per FB) to log, one combined entry to changelog, bump status.md commits-ahead, set next FB ID to FB-056. Add 6 sheet rows for FB-043, 044, 045, 046, 047, 049.

- [ ] **Step 3: Commit docs**

```bash
git add docs/official-feedback/ "/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab (1).csv"
git commit -m "docs: Phase 2 V2 feedback (FB-043, 044, 045, 046, 047, 049) log + changelog + status + sheet"
git push
```

- [ ] **Step 4: Update PR title and description**

Use `gh pr edit` (the existing Phase 1 PR is still open and will accumulate Phase 2 commits via the same branch). Edit the description to add Phase 2 sections, OR open a follow-up PR if Phase 1 has already merged.

---

# Phase 3 — Investigation-informed fixes (~60 LOC, ships after live data check)

3 FBs. FB-048 needs a 5-minute live Peec API call to lock the fix shape. FB-050 and FB-052 ship the fix and observe the result.

---

## Task 14: Pre-flight live Peec retention check (FB-048 path lock)

**Files:** none (read-only API exploration).

**Background:** Forensic sweep verdict: code permits any date range, but it's unknown whether Peec actually stores >30d of agent-analytics bot data. Need 1 API call to decide which fix shape to ship for FB-048.

- [ ] **Step 1: Find Renaissance Peec project ID + API key**

```bash
grep -n "peecCustomerProjectId\|renaissance" lib/db/schema.ts scripts/seed.ts 2>/dev/null | head -20
# Then read .env.local for PEEC_AI_CUSTOMER_TOKEN
```

- [ ] **Step 2: Run a 60-day window against /agent-analytics/visits**

```bash
TODAY=$(date -u +%Y-%m-%d)
SIXTY=$(date -u -v-60d +%Y-%m-%d)
curl -s -H "X-API-Key: $PEEC_AI_CUSTOMER_TOKEN" \
  "https://api.peec.ai/customer/v1/agent-analytics/visits?project_id=<RENAISSANCE_PID>&start_date=$SIXTY&end_date=$TODAY&limit=10" \
  | head -c 500
```

- [ ] **Step 3: Determine FB-048 path**

- If response contains data: ship FB-048 path (A) — wire `dateRange` into `getAgentAnalytics()` and the scatter GA4 query.
- If response is empty / error / `data: []`: ship FB-048 path (B) — rewrite subtitle to "30-day rolling window (Peec retention limit) — not adjustable via date picker."

Record the choice in the task ledger before proceeding to Task 15.

---

## Task 15: FB-048 — §D scatter date range (path locked from Task 14)

### Path (A) — Peec serves arbitrary ranges (wire the picker)

**Files:**
- Modify: `lib/peec/agent-analytics.ts:222-227, 284-293`
- Modify: `components/report-sections/peec-ai/content-impact.tsx:253, 348-362, 1241`
- Modify: `components/report-sections/peec-ai/technical-audit.tsx:307` (consumer also calls `getAgentAnalytics`)

- [ ] **Step 1: Add dateRange param to getAgentAnalytics**

In [lib/peec/agent-analytics.ts](lib/peec/agent-analytics.ts) add a `dateRange?: string` arg to the impl function. Use `parseDateRange()` from `lib/ga4/client.ts` to convert the magic string to start/end. Fall back to `last30Days()` when omitted (backward-compat for technical-audit.tsx).

- [ ] **Step 2: Wire effectiveRange through the content-impact §D fetches**

Replace [content-impact.tsx:253](components/report-sections/peec-ai/content-impact.tsx:253):
```typescript
    getAgentAnalytics(clientSlug, effectiveRange),
```

Replace the hardcoded GA4 §D query at [content-impact.tsx:348-362](components/report-sections/peec-ai/content-impact.tsx:348):
```typescript
    ga4Query({
      clientSlug,
      dateRange: effectiveRange,
      metrics: ['sessions'],
      dimensions: ['pagePath', 'sessionSource'],
      limit: 1000,
    }),
```

Update subtitle at [content-impact.tsx:1241](components/report-sections/peec-ai/content-impact.tsx:1241):
```typescript
        description="See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate."
```

- [ ] **Step 3: Pass dateRange through the technical-audit consumer**

In `components/report-sections/peec-ai/technical-audit.tsx:307` change to:
```typescript
    getAgentAnalytics(clientSlug, dateRange),
```

- [ ] **Step 4: Update axis labels in the scatter component**

In `bot-vs-human-scatter.tsx` axis labels around lines 65, 72, change "last 30 days" → "selected period".

- [ ] **Step 5: Type-check + test + commit**

```bash
npx tsc --noEmit
npx tsx lib/peec/bot-vs-human-scatter.test.ts
git add lib/peec/agent-analytics.ts \
        components/report-sections/peec-ai/content-impact.tsx \
        components/report-sections/peec-ai/technical-audit.tsx \
        components/report-sections/peec-ai/bot-vs-human-scatter.tsx
git commit -m "FB-048: §D scatter honors date range picker (Peec serves arbitrary ranges)"
```

### Path (B) — Peec only stores 30d (rewrite subtitle)

- [ ] **Step 1: Replace §D subtitle**

In [content-impact.tsx:1241](components/report-sections/peec-ai/content-impact.tsx:1241):
```typescript
        description="See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate. Peec only retains the last 30 days of bot crawl data, so this chart shows a rolling 30-day window regardless of the page date range."
```

- [ ] **Step 2: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-048: §D subtitle clarifies 30d retention is a Peec limit, not a config gap"
```

---

## Task 16: FB-050 — §F subdomain page match fix

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx:1255-1268`

**Interfaces:**
- Consumes: `filteredOwnDomains` (already exists)
- Behavior change: replace exact host equality with parent-domain suffix match

**Background:** Forensic sweep verdict: §F filter at line 1265-1268 uses exact-host string equality. If Peec lists `renaissance.com` as Own and cites `blog.renaissance.com`, the row is silently dropped. **This is the likely real cause of "only 14 pages."**

- [ ] **Step 1: Replace exact-host check with parent-domain suffix match**

In [content-impact.tsx:1255-1268](components/report-sections/peec-ai/content-impact.tsx:1255) replace:

```typescript
        // FB-050: owned-host matching uses parent-domain suffix match instead of
        // exact equality. A cited URL on blog.renaissance.com counts as owned
        // when Peec lists renaissance.com as Own. Without this, subdomain pages
        // were silently dropped, hiding most owned cited content from §F.
        const ownedHostKeys = filteredOwnDomains
          .map((d) => urlJoinKey(d.domain))
          .filter((k): k is string => k !== null)

        const isOwnedHost = (citationHost: string | null): boolean => {
          if (!citationHost) return false
          return ownedHostKeys.some(
            (ownedKey) => citationHost === ownedKey || citationHost.endsWith(`.${ownedKey}`),
          )
        }

        const fullsiteRows: FullsiteContentPerformanceRow[] = urlCitations
          .filter((c) => {
            const hostKey = urlJoinKey(c.domain)
            return isOwnedHost(hostKey) && (c.citationCount ?? 0) > 0
          })
          .map((c) => {
```

- [ ] **Step 2: Add subtitle count caption to §F (fallback if subdomain fix doesn't surface enough rows)**

Optional safety net — pass row count to FullsiteContentPerformanceTable and render in subtitle: "Showing N cited pages on owned domains." Implement only if Tina pushes back after seeing the new row count.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-050: §F owned-host match accepts subdomains (was dropping rows silently)"
```

---

## Task 17: FB-052 — §H.1 competitor cap bump

**Files:**
- Modify: `lib/peec/client.ts:407-408` (Peec API limit bump)
- Modify: `components/report-sections/peec-ai/content-impact.tsx:1361` (UI slice bump)

**Background:** Forensic sweep verdict: no hidden cap beyond Peec's default `limit: 100` for `/reports/domains` + UI `.slice(0, 10)`. Bump both to surface what Peec actually has.

- [ ] **Step 1: Bump Peec /reports/domains limit to 500**

In [lib/peec/client.ts:407-408](lib/peec/client.ts:407) replace:

```typescript
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current, limit: 500 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...prior,   limit: 500 }, pid),
```

- [ ] **Step 2: Bump UI slice from 10 to 25**

In [content-impact.tsx:1361](components/report-sections/peec-ai/content-impact.tsx:1361) replace `.slice(0, 10)` with `.slice(0, 25)`.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add lib/peec/client.ts components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-052: bump Peec /reports/domains limit to 500 + §H.1 UI slice to 25 to surface more competitors"
```

---

## Task 18: Phase 3 push + docs + open PR

- [ ] **Step 1: Push branch + open PR**

```bash
git push
gh pr create --title "Content Impact V2 Phase 3: §D date range + §F subdomain match + §H.1 competitor cap" --body "..."
```

- [ ] **Step 2: Update feedback-log + changelog + status.md + sheet**

Append 3 entries to log, one combined to changelog, bump status.md, set next FB ID to FB-056. Add 3 sheet rows.

- [ ] **Step 3: Commit docs + push**

```bash
git add docs/official-feedback/ "/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab (1).csv"
git commit -m "docs: Phase 3 V2 feedback (FB-048, 050, 052) log + changelog + status + sheet"
git push
```

---

# Verification Checklist (before declaring V2 done)

- [ ] All 6 test files pass: `npx tsc --noEmit && DATABASE_URL=postgres://test:test@localhost/test npx tsx lib/ga4/client.test.ts && npx tsx lib/peec/bot-vs-human-scatter.test.ts && npx tsx lib/peec/slope-chart.test.ts && npx tsx lib/peec/url-citations.test.ts && npx tsx lib/peec/content-impact-synopsis.test.ts && npx tsx lib/ga4/content-derive.test.ts`
- [ ] Visual QA on Vercel preview for Renaissance client:
  - [ ] §A Prompt Coverage shows delta when compare period is on
  - [ ] §H.1 Citation Share max value ≤ ~40% (never >100%)
  - [ ] §H.1 column header reads "Source Visibility"
  - [ ] §H.1 + §H.2 tooltips read share-of-period text
  - [ ] §B footnote names 3 causes of `--`; "X of Y unmatched" stat present
  - [ ] §B, §F, §H.1 every metric column has its own sortable Δ column
  - [ ] §C Fastest + Slowest tiles show source URL beneath value
  - [ ] §D crosshair is clearly visible; quadrant labels in 4 cells; hover shows URL + counts
  - [ ] §D matches date range (Path A) OR subtitle says Peec 30d limit (Path B)
  - [ ] §E right-margin legend sorted by Current desc; hover mutes other lines
  - [ ] §F shows more pages than 14 after subdomain fix
  - [ ] §H.1 shows up to 25 competitors after cap bump
  - [ ] Executive synopsis prose does NOT make inflated citation claims
- [ ] All 16 sheet rows for Renaissance V2 have V2 columns filled in
- [ ] PR(s) merged to main
- [ ] `status.md` updated; next FB ID set to FB-056

---

# Notes for executing agent

- The `superpowers:subagent-driven-development` skill will dispatch this plan task-by-task. The plan reads top-to-bottom — execute in order.
- Tasks 1-6 = Phase 1, then PR + visual QA pause. Tasks 7-13 = Phase 2, then PR + visual QA pause. Tasks 14-18 = Phase 3.
- The 5 sheet rows for Phase 1 / 6 rows for Phase 2 / 3 rows for Phase 3 go into columns F (V2 — What shipped), G (V2 — Accepted?), H (V2 — Your feedback) of the existing CSV at `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Content Impact Tab (1).csv`. Leave G and H blank; Tina fills those.
- Branch is `official-feedback-content-impact-tab-content-v2` (cut from main at a447713 on 2026-06-25).
- After all 3 phases merge, this plan is fully executed. Final FB count: FB-042 through FB-055 (14 FBs total, FB-044 covers 3 sections).
