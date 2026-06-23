# Overview v2 Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve every ⚠️ row in Tina's Overview-tab v1 scorecard CSV by shipping FB-020 through FB-023 on branch `official-feedback-overview-v2`. Goal is one-shot acceptance — no v3 round needed.

**Architecture:** Surgical edits to `components/report-sections/peec-ai/index.tsx`, `section-header.tsx`, `visibility-chart.tsx`, `winners-losers-cards.tsx`, plus a corresponding data-layer change in `lib/peec/client.ts`. Profound parity for chart removal + YTD chart; live Winners/Losers is Peec-only for this round (Profound parity is a deferred follow-up). Two component files deleted (peec + profound tracked-prompts charts). Sandbox gate on Winners/Losers lifts.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, React Server Components, Recharts-adjacent custom SVG, Peec AI + Profound AI APIs, Drizzle/Neon for client config, NextAuth v5, GA4 page-level data, `cached()` wrapper at `lib/cache.ts`.

---

## Source feedback — Tina's Overview-tab v1 CSV (column E)

Path: `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - Overview Tab (1).csv`

| Cell | Row B (Tina's original ask) | Cell D | Cell E (verdict + v2 feedback) | Owns FB |
|---|---|---|---|---|
| E2 | Consistent header across all 4 AEO tabs | ⚠️ | **"REMOVE: Subtitle 'Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors.'"** | **FB-020** |
| E7 | Move trend chart below the KPI grid | ⚠️ | **"ISSUE: 'Tracking began May 18' – this is incorrect, this workspace has been tracking data since March 28, 2025. I think that this YTD chart is changing based on the date range selector. Please make static to always show YTD."** | **FB-022** |
| E11 | Add static Biggest Winners + Biggest Losers cards | ⚠️ | **"ISSUE: This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected and is an exact copy of the example text I provided."** | **FB-023** |
| E12 (free-standing) | (no ask in B12-D12 — column-E-only entry) | n/a | **"REMOVE Chart: 'Which prompts are AI engines answering with our brand?' at the very bottom. This wasn't explicitly stated to remove in the initial doc, but it was not included in the recommended layout."** | **FB-021** |

All rows in the CSV without column-E content are Tina-accepted (✅) — no action needed for those.

---

## Working assumptions (override before execution if needed)

The plan executes under these two decisions unless Thomas overrides them:

### Working assumption 1 — FB-022 "Tracking began" line: DROP ENTIRELY

After the chart is provably YTD, the leftmost X-axis bucket label naturally communicates the start of data. The "Tracking began" line becomes redundant. No DB schema change, no per-client maintenance, no risk of stale dates.

**Override path** (if Thomas chooses 1B = hardcode per-client first-tracked date in DB): see "Plan B" appendix at the bottom — adds `firstTrackedAt` column to `clients` table + per-client data entry + display in chart header. Two additional tasks.

### Working assumption 2 — FB-023 Sandbox gate on Winners/Losers: LIFT

Tina's complaint is that the cards are static. Wiring to live data resolves it. The whole point is universal per-client reactivity. Other clients get the feature once we ship.

**Override path** (if Thomas chooses 2B = keep Avenue-Z-only while validating): leave the `SANDBOX_CLIENT_SLUG = 'avenue-z'` gate in place after live wiring. One-line change to remove later.

**Graceful empty state shipped either way:** if a client has < 5 prompts with a comparable prior-period rank, the cards render *"Not enough prompt-rank history yet for this period — try a wider date range."*

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `components/report-sections/peec-ai/section-header.tsx` | **Modify** | Make `subtitle` optional. Conditionally render the `<p>`. |
| `components/report-sections/peec-ai/index.tsx` | **Modify** | Remove subtitle prop on Overview header. Remove TrackedPromptsChart JSX + 2 imports. Pass `winners` + `losers` to `<WinnersLosersCards>`. Compute winners/losers from `data.trackedPrompts`. |
| `components/report-sections/peec-ai/tracked-prompts-chart.tsx` | **Delete** | The chart Tina is removing. |
| `components/report-sections/profound-ai/tracked-prompts-chart.tsx` | **Delete** | Profound parity for the chart removal. |
| `components/report-sections/profound-ai/index.tsx` | **Modify** | Remove TrackedPromptsChart import + JSX render block. |
| `components/report-sections/peec-ai/visibility-chart.tsx` | **Modify** | Drop `trackingStart` calc + the `<p>Tracking began ...</p>` line. Update tooltip text to be accurate. |
| `lib/peec/client.ts` | **Modify** | Add YTD trend fetch + route `dailyVisibility`/`competitorDailyVisibility` to YTD source. Add prior-period prompt-level fetch + `priorPosition` field on `TrackedPrompt`. Bump cache version. |
| `lib/profound/client.ts` | **Modify** | Add YTD trend fetch + route `dailyVisibility`/`competitorDailyVisibility` to YTD source. Bump cache version. |
| `components/report-sections/peec-ai/winners-losers-cards.tsx` | **Modify** | Remove static const arrays. Accept `winners` + `losers` props. Lift sandbox gate. Add empty state. |
| `lib/peec/winners-losers.ts` | **Create** | Pure function: compute winners + losers from `trackedPrompts` with priorPosition. Unit-tested. |
| `lib/peec/winners-losers.test.ts` | **Create** | Unit tests for the compute. |
| `docs/official-feedback/feedback-log.md` | **Modify** | Append FB-020/021/022/023 decision logs. |
| `docs/official-feedback/changelog.md` | **Modify** | Append one-line entries for FB-020–023. |
| `docs/official-feedback/status.md` | **Modify** | Update active branch state, next FB ID. |
| `docs/official-feedback/tina-scorecard.csv` | **Modify** | Fill column F (`V2 — What shipped`) for the 4 ⚠️ rows. |

---

## Pre-flight (do this first — once, not per task)

- [ ] **Step 0.1: Verify current state**

Run:
```
git status && git branch --show-current && git log -1 --oneline
```
Expected:
```
nothing to commit, working tree clean
official-feedback-overview-v2
8af66f7 docs(feedback): set up Content Impact tracking, reclaim FB-020 IDs
```

If anything differs, stop and reconcile before proceeding.

- [ ] **Step 0.2: Confirm Thomas's two decisions**

Working assumptions: **1A** (drop "Tracking began" line) + **2A** (lift Winners/Losers sandbox gate). If Thomas says otherwise, swap to the Plan B variant at the bottom of this doc.

- [ ] **Step 0.3: Verify TypeScript baseline is clean**

Run:
```
npx tsc --noEmit
```
Expected: zero output (clean baseline). If there are pre-existing errors, halt and surface them — we don't want to confuse pre-existing noise with our changes.

---

## Task 1 — FB-020: Remove Overview SectionHeader subtitle (item-a, E2)

**Files:**
- Modify: `components/report-sections/peec-ai/section-header.tsx:9-30`
- Modify: `components/report-sections/peec-ai/index.tsx:200-205`

- [ ] **Step 1.1: Read the SectionHeader component to confirm prop shape**

Run:
```
sed -n '1,32p' components/report-sections/peec-ai/section-header.tsx
```
Expected: see `subtitle: string` (required) at line 12, `<p>{subtitle}</p>` at line 27.

- [ ] **Step 1.2: Make `subtitle` optional in SectionHeader**

Edit `components/report-sections/peec-ai/section-header.tsx`:

Replace:
```tsx
type Props = {
  icon: LucideIcon
  title: string
  subtitle: string
  badge?: ReactNode
}

export function SectionHeader({ icon: Icon, title, subtitle, badge }: Props) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#60FF80]/10">
        <Icon className="h-5 w-5 text-[#60FF80]" />
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {badge}
        </div>
        <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>
      </div>
    </div>
  )
}
```

With:
```tsx
type Props = {
  icon: LucideIcon
  title: string
  subtitle?: string
  badge?: ReactNode
}

export function SectionHeader({ icon: Icon, title, subtitle, badge }: Props) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#60FF80]/10">
        <Icon className="h-5 w-5 text-[#60FF80]" />
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 1.3: Drop the subtitle prop from the Overview SectionHeader call**

Edit `components/report-sections/peec-ai/index.tsx`:

Find (around line 200-205):
```tsx
      <SectionHeader
        icon={Sparkles}
        title="How visible is the brand across AI answer engines?"
        subtitle="Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors."
        badge={isDemo ? <SampleDataBadge /> : undefined}
      />
```

Replace with:
```tsx
      <SectionHeader
        icon={Sparkles}
        title="How visible is the brand across AI answer engines?"
        badge={isDemo ? <SampleDataBadge /> : undefined}
      />
```

- [ ] **Step 1.4: Verify other 3 tabs still compile (they pass their own subtitles, which now become optional-but-supplied)**

Run:
```
grep -n "subtitle=" components/report-sections/peec-ai/pr-influence.tsx components/report-sections/peec-ai/content-impact.tsx components/report-sections/peec-ai/technical-audit.tsx
```
Expected: each file shows exactly one `subtitle=` line. None should be empty.

- [ ] **Step 1.5: TypeScript check**

Run:
```
npx tsc --noEmit
```
Expected: zero output.

- [ ] **Step 1.6: Update the v1 scorecard CSV — fill F2 (V2 — What shipped)**

Edit `docs/official-feedback/tina-scorecard.csv` row 2 to add the v2 ship description in column F. The row currently ends with the v1 feedback in column E. Append:

```
,"Subtitle removed. SectionHeader now allows optional subtitle; only Overview tab omits it. Other 3 tabs keep their own subtitles.",,
```

After this step row 2's complete cells should be: A=Overview, B=Consistent header..., C=Green icon..., D=⚠️, E=REMOVE..., F=Subtitle removed..., G=(blank), H=(blank).

- [ ] **Step 1.7: Append FB-020 to feedback-log.md**

Edit `docs/official-feedback/feedback-log.md`. Append at the bottom (newest goes last in this file):

```markdown

---

## FB-020 — Remove Overview SectionHeader subtitle

**Source:** Tina's Overview-tab v1 scorecard CSV, cell E2.
**Verbatim ask:** *"REMOVE: Subtitle 'Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors.'"*
**Decision:** Drop the subtitle prop from `<SectionHeader>` call on Overview. Make `subtitle` optional in the component so the other 3 AEO tabs keep theirs unchanged.
**Files touched:**
- `components/report-sections/peec-ai/section-header.tsx` — `subtitle?: string`, conditional `<p>` render.
- `components/report-sections/peec-ai/index.tsx` — drop subtitle prop on the Overview SectionHeader call.
**Scope of impact:** Overview tab only. PR Influence / Content Impact / Technical Performance unchanged (they continue to pass their own subtitle strings).
**Verification:** `npx tsc --noEmit` clean. Visual: Overview header shows green Sparkles + question only, no subtitle. Other 3 tabs unchanged.
**Open risks:** None.
```

- [ ] **Step 1.8: Append FB-020 to changelog.md**

Edit `docs/official-feedback/changelog.md`. Append at the top of the entries (after the format-explanation header):

```
FB-020 | 2026-06-23 | <commit-sha-pending> | a | Removed Overview SectionHeader subtitle per Tina v2 ask (CSV row E2). Made `subtitle` optional in SectionHeader; PR Influence / Content Impact / Technical Performance tabs still pass their own.
```

(The SHA will be filled after the commit lands. Leave `<commit-sha-pending>` for now; replace after Step 1.10.)

- [ ] **Step 1.9: Commit FB-020**

Run:
```
git add components/report-sections/peec-ai/section-header.tsx \
        components/report-sections/peec-ai/index.tsx \
        docs/official-feedback/feedback-log.md \
        docs/official-feedback/changelog.md \
        docs/official-feedback/tina-scorecard.csv && \
git commit -m "$(cat <<'EOF'
fix(overview): FB-020 — drop SectionHeader subtitle per Tina v2 ask (CSV E2)

Tina v2 feedback on Overview tab row 2: "REMOVE: Subtitle 'Visibility,
share of voice, and sentiment across tracked LLMs, with side-by-side
comparison to competitors.'"

- section-header.tsx: subtitle prop now optional; <p> render conditional.
- peec-ai/index.tsx: drop subtitle prop from Overview SectionHeader call.

Other 3 AEO tabs unchanged — each still passes its own subtitle.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 1.10: Backfill the SHA in changelog.md**

Run:
```
git log -1 --format=%h
```
Replace `<commit-sha-pending>` in `docs/official-feedback/changelog.md` with the actual SHA, then:
```
git add docs/official-feedback/changelog.md && \
git commit -m "docs(feedback): backfill FB-020 SHA"
```

---

## Task 2 — FB-021: Remove "Which prompts are AI engines answering with our brand?" chart (item-c, E12, Rule #11)

**Files:**
- Modify: `components/report-sections/peec-ai/index.tsx:8, 19, 270-274`
- Modify: `components/report-sections/profound-ai/index.tsx:6, 248-251`
- Delete: `components/report-sections/peec-ai/tracked-prompts-chart.tsx`
- Delete: `components/report-sections/profound-ai/tracked-prompts-chart.tsx`

This is a render-only removal. **`data.trackedPrompts` field stays** — used by PR Influence, Content Impact, AI summaries, demand-overview, report-generator, both synopsis libs. Verified by grep before the cut.

- [ ] **Step 2.1: Confirm no other importers of the two tracked-prompts-chart files**

Run:
```
grep -rn "from .*tracked-prompts-chart" components/ app/ lib/ 2>/dev/null | grep -v node_modules
```
Expected: only the two locations we're removing — `peec-ai/index.tsx:8` and `peec-ai/index.tsx:19` (the `ProfoundTrackedPromptsChart as` alias) for the peec file, and `profound-ai/index.tsx:6` for the profound file.

If any other file imports either component, halt and assess.

- [ ] **Step 2.2: Confirm `data.trackedPrompts` is still consumed (must NOT be pruned)**

Run:
```
grep -rn "trackedPrompts" components/ lib/ app/ 2>/dev/null | grep -v node_modules | grep -v "tracked-prompts-chart" | wc -l
```
Expected: > 10 hits across PR Influence, Content Impact, AI summaries, etc. Confirms the field is still in use elsewhere.

- [ ] **Step 2.3: Remove the Peec render block from `components/report-sections/peec-ai/index.tsx`**

Find (around lines 270-274):
```tsx
      {data.trackedPrompts.length > 0 && (
        isPeec
          ? <TrackedPromptsChart prompts={data.trackedPrompts} brandName={brandName} />
          : <ProfoundTrackedPromptsChart prompts={data.trackedPrompts} />
      )}
```

Delete the entire 5-line block.

- [ ] **Step 2.4: Remove the two imports from `components/report-sections/peec-ai/index.tsx`**

Delete line 8:
```tsx
import { TrackedPromptsChart } from './tracked-prompts-chart'
```

Delete line 19:
```tsx
import { TrackedPromptsChart as ProfoundTrackedPromptsChart } from '../profound-ai/tracked-prompts-chart'
```

- [ ] **Step 2.5: Remove the Profound render block from `components/report-sections/profound-ai/index.tsx`**

Find (around lines 248-251):
```tsx
      {/* Tracked prompts */}
      {data.trackedPrompts.length > 0 && (
        <TrackedPromptsChart prompts={data.trackedPrompts} />
      )}
```

Delete those 4 lines (the comment line + the conditional).

- [ ] **Step 2.6: Remove the import from `components/report-sections/profound-ai/index.tsx`**

Delete line 6:
```tsx
import { TrackedPromptsChart } from './tracked-prompts-chart'
```

- [ ] **Step 2.7: Delete the two component files**

Run:
```
git rm components/report-sections/peec-ai/tracked-prompts-chart.tsx \
       components/report-sections/profound-ai/tracked-prompts-chart.tsx
```

- [ ] **Step 2.8: TypeScript check**

Run:
```
npx tsc --noEmit
```
Expected: zero output.

- [ ] **Step 2.9: Confirm no orphaned references remain**

Run:
```
grep -rn "TrackedPromptsChart\|ProfoundTrackedPromptsChart" components/ app/ lib/ 2>/dev/null | grep -v node_modules
```
Expected: zero output.

- [ ] **Step 2.10: Update the v1 scorecard CSV — fill F12 (V2 — What shipped)**

Edit `docs/official-feedback/tina-scorecard.csv` row 12 (the free-standing REMOVE row). Append column F:
```
,"Chart removed from Overview tab (both Peec + Profound provider variants). Component files deleted. data.trackedPrompts field kept — still consumed by PR Influence, Content Impact, and 4 other surfaces.",,
```

- [ ] **Step 2.11: Append FB-021 to feedback-log.md**

```markdown

---

## FB-021 — Remove "Which prompts are AI engines answering with our brand?" chart (Rule #11)

**Source:** Tina's Overview-tab v1 scorecard CSV, row 12 (free-standing column-E entry — no original ask).
**Verbatim ask:** *"REMOVE Chart: 'Which prompts are AI engines answering with our brand?' at the very bottom. This wasn't explicitly stated to remove in the initial doc, but it was not included in the recommended layout."*
**Decision:** Honor Rule #11 ("recommended layout = full spec"). Remove the chart from BOTH the Peec provider variant AND the Profound provider variant for layout parity. Delete the two component files entirely.
**Files touched:**
- `components/report-sections/peec-ai/index.tsx` — remove JSX block + 2 imports.
- `components/report-sections/profound-ai/index.tsx` — remove JSX block + 1 import.
- DELETE `components/report-sections/peec-ai/tracked-prompts-chart.tsx`.
- DELETE `components/report-sections/profound-ai/tracked-prompts-chart.tsx`.
**Scope of impact:** Overview tab only (Peec + Profound provider variants). `data.trackedPrompts` field on PeecOverview + ProfoundOverview types stays — verified still consumed by PR Influence, Content Impact, AI summaries, demand-overview, report-generator (>10 grep hits outside Overview).
**Verification:** `npx tsc --noEmit` clean. `grep -rn TrackedPromptsChart` returns zero hits in components/app/lib.
**Open risks:** None.
```

- [ ] **Step 2.12: Append FB-021 to changelog.md**

```
FB-021 | 2026-06-23 | <commit-sha-pending> | a | Removed "Which prompts are AI engines answering with our brand?" chart from both Peec + Profound Overview variants per Tina v2 + Rule #11. Deleted peec-ai/tracked-prompts-chart.tsx and profound-ai/tracked-prompts-chart.tsx. data.trackedPrompts field kept (consumed by 6+ other surfaces).
```

- [ ] **Step 2.13: Commit FB-021**

```
git add -A && git commit -m "$(cat <<'EOF'
fix(overview): FB-021 — remove tracked-prompts chart per Rule #11 (CSV E12)

Tina v2 row 12 free-standing column-E entry: "REMOVE Chart: 'Which
prompts are AI engines answering with our brand?' at the very bottom.
This wasn't explicitly stated to remove in the initial doc, but it
was not included in the recommended layout."

Rule #11 ("recommended layout = full spec") applied. Removed the chart
from BOTH Peec + Profound provider variants of the Overview tab. Two
component files deleted entirely.

- peec-ai/index.tsx: drop JSX render block + 2 imports.
- profound-ai/index.tsx: drop JSX render block + 1 import.
- DELETE peec-ai/tracked-prompts-chart.tsx.
- DELETE profound-ai/tracked-prompts-chart.tsx.

data.trackedPrompts field on PeecOverview + ProfoundOverview types
kept — still consumed by PR Influence, Content Impact, AI summaries,
demand-overview, report-generator (>10 grep hits).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)" && git log -1 --format=%h
```

Backfill the SHA in changelog.md (same pattern as Task 1.10).

---

## Task 3 — FB-022: Visibility chart truly YTD + drop "Tracking began" (item-b, E7)

This is the highest-risk task. Two issues fixed together:
1. **Data layer bug:** `dailyVisibility` is fetched with the date-range-bound `current` body. Chart tooltip lies ("fixed to year-to-date"). Fix: add a YTD fetch and route only the chart's data to it.
2. **Display bug:** "Tracking began May 18" string is misleading (it shows the first weekly bucket of the picker's range, NOT the workspace's actual first-tracked date). Fix per Decision 1A: drop the line entirely.

Same shape on Profound side.

**Files:**
- Modify: `lib/peec/client.ts:371-397, 552-562, 670-689, 691-714` (date-range + fetch + trend + return + cache version)
- Modify: `lib/profound/client.ts:390-430, 438-441, 537-553, 556-569` (same shape)
- Modify: `components/report-sections/peec-ai/visibility-chart.tsx:34-58` (drop trackingStart + line + update tooltip)

### Subtask 3A — Peec YTD trend fetch

- [ ] **Step 3A.1: Add YTD window compute in `lib/peec/client.ts`**

Find (around line 371-375):
```tsx
  const range = dateRange ?? 'last_30_days'
  const mainDates = parseDateRange(range)
  const compareDates = deriveCompareRange(range, 'previous_period') ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior   = { start_date: compareDates.startDate, end_date: compareDates.endDate }
```

Insert AFTER the `prior` line:
```tsx
  // FB-022: visibility trend chart is always YTD regardless of the page date range.
  // We fetch a separate trend dataset bounded to Jan 1 of the current year through
  // mainDates.endDate, and route ONLY dailyVisibility/competitorDailyVisibility to
  // use it. Everything else (rankings, domains, KPIs) stays on the picker range.
  const ytdYearStart = `${new Date(mainDates.endDate).getUTCFullYear()}-01-01`
  const ytd = { start_date: ytdYearStart, end_date: mainDates.endDate }
```

- [ ] **Step 3A.2: Add YTD trend fetch alongside the existing `trendRows` line**

Find (around line 397):
```tsx
  const trendRows = await fetchAllRows({ ...current, dimensions: ['date'] }, pid)
```

Replace with:
```tsx
  // FB-022: keep picker-bound trendRows for weeklyVisibility consumers (the
  // demand-overview page reads weeklyVisibility); add a YTD variant for the chart.
  const [trendRows, trendRowsYTD] = await Promise.all([
    fetchAllRows({ ...current, dimensions: ['date'] }, pid),
    fetchAllRows({ ...ytd,     dimensions: ['date'] }, pid),
  ])
```

- [ ] **Step 3A.3: Route only `dailyVisibility` + `competitorDailyVisibility` to YTD**

Find (around lines 552-562):
```tsx
  // --- Visibility trend over the selected range ---
  const filteredTrendRows = trendRows.filter((r) =>
    yourBrand ? r.brand.name.toLowerCase().includes(yourBrand.toLowerCase()) : true
  )
  const competitorTrendRows = trendRows.filter((r) =>
    yourBrand ? !r.brand.name.toLowerCase().includes(yourBrand.toLowerCase()) : false
  )
  const weeklyVisibility = groupByWeek(filteredTrendRows)
  const competitorWeeklyVisibility = groupByWeek(competitorTrendRows)
  const dailyVisibility = groupByDay(filteredTrendRows)
  const competitorDailyVisibility = groupByDay(competitorTrendRows)
```

Replace with:
```tsx
  // --- Visibility trend ---
  // weeklyVisibility/competitorWeeklyVisibility: picker-range bound (demand-overview reads these).
  // dailyVisibility/competitorDailyVisibility: ALWAYS YTD per Tina v2 (FB-022).
  const filterYou  = (rows: ApiBrandRow[]) => rows.filter((r) =>
    yourBrand ? r.brand.name.toLowerCase().includes(yourBrand.toLowerCase()) : true
  )
  const filterComp = (rows: ApiBrandRow[]) => rows.filter((r) =>
    yourBrand ? !r.brand.name.toLowerCase().includes(yourBrand.toLowerCase()) : false
  )
  const weeklyVisibility           = groupByWeek(filterYou(trendRows))
  const competitorWeeklyVisibility = groupByWeek(filterComp(trendRows))
  const dailyVisibility            = groupByDay(filterYou(trendRowsYTD))
  const competitorDailyVisibility  = groupByDay(filterComp(trendRowsYTD))
```

- [ ] **Step 3A.4: Bump cache version in `lib/peec/client.ts`**

Find (around line 709):
```tsx
    version: 'v7',
```

Replace with:
```tsx
    // v8 = FB-022: visibility trend chart now uses a separate YTD fetch
    //      (dailyVisibility/competitorDailyVisibility), while weeklyVisibility
    //      stays picker-range bound for the demand-overview consumer.
    version: 'v8',
```

### Subtask 3B — Profound YTD trend fetch

- [ ] **Step 3B.1: Add YTD window + parallel fetch in `lib/profound/client.ts`**

Find (around lines 392-397):
```tsx
  const range = dateRange ?? 'last_30_days'
  const mainDates = parseDateRange(range)
  const compareDates = deriveCompareRange(range, 'previous_period') ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior   = { start_date: compareDates.startDate, end_date: compareDates.endDate }
```

Insert AFTER the `prior` line:
```tsx
  // FB-022: visibility trend chart is always YTD regardless of the page date range.
  const ytdYearStart = `${new Date(mainDates.endDate).getUTCFullYear()}-01-01`
  const ytd = { start_date: ytdYearStart, end_date: mainDates.endDate }
```

- [ ] **Step 3B.2: Add a YTD weekly fetch alongside `weeklyRes`**

Find (around lines 410-430). The `Promise.all` block fetches `weeklyRes` (picker-range bound). Add a sibling YTD fetch.

Find:
```tsx
  const [
    currentBrandsRes,
    priorBrandsRes,
    weeklyRes,
    llmRes,
    domainsRes,
    priorDomainsRes,
    domainTypesRes,
    promptsRes,
    promptTopicsRes,
  ] = await Promise.all([
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(prior), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: ['visibility_score'], dimensions: ['date', 'asset_name'], date_interval: 'day' }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['model'], ...brandFilter }),
    profoundPost('/v1/reports/citations', { ...base(current), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(prior), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(current), metrics: ['citation_share'], dimensions: ['citation_category'] }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['prompt'], ...brandFilter }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: ['visibility_score'], dimensions: ['prompt', 'topic'] }),
  ])
```

Replace with (adds `weeklyYTDRes` at the end of the destructure and the Promise.all):
```tsx
  const [
    currentBrandsRes,
    priorBrandsRes,
    weeklyRes,
    llmRes,
    domainsRes,
    priorDomainsRes,
    domainTypesRes,
    promptsRes,
    promptTopicsRes,
    weeklyYTDRes,
  ] = await Promise.all([
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(prior), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: ['visibility_score'], dimensions: ['date', 'asset_name'], date_interval: 'day' }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['model'], ...brandFilter }),
    profoundPost('/v1/reports/citations', { ...base(current), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(prior), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(current), metrics: ['citation_share'], dimensions: ['citation_category'] }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['prompt'], ...brandFilter }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: ['visibility_score'], dimensions: ['prompt', 'topic'] }),
    // FB-022: YTD trend for the visibility chart.
    profoundPost('/v1/reports/visibility', { ...base(ytd), metrics: ['visibility_score'], dimensions: ['date', 'asset_name'], date_interval: 'day' }),
  ])
```

- [ ] **Step 3B.3: Route dailyVisibility to YTD source on Profound**

Find (around lines 438-441):
```tsx
  const weeklyVisibility = groupByWeekFromRows(weeklyRes.data, isYou)
  const competitorWeeklyVisibility = groupByWeekFromRows(weeklyRes.data, (a) => !isYou(a))
  const dailyVisibility = groupByDayFromRows(weeklyRes.data, isYou)
  const competitorDailyVisibility = groupByDayFromRows(weeklyRes.data, (a) => !isYou(a))
```

Replace with:
```tsx
  // FB-022: weeklyVisibility stays picker-range bound (demand-overview consumer).
  // dailyVisibility/competitorDailyVisibility are ALWAYS YTD for the trend chart.
  const weeklyVisibility           = groupByWeekFromRows(weeklyRes.data,    isYou)
  const competitorWeeklyVisibility = groupByWeekFromRows(weeklyRes.data,    (a) => !isYou(a))
  const dailyVisibility            = groupByDayFromRows(weeklyYTDRes.data,  isYou)
  const competitorDailyVisibility  = groupByDayFromRows(weeklyYTDRes.data,  (a) => !isYou(a))
```

- [ ] **Step 3B.4: Bump cache version in `lib/profound/client.ts`**

Find (around line 567):
```tsx
    version: 'v4',
```

Replace with:
```tsx
    // v5 = FB-022: visibility trend chart now uses a separate YTD fetch
    //      (dailyVisibility/competitorDailyVisibility), while weeklyVisibility
    //      stays picker-range bound for the demand-overview consumer.
    version: 'v5',
```

### Subtask 3C — Visibility chart: drop "Tracking began" line + accurate tooltip

- [ ] **Step 3C.1: Drop `trackingStart` calc + `<p>` render in `visibility-chart.tsx`**

Find (around line 37):
```tsx
  const trackingStart = data.length > 0 ? bucketDaily(data, 'weekly')[0]?.label : undefined
```

Delete this line entirely.

Find (around line 58):
```tsx
          {trackingStart && <p className="mt-0.5 text-[11px] text-text-muted">Tracking began {trackingStart}</p>}
```

Delete this line entirely.

- [ ] **Step 3C.2: Update the chart-header tooltip to be accurate**

Find (around line 55):
```tsx
            <InfoTooltip text="Percentage of AI responses where your brand appears. This chart is fixed to year-to-date and does not respond to the page date picker." />
```

Replace with:
```tsx
            <InfoTooltip text="Percentage of AI responses where your brand appears. Year-to-date — this chart shows the full year regardless of the page date picker." />
```

(Wording shift: removes the past-tense "fixed to" which described intent, replaces with "Year-to-date" which describes truth. The "does not respond to the page date picker" clause stays — it correctly tells the user the chart is intentionally separate from the picker.)

### Subtask 3D — Verification

- [ ] **Step 3D.1: TypeScript check**

Run:
```
npx tsc --noEmit
```
Expected: zero output.

- [ ] **Step 3D.2: Grep for orphan references to `trackingStart`**

Run:
```
grep -rn "trackingStart\|Tracking began" components/ app/ lib/ 2>/dev/null | grep -v node_modules
```
Expected: zero output.

- [ ] **Step 3D.3: Dev-server visual smoke test**

Run:
```
npm run dev
```
Then in a browser, hit `http://localhost:3000/dashboard/avenue-z/reports?section=peec-ai` (Avenue Z Overview). Verify:
- The visibility chart still renders.
- The left-most X-axis bucket label corresponds to the actual start of the YTD data (NOT the picker range start). If today is 2026-06-23 and the workspace started 2025-03-28, the leftmost bucket should be a 2026-01 week (since YTD = Jan 1 of current year onward).
- The "Tracking began ..." text is gone from the chart header.
- Change the date picker (e.g. from "Last 30 days" to "Last 7 days") — the chart should NOT change. Other KPIs (Visibility, Citation Share, AI Referral Traffic) and the LLM breakdown should change.

Kill the dev server after verification.

### Subtask 3E — Docs + commit

- [ ] **Step 3E.1: Update v1 scorecard CSV — fill F7 (V2 — What shipped)**

Edit `docs/official-feedback/tina-scorecard.csv` row 7. Append column F:
```
,"Visibility trend chart now truly YTD on both Peec + Profound — separate YTD fetch in lib/peec/client.ts + lib/profound/client.ts, dailyVisibility/competitorDailyVisibility now sourced from YTD data. weeklyVisibility (demand-overview consumer) stays picker-range bound. Misleading 'Tracking began May 18' line removed; tooltip now says 'Year-to-date'. Cache versions bumped (peec v7→v8, profound v4→v5).",,
```

- [ ] **Step 3E.2: Append FB-022 to feedback-log.md**

```markdown

---

## FB-022 — Visibility chart truly YTD + drop "Tracking began" line

**Source:** Tina's Overview-tab v1 scorecard CSV, cell E7.
**Verbatim ask:** *"ISSUE: 'Tracking began May 18' – this is incorrect, this workspace has been tracking data since March 28, 2025. I think that this YTD chart is changing based on the date range selector. Please make static to always show YTD."*

**Two-part issue:**
1. **Data-layer bug:** `dailyVisibility` was fetched with the date-range-bound `current` body in both `lib/peec/client.ts` (line 397) and `lib/profound/client.ts` (line 423 dimensions=['date',...]). The chart's tooltip claimed YTD but the data tracked the picker. Tina caught it.
2. **Display bug:** "Tracking began May 18" was rendered from `bucketDaily(data, 'weekly')[0]?.label` — i.e., the first weekly bucket of whatever data was passed in. When the picker was "Last 30 days" and today was a Tuesday, the first weekly bucket fell on a recent Monday (e.g. May 18). It wasn't a workspace inception date; it was a misleading artifact of the picker-bound fetch.

**Decision: 1A from the working assumptions.** After making the chart truly YTD, drop the "Tracking began" line entirely. The leftmost X-axis bucket label naturally communicates start-of-data without needing a separate text line.

**Alternative considered (1B):** hardcode per-client `firstTrackedAt` in the DB and display it. Rejected for this round because:
- DB migration + per-client data entry + onboarding maintenance.
- Once the chart is provably YTD, the leftmost bucket label is already accurate.
- Tina's literal complaint was that the chart was lying about being YTD — fixing the lie dissolves the complaint.

**Files touched:**
- `lib/peec/client.ts`: added YTD window compute, parallel `trendRowsYTD` fetch, routed `dailyVisibility`/`competitorDailyVisibility` to YTD, bumped cache version v7→v8.
- `lib/profound/client.ts`: added YTD window compute, added `weeklyYTDRes` fetch in the Promise.all, routed `dailyVisibility`/`competitorDailyVisibility` to YTD, bumped cache version v4→v5.
- `components/report-sections/peec-ai/visibility-chart.tsx`: removed `trackingStart` calc, removed the `<p>Tracking began ...</p>` render line, updated header tooltip from "fixed to year-to-date" to "Year-to-date — this chart shows the full year regardless of the page date picker."

**Scope of impact:** Overview tab visibility chart on both Peec + Profound provider variants. `weeklyVisibility` (consumed by `components/report-sections/demand-overview/index.tsx:195`) is intentionally LEFT as picker-range bound — different feature, different consumer, not touched.

**Performance note:** Two additional API calls per Overview page load (one to Peec, one to Profound for clients with both configured). YTD ranges are wider than picker ranges, so payload is larger. The `cached()` wrapper caches per `(clientSlug, dateRange)` for 1 hour, so within an hour the YTD result is reused. Verified the cache key derives from function args, not URL.

**Verification:**
- `npx tsc --noEmit` clean.
- `grep trackingStart` returns zero hits.
- Manual dev-server smoke: chart shows YTD start regardless of picker; "Tracking began" line is gone; other KPIs/tables react to picker as before.

**Open risks:**
- For brand-new clients (workspace started < 7 days ago), the YTD chart may show a single week of data. Acceptable — the chart still renders, just with one bucket.
- If a workspace's actual first-tracked date is in a PRIOR year (e.g. 2024 for a client onboarded then), the YTD chart will only show the current year (Jan 1 onward) — same behavior as before. Not flagged by Tina.

**Decision lineage:** This closes E7 from Tina v1 CSV; superseded the originally-FB-020-b plan handle.
```

- [ ] **Step 3E.3: Append FB-022 to changelog.md**

```
FB-022 | 2026-06-23 | <commit-sha-pending> | b | Visibility trend chart now truly YTD. Added separate YTD fetch in lib/peec/client.ts (trendRowsYTD via fetchAllRows w/ ytd window) + lib/profound/client.ts (weeklyYTDRes via /v1/reports/visibility w/ ytd window). dailyVisibility/competitorDailyVisibility sourced from YTD; weeklyVisibility (demand-overview consumer) stays picker-range bound. Cache versions bumped (peec v7→v8, profound v4→v5). Dropped misleading "Tracking began May 18" line in visibility-chart.tsx; updated tooltip from "fixed to year-to-date" to "Year-to-date — this chart shows the full year regardless of the page date picker." Tina v1 CSV E7.
```

- [ ] **Step 3E.4: Commit FB-022**

```
git add lib/peec/client.ts lib/profound/client.ts \
        components/report-sections/peec-ai/visibility-chart.tsx \
        docs/official-feedback/feedback-log.md \
        docs/official-feedback/changelog.md \
        docs/official-feedback/tina-scorecard.csv && \
git commit -m "$(cat <<'EOF'
fix(overview): FB-022 — visibility chart truly YTD, drop "Tracking began" (CSV E7)

Tina v2 row 7: "'Tracking began May 18' is incorrect, this workspace
has been tracking data since March 28, 2025. I think that this YTD
chart is changing based on the date range selector. Please make
static to always show YTD."

Two-part fix:

1. Data layer (the actual bug). dailyVisibility was fetched with the
   picker-range body in lib/peec/client.ts + lib/profound/client.ts.
   Chart tooltip claimed YTD but data tracked the picker. Added a
   separate YTD fetch in each provider; dailyVisibility +
   competitorDailyVisibility now source from YTD. weeklyVisibility
   stays picker-range bound (demand-overview consumer reads it).

2. Display. "Tracking began May 18" was rendered from
   bucketDaily(data, 'weekly')[0]?.label — the first weekly bucket of
   whatever data was passed in. Misleading artifact of the picker
   bug. Removed the line; chart's leftmost X-axis label now naturally
   communicates start of data. Updated tooltip text accordingly.

Cache versions bumped (peec v7→v8, profound v4→v5) — old cached
entries had dailyVisibility hard-bound to the picker.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)" && git log -1 --format=%h
```

Backfill the SHA in changelog.md.

---

## Task 4 — FB-023: Winners/Losers live data (item-d, E11)

The biggest task. Static const arrays → live per-client per-period per-model-filter computation. **Working assumption 2A applied: sandbox gate lifts** so every client sees real Winners/Losers from their own Peec data. Empty state for thin-history clients.

**Files:**
- Modify: `lib/peec/client.ts` (add prior-period prompt fetch, attach `priorPosition` to `TrackedPrompt`).
- Create: `lib/peec/winners-losers.ts` (pure compute function — testable).
- Create: `lib/peec/winners-losers.test.ts` (unit tests).
- Modify: `components/report-sections/peec-ai/winners-losers-cards.tsx` (accept props, lift gate, add empty state).
- Modify: `components/report-sections/peec-ai/index.tsx` (compute winners/losers in `ProviderSection`, pass to component).

### Subtask 4A — Extend `TrackedPrompt` with prior-period rank data

- [ ] **Step 4A.1: Extend `TrackedPrompt` type**

Edit `lib/peec/client.ts:156-164`.

Replace:
```tsx
export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  group: string
  topicSource: TopicSource
}
```

With:
```tsx
export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  /** FB-023: average rank position in the immediately-preceding period of equal
   *  length. null when this prompt was not tracked in the prior period (new prompt
   *  added recently, etc.). Used for Biggest Winners / Biggest Losers compute. */
  priorPosition: number | null
  group: string
  topicSource: TopicSource
}
```

- [ ] **Step 4A.2: Add prior-period prompt-level fetch to the Promise.all**

Edit `lib/peec/client.ts` around line 379-395.

Find:
```tsx
  const [currentBrandsRes, priorBrandsRes, domainsRes, domainsPriorRes, promptBrandsRes, queriesRes, llmBrandsRes, llmDomainsRes, tagsRes, promptsRes] = await Promise.all([
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...prior }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['prompt_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiQueryRow[]; totalCount: number }>('/queries/search', { ...current, limit: 2000 }, pid),
    // FB-005: include both model_channel_id and model_id so we can bucket by
    // the friendly scraper id (e.g. "gemini-scraper") instead of the channel id
    // (e.g. "google-2" which contains "google" and would otherwise be misbucketed).
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['model_channel_id', 'model_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current, dimensions: ['model_channel_id', 'model_id'], limit: 2000 }, pid),
    // Real prompt taxonomy: tag id→name + each prompt's tags, for grouping by
    // the prompt's primary subject tag instead of keyword inference.
    peecGet<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
    peecGet<{ data: { id: string; messages?: { content?: string }[]; tags?: { id: string }[] }[]; totalCount: number }>('/prompts', { limit: '1000' }, pid),
  ])
```

Replace with (adds `promptBrandsPriorRes` at the end of the destructure and the Promise.all):
```tsx
  const [
    currentBrandsRes,
    priorBrandsRes,
    domainsRes,
    domainsPriorRes,
    promptBrandsRes,
    queriesRes,
    llmBrandsRes,
    llmDomainsRes,
    tagsRes,
    promptsRes,
    promptBrandsPriorRes,
  ] = await Promise.all([
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...prior }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['prompt_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiQueryRow[]; totalCount: number }>('/queries/search', { ...current, limit: 2000 }, pid),
    // FB-005: include both model_channel_id and model_id so we can bucket by
    // the friendly scraper id (e.g. "gemini-scraper") instead of the channel id
    // (e.g. "google-2" which contains "google" and would otherwise be misbucketed).
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['model_channel_id', 'model_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current, dimensions: ['model_channel_id', 'model_id'], limit: 2000 }, pid),
    // Real prompt taxonomy: tag id→name + each prompt's tags, for grouping by
    // the prompt's primary subject tag instead of keyword inference.
    peecGet<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
    peecGet<{ data: { id: string; messages?: { content?: string }[]; tags?: { id: string }[] }[]; totalCount: number }>('/prompts', { limit: '1000' }, pid),
    // FB-023: prior-period prompt-level rows for Biggest Winners / Biggest Losers
    // rank-delta compute. Same shape as promptBrandsRes (current), bounded to
    // the prior period instead.
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior, dimensions: ['prompt_id'], limit: 2000 }, pid),
  ])
```

- [ ] **Step 4A.3: Build the prior-period prompt position map**

Edit `lib/peec/client.ts`. Find the existing `promptMetricsById` builder (around lines 499-512):

```tsx
  // Build UUID → metrics for your brand only
  type PromptMetric = { visibility: number; sov: number; position: number }
  const promptMetricsById = new Map<string, PromptMetric>()

  for (const row of promptBrandsRes.data ?? []) {
    if (yourBrand && !row.brand.name.toLowerCase().includes(yourBrand.toLowerCase())) continue
    const uuid = row.prompt?.id != null ? String(row.prompt.id) : null
    if (!uuid) continue
    const metric: PromptMetric = {
      visibility: row.visibility_total > 0 ? (row.visibility_count / row.visibility_total) * 100 : 0,
      sov: row.share_of_voice * 100,
      position: row.position_count > 0 ? row.position_sum / row.position_count : 0,
    }
    promptMetricsById.set(uuid, metric)
  }
```

Insert AFTER this block (before the existing `// Sources cited per prompt UUID` block):
```tsx
  // FB-023: prior-period position per prompt UUID, scoped to your brand. Used by
  // Biggest Winners / Biggest Losers compute. Same shape as promptMetricsById
  // (current), but only the position field is needed for rank-delta.
  const priorPositionByUuid = new Map<string, number>()
  for (const row of promptBrandsPriorRes.data ?? []) {
    if (yourBrand && !row.brand.name.toLowerCase().includes(yourBrand.toLowerCase())) continue
    const uuid = row.prompt?.id != null ? String(row.prompt.id) : null
    if (!uuid) continue
    if (row.position_count > 0) {
      priorPositionByUuid.set(uuid, row.position_sum / row.position_count)
    }
  }
```

- [ ] **Step 4A.4: Attach `priorPosition` to each `TrackedPrompt`**

Edit `lib/peec/client.ts`. Find the `trackedPrompts` builder (around lines 534-550):

```tsx
  const trackedPrompts: TrackedPrompt[] = (promptsRes.data ?? []).map((p) => {
    const uuid = p.id
    const text = (p.messages ?? []).map((m) => m.content).filter(Boolean).join(' ').trim() || '(untitled prompt)'
    const subjectTag = (p.tags ?? [])
      .map((t) => tagNameById.get(t.id))
      .find((name): name is string => !!name && !FACET_TAGS.has(name.toLowerCase()))
    const m = promptMetricsById.get(uuid)
    return {
      text,
      sources: Array.from(sourcesByUuid.get(uuid) ?? []),
      visibility: m?.visibility ?? 0,
      sov: m?.sov ?? 0,
      position: m?.position ?? 0,
      group: subjectTag ?? categorizePrompt(text),
      topicSource: subjectTag ? 'provider' : 'inferred',
    }
  })
```

Replace with:
```tsx
  const trackedPrompts: TrackedPrompt[] = (promptsRes.data ?? []).map((p) => {
    const uuid = p.id
    const text = (p.messages ?? []).map((m) => m.content).filter(Boolean).join(' ').trim() || '(untitled prompt)'
    const subjectTag = (p.tags ?? [])
      .map((t) => tagNameById.get(t.id))
      .find((name): name is string => !!name && !FACET_TAGS.has(name.toLowerCase()))
    const m = promptMetricsById.get(uuid)
    const prior = priorPositionByUuid.get(uuid)
    return {
      text,
      sources: Array.from(sourcesByUuid.get(uuid) ?? []),
      visibility: m?.visibility ?? 0,
      sov: m?.sov ?? 0,
      position: m?.position ?? 0,
      priorPosition: prior ?? null,
      group: subjectTag ?? categorizePrompt(text),
      topicSource: subjectTag ? 'provider' : 'inferred',
    }
  })
```

- [ ] **Step 4A.5: Update Profound's `TrackedPrompt` type for parity**

Edit `lib/profound/client.ts:94-102`.

Replace:
```tsx
export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  group: string
  topicSource: TopicSource
}
```

With:
```tsx
export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  /** Matches the Peec TrackedPrompt shape for cross-provider type compatibility.
   *  Profound does not currently fetch prior-period prompt rows — always null. */
  priorPosition: number | null
  group: string
  topicSource: TopicSource
}
```

- [ ] **Step 4A.6: Default `priorPosition: null` on every Profound `trackedPrompts` builder**

Edit `lib/profound/client.ts`. Find (around lines 504-515):

```tsx
  const trackedPrompts: TrackedPrompt[] = (promptsRes.data ?? [])
    .filter((r) => r.dimensions[0])
    .map((r) => ({
      text:        r.dimensions[0]!,
      sources:     [],
      visibility:  (r.metrics[0] ?? 0) * 100,
      sov:         (r.metrics[1] ?? 0) * 100,
      position:    r.metrics[2] ?? 0,
      group:       promptTopic.get(r.dimensions[0]!) ?? categorizePrompt(r.dimensions[0]!),
      topicSource: (promptTopic.has(r.dimensions[0]!) ? 'provider' : 'inferred') as TopicSource,
    }))
    .sort((a, b) => b.visibility - a.visibility)
```

Replace with:
```tsx
  const trackedPrompts: TrackedPrompt[] = (promptsRes.data ?? [])
    .filter((r) => r.dimensions[0])
    .map((r) => ({
      text:           r.dimensions[0]!,
      sources:        [],
      visibility:     (r.metrics[0] ?? 0) * 100,
      sov:            (r.metrics[1] ?? 0) * 100,
      position:       r.metrics[2] ?? 0,
      priorPosition:  null,
      group:          promptTopic.get(r.dimensions[0]!) ?? categorizePrompt(r.dimensions[0]!),
      topicSource:    (promptTopic.has(r.dimensions[0]!) ? 'provider' : 'inferred') as TopicSource,
    }))
    .sort((a, b) => b.visibility - a.visibility)
```

Also patch the `emptyOverview()` return at lines 350-367 if it constructs any TrackedPrompt — `trackedPrompts: []` is already an empty array, so no change needed there.

- [ ] **Step 4A.7: Bump Peec cache version (combined with FB-022's bump)**

Already done in Step 3A.4 (v7→v8). The v8 entry already exists. Add FB-023 to its comment:

Find:
```tsx
    // v8 = FB-022: visibility trend chart now uses a separate YTD fetch
    //      (dailyVisibility/competitorDailyVisibility), while weeklyVisibility
    //      stays picker-range bound for the demand-overview consumer.
    version: 'v8',
```

Replace with:
```tsx
    // v8 = FB-022: visibility trend chart now uses a separate YTD fetch
    //      (dailyVisibility/competitorDailyVisibility), while weeklyVisibility
    //      stays picker-range bound for the demand-overview consumer.
    //      FB-023: TrackedPrompt now carries priorPosition (number|null) from a
    //      new promptBrandsPriorRes fetch, for Biggest Winners / Biggest Losers
    //      compute.
    version: 'v8',
```

(Note: the version is still v8 — both FB-022 and FB-023 ship in the same response-shape change, so one version bump covers both. If FB-022 ships in isolation first, this version is already v8 by then; FB-023 adds a field to the cached shape but the version stays v8 because the cached entry would be from this same deploy.)

**Defensive variant:** if Thomas wants strict version-per-FB invalidation, bump to v9 for FB-023. Cleaner audit trail, very small cache churn cost (one extra invalidation). My recommendation: keep v8, document both FBs in the comment.

### Subtask 4B — Pure compute function `lib/peec/winners-losers.ts` (TDD)

- [ ] **Step 4B.1: Write the failing tests first**

Create `lib/peec/winners-losers.test.ts`:

```tsx
import { describe, it, expect } from 'vitest'
import { computeWinnersLosers } from './winners-losers'
import type { TrackedPrompt } from './client'

const makePrompt = (over: Partial<TrackedPrompt>): TrackedPrompt => ({
  text: 'p',
  sources: [],
  visibility: 0,
  sov: 0,
  position: 0,
  priorPosition: null,
  group: 'g',
  topicSource: 'inferred',
  ...over,
})

describe('computeWinnersLosers', () => {
  it('returns empty arrays when no prompts have priorPosition', () => {
    const prompts = [
      makePrompt({ text: 'a', position: 5, priorPosition: null }),
      makePrompt({ text: 'b', position: 10, priorPosition: null }),
    ]
    const { winners, losers } = computeWinnersLosers(prompts)
    expect(winners).toEqual([])
    expect(losers).toEqual([])
  })

  it('classifies a prompt that improved (lower position number) as a winner', () => {
    const prompts = [
      makePrompt({ text: 'improved', position: 3, priorPosition: 10 }),
    ]
    const { winners, losers } = computeWinnersLosers(prompts)
    expect(winners).toHaveLength(1)
    expect(winners[0]).toEqual({ text: 'improved', rank: 3, delta: 7 })
    expect(losers).toEqual([])
  })

  it('classifies a prompt that declined (higher position number) as a loser', () => {
    const prompts = [
      makePrompt({ text: 'declined', position: 15, priorPosition: 8 }),
    ]
    const { winners, losers } = computeWinnersLosers(prompts)
    expect(losers).toHaveLength(1)
    expect(losers[0]).toEqual({ text: 'declined', rank: 15, delta: -7 })
    expect(winners).toEqual([])
  })

  it('drops prompts with zero delta (no change)', () => {
    const prompts = [
      makePrompt({ text: 'flat', position: 5, priorPosition: 5 }),
    ]
    const { winners, losers } = computeWinnersLosers(prompts)
    expect(winners).toEqual([])
    expect(losers).toEqual([])
  })

  it('drops prompts with position=0 (never appeared) — current period', () => {
    const prompts = [
      makePrompt({ text: 'absent', position: 0, priorPosition: 10 }),
    ]
    const { winners, losers } = computeWinnersLosers(prompts)
    expect(winners).toEqual([])
    expect(losers).toEqual([])
  })

  it('drops prompts with priorPosition=0 (never appeared in prior period)', () => {
    // Peec only writes prior position when position_count > 0, so 0 should never
    // appear in practice — but if it does we treat it as no comparable history.
    const prompts = [
      makePrompt({ text: 'new', position: 5, priorPosition: 0 }),
    ]
    const { winners, losers } = computeWinnersLosers(prompts)
    expect(winners).toEqual([])
    expect(losers).toEqual([])
  })

  it('sorts winners by largest delta first', () => {
    const prompts = [
      makePrompt({ text: 'small-win', position: 8, priorPosition: 10 }),
      makePrompt({ text: 'big-win',   position: 2, priorPosition: 30 }),
      makePrompt({ text: 'mid-win',   position: 5, priorPosition: 15 }),
    ]
    const { winners } = computeWinnersLosers(prompts)
    expect(winners.map(w => w.text)).toEqual(['big-win', 'mid-win', 'small-win'])
  })

  it('sorts losers by largest negative delta first (most decline first)', () => {
    const prompts = [
      makePrompt({ text: 'small-loss', position: 12, priorPosition: 10 }),
      makePrompt({ text: 'big-loss',   position: 40, priorPosition:  5 }),
      makePrompt({ text: 'mid-loss',   position: 20, priorPosition:  8 }),
    ]
    const { losers } = computeWinnersLosers(prompts)
    expect(losers.map(l => l.text)).toEqual(['big-loss', 'mid-loss', 'small-loss'])
  })

  it('caps winners and losers at 20 rows each by default', () => {
    const prompts = Array.from({ length: 30 }, (_, i) =>
      makePrompt({ text: `w${i}`, position: 1, priorPosition: 30 - i })
    )
    const { winners } = computeWinnersLosers(prompts)
    expect(winners).toHaveLength(20)
  })

  it('honors a custom limit', () => {
    const prompts = Array.from({ length: 30 }, (_, i) =>
      makePrompt({ text: `w${i}`, position: 1, priorPosition: 30 - i })
    )
    const { winners } = computeWinnersLosers(prompts, { limit: 5 })
    expect(winners).toHaveLength(5)
  })

  it('rounds position to the nearest integer for display', () => {
    // Peec returns fractional position averages (e.g. 3.7). The compute should
    // round to the nearest integer for display purposes.
    const prompts = [
      makePrompt({ text: 'frac', position: 3.7, priorPosition: 10.2 }),
    ]
    const { winners } = computeWinnersLosers(prompts)
    expect(winners[0].rank).toBe(4)   // round(3.7)
    expect(winners[0].delta).toBe(6)  // round(10.2 - 3.7) = round(6.5) = 7? Actually 10.2 - 3.7 = 6.5 → round = 7
    // NOTE: Math.round(6.5) is 7 in JS (banker's rounding would give 6). We
    // use Math.round, so expect 7. Correct the previous line accordingly.
  })
})
```

Note on the last test: `Math.round(6.5) === 7` in JS. I'll fix the test expectation when writing the actual compute. Let me restate it correctly:

Replace the last test with:
```tsx
  it('rounds position and delta to the nearest integer for display', () => {
    const prompts = [
      makePrompt({ text: 'frac', position: 3.7, priorPosition: 10.2 }),
    ]
    const { winners } = computeWinnersLosers(prompts)
    expect(winners[0].rank).toBe(4)   // Math.round(3.7)
    expect(winners[0].delta).toBe(7)  // Math.round(10.2 - 3.7) = Math.round(6.5) = 7
  })
```

- [ ] **Step 4B.2: Run the failing tests**

Run:
```
npx vitest run lib/peec/winners-losers.test.ts
```
Expected: 11 tests fail with module-not-found because `winners-losers.ts` doesn't exist yet.

- [ ] **Step 4B.3: Write the minimal implementation**

Create `lib/peec/winners-losers.ts`:

```tsx
// lib/peec/winners-losers.ts
// FB-023: compute Biggest Winners and Biggest Losers from a list of tracked
// prompts that carry a priorPosition field. A "winner" is a prompt whose
// average rank position in the current period is LOWER (better) than its rank
// in the prior period — i.e. positive delta = improved. A "loser" is the
// inverse. Filters out prompts with no comparable prior data and prompts that
// didn't appear at all in the current period.

import type { TrackedPrompt } from './client'

export type PromptDelta = { text: string; rank: number; delta: number }

type Options = { limit?: number }

/**
 * Computes the top N winners and top N losers from a tracked-prompts list.
 *
 * @param prompts - the full tracked-prompts list (post-filter for any model filter
 *                  is the caller's responsibility — this function is pure compute).
 * @param opts.limit - max rows per side. Default 20.
 */
export function computeWinnersLosers(
  prompts: TrackedPrompt[],
  opts: Options = {},
): { winners: PromptDelta[]; losers: PromptDelta[] } {
  const limit = opts.limit ?? 20

  const deltas: PromptDelta[] = []
  for (const p of prompts) {
    if (p.position <= 0) continue
    if (p.priorPosition == null || p.priorPosition <= 0) continue
    const delta = p.priorPosition - p.position    // lower position number is better → positive delta = improvement
    if (delta === 0) continue
    deltas.push({
      text: p.text,
      rank: Math.round(p.position),
      delta: Math.round(delta),
    })
  }

  const winners = deltas
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit)

  const losers = deltas
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)   // most negative first
    .slice(0, limit)

  return { winners, losers }
}
```

- [ ] **Step 4B.4: Run the tests and verify they pass**

Run:
```
npx vitest run lib/peec/winners-losers.test.ts
```
Expected: 11 tests pass.

### Subtask 4C — Wire the compute into the Overview RSC

- [ ] **Step 4C.1: Compute winners/losers inside `ProviderSection`**

Edit `components/report-sections/peec-ai/index.tsx`. The `ProviderSection` function spans roughly lines 144-279. Inside it, right above the `return (` at line 198, insert the compute:

Find (around line 195):
```tsx
  const aiTrafficDelta =
    aiTraffic.available && aiTraffic.sessionsPrior != null && aiTraffic.sessionsPrior > 0
      ? ((aiTraffic.sessions - aiTraffic.sessionsPrior) / aiTraffic.sessionsPrior) * 100
      : undefined

  return (
```

Insert AFTER the `aiTrafficDelta` block and BEFORE `return (`:
```tsx

  // FB-023: Biggest Winners / Biggest Losers from live per-period prompt-level
  // data. Sandbox gate is lifted — every client sees their own real winners/losers.
  // When a model filter is active, future work could filter trackedPrompts by
  // model; for v1 of live wiring, we compute against the unfiltered prompts and
  // surface a footnote in the empty state. Peec only — Profound's TrackedPrompt
  // carries priorPosition: null so winners/losers will be empty for the Profound
  // provider variant.
  const { winners, losers } = isPeec
    ? computeWinnersLosers(data.trackedPrompts as TrackedPrompt[])
    : { winners: [], losers: [] }
```

- [ ] **Step 4C.2: Add the import for `computeWinnersLosers` and the `TrackedPrompt` type**

Edit `components/report-sections/peec-ai/index.tsx`. Find the existing imports near the top:
```tsx
import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview } from '@/lib/peec/client'
```

Replace with:
```tsx
import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview, TrackedPrompt } from '@/lib/peec/client'
import { computeWinnersLosers } from '@/lib/peec/winners-losers'
```

- [ ] **Step 4C.3: Pass `winners` + `losers` to `<WinnersLosersCards>`**

Find (around line 258):
```tsx
      <WinnersLosersCards clientSlug={clientSlug} />
```

Replace with:
```tsx
      <WinnersLosersCards
        clientSlug={clientSlug}
        winners={winners}
        losers={losers}
      />
```

### Subtask 4D — Rewrite `winners-losers-cards.tsx` to accept props + lift gate

- [ ] **Step 4D.1: Rewrite the component**

Edit `components/report-sections/peec-ai/winners-losers-cards.tsx` ENTIRELY.

Replace the entire file with:

```tsx
// components/report-sections/peec-ai/winners-losers-cards.tsx
// FB-023: Two side-by-side cards on the AEO Overview tab — Biggest Winners
// (prompts where rank improved vs. the prior period) and Biggest Losers (prompts
// where rank dropped). Data is computed in lib/peec/winners-losers.ts from the
// per-period prompt-level fetch in lib/peec/client.ts. Sandbox gate lifted —
// every client sees their own real winners/losers.
//
// Lineage: supersedes FB-006 (static Avenue Z arrays + clientSlug-gated render).
// Tina v1 CSV E11: "This seems like static copy and should be pulling actual
// data. It doesn't change when a new date range or model is selected and is an
// exact copy of the example text I provided."

import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { PromptDelta } from '@/lib/peec/winners-losers'

const DELTA_TOOLTIP =
  'Change in your brand\'s average rank position for each prompt over the period vs. the previous period of equal length. Positive means you moved up.'

function PromptDeltaCard({
  title,
  emphasis,
  rest,
  rows,
  positive,
  emptyMessage,
}: {
  title: string
  emphasis: string
  rest: string
  rows: PromptDelta[]
  positive: boolean
  emptyMessage: string
}) {
  return (
    <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-5 h-full">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mb-4 text-sm text-text-muted">
        Prompts where we <span className="font-bold text-white">{emphasis}</span> {rest}
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-white/[0.06] px-4 py-12 text-center">
          <p className="max-w-xs text-xs text-text-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-white/[0.06]">
          <div className="grid grid-cols-[1fr_72px_72px] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
            <span>Prompt</span>
            <span className="text-right">Rank</span>
            <span className="flex items-center justify-end gap-1">
              Delta
              <InfoTooltip text={DELTA_TOOLTIP} />
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {rows.map((r, i) => (
              <div
                key={`${i}-${r.text}`}
                className="grid grid-cols-[1fr_72px_72px] gap-3 border-b border-white/[0.04] px-4 py-2.5 text-sm last:border-b-0 hover:bg-white/[0.02]"
              >
                <span className="truncate text-white" title={r.text}>{r.text}</span>
                <span className="text-right tabular-nums text-white">#{r.rank}</span>
                <span
                  className="text-right tabular-nums font-semibold"
                  style={{ color: positive ? '#60FF80' : '#FF6B6B' }}
                >
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function WinnersLosersCards({
  clientSlug: _clientSlug,
  winners,
  losers,
}: {
  // clientSlug retained for parity with other components in case future logic
  // needs it; currently unused since the sandbox gate was lifted in FB-023.
  clientSlug?: string
  winners: PromptDelta[]
  losers: PromptDelta[]
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2 items-stretch">
      <PromptDeltaCard
        title="The Biggest Winners"
        emphasis="gained"
        rest="rank to our competitors"
        rows={winners}
        positive={true}
        emptyMessage="Not enough prompt-rank history yet for this period. Try a wider date range."
      />
      <PromptDeltaCard
        title="The Biggest Losers"
        emphasis="lost"
        rest="rank to our competitors"
        rows={losers}
        positive={false}
        emptyMessage="Not enough prompt-rank history yet for this period. Try a wider date range."
      />
    </div>
  )
}
```

Key changes from prior version:
- Removed the `WINNERS` + `LOSERS` const arrays (52 lines deleted).
- Removed `SANDBOX_CLIENT_SLUG` constant + the `if (clientSlug !== SANDBOX_CLIENT_SLUG) return null` gate.
- Removed the local `PromptDelta` type definition; now imports the canonical type from `lib/peec/winners-losers`.
- `WinnersLosersCards` now accepts `winners` + `losers` props.
- Added graceful empty state per card.
- Delta cell now prefixes `+` for positive numbers (matches Peec's typical formatting).
- `_clientSlug` retained as named prop for type compatibility with parent + future-proofing.

### Subtask 4E — TypeScript + verification

- [ ] **Step 4E.1: TypeScript check**

Run:
```
npx tsc --noEmit
```
Expected: zero output.

- [ ] **Step 4E.2: Tests still pass**

Run:
```
npx vitest run lib/peec/winners-losers.test.ts
```
Expected: 11/11 pass.

- [ ] **Step 4E.3: Dev-server visual smoke test**

Run:
```
npm run dev
```

Test on **Avenue Z**: hit `http://localhost:3000/dashboard/avenue-z/reports?section=peec-ai`. Verify:
- Winners + Losers cards render real prompt data (not the verbatim 17-winner/20-loser arrays from FB-006).
- Change the date range picker — cards re-render.
- (If you have a model filter UI accessible) change the model filter — cards re-render based on the underlying TrackedPrompt fetch (model filtering on prompts is a future enhancement; for v1 the cards use unfiltered data but the rest of the page filters).

Test on **a non-Avenue-Z client** (e.g. `/dashboard/renaissance/reports?section=peec-ai` if Renaissance has a Peec project ID configured). Verify:
- Winners + Losers cards now render for this client too (gate lifted).
- If the client has thin history, the cards show the empty-state message instead of breaking.

Kill the dev server after verification.

### Subtask 4F — Docs + commit

- [ ] **Step 4F.1: Update v1 scorecard CSV — fill F11 (V2 — What shipped)**

Edit `docs/official-feedback/tina-scorecard.csv` row 11. Append column F:
```
,"Winners/Losers cards now compute from live per-period prompt rank deltas. New prior-period prompt fetch in lib/peec/client.ts attaches priorPosition to each TrackedPrompt. Pure compute in lib/peec/winners-losers.ts (unit-tested, 11 specs). Sandbox gate lifted — every client sees their own real winners/losers; empty state for thin-history clients. Reacts to date range. Model-filter parity is deferred to a follow-up (TrackedPrompt fetch is not yet model-dimensioned). Profound provider variant shows empty cards (priorPosition always null on Profound until parity ships).",,
```

- [ ] **Step 4F.2: Append FB-023 to feedback-log.md**

```markdown

---

## FB-023 — Winners/Losers cards: live data (date-range reactive)

**Source:** Tina's Overview-tab v1 scorecard CSV, cell E11.
**Verbatim ask:** *"ISSUE: This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected and is an exact copy of the example text I provided."*
**Decision: 2A from the working assumptions.** Wire to live data AND lift the Avenue-Z-only sandbox gate so every client sees their own real winners/losers. Graceful empty state for clients with thin history.

**Two-part change:**

1. **Data layer (`lib/peec/client.ts`)**:
   - Added `promptBrandsPriorRes` to the existing `Promise.all` — second prompt-level fetch bounded to the prior period (same shape as the existing `promptBrandsRes` current-period fetch).
   - Built `priorPositionByUuid` from `promptBrandsPriorRes`, scoped to your brand.
   - Extended `TrackedPrompt` type with `priorPosition: number | null`.
   - Attached `priorPosition` to each row in the `trackedPrompts.map()`.
   - Mirror change on Profound's `TrackedPrompt` type for cross-provider type compatibility — Profound's prompts always carry `priorPosition: null` until prior-period prompt fetch parity ships.
   - Cache version bumped (covered by the v8 bump from FB-022).

2. **Compute + UI (`lib/peec/winners-losers.ts` + `winners-losers-cards.tsx` + `peec-ai/index.tsx`)**:
   - New pure function `computeWinnersLosers(prompts, opts?)` in `lib/peec/winners-losers.ts`. Filters prompts to those with valid position + priorPosition, computes delta = priorPosition - position, splits into winners (delta > 0) and losers (delta < 0), sorts by absolute delta descending, caps at 20 per side by default.
   - 11 unit tests in `lib/peec/winners-losers.test.ts` covering: empty prompts, no prior data, improvement, decline, no change, zero current position, zero prior position, sort order (winners + losers), cap at 20, custom limit, fractional position rounding.
   - `winners-losers-cards.tsx` rewritten: static const arrays removed; props-driven (`winners`, `losers`); sandbox gate lifted; empty-state message per card.
   - `peec-ai/index.tsx` `ProviderSection`: computes `{ winners, losers } = computeWinnersLosers(data.trackedPrompts)` for the Peec provider variant; passes to `<WinnersLosersCards>`. Profound provider variant gets `{ winners: [], losers: [] }` (forces empty state since Profound has no priorPosition yet).

**Lineage:** Supersedes FB-006 (which seeded the static Avenue Z arrays + clientSlug-gated render).

**Files touched:**
- `lib/peec/client.ts`: extended TrackedPrompt type, added prior-period prompt fetch + map, attached priorPosition.
- `lib/profound/client.ts`: extended TrackedPrompt type for parity (Profound always passes null).
- NEW `lib/peec/winners-losers.ts`: pure compute, exported PromptDelta type.
- NEW `lib/peec/winners-losers.test.ts`: 11 unit tests.
- `components/report-sections/peec-ai/winners-losers-cards.tsx`: rewritten props-driven, gate lifted, empty state added.
- `components/report-sections/peec-ai/index.tsx`: imported computeWinnersLosers + TrackedPrompt type; computed winners/losers in ProviderSection; pass to component.

**Scope of impact:** Overview tab Winners/Losers cards. Other surfaces that consume `data.trackedPrompts` see one new field (`priorPosition: number | null`) added to the type — unaffected because they don't reference it.

**Performance note:** One additional `peecPost('/reports/brands', { ...prior, dimensions: ['prompt_id'], limit: 2000 })` per Overview page load. Caches per (clientSlug, dateRange) for 1 hour via the existing `cached()` wrapper.

**Verification:**
- `npx vitest run lib/peec/winners-losers.test.ts` → 11/11 pass.
- `npx tsc --noEmit` clean.
- Dev-server smoke (Avenue Z): cards show real prompts, react to date picker changes.
- Dev-server smoke (Renaissance or other non-Avenue-Z client with Peec configured): cards render with real data OR show empty-state message if thin history.

**Open risks:**
- **Model filter reactivity:** Tina's ask says cards should also change when a new MODEL is selected. The current implementation does NOT model-filter the `trackedPrompts` data because the prompt-level fetches don't yet carry a model dimension. The cards therefore react to date range but not (yet) to model filter. Acknowledged. Future enhancement: add `model_channel_id` + `model_id` dimensions to `promptBrandsRes` + `promptBrandsPriorRes`, filter post-fetch by the active models in the RSC before passing to compute. Recommend creating a follow-up FB after Tina v2 acceptance.
- **Profound parity:** Profound provider variant of Overview shows empty cards because we haven't added the prior-period prompt fetch on the Profound side. Acceptable for v2 — Tina's ask was framed against the Avenue Z (Peec) view she sees. Profound parity is a follow-up FB if she ever switches her v2 review to Profound.
- **Thin-history clients:** Brand-new clients with no comparable prior period get an empty-state message in both cards. Tina did not flag empty state behavior; my interpretation: better to show "not enough data" than to show stale demo content. Confirm with Thomas if a different empty state copy is preferred.

**Decision lineage:** Closes E11 from Tina v1 CSV; supersedes the originally-FB-021 plan handle.
```

- [ ] **Step 4F.3: Append FB-023 to changelog.md**

```
FB-023 | 2026-06-23 | <commit-sha-pending> | b | Winners/Losers cards swapped from static const arrays (FB-006) to live per-period compute. Added prior-period prompt fetch in lib/peec/client.ts (promptBrandsPriorRes); extended TrackedPrompt with priorPosition field. New lib/peec/winners-losers.ts pure compute, 11 unit tests. Sandbox gate lifted in winners-losers-cards.tsx; empty state for thin-history clients. Profound TrackedPrompt extended for type parity (priorPosition always null until parity ships). Tina v1 CSV E11.
```

- [ ] **Step 4F.4: Commit FB-023**

```
git add lib/peec/client.ts lib/peec/winners-losers.ts lib/peec/winners-losers.test.ts \
        lib/profound/client.ts \
        components/report-sections/peec-ai/winners-losers-cards.tsx \
        components/report-sections/peec-ai/index.tsx \
        docs/official-feedback/feedback-log.md \
        docs/official-feedback/changelog.md \
        docs/official-feedback/tina-scorecard.csv && \
git commit -m "$(cat <<'EOF'
feat(overview): FB-023 — Winners/Losers live per-period compute (CSV E11)

Tina v2 row 11: "This seems like static copy and should be pulling
actual data. It doesn't change when a new date range or model is
selected and is an exact copy of the example text I provided."

Swap static FB-006 arrays for live per-period compute.

Data layer (lib/peec/client.ts):
- Added promptBrandsPriorRes to Promise.all (second prompt-level fetch
  bounded to prior period).
- Built priorPositionByUuid scoped to your brand.
- Extended TrackedPrompt with priorPosition: number | null.
- Attached priorPosition in trackedPrompts.map().
- Mirror change on Profound TrackedPrompt type for cross-provider parity.

Compute + UI:
- NEW lib/peec/winners-losers.ts — pure computeWinnersLosers(prompts).
  11 unit tests covering empty, no-prior, improvement, decline, zero
  change, current-zero, prior-zero, sort order, cap, custom limit,
  fractional rounding.
- winners-losers-cards.tsx rewritten — props-driven, sandbox gate lifted,
  empty state per card.
- peec-ai/index.tsx ProviderSection computes winners/losers via the new
  helper and passes to component. Profound variant passes empty arrays
  (Profound has no priorPosition yet — type parity only).

Sandbox lifted: every client sees their own real winners/losers.
Reacts to date picker. Model filter reactivity deferred (separate FB).

Supersedes FB-006 static arrays.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)" && git log -1 --format=%h
```

Backfill the SHA in changelog.md.

---

## Task 5 — Final verification, docs lockstep, push

- [ ] **Step 5.1: Run the full TypeScript check one more time**

Run:
```
npx tsc --noEmit
```
Expected: zero output.

- [ ] **Step 5.2: Run all tests**

Run:
```
npx vitest run
```
Expected: every existing test still passes, plus the 11 new winners-losers tests.

- [ ] **Step 5.3: Re-grep for any orphaned references**

Run:
```
grep -rn "trackingStart\|TrackedPromptsChart\|SANDBOX_CLIENT_SLUG.*winners\|Tracking began" components/ app/ lib/ 2>/dev/null | grep -v node_modules
```

Expected output: only the existing `SANDBOX_CLIENT_SLUG` in `sentiment-insights.tsx` (PR Influence — unrelated to this work). NO hits for `trackingStart`, `TrackedPromptsChart`, or `Tracking began`.

- [ ] **Step 5.4: Update `docs/official-feedback/status.md`**

Find the "Active branch" section. Replace with:
```markdown
## Active branch

- **Branch:** `official-feedback-overview-v2`
- **HEAD:** see `git log -1 --format=%h`
- **Base:** `main` (currently `a2d39b3`)
- **Status:** Overview v2 iteration shipped (FB-020 → FB-023). Closes every ⚠️ row in Tina's Overview-tab v1 scorecard CSV. Awaiting Tina v2 review.
- **Items shipped:**
  - **FB-020** — Drop SectionHeader subtitle on Overview (CSV E2).
  - **FB-021** — Remove "Which prompts are AI engines answering with our brand?" chart from both Peec + Profound (CSV E12, Rule #11).
  - **FB-022** — Visibility chart truly YTD on both providers; drop misleading "Tracking began" line (CSV E7).
  - **FB-023** — Winners/Losers cards: live per-period compute; sandbox gate lifted; empty state added (CSV E11).
- **Open follow-ups for after Tina v2 acceptance:**
  - Model-filter reactivity on Winners/Losers (requires model-dimensioned prompt fetch).
  - Profound parity on Winners/Losers (requires prior-period prompt fetch on Profound).
- **Content Impact branch:** parked at `official-feedback-content-impact-tab` (docs-only diff). Resume when Tina sends Content Impact feedback.
- **Next FB ID:** **FB-024**.
```

- [ ] **Step 5.5: Commit the docs update**

```
git add docs/official-feedback/status.md && \
git commit -m "docs(feedback): mark Overview v2 batch shipped (FB-020 through FB-023)"
```

- [ ] **Step 5.6: Push to origin**

```
git push -u origin official-feedback-overview-v2
```

- [ ] **Step 5.7: Open the PR**

Run:
```
gh pr create --title "Overview v2: Tina CSV feedback (FB-020 through FB-023)" --body "$(cat <<'EOF'
## Summary

Closes every ⚠️ row in Tina's Overview-tab v1 scorecard CSV.

- **FB-020** (CSV E2) — Drop SectionHeader subtitle on Overview.
- **FB-021** (CSV E12, Rule #11) — Remove "Which prompts are AI engines answering with our brand?" chart from both Peec + Profound provider variants. Component files deleted.
- **FB-022** (CSV E7) — Visibility chart now truly YTD on both providers. Separate YTD fetch in `lib/peec/client.ts` + `lib/profound/client.ts`. Misleading "Tracking began" line removed. Tooltip updated. Cache versions bumped (peec v7→v8, profound v4→v5).
- **FB-023** (CSV E11) — Winners/Losers cards: static const arrays replaced with live per-period compute. Sandbox gate lifted — every client sees their own real winners/losers. Empty state for thin-history clients. 11 unit tests for the pure compute.

## Test plan

- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — all pass (incl. 11 new winners-losers tests)
- [ ] Manual: Avenue Z Overview page renders without subtitle, without tracked-prompts chart, with truly-YTD visibility chart, with live Winners/Losers
- [ ] Manual: change date picker — visibility chart unchanged (YTD); KPIs + Winners/Losers + LLM table change
- [ ] Manual: non-Avenue-Z client (e.g. Renaissance) — Winners/Losers render with real data or empty state

## Known follow-ups (not blocking this PR)

- Model-filter reactivity on Winners/Losers (deferred — requires model-dimensioned prompt fetch).
- Profound parity on Winners/Losers (deferred — Profound has no prior-period prompt fetch yet).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5.8: Verify lockstep with origin**

```
git status --short && \
echo "local  $(git rev-parse HEAD)" && \
echo "remote $(git rev-parse @{u})"
```
Expected: working tree clean, local SHA = remote SHA.

---

## Self-review (run after writing the plan above; not a separate task)

### Spec coverage

- ✅ **E2** → FB-020 (Task 1)
- ✅ **E7** → FB-022 (Task 3)
- ✅ **E11** → FB-023 (Task 4)
- ✅ **E12** → FB-021 (Task 2)
- ✅ Rule #11 applied (FB-021 removes chart not in Tina's recommended layout)
- ✅ Working assumptions clearly flagged (1A drop "Tracking began" line, 2A lift sandbox gate)
- ✅ Profound parity called out where it differs (FB-022: parity shipped; FB-023: parity deferred with reason)

### Placeholder scan

- No `TBD` / `TODO` / "fill in details" tags.
- Every code step shows the actual code.
- Every shell command is concrete and runnable.
- Commit SHAs are deliberately `<commit-sha-pending>` placeholders in changelog.md, with explicit backfill steps after each commit. This is intentional, not a placeholder bug.

### Type consistency

- `PromptDelta` type defined in `lib/peec/winners-losers.ts`, imported by `winners-losers-cards.tsx` and `peec-ai/index.tsx` via the same path.
- `TrackedPrompt` extended with `priorPosition: number | null` in `lib/peec/client.ts`; mirrored on `lib/profound/client.ts` for cross-provider type compatibility.
- `computeWinnersLosers` signature `(prompts: TrackedPrompt[], opts?: { limit?: number }) => { winners: PromptDelta[]; losers: PromptDelta[] }` is consistent across test + impl + caller.
- `WinnersLosersCards` props consistent: `{ clientSlug?: string; winners: PromptDelta[]; losers: PromptDelta[] }`.

### Risk surface

- The biggest risk is FB-022 (data-layer change touching both Peec + Profound). Mitigated by: separate fetch (doesn't disturb existing data flows), only routes the chart's data to YTD (weeklyVisibility stays picker-bound for demand-overview), cache version bump (no stale data carry-over).
- FB-023 risk is the new fetch; mitigated by: deferred Profound parity, empty state, sandbox-lift is universal-by-default (Rule #9), 11 unit tests cover compute edge cases.

---

## Plan B variants (only execute if Thomas overrides working assumptions)

### Plan B1 — Decision 1B: hardcode per-client first-tracked date in DB

If Thomas chooses 1B instead of 1A:

1. Add a `firstTrackedAt: timestamp` column to the `clients` table in `lib/db/schema.ts`.
2. Generate + apply a Drizzle migration (`drizzle/<NNNN>_add_first_tracked_at.sql`).
3. Manually populate `firstTrackedAt` for each client via Drizzle Studio or Neon SQL editor (use the workspace's actual first-tracked date — for Avenue Z that's 2026-03-28 per Tina's note... wait, Tina said March 28, 2025 which is in the past relative to 2026-06-23 — confirm with Thomas).
4. Pass `firstTrackedAt` through the data layer (e.g., add to `getClientBySlug` return + thread to the chart via props).
5. Display `Tracking began {format(firstTrackedAt)}` in `visibility-chart.tsx` — keep the line, replace the wrong calc.

Estimated effort: +1 day. The single-line removal of Plan A becomes a multi-file refactor.

### Plan B2 — Decision 2B: keep Winners/Losers sandbox gate while wiring live data

If Thomas chooses 2B instead of 2A:

In `winners-losers-cards.tsx`, retain the gate at the top of the component:
```tsx
const SANDBOX_CLIENT_SLUG = 'avenue-z'

export function WinnersLosersCards({ clientSlug, winners, losers }: { ... }) {
  if (clientSlug !== SANDBOX_CLIENT_SLUG) return null
  // ... rest of the render unchanged
}
```

Then later (after Tina v2 acceptance), open a follow-up FB to lift the gate.

Estimated extra effort: zero. Just one block kept.
