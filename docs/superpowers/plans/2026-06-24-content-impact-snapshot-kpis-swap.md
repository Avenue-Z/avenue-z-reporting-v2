# FB-034 — Content Impact §A Snapshot KPIs Swap + Delta Display

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Content Impact tab's §A Snapshot KPIs strip (currently 8 cards) with Tina's 4 new cards (Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic), and wire delta-vs-prior-period display so the cards actually change when a comparison period is selected (Tina's flagged ISSUE).

**Architecture:** The page router already passes `compareRange` to `ContentImpactReport` but the component ignores it — that IS the bug. We accept the prop, derive the prior date range via `deriveCompareRange()` (same helper Overview uses), add two new GA4 queries (`sessionSource` × `sessionDefaultChannelGroup` for main + prior) that give us all 4 KPIs' current and prior values in 2 fetches, then extend the local `KpiCard` component with a `delta?: number` prop that renders an arrow + magnitude + "vs previous period" line (mirroring Overview's exact rendering). The 8 old KPI cards' JSX is replaced with 4 new ones. The synopsis context (FB-033) gets surgically updated to drop orphaned old fields and add the new KPI values; cache version bumps `v1-glean-ci → v2-glean-ci-kpi-swap` so existing cached synopses flush.

**Tech Stack:** Next.js 15 RSC, TypeScript strict, GA4 Data API via `ga4Query()` from `@/lib/ga4/client`, Peec AI via existing `peecData` (which already returns prior-period citations), `node:assert` + `tsx` for tests.

## Global Constraints

- **Tina's verbatim ask:** "Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic." 4 cards total. No more, no fewer.
- **Tina's flagged ISSUE:** "Right now, when you have a comparison period turned on, it doesn't display change." Every KPI that CAN show delta MUST show it when `compareRange` is non-null.
- **Glean Chat ONLY for LLM inference.** No other vendor.
- **FB-031 hardening pattern intact.** Cache version bumps on every prompt/schema change (mandatory).
- **FB-025 numeric formatting carried forward.** 1 decimal max in prose, thousands separators on counts.
- **No em-dashes** in new copy or prompt text.
- **Truth-grounded only.** A KPI with no prior data shows the value alone (no fake "+0%" / no "vs previous period" line). Never fabricate a delta.
- **Never skip hooks.** No `--no-verify`. No force-push.
- **All commits on branch** `official-feedback-content-impact-tab-content-v1`. PR #77 (FB-033) is still open; this round extends that PR rather than opening a new one, OR ships a follow-up PR after #77 merges — Thomas's call at Task 6.

---

## File Structure

| File | Role |
|---|---|
| `components/report-sections/peec-ai/content-impact.tsx` (MODIFY) | Accept `compareRange?: string` prop. Derive prior-period dates. Add 2 GA4 queries to `Promise.allSettled` for `sessionSource × sessionDefaultChannelGroup` main + prior. Compute the 4 new KPI values + deltas. Replace the 8-card §A JSX with 4 new cards. Update local `KpiCard` component (lines 71-88) to add `delta?: number` + `invertDelta?: boolean` props rendering arrow + magnitude + "vs previous period". |
| `lib/peec/content-impact-synopsis.ts` (MODIFY) | Refactor `ContentImpactSynopsisContext`: drop 5 orphaned old-KPI fields (plannedUrlsInScope, liveUrls, totalSessions, ownedUrlsWithAiActivity, unmatchedPct), rename `aiReferredSessions → aiReferralTraffic` for clarity, keep `totalAiCitations` + `ownedDomainsCited` (still useful for prose grounding + validator Rules 2-3), ADD `yourBrandCitations` + `totalCitationsAllDomains` + `citationSharePct` + `promptCoveragePct` + `organicTraffic` + prior values where applicable + their deltas. Update `buildContext()` data section accordingly. Bump cache version `v1-glean-ci → v2-glean-ci-kpi-swap`. |
| `lib/peec/content-impact-synopsis.test.ts` (MODIFY) | Update `baseContext()` factory to match new context shape. Keep all 10 existing validator assertions passing (they exercise Rules 1-3 which are unchanged). |
| `docs/official-feedback/feedback-log.md` (MODIFY) | New FB-034 entry under `## Closed` with sub-items FB-034-a (KPI swap) + FB-034-b (delta display), sheet row, commit SHAs, deferred items, verification receipts. |
| `docs/official-feedback/changelog.md` (MODIFY) | New FB-034 row with all commit SHAs in chronological order. |
| `docs/official-feedback/status.md` (MODIFY) | Bump next FB ID to FB-035. Append FB-034 to shipped FB log. Remove the deferred-ISSUE bullet (it's now fixed). |

**Files NOT touched:**
- `components/report-sections/peec-ai/content-impact-synopsis.tsx` (RSC) — its props are typed through `ContentImpactSynopsisContext`, no change needed.
- `lib/peec/url-citations.ts`, `lib/peec/coverage.ts`, etc. — `getDomainCoverage()` stays single-arg; Prompt Coverage delta deferred (documented as known limitation in feedback-log).
- Page router files (`app/portal/...` / `app/dashboard/...`) — already pass `compareRange`; just being ignored today.

---

## Locked Contract — New KPI Definitions + Field Names

These names + types are used across Tasks 2-5. Do not drift.

```typescript
// New KPI values computed at orchestrator scope in content-impact.tsx Task 3.

// Citation Share — share of total citations across all tracked domains
// captured by the brand's owned domains. Mirrors Overview's definition
// at components/report-sections/peec-ai/index.tsx:188.
//   pct = (yourBrandCitations / totalCitationsAllDomains) * 100
// Prior values come from existing peecData (yourBrandCitationsPrior, totalCitationsAllDomainsPrior).
// Delta = currentPct - priorPct  (in percentage points, not %-of-pct).

// Prompt Coverage — percentage of tracked prompts that cite at least one
// owned domain. Aggregate across all owned domains (union of prompt IDs).
//   pct = roundToInt(uniquePromptIdsAcrossOwned / totalTrackedPrompts * 100)
// No prior value available in v1 (getDomainCoverage signature does not
// accept dateRange — refactor deferred to a future FB). Card shows value
// only; no delta line.

// AI Referral Traffic — sum of GA4 sessions where sessionSource is in the
// AI-source list (isAiSource). Same metric as the current §A KPI #5.
// Pulled from the new sessionSource × sessionDefaultChannelGroup query
// (filtered by isAiSource(sessionSource)) for both main + prior periods.
// Delta = ((current - prior) / prior) * 100  (percentage change).

// Organic Traffic — sum of GA4 sessions where sessionDefaultChannelGroup
// === 'Organic Search'. Pulled from the same new query (filtered by
// channel group) for both main + prior periods.
// Delta = ((current - prior) / prior) * 100  (percentage change).
```

**Synopsis context — locked shape after Task 5:**

```typescript
export type ContentImpactSynopsisContext = {
  // §A KPI values (NEW for FB-034) — these are what the page renders.
  citationSharePct: number | null               // 0-100, 1 decimal
  citationSharePctDelta: number | null          // pp change vs prior
  promptCoveragePct: number | null              // 0-100, integer
  // no promptCoveragePctDelta in v1 — getDomainCoverage has no dateRange
  aiReferralTraffic: number | null              // raw count
  aiReferralTrafficDelta: number | null         // % change vs prior
  organicTraffic: number | null                 // raw count
  organicTrafficDelta: number | null            // % change vs prior

  // Supporting context (prose grounding — kept from FB-033 where useful).
  totalAiCitations: number                      // for "earned 1,407 AI citations" (validator Rule 2)
  yourBrandCitations: number                    // for Citation Share subtitle context
  totalCitationsAllDomains: number              // for Citation Share denominator
  ownedDomainsCited: number                     // for "4 owned domains were cited" (validator Rule 3)

  // Existing top-items lists — unchanged from FB-033.
  topOwnedDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topCompetitorDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topBrandAbsentCompetitorUrls: Array<{ url: string; host: string; citationCount: number }>
  brandAbsentCompetitorUrlCount: number         // validator Rule 1
}
```

**Cache version:** `v1-glean-ci` → **`v2-glean-ci-kpi-swap`**.

**Validator rules unchanged:** Rules 1 (brand-absent), 2 (total AI citations), 3 (owned domains cited). FB-031 narrow-by-design principle: don't add new rules speculatively.

---

## Task 1: Extend local `KpiCard` with `delta` + `invertDelta` props

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx:71-88`

**Interfaces:**
- Consumes: nothing.
- Produces: `KpiCard` props now include `delta?: number` (percentage points or % depending on context — caller's responsibility) + `invertDelta?: boolean` (true = lower is better, e.g., "% unmatched"). Render: arrow ↑ green `#60FF80` (positive when `!invertDelta`) or ↓ red `#FF4444` (negative), magnitude with 1 decimal, " vs previous period". When `delta === undefined`, render nothing extra (no line). Used by Tasks 3-4.

- [ ] **Step 1: Read current `KpiCard` to confirm shape**

Run: `sed -n '71,90p' components/report-sections/peec-ai/content-impact.tsx`

Confirm the current shape is `function KpiCard({ label, value, hint, live }: { label: string; value: string; hint: string; live?: boolean })`.

- [ ] **Step 2: Replace the `KpiCard` function with the delta-aware version**

Open `components/report-sections/peec-ai/content-impact.tsx`. Find the existing `function KpiCard({ ... })` block (lines 71-88). Replace it with:

```typescript
function KpiCard({
  label,
  value,
  hint,
  live,
  delta,
  invertDelta,
}: {
  label: string
  value: string
  hint: string
  live?: boolean
  delta?: number
  invertDelta?: boolean
}) {
  const positive = invertDelta ? (delta != null && delta <= 0) : (delta != null && delta >= 0)
  return (
    <div className="rounded-xl border border-white/[0.08] bg-bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <p className={cn('mt-2 text-2xl font-bold tabular-nums', live ? 'text-white' : 'text-white/20')}>
        {value}
      </p>
      {delta !== undefined && (
        <p className={cn('mt-1 text-sm font-bold', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
          {positive ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs previous period
        </p>
      )}
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
    </div>
  )
}
```

Two changes from the original: added `delta` + `invertDelta` to the props type; inserted the conditional `<p>` block between `value` and `hint`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

If TS errors complain about callers passing old props — none should, since the new props are optional additions, but if they do, fix the call site to use the new shape.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-034 (Task 1): extend KpiCard with delta + invertDelta props

Mirrors Overview's KpiCard delta rendering exactly: arrow up green
(#60FF80) when delta is positive (or invertDelta-inverted), arrow down
red (#FF4444) otherwise, magnitude with 1 decimal, " vs previous period".
When delta is undefined the line renders nothing (no spurious 0%).

Unblocks Task 3 / Task 4 KPI swap with delta display.
EOF
)"
```

## Self-review for Task 1

1. `git log --oneline -1` shows the Task 1 commit.
2. `git status --short` clean (ignore the plan doc).
3. `npx tsc --noEmit` zero output.
4. `grep -n "delta !== undefined" components/report-sections/peec-ai/content-impact.tsx` shows exactly 1 hit (the new conditional).
5. `grep -c "—" components/report-sections/peec-ai/content-impact.tsx` — unchanged from before (only the existing demo-mode `—` in SampleDataBadge string, which we do NOT touch).

---

## Task 2: Plumb `compareRange` + add prior-period GA4 fetches

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (signature + imports + Promise.allSettled additions; NO JSX changes)

**Interfaces:**
- Consumes: `parseDateRange` + `deriveCompareRange` from `@/lib/ga4/client`, `ga4Query` (already imported).
- Produces: local variables `compareRange`, `mainIso`, `compareIso`, `ga4TrafficMainRows`, `ga4TrafficPriorRows`, and `aiPriorOk` / `organicPriorOk` booleans, all in scope at the orchestrator's bottom-of-derivations section (just before §A KPI JSX). These are used by Task 3.

- [ ] **Step 1: Add `compareRange` to the component signature**

Find the `export async function ContentImpactReport({ ... })` signature. Currently it's around line 185-195:

```typescript
export async function ContentImpactReport({
  clientSlug,
  dateRange,
  demoMode = false,
  models,
}: {
  clientSlug: string
  dateRange?: string
  demoMode?: boolean
  models?: AEOModel[] | null
})
```

Add `compareRange?: string`:

```typescript
export async function ContentImpactReport({
  clientSlug,
  dateRange,
  compareRange,
  demoMode = false,
  models,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string
  demoMode?: boolean
  models?: AEOModel[] | null
})
```

- [ ] **Step 2: Add date-range derivation imports**

Find the existing `import` from `@/lib/ga4/client`. It likely reads `import { ga4Query, isAiSource } from '@/lib/ga4/client'`. Extend it to:

```typescript
import { ga4Query, isAiSource, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
```

If `parseDateRange` and `deriveCompareRange` are already imported elsewhere, don't duplicate.

- [ ] **Step 3: Derive main + compare ISO date strings near the top of the body**

Insert this block IMMEDIATELY after the existing `dateRange` value is resolved (likely just inside the function body, before any data fetches). The exact line is just before the `Promise.allSettled([...])` call (around line 198):

```typescript
  // FB-034: derive compare-period ISO ranges. compareRange is passed by
  // the page router (already wired) but was previously ignored. Use
  // deriveCompareRange to default to 'previous_period' when the caller
  // doesn't pass an explicit comparison range; null means no compare.
  const mainRangeStr = dateRange ?? 'last_30_days'
  const mainDates = parseDateRange(mainRangeStr)
  const mainIso = `${mainDates.startDate},${mainDates.endDate}`
  const compareDates = compareRange
    ? parseDateRange(compareRange)
    : deriveCompareRange(mainRangeStr, 'previous_period')
  const compareIso = compareDates ? `${compareDates.startDate},${compareDates.endDate}` : null
```

- [ ] **Step 4: Add 2 GA4 queries to the existing `Promise.allSettled`**

Find the existing `Promise.allSettled([...])` block (line 198-222 region). It currently has 8 promises (peecResult, agentResult, calendarResult, ga4Result, urlCitationsResult, coverageResult, ga4AiHostResult, ga4AiPathResult).

Add two new promises at the END of the array, BEFORE the closing `])`. Adjust the destructured tuple on the LHS to match the new length. Specifically:

Replace:

```typescript
  const [peecResult, agentResult, calendarResult, ga4Result, urlCitationsResult, coverageResult, ga4AiHostResult, ga4AiPathResult] = await Promise.allSettled([
    // ...existing 8 promises...
  ])
```

with:

```typescript
  const [
    peecResult,
    agentResult,
    calendarResult,
    ga4Result,
    urlCitationsResult,
    coverageResult,
    ga4AiHostResult,
    ga4AiPathResult,
    ga4TrafficMainResult,
    ga4TrafficPriorResult,
  ] = await Promise.allSettled([
    // ...existing 8 promises (unchanged)...
    // FB-034: sessionSource × sessionDefaultChannelGroup for §A KPI cards.
    // Single shape, run for both main + prior so we can compute AI Referral
    // Traffic and Organic Traffic + their deltas off two queries instead of
    // four. limit 1000 because (source × channel-group) cardinality is small.
    clientSlug
      ? ga4Query({
          clientSlug,
          dateRange: mainIso,
          metrics: ['sessions'],
          dimensions: ['sessionSource', 'sessionDefaultChannelGroup'],
          limit: 1000,
        })
      : Promise.resolve(null),
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['sessionSource', 'sessionDefaultChannelGroup'],
          limit: 1000,
        })
      : Promise.resolve(null),
  ])
```

If the existing 8 promises are currently expressed on individual lines, preserve them verbatim and only ADD the two new ones at the end + adjust the destructure. Do NOT reformat the existing 8.

- [ ] **Step 5: Extract rows from the new results + add rejection logging**

After the existing block that does `const ga4AiHostRows = ga4AiHostResult.status === 'fulfilled' ? ga4AiHostResult.value.rows : null` (around line 239), add:

```typescript
  // FB-034: §A KPI source rows. null = query rejected or no compareRange;
  // each derived KPI uses its own ok-check (aiPriorOk, organicPriorOk) to
  // distinguish "no prior available" from "real zero".
  const ga4TrafficMainRows = ga4TrafficMainResult.status === 'fulfilled' && ga4TrafficMainResult.value
    ? ga4TrafficMainResult.value.rows
    : null
  const ga4TrafficPriorRows = ga4TrafficPriorResult.status === 'fulfilled' && ga4TrafficPriorResult.value
    ? ga4TrafficPriorResult.value.rows
    : null
```

After the existing block of `if (..Result.status === 'rejected') console.error(...)` lines (around line 254-260), add:

```typescript
  if (ga4TrafficMainResult.status  === 'rejected') console.error('[content-impact] GA4 §A traffic main error:', ga4TrafficMainResult.reason)
  if (ga4TrafficPriorResult.status === 'rejected') console.error('[content-impact] GA4 §A traffic prior error:', ga4TrafficPriorResult.reason)
```

- [ ] **Step 6: Type-check + smoke-render**

Run: `npx tsc --noEmit`
Expected: zero output.

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected: both `passed.` lines (unchanged from FB-033 — synopsis tests still pass).

No JSX has changed yet; the page should render identically to before this commit. The new query results are computed but unused.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-034 (Task 2): plumb compareRange + add prior-period GA4 fetches

Accept compareRange?: string on ContentImpactReport (page router has been
passing this prop but the component was ignoring it, which is the root
cause of Tina's "no change displayed" ISSUE). Derive mainIso/compareIso
via parseDateRange + deriveCompareRange, defaulting to 'previous_period'
when compareRange is not explicitly passed.

Add 2 GA4 queries to the existing Promise.allSettled with shape
sessionSource × sessionDefaultChannelGroup × sessions, one for main and
one for prior. Single query shape feeds both AI Referral Traffic and
Organic Traffic for both periods (Task 3 derives the four KPI values).

No JSX changes in this commit. The page renders identically. New data
sits in ga4TrafficMainRows / ga4TrafficPriorRows ready for Task 3.
EOF
)"
```

## Self-review for Task 2

1. `git log --oneline -2` shows Task 2 on top of Task 1.
2. `npx tsc --noEmit` clean.
3. `grep -n "compareRange\b" components/report-sections/peec-ai/content-impact.tsx` shows at least 4 hits (signature, type, derivation, query).
4. `grep -n "ga4TrafficMainResult\|ga4TrafficPriorResult" components/report-sections/peec-ai/content-impact.tsx` shows at least 4 hits each (promise + destructure + rows extract + reject logger).
5. `grep -n "deriveCompareRange\|parseDateRange" components/report-sections/peec-ai/content-impact.tsx` shows at least the import + the two uses.

---

## Task 3: Compute the 4 new KPI values + deltas

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (add a derivations block just before the JSX `return (`; NO JSX swap yet — that's Task 4)

**Interfaces:**
- Consumes: `peecData` (existing), `coverage` + `domainPromptIds` + `ownDomains` (existing), `ga4TrafficMainRows` + `ga4TrafficPriorRows` (from Task 2), `isAiSource` (already imported).
- Produces: 8 local variables consumed by Task 4's JSX: `citationSharePct`, `citationSharePctDelta`, `promptCoveragePct`, `aiReferralTraffic`, `aiReferralTrafficDelta`, `organicTraffic`, `organicTrafficDelta`, plus 1 shape variable `aiPriorAvailable` (for the delta-rendering gate).

- [ ] **Step 1: Insert the 4-KPI computation block before the JSX `return (`**

Find the comment `// ── Render ──────` near line 470 (just before `return (`). Insert this block IMMEDIATELY before that comment. (The Task 5 synopsisContext block from FB-033 must come AFTER this so it can reference the new KPI values — leave that for Task 5; for now, this Task 3 block lands here.)

```typescript
  // ── FB-034 · §A Snapshot KPI derivations (Tina's 4 new metrics) ─────────────

  // Helper: sessions sum across rows filtered by predicate. Returns null only
  // when rows itself is null (query rejected); 0 means "real zero".
  const sumSessions = (rows: typeof ga4TrafficMainRows, pred: (r: { sessionSource?: unknown; sessionDefaultChannelGroup?: unknown }) => boolean): number | null => {
    if (rows === null) return null
    return rows.filter(pred).reduce((s, r) => s + (Number(r.sessions) || 0), 0)
  }

  const isAiRow = (r: { sessionSource?: unknown }) =>
    isAiSource(String(r.sessionSource ?? ''))
  const isOrganicRow = (r: { sessionDefaultChannelGroup?: unknown }) =>
    String(r.sessionDefaultChannelGroup ?? '') === 'Organic Search'

  // KPI 1: Citation Share. Mirror Overview's definition (peec-ai/index.tsx:188).
  // Numerator: peecData.yourBrandCitations. Denominator: peecData.totalCitations.
  // Prior values come from peecData.yourBrandCitationsPrior + .totalCitationsPrior.
  const totalCitationsAllDomains = peecData?.totalCitations ?? 0
  const yourBrandCitations = peecData?.yourBrandCitations ?? 0
  const citationSharePct = totalCitationsAllDomains > 0
    ? (yourBrandCitations / totalCitationsAllDomains) * 100
    : null
  const yourBrandCitationsPrior = peecData?.yourBrandCitationsPrior ?? null
  const totalCitationsPrior = peecData?.totalCitationsPrior ?? null
  const citationSharePctPrior =
    yourBrandCitationsPrior != null && totalCitationsPrior != null && totalCitationsPrior > 0
      ? (yourBrandCitationsPrior / totalCitationsPrior) * 100
      : null
  const citationSharePctDelta =
    citationSharePct != null && citationSharePctPrior != null
      ? citationSharePct - citationSharePctPrior  // percentage points
      : null

  // KPI 2: Prompt Coverage. Aggregate across all owned domains (union of
  // prompt IDs cited). No prior-period value available in v1 because
  // getDomainCoverage(clientSlug) does not accept a dateRange parameter
  // (lib/peec/url-citations.ts:286). Card renders value with no delta line.
  const ownedPromptIdSet = new Set<string>()
  for (const d of ownDomains) {
    for (const pid of domainPromptIds(coverage, d.domain)) {
      ownedPromptIdSet.add(pid)
    }
  }
  const promptCoveragePct = coverageAvailable && totalTrackedPrompts > 0
    ? Math.round((ownedPromptIdSet.size / totalTrackedPrompts) * 100)
    : null

  // KPI 3: AI Referral Traffic. Same definition as the current §A KPI #5
  // (ga4AiReferredSessions), sourced from the new sessionSource ×
  // sessionDefaultChannelGroup query so prior-period is available in one
  // place. Delta = ((current - prior) / prior) * 100 when prior > 0.
  const aiReferralTraffic = sumSessions(ga4TrafficMainRows, isAiRow)
  const aiReferralTrafficPrior = sumSessions(ga4TrafficPriorRows, isAiRow)
  const aiReferralTrafficDelta =
    aiReferralTraffic != null && aiReferralTrafficPrior != null && aiReferralTrafficPrior > 0
      ? ((aiReferralTraffic - aiReferralTrafficPrior) / aiReferralTrafficPrior) * 100
      : null

  // KPI 4: Organic Traffic. GA4's "Organic Search" channel grouping —
  // includes Google, Bing, etc. organic search but excludes paid search,
  // direct, referral, AI sources. Delta same as AI Referral Traffic.
  const organicTraffic = sumSessions(ga4TrafficMainRows, isOrganicRow)
  const organicTrafficPrior = sumSessions(ga4TrafficPriorRows, isOrganicRow)
  const organicTrafficDelta =
    organicTraffic != null && organicTrafficPrior != null && organicTrafficPrior > 0
      ? ((organicTraffic - organicTrafficPrior) / organicTrafficPrior) * 100
      : null

  // Booleans for the delta-rendering gate. When prior data is unavailable
  // (rejected query, no compareRange selected) we render the value with
  // no delta line. Truth-grounded: no fake "+0%".
  const aiPriorAvailable = aiReferralTrafficPrior !== null
  const organicPriorAvailable = organicTrafficPrior !== null
  const citationSharePriorAvailable = citationSharePctPrior !== null
  // promptCoveragePriorAvailable intentionally absent — v1 limitation noted above.
  void aiPriorAvailable
  void organicPriorAvailable
  void citationSharePriorAvailable
```

The `void` lines suppress unused-variable warnings; Task 4 wires them into JSX.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

Common errors to watch for:
- `peecData.yourBrandCitations` / `yourBrandCitationsPrior` / `totalCitationsPrior` field names — these come from Peec; verify against `lib/peec/client.ts` if tsc complains. If the actual field names differ, adjust the property accesses (do NOT change the type system, just the access). The Overview KPI at `components/report-sections/peec-ai/index.tsx:188-197` is the canonical reference for the right field names.
- `coverageAvailable` and `totalTrackedPrompts` should already exist in scope from earlier derivations at content-impact.tsx:336-338. If not, add them just above this block:
  ```typescript
  const totalTrackedPrompts = peecData?.trackedPrompts.length ?? 0
  const coverageAvailable =
    Object.keys(coverage.promptIdsByDomain).length > 0 ||
    Object.keys(coverage.tagIdsByDomain).length > 0
  ```

- [ ] **Step 3: Re-run synopsis test (sanity)**

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected: both `passed.` lines (unchanged — Task 3 doesn't touch the synopsis module).

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-034 (Task 3): compute the 4 new §A KPI values + deltas

Adds the data layer for Tina's 4 new KPIs without touching JSX yet.

- Citation Share: yourBrandCitations / totalCitations * 100. Prior values
  already on peecData (yourBrandCitationsPrior, totalCitationsPrior).
  Delta is the percentage-point difference.
- Prompt Coverage: aggregate across owned domains, union of prompt IDs
  cited, divided by totalTrackedPrompts * 100. No prior data in v1
  (getDomainCoverage does not accept dateRange); card will render value
  only with no delta line.
- AI Referral Traffic: sum sessions where isAiSource(sessionSource).
  Prior from new ga4TrafficPriorRows. Delta is % change.
- Organic Traffic: sum sessions where sessionDefaultChannelGroup ===
  'Organic Search'. Prior likewise. Delta is % change.

Truth-grounded: when prior is unavailable (rejected query / no compare
period), delta stays null and the card renders the value alone, no fake
"+0%".
EOF
)"
```

## Self-review for Task 3

1. `git log --oneline -3` shows three FB-034 commits chronological.
2. `npx tsc --noEmit` zero output.
3. `grep -n "citationSharePct\|promptCoveragePct\|aiReferralTraffic\|organicTraffic" components/report-sections/peec-ai/content-impact.tsx` shows all 4 KPI names + their delta + prior variants defined.
4. `npx tsx lib/peec/content-impact-synopsis.test.ts` — both passed lines.

---

## Task 4: Swap §A JSX from 8 cards to 4 cards

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (replace the §A JSX block at lines ~486-564)

**Interfaces:**
- Consumes: `citationSharePct`, `citationSharePctDelta`, `promptCoveragePct`, `aiReferralTraffic`, `aiReferralTrafficDelta`, `organicTraffic`, `organicTrafficDelta`, `aiPriorAvailable`, `organicPriorAvailable`, `citationSharePriorAvailable`, `calendarIsDemo` (existing), `models` (existing).
- Produces: rendered §A strip with exactly 4 KPI cards.

- [ ] **Step 1: Replace the entire §A KPI section JSX**

In `content-impact.tsx`, find the §A region. It currently starts with the comment `{/* ── Section A: KPI Strip (PRD: 6-8 cards) ─────────── */}` (around line 485) and runs through the closing `</div>` of the §A wrapper (around line 564). The block contains 8 `<KpiCard>` elements inside a `<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">`.

Replace the entire §A block (from the opening `<div>` after the section comment through its closing `</div>`) with:

```tsx
      {/* ── Section A: Snapshot KPIs (FB-034 — Tina's 4 new metrics) ─────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Snapshot KPIs</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* KPI 1 · Citation Share */}
          <KpiCard
            label="Citation Share"
            hint={`Owned share of total AI citations${models ? ' · filtered to selected AI models' : ''}`}
            value={
              calendarIsDemo ? '24.5%'
                : citationSharePct !== null ? `${citationSharePct.toFixed(1)}%`
                : 'None'
            }
            live={calendarIsDemo || citationSharePct !== null}
            delta={
              calendarIsDemo ? 2.3
                : citationSharePriorAvailable && citationSharePctDelta !== null ? citationSharePctDelta
                : undefined
            }
          />
          {/* KPI 2 · Prompt Coverage. No delta in v1 (no prior-period coverage data). */}
          <KpiCard
            label="Prompt Coverage"
            hint="Tracked prompts citing owned domains"
            value={
              calendarIsDemo ? '67%'
                : promptCoveragePct !== null ? `${promptCoveragePct}%`
                : 'None'
            }
            live={calendarIsDemo || promptCoveragePct !== null}
          />
          {/* KPI 3 · AI Referral Traffic */}
          <KpiCard
            label="AI Referral Traffic"
            hint={`GA4 sessions from AI sources${models ? ' · across all AI engines' : ''}`}
            value={
              calendarIsDemo ? '1,243'
                : aiReferralTraffic !== null ? aiReferralTraffic.toLocaleString()
                : 'None'
            }
            live={calendarIsDemo || aiReferralTraffic !== null}
            delta={
              calendarIsDemo ? 18.4
                : aiPriorAvailable && aiReferralTrafficDelta !== null ? aiReferralTrafficDelta
                : undefined
            }
          />
          {/* KPI 4 · Organic Traffic */}
          <KpiCard
            label="Organic Traffic"
            hint="GA4 Organic Search channel sessions"
            value={
              calendarIsDemo ? '6,667'
                : organicTraffic !== null ? organicTraffic.toLocaleString()
                : 'None'
            }
            live={calendarIsDemo || organicTraffic !== null}
            delta={
              calendarIsDemo ? -4.2
                : organicPriorAvailable && organicTrafficDelta !== null ? organicTrafficDelta
                : undefined
            }
          />
        </div>
      </div>
```

The header copy "Snapshot KPIs" matches Tina's section label from her recommended-layout doc (cataloged in the FB-032 deferred list).

- [ ] **Step 2: Remove the `void` suppression lines from Task 3**

In the Task 3 derivations block, find these three lines and delete them (the variables are now consumed in JSX):

```typescript
  void aiPriorAvailable
  void organicPriorAvailable
  void citationSharePriorAvailable
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 4: Run synopsis test (sanity)**

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected: both `passed.` lines (synopsis still uses FB-033 context shape — Task 5 updates that).

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-034 (Task 4): swap §A from 8 KPI cards to Tina's 4 new metrics

Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic.

Each card renders its current value plus a delta line vs the comparison
period when prior data is available. Citation Share delta is in
percentage points (pp). AI Referral Traffic and Organic Traffic deltas
are % change. Prompt Coverage shows no delta in v1 because
getDomainCoverage does not accept a dateRange (documented limitation;
future FB will add prior-period coverage support).

Section header copy is "Snapshot KPIs" — Tina's section label from the
v1 recommended-layout doc (previously deferred from FB-032).

Demo-mode hardcoded values: 24.5% / 67% / 1,243 / 6,667 with sample
deltas +2.3pp / -- / +18.4% / -4.2% so the delta line is visually
testable in demo mode.

This closes Tina's flagged ISSUE: "Right now, when you have a
comparison period turned on, it doesn't display change."
EOF
)"
```

## Self-review for Task 4

1. `git log --oneline -4` shows four FB-034 commits chronological.
2. `npx tsc --noEmit` zero output.
3. `grep -n "Citation Share\|Prompt Coverage\|AI Referral Traffic\|Organic Traffic" components/report-sections/peec-ai/content-impact.tsx` shows all 4 labels.
4. `grep -nc "<KpiCard" components/report-sections/peec-ai/content-impact.tsx` shows exactly 4 hits.
5. `grep -n "Snapshot KPIs" components/report-sections/peec-ai/content-impact.tsx` shows 1 hit (the new section header).

---

## Task 5: Refactor synopsis context + buildContext + tests + cache bump

**Files:**
- Modify: `lib/peec/content-impact-synopsis.ts` (context type + buildContext + cache version)
- Modify: `lib/peec/content-impact-synopsis.test.ts` (baseContext factory to match new shape)
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (synopsisContext build site needs to populate new fields and drop orphans)

**Interfaces:**
- Consumes: 4-KPI values from Task 3, `peecData.yourBrandCitations` + `peecData.totalCitations` (already in scope).
- Produces: refactored `ContentImpactSynopsisContext` matching the locked contract at the top of this plan. Cache version `v2-glean-ci-kpi-swap` flushes the FB-033 cache.

- [ ] **Step 1: Update the `ContentImpactSynopsisContext` type in `lib/peec/content-impact-synopsis.ts`**

Replace the existing `export type ContentImpactSynopsisContext = { ... }` block with:

```typescript
export type ContentImpactSynopsisContext = {
  // §A KPI values (FB-034, what the page renders).
  citationSharePct: number | null
  citationSharePctDelta: number | null
  promptCoveragePct: number | null
  aiReferralTraffic: number | null
  aiReferralTrafficDelta: number | null
  organicTraffic: number | null
  organicTrafficDelta: number | null

  // Supporting context (prose grounding + validator inputs).
  totalAiCitations: number                // validator Rule 2
  yourBrandCitations: number
  totalCitationsAllDomains: number
  ownedDomainsCited: number               // validator Rule 3

  // Top-items lists (unchanged from FB-033).
  topOwnedDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topCompetitorDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topBrandAbsentCompetitorUrls: Array<{ url: string; host: string; citationCount: number }>
  brandAbsentCompetitorUrlCount: number   // validator Rule 1
}
```

The validator (`validateContentImpactSynopsisGrounding`) and its Rules 1-3 are UNCHANGED. The fields each rule references (`brandAbsentCompetitorUrlCount`, `totalAiCitations`, `ownedDomainsCited`) all remain in the new shape.

- [ ] **Step 2: Update `buildContext()` in `lib/peec/content-impact-synopsis.ts`**

Replace the existing `function buildContext({ ... }): string { ... }` body so the Data section reflects the new shape. The new buildContext:

```typescript
function buildContext(args: { context: ContentImpactSynopsisContext; dateRange: string }): string {
  const { context: c, dateRange } = args

  // FB-025: every numeric value rendered here uses toLocaleString() for
  // thousands separators (counts) or fixed-decimal (rates). No raw floats.
  const citShare = c.citationSharePct != null ? `${c.citationSharePct.toFixed(1)}%` : 'not configured'
  const citShareDelta = c.citationSharePctDelta != null
    ? `${c.citationSharePctDelta >= 0 ? '+' : ''}${c.citationSharePctDelta.toFixed(1)}pp`
    : 'n/a'
  const promptCov = c.promptCoveragePct != null ? `${c.promptCoveragePct}%` : 'not configured'
  const aiRef = c.aiReferralTraffic != null ? c.aiReferralTraffic.toLocaleString() : 'not configured'
  const aiRefDelta = c.aiReferralTrafficDelta != null
    ? `${c.aiReferralTrafficDelta >= 0 ? '+' : ''}${c.aiReferralTrafficDelta.toFixed(1)}%`
    : 'n/a'
  const organic = c.organicTraffic != null ? c.organicTraffic.toLocaleString() : 'not configured'
  const organicDelta = c.organicTrafficDelta != null
    ? `${c.organicTrafficDelta >= 0 ? '+' : ''}${c.organicTrafficDelta.toFixed(1)}%`
    : 'n/a'
  const cites = c.totalAiCitations.toLocaleString()
  const yourBrand = c.yourBrandCitations.toLocaleString()
  const totalCites = c.totalCitationsAllDomains.toLocaleString()
  const ownedDom = c.ownedDomainsCited.toLocaleString()

  // FB-025: round per-row counts to 1 decimal before interpolation.
  const ownedBlock = c.topOwnedDomainsByCitations.length > 0
    ? `Top owned domains by AI citations (highest first):
${c.topOwnedDomainsByCitations.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top owned domains by AI citations: none reported in period.'

  const compBlock = c.topCompetitorDomainsByCitations.length > 0
    ? `Top competitor domains by AI citations (highest first):
${c.topCompetitorDomainsByCitations.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top competitor domains by AI citations: none reported in period.'

  const brandAbsentBlock = c.topBrandAbsentCompetitorUrls.length > 0
    ? `Top competitor or third-party URLs where the brand is absent (highest AI citation count):
${c.topBrandAbsentCompetitorUrls.map((u, i) => `${i + 1}. ${u.url} (${u.host}) - ${u.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top competitor or third-party URLs where the brand is absent: none reported in period.'

  return `
Period: ${dateRange}
Data sources: Peec AI (citations, owned/competitor domains, brand-absent URL set), GA4 (sessions by source and channel grouping for AI Referral Traffic and Organic Traffic)

Snapshot KPIs for the period (USE THESE EXACT VALUES):
- Citation Share (owned share of total AI citations): ${citShare} (vs prior period: ${citShareDelta})
- Prompt Coverage (tracked prompts citing owned domains): ${promptCov}
- AI Referral Traffic (GA4 sessions from AI sources): ${aiRef} (vs prior period: ${aiRefDelta})
- Organic Traffic (GA4 Organic Search channel sessions): ${organic} (vs prior period: ${organicDelta})

Owned-content AI footprint (USE THESE EXACT VALUES):
- Total AI Citations across owned domains: ${cites}
- Your-brand citation numerator: ${yourBrand}
- All-domains citation denominator: ${totalCites}
- Distinct owned domains cited in AI: ${ownedDom}

Competitor and third-party AI footprint (USE THESE EXACT VALUES):
- Distinct competitor or third-party URLs where the brand is absent: ${c.brandAbsentCompetitorUrlCount}

${ownedBlock}

${compBlock}

${brandAbsentBlock}
`.trim()
}
```

The four `(USE THESE EXACT VALUES)` section labels are preserved (FB-031 hardening pattern). All numbers route through `.toLocaleString()` or `.toFixed(1)` (FB-025).

- [ ] **Step 3: Bump cache version in `lib/peec/content-impact-synopsis.ts`**

Find the `cached(...)` call at the bottom of the file. Change:

```typescript
    version: 'v1-glean-ci',
```

to:

```typescript
    version: 'v2-glean-ci-kpi-swap',  // FB-034: context schema changed (4 new KPIs, 5 orphans dropped); flush v1.
```

And update the comment above the `export const getContentImpactSynopsis = cached(...)` accordingly:

```typescript
// Cache key derives from positional args: clientSlug + dateRange + context.
// Next.js unstable_cache serializes args into the key, so a different context
// (e.g. citationSharePct changes) produces a different cache key and forces
// a fresh fetch. Cache version 'v2-glean-ci-kpi-swap' is the FB-034 schema
// (4 new KPIs replace 8 old ones); FB-033's v1 cache is evicted on deploy.
```

- [ ] **Step 4: Update `baseContext()` factory in `lib/peec/content-impact-synopsis.test.ts`**

Replace the existing `function baseContext(...)` body so it returns the new shape. Existing assertions touch `brandAbsentCompetitorUrlCount`, `totalAiCitations`, `ownedDomainsCited` — all stay. The other fields just need different starter values.

```typescript
function baseContext(over: Partial<ContentImpactSynopsisContext> = {}): ContentImpactSynopsisContext {
  return {
    citationSharePct: 24.5,
    citationSharePctDelta: 2.3,
    promptCoveragePct: 67,
    aiReferralTraffic: 1243,
    aiReferralTrafficDelta: 18.4,
    organicTraffic: 6667,
    organicTrafficDelta: -4.2,
    totalAiCitations: 1407,
    yourBrandCitations: 345,
    totalCitationsAllDomains: 1407,
    ownedDomainsCited: 4,
    topOwnedDomainsByCitations: [
      { domain: 'example.com', citationCount: 412 },
    ],
    topCompetitorDomainsByCitations: [
      { domain: 'competitor.com', citationCount: 240 },
    ],
    topBrandAbsentCompetitorUrls: [
      { url: 'https://outlet.com/post', host: 'outlet.com', citationCount: 18 },
    ],
    brandAbsentCompetitorUrlCount: 5,
    ...over,
  }
}
```

The 10 existing assertions (FB-033 regression + 9 validator tests for Rules 1, 2, 3) require no other changes — they reference `brandAbsentCompetitorUrlCount`, `totalAiCitations`, `ownedDomainsCited` in their `baseContext({ ... })` overrides, and all three fields still exist.

- [ ] **Step 5: Update the `synopsisContext` build site in `content-impact.tsx`**

In `content-impact.tsx`, find the existing FB-033 `synopsisContext` block (the section labeled `// ── FB-033 · Build context for the Executive Synopsis card ──`). Replace the `const synopsisContext: ContentImpactSynopsisContext = { ... }` literal so it populates the new fields. The block becomes:

```typescript
  const synopsisContext: ContentImpactSynopsisContext = {
    // FB-034 §A KPI values — same expressions the KPI cards render.
    citationSharePct,
    citationSharePctDelta,
    promptCoveragePct,
    aiReferralTraffic,
    aiReferralTrafficDelta,
    organicTraffic,
    organicTrafficDelta,
    // Supporting context — prose grounding + validator inputs.
    totalAiCitations: totalCitations,
    yourBrandCitations,
    totalCitationsAllDomains,
    ownedDomainsCited: filteredOwnDomains.length,
    // Top-items lists (unchanged from FB-033).
    topOwnedDomainsByCitations: topOwnedForSynopsis,
    topCompetitorDomainsByCitations: topCompetitorForSynopsis,
    topBrandAbsentCompetitorUrls: topBrandAbsentForSynopsis,
    brandAbsentCompetitorUrlCount: brandAbsentUrlsForSynopsis.length,
  }
```

Drop the 5 old-KPI lines (`plannedUrlsInScope`, `liveUrls`, `totalSessions`, `aiReferredSessions`, `ownedUrlsWithAiActivity`, `unmatchedPct`) — they're no longer on the context type, so tsc will fail if any remain.

The supporting variables (`topOwnedForSynopsis`, `topCompetitorForSynopsis`, `topBrandAbsentForSynopsis`, `brandAbsentUrlsForSynopsis`, `filteredOwnDomains`, `totalCitations`) were defined in FB-033 (Task 5) and remain unchanged.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: zero output.

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected: both `passed.` lines (Task 1 regression + Task 2 validator assertions — all unchanged in this task, just the fixture got updated).

If tsc complains about a missing `yourBrandCitations` or `totalCitations` field on `peecData`, open `lib/peec/client.ts` and verify the actual field names (research report cited them at line 487-488). If they're spelled differently, adjust the property access in the orchestrator's synopsisContext block accordingly (do NOT change the synopsis type).

- [ ] **Step 7: Commit**

```bash
git add lib/peec/content-impact-synopsis.ts lib/peec/content-impact-synopsis.test.ts components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-034 (Task 5): refactor synopsis context to mirror new §A KPIs + cache bump

Drops 5 orphaned context fields (plannedUrlsInScope, liveUrls,
totalSessions, aiReferredSessions, ownedUrlsWithAiActivity, unmatchedPct)
whose §A KPI cards were removed in Task 4. Renames aiReferredSessions
to aiReferralTraffic to match the new card label.

Adds 4 new KPI fields (citationSharePct + delta, promptCoveragePct,
aiReferralTraffic + delta, organicTraffic + delta) so the synopsis prose
can reference the same numbers the cards render. Validator rules 1-3
unchanged — fields they reference (brandAbsentCompetitorUrlCount,
totalAiCitations, ownedDomainsCited) all remain.

buildContext() data section reorganized into "Snapshot KPIs for the period"
+ "Owned-content AI footprint" + "Competitor and third-party AI footprint"
with 4 USE THESE EXACT VALUES section labels.

Cache version v1-glean-ci -> v2-glean-ci-kpi-swap so FB-033's cached
responses (built against the old context schema) are evicted on deploy.

Test baseContext fixture updated to match new shape; all 10 validator
assertions still pass (regression + 9 Rule 1/2/3 tests).
EOF
)"
```

## Self-review for Task 5

1. `git log --oneline -5` shows five FB-034 commits chronological.
2. `npx tsc --noEmit` zero output.
3. `npx tsx lib/peec/content-impact-synopsis.test.ts` shows both `passed.` lines.
4. `grep -n "v2-glean-ci-kpi-swap" lib/peec/content-impact-synopsis.ts` shows at least 1 hit (the cache version).
5. `grep -n "USE THESE EXACT VALUES" lib/peec/content-impact-synopsis.ts` shows at least 3 hits (the section labels in the new data section).
6. `grep -c "plannedUrlsInScope\|liveUrls\|totalSessions\|ownedUrlsWithAiActivity\|unmatchedPct\|aiReferredSessions" lib/peec/content-impact-synopsis.ts` shows 0 (all dropped from the file).

---

## Task 6: Verify + docs + push + open / extend PR

**Files:**
- Modify: `docs/official-feedback/feedback-log.md` (new FB-034 entry)
- Modify: `docs/official-feedback/changelog.md` (new FB-034 row)
- Modify: `docs/official-feedback/status.md` (bump next FB ID to FB-035, append shipped, drop the deferred-ISSUE bullet)

- [ ] **Step 1: Capture commit SHAs**

Run: `git log --oneline main..HEAD`
Expected: 5 FB-034 commits (Tasks 1-5) plus the existing FB-033 commits and the handoff commit.

Note Task SHAs: T1_SHA, T2_SHA, T3_SHA, T4_SHA, T5_SHA.

- [ ] **Step 2: Final verification sweep**

| Command | Expected |
|---|---|
| `npx tsc --noEmit` | zero output |
| `npx tsx lib/peec/content-impact-synopsis.test.ts` | both `passed.` lines |
| `grep -nc "<KpiCard" components/report-sections/peec-ai/content-impact.tsx` | exactly 4 |
| `grep -n "Citation Share\\|Prompt Coverage\\|AI Referral Traffic\\|Organic Traffic" components/report-sections/peec-ai/content-impact.tsx` | one hit each |
| `grep -n "compareRange" components/report-sections/peec-ai/content-impact.tsx` | at least 4 hits |
| `grep -n "v2-glean-ci-kpi-swap" lib/peec/content-impact-synopsis.ts` | exactly 1 hit on the version line |
| `grep -c "—" components/report-sections/peec-ai/content-impact.tsx` | unchanged (only the existing demo badge string) |
| `grep -c "—" lib/peec/content-impact-synopsis.ts` | 0 |

- [ ] **Step 3: Append FB-034 entry to `docs/official-feedback/feedback-log.md`**

Insert as the new TOP entry under `## Closed` (above the existing FB-033 entry):

```markdown
### FB-034 — Content Impact §A Snapshot KPIs: replace 8 cards with Tina's 4 + fix delta display

- **Status:** done
- **Source:** Tina's screenshot annotation on Content Impact §A (2026-06-24). FEEDBACK: "Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic." Plus ISSUE: "Right now, when you have a comparison period turned on, it doesn't display change."
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** UI replacement (8 cards → 4) + bug fix (delta wiring)
- **Scope:** `components/report-sections/peec-ai/content-impact.tsx` (orchestrator + local KpiCard), `lib/peec/content-impact-synopsis.ts` (context schema + buildContext + cache bump), `lib/peec/content-impact-synopsis.test.ts` (fixture update)
- **Branch:** `official-feedback-content-impact-tab-content-v1`
- **Sheet rows:**
  - `Content Impact | Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic. | Done. §A Snapshot KPIs strip now shows exactly 4 cards: Citation Share (% of total AI citations captured by owned domains), Prompt Coverage (% of tracked prompts citing any owned domain), AI Referral Traffic (GA4 sessions from AI sources), Organic Traffic (GA4 Organic Search channel sessions). Old 8-card grid removed.`
  - `Content Impact | ISSUE: Right now, when you have a comparison period turned on, it doesn't display change. | Fixed. Root cause: page router was passing compareRange prop to ContentImpactReport but the component was ignoring it. Component now accepts compareRange, derives prior period via deriveCompareRange (defaults to previous_period when no explicit range passed), fetches prior-period GA4 sessions, and renders delta line on each KPI card (arrow + magnitude + "vs previous period"). Prompt Coverage shows no delta in v1 because getDomainCoverage does not accept a dateRange (limitation noted; future FB will add prior-period coverage fetch).`

#### Problem

Tina's screenshot on the Content Impact tab marks §A "Snapshot KPIs" with a swap-out for the 8 existing cards (Planned URLs, Live URLs, Total Sessions, AI Citations, AI-Referred Sessions, Owned URLs with AI Activity, % Null/Unmatched, Owned Domains Cited) plus a yellow-highlighted ISSUE: when a comparison period is selected from the date picker, the KPI cards do not display the change between periods.

Root cause investigation: the page router (`app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`) already passes a `compareRange` prop to `ContentImpactReport`, but the component signature did not accept it. The value was silently dropped. No prior-period data was being fetched, so there were no delta values to render even if the cards supported it (which they did not — the local `KpiCard` had no delta slot).

#### Solution — 5 commits

| Sub-item | Commit | What |
|---|---|---|
| **FB-034 (Task 1)** | `T1_SHA` | Extend local `KpiCard` with `delta?: number` + `invertDelta?: boolean` props, rendering arrow `↑` green `#60FF80` (positive when not inverted) or `↓` red `#FF4444`, magnitude with 1 decimal, " vs previous period" copy. Mirrors Overview's KpiCard delta rendering exactly. When `delta` is undefined the line is omitted (no fake zero). |
| **FB-034 (Task 2)** | `T2_SHA` | Accept `compareRange?: string` on `ContentImpactReport`. Derive `mainIso` and `compareIso` via `parseDateRange` + `deriveCompareRange` (defaults to `'previous_period'`). Add 2 GA4 queries to the existing `Promise.allSettled`: `sessionSource × sessionDefaultChannelGroup × sessions`, one for main and one for prior. Single query shape feeds AI Referral Traffic and Organic Traffic for both periods (4 KPI values from 2 fetches). No JSX changes in this commit. |
| **FB-034 (Task 3)** | `T3_SHA` | Compute 4 new KPI values + deltas. Citation Share = `yourBrandCitations / totalCitations * 100`, prior from `peecData.yourBrandCitationsPrior` + `peecData.totalCitationsPrior`, delta in percentage points. Prompt Coverage = aggregate `(unique-prompt-IDs-across-owned-domains / totalTrackedPrompts) * 100` (no prior in v1). AI Referral Traffic = sum where `isAiSource(sessionSource)` from the new query, prior from prior query, delta = `((cur - prior) / prior) * 100`. Organic Traffic = sum where `sessionDefaultChannelGroup === 'Organic Search'`, same delta math. Truth-grounded: prior unavailable → delta stays null → card omits delta line. |
| **FB-034 (Task 4)** | `T4_SHA` | Swap §A JSX: 8-card grid replaced by 4-card grid (Citation Share / Prompt Coverage / AI Referral Traffic / Organic Traffic). Section header copy is "Snapshot KPIs" — Tina's section label from her v1 recommended-layout doc (previously deferred from FB-032). Demo-mode hardcoded values: 24.5% / 67% / 1,243 / 6,667 with sample deltas +2.3pp / -- / +18.4% / -4.2% so the delta line is visually testable in demo mode. |
| **FB-034 (Task 5)** | `T5_SHA` | Refactor `ContentImpactSynopsisContext`: drop 5 orphaned old-KPI fields (`plannedUrlsInScope`, `liveUrls`, `totalSessions`, `aiReferredSessions`, `ownedUrlsWithAiActivity`, `unmatchedPct`), rename `aiReferredSessions → aiReferralTraffic`, keep `totalAiCitations` + `ownedDomainsCited` (validator Rules 2-3 still reference them), add new KPI fields. Update `buildContext()` Data section to reorganize into "Snapshot KPIs for the period" + "Owned-content AI footprint" + "Competitor and third-party AI footprint" with 4 `(USE THESE EXACT VALUES)` section labels. Cache version `v1-glean-ci → v2-glean-ci-kpi-swap` flushes FB-033's stale cached responses. Validator rules 1-3 unchanged. Test fixture `baseContext()` updated to new shape; all 10 assertions still pass. |

#### Verification

- `npx tsc --noEmit` — zero output, after every commit.
- `npx tsx lib/peec/content-impact-synopsis.test.ts` — both `passed.` lines (regression + 9 validator assertions).
- `grep -nc "<KpiCard" content-impact.tsx` — exactly 4.
- `grep -n "v2-glean-ci-kpi-swap" content-impact-synopsis.ts` — 1 hit on version line.
- Vercel preview: §A renders exactly 4 cards in both demo and live modes; selecting a comparison period from the date picker causes the delta line to appear under Citation Share + AI Referral Traffic + Organic Traffic (Prompt Coverage stays delta-less by design).

#### Known limitations

- **Prompt Coverage delta deferred:** `getDomainCoverage(clientSlug)` in `lib/peec/url-citations.ts:286` does not accept a `dateRange` parameter, so there is no prior-period coverage data to subtract from. Card renders the current value alone with no delta line. Future FB can add prior-period coverage support (would require adding a `dateRange?: string` arg to `getDomainCoverage` + downstream Peec query).
- **Comparison period defaults to "previous_period" when not explicitly selected** — same default Overview uses. If the user does not pick a comparison range from the date picker, the page still computes deltas vs. the immediately-prior matching window. This matches user expectation.

#### Deferred for future FBs

- Tina ADD: Scatter chart "AI Bot Traffic vs. Human Traffic" (next FB in this round).
- Tina ADD: Slope chart "Which pages are gaining momentum and which are losing it?" (next FB in this round).
- Tina section labels for §B (Watched Pages), §C (Speed Stats), §F (Fullsite Content Performance), §H (Competitor Analysis) — Thomas to confirm next round whether on-page headers or doc labels.
- Prompt Coverage delta wiring (requires getDomainCoverage refactor).
```

Replace the 5 `TN_SHA` placeholders with actual short SHAs from Step 1 before saving.

- [ ] **Step 4: Append FB-034 row to `docs/official-feedback/changelog.md`**

Insert as the new top entry (above the existing `FB-033 | ...` row):

```
FB-034 | 2026-06-24 | T1_SHA + T2_SHA + T3_SHA + T4_SHA + T5_SHA | a | Content Impact §A Snapshot KPIs replaced with Tina's 4 new metrics + comparison-period delta display wired. Closes Tina v1 FEEDBACK + flagged ISSUE on §A. 5 commits. Task 1 (T1_SHA) extends local KpiCard with delta?+invertDelta? props rendering arrow + magnitude + "vs previous period" matching Overview KpiCard exactly; when delta is undefined the line is omitted (no fake zero). Task 2 (T2_SHA) accepts compareRange?: string on ContentImpactReport (page router was already passing this; component was ignoring), derives mainIso + compareIso via parseDateRange + deriveCompareRange('previous_period' default), adds 2 GA4 queries to the existing Promise.allSettled with shape sessionSource × sessionDefaultChannelGroup × sessions for main + prior periods (single query shape feeds AI Referral Traffic and Organic Traffic for both periods, 4 KPI values from 2 fetches). Task 3 (T3_SHA) computes 4 new KPI values + deltas: Citation Share = yourBrandCitations/totalCitations*100 with prior from peecData.yourBrandCitationsPrior + .totalCitationsPrior (delta in pp); Prompt Coverage = aggregate union-of-prompt-IDs-across-owned-domains/totalTrackedPrompts*100 (no prior in v1 — getDomainCoverage has no dateRange arg, documented limitation); AI Referral Traffic = sum where isAiSource(sessionSource) with delta = ((cur-prior)/prior)*100; Organic Traffic = sum where sessionDefaultChannelGroup === 'Organic Search' with same delta math. Truth-grounded: prior unavailable → delta stays null → card omits delta line. Task 4 (T4_SHA) swaps §A JSX from 8 cards to 4 cards (Citation Share / Prompt Coverage / AI Referral Traffic / Organic Traffic) under "Snapshot KPIs" section header (Tina's section label from FB-032 deferred); demo-mode hardcodes 24.5%/67%/1,243/6,667 with deltas +2.3pp/--/+18.4%/-4.2%. Task 5 (T5_SHA) refactors ContentImpactSynopsisContext: drops 5 orphaned old-KPI fields (plannedUrlsInScope, liveUrls, totalSessions, aiReferredSessions, ownedUrlsWithAiActivity, unmatchedPct), keeps totalAiCitations + ownedDomainsCited (validator Rules 2-3 still reference), adds new KPI fields. buildContext() Data section reorganized with 4 USE THESE EXACT VALUES section labels. Cache version v1-glean-ci → v2-glean-ci-kpi-swap flushes FB-033 cache. Validator rules 1-3 unchanged. Test fixture updated to new shape; all 10 assertions pass.
```

Replace `TN_SHA` placeholders before saving.

- [ ] **Step 5: Update `docs/official-feedback/status.md`**

Three edits:

1. **Bump next FB ID:** Change all occurrences of `FB-034` → `FB-035` in the Active branch + Per-tab workflow + Shipped FB log sections.
2. **Append FB-034 to shipped FB log** (above the FB-033 row):
   ```
   | **FB-034** | Content Impact (content v1) | `official-feedback-content-impact-tab-content-v1` | `T1_SHA` + `T2_SHA` + `T3_SHA` + `T4_SHA` + `T5_SHA` | Content Impact §A Snapshot KPIs replaced (8 → 4 cards: Citation Share / Prompt Coverage / AI Referral Traffic / Organic Traffic) + comparison-period delta display wired. Closes Tina's v1 FEEDBACK + flagged ISSUE in one round. Local KpiCard extended with delta + invertDelta props mirroring Overview's exact rendering. compareRange prop on ContentImpactReport (was being passed by router + ignored — root cause). Two new GA4 queries (sessionSource × sessionDefaultChannelGroup) for main + prior. Truth-grounded: card omits delta line when prior is unavailable. Prompt Coverage shows no delta in v1 because getDomainCoverage has no dateRange arg (documented limitation). Synopsis context refactored (5 orphans dropped, 4 new KPI fields added, cache version bumped v1-glean-ci → v2-glean-ci-kpi-swap). Validator rules 1-3 unchanged. All 10 test assertions pass. |
   ```
3. **Remove the now-fixed deferred-ISSUE bullet** from the "Next round (Content Impact v2)" section: delete the line "Tina ISSUE: Snapshot KPIs comparison-period delta wiring (a separate FB...)" — it's fixed.
4. **Update the in-flight description** in the Active branch section to add FB-034 alongside FB-033 (since both ship on the same branch).

Replace `TN_SHA` placeholders.

- [ ] **Step 6: Commit docs**

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md docs/superpowers/plans/2026-06-24-content-impact-snapshot-kpis-swap.md
git commit -m "$(cat <<'EOF'
FB-034 docs: feedback-log + changelog + status.md + plan archive

Two sheet rows captured (KPI swap + ISSUE fix). Next FB ID bumped to
FB-035. Deferred-ISSUE bullet removed from Content Impact v2 section
(it's now fixed). Plan archived.
EOF
)"
```

- [ ] **Step 7: Push**

```bash
git push origin official-feedback-content-impact-tab-content-v1
```

Branch is already tracking origin (set up in FB-033 Task 7). The push extends [PR #77](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/77) since it's still open on the same branch — FB-034 lands on the same PR.

- [ ] **Step 8: Update PR title + add a follow-up PR comment**

Update the PR title to reflect both FBs:

```bash
gh pr edit 77 --title "Content Impact content v1: AI Executive Synopsis (FB-033) + §A KPI swap & delta fix (FB-034)"
```

Add a comment summarizing FB-034:

```bash
gh pr comment 77 --body "$(cat <<'EOF'
## FB-034 — §A Snapshot KPIs swap + delta display fix

Per Tina's screenshot annotation (2026-06-24):

- **FEEDBACK:** "Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic." ✅ Done.
- **ISSUE:** "Right now, when you have a comparison period turned on, it doesn't display change." ✅ Fixed.

### What changed
- §A renders exactly 4 cards under "Snapshot KPIs" header.
- Each card shows a delta line ("↑ X.X% vs previous period") when prior-period data is available.
- Prompt Coverage shows no delta in v1 (getDomainCoverage has no dateRange arg — documented limitation).
- Synopsis context schema updated to match new KPIs (cache version v1-glean-ci → v2-glean-ci-kpi-swap to flush FB-033's old responses).

### Test plan additions (on top of FB-033's)
- [ ] Vercel preview: §A renders exactly 4 cards.
- [ ] Vercel preview: select a comparison period from the date picker; delta lines appear under Citation Share, AI Referral Traffic, and Organic Traffic.
- [ ] Vercel preview: Prompt Coverage card renders value with no delta line (by design).
- [ ] Vercel preview: card omits delta line when prior data is unavailable (no compareRange + can't derive previous_period).
- [ ] Vercel preview: synopsis prose references Citation Share / AI Referral Traffic / Organic Traffic values that match the cards verbatim.
EOF
)"
```

- [ ] **Step 9: Report back to Thomas**

Surface: 5 implementation commits + 1 docs commit pushed to PR #77, PR title updated, comment added. Confirm next FB ID is FB-035. List the 3 deferred items (scatter chart, slope chart, Prompt Coverage delta) so Thomas knows what's queued.

---

## Self-Review

**1. Spec coverage:**
- Tina ASK "Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic" → Tasks 3 + 4 (compute + render).
- Tina ISSUE "comparison period doesn't display change" → Tasks 1 (KpiCard delta slot) + 2 (compareRange plumbing + prior fetch) + 3 (delta computation) + 4 (delta wired into JSX).
- Synopsis stays consistent with new KPIs → Task 5.
- Tina's deferred section label "Snapshot KPIs" → Task 4 uses it as the §A header copy.
- Docs + sheet rows for both sub-items → Task 6.

No gaps.

**2. Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N" in any task body. The `TN_SHA` placeholders in the feedback-log + changelog + status.md templates are explicitly flagged to be replaced in Task 6 Step 3-5.

**3. Type consistency:**
- `ContentImpactSynopsisContext` shape locked at top of plan, identical across Tasks 5 (definition + buildContext + cache bump) + orchestrator's synopsisContext build (Task 5 Step 5) + test fixture (Task 5 Step 4).
- KPI variable names `citationSharePct`, `citationSharePctDelta`, `promptCoveragePct`, `aiReferralTraffic`, `aiReferralTrafficDelta`, `organicTraffic`, `organicTrafficDelta` identical across Tasks 3 (definition) + 4 (JSX usage) + 5 (synopsisContext usage).
- Cache version `v2-glean-ci-kpi-swap` used in Task 5 implementation, grepped in Task 5 self-review + Task 6 verification.
- Query names `ga4TrafficMainResult` / `ga4TrafficPriorResult` identical Task 2 → Task 3.
- KpiCard `delta` / `invertDelta` prop names identical Task 1 → Task 4.

**4. Risk areas flagged inline:**
- Task 3 Step 2 notes the `peecData` field names risk: `yourBrandCitations` / `yourBrandCitationsPrior` / `totalCitationsPrior` per research, but if tsc errors on access, point to Overview's canonical usage at `index.tsx:188-197`.
- Task 5 Step 6 notes the same risk for the orchestrator's synopsisContext build site.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-content-impact-snapshot-kpis-swap.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
