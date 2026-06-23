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

## Literal interpretation policy (Thomas confirmed 2026-06-23)

> *"there should be absolutely NO open ended questions. what's on the feedback is what is needed to be done."*

Every change in this plan matches Tina's literal CSV text. No reinterpretation, no deferred sub-asks, no "future enhancements" for things she explicitly named.

### FB-022 — "Tracking began" line: DISPLAY THE CORRECT DATE

Tina's literal text on row 7: *"'Tracking began May 18' is incorrect, this workspace has been tracking data since March 28, 2025."*

She gave us the correct date. She did NOT ask us to remove the line. The literal fix is to show her date.

**Implementation:** add a `firstTrackedAt: timestamp | null` column to the `clients` table. Populate per-client (Avenue Z = `2025-03-28`). The chart header displays `Tracking began {formatted date}` from the DB value. If a client has `firstTrackedAt = null`, the line gracefully omits (no broken display, no fake date).

### FB-023 — React to date range AND model filter

Tina's literal text on row 11: *"It doesn't change when a new date range or model is selected"*

She named both. The literal fix reacts to both.

**Implementation:** add `'model_channel_id', 'model_id'` dimensions to BOTH `promptBrandsRes` (current) AND `promptBrandsPriorRes` (prior) fetches in `lib/peec/client.ts`. Build per-prompt-per-model maps for both periods. In the Overview RSC, filter to the active `models` selection before passing to `computeWinnersLosers`. Cards react to date range AND model — full literal match.

### FB-023 — Sandbox gate: LIFT

Tina's complaint is that cards are static and don't react. If we keep the Avenue-Z-only gate after wiring live data, non-Avenue-Z clients see NOTHING (since the static arrays are being removed and the gate would still hide the live cards). That contradicts "should be pulling actual data" for any client. The literal fix is universal live data.

**Empty state shipped:** if a client (Avenue Z or otherwise) has no prompts with comparable prior-period rank for the current period+model selection, the cards render *"Not enough prompt-rank history yet for this period or model selection. Try a wider date range or all-models."*

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `components/report-sections/peec-ai/section-header.tsx` | **Modify** | Make `subtitle` optional. Conditionally render the `<p>`. |
| `components/report-sections/peec-ai/index.tsx` | **Modify** | Remove subtitle prop on Overview header. Remove TrackedPromptsChart JSX + 2 imports. Pass `winners` + `losers` to `<WinnersLosersCards>`. Compute winners/losers from `data.trackedPrompts`. |
| `components/report-sections/peec-ai/tracked-prompts-chart.tsx` | **Delete** | The chart Tina is removing. |
| `components/report-sections/profound-ai/tracked-prompts-chart.tsx` | **Delete** | Profound parity for the chart removal. |
| `components/report-sections/profound-ai/index.tsx` | **Modify** | Remove TrackedPromptsChart import + JSX render block. |
| `components/report-sections/peec-ai/visibility-chart.tsx` | **Modify** | Replace `trackingStart` calc (which derived from passed-in data) with `firstTrackedAt` prop. Display `Tracking began {formatted date}` from prop, or omit line if null. Update tooltip text to be accurate. |
| `lib/db/schema.ts` | **Modify** | Add `firstTrackedAt: timestamp` column to `clients` table. |
| `drizzle/<auto-generated>.sql` | **Create** | Drizzle migration for `firstTrackedAt`. |
| `scripts/seed-first-tracked.ts` | **Create** | One-time script to populate `firstTrackedAt` for known clients (Avenue Z = `2025-03-28`). Other clients left null until investigated. |
| `lib/peec/client.ts` | **Modify** | Add YTD trend fetch + route `dailyVisibility`/`competitorDailyVisibility` to YTD source. Add prior-period prompt-level fetch with `model_channel_id` + `model_id` dimensions for model-filter reactivity. Update current-period prompt fetch with same dimensions. Build per-model maps for both periods. Add `priorPositionByModel` field on `TrackedPrompt`. Bump cache version. |
| `lib/profound/client.ts` | **Modify** | Add YTD trend fetch + route `dailyVisibility`/`competitorDailyVisibility` to YTD source. Bump cache version. Add `priorPositionByModel: null` for type parity. |
| `components/report-sections/peec-ai/winners-losers-cards.tsx` | **Modify** | Remove static const arrays. Accept `winners` + `losers` props. Lift sandbox gate. Add empty state copy that mentions both date and model. |
| `lib/peec/winners-losers.ts` | **Create** | Pure functions: `applyModelFilter(prompts, models)` to fold per-model maps into a flat `priorPosition`/`position` per prompt, then `computeWinnersLosers(prompts)` to split + sort. Unit-tested. |
| `lib/peec/winners-losers.test.ts` | **Create** | Unit tests for both functions. |
| `components/report-sections/peec-ai/index.tsx` | **Modify** | Pass `firstTrackedAt` from DB client config to `<VisibilityChart>`. Compute winners/losers using `applyModelFilter` + `computeWinnersLosers` with the active model filter. Pass to `<WinnersLosersCards>`. |
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

- [ ] **Step 0.2: Confirm literal-interpretation policy is understood**

Re-read the "Literal interpretation policy" section above. No Plan A vs Plan B trade-offs in this plan. Every change matches Tina's literal CSV text. Specifically: FB-022 SHOWS the correct date (does not drop the line), FB-023 reacts to date AND model (model-filter is not deferred), sandbox gate lifts so cards work for every client.

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

## Task 3 — FB-022: Visibility chart truly YTD + show correct "Tracking began" date (item-b, E7)

Two issues fixed together:
1. **Data layer bug:** `dailyVisibility` is fetched with the date-range-bound `current` body. Chart tooltip lies ("fixed to year-to-date"). Fix: add a YTD fetch and route only the chart's data to it.
2. **Display bug:** "Tracking began May 18" string is misleading — it shows the first weekly bucket of the picker's range, NOT the workspace's actual first-tracked date. Tina's literal fix: show the correct date. We source that date from a new `firstTrackedAt` column on the `clients` table. For Avenue Z = `2025-03-28`. Clients without a populated value gracefully omit the line.

Same shape on Profound side for the YTD fetch.

**Files:**
- Modify: `lib/db/schema.ts` (add `firstTrackedAt` column).
- Create: `drizzle/<NNNN>_add_first_tracked_at.sql` (auto-generated migration).
- Modify: `lib/peec/client.ts:371-397, 552-562, 670-689, 691-714` (date-range + YTD fetch + trend + return + cache version).
- Modify: `lib/profound/client.ts:390-430, 438-441, 537-553, 556-569` (YTD fetch parity).
- Modify: `components/report-sections/peec-ai/index.tsx` (thread `firstTrackedAt` from `getClientBySlug` through `ProviderSection` to `<VisibilityChart>`).
- Modify: `components/report-sections/peec-ai/visibility-chart.tsx:34-58` (accept `firstTrackedAt` prop, format + display in chart header, update tooltip).

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

### Subtask 3C — Add `firstTrackedAt` to DB + display correct date in chart header

Tina's literal text on E7: *"this workspace has been tracking data since March 28, 2025."* — she gave us the correct date. The literal fix is to show it. We do this by sourcing the date from a DB column rather than deriving from the chart's data buffer.

- [ ] **Step 3C.1: Add `firstTrackedAt` column to `clients` table schema**

Edit `lib/db/schema.ts`. Find the `clients` table definition. Add this column (placement: alongside the other identifier columns like `domain`, `ga4PropertyId`, etc.):

```tsx
  firstTrackedAt: timestamp('first_tracked_at', { mode: 'date' }),
```

The column is nullable (`null` = unknown for a client). The TS type derives automatically via Drizzle's `Client` inferred type.

- [ ] **Step 3C.2: Generate the Drizzle migration**

Run:
```
npx drizzle-kit generate
```
Expected: a new `drizzle/<NNNN>_<auto-generated-name>.sql` file containing `ALTER TABLE clients ADD COLUMN first_tracked_at timestamp;`. Verify the SQL is exactly that single ALTER (no other unintended changes).

- [ ] **Step 3C.3: Apply the migration**

Run:
```
npx drizzle-kit migrate
```
Expected: migration applies cleanly to Neon. If you have a separate staging/prod migration workflow, follow that — this step assumes local dev migration is the same path.

- [ ] **Step 3C.4: Populate `firstTrackedAt` for Avenue Z (Tina's known correct date)**

Two options. Pick whichever fits your tooling:

**Option A — Drizzle Studio (GUI):**
```
npx drizzle-kit studio
```
Open the `clients` table. Find the Avenue Z row. Set `firstTrackedAt = 2025-03-28T00:00:00.000Z`. Save.

**Option B — Neon SQL editor (or psql):**
```sql
UPDATE clients SET first_tracked_at = '2025-03-28T00:00:00Z' WHERE slug = 'avenue-z';
```

Other clients (Renaissance, iPullRank, Shopify, etc.) are left `NULL` for now. The chart will gracefully omit the "Tracking began" line for them rather than show a wrong date.

- [ ] **Step 3C.5: Thread `firstTrackedAt` through to `<VisibilityChart>`**

Edit `components/report-sections/peec-ai/index.tsx`. The Overview RSC `PeecAIReport` already fetches `config = await getClientBySlug(clientSlug)` at line 289. Pass `config?.firstTrackedAt ?? null` down through `ProviderSection` to `<VisibilityChart>`.

Step 3C.5.a — Add to `ProviderSection` props (around lines 144-160):

Find:
```tsx
function ProviderSection({
  data,
  provider,
  isDemo,
  models = null,
  aiTraffic,
  clientSlug,
  dateRange,
}: {
  data: Overview
  provider: AeoProvider
  isDemo: boolean
  models?: AEOModel[] | null
  aiTraffic: AIReferralKPI
  clientSlug?: string
  dateRange?: string
}) {
```

Replace with:
```tsx
function ProviderSection({
  data,
  provider,
  isDemo,
  models = null,
  aiTraffic,
  clientSlug,
  dateRange,
  firstTrackedAt,
}: {
  data: Overview
  provider: AeoProvider
  isDemo: boolean
  models?: AEOModel[] | null
  aiTraffic: AIReferralKPI
  clientSlug?: string
  dateRange?: string
  firstTrackedAt: Date | null
}) {
```

Step 3C.5.b — Pass it down at the `<VisibilityChart>` call (around line 248-254):

Find:
```tsx
      {data.dailyVisibility.length > 0 && (
        <VisibilityChart
          data={data.dailyVisibility}
          competitorData={data.competitorDailyVisibility}
          brandName={brandName}
        />
      )}
```

Replace with:
```tsx
      {data.dailyVisibility.length > 0 && (
        <VisibilityChart
          data={data.dailyVisibility}
          competitorData={data.competitorDailyVisibility}
          brandName={brandName}
          firstTrackedAt={firstTrackedAt}
        />
      )}
```

Step 3C.5.c — Pass it from `PeecAIReport` at the `<ProviderSection>` calls (around lines 349-350):

Find:
```tsx
  if (peecData)     sections.peec     = <ProviderSection data={peecData}     provider="peec"     isDemo={demoMode} models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} />
  if (profoundData) sections.profound = <ProviderSection data={profoundData} provider="profound" isDemo={demoMode} models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} />
```

Replace with:
```tsx
  const firstTrackedAt = config?.firstTrackedAt ?? null
  if (peecData)     sections.peec     = <ProviderSection data={peecData}     provider="peec"     isDemo={demoMode} models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} firstTrackedAt={firstTrackedAt} />
  if (profoundData) sections.profound = <ProviderSection data={profoundData} provider="profound" isDemo={demoMode} models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} firstTrackedAt={firstTrackedAt} />
```

- [ ] **Step 3C.6: Update `<VisibilityChart>` to display correct date from prop**

Edit `components/report-sections/peec-ai/visibility-chart.tsx`.

Find (around line 17-25):
```tsx
export function VisibilityChart({
  data,
  competitorData,
  brandName,
}: {
  data: DailyPoint[]
  competitorData: DailyPoint[]
  brandName?: string
}) {
```

Replace with:
```tsx
export function VisibilityChart({
  data,
  competitorData,
  brandName,
  firstTrackedAt,
}: {
  data: DailyPoint[]
  competitorData: DailyPoint[]
  brandName?: string
  firstTrackedAt?: Date | null
}) {
```

Find (around line 37) — the OLD trackingStart calc:
```tsx
  const trackingStart = data.length > 0 ? bucketDaily(data, 'weekly')[0]?.label : undefined
```

Replace with:
```tsx
  // FB-022: Tracking-start date sourced from clients.firstTrackedAt (DB column),
  // not derived from the chart's data buffer (which was a misleading artifact of
  // the picker-bound fetch — see FB-022 decision log).
  const trackingStart = firstTrackedAt
    ? firstTrackedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : undefined
```

The display line at line 58 keeps the same conditional render (`{trackingStart && <p>...</p>}`) — only the source of `trackingStart` changed.

- [ ] **Step 3C.7: Update the chart-header tooltip to be accurate**

Find (around line 55):
```tsx
            <InfoTooltip text="Percentage of AI responses where your brand appears. This chart is fixed to year-to-date and does not respond to the page date picker." />
```

Replace with:
```tsx
            <InfoTooltip text="Percentage of AI responses where your brand appears. Year-to-date — this chart shows the full year regardless of the page date picker." />
```

(Removes the past-tense "fixed to" which described intent; replaces with "Year-to-date" which describes truth. "does not respond to the page date picker" stays — correctly tells the user the chart is intentionally separate.)

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

## FB-022 — Visibility chart truly YTD + show correct "Tracking began" date

**Source:** Tina's Overview-tab v1 scorecard CSV, cell E7.
**Verbatim ask:** *"ISSUE: 'Tracking began May 18' – this is incorrect, this workspace has been tracking data since March 28, 2025. I think that this YTD chart is changing based on the date range selector. Please make static to always show YTD."*

**Two-part issue:**
1. **Data-layer bug:** `dailyVisibility` was fetched with the date-range-bound `current` body in both `lib/peec/client.ts` (line 397) and `lib/profound/client.ts` (line 423 dimensions=['date',...]). The chart's tooltip claimed YTD but the data tracked the picker. Tina caught it.
2. **Display bug:** "Tracking began May 18" was rendered from `bucketDaily(data, 'weekly')[0]?.label` — i.e., the first weekly bucket of whatever data was passed in. When the picker was "Last 30 days" and today was a Tuesday, the first weekly bucket fell on a recent Monday (e.g. May 18). It wasn't a workspace inception date; it was a misleading artifact of the picker-bound fetch.

**Literal fix per Tina's text:** she gave us the correct date (March 28, 2025) and said the displayed date is incorrect. We honor that literally by sourcing the date from a new `clients.firstTrackedAt` column populated per-client. The leftmost X-axis bucket label of the now-truly-YTD chart will not show the workspace's actual inception when it predates the current year (e.g. Avenue Z started in 2025, the YTD chart shows 2026 onward) — only the DB-sourced date can reflect Tina's correct value.

**Files touched:**
- `lib/db/schema.ts`: added `firstTrackedAt: timestamp` column (nullable) to `clients` table.
- `drizzle/<auto-generated>.sql`: additive ALTER TABLE migration.
- Manual data entry: Avenue Z `clients.first_tracked_at` set to `2025-03-28T00:00:00Z` via Drizzle Studio / Neon SQL.
- `lib/peec/client.ts`: added YTD window compute, parallel `trendRowsYTD` fetch, routed `dailyVisibility`/`competitorDailyVisibility` to YTD, bumped cache version v7→v8.
- `lib/profound/client.ts`: added YTD window compute, added `weeklyYTDRes` fetch in the Promise.all, routed `dailyVisibility`/`competitorDailyVisibility` to YTD, bumped cache version v4→v5.
- `components/report-sections/peec-ai/index.tsx`: threaded `firstTrackedAt` from `getClientBySlug` through `ProviderSection` to `<VisibilityChart>`.
- `components/report-sections/peec-ai/visibility-chart.tsx`: replaced the `trackingStart` calc (which derived from the chart's data buffer) with a `firstTrackedAt: Date | null` prop; formats + displays as "Tracking began {full date}" when provided, omits the line when `null`; updated header tooltip from "fixed to year-to-date" to "Year-to-date — this chart shows the full year regardless of the page date picker."

**Scope of impact:** Overview tab visibility chart on both Peec + Profound provider variants. `weeklyVisibility` (consumed by `components/report-sections/demand-overview/index.tsx:195`) is intentionally LEFT as picker-range bound — different feature, different consumer, not touched.

**Performance note:** Two additional API calls per Overview page load (one to Peec, one to Profound for clients with both configured). YTD ranges are wider than picker ranges, so payload is larger. The `cached()` wrapper caches per `(clientSlug, dateRange)` for 1 hour, so within an hour the YTD result is reused.

**Verification:**
- `npx tsc --noEmit` clean.
- `grep trackingStart` shows only the new firstTrackedAt-sourced declaration in visibility-chart.tsx.
- Manual dev-server smoke (Avenue Z): chart shows "Tracking began March 28, 2025"; chart x-axis shows YTD; date picker doesn't move the chart; other KPIs/tables react to picker as before.
- Manual dev-server smoke (non-Avenue-Z client without firstTrackedAt populated): "Tracking began" line gracefully omits; chart still renders YTD.

**Open risks:**
- Non-Avenue-Z clients won't have `firstTrackedAt` populated until someone fills the DB. Their chart silently omits the date line. Acceptable for v2 — Tina is reviewing Avenue Z. Backfilling other clients is operational work, not blocking the v2 review.

**Decision lineage:** Closes E7 from Tina v1 CSV; supersedes the originally-FB-020-b plan handle.
```

- [ ] **Step 3E.3: Append FB-022 to changelog.md**

```
FB-022 | 2026-06-23 | <commit-sha-pending> | b | Visibility trend chart now truly YTD. Added separate YTD fetch in lib/peec/client.ts (trendRowsYTD via fetchAllRows w/ ytd window) + lib/profound/client.ts (weeklyYTDRes via /v1/reports/visibility w/ ytd window). dailyVisibility/competitorDailyVisibility sourced from YTD; weeklyVisibility (demand-overview consumer) stays picker-range bound. Cache versions bumped (peec v7→v8, profound v4→v5). Added clients.firstTrackedAt column + Drizzle migration + Avenue Z backfill (2025-03-28). visibility-chart.tsx now sources tracking-start date from DB via prop; "Tracking began" line displays the correct date for clients with firstTrackedAt populated, gracefully omits for others. Tooltip updated from "fixed to year-to-date" to "Year-to-date — this chart shows the full year regardless of the page date picker." Tina v1 CSV E7.
```

- [ ] **Step 3E.4: Commit FB-022**

```
git add lib/db/schema.ts drizzle/ \
        lib/peec/client.ts lib/profound/client.ts \
        components/report-sections/peec-ai/visibility-chart.tsx \
        components/report-sections/peec-ai/index.tsx \
        docs/official-feedback/feedback-log.md \
        docs/official-feedback/changelog.md \
        docs/official-feedback/tina-scorecard.csv && \
git commit -m "$(cat <<'EOF'
fix(overview): FB-022 — visibility chart truly YTD, correct "Tracking began" date (CSV E7)

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

2. Display. Tina gave us the correct date (March 28, 2025) — show it.
   Added clients.firstTrackedAt column + Drizzle migration; backfilled
   Avenue Z to 2025-03-28. Threaded the value from getClientBySlug
   through ProviderSection to <VisibilityChart>. Chart now sources the
   "Tracking began" date from the DB column (was deriving from the
   chart's data buffer — a misleading artifact of the picker bug).
   Clients without firstTrackedAt populated gracefully omit the line.

Cache versions bumped (peec v7→v8, profound v4→v5) — old cached
entries had dailyVisibility hard-bound to the picker.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)" && git log -1 --format=%h
```

Backfill the SHA in changelog.md.

---

## Task 4 — FB-023: Winners/Losers live data, date AND model reactive (item-d, E11)

The biggest task. Static const arrays → live per-client per-period per-model-filter computation. **Sandbox gate lifts** so every client sees real Winners/Losers from their own Peec data. Empty state for thin-history clients. **Reacts to BOTH date range AND model filter per Tina's literal text.**

**Files:**
- Modify: `lib/peec/client.ts` — add prior-period prompt fetch with `model_channel_id`+`model_id` dimensions. Update current-period prompt fetch with same dimensions. Build per-prompt-per-model maps for both periods. Attach `positionByModel` + `priorPositionByModel` (both `Partial<Record<AEOModel, number>>`) to `TrackedPrompt`.
- Create: `lib/peec/winners-losers.ts` — TWO pure functions: `applyModelFilter(prompts, models)` collapses per-model maps into flat `position`/`priorPosition`, then `computeWinnersLosers(prompts)` splits + sorts.
- Create: `lib/peec/winners-losers.test.ts` — unit tests for BOTH functions.
- Modify: `components/report-sections/peec-ai/winners-losers-cards.tsx` — accept `winners`/`losers` props, lift gate, empty state mentions both date and model.
- Modify: `components/report-sections/peec-ai/index.tsx` — compute `applyModelFilter` then `computeWinnersLosers` in `ProviderSection` using active `models`, pass to component.

### Subtask 4A — Extend `TrackedPrompt` with per-model position maps (current + prior)

- [ ] **Step 4A.1: Extend `TrackedPrompt` type with per-model position maps**

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
  /** FB-023: per-model average rank position in the SELECTED period.
   *  Empty when this prompt was not surfaced by any tracked model in the
   *  current period. Used to apply the active model filter on the
   *  Winners/Losers compute before sorting. */
  positionByModel: Partial<Record<AEOModel, number>>
  /** FB-023: per-model average rank position in the IMMEDIATELY-PRECEDING
   *  period of equal length. Empty when this prompt was not tracked at
   *  all in the prior period. Used for delta vs prior period in
   *  Biggest Winners / Biggest Losers. */
  priorPositionByModel: Partial<Record<AEOModel, number>>
  group: string
  topicSource: TopicSource
}
```

- [ ] **Step 4A.2: Add model dimensions to current prompt fetch + add prior prompt fetch with same dimensions**

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

Replace with (adds `model_channel_id` + `model_id` dimensions to `promptBrandsRes`, AND adds `promptBrandsPriorRes` with the same model-dimensioned shape):
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
    // FB-023: prompt-level rows now ALSO dimensioned by model so the Winners/Losers
    // compute can filter by the active model selection. Limit bumped from 2000 to
    // 5000 because rows are now (prompt × model). Adjust upward if Peec returns
    // truncated pages for clients with high prompt counts.
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['prompt_id', 'model_channel_id', 'model_id'], limit: 5000 }, pid),
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
    // FB-023: prior-period prompt-level rows, same model-dimensioned shape as the
    // current-period fetch above. Used for the rank delta in Winners/Losers, with
    // model-filter reactivity per Tina's literal text on CSV E11.
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior, dimensions: ['prompt_id', 'model_channel_id', 'model_id'], limit: 5000 }, pid),
  ])
```

- [ ] **Step 4A.3: Build per-prompt-per-model position maps (current + prior)**

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

Replace with (now aggregates per-prompt-per-model since rows are dimensioned by both):

```tsx
  // FB-023: Build per-prompt-per-model position maps for the CURRENT period.
  // promptBrandsRes is now dimensioned by ['prompt_id', 'model_channel_id', 'model_id'],
  // so each row is one (prompt × model) cell. We aggregate metric averages within
  // each cell, then later (a) aggregate across all models for promptMetricsById
  // for non-Winners/Losers consumers, (b) keep the per-model map for the
  // model-filter-aware Winners/Losers compute.
  type PromptMetric = { visibility: number; sov: number; position: number }
  type PromptModelAgg = { visCount: number; visTotal: number; sovSum: number; sovRows: number; posSum: number; posCount: number }
  const promptModelAggs = new Map<string, Map<AEOModel, PromptModelAgg>>()
  for (const row of promptBrandsRes.data ?? []) {
    if (yourBrand && !row.brand.name.toLowerCase().includes(yourBrand.toLowerCase())) continue
    const uuid = row.prompt?.id != null ? String(row.prompt.id) : null
    if (!uuid) continue
    const rawModelId = row.model?.id ?? row.model_channel?.id ?? ''
    const model = normalizeSource(rawModelId) as AEOModel | null
    if (!model) continue
    if (!promptModelAggs.has(uuid)) promptModelAggs.set(uuid, new Map())
    const byModel = promptModelAggs.get(uuid)!
    const existing = byModel.get(model)
    if (existing) {
      existing.visCount += row.visibility_count
      existing.visTotal += row.visibility_total
      existing.sovSum   += row.share_of_voice
      existing.sovRows  += 1
      existing.posSum   += row.position_sum
      existing.posCount += row.position_count
    } else {
      byModel.set(model, {
        visCount: row.visibility_count, visTotal: row.visibility_total,
        sovSum:   row.share_of_voice,   sovRows:  1,
        posSum:   row.position_sum,     posCount: row.position_count,
      })
    }
  }

  // Flatten per-prompt across all models for the legacy promptMetricsById consumer
  // (used elsewhere on the page — visibility, sov, position aggregates).
  const promptMetricsById = new Map<string, PromptMetric>()
  // And build the per-model position map for Winners/Losers.
  const positionByUuidByModel = new Map<string, Partial<Record<AEOModel, number>>>()
  for (const [uuid, byModel] of promptModelAggs.entries()) {
    let visCount = 0, visTotal = 0, sovSum = 0, sovRows = 0, posSum = 0, posCount = 0
    const modelMap: Partial<Record<AEOModel, number>> = {}
    for (const [model, a] of byModel.entries()) {
      visCount += a.visCount; visTotal += a.visTotal
      sovSum   += a.sovSum;   sovRows  += a.sovRows
      posSum   += a.posSum;   posCount += a.posCount
      if (a.posCount > 0) modelMap[model] = a.posSum / a.posCount
    }
    promptMetricsById.set(uuid, {
      visibility: visTotal > 0 ? (visCount / visTotal) * 100 : 0,
      sov:        sovRows > 0 ? (sovSum / sovRows) * 100 : 0,
      position:   posCount > 0 ? posSum / posCount : 0,
    })
    positionByUuidByModel.set(uuid, modelMap)
  }

  // FB-023: same per-prompt-per-model aggregation for the PRIOR period.
  // Only the position-by-model map is needed downstream — used by
  // Winners/Losers to compute the rank delta with model-filter reactivity.
  const priorPositionByUuidByModel = new Map<string, Partial<Record<AEOModel, number>>>()
  {
    const priorAggs = new Map<string, Map<AEOModel, { posSum: number; posCount: number }>>()
    for (const row of promptBrandsPriorRes.data ?? []) {
      if (yourBrand && !row.brand.name.toLowerCase().includes(yourBrand.toLowerCase())) continue
      const uuid = row.prompt?.id != null ? String(row.prompt.id) : null
      if (!uuid) continue
      const rawModelId = row.model?.id ?? row.model_channel?.id ?? ''
      const model = normalizeSource(rawModelId) as AEOModel | null
      if (!model) continue
      if (!priorAggs.has(uuid)) priorAggs.set(uuid, new Map())
      const byModel = priorAggs.get(uuid)!
      const existing = byModel.get(model)
      if (existing) {
        existing.posSum   += row.position_sum
        existing.posCount += row.position_count
      } else {
        byModel.set(model, { posSum: row.position_sum, posCount: row.position_count })
      }
    }
    for (const [uuid, byModel] of priorAggs.entries()) {
      const modelMap: Partial<Record<AEOModel, number>> = {}
      for (const [model, a] of byModel.entries()) {
        if (a.posCount > 0) modelMap[model] = a.posSum / a.posCount
      }
      priorPositionByUuidByModel.set(uuid, modelMap)
    }
  }
```

- [ ] **Step 4A.4: Attach `positionByModel` + `priorPositionByModel` to each `TrackedPrompt`**

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
    return {
      text,
      sources: Array.from(sourcesByUuid.get(uuid) ?? []),
      visibility: m?.visibility ?? 0,
      sov: m?.sov ?? 0,
      position: m?.position ?? 0,
      positionByModel:      positionByUuidByModel.get(uuid)      ?? {},
      priorPositionByModel: priorPositionByUuidByModel.get(uuid) ?? {},
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
   *  Profound does not currently fetch model-dimensioned prompt rows — always
   *  empty objects. The Winners/Losers compute uses these maps; with empty
   *  maps for both periods, the compute yields empty arrays, so Profound
   *  variant of Overview shows the empty-state cards. */
  positionByModel: Partial<Record<AEOModel, number>>
  priorPositionByModel: Partial<Record<AEOModel, number>>
  group: string
  topicSource: TopicSource
}
```

You'll also need to import `AEOModel` at the top of `lib/profound/client.ts`:
```tsx
import type { AEOModel } from '@/lib/peec/models'
```

- [ ] **Step 4A.6: Default empty per-model maps on every Profound `trackedPrompts` builder**

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
      text:                 r.dimensions[0]!,
      sources:              [],
      visibility:           (r.metrics[0] ?? 0) * 100,
      sov:                  (r.metrics[1] ?? 0) * 100,
      position:             r.metrics[2] ?? 0,
      positionByModel:      {},
      priorPositionByModel: {},
      group:                promptTopic.get(r.dimensions[0]!) ?? categorizePrompt(r.dimensions[0]!),
      topicSource:          (promptTopic.has(r.dimensions[0]!) ? 'provider' : 'inferred') as TopicSource,
    }))
    .sort((a, b) => b.visibility - a.visibility)
```

The `emptyOverview()` return at lines 350-367 has `trackedPrompts: []` — empty array, no change needed.

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

### Subtask 4B — Pure compute functions `lib/peec/winners-losers.ts` (TDD)

Two functions, each tested independently:
- `applyModelFilter(prompts, models)` — collapses per-model `positionByModel` + `priorPositionByModel` into flat `position` + `priorPosition` per prompt, restricted to the selected models. When `models = null` (no filter), averages across all models for which the prompt has data.
- `computeWinnersLosers(filtered)` — takes the flat output, splits into winners (delta > 0) and losers (delta < 0), sorts by absolute delta descending, caps at 20 per side by default.

- [ ] **Step 4B.1: Write the failing tests first**

Create `lib/peec/winners-losers.test.ts`:

```tsx
import { describe, it, expect } from 'vitest'
import { applyModelFilter, computeWinnersLosers } from './winners-losers'
import type { TrackedPrompt } from './client'

const makePrompt = (over: Partial<TrackedPrompt>): TrackedPrompt => ({
  text: 'p',
  sources: [],
  visibility: 0,
  sov: 0,
  position: 0,
  positionByModel: {},
  priorPositionByModel: {},
  group: 'g',
  topicSource: 'inferred',
  ...over,
})

describe('applyModelFilter', () => {
  it('with models=null, averages position across all model entries (current period)', () => {
    const p = makePrompt({
      text: 'a',
      positionByModel:      { ChatGPT: 4, Perplexity: 8, Gemini: 6 },
      priorPositionByModel: { ChatGPT: 10, Perplexity: 12, Gemini: 14 },
    })
    const out = applyModelFilter([p], null)
    expect(out).toHaveLength(1)
    expect(out[0].position).toBe(6)        // (4+8+6)/3
    expect(out[0].priorPosition).toBe(12)  // (10+12+14)/3
  })

  it('with models=[ChatGPT], averages only ChatGPT entries', () => {
    const p = makePrompt({
      text: 'a',
      positionByModel:      { ChatGPT: 4, Perplexity: 20 },
      priorPositionByModel: { ChatGPT: 10, Perplexity: 30 },
    })
    const out = applyModelFilter([p], ['ChatGPT'])
    expect(out[0].position).toBe(4)
    expect(out[0].priorPosition).toBe(10)
  })

  it('with models=[ChatGPT, Gemini] averages across both', () => {
    const p = makePrompt({
      text: 'a',
      positionByModel:      { ChatGPT: 4, Perplexity: 20, Gemini: 6 },
      priorPositionByModel: { ChatGPT: 10, Perplexity: 30, Gemini: 12 },
    })
    const out = applyModelFilter([p], ['ChatGPT', 'Gemini'])
    expect(out[0].position).toBe(5)        // (4+6)/2
    expect(out[0].priorPosition).toBe(11)  // (10+12)/2
  })

  it('skips a prompt entirely when none of the selected models have data for it', () => {
    const p = makePrompt({
      text: 'a',
      positionByModel:      { Perplexity: 5 },
      priorPositionByModel: { Perplexity: 8 },
    })
    const out = applyModelFilter([p], ['ChatGPT'])
    expect(out).toEqual([])
  })

  it('outputs priorPosition=null when the prompt has no prior data for selected models', () => {
    const p = makePrompt({
      text: 'a',
      positionByModel:      { ChatGPT: 4 },
      priorPositionByModel: {},
    })
    const out = applyModelFilter([p], ['ChatGPT'])
    expect(out[0].position).toBe(4)
    expect(out[0].priorPosition).toBeNull()
  })

  it('outputs position=null when the prompt has no current data for selected models', () => {
    const p = makePrompt({
      text: 'a',
      positionByModel:      {},
      priorPositionByModel: { ChatGPT: 10 },
    })
    const out = applyModelFilter([p], ['ChatGPT'])
    // Skipped because no current-period data — can't compute a current rank to display.
    expect(out).toEqual([])
  })
})

describe('computeWinnersLosers', () => {
  it('returns empty arrays when input is empty', () => {
    const { winners, losers } = computeWinnersLosers([])
    expect(winners).toEqual([])
    expect(losers).toEqual([])
  })

  it('returns empty arrays when no prompts have priorPosition', () => {
    const { winners, losers } = computeWinnersLosers([
      { text: 'a', position: 5, priorPosition: null },
      { text: 'b', position: 10, priorPosition: null },
    ])
    expect(winners).toEqual([])
    expect(losers).toEqual([])
  })

  it('classifies a prompt that improved (lower position number) as a winner', () => {
    const { winners, losers } = computeWinnersLosers([
      { text: 'improved', position: 3, priorPosition: 10 },
    ])
    expect(winners).toHaveLength(1)
    expect(winners[0]).toEqual({ text: 'improved', rank: 3, delta: 7 })
    expect(losers).toEqual([])
  })

  it('classifies a prompt that declined (higher position number) as a loser', () => {
    const { winners, losers } = computeWinnersLosers([
      { text: 'declined', position: 15, priorPosition: 8 },
    ])
    expect(losers).toHaveLength(1)
    expect(losers[0]).toEqual({ text: 'declined', rank: 15, delta: -7 })
    expect(winners).toEqual([])
  })

  it('drops prompts with zero delta (no change)', () => {
    const { winners, losers } = computeWinnersLosers([
      { text: 'flat', position: 5, priorPosition: 5 },
    ])
    expect(winners).toEqual([])
    expect(losers).toEqual([])
  })

  it('sorts winners by largest delta first', () => {
    const { winners } = computeWinnersLosers([
      { text: 'small-win', position: 8, priorPosition: 10 },
      { text: 'big-win',   position: 2, priorPosition: 30 },
      { text: 'mid-win',   position: 5, priorPosition: 15 },
    ])
    expect(winners.map(w => w.text)).toEqual(['big-win', 'mid-win', 'small-win'])
  })

  it('sorts losers by most-negative delta first', () => {
    const { losers } = computeWinnersLosers([
      { text: 'small-loss', position: 12, priorPosition: 10 },
      { text: 'big-loss',   position: 40, priorPosition:  5 },
      { text: 'mid-loss',   position: 20, priorPosition:  8 },
    ])
    expect(losers.map(l => l.text)).toEqual(['big-loss', 'mid-loss', 'small-loss'])
  })

  it('caps winners and losers at 20 rows each by default', () => {
    const prompts = Array.from({ length: 30 }, (_, i) =>
      ({ text: `w${i}`, position: 1, priorPosition: 30 - i })
    )
    const { winners } = computeWinnersLosers(prompts)
    expect(winners).toHaveLength(20)
  })

  it('honors a custom limit', () => {
    const prompts = Array.from({ length: 30 }, (_, i) =>
      ({ text: `w${i}`, position: 1, priorPosition: 30 - i })
    )
    const { winners } = computeWinnersLosers(prompts, { limit: 5 })
    expect(winners).toHaveLength(5)
  })

  it('rounds position and delta to the nearest integer for display', () => {
    const { winners } = computeWinnersLosers([
      { text: 'frac', position: 3.7, priorPosition: 10.2 },
    ])
    expect(winners[0].rank).toBe(4)   // Math.round(3.7)
    expect(winners[0].delta).toBe(7)  // Math.round(10.2 - 3.7) = Math.round(6.5) = 7
  })
})
```

- [ ] **Step 4B.2: Run the failing tests**

Run:
```
npx vitest run lib/peec/winners-losers.test.ts
```
Expected: tests fail with module-not-found because `winners-losers.ts` doesn't exist yet.

- [ ] **Step 4B.3: Write the implementation**

Create `lib/peec/winners-losers.ts`:

```tsx
// lib/peec/winners-losers.ts
// FB-023: per Tina v2 CSV E11, the Biggest Winners + Biggest Losers cards on
// the AEO Overview tab must react to BOTH the page date range AND the active
// model filter. Two pure functions:
//
//   1. applyModelFilter(prompts, models) collapses each prompt's per-model
//      position maps (positionByModel + priorPositionByModel) into a flat
//      { position, priorPosition } pair, restricted to the selected models.
//      When models=null, averages across all models for which the prompt has
//      data. Prompts with no current-period data for any selected model are
//      dropped (we can't show a current rank if there isn't one).
//
//   2. computeWinnersLosers(flat) takes the collapsed prompts and splits them
//      into winners (rank improved vs prior — positive delta) and losers
//      (rank declined — negative delta), sorted by absolute delta, capped at
//      20 per side by default.

import type { TrackedPrompt } from './client'
import type { AEOModel } from './models'

export type PromptDelta = { text: string; rank: number; delta: number }

/** Output shape of applyModelFilter: a prompt collapsed to flat scalar metrics. */
export type FlatPrompt = {
  text: string
  position: number              // current-period average rank across selected models
  priorPosition: number | null  // prior-period average across the same models; null if no prior data
}

/**
 * Restricts each prompt's per-model position maps to the selected models, then
 * averages within each map. Drops prompts that have no current-period data for
 * any selected model.
 *
 * @param prompts - prompts with positionByModel + priorPositionByModel.
 * @param models  - selected models (e.g. ['ChatGPT', 'Gemini']). null = all models.
 */
export function applyModelFilter(
  prompts: TrackedPrompt[],
  models: AEOModel[] | null,
): FlatPrompt[] {
  const out: FlatPrompt[] = []
  for (const p of prompts) {
    const cur  = filteredAvg(p.positionByModel,      models)
    const prev = filteredAvg(p.priorPositionByModel, models)
    if (cur === null) continue
    out.push({ text: p.text, position: cur, priorPosition: prev })
  }
  return out
}

function filteredAvg(
  byModel: Partial<Record<AEOModel, number>>,
  models: AEOModel[] | null,
): number | null {
  const entries = Object.entries(byModel) as [AEOModel, number][]
  const filtered = models === null
    ? entries
    : entries.filter(([m]) => models.includes(m))
  if (filtered.length === 0) return null
  return filtered.reduce((s, [, v]) => s + v, 0) / filtered.length
}

type Options = { limit?: number }

/**
 * Splits a flat-prompts list into winners (delta > 0) and losers (delta < 0),
 * sorts by absolute delta, caps at `limit` per side (default 20).
 */
export function computeWinnersLosers(
  prompts: FlatPrompt[],
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
Expected: all tests pass (~17 specs).

### Subtask 4C — Wire the compute into the Overview RSC (date AND model reactive)

- [ ] **Step 4C.1: Compute model-filtered winners/losers inside `ProviderSection`**

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

  // FB-023: Biggest Winners / Biggest Losers — live per-period compute, reactive
  // to BOTH date range (because trackedPrompts is fetched per-range) AND model
  // filter (because applyModelFilter restricts the per-model maps to the active
  // selection). Sandbox gate is lifted — every client sees their own real cards.
  // Profound provider variant: trackedPrompts have empty positionByModel +
  // priorPositionByModel maps (parity defer), so applyModelFilter drops them all
  // and the cards render the empty state.
  const flat = applyModelFilter(data.trackedPrompts as TrackedPrompt[], models)
  const { winners, losers } = computeWinnersLosers(flat)
```

- [ ] **Step 4C.2: Add the imports**

Edit `components/report-sections/peec-ai/index.tsx`. Find the existing imports near the top:
```tsx
import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview } from '@/lib/peec/client'
```

Replace with:
```tsx
import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview, TrackedPrompt } from '@/lib/peec/client'
import { applyModelFilter, computeWinnersLosers } from '@/lib/peec/winners-losers'
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
        emptyMessage="Not enough prompt-rank history yet for this date range or model selection. Try a wider date range or all-models view."
      />
      <PromptDeltaCard
        title="The Biggest Losers"
        emphasis="lost"
        rest="rank to our competitors"
        rows={losers}
        positive={false}
        emptyMessage="Not enough prompt-rank history yet for this date range or model selection. Try a wider date range or all-models view."
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

## FB-023 — Winners/Losers cards: live, date AND model reactive

**Source:** Tina's Overview-tab v1 scorecard CSV, cell E11.
**Verbatim ask:** *"ISSUE: This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected and is an exact copy of the example text I provided."*
**Literal fix:** Wire to live data AND react to BOTH date range AND model filter (Tina's literal text named both). Lift the Avenue-Z-only sandbox gate so every client sees their own real winners/losers — keeping the gate would mean other clients see nothing, contradicting "should be pulling actual data." Graceful empty state for clients with thin history or no data for the selected model.

**Two-part change:**

1. **Data layer (`lib/peec/client.ts`)**:
   - Updated the existing `promptBrandsRes` fetch to dimension by `['prompt_id', 'model_channel_id', 'model_id']` (previously `['prompt_id']` only). Limit bumped 2000 → 5000 to absorb the larger (prompt × model) row count.
   - Added `promptBrandsPriorRes` to the `Promise.all` — the same model-dimensioned shape, bounded to the prior period.
   - Built per-prompt-per-model position maps for both periods (`positionByUuidByModel` for current, `priorPositionByUuidByModel` for prior), scoped to your brand.
   - Flattened across models for the legacy `promptMetricsById` consumer (which downstream code keeps using for non-Winners/Losers prompt aggregates).
   - Extended `TrackedPrompt` type with `positionByModel` + `priorPositionByModel` (`Partial<Record<AEOModel, number>>`).
   - Cache version bumped (covered by the v8 bump from FB-022).

2. **Compute + UI**:
   - New `lib/peec/winners-losers.ts` with TWO pure functions:
     - `applyModelFilter(prompts, models)` — collapses per-model maps into flat `{ position, priorPosition }` per prompt, restricted to the selected models. With `models = null` (no filter), averages across all models the prompt has data for. Drops any prompt with no current-period data for any selected model.
     - `computeWinnersLosers(flat)` — splits flat output into winners (delta > 0) and losers (delta < 0), sorts by absolute delta, caps at 20 per side.
   - Unit tests for both functions (model filter scenarios + averaging + drops + all the compute edge cases).
   - `winners-losers-cards.tsx` rewritten: static const arrays removed; props-driven (`winners`, `losers`); sandbox gate lifted; empty-state message mentions both date and model.
   - `peec-ai/index.tsx` `ProviderSection`: chains `applyModelFilter` → `computeWinnersLosers` using the active `models` prop. Profound provider variant computes too but yields empty arrays because Profound's per-model maps are always empty (per parity-only mirror on the Profound type).

3. **Profound parity (type-level only)**:
   - `lib/profound/client.ts` `TrackedPrompt` mirrors the new `positionByModel` + `priorPositionByModel` fields, both always empty objects. Profound's Overview shows the Winners/Losers cards in their empty state because Profound's API doesn't yet provide a per-prompt-per-model dimension. A separate Profound-parity FB can wire actual data when needed.

**Lineage:** Supersedes FB-006 (which seeded the static Avenue Z arrays + clientSlug-gated render).

**Files touched:**
- `lib/peec/client.ts`: model-dimensioned current + prior prompt fetches, per-model position maps, extended TrackedPrompt.
- `lib/profound/client.ts`: extended TrackedPrompt type for parity (empty per-model maps).
- NEW `lib/peec/winners-losers.ts`: applyModelFilter + computeWinnersLosers + types.
- NEW `lib/peec/winners-losers.test.ts`: unit tests for both functions.
- `components/report-sections/peec-ai/winners-losers-cards.tsx`: rewritten props-driven, gate lifted, empty state mentions both date and model.
- `components/report-sections/peec-ai/index.tsx`: imported the two new functions; chains them in ProviderSection using active `models`; passes to component.

**Scope of impact:** Overview tab Winners/Losers cards. Other surfaces that consume `data.trackedPrompts` see two new fields (`positionByModel` + `priorPositionByModel`) added to the type — unaffected because they don't reference them. The flattened `position` / `visibility` / `sov` fields on `TrackedPrompt` keep their previous semantics (averaged across all models).

**Performance note:** One additional `peecPost('/reports/brands')` per Overview page load (the prior-period prompt fetch). Plus larger response on the current-period fetch (now per-prompt-per-model rows). `limit: 5000` should suffice for current clients — verify during dev smoke and bump higher if Peec returns truncated pages. Caches per (clientSlug, dateRange) for 1 hour via the existing `cached()` wrapper.

**Verification:**
- `npx vitest run lib/peec/winners-losers.test.ts` → all pass (~17 specs).
- `npx tsc --noEmit` clean.
- Dev-server smoke (Avenue Z): cards show real prompts; change date picker → cards update; change model filter → cards update again with filtered set.
- Dev-server smoke (non-Avenue-Z client): cards render with real data or show empty state if no comparable history.

**Open risks:**
- **`limit: 5000` truncation:** If a client has > 5000 (prompt × model) rows, Peec returns the first page only. Detected during dev smoke by checking response length. Mitigation: bump to 10000 or add pagination at the prompt-level fetcher (current/prior). Document the threshold in this FB if observed.
- **Thin-history clients:** Brand-new clients with no comparable prior period or no prompts under selected models get the empty-state message. This is the literal "actual data or nothing" interpretation — better than stale demo arrays.
- **Profound provider variant on Overview:** shows empty Winners/Losers cards because Profound doesn't expose per-prompt-per-model rows. Acceptable for v2 since Tina's review is on Avenue Z (which is Peec). Separate FB if she switches focus.

**Decision lineage:** Closes E11 from Tina v1 CSV; supersedes the originally-FB-021 plan handle.
```

- [ ] **Step 4F.3: Append FB-023 to changelog.md**

```
FB-023 | 2026-06-23 | <commit-sha-pending> | b | Winners/Losers cards swapped from static const arrays (FB-006) to live per-period per-model compute. Updated current promptBrandsRes (lib/peec/client.ts) with dimensions ['prompt_id','model_channel_id','model_id'] and limit 5000; added matching promptBrandsPriorRes. Built per-prompt-per-model position maps for both periods. Extended TrackedPrompt with positionByModel + priorPositionByModel (Partial<Record<AEOModel, number>>). New lib/peec/winners-losers.ts with applyModelFilter (collapses per-model maps to flat scalars restricted to selected models) + computeWinnersLosers (splits + sorts). ~17 unit tests across both. winners-losers-cards.tsx rewritten props-driven; sandbox gate lifted; empty state mentions both date and model. peec-ai/index.tsx ProviderSection chains the two functions with active models prop. Profound TrackedPrompt mirrored for type parity (always-empty maps). Tina v1 CSV E11. Reacts to date range AND model filter per literal text.
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
feat(overview): FB-023 — Winners/Losers live, date AND model reactive (CSV E11)

Tina v2 row 11: "This seems like static copy and should be pulling
actual data. It doesn't change when a new date range or model is
selected and is an exact copy of the example text I provided."

Swap static FB-006 arrays for live per-period per-model compute.

Data layer (lib/peec/client.ts):
- Updated current promptBrandsRes with dimensions ['prompt_id',
  'model_channel_id', 'model_id'] (was ['prompt_id'] only); limit
  bumped 2000 → 5000 for the larger row count.
- Added promptBrandsPriorRes with the same model-dimensioned shape
  bounded to the prior period.
- Built per-prompt-per-model position maps for both periods
  (positionByUuidByModel + priorPositionByUuidByModel), scoped to
  your brand. Flattened across models for the legacy promptMetricsById
  consumer (kept its previous behavior).
- Extended TrackedPrompt with positionByModel +
  priorPositionByModel (Partial<Record<AEOModel, number>>).
- Mirror change on Profound TrackedPrompt type (empty maps for parity).

Compute + UI:
- NEW lib/peec/winners-losers.ts — two pure functions:
  applyModelFilter(prompts, models) collapses per-model maps to
  flat {position, priorPosition} per prompt, restricted to the
  selected models. computeWinnersLosers(flat) splits into
  winners/losers, sorts by abs delta, caps at 20 per side.
- ~17 unit tests covering both functions (model filter scenarios,
  averaging, drops; plus all the original compute scenarios).
- winners-losers-cards.tsx rewritten — props-driven, sandbox gate
  lifted, empty state mentions both date and model.
- peec-ai/index.tsx ProviderSection chains applyModelFilter ->
  computeWinnersLosers using the active models prop. Profound
  variant computes too but yields empty arrays (Profound's per-model
  maps are empty until Profound-parity FB ships).

Sandbox lifted: every client sees their own real winners/losers.
Cards react to date picker AND model filter per Tina's literal text.

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
  - **FB-022** — Visibility chart truly YTD on both providers; "Tracking began" line now sources the correct date from new `clients.firstTrackedAt` DB column (Avenue Z backfilled to 2025-03-28); other clients gracefully omit (CSV E7).
  - **FB-023** — Winners/Losers cards: live per-period compute, reactive to BOTH date range AND model filter; sandbox gate lifted; empty state added (CSV E11).
- **Open operational follow-ups (not blocking Tina v2 review):**
  - Backfill `clients.firstTrackedAt` for non-Avenue-Z clients (currently null = line gracefully omits).
  - Profound parity on Winners/Losers (requires Profound API to expose per-prompt-per-model rows — separate FB if needed).
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

### Spec coverage (literal CSV match)

- ✅ **E2** → FB-020 (Task 1) — subtitle dropped, literal "REMOVE."
- ✅ **E7** → FB-022 (Task 3) — chart truly YTD AND "Tracking began" shows the correct date Tina gave (from new DB column).
- ✅ **E11** → FB-023 (Task 4) — Winners/Losers react to BOTH date range AND model filter (per-model dimensioned fetches + applyModelFilter); sandbox lifted so all clients see live data.
- ✅ **E12** → FB-021 (Task 2) — tracked-prompts chart removed from BOTH Peec + Profound (Rule #11 applied universally).

### Literal-interpretation policy compliance

- No deferred sub-asks. Model-filter reactivity is in the literal text and ships in FB-023.
- No "future enhancement" punts. The "Tracking began" line is restored with the correct date Tina supplied; not dropped.
- No reinterpretation. Where Tina says "remove" we remove. Where she says "fix" we fix. Where she gives a date we display that date.
- Profound parity: shipped for FB-022 (visibility chart) and FB-021 (chart removal). For FB-023, Profound's TrackedPrompt carries empty per-model maps because Profound has no per-prompt model dimension in its API; cards render empty state on Profound until a separate Profound-parity FB ships. Documented in the FB-023 decision log.

### Placeholder scan

- No `TBD` / `TODO` / "fill in details" tags.
- Every code step shows the actual code.
- Every shell command is concrete and runnable.
- Commit SHAs are deliberately `<commit-sha-pending>` placeholders in changelog.md, with explicit backfill steps after each commit. This is intentional, not a placeholder bug.

### Type consistency

- `PromptDelta` + `FlatPrompt` defined in `lib/peec/winners-losers.ts`, imported by `winners-losers-cards.tsx` and `peec-ai/index.tsx` via the same path.
- `TrackedPrompt` extended with `positionByModel: Partial<Record<AEOModel, number>>` + `priorPositionByModel: Partial<Record<AEOModel, number>>` in `lib/peec/client.ts`; mirrored on `lib/profound/client.ts` (both empty objects there) for cross-provider type compatibility.
- `applyModelFilter` signature `(prompts: TrackedPrompt[], models: AEOModel[] | null) => FlatPrompt[]` consistent across test + impl + caller.
- `computeWinnersLosers` signature `(prompts: FlatPrompt[], opts?: { limit?: number }) => { winners: PromptDelta[]; losers: PromptDelta[] }` consistent across test + impl + caller.
- `WinnersLosersCards` props consistent: `{ clientSlug?: string; winners: PromptDelta[]; losers: PromptDelta[] }`.

### Risk surface

- **FB-022:** Data-layer change touches both Peec + Profound clients (YTD fetch added). Plus a Drizzle migration for `firstTrackedAt`. Mitigated by: separate fetch (doesn't disturb existing data flows), only routes `dailyVisibility`/`competitorDailyVisibility` to YTD (`weeklyVisibility` stays picker-bound for `demand-overview` consumer), cache version bump (no stale data carry-over). Migration is additive (nullable column), zero-downtime.
- **FB-023:** Two new fetches (one current model-dimensioned prompt fetch updated; one prior model-dimensioned prompt fetch added). Larger response payloads — `limit` bumped to 5000. Mitigated by: cached per (clientSlug, dateRange) for 1 hour. If a client's prompt count × model count exceeds 5000 rows we'll truncate; verify limit during dev smoke and bump if needed.
- **Empty state acceptance:** thin-history clients render the empty state for Winners/Losers. Acceptable per literal interpretation — "should be pulling actual data" means actual or nothing, not stale demo arrays.
